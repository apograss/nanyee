from __future__ import annotations

import hashlib
from datetime import UTC, datetime

import httpx
import pytest
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.smu.client import SmuAcademicClient, parse_academic_cookie_header
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
                            "cjdm": "grade-1",
                        }
                    ]
                },
            )
        if request.url.path == "/new/student/xskccj/kccjfxd.page":
            assert request.url.params["cjdm"] == "grade-1"
            return httpx.Response(
                200,
                text="""
                <table>
                  <tr><td>课程</td><td>课程甲</td><td>1</td><td>2</td><td>3</td>
                    <td>4</td><td>5</td><td>15</td><td>2</td></tr>
                  <tr><td>教学班</td><td>一班</td><td>0</td><td>1</td><td>2</td>
                    <td>3</td><td>4</td><td>10</td><td>1</td></tr>
                </table>
                """,
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
    assert grades[0].ranking is not None
    assert grades[0].ranking.course_rank == 2
    assert grades[0].ranking.class_rank == 1


@pytest.mark.asyncio
async def test_fetch_timetable_supports_semester_selection_and_numeric_credit_hours() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/new/student/xsgrkb/main.page":
            return httpx.Response(200, text='<a href="?xnxqdm=202501">semester</a>')
        if request.url.path == "/new/student/xsgrkb/week.page":
            return httpx.Response(
                200,
                text=(
                    "<select id='xnxqdm' name='xnxqdm'>"
                    "<option value=202601>2026-2027-1</option>"
                    "<option value=202502 selected>2025-2026-2</option>"
                    "<option value=202501>2025-2026-1</option>"
                    "</select>"
                ),
            )
        if request.url.path == "/new/student/xsgrkb/getCalendarWeekDatas":
            form = httpx.QueryParams(request.content.decode())
            assert form["xnxqdm"] == "202502"
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
                            # 上游实际返回数字而非字符串（2026-08 实测）
                            "xs": 2,
                            "qssj": "08:00:00",
                            "jssj": "09:25:00",
                            "ps": "01",
                            "pe": "02",
                            "zc": int(form["zc"]),
                        }
                    ]
                },
            )
        raise AssertionError(f"unexpected request: {request.url}")

    client = SmuAcademicClient(Settings(app_env="test"), transport=httpx.MockTransport(handler))
    semester, events = await client.fetch_timetable(
        academic_cookies={"JSESSIONID": "x"}, total_weeks=2, semester_code="202502"
    )
    assert semester == "202502"
    assert [item.credit_hours for item in events] == ["2", "2"]
    default, semesters = await client.list_semesters(academic_cookies={"JSESSIONID": "x"})
    assert default == "202501"
    assert [item.code for item in semesters] == ["202601", "202502", "202501"]
    assert semesters[0].label == "2026-2027-1"


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


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Cookie: JSESSIONID=abc; ROUTE=two", {"JSESSIONID": "abc", "ROUTE": "two"}),
        ("just-the-session-id", {"JSESSIONID": "just-the-session-id"}),
    ],
)
def test_academic_cookie_header_parser_accepts_browser_and_session_id_formats(
    raw: str, expected: dict[str, str]
) -> None:
    assert parse_academic_cookie_header(raw) == expected


@pytest.mark.parametrize("raw", ["", "Cookie:", "invalid", "name=\x01bad"])
def test_academic_cookie_header_parser_rejects_invalid_values(raw: str) -> None:
    if raw == "invalid":
        assert parse_academic_cookie_header(raw) == {"JSESSIONID": "invalid"}
        return
    with pytest.raises(ValueError):
        parse_academic_cookie_header(raw)


@pytest.mark.asyncio
async def test_copied_academic_cookie_is_validated_and_refreshed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["cookie"] == "JSESSIONID=old"
        return httpx.Response(
            200,
            text="欢迎使用教务系统",
            headers={"set-cookie": "JSESSIONID=new; Path=/; HttpOnly"},
        )

    client = SmuAcademicClient(Settings(app_env="test"), transport=httpx.MockTransport(handler))
    cookies = await client.validate_academic_session(academic_cookies={"JSESSIONID": "old"})

    assert cookies == {"JSESSIONID": "new"}


@pytest.mark.asyncio
async def test_transient_store_is_typed_and_one_time_capable() -> None:
    store = TransientSecretStore(ttl_seconds=60, max_entries=10)
    key, expires_at = await store.put(b"secret", kind="captcha", ttl_seconds=24 * 60 * 60)
    assert (expires_at - datetime.now(UTC)).total_seconds() > 23 * 60 * 60
    assert await store.get(key, kind="academic") is None
    assert await store.get(key, kind="captcha") == b"secret"
    assert await store.take(key, kind="captcha") == b"secret"
    assert await store.get(key, kind="captcha") is None
    await store.close()
