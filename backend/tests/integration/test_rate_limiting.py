import pytest
from httpx import AsyncClient
from main import app

class TestRateLimiting:
    @pytest.mark.asyncio
    async def test_health_check_rate_limit(self, client: AsyncClient):
        # Reset slowapi limiter storage to ensure a clean slate
        if hasattr(app.state, "limiter") and hasattr(app.state.limiter, "_storage"):
            app.state.limiter._storage.reset()
        
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

        # Reset rate limiter storage to avoid polluting other tests
        if hasattr(app.state, "limiter") and hasattr(app.state.limiter, "_storage"):
            app.state.limiter._storage.reset()

