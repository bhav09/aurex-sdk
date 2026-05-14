import pytest
from datetime import datetime, timedelta
from src.models import LLMEvent
from src.detection.engine import DetectionEngine, IssueDetection

@pytest.fixture
def setup_loop_events(db_session):
    workflow_id = "loop_wf"
    base_time = datetime.utcnow()
    events = [
        LLMEvent(
            id=f"evt_{i}",
            workflow_id=workflow_id,
            timestamp=base_time + timedelta(minutes=i),
            prompt="Repeated prompt signature...",
            context_length=1000 + (i * 500), # Growing context
            cost=0.01,
            model="gpt-4o",
            provider="openai",
            total_tokens=1000 + (i * 500)
        )
        for i in range(4)
    ]
    db_session.add_all(events)
    db_session.commit()
    return workflow_id

class TestDetectionEngine:
    def test_detect_agent_loops(self, db_session, setup_loop_events):
        engine = DetectionEngine(db_session)
        engine.detect_agent_loops(setup_loop_events)
        
        assert len(engine.issues) == 1
        issue = engine.issues[0]
        assert issue.issue_type == "agent_loop"
        assert issue.severity == "high"
        # 3 repetitions after the first, so 0.03 cost
        assert issue.cost_impact == pytest.approx(0.03)

    def test_detect_expensive_model_misuse(self, db_session):
        workflow_id = "expensive_wf"
        base_time = datetime.utcnow()
        events = [
            LLMEvent(
                id=f"evt_exp_{i}",
                workflow_id=workflow_id,
                timestamp=base_time + timedelta(minutes=i),
                model="gpt-4",
                total_tokens=150, # Less than 200
                cost=0.05,
                provider="openai"
            )
            for i in range(3)
        ]
        db_session.add_all(events)
        db_session.commit()

        engine = DetectionEngine(db_session)
        engine.detect_expensive_model_misuse(workflow_id)

        assert len(engine.issues) == 1
        issue = engine.issues[0]
        assert issue.issue_type == "expensive_model_misuse"
        # Wasted cost = 3 * 0.05 = 0.15. Potential savings = 0.15 * 0.9 = 0.135
        assert issue.cost_impact == pytest.approx(0.135)
