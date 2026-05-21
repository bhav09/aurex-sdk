import secrets
import time
import httpx
import resend
import jwt
import json
import redis.asyncio as redis
from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from src.utils.logger import get_logger

from app.config import settings

router = APIRouter()
logger = get_logger(__name__)

# JWT Configuration
JWT_SECRET = settings.jwt_secret
JWT_ALGORITHM = settings.jwt_algorithm
JWT_EXPIRATION_MINUTES = settings.jwt_expiration_minutes

security = HTTPBearer()

# Redis Configuration (Mocked for local dev)
REDIS_URL = getattr(settings, "redis_url", "redis://localhost:6379/0")

class MockRedis:
    def __init__(self):
        self.store = {}
        self.lists = {}
    async def get(self, key):
        return self.store.get(key)
    async def setex(self, key, ttl, value):
        self.store[key] = value
    async def delete(self, key):
        self.store.pop(key, None)
        self.lists.pop(key, None)
    async def lrange(self, key, start, end):
        return self.lists.get(key, [])
    async def rpush(self, key, *values):
        if key not in self.lists:
            self.lists[key] = []
        self.lists[key].extend(values)
    async def expire(self, key, ttl):
        pass

redis_client = MockRedis()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRATION_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Could not validate credentials")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

security_optional = HTTPBearer(auto_error=False)

async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)) -> Optional[str]:
    if credentials is None:
        return None
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        return email
    except Exception:
        return None

@router.get("/session")
async def get_session(current_user: str = Depends(get_current_user)):
    return {
        "status": "active",
        "email": current_user
    }


# Cache disposable domains
disposable_domains_cache = set()
disposable_domains_loaded = False

async def get_disposable_domains():
    global disposable_domains_loaded
    global disposable_domains_cache
    if not disposable_domains_loaded:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get("https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf")
                if resp.status_code == 200:
                    domains = [line.strip() for line in resp.text.split("\n") if line.strip() and not line.startswith("#")]
                    disposable_domains_cache = set(domains)
                    disposable_domains_loaded = True
        except Exception as e:
            logger.error("Error loading disposable domains", error=str(e))
    return disposable_domains_cache

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

@router.post("/request-otp")
async def request_otp(data: OTPRequest):
    email = data.email.lower()
    
    # Check disposable
    domain = email.split('@')[-1]
    domains = await get_disposable_domains()
    if domain in domains:
        logger.warning("Disposable domain blocked", domain=domain, email=email)
        raise HTTPException(status_code=400, detail="Disposable email addresses are not allowed")

    # Rate limiting checking via Redis
    history_key = f"rate_limit:{email}"
    now = time.time()
    
    history_raw = await redis_client.lrange(history_key, 0, -1)
    history = [float(t) for t in history_raw]
    history = [t for t in history if now - t < 3600] # cleanup old
    
    if len(history) >= 3:
        logger.warning("Rate limit exceeded", email=email, attempts=len(history))
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again later.")

    # Generate OTP securely
    otp_code = f"{secrets.randbelow(1000000):06d}"
    
    # Store OTP (10 mins TTL)
    otp_data = {
        "otp": otp_code,
        "attempts": 0,
        "verified": False
    }
    await redis_client.setex(f"otp:{email}", 600, json.dumps(otp_data))
    
    # Update rate limit
    history.append(now)
    await redis_client.delete(history_key)
    if history:
        await redis_client.rpush(history_key, *history)
        await redis_client.expire(history_key, 3600)
    
    # Send email
    resend.api_key = settings.resend_api_key
    if not resend.api_key:
        logger.debug("RESEND_API_KEY is NOT set")
        logger.warning("RESEND_API_KEY not set. Falling back to local OTP.", email=email)
    else:
        try:
            resend.Emails.send({
                "from": "Aurex <onboarding@resend.dev>",
                "to": [email],
                "subject": "Your Aurex verification code",
                "text": f"Your Aurex verification code is: {otp_code}\n\nThis code expires in 10 minutes."
            })
        except Exception as e:
            logger.error("Error sending email", error=str(e), email=email)
            raise HTTPException(status_code=500, detail="Failed to send verification email")
            
    logger.info("OTP requested", email_domain=domain, status="success")
    from src.utils.analytics import log_analytics_event
    log_analytics_event(event_type="otp_request", email=email)
    return {"status": "success", "message": "OTP sent successfully"}

@router.post("/verify-otp")
async def verify_otp(data: OTPVerify):
    email = data.email.lower()
    
    otp_raw = await redis_client.get(f"otp:{email}")
    if not otp_raw:
        logger.warning("OTP verification failed: no active OTP", email=email)
        raise HTTPException(status_code=400, detail="No active OTP found for this email or it has expired")
        
    otp_data = json.loads(otp_raw)
    
    if otp_data["attempts"] >= 3:
        logger.warning("OTP verification failed: max attempts", email=email, attempts=otp_data["attempts"])
        raise HTTPException(status_code=400, detail="Maximum verification attempts exceeded. Please request a new OTP.")
        
    otp_data["attempts"] += 1
    
    if otp_data["otp"] != data.otp:
        await redis_client.setex(f"otp:{email}", 600, json.dumps(otp_data))
        logger.warning("OTP verification failed: invalid code", email=email, attempts=otp_data["attempts"])
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    # Mark as verified
    otp_data["verified"] = True
    await redis_client.setex(f"otp:{email}", 600, json.dumps(otp_data))
    
    # Generate JWT token
    access_token = create_access_token(data={"sub": email})
    
    logger.info("OTP verified successfully", email=email)
    from src.utils.analytics import log_analytics_event
    log_analytics_event(event_type="otp_verify", email=email)
    return {
        "status": "success", 
        "message": "Email verified successfully",
        "access_token": access_token,
        "token_type": "bearer"
    }
