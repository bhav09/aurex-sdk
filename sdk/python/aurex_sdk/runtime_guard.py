"""Stage 2: In-Flight Runtime Guard helpers (endpoint provider, thinking caps, stream & Responses API)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from aurex_sdk.pricing import extract_provider, normalize_model_name

NON_REASONING_HINTS = ("mini", "nano", "haiku", "flash", "gpt-3.5", "gpt-4o", "gpt-4-turbo")


def extract_client_base_url(resource_self: Any, kwargs: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Read base_url from an OpenAI-compatible SDK resource or call kwargs."""
    if kwargs:
        for key in ("base_url", "api_base"):
            if kwargs.get(key):
                return str(kwargs[key])
    client = getattr(resource_self, "_client", None) or resource_self
    base = getattr(client, "base_url", None) or getattr(client, "_base_url", None)
    return str(base) if base else None


def resolve_endpoint_provider(model: str, base_url: Optional[str] = None) -> str:
    """Resolve real billing provider using client base_url (distinguishes localhost from Groq/Together/etc.)."""
    if base_url:
        b = base_url.lower()
        if any(h in b for h in ("localhost", "127.0.0.1", "0.0.0.0", ":11434")):
            return "ollama"
        for domain, prov in (
            ("groq.com", "groq"),
            ("together.xyz", "together"),
            ("fireworks.ai", "fireworks"),
            ("openrouter.ai", "openrouter"),
            ("amazonaws.com", "bedrock"),
            ("azure.com", "azure"),
            ("googleapis.com", "google"),
            ("anthropic.com", "anthropic"),
            ("openai.com", "openai"),
        ):
            if domain in b:
                return prov
    return extract_provider(model)


def is_reasoning_capable_model(model: str) -> bool:
    norm = normalize_model_name(model)
    if norm.startswith(("o1", "o3", "o4")) or "deepseek-r1" in norm:
        return True
    if any(x in norm for x in ("opus-4", "sonnet-4", "3-7-sonnet", "gpt-5", "gemini-2.5-pro")):
        return True
    if any(h in norm for h in NON_REASONING_HINTS):
        return False
    return False


def sanitize_thinking_params(
    params: Dict[str, Any],
    *,
    is_downgraded: bool = False,
    max_thinking_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Strip incompatible thinking params on downgrade and clamp thinking budgets when configured."""
    out = dict(params)
    target_model = str(out.get("model") or "")

    # Strip reasoning/thinking fields when downgraded to a non-reasoning model (prevents HTTP 400)
    if is_downgraded and not is_reasoning_capable_model(target_model):
        out.pop("reasoning_effort", None)
        out.pop("reasoning", None)
        out.pop("thinking", None)
        return out

    if max_thinking_tokens is not None and max_thinking_tokens > 0:
        # Anthropic thinking={"type": "enabled", "budget_tokens": N}
        thinking = out.get("thinking")
        if isinstance(thinking, dict) and "budget_tokens" in thinking:
            clamped = max(1024, min(int(thinking["budget_tokens"]), int(max_thinking_tokens)))
            out["thinking"] = {**thinking, "budget_tokens": clamped}

        # OpenAI reasoning_effort ("low" | "medium" | "high")
        target_effort = "low" if max_thinking_tokens <= 2048 else ("medium" if max_thinking_tokens <= 8192 else "high")
        if out.get("reasoning_effort") == "high" and target_effort != "high":
            out["reasoning_effort"] = target_effort
        reasoning_obj = out.get("reasoning")
        if isinstance(reasoning_obj, dict) and reasoning_obj.get("effort") == "high" and target_effort != "high":
            out["reasoning"] = {**reasoning_obj, "effort": target_effort}

    return out


def ensure_openai_stream_usage(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Auto-inject stream_options={'include_usage': True} on OpenAI-compatible streams."""
    if kwargs.get("stream") is not True:
        return kwargs
    out = dict(kwargs)
    opts = out.get("stream_options")
    if opts is None:
        out["stream_options"] = {"include_usage": True}
    elif isinstance(opts, dict) and "include_usage" not in opts:
        out["stream_options"] = {**opts, "include_usage": True}
    return out


def disable_sdk_internal_retries(resource_self: Any, resilience_enforced: bool) -> Any:
    """Prevent 2x3=6 retry storms when Aurex resilience (enforce mode) manages retries."""
    if not resilience_enforced:
        return resource_self
    with_opts = getattr(resource_self, "with_options", None)
    if callable(with_opts):
        try:
            return with_opts(max_retries=0)
        except Exception:
            return resource_self
    return resource_self


def normalize_responses_api_input(kwargs: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], List[Dict[str, Any]]]:
    """Normalize OpenAI client.responses.create(input=..., instructions=...) into standard messages."""
    system_prompt = kwargs.get("instructions") if isinstance(kwargs.get("instructions"), str) else None
    raw_input = kwargs.get("input")
    messages: List[Dict[str, Any]] = []
    user_prompt: Optional[str] = None

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    if isinstance(raw_input, str):
        user_prompt = raw_input
        messages.append({"role": "user", "content": raw_input})
    elif isinstance(raw_input, list):
        for item in raw_input:
            if isinstance(item, dict):
                messages.append(item)
                if item.get("role") == "user" and isinstance(item.get("content"), str):
                    user_prompt = item["content"]

    return user_prompt, system_prompt, messages


def extract_responses_api_usage(resp: Any) -> Dict[str, Any]:
    """Extract tokens and text from an OpenAI Responses API response object."""
    usage = getattr(resp, "usage", None) or (resp.get("usage") if isinstance(resp, dict) else None)
    in_toks = 0
    out_toks = 0
    cached_toks = 0
    reasoning_toks = 0

    if usage is not None:
        in_toks = int(getattr(usage, "input_tokens", 0) or (usage.get("input_tokens", 0) if isinstance(usage, dict) else 0) or 0)
        out_toks = int(getattr(usage, "output_tokens", 0) or (usage.get("output_tokens", 0) if isinstance(usage, dict) else 0) or 0)
        in_details = getattr(usage, "input_tokens_details", None) or (usage.get("input_tokens_details") if isinstance(usage, dict) else None)
        if in_details:
            cached_toks = int(getattr(in_details, "cached_tokens", 0) or (in_details.get("cached_tokens", 0) if isinstance(in_details, dict) else 0) or 0)
        out_details = getattr(usage, "output_tokens_details", None) or (usage.get("output_tokens_details") if isinstance(usage, dict) else None)
        if out_details:
            reasoning_toks = int(getattr(out_details, "reasoning_tokens", 0) or (out_details.get("reasoning_tokens", 0) if isinstance(out_details, dict) else 0) or 0)

    text = getattr(resp, "output_text", None)
    if text is None and isinstance(resp, dict):
        text = resp.get("output_text")

    return {
        "input_tokens": in_toks,
        "output_tokens": out_toks,
        "cached_tokens": cached_toks,
        "reasoning_tokens": reasoning_toks,
        "response_text": text,
    }


# Lightweight stdlib response shims (used ONLY for user-configured on_cache_hit callbacks; zero unittest.mock)
@dataclass
class _CacheUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    prompt_token_count: int = 0
    candidates_token_count: int = 0


@dataclass
class _CacheMessage:
    content: str
    role: str = "assistant"
    tool_calls: Optional[List[Any]] = None


@dataclass
class _CacheChoice:
    message: _CacheMessage
    finish_reason: str = "stop"


@dataclass
class _CacheTextBlock:
    text: str
    type: str = "text"


@dataclass
class CachedProviderResponse:
    model: str
    text: str
    choices: List[_CacheChoice] = field(default_factory=list)
    content: List[_CacheTextBlock] = field(default_factory=list)
    usage: _CacheUsage = field(default_factory=_CacheUsage)
    usage_metadata: _CacheUsage = field(default_factory=_CacheUsage)

    def model_dump(self) -> Dict[str, Any]:
        return {
            "model": self.model,
            "choices": [{"message": {"role": "assistant", "content": self.text}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }


def build_cached_response(provider: str, response_text: str, model: str) -> Any:
    if provider == "ollama":
        return {
            "model": model,
            "message": {"role": "assistant", "content": response_text},
            "done": True,
            "prompt_eval_count": 0,
            "eval_count": 0,
        }
    return CachedProviderResponse(
        model=model,
        text=response_text,
        choices=[_CacheChoice(message=_CacheMessage(content=response_text))],
        content=[_CacheTextBlock(text=response_text)],
    )
