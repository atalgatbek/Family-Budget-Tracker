"""Load test for the Family Budget Tracker API.

Simulates household members using the app at the same time and reports
throughput, response times and errors for each concurrency step.

Run against a LOCAL copy of the server, never against the public site:

    .venv/bin/python loadtest/load_test.py --base http://127.0.0.1:8000

Sign-in is rate limited (20 attempts a minute per address), so virtual users
share sessions of the three demo accounts instead of signing in every time.
"""

import argparse
import asyncio
import statistics
import time
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

ACCOUNTS = ["aigerim@example.com", "daulet@example.com", "aruzhan@example.com"]
PASSWORD = "FamilyDemo2026!"


def percentile(values, share):
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * share))]


async def sign_in(base):
    sessions = []
    for email in ACCOUNTS:
        client = httpx.AsyncClient(base_url=base, timeout=30)
        response = await client.post(
            "/api/auth/login", json={"email": email, "password": PASSWORD}
        )
        response.raise_for_status()
        family = response.json()["families"][0]["id"]
        categories = (await client.get(f"/api/families/{family}/categories")).json()
        cookie = client.cookies.get("family_session")
        await client.aclose()
        sessions.append((cookie, family, categories[0]["id"]))
    return sessions


async def user(base, session, deadline, write_share, results, limits):
    cookie, family, category = session
    month = "2026-10"
    today = datetime.now(ZoneInfo("Asia/Almaty")).date().isoformat()
    paths = [
        f"/api/families/{family}/summary?month={month}",
        f"/api/families/{family}/expenses?month={month}&page_size=5",
        f"/api/families/{family}/categories",
        f"/api/families/{family}/members",
        f"/api/families/{family}/income?month={month}",
        f"/api/families/{family}/goals",
        "/api/rates",
    ]
    step = 0
    async with httpx.AsyncClient(
        base_url=base,
        timeout=30,
        cookies={"family_session": cookie},
        limits=limits,
    ) as client:
        while time.perf_counter() < deadline:
            step += 1
            # One page view of the overview = the requests the browser sends.
            for path in paths:
                await call(client, "GET", path, None, results)
            if write_share and step % write_share == 0:
                body = {
                    "category_id": category,
                    "amount_kzt": 1000,
                    "expense_date": today,
                    "note": "load test",
                    "client_request_id": str(uuid.uuid4()),
                }
                await call(
                    client, "POST", f"/api/families/{family}/expenses", body, results
                )


async def call(client, method, path, body, results):
    start = time.perf_counter()
    try:
        response = await client.request(method, path, json=body)
        ok = response.status_code < 400
        status = response.status_code
    except httpx.HTTPError as error:
        ok, status = False, type(error).__name__
    results.append((time.perf_counter() - start, ok, status))


async def step(base, sessions, users, seconds, write_share):
    results = []
    deadline = time.perf_counter() + seconds
    limits = httpx.Limits(max_connections=2, max_keepalive_connections=2)
    started = time.perf_counter()
    await asyncio.gather(
        *[
            user(
                base,
                sessions[n % len(sessions)],
                deadline,
                write_share,
                results,
                limits,
            )
            for n in range(users)
        ]
    )
    elapsed = time.perf_counter() - started
    times = [t * 1000 for t, ok, _ in results if ok]
    errors = [status for _, ok, status in results if not ok]
    return {
        "users": users,
        "requests": len(results),
        "rps": len(results) / elapsed,
        "avg": statistics.mean(times) if times else 0,
        "p95": percentile(times, 0.95),
        "max": max(times) if times else 0,
        "errors": len(errors),
        "error_share": len(errors) / len(results) * 100 if results else 0,
        "error_kinds": sorted({str(e) for e in errors}),
    }


async def login_cost(base, attempts):
    """Time real sign-ins; each one hashes the password with Argon2."""

    async def one():
        async with httpx.AsyncClient(base_url=base, timeout=30) as client:
            start = time.perf_counter()
            response = await client.post(
                "/api/auth/login",
                json={"email": ACCOUNTS[0], "password": PASSWORD},
            )
            return time.perf_counter() - start, response.status_code

    start = time.perf_counter()
    rows = await asyncio.gather(*[one() for _ in range(attempts)])
    total = time.perf_counter() - start
    statuses = sorted({status for _, status in rows})
    return [t * 1000 for t, _ in rows], total, statuses


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--users", default="1,10,25,50,100,200")
    parser.add_argument("--seconds", type=float, default=20)
    parser.add_argument("--write-every", type=int, default=5)
    parser.add_argument("--logins", type=int, default=0)
    args = parser.parse_args()

    if args.logins:
        times, total, statuses = await login_cost(args.base, args.logins)
        print(
            f"{args.logins} sign-ins at once: avg {statistics.mean(times):.0f} ms, "
            f"slowest {max(times):.0f} ms, all done in {total:.1f} s, "
            f"statuses {statuses}"
        )
        return

    sessions = await sign_in(args.base)
    print("| Users | Requests | Req/s | Avg ms | p95 ms | Max ms | Errors |")
    print("|---|---|---|---|---|---|---|")
    for users in [int(n) for n in args.users.split(",")]:
        row = await step(args.base, sessions, users, args.seconds, args.write_every)
        print(
            f"| {row['users']} | {row['requests']} | {row['rps']:.0f} | "
            f"{row['avg']:.0f} | {row['p95']:.0f} | {row['max']:.0f} | "
            f"{row['errors']} ({row['error_share']:.1f}%) {' '.join(row['error_kinds'])} |",
            flush=True,
        )
        await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
