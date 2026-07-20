from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from nanyee.errors import AppError
from nanyee.integrations.smu.client import SmuAcademicClient
from nanyee.security import random_token, utc_now
from nanyee.tools.course_selection import (
    CourseItem,
    EnrollmentResult,
    EnrollmentRun,
    EnrollmentRunEvent,
    EnrollmentRunState,
)

SHANGHAI = ZoneInfo("Asia/Shanghai")
TERMINAL_STATES = {
    EnrollmentRunState.SUCCEEDED,
    EnrollmentRunState.FAILED,
    EnrollmentRunState.CANCELLED,
}


@dataclass(slots=True)
class _RunRecord:
    id: str
    user_id: UUID
    category_code: str
    preferences: list[CourseItem]
    cookies: dict[str, str]
    scheduled_time: str | None
    max_attempts: int
    primary_burst_attempts: int
    confirm_conflicts: bool
    state: EnrollmentRunState = EnrollmentRunState.CALIBRATING
    run_at: datetime | None = None
    attempt_count: int = 0
    result: EnrollmentResult | None = None
    events: list[EnrollmentRunEvent] = field(default_factory=list)
    created_at: datetime = field(default_factory=utc_now)
    finished_at: datetime | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task[None] | None = None


class EnrollmentRunManager:
    def __init__(
        self,
        client: SmuAcademicClient,
        *,
        max_runs: int = 1000,
        event_limit: int = 500,
        delay_min_seconds: float = 0.5,
        delay_max_seconds: float = 1.0,
    ) -> None:
        self._client = client
        self._max_runs = max_runs
        self._event_limit = event_limit
        self._delay_min_seconds = delay_min_seconds
        self._delay_max_seconds = delay_max_seconds
        self._records: dict[str, _RunRecord] = {}
        self._lock = asyncio.Lock()
        self._random = random.SystemRandom()

    async def create(
        self,
        *,
        user_id: UUID,
        category_code: str,
        preferences: list[CourseItem],
        cookies: dict[str, str],
        scheduled_time: str | None,
        max_attempts: int,
        primary_burst_attempts: int,
        confirm_conflicts: bool,
    ) -> EnrollmentRun:
        record = _RunRecord(
            id=random_token(24),
            user_id=user_id,
            category_code=category_code,
            preferences=list(preferences),
            cookies=dict(cookies),
            scheduled_time=scheduled_time,
            max_attempts=max_attempts,
            primary_burst_attempts=min(primary_burst_attempts, max_attempts),
            confirm_conflicts=confirm_conflicts,
        )
        async with self._lock:
            self._purge_finished()
            if len(self._records) >= self._max_runs:
                raise RuntimeError("too many enrollment runs")
            self._records[record.id] = record
            record.task = asyncio.create_task(
                self._execute(record), name=f"enrollment:{record.id[:8]}"
            )
        return self._public(record)

    async def get(self, run_id: str, *, user_id: UUID) -> EnrollmentRun | None:
        async with self._lock:
            record = self._records.get(run_id)
            if record is None or record.user_id != user_id:
                return None
            return self._public(record)

    async def cancel(self, run_id: str, *, user_id: UUID) -> EnrollmentRun | None:
        async with self._lock:
            record = self._records.get(run_id)
            if record is None or record.user_id != user_id:
                return None
            if record.state not in TERMINAL_STATES:
                record.cancel_event.set()
                self._finish(record, EnrollmentRunState.CANCELLED)
                self._log(record, "cancelled", "用户已取消自动选课。")
            return self._public(record)

    async def close(self) -> None:
        async with self._lock:
            tasks = []
            for record in self._records.values():
                record.cancel_event.set()
                if record.task is not None and not record.task.done():
                    record.task.cancel()
                    tasks.append(record.task)
                record.cookies.clear()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _execute(self, record: _RunRecord) -> None:
        try:
            self._log(record, "calibrating", "正在校准教务系统时间。")
            offset_ms = await self._client.calibrate_server_time(academic_cookies=record.cookies)
            self._log(
                record,
                "calibrating",
                f"校时完成，服务器与本机差值 {offset_ms / 1000:.3f} 秒。",
            )
            if record.scheduled_time:
                record.run_at = compute_run_at(record.scheduled_time, offset_ms)
                record.state = EnrollmentRunState.WAITING
                self._log(
                    record,
                    "waiting",
                    f"将在教务系统时间 {record.scheduled_time} 开始自动选课。",
                )
                if not await self._wait_until(record, record.run_at):
                    return
            if record.cancel_event.is_set():
                return
            record.state = EnrollmentRunState.RUNNING
            self._log(record, "info", "开始自动选课。")
            await self._attempt_courses(record)
        except asyncio.CancelledError:
            if record.state not in TERMINAL_STATES:
                self._finish(record, EnrollmentRunState.CANCELLED)
            raise
        except Exception as exc:
            self._log(record, "error", f"自动选课异常终止：{type(exc).__name__}。")
            self._finish(record, EnrollmentRunState.FAILED)
        finally:
            record.cookies.clear()

    async def _attempt_courses(self, record: _RunRecord) -> None:
        last_message = "未收到教务系统结果"
        for index in range(record.max_attempts):
            if record.cancel_event.is_set():
                return
            preference_index = (
                0
                if index < record.primary_burst_attempts
                else (index - record.primary_burst_attempts) % len(record.preferences)
            )
            course = record.preferences[preference_index]
            record.attempt_count = index + 1
            self._log(
                record,
                "attempt",
                f"[{index + 1}/{record.max_attempts}] 正在尝试 {course.name}。",
                attempt=index + 1,
                course_name=course.name,
            )
            try:
                result = await self._client.enroll_course(
                    academic_cookies=record.cookies,
                    category_code=record.category_code,
                    course=course,
                )
                if record.cancel_event.is_set():
                    return
                last_message = result.message or result.outcome
                if result.success:
                    record.result = result
                    self._log(record, "success", _success_message(result))
                    self._finish(record, EnrollmentRunState.SUCCEEDED)
                    return
                if result.outcome == "conflict" and record.confirm_conflicts:
                    self._log(record, "info", f"检测到冲突，正在确认选择 {course.name}。")
                    confirmed = await self._client.enroll_course(
                        academic_cookies=record.cookies,
                        category_code=record.category_code,
                        course=course,
                        confirm_conflict=True,
                    )
                    if record.cancel_event.is_set():
                        return
                    last_message = confirmed.message or confirmed.outcome
                    if confirmed.success:
                        record.result = confirmed
                        self._log(record, "success", _success_message(confirmed, conflict=True))
                        self._finish(record, EnrollmentRunState.SUCCEEDED)
                        return
                if index % 5 == 0:
                    self._log(record, "info", f"教务系统返回：{last_message[:200]}")
            except AppError as exc:
                last_message = exc.message
                if index % 5 == 0:
                    self._log(record, "error", f"本次请求异常：{exc.message}")
            if index + 1 < record.max_attempts:
                delay = self._random.uniform(self._delay_min_seconds, self._delay_max_seconds)
                try:
                    await asyncio.wait_for(record.cancel_event.wait(), timeout=delay)
                    return
                except TimeoutError:
                    pass
        record.result = EnrollmentResult(
            success=False,
            course_name="",
            outcome="attempts_exhausted",
            message=last_message,
        )
        self._log(
            record,
            "fail",
            f"{record.max_attempts} 次尝试后仍未成功：{last_message[:200]}",
        )
        self._finish(record, EnrollmentRunState.FAILED)

    async def _wait_until(self, record: _RunRecord, run_at: datetime) -> bool:
        while True:
            remaining = (run_at - utc_now()).total_seconds()
            if remaining <= 0:
                return not record.cancel_event.is_set()
            try:
                await asyncio.wait_for(record.cancel_event.wait(), timeout=min(remaining, 5))
                return False
            except TimeoutError:
                continue

    def _log(
        self,
        record: _RunRecord,
        event_type: str,
        message: str,
        *,
        attempt: int | None = None,
        course_name: str | None = None,
    ) -> None:
        record.events.append(
            EnrollmentRunEvent(
                sequence=(record.events[-1].sequence + 1 if record.events else 1),
                created_at=utc_now(),
                type=event_type,
                message=message,
                attempt=attempt,
                course_name=course_name,
            )
        )
        if len(record.events) > self._event_limit:
            del record.events[: len(record.events) - self._event_limit]

    @staticmethod
    def _finish(record: _RunRecord, state: EnrollmentRunState) -> None:
        record.state = state
        record.finished_at = utc_now()

    @staticmethod
    def _public(record: _RunRecord) -> EnrollmentRun:
        return EnrollmentRun(
            id=record.id,
            state=record.state,
            category_code=record.category_code,
            preferences=record.preferences,
            scheduled_time=record.scheduled_time,
            run_at=record.run_at,
            attempt_count=record.attempt_count,
            max_attempts=record.max_attempts,
            result=record.result,
            events=record.events,
            created_at=record.created_at,
            finished_at=record.finished_at,
        )

    def _purge_finished(self) -> None:
        finished = sorted(
            (record for record in self._records.values() if record.state in TERMINAL_STATES),
            key=lambda item: item.finished_at or item.created_at,
        )
        while len(self._records) >= self._max_runs and finished:
            self._records.pop(finished.pop(0).id, None)


def compute_run_at(
    scheduled_time: str, server_offset_ms: int, *, send_ahead_ms: int = 50
) -> datetime:
    parsed = time.fromisoformat(scheduled_time)
    now = datetime.now(SHANGHAI)
    target_server = datetime.combine(now.date(), parsed, tzinfo=SHANGHAI)
    run_at = target_server - timedelta(milliseconds=server_offset_ms + send_ahead_ms)
    if run_at <= now:
        run_at += timedelta(days=1)
    return run_at.astimezone(utc_now().tzinfo)


def _success_message(result: EnrollmentResult, *, conflict: bool = False) -> str:
    if result.outcome == "limit_reached":
        return "已经达到选课上限。"
    suffix = "（已确认冲突）" if conflict else ""
    return f"选课成功{suffix}：{result.course_name}。"
