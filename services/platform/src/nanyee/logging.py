from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from nanyee.context import request_id_context

ALLOWED_EXTRA_FIELDS = frozenset(
    {
        "duration_ms",
        "error_code",
        "event",
        "http_method",
        "http_path",
        "http_status",
        "job_id",
        "run_id",
        "attempt",
        "course_index",
        "course_name",
        "pending_count",
        "submitted_count",
        "state",
        "request_id",
        "tool_id",
        "upstream",
    }
)


class SafeJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = request_id_context.get()
        if request_id:
            payload["request_id"] = request_id
        for field in ALLOWED_EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception_type"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(SafeJsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
