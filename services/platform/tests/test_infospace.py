from __future__ import annotations

from datetime import date
from urllib.parse import quote

import httpx
import pytest
import respx
from nanyee.config import Settings
from nanyee.integrations.infospace.client import (
    InfospaceClient,
    SessionExpired,
    SubmissionUnknown,
    UpstreamUnavailable,
)
from nanyee.integrations.infospace.sso import SsoAuthenticator
from nanyee.tools.study_cabin import ReservationPayload


class FakeSolver:
    async def solve(self, image: bytes) -> str:
        assert image == b"captcha-image"
        return "1234"


@pytest.mark.asyncio
@respx.mock
async def test_infospace_parses_rooms_and_does_not_retry_unknown_submission() -> None:
    respx.get("https://infospace.smu.edu.cn/ic-web/reserve").mock(
        return_value=httpx.Response(
            200,
            json={
                "code": 0,
                "data": [
                    {
                        "devId": 29817269,
                        "devName": "西侧学习舱1",
                        "openStart": "08:00",
                        "openEnd": "22:50",
                        "resvRule": {"freezingTime": 10},
                        "resvInfo": [
                            {
                                "resvStatus": 1,
                                "startTime": "2026-07-22 12:00",
                                "endTime": "2026-07-22 13:00",
                            }
                        ],
                    }
                ],
            },
        )
    )
    client = InfospaceClient(Settings(app_env="test"), cookies={"ic-cookie": "session"})
    rooms = await client.list_rooms(date(2026, 7, 22), kind_id=29816776)

    assert rooms[0].dev_id == 29817269
    assert rooms[0].freezing_minutes == 10
    assert rooms[0].blocks[0].start.hour == 12

    respx.post("https://infospace.smu.edu.cn/ic-web/reserve").mock(
        side_effect=httpx.ReadTimeout("response lost")
    )
    with pytest.raises(SubmissionUnknown):
        await client.reserve(
            ReservationPayload(
                account="student",
                start="2026-07-22 09:00:00",
                end="2026-07-22 11:00:00",
                title="学习",
                dev_id=29817269,
            )
        )


@pytest.mark.asyncio
@respx.mock
async def test_infospace_redirect_is_classified_as_expired_session() -> None:
    respx.get("https://infospace.smu.edu.cn/ic-web/auth/userInfo").mock(
        return_value=httpx.Response(302, headers={"Location": "https://uis.smu.edu.cn/login.jsp"})
    )
    client = InfospaceClient(Settings(app_env="test"), cookies={"ic-cookie": "expired"})

    with pytest.raises(SessionExpired):
        await client.get_user_info()


@pytest.mark.asyncio
@respx.mock
async def test_sso_login_uses_infospace_app_id_and_returns_only_cookies() -> None:
    service = "https://infospace.smu.edu.cn/ic-web/authcenter/callback"
    start = respx.get("https://infospace.smu.edu.cn/ic-web/authcenter/toLoginPage").mock(
        return_value=httpx.Response(
            302,
            headers={"Location": f"https://uis.smu.edu.cn/login.jsp?service={quote(service)}"},
        )
    )
    respx.get("https://uis.smu.edu.cn/login.jsp").mock(return_value=httpx.Response(200))
    respx.get("https://uis.smu.edu.cn/imageServlet.do").mock(
        return_value=httpx.Response(200, content=b"captcha-image")
    )

    def login_response(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        assert "appid=3458975" in body
        assert "password=5f4dcc3b5aa765d61d8327deb882cf99" in body
        return httpx.Response(200, json={"ticket": "ticket-value"})

    respx.post("https://uis.smu.edu.cn/login/login.do").mock(side_effect=login_response)
    respx.get(service).mock(
        return_value=httpx.Response(
            200,
            headers={"Set-Cookie": "ic-cookie=session-value; Path=/; HttpOnly"},
        )
    )

    cookies = await SsoAuthenticator(Settings(app_env="test"), FakeSolver()).login(
        "student", "password"
    )

    assert start.called
    assert cookies == {"ic-cookie": "session-value"}


@pytest.mark.asyncio
@respx.mock
async def test_sso_rejects_redirect_to_untrusted_host() -> None:
    respx.get("https://infospace.smu.edu.cn/ic-web/authcenter/toLoginPage").mock(
        return_value=httpx.Response(302, headers={"Location": "https://evil.example/login"})
    )

    with pytest.raises(UpstreamUnavailable, match="untrusted URL"):
        await SsoAuthenticator(Settings(app_env="test"), FakeSolver()).login("student", "password")
