"""Stage 1: Pre-Call Prefix Cache-Shield & 200k Cliff Guard helpers."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from aurex_sdk.pricing import check_cliff_status, extract_provider
from aurex_sdk.state_store import StateStore

ANTHROPIC_DEFAULT_TTL_SEC = 300.0
EXTENDED_TTL_SEC = 3600.0
DYNAMIC_TOKEN_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|[0-9a-f]{8}-[0-9a-f]{4}|\b\d{10,13}\b)",
    re.IGNORECASE,
)


@dataclass
class PrefixShieldReport:
    prefix_broken: bool = False
    broken_layer: Optional[str] = None
    mutating_offset: Optional[int] = None
    mutation_kind: Optional[str] = None
    idle_ttl_risk: bool = False
    idle_gap_seconds: Optional[float] = None
    crossed_200k_cliff: bool = False
    near_200k_cliff: bool = False
    cliff_surcharge_usd: float = 0.0
    warnings: List[str] = field(default_factory=list)

    def to_metadata(self) -> Dict[str, Any]:
        meta: Dict[str, Any] = {}
        if self.prefix_broken:
            meta["prefix_broken"] = True
            meta["broken_layer"] = self.broken_layer
            meta["mutating_offset"] = self.mutating_offset
            meta["mutation_kind"] = self.mutation_kind
        if self.idle_ttl_risk:
            meta["idle_ttl_risk"] = True
            meta["idle_gap_seconds"] = round(self.idle_gap_seconds or 0.0, 1)
        if self.crossed_200k_cliff or self.near_200k_cliff:
            meta["crossed_200k_cliff"] = self.crossed_200k_cliff
            meta["near_200k_cliff"] = self.near_200k_cliff
            meta["cliff_surcharge_usd"] = self.cliff_surcharge_usd
        return meta


def canonicalize_json_keys(obj: Any) -> Any:
    """Recursively sort dict keys so unstable schema ordering never busts prefix caches."""
    if isinstance(obj, dict):
        return {k: canonicalize_json_keys(obj[k]) for k in sorted(obj.keys(), key=str)}
    if isinstance(obj, list):
        return [canonicalize_json_keys(item) for item in obj]
    return obj


def _sha256(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def find_first_mutating_offset(prev_text: str, curr_text: str) -> Tuple[Optional[int], Optional[str]]:
    """Return exact character index where two prefix strings diverge and classify the mutation."""
    if not prev_text or not curr_text or prev_text == curr_text:
        return None, None
    limit = min(len(prev_text), len(curr_text))
    offset = limit
    for idx in range(limit):
        if prev_text[idx] != curr_text[idx]:
            offset = idx
            break
    window_start = max(0, offset - 10)
    window = curr_text[window_start : offset + 32]
    kind = "timestamp_or_id" if DYNAMIC_TOKEN_RE.search(window) else "text_edit"
    return offset, kind


def extract_effective_system(
    system_prompt: Optional[Any] = None,
    messages: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Extract canonicalized system/developer instruction layer (preserving cache_control metadata)."""
    if system_prompt:
        if isinstance(system_prompt, str):
            return system_prompt
        return json.dumps(canonicalize_json_keys(system_prompt), default=str)
    if messages:
        parts: List[str] = []
        for m in messages:
            if isinstance(m, dict) and m.get("role") in ("system", "developer"):
                content = m.get("content")
                if isinstance(content, str):
                    parts.append(content)
                elif content is not None:
                    parts.append(json.dumps(canonicalize_json_keys(content), default=str))
        if parts:
            return "\n".join(parts)
    return ""


def inspect_pre_call_shield(
    *,
    state_store: StateStore,
    workflow_id: str,
    model: str,
    estimated_tokens: int,
    now: float,
    system_prompt: Optional[Any] = None,
    messages: Optional[List[Dict[str, Any]]] = None,
    tools: Optional[Any] = None,
    default_pricing: Optional[Dict[str, float]] = None,
    provider: Optional[str] = None,
) -> PrefixShieldReport:
    """Stage 1 pre-call inspection: silent prefix mutations, >5m TTL traps, and 200k cliffs."""
    report = PrefixShieldReport()
    resolved_prov = provider or extract_provider(model)

    effective_system = extract_effective_system(system_prompt, messages)

    canon_tools_str = json.dumps(canonicalize_json_keys(tools), default=str) if tools else ""
    tools_hash = _sha256(canon_tools_str)
    system_hash = _sha256(effective_system)

    prev = state_store.get_prefix_state(workflow_id)
    if prev and workflow_id != "default_workflow":
        # 1. Check silent prefix cache-breakers across consecutive turns
        prev_sys_hash = prev.get("system_hash")
        prev_tools_hash = prev.get("tools_hash")

        if prev_tools_hash and tools_hash and prev_tools_hash != tools_hash:
            report.prefix_broken = True
            report.broken_layer = "tools"
            offset, kind = find_first_mutating_offset(prev.get("tools_sample", ""), canon_tools_str[:4096])
            report.mutating_offset = offset
            report.mutation_kind = kind or "schema_change"
            report.warnings.append(
                f"Prefix cache broken in '{workflow_id}': tool definitions mutated at char {offset}."
            )
        elif prev_sys_hash and system_hash and prev_sys_hash != system_hash:
            report.prefix_broken = True
            report.broken_layer = "system"
            offset, kind = find_first_mutating_offset(prev.get("system_sample", ""), effective_system[:4096])
            report.mutating_offset = offset
            report.mutation_kind = kind
            hint = "dynamic timestamp/ID" if kind == "timestamp_or_id" else "text edit"
            report.warnings.append(
                f"Prefix cache broken in '{workflow_id}': system prompt mutated at char {offset} ({hint}). Move dynamic values to the end of the user message."
            )

        # 2. Check idle TTL traps (Anthropic 5m 1.25x rewrite & Gemini >1h idle explicit cache)
        last_ts = prev.get("last_timestamp")
        if last_ts is not None and estimated_tokens >= 1024:
            gap = now - float(last_ts)
            if resolved_prov == "anthropic" and ANTHROPIC_DEFAULT_TTL_SEC < gap <= EXTENDED_TTL_SEC:
                report.idle_ttl_risk = True
                report.idle_gap_seconds = gap
                report.warnings.append(
                    f"Anthropic 5m cache TTL expired after {int(gap)}s idle in '{workflow_id}' (triggers 1.25x cache_creation rewrite; consider 1h TTL or compacting)."
                )
            elif resolved_prov == "google" and gap > EXTENDED_TTL_SEC:
                report.idle_ttl_risk = True
                report.idle_gap_seconds = gap
                report.warnings.append(
                    f"Gemini context idle for {int(gap)}s in '{workflow_id}'; verify explicit cachedContent TTL is not billing idle hourly storage."
                )

    # 3. Check >200k 2x whole-request context pricing cliff
    cliff = check_cliff_status(model, estimated_tokens, default_pricing=default_pricing, provider=resolved_prov)
    report.crossed_200k_cliff = cliff["crossed_cliff"]
    report.near_200k_cliff = cliff["near_cliff"]
    report.cliff_surcharge_usd = cliff["surcharge_usd"]

    if report.crossed_200k_cliff:
        report.warnings.append(
            f"200k context cliff crossed ({estimated_tokens:,} tokens) on {model}: entire request bills at 2x (+${report.cliff_surcharge_usd:.4f} input surcharge)."
        )
    elif report.near_200k_cliff:
        remaining = 200_000 - estimated_tokens
        report.warnings.append(
            f"Approaching 200k 2x pricing cliff on {model}: {estimated_tokens:,} tokens ({remaining:,} tokens left before 2x whole-request surcharge)."
        )

    # Persist current prefix snapshot (truncated sample kept local in StateStore for offset diffing)
    state_store.set_prefix_state(
        workflow_id,
        {
            "tools_hash": tools_hash,
            "system_hash": system_hash,
            "tools_sample": canon_tools_str[:4096],
            "system_sample": effective_system[:4096],
            "last_timestamp": now,
            "model": model,
        },
    )
    return report


def append_tail_instruction(params: Dict[str, Any], instruction: str) -> Dict[str, Any]:
    """Append runtime guidance at the tail of messages/input/contents so static prefix caches never break."""
    if not instruction:
        return params
    next_params = dict(params)
    suffix = f"\n\n[Aurex Guidance: {instruction}]"

    # OpenAI Responses API uses `input` instead of `messages`
    if "input" in next_params and "messages" not in next_params:
        raw_in = next_params.get("input")
        if isinstance(raw_in, str):
            next_params["input"] = f"{raw_in}{suffix}"
        elif isinstance(raw_in, list):
            items = list(raw_in)
            if items and isinstance(items[-1], dict) and items[-1].get("role") == "user" and isinstance(items[-1].get("content"), str):
                items[-1] = {**items[-1], "content": f"{items[-1]['content']}{suffix}"}
            else:
                items.append({"role": "user", "content": instruction})
            next_params["input"] = items
        return next_params

    # Google Gemini API uses `contents` instead of `messages`
    if "contents" in next_params and "messages" not in next_params:
        raw_c = next_params.get("contents")
        if isinstance(raw_c, str):
            next_params["contents"] = f"{raw_c}{suffix}"
        elif isinstance(raw_c, list):
            items = list(raw_c)
            if items and isinstance(items[-1], str):
                items[-1] = f"{items[-1]}{suffix}"
            else:
                items.append(suffix.strip())
            next_params["contents"] = items
        return next_params

    messages = list(next_params.get("messages") or [])
    if messages and isinstance(messages[-1], dict) and messages[-1].get("role") == "user":
        last_msg = dict(messages[-1])
        if isinstance(last_msg.get("content"), str):
            last_msg["content"] = f"{last_msg['content']}{suffix}"
            messages[-1] = last_msg
            next_params["messages"] = messages
            return next_params

    messages.append({"role": "user", "content": instruction})
    next_params["messages"] = messages
    return next_params
