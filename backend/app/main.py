from collections import defaultdict, deque
from contextlib import asynccontextmanager
from time import monotonic
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from .config import get_settings
from .database import engine
from .routes import auth, budgets, expenses, families, goals, income


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="Family Budget Tracker",
    version="1.0.0",
    lifespan=lifespan,
    description="Shared KZT budgets, household permissions, receipt storage, atomic budget transfers, and savings goals.",
)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

# Per-process guard; use a shared rate limiter when scaling to multiple replicas.
auth_attempts: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def request_security(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin not in settings.origins:
            return JSONResponse(
                {"detail": "This origin is not allowed."}, status_code=403
            )
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse(
                {"detail": "Cross-site requests are not allowed."}, status_code=403
            )
    if (
        request.url.path in {"/api/auth/login", "/api/auth/register"}
        and request.method == "POST"
    ):
        now = monotonic()
        key = request.client.host if request.client else "unknown"
        attempts = auth_attempts[key]
        while attempts and now - attempts[0] > 60:
            attempts.popleft()
        if len(attempts) >= 20:
            return JSONResponse(
                {"detail": "Too many attempts. Try again in a minute."},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        attempts.append(now)
        if len(auth_attempts) > 10000:
            for host in list(auth_attempts):
                if not auth_attempts[host] or now - auth_attempts[host][-1] > 60:
                    del auth_attempts[host]
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health", tags=["System"])
async def health():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        return JSONResponse(
            {"status": "unavailable", "database": "unavailable"}, status_code=503
        )


for router in [
    auth.router,
    families.router,
    budgets.router,
    expenses.router,
    income.router,
    goals.router,
]:
    app.include_router(router, prefix="/api")
