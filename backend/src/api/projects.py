"""Tenancy management endpoints for projects and organizations."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.auth import get_current_user
from src.database import get_db
from src.models import Membership, Project, ProjectResponse, User, Organization, Environment, Role

router = APIRouter(prefix="", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    environment: Environment = Environment.DEV


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    environment: Optional[Environment] = None
    slack_webhook_url: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


@router.get("/projects", response_model=List[ProjectResponse])
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


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    user = (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Get the user's first organization
    membership = (
        await db.execute(select(Membership).where(Membership.user_id == user.id))
    ).scalars().first()

    if not membership:
        # If no organization exists, create one
        org = Organization(name=f"{user.name or email.split('@')[0]}'s Org")
        db.add(org)
        await db.flush()
        membership = Membership(user_id=user.id, org_id=org.id, role=Role.OWNER)
        db.add(membership)
        await db.flush()
    
    org_id = membership.org_id

    # Check for duplicate project in this org
    existing = (
        await db.execute(
            select(Project).where(
                Project.org_id == org_id,
                Project.name == body.name,
                Project.environment == body.environment,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Project with this name and environment already exists in organization")

    project = Project(
        org_id=org_id,
        name=body.name,
        environment=body.environment,
    )
    db.add(project)
    await db.flush()
    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    user = (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify user is a member of this project's organization
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.org_id == project.org_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")

    if body.name is not None:
        project.name = body.name
    if body.environment is not None:
        project.environment = body.environment
    if body.slack_webhook_url is not None:
        project.slack_webhook_url = body.slack_webhook_url

    await db.flush()
    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.patch("/organizations/{org_id}", status_code=200)
async def update_organization(
    org_id: str,
    body: OrganizationUpdate,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify membership and OWNER or ADMIN role
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.org_id == org_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied")
    if membership.role not in [Role.OWNER, Role.ADMIN]:
        raise HTTPException(status_code=403, detail="Only owners and admins can rename organizations")

    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.name = body.name
    await db.flush()
    await db.commit()
    await db.refresh(org)

    return {"status": "success", "id": org.id, "name": org.name}

