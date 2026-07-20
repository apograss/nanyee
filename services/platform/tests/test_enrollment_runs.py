from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from nanyee.integrations.smu.enrollment_runs import EnrollmentRunManager
from nanyee.tools.course_selection import (
    CourseItem,
    EnrollmentResult,
    EnrollmentRunState,
)


class FakeEnrollmentClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bool]] = []

    async def calibrate_server_time(self, **_kwargs: object) -> int:
        return 0

    async def enroll_course(
        self, *, course: CourseItem, confirm_conflict: bool = False, **_kwargs: object
    ) -> EnrollmentResult:
        self.calls.append((course.task_code, confirm_conflict))
        if course.task_code == "first" and not confirm_conflict:
            return EnrollmentResult(
                success=False,
                course_name=course.name,
                outcome="conflict",
                message="课程时间冲突",
            )
        if course.task_code == "first":
            return EnrollmentResult(
                success=False,
                course_name=course.name,
                outcome="rejected",
                message="人数已满",
            )
        return EnrollmentResult(
            success=True,
            course_name=course.name,
            outcome="enrolled",
            message="成功",
        )


@pytest.mark.asyncio
async def test_enrollment_run_restores_preferences_retries_and_conflict_confirmation() -> None:
    client = FakeEnrollmentClient()
    manager = EnrollmentRunManager(  # type: ignore[arg-type]
        client,
        delay_min_seconds=0,
        delay_max_seconds=0,
    )
    user_id = uuid4()
    run = await manager.create(
        user_id=user_id,
        category_code="12",
        preferences=[
            CourseItem(task_code="first", name="第一志愿"),
            CourseItem(task_code="second", name="第二志愿"),
        ],
        cookies={"sid": "value"},
        scheduled_time=None,
        max_attempts=3,
        primary_burst_attempts=1,
        confirm_conflicts=True,
    )

    for _ in range(20):
        current = await manager.get(run.id, user_id=user_id)
        assert current is not None
        if current.state in {
            EnrollmentRunState.SUCCEEDED,
            EnrollmentRunState.FAILED,
        }:
            break
        await asyncio.sleep(0)

    assert current.state == EnrollmentRunState.SUCCEEDED
    assert current.result is not None
    assert current.result.course_name == "第二志愿"
    assert client.calls == [
        ("first", False),
        ("first", True),
        ("first", False),
        ("first", True),
        ("second", False),
    ]
    assert [event.type for event in current.events].count("attempt") == 3
    await manager.close()
