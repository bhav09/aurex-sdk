"""JWT context helpers for project-scoped dashboard and routes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from src.api.project_access import require_project_access
from src.database import get_db
from src.models import AuditSession, Membership, Project

security = HTTPBearer()


@dataclass
class JwtContext:
    email: str
    project_id: Optional[str]
    org_id: Optional[str]
    role: Optional[str]


def decode_token_payload(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_jwt_context(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> JwtContext:
    payload = decode_token_payload(credentials.credentials)
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    project_id = payload.get("project_id")
    org_id = payload.get("org_id")
    role = payload.get("role")
    if project_id:
        await require_project_access(db, email, project_id)
    return JwtContext(email=email, project_id=project_id, org_id=org_id, role=role)


async def resolve_accessible_project_ids(db: AsyncSession, ctx: JwtContext) -> Optional[list[str]]:
    """Return project IDs the user may read. None means legacy email/session scope only."""
    if ctx.project_id:
        return [ctx.project_id]
    from src.models import User

    user = (await db.execute(select(User).where(User.email == ctx.email.lower()))).scalar_one_or_none()
    if not user:
        return []
    memberships = (
        await db.execute(select(Membership).where(Membership.user_id == user.id))
    ).scalars().all()
    if not memberships:
        return []
    org_ids = [m.org_id for m in memberships]
    projects = (
        await db.execute(select(Project.id).where(Project.org_id.in_(org_ids)))
    ).scalars().all()
    return list(projects)


async def events_query_for_context(db: AsyncSession, ctx: JwtContext):
    """Build a base LLMEvent select filtered by JWT project or legacy sessions."""
    from src.models import LLMEvent
    from sqlalchemy import func

    project_ids = await resolve_accessible_project_ids(db, ctx)
    if project_ids:
        return select(LLMEvent).where(LLMEvent.project_id.in_(project_ids))

    sessions_query = select(AuditSession.id).where(
        func.lower(AuditSession.email) == func.lower(ctx.email)
    )
    result = await db.execute(sessions_query)
    session_ids = [row[0] for row in result.all()]
    if not session_ids:
        return select(LLMEvent).where(False)
    return select(LLMEvent).where(LLMEvent.upload_session_id.in_(session_ids))
