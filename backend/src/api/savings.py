"""Verified savings vs workflow baselines — SQL-native outcome accounting."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.jwt_context import JwtContext, get_jwt_context
from src.api.project_access import require_project_access
from src.database import get_db
from src.models import LLMEvent
from src.models.baseline import WorkflowBaseline
from src.models.llm_event import CostTypeEnum, OutcomeEnum
from src.utils.logger import get_logger

router = APIRouter(prefix="/savings", tags=["savings"])
logger = get_logger(__name__)


async def _aggregate_workflows_sql(
    db: AsyncSession,
    project_id: str,
    window_start: datetime,
    window_end: Optional[datetime] = None,
) -> list[dict]:
    """SQL GROUP BY workflow_id separating explicit mark_success signals from per-call inference."""
    is_signal = LLMEvent.cost_type == CostTypeEnum.OUTCOME_SIGNAL
    is_llm = LLMEvent.cost_type != CostTypeEnum.OUTCOME_SIGNAL

    filters = [
        LLMEvent.project_id == project_id,
        LLMEvent.workflow_id.isnot(None),
        LLMEvent.timestamp >= window_start,
    ]
    if window_end is not None:
        filters.append(LLMEvent.timestamp <= window_end)

    rows = (
        await db.execute(
            select(
                LLMEvent.workflow_id,
                func.count().label("total_rows"),
                func.coalesce(func.sum(case((is_llm, LLMEvent.cost), else_=0.0)), 0.0).label("llm_cost"),
                func.coalesce(func.sum(case((is_llm, 1), else_=0)), 0).label("llm_calls"),
                func.coalesce(func.sum(case((is_llm & (LLMEvent.retry_count > 0), 1), else_=0)), 0).label("retry_n"),
                func.coalesce(func.sum(case((is_signal, 1), else_=0)), 0).label("sig_total"),
                func.coalesce(
                    func.sum(case((is_signal & (LLMEvent.outcome == OutcomeEnum.SUCCESS), 1), else_=0)), 0
                ).label("sig_succ"),
                func.coalesce(
                    func.sum(case((is_llm & (LLMEvent.outcome == OutcomeEnum.SUCCESS), 1), else_=0)), 0
                ).label("call_succ"),
            )
            .where(*filters)
            .group_by(LLMEvent.workflow_id)
        )
    ).all()

    out = []
    for r in rows:
        eff_succ = int(r.sig_succ if (r.sig_total or 0) > 0 else (r.call_succ or 0))
        llm_calls = int(r.llm_calls or 0)
        llm_cost = float(r.llm_cost or 0.0)
        out.append(
            {
                "workflow_id": r.workflow_id,
                "llm_cost": llm_cost,
                "llm_calls": llm_calls,
                "sample_size": int(r.total_rows or 0),
                "retry_rate": (int(r.retry_n or 0) / llm_calls) if llm_calls else 0.0,
                "effective_successes": eff_succ,
                "cost_per_success": (llm_cost / eff_succ) if eff_succ else None,
                "turns_per_success": round(llm_calls / eff_succ, 2) if eff_succ else None,
            }
        )
    return out


async def compute_baselines_for_project(db: AsyncSession, project_id: str) -> int:
    """Compute 7-day rolling baselines per workflow via SQL GROUP BY."""
    window_end = datetime.utcnow()
    window_start = window_end - timedelta(days=7)
    rollups = await _aggregate_workflows_sql(db, project_id, window_start, window_end)
    if not rollups:
        return 0

    for item in rollups:
        db.add(
            WorkflowBaseline(
                workflow_id=item["workflow_id"],
                project_id=project_id,
                avg_cost_per_success=item["cost_per_success"],
                avg_retry_rate=item["retry_rate"],
                sample_size=item["sample_size"],
                window_start=window_start,
                window_end=window_end,
            )
        )
    await db.commit()
    return len(rollups)


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
    current_rollups = await _aggregate_workflows_sql(db, pid, seven_days_ago)

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
    for cur in current_rollups:
        wf = cur["workflow_id"]
        baseline = latest_by_wf.get(wf)
        if not baseline or not baseline.avg_cost_per_success:
            continue
        current_avg = cur["cost_per_success"]
        if current_avg is None:
            continue
        succ_n = cur["effective_successes"]
        delta = baseline.avg_cost_per_success - current_avg
        monthly_saved = max(0.0, delta) * (succ_n / 7.0) * 30.0
        confidence = "HIGH" if baseline.sample_size >= 50 else ("MEDIUM" if baseline.sample_size >= 20 else "LOW")
        items.append(
            {
                "workflow_id": wf,
                "baseline_cost_per_success": baseline.avg_cost_per_success,
                "current_cost_per_success": current_avg,
                "turns_per_success": cur["turns_per_success"],
                "delta_per_task": delta,
                "estimated_monthly_saved_usd": round(monthly_saved, 2),
                "confidence": confidence,
                "sample_size": baseline.sample_size,
            }
        )

    return {"project_id": pid, "items": items}
