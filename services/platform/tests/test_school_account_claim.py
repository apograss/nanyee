from __future__ import annotations

from base64 import b64encode
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from uuid import UUID

import httpx
import pytest
import pytest_asyncio
from nanyee.config import Settings
from nanyee.credentials.models import CredentialStatus, HostedCredential
from nanyee.db import get_db_session
from nanyee.db.base import Base
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.smu.client import CaptchaData
from nanyee.jobs.models import CLAIMED_BY_OTHER_ACCOUNT_ERROR, Job, JobState
from nanyee.jobs.service import JobService
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
class FakeSmu:
    logins: list[tuple[str, str, str]] = field(default_factory=list)

    async def fetch_captcha(self) -> CaptchaData:
        return CaptchaData(image=b"png", content_type="image/png", cookies={"uis": "cookie"})

    async def authenticate(
        self, *, account: str, password: str, captcha: str, uis_cookies: dict[str, str]
    ) -> dict[str, str]:
        assert uis_cookies == {"uis": "cookie"}
        self.logins.append((account, password, captcha))
        if password == "wrong-password":
            raise AppError(
                ErrorCode.UPSTREAM_REJECTED,
                "学校账号或密码错误。",
                status_code=422,
                details={"smu_reason": "bad_credentials"},
            )
        return {"JSESSIONID": "academic"}


@dataclass
class Harness:
    app_transport: httpx.ASGITransport
    factory: async_sessionmaker[AsyncSession]
    smu: FakeSmu

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self.app_transport, base_url="http://testserver")


def make_settings(digest_key: str | None = "digest-key-for-tests") -> Settings:
    return Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        allowed_hosts=["testserver"],
        cors_origins=["http://localhost:3000"],
        credential_local_master_key=SecretStr(b64encode(b"k" * 32).decode("ascii")),
        school_account_digest_key=SecretStr(digest_key) if digest_key else None,
    )


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

    app = create_app(make_settings())
    app.dependency_overrides[get_db_session] = override_db
    smu = FakeSmu()
    app.state.smu_client = smu
    yield Harness(httpx.ASGITransport(app=app), factory, smu)
    await engine.dispose()


async def register(client: httpx.AsyncClient, username: str) -> str:
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
        },
    )
    assert registered.status_code == 201, registered.text
    return client.cookies["nanyee_csrf"]


async def school_credential(
    client: httpx.AsyncClient, csrf: str, account: str, password: str
) -> str:
    created = await client.post(
        "/api/v1/credentials",
        headers={"X-CSRF-Token": csrf},
        json={
            "upstream": "school",
            "purpose": "school",
            "secret": f'{{"account":"{account}","password":"{password}"}}',
            "consent_version": "credential-hosting-v1",
        },
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


async def evaluation_job(client: httpx.AsyncClient, csrf: str, credential_id: str) -> str:
    created = await client.post(
        "/api/v1/jobs",
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": f"evaluation-{credential_id}"},
        json={**EVALUATION_JOB, "credential_id": credential_id},
    )
    assert created.status_code == 201, created.text
    return str(created.json()["id"])


async def stop_others(client: httpx.AsyncClient, csrf: str, credential_id: str) -> httpx.Response:
    captcha = await client.get("/api/v1/smu/captcha")
    assert captcha.status_code == 200, captcha.text
    return await client.post(
        "/api/v1/smu/school-account/stop-other-evaluations",
        headers={"X-CSRF-Token": csrf},
        json={
            "credential_id": credential_id,
            "flow_id": captcha.json()["flow_id"],
            "captcha": "ab12",
        },
    )


async def credential_row(h: Harness, credential_id: str) -> HostedCredential:
    async with h.factory() as db:
        record = await db.get(HostedCredential, UUID(credential_id))
        assert record is not None
        return record


async def job_row(h: Harness, job_id: str) -> Job:
    async with h.factory() as db:
        job = await db.get(Job, UUID(job_id))
        assert job is not None
        return job


@pytest.mark.asyncio
async def test_new_account_stops_old_accounts_evaluation(harness: Harness) -> None:
    h = harness
    async with h.client() as old, h.client() as new, h.client() as stranger:
        old_csrf = await register(old, "old_account")
        old_cred = await school_credential(old, old_csrf, "3250010165", "old-password")
        old_job = await evaluation_job(old, old_csrf, old_cred)

        stranger_csrf = await register(stranger, "stranger")
        stranger_cred = await school_credential(stranger, stranger_csrf, "3260000001", "pw")
        stranger_job = await evaluation_job(stranger, stranger_csrf, stranger_cred)

        new_csrf = await register(new, "new_account")
        new_cred = await school_credential(new, new_csrf, " 3250010165 ", "new-password")

        old_record = await credential_row(h, old_cred)
        assert old_record.account_digest is not None
        assert old_record.account_digest == (await credential_row(h, new_cred)).account_digest
        assert old_record.account_digest != (await credential_row(h, stranger_cred)).account_digest

        response = await stop_others(new, new_csrf, new_cred)
        assert response.status_code == 200, response.text
        assert response.json() == {"stopped_jobs": 1}
        assert h.smu.logins[-1] == ("3250010165", "new-password", "ab12")

        stopped = await job_row(h, old_job)
        assert stopped.state == JobState.CANCELLED
        assert stopped.error_code == CLAIMED_BY_OTHER_ACCOUNT_ERROR
        assert (await credential_row(h, old_cred)).status == CredentialStatus.REVOKED
        # 不相关的学号不受影响，自己的凭据也不受影响
        assert (await job_row(h, stranger_job)).state == JobState.QUEUED
        assert (await credential_row(h, new_cred)).status == CredentialStatus.ACTIVE

        notices = (await old.get("/api/v1/notices")).json()
        assert [notice["kind"] for notice in notices] == ["evaluation_claimed"]
        assert (await new.get("/api/v1/notices")).json() == []

        again = await stop_others(new, new_csrf, new_cred)
        assert again.json() == {"stopped_jobs": 0}


@pytest.mark.asyncio
async def test_failed_school_login_stops_nothing(harness: Harness) -> None:
    h = harness
    async with h.client() as victim, h.client() as attacker:
        victim_csrf = await register(victim, "victim")
        victim_cred = await school_credential(victim, victim_csrf, "3250010165", "real-password")
        victim_job = await evaluation_job(victim, victim_csrf, victim_cred)

        attacker_csrf = await register(attacker, "attacker")
        attacker_cred = await school_credential(
            attacker, attacker_csrf, "3250010165", "wrong-password"
        )
        response = await stop_others(attacker, attacker_csrf, attacker_cred)
        assert response.status_code == 422
        assert response.json()["error"]["details"] == {"smu_reason": "bad_credentials"}
        assert (await job_row(h, victim_job)).state == JobState.QUEUED
        assert (await credential_row(h, victim_cred)).status == CredentialStatus.ACTIVE

        # 不能拿别人的凭据来发起
        foreign = await stop_others(attacker, attacker_csrf, victim_cred)
        assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_updating_secret_recomputes_digest(harness: Harness) -> None:
    h = harness
    async with h.client() as client:
        csrf = await register(client, "updater")
        cred = await school_credential(client, csrf, "3250010165", "pw")
        before = (await credential_row(h, cred)).account_digest
        updated = await client.put(
            f"/api/v1/credentials/{cred}/secret",
            headers={"X-CSRF-Token": csrf},
            json={"secret": '{"account":"3250010166","password":"pw"}'},
        )
        assert updated.status_code == 200, updated.text
        after = (await credential_row(h, cred)).account_digest
        assert after is not None and after != before


@pytest.mark.asyncio
async def test_running_job_keeps_claimed_reason_after_worker_finishes(harness: Harness) -> None:
    h = harness
    async with h.client() as old, h.client() as new:
        old_csrf = await register(old, "old_running")
        old_cred = await school_credential(old, old_csrf, "3250010165", "pw")
        old_job = await evaluation_job(old, old_csrf, old_cred)
        async with h.factory() as db:
            job = await db.get(Job, UUID(old_job))
            assert job is not None
            job.state = JobState.RUNNING
            job.lease_owner = "worker-1"
            job.lease_expires_at = utc_now()
            await db.commit()

        new_csrf = await register(new, "new_running")
        new_cred = await school_credential(new, new_csrf, "3250010165", "pw")
        assert (await stop_others(new, new_csrf, new_cred)).json() == {"stopped_jobs": 1}
        assert (await job_row(h, old_job)).state == JobState.RUNNING

        async with h.factory() as db:
            finished = await JobService().reschedule(
                db,
                job_id=UUID(old_job),
                worker_id="worker-1",
                receipt={"logs": []},
                scheduled_for=utc_now(),
            )
        assert finished.state == JobState.CANCELLED
        assert finished.error_code == CLAIMED_BY_OTHER_ACCOUNT_ERROR
        notices = (await old.get("/api/v1/notices")).json()
        assert [notice["kind"] for notice in notices] == ["evaluation_claimed"]
