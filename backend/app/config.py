import os
from functools import lru_cache
from pathlib import Path
from typing import Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


def deployed_on_vercel() -> bool:
    """True for a Vercel production or preview deployment, not for `vercel dev`."""
    return os.environ.get("VERCEL_ENV") in {"production", "preview"}


def vercel_origins() -> list[str]:
    """Public origins of this Vercel deployment.

    The frontend and the API share one domain there, and preview deployments
    get a new hostname each time, so the site's own origin is taken from the
    variables Vercel sets (bare hostnames, always served over HTTPS).
    """
    if not deployed_on_vercel():
        return []
    names = ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL")
    return [f"https://{host}" for name in names if (host := os.environ.get(name))]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    database_url: str = "postgresql+psycopg://family_budget:family_budget_dev@127.0.0.1:55432/family_budget"
    jwt_secret: str = Field(min_length=32)
    cookie_secure: bool = Field(default_factory=deployed_on_vercel)
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    upload_dir: Path = ROOT / "backend" / "uploads"
    # A session ends after this long without activity, and in any case
    # this many hours after sign-in.
    session_idle_minutes: int = Field(default=30, ge=1, le=1440)
    session_max_hours: int = Field(default=12, ge=1, le=720)
    # Requests per minute. Sign-in style requests count per address.
    rate_limit_requests: int = Field(default=120, ge=1)
    rate_limit_writes: int = Field(default=30, ge=1)
    rate_limit_auth: int = Field(default=10, ge=1)
    # Behind a proxy that sets X-Real-IP (Vercel, or the Compose Nginx).
    trust_proxy_headers: bool = Field(default_factory=deployed_on_vercel)
    # Email for password reset codes. Without SMTP_HOST, local development
    # writes the email to the server log instead.
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    # auto: SSL on port 465, otherwise STARTTLS. "none" only for a local test server.
    smtp_security: Literal["auto", "ssl", "starttls", "none"] = "auto"
    mail_from: str = ""
    mail_from_name: str = "Family Budget"
    # Address of the site, for the link in the email. Defaults to the address
    # the request came from.
    public_url: str = ""

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Hosted databases hand out postgres:// or postgresql:// URLs; this
        # project talks to PostgreSQL through psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

    @property
    def origins(self) -> list[str]:
        configured = [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]
        return list(dict.fromkeys(configured + vercel_origins()))


@lru_cache
def get_settings() -> Settings:
    return Settings()
