"""Project-scoped API key management.

Endpoints (all JWT-authenticated, mounted under `/api/v1/keys`):

- POST   /api/v1/keys              Create a new key (returns plaintext ONCE).
- GET    /api/v1/keys              List keys for the caller's projects.
- DELETE /api/v1/keys/{key_id}     Revoke a key (negative-cached in Redis).
- POST   /api/v1/keys/{key_id}/rotate    Mint a new secret, 24h grace on old.

Plaintext key format: ``aux_<env>_<32 urlsafe chars>``.
Hash: Argon2id over (secret + per-key salt). Salt and hash are stored;
plaintext is never persisted.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.api.auth import get_current_user
from src.database import get_db
from src.models import (
    ApiKey,
    ApiKeyGeneratedResponse,
    ApiKeyResponse,
    Environment,
    KeyAuditLog,
    Membership,
    Project,
    User,
)
from src.utils.logger import get_logger

router = APIRouter(prefix="/keys", tags=["api-keys-v1"])
logger = get_logger(__name__)

DEFAULT_SCOPES = ["ledger:write", "policy:read", "savings:write"]
ROTATION_GRACE_HOURS = 24


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #


def _generate_secret(env: str) -> tuple[str, str, str, str]:
    """Return (full_secret, prefix, last4, salt)."""
    env = env.lower()
    if env not in {e.value for e in Environment}:
        raise HTTPException(status_code=400, detail=f"Invalid environment: {env}")
    body = secrets.token_urlsafe(32)
    full = f"aux_{env}_{body}"
    prefix = full[:8]  # e.g. "aux_dev_" / "aux_pro_" — narrow lookup space
    last4 = full[-4:]
    salt = secrets.token_urlsafe(16)
    return full, prefix, last4, salt


def _argon2_hash(secret: str, salt: str) -> str:
    from argon2 import PasswordHasher
    return PasswordHasher().hash(secret + salt)


async def _resolve_caller(db: AsyncSession, email: str) -> User:
    user = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found. Re-authenticate to bootstrap your account.")
    return user


async def _user_can_access_project(db: AsyncSession, user_id: str, project_id: str) -> Optional[Project]:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if project is None:
        return None
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.org_id == project.org_id,
            )
        )
    ).scalar_one_or_none()
    return project if membership else None


async def _record_audit(
    db: AsyncSession,
    *,
    key_id: Optional[str],
    event_type: str,
    actor: User,
    request: Optional[Request] = None,
    meta: Optional[dict] = None,
) -> None:
    db.add(
        KeyAuditLog(
            key_id=key_id,
            event_type=event_type,
            actor_user_id=actor.id,
            actor_email=actor.email,
            ip=(request.client.host if request and request.client else None),
            meta=meta,
        )
    )


async def _push_revocation_cache(prefix: str, last4: str) -> None:
    """Negative cache so revoked keys are rejected across workers within ≤60s."""
    try:
        from src.api.auth import redis_client
        await redis_client.setex(f"revoked:{prefix}{last4}", 60 * 60 * 24, "1")
    except Exception as e:
        logger.warning("Failed to push revocation cache", error=str(e))


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    project_id: str
    environment: str
    scopes: Optional[List[str]] = None


@router.post("", response_model=ApiKeyGeneratedResponse, status_code=201)
async def create_key(
    body: CreateKeyRequest,
    request: Request,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyGeneratedResponse:
    user = await _resolve_caller(db, email)
    project = await _user_can_access_project(db, user.id, body.project_id)
    if project is None:
        raise HTTPException(status_code=403, detail="Project not found or access denied")

    full, prefix, last4, salt = _generate_secret(body.environment)
    argon2_hash = _argon2_hash(full, salt)
    scopes = body.scopes or DEFAULT_SCOPES

    api_key = ApiKey(
        prefix=prefix,
        last4=last4,
        argon2_hash=argon2_hash,
        salt=salt,
        name=body.name,
        owner_email=user.email,
        company_name="",  # company_name kept for legacy NOT NULL — populate empty for v1 keys
        project_id=project.id,
        environment=body.environment.lower(),
        scopes=scopes,
        created_by=user.id,
        is_active=True,
    )
    db.add(api_key)
    await db.flush()

    await _record_audit(
        db,
        key_id=api_key.id,
        event_type="created",
        actor=user,
        request=request,
        meta={"project_id": project.id, "environment": body.environment, "scopes": scopes},
    )

    await db.commit()
    await db.refresh(api_key)

    return ApiKeyGeneratedResponse(
        id=api_key.id,
        key=full,
        prefix=prefix,
        name=api_key.name,
        company_name=api_key.company_name or "",
        is_active=api_key.is_active,
        created_at=api_key.created_at,
        project_id=api_key.project_id,
        environment=api_key.environment,
        scopes=api_key.scopes,
    )


@router.get("", response_model=List[ApiKeyResponse])
async def list_keys(
    project_id: Optional[str] = None,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ApiKeyResponse]:
    user = await _resolve_caller(db, email)

    # All orgs the caller belongs to
    org_ids = [
        m.org_id
        for m in (
            await db.execute(select(Membership).where(Membership.user_id == user.id))
        ).scalars().all()
    ]
    if not org_ids:
        return []

    project_ids = [
        p.id
        for p in (
            await db.execute(select(Project).where(Project.org_id.in_(org_ids)))
        ).scalars().all()
    ]
    if project_id is not None:
        if project_id not in project_ids:
            raise HTTPException(status_code=403, detail="Project not accessible")
        project_ids = [project_id]

    if not project_ids:
        return []

    rows = (
        await db.execute(
            select(ApiKey)
            .where(ApiKey.project_id.in_(project_ids))
            .order_by(ApiKey.created_at.desc())
        )
    ).scalars().all()

    return [ApiKeyResponse.model_validate(r) for r in rows]


@router.delete("/{key_id}", status_code=204, response_class=None, response_model=None)
async def revoke_key(
    key_id: str,
    request: Request,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _resolve_caller(db, email)
    api_key = (await db.execute(select(ApiKey).where(ApiKey.id == key_id))).scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if api_key.project_id is None:
        # Legacy key without project scoping — fall back to owner_email.
        if api_key.owner_email != user.email:
            raise HTTPException(status_code=403, detail="Cannot revoke this key")
    else:
        project = await _user_can_access_project(db, user.id, api_key.project_id)
        if project is None:
            raise HTTPException(status_code=403, detail="Cannot revoke this key")

    api_key.revoked_at = datetime.utcnow()
    api_key.is_active = False
    await _record_audit(db, key_id=api_key.id, event_type="revoked", actor=user, request=request)
    await db.commit()

    if api_key.prefix and api_key.last4:
        await _push_revocation_cache(api_key.prefix, api_key.last4)


@router.post("/{key_id}/rotate", response_model=ApiKeyGeneratedResponse)
async def rotate_key(
    key_id: str,
    request: Request,
    email: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyGeneratedResponse:
    user = await _resolve_caller(db, email)
    old = (await db.execute(select(ApiKey).where(ApiKey.id == key_id))).scalar_one_or_none()
    if old is None:
        raise HTTPException(status_code=404, detail="API key not found")
    if old.project_id is None or not await _user_can_access_project(db, user.id, old.project_id):
        raise HTTPException(status_code=403, detail="Cannot rotate this key")

    env = old.environment or "dev"
    full, prefix, last4, salt = _generate_secret(env)
    argon2_hash = _argon2_hash(full, salt)

    new_key = ApiKey(
        prefix=prefix,
        last4=last4,
        argon2_hash=argon2_hash,
        salt=salt,
        name=f"{old.name} (rotated)",
        owner_email=old.owner_email,
        company_name=old.company_name or "",
        project_id=old.project_id,
        environment=env,
        scopes=old.scopes,
        created_by=user.id,
        is_active=True,
    )
    db.add(new_key)

    # Old key remains valid for ROTATION_GRACE_HOURS, then revoked.
    old.rotation_grace_until = datetime.utcnow() + timedelta(hours=ROTATION_GRACE_HOURS)
    old.revoked_at = datetime.utcnow() + timedelta(hours=ROTATION_GRACE_HOURS)

    await db.flush()
    await _record_audit(
        db,
        key_id=new_key.id,
        event_type="rotated",
        actor=user,
        request=request,
        meta={"old_key_id": old.id, "grace_hours": ROTATION_GRACE_HOURS},
    )
    await db.commit()
    await db.refresh(new_key)

    return ApiKeyGeneratedResponse(
        id=new_key.id,
        key=full,
        prefix=prefix,
        name=new_key.name,
        company_name=new_key.company_name or "",
        is_active=new_key.is_active,
        created_at=new_key.created_at,
        project_id=new_key.project_id,
        environment=new_key.environment,
        scopes=new_key.scopes,
    )
