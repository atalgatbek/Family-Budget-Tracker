"""Creating in-app notifications.

A notification stores names and amounts in `payload`; the browser turns them
into a sentence in the person's language. `dedupe_key` makes repeated events
(for example, a category crossing its limit several times) notify only once.
"""

from datetime import date
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Category, Expense, FamilyMember, MonthlyLimit, Notification
from .services import month_bounds


async def notify(
    db: AsyncSession,
    user_ids: list[int] | set[int],
    family_id: int,
    kind: str,
    payload: dict,
    dedupe: str | None = None,
) -> None:
    rows = [
        {
            "user_id": user_id,
            "family_id": family_id,
            "kind": kind,
            "payload": payload,
            "dedupe_key": dedupe,
        }
        for user_id in sorted(set(user_ids))
    ]
    if rows:
        await db.execute(
            insert(Notification)
            .values(rows)
            .on_conflict_do_nothing(constraint="notification_dedupe")
        )


async def admins_of(db: AsyncSession, family_id: int) -> set[int]:
    return set(
        await db.scalars(
            select(FamilyMember.user_id).where(
                FamilyMember.family_id == family_id, FamilyMember.role == "Admin"
            )
        )
    )


async def members_of(db: AsyncSession, family_id: int) -> set[int]:
    return set(
        await db.scalars(
            select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)
        )
    )


async def category_budget(
    db: AsyncSession, family_id: int, category_id: int, month: str
) -> tuple[int | None, int]:
    """Returns the month's limit (or None) and the saved spending so far."""
    start, end = month_bounds(month)
    limit = await db.scalar(
        select(MonthlyLimit.limit_kzt).where(
            MonthlyLimit.category_id == category_id,
            MonthlyLimit.budget_month == month,
        )
    )
    spent = await db.scalar(
        select(func.coalesce(func.sum(Expense.amount_kzt), 0)).where(
            Expense.family_id == family_id,
            Expense.category_id == category_id,
            Expense.status == "Saved",
            Expense.expense_date >= start,
            Expense.expense_date < end,
        )
    )
    return limit, int(spent)


async def check_category_limit(
    db: AsyncSession, family_id: int, category_id: int, day: date, actor_id: int
) -> None:
    """Tells admins and the person who spent when a category nears or passes its limit."""
    month = f"{day:%Y-%m}"
    limit, spent = await category_budget(db, family_id, category_id, month)
    if not limit:
        return
    if spent > limit:
        kind = "limit_over"
    elif spent * 100 >= limit * 85:
        kind = "limit_warning"
    else:
        return
    name = await db.scalar(select(Category.name).where(Category.id == category_id))
    await notify(
        db,
        await admins_of(db, family_id) | {actor_id},
        family_id,
        kind,
        {"category": name, "spent": spent, "limit": limit, "month": month},
        dedupe=f"{kind}:{category_id}:{month}",
    )
