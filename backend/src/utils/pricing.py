"""
LLM Model Pricing Information
Prices per 1M tokens
"""

import re
from typing import Dict, Tuple

# Aligned 2026 Model Pricing data (per 1M tokens)
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-5": {"input": 5.00, "output": 15.00},
    "gpt-5.1": {"input": 5.00, "output": 15.00},
    "o3-mini": {"input": 1.10, "output": 4.40},
    "o1": {"input": 15.00, "output": 60.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},

    # Google Gemini
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-2.5-flash": {"input": 0.10, "output": 0.40},

    # Anthropic
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-3-opus": {"input": 15.00, "output": 75.00},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-5-20250929": {"input": 3.00, "output": 15.00},
    "claude-3-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
    "claude-3-5-haiku": {"input": 0.80, "output": 4.00},
    "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-3-7-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-7-sonnet-20250219": {"input": 3.00, "output": 15.00},

    # Ollama (local, free)
    "llama3.1:70b": {"input": 0.0, "output": 0.0},
    "llama3.1:8b": {"input": 0.0, "output": 0.0},
    "qwen2.5:72b": {"input": 0.0, "output": 0.0},
    "mistral:7b": {"input": 0.0, "output": 0.0},
}


def normalize_model_name(m: str) -> str:
    """
    Normalize model name for robust matching (lowercase, clean prefixes/spaces/dashes)
    """
    m = m.strip().lower()
    # Remove vendor prefixes/common prefixes (like "models/", "anthropic.", "amazon.", "bedrock/")
    m = re.sub(r'^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/)', '', m)
    # Map spaces and underscores to dashes
    m = re.sub(r'[\s_]+', '-', m)
    return m


def get_model_pricing(model: str) -> Tuple[float, float]:
    """
    Get pricing for a model
    Returns (input_price, output_price) per 1M tokens
    """
    if not model:
        return 3.00, 12.00

    query_norm = normalize_model_name(model)
    
    # 1. Try exact match first
    pricing = MODEL_PRICING.get(query_norm)
    if pricing:
        return pricing["input"], pricing["output"]
    
    # 2. Match based on substring matching with descending key length
    # This prevents shorter models matching first (e.g. gpt-4o-mini matching gpt-4o)
    sorted_keys = sorted(MODEL_PRICING.keys(), key=len, reverse=True)
    
    for key in sorted_keys:
        if key in query_norm:
            return MODEL_PRICING[key]["input"], MODEL_PRICING[key]["output"]
            
    # Default fallback for unknown models (assume expensive model pricing, matches python tests)
    return 15.00, 60.00


def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Calculate cost for a given model and token usage
    """
    input_price, output_price = get_model_pricing(model)
    
    cost = (
        (input_tokens / 1_000_000 * input_price) +
        (output_tokens / 1_000_000 * output_price)
    )
    
    return cost


def extract_provider_from_model(model: str) -> str:
    """
    Extract provider from model name
    """
    model_lower = model.lower()
    
    if "claude" in model_lower:
        return "anthropic"
    elif "gpt" in model_lower or model_lower.startswith("o1") or model_lower.startswith("o3"):
        return "openai"
    elif "gemini" in model_lower:
        return "google"
    elif any(x in model_lower for x in ["llama", "mistral", "qwen"]):
        return "ollama"
    
    return "unknown"
