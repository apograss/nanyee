from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from nanyee.client import ClientContext
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.models import Session, User, UserStatus
from nanyee.security import (
    as_utc,
    keyed_digest,
    random_token,
    secure_compare,
    sha256_digest,
    utc_now,
)


@dataclass(frozen=True, slots=True)
class SessionTokens:
    session_token: str
    csrf_token: str


@dataclass(frozen=True, slots=True)
class AuthContext:
    session: Session
    user: User


async def create_session(
    db: AsyncSession,
    *,
    user: User,
    client: ClientContext,
    settings: Settings,
) -> SessionTokens:
    now = utc_now()
    session_token = random_token()
    csrf_token = random_token()
    secret = settings.session_secret.get_secret_value()
    record = Session(
        user_id=user.id,
        token_digest=sha256_digest(session_token),
        csrf_digest=sha256_digest(csrf_token),
        expires_at=now + timedelta(seconds=settings.session_ttl_seconds),
        last_seen_at=now,
        ip_prefix_digest=keyed_digest(secret, "session-ip", client.ip_prefix),
        user_agent_digest=keyed_digest(secret, "session-agent", client.user_agent),
    )
    db.add(record)
    await db.commit()
    return SessionTokens(session_token=session_token, csrf_token=csrf_token)


async def authenticate_session(
    db: AsyncSession,
    *,
    session_token: str | None,
) -> AuthContext:
    if not session_token:
        raise AppError(
            ErrorCode.AUTHENTICATION_REQUIRED,
            "请先登录。",
            status_code=401,
        )
    statement = (
        select(Session)
        .options(joinedload(Session.user))
        .where(Session.token_digest == sha256_digest(session_token))
    )
    record = (await db.execute(statement)).scalar_one_or_none()
    now = utc_now()
    if (
        record is None
        or record.revoked_at is not None
        or as_utc(record.expires_at) <= now
        or record.user.status != UserStatus.ACTIVE
    ):
        raise AppError(
            ErrorCode.AUTHENTICATION_REQUIRED,
            "登录状态已失效，请重新登录。",
            status_code=401,
        )
    record.last_seen_at = now
    return AuthContext(session=record, user=record.user)


def validate_csrf(auth: AuthContext, csrf_cookie: str | None, csrf_header: str | None) -> None:
    if not csrf_cookie or not csrf_header or not secure_compare(csrf_cookie, csrf_header):
        raise AppError(
            ErrorCode.CSRF_VALIDATION_FAILED,
            "CSRF 校验失败。",
            status_code=403,
        )
    if not secure_compare(auth.session.csrf_digest, sha256_digest(csrf_cookie)):
        raise AppError(
            ErrorCode.CSRF_VALIDATION_FAILED,
            "CSRF 校验失败。",
            status_code=403,
        )


def set_session_cookies(response: Response, tokens: SessionTokens, settings: Settings) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        tokens.session_token,
        max_age=settings.session_ttl_seconds,
        path="/",
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        tokens.csrf_token,
        max_age=settings.session_ttl_seconds,
        path="/",
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=False,
        samesite="strict",
    )


def clear_session_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )
    response.delete_cookie(
        settings.csrf_cookie_name,
        path="/",
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=False,
        samesite="strict",
    )


def settings_from_request(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        raise RuntimeError("application settings are unavailable")
    return settings
