from datetime import date
from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Category, Expense, Family, FamilyMember, Income, MonthlyLimit, User


def month_bounds(month: str) -> tuple[date, date]:
    year, number = map(int, month.split("-"))
    if year < 1900 or year > 9998:
        raise HTTPException(422, "Choose a year between 1900 and 9998.")
    return date(year, number, 1), date(
        year + (number == 12), 1 if number == 12 else number + 1, 1
    )


def user_view(user: User) -> dict:
    return {"id": user.id, "full_name": user.full_name, "email": user.email}


async def families_for(db: AsyncSession, user_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(Family, FamilyMember.role)
            .join(FamilyMember)
            .where(FamilyMember.user_id == user_id)
            .order_by(Family.id)
        )
    ).all()
    result = []
    for family, role in rows:
        latest = await db.scalar(
            select(func.max(MonthlyLimit.budget_month))
            .join(Category)
            .where(Category.family_id == family.id)
        )
        result.append(
            {
                "id": family.id,
                "name": family.name,
                "currency": family.currency,
                "role": role,
                "latest_budget_month": latest,
            }
        )
    return result


async def category_for(db: AsyncSession, family_id: int, category_id: int) -> Category:
    category = await db.scalar(
        select(Category).where(
            Category.id == category_id, Category.family_id == family_id
        )
    )
    if category is None:
        raise HTTPException(404, "Category not found in this household.")
    return category


async def expense_for(
    db: AsyncSession, family_id: int, expense_id: int, member: FamilyMember
) -> Expense:
    query = select(Expense).where(
        Expense.id == expense_id, Expense.family_id == family_id
    )
    if member.role != "Admin":
        query = query.where(Expense.user_id == member.user_id)
    expense = await db.scalar(query)
    if expense is None:
        raise HTTPException(404, "Expense not found.")
    return expense


async def expense_view(db: AsyncSession, expense: Expense) -> dict:
    return {
        "id": expense.id,
        "reference": f"EXP-{expense.id:04d}",
        "family_id": expense.family_id,
        "user_id": expense.user_id,
        "user_name": (await db.get(User, expense.user_id)).full_name,
        "category_id": expense.category_id,
        "category_name": (await db.get(Category, expense.category_id)).name,
        "amount_kzt": expense.amount_kzt,
        "expense_date": expense.expense_date,
        "created_at": expense.created_at,
        "status": expense.status,
        "note": expense.note,
        "has_receipt": expense.receipt_photo is not None,
    }


async def budget_summary(db: AsyncSession, family_id: int, month: str) -> dict:
    start, end = month_bounds(month)
    spent = (
        select(Expense.category_id, func.sum(Expense.amount_kzt).label("spent"))
        .where(
            Expense.family_id == family_id,
            Expense.expense_date >= start,
            Expense.expense_date < end,
            Expense.status == "Saved",
        )
        .group_by(Expense.category_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(Category, MonthlyLimit.limit_kzt, func.coalesce(spent.c.spent, 0))
            .outerjoin(
                MonthlyLimit,
                and_(
                    MonthlyLimit.category_id == Category.id,
                    MonthlyLimit.budget_month == month,
                ),
            )
            .outerjoin(spent, spent.c.category_id == Category.id)
            .where(Category.family_id == family_id)
            .order_by(Category.id)
        )
    ).all()
    categories = []
    for category, limit, amount in rows:
        if not category.is_active and limit is None and not amount:
            continue
        categories.append(
            {
                "id": category.id,
                "name": category.name,
                "is_active": category.is_active,
                "limit_kzt": limit,
                "spent_kzt": amount,
                "left_kzt": limit - amount if limit is not None else None,
                "used_percent": (amount * 200 + limit) // (limit * 2)
                if limit
                else None,
            }
        )
    planned = sum(row["limit_kzt"] or 0 for row in categories)
    total_spent = sum(row["spent_kzt"] for row in categories)
    income = await db.scalar(
        select(func.coalesce(func.sum(Income.amount_kzt), 0)).where(
            Income.family_id == family_id,
            Income.income_date >= start,
            Income.income_date < end,
        )
    )
    # Review counts are aggregated; no other member's individual record is exposed.
    review = await db.scalar(
        select(func.count())
        .select_from(Expense)
        .where(
            Expense.family_id == family_id,
            Expense.expense_date >= start,
            Expense.expense_date < end,
            Expense.status == "Needs review",
        )
    )
    daily = (
        await db.execute(
            select(Expense.expense_date, func.sum(Expense.amount_kzt))
            .where(
                Expense.family_id == family_id,
                Expense.status == "Saved",
                Expense.expense_date >= start,
                Expense.expense_date < end,
            )
            .group_by(Expense.expense_date)
            .order_by(Expense.expense_date)
        )
    ).all()
    return {
        "month": month,
        "planned_kzt": planned,
        "spent_kzt": total_spent,
        "remaining_kzt": planned - total_spent,
        "income_kzt": income,
        "balance_kzt": income - total_spent,
        "review_count": review,
        "categories": categories,
        "daily": [{"date": day, "amount_kzt": amount} for day, amount in daily],
        "unbudgeted_kzt": sum(
            row["spent_kzt"] for row in categories if row["limit_kzt"] is None
        ),
    }
