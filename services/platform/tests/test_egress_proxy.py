from __future__ import annotations

import httpx
import pytest
from nanyee.config import Settings
from nanyee.integrations.egress import EgressProxyTransport, egress_transport_from_settings
from pydantic import SecretStr, ValidationError

PROXY_URL = "https://nanyee-egress-proxy.example.workers.dev/"


def proxy_settings() -> Settings:
    return Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        school_egress_proxy_url=PROXY_URL,
        school_egress_proxy_token=SecretStr("egress-token"),
        _env_file=None,
    )


@pytest.mark.asyncio
async def test_transport_rewrites_request_and_restores_origin() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        captured["target"] = request.headers.get("x-proxy-target")
        captured["token"] = request.headers.get("x-proxy-token")
        captured["host_header"] = request.headers.get("host")
        captured["cookie"] = request.headers.get("cookie")
        captured["body"] = request.content
        return httpx.Response(200, json={"ok": True})

    transport = EgressProxyTransport(
        proxy_url=PROXY_URL,
        proxy_token="egress-token",
        inner=httpx.MockTransport(handler),
    )
    async with httpx.AsyncClient(transport=transport) as client:
        response = await client.post(
            "https://uis.smu.edu.cn/authserver/login",
            content=b"payload",
            headers={"Cookie": "JSESSIONID=abc"},
        )

    assert response.status_code == 200
    assert captured["url"] == PROXY_URL
    assert captured["method"] == "POST"
    assert captured["target"] == "https://uis.smu.edu.cn/authserver/login"
    assert captured["token"] == "egress-token"
    assert captured["host_header"] == "nanyee-egress-proxy.example.workers.dev"
    assert captured["cookie"] == "JSESSIONID=abc"
    assert captured["body"] == b"payload"
    # 回写原始请求：response.url 反映真实目标而非 Worker 地址（CookieJar / SSO 跳转依赖它）
    assert str(response.url) == "https://uis.smu.edu.cn/authserver/login"


def test_factory_returns_none_without_config() -> None:
    settings = Settings(app_env="test", database_url="sqlite+aiosqlite://", _env_file=None)
    assert egress_transport_from_settings(settings) is None


def test_factory_builds_transport_with_pair() -> None:
    assert egress_transport_from_settings(proxy_settings()) is not None


def test_config_rejects_unpaired_egress_url() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="test",
            database_url="sqlite+aiosqlite://",
            school_egress_proxy_url=PROXY_URL,
            _env_file=None,
        )


def test_config_rejects_unpaired_egress_token() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="test",
            database_url="sqlite+aiosqlite://",
            school_egress_proxy_token=SecretStr("egress-token"),
            _env_file=None,
        )


def test_config_rejects_via_without_proxy_url() -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="test",
            database_url="sqlite+aiosqlite://",
            school_egress_proxy_via="http://127.0.0.1:7897",
            _env_file=None,
        )


def test_factory_builds_transport_with_via() -> None:
    settings = Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        school_egress_proxy_url=PROXY_URL,
        school_egress_proxy_token=SecretStr("egress-token"),
        school_egress_proxy_via="http://127.0.0.1:7897",
        _env_file=None,
    )
    assert egress_transport_from_settings(settings) is not None
