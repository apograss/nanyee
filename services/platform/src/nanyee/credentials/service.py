from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.config import Settings
from nanyee.credentials.account_digest import digest_for_plaintext
from nanyee.credentials.envelope import (
    CredentialContext,
    CredentialEnvelope,
    EnvelopeCipher,
    redact_credential_metadata,
)
from nanyee.credentials.models import (
    SCHOOL_ACCOUNT_PURPOSES,
    CredentialStatus,
    HostedCredential,
    credential_expired,
    purpose_satisfies,
)
from nanyee.errors import AppError, ErrorCode
from nanyee.jobs.models import (
    ACTIVE_JOB_STATES,
    CLAIMED_BY_OTHER_ACCOUNT_ERROR,
    EVALUATION_TOOL_ID,
    SYSTEM_NOTICE_EVENT,
    TERMINAL_JOB_STATES,
    Job,
    JobState,
)
from nanyee.security import utc_now


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
        encoded = _encode_plaintext(plaintext)
        expires_at = None
        if purpose not in SCHOOL_ACCOUNT_PURPOSES:
            ttl = ttl_seconds or self._settings.credential_default_ttl_seconds
            if ttl < 300 or ttl > 365 * 24 * 60 * 60:
                raise AppError(
                    ErrorCode.INVALID_REQUEST,
                    "凭据保存期限无效。",
                    status_code=422,
                    details={"field": "ttl_seconds"},
                )
            expires_at = utc_now() + timedelta(seconds=ttl)
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
            expires_at=expires_at,
            consent_version=consent_version,
            account_digest=digest_for_plaintext(self._settings, purpose, plaintext),
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
            or credential_expired(record.expires_at, utc_now())
            or not purpose_satisfies(record.purpose, purpose)
        ):
            raise AppError(
                ErrorCode.FORBIDDEN,
                "凭据不可用于该任务。",
                status_code=403,
            )
        plaintext = await self._decrypt_record(record)
        record.last_used_at = utc_now()
        await db.commit()
        return plaintext

    async def reveal_for_owner(
        self, db: AsyncSession, *, credential_id: UUID, user_id: UUID
    ) -> str:
        record = (
            await db.execute(
                select(HostedCredential).where(
                    HostedCredential.id == credential_id,
                    HostedCredential.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if record is None or record.status == CredentialStatus.DELETED:
            raise AppError(ErrorCode.NOT_FOUND, "凭据不存在。", status_code=404)
        plaintext = await self._decrypt_record(record)
        return plaintext.decode("utf-8")

    async def delete(self, db: AsyncSession, *, credential_id: UUID, user_id: UUID) -> None:
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
        await _cancel_pending_jobs(db, credential_id=credential_id, user_id=user_id)
        # SQLite 默认不强制外键，ondelete="SET NULL" 不一定触发，显式解绑
        jobs = (await db.execute(select(Job).where(Job.credential_id == credential_id))).scalars()
        for job in jobs:
            job.credential_id = None
        await db.delete(record)
        await db.commit()

    async def _decrypt_record(self, record: HostedCredential) -> bytes:
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
        return await self._cipher.decrypt(envelope, context)

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
            record.status = CredentialStatus.REVOKED
            record.revoked_at = utc_now()
            await _cancel_pending_jobs(db, credential_id=credential_id, user_id=user_id)
            await db.commit()
        return record

    async def renew(
        self,
        db: AsyncSession,
        *,
        credential_id: UUID,
        user_id: UUID,
        ttl_seconds: int,
    ) -> HostedCredential:
        """延长凭据有效期（含已过期但未删除的凭据），不需要重新输入明文。"""
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
        if record.status != CredentialStatus.ACTIVE:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "已禁用的凭据不能延期，请重新添加授权。",
                status_code=422,
            )
        if record.expires_at is None:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "该凭据永久有效，无需延期。",
                status_code=422,
            )
        if ttl_seconds < 300 or ttl_seconds > 365 * 24 * 60 * 60:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "凭据保存期限无效。",
                status_code=422,
                details={"field": "ttl_seconds"},
            )
        record.expires_at = utc_now() + timedelta(seconds=ttl_seconds)
        await db.commit()
        return record

    async def update_secret(
        self,
        db: AsyncSession,
        *,
        credential_id: UUID,
        user_id: UUID,
        plaintext: str,
        public_metadata: dict[str, object] | None = None,
    ) -> HostedCredential:
        """原地替换凭据明文（如学校账号改密码），凭据 ID 不变，关联任务下一轮直接使用新值。"""
        encoded = _encode_plaintext(plaintext)
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
        if record.status != CredentialStatus.ACTIVE:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "已禁用的凭据不能修改，请重新添加授权。",
                status_code=422,
            )
        context = CredentialContext(
            credential_id=record.id,
            user_id=record.user_id,
            upstream=record.upstream,
            purpose=record.purpose,
        )
        envelope = await self._cipher.encrypt(encoded, context)
        record.ciphertext = envelope.ciphertext
        record.nonce = envelope.nonce
        record.wrapped_data_key = envelope.wrapped_data_key
        record.key_reference = envelope.key_reference
        record.key_wrap_algorithm = envelope.key_wrap_algorithm
        record.envelope_version = envelope.envelope_version
        record.account_digest = digest_for_plaintext(self._settings, record.purpose, plaintext)
        if public_metadata is not None:
            record.public_metadata = redact_credential_metadata(public_metadata)
        else:
            # 旧摘要对应的是旧 Token，换了内容就不能再据此复用
            record.public_metadata = {
                k: v for k, v in record.public_metadata.items() if k != "token_digest"
            }
        await db.commit()
        return record


async def stop_other_accounts_evaluations(
    db: AsyncSession, *, user_id: UUID, account_digest: str
) -> int:
    """停止其他平台账号上同一学号的自动评课，并撤销那些账号上该学号的凭据。

    调用方必须已用该学号实时登录学校成功（见 ADR 0002）。返回停止的评课任务数。
    被停止的任务记 error_code=CLAIMED_BY_OTHER_ACCOUNT，旧账号据此看到站内通知。
    """
    now = utc_now()
    credentials = list(
        (
            await db.execute(
                select(HostedCredential)
                .where(
                    HostedCredential.account_digest == account_digest,
                    HostedCredential.user_id != user_id,
                    HostedCredential.status == CredentialStatus.ACTIVE,
                )
                .with_for_update()
            )
        ).scalars()
    )
    if not credentials:
        return 0
    jobs = list(
        (
            await db.execute(
                select(Job)
                .where(
                    Job.credential_id.in_([record.id for record in credentials]),
                    Job.tool_id == EVALUATION_TOOL_ID,
                    Job.state.in_(ACTIVE_JOB_STATES),
                )
                .with_for_update()
            )
        ).scalars()
    )
    for job in jobs:
        job.cancel_requested_at = now
        job.error_code = CLAIMED_BY_OTHER_ACCOUNT_ERROR
        receipt = dict(job.receipt or {})
        previous = receipt.get("logs")
        logs = list(previous) if isinstance(previous, list) else []
        logs.append(
            {
                "time": now.isoformat(),
                "event": SYSTEM_NOTICE_EVENT,
                "message": "该任务已被使用同一学号登录验证的另一个平台账号停止。",
            }
        )
        receipt["logs"] = logs
        job.receipt = receipt
        if job.state in (JobState.QUEUED, JobState.RETRY_WAIT):
            job.state = JobState.CANCELLED
            job.finished_at = now
            job.lease_owner = None
            job.lease_expires_at = None
    for record in credentials:
        record.status = CredentialStatus.REVOKED
        record.revoked_at = now
        await _cancel_pending_jobs(db, credential_id=record.id, user_id=record.user_id)
    await db.commit()
    return len(jobs)


def _encode_plaintext(plaintext: str) -> bytes:
    encoded = plaintext.encode("utf-8")
    if not encoded or len(encoded) > 16_384:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "凭据长度无效。",
            status_code=422,
            details={"field": "secret"},
        )
    return encoded


async def _cancel_pending_jobs(db: AsyncSession, *, credential_id: UUID, user_id: UUID) -> None:
    now = utc_now()
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
