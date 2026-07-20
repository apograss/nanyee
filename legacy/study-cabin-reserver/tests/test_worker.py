from datetime import date, datetime, time

import pytest

from smu_reserver.db import Database
from smu_reserver.infospace import BusinessError, RoomAvailability, TimeBlock, UserInfo
from smu_reserver.models import NewTask, TaskStatus
from smu_reserver.repository import TaskRepository
from smu_reserver.worker import ReservationRunner


class FakeInfospace:
    def __init__(self, rooms, *, conflicting_dev_id=None):
        self.rooms = rooms
        self.conflicting_dev_id = conflicting_dev_id
        self.submitted = []

    async def get_user_info(self):
        return UserInfo(acc_no="student", display_name="测试", token="token")

    async def list_rooms(self, target_date, *, kind_id):
        return self.rooms

    async def reserve(self, payload):
        self.submitted.append(payload)
        if payload.dev_id == self.conflicting_dev_id:
            raise BusinessError(409, "名额冲突")


def available_room(dev_id: int, *blocks: TimeBlock) -> RoomAvailability:
    return RoomAvailability(
        dev_id=dev_id,
        name=f"学习舱{dev_id}",
        open_start=time(8, 0),
        open_end=time(22, 50),
        freezing_minutes=0,
        blocks=list(blocks),
    )


@pytest.fixture
def repository(tmp_path):
    database = Database(tmp_path / "worker.db")
    database.initialize()
    return TaskRepository(database)


def create_task(repository: TaskRepository):
    return repository.create_task(
        NewTask(
            target_date=date(2026, 7, 20),
            start_time=time(9, 0),
            end_time=time(11, 0),
            title="学习",
            attempt_from=datetime(2026, 7, 19, 23, 59),
            attempt_until=datetime(2026, 7, 20, 9, 0),
            cabin_ids=[2, 1],
        )
    )


@pytest.mark.asyncio
async def test_runner_books_next_priority_after_business_conflict(repository) -> None:
    task = create_task(repository)
    api = FakeInfospace([available_room(1), available_room(2)], conflicting_dev_id=2)

    await ReservationRunner(repository, api).attempt_once(task.id)

    updated = repository.get_task(task.id)
    assert [payload.dev_id for payload in api.submitted] == [2, 1]
    assert updated.status is TaskStatus.SUCCEEDED
    assert updated.reserved_dev_id == 1


@pytest.mark.asyncio
async def test_runner_never_submits_when_full_interval_is_unavailable(repository) -> None:
    task = create_task(repository)
    api = FakeInfospace(
        [
            available_room(1, TimeBlock(start=time(10, 0), end=time(10, 10))),
            available_room(2, TimeBlock(start=time(9, 30), end=time(9, 40))),
        ]
    )

    await ReservationRunner(repository, api).attempt_once(task.id)

    assert api.submitted == []
    assert repository.get_task(task.id).status is TaskStatus.RUNNING
