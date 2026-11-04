    from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    database_url: str = "postgresql+psycopg://family_budget:family_budget_dev@127.0.0.1:55432/family_budget"
    jwt_secret: str = Field(min_length=32)
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    upload_dir: Path = ROOT / "backend" / "uploads"

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
