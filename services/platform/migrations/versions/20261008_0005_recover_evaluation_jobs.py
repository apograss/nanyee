"""Recover daily evaluation jobs that stopped early.

Two groups of evaluation jobs ended for reasons that no longer apply:
- jobs without retry_until that completed because of the old implicit 30-day
  window (a daily evaluation job only reaches SUCCEEDED when its window ends);
- jobs that failed with CREDENTIAL_UNAVAILABLE because their school credential
  expired, now that school-account credentials are permanent (0004).

Each affected user gets their most recent eligible job re-queued to run
shortly after deployment, with a system notice in the job log. Users who already have an
active evaluation job are left alone.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0005"
down_revision: str | None = "20261008_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

logger = logging.getLogger("alembic.runtime.migration")

_BEIJING = ZoneInfo("Asia/Shanghai")
_JOB_WINDOW = timedelta(days=180)
# 旧窗口为 30 天；跨度不足的"已完成"是每日运行上线前的一次性任务，不恢复
_OLD_WINDOW_MIN_SPAN = timedelta(days=29)
# 留出新版 worker 启动的时间，避免旧 worker 按旧逻辑领走后再次结束任务
_START_DELAY = timedelta(minutes=10)
_ACTIVE_JOB_STATES = {"QUEUED", "RUNNING", "RETRY_WAIT"}
_EVALUATION_CREDENTIAL_PURPOSES = {"school", "evaluation"}

_jobs = sa.table(
    "jobs",
    sa.column("id", sa.Uuid),
    sa.column("user_id", sa.Uuid),
    sa.column("credential_id", sa.Uuid),
    sa.column("tool_id", sa.String),
    sa.column("payload", sa.JSON),
    sa.column("state", sa.String),
    sa.column("scheduled_for", sa.DateTime(timezone=True)),
    sa.column("attempt_count", sa.Integer),
    sa.column("max_attempts", sa.Integer),
    sa.column("lease_owner", sa.String),
    sa.column("lease_expires_at", sa.DateTime(timezone=True)),
    sa.column("cancel_requested_at", sa.DateTime(timezone=True)),
    sa.column("finished_at", sa.DateTime(timezone=True)),
    sa.column("receipt", sa.JSON),
    sa.column("error_code", sa.String),
    sa.column("next_action", sa.String),
    sa.column("created_at", sa.DateTime(timezone=True)),
)
_users = sa.table("users", sa.column("id", sa.Uuid), sa.column("status", sa.String))
_credentials = sa.table(
    "hosted_credentials",
    sa.column("id", sa.Uuid),
    sa.column("purpose", sa.String),
    sa.column("status", sa.String),
    sa.column("expires_at", sa.DateTime(timezone=True)),
)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _recovery_reason(row: Any) -> str | None:
    state = str(row.state).upper()
    payload = row.payload if isinstance(row.payload, dict) else {}
    if (
        state == "SUCCEEDED"
        and payload.get("retry_until") is None
        and row.finished_at is not None
        and _utc(row.finished_at) - _utc(row.created_at) >= _OLD_WINDOW_MIN_SPAN
    ):
        return "window"
    if state == "FAILED" and row.error_code == "CREDENTIAL_UNAVAILABLE":
        return "credential"
    return None


def recover(connection: sa.Connection, now: datetime) -> int:
    rows = connection.execute(
        sa.select(
            _jobs,
            _users.c.status.label("user_status"),
            _credentials.c.purpose.label("credential_purpose"),
            _credentials.c.status.label("credential_status"),
            _credentials.c.expires_at.label("credential_expires_at"),
        )
        .join(_users, _users.c.id == _jobs.c.user_id)
        .outerjoin(_credentials, _credentials.c.id == _jobs.c.credential_id)
        .where(_jobs.c.tool_id == "evaluation")
    ).all()

    busy_users = {row.user_id for row in rows if str(row.state).upper() in _ACTIVE_JOB_STATES}
    latest: dict[Any, Any] = {}
    for row in rows:
        if (
            row.user_id in busy_users
            or row.cancel_requested_at is not None
            or row.credential_id is None
            or _recovery_reason(row) is None
            or str(row.user_status).upper() != "ACTIVE"
            or str(row.credential_status).upper() != "ACTIVE"
            or row.credential_purpose not in _EVALUATION_CREDENTIAL_PURPOSES
            or (
                row.credential_expires_at is not None
                and _utc(row.credential_expires_at) <= now
            )
            or row.attempt_count >= row.max_attempts
            or _utc(row.created_at) + _JOB_WINDOW <= now
        ):
            continue
        current = latest.get(row.user_id)
        if current is None or _utc(row.created_at) > _utc(current.created_at):
            latest[row.user_id] = row

    stamp = now.astimezone(_BEIJING).strftime("%Y-%m-%d %H:%M")
    for row in latest.values():
        if _recovery_reason(row) == "window":
            cause = "此前任务因期限计算错误提前结束"
        else:
            cause = "此前任务因学校凭据到期而停止，学校账号凭据现已改为永久保存"
        notice = {
            "time": now.isoformat(),
            "event": "system_notice",
            "message": (
                f"系统修复：{cause}，已于 {stamp}（北京时间）自动恢复。"
                "任务会在约 10 分钟后补跑一次，之后每天 07:00 继续自动评课，无需重新创建。"
            ),
        }
        receipt = dict(row.receipt) if isinstance(row.receipt, dict) else {}
        previous_logs = receipt.get("logs")
        receipt["logs"] = [*(previous_logs if isinstance(previous_logs, list) else []), notice]
        connection.execute(
            _jobs.update()
            .where(_jobs.c.id == row.id)
            .values(
                state="QUEUED",
                scheduled_for=now + _START_DELAY,
                finished_at=None,
                error_code=None,
                next_action=None,
                lease_owner=None,
                lease_expires_at=None,
                receipt=receipt,
            )
        )
    return len(latest)


def upgrade() -> None:
    if op.get_context().as_sql:
        # 离线 SQL 模式无法读取数据，恢复需在线执行
        return
    recovered = recover(op.get_bind(), datetime.now(UTC))
    logger.info("Recovered %d evaluation job(s).", recovered)


def downgrade() -> None:
    # 数据修复不可逆：恢复后的任务可能已经执行，无法区分回滚
    pass
