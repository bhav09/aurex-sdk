"""Tenancy models: User, Organization, Project, Membership.

These power project-scoped API keys and per-project ledger ingest. Existing
LLMEvent/AuditSession email + company_name fields are kept for backwards
compatibility; new SDK ingests link via Project.id instead.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .llm_event import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Environment(str, enum.Enum):
    DEV = "dev"
    STAGING = "staging"
    PROD = "prod"


class Role(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("org_id", "name", "environment", name="uq_project_org_name_env"),
    )

    id = Column(String, primary_key=True, default=_uuid)
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    environment = Column(SAEnum(Environment, name="environment"), nullable=False, default=Environment.DEV)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    organization = relationship("Organization", back_populates="projects")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", name="uq_membership_user_org"),
    )

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(SAEnum(Role, name="role"), nullable=False, default=Role.OWNER)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")


# Pydantic shapes used by API responses.

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None

    class Config:
        from_attributes = True


class OrganizationResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: str
    org_id: str
    name: str
    environment: Environment

    class Config:
        from_attributes = True


class MembershipResponse(BaseModel):
    id: str
    user_id: str
    org_id: str
    role: Role

    class Config:
        from_attributes = True


class OnboardingResponse(BaseModel):
    user: UserResponse
    organization: OrganizationResponse
    default_project: ProjectResponse
    memberships: List[MembershipResponse]
