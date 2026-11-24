"""Stage 2: In-Flight Runtime Guard helpers (wire stripping, drift diagnostics, thinking caps, stream & Responses API)."""

from __future__ import annotations

import json
import os
import warnings
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from aurex_sdk.exceptions import AurexProviderDriftError, AurexProviderWarning
from aurex_sdk.pricing import count_text_tokens, extract_provider, normalize_model_name

NON_REASONING_HINTS = ("mini", "nano", "haiku", "flash", "gpt-3.5", "gpt-4o", "gpt-4-turbo")
_AUREX_TOP_KEYS = (
    "workflow_id",
    "workflowId",
    "tags",
    "quality_score",
    "qualityScore",
    "tenant_id",
    "tenantId",
    "extra_metadata",
)
_AUREX_META_KEYS = ("workflow_id", "workflowId", "tags", "quality_score", "qualityScore", "tenant_id", "tenantId")


def report_provider_drift(
    *,
    provider: str,
    missing_symbol: str,
    message: str,
    provider_version: Optional[str] = None,
    strict: Optional[bool] = None,
    drift_log: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Emit AurexProviderWarning in prod (fail-open) or raise AurexProviderDriftError in strict/CI mode."""
    entry = {
        "provider": provider,
        "provider_version": provider_version,
        "missing_symbol": missing_symbol,
        "message": message,
    }
    if drift_log is not None:
        drift_log.append(entry)
    is_strict = (os.getenv("AUREX_STRICT_DRIFT", "0") in ("1", "true", "True")) if strict is None else bool(strict)
    if is_strict:
        raise AurexProviderDriftError(
            message,
            provider=provider,
            provider_version=provider_version,
            missing_symbol=missing_symbol,
        )
    warnings.warn(message, AurexProviderWarning, stacklevel=2)


def strip_aurex_params(
    kwargs: Dict[str, Any],
    *,
    provider: Optional[str] = None,
    ctx: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Strip Aurex-only kwargs/metadata before wire calls so strict provider SDKs never reject requests."""
    clean = dict(kwargs)
    ctx_d = ctx or {}

    tags = clean.pop("tags", None)
    quality_score = clean.pop("quality_score", None)
    if quality_score is None:
        quality_score = clean.pop("qualityScore", None)
    else:
        clean.pop("qualityScore", None)
    workflow_id = clean.pop("workflow_id", None) or clean.pop("workflowId", None)
    clean.pop("workflowId", None)
    tenant_id = clean.pop("tenant_id", None) or clean.pop("tenantId", None)
    clean.pop("tenantId", None)
    extra_meta_in = clean.pop("extra_metadata", None)
    aurex_meta: Dict[str, Any] = dict(extra_meta_in) if isinstance(extra_meta_in, dict) else {}

    raw_meta = clean.get("metadata")
    if isinstance(raw_meta, dict):
        meta_copy = dict(raw_meta)
        m_tags = meta_copy.pop("tags", None)
        m_q1 = meta_copy.pop("quality_score", None)
        m_q2 = meta_copy.pop("qualityScore", None)
        m_wf1 = meta_copy.pop("workflow_id", None)
        m_wf2 = meta_copy.pop("workflowId", None)
        m_t1 = meta_copy.pop("tenant_id", None)
        m_t2 = meta_copy.pop("tenantId", None)

        tags = tags or m_tags
        if quality_score is None:
            quality_score = m_q1 if m_q1 is not None else m_q2
        workflow_id = workflow_id or m_wf1 or m_wf2
        tenant_id = tenant_id or m_t1 or m_t2
        aurex_meta.update(raw_meta)

        if provider == "anthropic":
            # Anthropic strictly accepts only metadata={"user_id": "..."}
            clean_anth = {"user_id": str(meta_copy["user_id"])} if "user_id" in meta_copy and meta_copy["user_id"] is not None else {}
            if clean_anth:
                clean["metadata"] = clean_anth
            else:
                clean.pop("metadata", None)
        elif provider == "google":
            clean.pop("metadata", None)
        else:
            # OpenAI requires metadata values to be strings
            str_meta = {str(k): str(v) for k, v in meta_copy.items() if isinstance(v, (str, int, float, bool))}
            if str_meta:
                clean["metadata"] = str_meta
            else:
                clean.pop("metadata", None)

    if not workflow_id:
        user_field = clean.get("user")
        if isinstance(user_field, str) and user_field:
            workflow_id = user_field

    tags = tags if isinstance(tags, dict) else ctx_d.get("tags")
    if quality_score is None:
        quality_score = ctx_d.get("quality_score")
    workflow_id = workflow_id or ctx_d.get("workflow_id")
    tenant_id = tenant_id or (tags or {}).get("tenant_id") or ctx_d.get("tenant_id")
    if tenant_id and isinstance(tags, dict) and "tenant_id" not in tags:
        tags = {**tags, "tenant_id": str(tenant_id)}
    elif tenant_id and not tags:
        tags = {"tenant_id": str(tenant_id)}

    return clean, {
        "tags": tags,
        "quality_score": quality_score,
        "workflow_id": workflow_id,
        "tenant_id": tenant_id,
        "extra_metadata": aurex_meta,
    }


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
        if ":11434" in b or ("ollama" in b):
            return "ollama"
        # URL hostname check (not a socket bind)
        if any(h in b for h in ("localhost", "127.0.0.1", "0.0.0.0")):  # nosec B104
            inferred = extract_provider(model)
            return "ollama" if inferred in ("ollama", "unknown") else inferred
    return extract_provider(model)


def is_reasoning_capable_model(model: str) -> bool:
    norm = normalize_model_name(model)
    if norm.startswith(("o1", "o3", "o4")) or "deepseek-r1" in norm:
        return True
    if any(x in norm for x in ("opus-4", "sonnet-4", "3-7-sonnet", "gpt-5", "gemini-2.5-pro", "gemini-2.5-flash")):
        return "flash-lite" not in norm
    if any(h in norm for h in NON_REASONING_HINTS):
        return False
    return False


def sanitize_thinking_params(
    params: Dict[str, Any],
    *,
    is_downgraded: bool = False,
    max_thinking_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Strip incompatible thinking params on downgrade and clamp thinking budgets across OpenAI/Anthropic/Gemini."""
    out = dict(params)
    target_model = str(out.get("model") or "")

    if is_downgraded and not is_reasoning_capable_model(target_model):
        out.pop("reasoning_effort", None)
        out.pop("reasoning", None)
        out.pop("thinking", None)
        cfg = out.get("config")
        if isinstance(cfg, dict) and "thinking_config" in cfg:
            cfg_copy = dict(cfg)
            cfg_copy.pop("thinking_config", None)
            out["config"] = cfg_copy
        elif cfg is not None and hasattr(cfg, "thinking_config"):
            try:
                setattr(cfg, "thinking_config", None)
            except Exception:
                pass
        return out

    if max_thinking_tokens is not None and max_thinking_tokens > 0:
        cap = int(max_thinking_tokens)
        thinking = out.get("thinking")
        if isinstance(thinking, dict) and "budget_tokens" in thinking:
            clamped = max(1024, min(int(thinking["budget_tokens"]), cap))
            out["thinking"] = {**thinking, "budget_tokens": clamped}

        target_effort = "low" if cap <= 2048 else ("medium" if cap <= 8192 else "high")
        if out.get("reasoning_effort") == "high" and target_effort != "high":
            out["reasoning_effort"] = target_effort
        reasoning_obj = out.get("reasoning")
        if isinstance(reasoning_obj, dict) and reasoning_obj.get("effort") == "high" and target_effort != "high":
            out["reasoning"] = {**reasoning_obj, "effort": target_effort}

        cfg = out.get("config")
        if isinstance(cfg, dict) and isinstance(cfg.get("thinking_config"), dict):
            tc = dict(cfg["thinking_config"])
            if "thinking_budget" in tc and tc["thinking_budget"] is not None:
                tc["thinking_budget"] = min(int(tc["thinking_budget"]), cap)
                out["config"] = {**cfg, "thinking_config": tc}
        elif cfg is not None and hasattr(cfg, "thinking_config") and getattr(cfg, "thinking_config", None) is not None:
            tc_obj = getattr(cfg, "thinking_config")
            tb = getattr(tc_obj, "thinking_budget", None)
            if isinstance(tb, int) and tb > cap:
                try:
                    setattr(tc_obj, "thinking_budget", cap)
                except Exception:
                    pass

    return out


def ensure_openai_stream_usage(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Auto-inject stream_options={'include_usage': True} on OpenAI-compatible Chat Completions streams."""
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


def extract_messages_prompts(messages: Any) -> Tuple[Optional[str], Optional[str]]:
    """Extract (system_prompt, last_user_prompt) supporting both 'system' and 'developer' roles."""
    if not isinstance(messages, list):
        return None, None
    sys_parts: List[str] = []
    user_prompt: Optional[str] = None
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        text_val: Optional[str] = None
        if isinstance(content, str):
            text_val = content
        elif isinstance(content, list):
            text_val = "".join(
                str(b.get("text", "")) if isinstance(b, dict) else str(getattr(b, "text", ""))
                for b in content
            )
        if role in ("system", "developer") and text_val:
            sys_parts.append(text_val)
        elif role == "user" and text_val is not None:
            user_prompt = text_val
    return ("\n".join(sys_parts) if sys_parts else None), user_prompt


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
                role = item.get("role")
                content = item.get("content")
                if role in ("system", "developer") and isinstance(content, str) and not system_prompt:
                    system_prompt = content
                elif role == "user":
                    if isinstance(content, str):
                        user_prompt = content
                    elif isinstance(content, list):
                        user_prompt = "".join(
                            str(b.get("text", "")) for b in content if isinstance(b, dict) and "text" in b
                        )

    return user_prompt, system_prompt, messages


def extract_responses_api_usage(resp: Any) -> Dict[str, Any]:
    """Extract tokens, finish_reason, and text from an OpenAI Responses API response object."""
    usage = getattr(resp, "usage", None) or (resp.get("usage") if isinstance(resp, dict) else None)
    in_toks = out_toks = cached_toks = reasoning_toks = 0

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
    if not text:
        out_items = getattr(resp, "output", None) or (resp.get("output") if isinstance(resp, dict) else None)
        if isinstance(out_items, list):
            parts: List[str] = []
            for item in out_items:
                icontent = getattr(item, "content", None) or (item.get("content") if isinstance(item, dict) else None)
                if isinstance(icontent, list):
                    for c in icontent:
                        t = getattr(c, "text", None) or (c.get("text") if isinstance(c, dict) else None)
                        if isinstance(t, str):
                            parts.append(t)
            if parts:
                text = "".join(parts)

    status = getattr(resp, "status", None) or (resp.get("status") if isinstance(resp, dict) else None)
    inc = getattr(resp, "incomplete_details", None) or (resp.get("incomplete_details") if isinstance(resp, dict) else None)
    inc_reason = getattr(inc, "reason", None) or (inc.get("reason") if isinstance(inc, dict) else None)
    finish_reason = str(inc_reason) if inc_reason else ("stop" if status == "completed" else None)

    return {
        "input_tokens": in_toks,
        "output_tokens": out_toks,
        "cached_tokens": cached_toks,
        "reasoning_tokens": reasoning_toks,
        "response_text": text,
        "finish_reason": finish_reason,
    }


def extract_anthropic_response_details(resp: Any) -> Dict[str, Any]:
    """Extract usage (including 5m/1h cache split), visible text, thinking tokens, and tool calls from Anthropic Message."""
    raw_in = out_toks = cache_read = cache_write = cache_write_1h = 0
    usage = getattr(resp, "usage", None) or (resp.get("usage") if isinstance(resp, dict) else None)
    if usage is not None:
        def _u(k: str) -> int:
            v = usage.get(k, 0) if isinstance(usage, dict) else getattr(usage, k, 0)
            return int(v) if isinstance(v, int) and not isinstance(v, bool) else 0

        raw_in = _u("input_tokens")
        out_toks = _u("output_tokens")
        cache_read = _u("cache_read_input_tokens")
        cache_write = _u("cache_creation_input_tokens")
        cc_sub = usage.get("cache_creation") if isinstance(usage, dict) else getattr(usage, "cache_creation", None)
        if cc_sub is not None:
            e1h = cc_sub.get("ephemeral_1h_input_tokens", 0) if isinstance(cc_sub, dict) else getattr(cc_sub, "ephemeral_1h_input_tokens", 0)
            e5m = cc_sub.get("ephemeral_5m_input_tokens", 0) if isinstance(cc_sub, dict) else getattr(cc_sub, "ephemeral_5m_input_tokens", 0)
            cache_write_1h = int(e1h or 0)
            if cache_write == 0 and (cache_write_1h or e5m):
                cache_write = int(e5m or 0) + cache_write_1h

    total_in = raw_in + cache_read + cache_write
    text_parts: List[str] = []
    thinking_parts: List[str] = []
    tool_names: List[str] = []

    content = getattr(resp, "content", None) if not isinstance(resp, dict) else resp.get("content")
    if isinstance(content, list):
        for block in content:
            btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
            if btype == "text" or btype is None:
                t = block.get("text", "") if isinstance(block, dict) else getattr(block, "text", "")
                if t:
                    text_parts.append(str(t))
            elif btype == "thinking":
                th = block.get("thinking", "") if isinstance(block, dict) else getattr(block, "thinking", "")
                if th:
                    thinking_parts.append(str(th))
            elif btype == "tool_use":
                name = block.get("name", "unknown") if isinstance(block, dict) else getattr(block, "name", "unknown")
                tool_names.append(str(name))
    elif isinstance(content, str):
        text_parts.append(content)

    reasoning_toks = count_text_tokens("\n".join(thinking_parts)) if thinking_parts else 0
    stop_reason = getattr(resp, "stop_reason", None) if not isinstance(resp, dict) else resp.get("stop_reason")

    return {
        "input_tokens": total_in,
        "raw_input_tokens": raw_in,
        "output_tokens": out_toks,
        "cached_tokens": cache_read,
        "cache_write_tokens": cache_write,
        "cache_write_1h_tokens": cache_write_1h,
        "reasoning_tokens": reasoning_toks,
        "response_text": "".join(text_parts) if text_parts else None,
        "tool_calls_count": len(tool_names),
        "tool_names": tool_names,
        "finish_reason": str(stop_reason) if stop_reason else None,
    }


def extract_openai_response_details(resp: Any) -> Dict[str, Any]:
    """Extract usage, reasoning_content fallback, structured parsed content, finish_reason, and tool calls."""
    in_toks = out_toks = cached_toks = reasoning_toks = 0
    usage = getattr(resp, "usage", None) or (resp.get("usage") if isinstance(resp, dict) else None)
    if usage is not None:
        in_toks = int((usage.get("prompt_tokens", 0) if isinstance(usage, dict) else getattr(usage, "prompt_tokens", 0)) or 0)
        out_toks = int((usage.get("completion_tokens", 0) if isinstance(usage, dict) else getattr(usage, "completion_tokens", 0)) or 0)
        p_det = usage.get("prompt_tokens_details") if isinstance(usage, dict) else getattr(usage, "prompt_tokens_details", None)
        if p_det:
            cached_toks = int((p_det.get("cached_tokens", 0) if isinstance(p_det, dict) else getattr(p_det, "cached_tokens", 0)) or 0)
        c_det = usage.get("completion_tokens_details") if isinstance(usage, dict) else getattr(usage, "completion_tokens_details", None)
        if c_det:
            reasoning_toks = int((c_det.get("reasoning_tokens", 0) if isinstance(c_det, dict) else getattr(c_det, "reasoning_tokens", 0)) or 0)

    response_content: Optional[str] = None
    finish_reason: Optional[str] = None
    tool_names: List[str] = []
    refusal: Optional[str] = None

    choices = resp.get("choices") if isinstance(resp, dict) else getattr(resp, "choices", None)
    if isinstance(choices, list) and choices:
        c0 = choices[0]
        finish_reason = c0.get("finish_reason") if isinstance(c0, dict) else getattr(c0, "finish_reason", None)
        msg = c0.get("message") if isinstance(c0, dict) else getattr(c0, "message", None)
        if msg is not None:
            raw_c = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
            if isinstance(raw_c, str):
                response_content = raw_c
            elif getattr(msg, "parsed", None) is not None:
                parsed_obj = getattr(msg, "parsed")
                response_content = parsed_obj.model_dump_json() if hasattr(parsed_obj, "model_dump_json") else json.dumps(parsed_obj, default=str)
            refusal = msg.get("refusal") if isinstance(msg, dict) else getattr(msg, "refusal", None)
            rc = msg.get("reasoning_content") if isinstance(msg, dict) else getattr(msg, "reasoning_content", None)
            if reasoning_toks == 0 and isinstance(rc, str) and rc:
                reasoning_toks = count_text_tokens(rc)
            tcs = msg.get("tool_calls") if isinstance(msg, dict) else getattr(msg, "tool_calls", None)
            if isinstance(tcs, list):
                for tc in tcs:
                    fn = tc.get("function") if isinstance(tc, dict) else getattr(tc, "function", None)
                    name = (fn.get("name") if isinstance(fn, dict) else getattr(fn, "name", None)) if fn else None
                    tool_names.append(str(name or "unknown"))

    return {
        "input_tokens": in_toks,
        "output_tokens": out_toks,
        "cached_tokens": cached_toks,
        "reasoning_tokens": reasoning_toks,
        "response_text": response_content,
        "refusal": refusal,
        "finish_reason": str(finish_reason) if finish_reason else None,
        "tool_calls_count": len(tool_names),
        "tool_names": tool_names,
    }


class StreamUsageAccumulator:
    """Unified SSE chunk accumulator for OpenAI Chat, OpenAI Responses, Anthropic Messages, and Google Gemini."""

    def __init__(self, provider: Optional[str] = None):
        self.provider = provider
        self.text_parts: List[str] = []
        self.reasoning_parts: List[str] = []
        self.tool_names: List[str] = []
        self.has_usage = False
        self.raw_anthropic_in: Optional[int] = None
        self.input_tokens = 0
        self.output_tokens = 0
        self.cached_tokens = 0
        self.cache_write_tokens = 0
        self.cache_write_1h_tokens = 0
        self.reasoning_tokens = 0
        self.finish_reason: Optional[str] = None

    def feed(self, chunk: Any) -> None:
        if chunk is None:
            return
        ctype = chunk.get("type") if isinstance(chunk, dict) else getattr(chunk, "type", None)

        # 1. OpenAI Responses API stream events
        if isinstance(ctype, str) and ctype.startswith("response."):
            if ctype == "response.output_text.delta":
                delta = chunk.get("delta") if isinstance(chunk, dict) else getattr(chunk, "delta", None)
                if isinstance(delta, str) and delta:
                    self.text_parts.append(delta)
            elif ctype in ("response.completed", "response.incomplete", "response.failed"):
                resp_obj = chunk.get("response") if isinstance(chunk, dict) else getattr(chunk, "response", None)
                if resp_obj is not None:
                    parsed = extract_responses_api_usage(resp_obj)
                    self.has_usage = True
                    self.input_tokens = parsed["input_tokens"] or self.input_tokens
                    self.output_tokens = parsed["output_tokens"] or self.output_tokens
                    self.cached_tokens = parsed["cached_tokens"] or self.cached_tokens
                    self.reasoning_tokens = parsed["reasoning_tokens"] or self.reasoning_tokens
                    if parsed["finish_reason"]:
                        self.finish_reason = parsed["finish_reason"]
            return

        # 2. Anthropic Messages stream events (split across message_start + message_delta)
        if ctype in ("message_start", "content_block_start", "content_block_delta", "message_delta", "message_stop"):
            if ctype == "message_start":
                msg = chunk.get("message") if isinstance(chunk, dict) else getattr(chunk, "message", None)
                if msg is not None:
                    det = extract_anthropic_response_details(msg)
                    self.has_usage = True
                    self.raw_anthropic_in = det["raw_input_tokens"]
                    self.cached_tokens = det["cached_tokens"]
                    self.cache_write_tokens = det["cache_write_tokens"]
                    self.cache_write_1h_tokens = det["cache_write_1h_tokens"]
                    self.input_tokens = det["input_tokens"]
                    if det["output_tokens"]:
                        self.output_tokens = det["output_tokens"]
            elif ctype == "content_block_start":
                cb = chunk.get("content_block") if isinstance(chunk, dict) else getattr(chunk, "content_block", None)
                cb_type = cb.get("type") if isinstance(cb, dict) else getattr(cb, "type", None)
                if cb_type == "tool_use":
                    name = cb.get("name", "unknown") if isinstance(cb, dict) else getattr(cb, "name", "unknown")
                    self.tool_names.append(str(name))
            elif ctype == "content_block_delta":
                delta = chunk.get("delta") if isinstance(chunk, dict) else getattr(chunk, "delta", None)
                if delta is not None:
                    dtype = delta.get("type") if isinstance(delta, dict) else getattr(delta, "type", None)
                    t = delta.get("text") if isinstance(delta, dict) else getattr(delta, "text", None)
                    th = delta.get("thinking") if isinstance(delta, dict) else getattr(delta, "thinking", None)
                    if isinstance(t, str) and t and dtype in (None, "text_delta"):
                        self.text_parts.append(t)
                    elif isinstance(th, str) and th:
                        self.reasoning_parts.append(th)
            elif ctype == "message_delta":
                delta = chunk.get("delta") if isinstance(chunk, dict) else getattr(chunk, "delta", None)
                sr = (delta.get("stop_reason") if isinstance(delta, dict) else getattr(delta, "stop_reason", None)) if delta else None
                if sr:
                    self.finish_reason = str(sr)
                u = chunk.get("usage") if isinstance(chunk, dict) else getattr(chunk, "usage", None)
                if u is not None:
                    self.has_usage = True
                    out_v = u.get("output_tokens", 0) if isinstance(u, dict) else getattr(u, "output_tokens", 0)
                    if out_v:
                        self.output_tokens = int(out_v)
            return

        # 3. OpenAI Chat Completions stream chunks
        choices = chunk.get("choices") if isinstance(chunk, dict) else getattr(chunk, "choices", None)
        if isinstance(choices, list) and choices:
            c0 = choices[0]
            fr = c0.get("finish_reason") if isinstance(c0, dict) else getattr(c0, "finish_reason", None)
            if fr:
                self.finish_reason = str(fr)
            delta = c0.get("delta") if isinstance(c0, dict) else getattr(c0, "delta", None)
            if delta is not None:
                txt = delta.get("content") if isinstance(delta, dict) else getattr(delta, "content", None)
                if isinstance(txt, str) and txt:
                    self.text_parts.append(txt)
                rc = delta.get("reasoning_content") if isinstance(delta, dict) else getattr(delta, "reasoning_content", None)
                if isinstance(rc, str) and rc:
                    self.reasoning_parts.append(rc)
                tcs = delta.get("tool_calls") if isinstance(delta, dict) else getattr(delta, "tool_calls", None)
                if isinstance(tcs, list):
                    for tc in tcs:
                        fn = tc.get("function") if isinstance(tc, dict) else getattr(tc, "function", None)
                        nm = (fn.get("name") if isinstance(fn, dict) else getattr(fn, "name", None)) if fn else None
                        if nm:
                            self.tool_names.append(str(nm))

        usage = chunk.get("usage") if isinstance(chunk, dict) else getattr(chunk, "usage", None)
        if usage is not None:
            self.has_usage = True
            pt = (usage.get("prompt_tokens", 0) if isinstance(usage, dict) else getattr(usage, "prompt_tokens", 0)) or (
                usage.get("input_tokens", 0) if isinstance(usage, dict) else getattr(usage, "input_tokens", 0)
            )
            ct = (usage.get("completion_tokens", 0) if isinstance(usage, dict) else getattr(usage, "completion_tokens", 0)) or (
                usage.get("output_tokens", 0) if isinstance(usage, dict) else getattr(usage, "output_tokens", 0)
            )
            if pt:
                self.input_tokens = int(pt)
            if ct:
                self.output_tokens = int(ct)
            p_det = usage.get("prompt_tokens_details") if isinstance(usage, dict) else getattr(usage, "prompt_tokens_details", None)
            if p_det:
                self.cached_tokens = int((p_det.get("cached_tokens", 0) if isinstance(p_det, dict) else getattr(p_det, "cached_tokens", 0)) or self.cached_tokens)
            c_det = usage.get("completion_tokens_details") if isinstance(usage, dict) else getattr(usage, "completion_tokens_details", None)
            if c_det:
                self.reasoning_tokens = int((c_det.get("reasoning_tokens", 0) if isinstance(c_det, dict) else getattr(c_det, "reasoning_tokens", 0)) or self.reasoning_tokens)

        # 4. Google Gemini stream chunks (usage_metadata)
        um = chunk.get("usage_metadata") if isinstance(chunk, dict) else getattr(chunk, "usage_metadata", None)
        if um is not None:
            self.has_usage = True
            ptc = getattr(um, "prompt_token_count", 0) if not isinstance(um, dict) else um.get("prompt_token_count", 0)
            ctc = getattr(um, "candidates_token_count", 0) if not isinstance(um, dict) else um.get("candidates_token_count", 0)
            ttc = getattr(um, "thoughts_token_count", 0) if not isinstance(um, dict) else um.get("thoughts_token_count", 0)
            cc = getattr(um, "cached_content_token_count", 0) if not isinstance(um, dict) else um.get("cached_content_token_count", 0)
            if isinstance(ptc, int) and ptc > 0:
                self.input_tokens = ptc
            thoughts = ttc if isinstance(ttc, int) and not isinstance(ttc, bool) else 0
            cands = ctc if isinstance(ctc, int) and not isinstance(ctc, bool) else 0
            if cands or thoughts:
                self.output_tokens = cands + thoughts
            if thoughts:
                self.reasoning_tokens = thoughts
            if isinstance(cc, int) and cc > 0:
                self.cached_tokens = cc

        if choices is None and hasattr(chunk, "text"):
            try:
                gtxt = chunk.text
                if isinstance(gtxt, str) and gtxt:
                    self.text_parts.append(gtxt)
            except Exception:
                pass

    def finalize_metrics(self, estimate_input_fn: Callable[[], int]) -> Dict[str, Any]:
        full_text = "".join(self.text_parts)
        reasoning_toks = self.reasoning_tokens
        if reasoning_toks == 0 and self.reasoning_parts:
            reasoning_toks = count_text_tokens("".join(self.reasoning_parts))
        in_toks = self.input_tokens if self.has_usage and self.input_tokens > 0 else estimate_input_fn()
        out_toks = self.output_tokens if self.has_usage and self.output_tokens > 0 else (count_text_tokens(full_text) if full_text else reasoning_toks)
        return {
            "response_text": full_text,
            "input_tokens": in_toks,
            "output_tokens": out_toks,
            "cached_tokens": self.cached_tokens,
            "cache_write_tokens": self.cache_write_tokens,
            "cache_write_1h_tokens": self.cache_write_1h_tokens,
            "reasoning_tokens": reasoning_toks,
            "finish_reason": self.finish_reason,
            "tool_calls_count": len(self.tool_names),
            "tool_names": self.tool_names,
        }


class AurexSyncStreamProxy:
    """Transparent sync stream proxy preserving SDK methods (.close, .response, context manager) while auditing chunks."""

    def __init__(self, raw_stream: Any, acc: StreamUsageAccumulator, on_finalize: Callable[[bool], None]):
        self._raw_stream = raw_stream
        self._iterator: Any = None
        self._acc = acc
        self._on_finalize = on_finalize
        self._finalized = False
        self._completed = False

    def _finish(self, completed: bool) -> None:
        if not self._finalized:
            self._finalized = True
            self._on_finalize(completed)

    def __iter__(self) -> "AurexSyncStreamProxy":
        if self._iterator is None:
            self._iterator = iter(self._raw_stream)
        return self

    def __next__(self) -> Any:
        if self._iterator is None:
            self._iterator = iter(self._raw_stream)
        try:
            chunk = next(self._iterator)
            self._acc.feed(chunk)
            return chunk
        except StopIteration:
            self._completed = True
            self._finish(True)
            raise
        except BaseException:
            self._finish(False)
            raise

    def close(self) -> None:
        try:
            if hasattr(self._raw_stream, "close"):
                self._raw_stream.close()
        finally:
            self._finish(self._completed)

    def __enter__(self) -> "AurexSyncStreamProxy":
        if hasattr(self._raw_stream, "__enter__"):
            self._raw_stream.__enter__()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> Any:
        try:
            if hasattr(self._raw_stream, "__exit__"):
                return self._raw_stream.__exit__(exc_type, exc, tb)
        finally:
            self._finish(self._completed and exc_type is None)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._raw_stream, name)


class AurexAsyncStreamProxy:
    """Transparent async stream proxy preserving SDK methods (.close, .response, async context manager) while auditing chunks."""

    def __init__(self, raw_stream: Any, acc: StreamUsageAccumulator, on_finalize: Callable[[bool], None]):
        self._raw_stream = raw_stream
        self._aiterator: Any = None
        self._acc = acc
        self._on_finalize = on_finalize
        self._finalized = False
        self._completed = False

    def _finish(self, completed: bool) -> None:
        if not self._finalized:
            self._finalized = True
            self._on_finalize(completed)

    def __aiter__(self) -> "AurexAsyncStreamProxy":
        if self._aiterator is None:
            self._aiterator = self._raw_stream.__aiter__()
        return self

    async def __anext__(self) -> Any:
        if self._aiterator is None:
            self._aiterator = self._raw_stream.__aiter__()
        try:
            chunk = await self._aiterator.__anext__()
            self._acc.feed(chunk)
            return chunk
        except StopAsyncIteration:
            self._completed = True
            self._finish(True)
            raise
        except BaseException:
            self._finish(False)
            raise

    async def aclose(self) -> None:
        try:
            if hasattr(self._raw_stream, "aclose"):
                await self._raw_stream.aclose()
            elif hasattr(self._raw_stream, "close"):
                res = self._raw_stream.close()
                if hasattr(res, "__await__"):
                    await res
        finally:
            self._finish(self._completed)

    def close(self) -> Any:
        try:
            if hasattr(self._raw_stream, "close"):
                return self._raw_stream.close()
        finally:
            self._finish(self._completed)

    async def __aenter__(self) -> "AurexAsyncStreamProxy":
        if hasattr(self._raw_stream, "__aenter__"):
            await self._raw_stream.__aenter__()
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> Any:
        try:
            if hasattr(self._raw_stream, "__aexit__"):
                return await self._raw_stream.__aexit__(exc_type, exc, tb)
        finally:
            self._finish(self._completed and exc_type is None)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._raw_stream, name)


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
