"""Add hosted_credentials.account_digest (blind index of the school account).

Existing rows are backfilled out of band by
``python -m nanyee.credentials.backfill_account_digest`` inside the worker
container, because computing the digest requires decrypting credentials.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261028_0008"
down_revision: str | None = "20261028_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "hosted_credentials", sa.Column("account_digest", sa.String(length=64), nullable=True)
    )
    op.create_index(
        op.f("ix_hosted_credentials_account_digest"), "hosted_credentials", ["account_digest"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_hosted_credentials_account_digest"), table_name="hosted_credentials")
    op.drop_column("hosted_credentials", "account_digest")
