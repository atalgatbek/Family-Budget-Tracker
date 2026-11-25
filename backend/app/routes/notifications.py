from fastapi import APIRouter
from sqlalchemy import func, select, update
from ..auth import DB, CurrentUser, now
from ..models import Family, Notification
from ..schemas import NotificationsRead

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
async def list_notifications(db: DB, user: CurrentUser):
    rows = (
        await db.execute(
            select(Notification, Family.name)
            .join(Family, Family.id == Notification.family_id)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(30)
        )
    ).all()
    unread = await db.scalar(
        select(func.count()).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return {
        "unread": unread,
        "items": [
            {
                "id": row.id,
                "family_id": row.family_id,
                "family_name": family_name,
                "kind": row.kind,
                "payload": row.payload,
                "created_at": row.created_at,
                "read": row.read_at is not None,
            }
            for row, family_name in rows
        ],
    }


@router.post("/read", status_code=204)
async def mark_read(payload: NotificationsRead, db: DB, user: CurrentUser):
    query = update(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    )
    if payload.ids is not None:
        query = query.where(Notification.id.in_(payload.ids))
    await db.execute(query.values(read_at=now()))
    await db.commit()
