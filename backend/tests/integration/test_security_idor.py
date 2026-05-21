import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, UTC

from main import app
from src.api.auth import get_current_user
from src.models import AuditSession, LLMEvent

@pytest_asyncio.fixture
async def setup_users_data(db_session: AsyncSession):
    # Seed data for User A
    session_a = AuditSession(
        id="session_a_123",
        user_name="User A",
        email="user_a@example.com",
        company_name="Company A",
        analysis_results={"total_events": 1, "executive_summary": {"current_weekly_spend": 1.0}},
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC)
    )
    event_a = LLMEvent(
        id="event_a_1",
        timestamp=datetime.now(UTC),
        provider="openai",
        model="gpt-4",
        cost=1.0,
        total_tokens=100,
        upload_session_id="session_a_123",
        workflow_id="wf_a"
    )
    
    # Seed data for User B
    session_b = AuditSession(
        id="session_b_456",
        user_name="User B",
        email="user_b@example.com",
        company_name="Company B",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC)
    )
    event_b = LLMEvent(
        id="event_b_1",
        timestamp=datetime.now(UTC),
        provider="anthropic",
        model="claude-3-opus",
        cost=2.0,
        total_tokens=200,
        upload_session_id="session_b_456",
        workflow_id="wf_b"
    )
    
    db_session.add(session_a)
    db_session.add(event_a)
    db_session.add(session_b)
    db_session.add(event_b)
    await db_session.flush()

class TestSecurityIDOR:
    @pytest.mark.asyncio
    async def test_user_a_data_access(self, client: AsyncClient, setup_users_data):
        # Override get_current_user to simulate User A
        app.dependency_overrides[get_current_user] = lambda: "user_a@example.com"
        
        # Test /events
        response = await client.get("/api/v1/events")
        assert response.status_code == 200
        events = response.json()
        assert len(events) == 1
        assert events[0]["model"] == "gpt-4"
        
        # Test /executive-summary
        response = await client.get("/api/v1/executive-summary?email=user_a@example.com")
        assert response.status_code == 200
        summary = response.json()
        assert summary["total_events"] == 1
        assert summary["executive_summary"]["current_weekly_spend"] == 1.0

        # Clear dependency override
        app.dependency_overrides.pop(get_current_user, None)

    @pytest.mark.asyncio
    async def test_idor_blocking_sessions(self, client: AsyncClient, setup_users_data):
        # User A tries to access User B's session
        app.dependency_overrides[get_current_user] = lambda: "user_a@example.com"
        
        response = await client.get("/api/v1/audit/sessions/session_b_456")
        assert response.status_code == 403
        assert response.json()["detail"] == "Not authorized to access this session"

        # Attempt to update User B's session as User A
        update_payload = {"total_cost": 999.0}
        response = await client.patch("/api/v1/audit/sessions/session_b_456", json=update_payload)
        assert response.status_code == 403
        assert response.json()["detail"] == "Not authorized to modify this session"

        # Clear dependency override
        app.dependency_overrides.pop(get_current_user, None)

    @pytest.mark.asyncio
    async def test_company_audit_access_enforcement(self, client: AsyncClient, setup_users_data):
        # User A accesses their own company data
        app.dependency_overrides[get_current_user] = lambda: "user_a@example.com"
        
        response = await client.get("/api/v1/audit/company/example.com")
        assert response.status_code == 200
        # Should be successful due to domain matching

        # User A attempts to access another domain/company they don't belong to
        response = await client.get("/api/v1/audit/company/otherdomain.com")
        assert response.status_code == 403
        assert response.json()["detail"] == "Not authorized to access company data"

        # Clear dependency override
        app.dependency_overrides.pop(get_current_user, None)
