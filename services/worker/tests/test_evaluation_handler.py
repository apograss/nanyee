from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

import pytest
from nanyee.config import Settings
from nanyee.credentials.service import CredentialVaultService
from nanyee.errors import AppError, ErrorCode
from nanyee.integrations.smu.client import CaptchaData
from nanyee.jobs.models import Job
from nanyee.tools.evaluation import (
    EvaluationDraft,
    EvaluationOption,
    EvaluationQuestion,
    EvaluationReference,
    EvaluationResult,
    PendingEvaluation,
)
from nanyee_worker.evaluation import EvaluationHandler
from nanyee_worker.study_cabin import DdddOcrSolver


class FakeVault:
    async def decrypt_for_worker(self, *_args: object, **_kwargs: object) -> bytes:
        return json.dumps({"account": "student", "password": "password"}).encode()


class FakeSolver:
    async def solve(self, _image: bytes) -> str:
        return "1234"


class FlakyAcademicClient:
    def __init__(self) -> None:
        self.calls = 0

    async def fetch_captcha(self) -> CaptchaData:
        return CaptchaData(image=b"captcha", content_type="image/png", cookies={"sid": "v"})

    async def authenticate(self, **_kwargs: object) -> dict[str, str]:
        self.calls += 1
        if self.calls < 5:
            raise AppError(
                ErrorCode.INVALID_CREDENTIALS,
                "验证码错误。",
                status_code=401,
            )
        return {"academic": "session"}


class SuccessfulAcademicClient:
    def __init__(self) -> None:
        self.submitted: list[dict[str, str]] = []

    async def fetch_captcha(self) -> CaptchaData:
        return CaptchaData(image=b"captcha", content_type="image/png", cookies={"sid": "v"})

    async def authenticate(self, **kwargs: object) -> dict[str, str]:
        assert kwargs["account"] == "student"
        assert kwargs["password"] == "password"
        return {"academic": "session"}

    async def fetch_pending_evaluations(self, **_kwargs: object) -> list[PendingEvaluation]:
        return [
            PendingEvaluation(
                teacher_code="teacher",
                class_hour_code="hour",
                questionnaire_code="questionnaire",
                teacher_name="老师",
                course_name="课程",
            )
        ]

    async def fetch_evaluation_draft(
        self, *, reference: EvaluationReference, **_kwargs: object
    ) -> EvaluationDraft:
        return EvaluationDraft(
            reference=reference,
            teacher_name="老师",
            course_name="课程",
            hidden_fields={},
            questions=[
                EvaluationQuestion(
                    type_code=1,
                    indicator_code="quality",
                    title="教学质量",
                    options=[
                        EvaluationOption(code="excellent", score=25, label="非常满意"),
                        EvaluationOption(code="good", score=20, label="满意"),
                        EvaluationOption(code="normal", score=15, label="一般"),
                    ],
                ),
                EvaluationQuestion(
                    type_code=2,
                    indicator_code="late",
                    title="是否迟到",
                    options=[
                        EvaluationOption(code="yes", label="是"),
                        EvaluationOption(code="no", label="否"),
                    ],
                ),
            ],
        )

    async def submit_evaluation(
        self, *, selections: dict[str, str], **_kwargs: object
    ) -> EvaluationResult:
        self.submitted.append(selections)
        return EvaluationResult(
            submitted=True,
            teacher_name="老师",
            course_name="课程",
            total_score=25,
        )


def build_job() -> Job:
    return Job(
        id=uuid4(),
        user_id=uuid4(),
        credential_id=uuid4(),
        tool_id="evaluation",
        operation="submit",
        payload={"strategy": "legacy_positive_random", "max_courses": 60},
        request_digest="digest",
        idempotency_key="evaluation-handler-test",
        confirmation_version="evaluation:submit:v1",
        scheduled_for=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_evaluation_login_keeps_retrying_ocr_failures(monkeypatch: Any) -> None:
    import nanyee_worker.evaluation as module

    delays: list[float] = []

    async def no_wait(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr(module.asyncio, "sleep", no_wait)
    handler = EvaluationHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        cast(DdddOcrSolver, FakeSolver()),
    )
    client = FlakyAcademicClient()
    handler._client = cast(Any, client)

    cookies = await handler._login_with_backoff("student", "password")

    assert cookies == {"academic": "session"}
    assert client.calls == 5
    assert delays == [1, 2, 4, 8]


@pytest.mark.asyncio
async def test_evaluation_login_stops_on_bad_credentials() -> None:
    class BadCredentialsClient:
        async def fetch_captcha(self) -> CaptchaData:
            return CaptchaData(image=b"captcha", content_type="image/png", cookies={"sid": "v"})

        async def authenticate(self, **_kwargs: object) -> dict[str, str]:
            raise AppError(
                ErrorCode.UPSTREAM_REJECTED,
                "学校账号或密码不匹配，请更新保存的凭据。",
                status_code=401,
                details={"smu_reason": "bad_credentials"},
            )

    handler = EvaluationHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        cast(DdddOcrSolver, FakeSolver()),
    )
    handler._client = cast(Any, BadCredentialsClient())

    from nanyee_worker.runtime import ExecutionFailure

    with pytest.raises(ExecutionFailure) as excinfo:
        await handler._login_with_backoff("student", "password")

    assert excinfo.value.error_code == "CREDENTIAL_INVALID"
    assert excinfo.value.retryable is False
    assert excinfo.value.next_action == "replace_credential"


def test_next_daily_run_uses_beijing_time() -> None:
    from nanyee_worker.evaluation import _next_daily_run

    # 北京 2026-09-01 06:00（UTC 2026-08-31 22:00）→ 当天 07:00（UTC 23:00）
    now = datetime(2026, 8, 31, 22, 0, tzinfo=UTC)
    assert _next_daily_run("07:00", now=now) == datetime(2026, 8, 31, 23, 0, tzinfo=UTC)
    # 北京 2026-09-01 08:30（UTC 00:30）→ 次日 07:00
    now = datetime(2026, 9, 1, 0, 30, tzinfo=UTC)
    assert _next_daily_run("07:00", now=now) == datetime(2026, 9, 1, 23, 0, tzinfo=UTC)
    # 恰好 07:00:00 已过点（候选 <= 当前），也进次日
    now = datetime(2026, 8, 31, 23, 0, tzinfo=UTC)
    assert _next_daily_run("07:00", now=now) == datetime(2026, 9, 1, 23, 0, tzinfo=UTC)


class QuietAcademicClient:
    """评教未开放：登录正常但没有待评课程。"""

    async def fetch_captcha(self) -> CaptchaData:
        return CaptchaData(image=b"captcha", content_type="image/png", cookies={"sid": "v"})

    async def authenticate(self, **_kwargs: object) -> dict[str, str]:
        return {"academic": "session"}

    async def fetch_pending_evaluations(self, **_kwargs: object) -> list[PendingEvaluation]:
        return []


def build_handler(client: object) -> EvaluationHandler:
    handler = EvaluationHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        cast(DdddOcrSolver, FakeSolver()),
    )
    handler._client = cast(Any, client)
    return handler


@pytest.mark.asyncio
async def test_evaluation_zero_pending_still_schedules_next_daily_run(monkeypatch: Any) -> None:
    import nanyee_worker.evaluation as module

    async def active_job(_db: object, _job: Job) -> None:
        return None

    monkeypatch.setattr(module, "ensure_execution_active", active_job)
    next_run = datetime.now(UTC) + timedelta(days=1)
    monkeypatch.setattr(module, "_next_daily_run", lambda _run_time: next_run)
    handler = build_handler(QuietAcademicClient())
    job = build_job()

    receipt = await handler.execute(cast(Any, object()), job)

    assert receipt.values["submitted_count"] == 0
    assert receipt.next_run_at == next_run
    assert [entry["event"] for entry in receipt.values["logs"]] == [
        "evaluation_started",
        "evaluation_pending_loaded",
        "evaluation_completed",
        "evaluation_next_scheduled",
    ]


@pytest.mark.asyncio
async def test_evaluation_past_retry_until_completes_terminally(monkeypatch: Any) -> None:
    import nanyee_worker.evaluation as module

    async def active_job(_db: object, _job: Job) -> None:
        return None

    monkeypatch.setattr(module, "ensure_execution_active", active_job)
    # 下一轮运行晚于截止时刻：本轮执行完即终结，不再排队
    next_run = datetime.now(UTC) + timedelta(days=1)
    monkeypatch.setattr(module, "_next_daily_run", lambda _run_time: next_run)
    handler = build_handler(QuietAcademicClient())
    job = build_job()
    job.payload = {
        **job.payload,
        "retry_until": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }

    receipt = await handler.execute(cast(Any, object()), job)

    assert receipt.next_run_at is None
    assert "evaluation_next_scheduled" not in [entry["event"] for entry in receipt.values["logs"]]


@pytest.mark.asyncio
async def test_evaluation_handler_submits_all_pending_courses(monkeypatch: Any) -> None:
    import nanyee_worker.evaluation as module

    async def active_job(_db: object, _job: Job) -> None:
        return None

    monkeypatch.setattr(module, "ensure_execution_active", active_job)
    handler = EvaluationHandler(
        Settings(app_env="test"),
        cast(CredentialVaultService, FakeVault()),
        cast(DdddOcrSolver, FakeSolver()),
    )
    client = SuccessfulAcademicClient()
    handler._client = cast(Any, client)

    receipt = await handler.execute(cast(Any, object()), build_job())

    assert receipt.values["pending_count"] == 1
    assert receipt.values["submitted_count"] == 1
    assert client.submitted[0]["late"] == "no"
    assert [entry["event"] for entry in receipt.values["logs"]] == [
        "evaluation_started",
        "evaluation_pending_loaded",
        "evaluation_course_started",
        "evaluation_course_succeeded",
        "evaluation_completed",
        "evaluation_next_scheduled",
    ]
    assert "password" not in str(receipt.values)
