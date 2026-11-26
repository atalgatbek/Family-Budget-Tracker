"""Rate limiting with counters in the database.

Each request adds one hit to a counter per key and minute. Counting in
PostgreSQL rather than in memory keeps one limit for all copies of the
server (Vercel runs several) and survives restarts.

Limits per minute:
- every API request: per signed-in person, or per address when signed out;
- changes (POST, PUT, PATCH, DELETE): the same, with a lower limit;
- sign-in, registration and password reset: per address, lower still.
"""

import logging
import random
from datetime import datetime, timezone
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from .auth import COOKIE, token_claims
from .config import get_settings
from .database import engine
from .models import RateLimit
from .security import SAFE_METHODS, client_ip

AUTH_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot",
    "/api/auth/reset",
}
EXEMPT_PATHS = {"/api/health"}
log = logging.getLogger(__name__)


def rules(request: Request) -> list[tuple[str, int]]:
    settings = get_settings()
    ip = client_ip(request)
    claims = token_claims(request.cookies.get(COOKIE))
    who = f"user:{claims['sub']}" if claims else f"ip:{ip}"
    result = [(f"all:{who}", settings.rate_limit_requests)]
    if request.method not in SAFE_METHODS:
        result.append((f"write:{who}", settings.rate_limit_writes))
        if request.url.path in AUTH_PATHS:
            result.append((f"auth:ip:{ip}", settings.rate_limit_auth))
    return result


async def count(keys: list[str], window: datetime) -> dict[str, int]:
    statement = insert(RateLimit).values(
        [{"key": key, "window_start": window, "hits": 1} for key in keys]
    )
    statement = statement.on_conflict_do_update(
        index_elements=["key", "window_start"],
        set_={"hits": RateLimit.hits + 1},
    ).returning(RateLimit.key, RateLimit.hits)
    async with engine.begin() as connection:
        hits = dict((await connection.execute(statement)).all())
        # Now and then, drop counters of minutes long gone.
        if random.random() < 0.01:
            await connection.execute(
                delete(RateLimit).where(
                    RateLimit.window_start < window.replace(minute=0, second=0)
                )
            )
    return hits


async def check(request: Request) -> tuple[JSONResponse | None, dict[str, str]]:
    """Returns a 429 response when a limit is exceeded, and headers to add."""
    if not request.url.path.startswith("/api/") or request.url.path in EXEMPT_PATHS:
        return None, {}
    applied = rules(request)
    now = datetime.now(timezone.utc)
    window = now.replace(second=0, microsecond=0)
    try:
        hits = await count([key for key, _ in applied], window)
    except Exception:
        # A broken counter must not take the whole site down.
        log.exception("Rate limit counter failed; request allowed.")
        return None, {}
    retry = str(60 - now.second)
    main_key, main_limit = applied[0]
    headers = {
        "X-RateLimit-Limit": str(main_limit),
        "X-RateLimit-Remaining": str(max(0, main_limit - hits.get(main_key, 0))),
    }
    for key, limit in applied:
        if hits.get(key, 0) > limit:
            return (
                JSONResponse(
                    {
                        "detail": "Too many requests. Please wait a moment and try again."
                    },
                    status_code=429,
                    headers={**headers, "Retry-After": retry},
                ),
                headers,
            )
    return None, headers
