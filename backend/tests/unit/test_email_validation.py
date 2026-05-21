import pytest
import os
from fastapi import HTTPException
from pydantic import BaseModel
from src.api.auth import request_otp, OTPRequest

@pytest.mark.asyncio
async def test_email_validation_real_domain(monkeypatch):
    """
    Test that a valid, active public domain passes email deliverability validation.
    """
    # Force is_test_env to False inside request_otp
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    
    # Let's mock validate_email to avoid DNS resolution hanging
    import src.api.auth as auth_module
    from email_validator import ValidatedEmail
    mock_val = ValidatedEmail()
    mock_val.normalized = "valid.user@gmail.com"
    monkeypatch.setattr(auth_module, "validate_email", lambda email, check_deliverability: mock_val)
    
    # Mock get_disposable_domains to avoid hitting the network
    async def mock_get_disposable():
        return set()
    monkeypatch.setattr(auth_module, "get_disposable_domains", mock_get_disposable)
    
    # Mock redis & resend functions to avoid hitting them
    async def mock_lrange(*args, **kwargs): return []
    async def mock_setex(*args, **kwargs): return True
    async def mock_rpush(*args, **kwargs): return True
    async def mock_expire(*args, **kwargs): return True
    
    from src.api.auth import redis_client
    monkeypatch.setattr(redis_client, "lrange", mock_lrange)
    monkeypatch.setattr(redis_client, "setex", mock_setex)
    monkeypatch.setattr(redis_client, "rpush", mock_rpush)
    monkeypatch.setattr(redis_client, "expire", mock_expire)
    
    # Let's use a real domain that definitely has MX records (e.g., gmail.com)
    data = OTPRequest(email="valid.user@gmail.com")
    
    # Under test, request_otp won't bypass the checks now because PYTEST_CURRENT_TEST is cleared
    # But since gmail.com is real and not a dummy domain, it should successfully pass validation
    # (The call might try to send an email, so we need to mock resend)
    import resend
    monkeypatch.setattr(resend.Emails, "send", lambda *args, **kwargs: {})
    
    response = await request_otp(data)
    assert response["status"] == "success"

@pytest.mark.asyncio
async def test_email_validation_dummy_domain(monkeypatch):
    """
    Test that fictitious/dummy-generated email domains are blocked.
    """
    # Force is_test_env to False inside request_otp to enable the validation logic
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    
    data = OTPRequest(email="user@example.com")
    
    with pytest.raises(HTTPException) as exc:
        await request_otp(data)
        
    assert exc.value.status_code == 400
    assert "Fictitious or dummy-generated email domains are not allowed" in exc.value.detail

@pytest.mark.asyncio
async def test_email_validation_fake_domain(monkeypatch):
    """
    Test that non-existent domains without active mail servers fail deliverability check.
    """
    # Force is_test_env to False inside request_otp to enable the validation logic
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    
    # Mock validate_email to throw deliverability error without hits to real DNS resolver
    import src.api.auth as auth_module
    from email_validator import EmailNotValidError
    def mock_val_fail(email, check_deliverability):
        raise EmailNotValidError("Domain does not exist or has no active mail servers")
    monkeypatch.setattr(auth_module, "validate_email", mock_val_fail)
    
    # Mock get_disposable_domains to avoid hitting the network
    async def mock_get_disposable():
        return set()
    monkeypatch.setattr(auth_module, "get_disposable_domains", mock_get_disposable)
    
    # A completely non-existent domain
    data = OTPRequest(email="user@nonexistentasdfasdffg12345.com")
    
    with pytest.raises(HTTPException) as exc:
        await request_otp(data)
        
    assert exc.value.status_code == 400
    assert "does not exist or has no active mail servers configured" in exc.value.detail

@pytest.mark.asyncio
async def test_get_disposable_domains_offline(monkeypatch):
    """
    Test that get_disposable_domains falls back to a default set of domains if offline or in test.
    """
    # Simulate offline by raising an exception on any httpx get call
    async def mock_get(*args, **kwargs):
        raise Exception("Network is offline")
    
    import httpx
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    
    # Reset loading status to force fetch attempt
    import src.api.auth as auth_module
    auth_module.disposable_domains_loaded = False
    auth_module.disposable_domains_cache = set()
    
    from src.api.auth import get_disposable_domains
    domains = await get_disposable_domains()
    # It should return a non-empty set of fallback domains even when offline
    assert isinstance(domains, set)
    assert len(domains) > 0
    assert "mailinator.com" in domains

