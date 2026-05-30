"""Workflow baseline metrics for verified savings."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, ForeignKey

from src.models.llm_event import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class WorkflowBaseline(Base):
    __tablename__ = "workflow_baselines"

    id = Column(String, primary_key=True, default=_uuid)
    workflow_id = Column(String, nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    avg_cost_per_success = Column(Float, nullable=True)
    avg_retry_rate = Column(Float, nullable=True)
    sample_size = Column(Integer, nullable=False, default=0)
    window_start = Column(DateTime, nullable=False)
    window_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
