from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.client import get_client_context
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.models import RegistrationTrustLevel, User, UserRole, UserStatus
from nanyee.identity.passwords import password_needs_rehash, verify_password
from nanyee.identity.sessions import (
    AuthContext,
    authenticate_session,
    clear_session_cookies,
    create_session,
    set_session_cookies,
    settings_from_request,
    validate_csrf,
)
from nanyee.security import utc_now

router = APIRouter(prefix="/auth", tags=["authentication"])
LOGIN_POLICY = RateLimitPolicy(
    window_seconds=10 * 60, soft_limit=5, hard_limit=12, verified_extra_limit=3
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=24)
    password: str = Field(min_length=1, max_length=128)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


class UserResponse(BaseModel):
    id: UUID
    username: str
    nickname: str
    email: str | None
    role: UserRole
    status: UserStatus
    registration_trust_level: RegistrationTrustLevel

    @classmethod
    def from_user(cls, user: User) -> UserResponse:
        return cls.model_validate(
            {
                "id": user.id,
                "username": user.username,
                "nickname": user.nickname,
                "email": user.email,
                "role": user.role,
                "status": user.status,
                "registration_trust_level": user.registration_trust_level,
            }
        )


class AuthResponse(BaseModel):
    user: UserResponse
    csrf_header: str = "X-CSRF-Token"


async def current_auth(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthContext:
    settings = settings_from_request(request)
    return await authenticate_session(
        db, session_token=request.cookies.get(settings.session_cookie_name)
    )


@router.post("/login", response_model=AuthResponse, operation_id="auth_login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthResponse:
    settings = settings_from_request(request)
    normalized = payload.username.casefold()
    gate = AntiAbuseGate(settings)
    await gate.check(
        db,
        request,
        action="login",
        identity=normalized,
        policy=LOGIN_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )

    user = (
        await db.execute(select(User).where(User.username_normalized == normalized))
    ).scalar_one_or_none()
    if user is None or not verify_password(user.password_hash, payload.password):
        raise AppError(
            ErrorCode.INVALID_CREDENTIALS,
            "用户名或密码错误。",
            status_code=401,
        )
    if user.status != UserStatus.ACTIVE:
        raise AppError(
            ErrorCode.INVALID_CREDENTIALS,
            "用户名或密码错误。",
            status_code=401,
        )
    if password_needs_rehash(user.password_hash):
        from nanyee.identity.passwords import hash_password

        user.password_hash = hash_password(payload.password)
        user.password_changed_at = utc_now()

    tokens = await create_session(
        db,
        user=user,
        client=get_client_context(request, settings),
        settings=settings,
    )
    set_session_cookies(response, tokens, settings)
    return AuthResponse(user=UserResponse.from_user(user))


@router.get("/me", response_model=AuthResponse, operation_id="auth_me")
async def me(auth: Annotated[AuthContext, Depends(current_auth)]) -> AuthResponse:
    return AuthResponse(user=UserResponse.from_user(auth.user))


@router.post("/logout", status_code=204, operation_id="auth_logout")
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Response:
    settings = settings_from_request(request)
    validate_csrf(
        auth,
        request.cookies.get(settings.csrf_cookie_name),
        csrf_header,
    )
    auth.session.revoked_at = datetime.now(UTC)
    await db.commit()
    clear_session_cookies(response, settings)
    response.status_code = 204
    return response
