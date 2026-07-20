from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

SHUNDE_SINGLE_CABIN_KIND_ID = 29816776


@dataclass(frozen=True, slots=True)
class Cabin:
    dev_id: int
    name: str


DEFAULT_CABINS = (
    *(Cabin(29817269 + index, f"西侧学习舱{index + 1}") for index in range(9)),
    *(Cabin(29817278 + index, f"东侧学习舱{index + 1}") for index in range(9)),
)
DEFAULT_CABIN_IDS = frozenset(cabin.dev_id for cabin in DEFAULT_CABINS)


@dataclass(frozen=True, slots=True)
class TimeBlock:
    start: time
    end: time


@dataclass(frozen=True, slots=True)
class RoomAvailability:
    dev_id: int
    name: str
    open_start: time
    open_end: time
    freezing_minutes: int
    blocks: tuple[TimeBlock, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ReservationPayload:
    account: str
    start: str
    end: str
    title: str
    dev_id: int

    def as_dict(self) -> dict[str, object]:
        return {
            "sysKind": 1,
            "appAccNo": self.account,
            "memberKind": 1,
            "resvBeginTime": self.start,
            "resvEndTime": self.end,
            "testName": self.title,
            "resvKind": 2,
            "resvProperty": 0,
            "appUrl": "",
            "resvMember": [self.account],
            "resvDev": [self.dev_id],
            "memo": "",
            "captcha": "",
            "addServices": [],
        }


def choose_room(
    rooms: Sequence[RoomAvailability],
    *,
    ordered_dev_ids: Sequence[int],
    target_date: date,
    start: time,
    end: time,
) -> RoomAvailability | None:
    by_id = {room.dev_id: room for room in rooms}
    requested_start = datetime.combine(target_date, start)
    requested_end = datetime.combine(target_date, end)
    for dev_id in ordered_dev_ids:
        room = by_id.get(dev_id)
        if room and _covers(room, target_date, requested_start, requested_end):
            return room
    return None


def _covers(
    room: RoomAvailability,
    target_date: date,
    requested_start: datetime,
    requested_end: datetime,
) -> bool:
    open_start = datetime.combine(target_date, room.open_start)
    open_end = datetime.combine(target_date, room.open_end)
    if requested_start < open_start or requested_end > open_end or requested_end <= requested_start:
        return False
    freeze = timedelta(minutes=room.freezing_minutes)
    return not any(
        datetime.combine(target_date, block.start) - freeze < requested_end
        and datetime.combine(target_date, block.end) + freeze > requested_start
        for block in room.blocks
    )
