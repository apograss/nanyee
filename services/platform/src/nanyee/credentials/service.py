from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.config import Settings
from nanyee.credentials.envelope import (
    CredentialContext,
    CredentialEnvelope,
    EnvelopeCipher,
    redact_credential_metadata,
)
from nanyee.credentials.models import CredentialStatus, HostedCredential
from nanyee.errors import AppError, ErrorCode
from nanyee.jobs.models import TERMINAL_JOB_STATES, Job, JobState
from nanyee.security import as_utc, utc_now


class CredentialVaultService:
    def __init__(self, cipher: EnvelopeCipher, settings: Settings) -> None:
        self._cipher = cipher
        self._settings = settings

    async def create(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        upstream: str,
        purpose: str,
        plaintext: str,
        public_metadata: dict[str, object],
        consent_version: str,
        ttl_seconds: int | None = None,
    ) -> HostedCredential:
        encoded = plaintext.encode("utf-8")
        if not encoded or len(encoded) > 16_384:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "凭据长度无效。",
                status_code=422,
                details={"field": "secret"},
            )
        ttl = ttl_seconds or self._settings.credential_default_ttl_seconds
        if ttl < 300 or ttl > 30 * 24 * 60 * 60:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "凭据保存期限无效。",
                status_code=422,
                details={"field": "ttl_seconds"},
            )
        credential_id = uuid4()
        context = CredentialContext(
            credential_id=credential_id,
            user_id=user_id,
            upstream=upstream,
            purpose=purpose,
        )
        envelope = await self._cipher.encrypt(encoded, context)
        record = HostedCredential(
            id=credential_id,
            user_id=user_id,
            upstream=upstream,
            purpose=purpose,
            ciphertext=envelope.ciphertext,
            nonce=envelope.nonce,
            wrapped_data_key=envelope.wrapped_data_key,
            key_reference=envelope.key_reference,
            key_wrap_algorithm=envelope.key_wrap_algorithm,
            envelope_version=envelope.envelope_version,
            public_metadata=redact_credential_metadata(public_metadata),
            expires_at=utc_now() + timedelta(seconds=ttl),
            consent_version=consent_version,
        )
        db.add(record)
        await db.commit()
        return record

    async def decrypt_for_worker(
        self,
        db: AsyncSession,
        *,
        credential_id: UUID,
        user_id: UUID,
        purpose: str,
    ) -> bytes:
        record = (
            await db.execute(
                select(HostedCredential)
                .where(
                    HostedCredential.id == credential_id,
                    HostedCredential.user_id == user_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if (
            record is None
            or record.status != CredentialStatus.ACTIVE
            or as_utc(record.expires_at) <= utc_now()
            or record.purpose != purpose
        ):
            raise AppError(
                ErrorCode.FORBIDDEN,
                "凭据不可用于该任务。",
                status_code=403,
            )
        context = CredentialContext(
            credential_id=record.id,
            user_id=record.user_id,
            upstream=record.upstream,
            purpose=record.purpose,
            envelope_version=record.envelope_version,
        )
        envelope = CredentialEnvelope(
            ciphertext=record.ciphertext,
            nonce=record.nonce,
            wrapped_data_key=record.wrapped_data_key,
            key_reference=record.key_reference,
            key_wrap_algorithm=record.key_wrap_algorithm,
            envelope_version=record.envelope_version,
        )
        plaintext = await self._cipher.decrypt(envelope, context)
        record.last_used_at = utc_now()
        await db.commit()
        return plaintext

    async def revoke(
        self, db: AsyncSession, *, credential_id: UUID, user_id: UUID
    ) -> HostedCredential:
        record = (
            await db.execute(
                select(HostedCredential)
                .where(
                    HostedCredential.id == credential_id,
                    HostedCredential.user_id == user_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if record is None or record.status == CredentialStatus.DELETED:
            raise AppError(ErrorCode.NOT_FOUND, "凭据不存在。", status_code=404)
        if record.status == CredentialStatus.ACTIVE:
            now = utc_now()
            record.status = CredentialStatus.REVOKED
            record.revoked_at = now
            jobs = (
                await db.execute(
                    select(Job)
                    .where(
                        Job.credential_id == credential_id,
                        Job.user_id == user_id,
                        Job.state.not_in(TERMINAL_JOB_STATES),
                    )
                    .with_for_update()
                )
            ).scalars()
            for job in jobs:
                job.cancel_requested_at = now
                if job.state in (JobState.QUEUED, JobState.RETRY_WAIT):
                    job.state = JobState.CANCELLED
                    job.finished_at = now
                    job.lease_owner = None
                    job.lease_expires_at = None
            await db.commit()
        return record
