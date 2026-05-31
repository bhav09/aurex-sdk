"""Unit tests for resilience field ingest and enum parsing."""

import pytest
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from src.models.llm_event import Base, LLMEvent, OutcomeEnum, CostTypeEnum
from src.services.ledger import ingest_events, _parse_outcome, _parse_cost_type


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


def test_parse_outcome_enums():
    assert _parse_outcome("recovered") == OutcomeEnum.RECOVERED
    assert _parse_outcome("degraded") == OutcomeEnum.DEGRADED
    assert _parse_outcome("bogus") == OutcomeEnum.PENDING


def test_parse_cost_type_enums():
    assert _parse_cost_type("unfulfilled_spend") == CostTypeEnum.UNFULFILLED_SPEND
    assert _parse_cost_type("inference") == CostTypeEnum.INFERENCE


@pytest.mark.asyncio
async def test_ingest_resilience_fields(db_session):
    events = [
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "provider": "openai",
            "model": "gpt-4o",
            "input_tokens": 100,
            "output_tokens": 50,
            "cost_usd": 0.01,
            "outcome": "degraded",
            "cost_type": "unfulfilled_spend",
            "status": "degraded",
            "error_code": "empty",
            "latency_ms": 1200,
            "finish_reason": "length",
            "projected_cost": 0.05,
            "recovery_provider": "anthropic",
            "attempt_index": 1,
            "extra_metadata": {"loss_avoided": 0.04},
        }
    ]
    result = await ingest_events(db_session, events, project_id="proj-1")
    assert result.accepted == 1
    assert result.rejected == 0

    row = (await db_session.execute(
        __import__("sqlalchemy").select(LLMEvent)
    )).scalars().first()
    assert row.outcome == OutcomeEnum.DEGRADED
    assert row.cost_type == CostTypeEnum.UNFULFILLED_SPEND
    assert row.latency_ms == 1200
    assert row.projected_cost == 0.05
    assert row.recovery_provider == "anthropic"
    assert row.attempt_index == 1
    assert row.extra_metadata.get("loss_avoided") == 0.04
