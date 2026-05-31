import re
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

def normalize_model_name(m: str) -> str:
    m = m.strip().lower()
    # 1. Strip fine-tuned model prefix
    ft_match = re.match(r"^ft:([^:]+)", m)
    if ft_match:
        m = ft_match.group(1)
    # 2. Split by colon to strip Ollama tags (e.g. llama3.1:8b -> llama3.1)
    m = m.split(':')[0]
    # 3. Split by slash to strip vendor/org prefixes (e.g. openrouter/google/gemini-2.5-flash -> gemini-2.5-flash)
    m = m.split('/')[-1]
    # 4. Strip Anthropic date suffixes (e.g. claude-3-5-sonnet-20241022 -> claude-3-5-sonnet)
    m = re.sub(r'-\d{8}$', '', m)
    # 5. Clean spacing/underscores to hyphens
    return re.sub(r"[\s_]+", "-", m)

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
    
    # Check custom downgrade target first dynamically from singleton auditor config
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
    if "gpt" in norm or norm.startswith("o1") or norm.startswith("o3") or norm.startswith("o4"):
        return "gpt-4o-mini"
    if "claude" in norm:
        return "claude-3-5-haiku"
    if "gemini" in norm:
        return "gemini-2.5-flash"
    return None

EXPENSIVE_HINTS = ["opus", "gpt-4-turbo", "gpt-4o", "gpt-5", "o1", "sonnet-4", "gemini-2.5-pro"]

def is_expensive_model(model: str) -> bool:
    norm = normalize_model_name(model)
    if "mini" in norm or "haiku" in norm or "flash" in norm or "nano" in norm:
        return False
    return any(h in norm for h in EXPENSIVE_HINTS)

def compress_messages(messages: Any) -> Any:
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

def extract_provider(model: str) -> str:
    model_lower = model.lower()
    if "claude" in model_lower:
        return "anthropic"
    elif "gpt" in model_lower or model_lower.startswith("o1") or model_lower.startswith("o3") or model_lower.startswith("o4"):
        return "openai"
    elif "gemini" in model_lower:
        return "google"
    elif any(x in model_lower for x in ["llama", "mistral", "qwen", "deepseek"]):
        return "ollama"
    return "unknown"

def apply_decision_to_call_params(params: Dict[str, Any], decision: AurexDecision) -> Dict[str, Any]:
    if decision.action == "block":
        raise Exception(f"[Aurex] Blocked: {decision.reason}")
    next_params = dict(params)
    model = next_params.get("model", "")
    provider = extract_provider(model)
    
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
        
    if decision.inject_system_instruction:
        if provider == "anthropic":
            current_system = next_params.get("system", "")
            if current_system:
                if isinstance(current_system, list):
                    # In Anthropic, system can be a list of text blocks. Let's make it a string.
                    current_system_str = "".join(getattr(b, "text", str(b)) if not isinstance(b, str) else b for b in current_system)
                    next_params["system"] = f"{decision.inject_system_instruction}\n{current_system_str}"
                else:
                    next_params["system"] = f"{decision.inject_system_instruction}\n{current_system}"
            else:
                next_params["system"] = decision.inject_system_instruction
        else:
            messages = list(next_params.get("messages", []))
            messages.insert(0, {"role": "system", "content": decision.inject_system_instruction})
            next_params["messages"] = messages
        
    return next_params

