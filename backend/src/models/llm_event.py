"""
Unified LLM Event Schema
This is the core data model for all LLM usage events
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import uuid
import enum

Base = declarative_base()


class OutcomeEnum(str, enum.Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    PENDING = "pending"


class CostTypeEnum(str, enum.Enum):
    INFERENCE = "inference"
    EMBEDDING = "embedding"
    VECTOR_SEARCH = "vector_search"
    EVAL = "eval"
    RETRY_OVERHEAD = "retry_overhead"
    MEMORY = "memory"
    OUTCOME_SIGNAL = "outcome_signal"


class LLMEvent(Base):
    """
    Unified schema for LLM events from all sources
    """
    __tablename__ = "llm_events"

    # Core identifiers
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime, nullable=False, index=True)
    
    # Provider and model info
    provider = Column(String, nullable=False, index=True)  # openai | anthropic | ollama
    model = Column(String, nullable=False, index=True)
    
    # Workflow tracking
    workflow_id = Column(String, nullable=True, index=True)
    step_id = Column(String, nullable=True)
    parent_step_id = Column(String, nullable=True)
    
    # Upload session tracking (to handle multiple uploads)
    upload_session_id = Column(String, nullable=True, index=True)

    # Project scoping (Phase 1 — populated by SDK ingest via /api/v1/ledger/events).
    project_id = Column(String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Token usage
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
    cached_tokens = Column(Integer, nullable=False, default=0)
    cache_write_tokens = Column(Integer, nullable=False, default=0)
    reasoning_tokens = Column(Integer, nullable=False, default=0)
    is_batch = Column(Integer, nullable=False, default=0)

    # Cost
    cost = Column(Float, nullable=False, default=0.0)
    
    # Content
    prompt = Column(Text, nullable=True)
    response = Column(Text, nullable=True)
    
    # Optimization fields
    system_prompt_hash = Column(String, nullable=True, index=True)
    context_length = Column(Integer, nullable=True)

    # New fields for runtime control
    retry_count = Column(Integer, nullable=False, default=0)
    outcome = Column(SAEnum(OutcomeEnum, name="outcome_enum"), nullable=False, default=OutcomeEnum.PENDING)
    cost_type = Column(SAEnum(CostTypeEnum, name="cost_type_enum"), nullable=False, default=CostTypeEnum.INFERENCE)
    loop_score = Column(Float, nullable=True)  # 0.0-1.0 semantic similarity
    team = Column(String, nullable=True, index=True)
    tenant_id = Column(String, nullable=True, index=True)

    # Additional metadata (renamed from 'metadata' to avoid SQLAlchemy conflict)
    extra_metadata = Column(JSON, nullable=True)
    
    @property
    def cache_read_tokens(self) -> int:
        if self.extra_metadata and "cache_read_tokens" in self.extra_metadata:
            try:
                return int(self.extra_metadata["cache_read_tokens"])
            except (ValueError, TypeError):
                pass
        return 0

    @property
    def cache_creation_tokens(self) -> int:
        if self.extra_metadata and "cache_creation_tokens" in self.extra_metadata:
            try:
                return int(self.extra_metadata["cache_creation_tokens"])
            except (ValueError, TypeError):
                pass
        return 0

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LLMEventCreate(BaseModel):
    """Pydantic model for creating LLM events"""
    timestamp: datetime
    provider: str
    model: str
    workflow_id: Optional[str] = None
    step_id: Optional[str] = None
    parent_step_id: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    cache_write_tokens: int = 0
    reasoning_tokens: int = 0
    is_batch: bool = False
    cost: float = 0.0
    prompt: Optional[str] = None
    response: Optional[str] = None
    system_prompt_hash: Optional[str] = None
    context_length: Optional[int] = None
    retry_count: int = 0
    outcome: Optional[str] = None
    cost_type: Optional[str] = None
    loop_score: Optional[float] = None
    team: Optional[str] = None
    tenant_id: Optional[str] = None
    extra_metadata: Optional[Dict[str, Any]] = None


class LLMEventResponse(BaseModel):
    """Pydantic model for API responses"""
    id: str
    timestamp: datetime
    provider: str
    model: str
    workflow_id: Optional[str]
    step_id: Optional[str]
    parent_step_id: Optional[str]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cached_tokens: int
    cache_write_tokens: int
    reasoning_tokens: int
    is_batch: bool
    cost: float
    prompt: Optional[str]
    response: Optional[str]
    system_prompt_hash: Optional[str]
    context_length: Optional[int]
    retry_count: int
    outcome: Optional[str]
    cost_type: Optional[str]
    loop_score: Optional[float]
    team: Optional[str]
    tenant_id: Optional[str]
    extra_metadata: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


