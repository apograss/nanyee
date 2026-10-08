"""按任务状态实时计算的站内通知，不单独落库；可关闭的通知由前端按 id 记住已读。"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.credentials.models import CredentialStatus, HostedCredential
from nanyee.db import get_db_session
from nanyee.identity.router import current_auth
from nanyee.identity.sessions import AuthContext
from nanyee.jobs.models import (
    ACTIVE_JOB_STATES,
    DUPLICATE_MERGED_ERROR,
    EVALUATION_TOOL_ID,
    SYSTEM_NOTICE_EVENT,
    Job,
    JobState,
)
from nanyee.security import as_utc, utc_now

router = APIRouter(prefix="/notices", tags=["notices"])

# 一次性事件（恢复、合并）的通知只展示这么久
_EVENT_NOTICE_TTL = timedelta(days=30)


class NoticeResponse(BaseModel):
    id: str
    kind: Literal["credential_invalid", "evaluation_recovered", "duplicates_merged"]
    level: Literal["danger", "info"]
    title: str
    message: str
    dismissible: bool
    job_id: UUID | None = None
    credential_id: UUID | None = None


def _parse_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return as_utc(datetime.fromisoformat(value))
    except ValueError:
        return None


def _latest_system_notice(job: Job) -> dict[str, object] | None:
    logs = (job.receipt or {}).get("logs")
    if not isinstance(logs, list):
        return None
    notices = [
        entry
        for entry in logs
        if isinstance(entry, dict) and entry.get("event") == SYSTEM_NOTICE_EVENT
    ]
    return notices[-1] if notices else None


@router.get("", response_model=list[NoticeResponse], operation_id="list_notices")
async def list_notices(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthContext, Depends(current_auth)],
) -> list[NoticeResponse]:
    jobs = list(
        (
            await db.execute(
                select(Job)
                .where(Job.user_id == auth.user.id, Job.tool_id == EVALUATION_TOOL_ID)
                .order_by(Job.created_at.desc())
                .limit(100)
            )
        ).scalars()
    )
    now = utc_now()
    notices: list[NoticeResponse] = []
    active = [job for job in jobs if job.state in ACTIVE_JOB_STATES]

    if not active and jobs:
        latest = jobs[0]
        if latest.state == JobState.FAILED and latest.error_code == "CREDENTIAL_INVALID":
            credential_id = latest.credential_id
            if credential_id is not None:
                status = (
                    await db.execute(
                        select(HostedCredential.status).where(
                            HostedCredential.id == credential_id,
                            HostedCredential.user_id == auth.user.id,
                        )
                    )
                ).scalar_one_or_none()
                if status != CredentialStatus.ACTIVE:
                    credential_id = None
            notices.append(
                NoticeResponse(
                    id=f"credential_invalid:{latest.id}",
                    kind="credential_invalid",
                    level="danger",
                    title="自动评课已停止：学校密码不正确",
                    message=(
                        "学校系统提示账号或密码不匹配，可能是你改过学校密码。"
                        "在授权管理里更新密码后，评课任务会自动恢复，不用重新创建。"
                        if credential_id is not None
                        else "学校系统提示账号或密码不匹配，原授权已不可用。"
                        "请在评课页面重新填写学号密码，开始新的自动评课。"
                    ),
                    dismissible=False,
                    job_id=latest.id,
                    credential_id=credential_id,
                )
            )

    for job in active:
        notice = _latest_system_notice(job)
        notice_time = _parse_time(notice.get("time")) if notice else None
        if notice is None or notice_time is None or notice_time + _EVENT_NOTICE_TTL <= now:
            continue
        notices.append(
            NoticeResponse(
                id=f"evaluation_recovered:{job.id}:{notice_time.isoformat()}",
                kind="evaluation_recovered",
                level="info",
                title="自动评课已恢复",
                message=str(notice.get("message") or "评课任务已恢复运行。"),
                dismissible=True,
                job_id=job.id,
            )
        )
        break

    merged = [
        job
        for job in jobs
        if job.error_code == DUPLICATE_MERGED_ERROR
        and job.finished_at is not None
        and as_utc(job.finished_at) + _EVENT_NOTICE_TTL > now
    ]
    if merged:
        last_merged = max(as_utc(job.finished_at) for job in merged if job.finished_at)
        kept = active[0] if active else None
        notices.append(
            NoticeResponse(
                id=f"duplicates_merged:{last_merged.isoformat()}",
                kind="duplicates_merged",
                level="info",
                title="重复的评课任务已合并",
                message=(
                    f"你之前创建了 {len(merged) + 1} 个相同的自动评课任务，每天会重复登录学校。"
                    f"已自动合并为 1 个（保留最新创建的那个），其余 {len(merged)} 个已取消，"
                    "评课不受影响。"
                ),
                dismissible=True,
                job_id=kept.id if kept else None,
            )
        )
    return notices
