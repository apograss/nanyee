from __future__ import annotations

import asyncio
import json
import logging
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

logger = logging.getLogger(__name__)


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
        logs: list[dict[str, object]] = []
        self._log(job, logs, "evaluation_started", "自动评课任务开始。")
        if request.retry_until is not None and datetime.now(UTC) >= request.retry_until.astimezone(
            UTC
        ):
            raise ExecutionFailure("EVALUATION_RETRY_DEADLINE_REACHED", retryable=False)

        cookies = await self._academic_session(db, job)
        try:
            pending = await self._client.fetch_pending_evaluations(academic_cookies=cookies)
            self._log(
                job,
                logs,
                "evaluation_pending_loaded",
                f"已读取 {len(pending)} 门待评课程。",
                pending_count=len(pending),
            )
            submitted: list[dict[str, object]] = []
            for index, item in enumerate(pending[: request.max_courses], start=1):
                self._log(
                    job,
                    logs,
                    "evaluation_course_started",
                    f"开始提交第 {index} 门课程：{item.course_name}。",
                    course_index=index,
                    course_name=item.course_name,
                )
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
                self._log(
                    job,
                    logs,
                    "evaluation_course_succeeded",
                    f"第 {index} 门课程提交成功：{result.course_name}。",
                    course_index=index,
                    course_name=result.course_name,
                    submitted_count=len(submitted),
                )
        except AppError as exc:
            self._sessions.pop(job.credential_id, None)
            self._log(
                job,
                logs,
                "evaluation_upstream_error",
                f"评课请求失败，将按策略重试：{exc.code}。",
                level=logging.WARNING,
            )
            raise ExecutionFailure(
                str(exc.code),
                retryable=True,
                next_action="automatic_retry",
            ) from exc
        self._log(
            job,
            logs,
            "evaluation_completed",
            f"自动评课完成，成功提交 {len(submitted)} 门。",
            submitted_count=len(submitted),
        )
        return ExecutionReceipt(
            {
                "strategy": request.strategy,
                "pending_count": len(pending),
                "submitted_count": len(submitted),
                "submissions": submitted,
                "logs": logs,
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
                logger.info(
                    "正在尝试登录教务系统并识别验证码。",
                    extra={"event": "evaluation_login_attempt", "attempt": attempt + 1},
                )
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
                logger.warning(
                    "教务登录或验证码识别失败，将放缓后重试。",
                    extra={"event": "evaluation_login_retry", "attempt": attempt + 1},
                )
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

    @staticmethod
    def _log(
        job: Job,
        logs: list[dict[str, object]],
        event: str,
        message: str,
        *,
        level: int = logging.INFO,
        **fields: object,
    ) -> None:
        entry: dict[str, object] = {
            "time": datetime.now(UTC).isoformat(),
            "event": event,
            "message": message,
        }
        entry.update(fields)
        logs.append(entry)
        logger.log(
            level,
            message,
            extra={"event": event, "job_id": str(job.id), "tool_id": "evaluation", **fields},
        )
