import hmac
import logging
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from ..auth import (
    COOKIE,
    DB,
    CurrentSession,
    CurrentUser,
    dummy_hash,
    now,
    password_hash,
    revoke_sessions,
    start_session,
    token_claims,
)
from ..config import get_settings
from ..mail import MailError, send_mail
from ..models import Category, Family, FamilyMember, PasswordReset, User, UserSession
from ..resets import code_digest, new_reset_code, reset_email, reset_link
from ..schemas import (
    ForgotPassword,
    Login,
    PasswordChange,
    Register,
)
from ..schemas import (
    PasswordReset as ResetInput,
)
from ..services import families_for, user_view

router = APIRouter(prefix="/auth", tags=["Authentication"])
INVALID_CODE = "This reset code is invalid or has expired."

# A new email is sent at most this often per account.
RESEND_SECONDS = 60
log = logging.getLogger(__name__)


def site_address(request: Request) -> str | None:
    """Where the link in the email should point: the configured address, or
    the site the request came from when it is one of ours."""
    settings = get_settings()
    if settings.public_url:
        return settings.public_url
    origin = request.headers.get("origin")
    return origin if origin in settings.origins else None


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
    await start_session(db, response, user)
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
    await start_session(db, response, user)
    return {"user": user_view(user), "families": await families_for(db, user.id)}


@router.get("/me")
async def me(user: CurrentUser, session: CurrentSession, db: DB):
    return {
        "user": user_view(user),
        "families": await families_for(db, user.id),
        "session_expires_at": session.expires_at,
    }


@router.post("/logout", status_code=204)
async def logout(response: Response, db: DB, request: Request):
    # Signing out ends this session on the server, so a copied cookie stops working.
    claims = token_claims(request.cookies.get(COOKIE))
    if claims:
        await db.execute(
            update(UserSession)
            .where(
                UserSession.id == claims["sid"],
                UserSession.user_id == int(claims["sub"]),
                UserSession.revoked_at.is_(None),
            )
            .values(revoked_at=now())
        )
        await db.commit()
    response.delete_cookie(COOKIE, path="/")


@router.post("/logout-all", status_code=204)
async def logout_everywhere(response: Response, db: DB, user: CurrentUser):
    await revoke_sessions(db, user.id)
    await db.commit()
    response.delete_cookie(COOKIE, path="/")


@router.post("/password", status_code=204)
async def change_password(
    payload: PasswordChange, db: DB, user: CurrentUser, session: CurrentSession
):
    valid = await run_in_threadpool(
        password_hash.verify, payload.current_password, user.password_hash
    )
    if not valid:
        raise HTTPException(422, "The current password is incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(422, "Choose a new password that differs from the old one.")
    user.password_hash = await run_in_threadpool(
        password_hash.hash, payload.new_password
    )
    # Other devices have to sign in again with the new password.
    await revoke_sessions(db, user.id, keep=session.id)
    await db.commit()


@router.post("/forgot", status_code=202)
async def forgot_password(payload: ForgotPassword, request: Request, db: DB):
    """Emails a one-time code. The answer is the same whether or not the
    account exists."""
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None:
        return {"detail": "If this email has an account, we sent a code to it."}
    recent = await db.scalar(
        select(PasswordReset.id).where(
            PasswordReset.user_id == user.id,
            PasswordReset.created_by == user.id,
            PasswordReset.created_at > now() - timedelta(seconds=RESEND_SECONDS),
        )
    )
    if recent is None:
        code = await new_reset_code(db, user.id, created_by=user.id)
        base = site_address(request)
        subject, text, html = reset_email(
            payload.lang,
            user.full_name,
            code,
            reset_link(base, user.email, code) if base else None,
        )
        try:
            await send_mail(user.email, subject, text, html)
        except MailError:
            await db.rollback()
            raise HTTPException(
                503, "We could not send the email. Try again in a few minutes."
            )
        await db.commit()
    return {"detail": "If this email has an account, we sent a code to it."}


@router.post("/reset", status_code=204)
async def reset_password(payload: ResetInput, db: DB):
    user = await db.scalar(select(User).where(User.email == payload.email))
    reset = (
        await db.scalar(
            select(PasswordReset)
            .where(
                PasswordReset.user_id == user.id,
                PasswordReset.used_at.is_(None),
                PasswordReset.expires_at > now(),
            )
            .order_by(PasswordReset.id.desc())
            .with_for_update()
        )
        if user
        else None
    )
    if reset is None or not hmac.compare_digest(
        reset.code_hash, code_digest(payload.code)
    ):
        raise HTTPException(400, INVALID_CODE)
    user.password_hash = await run_in_threadpool(
        password_hash.hash, payload.new_password
    )
    reset.used_at = now()
    await revoke_sessions(db, user.id)
    await db.commit()
