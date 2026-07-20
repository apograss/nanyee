from __future__ import annotations

import random

from nanyee.integrations.smu.evaluation_automation import build_legacy_positive_answers
from nanyee.tool_registry.payloads import validate_job_payload
from nanyee.tools.evaluation import (
    EvaluationDraft,
    EvaluationOption,
    EvaluationQuestion,
    EvaluationReference,
)


def test_legacy_evaluation_strategy_answers_every_question() -> None:
    draft = EvaluationDraft(
        reference=EvaluationReference(
            teacher_code="teacher",
            class_hour_code="hour",
            questionnaire_code="questionnaire",
        ),
        hidden_fields={},
        questions=[
            EvaluationQuestion(
                type_code=1,
                indicator_code="quality",
                title="教学质量",
                options=[
                    EvaluationOption(code="excellent", score=25, label="非常满意"),
                    EvaluationOption(code="good", score=20, label="满意"),
                    EvaluationOption(code="normal", score=15, label="一般"),
                ],
            ),
            EvaluationQuestion(
                type_code=2,
                indicator_code="attendance",
                title="是否迟到",
                options=[
                    EvaluationOption(code="yes", label="是"),
                    EvaluationOption(code="no", label="否"),
                ],
            ),
        ],
    )

    selections, answers = build_legacy_positive_answers(
        draft,
        rng=random.Random(7),  # noqa: S311 - deterministic test fixture
    )

    assert set(selections) == {"quality", "attendance"}
    assert selections["attendance"] == "no"
    assert sum(answer.score for answer in answers) in {15, 20, 25}


def test_evaluation_job_is_durable_and_requires_hosted_credentials() -> None:
    validated = validate_job_payload(
        "evaluation",
        "submit",
        {"strategy": "legacy_positive_random", "max_courses": 60},
    )

    assert validated.credential_required is True
    assert validated.max_attempts == 86_400
