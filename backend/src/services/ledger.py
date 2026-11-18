"""Shared LLM event ingest path.

Both the legacy `POST /sdk/events` and the new `POST /api/v1/ledger/events`
funnel through `ingest_events`. Cost is calculated server-side when the
caller omits it. Returns counts so callers can ack accepted/rejected.

Also publishes to Google Cloud Pub/Sub for real-time dashboard streaming.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.logger import get_logger
from src.utils.pricing import calculate_cost, extract_provider_from_model

logger = get_logger(__name__)

# Pub/Sub publisher (lazy init)
_pubsub_publisher = None


async def get_pubsub_publisher():
    global _pubsub_publisher
    if _pubsub_publisher is None:
        try:
            from google.cloud import pubsub_v1
            project_id = os.getenv("PUBSUB_PROJECT_ID", os.getenv("GCP_PROJECT_ID"))
            _pubsub_publisher = pubsub_v1.PublisherClient()
        except Exception as e:
            logger.warning(f"Pub/Sub client init failed: {e}")
    return _pubsub_publisher


async def publish_event_to_pubsub(event_dict: Dict[str, Any], project_id: str) -> None:
    """Publish event to Cloud Pub/Sub for real-time dashboard streaming."""
    try:
        publisher = await get_pubsub_publisher()
        if publisher is None:
            return

        topic_id = os.getenv("PUBSUB_TOPIC_EVENTS", "aurex-events")
        project_id_env = os.getenv("PUBSUB_PROJECT_ID", os.getenv("GCP_PROJECT_ID"))
        topic_path = publisher.topic_path(project_id_env, topic_id)

        # Serialize event as JSON
        payload = json.dumps(event_dict).encode("utf-8")

        # Publish with project_id attribute for filtering
        future = publisher.publish(
            topic_path,
            payload,
            project_id=project_id,
        )
        _ = await future  # Fire and forget
    except Exception as e:
        logger.warning(f"Pub/Sub publish failed (non-critical): {e}")


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


def _parse_outcome(value: Any):
    from src.models.llm_event import OutcomeEnum

    if value is None:
        return OutcomeEnum.PENDING
    s = str(value).lower().strip()
    if s.startswith("outcomeenum."):
        s = s.split(".")[-1]
    try:
        return OutcomeEnum(s)
    except ValueError:
        return OutcomeEnum.PENDING


def _parse_cost_type(value: Any):
    from src.models.llm_event import CostTypeEnum

    if value is None:
        return CostTypeEnum.INFERENCE
    s = str(value).lower().strip()
    if s.startswith("costtypeenum."):
        s = s.split(".")[-1]
    try:
        return CostTypeEnum(s)
    except ValueError:
        return CostTypeEnum.INFERENCE


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
            reasoning_tokens = int(raw.get("reasoning_tokens", 0) or 0)

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
            if raw.get("projected_cost") is not None:
                metadata = {**metadata, "projected_cost": raw.get("projected_cost")}
            loss_avoided = raw.get("loss_avoided")
            if loss_avoided is None and metadata.get("loss_avoided") is not None:
                loss_avoided = metadata.get("loss_avoided")
            if loss_avoided is not None:
                metadata = {**metadata, "loss_avoided": loss_avoided}

            event_id = str(uuid.uuid4())
            event = LLMEvent(
                id=event_id,
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
                cached_tokens=cached_tokens,
                cache_write_tokens=cache_write_tokens,
                reasoning_tokens=reasoning_tokens,
                cost=float(cost or 0.0),
                prompt=None,
                response=None,
                system_prompt_hash=raw.get("system_prompt_hash"),
                context_length=input_tokens,
                retry_count=int(raw.get("retry_count", 0) or 0),
                outcome=_parse_outcome(raw.get("outcome")),
                cost_type=_parse_cost_type(raw.get("cost_type")),
                loop_score=raw.get("loop_score"),
                team=raw.get("team") or (raw.get("tags") or {}).get("team"),
                tenant_id=raw.get("tenant_id") or (raw.get("tags") or {}).get("tenant_id") or metadata.get("tenant_id"),
                status=raw.get("status"),
                error_code=raw.get("error_code"),
                latency_ms=raw.get("latency_ms"),
                finish_reason=raw.get("finish_reason"),
                reported_cost_usd=raw.get("reported_cost_usd"),
                cost_source=raw.get("cost_source"),
                projected_cost=raw.get("projected_cost"),
                recovery_provider=raw.get("recovery_provider"),
                attempt_index=raw.get("attempt_index"),
                extra_metadata=metadata or None,
            )
            db.add(event)

            # Publish to Pub/Sub for real-time dashboard
            if project_id:
                event_dict = {
                    "id": event_id,
                    "timestamp": event.timestamp.isoformat(),
                    "model": model,
                    "provider": provider,
                    "workflow_id": raw.get("workflow_id"),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost": float(cost or 0.0),
                    "retry_count": raw.get("retry_count", 0),
                    "outcome": raw.get("outcome", "pending"),
                }
                try:
                    import asyncio
                    asyncio.create_task(publish_event_to_pubsub(event_dict, project_id))
                except Exception as e:
                    logger.warning(f"Failed to queue Pub/Sub publish: {e}")

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
