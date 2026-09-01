from __future__ import annotations

from base64 import b64encode
from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.exceptions import InvalidTag
from nanyee.config import Settings
from nanyee.credentials.envelope import CredentialContext, EnvelopeCipher
from nanyee.credentials.key_wrapping import LocalFileKeyWrappingProvider
from nanyee.credentials.models import HostedCredential, purpose_satisfies
from nanyee.credentials.service import CredentialVaultService
from nanyee.db.base import Base
from nanyee.errors import AppError
from nanyee.identity.models import RegistrationTrustLevel, User
from nanyee.identity.passwords import hash_password
from nanyee.jobs.models import JobState
from nanyee.jobs.service import JobService
from nanyee.security import utc_now
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.mark.asyncio
async def test_envelope_encryption_round_trip_and_aad_binding() -> None:
    provider = LocalFileKeyWrappingProvider(
        b64encode(b"k" * 32).decode("ascii"), key_version="test-v1"
    )
    cipher = EnvelopeCipher(provider)
    context = CredentialContext(
        credential_id=uuid4(),
        user_id=uuid4(),
        upstream="smu_uis",
        purpose="study_cabin",
    )
    envelope = await cipher.encrypt(b"school-password", context)
    assert envelope.ciphertext != b"school-password"
    assert envelope.wrapped_data_key != b"school-password"
    assert await cipher.decrypt(envelope, context) == b"school-password"

    wrong_context = CredentialContext(
        credential_id=context.credential_id,
        user_id=uuid4(),
        upstream=context.upstream,
        purpose=context.purpose,
    )
    with pytest.raises(InvalidTag):
        await cipher.decrypt(envelope, wrong_context)


@pytest.mark.asyncio
async def test_local_key_version_cannot_silently_fallback() -> None:
    encoded = b64encode(b"k" * 32).decode("ascii")
    old_cipher = EnvelopeCipher(LocalFileKeyWrappingProvider(encoded, key_version="old-version"))
    context = CredentialContext(
        credential_id=uuid4(), user_id=uuid4(), upstream="qun100", purpose="checkin"
    )
    envelope = await old_cipher.encrypt(b"token", context)
    new_cipher = EnvelopeCipher(LocalFileKeyWrappingProvider(encoded, key_version="new-version"))
    with pytest.raises(ValueError, match="version"):
        await new_cipher.decrypt(envelope, context)


def test_purpose_satisfies_shared_school_credential() -> None:
    assert purpose_satisfies("school", "evaluation")
    assert purpose_satisfies("school", "study_cabin")
    assert not purpose_satisfies("school", "qun_checkin")
    assert not purpose_satisfies("study_cabin", "evaluation")
    assert not purpose_satisfies("evaluation", "study_cabin")
    assert purpose_satisfies("qun_checkin", "qun_checkin")


async def _make_vault():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    provider = LocalFileKeyWrappingProvider(
        b64encode(b"k" * 32).decode("ascii"), key_version="test-v1"
    )
    vault = CredentialVaultService(EnvelopeCipher(provider), Settings(app_env="test"))
    return engine, factory, vault


async def _make_user(db, name: str) -> User:
    user = User(
        username=name,
        username_normalized=name,
        nickname=name,
        password_hash=hash_password("credential test password"),
        registration_trust_level=RegistrationTrustLevel.COMMUNITY_QUIZ,
    )
    db.add(user)
    await db.commit()
    return user


@pytest.mark.asyncio
async def test_school_credential_decrypts_for_shared_tools_only() -> None:
    engine, factory, vault = await _make_vault()
    async with factory() as db:
        user = await _make_user(db, "school_shared")
        credential = await vault.create(
            db,
            user_id=user.id,
            upstream="school",
            purpose="school",
            plaintext='{"account":"20260001","password":"secret"}',
            public_metadata={},
            consent_version="credential-hosting-v1",
        )

        for purpose in ("evaluation", "study_cabin"):
            plaintext = await vault.decrypt_for_worker(
                db, credential_id=credential.id, user_id=user.id, purpose=purpose
            )
            assert plaintext.decode("utf-8") == '{"account":"20260001","password":"secret"}'

        with pytest.raises(AppError) as raised:
            await vault.decrypt_for_worker(
                db, credential_id=credential.id, user_id=user.id, purpose="qun_checkin"
            )
        assert raised.value.status_code == 403

        legacy = await vault.create(
            db,
            user_id=user.id,
            upstream="infospace",
            purpose="study_cabin",
            plaintext='{"account":"20260001","password":"secret"}',
            public_metadata={},
            consent_version="credential-hosting-v1",
        )
        with pytest.raises(AppError) as raised:
            await vault.decrypt_for_worker(
                db, credential_id=legacy.id, user_id=user.id, purpose="evaluation"
            )
        assert raised.value.status_code == 403
    await engine.dispose()


@pytest.mark.asyncio
async def test_reveal_for_owner_scopes_access_and_survives_revoke() -> None:
    engine, factory, vault = await _make_vault()
    async with factory() as db:
        owner = await _make_user(db, "reveal_owner")
        other = await _make_user(db, "reveal_other")
        credential = await vault.create(
            db,
            user_id=owner.id,
            upstream="school",
            purpose="school",
            plaintext='{"account":"20260001","password":"secret"}',
            public_metadata={},
            consent_version="credential-hosting-v1",
        )

        secret = await vault.reveal_for_owner(db, credential_id=credential.id, user_id=owner.id)
        assert secret == '{"account":"20260001","password":"secret"}'

        with pytest.raises(AppError) as raised:
            await vault.reveal_for_owner(db, credential_id=credential.id, user_id=other.id)
        assert raised.value.status_code == 404

        await vault.revoke(db, credential_id=credential.id, user_id=owner.id)
        secret = await vault.reveal_for_owner(db, credential_id=credential.id, user_id=owner.id)
        assert secret == '{"account":"20260001","password":"secret"}'

        await vault.delete(db, credential_id=credential.id, user_id=owner.id)
        with pytest.raises(AppError) as raised:
            await vault.reveal_for_owner(db, credential_id=credential.id, user_id=owner.id)
        assert raised.value.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_revoking_credential_cancels_its_queued_jobs() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    provider = LocalFileKeyWrappingProvider(
        b64encode(b"k" * 32).decode("ascii"), key_version="test-v1"
    )
    vault = CredentialVaultService(EnvelopeCipher(provider), Settings(app_env="test"))
    async with factory() as db:
        user = User(
            username="credential_test",
            username_normalized="credential_test",
            nickname="Credential Test",
            password_hash=hash_password("credential test password"),
            registration_trust_level=RegistrationTrustLevel.COMMUNITY_QUIZ,
        )
        db.add(user)
        await db.commit()
        credential = await vault.create(
            db,
            user_id=user.id,
            upstream="infospace",
            purpose="study_cabin",
            plaintext='{"account":"20260001","password":"secret"}',
            public_metadata={},
            consent_version="credential-hosting-v1",
        )
        job, _ = await JobService().create(
            db,
            user_id=user.id,
            tool_id="study_cabin",
            operation="reserve",
            payload={"target": "test"},
            credential_id=credential.id,
            idempotency_key="credential-revoke-job",
            confirmation_version="study_cabin:reserve:v1",
            scheduled_for=utc_now() + timedelta(hours=1),
        )

        await vault.revoke(db, credential_id=credential.id, user_id=user.id)
        await db.refresh(job)

        assert job.state == JobState.CANCELLED
        assert job.cancel_requested_at is not None
    await engine.dispose()


@pytest.mark.asyncio
async def test_deleting_credential_detaches_jobs_and_removes_row() -> None:
    engine, factory, vault = await _make_vault()
    async with factory() as db:
        user = await _make_user(db, "credential_delete")
        credential = await vault.create(
            db,
            user_id=user.id,
            upstream="school",
            purpose="school",
            plaintext='{"account":"20260001","password":"secret"}',
            public_metadata={},
            consent_version="credential-hosting-v1",
        )
        job, _ = await JobService().create(
            db,
            user_id=user.id,
            tool_id="study_cabin",
            operation="reserve",
            payload={"target": "test"},
            credential_id=credential.id,
            idempotency_key="credential-delete-job",
            confirmation_version="study_cabin:reserve:v1",
            scheduled_for=utc_now() + timedelta(hours=1),
        )

        await vault.delete(db, credential_id=credential.id, user_id=user.id)
        await db.refresh(job)

        assert job.state == JobState.CANCELLED
        assert job.credential_id is None
        remaining = (
            await db.execute(select(HostedCredential).where(HostedCredential.id == credential.id))
        ).scalar_one_or_none()
        assert remaining is None
    await engine.dispose()


@pytest.mark.asyncio
async def test_renew_extends_expired_credential_without_plaintext() -> None:
    engine, factory, vault = await _make_vault()
    async with factory() as db:
        owner = await _make_user(db, "renew_owner")
        other = await _make_user(db, "renew_other")
        credential = await vault.create(
            db,
            user_id=owner.id,
            upstream="school",
            purpose="school",
            plaintext='{"account":"20260001","password":"secret"}',
            public_metadata={},
            consent_version="credential-hosting-v1",
            ttl_seconds=300,
        )
        # 模拟已过期：过期后 worker 解密会被拒绝
        credential.expires_at = utc_now() - timedelta(seconds=1)
        await db.commit()
        with pytest.raises(AppError) as raised:
            await vault.decrypt_for_worker(
                db, credential_id=credential.id, user_id=owner.id, purpose="evaluation"
            )
        assert raised.value.status_code == 403

        renewed = await vault.renew(
            db, credential_id=credential.id, user_id=owner.id, ttl_seconds=180 * 86400
        )
        assert renewed.expires_at > utc_now() + timedelta(days=179)
        plaintext = await vault.decrypt_for_worker(
            db, credential_id=credential.id, user_id=owner.id, purpose="evaluation"
        )
        assert plaintext.decode("utf-8") == '{"account":"20260001","password":"secret"}'

        # 他人不能延期；已禁用凭据不能延期；期限越界拒绝
        with pytest.raises(AppError) as raised:
            await vault.renew(db, credential_id=credential.id, user_id=other.id, ttl_seconds=300)
        assert raised.value.status_code == 404
        with pytest.raises(AppError) as raised:
            await vault.renew(db, credential_id=credential.id, user_id=owner.id, ttl_seconds=60)
        assert raised.value.status_code == 422
        await vault.revoke(db, credential_id=credential.id, user_id=owner.id)
        with pytest.raises(AppError) as raised:
            await vault.renew(db, credential_id=credential.id, user_id=owner.id, ttl_seconds=300)
        assert raised.value.status_code == 422
    await engine.dispose()
