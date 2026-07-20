from __future__ import annotations

import json
import secrets
from functools import lru_cache
from importlib.resources import files

from pydantic import BaseModel, ConfigDict


class QuizQuestion(BaseModel):
    model_config = ConfigDict(frozen=True)

    content: str
    options: tuple[str, ...]
    correctAnswer: int
    category: str


@lru_cache
def load_quiz_bank() -> tuple[QuizQuestion, ...]:
    resource = files("nanyee.registration").joinpath("quiz_bank.json")
    raw = json.loads(resource.read_text(encoding="utf-8"))
    return tuple(QuizQuestion.model_validate(item) for item in raw)


def pick_question_ids(count: int) -> list[int]:
    bank = load_quiz_bank()
    if len(bank) < count:
        raise RuntimeError("quiz bank does not contain enough questions")
    return secrets.SystemRandom().sample(range(len(bank)), count)


def grade_answers(question_ids: list[int], answers: list[int]) -> int:
    if len(question_ids) != len(answers):
        return 0
    bank = load_quiz_bank()
    return sum(
        1
        for question_id, answer in zip(question_ids, answers, strict=True)
        if 0 <= question_id < len(bank) and bank[question_id].correctAnswer == answer
    )
