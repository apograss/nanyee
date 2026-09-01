from __future__ import annotations

import json

import httpx
import pytest
import respx
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.tools.evaluation import EvaluationReference

EVALUATION_HTML = """
<html><body>
<script>
entss.post('/new/student/ktpj/savePj', {
  xnxqdm:'202501', pjlxdm:'6', teadm:'teacher-1', teaxm:'张老师',
  wjdm:'questionnaire-1', kcrwdm:'task-1', kcptdm:'platform-1',
  kcdm:'医学伦理', jxhjdm:'lecture'
});
</script>
<div class="question" data-sfbt="1" data-txdm="5" data-zbdm="quality">
  <h3><span class="tmxh">1</span>、教学质量<span class="zbsx">(25.0分) *</span></h3>
  <div id="quality" class='raty pjzb' data-fz="25.0" data-wtxm='[
    {"fdxzb":"","fzbl":100.0,"wdtbt":"0","zbxmbh":"A","zbxmdm":"worst","zbxmmc":"非常不满意"},
    {"fdxzb":"","fzbl":80.0,"wdtbt":"0","zbxmbh":"B","zbxmdm":"bad","zbxmmc":"比较不满意"},
    {"fdxzb":"","fzbl":60.0,"wdtbt":"0","zbxmbh":"C","zbxmdm":"average","zbxmmc":"一般"},
    {"fdxzb":"","fzbl":40.0,"wdtbt":"0","zbxmbh":"D","zbxmdm":"good","zbxmmc":"比较满意"},
    {"fdxzb":"","fzbl":20.0,"wdtbt":"0","zbxmbh":"E","zbxmdm":"excellent","zbxmmc":"非常满意"}
  ]'></div>
</div>
<div class="question" data-sfbt="1" data-txdm="1" data-zbdm="attendance">
  <h3><span class="tmxh">2</span>、是否按时上课<span class="zbsx">(0.0分) *</span></h3>
  <input id="yes" type="radio" class="radio pjzb" name="attendance" value="yes"
         data-fz="0.0" data-mc="是"/>
  <input id="no" type="radio" class="radio pjzb" name="attendance" value="no"
         data-fz="0.0" data-mc="否"/>
</div>
</body></html>
"""


@pytest.mark.asyncio
@respx.mock
async def test_pending_evaluations_are_filtered_and_deduplicated() -> None:
    route = respx.post("https://zhjw.smu.edu.cn/new/student/ktpj/xsktpjData").mock(
        return_value=httpx.Response(
            200,
            json={
                "rows": [
                    {
                        "pjdm": "",
                        "teadm": "teacher-1",
                        "dgksdm": "hour-1",
                        "ktpj": "questionnaire-1",
                        "teaxm": "张老师",
                        "kcmc": "医学伦理",
                        "jsrq": "2026-07-20",
                    },
                    {
                        "pjdm": "completed",
                        "teadm": "teacher-2",
                        "dgksdm": "hour-2",
                        "ktpj": "questionnaire-2",
                    },
                ]
            },
        )
    )
    client = SmuAcademicClient(Settings(app_env="test"))

    pending = await client.fetch_pending_evaluations(academic_cookies={"sid": "value"})

    assert route.call_count == 2
    assert len(pending) == 1
    assert pending[0].teacher_name == "张老师"
    assert pending[0].questionnaire_code == "questionnaire-1"


@pytest.mark.asyncio
@respx.mock
async def test_evaluation_draft_is_typed_and_submit_is_single_attempt() -> None:
    reference = EvaluationReference(
        teacher_code="teacher-1",
        class_hour_code="hour-1",
        questionnaire_code="questionnaire-1",
    )
    respx.get("https://zhjw.smu.edu.cn/new/student/ktpj/showXsktpjwj.page").mock(
        return_value=httpx.Response(200, text=EVALUATION_HTML)
    )
    submit_route = respx.post("https://zhjw.smu.edu.cn/new/student/ktpj/savePj").mock(
        return_value=httpx.Response(200, json={"code": 0, "message": "保存成功"})
    )
    client = SmuAcademicClient(Settings(app_env="test"))
    draft = await client.fetch_evaluation_draft(
        academic_cookies={"sid": "value"}, reference=reference
    )

    assert draft.teacher_name == "张老师"
    assert draft.course_name == "医学伦理"
    assert set(draft.hidden_fields) == {
        "xnxqdm",
        "pjlxdm",
        "teaxm",
        "kcrwdm",
        "kcptdm",
        "kcdm",
        "jxhjdm",
    }
    assert [question.indicator_code for question in draft.questions] == [
        "quality",
        "attendance",
    ]
    # 星星题分值 = 题目满分(data-fz=25) / 选项数(5) × 星级，与学校 pj.js 口径一致
    rating = draft.questions[0]
    assert [option.score for option in rating.options] == [5, 10, 15, 20, 25]
    assert [option.label for option in rating.options] == [
        "非常不满意",
        "比较不满意",
        "一般",
        "比较满意",
        "非常满意",
    ]
    # 单选题 label 取 input 的 data-mc，不得回退成数字代码
    attendance = draft.questions[1]
    assert [(option.code, option.score, option.label) for option in attendance.options] == [
        ("yes", 0, "是"),
        ("no", 0, "否"),
    ]

    result = await client.submit_evaluation(
        academic_cookies={"sid": "value"},
        draft=draft,
        selections={"quality": "excellent", "attendance": "no"},
    )

    assert result.submitted is True
    assert result.total_score == 25
    assert submit_route.call_count == 1
    form = httpx.QueryParams(submit_route.calls[0].request.content.decode())
    assert form["teadm"] == "teacher-1"
    assert form["dgksdm"] == "hour-1"
    assert form["wtpf"] == "25"
    answers = json.loads(form["dt"])
    assert [answer["zbxmdm"] for answer in answers] == ["excellent", "no"]
    # 星星题的 dtjg 与学校页面（pj.js）一致：星级串 ★×N，而非文字
    assert [(answer["fz"], answer["dtjg"]) for answer in answers] == [
        (25, "★★★★★"),
        (0, "否"),
    ]

    submit_route.mock(side_effect=httpx.ReadTimeout("response lost"))
    with pytest.raises(AppError) as raised:
        await client.submit_evaluation(
            academic_cookies={"sid": "value"},
            draft=draft,
            selections={"quality": "good", "attendance": "no"},
        )
    assert raised.value.code == ErrorCode.RESULT_UNKNOWN
    assert raised.value.retryable is False
    assert submit_route.call_count == 2


@pytest.mark.asyncio
async def test_evaluation_rejects_incomplete_or_unknown_choices() -> None:
    reference = EvaluationReference(
        teacher_code="teacher-1",
        class_hour_code="hour-1",
        questionnaire_code="questionnaire-1",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=EVALUATION_HTML)

    client = SmuAcademicClient(Settings(app_env="test"), transport=httpx.MockTransport(handler))
    draft = await client.fetch_evaluation_draft(
        academic_cookies={"sid": "value"}, reference=reference
    )

    with pytest.raises(AppError) as incomplete:
        await client.submit_evaluation(
            academic_cookies={"sid": "value"},
            draft=draft,
            selections={"quality": "excellent"},
        )
    assert incomplete.value.code == ErrorCode.INVALID_REQUEST

    with pytest.raises(AppError) as unknown:
        await client.submit_evaluation(
            academic_cookies={"sid": "value"},
            draft=draft,
            selections={"quality": "invalid", "attendance": "yes"},
        )
    assert unknown.value.code == ErrorCode.INVALID_REQUEST


@pytest.mark.asyncio
@respx.mock
async def test_evaluation_draft_request_sends_referer_for_anti_deeplink() -> None:
    reference = EvaluationReference(
        teacher_code="teacher-1",
        class_hour_code="hour-1",
        questionnaire_code="questionnaire-1",
    )
    route = respx.get("https://zhjw.smu.edu.cn/new/student/ktpj/showXsktpjwj.page").mock(
        return_value=httpx.Response(200, text=EVALUATION_HTML)
    )
    client = SmuAcademicClient(Settings(app_env="test"))
    await client.fetch_evaluation_draft(academic_cookies={"sid": "value"}, reference=reference)

    # 正方对该页做 Referer 防深链校验，缺失会 302 回首页导致 UPSTREAM_UNAVAILABLE
    assert route.calls[0].request.headers["referer"] == "https://zhjw.smu.edu.cn/new/student/ktpj"

    route.mock(return_value=httpx.Response(302, headers={"location": "https://zhjw.smu.edu.cn/"}))
    with pytest.raises(AppError) as raised:
        await client.fetch_evaluation_draft(academic_cookies={"sid": "value"}, reference=reference)
    assert raised.value.code == ErrorCode.UPSTREAM_UNAVAILABLE
