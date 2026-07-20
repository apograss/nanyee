from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.pass_token import AntiAbusePassSigner
from nanyee.anti_abuse.rate_limit import DatabaseRateLimiter, RateLimitPolicy
from nanyee.anti_abuse.turnstile import CloudflareTurnstileProvider
from nanyee.client import client_subject_digest, get_client_context
from nanyee.config import Settings
from nanyee.errors import AppError, ErrorCode


@dataclass(frozen=True, slots=True)
class GateResult:
    issued_pass: str | None = None


class AntiAbuseGate:
    def __init__(
        self,
        settings: Settings,
        *,
        limiter: DatabaseRateLimiter | None = None,
        provider: CloudflareTurnstileProvider | None = None,
    ) -> None:
        self._settings = settings
        self._limiter = limiter or DatabaseRateLimiter()
        self._provider = provider or CloudflareTurnstileProvider(settings)
        self._pass_signer = AntiAbusePassSigner(settings.session_secret.get_secret_value())

    async def check(
        self,
        session: AsyncSession,
        request: Request,
        *,
        action: str,
        identity: str,
        policy: RateLimitPolicy,
        turnstile_token: str | None = None,
        anti_abuse_pass: str | None = None,
    ) -> GateResult:
        context = get_client_context(request, self._settings)
        subject = client_subject_digest(self._settings, context, action=action, identity=identity)
        pass_valid = bool(
            anti_abuse_pass
            and self._pass_signer.verify(anti_abuse_pass, action=action, subject=subject)
        )
        decision = await self._limiter.hit(
            session,
            action=action,
            subject_digest=subject,
            policy=policy,
            human_verified=pass_valid,
        )
        await session.commit()

        if not decision.challenge_required and not decision.allowed:
            raise AppError(
                ErrorCode.RATE_LIMITED,
                "请求过于频繁，请稍后再试。",
                status_code=429,
                retryable=True,
                headers={"Retry-After": str(decision.retry_after_seconds)},
            )
        if decision.allowed:
            return GateResult()
        if not self._settings.turnstile_enabled:
            return GateResult()

        if not turnstile_token:
            raise AppError(
                ErrorCode.RATE_LIMIT_CHALLENGE_REQUIRED,
                "请完成人机验证后重试。",
                status_code=429,
                retryable=True,
                details={
                    "provider": "cloudflare_turnstile",
                    "sitekey": self._settings.turnstile_site_key,
                    "action": action,
                },
                headers={"Retry-After": str(decision.retry_after_seconds)},
            )
        verification = await self._provider.verify(
            token=turnstile_token,
            remote_ip=context.ip,
            expected_action=action,
        )
        if not verification.valid:
            if verification.unavailable:
                raise AppError(
                    ErrorCode.UPSTREAM_UNAVAILABLE,
                    "人机验证服务暂时不可用。",
                    status_code=503,
                    retryable=True,
                )
            raise AppError(
                ErrorCode.HUMAN_VERIFICATION_FAILED,
                "人机验证失败，请重新验证。",
                status_code=403,
                retryable=True,
            )
        verified_limit = min(policy.hard_limit, policy.soft_limit + policy.verified_extra_limit)
        if decision.count > verified_limit:
            raise AppError(
                ErrorCode.RATE_LIMITED,
                "请求过于频繁，请稍后再试。",
                status_code=429,
                retryable=True,
                headers={"Retry-After": str(decision.retry_after_seconds)},
            )
        issued_pass = self._pass_signer.issue(action=action, subject=subject)
        request.state.anti_abuse_pass = issued_pass
        return GateResult(issued_pass=issued_pass)
