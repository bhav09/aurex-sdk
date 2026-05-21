import pytest
from httpx import AsyncClient
from src.models import LLMEvent, AuditSession
import json

class TestApiRoutes:
    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}

    @pytest.mark.asyncio
    async def test_get_events_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/events")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_create_audit_session(self, client: AsyncClient, monkeypatch):
        # Mock redis_client.get to return a verified OTP
        async def mock_get(*args, **kwargs):
            return json.dumps({"verified": True})
        
        from src.api.auth import redis_client
        monkeypatch.setattr(redis_client, "get", mock_get)
        
        payload = {
            "user_name": "John Doe",
            "email": "john@example.com",
            "company_name": "Acme",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        response = await client.post("/api/v1/audit/sessions", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "john@example.com"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_get_executive_summary_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/executive-summary")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_clear_data(self, client: AsyncClient):
        response = await client.delete("/api/v1/clear-data?confirm=true")
        assert response.status_code == 403
        assert "detail" in response.json()
        assert response.json()["detail"] == "Disabled in production"

    @pytest.mark.asyncio
    async def test_create_audit_session_with_jwt_bypasses_otp(self, client: AsyncClient, monkeypatch):
        from src.api.auth import create_access_token, redis_client
        
        async def mock_get(*args, **kwargs):
            return None
        monkeypatch.setattr(redis_client, "get", mock_get)
        
        email = "session_user@example.com"
        token = create_access_token(data={"sub": email})
        
        payload = {
            "user_name": "Session User",
            "email": email,
            "company_name": "Session Corp",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post("/api/v1/audit/sessions", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == email
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_audit_session_with_jwt_mismatched_email_fails(self, client: AsyncClient, monkeypatch):
        from src.api.auth import create_access_token
        email = "session_user@example.com"
        token = create_access_token(data={"sub": email})
        
        payload = {
            "user_name": "Other User",
            "email": "other_user@example.com",
            "company_name": "Other Corp",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post("/api/v1/audit/sessions", json=payload, headers=headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_auth_session_endpoint(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "session_user@example.com"
        token = create_access_token(data={"sub": email})
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.get("/api/v1/auth/session", headers=headers)
        assert response.status_code == 200
        assert response.json()["email"] == email
        assert response.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_auth_session_endpoint_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/session")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_csv(self, client: AsyncClient):
        from src.api.auth import create_access_token
        email = "uploader@example.com"
        token = create_access_token(data={"sub": email})
        
        csv_content = (
            "timestamp,model,prompt_tokens,completion_tokens,cost\n"
            "2026-05-21T10:00:00Z,gpt-4o,100,50,0.015\n"
            "2026-05-21T10:05:00Z,claude-3-5-sonnet,200,100,0.03\n"
        )
        
        files = {
            "file": ("test_upload.csv", csv_content, "text/csv")
        }
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await client.post(
            "/api/v1/upload/csv?session_id=mock-session-id",
            files=files,
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["events_ingested"] == 2
        assert data["upload_session_id"] == "mock-session-id"

    @pytest.mark.asyncio
    async def test_track_click(self, client: AsyncClient):
        payload = {
            "button_id": "test_cta_button",
            "email": "test@example.com",
            "session_id": "session-123"
        }
        response = await client.post("/api/v1/analytics/click", json=payload)
        assert response.status_code == 200
        assert response.json() == {"status": "success"}

