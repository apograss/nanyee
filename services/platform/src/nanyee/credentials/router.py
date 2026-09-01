from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field, SecretStr, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.credentials.envelope import EnvelopeCipher
from nanyee.credentials.models import CredentialStatus, HostedCredential
from nanyee.credentials.service import CredentialVaultService
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.router import current_auth
from nanyee.identity.sessions import AuthContext, settings_from_request, validate_csrf
from nanyee.tools.qun_checkin import validate_auth_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/credentials", tags=["credentials"])
HOSTING_CONSENT_VERSION = "credential-hosting-v1"
CREDENTIAL_CREATE_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=5, hard_limit=15)
CREDENTIAL_REVEAL_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=10, hard_limit=30)
CREDENTIAL_RENEW_POLICY = RateLimitPolicy(window_seconds=10 * 60, soft_limit=10, hard_limit=30)


class CredentialCreateRequest(BaseModel):
    upstream: Literal["academic", "infospace", "qun100", "school"]
    purpose: Literal["evaluation", "study_cabin", "qun_checkin", "school"]
    secret: SecretStr
    ttl_seconds: int | None = Field(default=None, ge=300, le=365 * 24 * 60 * 60)
    consent_version: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)

    @model_validator(mode="after")
    def validate_upstream_for_purpose(self) -> CredentialCreateRequest:
        expected = {
            "evaluation": "academic",
            "study_cabin": "infospace",
            "qun_checkin": "qun100",
            "school": "school",
        }
        if self.upstream != expected[self.purpose]:
            raise ValueError("upstream does not match credential purpose")
        if len(self.metadata) > 10:
            raise ValueError("credential metadata has too many fields")
        if len(json.dumps(self.metadata, ensure_ascii=False, default=str).encode("utf-8")) > 4096:
            raise ValueError("credential metadata is too large")
        return self


class CredentialResponse(BaseModel):
    id: UUID
    upstream: str
    purpose: str
    status: CredentialStatus
    expires_at: datetime
    created_at: datetime
    last_used_at: datetime | None
    metadata: dict[str, str | int | bool | None]
    consent_version: str

    @classmethod
    def from_record(cls, record: HostedCredential) -> CredentialResponse:
        return cls(
            id=record.id,
            upstream=record.upstream,
            purpose=record.purpose,
            status=record.status,
            expires_at=record.expires_at,
            created_at=record.created_at,
            last_used_at=record.last_used_at,
            metadata=record.public_metadata,
            consent_version=record.consent_version,
        )


def get_cipher(request: Request) -> EnvelopeCipher:
    value = getattr(request.app.state, "credential_cipher", None)
    if value is None:
        raise AppError(
            ErrorCode.UPSTREAM_UNAVAILABLE,
            "托管凭据服务尚未配置。",
            status_code=503,
            retryable=True,
        )
    return cast(EnvelopeCipher, value)


def require_csrf(request: Request, auth: AuthContext, csrf_header: str | None) -> None:
    settings = settings_from_request(request)
    validate_csrf(
        auth,
        request.cookies.get(settings.csrf_cookie_name),
        csrf_header,
    )


def _canonical_secret(payload: CredentialCreateRequest) -> str:
    value = payload.secret.get_secret_value()
    if payload.purpose == "qun_checkin":
        try:
            return validate_auth_token(value)
        except ValueError as exc:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "群报数 Token 格式无效。",
                status_code=422,
                details={"field": "secret"},
            ) from exc
    if payload.purpose not in {"evaluation", "study_cabin", "school"}:
        return value
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "学校账号凭据格式无效。",
            status_code=422,
            details={"field": "secret"},
        ) from exc
    if not isinstance(parsed, dict):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "学校账号凭据格式无效。",
            status_code=422,
            details={"field": "secret"},
        )
    account = parsed.get("account")
    password = parsed.get("password")
    if (
        not isinstance(account, str)
        or not account
        or len(account) > 64
        or not isinstance(password, str)
        or not password
        or len(password) > 256
    ):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "学校账号凭据格式无效。",
            status_code=422,
            details={"field": "secret"},
        )
    return json.dumps(
        {"account": account, "password": password},
        ensure_ascii=False,
        separators=(",", ":"),
    )


@router.post(
    "", response_model=CredentialResponse, status_code=201, operation_id="create_credential"
)
async def create_credential(
    payload: CredentialCreateRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    cipher: Annotated[EnvelopeCipher, Depends(get_cipher)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> CredentialResponse:
    require_csrf(request, auth, csrf_header)
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="credential_create",
        identity=str(auth.user.id),
        policy=CREDENTIAL_CREATE_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    if payload.consent_version != HOSTING_CONSENT_VERSION:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请确认最新的凭据托管说明。",
            status_code=422,
            details={"required_consent_version": HOSTING_CONSENT_VERSION},
        )
    service = CredentialVaultService(cipher, settings_from_request(request))
    record = await service.create(
        db,
        user_id=auth.user.id,
        upstream=payload.upstream,
        purpose=payload.purpose,
        plaintext=_canonical_secret(payload),
        public_metadata=payload.metadata,
        consent_version=payload.consent_version,
        ttl_seconds=payload.ttl_seconds,
    )
    return CredentialResponse.from_record(record)


@router.get("", response_model=list[CredentialResponse], operation_id="list_credentials")
async def list_credentials(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
) -> list[CredentialResponse]:
    records = (
        await db.execute(
            select(HostedCredential)
            .where(
                HostedCredential.user_id == auth.user.id,
                HostedCredential.status != CredentialStatus.DELETED,
            )
            .order_by(HostedCredential.created_at.desc())
        )
    ).scalars()
    return [CredentialResponse.from_record(record) for record in records]


class CredentialRevealResponse(BaseModel):
    secret: str


@router.post(
    "/{credential_id}/reveal",
    response_model=CredentialRevealResponse,
    operation_id="reveal_credential",
)
async def reveal_credential(
    credential_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    cipher: Annotated[EnvelopeCipher, Depends(get_cipher)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> CredentialRevealResponse:
    require_csrf(request, auth, csrf_header)
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="credential_reveal",
        identity=str(auth.user.id),
        policy=CREDENTIAL_REVEAL_POLICY,
    )
    service = CredentialVaultService(cipher, settings_from_request(request))
    secret = await service.reveal_for_owner(db, credential_id=credential_id, user_id=auth.user.id)
    logger.info(
        "credential_revealed",
        extra={"user_id": str(auth.user.id), "credential_id": str(credential_id)},
    )
    return CredentialRevealResponse(secret=secret)


class CredentialRenewRequest(BaseModel):
    ttl_seconds: int = Field(ge=300, le=365 * 24 * 60 * 60)


@router.post(
    "/{credential_id}/renew",
    response_model=CredentialResponse,
    operation_id="renew_credential",
)
async def renew_credential(
    credential_id: UUID,
    payload: CredentialRenewRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    cipher: Annotated[EnvelopeCipher, Depends(get_cipher)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> CredentialResponse:
    require_csrf(request, auth, csrf_header)
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="credential_renew",
        identity=str(auth.user.id),
        policy=CREDENTIAL_RENEW_POLICY,
    )
    service = CredentialVaultService(cipher, settings_from_request(request))
    record = await service.renew(
        db,
        credential_id=credential_id,
        user_id=auth.user.id,
        ttl_seconds=payload.ttl_seconds,
    )
    logger.info(
        "credential_renewed",
        extra={"user_id": str(auth.user.id), "credential_id": str(credential_id)},
    )
    return CredentialResponse.from_record(record)


@router.delete(
    "/{credential_id}",
    response_model=CredentialResponse,
    operation_id="revoke_credential",
)
async def revoke_credential(
    credential_id: UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    cipher: Annotated[EnvelopeCipher, Depends(get_cipher)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
    hard: bool = False,
) -> CredentialResponse | Response:
    require_csrf(request, auth, csrf_header)
    service = CredentialVaultService(cipher, settings_from_request(request))
    if hard:
        await service.delete(db, credential_id=credential_id, user_id=auth.user.id)
        logger.info(
            "credential_deleted",
            extra={"user_id": str(auth.user.id), "credential_id": str(credential_id)},
        )
        return Response(status_code=204)
    record = await service.revoke(db, credential_id=credential_id, user_id=auth.user.id)
    return CredentialResponse.from_record(record)
