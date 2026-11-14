from datetime import date
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from ..auth import Admin, DB, Member
from ..models import SavingsGoal
from ..schemas import GoalContribution, GoalInput, GoalUpdate, today

router = APIRouter(prefix="/families/{family_id}/goals", tags=["Savings goals"])


def goal_view(row: SavingsGoal) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "target_kzt": row.target_kzt,
        "saved_kzt": row.saved_kzt,
        "deadline": row.deadline,
    }


def check_deadline(deadline: date | None, previous: date | None = None):
    # An unchanged deadline may already be in the past; a new one may not.
    if deadline and deadline != previous and deadline < today():
        raise HTTPException(422, "Choose a deadline that is today or later.")


async def goal_for(db: DB, family_id: int, goal_id: int) -> SavingsGoal:
    row = await db.scalar(
        select(SavingsGoal).where(
            SavingsGoal.family_id == family_id, SavingsGoal.id == goal_id
        )
    )
    if row is None:
        raise HTTPException(404, "Savings goal not found.")
    return row


@router.get("")
async def list_goals(family_id: int, db: DB, member: Member):
    rows = await db.scalars(
        select(SavingsGoal)
        .where(SavingsGoal.family_id == family_id)
        .order_by(SavingsGoal.id)
    )
    return [goal_view(row) for row in rows]


@router.post("", status_code=201)
async def create_goal(family_id: int, payload: GoalInput, db: DB, member: Admin):
    check_deadline(payload.deadline)
    row = SavingsGoal(family_id=family_id, **payload.model_dump())
    db.add(row)
    await db.commit()
    return goal_view(row)


@router.put("/{goal_id}")
async def update_goal(
    family_id: int, goal_id: int, payload: GoalUpdate, db: DB, member: Admin
):
    row = await goal_for(db, family_id, goal_id)
    check_deadline(payload.deadline, row.deadline)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    return goal_view(row)


@router.post("/{goal_id}/contributions")
async def contribute(
    family_id: int, goal_id: int, payload: GoalContribution, db: DB, member: Member
):
    # One UPDATE adds to the stored amount, so two members saving at the same
    # moment cannot overwrite each other.
    try:
        row = await db.scalar(
            update(SavingsGoal)
            .where(SavingsGoal.family_id == family_id, SavingsGoal.id == goal_id)
            .values(saved_kzt=SavingsGoal.saved_kzt + payload.amount_kzt)
            .returning(SavingsGoal)
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(422, "The saved amount would be too large.")
    if row is None:
        raise HTTPException(404, "Savings goal not found.")
    view = goal_view(row)
    await db.commit()
    return view


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(family_id: int, goal_id: int, db: DB, member: Admin):
    await db.delete(await goal_for(db, family_id, goal_id))
    await db.commit()
