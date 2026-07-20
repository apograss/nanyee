from __future__ import annotations

import hashlib

import httpx
import pytest
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.transient import TransientSecretStore


@pytest.mark.asyncio
async def test_smu_login_keeps_cookies_server_side_and_restricts_redirects() -> None:
    seen_login = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal seen_login
        if request.url.path == "/imageServlet.do":
            return httpx.Response(
                200,
                content=b"captcha-bytes",
                headers={
                    "content-type": "image/jpeg",
                    "set-cookie": "UISID=uis-cookie; Path=/; HttpOnly",
                },
            )
        if request.url.path == "/login/login.do":
            seen_login = True
            expected = hashlib.md5(b"school-password", usedforsecurity=False).hexdigest()
            assert expected.encode() in request.content
            assert b"school-password" not in request.content
            assert "UISID=uis-cookie" in request.headers.get("cookie", "")
            return httpx.Response(200, json={"ticket": "ticket-value"})
        if request.url.path == "/new/ssoLogin":
            assert request.url.params["ticket"] == "ticket-value"
            return httpx.Response(
                302,
                headers={
                    "location": "/new/home",
                    "set-cookie": "ACADEMIC=one; Path=/; HttpOnly",
                },
            )
        if request.url.path == "/new/home":
            return httpx.Response(
                200,
                headers={"set-cookie": "ROUTE=two; Path=/; HttpOnly"},
                text="ok",
            )
        if request.url.path == "/new/student/xsgrkb/main.page":
            return httpx.Response(200, text='<a href="?xnxqdm=202501">semester</a>')
        if request.url.path == "/new/student/xsgrkb/getCalendarWeekDatas":
            form = httpx.QueryParams(request.content.decode())
            week = int(form["zc"])
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "kcmc": "课程甲",
                            "jxcdmc": "教室101",
                            "jxhjmc": "理论",
                            "teaxms": "张老师",
                            "xq": 1,
                            "xs": "2",
                            "qssj": "08:00:00",
                            "jssj": "09:25:00",
                            "ps": 1,
                            "pe": 2,
                            "zc": week,
                        }
                    ]
                },
            )
        if request.url.path == "/new/student/xskccj/kccjList.page":
            return httpx.Response(200, text="grades page")
        if request.url.path == "/new/student/xskccj/kccjDatas":
            assert b"source=kccjlist" in request.content
            return httpx.Response(
                200,
                json={
                    "rows": [
                        {
                            "kcmc": "课程甲",
                            "zcj": "90",
                            "zcjfs": 90,
                            "cjjd": 4,
                            "xf": 2,
                            "xdfsmc": "必修",
                        }
                    ]
                },
            )
        raise AssertionError(f"unexpected request: {request.url}")

    client = SmuAcademicClient(Settings(app_env="test"), transport=httpx.MockTransport(handler))
    captcha = await client.fetch_captcha()
    assert captcha.image == b"captcha-bytes"
    assert captcha.cookies == {"UISID": "uis-cookie"}
    cookies = await client.authenticate(
        account="20260001",
        password="school-password",
        captcha="ABCD",
        uis_cookies=captcha.cookies,
    )
    assert seen_login
    assert cookies == {"ACADEMIC": "one", "ROUTE": "two"}
    semester, events = await client.fetch_timetable(academic_cookies=cookies, total_weeks=2)
    assert semester == "202501"
    assert [item.week for item in events] == [1, 2]
    grades = await client.fetch_grades(academic_cookies=cookies)
    assert grades[0].name == "课程甲"
    assert grades[0].grade_point == 4


@pytest.mark.asyncio
async def test_smu_sso_rejects_external_redirect() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/login/login.do":
            return httpx.Response(200, json={"ticket": "ticket-value"})
        return httpx.Response(302, headers={"location": "https://evil.example/steal"})

    client = SmuAcademicClient(Settings(app_env="test"), transport=httpx.MockTransport(handler))
    with pytest.raises(AppError) as error:
        await client.authenticate(
            account="20260001",
            password="school-password",
            captcha="ABCD",
            uis_cookies={"UISID": "value"},
        )
    assert error.value.code == ErrorCode.UPSTREAM_UNAVAILABLE


@pytest.mark.asyncio
async def test_transient_store_is_typed_and_one_time_capable() -> None:
    store = TransientSecretStore(ttl_seconds=60, max_entries=10)
    key, _ = await store.put(b"secret", kind="captcha")
    assert await store.get(key, kind="academic") is None
    assert await store.get(key, kind="captcha") == b"secret"
    assert await store.take(key, kind="captcha") == b"secret"
    assert await store.get(key, kind="captcha") is None
    await store.close()
