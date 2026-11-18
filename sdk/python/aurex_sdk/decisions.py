from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

from aurex_sdk.exceptions import AurexBlocked
from aurex_sdk.prefix_shield import append_tail_instruction, canonicalize_json_keys
from aurex_sdk.pricing import extract_provider, normalize_model_name
from aurex_sdk.runtime_guard import sanitize_thinking_params

AurexAction = Literal["proceed", "downgrade", "compress", "block", "cache_suggest"]


@dataclass
class AurexDecision:
    action: AurexAction
    reason: str
    suggested_model: Optional[str] = None
    compressed_messages: Optional[List[Any]] = None
    loop_score: Optional[float] = None
    inject_system_instruction: Optional[str] = None
    original_model: Optional[str] = None
    response: Optional[str] = None
    shield_meta: Dict[str, Any] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    max_thinking_tokens: Optional[int] = None


MODEL_DOWNGRADE_MAP: Dict[str, str] = {
    "gpt-4o": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4o-mini",
    "gpt-4": "gpt-4o-mini",
    "gpt-5": "gpt-4o-mini",
    "gpt-5.1": "gpt-4o-mini",
    "gpt-4.1-mini": "gpt-4.1-nano",
    "o1": "o3-mini",
    "o3": "o4-mini",
    "o4-mini": "gpt-4o-mini",
    "claude-opus-4-20250514": "claude-3-5-haiku",
    "claude-3-opus": "claude-3-5-haiku",
    "claude-opus-4": "claude-3-5-haiku",
    "claude-sonnet-4": "claude-3-5-haiku",
    "claude-3-5-sonnet": "claude-3-5-haiku",
    "claude-sonnet-4-5-20250929": "claude-3-5-haiku",
    "gemini-2.5-pro": "gemini-2.5-flash",
    "gemini-1.5-pro": "gemini-1.5-flash",
    "deepseek-r1": "deepseek-v3",
}


def suggest_cheaper_model(model: str) -> Optional[str]:
    norm = normalize_model_name(model)
    try:
        from aurex_sdk.auditor import AurexAuditor

        if AurexAuditor._instance and getattr(AurexAuditor._instance, "downgrade_map", None):
            dm = AurexAuditor._instance.downgrade_map
            if norm in dm:
                return dm[norm]
    except Exception:
        pass

    if norm in MODEL_DOWNGRADE_MAP:
        return MODEL_DOWNGRADE_MAP[norm]
    if "gpt" in norm or norm.startswith(("o1", "o3", "o4")):
        return "gpt-4o-mini"
    if "claude" in norm:
        return "claude-3-5-haiku"
    if "gemini" in norm:
        return "gemini-2.5-flash"
    return None


EXPENSIVE_HINTS = ["opus", "gpt-4-turbo", "gpt-4o", "gpt-5", "o1", "sonnet-4", "gemini-2.5-pro"]


def is_expensive_model(model: str) -> bool:
    norm = normalize_model_name(model)
    if any(k in norm for k in ("mini", "haiku", "flash", "nano")):
        return False
    return any(h in norm for h in EXPENSIVE_HINTS)


def compress_messages(messages: Any) -> Any:
    """Deduplicate consecutive identical system messages within a single messages list."""
    if not isinstance(messages, list) or len(messages) < 2:
        return messages
    out = []
    last_system_hash = None
    for m in messages:
        if isinstance(m, dict) and m.get("role") == "system" and isinstance(m.get("content"), str):
            h = m["content"][:64]
            if h == last_system_hash:
                continue
            last_system_hash = h
        out.append(m)
    return out if out else messages


def apply_decision_to_call_params(params: Dict[str, Any], decision: AurexDecision) -> Dict[str, Any]:
    if decision.action == "block":
        raise AurexBlocked(
            f"[Aurex] Blocked: {decision.reason}",
            reason=decision.reason,
            action=decision.action,
        )
    next_params = dict(params)

    # Stage 1: Deterministically sort JSON schema keys so dict ordering never breaks prefix caches
    if "tools" in next_params and next_params["tools"] is not None:
        next_params["tools"] = canonicalize_json_keys(next_params["tools"])
    if "response_format" in next_params and isinstance(next_params["response_format"], (dict, list)):
        next_params["response_format"] = canonicalize_json_keys(next_params["response_format"])

    if decision.action == "downgrade" and decision.suggested_model:
        next_params["model"] = decision.suggested_model
        extra_metadata = next_params.get("extra_metadata", {})
        if not isinstance(extra_metadata, dict):
            extra_metadata = {}
        extra_metadata["aurex_original_model"] = decision.original_model or params.get("model")
        extra_metadata["aurex_model_downgraded"] = True
        next_params["extra_metadata"] = extra_metadata

    if decision.compressed_messages is not None:
        next_params["messages"] = decision.compressed_messages
    elif decision.action == "compress" and isinstance(next_params.get("messages"), list):
        next_params["messages"] = compress_messages(next_params["messages"])

    # Stage 1 Cache-Safety Invariant: Always append runtime instructions at the TAIL (never index 0!)
    if decision.inject_system_instruction:
        next_params = append_tail_instruction(next_params, decision.inject_system_instruction)

    # Stage 2: Clamp thinking token budgets & strip incompatible reasoning params on downgrade
    next_params = sanitize_thinking_params(
        next_params,
        is_downgraded=(decision.action == "downgrade" and bool(decision.suggested_model)),
        max_thinking_tokens=decision.max_thinking_tokens,
    )

    if decision.shield_meta:
        extra_metadata = next_params.get("extra_metadata")
        extra_dict = dict(extra_metadata) if isinstance(extra_metadata, dict) else {}
        extra_dict["stage1_shield"] = decision.shield_meta
        next_params["extra_metadata"] = extra_dict

    return next_params
