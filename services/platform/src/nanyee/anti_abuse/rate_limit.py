from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from nanyee.anti_abuse.models import RateLimitBucket


@dataclass(frozen=True, slots=True)
class RateLimitPolicy:
    window_seconds: int
    soft_limit: int
    hard_limit: int
    verified_extra_limit: int = 2

    def __post_init__(self) -> None:
        if self.window_seconds <= 0 or self.soft_limit < 0:
            raise ValueError("rate-limit policy values must be positive")
        if self.hard_limit <= self.soft_limit:
            raise ValueError("hard_limit must exceed soft_limit")
        if self.verified_extra_limit < 0:
            raise ValueError("verified_extra_limit cannot be negative")


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    allowed: bool
    challenge_required: bool
    retry_after_seconds: int
    count: int


class DatabaseRateLimiter:
    async def hit(
        self,
        session: AsyncSession,
        *,
        action: str,
        subject_digest: str,
        policy: RateLimitPolicy,
        human_verified: bool = False,
        now: datetime | None = None,
    ) -> RateLimitDecision:
        current = (now or datetime.now(UTC)).astimezone(UTC)
        epoch = int(current.timestamp())
        window_epoch = epoch - (epoch % policy.window_seconds)
        window_started_at = datetime.fromtimestamp(window_epoch, tz=UTC)

        values = {
            "action": action,
            "subject_digest": subject_digest,
            "window_started_at": window_started_at,
            "count": 1,
        }
        dialect = session.get_bind().dialect.name
        if dialect == "postgresql":
            insert_statement = postgresql_insert(RateLimitBucket).values(**values)
            upsert_statement = insert_statement.on_conflict_do_update(
                index_elements=["action", "subject_digest", "window_started_at"],
                set_={"count": RateLimitBucket.count + 1},
            ).returning(RateLimitBucket.count)
            count = int((await session.execute(upsert_statement)).scalar_one())
        elif dialect == "sqlite":
            sqlite_insert_statement = sqlite_insert(RateLimitBucket).values(**values)
            sqlite_upsert_statement = sqlite_insert_statement.on_conflict_do_update(
                index_elements=["action", "subject_digest", "window_started_at"],
                set_={"count": RateLimitBucket.count + 1},
            ).returning(RateLimitBucket.count)
            count = int((await session.execute(sqlite_upsert_statement)).scalar_one())
        else:
            raise RuntimeError(f"unsupported rate-limit database dialect: {dialect}")

        retry_after = max(1, window_epoch + policy.window_seconds - epoch)
        if count > policy.hard_limit:
            return RateLimitDecision(False, False, retry_after, count)
        if count > policy.soft_limit:
            verified_limit = min(policy.hard_limit, policy.soft_limit + policy.verified_extra_limit)
            allowed = human_verified and count <= verified_limit
            return RateLimitDecision(allowed, not allowed, retry_after, count)
        return RateLimitDecision(True, False, retry_after, count)

    async def current_count(
        self,
        session: AsyncSession,
        *,
        action: str,
        subject_digest: str,
        window_started_at: datetime,
    ) -> int:
        statement = select(RateLimitBucket.count).where(
            RateLimitBucket.action == action,
            RateLimitBucket.subject_digest == subject_digest,
            RateLimitBucket.window_started_at == window_started_at,
        )
        return int((await session.execute(statement)).scalar_one_or_none() or 0)
