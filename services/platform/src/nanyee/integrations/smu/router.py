from __future__ import annotations

import base64
import json
from datetime import date, datetime
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from pydantic import BaseModel, Field, SecretStr, ValidationError, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.credentials.router import require_csrf
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.router import current_auth
from nanyee.identity.sessions import AuthContext, settings_from_request
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.integrations.smu.enrollment_runs import EnrollmentRunManager
from nanyee.integrations.wakeup import WakeUpClient, WakeUpShareError
from nanyee.tools.course_selection import (
    CourseCategory,
    CourseItem,
    EnrollmentResult,
    EnrollmentRun,
)
from nanyee.tools.evaluation import (
    EvaluationDraft,
    EvaluationQuestion,
    EvaluationReference,
    EvaluationResult,
    PendingEvaluation,
)
from nanyee.tools.grades import GradeRecord, GradeSummary, calculate_summary
from nanyee.tools.timetable import (
    AggregatedCourse,
    CourseEvent,
    aggregate_events,
    export_ics,
    export_wakeup_schedule,
)
from nanyee.transient import TransientSecretStore

router = APIRouter(prefix="/smu", tags=["smu"])
CAPTCHA_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=5, hard_limit=15)
LOGIN_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=3, hard_limit=10)
READ_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=20, hard_limit=60)
ENROLL_POLICY = RateLimitPolicy(window_seconds=60, soft_limit=3, hard_limit=6)
ENROLL_RUN_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=3, hard_limit=10)
EVALUATION_SUBMIT_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=5, hard_limit=15)


class CaptchaResponse(BaseModel):
    flow_id: str
    image_base64: str
    content_type: str
    expires_at: datetime


class SmuSessionRequest(BaseModel):
    flow_id: str = Field(min_length=20, max_length=128)
    account: str = Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    password: SecretStr
    captcha: str = Field(min_length=1, max_length=16)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


class SmuSessionResponse(BaseModel):
    academic_session_id: str
    expires_at: datetime


class AcademicSessionRequest(BaseModel):
    academic_session_id: str = Field(min_length=20, max_length=128)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


class TimetableRequest(AcademicSessionRequest):
    total_weeks: int = Field(default=20, ge=1, le=30)


class TimetableResponse(BaseModel):
    semester_code: str
    events: list[CourseEvent]
    courses: list[AggregatedCourse]


class IcsRequest(TimetableRequest):
    semester_monday: date


class WakeUpRequest(TimetableRequest):
    semester_monday: date
    campus: Literal["main", "shunde"]


class WakeUpShareRequest(WakeUpRequest):
    confirmation_version: str


class WakeUpShareResponse(BaseModel):
    share_code: str


class GradesResponse(BaseModel):
    grades: list[GradeRecord]
    summary: GradeSummary


class EnrollmentCategoryRequest(AcademicSessionRequest):
    pass


class EnrollmentCourseRequest(AcademicSessionRequest):
    category_code: str = Field(pattern=r"^\d{1,8}$")


class EnrollmentSubmitRequest(EnrollmentCourseRequest):
    task_code: str = Field(min_length=1, max_length=128)
    confirmation_version: str


class EnrollmentRunRequest(EnrollmentCourseRequest):
    preference_task_codes: list[str] = Field(min_length=1, max_length=4)
    scheduled_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$")
    max_attempts: int = Field(default=15, ge=1, le=120)
    primary_burst_attempts: int = Field(default=5, ge=0, le=120)
    confirm_conflicts: bool = True
    confirmation_version: str

    @model_validator(mode="after")
    def validate_preferences(self) -> EnrollmentRunRequest:
        if len(self.preference_task_codes) != len(set(self.preference_task_codes)):
            raise ValueError("preference_task_codes must not contain duplicates")
        if any(not value or len(value) > 128 for value in self.preference_task_codes):
            raise ValueError("preference task code is invalid")
        if self.primary_burst_attempts > self.max_attempts:
            raise ValueError("primary_burst_attempts cannot exceed max_attempts")
        return self


class EvaluationDraftRequest(AcademicSessionRequest):
    reference: EvaluationReference


class EvaluationDraftResponse(BaseModel):
    draft_id: str
    expires_at: datetime
    reference: EvaluationReference
    teacher_name: str
    course_name: str
    questions: list[EvaluationQuestion]


class EvaluationSubmitRequest(AcademicSessionRequest):
    draft_id: str = Field(min_length=20, max_length=128)
    selections: dict[str, str] = Field(min_length=1, max_length=100)
    confirmation_version: str


class _StoredEvaluationDraft(BaseModel):
    academic_session_id: str
    draft: EvaluationDraft


def get_transient_store(request: Request) -> TransientSecretStore:
    return cast(TransientSecretStore, request.app.state.transient_store)


def get_smu_client(request: Request) -> SmuAcademicClient:
    return cast(SmuAcademicClient, request.app.state.smu_client)


def get_enrollment_runs(request: Request) -> EnrollmentRunManager:
    return cast(EnrollmentRunManager, request.app.state.enrollment_runs)


async def load_academic_cookies(
    store: TransientSecretStore, academic_session_id: str
) -> dict[str, str]:
    raw = await store.get(academic_session_id, kind="smu_academic")
    if raw is None:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "学校会话已失效，请重新登录。",
            status_code=410,
        )
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise AppError(
            ErrorCode.INTERNAL_ERROR,
            "学校会话状态无效。",
            status_code=500,
        ) from exc
    if not isinstance(parsed, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in parsed.items()
    ):
        raise AppError(
            ErrorCode.INTERNAL_ERROR,
            "学校会话状态无效。",
            status_code=500,
        )
    return parsed


@router.get("/captcha", response_model=CaptchaResponse, operation_id="smu_captcha")
async def captcha(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    turnstile_token: Annotated[str | None, Query(max_length=2048)] = None,
    anti_abuse_pass: Annotated[str | None, Query(max_length=4096)] = None,
) -> CaptchaResponse:
    settings = settings_from_request(request)
    await AntiAbuseGate(settings).check(
        db,
        request,
        action="smu_captcha",
        identity="captcha",
        policy=CAPTCHA_POLICY,
        turnstile_token=turnstile_token,
        anti_abuse_pass=anti_abuse_pass,
    )
    data = await client.fetch_captcha()
    encoded_cookies = json.dumps(data.cookies, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    flow_id, expires_at = await store.put(encoded_cookies, kind="smu_captcha")
    return CaptchaResponse(
        flow_id=flow_id,
        image_base64=base64.b64encode(data.image).decode("ascii"),
        content_type=data.content_type,
        expires_at=expires_at,
    )


@router.post("/session", response_model=SmuSessionResponse, operation_id="smu_session")
async def create_smu_session(
    payload: SmuSessionRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
) -> SmuSessionResponse:
    settings = settings_from_request(request)
    await AntiAbuseGate(settings).check(
        db,
        request,
        action="smu_login",
        identity=payload.account.casefold(),
        policy=LOGIN_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    raw_cookies = await store.take(payload.flow_id, kind="smu_captcha")
    if raw_cookies is None:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "验证码流程已失效，请重新获取。",
            status_code=410,
        )
    try:
        parsed = json.loads(raw_cookies)
        if not isinstance(parsed, dict) or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in parsed.items()
        ):
            raise ValueError
        uis_cookies: dict[str, str] = parsed
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AppError(
            ErrorCode.INTERNAL_ERROR,
            "验证码流程状态无效。",
            status_code=500,
        ) from exc
    academic_cookies = await client.authenticate(
        account=payload.account,
        password=payload.password.get_secret_value(),
        captcha=payload.captcha,
        uis_cookies=uis_cookies,
    )
    encoded = json.dumps(academic_cookies, sort_keys=True, separators=(",", ":")).encode("utf-8")
    session_id, expires_at = await store.put(encoded, kind="smu_academic")
    return SmuSessionResponse(academic_session_id=session_id, expires_at=expires_at)


async def check_read_gate(
    db: AsyncSession,
    request: Request,
    payload: AcademicSessionRequest,
    *,
    action: str,
) -> None:
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action=action,
        identity=payload.academic_session_id,
        policy=READ_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )


@router.post("/timetable", response_model=TimetableResponse, operation_id="smu_timetable")
async def timetable(
    payload: TimetableRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
) -> TimetableResponse:
    await check_read_gate(db, request, payload, action="smu_timetable")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    semester_code, events = await client.fetch_timetable(
        academic_cookies=cookies, total_weeks=payload.total_weeks
    )
    return TimetableResponse(
        semester_code=semester_code,
        events=events,
        courses=aggregate_events(events),
    )


@router.post("/timetable.ics", response_class=Response, operation_id="smu_timetable_ics")
async def timetable_ics(
    payload: IcsRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
) -> Response:
    await check_read_gate(db, request, payload, action="smu_timetable")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    _, events = await client.fetch_timetable(
        academic_cookies=cookies, total_weeks=payload.total_weeks
    )
    calendar = export_ics(events, semester_monday=payload.semester_monday)
    return Response(
        content=calendar,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="nanyee-timetable.ics"'},
    )


@router.post(
    "/timetable.wakeup",
    response_class=Response,
    operation_id="smu_timetable_wakeup",
)
async def timetable_wakeup(
    payload: WakeUpRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
) -> Response:
    await check_read_gate(db, request, payload, action="smu_timetable")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    _, events = await client.fetch_timetable(
        academic_cookies=cookies, total_weeks=payload.total_weeks
    )
    schedule = export_wakeup_schedule(
        aggregate_events(events),
        semester_monday=payload.semester_monday,
        total_weeks=payload.total_weeks,
        campus=payload.campus,
    )
    return Response(
        content=schedule,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="nanyee.wakeup_schedule"'},
    )


@router.post(
    "/timetable.wakeup.share",
    response_model=WakeUpShareResponse,
    operation_id="smu_timetable_wakeup_share",
)
async def timetable_wakeup_share(
    payload: WakeUpShareRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> WakeUpShareResponse:
    require_csrf(request, auth, csrf_header)
    if payload.confirmation_version != "timetable:wakeup_share:v1":
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认将课表临时上传到 WakeUp。",
            status_code=422,
            details={"required_confirmation_version": "timetable:wakeup_share:v1"},
        )
    await check_read_gate(db, request, payload, action="smu_timetable")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    _, events = await client.fetch_timetable(
        academic_cookies=cookies, total_weeks=payload.total_weeks
    )
    schedule = export_wakeup_schedule(
        aggregate_events(events),
        semester_monday=payload.semester_monday,
        total_weeks=payload.total_weeks,
        campus=payload.campus,
    )
    try:
        share_code = await WakeUpClient(settings_from_request(request)).share(schedule)
    except WakeUpShareError as exc:
        raise AppError(
            ErrorCode.UPSTREAM_UNAVAILABLE,
            "WakeUp 分享服务暂时不可用，请下载文件后手动导入。",
            status_code=503,
            retryable=True,
        ) from exc
    return WakeUpShareResponse(share_code=share_code)


@router.post("/grades", response_model=GradesResponse, operation_id="smu_grades")
async def grades(
    payload: AcademicSessionRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
) -> GradesResponse:
    await check_read_gate(db, request, payload, action="smu_grades")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    records = await client.fetch_grades(academic_cookies=cookies)
    return GradesResponse(grades=records, summary=calculate_summary(records))


@router.post(
    "/enrollment/categories",
    response_model=list[CourseCategory],
    operation_id="smu_enrollment_categories",
)
async def enrollment_categories(
    payload: EnrollmentCategoryRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> list[CourseCategory]:
    require_csrf(request, auth, csrf_header)
    await check_read_gate(db, request, payload, action="smu_enrollment_read")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    return await client.fetch_enrollment_categories(academic_cookies=cookies)


@router.post(
    "/enrollment/courses",
    response_model=list[CourseItem],
    operation_id="smu_enrollment_courses",
)
async def enrollment_courses(
    payload: EnrollmentCourseRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> list[CourseItem]:
    require_csrf(request, auth, csrf_header)
    await check_read_gate(db, request, payload, action="smu_enrollment_read")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    return await client.fetch_enrollment_courses(
        academic_cookies=cookies,
        category_code=payload.category_code,
    )


@router.post(
    "/enrollment/submit",
    response_model=EnrollmentResult,
    operation_id="smu_enrollment_submit",
)
async def enrollment_submit(
    payload: EnrollmentSubmitRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> EnrollmentResult:
    require_csrf(request, auth, csrf_header)
    if payload.confirmation_version != "course_selection:enroll:v1":
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认当前选课操作摘要。",
            status_code=422,
            details={"required_confirmation_version": "course_selection:enroll:v1"},
        )
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="smu_enrollment_submit",
        identity=f"{auth.user.id}:{payload.academic_session_id}",
        policy=ENROLL_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    courses = await client.fetch_enrollment_courses(
        academic_cookies=cookies,
        category_code=payload.category_code,
    )
    course = next((item for item in courses if item.task_code == payload.task_code), None)
    if course is None:
        raise AppError(
            ErrorCode.NOT_FOUND,
            "课程不在当前可选列表中。",
            status_code=404,
        )
    return await client.enroll_course(
        academic_cookies=cookies,
        category_code=payload.category_code,
        course=course,
    )


@router.post(
    "/enrollment/runs",
    response_model=EnrollmentRun,
    status_code=201,
    operation_id="start_smu_enrollment_run",
)
async def start_enrollment_run(
    payload: EnrollmentRunRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    runs: Annotated[EnrollmentRunManager, Depends(get_enrollment_runs)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> EnrollmentRun:
    require_csrf(request, auth, csrf_header)
    if payload.confirmation_version != "course_selection:auto_enroll:v1":
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认自动选课的志愿、时间和重试次数。",
            status_code=422,
            details={"required_confirmation_version": "course_selection:auto_enroll:v1"},
        )
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="smu_enrollment_run",
        identity=f"{auth.user.id}:{payload.academic_session_id}",
        policy=ENROLL_RUN_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    courses = await client.fetch_enrollment_courses(
        academic_cookies=cookies,
        category_code=payload.category_code,
    )
    by_task_code = {course.task_code: course for course in courses}
    try:
        preferences = [by_task_code[code] for code in payload.preference_task_codes]
    except KeyError as exc:
        raise AppError(
            ErrorCode.NOT_FOUND,
            "志愿课程不在当前可选列表中，请刷新后重试。",
            status_code=404,
        ) from exc
    try:
        return await runs.create(
            user_id=auth.user.id,
            category_code=payload.category_code,
            preferences=preferences,
            cookies=cookies,
            scheduled_time=payload.scheduled_time,
            max_attempts=payload.max_attempts,
            primary_burst_attempts=payload.primary_burst_attempts,
            confirm_conflicts=payload.confirm_conflicts,
        )
    except RuntimeError as exc:
        raise AppError(
            ErrorCode.UPSTREAM_UNAVAILABLE,
            "自动选课运行队列已满，请稍后重试。",
            status_code=503,
            retryable=True,
        ) from exc


@router.get(
    "/enrollment/runs/{run_id}",
    response_model=EnrollmentRun,
    operation_id="get_smu_enrollment_run",
)
async def get_enrollment_run(
    run_id: str,
    runs: Annotated[EnrollmentRunManager, Depends(get_enrollment_runs)],
    auth: Annotated[AuthContext, Depends(current_auth)],
) -> EnrollmentRun:
    record = await runs.get(run_id, user_id=auth.user.id)
    if record is None:
        raise AppError(ErrorCode.NOT_FOUND, "自动选课运行不存在。", status_code=404)
    return record


@router.post(
    "/enrollment/runs/{run_id}/cancel",
    response_model=EnrollmentRun,
    operation_id="cancel_smu_enrollment_run",
)
async def cancel_enrollment_run(
    run_id: str,
    request: Request,
    runs: Annotated[EnrollmentRunManager, Depends(get_enrollment_runs)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> EnrollmentRun:
    require_csrf(request, auth, csrf_header)
    record = await runs.cancel(run_id, user_id=auth.user.id)
    if record is None:
        raise AppError(ErrorCode.NOT_FOUND, "自动选课运行不存在。", status_code=404)
    return record


@router.post(
    "/evaluations/pending",
    response_model=list[PendingEvaluation],
    operation_id="smu_evaluations_pending",
)
async def evaluations_pending(
    payload: AcademicSessionRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> list[PendingEvaluation]:
    require_csrf(request, auth, csrf_header)
    await check_read_gate(db, request, payload, action="smu_evaluation_read")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    return await client.fetch_pending_evaluations(academic_cookies=cookies)


@router.post(
    "/evaluations/drafts",
    response_model=EvaluationDraftResponse,
    status_code=201,
    operation_id="smu_evaluation_draft",
)
async def create_evaluation_draft(
    payload: EvaluationDraftRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> EvaluationDraftResponse:
    require_csrf(request, auth, csrf_header)
    await check_read_gate(db, request, payload, action="smu_evaluation_read")
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    draft = await client.fetch_evaluation_draft(
        academic_cookies=cookies,
        reference=payload.reference,
    )
    stored = _StoredEvaluationDraft(
        academic_session_id=payload.academic_session_id,
        draft=draft,
    )
    draft_id, expires_at = await store.put(
        stored.model_dump_json().encode("utf-8"),
        kind=f"evaluation_draft:{auth.user.id}",
    )
    return EvaluationDraftResponse(
        draft_id=draft_id,
        expires_at=expires_at,
        reference=draft.reference,
        teacher_name=draft.teacher_name,
        course_name=draft.course_name,
        questions=draft.questions,
    )


@router.post(
    "/evaluations/submit",
    response_model=EvaluationResult,
    operation_id="smu_evaluation_submit",
)
async def submit_evaluation(
    payload: EvaluationSubmitRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    store: Annotated[TransientSecretStore, Depends(get_transient_store)],
    client: Annotated[SmuAcademicClient, Depends(get_smu_client)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> EvaluationResult:
    require_csrf(request, auth, csrf_header)
    if payload.confirmation_version != "evaluation:submit:v1":
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认当前评课操作摘要。",
            status_code=422,
            details={"required_confirmation_version": "evaluation:submit:v1"},
        )
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="smu_evaluation_submit",
        identity=f"{auth.user.id}:{payload.academic_session_id}",
        policy=EVALUATION_SUBMIT_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    raw = await store.take(
        payload.draft_id,
        kind=f"evaluation_draft:{auth.user.id}",
    )
    if raw is None:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "评课草稿已失效或已使用，请重新生成。",
            status_code=410,
        )
    try:
        stored = _StoredEvaluationDraft.model_validate_json(raw)
    except ValidationError as exc:
        raise AppError(
            ErrorCode.INTERNAL_ERROR,
            "评课草稿状态无效。",
            status_code=500,
        ) from exc
    if stored.academic_session_id != payload.academic_session_id:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "评课草稿与学校会话不匹配，请重新生成。",
            status_code=422,
        )
    cookies = await load_academic_cookies(store, payload.academic_session_id)
    return await client.submit_evaluation(
        academic_cookies=cookies,
        draft=stored.draft,
        selections=payload.selections,
    )
