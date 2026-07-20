from __future__ import annotations

from pydantic import BaseModel, Field


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
