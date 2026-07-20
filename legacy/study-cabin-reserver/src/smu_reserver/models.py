from dataclasses import dataclass
from datetime import date, datetime, time
from enum import StrEnum


class TaskStatus(StrEnum):
    WAITING = "waiting"
    PREFLIGHT = "preflight"
    RUNNING = "running"
    AUTH_REFRESH = "auth_refresh"
    PAUSED_AUTH = "paused_auth"
    PAUSED_REVIEW = "paused_review"
    SUCCEEDED = "succeeded"
    FAILED_TIMEOUT = "failed_timeout"
    FAILED_VALIDATION = "failed_validation"
    CANCELLED = "cancelled"


ACTIVE_TASK_STATUSES = (
    TaskStatus.WAITING,
    TaskStatus.PREFLIGHT,
    TaskStatus.RUNNING,
    TaskStatus.AUTH_REFRESH,
    TaskStatus.PAUSED_AUTH,
    TaskStatus.PAUSED_REVIEW,
)


@dataclass(frozen=True)
class NewTask:
    target_date: date
    start_time: time
    end_time: time
    title: str
    attempt_from: datetime
    attempt_until: datetime
    cabin_ids: list[int]


@dataclass(frozen=True)
class ReservationTask:
    id: int
    target_date: date
    start_time: time
    end_time: time
    title: str
    attempt_from: datetime
    attempt_until: datetime
    status: TaskStatus
    attempt_count: int = 0
    last_error: str | None = None
    reserved_dev_id: int | None = None
