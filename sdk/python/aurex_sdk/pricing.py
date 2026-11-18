"""Shared pricing, tiered 200k cliff math, and token counting engine (Stages 1-3)."""

from __future__ import annotations

import fnmatch
import json
import re
from typing import Any, Dict, List, Optional, Tuple

CLIFF_THRESHOLD_TOKENS = 200_000
NEAR_CLIFF_TOKENS = 180_000

PAID_CLOUD_PREFIXES = (
    "groq/",
    "together/",
    "together_ai/",
    "fireworks/",
    "fireworks_ai/",
    "openrouter/",
    "bedrock/",
    "amazon.",
    "meta.",
    "vertex_ai/",
    "azure/",
    "deepinfra/",
)

# Prices in USD per 1M tokens
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4.1": {"input": 2.00, "output": 8.00},
    "gpt-4.1-mini": {"input": 0.40, "output": 1.60},
    "gpt-4.1-nano": {"input": 0.10, "output": 0.40},
    "gpt-5": {"input": 5.00, "output": 15.00},
    "gpt-5.1": {"input": 5.00, "output": 15.00},
    "o3-mini": {"input": 1.10, "output": 4.40},
    "o3": {"input": 10.00, "output": 40.00},
    "o4-mini": {"input": 1.10, "output": 4.40},
    "o1": {"input": 15.00, "output": 60.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-2.5-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.5-flash-lite": {"input": 0.00, "output": 0.00},
    "claude-opus-4": {"input": 15.00, "output": 75.00},
    "claude-opus-4-20250514": {"input": 15.00, "output": 75.00},
    "claude-3-opus": {"input": 15.00, "output": 75.00},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-sonnet-4": {"input": 3.00, "output": 15.00},
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
    "deepseek-r1": {"input": 0.55, "output": 2.19},
    "deepseek-v3": {"input": 0.27, "output": 1.10},
    "mistral-large": {"input": 2.00, "output": 6.00},
    # Local Ollama defaults ($0 when run locally)
    "llama3.1": {"input": 0.0, "output": 0.0},
    "llama-3.1": {"input": 0.0, "output": 0.0},
    "llama-3.3": {"input": 0.0, "output": 0.0},
    "llama-4-scout": {"input": 0.0, "output": 0.0},
    "llama-4-maverick": {"input": 0.0, "output": 0.0},
    "qwen2.5": {"input": 0.0, "output": 0.0},
    "qwen3": {"input": 0.0, "output": 0.0},
    "mistral": {"input": 0.0, "output": 0.0},
}

# Cloud-hosted open-weight model pricing when invoked through a paid API provider
HOSTED_OPEN_WEIGHT_PRICING: Dict[str, Dict[str, float]] = {
    "llama-4-maverick": {"input": 0.27, "output": 0.85},
    "llama-4-scout": {"input": 0.18, "output": 0.60},
    "llama-3.3-70b": {"input": 0.59, "output": 0.79},
    "llama-3.1-70b": {"input": 0.59, "output": 0.79},
    "llama3-70b": {"input": 0.59, "output": 0.79},
    "llama-3.1-8b": {"input": 0.05, "output": 0.08},
    "llama3-8b": {"input": 0.05, "output": 0.08},
    "qwen2.5-72b": {"input": 0.35, "output": 0.40},
    "qwen3": {"input": 0.30, "output": 0.60},
    "mistral-7b": {"input": 0.15, "output": 0.15},
}

_TIKTOKEN_ENC: Any = False


def _get_tiktoken_encoder() -> Any:
    global _TIKTOKEN_ENC
    if _TIKTOKEN_ENC is False:
        try:
            import tiktoken  # type: ignore
            _TIKTOKEN_ENC = tiktoken.get_encoding("o200k_base")
        except Exception:
            _TIKTOKEN_ENC = None
    return _TIKTOKEN_ENC


def count_text_tokens(text: Optional[str]) -> int:
    """Count tokens using tiktoken if available, else token-aware regex fallback."""
    if not text:
        return 0
    enc = _get_tiktoken_encoder()
    if enc is not None:
        try:
            return max(1, len(enc.encode(text)))
        except Exception:
            pass
    # Token-aware fallback: each word/punctuation piece is >=1 BPE token; long tokens scale with len//4
    pieces = re.findall(r"\w+|[^\w\s]", text)
    return max(1, len(pieces), len(text) // 4)


def count_request_tokens(
    prompt: Optional[str] = None,
    system_prompt: Optional[str] = None,
    messages: Optional[List[Dict[str, Any]]] = None,
    tools: Optional[Any] = None,
    response_format: Optional[Any] = None,
) -> int:
    """Estimate total input tokens across messages, multimodal blocks, and schemas."""
    total = 0
    has_system_in_messages = False

    if messages and isinstance(messages, list):
        for msg in messages:
            if not isinstance(msg, dict):
                total += count_text_tokens(str(msg))
                continue
            if msg.get("role") == "system":
                has_system_in_messages = True
            content = msg.get("content")
            if isinstance(content, str):
                total += count_text_tokens(content) + 4
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        btype = block.get("type", "")
                        if btype in ("image", "image_url", "input_image"):
                            total += 765
                        elif "text" in block:
                            total += count_text_tokens(str(block["text"]))
                        else:
                            total += count_text_tokens(json.dumps(block, default=str))
                    else:
                        total += count_text_tokens(str(getattr(block, "text", block)))
            if msg.get("tool_calls"):
                total += count_text_tokens(json.dumps(msg["tool_calls"], default=str))
    elif prompt:
        total += count_text_tokens(prompt)

    if system_prompt and not has_system_in_messages:
        total += count_text_tokens(system_prompt)
    if tools:
        total += count_text_tokens(json.dumps(tools, sort_keys=True, default=str))
    if response_format and isinstance(response_format, (dict, list)):
        total += count_text_tokens(json.dumps(response_format, sort_keys=True, default=str))

    return max(1, total)


def normalize_model_name(m: str) -> str:
    m = m.strip().lower()
    ft_match = re.match(r"^ft:([^:]+)", m)
    if ft_match:
        m = ft_match.group(1)
    m = m.split(":")[0]
    m = m.split("/")[-1]
    m = re.sub(r"-\d{8}$", "", m)
    return re.sub(r"[\s_]+", "-", m)


def is_paid_cloud_open_weight(model: str, provider: Optional[str] = None) -> bool:
    ml = (model or "").strip().lower()
    prov = (provider or "").strip().lower()
    if ml.startswith("ollama/") or ml.startswith("local/") or prov == "ollama":
        return False
    if prov in ("groq", "together", "fireworks", "openrouter", "bedrock", "azure", "vertex"):
        return True
    return any(ml.startswith(p) for p in PAID_CLOUD_PREFIXES)


def extract_provider(model: str) -> str:
    ml = (model or "").lower().strip()
    for prefix, prov in (
        ("groq/", "groq"),
        ("together/", "together"),
        ("together_ai/", "together"),
        ("fireworks/", "fireworks"),
        ("openrouter/", "openrouter"),
        ("bedrock/", "bedrock"),
        ("amazon.", "bedrock"),
        ("ollama/", "ollama"),
    ):
        if ml.startswith(prefix):
            return prov
    if "/" in ml and not any(x in ml for x in ("openai/", "google/", "anthropic/", "bedrock/", "vertex_ai/")):
        return "huggingface"
    if "claude" in ml:
        return "anthropic"
    if "gpt" in ml or ml.startswith(("o1", "o3", "o4")):
        return "openai"
    if "gemini" in ml:
        return "google"
    if any(x in ml for x in ("llama", "mistral", "qwen", "deepseek")):
        return "ollama"
    return "unknown"


def get_model_pricing(
    model: str,
    default_pricing: Optional[Dict[str, float]] = None,
    provider: Optional[str] = None,
) -> Tuple[float, float]:
    if not model:
        return (default_pricing.get("input", 1.50), default_pricing.get("output", 6.00)) if default_pricing else (1.50, 6.00)

    query_norm = normalize_model_name(model)

    for pattern, pricing in MODEL_PRICING.items():
        if any(c in pattern for c in ("*", "?", "[")) and fnmatch.fnmatch(query_norm, pattern):
            return pricing["input"], pricing["output"]

    # Hosted cloud open-weight override (prevents $0.00 bug on Groq/Together/Bedrock/OpenRouter)
    if is_paid_cloud_open_weight(model, provider):
        for key in sorted(HOSTED_OPEN_WEIGHT_PRICING.keys(), key=len, reverse=True):
            if key in query_norm:
                hp = HOSTED_OPEN_WEIGHT_PRICING[key]
                return hp["input"], hp["output"]

    if query_norm in MODEL_PRICING:
        p = MODEL_PRICING[query_norm]
        return p["input"], p["output"]

    for key in sorted(MODEL_PRICING.keys(), key=len, reverse=True):
        if key in query_norm:
            p = MODEL_PRICING[key]
            return p["input"], p["output"]

    if (provider or extract_provider(model)) == "huggingface":
        return 0.0, 0.0

    if default_pricing:
        return default_pricing.get("input", 1.50), default_pricing.get("output", 6.00)
    return 1.50, 6.00


def has_200k_cliff(model: str, provider: Optional[str] = None) -> bool:
    prov = provider or extract_provider(model)
    norm = normalize_model_name(model)
    if prov in ("anthropic", "google"):
        return MODEL_PRICING.get(norm, {"input": 1.0}).get("input", 1.0) > 0
    return False


def check_cliff_status(
    model: str,
    input_tokens: int,
    default_pricing: Optional[Dict[str, float]] = None,
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    applies = has_200k_cliff(model, provider)
    crossed = applies and input_tokens > CLIFF_THRESHOLD_TOKENS
    near = applies and (NEAR_CLIFF_TOKENS <= input_tokens <= CLIFF_THRESHOLD_TOKENS)
    in_price, _ = get_model_pricing(model, default_pricing=default_pricing, provider=provider)
    base_in_cost = (input_tokens / 1_000_000) * in_price
    return {
        "applies": applies,
        "crossed_cliff": crossed,
        "near_cliff": near,
        "multiplier": 2.0 if crossed else 1.0,
        "surcharge_usd": round(base_in_cost, 6) if crossed else 0.0,
    }


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    cache_write_tokens: int = 0,
    is_batch: bool = False,
    cache_ttl: str = "5m",
    default_pricing: Optional[Dict[str, float]] = None,
    provider: Optional[str] = None,
) -> float:
    """Cache-aware and >200k-cliff-aware LLM cost calculation."""
    resolved_prov = provider or extract_provider(model)
    in_price, out_price = get_model_pricing(model, default_pricing=default_pricing, provider=resolved_prov)

    cliff_mult = 2.0 if (has_200k_cliff(model, resolved_prov) and input_tokens > CLIFF_THRESHOLD_TOKENS) else 1.0
    in_price *= cliff_mult
    out_price *= cliff_mult

    non_cached = max(0, input_tokens - cached_tokens - cache_write_tokens)

    if resolved_prov == "anthropic":
        read_mult = 0.10
        write_mult = 2.00 if cache_ttl == "1h" else 1.25
    elif resolved_prov == "openai":
        read_mult, write_mult = 0.50, 1.00
    else:
        read_mult, write_mult = 0.25, 1.00

    cost = (
        (non_cached / 1_000_000 * in_price)
        + (cached_tokens / 1_000_000 * in_price * read_mult)
        + (cache_write_tokens / 1_000_000 * in_price * write_mult)
        + (output_tokens / 1_000_000 * out_price)
    )
    return cost * 0.50 if is_batch else cost
