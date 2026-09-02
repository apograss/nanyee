from __future__ import annotations

import httpx
import pytest
import respx
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.tools.course_selection import CourseItem


@pytest.mark.asyncio
@respx.mock
async def test_categories_and_courses_are_parsed_without_exposing_raw_html() -> None:
    respx.get("https://zhjw.smu.edu.cn/new/welcome.page?ui=new").mock(
        return_value=httpx.Response(200, text="welcome")
    )
    respx.get("https://zhjw.smu.edu.cn/new/student/xsxk/").mock(
        return_value=httpx.Response(
            200,
            text=('<a data-href="/new/student/xsxk/xklx/12" lay-iframe="公共选修课选课">入口</a>'),
        )
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    categories = await client.fetch_enrollment_categories(academic_cookies={"sid": "value"})

    assert [item.model_dump() for item in categories] == [{"code": "12", "title": "公共选修课选课"}]

    respx.post("https://zhjw.smu.edu.cn/new/student/xsxk/xklx/12/kxkc").mock(
        return_value=httpx.Response(
            200,
            json={
                "total": 1,
                "rows": [
                    {
                        "kcrwdm": "task-1",
                        "kcmc": "医学伦理",
                        "teaxm": "教师",
                        "jxbrs": 20,
                        "pkrs": 30,
                        "xf": 1.5,
                        "sksj": "周一",
                    }
                ],
            },
        )
    )
    courses = await client.fetch_enrollment_courses(
        academic_cookies={"sid": "value"}, category_code="12"
    )

    assert courses[0].task_code == "task-1"
    assert courses[0].selected_count == 20
    assert courses[0].capacity == 30
    assert courses[0].credits == 1.5


@pytest.mark.asyncio
@respx.mock
async def test_enrollment_is_single_submit_and_unknown_response_is_not_retried() -> None:
    course = CourseItem(task_code="task-1", name="医学伦理")
    route = respx.post("https://zhjw.smu.edu.cn/new/student/xsxk/xklx/12/add").mock(
        return_value=httpx.Response(200, json={"code": 0, "message": "成功"})
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    result = await client.enroll_course(
        academic_cookies={"sid": "value"},
        category_code="12",
        course=course,
    )

    assert result.success is True
    assert result.outcome == "enrolled"
    assert route.call_count == 1

    route.mock(side_effect=httpx.ReadTimeout("response lost"))
    with pytest.raises(AppError) as raised:
        await client.enroll_course(
            academic_cookies={"sid": "value"},
            category_code="12",
            course=course,
        )
    assert raised.value.code == ErrorCode.RESULT_UNKNOWN
    assert raised.value.retryable is False
    assert route.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_enrollment_conflict_confirmation_uses_hlct_one() -> None:
    course = CourseItem(task_code="task-1", name="医学伦理")
    route = respx.post("https://zhjw.smu.edu.cn/new/student/xsxk/xklx/12/add").mock(
        side_effect=[
            httpx.Response(200, json={"code": 1, "message": "与已选课程上课时间有冲突"}),
            httpx.Response(200, json={"code": 0, "message": "成功"}),
        ]
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    conflict = await client.enroll_course(
        academic_cookies={"sid": "value"}, category_code="12", course=course
    )
    confirmed = await client.enroll_course(
        academic_cookies={"sid": "value"},
        category_code="12",
        course=course,
        confirm_conflict=True,
    )

    assert conflict.outcome == "conflict"
    assert confirmed.success is True
    assert httpx.QueryParams(route.calls[0].request.content.decode())["hlct"] == "0"
    assert httpx.QueryParams(route.calls[1].request.content.decode())["hlct"] == "1"


@pytest.mark.asyncio
@respx.mock
async def test_enrollment_not_open_message_is_classified() -> None:
    # 2026-09 关闭期实测：提交返回 {"code":-1,"message":"当前不是选课时间"}
    course = CourseItem(task_code="task-1", name="医学伦理")
    respx.post("https://zhjw.smu.edu.cn/new/student/xsxk/xklx/12/add").mock(
        return_value=httpx.Response(200, json={"code": -1, "message": "当前不是选课时间"})
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    result = await client.enroll_course(
        academic_cookies={"sid": "value"}, category_code="12", course=course
    )

    assert result.success is False
    assert result.outcome == "not_open"


@pytest.mark.asyncio
@respx.mock
async def test_enrollment_categories_parses_xklxdm_layout_before_opening() -> None:
    # 2026-09 实测：未开放时 xsxk 首页 200 直出，入口为 xsxk.html?xklxdm=01 格式
    respx.get("https://zhjw.smu.edu.cn/new/welcome.page?ui=new").mock(
        return_value=httpx.Response(200, text="welcome")
    )
    respx.get("https://zhjw.smu.edu.cn/new/student/xsxk/").mock(
        return_value=httpx.Response(
            200,
            text=(
                '<div id="bb1" class="disabled" lay-tips="选课学期:2026-2027-1" '
                'lay-iframe="公共选修课" data-jzyl="0" '
                'data-href="/xsxk.html?xklxdm=01&mode=list&bp=/">'
                '<span class="title">公共选修课</span></div>'
            ),
        )
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    categories = await client.fetch_enrollment_categories(academic_cookies={"sid": "value"})

    assert [item.model_dump() for item in categories] == [{"code": "01", "title": "公共选修课"}]


@pytest.mark.asyncio
@respx.mock
async def test_enrollment_categories_reports_closed_instead_of_unavailable() -> None:
    # 选课未开放时正方会把 /new/student/xsxk/ 302 回首页，再跳欢迎页（2026-08 实测）
    respx.get("https://zhjw.smu.edu.cn/new/welcome.page?ui=new").mock(
        return_value=httpx.Response(200, text="welcome")
    )
    respx.get("https://zhjw.smu.edu.cn/new/student/xsxk/").mock(
        return_value=httpx.Response(302, headers={"location": "https://zhjw.smu.edu.cn/"})
    )
    respx.get("https://zhjw.smu.edu.cn/").mock(
        return_value=httpx.Response(
            302, headers={"location": "https://zhjw.smu.edu.cn/new/welcome.page"}
        )
    )
    respx.get("https://zhjw.smu.edu.cn/new/welcome.page").mock(
        return_value=httpx.Response(200, text="welcome")
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    with pytest.raises(AppError) as raised:
        await client.fetch_enrollment_categories(academic_cookies={"sid": "value"})

    assert raised.value.code == ErrorCode.NOT_FOUND
    assert "未开放" in raised.value.message
