"""Integration tests for project-scoped dashboard endpoints:
GET /api/v1/stats?project_id=...
GET /api/v1/events?project_id=...
GET /api/v1/workflows?project_id=...
"""

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import create_access_token
from src.models import LLMEvent
from src.models.tenancy import Membership, Organization, Project, Role, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uid() -> str:
    return str(uuid.uuid4())


def _make_user(email: str) -> User:
    return User(id=_uid(), email=email, name="Test User")


def _make_org(name: str = "Test Org") -> Organization:
    return Organization(id=_uid(), name=name)


def _make_project(org_id: str, name: str = "default", env: str = "dev") -> Project:
    return Project(id=_uid(), org_id=org_id, name=name, environment=env)


def _make_membership(user_id: str, org_id: str) -> Membership:
    return Membership(id=_uid(), user_id=user_id, org_id=org_id, role=Role.OWNER)


def _make_event(project_id: str, model: str = "gpt-4o", cost: float = 0.01,
                workflow_id: str = "wf-1", hours_ago: float = 1.0) -> LLMEvent:
    return LLMEvent(
        id=_uid(),
        project_id=project_id,
        timestamp=datetime.utcnow() - timedelta(hours=hours_ago),
        provider="openai",
        model=model,
        workflow_id=workflow_id,
        input_tokens=100,
        output_tokens=50,
        total_tokens=150,
        cost=cost,
        context_length=100,
    )


def _auth(email: str) -> dict:
    token = create_access_token(data={"sub": email})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests: /stats
# ---------------------------------------------------------------------------

class TestProjectStats:
    async def test_unauthenticated_returns_403(self, client: AsyncClient):
        r = await client.get("/api/v1/stats")
        assert r.status_code == 403

    async def test_no_project_id_no_sessions_returns_empty(self, client: AsyncClient):
        r = await client.get("/api/v1/stats", headers=_auth("nodata@test.com"))
        assert r.status_code == 200
        data = r.json()
        assert data["total_events"] == 0
        assert data["total_cost"] == 0

    async def test_project_id_not_found_returns_404(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/stats?project_id=nonexistent-id",
            headers=_auth("ghost@test.com")
        )
        assert r.status_code in (403, 404)

    async def test_project_id_no_membership_returns_403(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        org = _make_org()
        project = _make_project(org.id)
        db_session.add_all([org, project])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/stats?project_id={project.id}",
            headers=_auth("outsider@test.com")
        )
        assert r.status_code == 403

    async def test_project_id_with_membership_and_events_returns_correct_stats(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "owner@test.com"
        user = _make_user(email)
        org = _make_org()
        project = _make_project(org.id)
        membership = _make_membership(user.id, org.id)
        events = [
            _make_event(project.id, model="gpt-4o", cost=0.10, hours_ago=1),
            _make_event(project.id, model="gpt-4o-mini", cost=0.02, hours_ago=2),
            _make_event(project.id, model="gpt-4o", cost=0.05, hours_ago=10),
        ]
        db_session.add_all([user, org, project, membership, *events])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/stats?project_id={project.id}",
            headers=_auth(email)
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total_events"] == 3
        assert abs(data["total_cost"] - 0.17) < 0.001
        assert data["unique_models"] == 2
        assert len(data["top_models"]) > 0
        # gpt-4o should be the top model (0.15 total)
        assert data["top_models"][0]["model"] == "gpt-4o"
        assert abs(data["top_models"][0]["cost"] - 0.15) < 0.001

    async def test_spend_7d_excludes_old_events(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "spend7d@test.com"
        user = _make_user(email)
        org = _make_org()
        project = _make_project(org.id, "spend-test")
        membership = _make_membership(user.id, org.id)
        recent = _make_event(project.id, cost=0.10, hours_ago=2)
        old = _make_event(project.id, cost=1.00, hours_ago=24 * 10)  # 10 days ago
        db_session.add_all([user, org, project, membership, recent, old])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/stats?project_id={project.id}",
            headers=_auth(email)
        )
        assert r.status_code == 200
        data = r.json()
        assert abs(data["spend_7d"] - 0.10) < 0.001
        assert abs(data["total_cost"] - 1.10) < 0.001

    async def test_project_isolation_different_projects(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "iso@test.com"
        user = _make_user(email)
        org = _make_org()
        proj_a = _make_project(org.id, "proj-a")
        proj_b = _make_project(org.id, "proj-b")
        membership = _make_membership(user.id, org.id)
        ev_a = _make_event(proj_a.id, cost=0.50)
        ev_b = _make_event(proj_b.id, cost=0.99)
        db_session.add_all([user, org, proj_a, proj_b, membership, ev_a, ev_b])
        await db_session.commit()

        r_a = await client.get(f"/api/v1/stats?project_id={proj_a.id}", headers=_auth(email))
        r_b = await client.get(f"/api/v1/stats?project_id={proj_b.id}", headers=_auth(email))
        assert r_a.status_code == 200
        assert r_b.status_code == 200
        assert abs(r_a.json()["total_cost"] - 0.50) < 0.001
        assert abs(r_b.json()["total_cost"] - 0.99) < 0.001


# ---------------------------------------------------------------------------
# Tests: /events
# ---------------------------------------------------------------------------

class TestProjectEvents:
    async def test_unauthenticated_returns_403(self, client: AsyncClient):
        r = await client.get("/api/v1/events")
        assert r.status_code == 403

    async def test_project_id_no_membership_returns_403(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        org = _make_org("ev-org")
        project = _make_project(org.id, "ev-proj")
        db_session.add_all([org, project])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/events?project_id={project.id}",
            headers=_auth("noauth@test.com")
        )
        assert r.status_code == 403

    async def test_project_id_returns_scoped_events(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "evowner@test.com"
        user = _make_user(email)
        org = _make_org("ev-org2")
        project = _make_project(org.id, "ev-proj2")
        other_project = _make_project(org.id, "other-proj")
        membership = _make_membership(user.id, org.id)
        ev1 = _make_event(project.id, model="claude-3-5-sonnet")
        ev2 = _make_event(project.id, model="claude-3-haiku")
        ev_other = _make_event(other_project.id, model="gpt-4o")
        db_session.add_all([user, org, project, other_project, membership, ev1, ev2, ev_other])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/events?project_id={project.id}&limit=50",
            headers=_auth(email)
        )
        assert r.status_code == 200
        events = r.json()
        assert len(events) == 2
        returned_models = {e["model"] for e in events}
        assert returned_models == {"claude-3-5-sonnet", "claude-3-haiku"}

    async def test_events_ordered_by_timestamp_desc(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "order@test.com"
        user = _make_user(email)
        org = _make_org("order-org")
        project = _make_project(org.id, "order-proj")
        membership = _make_membership(user.id, org.id)
        early = _make_event(project.id, hours_ago=5)
        late = _make_event(project.id, hours_ago=1)
        db_session.add_all([user, org, project, membership, early, late])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/events?project_id={project.id}",
            headers=_auth(email)
        )
        assert r.status_code == 200
        events = r.json()
        assert len(events) == 2
        t0 = events[0]["timestamp"]
        t1 = events[1]["timestamp"]
        assert t0 >= t1


# ---------------------------------------------------------------------------
# Tests: /workflows
# ---------------------------------------------------------------------------

class TestProjectWorkflows:
    async def test_unauthenticated_returns_403(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows")
        assert r.status_code == 403

    async def test_project_id_no_membership_returns_403(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        org = _make_org("wf-org")
        project = _make_project(org.id, "wf-proj")
        db_session.add_all([org, project])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/workflows?project_id={project.id}",
            headers=_auth("wfnoauth@test.com")
        )
        assert r.status_code == 403

    async def test_project_id_returns_aggregated_workflows(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "wfowner@test.com"
        user = _make_user(email)
        org = _make_org("wf-org2")
        project = _make_project(org.id, "wf-proj2")
        membership = _make_membership(user.id, org.id)
        ev1 = _make_event(project.id, workflow_id="wf-alpha", cost=0.10)
        ev2 = _make_event(project.id, workflow_id="wf-alpha", cost=0.05)
        ev3 = _make_event(project.id, workflow_id="wf-beta", cost=0.20)
        db_session.add_all([user, org, project, membership, ev1, ev2, ev3])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/workflows?project_id={project.id}",
            headers=_auth(email)
        )
        assert r.status_code == 200
        workflows = r.json()
        assert len(workflows) == 2
        by_id = {w["workflow_id"]: w for w in workflows}
        assert "wf-alpha" in by_id
        assert "wf-beta" in by_id
        assert by_id["wf-alpha"]["event_count"] == 2
        assert abs(by_id["wf-alpha"]["total_cost"] - 0.15) < 0.001
        assert by_id["wf-beta"]["event_count"] == 1

    async def test_workflows_ordered_by_cost_desc(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        email = "wford@test.com"
        user = _make_user(email)
        org = _make_org("wford-org")
        project = _make_project(org.id, "wford-proj")
        membership = _make_membership(user.id, org.id)
        cheap = _make_event(project.id, workflow_id="cheap", cost=0.01)
        expensive = _make_event(project.id, workflow_id="expensive", cost=1.00)
        db_session.add_all([user, org, project, membership, cheap, expensive])
        await db_session.commit()

        r = await client.get(
            f"/api/v1/workflows?project_id={project.id}",
            headers=_auth(email)
        )
        assert r.status_code == 200
        workflows = r.json()
        assert workflows[0]["workflow_id"] == "expensive"
