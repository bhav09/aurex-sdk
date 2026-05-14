import pytest
from fastapi.testclient import TestClient
from main import app

class TestRateLimiting:
    def test_health_check_rate_limit(self, client: TestClient):
        # The limit is 100 per minute
        # We will make 100 successful requests
        for i in range(100):
            response = client.get("/health")
            # Usually slowapi uses IP address for rate limiting, TestClient provides a default "testclient" IP
            assert response.status_code == 200, f"Request {i+1} failed with status {response.status_code}"
            
        # The 101st request should be rate limited
        response = client.get("/health")
        assert response.status_code == 429
        assert "Rate limit exceeded" in response.text or response.status_code == 429
