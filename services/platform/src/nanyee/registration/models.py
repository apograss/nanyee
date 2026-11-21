from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from nanyee.db.base import Base, TimestampMixin


class RegistrationMethod(StrEnum):
    EMAIL = "email"
    QUIZ = "quiz"
    QUICK = "quick"  # App 内快速注册：少量题目
    # 以下两种不用于注册：登录后绑定/换绑邮箱、凭邮箱找回密码
    EMAIL_BIND = "email_bind"
    PASSWORD_RESET = "password_reset"  # noqa: S105 - 枚举值，不是密码


REGISTRATION_METHODS = frozenset(
    {RegistrationMethod.EMAIL, RegistrationMethod.QUIZ, RegistrationMethod.QUICK}
)


class RegistrationChallenge(TimestampMixin, Base):
    __tablename__ = "registration_challenges"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    method: Mapped[RegistrationMethod] = mapped_column(
        Enum(RegistrationMethod, native_enum=False, length=16), nullable=False, index=True
    )
    email: Mapped[str | None] = mapped_column(String(254), index=True)
    # 绑定邮箱：发起的用户；找回密码：邮箱对应的用户（邮箱未绑定时为空）
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    code_digest: Mapped[str | None] = mapped_column(String(64))
    question_ids: Mapped[list[int] | None] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    requester_digest: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
