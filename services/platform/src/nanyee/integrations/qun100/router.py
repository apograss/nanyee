from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from pydantic import BaseModel, Field, SecretStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.credentials.router import require_csrf
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.router import current_auth
from nanyee.identity.sessions import AuthContext, settings_from_request
from nanyee.integrations.qun100.client import (
    Qun100Client,
    Qun100Rejected,
    Qun100SubmissionUnknown,
    Qun100Unavailable,
)
from nanyee.integrations.qun100.uploader import MAX_IMAGE_BYTES, QunImageUploader
from nanyee.tools.qun_checkin import (
    QunCatalogItem,
    QunPreviewRequest,
    build_payload,
    validate_auth_token,
)

router = APIRouter(prefix="/qun", tags=["qun100"])
FORM_ID_PATTERN = re.compile(r"^\d{15,32}$")
QUN_READ_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=20, hard_limit=60)
QUN_UPLOAD_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=5, hard_limit=15)
QUN_SUBMIT_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=5, hard_limit=15)


class TokenRequest(BaseModel):
    auth_token: SecretStr
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)

    @field_validator("auth_token")
    @classmethod
    def validate_token(cls, value: SecretStr) -> SecretStr:
        from nanyee.tools.qun_checkin import validate_auth_token

        return SecretStr(validate_auth_token(value.get_secret_value()))


class QunFormSummary(BaseModel):
    form_id: str
    title: str
    status: str | int | None
    version: str | int | None


class QunPreviewResponse(BaseModel):
    form_id: str
    title: str
    version: str | int
    catalogs: list[QunCatalogItem]


class QunImageResponse(BaseModel):
    url: str
    content_type: str
    size: int


class QunResolveRequest(TokenRequest):
    input: str = Field(min_length=1, max_length=2048)


class QunImmediateSubmitRequest(TokenRequest):
    form_version: str | int
    title: str = Field(default="", max_length=200)
    catalogs: list[QunCatalogItem] = Field(min_length=1, max_length=200)
    confirmation_version: str


class QunSubmitResponse(BaseModel):
    form_id: str
    title: str
    submitted: bool


def _validate_form_id(form_id: str) -> str:
    if not FORM_ID_PATTERN.fullmatch(form_id):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "群报数表单 ID 无效。",
            status_code=422,
            details={"field": "form_id"},
        )
    return form_id


def _client(request: Request) -> Qun100Client:
    return Qun100Client(settings_from_request(request))


async def _check_gate(
    db: AsyncSession,
    request: Request,
    auth: AuthContext,
    *,
    action: str,
    policy: RateLimitPolicy,
    turnstile_token: str | None,
    anti_abuse_pass: str | None,
) -> None:
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action=action,
        identity=str(auth.user.id),
        policy=policy,
        turnstile_token=turnstile_token,
        anti_abuse_pass=anti_abuse_pass,
    )


def _map_error(exc: Exception) -> AppError:
    if isinstance(exc, Qun100SubmissionUnknown):
        return AppError(
            ErrorCode.RESULT_UNKNOWN,
            "群报数提交结果未知，请先在小程序中核验。",
            status_code=502,
            details={"next_action": "verify_upstream"},
        )
    if isinstance(exc, Qun100Rejected):
        if str(exc.code) == "13314":
            return AppError(
                ErrorCode.UPSTREAM_REJECTED,
                "群报数 Token 已失效，请重新获取。",
                status_code=401,
            )
        message = exc.message or "群报数拒绝了本次提交。"
        return AppError(
            ErrorCode.UPSTREAM_REJECTED,
            f"群报数拒绝了请求：{message}",
            status_code=422,
            details={"upstream_code": exc.code},
        )
    return AppError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        "群报数服务暂时不可用，请稍后重试。",
        status_code=503,
        retryable=True,
    )


@router.post("/token/verify", operation_id="verify_qun100_token")
async def verify_token(
    payload: TokenRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(current_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> dict[str, bool]:
    require_csrf(request, auth, csrf_header)
    await _check_gate(
        db,
        request,
        auth,
        action="qun_read",
        policy=QUN_READ_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    try:
        await _client(request).verify_token(payload.auth_token.get_secret_value())
    except (Qun100Rejected, Qun100Unavailable) as exc:
        raise _map_error(exc) from exc
    return {"valid": True}


@router.post(
    "/forms/resolve",
    response_model=QunFormSummary,
    operation_id="resolve_qun100_form",
)
async def resolve_form(
    payload: QunResolveRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(current_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> QunFormSummary:
    require_csrf(request, auth, csrf_header)
    await _check_gate(
        db,
        request,
        auth,
        action="qun_read",
        policy=QUN_READ_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    client = _client(request)
    try:
        form_id = await client.resolve_form_id(payload.input)
        if form_id is None:
            raise AppError(ErrorCode.NOT_FOUND, "无法从链接中解析表单 ID。", status_code=404)
        details = await client.load_form_details(form_id, payload.auth_token.get_secret_value())
    except AppError:
        raise
    except (Qun100Rejected, Qun100Unavailable) as exc:
        raise _map_error(exc) from exc
    profile = details["profile"]
    assert isinstance(profile, dict)
    return QunFormSummary(
        form_id=form_id,
        title=str(profile.get("title") or ""),
        status=profile.get("status") if isinstance(profile.get("status"), (str, int)) else None,
        version=(
            profile.get("version") if isinstance(profile.get("version"), (str, int)) else None
        ),
    )


@router.post("/forms", response_model=list[QunFormSummary], operation_id="list_qun100_forms")
async def list_forms(
    payload: TokenRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(current_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> list[QunFormSummary]:
    require_csrf(request, auth, csrf_header)
    await _check_gate(
        db,
        request,
        auth,
        action="qun_read",
        policy=QUN_READ_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    try:
        forms = await _client(request).list_active_forms(payload.auth_token.get_secret_value())
    except (Qun100Rejected, Qun100Unavailable) as exc:
        raise _map_error(exc) from exc
    return [
        QunFormSummary(
            form_id=str(item.get("formId") or ""),
            title=str(item.get("title") or ""),
            status=item.get("status") if isinstance(item.get("status"), (str, int)) else None,
            version=(item.get("version") if isinstance(item.get("version"), (str, int)) else None),
        )
        for item in forms
    ]


@router.post(
    "/forms/{form_id}/preview",
    response_model=QunPreviewResponse,
    operation_id="preview_qun100_form",
)
async def preview_form(
    form_id: str,
    payload: QunPreviewRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(current_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> QunPreviewResponse:
    require_csrf(request, auth, csrf_header)
    await _check_gate(
        db,
        request,
        auth,
        action="qun_read",
        policy=QUN_READ_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    normalized_id = _validate_form_id(form_id)
    try:
        details = await _client(request).load_form_details(
            normalized_id, payload.auth_token.get_secret_value()
        )
    except (Qun100Rejected, Qun100Unavailable) as exc:
        raise _map_error(exc) from exc
    profile = details["profile"]
    assert isinstance(profile, dict)
    version: Any = profile.get("version")
    if not isinstance(version, (str, int)):
        raise _map_error(Qun100Unavailable("missing form version"))
    return QunPreviewResponse(
        form_id=normalized_id,
        title=str(profile.get("title") or ""),
        version=version,
        catalogs=build_payload(
            details["catalogs"],
            details["last_record"],
            payload.defaults,
            payload.custom_fields,
        ),
    )


@router.post(
    "/forms/{form_id}/submit",
    response_model=QunSubmitResponse,
    operation_id="submit_qun100_form_immediately",
)
async def submit_form_immediately(
    form_id: str,
    payload: QunImmediateSubmitRequest,
    request: Request,
    auth: Annotated[AuthContext, Depends(current_auth)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> QunSubmitResponse:
    require_csrf(request, auth, csrf_header)
    if payload.confirmation_version != "qun_checkin:submit:v1":
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认当前群报数提交内容。",
            status_code=422,
            details={"required_confirmation_version": "qun_checkin:submit:v1"},
        )
    await _check_gate(
        db,
        request,
        auth,
        action="qun_submit",
        policy=QUN_SUBMIT_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    normalized_id = _validate_form_id(form_id)
    token = validate_auth_token(payload.auth_token.get_secret_value())
    try:
        await _client(request).submit(
            normalized_id,
            form_version=payload.form_version,
            catalogs=[item.model_dump(mode="json") for item in payload.catalogs],
            token=token,
        )
    except (Qun100Rejected, Qun100SubmissionUnknown, Qun100Unavailable) as exc:
        raise _map_error(exc) from exc
    finally:
        token = ""
    return QunSubmitResponse(form_id=normalized_id, title=payload.title, submitted=True)


@router.post(
    "/images",
    response_model=QunImageResponse,
    operation_id="upload_qun100_image",
)
async def upload_image(
    request: Request,
    auth: Annotated[AuthContext, Depends(current_auth)],
    auth_token: Annotated[str, Form(min_length=60, max_length=4096)],
    file: Annotated[UploadFile, File()],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    turnstile_token: Annotated[str | None, Form(max_length=2048)] = None,
    anti_abuse_pass: Annotated[str | None, Form(max_length=4096)] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> QunImageResponse:
    require_csrf(request, auth, csrf_header)
    await _check_gate(
        db,
        request,
        auth,
        action="qun_upload",
        policy=QUN_UPLOAD_POLICY,
        turnstile_token=turnstile_token,
        anti_abuse_pass=anti_abuse_pass,
    )
    try:
        token = validate_auth_token(auth_token)
    except ValueError as exc:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "群报数 Token 格式无效。",
            status_code=422,
            details={"field": "auth_token"},
        ) from exc
    content_type = file.content_type or ""
    image = await file.read(MAX_IMAGE_BYTES + 1)
    await file.close()
    try:
        url = await QunImageUploader(settings_from_request(request)).upload(
            image,
            declared_content_type=content_type,
            token=token,
        )
    except ValueError as exc:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "图片格式或大小无效。",
            status_code=422,
            details={"field": "file", "max_bytes": MAX_IMAGE_BYTES},
        ) from exc
    except (Qun100Rejected, Qun100Unavailable) as exc:
        raise _map_error(exc) from exc
    finally:
        token = ""
    return QunImageResponse(url=url, content_type=content_type, size=len(image))
