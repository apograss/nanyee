from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.errors import AppError, ErrorCode
from nanyee.identity.models import User, UserStatus
from nanyee.jobs.models import TERMINAL_JOB_STATES, Job, JobState
from nanyee.security import as_utc, utc_now


def request_digest(payload: dict[str, object]) -> str:
    serialized = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


class JobService:
    async def create(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        tool_id: str,
        operation: str,
        payload: dict[str, object],
        credential_id: UUID | None,
        idempotency_key: str,
        confirmation_version: str | None,
        scheduled_for: datetime,
        max_attempts: int = 3,
        schedule_is_explicit: bool = True,
    ) -> tuple[Job, bool]:
        digest = request_digest(
            {
                "confirmation_version": confirmation_version,
                "credential_id": str(credential_id) if credential_id else None,
                "operation": operation,
                "payload": payload,
                "scheduled_for": (
                    as_utc(scheduled_for).isoformat() if schedule_is_explicit else None
                ),
                "tool_id": tool_id,
            }
        )
        existing = (
            await db.execute(
                select(Job).where(
                    Job.user_id == user_id,
                    Job.idempotency_key == idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            if existing.request_digest != digest:
                raise AppError(
                    ErrorCode.CONFLICT,
                    "幂等键已用于不同请求。",
                    status_code=409,
                )
            return existing, False

        record = Job(
            user_id=user_id,
            credential_id=credential_id,
            tool_id=tool_id,
            operation=operation,
            payload=payload,
            request_digest=digest,
            idempotency_key=idempotency_key,
            confirmation_version=confirmation_version,
            scheduled_for=as_utc(scheduled_for),
            max_attempts=max_attempts,
        )
        db.add(record)
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            existing = (
                await db.execute(
                    select(Job).where(
                        Job.user_id == user_id,
                        Job.idempotency_key == idempotency_key,
                    )
                )
            ).scalar_one()
            if existing.request_digest != digest:
                raise AppError(
                    ErrorCode.CONFLICT,
                    "幂等键已用于不同请求。",
                    status_code=409,
                ) from exc
            return existing, False
        return record, True

    async def claim_next(
        self,
        db: AsyncSession,
        *,
        worker_id: str,
        supported_tools: tuple[str, ...],
        lease_seconds: int = 60,
        now: datetime | None = None,
    ) -> Job | None:
        if not supported_tools:
            return None
        current = as_utc(now or utc_now())
        eligible_state = or_(
            Job.state.in_((JobState.QUEUED, JobState.RETRY_WAIT)),
            and_(
                Job.state == JobState.RUNNING,
                Job.lease_expires_at.is_not(None),
                Job.lease_expires_at < current,
            ),
        )
        statement = (
            select(Job)
            .join(User, User.id == Job.user_id)
            .where(
                eligible_state,
                User.status == UserStatus.ACTIVE,
                Job.tool_id.in_(supported_tools),
                Job.scheduled_for <= current,
                Job.cancel_requested_at.is_(None),
                Job.attempt_count < Job.max_attempts,
            )
            .order_by(Job.scheduled_for.asc(), Job.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        record = (await db.execute(statement)).scalar_one_or_none()
        if record is None:
            return None
        record.state = JobState.RUNNING
        record.lease_owner = worker_id
        record.lease_expires_at = current + timedelta(seconds=lease_seconds)
        record.attempt_count += 1
        record.started_at = record.started_at or current
        await db.commit()
        await db.refresh(record)
        return record

    async def heartbeat(
        self,
        db: AsyncSession,
        *,
        job_id: UUID,
        worker_id: str,
        lease_seconds: int = 60,
    ) -> bool:
        record = await self._locked_job(db, job_id)
        if (
            record is None
            or record.state != JobState.RUNNING
            or record.lease_owner != worker_id
            or record.cancel_requested_at is not None
        ):
            return False
        record.lease_expires_at = utc_now() + timedelta(seconds=lease_seconds)
        await db.commit()
        return True

    async def cancel(self, db: AsyncSession, *, job_id: UUID, user_id: UUID) -> Job:
        record = (
            await db.execute(
                select(Job).where(Job.id == job_id, Job.user_id == user_id).with_for_update()
            )
        ).scalar_one_or_none()
        if record is None:
            raise AppError(ErrorCode.NOT_FOUND, "任务不存在。", status_code=404)
        if record.state in TERMINAL_JOB_STATES:
            return record
        now = utc_now()
        record.cancel_requested_at = now
        if record.state in (JobState.QUEUED, JobState.RETRY_WAIT):
            record.state = JobState.CANCELLED
            record.finished_at = now
            record.lease_owner = None
            record.lease_expires_at = None
        await db.commit()
        await db.refresh(record)
        return record

    async def complete(
        self,
        db: AsyncSession,
        *,
        job_id: UUID,
        worker_id: str,
        receipt: dict[str, object],
    ) -> Job:
        record = await self._owned_running_job(db, job_id, worker_id)
        now = utc_now()
        if record.cancel_requested_at is not None:
            record.state = JobState.CANCELLED
            record.receipt = None
        else:
            record.state = JobState.SUCCEEDED
            record.receipt = receipt
        record.finished_at = now
        record.lease_owner = None
        record.lease_expires_at = None
        await db.commit()
        await db.refresh(record)
        return record

    async def reschedule(
        self,
        db: AsyncSession,
        *,
        job_id: UUID,
        worker_id: str,
        receipt: dict[str, object],
        scheduled_for: datetime,
    ) -> Job:
        """把执行完毕的常驻任务重新排队到下一运行时刻（如评课每日运行）。"""
        record = await self._owned_running_job(db, job_id, worker_id)
        now = utc_now()
        if record.cancel_requested_at is not None:
            record.state = JobState.CANCELLED
            record.receipt = None
            record.finished_at = now
        else:
            record.state = JobState.QUEUED
            record.scheduled_for = scheduled_for
            record.receipt = receipt
        record.error_code = None
        record.next_action = None
        record.lease_owner = None
        record.lease_expires_at = None
        await db.commit()
        await db.refresh(record)
        return record

    async def fail(
        self,
        db: AsyncSession,
        *,
        job_id: UUID,
        worker_id: str,
        error_code: str,
        retryable: bool,
        result_unknown: bool = False,
        retry_delay_seconds: int = 30,
        next_action: str | None = None,
    ) -> Job:
        record = await self._owned_running_job(db, job_id, worker_id)
        now = utc_now()
        record.error_code = error_code
        record.next_action = next_action
        record.lease_owner = None
        record.lease_expires_at = None
        if record.cancel_requested_at is not None:
            record.state = JobState.CANCELLED
            record.finished_at = now
        elif result_unknown:
            record.state = JobState.VERIFICATION_REQUIRED
            record.finished_at = now
        elif retryable and record.attempt_count < record.max_attempts:
            record.state = JobState.RETRY_WAIT
            record.scheduled_for = now + timedelta(seconds=retry_delay_seconds)
        else:
            record.state = JobState.FAILED
            record.finished_at = now
        await db.commit()
        await db.refresh(record)
        return record

    async def _locked_job(self, db: AsyncSession, job_id: UUID) -> Job | None:
        return (
            await db.execute(select(Job).where(Job.id == job_id).with_for_update())
        ).scalar_one_or_none()

    async def _owned_running_job(self, db: AsyncSession, job_id: UUID, worker_id: str) -> Job:
        record = await self._locked_job(db, job_id)
        if record is None or record.state != JobState.RUNNING or record.lease_owner != worker_id:
            raise AppError(
                ErrorCode.CONFLICT,
                "任务租约已失效。",
                status_code=409,
            )
        return record
