"""First-login onboarding.

Both `/auth/verify-otp` and `/auth/google-login` call into this to ensure the
user has a User row, an Organization, a default Project, and an owner
Membership. Idempotent — re-runs return the existing tuple.
"""

from __future__ import annotations

from typing import Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.models import (
    Environment,
    Membership,
    Organization,
    Project,
    Role,
    User,
)


async def ensure_user_and_default_org(
    db: AsyncSession,
    email: str,
    name: Optional[str] = None,
) -> Tuple[User, Organization, Project]:
    """Return (user, org, default_project) — creating any missing pieces.

    `name` is used to seed the User row and the human-readable Organization
    name on first login. Subsequent logins are no-ops.
    """

    email = email.lower()

    # User
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    created_user = False
    if user is None:
        user = User(email=email, name=name or email.split("@")[0])
        db.add(user)
        await db.flush()
        created_user = True

    # Membership (any). If absent, create org + project + owner membership.
    membership = (
        await db.execute(select(Membership).where(Membership.user_id == user.id))
    ).scalar_one_or_none()

    if membership is None:
        org_name = (name or email.split("@")[0]) + "'s Org"
        org = Organization(name=org_name)
        db.add(org)
        await db.flush()

        project = Project(
            org_id=org.id,
            name="Default",
            environment=Environment.DEV,
        )
        db.add(project)
        await db.flush()

        membership = Membership(user_id=user.id, org_id=org.id, role=Role.OWNER)
        db.add(membership)
        await db.flush()

        await db.commit()
        return user, org, project

    # Existing membership — fetch its org and the org's first project as default.
    org = (
        await db.execute(select(Organization).where(Organization.id == membership.org_id))
    ).scalar_one()

    project = (
        await db.execute(
            select(Project)
            .where(Project.org_id == org.id)
            .order_by(Project.created_at.asc())
        )
    ).scalars().first()

    if project is None:
        project = Project(org_id=org.id, name="Default", environment=Environment.DEV)
        db.add(project)
        await db.flush()
        await db.commit()
    elif created_user:
        await db.commit()

    return user, org, project
