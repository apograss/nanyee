from datetime import UTC, datetime, time

from smu_reserver.db import Database
from smu_reserver.models import ACTIVE_TASK_STATUSES, NewTask, ReservationTask, TaskStatus

OPEN_START = time(8, 0)
OPEN_END = time(22, 50)


class TaskRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def create_task(self, task: NewTask) -> ReservationTask:
        self._validate_new_task(task)
        now = datetime.now(UTC).isoformat()
        active = tuple(status.value for status in ACTIVE_TASK_STATUSES)
        placeholders = ",".join("?" for _ in active)
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            overlap = connection.execute(
                f"""
                SELECT 1 FROM reservation_tasks
                WHERE target_date = ?
                  AND status IN ({placeholders})
                  AND start_time < ?
                  AND end_time > ?
                LIMIT 1
                """,
                (
                    task.target_date.isoformat(),
                    *active,
                    task.end_time.isoformat(timespec="minutes"),
                    task.start_time.isoformat(timespec="minutes"),
                ),
            ).fetchone()
            if overlap:
                raise ValueError("存在时间重叠的活动任务")

            cursor = connection.execute(
                """
                INSERT INTO reservation_tasks (
                    target_date, start_time, end_time, title,
                    attempt_from, attempt_until, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task.target_date.isoformat(),
                    task.start_time.isoformat(timespec="minutes"),
                    task.end_time.isoformat(timespec="minutes"),
                    task.title.strip(),
                    task.attempt_from.isoformat(),
                    task.attempt_until.isoformat(),
                    TaskStatus.WAITING.value,
                    now,
                    now,
                ),
            )
            task_id = int(cursor.lastrowid)
            connection.executemany(
                "INSERT INTO task_cabins (task_id, dev_id, priority) VALUES (?, ?, ?)",
                [(task_id, dev_id, priority) for priority, dev_id in enumerate(task.cabin_ids)],
            )
        return self.get_task(task_id)

    def get_task(self, task_id: int) -> ReservationTask:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM reservation_tasks WHERE id = ?", (task_id,)
            ).fetchone()
        if row is None:
            raise KeyError(task_id)
        return ReservationTask(
            id=row["id"],
            target_date=datetime.fromisoformat(row["target_date"]).date(),
            start_time=datetime.strptime(row["start_time"], "%H:%M").time(),
            end_time=datetime.strptime(row["end_time"], "%H:%M").time(),
            title=row["title"],
            attempt_from=datetime.fromisoformat(row["attempt_from"]),
            attempt_until=datetime.fromisoformat(row["attempt_until"]),
            status=TaskStatus(row["status"]),
            attempt_count=row["attempt_count"],
            last_error=row["last_error"],
            reserved_dev_id=row["reserved_dev_id"],
        )

    def list_tasks(self) -> list[ReservationTask]:
        with self.database.connect() as connection:
            rows = connection.execute(
                "SELECT id FROM reservation_tasks ORDER BY target_date, start_time, id"
            ).fetchall()
        return [self.get_task(int(row["id"])) for row in rows]

    def list_actionable(self, now: datetime) -> list[ReservationTask]:
        statuses = (
            TaskStatus.WAITING.value,
            TaskStatus.PREFLIGHT.value,
            TaskStatus.RUNNING.value,
            TaskStatus.AUTH_REFRESH.value,
        )
        with self.database.connect() as connection:
            rows = connection.execute(
                """
                SELECT id FROM reservation_tasks
                WHERE status IN (?, ?, ?, ?)
                  AND attempt_from <= ?
                  AND attempt_until >= ?
                ORDER BY attempt_from, id
                """,
                (*statuses, now.isoformat(), now.isoformat()),
            ).fetchall()
        return [self.get_task(int(row["id"])) for row in rows]

    def expire_overdue(self, now: datetime) -> int:
        terminal = (
            TaskStatus.SUCCEEDED.value,
            TaskStatus.FAILED_TIMEOUT.value,
            TaskStatus.FAILED_VALIDATION.value,
            TaskStatus.CANCELLED.value,
        )
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE reservation_tasks SET status = ?, updated_at = ?
                WHERE status NOT IN (?, ?, ?, ?)
                  AND attempt_until < ?
                """,
                (
                    TaskStatus.FAILED_TIMEOUT.value,
                    now.isoformat(),
                    *terminal,
                    now.isoformat(),
                ),
            )
        return cursor.rowcount

    def get_task_cabin_ids(self, task_id: int) -> list[int]:
        with self.database.connect() as connection:
            rows = connection.execute(
                "SELECT dev_id FROM task_cabins WHERE task_id = ? ORDER BY priority",
                (task_id,),
            ).fetchall()
        return [int(row["dev_id"]) for row in rows]

    def set_status(self, task_id: int, status: TaskStatus) -> None:
        with self.database.connect() as connection:
            cursor = connection.execute(
                "UPDATE reservation_tasks SET status = ?, updated_at = ? WHERE id = ?",
                (status.value, datetime.now(UTC).isoformat(), task_id),
            )
            if cursor.rowcount != 1:
                raise KeyError(task_id)

    def mark_running(self, task_id: int) -> None:
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE reservation_tasks SET
                    status = ?, attempt_count = attempt_count + 1, updated_at = ?
                WHERE id = ?
                """,
                (TaskStatus.RUNNING.value, datetime.now(UTC).isoformat(), task_id),
            )
            if cursor.rowcount != 1:
                raise KeyError(task_id)

    def mark_succeeded(self, task_id: int, dev_id: int) -> None:
        now = datetime.now(UTC).isoformat()
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE reservation_tasks SET
                    status = ?, reserved_dev_id = ?, reserved_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (TaskStatus.SUCCEEDED.value, dev_id, now, now, task_id),
            )
            if cursor.rowcount != 1:
                raise KeyError(task_id)

    def mark_error(self, task_id: int, message: str, *, status: TaskStatus) -> None:
        with self.database.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE reservation_tasks SET status = ?, last_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (status.value, message[:300], datetime.now(UTC).isoformat(), task_id),
            )
            if cursor.rowcount != 1:
                raise KeyError(task_id)

    @staticmethod
    def _validate_new_task(task: NewTask) -> None:
        if task.end_time <= task.start_time:
            raise ValueError("结束时间必须晚于开始时间")
        if any(
            value.minute % 10 != 0 or value.second != 0 or value.microsecond != 0
            for value in (task.start_time, task.end_time)
        ):
            raise ValueError("预约时间必须符合 10 分钟粒度")
        if task.start_time < OPEN_START or task.end_time > OPEN_END:
            raise ValueError("预约时间必须位于开放时间 08:00–22:50")
        duration = (
            datetime.combine(task.target_date, task.end_time)
            - datetime.combine(task.target_date, task.start_time)
        ).total_seconds() / 60
        if duration < 30:
            raise ValueError("预约时长至少 30 分钟")
        if duration > 240:
            raise ValueError("预约时长最多 240 分钟")
        if not task.title.strip():
            raise ValueError("预约主题不能为空")
        if task.attempt_until <= task.attempt_from:
            raise ValueError("停止尝试时间必须晚于开始尝试时间")
        if not task.cabin_ids:
            raise ValueError("至少选择一个学习舱")
        if len(set(task.cabin_ids)) != len(task.cabin_ids):
            raise ValueError("学习舱优先级不能重复")
