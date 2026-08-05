from __future__ import annotations

import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from nanyee.db.base import Base
from nanyee.identity.models import RegistrationTrustLevel, User
from nanyee.identity.passwords import hash_password
from nanyee.jobs.models import Job, JobState
from nanyee.jobs.service import JobService
from nanyee.security import utc_now
from nanyee_worker.runtime import ExecutionFailure, ExecutionReceipt, WorkerRuntime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
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


class RecordingJobService(JobService):
    def __init__(self) -> None:
        self.heartbeat_results: list[bool] = []

    async def heartbeat(
        self,
        db: AsyncSession,
        *,
        job_id: UUID,
        worker_id: str,
        lease_seconds: int = 60,
    ) -> bool:
        renewed = await super().heartbeat(
            db,
            job_id=job_id,
            worker_id=worker_id,
            lease_seconds=lease_seconds,
        )
        self.heartbeat_results.append(renewed)
        return renewed


class ReclaimProbingHandler:
    """Sleeps past the original lease, then lets a second worker try to reclaim the job."""

    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = factory
        self.reclaim_results: list[Job | None] = []

    async def execute(self, db: AsyncSession, _job: Job) -> ExecutionReceipt:
        # Release the read transaction opened by ensure_execution_active so that
        # concurrent heartbeat sessions can write on the shared sqlite connection.
        await db.commit()
        await asyncio.sleep(2.4)
        async with self._factory() as other_db:
            self.reclaim_results.append(
                await JobService().claim_next(
                    other_db,
                    worker_id="other-worker",
                    supported_tools=("study_cabin",),
                    lease_seconds=60,
                )
            )
        return ExecutionReceipt({"reference": "slow"})


class LeaseStealingHandler:
    """Transfers the lease to another worker mid-execution, then settles normally."""

    def __init__(self, factory: async_sessionmaker[AsyncSession], *, succeed: bool) -> None:
        self._factory = factory
        self._succeed = succeed

    async def execute(self, db: AsyncSession, job: Job) -> ExecutionReceipt:
        await db.commit()
        async with self._factory() as other_db:
            record = (await other_db.execute(select(Job).where(Job.id == job.id))).scalar_one()
            record.lease_owner = "other-worker"
            await other_db.commit()
        if not self._succeed:
            raise ExecutionFailure("UPSTREAM_UNAVAILABLE", retryable=True)
        return ExecutionReceipt({"reference": "stolen"})


def _build_engine() -> AsyncEngine:
    return create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )


async def _create_queued_job(
    factory: async_sessionmaker[AsyncSession], *, idempotency_key: str
) -> UUID:
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
        job, _ = await JobService().create(
            db,
            user_id=user.id,
            tool_id="study_cabin",
            operation="reserve",
            payload={"test": True},
            credential_id=None,
            idempotency_key=idempotency_key,
            confirmation_version="study_cabin:reserve:v1",
            scheduled_for=utc_now() - timedelta(seconds=1),
        )
        return job.id


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


@pytest.mark.asyncio
async def test_runtime_heartbeat_blocks_reclaim_during_execution() -> None:
    engine = _build_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    job_id = await _create_queued_job(factory, idempotency_key="runtime-heartbeat")
    service = RecordingJobService()
    handler = ReclaimProbingHandler(factory)
    runtime = WorkerRuntime(
        factory,
        worker_id="test-worker",
        lease_seconds=2,
        retry_interval_seconds=5,
        handlers={"study_cabin": handler},
        service=service,
    )
    assert await runtime.run_once() is True
    assert handler.reclaim_results == [None]
    assert service.heartbeat_results and all(service.heartbeat_results)
    async with factory() as db:
        record = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
        assert record.state == JobState.SUCCEEDED
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("succeed", [True, False])
async def test_runtime_tolerates_lease_loss_on_settlement(succeed: bool) -> None:
    engine = _build_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    job_id = await _create_queued_job(factory, idempotency_key=f"runtime-lease-loss-{succeed}")
    runtime = WorkerRuntime(
        factory,
        worker_id="test-worker",
        lease_seconds=60,
        retry_interval_seconds=5,
        handlers={"study_cabin": LeaseStealingHandler(factory, succeed=succeed)},
    )
    assert await runtime.run_once() is True
    async with factory() as db:
        record = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
        assert record.state == JobState.RUNNING
        assert record.lease_owner == "other-worker"
    await engine.dispose()


@pytest.mark.asyncio
async def test_heartbeat_loop_stops_after_lease_loss() -> None:
    engine = _build_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    job_id = await _create_queued_job(factory, idempotency_key="runtime-heartbeat-stop")
    service = RecordingJobService()
    runtime = WorkerRuntime(
        factory,
        worker_id="test-worker",
        lease_seconds=1,
        retry_interval_seconds=5,
        handlers={"study_cabin": SuccessfulHandler()},
        service=service,
    )
    async with factory() as db:
        claimed = await service.claim_next(
            db,
            worker_id="test-worker",
            supported_tools=("study_cabin",),
            lease_seconds=1,
        )
        assert claimed is not None
    async with factory() as db:
        record = (await db.execute(select(Job).where(Job.id == job_id))).scalar_one()
        record.lease_owner = "other-worker"
        await db.commit()
    await asyncio.wait_for(runtime._heartbeat_loop(job_id), timeout=5)
    assert service.heartbeat_results == [False]
    await engine.dispose()


@pytest.mark.asyncio
async def test_run_once_touches_heartbeat_file(tmp_path) -> None:
    engine = _build_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    heartbeat = tmp_path / "worker-heartbeat"
    runtime = WorkerRuntime(
        factory,
        worker_id="test-worker",
        lease_seconds=60,
        retry_interval_seconds=5,
        handlers={"study_cabin": SuccessfulHandler()},
        heartbeat_file=str(heartbeat),
    )
    # 空闲轮询（无任务可领）也必须刷新心跳文件，供容器 healthcheck 探测事件循环卡死
    assert await runtime.run_once() is False
    assert heartbeat.read_text(encoding="utf-8").strip()
    await engine.dispose()
