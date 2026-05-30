"""Project membership checks shared by routes and dashboard."""

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.models import Membership, Project, User


async def require_project_access(db: AsyncSession, email: str, project_id: str) -> Project:
    user = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=403, detail="User not found")
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    membership = (await db.execute(
        select(Membership).where(Membership.user_id == user.id, Membership.org_id == project.org_id)
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this project's org")
    return project
