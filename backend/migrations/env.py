from alembic import context
import asyncio
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import get_settings
from app.database import Base
from app import models  # noqa: F401

config = context.config
target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:

    def run_migrations(connection):
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

    async def migrate():
        engine = create_async_engine(
            get_settings().database_url, poolclass=pool.NullPool
        )
        async with engine.connect() as connection:
            await connection.run_sync(run_migrations)
        await engine.dispose()

    asyncio.run(migrate())
