from __future__ import annotations

from enum import StrEnum
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from nanyee.context import request_id_context


class ErrorCode(StrEnum):
    INVALID_REQUEST = "INVALID_REQUEST"
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    CSRF_VALIDATION_FAILED = "CSRF_VALIDATION_FAILED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    RATE_LIMIT_CHALLENGE_REQUIRED = "RATE_LIMIT_CHALLENGE_REQUIRED"
    RATE_LIMITED = "RATE_LIMITED"
    HUMAN_VERIFICATION_FAILED = "HUMAN_VERIFICATION_FAILED"
    UPSTREAM_REJECTED = "UPSTREAM_REJECTED"
    UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE"
    RESULT_UNKNOWN = "RESULT_UNKNOWN"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    request_id: str | None = None
    retryable: bool = False
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorBody


class AppError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        status_code: int,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.details = details or {}
        self.headers = headers or {}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    details = dict(exc.details)
    anti_abuse_pass = getattr(request.state, "anti_abuse_pass", None)
    if isinstance(anti_abuse_pass, str):
        details["anti_abuse_pass"] = anti_abuse_pass
        details["anti_abuse_pass_expires_in"] = 300
    body = ErrorResponse(
        error=ErrorBody(
            code=exc.code,
            message=exc.message,
            request_id=request_id_context.get(),
            retryable=exc.retryable,
            details=details,
        )
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=body.model_dump(mode="json"),
        headers=exc.headers,
    )
