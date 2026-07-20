from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from nanyee.errors import AppError, ErrorCode
from nanyee.tools.qun_checkin import QunSubmitRequest
from nanyee.tools.study_cabin import StudyCabinReservationRequest


@dataclass(frozen=True, slots=True)
class ValidatedJobPayload:
    payload: dict[str, object]
    max_attempts: int = 3
    credential_required: bool = False


def validate_job_payload(
    tool_id: str, operation: str, payload: dict[str, Any]
) -> ValidatedJobPayload:
    if (tool_id, operation) == ("qun_checkin", "submit"):
        try:
            qun_request = QunSubmitRequest.model_validate(payload)
        except ValidationError as exc:
            raise _payload_error("群报数提交参数无效。", exc) from exc
        return ValidatedJobPayload(
            payload=qun_request.model_dump(mode="json"),
            max_attempts=3,
            credential_required=True,
        )
    if (tool_id, operation) != ("study_cabin", "reserve"):
        return ValidatedJobPayload(payload=dict(payload))
    try:
        cabin_request = StudyCabinReservationRequest.model_validate(payload)
    except ValidationError as exc:
        raise _payload_error("学习舱预约参数无效。", exc) from exc
    return ValidatedJobPayload(
        payload=cabin_request.model_dump(mode="json"),
        max_attempts=1440,
        credential_required=True,
    )


def _payload_error(message: str, exc: ValidationError) -> AppError:
    return AppError(
        ErrorCode.INVALID_REQUEST,
        message,
        status_code=422,
        details={
            "fields": [
                {"location": list(error["loc"]), "type": error["type"]} for error in exc.errors()
            ]
        },
    )
