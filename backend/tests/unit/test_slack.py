import pytest
import httpx
from unittest.mock import AsyncMock
from src.utils.slack import send_slack_alert


@pytest.mark.asyncio
async def test_send_slack_alert_empty_webhook():
    result = await send_slack_alert(
        webhook_url="",
        session_id="session-123",
        company_name="Test Corp",
        user_name="John Doe",
        email="john@test.com",
        credit_score=85,
        total_cost=100.0,
        wasted_cost=15.0,
        waste_percentage=15.0
    )
    assert result is False


@pytest.mark.asyncio
async def test_send_slack_alert_success(monkeypatch):
    mock_post = AsyncMock()
    mock_post.return_value.status_code = 200
    
    # We mock httpx.AsyncClient's post method
    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def post(self, url, json):
            return await mock_post(url, json=json)
            
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: MockClient())

    result = await send_slack_alert(
        webhook_url="https://hooks.slack.com/services/abc/123",
        session_id="session-123",
        company_name="Test Corp",
        user_name="John Doe",
        email="john@test.com",
        credit_score=85,
        total_cost=100.0,
        wasted_cost=15.0,
        waste_percentage=15.0,
        top_issues=[{"title": "System Prompt Waste", "severity": "HIGH", "weekly_cost": 25.0}]
    )
    
    assert result is True
    mock_post.assert_called_once()
    called_url, kwargs = mock_post.call_args
    assert called_url[0] == "https://hooks.slack.com/services/abc/123"
    
    payload = kwargs["json"]
    assert "blocks" in payload
    header_block = payload["blocks"][0]
    assert header_block["type"] == "header"
    assert "waste" in header_block["text"]["text"].lower() or "alert" in header_block["text"]["text"].lower()


@pytest.mark.asyncio
async def test_send_slack_alert_failure(monkeypatch):
    mock_post = AsyncMock()
    mock_post.return_value.status_code = 500
    mock_post.return_value.text = "Internal Server Error"
    
    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def post(self, url, json):
            return await mock_post(url, json=json)
            
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: MockClient())

    result = await send_slack_alert(
        webhook_url="https://hooks.slack.com/services/abc/123",
        session_id="session-123",
        company_name="Test Corp",
        user_name="John Doe",
        email="john@test.com",
        credit_score=85,
        total_cost=100.0,
        wasted_cost=15.0,
        waste_percentage=15.0
    )
    
    assert result is False


@pytest.mark.asyncio
async def test_send_slack_alert_exception(monkeypatch):
    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def post(self, url, json):
            raise httpx.RequestError("Connection failed")
            
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: MockClient())

    result = await send_slack_alert(
        webhook_url="https://hooks.slack.com/services/abc/123",
        session_id="session-123",
        company_name="Test Corp",
        user_name="John Doe",
        email="john@test.com",
        credit_score=85,
        total_cost=100.0,
        wasted_cost=15.0,
        waste_percentage=15.0
    )
    
    assert result is False
