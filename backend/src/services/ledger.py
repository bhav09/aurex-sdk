"""Shared LLM event ingest path.

Both the legacy `POST /sdk/events` and the new `POST /api/v1/ledger/events`
funnel through `ingest_events`. Cost is calculated server-side when the
caller omits it. Returns counts so callers can ack accepted/rejected.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.logger import get_logger
from src.utils.pricing import calculate_cost, extract_provider_from_model

logger = get_logger(__name__)


@dataclass
class IngestResult:
    accepted: int
    rejected: int
    project_id: Optional[str]
    upload_session_id: Optional[str]


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return datetime.utcnow()
    return datetime.utcnow()


async def ingest_events(
    db: AsyncSession,
    events: Iterable[Dict[str, Any]],
    *,
    project_id: Optional[str] = None,
    upload_session_id: Optional[str] = None,
    owner_email: Optional[str] = None,
) -> IngestResult:
    """Persist a batch of LLM events. Per-event errors are isolated and counted."""

    from src.models import LLMEvent

    accepted = 0
    rejected = 0

    for raw in events:
        try:
            model = raw.get("model") or "unknown"
            provider = raw.get("provider") or extract_provider_from_model(model)

            input_tokens = int(raw.get("input_tokens", 0) or 0)
            output_tokens = int(raw.get("output_tokens", 0) or 0)
            cached_tokens = int(raw.get("cached_tokens", 0) or 0)
            cache_write_tokens = int(raw.get("cache_write_tokens", 0) or 0)

            # Accept either the v1 spec name (`cost_usd`) or the legacy `cost`.
            cost = raw.get("cost_usd")
            if cost is None:
                cost = raw.get("cost")
            if cost is None:
                cost = calculate_cost(
                    model,
                    input_tokens,
                    output_tokens,
                    cache_read_tokens=cached_tokens,
                    cache_creation_tokens=cache_write_tokens,
                )

            metadata = raw.get("extra_metadata") or {}
            if "team" in raw and raw["team"] is not None:
                metadata = {**metadata, "team": raw["team"]}
            if "environment" in raw and raw["environment"] is not None:
                metadata = {**metadata, "environment": raw["environment"]}

            event = LLMEvent(
                id=str(uuid.uuid4()),
                timestamp=_parse_timestamp(raw.get("timestamp")),
                provider=provider,
                model=model,
                workflow_id=raw.get("workflow_id"),
                step_id=raw.get("step_id"),
                parent_step_id=raw.get("parent_step_id"),
                upload_session_id=upload_session_id,
                project_id=project_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                cost=float(cost or 0.0),
                prompt=None,
                response=None,
                system_prompt_hash=raw.get("system_prompt_hash"),
                context_length=input_tokens,
                extra_metadata=metadata or None,
            )
            db.add(event)
            accepted += 1
        except Exception as e:  # isolate per-event failures
            rejected += 1
            logger.warning("Rejected ledger event", error=str(e), event=raw)

    await db.commit()

    logger.info(
        "Ledger ingest complete",
        accepted=accepted,
        rejected=rejected,
        project_id=project_id,
        owner_email=owner_email,
    )
    return IngestResult(
        accepted=accepted,
        rejected=rejected,
        project_id=project_id,
        upload_session_id=upload_session_id,
    )
