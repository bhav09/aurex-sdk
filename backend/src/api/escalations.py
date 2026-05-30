"""Human-in-the-loop escalations (Slack)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.jwt_context import JwtContext, get_jwt_context
from src.api.project_access import require_project_access
from src.database import get_db
from src.models import Project
from src.utils.logger import get_logger
from src.utils.slack import send_escalation

router = APIRouter(prefix="/escalations", tags=["escalations"])
logger = get_logger(__name__)


class EscalationRequest(BaseModel):
    workflow_id: str
    cost_so_far: float = Field(ge=0)
    retry_count: int = Field(ge=0)
    loop_score: Optional[float] = Field(None, ge=0, le=1)
    project_id: Optional[str] = None
    reason: Optional[str] = None


@router.post("")
async def create_escalation(
    body: EscalationRequest,
    db: AsyncSession = Depends(get_db),
    ctx: JwtContext = Depends(get_jwt_context),
):
    project_id = body.project_id or ctx.project_id
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id required")
    await require_project_access(db, ctx.email, project_id)
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    webhook = project.slack_webhook_url
    if not webhook:
        logger.warning("No slack_webhook_url for project %s", project_id)
        return {"sent": False, "reason": "slack_not_configured"}

    ok = await send_escalation(
        webhook_url=webhook,
        workflow_id=body.workflow_id,
        cost_so_far=body.cost_so_far,
        retry_count=body.retry_count,
        project_id=project_id,
        loop_score=body.loop_score,
        reason=body.reason,
    )
    return {"sent": ok, "workflow_id": body.workflow_id}
