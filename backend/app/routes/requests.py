"""Purchase requests: a member asks, an admin approves or rejects.

Conditions: a request up to the household's auto-approve amount is approved
at once, unless it would take the category over this month's limit. An
approved request becomes an expense of the person who asked.
"""

from uuid import uuid4
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import case, select
from ..auth import DB, Admin, Member, now
from ..models import Category, Expense, Family, PurchaseRequest, User
from ..notifications import admins_of, category_budget, check_category_limit, notify
from ..schemas import PurchaseRequestInput, RequestDecision, RequestRules, today
from ..services import category_for

router = APIRouter(prefix="/families/{family_id}", tags=["Purchase requests"])
STATUSES = {"pending", "approved", "rejected", "cancelled"}


async def request_view(db: DB, row: PurchaseRequest) -> dict:
    requester = await db.get(User, row.user_id)
    category = await db.get(Category, row.category_id)
    decider = await db.get(User, row.decided_by) if row.decided_by else None
    left = None
    if row.status == "pending":
        limit, spent = await category_budget(
            db, row.family_id, row.category_id, f"{today():%Y-%m}"
        )
        left = None if limit is None else limit - spent
    return {
        "id": row.id,
        "user_id": row.user_id,
        "user_name": requester.full_name,
        "category_id": row.category_id,
        "category_name": category.name,
        "amount_kzt": row.amount_kzt,
        "note": row.note,
        "status": row.status,
        "auto": row.auto,
        "reason": row.reason,
        "decided_by_name": decider.full_name if decider else None,
        "decided_at": row.decided_at,
        "created_at": row.created_at,
        "expense_id": row.expense_id,
        # Only for pending requests: what is left of the category's limit now.
        "left_kzt": left,
        "over_limit": left is not None and row.amount_kzt > left,
    }


async def approve(db: DB, row: PurchaseRequest, decided_by: int | None) -> None:
    expense = Expense(
        family_id=row.family_id,
        user_id=row.user_id,
        category_id=row.category_id,
        amount_kzt=row.amount_kzt,
        expense_date=today(),
        note=row.note,
        status="Saved",
        client_request_id=str(uuid4()),
    )
    db.add(expense)
    await db.flush()
    row.status = "approved"
    row.decided_by = decided_by
    row.decided_at = now()
    row.expense_id = expense.id
    await check_category_limit(db, row.family_id, row.category_id, today(), row.user_id)


def summary(row: PurchaseRequest, user: User, category: Category) -> dict:
    return {
        "request_id": row.id,
        "by": user.full_name,
        "category": category.name,
        "amount": row.amount_kzt,
        "note": row.note,
    }


async def locked_request(db: DB, family_id: int, request_id: int) -> PurchaseRequest:
    row = await db.scalar(
        select(PurchaseRequest)
        .where(PurchaseRequest.family_id == family_id, PurchaseRequest.id == request_id)
        .with_for_update()
    )
    if row is None:
        raise HTTPException(404, "Purchase request not found.")
    if row.status != "pending":
        raise HTTPException(409, "This request has already been decided.")
    return row


@router.get("/requests")
async def list_requests(
    family_id: int,
    db: DB,
    member: Member,
    status: str | None = Query(None),
):
    query = select(PurchaseRequest).where(PurchaseRequest.family_id == family_id)
    if member.role != "Admin":
        query = query.where(PurchaseRequest.user_id == member.user_id)
    if status is not None:
        if status not in STATUSES:
            raise HTTPException(422, "Unknown request status.")
        query = query.where(PurchaseRequest.status == status)
    rows = await db.scalars(
        query.order_by(
            case((PurchaseRequest.status == "pending", 0), else_=1),
            PurchaseRequest.created_at.desc(),
            PurchaseRequest.id.desc(),
        ).limit(60)
    )
    return [await request_view(db, row) for row in rows]


@router.post("/requests", status_code=201)
async def create_request(
    family_id: int, payload: PurchaseRequestInput, db: DB, member: Member
):
    # An admin would only be approving their own request: they add expenses directly.
    if member.role == "Admin":
        raise HTTPException(
            403, "Admins add expenses directly. Requests are for members."
        )
    category = await category_for(db, family_id, payload.category_id)
    if not category.is_active:
        raise HTTPException(422, "Choose an active category.")
    row = PurchaseRequest(
        family_id=family_id, user_id=member.user_id, **payload.model_dump()
    )
    db.add(row)
    await db.flush()
    user = await db.get(User, member.user_id)
    family = await db.get(Family, family_id)
    limit, spent = await category_budget(db, family_id, category.id, f"{today():%Y-%m}")
    fits = limit is None or spent + row.amount_kzt <= limit
    if family.auto_approve_kzt and row.amount_kzt <= family.auto_approve_kzt and fits:
        row.auto = True
        await approve(db, row, decided_by=None)
        await notify(
            db,
            await admins_of(db, family_id) - {member.user_id},
            family_id,
            "request_auto",
            summary(row, user, category),
        )
    else:
        await notify(
            db,
            await admins_of(db, family_id) - {member.user_id},
            family_id,
            "request_new",
            summary(row, user, category),
        )
    await db.commit()
    return await request_view(db, row)


@router.post("/requests/{request_id}/approve")
async def approve_request(family_id: int, request_id: int, db: DB, member: Admin):
    row = await locked_request(db, family_id, request_id)
    await approve(db, row, decided_by=member.user_id)
    admin = await db.get(User, member.user_id)
    category = await db.get(Category, row.category_id)
    await notify(
        db,
        {row.user_id} - {member.user_id},
        family_id,
        "request_approved",
        summary(row, admin, category),
    )
    await db.commit()
    return await request_view(db, row)


@router.post("/requests/{request_id}/reject")
async def reject_request(
    family_id: int, request_id: int, payload: RequestDecision, db: DB, member: Admin
):
    row = await locked_request(db, family_id, request_id)
    row.status = "rejected"
    row.reason = payload.reason.strip()
    row.decided_by = member.user_id
    row.decided_at = now()
    admin = await db.get(User, member.user_id)
    category = await db.get(Category, row.category_id)
    await notify(
        db,
        {row.user_id} - {member.user_id},
        family_id,
        "request_rejected",
        {**summary(row, admin, category), "reason": row.reason},
    )
    await db.commit()
    return await request_view(db, row)


@router.delete("/requests/{request_id}", status_code=204)
async def cancel_request(family_id: int, request_id: int, db: DB, member: Member):
    row = await locked_request(db, family_id, request_id)
    if row.user_id != member.user_id:
        raise HTTPException(404, "Purchase request not found.")
    row.status = "cancelled"
    row.decided_at = now()
    await db.commit()


@router.put("/request-rules")
async def save_rules(family_id: int, payload: RequestRules, db: DB, member: Admin):
    family = await db.get(Family, family_id)
    family.auto_approve_kzt = payload.auto_approve_kzt
    await db.commit()
    return {"auto_approve_kzt": family.auto_approve_kzt}
