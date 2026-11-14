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


async def test_savings_goals_permissions_and_concurrent_contributions(
    client, household
):
    family, _ = household
    base = f"/api/families/{family}/goals"
    future = (today() + timedelta(days=200)).isoformat()
    for bad in [
        {"name": "Holiday", "target_kzt": 0},
        {"name": " ", "target_kzt": 1000},
        {"name": "Holiday", "target_kzt": 1000, "saved_kzt": 5},
        {
            "name": "Holiday",
            "target_kzt": 1000,
            "deadline": (today() - timedelta(days=1)).isoformat(),
        },
    ]:
        assert (await client.post(base, json=bad)).status_code == 422
    response = await client.post(
        base, json={"name": "Summer holiday", "target_kzt": 300000, "deadline": future}
    )
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["saved_kzt"] == 0 and goal["deadline"] == future

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as other:
        response = await other.post(
            "/api/auth/register",
            json={
                "email": "member@example.com",
                "password": "TestPassword123!",
                "full_name": "Other Member",
                "family_name": "Other family",
            },
        )
        other_family = response.json()["families"][0]["id"]
        # Another household can neither see nor change the goal.
        assert (await other.get(base)).status_code == 404
        assert (
            await other.post(
                f"/api/families/{other_family}/goals/{goal['id']}/contributions",
                json={"amount_kzt": 1000},
            )
        ).status_code == 404
        assert (
            await client.post(
                f"/api/families/{family}/members", json={"email": "member@example.com"}
            )
        ).status_code == 201
        # A member sees goals and adds money, but only admins manage them.
        assert [row["name"] for row in (await other.get(base)).json()] == [
            "Summer holiday"
        ]
        assert (
            await other.post(base, json={"name": "Car", "target_kzt": 5000})
        ).status_code == 403
        assert (
            await other.put(
                f"{base}/{goal['id']}",
                json={"name": "Car", "target_kzt": 5000, "saved_kzt": 0},
            )
        ).status_code == 403
        assert (await other.delete(f"{base}/{goal['id']}")).status_code == 403
        # Simultaneous contributions from two people must all be counted.
        results = await asyncio.gather(
            *[
                person.post(
                    f"{base}/{goal['id']}/contributions", json={"amount_kzt": 10000}
                )
                for person in [client, other] * 4
            ]
        )
        assert all(result.status_code == 200 for result in results)
    assert (await client.get(base)).json()[0]["saved_kzt"] == 80000
    for bad_amount in [0, -5, 10_000_001, "100"]:
        assert (
            await client.post(
                f"{base}/{goal['id']}/contributions", json={"amount_kzt": bad_amount}
            )
        ).status_code == 422
    assert (
        await client.post(f"{base}/999999/contributions", json={"amount_kzt": 1})
    ).status_code == 404

    # An admin can correct the goal; the stored amount cannot pass the cap.
    response = await client.put(
        f"{base}/{goal['id']}",
        json={
            "name": "Holiday",
            "target_kzt": 250000,
            "saved_kzt": 999_995_000,
            "deadline": None,
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "id": goal["id"],
        "name": "Holiday",
        "target_kzt": 250000,
        "saved_kzt": 999_995_000,
        "deadline": None,
    }
    response = await client.post(
        f"{base}/{goal['id']}/contributions", json={"amount_kzt": 10000}
    )
    assert response.status_code == 422
    assert (await client.get(base)).json()[0]["saved_kzt"] == 999_995_000
    async with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            await connection.execute(
                text("UPDATE savings_goal SET saved_kzt = -1 WHERE id = :id"),
                {"id": goal["id"]},
            )
    assert (await client.delete(f"{base}/{goal['id']}")).status_code == 204
    assert (await client.get(base)).json() == []
    assert (await client.delete(f"{base}/{goal['id']}")).status_code == 404


async def test_exchange_rates_cache_change_and_outage(client, household, monkeypatch):
    from decimal import Decimal
    import httpx
    from app import rates

    sample = """<?xml version="1.0" encoding="utf-8"?><rates><date>13.11.2026</date>
        <item><fullname>ДОЛЛАР США</fullname><title>USD</title>
            <description>443.62</description><quant>1</quant></item>
        <item><title>EUR</title><description>492.24</description><quant>1</quant></item>
        <item><title>RUB</title><description>53.6</description><quant>10</quant></item>
        <item><title>CNY</title><description>broken</description><quant>1</quant></item>
        <item><title>AMD</title><description>12.32</description><quant>10</quant></item>
    </rates>"""
    assert rates.parse_rates(sample) == {
        "USD": Decimal("443.62"),
        "EUR": Decimal("492.24"),
        "RUB": Decimal("5.36"),
    }

    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE exchange_rate"))
    rates.retry_at.clear()
    calls = []
    start = today() - timedelta(days=7)

    async def bank_down(http, day):
        calls.append(day)
        raise httpx.ConnectError("offline")

    async def bank_up(http, day):
        calls.append(day)
        if day == today():
            return {}  # today's rates are not published yet
        step = (day - start).days
        return {
            "USD": Decimal(500) + step * 5,
            "EUR": Decimal(600) - step * 3,
            "RUB": Decimal("6.5"),
            "CNY": Decimal(70),
        }

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as stranger:
        assert (await stranger.get("/api/rates")).status_code == 401

    # Nothing stored and the bank is unreachable: a clear error, then a pause.
    monkeypatch.setattr(rates, "fetch_day", bank_down)
    assert (await client.get("/api/rates")).status_code == 503
    asked = len(calls)
    assert asked >= 1
    assert (await client.get("/api/rates")).status_code == 503
    assert len(calls) == asked

    rates.retry_at.clear()
    calls.clear()
    monkeypatch.setattr(rates, "fetch_day", bank_up)
    response = await client.get("/api/rates")
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(calls) == 8
    # Today is missing, so the newest stored day is yesterday.
    assert body["as_of"] == (today() - timedelta(days=1)).isoformat()
    assert body["compared_with"] == start.isoformat()
    assert [row["code"] for row in body["rates"]] == ["USD", "EUR", "RUB", "CNY"]
    usd, eur, rub, _ = body["rates"]
    assert (usd["rate"], usd["week_ago"], usd["change_percent"]) == (530, 500, 6.0)
    assert (eur["rate"], eur["week_ago"], eur["change_percent"]) == (582, 600, -3.0)
    assert rub["change_percent"] == 0
    assert len(usd["history"]) == 7
    assert usd["history"][0] == {"date": start.isoformat(), "rate": 500}

    # Stored days are never requested again; the empty day waits for a retry.
    calls.clear()
    assert (await client.get("/api/rates")).json() == body
    assert calls == []
    rates.retry_at.clear()
    monkeypatch.setattr(rates, "fetch_day", bank_down)
    assert (await client.get("/api/rates")).json() == body
    assert calls == [today()]

    async with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            await connection.execute(
                text("UPDATE exchange_rate SET rate_kzt = 0 WHERE currency = 'USD'")
            )
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE exchange_rate"))
    rates.retry_at.clear()
