"""Read-only projects endpoint, used by the API-keys UI to populate the project dropdown."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.auth import get_current_user
from src.database import get_db
from src.models import Membership, Project, ProjectResponse, User

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ProjectResponse]:
    user = (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    org_ids = [
        m.org_id
        for m in (
            await db.execute(select(Membership).where(Membership.user_id == user.id))
        ).scalars().all()
    ]
    if not org_ids:
        return []

    projects = (
        await db.execute(
            select(Project).where(Project.org_id.in_(org_ids)).order_by(Project.created_at.asc())
        )
    ).scalars().all()
    return [ProjectResponse.model_validate(p) for p in projects]
