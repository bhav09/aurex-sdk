import pytest
import httpx
from unittest.mock import AsyncMock
from src.integrations.crm import sync_lead_to_crm


@pytest.mark.asyncio
async def test_sync_lead_to_crm_no_env(monkeypatch):
    monkeypatch.delenv("CRM_WEBHOOK_URL", raising=False)
    result = await sync_lead_to_crm(
        email="test@lead.com",
        user_name="Lead User",
        company_name="Lead Corp",
        credit_score=90,
        waste_percentage=10.0,
        total_cost=200.0,
        wasted_cost=20.0,
        annual_savings=240.0
    )
    assert result is False


@pytest.mark.asyncio
async def test_sync_lead_to_crm_success(monkeypatch):
    monkeypatch.setenv("CRM_WEBHOOK_URL", "https://crm.endpoint.com/webhook")
    
    mock_post = AsyncMock()
    mock_post.return_value.status_code = 200
    
    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def post(self, url, json):
            return await mock_post(url, json=json)
            
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: MockClient())

    result = await sync_lead_to_crm(
        email="test@lead.com",
        user_name="Lead User",
        company_name="Lead Corp",
        credit_score=90,
        waste_percentage=10.0,
        total_cost=200.0,
        wasted_cost=20.0,
        annual_savings=240.0
    )
    
    assert result is True
    mock_post.assert_called_once()
    called_url, kwargs = mock_post.call_args
    assert called_url[0] == "https://crm.endpoint.com/webhook"
    
    payload = kwargs["json"]
    assert payload["email"] == "test@lead.com"
    assert payload["company_name"] == "Lead Corp"
    assert payload["credit_score"] == 90
    assert payload["annual_savings"] == 240.0


@pytest.mark.asyncio
async def test_sync_lead_to_crm_failure(monkeypatch):
    monkeypatch.setenv("CRM_WEBHOOK_URL", "https://crm.endpoint.com/webhook")
    
    mock_post = AsyncMock()
    mock_post.return_value.status_code = 500
    mock_post.return_value.text = "Error"
    
    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def post(self, url, json):
            return await mock_post(url, json=json)
            
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: MockClient())

    result = await sync_lead_to_crm(
        email="test@lead.com",
        user_name="Lead User",
        company_name="Lead Corp",
        credit_score=90,
        waste_percentage=10.0,
        total_cost=200.0,
        wasted_cost=20.0,
        annual_savings=240.0
    )
    
    assert result is False


@pytest.mark.asyncio
async def test_sync_lead_to_crm_exception(monkeypatch):
    monkeypatch.setenv("CRM_WEBHOOK_URL", "https://crm.endpoint.com/webhook")
    
    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def post(self, url, json):
            raise httpx.RequestError("Connection error")
            
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: MockClient())

    result = await sync_lead_to_crm(
        email="test@lead.com",
        user_name="Lead User",
        company_name="Lead Corp",
        credit_score=90,
        waste_percentage=10.0,
        total_cost=200.0,
        wasted_cost=20.0,
        annual_savings=240.0
    )
    
    assert result is False
