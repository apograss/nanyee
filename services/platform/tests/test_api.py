from __future__ import annotations

from base64 import b64encode
from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from nanyee.config import Settings
from nanyee.db import get_db_session
from nanyee.db.base import Base
from nanyee.main import create_app
from nanyee.registration.quiz import load_quiz_bank
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def api_client() -> AsyncIterator[httpx.AsyncClient]:
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
        yield client
    await engine.dispose()


@pytest.mark.asyncio
async def test_health_tools_and_error_contract(api_client: httpx.AsyncClient) -> None:
    live = await api_client.get("/health/live", headers={"X-Request-ID": "request-1234"})
    assert live.status_code == 200
    assert live.headers["X-Request-ID"] == "request-1234"

    tools = await api_client.get("/api/v1/tools")
    assert tools.status_code == 200
    assert {item["id"] for item in tools.json()} == {
        "timetable",
        "grades",
        "evaluation",
        "qun_checkin",
        "course_selection",
        "study_cabin",
    }

    invalid = await api_client.post("/api/v1/auth/login", json={})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "INVALID_REQUEST"
    assert invalid.json()["error"]["request_id"]


@pytest.mark.asyncio
async def test_quiz_registration_session_and_csrf_logout(
    api_client: httpx.AsyncClient,
) -> None:
    challenge_response = await api_client.post(
        "/api/v1/registration/challenges", json={"method": "quiz"}
    )
    assert challenge_response.status_code == 200, challenge_response.text
    challenge = challenge_response.json()
    assert len(challenge["questions"]) == 20
    assert challenge["pass_score"] == 18

    bank_by_content = {question.content: question for question in load_quiz_bank()}
    answers = [bank_by_content[item["question"]].correctAnswer for item in challenge["questions"]]
    verified = await api_client.post(
        f"/api/v1/registration/challenges/{challenge['challenge_id']}/verify",
        json={"answers": answers},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified"] is True

    registered = await api_client.post(
        "/api/v1/registration",
        json={
            "challenge_id": challenge["challenge_id"],
            "username": "student_01",
            "password": "一段好记的密码 2026",
            "nickname": "学生一号",
        },
    )
    assert registered.status_code == 201, registered.text
    assert registered.json()["user"]["registration_trust_level"] == "community_quiz"
    assert "nanyee_session" in api_client.cookies
    assert "nanyee_csrf" in api_client.cookies

    me = await api_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["username"] == "student_01"

    csrf = api_client.cookies["nanyee_csrf"]
    stored = await api_client.post(
        "/api/v1/credentials",
        headers={"X-CSRF-Token": csrf},
        json={
            "upstream": "qun100",
            "purpose": "qun_checkin",
            "secret": "t" * 60,
            "consent_version": "credential-hosting-v1",
            "metadata": {"account_hint": "student", "secret_copy": "must-drop"},
        },
    )
    assert stored.status_code == 201, stored.text
    assert "secret" not in stored.text
    assert stored.json()["metadata"] == {"account_hint": "student"}
    listed = await api_client.get("/api/v1/credentials")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == stored.json()["id"]

    job_payload = {
        "tool_id": "qun_checkin",
        "operation": "submit",
        "payload": {
            "form_id": "123456789012345",
            "form_version": 1,
            "title": "每日打卡",
            "catalogs": [{"cid": "temperature", "type": "NUMBER_FLOAT", "value": "36.5"}],
        },
        "credential_id": stored.json()["id"],
        "confirmation_version": "qun_checkin:submit:v1",
    }
    job = await api_client.post(
        "/api/v1/jobs",
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": "job-test-0001"},
        json=job_payload,
    )
    assert job.status_code == 201, job.text
    replay = await api_client.post(
        "/api/v1/jobs",
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": "job-test-0001"},
        json=job_payload,
    )
    assert replay.status_code == 200
    assert replay.headers["Idempotency-Replayed"] == "true"
    assert replay.json()["id"] == job.json()["id"]
    cancelled = await api_client.post(
        f"/api/v1/jobs/{job.json()['id']}/cancel",
        headers={"X-CSRF-Token": csrf},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["state"] == "cancelled"

    revoked = await api_client.delete(
        f"/api/v1/credentials/{stored.json()['id']}",
        headers={"X-CSRF-Token": csrf},
    )
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoked"

    rejected_logout = await api_client.post("/api/v1/auth/logout")
    assert rejected_logout.status_code == 403
    logout = await api_client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logout.status_code == 204
    assert (await api_client.get("/api/v1/auth/me")).status_code == 401
