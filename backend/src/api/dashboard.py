"""Dashboard API endpoints — SQL-native project-scoped overview, events, SSE."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, desc, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.jwt_context import JwtContext, events_query_for_context, get_jwt_context
from src.database import get_db
from src.models import LLMEvent, Project
from src.models.llm_event import CostTypeEnum, OutcomeEnum
from src.utils.logger import get_logger

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = get_logger(__name__)


def _overview_from_events(events: list) -> dict:
    """Pure in-memory rollup (kept in parity with _compute_overview_sql for unit tests)."""
    def _val(v) -> str:
        if v is None:
            return ""
        return v.value if hasattr(v, "value") else str(v).lower().split(".")[-1]

    total_cost = sum(e.cost or 0 for e in events)
    total_events = len(events)
    outcome_signal_cost = sum(
        e.cost or 0 for e in events if _val(getattr(e, "cost_type", None)) == "outcome_signal"
    )
    llm_cost = total_cost - outcome_signal_cost

    recovered_events = [e for e in events if _val(e.outcome) == "recovered"]
    failure_events = [e for e in events if _val(e.outcome) == "failure"]
    billed_failed_events = [
        e
        for e in events
        if _val(getattr(e, "cost_type", None)) == "unfulfilled_spend" or _val(e.outcome) == "degraded"
    ]
    retry_events = [
        e for e in events if _val(getattr(e, "cost_type", None)) != "outcome_signal" and (e.retry_count or 0) > 0
    ]

    model_costs: dict[str, float] = defaultdict(float)
    wf_costs: dict[str, float] = defaultdict(float)
    wf_calls: dict[str, int] = defaultdict(int)
    wf_explicit_signals: dict[str, int] = defaultdict(int)
    wf_explicit_success: dict[str, int] = defaultdict(int)
    wf_call_success: dict[str, int] = defaultdict(int)
    host_stats: dict[tuple[str, str], dict[str, float]] = defaultdict(
        lambda: {"calls": 0, "unfulfilled_spend": 0.0, "retries": 0}
    )

    unscoped_explicit_signals = 0
    unscoped_explicit_success = 0
    unscoped_call_success = 0

    for e in events:
        ct = _val(getattr(e, "cost_type", None))
        out = _val(e.outcome)
        wf = getattr(e, "workflow_id", None)
        if ct == "outcome_signal":
            if wf:
                wf_explicit_signals[wf] += 1
                if out == "success":
                    wf_explicit_success[wf] += 1
            else:
                unscoped_explicit_signals += 1
                if out == "success":
                    unscoped_explicit_success += 1
            continue

        cost_val = float(e.cost or 0.0)
        model_name = getattr(e, "model", None) or "unknown"
        prov_name = getattr(e, "provider", None) or "unknown"
        model_costs[model_name] += cost_val

        hs = host_stats[(model_name, prov_name)]
        hs["calls"] += 1
        if ct == "unfulfilled_spend" or out == "degraded":
            hs["unfulfilled_spend"] += cost_val
        if (getattr(e, "retry_count", 0) or 0) > 0:
            hs["retries"] += 1

        if wf:
            wf_costs[wf] += cost_val
            wf_calls[wf] += 1
            if out == "success":
                wf_call_success[wf] += 1
        elif out == "success":
            unscoped_call_success += 1

    wf_effective_success: dict[str, int] = {}
    all_wfs = set(wf_costs.keys()) | set(wf_explicit_signals.keys())
    for wf in all_wfs:
        wf_effective_success[wf] = (
            wf_explicit_success[wf] if wf_explicit_signals[wf] > 0 else wf_call_success[wf]
        )

    unscoped_success = unscoped_explicit_success if unscoped_explicit_signals > 0 else unscoped_call_success
    success_count = sum(wf_effective_success.values()) + unscoped_success
    llm_calls_total = sum(1 for e in events if _val(getattr(e, "cost_type", None)) != "outcome_signal")

    top_workflows = sorted(wf_costs.items(), key=lambda x: x[1], reverse=True)[:10]
    workflow_breakdown = [
        {
            "workflow_id": wf,
            "cost_7d": cost,
            "llm_calls": wf_calls.get(wf, 0),
            "success_count": wf_effective_success.get(wf, 0),
            "cost_per_success": (cost / wf_effective_success[wf]) if wf_effective_success.get(wf) else None,
            "turns_per_success": round(wf_calls.get(wf, 0) / wf_effective_success[wf], 2)
            if wf_effective_success.get(wf)
            else None,
        }
        for wf, cost in top_workflows
    ]

    billed_but_failed_cost = sum(e.cost or 0 for e in billed_failed_events)
    loss_avoided = sum(
        (getattr(e, "projected_cost", None) or 0) - (e.cost or 0)
        for e in recovered_events
        if getattr(e, "projected_cost", None) is not None
    )
    loss_avoided += sum(
        (e.extra_metadata or {}).get("loss_avoided", 0) or 0
        for e in events
        if isinstance(getattr(e, "extra_metadata", None), dict)
    )
    recoverable_failures = len(failure_events) + len(billed_failed_events)
    recovery_rate = (len(recovered_events) / recoverable_failures * 100) if recoverable_failures else 0.0

    return {
        "total_spend_7d": total_cost,
        "llm_spend_7d": llm_cost,
        "total_events": total_events,
        "success_rate": (success_count / max(llm_calls_total, 1) * 100) if total_events else 0,
        "success_count": success_count,
        "failure_count": len(failure_events),
        "retry_rate": (len(retry_events) / max(llm_calls_total, 1) * 100) if llm_calls_total else 0,
        "retry_event_count": len(retry_events),
        "cost_per_successful_outcome": (llm_cost / success_count) if success_count else None,
        "turns_per_success": round(llm_calls_total / success_count, 2) if success_count else None,
        "billed_but_failed_cost": round(billed_but_failed_cost, 4),
        "loss_avoided": round(loss_avoided, 4),
        "recovery_rate": round(recovery_rate, 2),
        "health_score": min(100, max(0, int(100 - (len(retry_events) / max(llm_calls_total, 1) * 40)))),
        "model_breakdown": [
            {"model": m, "cost": c, "pct": (c / llm_cost * 100) if llm_cost else 0}
            for m, c in sorted(model_costs.items(), key=lambda x: x[1], reverse=True)
        ],
        "host_quality_breakdown": [
            {
                "model": m,
                "provider": p,
                "calls": int(st["calls"]),
                "unfulfilled_spend": round(st["unfulfilled_spend"], 4),
                "retry_rate": round((st["retries"] / st["calls"]) * 100, 2) if st["calls"] else 0.0,
            }
            for (m, p), st in sorted(host_stats.items(), key=lambda x: x[1]["unfulfilled_spend"], reverse=True)
        ],
        "workflow_breakdown": workflow_breakdown,
        "top_issues": [
            {
                "rank": 1,
                "name": "High retry rate",
                "severity": "MEDIUM" if len(retry_events) < llm_calls_total * 0.2 else "HIGH",
                "cost_per_week": sum(e.cost or 0 for e in retry_events),
            }
        ]
        if retry_events
        else [],
    }


async def _compute_overview_sql(db: AsyncSession, base_select) -> dict:
    """SQL-native overview aggregation without .limit(5000) truncation or outcome double-counting."""
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    subq = base_select.where(LLMEvent.timestamp >= seven_days_ago).subquery()

    is_signal = subq.c.cost_type == CostTypeEnum.OUTCOME_SIGNAL
    is_llm = subq.c.cost_type != CostTypeEnum.OUTCOME_SIGNAL
    is_billed_fail = or_(
        subq.c.cost_type == CostTypeEnum.UNFULFILLED_SPEND,
        subq.c.outcome == OutcomeEnum.DEGRADED,
    )

    totals_row = (
        await db.execute(
            select(
                func.count().label("total_events"),
                func.coalesce(func.sum(subq.c.cost), 0.0).label("total_cost"),
                func.coalesce(func.sum(case((is_llm, subq.c.cost), else_=0.0)), 0.0).label("llm_cost"),
                func.coalesce(func.sum(case((is_llm, 1), else_=0)), 0).label("llm_calls"),
                func.coalesce(func.sum(case((subq.c.outcome == OutcomeEnum.FAILURE, 1), else_=0)), 0).label("failures"),
                func.coalesce(func.sum(case((subq.c.outcome == OutcomeEnum.RECOVERED, 1), else_=0)), 0).label("recovered"),
                func.coalesce(func.sum(case((is_billed_fail, 1), else_=0)), 0).label("billed_fail_cnt"),
                func.coalesce(func.sum(case((is_billed_fail, subq.c.cost), else_=0.0)), 0.0).label("billed_fail_cost"),
                func.coalesce(func.sum(case((is_llm & (subq.c.retry_count > 0), 1), else_=0)), 0).label("retry_cnt"),
                func.coalesce(func.sum(case((is_llm & (subq.c.retry_count > 0), subq.c.cost), else_=0.0)), 0.0).label("retry_cost"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                (subq.c.outcome == OutcomeEnum.RECOVERED) & subq.c.projected_cost.isnot(None),
                                subq.c.projected_cost - subq.c.cost,
                            ),
                            else_=0.0,
                        )
                    ),
                    0.0,
                ).label("loss_avoided"),
            )
        )
    ).one()

    total_events = int(totals_row.total_events or 0)
    total_cost = float(totals_row.total_cost or 0.0)
    llm_cost = float(totals_row.llm_cost or 0.0)
    llm_calls = int(totals_row.llm_calls or 0)
    failure_cnt = int(totals_row.failures or 0)
    recovered_cnt = int(totals_row.recovered or 0)
    billed_fail_cnt = int(totals_row.billed_fail_cnt or 0)
    billed_fail_cost = float(totals_row.billed_fail_cost or 0.0)
    retry_cnt = int(totals_row.retry_cnt or 0)
    retry_cost = float(totals_row.retry_cost or 0.0)
    loss_avoided = float(totals_row.loss_avoided or 0.0)

    # SQL GROUP BY workflow_id — strictly separating mark_success outcome_signal from per-call inference
    wf_rows = (
        await db.execute(
            select(
                subq.c.workflow_id,
                func.coalesce(func.sum(case((is_llm, subq.c.cost), else_=0.0)), 0.0).label("cost_7d"),
                func.coalesce(func.sum(case((is_llm, 1), else_=0)), 0).label("llm_calls"),
                func.coalesce(func.sum(case((is_signal, 1), else_=0)), 0).label("sig_total"),
                func.coalesce(
                    func.sum(case((is_signal & (subq.c.outcome == OutcomeEnum.SUCCESS), 1), else_=0)), 0
                ).label("sig_succ"),
                func.coalesce(
                    func.sum(case((is_llm & (subq.c.outcome == OutcomeEnum.SUCCESS), 1), else_=0)), 0
                ).label("call_succ"),
            ).group_by(subq.c.workflow_id)
        )
    ).all()

    success_count = 0
    wf_items = []
    for r in wf_rows:
        eff_succ = int(r.sig_succ if (r.sig_total or 0) > 0 else (r.call_succ or 0))
        success_count += eff_succ
        if r.workflow_id:
            c7 = float(r.cost_7d or 0.0)
            calls = int(r.llm_calls or 0)
            wf_items.append(
                {
                    "workflow_id": r.workflow_id,
                    "cost_7d": c7,
                    "llm_calls": calls,
                    "success_count": eff_succ,
                    "cost_per_success": (c7 / eff_succ) if eff_succ else None,
                    "turns_per_success": round(calls / eff_succ, 2) if eff_succ else None,
                }
            )
    wf_items.sort(key=lambda x: x["cost_7d"], reverse=True)

    # SQL GROUP BY (model, provider) for model breakdown & quantization/host drift detection
    host_rows = (
        await db.execute(
            select(
                subq.c.model,
                subq.c.provider,
                func.coalesce(func.sum(subq.c.cost), 0.0).label("cost"),
                func.count().label("calls"),
                func.coalesce(func.sum(case((is_billed_fail, subq.c.cost), else_=0.0)), 0.0).label("unfulfilled"),
                func.coalesce(func.sum(case((subq.c.retry_count > 0, 1), else_=0)), 0).label("retries"),
            )
            .where(is_llm)
            .group_by(subq.c.model, subq.c.provider)
        )
    ).all()

    model_costs: dict[str, float] = defaultdict(float)
    host_quality = []
    for hr in host_rows:
        m_name = hr.model or "unknown"
        model_costs[m_name] += float(hr.cost or 0.0)
        calls_n = int(hr.calls or 0)
        host_quality.append(
            {
                "model": m_name,
                "provider": hr.provider or "unknown",
                "calls": calls_n,
                "unfulfilled_spend": round(float(hr.unfulfilled or 0.0), 4),
                "retry_rate": round((int(hr.retries or 0) / calls_n) * 100, 2) if calls_n else 0.0,
            }
        )
    host_quality.sort(key=lambda x: x["unfulfilled_spend"], reverse=True)

    recoverable_failures = failure_cnt + billed_fail_cnt
    recovery_rate = (recovered_cnt / recoverable_failures * 100) if recoverable_failures else 0.0

    return {
        "total_spend_7d": total_cost,
        "llm_spend_7d": llm_cost,
        "total_events": total_events,
        "success_rate": (success_count / max(llm_calls, 1) * 100) if total_events else 0,
        "success_count": success_count,
        "failure_count": failure_cnt,
        "retry_rate": (retry_cnt / max(llm_calls, 1) * 100) if llm_calls else 0,
        "retry_event_count": retry_cnt,
        "cost_per_successful_outcome": (llm_cost / success_count) if success_count else None,
        "turns_per_success": round(llm_calls / success_count, 2) if success_count else None,
        "billed_but_failed_cost": round(billed_fail_cost, 4),
        "loss_avoided": round(max(0.0, loss_avoided), 4),
        "recovery_rate": round(recovery_rate, 2),
        "health_score": min(100, max(0, int(100 - (retry_cnt / max(llm_calls, 1) * 40)))),
        "model_breakdown": [
            {"model": m, "cost": c, "pct": (c / llm_cost * 100) if llm_cost else 0}
            for m, c in sorted(model_costs.items(), key=lambda x: x[1], reverse=True)
        ],
        "host_quality_breakdown": host_quality,
        "workflow_breakdown": wf_items[:10],
        "top_issues": [
            {
                "rank": 1,
                "name": "High retry rate",
                "severity": "MEDIUM" if retry_cnt < llm_calls * 0.2 else "HIGH",
                "cost_per_week": retry_cost,
            }
        ]
        if retry_cnt
        else [],
    }


@router.get("/projects")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """Projects the current user can access (for project selector)."""
    from src.api.jwt_context import resolve_accessible_project_ids

    project_ids = await resolve_accessible_project_ids(db, ctx)
    if not project_ids:
        return {"projects": []}
    rows = (
        await db.execute(select(Project).where(Project.id.in_(project_ids)))
    ).scalars().all()
    return {
        "projects": [{"id": p.id, "name": p.name, "org_id": p.org_id} for p in rows],
        "active_project_id": ctx.project_id,
    }


@router.get("/overview")
async def get_overview(
    project_id: Optional[str] = Query(None, description="Override JWT project scope"),
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    """Return SQL-aggregated dashboard overview metrics scoped to project."""
    try:
        from src.api.project_access import require_project_access

        if project_id:
            await require_project_access(db, ctx.email, project_id)
            base = select(LLMEvent).where(LLMEvent.project_id == project_id)
        else:
            base = await events_query_for_context(db, ctx)

        payload = await _compute_overview_sql(db, base)
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
                    "tenant_id": getattr(e, "tenant_id", None),
                    "input_tokens": e.input_tokens,
                    "output_tokens": e.output_tokens,
                    "reasoning_tokens": getattr(e, "reasoning_tokens", 0),
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
