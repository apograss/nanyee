"""Merge duplicate active evaluation jobs.

Users could create several daily evaluation jobs, each logging in to the
school system every morning. Keep the most recently created active job per
user and cancel the rest with error_code DUPLICATE_MERGED, which the notices
endpoint uses to tell the user.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0006"
down_revision: str | None = "20261008_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

logger = logging.getLogger("alembic.runtime.migration")

_ACTIVE_JOB_STATES = ("QUEUED", "RUNNING", "RETRY_WAIT")

_jobs = sa.table(
    "jobs",
    sa.column("id", sa.Uuid),
    sa.column("user_id", sa.Uuid),
    sa.column("tool_id", sa.String),
    sa.column("state", sa.String),
    sa.column("lease_owner", sa.String),
    sa.column("lease_expires_at", sa.DateTime(timezone=True)),
    sa.column("cancel_requested_at", sa.DateTime(timezone=True)),
    sa.column("finished_at", sa.DateTime(timezone=True)),
    sa.column("error_code", sa.String),
    sa.column("next_action", sa.String),
    sa.column("created_at", sa.DateTime(timezone=True)),
)


def merge(connection: sa.Connection, now: datetime) -> int:
    rows = connection.execute(
        sa.select(_jobs.c.id, _jobs.c.user_id, _jobs.c.created_at)
        .where(
            _jobs.c.tool_id == "evaluation",
            _jobs.c.state.in_(_ACTIVE_JOB_STATES),
            _jobs.c.cancel_requested_at.is_(None),
        )
        .order_by(_jobs.c.user_id, _jobs.c.created_at.desc())
    ).all()
    seen: set[Any] = set()
    duplicates: list[Any] = []
    for row in rows:
        if row.user_id in seen:
            duplicates.append(row.id)
        else:
            seen.add(row.user_id)
    if duplicates:
        connection.execute(
            _jobs.update()
            .where(_jobs.c.id.in_(duplicates))
            .values(
                state="CANCELLED",
                cancel_requested_at=now,
                finished_at=now,
                error_code="DUPLICATE_MERGED",
                next_action=None,
                lease_owner=None,
                lease_expires_at=None,
            )
        )
    return len(duplicates)


def upgrade() -> None:
    if op.get_context().as_sql:
        # 离线 SQL 模式无法读取数据，合并需在线执行
        return
    merged = merge(op.get_bind(), datetime.now(UTC))
    logger.info("Merged %d duplicate evaluation job(s).", merged)


def downgrade() -> None:
    # 数据修复不可逆
    pass
