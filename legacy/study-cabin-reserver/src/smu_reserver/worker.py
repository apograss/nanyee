from collections.abc import Sequence
from datetime import datetime
from typing import Protocol

from smu_reserver.availability import choose_room
from smu_reserver.infospace import BusinessError, RoomAvailability, UserInfo
from smu_reserver.repository import TaskRepository
from smu_reserver.reservation import ReservationPayload

SHUNDE_SINGLE_CABIN_KIND_ID = 29816776


class ReservationApi(Protocol):
    async def get_user_info(self) -> UserInfo: ...

    async def list_rooms(
        self, target_date, *, kind_id: int
    ) -> Sequence[RoomAvailability]: ...

    async def reserve(self, payload: ReservationPayload) -> None: ...


class ReservationRunner:
    def __init__(self, repository: TaskRepository, api: ReservationApi) -> None:
        self.repository = repository
        self.api = api

    async def attempt_once(self, task_id: int) -> None:
        task = self.repository.get_task(task_id)
        self.repository.mark_running(task_id)
        user = await self.api.get_user_info()
        rooms = await self.api.list_rooms(
            task.target_date, kind_id=SHUNDE_SINGLE_CABIN_KIND_ID
        )
        cabin_ids = self.repository.get_task_cabin_ids(task_id)
        for dev_id in cabin_ids:
            room = choose_room(
                rooms,
                ordered_dev_ids=[dev_id],
                target_date=task.target_date,
                start=task.start_time,
                end=task.end_time,
            )
            if room is None:
                continue
            payload = ReservationPayload(
                account=user.acc_no,
                start=_format_datetime(task.target_date, task.start_time),
                end=_format_datetime(task.target_date, task.end_time),
                title=task.title,
                dev_id=room.dev_id,
            )
            try:
                await self.api.reserve(payload)
            except BusinessError as error:
                if error.code == 409:
                    continue
                raise
            self.repository.mark_succeeded(task_id, room.dev_id)
            return


def _format_datetime(target_date, target_time) -> str:
    return datetime.combine(target_date, target_time).strftime("%Y-%m-%d %H:%M:%S")
