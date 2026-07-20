from __future__ import annotations

import re
import secrets
from datetime import timedelta
from typing import Annotated, Literal, cast
from uuid import UUID, uuid4

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.gate import AntiAbuseGate
from nanyee.anti_abuse.rate_limit import RateLimitPolicy
from nanyee.client import client_subject_digest, get_client_context
from nanyee.db import get_db_session
from nanyee.errors import AppError, ErrorCode
from nanyee.identity.models import RegistrationTrustLevel, User
from nanyee.identity.passwords import hash_password
from nanyee.identity.router import AuthResponse, UserResponse
from nanyee.identity.sessions import create_session, set_session_cookies, settings_from_request
from nanyee.registration.mailer import SmtpVerificationMailer, VerificationMailer
from nanyee.registration.models import RegistrationChallenge, RegistrationMethod
from nanyee.registration.quiz import grade_answers, load_quiz_bank, pick_question_ids
from nanyee.security import as_utc, keyed_digest, secure_compare, utc_now

router = APIRouter(prefix="/registration", tags=["registration"])
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{2,24}$")
EMAIL_POLICY = RateLimitPolicy(window_seconds=3600, soft_limit=3, hard_limit=8)
QUIZ_POLICY = RateLimitPolicy(window_seconds=3600, soft_limit=5, hard_limit=15)
REGISTER_POLICY = RateLimitPolicy(window_seconds=3600, soft_limit=5, hard_limit=12)


class ChallengeCreateRequest(BaseModel):
    method: Literal["email", "quiz"]
    email: str | None = Field(default=None, max_length=254)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)

    @model_validator(mode="after")
    def require_email_for_email_method(self) -> ChallengeCreateRequest:
        if self.method == "email" and not self.email:
            raise ValueError("email is required for email registration")
        if self.method == "quiz" and self.email is not None:
            raise ValueError("email is not accepted for quiz registration")
        return self


class QuizQuestionResponse(BaseModel):
    id: int
    question: str
    options: tuple[str, ...]


class ChallengeResponse(BaseModel):
    challenge_id: UUID
    method: RegistrationMethod
    expires_at: str
    resend_at: str | None = None
    masked_email: str | None = None
    questions: list[QuizQuestionResponse] = Field(default_factory=list)
    total_questions: int | None = None
    pass_score: int | None = None


class ChallengeVerifyRequest(BaseModel):
    code: str | None = Field(default=None, pattern=r"^\d{6}$")
    answers: list[int] | None = None


class ChallengeVerifyResponse(BaseModel):
    verified: bool
    attempts_remaining: int
    score: int | None = None
    required_score: int | None = None


class RegisterRequest(BaseModel):
    challenge_id: UUID
    username: str = Field(min_length=2, max_length=24)
    password: str = Field(min_length=8, max_length=128)
    nickname: str | None = Field(default=None, min_length=1, max_length=30)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    anti_abuse_pass: str | None = Field(default=None, max_length=4096)


def normalize_edu_email(value: str, suffixes: list[str]) -> str:
    try:
        result = validate_email(value, check_deliverability=False)
    except EmailNotValidError as exc:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "请输入有效的教育邮箱。",
            status_code=422,
            details={"field": "email"},
        ) from exc
    normalized = result.normalized.casefold()
    if not any(normalized.endswith(suffix.casefold()) for suffix in suffixes):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "仅支持 .edu.cn 教育邮箱。",
            status_code=422,
            details={"field": "email"},
        )
    return normalized


def mask_email(value: str) -> str:
    local, domain = value.split("@", maxsplit=1)
    visible = local[:2]
    return f"{visible}{'*' * max(1, len(local) - len(visible))}@{domain}"


def get_mailer(request: Request) -> VerificationMailer:
    mailer = getattr(request.app.state, "verification_mailer", None)
    if mailer is not None:
        return cast(VerificationMailer, mailer)
    return SmtpVerificationMailer(settings_from_request(request))


@router.post("/challenges", response_model=ChallengeResponse, operation_id="create_challenge")
async def create_challenge(
    payload: ChallengeCreateRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    mailer: Annotated[VerificationMailer, Depends(get_mailer)],
) -> ChallengeResponse:
    settings = settings_from_request(request)
    email = (
        normalize_edu_email(payload.email, settings.edu_email_suffixes) if payload.email else None
    )
    action = f"registration_{payload.method}"
    identity = email or "quiz"
    await AntiAbuseGate(settings).check(
        db,
        request,
        action=action,
        identity=identity,
        policy=EMAIL_POLICY if email else QUIZ_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )

    now = utc_now()
    expires_at = now + timedelta(seconds=settings.registration_challenge_ttl_seconds)
    context = get_client_context(request, settings)
    requester_digest = client_subject_digest(
        settings, context, action="registration_challenge", identity=identity
    )
    challenge_id = uuid4()

    if email:
        recent = (
            (
                await db.execute(
                    select(RegistrationChallenge).where(
                        RegistrationChallenge.method == RegistrationMethod.EMAIL,
                        RegistrationChallenge.email == email,
                        RegistrationChallenge.created_at > now - timedelta(seconds=60),
                    )
                )
            )
            .scalars()
            .first()
        )
        if recent is not None:
            return ChallengeResponse(
                challenge_id=recent.id,
                method=recent.method,
                expires_at=as_utc(recent.expires_at).isoformat(),
                resend_at=(as_utc(recent.created_at) + timedelta(seconds=60)).isoformat(),
                masked_email=mask_email(email),
            )
        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge = RegistrationChallenge(
            id=challenge_id,
            method=RegistrationMethod.EMAIL,
            email=email,
            code_digest=keyed_digest(
                settings.session_secret.get_secret_value(),
                "registration-code",
                str(challenge_id),
                code,
            ),
            expires_at=expires_at,
            requester_digest=requester_digest,
        )
        db.add(challenge)
        await db.commit()
        await mailer.send_registration_code(recipient=email, code=code)
        return ChallengeResponse(
            challenge_id=challenge.id,
            method=challenge.method,
            expires_at=expires_at.isoformat(),
            resend_at=(now + timedelta(seconds=60)).isoformat(),
            masked_email=mask_email(email),
        )

    question_ids = pick_question_ids(settings.quiz_question_count)
    challenge = RegistrationChallenge(
        id=challenge_id,
        method=RegistrationMethod.QUIZ,
        question_ids=question_ids,
        expires_at=expires_at,
        requester_digest=requester_digest,
    )
    db.add(challenge)
    await db.commit()
    bank = load_quiz_bank()
    return ChallengeResponse(
        challenge_id=challenge.id,
        method=challenge.method,
        expires_at=expires_at.isoformat(),
        questions=[
            QuizQuestionResponse(
                id=index,
                question=bank[question_id].content,
                options=bank[question_id].options,
            )
            for index, question_id in enumerate(question_ids)
        ],
        total_questions=settings.quiz_question_count,
        pass_score=settings.quiz_pass_score,
    )


@router.post(
    "/challenges/{challenge_id}/verify",
    response_model=ChallengeVerifyResponse,
    operation_id="verify_challenge",
)
async def verify_challenge(
    challenge_id: UUID,
    payload: ChallengeVerifyRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> ChallengeVerifyResponse:
    settings = settings_from_request(request)
    challenge = (
        await db.execute(
            select(RegistrationChallenge)
            .where(RegistrationChallenge.id == challenge_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    now = utc_now()
    if challenge is None:
        raise AppError(ErrorCode.NOT_FOUND, "注册验证不存在。", status_code=404)
    if challenge.consumed_at is not None:
        raise AppError(ErrorCode.CONFLICT, "注册验证已被使用。", status_code=409)
    if as_utc(challenge.expires_at) <= now:
        raise AppError(ErrorCode.INVALID_REQUEST, "注册验证已过期。", status_code=410)
    if challenge.verified_at is not None:
        return ChallengeVerifyResponse(
            verified=True,
            attempts_remaining=max(
                0, settings.registration_challenge_max_attempts - challenge.attempts
            ),
        )
    if challenge.attempts >= settings.registration_challenge_max_attempts:
        raise AppError(
            ErrorCode.RATE_LIMITED,
            "验证次数已用完，请重新开始。",
            status_code=429,
        )

    challenge.attempts += 1
    score: int | None = None
    if challenge.method == RegistrationMethod.EMAIL:
        if payload.code is None or challenge.code_digest is None:
            passed = False
        else:
            candidate = keyed_digest(
                settings.session_secret.get_secret_value(),
                "registration-code",
                str(challenge.id),
                payload.code,
            )
            passed = secure_compare(challenge.code_digest, candidate)
    else:
        answers = payload.answers or []
        score = grade_answers(challenge.question_ids or [], answers)
        passed = score >= settings.quiz_pass_score

    if passed:
        challenge.verified_at = now
    await db.commit()
    remaining = max(0, settings.registration_challenge_max_attempts - challenge.attempts)
    if not passed:
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "验证未通过。",
            status_code=422,
            details={
                "attempts_remaining": remaining,
                **(
                    {"score": score, "required_score": settings.quiz_pass_score}
                    if score is not None
                    else {}
                ),
            },
        )
    return ChallengeVerifyResponse(
        verified=True,
        attempts_remaining=remaining,
        score=score,
        required_score=settings.quiz_pass_score if score is not None else None,
    )


@router.post("", response_model=AuthResponse, status_code=201, operation_id="register")
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthResponse:
    settings = settings_from_request(request)
    if not USERNAME_PATTERN.fullmatch(payload.username):
        raise AppError(
            ErrorCode.INVALID_REQUEST,
            "用户名只能包含字母、数字和下划线。",
            status_code=422,
            details={"field": "username"},
        )
    normalized_username = payload.username.casefold()
    await AntiAbuseGate(settings).check(
        db,
        request,
        action="register",
        identity=normalized_username,
        policy=REGISTER_POLICY,
        turnstile_token=payload.turnstile_token,
        anti_abuse_pass=payload.anti_abuse_pass,
    )
    password_hash = hash_password(payload.password)
    challenge = (
        await db.execute(
            select(RegistrationChallenge)
            .where(RegistrationChallenge.id == payload.challenge_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    now = utc_now()
    if challenge is None:
        raise AppError(ErrorCode.NOT_FOUND, "注册验证不存在。", status_code=404)
    if challenge.consumed_at is not None:
        raise AppError(ErrorCode.CONFLICT, "注册验证已被使用。", status_code=409)
    if challenge.verified_at is None or as_utc(challenge.expires_at) <= now:
        raise AppError(ErrorCode.INVALID_REQUEST, "注册验证无效或已过期。", status_code=422)

    user = User(
        username=payload.username,
        username_normalized=normalized_username,
        nickname=payload.nickname or payload.username,
        email=challenge.email if challenge.method == RegistrationMethod.EMAIL else None,
        email_verified_at=now if challenge.method == RegistrationMethod.EMAIL else None,
        password_hash=password_hash,
        registration_trust_level=(
            RegistrationTrustLevel.EDU_EMAIL
            if challenge.method == RegistrationMethod.EMAIL
            else RegistrationTrustLevel.COMMUNITY_QUIZ
        ),
    )
    challenge.consumed_at = now
    db.add(user)
    try:
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError(
            ErrorCode.CONFLICT,
            "用户名或邮箱已被使用。",
            status_code=409,
        ) from exc

    tokens = await create_session(
        db,
        user=user,
        client=get_client_context(request, settings),
        settings=settings,
    )
    set_session_cookies(response, tokens, settings)
    return AuthResponse(user=UserResponse.from_user(user))
