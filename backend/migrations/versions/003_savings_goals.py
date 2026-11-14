"""Add household savings goals."""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "savings_goal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("target_kzt", sa.Integer(), nullable=False),
        sa.Column("saved_kzt", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "target_kzt BETWEEN 1 AND 1000000000", name="goal_target_range"
        ),
        sa.CheckConstraint(
            "saved_kzt BETWEEN 0 AND 1000000000", name="goal_saved_range"
        ),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_savings_goal_family_id"), "savings_goal", ["family_id"], unique=False
    )


def downgrade():
    op.drop_index(op.f("ix_savings_goal_family_id"), table_name="savings_goal")
    op.drop_table("savings_goal")
