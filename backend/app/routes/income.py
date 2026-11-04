from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..auth import DB, Member
from ..models import Income, User
from ..schemas import IncomeInput, Month
from ..services import month_bounds

router = APIRouter(prefix="/families/{family_id}/income", tags=["Income"])


async def income_view(db: DB, row: Income):
    return {
        "id": row.id,
        "user_id": row.user_id,
        "user_name": (await db.get(User, row.user_id)).full_name,
        "source": row.source,
        "amount_kzt": row.amount_kzt,
        "income_date": row.income_date,
    }


@router.get("")
async def list_income(family_id: int, month: Month, db: DB, member: Member):
    start, end = month_bounds(month)
    query = select(Income).where(
        Income.family_id == family_id,
        Income.income_date >= start,
        Income.income_date < end,
    )
    if member.role != "Admin":
        query = query.where(Income.user_id == member.user_id)
    rows = (
        await db.scalars(query.order_by(Income.income_date.desc(), Income.id.desc()))
    ).all()
    return [await income_view(db, row) for row in rows]


@router.post("", status_code=201)
async def create_income(family_id: int, payload: IncomeInput, db: DB, member: Member):
    async def replay():
        row = await db.scalar(
            select(Income).where(
                Income.client_request_id == str(payload.client_request_id)
            )
        )
        if row is None:
            return None
        if (
            row.family_id != family_id
            or row.user_id != member.user_id
            or any(
                getattr(row, key) != getattr(payload, key)
                for key in ["source", "amount_kzt", "income_date"]
            )
        ):
            raise HTTPException(
                409, "This request was already used for a different income entry."
            )
        return await income_view(db, row)

    existing = await replay()
    if existing:
        return existing
    row = Income(
        family_id=family_id,
        user_id=member.user_id,
        **payload.model_dump(exclude={"client_request_id"}),
        client_request_id=str(payload.client_request_id),
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        await db.refresh(member)
        existing = await replay()
        if existing:
            return existing
        raise HTTPException(409, "Income could not be saved. Refresh and try again.")
    return await income_view(db, row)


@router.delete("/{income_id}", status_code=204)
async def delete_income(family_id: int, income_id: int, db: DB, member: Member):
    query = select(Income).where(Income.family_id == family_id, Income.id == income_id)
    if member.role != "Admin":
        query = query.where(Income.user_id == member.user_id)
    row = await db.scalar(query)
    if row is None:
        raise HTTPException(404, "Income entry not found.")
    await db.delete(row)
    await db.commit()
