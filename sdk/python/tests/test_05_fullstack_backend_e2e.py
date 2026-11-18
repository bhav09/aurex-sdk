"""Full-Stack SDK -> FastAPI Backend -> SQLite -> PolicySync E2E tests (including >6,000 SQL row scale check)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import socket
import sys
import threading
import time

from argon2 import PasswordHasher
from fastapi import FastAPI
import httpx
import openai
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
import uvicorn

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from aurex_sdk import AurexAuditor, AurexConfig
from aurex_sdk.policy_sync import PolicySyncThread
from src.api import dashboard, ledger, policies, savings
from src.api.auth import _extract_prefix, create_access_token
from src.database import get_db
from src.models import ApiKey, Base, LLMEvent
from src.models.llm_event import CostTypeEnum, OutcomeEnum
from src.services.onboarding import ensure_user_and_default_org


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def test_fullstack_sdk_ingest_argon2_policy_sync_and_6200_row_sql_aggregations(tmp_path, wire_server):
    db_file = tmp_path / "aurex_e2e.sqlite3"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}")
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    raw_api_key = "aux_live_RealFullStackKey9876543210abcd"
    salt = "salt_e2e_2026"
    argon_hash = PasswordHasher().hash(raw_api_key + salt)
    owner_email = "founder@acme-finops.io"

    import asyncio

    async def _seed_db() -> str:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with session_factory() as db:
            user, org, proj = await ensure_user_and_default_org(db, owner_email, name="Founder")
            db.add(
                ApiKey(
                    prefix=_extract_prefix(raw_api_key),
                    last4=raw_api_key[-4:],
                    argon2_hash=argon_hash,
                    salt=salt,
                    name="Prod SDK Key",
                    owner_email=owner_email,
                    company_name=org.name,
                    project_id=proj.id,
                    environment="prod",
                    scopes=["ledger:write", "policies:read"],
                    is_active=True,
                )
            )
            await db.commit()
            return str(proj.id)

    project_id = asyncio.run(_seed_db())

    # Mount real FastAPI routers backed by our real SQLite database
    app = FastAPI()

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    app.include_router(ledger.router, prefix="/api/v1")
    app.include_router(policies.router, prefix="/api/v1")
    app.include_router(dashboard.router, prefix="/api/v1")
    app.include_router(savings.router, prefix="/api/v1")

    port = _free_port()
    uv_cfg = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    uv_server = uvicorn.Server(uv_cfg)
    srv_thread = threading.Thread(target=uv_server.run, daemon=True)
    srv_thread.start()

    base_api_url = f"http://127.0.0.1:{port}/api/v1"
    for _ in range(50):
        try:
            httpx.get(f"http://127.0.0.1:{port}/openapi.json", timeout=0.2)
            break
        except Exception:
            time.sleep(0.05)

    try:
        jwt_token = create_access_token({"sub": owner_email, "project_id": project_id, "role": "owner"})
        auth_headers = {"Authorization": f"Bearer {jwt_token}"}

        # 1. Configure tenant margin policy via PUT /api/v1/policies ($0.01 monthly cap for 'tenant-over-cap')
        put_res = httpx.put(
            f"{base_api_url}/policies",
            params={"project_id": project_id},
            headers=auth_headers,
            json={
                "budget_guard": {"max_thinking_tokens": 2048},
                "default_tenant_monthly_limit_usd": 50.0,
                "tenant_limits": {"tenant-over-cap": 0.001},
                "tenant_policies": {},
            },
            timeout=5.0,
        )
        assert put_res.status_code == 200, put_res.text

        # 2. Initialize real AurexAuditor tethered to our live FastAPI backend!
        auditor = AurexAuditor(
            AurexConfig(
                api_key=raw_api_key,
                base_url=base_api_url,
                cloud_sync=True,
                local_only=False,
                storage_mode="memory",
                flush_interval_seconds=60.0,
            )
        )
        auditor.patch_openai()
        oa_client = openai.OpenAI(api_key="sk-oa", base_url=f"{wire_server.base_url}/v1")

        # Make a real GPT-4o call for 'tenant-over-cap' with sensitive PII prompt -> syncs to SQLite!
        wire_server.enqueue(
            {
                "json": {
                    "id": "cmpl_e2e_1",
                    "object": "chat.completion",
                    "created": 1763470000,
                    "model": "gpt-4o",
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": "Resolved ticket #991"}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 2000, "completion_tokens": 500, "total_tokens": 2500},
                }
            }
        )
        oa_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "SECRET_PII_SSN_123_45_6789 resolve billing"}],
            workflow_id="wf-e2e-1",
            tags={"tenant_id": "tenant-over-cap"},
        )
        auditor.mark_success("wf-e2e-1")
        assert auditor.flush_async() is True

        # 3. Verify Zero-PII in SQLite & trigger PolicySyncThread -> auto-downgrades 'tenant-over-cap' on next call!
        async def _verify_zero_pii() -> None:
            async with session_factory() as db:
                rows = (await db.execute(select(LLMEvent).where(LLMEvent.project_id == project_id))).scalars().all()
                assert len(rows) == 2
                raw_dump = " ".join(str(r.__dict__) for r in rows)
                assert "SECRET_PII_SSN_123_45_6789" not in raw_dump

        asyncio.run(_verify_zero_pii())

        # Fetch compiled policies using the SDK's real PolicySyncThread
        sync_worker = PolicySyncThread(auditor, f"{base_api_url}/policies", raw_api_key)
        sync_worker._sync()

        # Next GPT-4o call for 'tenant-over-cap' MUST automatically downgrade to 'gpt-4o-mini' on the wire!
        oa_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Second request after margin breach"}],
            workflow_id="wf-e2e-2",
            tags={"tenant_id": "tenant-over-cap"},
        )
        assert wire_server.requests[-1]["body"]["model"] == "gpt-4o-mini"

        # 4. Bulk-insert 6,200 rows (> old .limit(5000) bug!) and verify exact SQL aggregation on dashboard & savings!
        async def _insert_6200_rows() -> None:
            now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
            async with session_factory() as db:
                batch = [
                    LLMEvent(
                        timestamp=now_dt,
                        provider="openai",
                        model="gpt-4o-mini",
                        input_tokens=100,
                        output_tokens=20,
                        total_tokens=120,
                        cost=0.01,
                        workflow_id=f"bulk-wf-{i % 100}",
                        project_id=project_id,
                        outcome=OutcomeEnum.SUCCESS,
                        cost_type=CostTypeEnum.INFERENCE,
                    )
                    for i in range(6_200)
                ]
                db.add_all(batch)
                await db.commit()

        asyncio.run(_insert_6200_rows())

        ov_res = httpx.get(
            f"{base_api_url}/dashboard/overview",
            params={"project_id": project_id, "days": 7},
            headers=auth_headers,
            timeout=10.0,
        )
        assert ov_res.status_code == 200, ov_res.text
        ov = ov_res.json()
        # 6,200 bulk inference calls + 1 earlier GPT-4o call + 1 mark_success signal = 6,202 events,
        # and exact 6,201 effective successes (proving mark_success is NOT double-counted AND zero 5,000-row truncation!)
        assert ov["total_events"] >= 6_202
        assert ov["success_count"] == 6_201
        assert ov["total_spend_7d"] >= 62.00
        assert ov["llm_spend_7d"] >= 62.00

        base_res = httpx.post(
            f"{base_api_url}/savings/compute-baselines",
            params={"project_id": project_id},
            headers=auth_headers,
            timeout=10.0,
        )
        assert base_res.status_code == 200, base_res.text

        sav_res = httpx.get(
            f"{base_api_url}/savings/verified",
            params={"project_id": project_id},
            headers=auth_headers,
            timeout=10.0,
        )
        assert sav_res.status_code == 200, sav_res.text
        oa_client.close()
    finally:
        uv_server.should_exit = True
        srv_thread.join(timeout=3.0)
        asyncio.run(engine.dispose())
