"""
Pricing Override Model - Stores custom pricing rules for specific companies
"""

from sqlalchemy import Column, String, Float, DateTime
from datetime import datetime
from pydantic import BaseModel
from typing import Optional
import uuid

# Import shared Base
from .llm_event import Base


class PricingOverride(Base):
    """Database model for custom pricing overrides per company"""
    __tablename__ = "pricing_overrides"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_name = Column(String, nullable=False, index=True)
    model_name = Column(String, nullable=False, index=True)
    
    # Custom pricing (USD per 1M tokens)
    input_price_per_1m = Column(Float, nullable=False)
    output_price_per_1m = Column(Float, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<PricingOverride(id={self.id}, company={self.company_name}, model={self.model_name})>"


# Pydantic Models for API

class PricingOverrideCreate(BaseModel):
    """Request model for creating/updating a pricing override"""
    company_name: str
    model_name: str
    input_price_per_1m: float
    output_price_per_1m: float


class PricingOverrideResponse(BaseModel):
    """Response model for a pricing override"""
    id: str
    company_name: str
    model_name: str
    input_price_per_1m: float
    output_price_per_1m: float
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
