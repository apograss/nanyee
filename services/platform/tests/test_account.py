from __future__ import annotations

from base64 import b64encode
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

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


@dataclass
class FakeMailer:
    codes: list[dict[str, str | None]] = field(default_factory=list)

    async def send_code(
        self, *, recipient: str, code: str, purpose: str, subject: str | None = None
    ) -> None:
        self.codes.append({"to": recipient, "code": code, "purpose": purpose, "subject": subject})

    async def send_registration_code(self, *, recipient: str, code: str) -> None:
        await self.send_code(recipient=recipient, code=code, purpose="register")

    def last_code(self, recipient: str) -> str:
        code = next(item["code"] for item in reversed(self.codes) if item["to"] == recipient)
        assert code is not None
        return code


@dataclass
class FakeNoticeMailer:
    notices: list[dict[str, str]] = field(default_factory=list)

    async def send_notice(self, *, recipient: str, subject: str, text: str) -> None:
        self.notices.append({"to": recipient, "subject": subject, "text": text})


@dataclass
class Harness:
    client: httpx.AsyncClient
    mailer: FakeMailer
    notices: FakeNoticeMailer


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
    mailer = FakeMailer()
    notices = FakeNoticeMailer()
    app.state.verification_mailer = mailer
    app.state.notice_mailer = notices
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield Harness(client=client, mailer=mailer, notices=notices)
    await engine.dispose()


async def register(client: httpx.AsyncClient, username: str, password: str) -> None:
    challenge = (
        await client.post("/api/v1/registration/challenges", json={"method": "quiz"})
    ).json()
    bank = {question.content: question for question in load_quiz_bank()}
    answers = [bank[item["question"]].correctAnswer for item in challenge["questions"]]
    verified = await client.post(
        f"/api/v1/registration/challenges/{challenge['challenge_id']}/verify",
        json={"answers": answers},
    )
    assert verified.status_code == 200, verified.text
    registered = await client.post(
        "/api/v1/registration",
        json={
            "challenge_id": challenge["challenge_id"],
            "username": username,
            "password": password,
        },
    )
    assert registered.status_code == 201, registered.text


def csrf(client: httpx.AsyncClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies["nanyee_csrf"]}


async def bind_email(h: Harness, email: str, password: str | None = None) -> httpx.Response:
    body: dict[str, str] = {"email": email}
    if password is not None:
        body["password"] = password
    started = await h.client.post(
        "/api/v1/account/email/challenges", json=body, headers=csrf(h.client)
    )
    assert started.status_code == 200, started.text
    return await h.client.post(
        "/api/v1/account/email/confirm",
        json={
            "challenge_id": started.json()["challenge_id"],
            "code": h.mailer.last_code(email.casefold()),
        },
        headers=csrf(h.client),
    )


@pytest.mark.asyncio
async def test_bind_change_and_unbind_email(harness: Harness) -> None:
    h = harness
    await register(h.client, "student_a", "password-a-2026")

    bound = await bind_email(h, "Student.A@QQ.com")
    assert bound.status_code == 200, bound.text
    assert bound.json()["user"]["email"] == "student.a@qq.com"
    assert bound.json()["user"]["email_verified"] is True
    assert h.mailer.codes[-1]["purpose"] == "bind"
    assert h.notices.notices == []

    # 换绑必须输入当前平台密码
    missing_password = await h.client.post(
        "/api/v1/account/email/challenges",
        json={"email": "new@qq.com"},
        headers=csrf(h.client),
    )
    assert missing_password.status_code == 401
    assert missing_password.json()["error"]["code"] == "INVALID_CREDENTIALS"

    changed = await bind_email(h, "new@qq.com", password="password-a-2026")
    assert changed.status_code == 200, changed.text
    assert changed.json()["user"]["email"] == "new@qq.com"
    assert h.notices.notices[-1]["to"] == "student.a@qq.com"

    wrong = await h.client.post(
        "/api/v1/account/email/unbind", json={"password": "nope"}, headers=csrf(h.client)
    )
    assert wrong.status_code == 401
    unbound = await h.client.post(
        "/api/v1/account/email/unbind",
        json={"password": "password-a-2026"},
        headers=csrf(h.client),
    )
    assert unbound.status_code == 200, unbound.text
    assert unbound.json()["user"]["email"] is None
    assert h.notices.notices[-1]["to"] == "new@qq.com"


@pytest.mark.asyncio
async def test_email_can_only_bind_one_account(harness: Harness) -> None:
    h = harness
    await register(h.client, "student_a", "password-a-2026")
    assert (await bind_email(h, "shared@qq.com")).status_code == 200

    h.client.cookies.clear()
    await register(h.client, "student_b", "password-b-2026")
    taken = await h.client.post(
        "/api/v1/account/email/challenges",
        json={"email": "shared@qq.com"},
        headers=csrf(h.client),
    )
    assert taken.status_code == 409


@pytest.mark.asyncio
async def test_bind_challenge_cannot_be_used_for_registration(harness: Harness) -> None:
    h = harness
    await register(h.client, "student_a", "password-a-2026")
    started = await h.client.post(
        "/api/v1/account/email/challenges",
        json={"email": "a@qq.com"},
        headers=csrf(h.client),
    )
    challenge_id = started.json()["challenge_id"]
    verify = await h.client.post(
        f"/api/v1/registration/challenges/{challenge_id}/verify",
        json={"code": h.mailer.last_code("a@qq.com")},
    )
    assert verify.status_code == 404
    hijack = await h.client.post(
        "/api/v1/registration",
        json={"challenge_id": challenge_id, "username": "intruder", "password": "password-x-2026"},
    )
    assert hijack.status_code == 404


@pytest.mark.asyncio
async def test_password_reset_flow_revokes_sessions(harness: Harness) -> None:
    h = harness
    await register(h.client, "student_a", "password-a-2026")
    assert (await bind_email(h, "a@qq.com")).status_code == 200
    old_session = h.client.cookies["nanyee_session"]

    h.client.cookies.clear()
    started = await h.client.post("/api/v1/account/password-reset", json={"email": "A@qq.com"})
    assert started.status_code == 200, started.text
    assert started.json()["masked_email"] == "a*@qq.com"
    sent = h.mailer.codes[-1]
    assert sent["purpose"] == "reset"
    assert "student_a" in (sent["subject"] or "")

    wrong = await h.client.post(
        "/api/v1/account/password-reset/confirm",
        json={
            "challenge_id": started.json()["challenge_id"],
            "code": "000000" if sent["code"] != "000000" else "111111",
            "new_password": "brand-new-password",
        },
    )
    assert wrong.status_code == 422
    assert wrong.json()["error"]["details"]["attempts_remaining"] == 4

    reset = await h.client.post(
        "/api/v1/account/password-reset/confirm",
        json={
            "challenge_id": started.json()["challenge_id"],
            "code": sent["code"],
            "new_password": "brand-new-password",
        },
    )
    assert reset.status_code == 204, reset.text

    # 旧会话已失效
    h.client.cookies.set("nanyee_session", old_session)
    assert (await h.client.get("/api/v1/auth/me")).status_code == 401
    h.client.cookies.clear()

    old_login = await h.client.post(
        "/api/v1/auth/login", json={"username": "student_a", "password": "password-a-2026"}
    )
    assert old_login.status_code == 401
    new_login = await h.client.post(
        "/api/v1/auth/login", json={"username": "student_a", "password": "brand-new-password"}
    )
    assert new_login.status_code == 200

    # 验证码只能用一次
    replay = await h.client.post(
        "/api/v1/account/password-reset/confirm",
        json={
            "challenge_id": started.json()["challenge_id"],
            "code": sent["code"],
            "new_password": "another-password-1",
        },
    )
    assert replay.status_code == 422


@pytest.mark.asyncio
async def test_password_reset_does_not_reveal_unknown_email(harness: Harness) -> None:
    h = harness
    started = await h.client.post("/api/v1/account/password-reset", json={"email": "nobody@qq.com"})
    assert started.status_code == 200
    assert set(started.json()) == {"challenge_id", "expires_at", "resend_at", "masked_email"}
    assert h.mailer.codes == []
    attempt = await h.client.post(
        "/api/v1/account/password-reset/confirm",
        json={
            "challenge_id": started.json()["challenge_id"],
            "code": "123456",
            "new_password": "brand-new-password",
        },
    )
    assert attempt.status_code == 422
    assert attempt.json()["error"]["message"] == "验证码错误或已过期。"


@pytest.mark.asyncio
async def test_password_reset_code_invalid_after_email_changes(harness: Harness) -> None:
    h = harness
    await register(h.client, "student_a", "password-a-2026")
    assert (await bind_email(h, "a@qq.com")).status_code == 200
    started = await h.client.post("/api/v1/account/password-reset", json={"email": "a@qq.com"})
    code = h.mailer.last_code("a@qq.com")
    assert (await bind_email(h, "b@qq.com", password="password-a-2026")).status_code == 200

    reset = await h.client.post(
        "/api/v1/account/password-reset/confirm",
        json={
            "challenge_id": started.json()["challenge_id"],
            "code": code,
            "new_password": "brand-new-password",
        },
    )
    assert reset.status_code == 422
