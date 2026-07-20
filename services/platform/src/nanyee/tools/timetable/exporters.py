from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from nanyee.tools.timetable.models import AggregatedCourse, CourseEvent

SHANGHAI = ZoneInfo("Asia/Shanghai")

_CAMPUS_SLOTS: dict[str, tuple[tuple[str, str], ...]] = {
    "main": (
        ("08:00", "08:40"),
        ("08:45", "09:25"),
        ("09:50", "10:30"),
        ("10:35", "11:15"),
        ("11:20", "12:00"),
        ("14:30", "15:10"),
        ("15:15", "15:55"),
        ("16:15", "16:55"),
        ("17:00", "17:40"),
        ("19:30", "20:10"),
        ("20:30", "21:10"),
    ),
    "shunde": (
        ("08:30", "09:10"),
        ("09:15", "09:55"),
        ("10:20", "11:00"),
        ("11:05", "11:45"),
        ("11:50", "12:30"),
        ("14:00", "14:40"),
        ("14:45", "15:25"),
        ("15:45", "16:25"),
        ("16:30", "17:10"),
        ("19:30", "20:10"),
        ("20:30", "21:10"),
    ),
}

_WAKEUP_COLORS = (
    "#FF6B6B",
    "#FF9F43",
    "#FFC048",
    "#6BCB77",
    "#38A169",
    "#4ECDC4",
    "#3498DB",
    "#2C82C9",
    "#6A5ACD",
    "#9B59B6",
    "#D980FA",
    "#E84393",
)


def export_wakeup_timetable(campus: Literal["main", "shunde"]) -> list[dict[str, object]]:
    real_slots = _CAMPUS_SLOTS[campus]
    return [
        {
            "node": index + 1,
            "startTime": real_slots[index][0] if index < len(real_slots) else "00:00",
            "endTime": real_slots[index][1] if index < len(real_slots) else "00:40",
            "timeTable": 1,
        }
        for index in range(60)
    ]


def export_wakeup_schedule(
    courses: list[AggregatedCourse],
    *,
    semester_monday: date,
    total_weeks: int,
    campus: Literal["main", "shunde"],
) -> str:
    if semester_monday.weekday() != 0:
        raise ValueError("semester_monday must be a Monday")
    if total_weeks < 1 or total_weeks > 30:
        raise ValueError("total_weeks must be between 1 and 30")
    unique_courses: dict[int, AggregatedCourse] = {}
    for course in courses:
        unique_courses.setdefault(course.course_id, course)
    course_list = [
        {
            "color": _WAKEUP_COLORS[course_id % len(_WAKEUP_COLORS)],
            "courseName": course.name,
            "credit": 0.0,
            "id": course_id,
            "note": "",
            "tableId": 1,
        }
        for course_id, course in sorted(unique_courses.items())
    ]
    time_slots: list[dict[str, object]] = []
    for course in courses:
        for start_week, end_week in _consecutive_ranges(course.weeks):
            time_slots.append(
                {
                    "day": course.weekday,
                    "endTime": "",
                    "endWeek": end_week,
                    "startWeek": start_week,
                    "id": course.course_id,
                    "level": 0,
                    "ownTime": False,
                    "room": course.location,
                    "startNode": course.start_node,
                    "startTime": "",
                    "step": course.end_node - course.start_node + 1,
                    "tableId": 1,
                    "teacher": course.teachers,
                    "type": 0,
                }
            )
    lines: list[object] = [
        {
            "courseLen": 50,
            "id": 1,
            "name": "SMU",
            "sameBreakLen": False,
            "sameLen": True,
            "theBreakLen": 10,
        },
        export_wakeup_timetable(campus),
        {
            "background": "",
            "courseTextColor": -1,
            "id": 1,
            "itemAlpha": 60,
            "itemHeight": 64,
            "itemTextSize": 12,
            "maxWeek": total_weeks,
            "nodes": 11,
            "showOtherWeekCourse": False,
            "showSat": True,
            "showSun": True,
            "showTime": False,
            "startDate": semester_monday.isoformat(),
            "strokeColor": -2130706433,
            "sundayFirst": False,
            "tableName": f"SMU-{semester_monday.isoformat()}",
            "textColor": -16777216,
            "timeTable": 1,
            "type": 0,
            "widgetCourseTextColor": -1,
            "widgetItemAlpha": 60,
            "widgetItemHeight": 64,
            "widgetItemTextSize": 12,
            "widgetStrokeColor": -2130706433,
            "widgetTextColor": -16777216,
        },
        course_list,
        time_slots,
    ]
    return "\n".join(json.dumps(line, ensure_ascii=False, separators=(",", ":")) for line in lines)


def _consecutive_ranges(weeks: tuple[int, ...]) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for week in sorted(set(weeks)):
        if not ranges or week > ranges[-1][1] + 1:
            ranges.append((week, week))
        else:
            ranges[-1] = (ranges[-1][0], week)
    return ranges


def _escape_ics(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def _event_uid(event: CourseEvent, event_date: date) -> str:
    identity = "\x1f".join(
        (
            event.name,
            event.location,
            event.teachers,
            event_date.isoformat(),
            event.start_time,
            event.end_time,
        )
    )
    return f"{hashlib.sha256(identity.encode()).hexdigest()[:32]}@nanyee.de"


def export_ics(
    events: list[CourseEvent],
    *,
    semester_monday: date,
    generated_at: datetime | None = None,
) -> str:
    if semester_monday.weekday() != 0:
        raise ValueError("semester_monday must be a Monday")
    stamp = (generated_at or datetime.now(UTC)).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//nanyee.de//Student Tools//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:南医课表",
        "X-WR-TIMEZONE:Asia/Shanghai",
    ]
    for event in events:
        event_date = semester_monday + timedelta(days=(event.week - 1) * 7 + event.weekday - 1)
        start = datetime.combine(event_date, time.fromisoformat(event.start_time), tzinfo=SHANGHAI)
        end = datetime.combine(event_date, time.fromisoformat(event.end_time), tzinfo=SHANGHAI)
        description = "\\n".join(
            _escape_ics(value)
            for value in (
                f"教师: {event.teachers}",
                f"场地: {event.location}",
                f"环节: {event.activity}",
                f"周次: {event.week}",
                f"节次: {event.start_node}-{event.end_node}",
            )
        )
        lines.extend(
            (
                "BEGIN:VEVENT",
                f"UID:{_event_uid(event, event_date)}",
                f"DTSTAMP:{stamp}",
                f"DTSTART;TZID=Asia/Shanghai:{start.strftime('%Y%m%dT%H%M%S')}",
                f"DTEND;TZID=Asia/Shanghai:{end.strftime('%Y%m%dT%H%M%S')}",
                f"SUMMARY:{_escape_ics(event.name)}",
                f"LOCATION:{_escape_ics(event.location)}",
                f"DESCRIPTION:{description}",
                "END:VEVENT",
            )
        )
    lines.extend(("END:VCALENDAR", ""))
    return "\r\n".join(lines)
