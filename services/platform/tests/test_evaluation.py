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
<div class="question" data-txdm="1" data-zbdm="quality">
  <h3>教学质量</h3>
  <div class="raty" data-wtxm='[
    {"zbxmdm":"excellent","fz":25,"dtjg":"非常满意"},
    {"zbxmdm":"good","fz":20,"dtjg":"满意"}
  ]'></div>
</div>
<div class="question" data-txdm="2" data-zbdm="attendance">
  <h3>是否按时上课</h3>
  <label><input type="radio" value="yes">是</label>
  <label><input type="radio" value="no">否</label>
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

    result = await client.submit_evaluation(
        academic_cookies={"sid": "value"},
        draft=draft,
        selections={"quality": "excellent", "attendance": "yes"},
    )

    assert result.submitted is True
    assert result.total_score == 25
    assert submit_route.call_count == 1
    form = httpx.QueryParams(submit_route.calls[0].request.content.decode())
    assert form["teadm"] == "teacher-1"
    assert form["dgksdm"] == "hour-1"
    assert [answer["zbxmdm"] for answer in json.loads(form["dt"])] == [
        "excellent",
        "yes",
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
