from datetime import date, datetime, time

import pytest

from smu_reserver.db import Database
from smu_reserver.models import NewTask, TaskStatus
from smu_reserver.repository import TaskRepository


@pytest.fixture
def repository(tmp_path):
    database = Database(tmp_path / "test.db")
    database.initialize()
    return TaskRepository(database)


def task_input(**overrides) -> NewTask:
    values = {
        "target_date": date(2026, 7, 20),
        "start_time": time(9, 0),
        "end_time": time(11, 0),
        "title": "学习",
        "attempt_from": datetime(2026, 7, 19, 23, 59),
        "attempt_until": datetime(2026, 7, 20, 9, 0),
        "cabin_ids": [29817270, 29817269],
    }
    values.update(overrides)
    return NewTask(**values)


def test_create_task_preserves_cabin_priority(repository: TaskRepository) -> None:
    task = repository.create_task(task_input())

    assert task.status is TaskStatus.WAITING
    assert repository.get_task_cabin_ids(task.id) == [29817270, 29817269]


def test_create_task_rejects_invalid_time_range(repository: TaskRepository) -> None:
    with pytest.raises(ValueError, match="结束时间必须晚于开始时间"):
        repository.create_task(task_input(start_time=time(11, 0), end_time=time(9, 0)))


def test_create_task_rejects_overlapping_active_task(repository: TaskRepository) -> None:
    repository.create_task(task_input())

    with pytest.raises(ValueError, match="存在时间重叠的活动任务"):
        repository.create_task(task_input(start_time=time(10, 0), end_time=time(12, 0)))


def test_cancelled_task_does_not_block_new_task(repository: TaskRepository) -> None:
    existing = repository.create_task(task_input())
    repository.set_status(existing.id, TaskStatus.CANCELLED)

    created = repository.create_task(task_input())

    assert created.id != existing.id


@pytest.mark.parametrize(
    ("start_time", "end_time", "message"),
    [
        (time(9, 5), time(11, 0), "10 分钟粒度"),
        (time(9, 0), time(9, 20), "至少 30 分钟"),
        (time(9, 0), time(13, 10), "最多 240 分钟"),
        (time(7, 50), time(9, 0), "开放时间"),
        (time(21, 0), time(23, 0), "开放时间"),
    ],
)
def test_create_task_enforces_live_reservation_rules(
    repository: TaskRepository, start_time: time, end_time: time, message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        repository.create_task(task_input(start_time=start_time, end_time=end_time))
