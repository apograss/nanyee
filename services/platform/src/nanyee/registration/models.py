from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, Enum, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from nanyee.db.base import Base, TimestampMixin


class RegistrationMethod(StrEnum):
    EMAIL = "email"
    QUIZ = "quiz"


class RegistrationChallenge(TimestampMixin, Base):
    __tablename__ = "registration_challenges"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    method: Mapped[RegistrationMethod] = mapped_column(
        Enum(RegistrationMethod, native_enum=False, length=16), nullable=False, index=True
    )
    email: Mapped[str | None] = mapped_column(String(254), index=True)
    code_digest: Mapped[str | None] = mapped_column(String(64))
    question_ids: Mapped[list[int] | None] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    requester_digest: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
