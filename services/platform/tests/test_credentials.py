from __future__ import annotations

from base64 import b64encode
from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.exceptions import InvalidTag
from nanyee.config import Settings
from nanyee.credentials.envelope import CredentialContext, EnvelopeCipher
from nanyee.credentials.key_wrapping import LocalFileKeyWrappingProvider
from nanyee.credentials.service import CredentialVaultService
from nanyee.db.base import Base
from nanyee.identity.models import RegistrationTrustLevel, User
from nanyee.identity.passwords import hash_password
from nanyee.jobs.models import JobState
from nanyee.jobs.service import JobService
from nanyee.security import utc_now
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
