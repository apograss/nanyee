from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator, model_validator

from nanyee.tools.study_cabin.domain import DEFAULT_CABIN_IDS

SHANGHAI = ZoneInfo("Asia/Shanghai")


class StudyCabinReservationRequest(BaseModel):
    target_date: date
    start_time: time
    end_time: time
    title: str = Field(default="学习", min_length=1, max_length=30)
    cabin_ids: list[int] = Field(min_length=1, max_length=18)
    attempt_until: datetime

    @field_validator("start_time", "end_time")
    @classmethod
    def reject_timezone_in_time(cls, value: time) -> time:
        if value.tzinfo is not None:
            raise ValueError("time fields must not include a timezone")
        return value

    @field_validator("cabin_ids")
    @classmethod
    def validate_cabins(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("cabin_ids must not contain duplicates")
        if any(dev_id not in DEFAULT_CABIN_IDS for dev_id in value):
            raise ValueError("cabin_ids contains an unsupported cabin")
        return value

    @model_validator(mode="after")
    def validate_reservation_window(self) -> StudyCabinReservationRequest:
        start = datetime.combine(self.target_date, self.start_time, tzinfo=SHANGHAI)
        end = datetime.combine(self.target_date, self.end_time, tzinfo=SHANGHAI)
        duration = end - start
        if self.start_time.minute % 10 or self.end_time.minute % 10:
            raise ValueError("reservation times must use 10-minute increments")
        if duration < timedelta(minutes=30) or duration > timedelta(minutes=240):
            raise ValueError("reservation duration must be between 30 and 240 minutes")
        if self.start_time < time(8, 0) or self.end_time > time(22, 50):
            raise ValueError("reservation is outside cabin opening hours")
        attempt_until = self.attempt_until
        if attempt_until.tzinfo is None or attempt_until.utcoffset() is None:
            raise ValueError("attempt_until must include a timezone")
        if attempt_until.astimezone(SHANGHAI) > start:
            raise ValueError("attempt_until cannot be after the reservation starts")
        return self
