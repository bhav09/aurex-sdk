"""
Database configuration and session management (Async)
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import AsyncAdaptedQueuePool
from contextlib import asynccontextmanager
from typing import AsyncGenerator
import os
from dotenv import load_dotenv
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
from sqlalchemy.exc import OperationalError, DisconnectionError

load_dotenv()

# Get database URL from environment or use SQLite default
# Convert standard dialect to async dialect
RAW_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./aurex.db")
if RAW_URL.startswith("postgresql://"):
    DATABASE_URL = RAW_URL.replace("postgresql://", "postgresql+asyncpg://")
elif RAW_URL.startswith("sqlite://"):
    DATABASE_URL = RAW_URL.replace("sqlite://", "sqlite+aiosqlite://")
else:
    DATABASE_URL = RAW_URL

# Create engine with retry configuration
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for FastAPI to get database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

@asynccontextmanager
async def get_db_context():
    """
    Context manager for database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

@retry(
    wait=wait_exponential(multiplier=1, min=2, max=10),
    stop=stop_after_attempt(5),
    retry=retry_if_exception_type((OperationalError, DisconnectionError))
)
async def init_db():
    """
    Initialize database tables with retry logic
    """
    from src.models import Base, LLMEvent, AuditSession, PricingOverride, AlertRule, Feedback
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
