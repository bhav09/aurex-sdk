import pytest
import jwt
from datetime import datetime, timedelta
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from src.api.auth import create_access_token, get_current_user, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_MINUTES

@pytest.mark.asyncio
async def test_create_access_token():
    email = "test@example.com"
    token = create_access_token(data={"sub": email})
    
    assert isinstance(token, str)
    
    # Verify the decoded token matches
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert decoded["sub"] == email
    assert "exp" in decoded

@pytest.mark.asyncio
async def test_get_current_user_valid_token():
    email = "valid@example.com"
    token = create_access_token({"sub": email})
    
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user_email = await get_current_user(credentials)
    assert user_email == email

@pytest.mark.asyncio
async def test_get_current_user_expired_token():
    email = "expired@example.com"
    # Create an expired token manually
    to_encode = {"sub": email}
    expire = datetime.utcnow() - timedelta(minutes=10)
    to_encode.update({"exp": expire})
    token = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as exc:
        await get_current_user(credentials)
    
    assert exc.value.status_code == 401
    assert exc.value.detail == "Token has expired"

@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    token = "invalid.token.string"
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    
    with pytest.raises(HTTPException) as exc:
        await get_current_user(credentials)
        
    assert exc.value.status_code == 401
    assert exc.value.detail == "Could not validate credentials"
