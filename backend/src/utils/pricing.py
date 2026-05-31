"""
LLM Model Pricing Information
Prices per 1M tokens

Loads pricing from the auto-synced LiteLLM catalog (backend/data/model_pricing.json).
Falls back to a small built-in table if the synced file is missing.
Run `python scripts/sync_pricing.py` to refresh the catalog.
"""

import json
import re
import os
from typing import Dict, Tuple, Optional
from pathlib import Path

# Path to the auto-synced pricing catalog
_SYNCED_PRICING_PATH = Path(__file__).parent.parent.parent / "data" / "model_pricing.json"

# Loaded catalog cache (populated on first call)
_synced_catalog: Dict[str, Dict] = {}
_catalog_loaded: bool = False


# Semantic field mapping for pricing data
# Maps various possible field names to our standard format
PRICING_FIELD_MAPPINGS = {
    "input": [
        "input_price_per_1m",
        "input_cost_per_token",
        "input_price_per_million",
        "input_cost_per_1m_tokens",
        "prompt_price_per_1m",
        "prompt_cost_per_token",
        "input_token_price",
        "input",
    ],
    "output": [
        "output_price_per_1m",
        "output_cost_per_token",
        "output_price_per_million",
        "output_cost_per_1m_tokens",
        "completion_price_per_1m",
        "completion_cost_per_token",
        "output_token_price",
        "output",
    ],
}


def _extract_pricing_from_entry(entry: Dict) -> Optional[Tuple[float, float]]:
    """
    Extract input and output pricing from a catalog entry using semantic field mapping.
    Handles various field name formats and converts to per-1M token pricing.
    
    Returns:
        Tuple of (input_price_per_1m, output_price_per_1m) or None if not found
    """
    input_price = None
    output_price = None
    
    # Try to find input price using semantic mapping
    for field_name in PRICING_FIELD_MAPPINGS["input"]:
        if field_name in entry:
            value = entry[field_name]
            # If it's per-token pricing (very small numbers), convert to per-1M
            if "per_token" in field_name or (isinstance(value, (int, float)) and value < 0.01):
                input_price = value * 1_000_000
            else:
                input_price = value
            break
    
    # Try to find output price using semantic mapping
    for field_name in PRICING_FIELD_MAPPINGS["output"]:
        if field_name in entry:
            value = entry[field_name]
            # If it's per-token pricing (very small numbers), convert to per-1M
            if "per_token" in field_name or (isinstance(value, (int, float)) and value < 0.01):
                output_price = value * 1_000_000
            else:
                output_price = value
            break
    
    if input_price is not None and output_price is not None:
        return (input_price, output_price)
    
    return None


def _load_synced_catalog():
    """Load the auto-synced LiteLLM pricing JSON if available."""
    global _synced_catalog, _catalog_loaded
    _catalog_loaded = True

    if not _SYNCED_PRICING_PATH.exists():
        return

    try:
        with open(_SYNCED_PRICING_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _synced_catalog = data.get("models", {})
    except Exception:
        _synced_catalog = {}


# Built-in fallback pricing (used when synced catalog is unavailable)
BUILTIN_PRICING: Dict[str, Dict[str, float]] = {
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

# Median fallback pricing for unknown models (instead of max-tier $15/$60)
# Based on median of major providers: approximately Sonnet-tier pricing
_MEDIAN_FALLBACK = (1.50, 6.00)


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


def get_model_pricing(model: str, pricing_overrides: Optional[Dict[str, Tuple[float, float]]] = None) -> Tuple[float, float]:
    """
    Get pricing for a model.
    Returns (input_price, output_price) per 1M tokens.

    Resolution order:
    1. Custom pricing overrides (company-level)
    2. Synced LiteLLM catalog (1,900+ models)
    3. Built-in fallback table
    4. Median-tier fallback ($1.50/$6.00) instead of max-tier
    """
    if not model:
        return _MEDIAN_FALLBACK

    query_norm = normalize_model_name(model)

    # 1. Custom pricing overrides
    if pricing_overrides:
        if query_norm in pricing_overrides:
            return pricing_overrides[query_norm]
        for key, val in pricing_overrides.items():
            if key in query_norm or query_norm in key:
                return val

    # Lazy-load the synced catalog on first call
    global _catalog_loaded
    if not _catalog_loaded:
        _load_synced_catalog()

    # 2. Try synced catalog (exact match)
    if query_norm in _synced_catalog:
        entry = _synced_catalog[query_norm]
        pricing = _extract_pricing_from_entry(entry)
        if pricing:
            return pricing

    # 3. Try built-in table (exact match)
    pricing = BUILTIN_PRICING.get(query_norm)
    if pricing:
        return pricing["input"], pricing["output"]

    # 4. Try synced catalog (substring match, longest key first)
    if _synced_catalog:
        sorted_keys = sorted(_synced_catalog.keys(), key=len, reverse=True)
        for key in sorted_keys:
            if key in query_norm or query_norm in key:
                entry = _synced_catalog[key]
                pricing = _extract_pricing_from_entry(entry)
                if pricing:
                    return pricing

    # 5. Try built-in table (substring match)
    sorted_builtin = sorted(BUILTIN_PRICING.keys(), key=len, reverse=True)
    for key in sorted_builtin:
        if key in query_norm:
            return BUILTIN_PRICING[key]["input"], BUILTIN_PRICING[key]["output"]

    # 6. Median fallback for truly unknown models (not max-tier)
    return _MEDIAN_FALLBACK


def get_cached_input_pricing(model: str) -> float:
    """
    Get the cached input token price per 1M tokens for a model.
    Returns 0.0 if no cache pricing is available.
    """
    if not model:
        return 0.0

    global _catalog_loaded
    if not _catalog_loaded:
        _load_synced_catalog()

    query_norm = normalize_model_name(model)

    if query_norm in _synced_catalog:
        return _synced_catalog[query_norm].get("cached_input_price_per_1m") or 0.0

    return 0.0


def calculate_cost(
    model: str, 
    input_tokens: int, 
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    pricing_overrides: Optional[Dict[str, Tuple[float, float]]] = None
) -> float:
    """
    Calculate cost for a given model and token usage, accounting for prompt caching
    """
    input_price, output_price = get_model_pricing(model, pricing_overrides=pricing_overrides)
    provider = extract_provider_from_model(model)
    
    standard_input = max(0, input_tokens - cache_read_tokens - cache_creation_tokens)
    
    # Cache pricing multipliers
    cache_read_mult = 1.0
    cache_create_mult = 1.0
    
    if provider == "anthropic":
        cache_read_mult = 0.10
        cache_create_mult = 1.25
    elif provider == "openai":
        cache_read_mult = 0.50
        cache_create_mult = 1.0
    elif provider == "google":
        cache_read_mult = 0.25
        cache_create_mult = 1.0
        
    cost = (
        (standard_input * input_price) +
        (cache_read_tokens * input_price * cache_read_mult) +
        (cache_creation_tokens * input_price * cache_create_mult) +
        (output_tokens * output_price)
    ) / 1_000_000
    
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

    # Try synced catalog for provider info
    global _catalog_loaded
    if not _catalog_loaded:
        _load_synced_catalog()

    query_norm = normalize_model_name(model)
    if query_norm in _synced_catalog:
        return _synced_catalog[query_norm].get("provider", "unknown")

    return "unknown"
