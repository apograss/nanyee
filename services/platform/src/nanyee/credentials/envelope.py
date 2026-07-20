from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from nanyee.credentials.key_wrapping import KeyWrappingProvider, WrappedKey


@dataclass(frozen=True, slots=True)
class CredentialContext:
    credential_id: UUID
    user_id: UUID
    upstream: str
    purpose: str
    envelope_version: int = 1

    def aad(self) -> bytes:
        payload = {
            "credential_id": str(self.credential_id),
            "envelope_version": self.envelope_version,
            "purpose": self.purpose,
            "upstream": self.upstream,
            "user_id": str(self.user_id),
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


@dataclass(frozen=True, slots=True)
class CredentialEnvelope:
    ciphertext: bytes
    nonce: bytes
    wrapped_data_key: bytes
    key_reference: str
    key_wrap_algorithm: str
    envelope_version: int


class EnvelopeCipher:
    def __init__(self, key_provider: KeyWrappingProvider) -> None:
        self._key_provider = key_provider

    async def encrypt(self, plaintext: bytes, context: CredentialContext) -> CredentialEnvelope:
        if not plaintext:
            raise ValueError("credential plaintext cannot be empty")
        data_key = secrets.token_bytes(32)
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(data_key).encrypt(nonce, plaintext, context.aad())
        wrapped = await self._key_provider.wrap(data_key)
        return CredentialEnvelope(
            ciphertext=ciphertext,
            nonce=nonce,
            wrapped_data_key=wrapped.ciphertext,
            key_reference=wrapped.key_reference,
            key_wrap_algorithm=wrapped.algorithm,
            envelope_version=context.envelope_version,
        )

    async def decrypt(self, envelope: CredentialEnvelope, context: CredentialContext) -> bytes:
        if context.envelope_version != envelope.envelope_version:
            raise ValueError("credential envelope version mismatch")
        data_key = await self._key_provider.unwrap(
            WrappedKey(
                ciphertext=envelope.wrapped_data_key,
                key_reference=envelope.key_reference,
                algorithm=envelope.key_wrap_algorithm,
            )
        )
        return AESGCM(data_key).decrypt(envelope.nonce, envelope.ciphertext, context.aad())


def redact_credential_metadata(metadata: dict[str, Any]) -> dict[str, str | int | bool | None]:
    allowed = {"account_hint", "credential_kind", "region"}
    result: dict[str, str | int | bool | None] = {}
    for key, value in metadata.items():
        if key not in allowed or not isinstance(value, (str, int, bool, type(None))):
            continue
        result[key] = value[:200] if isinstance(value, str) else value
    return result
