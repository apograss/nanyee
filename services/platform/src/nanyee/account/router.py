"""平台账号自助：绑定/换绑/解绑邮箱，凭绑定邮箱找回密码。

见 docs/adr/0001-account-email-binding-and-password-reset.md。
验证码流程复用 registration_challenges（method = email_bind / password_reset）。
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Annotated, cast
from uuid import UUID, uuid4

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.client import client_subject_digest, get_client_context
from nanyee.config import Settings
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.models import Session, User, UserStatus
from nanyee.identity.passwords import hash_password, verify_password
from nanyee.identity.router import AuthResponse, UserResponse, current_auth
from nanyee.identity.sessions import AuthContext, settings_from_request, validate_csrf
from nanyee.registration.mailer import NoticeMailer, VerificationMailer
from nanyee.registration.models import RegistrationChallenge, RegistrationMethod
from nanyee.registration.router import get_mailer, mask_email
from nanyee.security import as_utc, keyed_digest, secure_compare, utc_now

router = APIRouter(prefix="/account", tags=["account"])

EMAIL_BIND_POLICY = RateLimitPolicy(window_seconds=3600, soft_limit=5, hard_limit=10)
EMAIL_UNBIND_POLICY = RateLimitPolicy(window_seconds=3600, soft_limit=5, hard_limit=10)
PASSWORD_RESET_POLICY = RateLimitPolicy(window_seconds=3600, soft_limit=3, hard_limit=8)
RESEND_INTERVAL = timedelta(seconds=60)
_CODE_LABEL = "account-code"


class EmailBindRequest(BaseModel):
    email: str = Field(max_length=254)
    # 已绑定邮箱时（换绑）必填
    password: str | None = Field(default=None, max_length=128)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


class EmailUnbindRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


class CodeChallengeResponse(BaseModel):
    challenge_id: UUID
    expires_at: str
    resend_at: str
    masked_email: str


class EmailConfirmRequest(BaseModel):
    challenge_id: UUID
    code: str = Field(pattern=r"^\d{6}$")


class PasswordResetRequest(BaseModel):
    email: str = Field(max_length=254)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


class PasswordResetConfirmRequest(BaseModel):
    challenge_id: UUID
    code: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)


def normalize_email(value: str) -> str:
    try:
        result = validate_email(value, check_deliverability=False)
    except EmailNotValidError as exc:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请输入有效的邮箱地址。",
            status_code=422,
            details={"field": "email"},
        ) from exc
    return result.normalized.casefold()


def get_notice_mailer(request: Request) -> NoticeMailer:
    mailer = getattr(request.app.state, "notice_mailer", None)
    if mailer is not None:
        return cast(NoticeMailer, mailer)
    return NoticeMailer(settings_from_request(request))


def _require_csrf(request: Request, auth: AuthContext, csrf_header: str | None) -> None:
    settings = settings_from_request(request)
    validate_csrf(auth, request.cookies.get(settings.csrf_cookie_name), csrf_header)


def _code_digest(settings: Settings, challenge_id: UUID, code: str) -> str:
    return keyed_digest(
        settings.session_secret.get_secret_value(), _CODE_LABEL, str(challenge_id), code
    )


def _challenge_response(challenge: RegistrationChallenge, email: str) -> CodeChallengeResponse:
    return CodeChallengeResponse(
        challenge_id=challenge.id,
        expires_at=as_utc(challenge.expires_at).isoformat(),
        resend_at=(as_utc(challenge.created_at) + RESEND_INTERVAL).isoformat(),
        masked_email=mask_email(email),
    )


def _verify_password_or_raise(user: User, password: str | None) -> None:
    if not password or not verify_password(user.password_hash, password):
        raise AppError(
            ErrorCode.INVALID_CREDENTIALS,
            "平台密码错误。",
            status_code=401,
            details={"field": "password"},
        )


async def _recent_challenge(
    db: AsyncSession,
    *,
    method: RegistrationMethod,
    email: str,
    user_id: UUID | None,
) -> RegistrationChallenge | None:
    statement = select(RegistrationChallenge).where(
        RegistrationChallenge.method == method,
        RegistrationChallenge.email == email,
        RegistrationChallenge.consumed_at.is_(None),
        RegistrationChallenge.created_at > utc_now() - RESEND_INTERVAL,
    )
    if user_id is not None:
        statement = statement.where(RegistrationChallenge.user_id == user_id)
    return (await db.execute(statement)).scalars().first()


async def _new_challenge(
    db: AsyncSession,
    request: Request,
    *,
    method: RegistrationMethod,
    email: str,
    user_id: UUID | None,
    with_code: bool,
) -> tuple[RegistrationChallenge, str | None]:
    settings = settings_from_request(request)
    now = utc_now()
    challenge_id = uuid4()
    code = f"{secrets.randbelow(1_000_000):06d}" if with_code else None
    context = get_client_context(request, settings)
    challenge = RegistrationChallenge(
        id=challenge_id,
        method=method,
        email=email,
        user_id=user_id,
        code_digest=_code_digest(settings, challenge_id, code) if code else None,
        expires_at=now + timedelta(seconds=settings.registration_challenge_ttl_seconds),
        requester_digest=client_subject_digest(
            settings, context, action=f"challenge_{method.value}", identity=email
        ),
    )
    challenge.created_at = now
    db.add(challenge)
    await db.commit()
    return challenge, code


async def _check_code(
    db: AsyncSession,
    settings: Settings,
    *,
    challenge_id: UUID,
    method: RegistrationMethod,
    code: str,
    user_id: UUID | None = None,
) -> RegistrationChallenge:
    """校验验证码；任何失败都返回同一种提示，不区分“不存在 / 过期 / 错误”。"""
    challenge = (
        await db.execute(
            select(RegistrationChallenge)
            .where(RegistrationChallenge.id == challenge_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    invalid = AppError(ErrorCode.INVALID_REQUEST, "验证码错误或已过期。", status_code=422)
    if (
        challenge is None
        or challenge.method != method
        or (user_id is not None and challenge.user_id != user_id)
        or challenge.consumed_at is not None
        or as_utc(challenge.expires_at) <= utc_now()
    ):
        raise invalid
    if challenge.attempts >= settings.registration_challenge_max_attempts:
        raise AppError(
            ErrorCode.RATE_LIMITED, "验证次数已用完，请重新获取验证码。", status_code=429
        )
    challenge.attempts += 1
    passed = challenge.code_digest is not None and secure_compare(
        challenge.code_digest, _code_digest(settings, challenge.id, code)
    )
    if not passed:
        await db.commit()
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "验证码错误或已过期。",
            status_code=422,
            details={
                "attempts_remaining": max(
                    0, settings.registration_challenge_max_attempts - challenge.attempts
                )
            },
        )
    return challenge


# ---------------------------------------------------------------- 绑定邮箱


@router.post(
    "/email/challenges",
    response_model=CodeChallengeResponse,
    operation_id="create_email_bind_challenge",
)
async def create_email_bind_challenge(
    payload: EmailBindRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    mailer: Annotated[VerificationMailer, Depends(get_mailer)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> CodeChallengeResponse:
    _require_csrf(request, auth, csrf_header)
    settings = settings_from_request(request)
    await AntiAbuseGate(settings).check(
        db,
        request,
        action="email_bind",
        identity=str(auth.user.id),
        policy=EMAIL_BIND_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    user = auth.user
    email = normalize_email(payload.email)
    if user.email is not None:
        _verify_password_or_raise(user, payload.password)
        if user.email == email:
            raise AppError(
                ErrorCode.INVALID_REQUEST,
                "已经绑定了这个邮箱。",
                status_code=422,
                details={"field": "email"},
            )
    taken = (
        await db.execute(select(User.id).where(User.email == email, User.id != user.id))
    ).scalar_one_or_none()
    if taken is not None:
        raise AppError(
            ErrorCode.CONFLICT,
            "该邮箱已绑定其他账号。",
            status_code=409,
            details={"field": "email"},
        )

    recent = await _recent_challenge(
        db, method=RegistrationMethod.EMAIL_BIND, email=email, user_id=user.id
    )
    if recent is not None:
        return _challenge_response(recent, email)
    challenge, code = await _new_challenge(
        db,
        request,
        method=RegistrationMethod.EMAIL_BIND,
        email=email,
        user_id=user.id,
        with_code=True,
    )
    assert code is not None
    await mailer.send_code(
        recipient=email,
        code=code,
        purpose="bind",
        subject=f"[nanyee.de] 绑定邮箱验证码: {code}",
    )
    return _challenge_response(challenge, email)


@router.post("/email/confirm", response_model=AuthResponse, operation_id="confirm_email_bind")
async def confirm_email_bind(
    payload: EmailConfirmRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    notice_mailer: Annotated[NoticeMailer, Depends(get_notice_mailer)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AuthResponse:
    _require_csrf(request, auth, csrf_header)
    settings = settings_from_request(request)
    challenge = await _check_code(
        db,
        settings,
        challenge_id=payload.challenge_id,
        method=RegistrationMethod.EMAIL_BIND,
        code=payload.code,
        user_id=auth.user.id,
    )
    user = auth.user
    previous = user.email
    now = utc_now()
    assert challenge.email is not None
    user.email = challenge.email
    user.email_verified_at = now
    challenge.verified_at = now
    challenge.consumed_at = now
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError(ErrorCode.CONFLICT, "该邮箱已绑定其他账号。", status_code=409) from exc
    if previous and previous != user.email:
        await notice_mailer.send_notice(
            recipient=previous,
            subject="[nanyee.de] 你的账号已换绑邮箱",
            text=(
                f"你的南医工具台账号 {user.username} 已将绑定邮箱换为 "
                f"{mask_email(user.email)}。\n\n"
                "如果不是你本人操作，请尽快登录修改平台密码，或发邮件到 contact@nanyee.de。"
            ),
        )
    return AuthResponse(user=UserResponse.from_user(user))


@router.post("/email/unbind", response_model=AuthResponse, operation_id="unbind_email")
async def unbind_email(
    payload: EmailUnbindRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    notice_mailer: Annotated[NoticeMailer, Depends(get_notice_mailer)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> AuthResponse:
    _require_csrf(request, auth, csrf_header)
    await AntiAbuseGate(settings_from_request(request)).check(
        db,
        request,
        action="email_unbind",
        identity=str(auth.user.id),
        policy=EMAIL_UNBIND_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    user = auth.user
    if user.email is None:
        raise AppError(ErrorCode.INVALID_REQUEST, "当前没有绑定邮箱。", status_code=422)
    _verify_password_or_raise(user, payload.password)
    previous = user.email
    user.email = None
    user.email_verified_at = None
    await db.commit()
    await notice_mailer.send_notice(
        recipient=previous,
        subject="[nanyee.de] 你的账号已解绑邮箱",
        text=(
            f"你的南医工具台账号 {user.username} 已解除与本邮箱的绑定，"
            "之后无法再用本邮箱找回密码。\n\n"
            "如果不是你本人操作，请尽快登录修改平台密码，或发邮件到 contact@nanyee.de。"
        ),
    )
    return AuthResponse(user=UserResponse.from_user(user))


# ---------------------------------------------------------------- 找回密码


@router.post(
    "/password-reset",
    response_model=CodeChallengeResponse,
    operation_id="create_password_reset_challenge",
)
async def create_password_reset_challenge(
    payload: PasswordResetRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    mailer: Annotated[VerificationMailer, Depends(get_mailer)],
) -> CodeChallengeResponse:
    """无论邮箱是否绑定了账号，都返回同样的结果，不暴露账号是否存在。"""
    settings = settings_from_request(request)
    email = normalize_email(payload.email)
    await AntiAbuseGate(settings).check(
        db,
        request,
        action="password_reset",
        identity=email,
        policy=PASSWORD_RESET_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    recent = await _recent_challenge(
        db, method=RegistrationMethod.PASSWORD_RESET, email=email, user_id=None
    )
    if recent is not None:
        return _challenge_response(recent, email)
    user = (
        await db.execute(
            select(User).where(
                User.email == email,
                User.email_verified_at.is_not(None),
                User.status == UserStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    challenge, code = await _new_challenge(
        db,
        request,
        method=RegistrationMethod.PASSWORD_RESET,
        email=email,
        user_id=user.id if user else None,
        with_code=user is not None,
    )
    if user is not None and code is not None:
        await mailer.send_code(
            recipient=email,
            code=code,
            purpose="reset",
            subject=f"[nanyee.de] 找回密码验证码: {code}（用户名 {user.username}）",
        )
    return _challenge_response(challenge, email)


@router.post("/password-reset/confirm", status_code=204, operation_id="confirm_password_reset")
async def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    settings = settings_from_request(request)
    password_hash = hash_password(payload.new_password)
    challenge = await _check_code(
        db,
        settings,
        challenge_id=payload.challenge_id,
        method=RegistrationMethod.PASSWORD_RESET,
        code=payload.code,
    )
    user = (
        await db.get(User, challenge.user_id, with_for_update=True) if challenge.user_id else None
    )
    # 发码后邮箱被换绑或账号被停用：同样按验证码无效处理
    if user is None or user.status != UserStatus.ACTIVE or user.email != challenge.email:
        await db.commit()
        raise AppError(ErrorCode.INVALID_REQUEST, "验证码错误或已过期。", status_code=422)
    now = utc_now()
    user.password_hash = password_hash
    user.password_changed_at = now
    challenge.verified_at = now
    challenge.consumed_at = now
    await db.execute(
        update(Session)
        .where(Session.user_id == user.id, Session.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.commit()
    return Response(status_code=204)
