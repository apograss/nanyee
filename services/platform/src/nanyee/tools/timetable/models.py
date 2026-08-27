from __future__ import annotations

from collections import OrderedDict

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CourseEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1, max_length=256)
    location: str = Field(default="", max_length=256)
    activity: str = Field(default="", max_length=128)
    teachers: str = Field(default="", max_length=256)
    weekday: int = Field(ge=1, le=7)
    credit_hours: str = Field(default="", max_length=32)
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    start_node: int = Field(ge=1, le=60)
    end_node: int = Field(ge=1, le=60)
    week: int = Field(ge=1, le=30)

    @field_validator("name", "location", "activity", "teachers", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> str:
        return " ".join(str(value or "").split())

    @classmethod
    def from_upstream(cls, value: dict[str, object]) -> CourseEvent:
        # 上游 xs 时而返回字符串时而返回数字（如 "xs": 2），统一转成字符串
        credit_hours = value.get("xs", "")
        return cls(
            name=value.get("kcmc", ""),
            location=value.get("jxcdmc", ""),
            activity=value.get("jxhjmc", ""),
            teachers=value.get("teaxms", ""),
            weekday=value.get("xq", 0),
            credit_hours=str(credit_hours) if credit_hours is not None else "",
            start_time=str(value.get("qssj", ""))[:5],
            end_time=str(value.get("jssj", ""))[:5],
            start_node=value.get("ps", 0),
            end_node=value.get("pe", 0),
            week=value.get("zc", 0),
        )


class AggregatedCourse(BaseModel):
    course_id: int
    name: str
    location: str
    activity: str
    teachers: str
    weekday: int
    credit_hours: str
    start_time: str
    end_time: str
    start_node: int
    end_node: int
    weeks: tuple[int, ...]


class SemesterOption(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str = Field(pattern=r"^\d{6}$")
    label: str = Field(min_length=1, max_length=32)


def aggregate_events(events: list[CourseEvent]) -> list[AggregatedCourse]:
    course_ids: OrderedDict[str, int] = OrderedDict()
    groups: OrderedDict[tuple[object, ...], list[int]] = OrderedDict()
    representatives: dict[tuple[object, ...], CourseEvent] = {}
    for event in events:
        if event.name not in course_ids:
            course_ids[event.name] = len(course_ids)
        key = (
            event.name,
            event.location,
            event.activity,
            event.teachers,
            event.start_node,
            event.end_node,
            event.weekday,
        )
        representatives.setdefault(key, event)
        groups.setdefault(key, []).append(event.week)

    result: list[AggregatedCourse] = []
    for group_key, weeks in groups.items():
        event = representatives[group_key]
        result.append(
            AggregatedCourse(
                course_id=course_ids[event.name],
                name=event.name,
                location=event.location,
                activity=event.activity,
                teachers=event.teachers,
                weekday=event.weekday,
                credit_hours=event.credit_hours,
                start_time=event.start_time,
                end_time=event.end_time,
                start_node=event.start_node,
                end_node=event.end_node,
                weeks=tuple(sorted(set(weeks))),
            )
        )
    return result
