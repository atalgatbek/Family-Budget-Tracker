import os
from functools import lru_cache
from pathlib import Path
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
