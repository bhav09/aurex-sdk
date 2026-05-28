"""Alembic env. Reads DATABASE_URL from environment, converts async dialects to sync,
and binds Alembic's metadata to the project's SQLAlchemy Base."""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `src` importable when alembic runs from backend/
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

# Import models so Base.metadata is populated.
from src.models import Base  # noqa: E402,F401
import src.models  # noqa: E402,F401  - registers all models on Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _resolve_database_url() -> str:
    raw = os.getenv("DATABASE_URL", "sqlite:///./aurix.db")
    # Alembic uses sync drivers; strip async dialect suffixes.
    if raw.startswith("postgresql+asyncpg://"):
        return raw.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    if raw.startswith("sqlite+aiosqlite://"):
        return raw.replace("sqlite+aiosqlite://", "sqlite://")
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+psycopg2://")
    return raw


DATABASE_URL = _resolve_database_url()
config.set_main_option("sqlalchemy.url", DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=DATABASE_URL.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=DATABASE_URL.startswith("sqlite"),
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
