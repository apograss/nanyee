from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Mapping
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol
from uuid import UUID

from nanyee.credentials.models import CredentialStatus, HostedCredential
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.models import User, UserStatus
from nanyee.jobs.models import Job
from nanyee.jobs.service import JobService
from nanyee.security import as_utc, utc_now
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ExecutionReceipt:
    values: dict[str, object]
    # 常驻任务（如每日评课）执行完毕后，把任务重新排队到下一运行时刻而非终结
    next_run_at: datetime | None = None


class ExecutionFailure(RuntimeError):
    def __init__(
        self,
        error_code: str,
        *,
        retryable: bool,
        result_unknown: bool = False,
        next_action: str | None = None,
    ) -> None:
        super().__init__(error_code)
        self.error_code = error_code
        self.retryable = retryable
        self.result_unknown = result_unknown
        self.next_action = next_action


class JobHandler(Protocol):
    async def execute(self, db: AsyncSession, job: Job) -> ExecutionReceipt: ...


async def ensure_execution_active(db: AsyncSession, job: Job) -> None:
    row = (
        await db.execute(
            select(Job, User.status, HostedCredential.status, HostedCredential.expires_at)
            .join(User, User.id == Job.user_id)
            .outerjoin(HostedCredential, HostedCredential.id == Job.credential_id)
            .where(Job.id == job.id)
        )
    ).one_or_none()
    if row is None:
        raise ExecutionFailure("JOB_NOT_EXECUTABLE", retryable=False)
    current, user_status, credential_status, credential_expires_at = row
    if (
        current.state.value != "running"
        or current.lease_owner != job.lease_owner
        or current.cancel_requested_at is not None
    ):
        raise ExecutionFailure("JOB_CANCELLED", retryable=False)
    if user_status != UserStatus.ACTIVE:
        raise ExecutionFailure("USER_INACTIVE", retryable=False)
    if job.credential_id is not None and (
        credential_status != CredentialStatus.ACTIVE
        or credential_expires_at is None
        or as_utc(credential_expires_at) <= utc_now()
    ):
        raise ExecutionFailure(
            "CREDENTIAL_UNAVAILABLE", retryable=False, next_action="replace_credential"
        )


class WorkerRuntime:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        worker_id: str,
        lease_seconds: int,
        retry_interval_seconds: int,
        handlers: Mapping[str, JobHandler],
        service: JobService | None = None,
        heartbeat_file: str | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._worker_id = worker_id
        self._lease_seconds = lease_seconds
        self._retry_interval_seconds = retry_interval_seconds
        self._handlers = dict(handlers)
        self._service = service or JobService()
        self._heartbeat_file = heartbeat_file

    def _touch_heartbeat(self) -> None:
        if self._heartbeat_file is None:
            return
        try:
            Path(self._heartbeat_file).write_text(str(time.time()), encoding="utf-8")
        except OSError:
            logger.warning(
                "worker_heartbeat_write_failed",
                extra={"event": "worker_heartbeat_write_failed", "path": self._heartbeat_file},
            )

    async def run_once(self) -> bool:
        self._touch_heartbeat()
        async with self._session_factory() as db:
            job = await self._service.claim_next(
                db,
                worker_id=self._worker_id,
                supported_tools=tuple(self._handlers),
                lease_seconds=self._lease_seconds,
            )
        if job is None:
            return False

        heartbeat_task = asyncio.create_task(self._heartbeat_loop(job.id))
        try:
            return await self._execute(job)
        except AppError as exc:
            if exc.code is not ErrorCode.CONFLICT:
                raise
            logger.warning(
                "job_lease_lost",
                extra={
                    "event": "job_lease_lost",
                    "job_id": str(job.id),
                    "tool_id": job.tool_id,
                },
            )
            return True
        finally:
            heartbeat_task.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat_task

    async def _execute(self, job: Job) -> bool:
        handler = self._handlers[job.tool_id]
        try:
            async with self._session_factory() as db:
                await ensure_execution_active(db, job)
                receipt = await handler.execute(db, job)
        except ExecutionFailure as exc:
            async with self._session_factory() as db:
                await self._service.fail(
                    db,
                    job_id=job.id,
                    worker_id=self._worker_id,
                    error_code=exc.error_code,
                    retryable=exc.retryable,
                    result_unknown=exc.result_unknown,
                    retry_delay_seconds=self._retry_interval_seconds,
                    next_action=exc.next_action,
                )
            logger.warning(
                "job_failed",
                extra={
                    "event": "job_failed",
                    "job_id": str(job.id),
                    "tool_id": job.tool_id,
                    "error_code": exc.error_code,
                },
            )
            return True
        except Exception:
            logger.exception(
                "job_handler_crashed",
                extra={
                    "event": "job_handler_crashed",
                    "job_id": str(job.id),
                    "tool_id": job.tool_id,
                },
            )
            async with self._session_factory() as db:
                await self._service.fail(
                    db,
                    job_id=job.id,
                    worker_id=self._worker_id,
                    error_code="INTERNAL_ERROR",
                    retryable=True,
                    retry_delay_seconds=self._retry_interval_seconds,
                )
            return True

        async with self._session_factory() as db:
            if receipt.next_run_at is not None:
                await self._service.reschedule(
                    db,
                    job_id=job.id,
                    worker_id=self._worker_id,
                    receipt=receipt.values,
                    scheduled_for=receipt.next_run_at,
                )
                logger.info(
                    "job_rescheduled",
                    extra={
                        "event": "job_rescheduled",
                        "job_id": str(job.id),
                        "tool_id": job.tool_id,
                        "next_run_at": receipt.next_run_at.isoformat(),
                    },
                )
                return True
            await self._service.complete(
                db,
                job_id=job.id,
                worker_id=self._worker_id,
                receipt=receipt.values,
            )
        logger.info(
            "job_succeeded",
            extra={
                "event": "job_succeeded",
                "job_id": str(job.id),
                "tool_id": job.tool_id,
            },
        )
        return True

    async def _heartbeat_loop(self, job_id: UUID) -> None:
        interval_seconds = max(1, self._lease_seconds // 3)
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                async with self._session_factory() as db:
                    renewed = await self._service.heartbeat(
                        db,
                        job_id=job_id,
                        worker_id=self._worker_id,
                        lease_seconds=self._lease_seconds,
                    )
            except Exception:
                logger.exception(
                    "job_heartbeat_error",
                    extra={"event": "job_heartbeat_error", "job_id": str(job_id)},
                )
                continue
            if not renewed:
                logger.warning(
                    "job_heartbeat_rejected",
                    extra={"event": "job_heartbeat_rejected", "job_id": str(job_id)},
                )
                return
            self._touch_heartbeat()
