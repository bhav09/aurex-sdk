"""
Audit Session Model - Stores user information and audit results
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON
from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
import uuid

# Import shared Base from llm_event to ensure all models use the same metadata
from .llm_event import Base


class AuditSession(Base):
    """Database model for audit sessions"""
    __tablename__ = "audit_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=False)
    
    # Audit Results
    credit_score = Column(Integer)
    total_cost = Column(Float)
    wasted_cost = Column(Float)
    waste_percentage = Column(Float)
    
    # File Info
    file_name = Column(String)
    file_type = Column(String)  # csv, json, xlsx
    
    # Metadata
    total_events = Column(Integer)
    total_workflows = Column(Integer)
    issues_found = Column(Integer)
    
    # Full analysis results (JSON)
    analysis_results = Column(JSON)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<AuditSession(id={self.id}, email={self.email}, score={self.credit_score})>"


# Pydantic Models for API

class AuditSessionCreate(BaseModel):
    """Request model for creating an audit session"""
    user_name: str
    email: EmailStr
    company_name: str
    file_name: str
    file_type: str


class AuditSessionUpdate(BaseModel):
    """Request model for updating audit results"""
    credit_score: Optional[int] = None
    total_cost: Optional[float] = None
    wasted_cost: Optional[float] = None
    waste_percentage: Optional[float] = None
    total_events: Optional[int] = None
    total_workflows: Optional[int] = None
    issues_found: Optional[int] = None
    analysis_results: Optional[Dict[str, Any]] = None


class AuditSessionResponse(BaseModel):
    """Response model for audit session"""
    id: str
    user_name: str
    email: str
    company_name: str
    credit_score: Optional[int]
    total_cost: Optional[float]
    wasted_cost: Optional[float]
    waste_percentage: Optional[float]
    file_name: Optional[str]
    file_type: Optional[str]
    total_events: Optional[int]
    total_workflows: Optional[int]
    issues_found: Optional[int]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class AuditHistoryResponse(BaseModel):
    """Response model for audit history"""
    sessions: list[AuditSessionResponse]
    total: int


