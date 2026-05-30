"""Dashboard API endpoints — project-scoped overview, events, SSE."""

from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.jwt_context import JwtContext, events_query_for_context, get_jwt_context
from src.database import get_db
from src.models import LLMEvent, Project
from src.utils.logger import get_logger

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = get_logger(__name__)


def _overview_from_events(events: list) -> dict:
    total_cost = sum(e.cost or 0 for e in events)
    total_events = len(events)
    def _outcome_val(o) -> str:
        if o is None:
            return ""
        return o.value if hasattr(o, "value") else str(o).lower().split(".")[-1]

    success_events = [e for e in events if _outcome_val(e.outcome) == "success"]
    failure_events = [e for e in events if _outcome_val(e.outcome) == "failure"]
    outcome_signal_cost = sum(
        e.cost or 0 for e in events if getattr(e, "cost_type", None) == "outcome_signal"
    )
    llm_cost = total_cost - outcome_signal_cost
    success_count = len(success_events)
    retry_events = [e for e in events if (e.retry_count or 0) > 0]

    model_costs: dict[str, float] = defaultdict(float)
    workflow_costs: dict[str, float] = defaultdict(float)
    workflow_success: dict[str, int] = defaultdict(int)
    for e in events:
        if getattr(e, "cost_type", None) == "outcome_signal":
            continue
        model_costs[e.model or "unknown"] += e.cost or 0
        if e.workflow_id:
            workflow_costs[e.workflow_id] += e.cost or 0
    for e in success_events:
        if e.workflow_id:
            workflow_success[e.workflow_id] += 1

    top_workflows = sorted(workflow_costs.items(), key=lambda x: x[1], reverse=True)[:10]
    workflow_breakdown = [
        {
            "workflow_id": wf,
            "cost_7d": cost,
            "success_count": workflow_success.get(wf, 0),
            "cost_per_success": (cost / workflow_success[wf]) if workflow_success.get(wf) else None,
        }
        for wf, cost in top_workflows
    ]

    cost_per_successful_outcome = (
        llm_cost / success_count if success_count else None
    )

    return {
        "total_spend_7d": total_cost,
        "llm_spend_7d": llm_cost,
        "total_events": total_events,
        "success_rate": (success_count / total_events * 100) if total_events else 0,
        "success_count": success_count,
        "failure_count": len(failure_events),
        "retry_rate": (len(retry_events) / total_events * 100) if total_events else 0,
        "retry_event_count": len(retry_events),
        "cost_per_successful_outcome": cost_per_successful_outcome,
        "health_score": min(100, max(0, int(100 - (len(retry_events) / max(total_events, 1) * 40)))),
        "model_breakdown": [
            {
                "model": m,
                "cost": c,
                "pct": (c / llm_cost * 100) if llm_cost else 0,
            }
            for m, c in sorted(model_costs.items(), key=lambda x: x[1], reverse=True)
        ],
        "workflow_breakdown": workflow_breakdown,
        "top_issues": [
            {
                "rank": 1,
                "name": "High retry rate",
                "severity": "MEDIUM" if len(retry_events) < total_events * 0.2 else "HIGH",
                "cost_per_week": sum(e.cost or 0 for e in retry_events),
            }
        ] if retry_events else [],
    }


@router.get("/projects")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """Projects the current user can access (for project selector)."""
    from src.api.jwt_context import resolve_accessible_project_ids
    from src.models import User

    project_ids = await resolve_accessible_project_ids(db, ctx)
    if not project_ids:
        return {"projects": []}
    rows = (
        await db.execute(select(Project).where(Project.id.in_(project_ids)))
    ).scalars().all()
    return {
        "projects": [
            {"id": p.id, "name": p.name, "org_id": p.org_id}
            for p in rows
        ],
        "active_project_id": ctx.project_id,
    }


@router.get("/overview")
async def get_overview(
    project_id: Optional[str] = Query(None, description="Override JWT project scope"),
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """Return dashboard overview metrics scoped to project."""
    try:
        from src.api.project_access import require_project_access

        if project_id:
            await require_project_access(db, ctx.email, project_id)
            base = select(LLMEvent).where(LLMEvent.project_id == project_id)
        else:
            base = await events_query_for_context(db, ctx)

        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        result = await db.execute(
            base.where(LLMEvent.timestamp >= seven_days_ago)
            .order_by(desc(LLMEvent.timestamp))
            .limit(5000)
        )
        events = result.scalars().all()
        payload = _overview_from_events(events)
        payload["project_id"] = project_id or ctx.project_id
        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Overview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events")
async def get_events(
    page: int = 1,
    limit: int = 50,
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """Return paginated events for Data View."""
    try:
        from src.api.project_access import require_project_access

        if project_id:
            await require_project_access(db, ctx.email, project_id)
            base = select(LLMEvent).where(LLMEvent.project_id == project_id)
        else:
            base = await events_query_for_context(db, ctx)

        offset = (page - 1) * limit
        result = await db.execute(
            base.order_by(desc(LLMEvent.timestamp)).offset(offset).limit(limit)
        )
        events = result.scalars().all()
        return {
            "events": [
                {
                    "id": e.id,
                    "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                    "model": e.model,
                    "workflow_id": e.workflow_id,
                    "input_tokens": e.input_tokens,
                    "output_tokens": e.output_tokens,
                    "cost": e.cost,
                    "retry_count": e.retry_count,
                    "outcome": e.outcome,
                    "cost_type": getattr(e, "cost_type", None),
                    "loop_score": getattr(e, "loop_score", None),
                }
                for e in events
            ],
            "page": page,
            "limit": limit,
            "project_id": project_id or ctx.project_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Events error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime")
async def realtime_events(
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """SSE stream — polls recent events when Pub/Sub is unavailable."""

    async def event_generator() -> AsyncGenerator[str, None]:
        last_id: Optional[str] = None
        scoped_project = project_id or ctx.project_id
        for _ in range(120):
            try:
                if scoped_project:
                    from src.api.project_access import require_project_access
                    await require_project_access(db, ctx.email, scoped_project)
                    q = select(LLMEvent).where(LLMEvent.project_id == scoped_project)
                else:
                    q = await events_query_for_context(db, ctx)
                if last_id:
                    q = q.where(LLMEvent.id > last_id)
                result = await db.execute(
                    q.order_by(desc(LLMEvent.timestamp)).limit(20)
                )
                batch = list(reversed(result.scalars().all()))
                for e in batch:
                    last_id = e.id
                    yield f"data: {json.dumps({
                        'id': e.id,
                        'timestamp': e.timestamp.isoformat() if e.timestamp else None,
                        'model': e.model,
                        'workflow_id': e.workflow_id,
                        'cost': e.cost,
                        'outcome': e.outcome,
                    })}\n\n"
            except Exception as exc:
                logger.warning(f"SSE poll error: {exc}")
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
