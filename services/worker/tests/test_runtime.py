from __future__ import annotations

from datetime import timedelta

import pytest
from nanyee.db.base import Base
from nanyee.identity.models import RegistrationTrustLevel, User
from nanyee.identity.passwords import hash_password
from nanyee.jobs.models import Job, JobState
from nanyee.jobs.service import JobService
from nanyee.security import utc_now
from nanyee_worker.runtime import ExecutionFailure, ExecutionReceipt, WorkerRuntime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


class SuccessfulHandler:
    async def execute(self, _db: AsyncSession, _job: Job) -> ExecutionReceipt:
        return ExecutionReceipt({"reference": "success"})


class UnknownHandler:
    async def execute(self, _db: AsyncSession, _job: Job) -> ExecutionReceipt:
        raise ExecutionFailure(
            "RESULT_UNKNOWN",
            retryable=False,
            result_unknown=True,
            next_action="verify_upstream",
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler", "expected_state"),
    [
        (SuccessfulHandler(), JobState.SUCCEEDED),
        (UnknownHandler(), JobState.VERIFICATION_REQUIRED),
    ],
)
async def test_runtime_drives_durable_job_to_terminal_state(
    handler: SuccessfulHandler | UnknownHandler,
    expected_state: JobState,
) -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    service = JobService()
    async with factory() as db:
        user = User(
            username="runtime_test",
            username_normalized="runtime_test",
            nickname="Runtime",
            password_hash=hash_password("runtime test password"),
            registration_trust_level=RegistrationTrustLevel.COMMUNITY_QUIZ,
        )
        db.add(user)
        await db.flush()
        job, _ = await service.create(
            db,
            user_id=user.id,
            tool_id="study_cabin",
            operation="reserve",
            payload={"test": True},
            credential_id=None,
            idempotency_key=f"runtime-{expected_state.value}",
            confirmation_version="study_cabin:reserve:v1",
            scheduled_for=utc_now() - timedelta(seconds=1),
        )
        job_id = job.id

    runtime = WorkerRuntime(
        factory,
        worker_id="test-worker",
        lease_seconds=60,
        retry_interval_seconds=5,
        handlers={"study_cabin": handler},
    )
    assert await runtime.run_once() is True
    async with factory() as db:
        record = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
        assert record.state == expected_state
        if expected_state == JobState.SUCCEEDED:
            assert record.receipt == {"reference": "success"}
        else:
            assert record.next_action == "verify_upstream"
    await engine.dispose()
