from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Index, Integer, LargeBinary, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from nanyee.db.base import Base, TimestampMixin


class CredentialStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"
    DELETED = "deleted"


class HostedCredential(TimestampMixin, Base):
    __tablename__ = "hosted_credentials"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    upstream: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(64), nullable=False)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    nonce: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    wrapped_data_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    key_reference: Mapped[str] = mapped_column(String(512), nullable=False)
    key_wrap_algorithm: Mapped[str] = mapped_column(String(32), nullable=False)
    envelope_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    public_metadata: Mapped[dict[str, str | int | bool | None]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    status: Mapped[CredentialStatus] = mapped_column(
        Enum(CredentialStatus, native_enum=False, length=16),
        default=CredentialStatus.ACTIVE,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_version: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (Index("ix_hosted_credentials_user_status", "user_id", "status"),)
