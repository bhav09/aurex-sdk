"""POST /api/v1/ledger/events — API-key authenticated ledger ingest.

Project is derived from the API key, never from the request body. Requires
the key to carry the `ledger:write` scope (legacy keys without `scopes`
populated are grandfathered in).
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import require_api_key_scope
from src.database import get_db
from src.services.ledger import ingest_events
from src.utils.limiter import limiter
from src.utils.logger import get_logger

router = APIRouter(prefix="/ledger", tags=["ledger"])
logger = get_logger(__name__)


def _ledger_ingest_rate_limit_key(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
        if token.startswith(("aux_", "ax_live_", "aurex_")):
            return f"apikey:{token[:12]}"
    return get_remote_address(request)


class LedgerEventBatch(BaseModel):
    events: List[Dict[str, Any]]


@limiter.limit("600/minute", key_func=_ledger_ingest_rate_limit_key)
@router.post("/events")
async def post_ledger_events(
    request: Request,
    body: LedgerEventBatch,
    db: AsyncSession = Depends(get_db),
    api_key=Depends(require_api_key_scope("ledger:write")),
):
    if not body.events:
        raise HTTPException(status_code=400, detail="No events provided")
    if len(body.events) > 500:
        raise HTTPException(status_code=400, detail="Batch too large; max 500 events")

    if api_key.project_id is None:
        raise HTTPException(
            status_code=400,
            detail="API key is not bound to a project. Recreate the key under /api/v1/keys.",
        )

    result = await ingest_events(
        db,
        body.events,
        project_id=api_key.project_id,
        owner_email=api_key.owner_email,
    )
    return {"accepted": result.accepted, "rejected": result.rejected}
