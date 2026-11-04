import asyncio
import io
from datetime import timedelta
from uuid import uuid4
import pytest
from PIL import Image
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from app.database import engine
from app.main import app
from app.schemas import today

pytestmark = pytest.mark.anyio


async def test_transfer_rolls_back_when_destination_write_fails(client, household):
    family, categories = household
    base = f"/api/families/{family}"
    for category in categories[:2]:
        response = await client.put(
            f"{base}/limits",
            json={
                "category_id": category["id"],
                "budget_month": "2026-10",
                "limit_kzt": 20000,
            },
        )
        assert response.status_code == 200
    destination = categories[1]["id"]
    async with engine.begin() as connection:
        await connection.execute(
            text(f"""
            CREATE FUNCTION test_reject_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.category_id = {destination} THEN
                    RAISE EXCEPTION 'Simulated destination failure';
                END IF;
                RETURN NEW;
            END; $$;
            CREATE TRIGGER test_transfer_failure BEFORE UPDATE ON monthly_limit
            FOR EACH ROW EXECUTE FUNCTION test_reject_transfer();
        """)
        )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
            cookies=client.cookies,
        ) as failure_client:
            response = await failure_client.post(
                f"{base}/limits/transfer",
                json={
                    "source_category_id": categories[0]["id"],
                    "destination_category_id": destination,
                    "budget_month": "2026-10",
                    "amount_kzt": 5000,
                },
            )
            assert response.status_code == 500
        result = (await client.get(f"{base}/summary?month=2026-10")).json()
        assert [row["limit_kzt"] for row in result["categories"][:2]] == [20000, 20000]
        history = (await client.get(f"{base}/limit-history?month=2026-10")).json()
        assert len(history) == 2
    finally:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "DROP TRIGGER test_transfer_failure ON monthly_limit; DROP FUNCTION test_reject_transfer();"
                )
            )


def expense(category, **extra):
    return {
        "category_id": category,
        "amount_kzt": 8450,
        "expense_date": today().isoformat(),
        "client_request_id": str(uuid4()),
        **extra,
    }


async def test_auth_and_validation(client, household):
    family, categories = household
    assert "HttpOnly" in client.cookies.get("family_session", "") or client.cookies.get(
        "family_session"
    )
    me = (await client.get("/api/auth/me")).json()
    assert "password_hash" not in str(me)
    base = f"/api/families/{family}/expenses"
    for amount in [0, -1, 10000001, 1.5, "4500"]:
        assert (
            await client.post(
                base, json=expense(categories[0]["id"], amount_kzt=amount)
            )
        ).status_code == 422
    assert (
        await client.post(
            base,
            json=expense(
                categories[0]["id"],
                expense_date=(today() + timedelta(days=1)).isoformat(),
            ),
        )
    ).status_code == 422
    assert (
        await client.get(f"/api/families/{family}/summary?month=2026-13")
    ).status_code == 422
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_duplicate_save_race_and_payload_conflict(client, household):
    family, categories = household
    base = f"/api/families/{family}/expenses"
    payload = expense(categories[0]["id"])
    responses = await asyncio.gather(
        *[client.post(base, json=payload) for _ in range(3)]
    )
    assert all(response.status_code == 201 for response in responses), [
        r.text for r in responses
    ]
    assert len({r.json()["id"] for r in responses}) == 1
    assert (
        await client.post(base, json={**payload, "amount_kzt": 500})
    ).status_code == 409
    result = (await client.get(f"{base}?month={today():%Y-%m}")).json()
    assert result["total"] == 1


async def test_transfer_atomicity_and_audit(client, household):
    family, categories = household
    base = f"/api/families/{family}"
    for category, amount in [
        (categories[0]["id"], 60000),
        (categories[4]["id"], 15000),
    ]:
        assert (
            await client.put(
                f"{base}/limits",
                json={
                    "category_id": category,
                    "budget_month": "2026-10",
                    "limit_kzt": amount,
                },
            )
        ).status_code == 200
    payload = {
        "source_category_id": categories[4]["id"],
        "destination_category_id": categories[0]["id"],
        "budget_month": "2026-10",
        "amount_kzt": 5000,
    }
    result = await client.post(f"{base}/limits/transfer", json=payload)
    assert result.status_code == 200, result.text
    assert result.json()["planned_kzt"] == 75000
    assert result.json()["categories"][0]["limit_kzt"] == 65000
    assert result.json()["categories"][4]["limit_kzt"] == 10000
    assert (
        await client.post(
            f"{base}/limits/transfer", json={**payload, "amount_kzt": 10000}
        )
    ).status_code == 422
    assert (await client.get(f"{base}/summary?month=2026-10")).json()["categories"][4][
        "limit_kzt"
    ] == 10000
    history = (await client.get(f"{base}/limit-history?month=2026-10")).json()
    assert len(history) == 4
    assert (
        sum(
            row["new_kzt"] - row["old_kzt"]
            for row in history
            if row["reason"] == "Budget transfer"
        )
        == 0
    )


async def test_archived_category_review_and_zero_spend(client, household):
    family, categories = household
    base = f"/api/families/{family}"
    cat = categories[0]
    assert (
        await client.put(
            f"{base}/categories/{cat['id']}",
            json={"name": cat["name"], "is_active": False},
        )
    ).status_code == 200
    saved = await client.post(f"{base}/expenses", json=expense(cat["id"]))
    assert saved.json()["status"] == "Needs review"
    summary = (await client.get(f"{base}/summary?month={today():%Y-%m}")).json()
    assert summary["spent_kzt"] == 0 and summary["review_count"] == 1
    assert len(summary["categories"]) == 4
    assert (
        await client.post(f"{base}/categories", json={"name": "food"})
    ).status_code == 409


async def test_family_isolation_and_member_permissions(client, household):
    family, categories = household
    original = (
        await client.post(
            f"/api/families/{family}/expenses", json=expense(categories[0]["id"])
        )
    ).json()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as outsider:
        response = await outsider.post(
            "/api/auth/register",
            json={
                "email": "member@example.com",
                "password": "TestPassword123!",
                "full_name": "Other Member",
                "family_name": "Other family",
            },
        )
        assert response.status_code == 201
        other_family = response.json()["families"][0]["id"]
        assert (
            await outsider.get(f"/api/families/{family}/summary?month=2026-10")
        ).status_code == 404
        assert (
            await outsider.post(
                f"/api/families/{other_family}/expenses",
                json=expense(categories[0]["id"]),
            )
        ).status_code == 404
        assert (
            await client.post(
                f"/api/families/{family}/members", json={"email": "member@example.com"}
            )
        ).status_code == 201
        assert (
            await outsider.get(f"/api/families/{family}/summary?month={today():%Y-%m}")
        ).json()["spent_kzt"] == 8450
        assert (
            await outsider.get(f"/api/families/{family}/expenses?month={today():%Y-%m}")
        ).json()["total"] == 0
        assert (
            await outsider.delete(f"/api/families/{family}/expenses/{original['id']}")
        ).status_code == 404
        assert (
            await outsider.get(
                f"/api/families/{family}/expenses/{original['id']}/receipt"
            )
        ).status_code == 404
        assert (
            await outsider.put(
                f"/api/families/{family}/limits",
                json={
                    "category_id": categories[0]["id"],
                    "budget_month": "2026-10",
                    "limit_kzt": 30000,
                },
            )
        ).status_code == 403
        assert (
            await outsider.get(f"/api/families/{family}/limit-history?month=2026-10")
        ).status_code == 403
        members = (await outsider.get(f"/api/families/{family}/members")).json()
        assert all(
            "email" not in row
            for row in members
            if row["id"] != response.json()["user"]["id"]
        )


async def test_receipt_validation_and_private_access(client, household):
    family, categories = household
    saved = (
        await client.post(
            f"/api/families/{family}/expenses", json=expense(categories[0]["id"])
        )
    ).json()
    path = f"/api/families/{family}/expenses/{saved['id']}/receipt"
    assert (
        await client.post(
            path, files={"file": ("fake.jpg", b"not an image", "image/jpeg")}
        )
    ).status_code == 422
    image = io.BytesIO()
    Image.new("RGB", (20, 20), "white").save(image, "PNG")
    assert (
        await client.post(
            path, files={"file": ("receipt.png", image.getvalue(), "image/png")}
        )
    ).status_code == 200
    result = await client.get(path)
    assert result.status_code == 200 and result.headers["content-type"] == "image/jpeg"
    assert "no-store" in result.headers["cache-control"]
    assert (
        await client.delete(f"/api/families/{family}/expenses/{saved['id']}")
    ).status_code == 204
    assert (await client.get(path)).status_code == 404


async def test_postgres_guards_bypass_api(client, household):
    family, categories = household
    user = (await client.get("/api/auth/me")).json()["user"]["id"]
    sql = text(
        "INSERT INTO expense (family_id,user_id,category_id,amount_kzt,expense_date,client_request_id) VALUES (:family,:user,:category,:amount,:day,:request)"
    )
    for amount, day, uid in [
        (0, today(), user),
        (100, today() + timedelta(days=1), user),
        (100, today(), 99999),
    ]:
        with pytest.raises(IntegrityError):
            async with engine.begin() as connection:
                await connection.execute(
                    sql,
                    {
                        "family": family,
                        "user": uid,
                        "category": categories[0]["id"],
                        "amount": amount,
                        "day": day,
                        "request": str(uuid4()),
                    },
                )
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE category SET is_active=false WHERE id=:id"),
            {"id": categories[0]["id"]},
        )
        await connection.execute(
            sql,
            {
                "family": family,
                "user": user,
                "category": categories[0]["id"],
                "amount": 100,
                "day": today(),
                "request": str(uuid4()),
            },
        )
        assert (
            await connection.execute(text("SELECT status FROM expense"))
        ).scalar_one() == "Needs review"


async def test_csrf_origin_and_income_idempotency(client, household):
    family, _ = household
    assert (
        await client.post(
            "/api/auth/logout", headers={"Origin": "https://untrusted.example"}
        )
    ).status_code == 403
    payload = {
        "source": "Salary",
        "amount_kzt": 200000,
        "income_date": today().isoformat(),
        "client_request_id": str(uuid4()),
    }
    responses = await asyncio.gather(
        *[client.post(f"/api/families/{family}/income", json=payload) for _ in range(2)]
    )
    assert all(r.status_code == 201 for r in responses)
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert (
        await client.get(f"/api/families/{family}/summary?month={today():%Y-%m}")
    ).json()["income_kzt"] == 200000
