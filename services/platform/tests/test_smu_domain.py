from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from nanyee.tools.grades import calculate_summary, parse_grades
from nanyee.tools.timetable import (
    CourseEvent,
    aggregate_events,
    export_ics,
    export_wakeup_schedule,
    export_wakeup_timetable,
)


def event(**overrides: object) -> CourseEvent:
    values: dict[str, object] = {
        "name": "内科学,Ⅰ",
        "location": "教学楼;101",
        "activity": "理论",
        "teachers": "张老师",
        "weekday": 1,
        "credit_hours": "2",
        "start_time": "08:00",
        "end_time": "09:25",
        "start_node": 1,
        "end_node": 2,
        "week": 1,
    }
    values.update(overrides)
    return CourseEvent(**values)  # type: ignore[arg-type]


def test_timetable_aggregate_and_exports_are_stable() -> None:
    events = [event(week=2), event(week=1), event(week=2)]
    aggregated = aggregate_events(events)
    assert len(aggregated) == 1
    assert aggregated[0].weeks == (1, 2)

    ics = export_ics(
        events[:1],
        semester_monday=date(2026, 9, 7),
        generated_at=datetime(2026, 7, 20, tzinfo=UTC),
    )
    assert "DTSTART;TZID=Asia/Shanghai:20260914T080000" in ics
    assert "SUMMARY:内科学\\,Ⅰ" in ics
    assert "LOCATION:教学楼\\;101" in ics
    assert ics.endswith("\r\n")

    slots = export_wakeup_timetable("shunde")
    assert len(slots) == 60
    assert slots[0]["startTime"] == "08:30"
    assert slots[11]["startTime"] == "00:00"

    wakeup = export_wakeup_schedule(
        aggregate_events([event(week=1), event(week=3)]),
        semester_monday=date(2026, 9, 7),
        total_weeks=20,
        campus="main",
    )
    lines = wakeup.splitlines()
    assert len(lines) == 5
    assert '"startDate":"2026-09-07"' in lines[2]
    assert '"startWeek":1,"id":0' in lines[4]
    assert '"startWeek":3,"id":0' in lines[4]


def test_ics_requires_semester_monday() -> None:
    with pytest.raises(ValueError, match="Monday"):
        export_ics([event()], semester_monday=date(2026, 9, 8))


def test_from_upstream_accepts_numeric_credit_hours() -> None:
    # 上游 getCalendarWeekDatas 的 xs 实际返回数字而非字符串（2026-08 实测）
    row = {
        "kcmc": "大学英语三",
        "jxcdmc": "2301教室",
        "jxhjmc": "理论",
        "teaxms": "张老师",
        "xq": 3,
        "xs": 2,
        "qssj": "08:30:00",
        "jssj": "09:55:00",
        "ps": "01",
        "pe": "02",
        "zc": 1,
    }
    parsed = CourseEvent.from_upstream(row)
    assert parsed.credit_hours == "2"
    assert parsed.start_node == 1
    assert parsed.end_node == 2


def test_grade_parsing_and_weighted_summary() -> None:
    grades = parse_grades(
        {
            "rows": [
                {
                    "kcmc": "课程甲",
                    "zcj": "90",
                    "zcjfs": 90,
                    "cjjd": 4,
                    "xf": 2,
                    "xdfsmc": "必修",
                    "xnxqmc": "2025-2026-1",
                },
                {
                    "kcmc": "课程乙",
                    "zcj": "50",
                    "zcjfs": 50,
                    "cjjd": 0,
                    "xf": 1,
                    "xdfsmc": "任选",
                    "xnxqmc": "2025-2026-1",
                },
            ]
        }
    )
    summary = calculate_summary(grades)
    assert summary.total_credits == 3
    assert summary.weighted_gpa == pytest.approx(8 / 3)
    assert summary.required_gpa == 4
    assert summary.average_score == pytest.approx(230 / 3)
    assert summary.failed_count == 1


def test_grade_parser_rejects_unexpected_contract() -> None:
    with pytest.raises(ValueError, match="rows"):
        parse_grades({"data": []})
