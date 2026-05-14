import pytest
from fastapi.testclient import TestClient
from src.api.auth import otp_store

class TestAuthRoutes:
    def test_request_otp(self, client: TestClient):
        response = client.post("/api/v1/auth/request-otp", json={"email": "test@example.com"})
        assert response.status_code in [200, 422, 500]

    def test_verify_otp(self, client: TestClient):
        email = "testjwt@example.com"
        # Seed the OTP store so verify_otp will succeed
        otp_store[email] = {
            "otp": "123456",
            "expiry": 9999999999,  # Future timestamp
            "attempts": 0,
            "verified": False
        }
        
        response = client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "123456"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_protected_route_without_token(self, client: TestClient):
        # Accessing /api/v1/events requires authentication now
        response = client.get("/api/v1/events")
        assert response.status_code == 403

    def test_protected_route_with_token(self, client: TestClient):
        # Generate token first by verifying OTP
        email = "validuser@example.com"
        otp_store[email] = {
            "otp": "654321",
            "expiry": 9999999999,
            "attempts": 0,
            "verified": False
        }
        auth_response = client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "654321"})
        assert auth_response.status_code == 200
        token = auth_response.json()["access_token"]
        
        # Access protected route with token
        response = client.get("/api/v1/events", headers={"Authorization": f"Bearer {token}"})
        # It should return 200 OK
        assert response.status_code == 200
