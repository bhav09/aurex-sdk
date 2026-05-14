"""
JSON Ingestion from llm-use session logs
Parses session JSON files and converts to LLMEvent format
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
import hashlib

from src.models import LLMEventCreate
from src.utils import calculate_cost, extract_provider_from_model
from src.utils.logger import get_logger

logger = get_logger(__name__)


def hash_text(text: str) -> str:
    """Create hash of text for deduplication"""
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def parse_llm_use_session(session_file: Path) -> List[LLMEventCreate]:
    """
    Parse a single llm-use session JSON file
    
    Expected structure:
    {
        "session_id": "...",
        "timestamp": "...",
        "task": "...",
        "orchestrator": {"provider": "...", "model": "..."},
        "worker": {"provider": "...", "model": "..."},
        "steps": [
            {
                "step_id": "...",
                "parent_step_id": "...",
                "type": "orchestrator|worker",
                "prompt": "...",
                "response": "...",
                "input_tokens": 100,
                "output_tokens": 50,
                "cost": 0.001,
                "timestamp": "..."
            }
        ],
        "total_cost": 0.05,
        "total_tokens": 5000
    }
    """
def parse_llm_use_session_data(session_data: dict, default_workflow_id: str = "unknown") -> List[LLMEventCreate]:
    """
    Parse a loaded JSON dict containing llm-use session data
    """
    events = []
    
    try:
        workflow_id = session_data.get("session_id", default_workflow_id)
        
        # Parse each step in the session
        steps = session_data.get("steps", [])
        
        for step in steps:
            # Determine model and provider
            step_type = step.get("type", "worker")
            if step_type == "orchestrator":
                model_info = session_data.get("orchestrator", {})
            else:
                model_info = session_data.get("worker", {})
            
            model = step.get("model") or model_info.get("model", "unknown")
            provider = step.get("provider") or model_info.get("provider") or extract_provider_from_model(model)
            
            # Extract token counts
            input_tokens = step.get("input_tokens", 0)
            output_tokens = step.get("output_tokens", 0)
            total_tokens = input_tokens + output_tokens
            
            # Get or calculate cost
            cost = step.get("cost")
            if cost is None:
                cost = calculate_cost(model, input_tokens, output_tokens)
            
            # Extract prompt and response
            prompt = step.get("prompt", "")
            response = step.get("response", "")
            
            # Calculate system prompt hash if available
            system_prompt = step.get("system_prompt", "")
            system_prompt_hash = hash_text(system_prompt) if system_prompt else None
            
            # Estimate context length (cumulative tokens in conversation)
            context_length = step.get("context_length", total_tokens)
            
            # Parse timestamp
            timestamp_str = step.get("timestamp") or session_data.get("timestamp")
            try:
                timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            except:
                timestamp = datetime.utcnow()
            
            # Create event
            event = LLMEventCreate(
                timestamp=timestamp,
                provider=provider,
                model=model,
                workflow_id=workflow_id,
                step_id=step.get("step_id"),
                parent_step_id=step.get("parent_step_id"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                cost=cost,
                prompt=prompt,
                response=response,
                system_prompt_hash=system_prompt_hash,
                context_length=context_length,
                extra_metadata={
                    "step_type": step_type,
                    "task": session_data.get("task"),
                    "session_file": str(session_file)
                }
            )
            
            events.append(event)
    
    except Exception as e:
        logger.error("Error parsing session data", error=str(e), session_id=session_data.get("session_id", default_workflow_id))
    
    return events


def parse_llm_use_session(session_file: Path) -> List[LLMEventCreate]:
    """Parse a single llm-use session JSON file"""
    try:
        with open(session_file, 'r') as f:
            session_data = json.load(f)
        return parse_llm_use_session_data(session_data, str(session_file.stem))
    except Exception as e:
        logger.error("Error parsing session file", error=str(e), file_path=str(session_file))
        return []


def ingest_llm_use_sessions(session_dir: Optional[str] = None) -> List[LLMEventCreate]:
    """
    Ingest all session files from llm-use directory
    
    Args:
        session_dir: Path to session directory (defaults to ~/.llm-use/sessions)
    
    Returns:
        List of LLMEventCreate objects
    """
    if session_dir is None:
        session_dir = os.path.expanduser("~/.llm-use/sessions")
    
    session_path = Path(session_dir)
    
    if not session_path.exists():
        logger.warning("Session directory not found", directory=str(session_path))
        return []
    
    all_events = []
    
    # Find all JSON files in the session directory
    json_files = list(session_path.glob("**/*.json"))
    
    logger.info("Found session files", count=len(json_files), directory=str(session_path))
    
    for json_file in json_files:
        events = parse_llm_use_session(json_file)
        all_events.extend(events)
        logger.debug("Parsed events from file", events_count=len(events), filename=json_file.name)
    
    logger.info("Total JSON events ingested", count=len(all_events))
    
    return all_events


def ingest_single_json_file(file_path: str) -> List[LLMEventCreate]:
    """
    Ingest a single JSON session file
    
    Args:
        file_path: Path to JSON file
    
    Returns:
        List of LLMEventCreate objects
    """
    return parse_llm_use_session(Path(file_path))


