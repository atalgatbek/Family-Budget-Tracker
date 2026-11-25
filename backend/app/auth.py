"""Sign-in sessions.

The cookie holds a short signed token that names a server-side session. The
token expires after a period without activity and is renewed while the person
keeps using the site; the session row sets a hard end and can be revoked, so
signing out really ends it.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4
import jwt
from fastapi import Cookie, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from .config import get_settings
from .database import get_db
from .models import FamilyMember, User, UserSession

password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash("timing-protection-unused-password")
DB = Annotated[AsyncSession, Depends(get_db)]
COOKIE = "family_session"


def now() -> datetime:
    return datetime.now(timezone.utc)


def set_cookie(response: Response, session: UserSession) -> None:
    settings = get_settings()
    expires = min(
        now() + timedelta(minutes=settings.session_idle_minutes), session.expires_at
    )
    token = jwt.encode(
        {"sub": str(session.user_id), "sid": session.id, "exp": expires},
        settings.jwt_secret,
        algorithm="HS256",
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max(1, int((expires - now()).total_seconds())),
        path="/",
    )


async def start_session(db: AsyncSession, response: Response, user: User) -> None:
    started = now()
    session = UserSession(
        id=str(uuid4()),
        user_id=user.id,
        expires_at=started + timedelta(hours=get_settings().session_max_hours),
        last_seen_at=started,
    )
    db.add(session)
    await db.commit()
    set_cookie(response, session)


async def revoke_sessions(
    db: AsyncSession, user_id: int, keep: str | None = None
) -> None:
    """Ends every session of the user, except `keep` when given."""
    query = update(UserSession).where(
        UserSession.user_id == user_id, UserSession.revoked_at.is_(None)
    )
    if keep:
        query = query.where(UserSession.id != keep)
    await db.execute(query.values(revoked_at=now()))


def token_claims(token: str | None) -> dict | None:
    try:
        return jwt.decode(
            token or "",
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "sid", "exp"]},
        )
    except jwt.PyJWTError:
        return None


async def current_session(
    request: Request,
    response: Response,
    db: DB,
    family_session: Annotated[str | None, Cookie()] = None,
) -> UserSession:
    claims = token_claims(family_session)
    session = await db.get(UserSession, claims["sid"]) if claims else None
    if (
        session is None
        or str(session.user_id) != claims["sub"]
        or session.revoked_at is not None
        or session.expires_at <= now()
    ):
        raise HTTPException(401, "Please sign in to continue.")
    # Renew the cookie once half of the idle time has passed.
    idle = timedelta(minutes=get_settings().session_idle_minutes)
    expires = datetime.fromtimestamp(claims["exp"], timezone.utc)
    if expires - now() < idle / 2 and expires < session.expires_at:
        session.last_seen_at = now()
        await db.commit()
        set_cookie(response, session)
    request.state.session_id = session.id
    return session


CurrentSession = Annotated[UserSession, Depends(current_session)]


async def current_user(db: DB, session: CurrentSession) -> User:
    user = await db.get(User, session.user_id)
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
