import secrets
from datetime import timedelta
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from ..auth import Admin, CurrentUser, DB, Member, now
from ..models import Category, Family, FamilyMember, PasswordReset, User
from ..schemas import CategoryInput, FamilyInput, MemberInput
from ..services import category_for, families_for
from .auth import code_digest

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


# Letters and digits that are hard to confuse when read aloud or retyped.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
RESET_MINUTES = 30


@router.post("/{family_id}/members/{user_id}/reset-code", status_code=201)
async def issue_reset_code(family_id: int, user_id: int, db: DB, member: Admin):
    """Gives a member a one-time code to set a new password, without email.

    Only ordinary members can be reset, and only if they share no other
    household with other people, so an admin cannot use a reset to get into
    a household they do not belong to.
    """
    target = await db.get(FamilyMember, (family_id, user_id))
    if target is None:
        raise HTTPException(404, "Household member not found.")
    other_households = select(FamilyMember.family_id).where(
        FamilyMember.user_id == user_id, FamilyMember.family_id != family_id
    )
    shares_other = await db.scalar(
        select(FamilyMember.user_id).where(
            FamilyMember.family_id.in_(other_households),
            FamilyMember.user_id != user_id,
        )
    )
    if user_id == member.user_id or target.role != "Member" or shares_other:
        raise HTTPException(
            403,
            "Admins can reset passwords only for members who belong to no other household.",
        )
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    # Older unused codes stop working when a new one is issued.
    await db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user_id, PasswordReset.used_at.is_(None))
        .values(used_at=now())
    )
    reset = PasswordReset(
        user_id=user_id,
        created_by=member.user_id,
        code_hash=code_digest(code),
        expires_at=now() + timedelta(minutes=RESET_MINUTES),
    )
    db.add(reset)
    await db.commit()
    return {"code": f"{code[:4]}-{code[4:]}", "expires_at": reset.expires_at}


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
