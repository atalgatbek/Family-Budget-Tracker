"""Cache official National Bank exchange rates."""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "exchange_rate",
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("rate_kzt", sa.Numeric(precision=14, scale=6), nullable=False),
        sa.CheckConstraint("rate_kzt > 0", name="exchange_rate_positive"),
        sa.PrimaryKeyConstraint("rate_date", "currency"),
    )


def downgrade():
    op.drop_table("exchange_rate")
