from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta

from nanyee.security import random_token, utc_now


@dataclass(slots=True)
class _SecretEntry:
    value: bytearray
    kind: str
    expires_at: datetime


class TransientSecretStore:
    def __init__(self, *, ttl_seconds: int = 300, max_entries: int = 1000) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._entries: dict[str, _SecretEntry] = {}
        self._lock = asyncio.Lock()

    async def put(self, value: bytes, *, kind: str) -> tuple[str, datetime]:
        if not value:
            raise ValueError("transient secret cannot be empty")
        now = utc_now()
        expires_at = now + timedelta(seconds=self._ttl_seconds)
        async with self._lock:
            self._purge_expired(now)
            if len(self._entries) >= self._max_entries:
                oldest_key = min(self._entries, key=lambda key: self._entries[key].expires_at)
                self._wipe_and_remove(oldest_key)
            key = random_token()
            self._entries[key] = _SecretEntry(
                value=bytearray(value), kind=kind, expires_at=expires_at
            )
        return key, expires_at

    async def get(self, key: str, *, kind: str) -> bytes | None:
        now = utc_now()
        async with self._lock:
            self._purge_expired(now)
            entry = self._entries.get(key)
            if entry is None or entry.kind != kind:
                return None
            return bytes(entry.value)

    async def take(self, key: str, *, kind: str) -> bytes | None:
        async with self._lock:
            self._purge_expired(utc_now())
            entry = self._entries.get(key)
            if entry is None or entry.kind != kind:
                return None
            value = bytes(entry.value)
            self._wipe_and_remove(key)
            return value

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._wipe_and_remove(key)

    async def close(self) -> None:
        async with self._lock:
            for key in tuple(self._entries):
                self._wipe_and_remove(key)

    def _purge_expired(self, now: datetime) -> None:
        for key, entry in tuple(self._entries.items()):
            if entry.expires_at <= now:
                self._wipe_and_remove(key)

    def _wipe_and_remove(self, key: str) -> None:
        entry = self._entries.pop(key, None)
        if entry is not None:
            entry.value[:] = b"\x00" * len(entry.value)
