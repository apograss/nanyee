from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType
from uuid import UUID, uuid4

from nanyee.credentials.models import CredentialStatus, HostedCredential
from nanyee.db.base import Base
from nanyee.identity.models import RegistrationTrustLevel, User, UserStatus
from nanyee.jobs.models import Job, JobState
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

NOW = datetime(2026, 10, 8, 4, 0, tzinfo=UTC)
MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "20261008_0005_recover_evaluation_jobs.py"
)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("recover_evaluation_jobs", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _user(db: Session, name: str, status: UserStatus = UserStatus.ACTIVE) -> User:
    user = User(
        username=name,
        username_normalized=name,
        nickname=name,
        password_hash="x",
        registration_trust_level=RegistrationTrustLevel.COMMUNITY_QUIZ,
        status=status,
    )
    db.add(user)
    db.flush()
    return user


def _credential(
    db: Session,
    user: User,
    *,
    purpose: str = "school",
    status: CredentialStatus = CredentialStatus.ACTIVE,
) -> HostedCredential:
    credential = HostedCredential(
        user_id=user.id,
        upstream="school",
        purpose=purpose,
        ciphertext=b"c",
        nonce=b"n",
        wrapped_data_key=b"k",
        key_reference="ref",
        key_wrap_algorithm="local",
        public_metadata={},
        status=status,
        expires_at=None,
        consent_version="credential-hosting-v1",
    )
    db.add(credential)
    db.flush()
    return credential


def _job(
    db: Session,
    user: User,
    credential: HostedCredential | None,
    *,
    state: JobState,
    created_days_ago: int = 38,
    error_code: str | None = None,
    payload: dict[str, object] | None = None,
) -> Job:
    job = Job(
        user_id=user.id,
        credential_id=credential.id if credential else None,
        tool_id="evaluation",
        operation="submit",
        payload=payload or {"strategy": "legacy_positive_random", "max_courses": 60},
        request_digest="d",
        idempotency_key=str(uuid4()),
        confirmation_version="evaluation:submit:v1",
        state=state,
        scheduled_for=NOW - timedelta(days=8),
        attempt_count=45,
        max_attempts=86400,
        finished_at=NOW - timedelta(days=8),
        receipt={"logs": [{"event": "evaluation_completed", "message": "旧日志"}]},
        error_code=error_code,
        created_at=NOW - timedelta(days=created_days_ago),
    )
    db.add(job)
    db.flush()
    return job


def test_recover_requeues_only_eligible_evaluation_jobs() -> None:
    migration = _load_migration()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        # 30 天窗口结束：同一用户有新旧两条，只恢复最新的
        window_user = _user(db, "window_user")
        window_cred = _credential(db, window_user)
        _job(db, window_user, window_cred, state=JobState.SUCCEEDED, created_days_ago=60)
        window_job = _job(db, window_user, window_cred, state=JobState.SUCCEEDED)

        # 凭据过期失败：凭据现已永久，恢复
        expired_user = _user(db, "expired_user")
        expired_cred = _credential(db, expired_user, purpose="evaluation")
        expired_job = _job(
            db,
            expired_user,
            expired_cred,
            state=JobState.FAILED,
            error_code="CREDENTIAL_UNAVAILABLE",
        )

        # 以下都不恢复
        busy_user = _user(db, "busy_user")
        busy_cred = _credential(db, busy_user)
        busy_old = _job(db, busy_user, busy_cred, state=JobState.SUCCEEDED)
        _job(db, busy_user, busy_cred, state=JobState.QUEUED, created_days_ago=1)

        revoked_user = _user(db, "revoked_user")
        revoked_cred = _credential(db, revoked_user, status=CredentialStatus.REVOKED)
        revoked_job = _job(db, revoked_user, revoked_cred, state=JobState.SUCCEEDED)

        suspended_user = _user(db, "suspended_user", UserStatus.SUSPENDED)
        suspended_cred = _credential(db, suspended_user)
        suspended_job = _job(db, suspended_user, suspended_cred, state=JobState.SUCCEEDED)

        deadline_user = _user(db, "deadline_user")
        deadline_cred = _credential(db, deadline_user)
        deadline_job = _job(
            db,
            deadline_user,
            deadline_cred,
            state=JobState.SUCCEEDED,
            payload={"strategy": "legacy_positive_random", "retry_until": "2026-09-01T00:00:00Z"},
        )

        other_failure_user = _user(db, "other_failure_user")
        other_failure_cred = _credential(db, other_failure_user)
        other_failure_job = _job(
            db,
            other_failure_user,
            other_failure_cred,
            state=JobState.FAILED,
            error_code="CREDENTIAL_INVALID",
        )

        old_user = _user(db, "old_user")
        old_cred = _credential(db, old_user)
        old_job = _job(db, old_user, old_cred, state=JobState.SUCCEEDED, created_days_ago=181)
        db.commit()
        untouched: dict[UUID, JobState] = {
            job.id: job.state
            for job in (
                busy_old,
                revoked_job,
                suspended_job,
                deadline_job,
                other_failure_job,
                old_job,
            )
        }
        window_user_id = window_user.id
        window_id, expired_id = window_job.id, expired_job.id

    with engine.begin() as connection:
        assert migration.recover(connection, NOW) == 2

    with Session(engine) as db:
        for job_id in (window_id, expired_id):
            job = db.get(Job, job_id)
            assert job is not None
            assert job.state == JobState.QUEUED
            assert job.scheduled_for.replace(tzinfo=UTC) == NOW + timedelta(minutes=10)
            assert job.finished_at is None
            assert job.error_code is None
            assert job.receipt is not None
            logs = job.receipt["logs"]
            assert isinstance(logs, list)
            assert logs[-1]["event"] == "system_notice"
            assert "自动恢复" in logs[-1]["message"]
        window_user_states = [
            job.state for job in db.query(Job).filter(Job.user_id == window_user_id)
        ]
        assert sorted(window_user_states) == sorted([JobState.QUEUED, JobState.SUCCEEDED])
        for job_id, state in untouched.items():
            job = db.get(Job, job_id)
            assert job is not None
            assert job.state == state
            assert job.finished_at is not None
