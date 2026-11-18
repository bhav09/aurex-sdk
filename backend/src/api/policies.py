"""GET/PUT /api/v1/policies — Cloud policy sync & tenant margin guardrails."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.auth import _verify_api_key_obj
from src.api.jwt_context import decode_token_payload
from src.api.project_access import require_project_access
from src.database import get_db
from src.models import AlertRule, LLMEvent, PricingOverride, Project
from src.models.llm_event import CostTypeEnum

router = APIRouter(prefix="/policies", tags=["policies"])
_bearer = HTTPBearer(auto_error=False)


class PolicyUpdatePayload(BaseModel):
    budget_guard: Dict[str, Any] = Field(default_factory=dict)
    default_tenant_monthly_limit_usd: Optional[float] = None
    tenant_limits: Dict[str, float] = Field(default_factory=dict)
    tenant_policies: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


async def _resolve_policy_project_id(
    project_id: Optional[str],
    credentials: Optional[HTTPAuthorizationCredentials],
    db: AsyncSession,
) -> str:
    """Resolve project_id from either SDK API key (`aux_...`) or Dashboard JWT."""
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    token = credentials.credentials
    # 1. Try JWT first for dashboard users
    try:
        payload = decode_token_payload(token)
        email = payload.get("sub")
        pid = project_id or payload.get("project_id")
        if email and pid:
            await require_project_access(db, email, pid)
            return pid
    except HTTPException as exc:
        if exc.status_code == 403:
            raise

    # 2. Fall back to SDK API key (`Bearer aux_...`)
    key_obj = await _verify_api_key_obj(credentials, db)
    if not key_obj.project_id:
        raise HTTPException(status_code=400, detail="API key is not bound to a project")
    return key_obj.project_id


@router.get("")
async def get_policies(
    project_id: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Return compiled pricing overrides, budget guard, and tenant margin policies."""
    pid = await _resolve_policy_project_id(project_id, credentials, db)
    project_tag = f"project:{pid}"

    proj = (await db.execute(select(Project).where(Project.id == pid))).scalar_one_or_none()
    company_keys = [project_tag]
    if proj and proj.name:
        company_keys.append(proj.name)

    override_rows = (
        await db.execute(select(PricingOverride).where(PricingOverride.company_name.in_(company_keys)))
    ).scalars().all()
    pricing = {
        r.model_name: {"input": r.input_price_per_1m, "output": r.output_price_per_1m}
        for r in override_rows
    }

    rule_row = (
        await db.execute(
            select(AlertRule).where(
                AlertRule.company_name == project_tag,
                AlertRule.trigger_type == "policy_config",
                AlertRule.enabled == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    stored_cfg = (rule_row.channel_config if rule_row and isinstance(rule_row.channel_config, dict) else {}) or {}

    budget_guard = dict(stored_cfg.get("budget_guard") or {})
    default_tenant_limit = stored_cfg.get("default_tenant_monthly_limit_usd")
    tenant_limits: Dict[str, float] = {
        str(k): float(v) for k, v in (stored_cfg.get("tenant_limits") or {}).items()
    }
    tenant_policies: Dict[str, Dict[str, Any]] = dict(stored_cfg.get("tenant_policies") or {})

    # Compute 30-day spend per tenant in SQL to enforce tenant margin guardrails automatically
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    tenant_rows = (
        await db.execute(
            select(LLMEvent.tenant_id, func.coalesce(func.sum(LLMEvent.cost), 0.0))
            .where(
                LLMEvent.project_id == pid,
                LLMEvent.tenant_id.isnot(None),
                LLMEvent.timestamp >= thirty_days_ago,
                LLMEvent.cost_type != CostTypeEnum.OUTCOME_SIGNAL,
            )
            .group_by(LLMEvent.tenant_id)
        )
    ).all()

    for tid, monthly_spend in tenant_rows:
        if not tid:
            continue
        spend_val = round(float(monthly_spend or 0.0), 4)
        limit_val = tenant_limits.get(tid, default_tenant_limit)
        if limit_val is not None and spend_val >= float(limit_val) and tid not in tenant_policies:
            tenant_policies[tid] = {
                "action": "downgrade",
                "monthly_spend_usd": spend_val,
                "monthly_limit_usd": float(limit_val),
            }

    return {
        "project_id": pid,
        "pricing": pricing,
        "budget_guard": budget_guard,
        "tenant_policies": tenant_policies,
    }


@router.put("")
async def put_policies(
    body: PolicyUpdatePayload,
    project_id: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Upsert lightweight project policy config using existing AlertRule JSON storage."""
    pid = await _resolve_policy_project_id(project_id, credentials, db)
    project_tag = f"project:{pid}"
    rule_row = (
        await db.execute(
            select(AlertRule).where(
                AlertRule.company_name == project_tag,
                AlertRule.trigger_type == "policy_config",
            )
        )
    ).scalar_one_or_none()

    cfg = body.model_dump()
    if rule_row is None:
        rule_row = AlertRule(
            company_name=project_tag,
            trigger_type="policy_config",
            threshold=body.default_tenant_monthly_limit_usd,
            channel="sdk",
            channel_config=cfg,
            enabled=True,
        )
        db.add(rule_row)
    else:
        rule_row.threshold = body.default_tenant_monthly_limit_usd
        rule_row.channel_config = cfg
        rule_row.enabled = True
    await db.commit()
    return {"status": "updated", "project_id": pid, "policy": cfg}
