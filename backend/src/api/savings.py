"""Verified savings vs workflow baselines."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.jwt_context import JwtContext, events_query_for_context, get_jwt_context
from src.api.project_access import require_project_access
from src.database import get_db
from src.models import LLMEvent
from src.models.baseline import WorkflowBaseline
from src.utils.logger import get_logger

router = APIRouter(prefix="/savings", tags=["savings"])
logger = get_logger(__name__)


def _outcome_is_success(o) -> bool:
    if o is None:
        return False
    v = o.value if hasattr(o, "value") else str(o).lower()
    return v == "success" or v.endswith("success")


async def compute_baselines_for_project(db: AsyncSession, project_id: str) -> int:
    """Compute 7-day rolling baselines per workflow (nightly job entrypoint)."""
    window_end = datetime.utcnow()
    window_start = window_end - timedelta(days=7)
    base = select(LLMEvent).where(
        LLMEvent.project_id == project_id,
        LLMEvent.timestamp >= window_start,
        LLMEvent.timestamp <= window_end,
    )
    result = await db.execute(base)
    events = result.scalars().all()
    if not events:
        return 0

    by_wf: dict[str, list] = {}
    for e in events:
        if not e.workflow_id:
            continue
        by_wf.setdefault(e.workflow_id, []).append(e)

    count = 0
    for wf, wf_events in by_wf.items():
        successes = [e for e in wf_events if _outcome_is_success(e.outcome)]
        llm_cost = sum(e.cost or 0 for e in wf_events if getattr(e, "cost_type", None) != "outcome_signal")
        retry_n = sum(1 for e in wf_events if (e.retry_count or 0) > 0)
        avg_cost = (llm_cost / len(successes)) if successes else None
        avg_retry = retry_n / len(wf_events) if wf_events else 0
        row = WorkflowBaseline(
            workflow_id=wf,
            project_id=project_id,
            avg_cost_per_success=avg_cost,
            avg_retry_rate=avg_retry,
            sample_size=len(wf_events),
            window_start=window_start,
            window_end=window_end,
        )
        db.add(row)
        count += 1
    await db.commit()
    return count


@router.post("/compute-baselines")
async def trigger_baseline_compute(
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """Admin/cron: recompute baselines for a project."""
    pid = project_id or ctx.project_id
    if not pid:
        raise HTTPException(status_code=400, detail="project_id required")
    await require_project_access(db, ctx.email, pid)
    n = await compute_baselines_for_project(db, pid)
    return {"computed": n, "project_id": pid}


@router.get("/verified")
async def verified_savings(
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    pid = project_id or ctx.project_id
    if not pid:
        raise HTTPException(status_code=400, detail="project_id required")
    await require_project_access(db, ctx.email, pid)

    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    current_q = select(LLMEvent).where(
        LLMEvent.project_id == pid,
        LLMEvent.timestamp >= seven_days_ago,
    )
    current_events = (await db.execute(current_q)).scalars().all()

    baseline_rows = (
        await db.execute(
            select(WorkflowBaseline)
            .where(WorkflowBaseline.project_id == pid)
            .order_by(desc(WorkflowBaseline.window_end))
        )
    ).scalars().all()
    latest_by_wf: dict[str, WorkflowBaseline] = {}
    for b in baseline_rows:
        if b.workflow_id not in latest_by_wf:
            latest_by_wf[b.workflow_id] = b

    items = []
    by_wf_current: dict[str, list] = {}
    for e in current_events:
        if e.workflow_id:
            by_wf_current.setdefault(e.workflow_id, []).append(e)

    for wf, evs in by_wf_current.items():
        baseline = latest_by_wf.get(wf)
        if not baseline or not baseline.avg_cost_per_success:
            continue
        successes = [e for e in evs if _outcome_is_success(e.outcome)]
        llm_cost = sum(e.cost or 0 for e in evs if getattr(e, "cost_type", None) != "outcome_signal")
        current_avg = (llm_cost / len(successes)) if successes else None
        if current_avg is None:
            continue
        delta = baseline.avg_cost_per_success - current_avg
        monthly_saved = max(0, delta) * (len(successes) / 7) * 30
        confidence = "HIGH" if baseline.sample_size >= 50 else ("MEDIUM" if baseline.sample_size >= 20 else "LOW")
        items.append({
            "workflow_id": wf,
            "baseline_cost_per_success": baseline.avg_cost_per_success,
            "current_cost_per_success": current_avg,
            "delta_per_task": delta,
            "estimated_monthly_saved_usd": round(monthly_saved, 2),
            "confidence": confidence,
            "sample_size": baseline.sample_size,
        })

    return {"project_id": pid, "items": items}
