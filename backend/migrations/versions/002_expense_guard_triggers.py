"""Enforce dates and archived categories at the PostgreSQL boundary."""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE FUNCTION guard_expense() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.expense_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Almaty')::date THEN
                RAISE EXCEPTION 'Expense date cannot be in the future' USING ERRCODE = '23514';
            END IF;
            IF EXISTS (SELECT 1 FROM category WHERE id = NEW.category_id
                       AND family_id = NEW.family_id AND is_active = FALSE) THEN
                NEW.status := 'Needs review';
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER expense_guard BEFORE INSERT OR UPDATE ON expense
        FOR EACH ROW EXECUTE FUNCTION guard_expense();
    """)
    op.execute("""
        CREATE FUNCTION guard_income_date() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.income_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Almaty')::date THEN
                RAISE EXCEPTION 'Income date cannot be in the future' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER income_date_guard BEFORE INSERT OR UPDATE ON income
        FOR EACH ROW EXECUTE FUNCTION guard_income_date();
    """)


def downgrade():
    op.execute(
        "DROP TRIGGER income_date_guard ON income; DROP FUNCTION guard_income_date();"
    )
    op.execute("DROP TRIGGER expense_guard ON expense; DROP FUNCTION guard_expense();")
