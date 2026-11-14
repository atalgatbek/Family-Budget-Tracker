"""Explicit, idempotent demo seed. Never run automatically in production."""

import asyncio
from datetime import date, timedelta
from uuid import uuid4
from PIL import Image, ImageDraw
from sqlalchemy import func, select, text
from starlette.concurrency import run_in_threadpool
from .auth import password_hash
from .config import get_settings
from .database import SessionLocal, engine
from .models import (
    Category,
    Expense,
    Family,
    FamilyMember,
    Income,
    MonthlyLimit,
    SavingsGoal,
    User,
)
from .schemas import today

DEMO_PASSWORD = "FamilyDemo2026!"


def sample_receipt(name: str, amount: int, day: int):
    directory = get_settings().upload_dir
    directory.mkdir(parents=True, exist_ok=True)
    picture = Image.new("RGB", (650, 780), "#fbfaf5")
    draw = ImageDraw.Draw(picture)
    lines = [
        "FAMILY BUDGET TRACKER",
        "",
        "SAMPLE RECEIPT - TEST DATA ONLY",
        "",
        f"Date: 2026-10-{day:02d}",
        "",
        f"Total: {amount:,} KZT",
        "",
        "This is a generated demo image.",
        "No real purchase or card information.",
    ]
    for index, line in enumerate(lines):
        draw.text(
            (45, 65 + index * 45),
            line,
            fill="#42543c",
            font_size=22 if index == 0 else 18,
        )
    picture.save(directory / name, "JPEG", quality=90)


async def seed():
    async with SessionLocal() as db:
        if await db.scalar(select(User).where(User.email == "aigerim@example.com")):
            print("Demo household already exists; no data changed.")
            return
        family = Family(name="The Sadykov family")
        db.add(family)
        hashed = await run_in_threadpool(password_hash.hash, DEMO_PASSWORD)
        users = [
            User(full_name=name, email=email, password_hash=hashed)
            for name, email in [
                ("Aigerim Sadykova", "aigerim@example.com"),
                ("Daulet Sadykov", "daulet@example.com"),
                ("Aruzhan Sadykova", "aruzhan@example.com"),
            ]
        ]
        db.add_all(users)
        await db.flush()
        db.add_all(
            FamilyMember(
                family_id=family.id,
                user_id=user.id,
                role="Admin" if index == 0 else "Member",
            )
            for index, user in enumerate(users)
        )
        categories = [
            Category(family_id=family.id, name=name, is_active=name != "Kids club")
            for name in [
                "Food",
                "Transport",
                "Utilities",
                "Children",
                "Entertainment",
                "Kids club",
            ]
        ]
        db.add_all(categories)
        await db.flush()
        for category, limit in zip(categories, [60000, 20000, 35000, 30000, 15000]):
            db.add(
                MonthlyLimit(
                    category_id=category.id, budget_month="2026-10", limit_kzt=limit
                )
            )
        records = [
            (0, 0, 8450, 12, "Weekly groceries · Magnum", True),
            (1, 0, 15200, 5, "Groceries for the week", False),
            (0, 0, 11800, 19, "Fruit, vegetables & pantry", True),
            (1, 0, 17450, 26, "The big grocery shop", False),
            (2, 1, 2500, 7, "Bus pass top-up", False),
            (1, 1, 6000, 20, "Fuel for the week", False),
            (0, 2, 12000, 13, "Electricity & water", True),
            (0, 2, 9500, 25, "Home internet", False),
            (0, 3, 18000, 3, "After-school activities", False),
            (2, 4, 3000, 17, "Saturday at the cinema", False),
        ]
        start_id = max(101, (await db.scalar(select(func.max(Expense.id))) or 0) + 1)
        for offset, (person, category, amount, day, note, has_receipt) in enumerate(
            records
        ):
            receipt = f"{uuid4()}.jpg" if has_receipt else None
            if receipt:
                await run_in_threadpool(sample_receipt, receipt, amount, day)
            db.add(
                Expense(
                    id=start_id + offset,
                    family_id=family.id,
                    user_id=users[person].id,
                    category_id=categories[category].id,
                    amount_kzt=amount,
                    expense_date=date(2026, 10, day),
                    status="Saved",
                    note=note,
                    receipt_photo=receipt,
                    client_request_id=str(uuid4()),
                )
            )
        # Income was mentioned in the report's introduction, but no income data was supplied.
        # These two synthetic examples are separate from the exact expense/limit fixture.
        db.add_all(
            [
                Income(
                    family_id=family.id,
                    user_id=users[0].id,
                    amount_kzt=280000,
                    income_date=date(2026, 10, 1),
                    source="October salary · demo",
                    client_request_id=str(uuid4()),
                ),
                Income(
                    family_id=family.id,
                    user_id=users[1].id,
                    amount_kzt=220000,
                    income_date=date(2026, 10, 5),
                    source="October salary · demo",
                    client_request_id=str(uuid4()),
                ),
            ]
        )
        # Synthetic savings goals: one with a deadline, one open-ended.
        db.add_all(
            [
                SavingsGoal(
                    family_id=family.id,
                    name="Summer holiday",
                    target_kzt=300000,
                    saved_kzt=120000,
                    deadline=today() + timedelta(days=210),
                ),
                SavingsGoal(
                    family_id=family.id,
                    name="Emergency fund",
                    target_kzt=500000,
                    saved_kzt=85000,
                ),
            ]
        )
        await db.flush()
        await db.execute(
            text(
                "SELECT setval(pg_get_serial_sequence('expense', 'id'), (SELECT MAX(id) FROM expense))"
            )
        )
        await db.commit()
        print(
            "Demo household created: aigerim@example.com (Admin), daulet@example.com and aruzhan@example.com (Members)."
        )
        print("Demo password for all three accounts: FamilyDemo2026!")


async def main():
    try:
        await seed()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
