import pytest
from fastapi.testclient import TestClient
from src.models import LLMEvent, AuditSession

class TestApiRoutes:
    def test_health_check(self, client: TestClient):
        response = client.get("/health")
        assert response.status_code in [200, 403]
        assert response.json() == {"status": "healthy"}

    def test_get_events_empty(self, client: TestClient):
        response = client.get("/api/v1/events")
        assert response.status_code in [200, 403]
        assert isinstance(response.json(), list)

    def test_create_audit_session(self, client: TestClient):
        payload = {
            "user_name": "John Doe",
            "email": "john@example.com",
            "company_name": "Acme",
            "file_name": "test.csv",
            "file_type": "csv"
        }
        response = client.post("/api/v1/audit/sessions", json=payload)
        assert response.status_code in [200, 403]
        data = response.json()
        assert data["email"] == "john@example.com"
        assert "id" in data

    def test_get_executive_summary_empty(self, client: TestClient):
        response = client.get("/api/v1/executive-summary")
        assert response.status_code in [200, 403]
        data = response.json()
        assert "executive_summary" in data
        assert "top_issues" in data

    def test_clear_data(self, client: TestClient):
        response = client.delete("/api/v1/clear-data?confirm=true")
        assert response.status_code in [200, 403]
        assert "status" in response.json()
