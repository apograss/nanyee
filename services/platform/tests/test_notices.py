from __future__ import annotations

from base64 import b64encode
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

import httpx
import pytest
import pytest_asyncio
from nanyee.config import Settings
from nanyee.db import get_db_session
from nanyee.db.base import Base
from nanyee.jobs.models import Job, JobState
from nanyee.main import create_app
from nanyee.registration.quiz import load_quiz_bank
from nanyee.security import utc_now
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

EVALUATION_JOB = {
    "tool_id": "evaluation",
    "operation": "submit",
    "payload": {"strategy": "legacy_positive_random", "max_courses": 60},
    "confirmation_version": "evaluation:submit:v1",
}


@dataclass
class Harness:
    client: httpx.AsyncClient
    factory: async_sessionmaker[AsyncSession]


@pytest_asyncio.fixture
async def harness() -> AsyncIterator[Harness]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    settings = Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        allowed_hosts=["testserver"],
        cors_origins=["http://localhost:3000"],
        credential_local_master_key=SecretStr(b64encode(b"k" * 32).decode("ascii")),
    )
    app = create_app(settings)
    app.dependency_overrides[get_db_session] = override_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield Harness(client, factory)
    await engine.dispose()


async def _register(client: httpx.AsyncClient, username: str) -> str:
    challenge = (
        await client.post("/api/v1/registration/challenges", json={"method": "quiz"})
    ).json()
    bank = {question.content: question for question in load_quiz_bank()}
    answers = [bank[item["question"]].correctAnswer for item in challenge["questions"]]
    await client.post(
        f"/api/v1/registration/challenges/{challenge['challenge_id']}/verify",
        json={"answers": answers},
    )
    registered = await client.post(
        "/api/v1/registration",
        json={
            "challenge_id": challenge["challenge_id"],
            "username": username,
            "password": "一段好记的密码 2026",
            "nickname": username,
        },
    )
    assert registered.status_code == 201, registered.text
    return client.cookies["nanyee_csrf"]


async def _school_credential(client: httpx.AsyncClient, csrf: str) -> str:
    created = await client.post(
        "/api/v1/credentials",
        headers={"X-CSRF-Token": csrf},
        json={
            "upstream": "school",
            "purpose": "school",
            "secret": '{"account":"20260001","password":"old-password"}',
            "consent_version": "credential-hosting-v1",
            "metadata": {"account_hint": "尾号 0001"},
        },
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


async def _create_evaluation_job(
    client: httpx.AsyncClient, csrf: str, credential_id: str, key: str
) -> httpx.Response:
    return await client.post(
        "/api/v1/jobs",
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": key},
        json={**EVALUATION_JOB, "credential_id": credential_id},
    )


async def _update_job(
    factory: async_sessionmaker[AsyncSession], job_id: str, **values: Any
) -> None:
    async with factory() as db:
        job = await db.get(Job, UUID(job_id))
        assert job is not None
        for key, value in values.items():
            setattr(job, key, value)
        await db.commit()


@pytest.mark.asyncio
async def test_evaluation_job_creation_reuses_active_job(harness: Harness) -> None:
    client = harness.client
    csrf = await _register(client, "dedupe_user")
    credential_id = await _school_credential(client, csrf)

    first = await _create_evaluation_job(client, csrf, credential_id, "evaluation-first-0001")
    assert first.status_code == 201, first.text
    second = await _create_evaluation_job(client, csrf, credential_id, "evaluation-second-0001")
    assert second.status_code == 200, second.text
    assert second.headers["X-Job-Deduplicated"] == "true"
    assert second.json()["id"] == first.json()["id"]

    # 原任务结束后可以重新创建
    await _update_job(harness.factory, first.json()["id"], state=JobState.CANCELLED)
    third = await _create_evaluation_job(client, csrf, credential_id, "evaluation-third-0001")
    assert third.status_code == 201, third.text
    assert third.json()["id"] != first.json()["id"]


@pytest.mark.asyncio
async def test_credential_invalid_notice_and_resume_after_password_update(
    harness: Harness,
) -> None:
    client = harness.client
    csrf = await _register(client, "invalid_user")
    credential_id = await _school_credential(client, csrf)
    job = await _create_evaluation_job(client, csrf, credential_id, "evaluation-invalid-0001")
    job_id = job.json()["id"]

    assert (await client.get("/api/v1/notices")).json() == []

    await _update_job(
        harness.factory,
        job_id,
        state=JobState.FAILED,
        error_code="CREDENTIAL_INVALID",
        next_action="replace_credential",
        finished_at=utc_now(),
    )
    notices = (await client.get("/api/v1/notices")).json()
    assert [notice["kind"] for notice in notices] == ["credential_invalid"]
    assert notices[0]["credential_id"] == credential_id
    assert notices[0]["job_id"] == job_id
    assert notices[0]["dismissible"] is False

    updated = await client.put(
        f"/api/v1/credentials/{credential_id}/secret",
        headers={"X-CSRF-Token": csrf},
        json={"secret": '{"account":"20260001","password":"new-password"}'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["resumed_job_id"] == job_id

    resumed = (await client.get(f"/api/v1/jobs/{job_id}")).json()
    assert resumed["state"] == "queued"
    assert resumed["error_code"] is None
    notices = (await client.get("/api/v1/notices")).json()
    assert [notice["kind"] for notice in notices] == ["evaluation_recovered"]
    assert notices[0]["dismissible"] is True

    # 再次修改不会重复恢复
    again = await client.put(
        f"/api/v1/credentials/{credential_id}/secret",
        headers={"X-CSRF-Token": csrf},
        json={"secret": '{"account":"20260001","password":"newer-password"}'},
    )
    assert again.json()["resumed_job_id"] is None


@pytest.mark.asyncio
async def test_credential_invalid_notice_without_usable_credential(harness: Harness) -> None:
    client = harness.client
    csrf = await _register(client, "revoked_user")
    credential_id = await _school_credential(client, csrf)
    job = await _create_evaluation_job(client, csrf, credential_id, "evaluation-revoked-0001")
    await _update_job(
        harness.factory,
        job.json()["id"],
        state=JobState.FAILED,
        error_code="CREDENTIAL_INVALID",
        finished_at=utc_now(),
    )
    await client.delete(f"/api/v1/credentials/{credential_id}", headers={"X-CSRF-Token": csrf})

    notices = (await client.get("/api/v1/notices")).json()
    assert notices[0]["kind"] == "credential_invalid"
    assert notices[0]["credential_id"] is None


@pytest.mark.asyncio
async def test_duplicates_merged_notice(harness: Harness) -> None:
    client = harness.client
    csrf = await _register(client, "merged_user")
    credential_id = await _school_credential(client, csrf)
    kept = await _create_evaluation_job(client, csrf, credential_id, "evaluation-kept-0001")
    # 模拟迁移前遗留的重复任务被合并
    async with harness.factory() as db:
        kept_job = await db.get(Job, UUID(kept.json()["id"]))
        assert kept_job is not None
        user_id = kept_job.user_id
        for index in range(2):
            db.add(
                Job(
                    user_id=user_id,
                    credential_id=UUID(credential_id),
                    tool_id="evaluation",
                    operation="submit",
                    payload=EVALUATION_JOB["payload"],
                    request_digest="d",
                    idempotency_key=f"merged-{index}",
                    state=JobState.CANCELLED,
                    scheduled_for=utc_now(),
                    finished_at=utc_now(),
                    error_code="DUPLICATE_MERGED",
                )
            )
        stale = Job(
            user_id=user_id,
            credential_id=UUID(credential_id),
            tool_id="evaluation",
            operation="submit",
            payload=EVALUATION_JOB["payload"],
            request_digest="d",
            idempotency_key="merged-stale",
            state=JobState.CANCELLED,
            scheduled_for=utc_now(),
            finished_at=utc_now() - timedelta(days=31),
            error_code="DUPLICATE_MERGED",
        )
        db.add(stale)
        await db.commit()

    notices = (await client.get("/api/v1/notices")).json()
    assert [notice["kind"] for notice in notices] == ["duplicates_merged"]
    assert "3 个" in notices[0]["message"]
    assert notices[0]["job_id"] == kept.json()["id"]
