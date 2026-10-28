"""Link verification challenges to a user.

Email binding and password reset reuse registration_challenges; both need to
know which platform user the code belongs to.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261028_0007"
down_revision: str | None = "20261008_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("registration_challenges", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_registration_challenges_user_id_users"),
        "registration_challenges",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_registration_challenges_user_id"), "registration_challenges", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_registration_challenges_user_id"), table_name="registration_challenges")
    op.drop_constraint(
        op.f("fk_registration_challenges_user_id_users"),
        "registration_challenges",
        type_="foreignkey",
    )
    op.drop_column("registration_challenges", "user_id")
