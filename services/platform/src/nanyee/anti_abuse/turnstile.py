from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import uuid4

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from nanyee.config import Settings
from nanyee.security import as_utc, utc_now


class HumanVerificationResult(BaseModel):
    valid: bool
    unavailable: bool = False
    reason: str | None = None


class HumanVerificationProvider(Protocol):
    async def verify(
        self, *, token: str, remote_ip: str | None, expected_action: str
    ) -> HumanVerificationResult: ...


class _TurnstileResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    success: bool
    challenge_ts: datetime | None = None
    hostname: str | None = None
    action: str | None = None
    error_codes: list[str] = Field(default_factory=list, alias="error-codes")


class CloudflareTurnstileProvider:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def verify(
        self, *, token: str, remote_ip: str | None, expected_action: str
    ) -> HumanVerificationResult:
        if not self._settings.turnstile_enabled:
            return HumanVerificationResult(valid=False, reason="provider_disabled")
        if not token or len(token) > 2048:
            return HumanVerificationResult(valid=False, reason="invalid_token")

        assert self._settings.turnstile_secret_key is not None
        payload = {
            "secret": self._settings.turnstile_secret_key.get_secret_value(),
            "response": token,
            "idempotency_key": str(uuid4()),
        }
        if remote_ip:
            payload["remoteip"] = remote_ip

        try:
            if self._client is not None:
                response = await self._client.post(
                    self._settings.turnstile_verify_url,
                    data=payload,
                    timeout=self._settings.turnstile_timeout_seconds,
                )
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        self._settings.turnstile_verify_url,
                        data=payload,
                        timeout=self._settings.turnstile_timeout_seconds,
                    )
            response.raise_for_status()
            result = _TurnstileResponse.model_validate(response.json())
        except (httpx.HTTPError, ValueError, ValidationError):
            return HumanVerificationResult(
                valid=False, unavailable=True, reason="provider_unavailable"
            )

        if not result.success:
            reason = (
                "token_expired_or_replayed"
                if "timeout-or-duplicate" in result.error_codes
                else "rejected"
            )
            return HumanVerificationResult(valid=False, reason=reason)
        if result.hostname not in self._settings.turnstile_expected_hostnames:
            return HumanVerificationResult(valid=False, reason="hostname_mismatch")
        if result.action != expected_action:
            return HumanVerificationResult(valid=False, reason="action_mismatch")
        if result.challenge_ts is None:
            return HumanVerificationResult(valid=False, reason="missing_timestamp")
        age = (utc_now() - as_utc(result.challenge_ts)).total_seconds()
        if age < -30 or age > 300:
            return HumanVerificationResult(valid=False, reason="token_expired")
        return HumanVerificationResult(valid=True)
