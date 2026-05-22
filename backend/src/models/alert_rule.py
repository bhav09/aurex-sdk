"""
Alert Rule Model - Stores alert rules and notifications configuration for companies
"""

from sqlalchemy import Column, String, Float, DateTime, Boolean, JSON
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid

# Import shared Base
from .llm_event import Base


class AlertRule(Base):
    """Database model for alert rules per company"""
    __tablename__ = "alert_rules"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_name = Column(String, nullable=False, index=True)
    trigger_type = Column(String, nullable=False)  # "waste_percentage", "credit_score", "runaway_loop"
    threshold = Column(Float, nullable=True)       # e.g., 20.0 (waste) or 80.0 (credit score)
    channel = Column(String, nullable=False)        # "slack", "email", "webhook"
    channel_config = Column(JSON, nullable=False)   # e.g., {"webhook_url": "https://hooks.slack.com/..."}
    enabled = Column(Boolean, default=True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<AlertRule(id={self.id}, company={self.company_name}, channel={self.channel}, enabled={self.enabled})>"


# Pydantic Models for API

class AlertRuleCreate(BaseModel):
    """Request model for creating an alert rule"""
    company_name: str
    trigger_type: str
    threshold: Optional[float] = None
    channel: str
    channel_config: Dict[str, Any]
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    """Request model for updating an alert rule"""
    trigger_type: Optional[str] = None
    threshold: Optional[float] = None
    channel: Optional[str] = None
    channel_config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class AlertRuleResponse(BaseModel):
    """Response model for an alert rule"""
    id: str
    company_name: str
    trigger_type: str
    threshold: Optional[float]
    channel: str
    channel_config: Dict[str, Any]
    enabled: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
