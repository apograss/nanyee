from __future__ import annotations

import random
from collections.abc import Sequence

from nanyee.tools.evaluation import EvaluationAutoAnswer, EvaluationDraft, EvaluationOption

LEGACY_POSITIVE_PROFILES: tuple[tuple[int, ...], ...] = (
    (0, 0, 1, 1),
    (0, 1, 1, 2),
    (1, 1, 1, 1),
    (0, 1, 1, 1),
)


def build_legacy_positive_answers(
    draft: EvaluationDraft,
    *,
    rng: random.Random | random.SystemRandom | None = None,
) -> tuple[dict[str, str], list[EvaluationAutoAnswer]]:
    """Reproduce the old tool's mostly-positive randomized answer strategy."""
    picker = rng or random.SystemRandom()
    profile = list(picker.choice(LEGACY_POSITIVE_PROFILES))
    picker.shuffle(profile)
    rating_index = 0
    selections: dict[str, str] = {}
    answers: list[EvaluationAutoAnswer] = []

    for question in draft.questions:
        scored = sorted(
            (option for option in question.options if option.score > 0),
            key=lambda option: option.score,
            reverse=True,
        )
        if scored:
            preferred_rank = profile[rating_index % len(profile)]
            selected = scored[min(preferred_rank, len(scored) - 1)]
            rating_index += 1
        else:
            selected = _last_option(question.options)
        selections[question.indicator_code] = selected.code
        answers.append(
            EvaluationAutoAnswer(
                indicator_code=question.indicator_code,
                title=question.title,
                selected_code=selected.code,
                label=selected.label,
                score=selected.score,
            )
        )
    return selections, answers


def _last_option(options: Sequence[EvaluationOption]) -> EvaluationOption:
    if not options:
        raise ValueError("evaluation question does not contain options")
    return options[-1]
