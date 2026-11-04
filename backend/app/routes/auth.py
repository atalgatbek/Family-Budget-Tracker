from fastapi import APIRouter, HTTPException, Response
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..auth import CurrentUser, DB, dummy_hash, issue_cookie, password_hash
from ..models import Category, Family, FamilyMember, User
from ..schemas import Login, Register
from ..services import families_for, user_view

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=201)
async def register(payload: Register, response: Response, db: DB):
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=await run_in_threadpool(password_hash.hash, payload.password),
    )
    db.add(user)
    try:
        await db.flush()
        family = Family(name=payload.family_name)
        db.add(family)
        await db.flush()
        db.add(FamilyMember(family_id=family.id, user_id=user.id, role="Admin"))
        db.add_all(
            Category(family_id=family.id, name=name)
            for name in ["Food", "Transport", "Utilities", "Children", "Entertainment"]
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "An account with this email already exists.")
    issue_cookie(response, user)
    return {"user": user_view(user), "families": await families_for(db, user.id)}


@router.post("/login")
async def login(payload: Login, response: Response, db: DB):
    user = await db.scalar(select(User).where(User.email == payload.email))
    valid = await run_in_threadpool(
        password_hash.verify,
        payload.password,
        user.password_hash if user else dummy_hash,
    )
    if user is None or not valid:
        raise HTTPException(401, "The email or password is incorrect.")
    issue_cookie(response, user)
    return {"user": user_view(user), "families": await families_for(db, user.id)}


@router.get("/me")
async def me(user: CurrentUser, db: DB):
    return {"user": user_view(user), "families": await families_for(db, user.id)}


@router.post("/logout", status_code=204)
async def logout(response: Response):
    response.delete_cookie("family_session", path="/")
