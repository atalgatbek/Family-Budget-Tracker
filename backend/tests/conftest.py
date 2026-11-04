import os
from pathlib import Path
import pytest
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.engine import make_url
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
url = make_url(os.environ["DATABASE_URL"])
test_url = os.environ.get(
    "TEST_DATABASE_URL",
    str(url.set(database="family_budget_test").render_as_string(hide_password=False)),
)
if not make_url(test_url).database.endswith("_test"):
    raise RuntimeError("Tests require a separate database whose name ends in _test.")
os.environ["DATABASE_URL"] = test_url
os.environ["UPLOAD_DIR"] = str(ROOT / ".local" / "test-receipts")
from app.database import engine  # noqa: E402
from app.main import app, auth_attempts  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
def migrate():
    command.upgrade(Config(str(ROOT / "backend" / "alembic.ini")), "head")


@pytest.fixture
async def client():
    async with engine.begin() as connection:
        await connection.execute(
            text("TRUNCATE family, app_user RESTART IDENTITY CASCADE")
        )
    auth_attempts.clear()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    await engine.dispose()


@pytest.fixture
async def household(client):
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "admin@example.com",
            "password": "TestPassword123!",
            "full_name": "Test Admin",
            "family_name": "Test family",
        },
    )
    assert response.status_code == 201, response.text
    family = response.json()["families"][0]["id"]
    categories = (await client.get(f"/api/families/{family}/categories")).json()
    return family, categories
