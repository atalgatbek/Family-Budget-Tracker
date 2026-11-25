"""Request checks that apply to every API call."""

from fastapi import Request
from fastapi.responses import JSONResponse
from .config import get_settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def client_ip(request: Request) -> str:
    """The visitor's address. Proxy headers are trusted only behind our own proxy."""
    if get_settings().trust_proxy_headers:
        forwarded = (
            request.headers.get("x-real-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        )
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def cross_site_refusal(request: Request) -> JSONResponse | None:
    """Rejects changes sent from another site (CSRF)."""
    if request.method in SAFE_METHODS:
        return None
    origin = request.headers.get("origin")
    if origin and origin not in get_settings().origins:
        return JSONResponse({"detail": "This origin is not allowed."}, status_code=403)
    if request.headers.get("sec-fetch-site") == "cross-site":
        return JSONResponse(
            {"detail": "Cross-site requests are not allowed."}, status_code=403
        )
    return None


def secure_headers(response) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
