"""Purchase requests, notifications, limited sessions, password resets, rate limits."""

from contextlib import aclosing
from datetime import datetime, timedelta, timezone
import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from app.config import get_settings
from app.database import engine
from app.main import app
from app.schemas import today

pytestmark = pytest.mark.anyio
PASSWORD = "TestPassword123!"


def new_client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def join(admin, family, email, name="Member Person"):
    """Registers a second person and adds them to the family as a Member."""
    other = new_client()
    response = await other.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "full_name": name,
            "family_name": f"{name} home",
        },
    )
    assert response.status_code == 201, response.text
    user_id = response.json()["user"]["id"]
    assert (
        await admin.post(f"/api/families/{family}/members", json={"email": email})
    ).status_code == 201
    return other, user_id


async def set_limit(client, family, category, amount):
    response = await client.put(
        f"/api/families/{family}/limits",
        json={
            "category_id": category,
            "budget_month": f"{today():%Y-%m}",
            "limit_kzt": amount,
        },
    )
    assert response.status_code == 200, response.text


async def kinds(client):
    return [
        row["kind"] for row in (await client.get("/api/notifications")).json()["items"]
    ]


async def test_purchase_requests_conditions_and_decisions(client, household):
    family, categories = household
    food, transport = categories[0]["id"], categories[1]["id"]
    base = f"/api/families/{family}"
    member, member_id = await join(client, family, "member@example.com")
    async with aclosing(member):
        await set_limit(client, family, food, 50000)

        # No auto-approve rule yet: the request waits for an admin.
        pending = await member.post(
            f"{base}/requests",
            json={"category_id": food, "amount_kzt": 12000, "note": "Sneakers"},
        )
        assert pending.status_code == 201, pending.text
        pending = pending.json()
        assert pending["status"] == "pending" and pending["left_kzt"] == 50000
        assert await kinds(client) == ["request_new"]

        # Members cannot decide or change the rule.
        assert (
            await member.post(f"{base}/requests/{pending['id']}/approve")
        ).status_code == 403
        assert (
            await member.put(f"{base}/request-rules", json={"auto_approve_kzt": 5000})
        ).status_code == 403

        # Rule: up to 5,000 is approved at once, if the category stays within its limit.
        rule = await client.put(
            f"{base}/request-rules", json={"auto_approve_kzt": 5000}
        )
        assert rule.json() == {"auto_approve_kzt": 5000}
        assert (await client.get("/api/auth/me")).json()["families"][0][
            "auto_approve_kzt"
        ] == 5000
        auto = (
            await member.post(
                f"{base}/requests",
                json={"category_id": transport, "amount_kzt": 3000, "note": "Bus pass"},
            )
        ).json()
        assert auto["status"] == "approved" and auto["auto"] and auto["expense_id"]
        assert "request_auto" in await kinds(client)

        # Within the amount but over the category limit: not automatic.
        await set_limit(client, family, transport, 4000)
        over = (
            await member.post(
                f"{base}/requests",
                json={"category_id": transport, "amount_kzt": 2000, "note": "Taxi"},
            )
        ).json()
        assert (
            over["status"] == "pending"
            and over["over_limit"]
            and over["left_kzt"] == 1000
        )

        # Approving creates the member's expense once; a second decision is refused.
        approved = await client.post(f"{base}/requests/{pending['id']}/approve")
        assert approved.status_code == 200
        approved = approved.json()
        assert (
            approved["status"] == "approved"
            and approved["decided_by_name"] == "Test Admin"
        )
        assert (
            await client.post(f"{base}/requests/{pending['id']}/reject", json={})
        ).status_code == 409
        expenses = (await member.get(f"{base}/expenses?month={today():%Y-%m}")).json()[
            "items"
        ]
        assert sorted((e["note"], e["amount_kzt"], e["user_id"]) for e in expenses) == [
            ("Bus pass", 3000, member_id),
            ("Sneakers", 12000, member_id),
        ]

        rejected = await client.post(
            f"{base}/requests/{over['id']}/reject", json={"reason": "Walk this week"}
        )
        assert rejected.json()["status"] == "rejected"
        assert rejected.json()["reason"] == "Walk this week"
        assert await kinds(member) == ["request_rejected", "request_approved"]

        # A member sees only their own requests and can cancel only pending ones.
        mine = (
            await member.post(
                f"{base}/requests",
                json={"category_id": food, "amount_kzt": 9000, "note": "Groceries"},
            )
        ).json()
        assert (await client.delete(f"{base}/requests/{mine['id']}")).status_code == 404
        assert (await member.delete(f"{base}/requests/{mine['id']}")).status_code == 204
        assert (await member.delete(f"{base}/requests/{mine['id']}")).status_code == 409
        listed = (await member.get(f"{base}/requests")).json()
        assert {row["user_id"] for row in listed} == {member_id}
        assert (await client.get(f"{base}/requests?status=pending")).json() == []
        assert (await client.get(f"{base}/requests?status=nope")).status_code == 422

        for bad in [
            {"category_id": food, "amount_kzt": 0, "note": "x"},
            {"category_id": food, "amount_kzt": 100, "note": " "},
            {"category_id": 999999, "amount_kzt": 100, "note": "x"},
        ]:
            assert (await member.post(f"{base}/requests", json=bad)).status_code in (
                404,
                422,
            )

    # Another household sees nothing.
    async with new_client() as stranger:
        await stranger.post(
            "/api/auth/register",
            json={
                "email": "x@example.com",
                "password": PASSWORD,
                "full_name": "X",
                "family_name": "X",
            },
        )
        assert (await stranger.get(f"{base}/requests")).status_code == 404


async def test_limit_and_goal_notifications_are_sent_once(client, household):
    family, categories = household
    food = categories[0]["id"]
    base = f"/api/families/{family}"
    await set_limit(client, family, food, 10000)

    async def spend(amount):
        response = await client.post(
            f"{base}/expenses",
            json={
                "category_id": food,
                "amount_kzt": amount,
                "expense_date": today().isoformat(),
                "client_request_id": str(__import__("uuid").uuid4()),
            },
        )
        assert response.status_code == 201

    await spend(5000)
    assert await kinds(client) == []
    await spend(4000)  # 90%
    await spend(100)  # still close: no second notice
    await spend(2000)  # over
    await spend(500)
    assert await kinds(client) == ["limit_over", "limit_warning"]
    notice = (await client.get("/api/notifications")).json()
    assert notice["unread"] == 2
    assert notice["items"][0]["payload"] == {
        "category": "Food",
        "spent": 11100,
        "limit": 10000,
        "month": f"{today():%Y-%m}",
    }

    goal = (
        await client.post(f"{base}/goals", json={"name": "Bike", "target_kzt": 1000})
    ).json()
    for _ in range(2):
        await client.post(
            f"{base}/goals/{goal['id']}/contributions", json={"amount_kzt": 1000}
        )
    assert (await kinds(client)).count("goal_reached") == 1

    first = notice["items"][0]["id"]
    assert (
        await client.post("/api/notifications/read", json={"ids": [first]})
    ).status_code == 204
    assert (await client.get("/api/notifications")).json()["unread"] == 2
    await client.post("/api/notifications/read", json={})
    assert (await client.get("/api/notifications")).json()["unread"] == 0


async def test_sessions_expire_renew_and_end_on_logout(client, household, monkeypatch):
    stolen = client.cookies.get("family_session")
    claims = jwt.decode(stolen, options={"verify_signature": False})
    assert {"sub", "sid", "exp"} <= set(claims)
    lifetime = claims["exp"] - datetime.now(timezone.utc).timestamp()
    assert 25 * 60 < lifetime <= 30 * 60

    # A token older than half the idle time is renewed on use.
    old = jwt.encode(
        {**claims, "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        get_settings().jwt_secret,
        algorithm="HS256",
    )
    async with new_client() as browser:
        browser.cookies.set("family_session", old)
        response = await browser.get("/api/auth/me")
        assert response.status_code == 200
        assert "family_session=" in response.headers.get("set-cookie", "")
        # An expired token is refused.
        browser.cookies.clear()
        browser.cookies.set(
            "family_session",
            jwt.encode(
                {**claims, "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                get_settings().jwt_secret,
                algorithm="HS256",
            ),
        )
        assert (await browser.get("/api/auth/me")).status_code == 401

    # The session's hard end applies even to a fresh token.
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE user_session SET expires_at = now() - interval '1 second'")
        )
    assert (await client.get("/api/auth/me")).status_code == 401
    login = await client.post(
        "/api/auth/login", json={"email": "admin@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200
    stolen = client.cookies.get("family_session")

    # Signing out ends the session on the server: a copied cookie stops working.
    assert (await client.post("/api/auth/logout")).status_code == 204
    async with new_client() as thief:
        thief.cookies.set("family_session", stolen)
        assert (await thief.get("/api/auth/me")).status_code == 401

    # Sign out everywhere ends every session.
    phone, laptop = new_client(), new_client()
    async with phone, laptop:
        for device in (phone, laptop):
            await device.post(
                "/api/auth/login",
                json={"email": "admin@example.com", "password": PASSWORD},
            )
        assert (await phone.post("/api/auth/logout-all")).status_code == 204
        assert (await laptop.get("/api/auth/me")).status_code == 401
        # A forged token for a real session id is refused without the secret.
        forged = jwt.encode(
            claims, "not-the-secret-not-the-secret-123456", algorithm="HS256"
        )
        laptop.cookies.set("family_session", forged)
        assert (await laptop.get("/api/auth/me")).status_code == 401


async def test_change_and_reset_password(client, household):
    family, _ = household
    base = f"/api/families/{family}"
    member, member_id = await join(client, family, "member@example.com")
    async with aclosing(member), new_client() as other_device:
        await other_device.post(
            "/api/auth/login",
            json={"email": "member@example.com", "password": PASSWORD},
        )
        wrong = await member.post(
            "/api/auth/password",
            json={"current_password": "nope", "new_password": "BrandNewPass1!"},
        )
        assert wrong.status_code == 422
        assert (
            await member.post(
                "/api/auth/password",
                json={"current_password": PASSWORD, "new_password": "short"},
            )
        ).status_code == 422
        changed = await member.post(
            "/api/auth/password",
            json={"current_password": PASSWORD, "new_password": "BrandNewPass1!"},
        )
        assert changed.status_code == 204
        # This device stays signed in; the other one must sign in again.
        assert (await member.get("/api/auth/me")).status_code == 200
        assert (await other_device.get("/api/auth/me")).status_code == 401

        # Only admins issue codes, only for members, never for admins.
        assert (
            await member.post(f"{base}/members/{member_id}/reset-code")
        ).status_code == 403
        admin_id = (await client.get("/api/auth/me")).json()["user"]["id"]
        assert (
            await client.post(f"{base}/members/{admin_id}/reset-code")
        ).status_code == 403
        assert (
            await client.post(f"{base}/members/999999/reset-code")
        ).status_code == 404

        first = (await client.post(f"{base}/members/{member_id}/reset-code")).json()[
            "code"
        ]
        code = (await client.post(f"{base}/members/{member_id}/reset-code")).json()[
            "code"
        ]
        assert len(code) == 9 and code[4] == "-"

        async def reset(value, password="ResetPass123!", email="member@example.com"):
            return await new_client().post(
                "/api/auth/reset",
                json={"email": email, "code": value, "new_password": password},
            )

        assert (await reset(first)).status_code == 400  # replaced by the newer code
        assert (await reset(code, email="admin@example.com")).status_code == 400
        assert (await reset("WRONG-CODE")).status_code == 400
        assert (await reset(code.lower().replace("-", ""))).status_code == 204
        assert (await reset(code)).status_code == 400  # one use only
        # Resetting ends every session of that person.
        assert (await member.get("/api/auth/me")).status_code == 401
        login = await new_client().post(
            "/api/auth/login",
            json={"email": "member@example.com", "password": "ResetPass123!"},
        )
        assert login.status_code == 200

    # A member who also shares another household with other people cannot be
    # reset here: the code would open that household too.
    async with new_client() as owner:
        response = await owner.post(
            "/api/auth/register",
            json={
                "email": "owner@example.com",
                "password": PASSWORD,
                "full_name": "Owner",
                "family_name": "Own",
            },
        )
        owner_id = response.json()["user"]["id"]
        own_family = response.json()["families"][0]["id"]
        await client.post(f"{base}/members", json={"email": "owner@example.com"})
        assert (
            await client.post(f"{base}/members/{owner_id}/reset-code")
        ).status_code == 201
        async with new_client() as third:
            await third.post(
                "/api/auth/register",
                json={
                    "email": "third@example.com",
                    "password": PASSWORD,
                    "full_name": "Third",
                    "family_name": "Third",
                },
            )
        await owner.post(
            f"/api/families/{own_family}/members", json={"email": "third@example.com"}
        )
        assert (
            await client.post(f"{base}/members/{owner_id}/reset-code")
        ).status_code == 403

    # Expired codes do not work.
    code = (await client.post(f"{base}/members/{member_id}/reset-code")).json()["code"]
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE password_reset SET expires_at = now() - interval '1 second'")
        )
    async with new_client() as browser:
        response = await browser.post(
            "/api/auth/reset",
            json={
                "email": "member@example.com",
                "code": code,
                "new_password": "Another123!",
            },
        )
        assert response.status_code == 400


async def test_rate_limits(client, household, monkeypatch):
    family, _ = household
    settings = get_settings()
    monkeypatch.setattr(settings, "rate_limit_requests", 6)
    monkeypatch.setattr(settings, "rate_limit_writes", 3)
    monkeypatch.setattr(settings, "rate_limit_auth", 2)
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE rate_limit"))

    statuses = [(await client.get("/api/auth/me")).status_code for _ in range(7)]
    assert statuses == [200] * 6 + [429]
    limited = await client.get("/api/auth/me")
    assert limited.json()["detail"].startswith("Too many requests")
    assert 1 <= int(limited.headers["retry-after"]) <= 60
    assert limited.headers["x-ratelimit-remaining"] == "0"
    # Health checks are never limited.
    assert (await client.get("/api/health")).status_code == 200

    # Limits are per person: another account is not affected.
    async with new_client() as other:
        assert (await other.get("/api/families")).status_code == 401
        assert (await other.get("/api/families")).headers["x-ratelimit-limit"] == "6"

    # Sign-in attempts are limited per address, separately and lower.
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE rate_limit"))
    async with new_client() as guesser:
        codes = [
            (
                await guesser.post(
                    "/api/auth/login",
                    json={"email": "admin@example.com", "password": "guess"},
                )
            ).status_code
            for _ in range(3)
        ]
        assert codes == [401, 401, 429]

    # Counters are shared through the database, not kept in one process.
    async with engine.begin() as connection:
        rows = (
            await connection.execute(text("SELECT count(*) FROM rate_limit"))
        ).scalar()
    assert rows >= 1


def test_client_ip_trusts_proxy_headers_only_when_configured(monkeypatch):
    from starlette.requests import Request
    from app.security import client_ip

    request = Request(
        {
            "type": "http",
            "headers": [(b"x-real-ip", b"203.0.113.7")],
            "client": ("10.0.0.2", 5000),
        }
    )
    settings = get_settings()
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_ip(request) == "10.0.0.2"
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    assert client_ip(request) == "203.0.113.7"
