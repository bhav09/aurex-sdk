import pytest
import pandas as pd
import io
from src.ingestion.csv_ingestion import ingest_csv_file, parse_openai_csv, parse_anthropic_csv

class TestCsvIngestion:
    def test_parse_openai_csv(self):
        csv_content = """timestamp,model,input_tokens,output_tokens,cost_usd,workflow_id
2024-05-15 12:00:00,gpt-4o,100,50,0.005,wf_123"""
        file = io.BytesIO(csv_content.encode("utf-8"))
        events = parse_openai_csv(file)
        
        assert len(events) == 1
        event = events[0]
        assert event.model == "gpt-4o"
        assert event.provider == "openai"
        assert event.input_tokens == 100
        assert event.output_tokens == 50
        assert event.cost == 0.005
        assert event.workflow_id == "wf_123"

    def test_parse_anthropic_csv(self):
        csv_content = """created_at,model,input_tokens,output_tokens
2024-05-15 12:00:00,claude-3-opus-20240229,100,50"""
        file = io.BytesIO(csv_content.encode("utf-8"))
        events = parse_anthropic_csv(file)
        
        assert len(events) == 1
        event = events[0]
        assert event.model == "claude-3-opus-20240229"
        assert event.provider == "anthropic"
        assert event.input_tokens == 100
        assert event.output_tokens == 50
        assert event.cost > 0 # Will be calculated

    def test_ingest_csv_file_autodetect_openai(self):
        csv_content = """timestamp,model,prompt_tokens,completion_tokens
2024-05-15 12:00:00,gpt-4o,100,50"""
        file = io.BytesIO(csv_content.encode("utf-8"))
        events = ingest_csv_file(file)
        
        assert len(events) == 1
        assert events[0].provider == "openai"

    def test_ingest_csv_file_autodetect_anthropic(self):
        csv_content = """timestamp,model,input_tokens,output_tokens,cache_creation_input_tokens
2024-05-15 12:00:00,claude-3-opus-20240229,100,50,0"""
        file = io.BytesIO(csv_content.encode("utf-8"))
        events = ingest_csv_file(file)
        
        assert len(events) == 1
        assert events[0].provider == "anthropic"
