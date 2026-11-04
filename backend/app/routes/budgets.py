from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..auth import Admin, DB, Member
from ..models import Category, LimitChangeLog, MonthlyLimit, User
from ..schemas import LimitInput, Month, TransferInput
from ..services import budget_summary, category_for, month_bounds

router = APIRouter(prefix="/families/{family_id}", tags=["Budgets"])


@router.get("/summary")
async def summary(family_id: int, month: Month, db: DB, member: Member):
    return await budget_summary(db, family_id, month)


@router.put("/limits")
async def save_limit(family_id: int, payload: LimitInput, db: DB, member: Admin):
    await category_for(db, family_id, payload.category_id)
    month_bounds(payload.budget_month)
    row = await db.scalar(
        select(MonthlyLimit)
        .where(
            MonthlyLimit.category_id == payload.category_id,
            MonthlyLimit.budget_month == payload.budget_month,
        )
        .with_for_update()
    )
    old = row.limit_kzt if row else None
    if row is None:
        row = MonthlyLimit(**payload.model_dump())
        db.add(row)
    else:
        row.limit_kzt = payload.limit_kzt
    try:
        await db.flush()
        if old != payload.limit_kzt:
            db.add(
                LimitChangeLog(
                    limit_id=row.id,
                    changed_by=member.user_id,
                    old_kzt=old,
                    new_kzt=payload.limit_kzt,
                    reason="Monthly plan updated",
                )
            )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            409, "This limit changed at the same time. Refresh and try again."
        )
    return await budget_summary(db, family_id, payload.budget_month)


@router.post("/limits/transfer")
async def transfer(family_id: int, payload: TransferInput, db: DB, member: Admin):
    if payload.source_category_id == payload.destination_category_id:
        raise HTTPException(422, "Choose two different categories.")
    month_bounds(payload.budget_month)
    for category_id in [payload.source_category_id, payload.destination_category_id]:
        await category_for(db, family_id, category_id)
    # Stable lock order prevents opposing transfers from deadlocking.
    rows = (
        await db.scalars(
            select(MonthlyLimit)
            .where(
                MonthlyLimit.category_id.in_(
                    [payload.source_category_id, payload.destination_category_id]
                ),
                MonthlyLimit.budget_month == payload.budget_month,
            )
            .order_by(MonthlyLimit.id)
            .with_for_update()
        )
    ).all()
    if len(rows) != 2:
        raise HTTPException(422, "Both categories need a limit for this month.")
    by_category = {row.category_id: row for row in rows}
    source, destination = (
        by_category[payload.source_category_id],
        by_category[payload.destination_category_id],
    )
    if source.limit_kzt <= payload.amount_kzt:
        raise HTTPException(422, "Keep at least ₸1 in the source category.")
    if destination.limit_kzt + payload.amount_kzt > 1_000_000_000:
        raise HTTPException(422, "The destination limit would be too large.")
    for row, difference in [
        (source, -payload.amount_kzt),
        (destination, payload.amount_kzt),
    ]:
        old = row.limit_kzt
        row.limit_kzt += difference
        db.add(
            LimitChangeLog(
                limit_id=row.id,
                changed_by=member.user_id,
                old_kzt=old,
                new_kzt=row.limit_kzt,
                reason="Budget transfer",
            )
        )
    await db.commit()
    return await budget_summary(db, family_id, payload.budget_month)


@router.get("/limit-history")
async def history(family_id: int, month: Month, db: DB, member: Admin):
    rows = (
        await db.execute(
            select(LimitChangeLog, Category.name, User.full_name)
            .join(MonthlyLimit, MonthlyLimit.id == LimitChangeLog.limit_id)
            .join(Category, Category.id == MonthlyLimit.category_id)
            .join(User, User.id == LimitChangeLog.changed_by)
            .where(Category.family_id == family_id, MonthlyLimit.budget_month == month)
            .order_by(LimitChangeLog.changed_at.desc(), LimitChangeLog.id.desc())
            .limit(100)
        )
    ).all()
    return [
        {
            "id": row.id,
            "category_name": category,
            "changed_by": name,
            "old_kzt": row.old_kzt,
            "new_kzt": row.new_kzt,
            "changed_at": row.changed_at,
            "reason": row.reason,
        }
        for row, category, name in rows
    ]
