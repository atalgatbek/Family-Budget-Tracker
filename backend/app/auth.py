from datetime import datetime, timedelta, timezone
from typing import Annotated
import jwt
from fastapi import Cookie, Depends, HTTPException, Response
from pwdlib import PasswordHash
from sqlalchemy.ext.asyncio import AsyncSession
from .config import get_settings
from .database import get_db
from .models import FamilyMember, User

password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash("timing-protection-unused-password")
DB = Annotated[AsyncSession, Depends(get_db)]


def issue_cookie(response: Response, user: User):
    settings = get_settings()
    token = jwt.encode(
        {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
        settings.jwt_secret,
        algorithm="HS256",
    )
    response.set_cookie(
        "family_session",
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=43200,
        path="/",
    )


async def current_user(
    db: DB, family_session: Annotated[str | None, Cookie()] = None
) -> User:
    try:
        payload = jwt.decode(
            family_session or "",
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp"]},
        )
        user = await db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(401, "Please sign in to continue.")
    if user is None:
        raise HTTPException(401, "Please sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def membership(family_id: int, db: DB, user: CurrentUser) -> FamilyMember:
    member = await db.get(FamilyMember, (family_id, user.id))
    if member is None:
        raise HTTPException(404, "Household not found.")
    return member


Member = Annotated[FamilyMember, Depends(membership)]


async def admin_member(member: Member) -> FamilyMember:
    if member.role != "Admin":
        raise HTTPException(403, "Only household admins can change these settings.")
    return member


Admin = Annotated[FamilyMember, Depends(admin_member)]
