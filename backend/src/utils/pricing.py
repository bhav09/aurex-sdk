"""
LLM Model Pricing Information
Prices per 1M tokens
"""

from typing import Dict, Tuple

# Pricing data (per 1M tokens)
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    # Anthropic
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-5-20250929": {"input": 3.00, "output": 15.00},
    "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
    "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "claude-3-7-sonnet-20250219": {"input": 3.00, "output": 15.00},
    
    # OpenAI
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "o1": {"input": 15.00, "output": 60.00},
    
    # Ollama (local, free)
    "llama3.1:70b": {"input": 0.0, "output": 0.0},
    "llama3.1:8b": {"input": 0.0, "output": 0.0},
    "qwen2.5:72b": {"input": 0.0, "output": 0.0},
    "mistral:7b": {"input": 0.0, "output": 0.0},
}


def get_model_pricing(model: str) -> Tuple[float, float]:
    """
    Get pricing for a model
    Returns (input_price, output_price) per 1M tokens
    """
    pricing = MODEL_PRICING.get(model)
    if pricing:
        return pricing["input"], pricing["output"]
    
    # Default fallback for unknown models
    # Assume expensive model pricing
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
    elif "gpt" in model_lower or model_lower.startswith("o1"):
        return "openai"
    elif any(x in model_lower for x in ["llama", "mistral", "qwen"]):
        return "ollama"
    
    return "unknown"


