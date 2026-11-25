"""Purchase requests that an admin approves or rejects, with an auto-approve rule."""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("family", sa.Column("auto_approve_kzt", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "family_auto_approve_range",
        "family",
        "auto_approve_kzt IS NULL OR auto_approve_kzt BETWEEN 1 AND 10000000",
    )
    op.create_table(
        "purchase_request",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("amount_kzt", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=160), nullable=False),
        sa.Column(
            "status", sa.String(length=10), server_default="pending", nullable=False
        ),
        sa.Column("auto", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("decided_by", sa.Integer(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.String(length=160), server_default="", nullable=False),
        sa.Column("expense_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "amount_kzt BETWEEN 1 AND 10000000", name="request_amount_range"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="request_status",
        ),
        sa.ForeignKeyConstraint(
            ["family_id", "user_id"],
            ["family_member.family_id", "family_member.user_id"],
            name="request_family_member_fk",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["family_id", "category_id"],
            ["category.family_id", "category.id"],
            name="request_family_category_fk",
        ),
        sa.ForeignKeyConstraint(["decided_by"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["expense_id"], ["expense.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "purchase_request_family_status_idx",
        "purchase_request",
        ["family_id", "status"],
        unique=False,
    )


def downgrade():
    op.drop_index("purchase_request_family_status_idx", table_name="purchase_request")
    op.drop_table("purchase_request")
    op.drop_constraint("family_auto_approve_range", "family", type_="check")
    op.drop_column("family", "auto_approve_kzt")
