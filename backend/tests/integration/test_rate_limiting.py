import pytest
from httpx import AsyncClient
from main import app
import redis.asyncio as redis

class TestRateLimiting:
    @pytest.mark.asyncio
    async def test_health_check_rate_limit(self, client: AsyncClient):
        # Clear redis first to ensure a clean slate
        r = redis.from_url("redis://localhost:6379/0")
        await r.flushdb()
        
        # The limit is 100 per minute
        # We will make 100 successful requests
        for i in range(100):
            response = await client.get("/health")
            # Usually slowapi uses IP address for rate limiting, TestClient provides a default "testclient" IP
            assert response.status_code == 200, f"Request {i+1} failed with status {response.status_code}"
            
        # The 101st request should be rate limited
        response = await client.get("/health")
        assert response.status_code == 429
        assert "Rate limit exceeded" in response.text or response.status_code == 429
        
        # Clean up
        await r.flushdb()
