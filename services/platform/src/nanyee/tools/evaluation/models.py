from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class EvaluationReference(BaseModel):
    teacher_code: str = Field(min_length=1, max_length=128)
    class_hour_code: str = Field(min_length=1, max_length=128)
    questionnaire_code: str = Field(min_length=1, max_length=128)


class PendingEvaluation(EvaluationReference):
    teacher_name: str = Field(default="", max_length=100)
    course_name: str = Field(default="", max_length=200)
    end_date: str = Field(default="", max_length=32)


class EvaluationOption(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    score: int = Field(default=0, ge=0, le=100)
    label: str = Field(default="", max_length=100)


class EvaluationQuestion(BaseModel):
    type_code: int
    indicator_code: str = Field(min_length=1, max_length=128)
    title: str = Field(default="", max_length=500)
    options: list[EvaluationOption] = Field(min_length=1, max_length=20)


class EvaluationDraft(BaseModel):
    reference: EvaluationReference
    teacher_name: str = Field(default="", max_length=100)
    course_name: str = Field(default="", max_length=200)
    hidden_fields: dict[str, str]
    questions: list[EvaluationQuestion] = Field(min_length=1, max_length=100)


class EvaluationResult(BaseModel):
    submitted: bool
    teacher_name: str
    course_name: str
    total_score: int


class EvaluationAutoAnswer(BaseModel):
    indicator_code: str
    title: str
    selected_code: str
    label: str
    score: int


class EvaluationAutomationRequest(BaseModel):
    strategy: Literal["legacy_positive_random"] = "legacy_positive_random"
    max_courses: int = Field(default=60, ge=1, le=60)
    retry_until: datetime | None = None

    @field_validator("retry_until")
    @classmethod
    def require_retry_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("retry_until must include a timezone")
        return value
