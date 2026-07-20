from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from nanyee.config import Settings
from nanyee.credentials.service import CredentialVaultService
from nanyee.errors import AppError
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.integrations.smu.evaluation_automation import build_legacy_positive_answers
from nanyee.jobs.models import Job
from nanyee.tools.evaluation import EvaluationAutomationRequest
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee_worker.runtime import ExecutionFailure, ExecutionReceipt, ensure_execution_active
from nanyee_worker.study_cabin import DdddOcrSolver


@dataclass(frozen=True, slots=True)
class _CachedAcademicSession:
    cookies: dict[str, str]
    expires_at: float


class EvaluationHandler:
    def __init__(
        self,
        settings: Settings,
        vault: CredentialVaultService,
        solver: DdddOcrSolver,
    ) -> None:
        self._client = SmuAcademicClient(settings)
        self._vault = vault
        self._solver = solver
        self._sessions: dict[UUID, _CachedAcademicSession] = {}

    async def execute(self, db: AsyncSession, job: Job) -> ExecutionReceipt:
        if job.credential_id is None:
            raise ExecutionFailure(
                "CREDENTIAL_REQUIRED", retryable=False, next_action="replace_credential"
            )
        request = EvaluationAutomationRequest.model_validate(job.payload)
        if request.retry_until is not None and datetime.now(UTC) >= request.retry_until.astimezone(
            UTC
        ):
            raise ExecutionFailure("EVALUATION_RETRY_DEADLINE_REACHED", retryable=False)

        cookies = await self._academic_session(db, job)
        try:
            pending = await self._client.fetch_pending_evaluations(academic_cookies=cookies)
            submitted: list[dict[str, object]] = []
            for item in pending[: request.max_courses]:
                draft = await self._client.fetch_evaluation_draft(
                    academic_cookies=cookies,
                    reference=item,
                )
                selections, _ = build_legacy_positive_answers(draft)
                await ensure_execution_active(db, job)
                result = await self._client.submit_evaluation(
                    academic_cookies=cookies,
                    draft=draft,
                    selections=selections,
                )
                submitted.append(
                    {
                        "teacher_name": result.teacher_name,
                        "course_name": result.course_name,
                        "total_score": result.total_score,
                    }
                )
        except AppError as exc:
            self._sessions.pop(job.credential_id, None)
            raise ExecutionFailure(
                str(exc.code),
                retryable=True,
                next_action="automatic_retry",
            ) from exc
        return ExecutionReceipt(
            {
                "strategy": request.strategy,
                "pending_count": len(pending),
                "submitted_count": len(submitted),
                "submissions": submitted,
            }
        )

    async def _academic_session(self, db: AsyncSession, job: Job) -> dict[str, str]:
        assert job.credential_id is not None
        cached = self._sessions.get(job.credential_id)
        if cached is not None and cached.expires_at > time.monotonic():
            return dict(cached.cookies)
        account, password = await self._load_login(db, job)
        try:
            cookies = await self._login_with_backoff(account, password)
        finally:
            password = ""
        self._sessions[job.credential_id] = _CachedAcademicSession(
            cookies=dict(cookies),
            expires_at=time.monotonic() + 20 * 60,
        )
        return cookies

    async def _login_with_backoff(self, account: str, password: str) -> dict[str, str]:
        last_error: Exception | None = None
        for attempt in range(5):
            try:
                captcha = await self._client.fetch_captcha()
                solution = await self._solver.solve(captcha.image)
                return await self._client.authenticate(
                    account=account,
                    password=password,
                    captcha=solution,
                    uis_cookies=captcha.cookies,
                )
            except Exception as exc:
                last_error = exc
            if attempt < 4:
                await asyncio.sleep(2**attempt)
        raise ExecutionFailure(
            "SMU_LOGIN_RETRY",
            retryable=True,
            next_action="automatic_retry",
        ) from last_error

    async def _load_login(self, db: AsyncSession, job: Job) -> tuple[str, str]:
        assert job.credential_id is not None
        try:
            plaintext = await self._vault.decrypt_for_worker(
                db,
                credential_id=job.credential_id,
                user_id=job.user_id,
                purpose="evaluation",
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
            or not isinstance(password, str)
            or not password
        ):
            raise ExecutionFailure(
                "CREDENTIAL_INVALID", retryable=False, next_action="replace_credential"
            )
        return account, password
