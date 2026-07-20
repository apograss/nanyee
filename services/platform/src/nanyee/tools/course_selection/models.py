from __future__ import annotations

from pydantic import BaseModel, Field


class CourseCategory(BaseModel):
    code: str = Field(pattern=r"^\d{1,8}$")
    title: str = Field(min_length=1, max_length=100)


class CourseItem(BaseModel):
    task_code: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    teacher: str = Field(default="", max_length=100)
    selected_count: int = Field(default=0, ge=0)
    capacity: int = Field(default=0, ge=0)
    credits: float = Field(default=0, ge=0)
    hours: float = Field(default=0, ge=0)
    schedule: str = Field(default="", max_length=500)
    location: str = Field(default="", max_length=300)
    department: str = Field(default="", max_length=200)


class EnrollmentResult(BaseModel):
    success: bool
    course_name: str
    outcome: str
