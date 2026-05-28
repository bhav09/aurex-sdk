"""API Key model.

Two hash schemes coexist on the same table:
- Legacy `key_hash` (SHA-256 of the raw key) for keys minted before Phase 1.
- New `argon2_hash` + per-key `salt` for keys minted via /api/v1/keys.

`verify_api_key` falls through to whichever path is populated. Plaintext
secrets are never persisted.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    JSON,
    String,
)

from .llm_event import Base


class ApiKey(Base):
    """Database model for developer/SDK API keys."""

    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Identification (cheap lookup before expensive verify).
    prefix = Column(String, nullable=False, index=True)  # e.g. "aux_live", "ax_live_"
    last4 = Column(String(4), nullable=True)

    # Legacy: SHA-256 hash of raw key (for keys created before Phase 1).
    key_hash = Column(String, unique=True, nullable=True, index=True)

    # New: Argon2id hash with per-key salt.
    argon2_hash = Column(String, nullable=True)
    salt = Column(String, nullable=True)

    # Metadata.
    name = Column(String, nullable=False)
    owner_email = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=False, index=True)

    # Project scoping (Phase 1 — nullable for legacy rows).
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    environment = Column(String, nullable=True)  # dev|staging|prod
    scopes = Column(JSON, nullable=True)  # list[str]
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Lifecycle.
    is_active = Column(Boolean, default=True, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    rotation_grace_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    last_used_at = Column(DateTime, nullable=True)

    @staticmethod
    def hash_key(raw_key: str) -> str:
        """Legacy SHA-256 hash."""
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def __repr__(self) -> str:
        return f"<ApiKey(id={self.id}, prefix={self.prefix}, name={self.name}, active={self.is_active})>"


class KeyAuditLog(Base):
    """Append-only audit trail for API key lifecycle events."""

    __tablename__ = "key_audit_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key_id = Column(String, ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)  # created|revoked|rotated|used
    actor_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    meta = Column(JSON, nullable=True)
    at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


# Pydantic shapes


class ApiKeyCreate(BaseModel):
    """Request model for the legacy /auth/api-keys endpoint."""

    name: str
    company_name: str


class ApiKeyCreateV1(BaseModel):
    """Request model for /api/v1/keys (project-scoped, Argon2id)."""

    name: str
    project_id: str
    environment: str
    scopes: Optional[List[str]] = None


class ApiKeyGeneratedResponse(BaseModel):
    """Response containing the plaintext key (only returned once at creation)."""

    id: str
    key: str
    prefix: str
    name: str
    company_name: str = ""
    is_active: bool = True
    created_at: datetime
    project_id: Optional[str] = None
    environment: Optional[str] = None
    scopes: Optional[List[str]] = None

    class Config:
        from_attributes = True


class ApiKeyResponse(BaseModel):
    """Metadata-only response for listing keys."""

    id: str
    prefix: str
    last4: Optional[str] = None
    name: str
    company_name: str = ""
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None
    project_id: Optional[str] = None
    environment: Optional[str] = None
    scopes: Optional[List[str]] = None
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True
