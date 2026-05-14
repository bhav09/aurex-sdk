import secrets
import time
import httpx
import resend
import jwt
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

# Note: resend.api_key will be set inside the request_otp function to ensure env vars are loaded

# In-memory storage
# otp_store[email] = {"otp": "123456", "expiry": timestamp, "attempts": 0, "verified": bool}
otp_store: Dict[str, dict] = {}
# rate_limit_store[email] = [timestamp1, timestamp2, ...]
rate_limit_store: Dict[str, list] = {}

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

def cleanup_expired():
    now = time.time()
    # Cleanup OTPs older than 10 mins (600s)
    expired_emails = [email for email, data in otp_store.items() if now > data["expiry"]]
    for email in expired_emails:
        del otp_store[email]
    
    # Cleanup rate limits older than 1 hr (3600s)
    for email in list(rate_limit_store.keys()):
        rate_limit_store[email] = [t for t in rate_limit_store[email] if now - t < 3600]
        if not rate_limit_store[email]:
            del rate_limit_store[email]

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

@router.post("/request-otp")
async def request_otp(data: OTPRequest):
    cleanup_expired()
    email = data.email.lower()
    
    # Check disposable
    domain = email.split('@')[-1]
    domains = await get_disposable_domains()
    if domain in domains:
        logger.warning("Disposable domain blocked", domain=domain, email=email)
        raise HTTPException(status_code=400, detail="Disposable email addresses are not allowed")

    # Check rate limit (max 3 per hour)
    now = time.time()
    history = rate_limit_store.get(email, [])
    if len(history) >= 3:
        logger.warning("Rate limit exceeded", email=email, attempts=len(history))
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again later.")

    # Generate OTP securely
    otp_code = f"{secrets.randbelow(1000000):06d}"
    
    # Store OTP (10 mins TTL)
    otp_store[email] = {
        "otp": otp_code,
        "expiry": now + 600,
        "attempts": 0,
        "verified": False
    }
    
    # Update rate limit
    history.append(now)
    rate_limit_store[email] = history
    
    # Send email
    resend.api_key = settings.resend_api_key
    if not resend.api_key:
        logger.debug("RESEND_API_KEY is NOT set")
        logger.warning("RESEND_API_KEY not set. Falling back to local OTP.", email=email)
    else:
        try:
            resend.Emails.send({
                "from": "Aurex <otp@noreply.heyaurex.com>",
                "to": [email],
                "subject": "Your Aurex verification code",
                "text": f"Your Aurex verification code is: {otp_code}\\n\\nThis code expires in 10 minutes."
            })
        except Exception as e:
            # If email sending fails, we should still probably raise a 500
            logger.error("Error sending email", error=str(e), email=email)
            raise HTTPException(status_code=500, detail="Failed to send verification email")
            
    logger.info("OTP requested", email_domain=domain, status="success")
    return {"status": "success", "message": "OTP sent successfully"}

@router.post("/verify-otp")
async def verify_otp(data: OTPVerify):
    cleanup_expired()
    email = data.email.lower()
    
    if email not in otp_store:
        logger.warning("OTP verification failed: no active OTP", email=email)
        raise HTTPException(status_code=400, detail="No active OTP found for this email or it has expired")
        
    otp_data = otp_store[email]
    
    if otp_data["attempts"] >= 3:
        logger.warning("OTP verification failed: max attempts", email=email, attempts=otp_data["attempts"])
        raise HTTPException(status_code=400, detail="Maximum verification attempts exceeded. Please request a new OTP.")
        
    otp_data["attempts"] += 1
    
    if otp_data["otp"] != data.otp:
        logger.warning("OTP verification failed: invalid code", email=email, attempts=otp_data["attempts"])
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    # Mark as verified
    otp_data["verified"] = True
    
    # Generate JWT token
    access_token = create_access_token(data={"sub": email})
    
    logger.info("OTP verified successfully", email=email)
    return {
        "status": "success", 
        "message": "Email verified successfully",
        "access_token": access_token,
        "token_type": "bearer"
    }
