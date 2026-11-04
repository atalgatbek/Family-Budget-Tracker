from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..auth import Admin, CurrentUser, DB, Member
from ..models import Category, Family, FamilyMember, User
from ..schemas import CategoryInput, FamilyInput, MemberInput
from ..services import category_for, families_for

router = APIRouter(prefix="/families", tags=["Households"])


@router.get("")
async def list_families(db: DB, user: CurrentUser):
    return await families_for(db, user.id)


@router.post("", status_code=201)
async def create_family(payload: FamilyInput, db: DB, user: CurrentUser):
    family = Family(name=payload.name)
    db.add(family)
    await db.flush()
    db.add(FamilyMember(family_id=family.id, user_id=user.id, role="Admin"))
    db.add_all(
        Category(family_id=family.id, name=name)
        for name in ["Food", "Transport", "Utilities", "Children", "Entertainment"]
    )
    await db.commit()
    return (await families_for(db, user.id))[-1]


@router.patch("/{family_id}")
async def rename_family(family_id: int, payload: FamilyInput, db: DB, member: Admin):
    family = await db.get(Family, family_id)
    family.name = payload.name
    await db.commit()
    return {"id": family.id, "name": family.name}


@router.get("/{family_id}/members")
async def members(family_id: int, db: DB, member: Member):
    rows = (
        await db.execute(
            select(User, FamilyMember)
            .join(FamilyMember)
            .where(FamilyMember.family_id == family_id)
            .order_by(User.id)
        )
    ).all()
    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "role": item.role,
            "joined_date": item.joined_date,
            **(
                {"email": user.email}
                if member.role == "Admin" or user.id == member.user_id
                else {}
            ),
        }
        for user, item in rows
    ]


@router.post("/{family_id}/members", status_code=201)
async def add_member(family_id: int, payload: MemberInput, db: DB, member: Admin):
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None:
        raise HTTPException(
            404,
            "Ask this person to create an account first, then add their email here.",
        )
    db.add(FamilyMember(family_id=family_id, user_id=user.id, role=payload.role))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This person already belongs to your household.")
    return {"id": user.id, "full_name": user.full_name, "role": payload.role}


@router.get("/{family_id}/categories")
async def categories(family_id: int, db: DB, member: Member):
    rows = (
        await db.scalars(
            select(Category)
            .where(Category.family_id == family_id)
            .order_by(Category.id)
        )
    ).all()
    return [
        {"id": row.id, "name": row.name, "is_active": row.is_active} for row in rows
    ]


@router.post("/{family_id}/categories", status_code=201)
async def create_category(
    family_id: int, payload: CategoryInput, db: DB, member: Admin
):
    row = Category(family_id=family_id, **payload.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "A category with this name already exists.")
    return {"id": row.id, "name": row.name, "is_active": row.is_active}


@router.put("/{family_id}/categories/{category_id}")
async def update_category(
    family_id: int, category_id: int, payload: CategoryInput, db: DB, member: Admin
):
    row = await category_for(db, family_id, category_id)
    row.name, row.is_active = payload.name, payload.is_active
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "A category with this name already exists.")
    return {"id": row.id, "name": row.name, "is_active": row.is_active}
