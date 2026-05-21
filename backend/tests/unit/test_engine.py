import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

from src.models import LLMEvent
from src.detection.engine import EnhancedDetectionEngine, ExecutiveSummary, WorkflowAnalysis, EnhancedIssue


class TestExecutiveSummary:
    def test_executive_summary_severity_low(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=10.0, optimized_spend=90.0)
        assert summary.waste_percentage == 10.0
        assert summary.severity == "LOW"
        assert summary.annual_savings_projection == 520.0

    def test_executive_summary_severity_medium(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=20.0, optimized_spend=80.0)
        assert summary.waste_percentage == 20.0
        assert summary.severity == "MEDIUM"

    def test_executive_summary_severity_high(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=40.0, optimized_spend=60.0)
        assert summary.waste_percentage == 40.0
        assert summary.severity == "HIGH"

    def test_executive_summary_severity_critical(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=60.0, optimized_spend=40.0)
        assert summary.waste_percentage == 60.0
        assert summary.severity == "CRITICAL"


@pytest.mark.asyncio
class TestEnhancedDetectionEngine:
    async def test_engine_empty_events(self):
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock()
        
        # When no events are present
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        engine.events = []
        
        result = await engine.analyze_complete()
        assert result["total_events"] == 0
        assert result["executive_summary"]["current_weekly_spend"] == 0.0

    async def test_engine_detects_expensive_model_misuse(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        # 3 events of expensive model (gpt-4o) with low input/output tokens (simple task)
        now = datetime.utcnow()
        engine.events = [
            LLMEvent(id="e1", timestamp=now, provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=100, output_tokens=50, total_tokens=150, cost=5.0),
            LLMEvent(id="e2", timestamp=now + timedelta(seconds=1), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=100, output_tokens=50, total_tokens=150, cost=5.0),
            LLMEvent(id="e3", timestamp=now + timedelta(seconds=2), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=100, output_tokens=50, total_tokens=150, cost=5.0)
        ]
        
        analysis = await engine.analyze_complete()
        assert analysis["total_events"] == 3
        assert len(analysis["top_issues"]) > 0
        assert analysis["top_issues"][0]["issue_type"] == "over_provisioned_model"
        assert analysis["top_issues"][0]["severity"] == "HIGH"

    async def test_engine_detects_redundant_system_prompts(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # Events sharing the same system prompt hash in extra_metadata
        engine.events = [
            LLMEvent(id="e1", timestamp=now, provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=1000, output_tokens=100, total_tokens=1100, cost=1.0, extra_metadata={"system_prompt_hash": "hash_abc", "prompt_tokens": 800}),
            LLMEvent(id="e2", timestamp=now + timedelta(seconds=1), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=1000, output_tokens=100, total_tokens=1100, cost=1.0, extra_metadata={"system_prompt_hash": "hash_abc", "prompt_tokens": 800}),
        ]
        
        analysis = await engine.analyze_complete()
        assert len(analysis["top_issues"]) > 0
        assert any(issue["issue_type"] == "redundant_system_prompt" for issue in analysis["top_issues"])

    async def test_engine_detects_agent_loops(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # Double the context length repeatedly in a workflow
        engine.events = [
            LLMEvent(id="e1", timestamp=now, provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=100, output_tokens=50, total_tokens=150, cost=0.1, context_length=100),
            LLMEvent(id="e2", timestamp=now + timedelta(seconds=1), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=200, output_tokens=50, total_tokens=250, cost=0.2, context_length=200),
            LLMEvent(id="e3", timestamp=now + timedelta(seconds=2), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=400, output_tokens=50, total_tokens=450, cost=0.4, context_length=400)
        ]
        
        analysis = await engine.analyze_complete()
        assert len(analysis["top_issues"]) > 0
        assert any(issue["issue_type"] == "agent_loop" for issue in analysis["top_issues"])

    async def test_engine_detects_context_explosion(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # Context goes from 100 to 1000 (exponential growth, also context explosion)
        engine.events = [
            LLMEvent(id="e1", timestamp=now, provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=100, output_tokens=50, total_tokens=150, cost=0.1, context_length=100),
            LLMEvent(id="e2", timestamp=now + timedelta(seconds=1), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=1000, output_tokens=50, total_tokens=1050, cost=1.0, context_length=1000)
        ]
        
        analysis = await engine.analyze_complete()
        assert len(analysis["top_issues"]) > 0
        assert any(issue["issue_type"] == "context_explosion" for issue in analysis["top_issues"])
