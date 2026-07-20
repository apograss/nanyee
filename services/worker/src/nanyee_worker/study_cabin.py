from __future__ import annotations

import asyncio
import json
import time as monotonic_time
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Protocol
from uuid import UUID

from nanyee.config import Settings
from nanyee.credentials.service import CredentialVaultService
from nanyee.integrations.infospace.client import (
    BusinessError,
    InfospaceClient,
    SessionExpired,
    SubmissionUnknown,
    UpstreamUnavailable,
)
from nanyee.integrations.infospace.sso import AuthenticationRejected, SsoAuthenticator
from nanyee.jobs.models import Job
from nanyee.tools.study_cabin import (
    SHUNDE_SINGLE_CABIN_KIND_ID,
    ReservationPayload,
    StudyCabinReservationRequest,
    choose_room,
)
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee_worker.runtime import ExecutionFailure, ExecutionReceipt, ensure_execution_active


class OcrEngine(Protocol):
    def classification(self, image: bytes) -> object: ...


class DdddOcrSolver:
    def __init__(self) -> None:
        self._engine: OcrEngine | None = None

    async def solve(self, image: bytes) -> str:
        return await asyncio.to_thread(self._solve_sync, image)

    def _solve_sync(self, image: bytes) -> str:
        if self._engine is None:
            import ddddocr  # type: ignore[import-untyped]

            self._engine = ddddocr.DdddOcr(show_ad=False, beta=True)
        return str(self._engine.classification(image)).strip()


@dataclass(frozen=True, slots=True)
class CachedSession:
    cookies: dict[str, str]
    token: str
    account: str
    expires_at: float


class SessionCache:
    def __init__(self, *, ttl_seconds: int = 20 * 60, max_entries: int = 1000) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._values: dict[UUID, CachedSession] = {}

    def get(self, credential_id: UUID) -> CachedSession | None:
        value = self._values.get(credential_id)
        if value is None:
            return None
        if value.expires_at <= monotonic_time.monotonic():
            self._values.pop(credential_id, None)
            return None
        return value

    def put(
        self, credential_id: UUID, *, cookies: dict[str, str], token: str, account: str
    ) -> None:
        if len(self._values) >= self._max_entries and credential_id not in self._values:
            oldest = min(self._values, key=lambda key: self._values[key].expires_at)
            self._values.pop(oldest, None)
        self._values[credential_id] = CachedSession(
            cookies=dict(cookies),
            token=token,
            account=account,
            expires_at=monotonic_time.monotonic() + self._ttl_seconds,
        )

    def invalidate(self, credential_id: UUID) -> None:
        self._values.pop(credential_id, None)


class StudyCabinHandler:
    def __init__(
        self,
        settings: Settings,
        vault: CredentialVaultService,
        solver: DdddOcrSolver,
        *,
        cache: SessionCache | None = None,
    ) -> None:
        self._settings = settings
        self._vault = vault
        self._authenticator = SsoAuthenticator(settings, solver)
        self._cache = cache or SessionCache()

    async def execute(self, db: AsyncSession, job: Job) -> ExecutionReceipt:
        if job.credential_id is None:
            raise ExecutionFailure(
                "CREDENTIAL_REQUIRED", retryable=False, next_action="replace_credential"
            )
        request = StudyCabinReservationRequest.model_validate(job.payload)
        if datetime.now(UTC) >= request.attempt_until.astimezone(UTC):
            raise ExecutionFailure("NO_AVAILABILITY", retryable=False)

        session = self._cache.get(job.credential_id)
        if session is None:
            account, password = await self._load_login(db, job)
            try:
                cookies = await self._authenticator.login(account, password)
                client = InfospaceClient(self._settings, cookies=cookies)
                user = await client.get_user_info()
            except AuthenticationRejected as exc:
                raise ExecutionFailure(
                    "CREDENTIAL_REJECTED", retryable=False, next_action="replace_credential"
                ) from exc
            except UpstreamUnavailable as exc:
                raise ExecutionFailure("UPSTREAM_UNAVAILABLE", retryable=True) from exc
            finally:
                password = ""
            self._cache.put(
                job.credential_id,
                cookies=cookies,
                token=user.token,
                account=user.acc_no,
            )
            session = self._cache.get(job.credential_id)
            assert session is not None

        client = InfospaceClient(
            self._settings,
            cookies=session.cookies,
            token=session.token,
        )
        try:
            rooms = await client.list_rooms(
                request.target_date,
                kind_id=SHUNDE_SINGLE_CABIN_KIND_ID,
            )
            for dev_id in request.cabin_ids:
                room = choose_room(
                    rooms,
                    ordered_dev_ids=[dev_id],
                    target_date=request.target_date,
                    start=request.start_time,
                    end=request.end_time,
                )
                if room is None:
                    continue
                payload = ReservationPayload(
                    account=session.account,
                    start=_format_datetime(request.target_date, request.start_time),
                    end=_format_datetime(request.target_date, request.end_time),
                    title=request.title,
                    dev_id=room.dev_id,
                )
                try:
                    await ensure_execution_active(db, job)
                    await client.reserve(payload)
                except BusinessError as exc:
                    if exc.code == 409:
                        continue
                    raise
                return ExecutionReceipt(
                    {
                        "dev_id": room.dev_id,
                        "room_name": room.name,
                        "target_date": request.target_date.isoformat(),
                        "start_time": request.start_time.isoformat(timespec="minutes"),
                        "end_time": request.end_time.isoformat(timespec="minutes"),
                    }
                )
        except SessionExpired as exc:
            self._cache.invalidate(job.credential_id)
            raise ExecutionFailure("SESSION_EXPIRED", retryable=True) from exc
        except SubmissionUnknown as exc:
            raise ExecutionFailure(
                "RESULT_UNKNOWN",
                retryable=False,
                result_unknown=True,
                next_action="verify_upstream",
            ) from exc
        except UpstreamUnavailable as exc:
            raise ExecutionFailure("UPSTREAM_UNAVAILABLE", retryable=True) from exc
        except BusinessError as exc:
            raise ExecutionFailure("UPSTREAM_REJECTED", retryable=False) from exc

        if datetime.now(UTC) >= request.attempt_until.astimezone(UTC):
            raise ExecutionFailure("NO_AVAILABILITY", retryable=False)
        raise ExecutionFailure("NO_AVAILABILITY", retryable=True)

    async def _load_login(self, db: AsyncSession, job: Job) -> tuple[str, str]:
        assert job.credential_id is not None
        try:
            plaintext = await self._vault.decrypt_for_worker(
                db,
                credential_id=job.credential_id,
                user_id=job.user_id,
                purpose="study_cabin",
            )
        except Exception as exc:
            raise ExecutionFailure(
                "CREDENTIAL_UNAVAILABLE", retryable=False, next_action="replace_credential"
            ) from exc
        buffer = bytearray(plaintext)
        try:
            data = json.loads(buffer.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ExecutionFailure(
                "CREDENTIAL_INVALID", retryable=False, next_action="replace_credential"
            ) from exc
        finally:
            buffer[:] = b"\x00" * len(buffer)
        if not isinstance(data, dict):
            raise ExecutionFailure(
                "CREDENTIAL_INVALID", retryable=False, next_action="replace_credential"
            )
        account = data.get("account")
        password = data.get("password")
        if (
            not isinstance(account, str)
            or not account
            or len(account) > 64
            or not isinstance(password, str)
            or not password
            or len(password) > 256
        ):
            raise ExecutionFailure(
                "CREDENTIAL_INVALID", retryable=False, next_action="replace_credential"
            )
        return account, password


def _format_datetime(target_date: date, target_time: time) -> str:
    return datetime.combine(target_date, target_time).strftime("%Y-%m-%d %H:%M:%S")
