from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from . import ratelimit
from .config import get_settings
from .database import engine
from .security import cross_site_refusal, secure_headers
from .routes import (
    auth,
    budgets,
    expenses,
    families,
    goals,
    income,
    notifications,
    rates,
    requests,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="Family Budget Tracker",
    version="1.0.0",
    lifespan=lifespan,
    description="Shared KZT budgets, household permissions, purchase requests, savings goals, notifications, limited sessions, and rate limits.",
)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def request_security(request: Request, call_next):
    refused = cross_site_refusal(request)
    if refused:
        return refused
    limited, limit_headers = await ratelimit.check(request)
    response = limited or await call_next(request)
    response.headers.update(limit_headers)
    secure_headers(response)
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
    rates.router,
    requests.router,
    notifications.router,
]:
    app.include_router(router, prefix="/api")
