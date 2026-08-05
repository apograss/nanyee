from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.credentials.models import CredentialStatus, HostedCredential, purpose_satisfies
from nanyee.credentials.router import require_csrf
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.router import current_auth
from nanyee.identity.sessions import AuthContext, settings_from_request
from nanyee.jobs.models import Job, JobState
from nanyee.jobs.service import JobService
from nanyee.security import as_utc, utc_now
from nanyee.tool_registry import RiskLevel, get_tool
from nanyee.tool_registry.payloads import validate_job_payload

router = APIRouter(prefix="/jobs", tags=["jobs"])
JOB_CREATE_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=10, hard_limit=30)
IDEMPOTENCY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
SENSITIVE_PAYLOAD_KEYS = frozenset(
    {"authorization", "cookie", "password", "secret", "session", "token"}
)


def _contains_sensitive_key(value: object) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).replace("-", "_").casefold()
            if any(part in SENSITIVE_PAYLOAD_KEYS for part in normalized.split("_")):
                return True
            if _contains_sensitive_key(child):
                return True
    elif isinstance(value, list):
        return any(_contains_sensitive_key(child) for child in value)
    return False


class JobCreateRequest(BaseModel):
    tool_id: str = Field(min_length=1, max_length=64)
    operation: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    credential_id: UUID | None = None
    confirmation_version: str | None = Field(default=None, max_length=128)
    scheduled_for: datetime | None = None
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)

    @model_validator(mode="after")
    def reject_secrets_and_oversized_payloads(self) -> JobCreateRequest:
        if _contains_sensitive_key(self.payload):
            raise ValueError("job payload must not contain credentials")
        encoded = json.dumps(self.payload, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        if len(encoded) > 32_768:
            raise ValueError("job payload exceeds 32 KiB")
        return self


class JobResponse(BaseModel):
    id: UUID
    tool_id: str
    operation: str
    state: JobState
    payload: dict[str, object]
    credential_id: UUID | None
    scheduled_for: datetime
    attempt_count: int
    max_attempts: int
    cancel_requested_at: datetime | None
    receipt: dict[str, object] | None
    error_code: str | None
    next_action: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(cls, record: Job) -> JobResponse:
        return cls.model_validate({field: getattr(record, field) for field in cls.model_fields})


async def _validate_credential(
    db: AsyncSession,
    *,
    credential_id: UUID | None,
    user_id: UUID,
    tool_id: str,
) -> None:
    if credential_id is None:
        return
    credential = (
        await db.execute(
            select(HostedCredential).where(
                HostedCredential.id == credential_id,
                HostedCredential.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if (
        credential is None
        or credential.status != CredentialStatus.ACTIVE
        or as_utc(credential.expires_at) <= utc_now()
    ):
        raise AppError(ErrorCode.FORBIDDEN, "凭据不可用于该任务。", status_code=403)
    if not purpose_satisfies(credential.purpose, tool_id):
        raise AppError(ErrorCode.FORBIDDEN, "凭据用途与任务不匹配。", status_code=403)


@router.post("", response_model=JobResponse, operation_id="create_job")
async def create_job(
    payload: JobCreateRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> JobResponse:
    require_csrf(request, auth, csrf_header)
    if idempotency_key is None or not IDEMPOTENCY_PATTERN.fullmatch(idempotency_key):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请提供 8 到 128 字符的有效幂等键。",
            status_code=422,
            details={"field": "Idempotency-Key"},
        )
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="job_create",
        identity=str(auth.user.id),
        policy=JOB_CREATE_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    tool = get_tool(payload.tool_id)
    if tool is None or not tool.enabled:
        raise AppError(ErrorCode.NOT_FOUND, "工具不存在或暂不可用。", status_code=404)
    if payload.operation not in tool.operations:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "该工具不支持此操作。",
            status_code=422,
            details={"field": "operation", "allowed": list(tool.operations)},
        )
    required_confirmation = f"{payload.tool_id}:{payload.operation}:v1"
    if (
        tool.risk_level != RiskLevel.READ_ONLY
        and payload.confirmation_version != required_confirmation
    ):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认当前操作摘要。",
            status_code=422,
            details={"required_confirmation_version": required_confirmation},
        )
    validated = validate_job_payload(payload.tool_id, payload.operation, payload.payload)
    if validated.credential_required and payload.credential_id is None:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "该任务需要托管凭据。",
            status_code=422,
            details={"field": "credential_id"},
        )
    await _validate_credential(
        db,
        credential_id=payload.credential_id,
        user_id=auth.user.id,
        tool_id=payload.tool_id,
    )
    scheduled_for = as_utc(payload.scheduled_for or utc_now())
    if scheduled_for > utc_now() + timedelta(days=30):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "任务最多只能提前 30 天计划。",
            status_code=422,
            details={"field": "scheduled_for"},
        )
    record, created = await JobService().create(
        db,
        user_id=auth.user.id,
        tool_id=payload.tool_id,
        operation=payload.operation,
        payload=validated.payload,
        credential_id=payload.credential_id,
        idempotency_key=idempotency_key,
        confirmation_version=payload.confirmation_version,
        scheduled_for=scheduled_for,
        schedule_is_explicit=payload.scheduled_for is not None,
        max_attempts=validated.max_attempts,
    )
    response.status_code = 201 if created else 200
    response.headers["Idempotency-Replayed"] = "false" if created else "true"
    return JobResponse.from_record(record)


@router.get("", response_model=list[JobResponse], operation_id="list_jobs")
async def list_jobs(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
) -> list[JobResponse]:
    records = (
        await db.execute(
            select(Job)
            .where(Job.user_id == auth.user.id)
            .order_by(Job.created_at.desc())
            .limit(100)
        )
    ).scalars()
    return [JobResponse.from_record(record) for record in records]


@router.get("/{job_id}", response_model=JobResponse, operation_id="get_job")
async def get_job(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
) -> JobResponse:
    record = (
        await db.execute(select(Job).where(Job.id == job_id, Job.user_id == auth.user.id))
    ).scalar_one_or_none()
    if record is None:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在。", status_code=404)
    return JobResponse.from_record(record)


@router.post("/{job_id}/cancel", response_model=JobResponse, operation_id="cancel_job")
async def cancel_job(
    job_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> JobResponse:
    require_csrf(request, auth, csrf_header)
    record = await JobService().cancel(db, job_id=job_id, user_id=auth.user.id)
    return JobResponse.from_record(record)
