"""
Feedback Model - Stores user feedback ratings and comments
"""

from sqlalchemy import Column, String, Integer, DateTime, Text
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
import uuid

# Import shared Base
from .llm_event import Base


class Feedback(Base):
    """Database model for user feedback"""
    __tablename__ = "feedbacks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, nullable=True, index=True)
    rating = Column(Integer, nullable=False)  # 0: Love It, 1: It's Okay, 2: Not Great, 3: Hate
    comment = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    def __repr__(self):
        return f"<Feedback(id={self.id}, email={self.email}, rating={self.rating})>"


class FeedbackCreate(BaseModel):
    """Request model for creating user feedback"""
    rating: int = Field(..., ge=0, le=3)
    comment: Optional[str] = None
    email: Optional[str] = None


class FeedbackResponse(BaseModel):
    """Response model for feedback"""
    id: str
    rating: int
    comment: Optional[str]
    email: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True
