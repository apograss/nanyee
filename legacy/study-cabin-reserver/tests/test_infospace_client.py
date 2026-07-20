from datetime import date

import httpx
import pytest
import respx

from smu_reserver.infospace import InfospaceClient, SessionExpired, SubmissionUnknown
from smu_reserver.reservation import ReservationPayload


@pytest.mark.asyncio
@respx.mock
async def test_get_user_info_uses_cookie_and_extracts_token() -> None:
    route = respx.get("https://infospace.example/ic-web/auth/userInfo").mock(
        return_value=httpx.Response(
            200,
            json={
                "code": 0,
                "message": "查询成功",
                "data": {"accNo": "student", "logonName": "测试用户", "token": "api-token"},
            },
        )
    )
    client = InfospaceClient("https://infospace.example/ic-web/", cookie="cookie-value")

    user = await client.get_user_info()

    assert user.acc_no == "student"
    assert user.token == "api-token"
    assert route.calls[0].request.headers["cookie"] == "cookie-value"
    assert route.calls[0].request.headers["lan"] == "1"


@pytest.mark.asyncio
@respx.mock
async def test_list_rooms_sends_target_date_kind_and_token() -> None:
    route = respx.get("https://infospace.example/ic-web/reserve").mock(
        return_value=httpx.Response(
            200,
            json={
                "code": 0,
                "message": "查询成功",
                "data": [
                    {
                        "devId": 20,
                        "devName": "东侧学习舱1",
                        "openStart": "08:00",
                        "openEnd": "22:50",
                        "resvInfo": [],
                        "cls": [],
                        "resvRule": {"freezingTime": 0},
                    }
                ],
            },
        )
    )
    client = InfospaceClient(
        "https://infospace.example/ic-web/", cookie="cookie-value", token="api-token"
    )

    rooms = await client.list_rooms(date(2026, 7, 20), kind_id=29816776)

    assert rooms[0].dev_id == 20
    assert route.calls[0].request.url.params["resvDates"] == "20260720"
    assert route.calls[0].request.url.params["kindIds"] == "29816776"
    assert route.calls[0].request.headers["token"] == "api-token"


@pytest.mark.asyncio
@respx.mock
async def test_business_code_300_raises_session_expired() -> None:
    respx.get("https://infospace.example/ic-web/roomMenu").mock(
        return_value=httpx.Response(200, json={"code": 300, "message": "登录超时"})
    )
    client = InfospaceClient("https://infospace.example/ic-web/", cookie="expired")

    with pytest.raises(SessionExpired):
        await client.list_room_kinds()


@pytest.mark.asyncio
@respx.mock
async def test_submit_reservation_posts_exact_json_payload() -> None:
    route = respx.post("https://infospace.example/ic-web/reserve").mock(
        return_value=httpx.Response(200, json={"code": 0, "message": "预约成功", "data": {}})
    )
    client = InfospaceClient(
        "https://infospace.example/ic-web/", cookie="cookie", token="api-token"
    )
    payload = ReservationPayload(
        account="student",
        start="2026-07-20 09:00:00",
        end="2026-07-20 11:00:00",
        title="学习",
        dev_id=20,
    )

    await client.reserve(payload)

    body = route.calls[0].request.read().decode()
    assert '"resvDev":[20]' in body
    assert '"resvBeginTime":"2026-07-20 09:00:00"' in body
    assert route.calls[0].request.headers["content-type"] == "application/json"


@pytest.mark.asyncio
@respx.mock
async def test_submit_timeout_is_classified_as_unknown_instead_of_retried() -> None:
    respx.post("https://infospace.example/ic-web/reserve").mock(
        side_effect=httpx.ReadTimeout("response lost")
    )
    client = InfospaceClient(
        "https://infospace.example/ic-web/", cookie="cookie", token="api-token"
    )
    payload = ReservationPayload(
        account="student",
        start="2026-07-20 09:00:00",
        end="2026-07-20 11:00:00",
        title="学习",
        dev_id=20,
    )

    with pytest.raises(SubmissionUnknown):
        await client.reserve(payload)
