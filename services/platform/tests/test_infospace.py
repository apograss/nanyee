from __future__ import annotations

from datetime import date

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
from nanyee.integrations.infospace.sso import (
    AuthenticationRejected,
    CaptchaSolver,
    SsoAuthenticator,
)
from nanyee.tools.study_cabin import ReservationPayload


class FakeSolver:
    async def solve(self, image: bytes) -> str:
        return "2285"


class FakeDriver:
    def __init__(
        self,
        cookies: dict[str, str] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.cookies = cookies or {"ic-cookie": "cookie-value", "UNI_AUTH_JSESSIONID": "sess"}
        self.error = error
        self.calls: list[tuple[str, str]] = []

    async def acquire_session_cookies(
        self, account: str, password: str, solver: CaptchaSolver
    ) -> dict[str, str]:
        self.calls.append((account, password))
        if self.error is not None:
            raise self.error
        return dict(self.cookies)


def _mock_user_info(payload: dict[str, object]) -> respx.Route:
    return respx.get("https://infospace.smu.edu.cn/ic-web/auth/userInfo").mock(
        return_value=httpx.Response(200, json=payload)
    )


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
    client = InfospaceClient(Settings(app_env="test"), token="api-token")
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
    client = InfospaceClient(Settings(app_env="test"), token="expired-token")

    with pytest.raises(SessionExpired):
        await client.get_user_info()


@pytest.mark.asyncio
@respx.mock
async def test_sso_login_exchanges_cookies_for_api_token() -> None:
    route = _mock_user_info(
        {
            "code": 0,
            "data": {
                "token": "c3dc5187dd614945b107a4f4e2a6a80c",
                "accNo": 100233614,
                "trueName": "测试",
            },
        }
    )
    driver = FakeDriver()

    session = await SsoAuthenticator(Settings(app_env="test"), FakeSolver(), driver=driver).login(
        "student", "password"
    )

    assert driver.calls == [("student", "password")]
    assert session.token == "c3dc5187dd614945b107a4f4e2a6a80c"
    assert session.acc_no == "100233614"
    assert session.display_name == "测试"
    assert session.cookies == {"ic-cookie": "cookie-value", "UNI_AUTH_JSESSIONID": "sess"}
    request = route.calls[0].request
    assert "ic-cookie=cookie-value" in request.headers["cookie"]
    assert "token" not in request.headers


@pytest.mark.asyncio
@respx.mock
async def test_sso_login_wrong_password_is_rejected() -> None:
    driver = FakeDriver(error=AuthenticationRejected("用户名或密码错误"))

    with pytest.raises(AuthenticationRejected):
        await SsoAuthenticator(Settings(app_env="test"), FakeSolver(), driver=driver).login(
            "student", "wrong"
        )


@pytest.mark.asyncio
@respx.mock
async def test_sso_login_incomplete_user_info_is_unavailable() -> None:
    _mock_user_info({"code": 300, "message": "用户未登录", "data": None})

    with pytest.raises(UpstreamUnavailable):
        await SsoAuthenticator(Settings(app_env="test"), FakeSolver(), driver=FakeDriver()).login(
            "student", "password"
        )
