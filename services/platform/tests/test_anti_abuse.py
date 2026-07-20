from __future__ import annotations

import json
from datetime import timedelta

import httpx
import pytest
from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.pass_token import AntiAbusePassSigner
from nanyee.anti_abuse.rate_limit import DatabaseRateLimiter, RateLimitPolicy
from nanyee.anti_abuse.turnstile import CloudflareTurnstileProvider
from nanyee.config import Settings
from nanyee.db.base import Base
from nanyee.errors import AppError, ErrorCode, app_error_handler
from nanyee.security import utc_now
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starlette.requests import Request


def turnstile_settings() -> Settings:
    return Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        turnstile_enabled=True,
        turnstile_site_key="1x00000000000000000000AA",
        turnstile_secret_key=SecretStr("1x0000000000000000000000000000000AA"),
        turnstile_expected_hostnames=["testserver"],
    )


@pytest.mark.asyncio
async def test_turnstile_validates_action_hostname_and_timestamp() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert b"secret=" in request.content
        assert b"response=token" in request.content
        return httpx.Response(
            200,
            json={
                "success": True,
                "challenge_ts": utc_now().isoformat(),
                "hostname": "testserver",
                "action": "login",
                "error-codes": [],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = CloudflareTurnstileProvider(turnstile_settings(), client)
        result = await provider.verify(
            token="token", remote_ip="127.0.0.1", expected_action="login"
        )
    assert result.valid


@pytest.mark.asyncio
async def test_turnstile_rejects_stale_or_mismatched_response() -> None:
    responses = [
        {
            "success": True,
            "challenge_ts": (utc_now() - timedelta(minutes=6)).isoformat(),
            "hostname": "testserver",
            "action": "login",
        },
        {
            "success": True,
            "challenge_ts": utc_now().isoformat(),
            "hostname": "evil.example",
            "action": "login",
        },
    ]

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=json.dumps(responses.pop(0)))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = CloudflareTurnstileProvider(turnstile_settings(), client)
        stale = await provider.verify(token="token-1", remote_ip=None, expected_action="login")
        mismatch = await provider.verify(token="token-2", remote_ip=None, expected_action="login")
    assert not stale.valid and stale.reason == "token_expired"
    assert not mismatch.valid and mismatch.reason == "hostname_mismatch"


def test_anti_abuse_pass_is_bound_and_tamper_evident() -> None:
    signer = AntiAbusePassSigner("s" * 32)
    token = signer.issue(action="login", subject="subject-a")
    assert signer.verify(token, action="login", subject="subject-a")
    assert not signer.verify(token, action="register", subject="subject-a")
    assert not signer.verify(token, action="login", subject="subject-b")
    assert not signer.verify(token + "x", action="login", subject="subject-a")


@pytest.mark.asyncio
async def test_downstream_error_returns_short_lived_anti_abuse_pass() -> None:
    request = Request({"type": "http", "method": "POST", "path": "/", "headers": []})
    request.state.anti_abuse_pass = "signed-pass"
    response = await app_error_handler(
        request,
        AppError(ErrorCode.INVALID_CREDENTIALS, "用户名或密码错误。", status_code=401),
    )
    body = json.loads(response.body)
    assert body["error"]["details"]["anti_abuse_pass"] == "signed-pass"
    assert body["error"]["details"]["anti_abuse_pass_expires_in"] == 300


@pytest.mark.asyncio
async def test_database_rate_limiter_has_soft_and_hard_thresholds() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    limiter = DatabaseRateLimiter()
    policy = RateLimitPolicy(window_seconds=60, soft_limit=2, hard_limit=4, verified_extra_limit=1)
    async with factory() as session:
        first = await limiter.hit(session, action="login", subject_digest="subject", policy=policy)
        second = await limiter.hit(session, action="login", subject_digest="subject", policy=policy)
        challenged = await limiter.hit(
            session, action="login", subject_digest="subject", policy=policy
        )
        verified = await limiter.hit(
            session,
            action="login",
            subject_digest="other",
            policy=RateLimitPolicy(60, 0, 2, 1),
            human_verified=True,
        )
        hard = await limiter.hit(
            session,
            action="login",
            subject_digest="subject",
            policy=policy,
            human_verified=True,
        )
        hard = await limiter.hit(
            session,
            action="login",
            subject_digest="subject",
            policy=policy,
            human_verified=True,
        )
    await engine.dispose()
    assert first.allowed and second.allowed
    assert challenged.challenge_required
    assert verified.allowed
    assert not hard.allowed and not hard.challenge_required


@pytest.mark.asyncio
async def test_disabled_turnstile_uses_hard_limit_without_impossible_challenge() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )
    settings = Settings(app_env="test", turnstile_enabled=False)
    policy = RateLimitPolicy(window_seconds=60, soft_limit=0, hard_limit=2)
    async with factory() as session:
        await AntiAbuseGate(settings).check(
            session, request, action="disabled", identity="one", policy=policy
        )
        await AntiAbuseGate(settings).check(
            session, request, action="disabled", identity="one", policy=policy
        )
        with pytest.raises(AppError) as raised:
            await AntiAbuseGate(settings).check(
                session, request, action="disabled", identity="one", policy=policy
            )
    assert raised.value.code == ErrorCode.RATE_LIMITED
    await engine.dispose()
