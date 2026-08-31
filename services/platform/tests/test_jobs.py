from __future__ import annotations

from datetime import timedelta

import pytest
from nanyee.db.base import Base
from nanyee.identity.models import RegistrationTrustLevel, User
from nanyee.identity.passwords import hash_password
from nanyee.jobs.models import JobState
from nanyee.jobs.service import JobService
from nanyee.security import as_utc, utc_now
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.mark.asyncio
async def test_worker_lease_retry_recovery_and_unknown_result() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    service = JobService()
    now = utc_now()

    async with factory() as db:
        user = User(
            username="worker_test",
            username_normalized="worker_test",
            nickname="Worker Test",
            password_hash=hash_password("worker test password"),
            registration_trust_level=RegistrationTrustLevel.COMMUNITY_QUIZ,
        )
        db.add(user)
        await db.flush()
        user_id = user.id
        await db.commit()

        job, created = await service.create(
            db,
            user_id=user_id,
            tool_id="qun_checkin",
            operation="submit",
            payload={"form_id": "one"},
            credential_id=None,
            idempotency_key="worker-job-0001",
            confirmation_version="qun_checkin:submit:v1",
            scheduled_for=now,
        )
        assert created
        replay, replay_created = await service.create(
            db,
            user_id=user_id,
            tool_id="qun_checkin",
            operation="submit",
            payload={"form_id": "one"},
            credential_id=None,
            idempotency_key="worker-job-0001",
            confirmation_version="qun_checkin:submit:v1",
            scheduled_for=now,
        )
        assert not replay_created and replay.id == job.id

        claimed = await service.claim_next(
            db,
            worker_id="worker-a",
            supported_tools=("qun_checkin",),
            now=now,
        )
        assert claimed is not None
        assert claimed.state == JobState.RUNNING
        assert claimed.attempt_count == 1
        assert await service.heartbeat(db, job_id=claimed.id, worker_id="worker-a")

        retry = await service.fail(
            db,
            job_id=claimed.id,
            worker_id="worker-a",
            error_code="UPSTREAM_UNAVAILABLE",
            retryable=True,
            retry_delay_seconds=30,
        )
        assert retry.state == JobState.RETRY_WAIT
        reclaimed = await service.claim_next(
            db,
            worker_id="worker-b",
            supported_tools=("qun_checkin",),
            now=utc_now() + timedelta(seconds=31),
        )
        assert reclaimed is not None
        assert reclaimed.attempt_count == 2
        unknown = await service.fail(
            db,
            job_id=reclaimed.id,
            worker_id="worker-b",
            error_code="RESULT_UNKNOWN",
            retryable=False,
            result_unknown=True,
            next_action="verify_upstream",
        )
        assert unknown.state == JobState.VERIFICATION_REQUIRED
        assert unknown.next_action == "verify_upstream"

    await engine.dispose()


@pytest.mark.asyncio
async def test_reschedule_requeues_recurring_job_and_keeps_receipt() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    service = JobService()
    now = utc_now()

    async with factory() as db:
        user = User(
            username="reschedule_test",
            username_normalized="reschedule_test",
            nickname="Reschedule",
            password_hash=hash_password("reschedule test password"),
            registration_trust_level=RegistrationTrustLevel.COMMUNITY_QUIZ,
        )
        db.add(user)
        await db.flush()

        job, _ = await service.create(
            db,
            user_id=user.id,
            tool_id="evaluation",
            operation="submit",
            payload={"strategy": "legacy_positive_random"},
            credential_id=None,
            idempotency_key="reschedule-job-0001",
            confirmation_version="evaluation:submit:v1",
            scheduled_for=now,
        )
        claimed = await service.claim_next(
            db, worker_id="worker-a", supported_tools=("evaluation",), now=now
        )
        assert claimed is not None
        await service.fail(
            db,
            job_id=claimed.id,
            worker_id="worker-a",
            error_code="SMU_LOGIN_RETRY",
            retryable=True,
            retry_delay_seconds=30,
        )
        reclaimed = await service.claim_next(
            db,
            worker_id="worker-a",
            supported_tools=("evaluation",),
            now=utc_now() + timedelta(seconds=31),
        )
        assert reclaimed is not None

        next_run = utc_now() + timedelta(days=1)
        rescheduled = await service.reschedule(
            db,
            job_id=reclaimed.id,
            worker_id="worker-a",
            receipt={"submitted_count": 0},
            scheduled_for=next_run,
        )
        assert rescheduled.state == JobState.QUEUED
        assert as_utc(rescheduled.scheduled_for) == next_run
        assert rescheduled.receipt == {"submitted_count": 0}
        assert rescheduled.error_code is None
        assert rescheduled.next_action is None
        assert rescheduled.lease_owner is None
        assert rescheduled.finished_at is None

        # 未到下一轮时间前不可被领取
        assert (
            await service.claim_next(db, worker_id="worker-b", supported_tools=("evaluation",))
            is None
        )
        # 到点后正常被领取
        due = await service.claim_next(
            db,
            worker_id="worker-b",
            supported_tools=("evaluation",),
            now=next_run + timedelta(seconds=1),
        )
        assert due is not None

        # 执行中收到取消请求时，reschedule 落 CANCELLED 终态
        await service.cancel(db, job_id=due.id, user_id=user.id)
        cancelled = await service.reschedule(
            db,
            job_id=due.id,
            worker_id="worker-b",
            receipt={"submitted_count": 0},
            scheduled_for=next_run,
        )
        assert cancelled.state == JobState.CANCELLED
        assert cancelled.finished_at is not None
        assert cancelled.receipt is None

    await engine.dispose()
