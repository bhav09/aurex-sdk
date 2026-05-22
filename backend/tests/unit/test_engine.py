import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

from src.models import LLMEvent
from src.detection.engine import EnhancedDetectionEngine, ExecutiveSummary, WorkflowAnalysis, EnhancedIssue


class TestExecutiveSummary:
    def test_executive_summary_severity_low(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=10.0, optimized_spend=90.0, period_days=7)
        assert summary.waste_percentage == 10.0
        assert summary.severity == "LOW"
        assert abs(summary.annual_savings_projection - (10.0 / 7 * 365)) < 1e-4
        assert summary.credit_score == 90

    def test_executive_summary_severity_medium(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=20.0, optimized_spend=80.0, period_days=7)
        assert summary.waste_percentage == 20.0
        assert summary.severity == "MEDIUM"
        assert summary.credit_score == 80

    def test_executive_summary_severity_high(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=40.0, optimized_spend=60.0, period_days=7)
        assert summary.waste_percentage == 40.0
        assert summary.severity == "HIGH"
        assert summary.credit_score == 60

    def test_executive_summary_severity_critical(self):
        summary = ExecutiveSummary(current_spend=100.0, wasted_amount=60.0, optimized_spend=40.0, period_days=7)
        assert summary.waste_percentage == 60.0
        assert summary.severity == "CRITICAL"
        assert summary.credit_score == 40

    def test_executive_summary_normalization_different_periods(self):
        # 1-day period
        summary_1d = ExecutiveSummary(current_spend=10.0, wasted_amount=2.0, optimized_spend=8.0, period_days=1)
        assert summary_1d.current_weekly_spend == 70.0
        assert summary_1d.wasted_amount == 14.0
        assert summary_1d.annual_savings_projection == 2.0 * 365
        
        # 30-day period
        summary_30d = ExecutiveSummary(current_spend=300.0, wasted_amount=60.0, optimized_spend=240.0, period_days=30)
        assert summary_30d.current_weekly_spend == 70.0
        assert summary_30d.wasted_amount == 14.0
        assert summary_30d.annual_savings_projection == (60.0 / 30) * 365


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
        # Double the context length repeatedly in a workflow (growing by >= 2.5x)
        engine.events = [
            LLMEvent(id="e1", timestamp=now, provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=100, output_tokens=50, total_tokens=150, cost=0.1, context_length=100),
            LLMEvent(id="e2", timestamp=now + timedelta(seconds=1), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=260, output_tokens=50, total_tokens=310, cost=0.2, context_length=260),
            LLMEvent(id="e3", timestamp=now + timedelta(seconds=2), provider="openai", model="gpt-4o", workflow_id="wf1", input_tokens=680, output_tokens=50, total_tokens=730, cost=0.4, context_length=680)
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

    async def test_engine_detects_tool_bloat(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # Events with tools_available_count > 10 and few used, total wasted tokens > 10000
        engine.events = [
            LLMEvent(
                id=f"e{i}",
                timestamp=now + timedelta(seconds=i),
                provider="openai",
                model="gpt-4o",
                workflow_id="wf1",
                input_tokens=1000,
                output_tokens=100,
                total_tokens=1100,
                cost=0.5,
                extra_metadata={
                    "tools_available_count": 15,
                    "tool_definitions_tokens": 1200,
                    "tool_invocations": []
                }
            ) for i in range(10) # 10 events * 1200 wasted tokens = 12000 > 10000
        ]
        
        analysis = await engine.analyze_complete()
        assert any(issue["issue_type"] == "tool_bloat" for issue in analysis["top_issues"])

    async def test_engine_detects_retry_cascades(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # 6 rapid events with http_status >= 500
        engine.events = []
        for i in range(7):
            engine.events.append(
                LLMEvent(
                    id=f"e{i}",
                    timestamp=now + timedelta(seconds=i * 2), # 2 seconds < 5 seconds
                    provider="openai",
                    model="gpt-4o",
                    workflow_id="wf1",
                    input_tokens=500,
                    output_tokens=0,
                    total_tokens=500,
                    cost=0.01,
                    extra_metadata={"http_status": 500}
                )
            )
            
        analysis = await engine.analyze_complete()
        assert any(issue["issue_type"] == "retry_cascades" for issue in analysis["top_issues"])

    async def test_engine_detects_output_verbosity(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # 21 chatty events
        engine.events = [
            LLMEvent(
                id=f"e{i}",
                timestamp=now + timedelta(seconds=i),
                provider="openai",
                model="gpt-4o",
                workflow_id="wf1",
                input_tokens=100,
                output_tokens=100,
                total_tokens=200,
                cost=0.02,
                response="Certainly! Here's the information you requested. Let me know if you need anything else."
            ) for i in range(22)
        ]
        
        analysis = await engine.analyze_complete()
        assert any(issue["issue_type"] == "output_verbosity" for issue in analysis["top_issues"])

    async def test_engine_clustering_and_severity_capping(self):
        mock_db = AsyncMock()
        engine = EnhancedDetectionEngine(mock_db, session_id="test-session")
        
        now = datetime.utcnow()
        # Create unassigned events with no user_id (low confidence clustering fallback)
        # We will trigger a runaway agent loop in a low-confidence (inferred) session (growing by >= 2.5x)
        engine.events = [
            LLMEvent(id="e1", timestamp=now, provider="openai", model="gpt-4o", input_tokens=60, output_tokens=50, total_tokens=110, cost=0.1, context_length=60),
            LLMEvent(id="e2", timestamp=now + timedelta(seconds=1), provider="openai", model="gpt-4o", input_tokens=160, output_tokens=50, total_tokens=210, cost=0.2, context_length=160),
            LLMEvent(id="e3", timestamp=now + timedelta(seconds=2), provider="openai", model="gpt-4o", input_tokens=410, output_tokens=50, total_tokens=460, cost=0.4, context_length=410)
        ]
        
        analysis = await engine.analyze_complete()
        # Find the agent loop issue
        agent_loop_issues = [issue for issue in analysis["top_issues"] if issue["issue_type"] == "agent_loop"]
        assert len(agent_loop_issues) == 1
        # The severity should be capped at MEDIUM instead of CRITICAL because it's a low confidence session!
        assert agent_loop_issues[0]["severity"] == "MEDIUM"


