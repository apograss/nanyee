from __future__ import annotations

import json

import httpx
import pytest
from fastapi import FastAPI
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.registration.mailer import CloudmailVerificationMailer, SmtpVerificationMailer
from nanyee.registration.router import get_mailer
from pydantic import SecretStr
from starlette.requests import Request

GATEWAY_URL = "https://cloudmail.apograss.workers.dev"


def cloudmail_settings() -> Settings:
    return Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        cloudmail_gateway_url=GATEWAY_URL,
        cloudmail_gateway_token=SecretStr("gateway-token"),
    )


def request_with_settings(settings: Settings) -> Request:
    app = FastAPI()
    app.state.settings = settings
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "app": app})


@pytest.mark.asyncio
async def test_cloudmail_mailer_posts_verification_email() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["Authorization"]
        captured["gateway_token"] = request.headers["X-Gateway-Token"]
        captured["content_type"] = request.headers["Content-Type"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        mailer = CloudmailVerificationMailer(cloudmail_settings(), client)
        await mailer.send_registration_code(recipient="student@smu.edu.cn", code="123456")

    assert captured["url"] == f"{GATEWAY_URL}/api/gateway/verification-email"
    assert captured["authorization"] == "Bearer gateway-token"
    assert captured["gateway_token"] == "gateway-token"
    assert captured["content_type"] == "application/json"
    assert captured["body"] == {
        "to": "student@smu.edu.cn",
        "code": "123456",
        "purpose": "register",
        "subject": "[nanyee.de] 注册验证码: 123456",
    }


@pytest.mark.asyncio
async def test_cloudmail_mailer_maps_gateway_errors_to_retryable_upstream_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, json={"error": "bad gateway"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        mailer = CloudmailVerificationMailer(cloudmail_settings(), client)
        with pytest.raises(AppError) as raised:
            await mailer.send_registration_code(recipient="student@smu.edu.cn", code="123456")
    assert raised.value.code == ErrorCode.UPSTREAM_UNAVAILABLE
    assert raised.value.status_code == 503
    assert raised.value.retryable


@pytest.mark.asyncio
async def test_cloudmail_mailer_maps_network_errors_to_retryable_upstream_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        mailer = CloudmailVerificationMailer(cloudmail_settings(), client)
        with pytest.raises(AppError) as raised:
            await mailer.send_registration_code(recipient="student@smu.edu.cn", code="123456")
    assert raised.value.code == ErrorCode.UPSTREAM_UNAVAILABLE
    assert raised.value.status_code == 503
    assert raised.value.retryable


@pytest.mark.asyncio
async def test_cloudmail_mailer_requires_gateway_configuration() -> None:
    settings = Settings(app_env="test", database_url="sqlite+aiosqlite://", _env_file=None)
    mailer = CloudmailVerificationMailer(settings)
    with pytest.raises(AppError) as raised:
        await mailer.send_registration_code(recipient="student@smu.edu.cn", code="123456")
    assert raised.value.code == ErrorCode.UPSTREAM_UNAVAILABLE
    assert raised.value.status_code == 503
    assert raised.value.retryable


def test_get_mailer_prefers_cloudmail_gateway_when_configured() -> None:
    mailer = get_mailer(request_with_settings(cloudmail_settings()))
    assert isinstance(mailer, CloudmailVerificationMailer)


def test_get_mailer_falls_back_to_smtp_without_cloudmail_configuration() -> None:
    settings = Settings(app_env="test", database_url="sqlite+aiosqlite://", _env_file=None)
    mailer = get_mailer(request_with_settings(settings))
    assert isinstance(mailer, SmtpVerificationMailer)


def test_get_mailer_respects_app_state_override() -> None:
    settings = Settings(app_env="test", database_url="sqlite+aiosqlite://", _env_file=None)
    override = SmtpVerificationMailer(settings)
    request = request_with_settings(cloudmail_settings())
    request.app.state.verification_mailer = override
    assert get_mailer(request) is override
