"""Shared request counters for rate limiting across server copies."""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rate_limit",
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hits", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("key", "window_start"),
    )
    op.create_index(
        "rate_limit_window_idx", "rate_limit", ["window_start"], unique=False
    )


def downgrade():
    op.drop_index("rate_limit_window_idx", table_name="rate_limit")
    op.drop_table("rate_limit")
