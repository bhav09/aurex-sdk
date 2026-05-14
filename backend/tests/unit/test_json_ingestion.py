import pytest
from src.ingestion.json_ingestion import hash_text, parse_llm_use_session_data
from src.models import LLMEventCreate

class TestJsonIngestion:
    def test_hash_text(self):
        h1 = hash_text("hello world")
        h2 = hash_text("hello world")
        assert h1 == h2
        assert len(h1) == 16

    def test_parse_llm_use_session_data_valid(self):
        mock_data = {
            "session_id": "test_session_123",
            "timestamp": "2024-05-15T12:00:00Z",
            "orchestrator": {"provider": "anthropic", "model": "claude-3-opus-20240229"},
            "steps": [
                {
                    "step_id": "step_1",
                    "type": "orchestrator",
                    "input_tokens": 100,
                    "output_tokens": 50,
                    "prompt": "hello",
                    "response": "world"
                }
            ]
        }
        
        events = parse_llm_use_session_data(mock_data)
        assert len(events) == 1
        event = events[0]
        assert event.workflow_id == "test_session_123"
        assert event.model == "claude-3-opus-20240229"
        assert event.provider == "anthropic"
        assert event.input_tokens == 100
        assert event.output_tokens == 50
        assert event.total_tokens == 150
        assert event.prompt == "hello"
        assert event.response == "world"

    def test_parse_llm_use_session_data_missing_fields(self):
        # Missing model and tokens should default safely
        mock_data = {
            "steps": [
                {
                    "type": "worker",
                }
            ]
        }
        events = parse_llm_use_session_data(mock_data, "default_session")
        assert len(events) == 1
        event = events[0]
        assert event.workflow_id == "default_session"
        assert event.model == "unknown"
        assert event.input_tokens == 0
        assert event.output_tokens == 0
