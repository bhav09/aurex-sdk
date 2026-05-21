"""
CSV Ingestion from llm-cost-optimizer exports
Parses CSV files from OpenAI, Anthropic, and AWS Bedrock
"""

import pandas as pd
from datetime import datetime
from typing import List, Optional, BinaryIO
import hashlib

from src.models import LLMEventCreate
from src.utils import calculate_cost, extract_provider_from_model
from src.utils.logger import get_logger

logger = get_logger(__name__)


def parse_anthropic_csv(file: BinaryIO) -> List[LLMEventCreate]:
    """
    Parse Anthropic usage CSV
    
    Expected columns:
    - timestamp or created_at
    - model
    - input_tokens or prompt_tokens
    - output_tokens or completion_tokens
    - cost (optional)
    - workflow_id (optional)
    - session_id (optional)
    - prompt (optional)
    - metadata or extra_metadata (optional JSON string)
    """
    df = pd.read_csv(file)
    events = []
    
    for _, row in df.iterrows():
        # Extract timestamp, avoiding NaT errors
        timestamp = None
        for key in ["timestamp", "created_at", "created"]:
            val = row.get(key)
            if pd.notna(val):
                try:
                    ts = pd.to_datetime(val)
                    if pd.notna(ts):
                        timestamp = ts
                        break
                except:
                    pass
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        # Extract model and provider
        model = str(row.get("model", "unknown"))
        provider = extract_provider_from_model(model)
        
        # Extract workflow, session, and request/step ID
        workflow_id = row.get("workflow_id") or row.get("workflow")
        if pd.isna(workflow_id) or workflow_id is None:
            workflow_id = None
        else:
            workflow_id = str(workflow_id)
            
        session_id = row.get("session_id") or row.get("session")
        if pd.isna(session_id) or session_id is None:
            session_id = None
        else:
            session_id = str(session_id)

        request_id = row.get("request_id") or row.get("step_id") or row.get("id")
        if pd.isna(request_id) or request_id is None:
            request_id = None
        else:
            request_id = str(request_id)
            
        # Extract prompt
        prompt = row.get("prompt") or row.get("prompt_text") or row.get("input")
        if pd.isna(prompt) or prompt is None:
            prompt = None
        else:
            prompt = str(prompt)
            
        # Extract token counts
        input_tokens = int(row.get("input_tokens") or row.get("prompt_tokens") or 0)
        output_tokens = int(row.get("output_tokens") or row.get("completion_tokens") or 0)
        total_tokens = input_tokens + output_tokens
        
        # Get or calculate cost
        cost = row.get("cost")
        if pd.isna(cost) or cost is None:
            cost = calculate_cost(model, input_tokens, output_tokens)
        else:
            cost = float(cost)
            
        # Parse metadata if present
        metadata_raw = row.get("metadata") or row.get("extra_metadata")
        extra_metadata = {
            "source": "anthropic_csv",
            "cache_creation_tokens": int(row.get("cache_creation_input_tokens") or row.get("cache_creation_tokens") or 0),
            "cache_read_tokens": int(row.get("cache_read_input_tokens") or row.get("cache_read_tokens") or 0)
        }
        
        system_prompt_hash = row.get("system_prompt_hash")
        if pd.isna(system_prompt_hash) or system_prompt_hash is None:
            system_prompt_hash = None
        else:
            system_prompt_hash = str(system_prompt_hash)

        if metadata_raw and not pd.isna(metadata_raw):
            try:
                import json
                metadata_dict = json.loads(metadata_raw) if isinstance(metadata_raw, str) else metadata_raw
                extra_metadata.update(metadata_dict)
                
                # Extract system prompt hash or session/request info if in JSON metadata
                if not system_prompt_hash:
                    system_prompt_hash = metadata_dict.get("system_prompt_hash")
                if not session_id:
                    session_id = metadata_dict.get("session_id")
                if not request_id:
                    request_id = metadata_dict.get("request_id")
                if not workflow_id:
                    workflow_id = metadata_dict.get("workflow_id")
            except:
                extra_metadata["raw_metadata"] = str(metadata_raw)
        
        # Add session/request info to metadata
        if session_id:
            extra_metadata["session_id"] = str(session_id)
        if request_id:
            extra_metadata["request_id"] = str(request_id)
        
        # Create event
        event = LLMEventCreate(
            timestamp=timestamp,
            provider=provider,
            model=model,
            workflow_id=workflow_id,
            step_id=request_id,
            parent_step_id=None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost=cost,
            prompt=prompt,
            response=None,
            system_prompt_hash=system_prompt_hash,
            context_length=total_tokens,
            extra_metadata=extra_metadata
        )
        
        events.append(event)
    
    return events


def parse_openai_csv(file: BinaryIO) -> List[LLMEventCreate]:
    """
    Parse OpenAI usage CSV
    
    Expected columns:
    - timestamp or created
    - model
    - prompt_tokens or n_context_tokens_total or input_tokens
    - completion_tokens or n_generated_tokens_total or output_tokens
    - cost or cost_usd (PRIORITY: use actual cost if available)
    - workflow_id (optional)
    - session_id (optional)
    - metadata (optional JSON string)
    """
    df = pd.read_csv(file)
    events = []
    
    for _, row in df.iterrows():
        # Extract timestamp, avoiding NaT errors
        timestamp = None
        for key in ["timestamp", "created", "created_at"]:
            val = row.get(key)
            if pd.notna(val):
                try:
                    ts = pd.to_datetime(val)
                    if pd.notna(ts):
                        timestamp = ts
                        break
                except:
                    pass
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        # Extract model and provider
        model = str(row.get("model", "unknown"))
        provider = extract_provider_from_model(model)
        
        # Extract workflow and session info
        workflow_id = row.get("workflow_id")
        if pd.isna(workflow_id):
            workflow_id = None
        else:
            workflow_id = str(workflow_id)
            
        session_id = row.get("session_id")
        request_id = row.get("request_id")
        
        # Extract token counts (support multiple column name formats)
        input_tokens = int(row.get("input_tokens") or row.get("prompt_tokens") or row.get("n_context_tokens_total", 0))
        output_tokens = int(row.get("output_tokens") or row.get("completion_tokens") or row.get("n_generated_tokens_total", 0))
        total_tokens = int(row.get("total_tokens", input_tokens + output_tokens))
        
        # CRITICAL FIX: Use actual cost from CSV if available
        cost = row.get("cost_usd") or row.get("cost")
        if pd.isna(cost) or cost is None:
            # Only calculate if not provided
            cost = calculate_cost(model, input_tokens, output_tokens)
        else:
            cost = float(cost)
        
        # Parse metadata if present (could be JSON string)
        metadata_raw = row.get("metadata")
        extra_metadata = {"source": "openai_csv"}
        
        if metadata_raw and not pd.isna(metadata_raw):
            try:
                # Try to parse as JSON
                import json
                metadata_dict = json.loads(metadata_raw) if isinstance(metadata_raw, str) else metadata_raw
                extra_metadata.update(metadata_dict)
                
                # Extract system prompt hash if present
                system_prompt_hash = metadata_dict.get("system_prompt_hash")
            except:
                extra_metadata["raw_metadata"] = str(metadata_raw)
                system_prompt_hash = None
        else:
            system_prompt_hash = None
        
        # Add session/request info to metadata
        if session_id:
            extra_metadata["session_id"] = str(session_id)
        if request_id:
            extra_metadata["request_id"] = str(request_id)
        
        # Create event
        event = LLMEventCreate(
            timestamp=timestamp,
            provider=provider,
            model=model,
            workflow_id=workflow_id,
            step_id=request_id,  # Use request_id as step_id
            parent_step_id=None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost=cost,  # Using actual cost from CSV
            prompt=None,
            response=None,
            system_prompt_hash=system_prompt_hash,
            context_length=total_tokens,
            extra_metadata=extra_metadata
        )
        
        events.append(event)
    
    return events


def parse_bedrock_csv(file: BinaryIO) -> List[LLMEventCreate]:
    """
    Parse AWS Bedrock CloudWatch metrics CSV
    
    Expected format: CloudWatch export with aggregated metrics
    Columns after header rows:
    - Timestamp
    - InputTokenCount (average)
    - InvocationLatency (average)
    - Invocations (sum)
    - OutputTokenCount (average)
    """
    df = pd.read_csv(file, skiprows=5)  # Skip CloudWatch header rows
    events = []
    
    for _, row in df.iterrows():
        timestamp_str = row.iloc[0]  # First column is timestamp
        
        # Skip empty rows
        if pd.isna(timestamp_str):
            continue
        
        try:
            # Parse timestamp
            timestamp = pd.to_datetime(timestamp_str)
            
            # Extract metrics (averages per invocation)
            input_tokens = float(row.iloc[1]) if not pd.isna(row.iloc[1]) else 0
            latency = float(row.iloc[2]) if not pd.isna(row.iloc[2]) else 0
            invocations = float(row.iloc[3]) if not pd.isna(row.iloc[3]) else 0
            output_tokens = float(row.iloc[4]) if not pd.isna(row.iloc[4]) else 0
            
            # Skip if no invocations
            if invocations == 0:
                continue
            
            # Bedrock uses Claude models
            model = "claude-sonnet-4-5-20250929"  # Default, can be configured
            provider = "anthropic"
            
            # Calculate cost per invocation
            cost_per_call = calculate_cost(model, int(input_tokens), int(output_tokens))
            
            # Create one event per invocation in this time period
            for i in range(int(invocations)):
                event = LLMEventCreate(
                    timestamp=timestamp,
                    provider=provider,
                    model=model,
                    workflow_id=None,
                    step_id=None,
                    parent_step_id=None,
                    input_tokens=int(input_tokens),
                    output_tokens=int(output_tokens),
                    total_tokens=int(input_tokens + output_tokens),
                    cost=cost_per_call,
                    prompt=None,
                    response=None,
                    system_prompt_hash=None,
                    context_length=int(input_tokens + output_tokens),
                    extra_metadata={
                        "source": "bedrock_cloudwatch",
                        "latency_ms": latency
                    }
                )
                
                events.append(event)
        
        except (ValueError, IndexError) as e:
            logger.warning("Error parsing row in Bedrock CSV", error=str(e), row_data=str(row.tolist()))
            continue
    
    return events


def ingest_csv_file(file: BinaryIO, csv_type: Optional[str] = None) -> List[LLMEventCreate]:
    """
    Ingest CSV file and auto-detect format
    
    Args:
        file: File object (BinaryIO)
        csv_type: Optional type hint ('anthropic', 'openai', 'bedrock')
    
    Returns:
        List of LLMEventCreate objects
    """
    events = []
    
    # Try to detect format if not specified
    if csv_type is None:
        # Read first few lines to detect format
        file.seek(0)
        first_lines = []
        for _ in range(10):
            line = file.readline()
            if line:
                first_lines.append(line.decode('utf-8') if isinstance(line, bytes) else line)
        
        file.seek(0)
        
        # Check for Bedrock format
        if any('AWS/Bedrock' in line for line in first_lines):
            csv_type = 'bedrock'
        # Check for Anthropic columns
        elif any('cache_creation_input_tokens' in line.lower() for line in first_lines):
            csv_type = 'anthropic'
        # Default to OpenAI
        else:
            csv_type = 'openai'
    
    # Parse based on detected/specified type
    if csv_type == 'bedrock':
        events = parse_bedrock_csv(file)
    elif csv_type == 'anthropic':
        events = parse_anthropic_csv(file)
    elif csv_type == 'openai':
        events = parse_openai_csv(file)
    else:
        raise ValueError(f"Unknown CSV type: {csv_type}")
    
    logger.info("CSV parsed successfully", events_count=len(events), csv_type=csv_type)
    
    return events


