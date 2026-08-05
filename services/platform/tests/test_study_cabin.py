from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest
from nanyee.tool_registry.payloads import validate_job_payload
from nanyee.tools.study_cabin import (
    ReservationPayload,
    RoomAvailability,
    StudyCabinReservationRequest,
    TimeBlock,
    choose_room,
)
from pydantic import ValidationError

SHANGHAI = ZoneInfo("Asia/Shanghai")


def valid_request(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "target_date": date(2026, 7, 22),
        "start_time": time(9, 0),
        "end_time": time(11, 0),
        "title": "学习",
        "cabin_ids": [29817270, 29817269],
        "attempt_until": datetime(2026, 7, 22, 8, 30, tzinfo=SHANGHAI),
    }
    values.update(overrides)
    return values


def test_payload_validation_normalizes_and_requires_hosted_credential() -> None:
    validated = validate_job_payload("study_cabin", "reserve", valid_request())

    assert validated.credential_required is True
    assert validated.max_attempts == 1440
    assert validated.payload["target_date"] == "2026-07-22"
    assert validated.payload["cabin_ids"] == [29817270, 29817269]


@pytest.mark.parametrize(
    "overrides",
    [
        {"start_time": time(9, 5)},
        {"end_time": time(9, 20)},
        {"end_time": time(13, 10)},
        {"start_time": time(7, 50)},
        {"end_time": time(23, 0)},
        {"cabin_ids": [29817269, 29817269]},
        {"cabin_ids": [1]},
        {"attempt_until": datetime(2026, 7, 22, 9, 10, tzinfo=SHANGHAI)},
    ],
)
def test_payload_validation_rejects_invalid_live_rules(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        StudyCabinReservationRequest.model_validate(valid_request(**overrides))


def test_choose_room_respects_priority_full_interval_and_freezing_time() -> None:
    rooms = [
        RoomAvailability(
            dev_id=29817269,
            name="西侧学习舱1",
            open_start=time(8, 0),
            open_end=time(22, 50),
            freezing_minutes=10,
            blocks=(TimeBlock(start=time(11, 5), end=time(11, 20)),),
        ),
        RoomAvailability(
            dev_id=29817270,
            name="西侧学习舱2",
            open_start=time(8, 0),
            open_end=time(22, 50),
            freezing_minutes=0,
        ),
    ]

    selected = choose_room(
        rooms,
        ordered_dev_ids=[29817269, 29817270],
        target_date=date(2026, 7, 22),
        start=time(9, 0),
        end=time(11, 0),
    )

    assert selected is not None
    assert selected.dev_id == 29817270


def test_choose_room_treats_equal_open_times_as_open_all_day() -> None:
    # 顺德学习舱真实数据：openStart=openEnd=00:00 表示 24 小时开放
    rooms = [
        RoomAvailability(
            dev_id=29817269,
            name="西侧学习舱1",
            open_start=time(0, 0),
            open_end=time(0, 0),
            freezing_minutes=0,
        ),
    ]

    selected = choose_room(
        rooms,
        ordered_dev_ids=[29817269],
        target_date=date(2026, 8, 5),
        start=time(19, 0),
        end=time(21, 0),
    )

    assert selected is not None
    assert selected.dev_id == 29817269


def test_reservation_payload_matches_infospace_contract() -> None:
    payload = ReservationPayload(
        account="student",
        start="2026-07-22 09:00:00",
        end="2026-07-22 11:00:00",
        title="学习",
        dev_id=29817269,
    ).as_dict()

    assert payload["resvMember"] == ["student"]
    assert payload["resvDev"] == [29817269]
    assert payload["sysKind"] == 1
