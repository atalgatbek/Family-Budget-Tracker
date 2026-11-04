from datetime import date, datetime
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class Family(Base):
    __tablename__ = "family"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(
        String(3), default="KZT", server_default="KZT"
    )
    created_date: Mapped[date] = mapped_column(
        Date, default=date.today, server_default=func.current_date()
    )
    __table_args__ = (CheckConstraint("currency = 'KZT'", name="family_currency_kzt"),)


class User(Base):
    __tablename__ = "app_user"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class FamilyMember(Base):
    __tablename__ = "family_member"
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(10), default="Member")
    joined_date: Mapped[date] = mapped_column(
        Date, default=date.today, server_default=func.current_date()
    )
    __table_args__ = (
        CheckConstraint("role IN ('Admin', 'Member')", name="member_role"),
    )


class Category(Base):
    __tablename__ = "category"
    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("family.id"), index=True)
    name: Mapped[str] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    __table_args__ = (
        UniqueConstraint("family_id", "id", name="category_family_id_key"),
        Index(
            "category_family_name_unique", "family_id", func.lower(name), unique=True
        ),
    )


class MonthlyLimit(Base):
    __tablename__ = "monthly_limit"
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"))
    budget_month: Mapped[str] = mapped_column(String(7))
    limit_kzt: Mapped[int] = mapped_column(Integer)
    __table_args__ = (
        UniqueConstraint(
            "category_id", "budget_month", name="limit_category_month_unique"
        ),
        CheckConstraint(
            "limit_kzt > 0 AND limit_kzt <= 1000000000", name="limit_positive"
        ),
        CheckConstraint(
            "budget_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'", name="limit_month_format"
        ),
    )


class Expense(Base):
    __tablename__ = "expense"
    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(Integer)
    category_id: Mapped[int] = mapped_column(Integer)
    amount_kzt: Mapped[int] = mapped_column(Integer)
    expense_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    receipt_photo: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(20), default="Saved", server_default="Saved"
    )
    note: Mapped[str] = mapped_column(String(160), default="", server_default="")
    client_request_id: Mapped[str] = mapped_column(String(36), unique=True)
    __table_args__ = (
        ForeignKeyConstraint(
            ["family_id", "user_id"],
            ["family_member.family_id", "family_member.user_id"],
            name="expense_family_member_fk",
        ),
        ForeignKeyConstraint(
            ["family_id", "category_id"],
            ["category.family_id", "category.id"],
            name="expense_family_category_fk",
        ),
        CheckConstraint(
            "amount_kzt BETWEEN 1 AND 10000000", name="expense_amount_range"
        ),
        CheckConstraint("status IN ('Saved', 'Needs review')", name="expense_status"),
        Index("expense_family_date_idx", "family_id", "expense_date"),
    )


class LimitChangeLog(Base):
    __tablename__ = "limit_change_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    limit_id: Mapped[int] = mapped_column(ForeignKey("monthly_limit.id"))
    changed_by: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    old_kzt: Mapped[int | None] = mapped_column(Integer)
    new_kzt: Mapped[int] = mapped_column(Integer)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reason: Mapped[str] = mapped_column(String(160), default="", server_default="")


class Income(Base):
    __tablename__ = "income"
    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(Integer)
    amount_kzt: Mapped[int] = mapped_column(Integer)
    income_date: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(80))
    client_request_id: Mapped[str] = mapped_column(String(36), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    __table_args__ = (
        ForeignKeyConstraint(
            ["family_id", "user_id"],
            ["family_member.family_id", "family_member.user_id"],
        ),
        CheckConstraint(
            "amount_kzt BETWEEN 1 AND 10000000", name="income_amount_range"
        ),
        Index("income_family_date_idx", "family_id", "income_date"),
    )
