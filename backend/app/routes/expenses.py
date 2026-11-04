import io
from pathlib import Path
from uuid import uuid4
import aiofiles
from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from ..auth import DB, Member
from ..config import get_settings
from ..models import Expense
from ..schemas import ExpenseCreate, ExpenseInput, Month
from ..services import category_for, expense_for, expense_view, month_bounds

router = APIRouter(prefix="/families/{family_id}/expenses", tags=["Expenses"])


@router.get("")
async def list_expenses(
    family_id: int,
    month: Month,
    db: DB,
    member: Member,
    search: str = Query("", max_length=160),
    category_id: int | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    start, end = month_bounds(month)
    query = select(Expense).where(
        Expense.family_id == family_id,
        Expense.expense_date >= start,
        Expense.expense_date < end,
    )
    if member.role != "Admin":
        query = query.where(Expense.user_id == member.user_id)
    if search:
        query = query.where(
            Expense.note.ilike(
                "%"
                + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                + "%"
            )
        )
    if category_id is not None:
        query = query.where(Expense.category_id == category_id)
    if status is not None:
        if status not in ("Saved", "Needs review"):
            raise HTTPException(422, "Unknown expense status.")
        query = query.where(Expense.status == status)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(Expense.expense_date.desc(), Expense.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return {
        "items": [await expense_view(db, row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def existing_request(
    db: DB, payload: ExpenseCreate, family_id: int, member: Member
):
    row = await db.scalar(
        select(Expense).where(
            Expense.client_request_id == str(payload.client_request_id)
        )
    )
    if row is None:
        return None
    same = (
        row.family_id == family_id
        and row.user_id == member.user_id
        and all(
            getattr(row, key) == getattr(payload, key)
            for key in ["category_id", "amount_kzt", "expense_date", "note"]
        )
    )
    # An inactive category can change Saved to Needs review at the database boundary.
    category = await category_for(db, family_id, payload.category_id) if same else None
    expected_status = (
        payload.status if category and category.is_active else "Needs review"
    )
    if not same or row.status != expected_status:
        raise HTTPException(
            409,
            "This request was already used. Refresh before saving a different expense.",
        )
    return await expense_view(db, row)


@router.post("", status_code=201)
async def create_expense(
    family_id: int, payload: ExpenseCreate, db: DB, member: Member
):
    existing = await existing_request(db, payload, family_id, member)
    if existing:
        return existing
    category = await category_for(db, family_id, payload.category_id)
    data = payload.model_dump(exclude={"client_request_id"})
    if not category.is_active:
        data["status"] = "Needs review"
    row = Expense(
        family_id=family_id,
        user_id=member.user_id,
        client_request_id=str(payload.client_request_id),
        **data,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Rollback expires ORM objects even with expire_on_commit=False.
        # Reload explicitly before replay checks access membership attributes.
        await db.refresh(member)
        existing = await existing_request(db, payload, family_id, member)
        if existing:
            return existing
        raise HTTPException(
            409, "The expense could not be saved. Refresh and try again."
        )
    await db.refresh(row)
    return await expense_view(db, row)


@router.put("/{expense_id}")
async def update_expense(
    family_id: int, expense_id: int, payload: ExpenseInput, db: DB, member: Member
):
    row = await expense_for(db, family_id, expense_id, member)
    category = await category_for(db, family_id, payload.category_id)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    if not category.is_active:
        row.status = "Needs review"
    await db.commit()
    await db.refresh(row)
    return await expense_view(db, row)


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(family_id: int, expense_id: int, db: DB, member: Member):
    row = await expense_for(db, family_id, expense_id, member)
    receipt = row.receipt_photo
    await db.delete(row)
    await db.commit()
    if receipt:
        await run_in_threadpool(
            (get_settings().upload_dir / Path(receipt).name).unlink, missing_ok=True
        )


def sanitize_receipt(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as picture:
            if (
                picture.format not in {"JPEG", "PNG", "WEBP"}
                or picture.width * picture.height > 20_000_000
            ):
                raise HTTPException(
                    422, "Choose a JPG, PNG, or WebP image under 20 megapixels."
                )
            picture.load()
            picture.thumbnail((2400, 2400))
            output = io.BytesIO()
            picture.convert("RGB").save(output, format="JPEG", quality=88)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, "This file is not a valid receipt image.")


@router.post("/{expense_id}/receipt")
async def upload_receipt(
    family_id: int, expense_id: int, file: UploadFile, db: DB, member: Member
):
    row = await expense_for(db, family_id, expense_id, member)
    content = await file.read(5 * 1024 * 1024 + 1)
    await file.close()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "Receipts must be 5 MB or smaller.")
    image = await run_in_threadpool(sanitize_receipt, content)
    directory = get_settings().upload_dir
    await run_in_threadpool(directory.mkdir, parents=True, exist_ok=True)
    name = f"{uuid4()}.jpg"
    destination = directory / name
    async with aiofiles.open(destination, "wb") as handle:
        await handle.write(image)
    old = row.receipt_photo
    row.receipt_photo = name
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await run_in_threadpool(destination.unlink, missing_ok=True)
        raise
    if old:
        await run_in_threadpool((directory / Path(old).name).unlink, missing_ok=True)
    return await expense_view(db, row)


@router.get("/{expense_id}/receipt")
async def receipt(family_id: int, expense_id: int, db: DB, member: Member):
    row = await expense_for(db, family_id, expense_id, member)
    if row.receipt_photo is None:
        raise HTTPException(404, "No receipt attached.")
    path = get_settings().upload_dir / Path(row.receipt_photo).name
    if not await run_in_threadpool(path.is_file):
        raise HTTPException(404, "Receipt file not found.")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
