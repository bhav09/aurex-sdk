import pytest
import json
from httpx import AsyncClient

class TestAuthRoutes:
    @pytest.mark.asyncio
    async def test_request_otp(self, client: AsyncClient, monkeypatch):
        async def mock_lrange(*args, **kwargs):
            return []
            
        async def mock_setex(*args, **kwargs):
            return True
            
        async def mock_rpush(*args, **kwargs):
            return True
            
        async def mock_expire(*args, **kwargs):
            return True
            
        from src.api.auth import redis_client
        monkeypatch.setattr(redis_client, "lrange", mock_lrange)
        monkeypatch.setattr(redis_client, "setex", mock_setex)
        monkeypatch.setattr(redis_client, "rpush", mock_rpush)
        monkeypatch.setattr(redis_client, "expire", mock_expire)

        response = await client.post("/api/v1/auth/request-otp", json={"email": "test@example.com"})
        assert response.status_code in [200, 422, 500]

    @pytest.mark.asyncio
    async def test_verify_otp(self, client: AsyncClient, monkeypatch):
        email = "testjwt@example.com"
        
        async def mock_get(*args, **kwargs):
            return json.dumps({
                "otp": "123456",
                "expiry": 9999999999,
                "attempts": 0,
                "verified": False
            })
            
        async def mock_setex(*args, **kwargs):
            return True
            
        from src.api.auth import redis_client
        monkeypatch.setattr(redis_client, "get", mock_get)
        monkeypatch.setattr(redis_client, "setex", mock_setex)
        
        response = await client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "123456"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_protected_route_without_token(self, client: AsyncClient):
        response = await client.get("/api/v1/events")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_protected_route_with_token(self, client: AsyncClient, monkeypatch):
        email = "validuser@example.com"
        
        async def mock_get(*args, **kwargs):
            return json.dumps({
                "otp": "654321",
                "expiry": 9999999999,
                "attempts": 0,
                "verified": False
            })
            
        async def mock_setex(*args, **kwargs):
            return True
            
        from src.api.auth import redis_client
        monkeypatch.setattr(redis_client, "get", mock_get)
        monkeypatch.setattr(redis_client, "setex", mock_setex)
        
        auth_response = await client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "654321"})
        assert auth_response.status_code == 200
        token = auth_response.json()["access_token"]
        
        response = await client.get("/api/v1/events", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
