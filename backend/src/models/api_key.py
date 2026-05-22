"""
API Key Model - Stores hashed API keys for SDK authentication
"""

from sqlalchemy import Column, String, DateTime, Boolean
from datetime import datetime
from pydantic import BaseModel
from typing import Optional
import uuid
import hashlib

# Import shared Base
from .llm_event import Base


class ApiKey(Base):
    """Database model for developer/SDK API keys"""
    __tablename__ = "api_keys"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash = Column(String, unique=True, nullable=False, index=True)
    prefix = Column(String, nullable=False) # e.g. "ax_live_"
    name = Column(String, nullable=False) # e.g. "Production Server"
    owner_email = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_used_at = Column(DateTime, nullable=True)

    @staticmethod
    def hash_key(raw_key: str) -> str:
        """Hash key using SHA-256"""
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def __repr__(self):
        return f"<ApiKey(id={self.id}, prefix={self.prefix}, name={self.name}, active={self.is_active})>"


# Pydantic Models for API

class ApiKeyCreate(BaseModel):
    """Request model for creating a new API key"""
    name: str
    company_name: str


class ApiKeyGeneratedResponse(BaseModel):
    """Response model containing the plaintext key (only returned once at creation)"""
    id: str
    key: str # Raw key: ax_xxxxxxxxxxxxxxxxxxxxxxxxxx
    prefix: str
    name: str
    company_name: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class ApiKeyResponse(BaseModel):
    """Response model for displaying API key metadata"""
    id: str
    prefix: str
    name: str
    company_name: str
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
