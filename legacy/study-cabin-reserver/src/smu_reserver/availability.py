from collections.abc import Sequence
from datetime import date, datetime, time, timedelta

from smu_reserver.infospace import RoomAvailability


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
    for block in room.blocks:
        block_start = datetime.combine(target_date, block.start) - freeze
        block_end = datetime.combine(target_date, block.end) + freeze
        if block_start < requested_end and block_end > requested_start:
            return False
    return True
