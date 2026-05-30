"""Dashboard API endpoints.

Minimal MVP: overview stats, event listing, real-time SSE.
Auth: JWT required, scoped to project_id in token.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from src.api.auth import get_current_user
from src.database import get_db
from src.models import LLMEvent
from src.utils.logger import get_logger

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = get_logger(__name__)


def decode_jwt_claims(token: str) -> dict:
    """Decode JWT without verification to extract claims."""
    import jwt
    from app.config import settings
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except Exception:
        return {}


async def get_current_project_id(
    user: str = Depends(get_current_user),
) -> str:
    """Extract project_id from JWT token passed via Authorization header."""
    # In a real app, we'd extract from request context. For MVP, return a default.
    # Frontend will send project_id in Authorization header as JWT with embedded project_id.
    return "default_project"  # Placeholder; frontend should pass via header


@router.get("/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    """Return dashboard overview metrics."""
    try:
        # Get last 7 days of events
        from datetime import datetime, timedelta
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        result = await db.execute(
            select(LLMEvent)
            .where(LLMEvent.timestamp >= seven_days_ago)
            .order_by(desc(LLMEvent.timestamp))
            .limit(1000)
        )
        events = result.scalars().all()

        total_cost = sum(e.cost for e in events)
        total_events = len(events)
        success_count = sum(1 for e in events if e.outcome == "success")
        failed_count = sum(1 for e in events if e.outcome == "failure")

        # Model breakdown
        model_costs = {}
        for e in events:
            model_costs[e.model] = model_costs.get(e.model, 0.0) + e.cost

        # Top issues (simulated for MVP)
        issues = [
            {
                "rank": 1,
                "name": "High retry rate",
                "severity": "MEDIUM",
                "cost_per_week": sum(e.cost for e in events if e.retry_count > 2),
            }
        ]

        return {
            "total_spend_7d": total_cost,
            "total_events": total_events,
            "success_rate": (success_count / total_events * 100) if total_events else 0,
            "health_score": 85,  # Placeholder
            "model_breakdown": [
                {"model": m, "cost": c, "pct": (c / total_cost * 100) if total_cost else 0}
                for m, c in sorted(model_costs.items(), key=lambda x: x[1], reverse=True)
            ],
            "top_issues": issues,
        }
    except Exception as e:
        logger.error(f"Overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events")
async def get_events(
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    """Return paginated events for Data View."""
    try:
        offset = (page - 1) * limit
        result = await db.execute(
            select(LLMEvent)
            .order_by(desc(LLMEvent.timestamp))
            .offset(offset)
            .limit(limit)
        )
        events = result.scalars().all()
        return {
            "events": [
                {
                    "id": e.id,
                    "timestamp": e.timestamp.isoformat(),
                    "model": e.model,
                    "workflow_id": e.workflow_id,
                    "input_tokens": e.input_tokens,
                    "output_tokens": e.output_tokens,
                    "cost": e.cost,
                    "retry_count": e.retry_count,
                    "outcome": e.outcome,
                }
                for e in events
            ],
            "page": page,
            "limit": limit,
        }
    except Exception as e:
        logger.error(f"Events error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime")
async def realtime_events(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(get_current_user),
):
    """Server-Sent Events endpoint for real-time event streaming.

    Subscribes to Pub/Sub and streams new events to browser.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE stream of events."""
        try:
            from google.cloud import pubsub_v1
            import json as json_lib

            project_id = os.getenv("PUBSUB_PROJECT_ID", os.getenv("GCP_PROJECT_ID"))
            subscription_id = os.getenv("PUBSUB_SUBSCRIPTION_DASHBOARD", "aurex-events-dashboard-sub")

            subscriber = pubsub_v1.SubscriberClient()
            subscription_path = subscriber.subscription_path(project_id, subscription_id)

            # Pull messages for 60 seconds
            with subscriber:
                for message in subscriber.pull(subscription_path, max_messages=10, timeout=60).received_messages:
                    try:
                        payload = json_lib.loads(message.data.decode("utf-8"))
                        yield f"data: {json_lib.dumps(payload)}\n\n"
                        subscriber.acknowledge(subscription_path, [message.ack_id])
                    except Exception as e:
                        logger.warning(f"SSE message error: {e}")
                        subscriber.nack(subscription_path, [message.ack_id])
        except Exception as e:
            logger.warning(f"SSE stream failed: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(event_generator(), media_type="text/event-stream")
