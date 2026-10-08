"""Allow permanent hosted credentials and make school accounts permanent."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261008_0004"
down_revision: str | None = "20260720_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SCHOOL_ACCOUNT_PURPOSES = ("school", "evaluation", "study_cabin")


def upgrade() -> None:
    with op.batch_alter_table("hosted_credentials") as batch:
        batch.alter_column(
            "expires_at", existing_type=sa.DateTime(timezone=True), nullable=True
        )
    credentials = sa.table(
        "hosted_credentials",
        sa.column("purpose", sa.String),
        sa.column("expires_at", sa.DateTime(timezone=True)),
    )
    # 学校账号凭据改为永久，包括已过期的；已撤销/删除的凭据仍由 status 拦截
    op.execute(
        credentials.update()
        .where(credentials.c.purpose.in_(_SCHOOL_ACCOUNT_PURPOSES))
        .values(expires_at=None)
    )


def downgrade() -> None:
    credentials = sa.table(
        "hosted_credentials",
        sa.column("expires_at", sa.DateTime(timezone=True)),
    )
    op.execute(
        credentials.update()
        .where(credentials.c.expires_at.is_(None))
        .values(expires_at=sa.func.now() + sa.text("interval '180 days'"))
    )
    with op.batch_alter_table("hosted_credentials") as batch:
        batch.alter_column(
            "expires_at", existing_type=sa.DateTime(timezone=True), nullable=False
        )
