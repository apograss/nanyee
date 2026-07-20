from datetime import date, time

from smu_reserver.availability import choose_room
from smu_reserver.infospace import RoomAvailability, TimeBlock


def room(dev_id: int, *blocks: TimeBlock) -> RoomAvailability:
    return RoomAvailability(
        dev_id=dev_id,
        name=f"学习舱{dev_id}",
        open_start=time(8, 0),
        open_end=time(22, 50),
        freezing_minutes=0,
        blocks=list(blocks),
    )


def test_choose_room_uses_priority_when_full_interval_is_free() -> None:
    selected = choose_room(
        [room(1), room(2)],
        ordered_dev_ids=[2, 1],
        target_date=date(2026, 7, 20),
        start=time(9, 0),
        end=time(11, 0),
    )

    assert selected is not None
    assert selected.dev_id == 2


def test_choose_room_skips_any_overlap_and_uses_next_priority() -> None:
    selected = choose_room(
        [room(1), room(2, TimeBlock(start=time(10, 0), end=time(10, 10)))],
        ordered_dev_ids=[2, 1],
        target_date=date(2026, 7, 20),
        start=time(9, 0),
        end=time(11, 0),
    )

    assert selected is not None
    assert selected.dev_id == 1


def test_choose_room_never_shortens_or_splits_requested_interval() -> None:
    selected = choose_room(
        [room(1, TimeBlock(start=time(10, 0), end=time(10, 10)))],
        ordered_dev_ids=[1],
        target_date=date(2026, 7, 20),
        start=time(9, 0),
        end=time(11, 0),
    )

    assert selected is None
