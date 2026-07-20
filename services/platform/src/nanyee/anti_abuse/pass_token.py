from __future__ import annotations

import hashlib
import hmac
import json
from datetime import timedelta
from typing import Any

from pydantic import BaseModel, ValidationError

from nanyee.security import base64url_decode, base64url_encode, utc_now


class AntiAbusePassClaims(BaseModel):
    version: int = 1
    action: str
    subject: str
    expires_at: int


class AntiAbusePassSigner:
    def __init__(self, secret: str, *, ttl_seconds: int = 300) -> None:
        self._secret = secret.encode("utf-8")
        self._ttl_seconds = ttl_seconds

    def issue(self, *, action: str, subject: str) -> str:
        expires_at = int((utc_now() + timedelta(seconds=self._ttl_seconds)).timestamp())
        claims = AntiAbusePassClaims(action=action, subject=subject, expires_at=expires_at)
        payload = json.dumps(claims.model_dump(), sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
        signature = hmac.new(self._secret, payload, hashlib.sha256).digest()
        return f"{base64url_encode(payload)}.{base64url_encode(signature)}"

    def verify(self, token: str, *, action: str, subject: str) -> bool:
        try:
            encoded_payload, encoded_signature = token.split(".", maxsplit=1)
            payload = base64url_decode(encoded_payload)
            signature = base64url_decode(encoded_signature)
            expected = hmac.new(self._secret, payload, hashlib.sha256).digest()
            if not hmac.compare_digest(signature, expected):
                return False
            raw: Any = json.loads(payload)
            claims = AntiAbusePassClaims.model_validate(raw)
        except (ValueError, TypeError, json.JSONDecodeError, ValidationError):
            return False
        return (
            claims.version == 1
            and claims.action == action
            and claims.subject == subject
            and claims.expires_at >= int(utc_now().timestamp())
        )
