"""Provider-call resilience: classify failures, bounded retry/fallback, counterfactual accounting."""

from __future__ import annotations

import asyncio
import concurrent.futures
import hashlib
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from aurex_sdk.exceptions import AurexResilienceExhausted


DEFAULT_RETRY_ON = [
    "timeout",
    "429",
    "5xx",
    "network",
    "empty",
    "content_filter",
    "truncated",
    "thinking_exhausted",
    "grammar_loop",
    "refusal",
    "tool_error",
]

_REPEATED_KV_RE = re.compile(r'("[^"\n]{1,40}"\s*:\s*[^,}\n]{1,30})(?:\s*,\s*\1){6,}')
_REPEATED_WORD_RE = re.compile(r"\b(\w{2,})\b(?:\s*[,;]?\s*\1\b){7,}")


def detect_grammar_loop(raw_text: Optional[str]) -> bool:
    """Detect constrained-decoding whitespace/newline floods or repeated JSON key/token loops."""
    if not raw_text:
        return False
    if "\n" * 32 in raw_text or "\t" * 32 in raw_text or " " * 128 in raw_text:
        return True
    if len(raw_text) >= 120 and len(raw_text.strip()) < len(raw_text) * 0.15:
        return True
    non_empty_lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    if len(non_empty_lines) >= 10:
        most_common = max(non_empty_lines.count(ln) for ln in set(non_empty_lines))
        if most_common >= max(8, int(len(non_empty_lines) * 0.8)):
            return True
    sample = raw_text[:4000]
    if len(sample) >= 50 and (_REPEATED_KV_RE.search(sample) or _REPEATED_WORD_RE.search(sample)):
        return True
    return False


def _extract_reasoning_or_output_tokens(resp: Any) -> Tuple[int, int]:
    """Return (reasoning_tokens, output_tokens) from any supported provider response."""
    usage = getattr(resp, "usage", None) or getattr(resp, "usage_metadata", None)
    if usage is None and isinstance(resp, dict):
        usage = resp.get("usage") or resp.get("usage_metadata")
    if usage is None:
        return 0, 0

    def _int_attr(obj: Any, key: str) -> int:
        val = obj.get(key, 0) if isinstance(obj, dict) else getattr(obj, key, 0)
        return val if isinstance(val, int) and not isinstance(val, bool) else 0

    out_toks = (
        _int_attr(usage, "completion_tokens")
        or _int_attr(usage, "output_tokens")
        or _int_attr(usage, "candidates_token_count")
    )
    reasoning = _int_attr(usage, "thoughts_token_count")
    details = (
        usage.get("completion_tokens_details") or usage.get("output_tokens_details")
        if isinstance(usage, dict)
        else getattr(usage, "completion_tokens_details", None) or getattr(usage, "output_tokens_details", None)
    )
    if details is not None:
        reasoning = reasoning or _int_attr(details, "reasoning_tokens")
    return reasoning, out_toks


@dataclass
class ResiliencePolicy:
    enabled: bool = False
    mode: str = "observe"  # observe | enforce
    timeout_ms: int = 60_000
    max_attempts: int = 2
    max_extra_cost_usd: float = 0.05
    retry_on: List[str] = field(default_factory=lambda: list(DEFAULT_RETRY_ON))
    backoff: Dict[str, float] = field(default_factory=lambda: {"base_ms": 200, "max_ms": 5000, "jitter": 0.5})
    idempotency: str = "auto"  # auto | require_key | off
    fallbacks: List[Dict[str, Any]] = field(default_factory=list)
    proof_window_pct: float = 0.0
    on_recovery: Optional[Callable[..., None]] = None
    classify_response_override: Optional[Callable[..., "ClassificationResult"]] = None


@dataclass
class ClassificationResult:
    usable: bool
    kind: str
    billed: bool = False
    error_code: Optional[str] = None
    finish_reason: Optional[str] = None
    status: str = "ok"
    latency_ms: Optional[int] = None


@dataclass
class AttemptRecord:
    attempt_index: int
    provider: str
    model: str
    classification: ClassificationResult
    cost: float = 0.0
    projected_cost: float = 0.0
    loss_avoided: float = 0.0
    recovery_provider: Optional[str] = None
    outcome: Optional[str] = None
    cost_type: Optional[str] = None


def parse_resilience_config(raw: Optional[Dict[str, Any]]) -> ResiliencePolicy:
    if not raw:
        return ResiliencePolicy()
    retry_on = raw.get("retry_on") or list(DEFAULT_RETRY_ON)
    backoff = raw.get("backoff") or {"base_ms": 200, "max_ms": 5000, "jitter": 0.5}
    return ResiliencePolicy(
        enabled=bool(raw.get("enabled", False)),
        mode=str(raw.get("mode", "observe")),
        timeout_ms=int(raw.get("timeout_ms", 60_000)),
        max_attempts=max(1, int(raw.get("max_attempts", 2))),
        max_extra_cost_usd=float(raw.get("max_extra_cost_usd", 0.05)),
        retry_on=list(retry_on),
        backoff=dict(backoff),
        idempotency=str(raw.get("idempotency", "auto")),
        fallbacks=list(raw.get("fallbacks") or []),
        proof_window_pct=float(raw.get("proof_window_pct", 0.0)),
        on_recovery=raw.get("on_recovery"),
        classify_response_override=raw.get("classify_response"),
    )


def _extract_text(resp: Any) -> str:
    if resp is None:
        return ""
    if hasattr(resp, "output_text") and isinstance(resp.output_text, str) and resp.output_text:
        return resp.output_text
    if hasattr(resp, "choices") and resp.choices:
        choice = resp.choices[0]
        if hasattr(choice, "message") and choice.message:
            content = getattr(choice.message, "content", None)
            if content:
                return str(content)
            if getattr(choice.message, "tool_calls", None):
                return "[tool_call]"
        if hasattr(choice, "text") and choice.text:
            return str(choice.text)
    if hasattr(resp, "content") and resp.content is not None:
        content = resp.content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "tool_use":
                        parts.append("[tool_call]")
                    else:
                        parts.append(str(block.get("text", "")))
                else:
                    if getattr(block, "type", None) == "tool_use":
                        parts.append("[tool_call]")
                    else:
                        parts.append(str(getattr(block, "text", "") or ""))
            return "".join(parts)
        return str(content or "")
    if hasattr(resp, "text") and isinstance(resp.text, str) and resp.text:
        return resp.text
    if isinstance(resp, dict):
        if resp.get("output_text"):
            return str(resp["output_text"])
        if isinstance(resp.get("message"), dict) and resp["message"].get("content"):
            return str(resp["message"]["content"])
        if resp.get("response"):
            return str(resp["response"])
        choices = resp.get("choices") or []
        if choices:
            msg = choices[0].get("message") or {}
            if msg.get("tool_calls"):
                return "[tool_call]"
            return str(msg.get("content") or "")
    return ""


def _extract_finish_reason(resp: Any, provider: str) -> Optional[str]:
    if resp is None:
        return None
    if hasattr(resp, "choices") and resp.choices:
        return getattr(resp.choices[0], "finish_reason", None)
    if hasattr(resp, "stop_reason"):
        return getattr(resp, "stop_reason", None)
    if isinstance(resp, dict):
        choices = resp.get("choices") or []
        if choices:
            return choices[0].get("finish_reason")
        return resp.get("stop_reason")
    return None


def classify_exception(exc: Exception) -> ClassificationResult:
    msg = str(exc).lower()
    name = type(exc).__name__.lower()
    if "timeout" in msg or "timeout" in name or "timed out" in msg:
        return ClassificationResult(False, "timeout", billed=False, error_code="timeout", status="error")
    if "429" in msg or "rate limit" in msg or "ratelimit" in msg:
        return ClassificationResult(False, "429", billed=False, error_code="429", status="error")
    if any(code in msg for code in ("500", "502", "503", "504", "5xx")):
        return ClassificationResult(False, "5xx", billed=False, error_code="5xx", status="error")
    if any(k in msg for k in ("connection", "network", "unreachable", "refused", "reset")):
        return ClassificationResult(False, "network", billed=False, error_code="network", status="error")
    return ClassificationResult(False, "unknown", billed=False, error_code=type(exc).__name__, status="error")


def classify_response(
    provider: str,
    resp: Any,
    exc: Optional[Exception] = None,
    *,
    override: Optional[Callable[..., ClassificationResult]] = None,
) -> ClassificationResult:
    if override:
        return override(provider=provider, resp=resp, exc=exc)
    if exc is not None:
        return classify_exception(exc)
    if resp is None:
        return ClassificationResult(False, "empty", billed=False, status="degraded")
    if hasattr(resp, "__next__") or hasattr(resp, "__aiter__"):
        return ClassificationResult(True, "success", billed=True, finish_reason="stream", status="ok")

    finish = (_extract_finish_reason(resp, provider) or "").lower()
    raw_text = _extract_text(resp)
    text = raw_text.strip()
    reasoning_toks, out_toks = _extract_reasoning_or_output_tokens(resp)

    if finish in ("content_filter", "content-filter"):
        return ClassificationResult(
            False, "content_filter", billed=True, finish_reason=finish, status="degraded", error_code="content_filter"
        )
    if finish in ("length", "max_tokens", "max_output_tokens"):
        if not text and (reasoning_toks > 0 or out_toks > 0):
            return ClassificationResult(
                False,
                "thinking_exhausted",
                billed=True,
                finish_reason=finish,
                status="degraded",
                error_code="thinking_exhausted",
            )
        return ClassificationResult(
            False, "truncated", billed=True, finish_reason=finish, status="degraded", error_code="truncated"
        )
    if finish in ("refusal", "refused"):
        return ClassificationResult(
            False, "refusal", billed=True, finish_reason=finish, status="degraded", error_code="refusal"
        )
    if detect_grammar_loop(raw_text):
        return ClassificationResult(
            False,
            "grammar_loop",
            billed=True,
            finish_reason=finish or "stop",
            status="degraded",
            error_code="grammar_loop",
        )
    if not text:
        if reasoning_toks > 0:
            return ClassificationResult(
                False,
                "thinking_exhausted",
                billed=True,
                finish_reason=finish or "empty",
                status="degraded",
                error_code="thinking_exhausted",
            )
        return ClassificationResult(False, "empty", billed=True, finish_reason=finish or "empty", status="degraded")

    if hasattr(resp, "choices") and resp.choices:
        choice = resp.choices[0]
        if hasattr(choice, "message") and getattr(choice.message, "tool_calls", None):
            tool_calls = choice.message.tool_calls
            if tool_calls and not text:
                return ClassificationResult(False, "tool_error", billed=True, finish_reason=finish, status="degraded")

    return ClassificationResult(True, "success", billed=True, finish_reason=finish or "stop", status="ok")


def is_retryable(kind: str, retry_on: List[str]) -> bool:
    return kind in retry_on or (kind == "unknown" and "5xx" in retry_on)


def _backoff_ms(policy: ResiliencePolicy, attempt: int) -> float:
    base = float(policy.backoff.get("base_ms", 200))
    cap = float(policy.backoff.get("max_ms", 5000))
    jitter = float(policy.backoff.get("jitter", 0.5))
    delay = min(cap, base * (2 ** attempt))
    return delay + random.uniform(0, delay * jitter)


def _should_skip_recovery(policy: ResiliencePolicy, workflow_id: str, attempt_key: str) -> bool:
    if policy.proof_window_pct <= 0:
        return False
    digest = hashlib.sha256(f"{workflow_id}:{attempt_key}".encode()).hexdigest()
    bucket = int(digest[:8], 16) % 100
    return bucket < int(policy.proof_window_pct)


def _idempotency_allows_retry(policy: ResiliencePolicy, idempotency_key: Optional[str], kind: str) -> bool:
    safe_kinds = ("timeout", "429", "5xx", "network", "empty", "grammar_loop", "thinking_exhausted", "truncated")
    if policy.idempotency == "off":
        return False
    if policy.idempotency == "require_key":
        return bool(idempotency_key) and kind in safe_kinds
    return kind in safe_kinds


def estimate_projected_reroute_cost(
    model: str,
    fallback_model: Optional[str],
    input_tokens: int,
    output_tokens: int,
    billed_cost: float,
    calculate_cost_fn: Callable[..., float],
) -> float:
    """Naive manual reroute: billed failed attempt + full second call on fallback."""
    second_model = fallback_model or model
    duplicate = calculate_cost_fn(second_model, input_tokens, max(output_tokens, 256))
    return round(billed_cost + duplicate, 6)


def _resolve_fallback(
    policy: ResiliencePolicy,
    attempt_index: int,
    registered: Dict[str, Callable[..., Any]],
) -> Optional[Dict[str, Any]]:
    if not policy.fallbacks:
        return None
    idx = attempt_index - 1
    if idx < 0 or idx >= len(policy.fallbacks):
        return None
    entry = dict(policy.fallbacks[idx])
    call_name = entry.get("call")
    if call_name and call_name in registered:
        entry["_callable"] = registered[call_name]
    return entry


def execute_with_resilience(
    call_fn: Callable[[], Any],
    policy: ResiliencePolicy,
    *,
    provider: str,
    model: str,
    workflow_id: str,
    on_attempt: Callable[[AttemptRecord, Any, Optional[Exception]], None],
    registered_fallbacks: Optional[Dict[str, Callable[..., Any]]] = None,
    idempotency_key: Optional[str] = None,
    mutate_params_for_fallback: Optional[Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = None,
    calculate_cost_fn: Optional[Callable[..., float]] = None,
    input_tokens_estimate: int = 512,
    output_tokens_estimate: int = 256,
) -> Tuple[Any, Dict[str, Any]]:
    """
    Sync resilience executor. Returns (response, meta).
    Fail-open: on internal errors, performs a single raw call_fn().
    """
    if not policy.enabled:
        try:
            return call_fn(), {"resilience": "disabled"}
        except Exception as exc:
            raise exc

    registered = registered_fallbacks or {}
    meta: Dict[str, Any] = {"attempts": [], "mode": policy.mode}
    last_exc: Optional[Exception] = None
    last_resp: Any = None
    extra_cost = 0.0
    enforce = policy.mode == "enforce"
    skip_recovery = _should_skip_recovery(policy, workflow_id, model)

    try:
        for attempt in range(policy.max_attempts):
            attempt_index = attempt
            started = time.time()
            current_call = call_fn
            recovery_provider = provider
            current_model = model

            fallback = _resolve_fallback(policy, attempt, registered)
            if fallback and attempt > 0:
                recovery_provider = fallback.get("provider") or provider
                current_model = fallback.get("model") or model
                fb_call = fallback.get("_callable") or fallback.get("call_fn")
                if callable(fb_call):
                    current_call = lambda fc=fb_call: fc()
                elif mutate_params_for_fallback:
                    current_call = call_fn

            try:
                if policy.timeout_ms and policy.timeout_ms > 0:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        fut = pool.submit(current_call)
                        resp = fut.result(timeout=policy.timeout_ms / 1000.0)
                else:
                    resp = current_call()
                latency_ms = int((time.time() - started) * 1000)
                classification = classify_response(
                    provider,
                    resp,
                    override=policy.classify_response_override,
                )
                classification.latency_ms = latency_ms

                if classification.usable:
                    outcome = "recovered" if attempt_index > 0 else "success"
                    record = AttemptRecord(
                        attempt_index=attempt_index,
                        provider=recovery_provider,
                        model=current_model,
                        classification=classification,
                        recovery_provider=recovery_provider if attempt_index > 0 else None,
                        outcome=outcome,
                        cost_type="inference",
                    )
                    if attempt_index > 0 and calculate_cost_fn:
                        record.projected_cost = estimate_projected_reroute_cost(
                            model,
                            current_model,
                            input_tokens_estimate,
                            output_tokens_estimate,
                            0.0,
                            calculate_cost_fn,
                        )
                        record.loss_avoided = record.projected_cost
                    on_attempt(record, resp, None)
                    meta["attempts"].append(record)
                    if attempt_index > 0 and policy.on_recovery:
                        try:
                            policy.on_recovery(workflow_id=workflow_id, attempt=attempt_index, model=current_model)
                        except Exception:
                            pass
                    return resp, meta

                last_resp = resp
                billed_cost = 0.0
                if classification.billed and calculate_cost_fn:
                    billed_cost = calculate_cost_fn(current_model, input_tokens_estimate, output_tokens_estimate)
                    extra_cost += billed_cost

                fb_model = None
                nxt = _resolve_fallback(policy, attempt + 1, registered)
                if nxt:
                    fb_model = nxt.get("model")

                projected = estimate_projected_reroute_cost(
                    current_model,
                    fb_model,
                    input_tokens_estimate,
                    output_tokens_estimate,
                    billed_cost,
                    calculate_cost_fn or (lambda *a, **k: 0.0),
                )
                record = AttemptRecord(
                    attempt_index=attempt_index,
                    provider=recovery_provider,
                    model=current_model,
                    classification=classification,
                    cost=billed_cost,
                    projected_cost=projected,
                    loss_avoided=projected if policy.mode == "observe" else 0.0,
                    outcome="degraded",
                    cost_type="unfulfilled_spend",
                )
                on_attempt(record, resp, None)
                meta["attempts"].append(record)

                if (
                    enforce
                    and not skip_recovery
                    and attempt < policy.max_attempts - 1
                    and is_retryable(classification.kind, policy.retry_on)
                    and _idempotency_allows_retry(policy, idempotency_key, classification.kind)
                    and extra_cost <= policy.max_extra_cost_usd
                ):
                    time.sleep(_backoff_ms(policy, attempt) / 1000.0)
                    continue

                if enforce and attempt >= policy.max_attempts - 1:
                    raise AurexResilienceExhausted(
                        f"Resilience exhausted after {policy.max_attempts} attempts",
                        workflow_id=workflow_id,
                        last_error=classification.kind,
                    )
                return resp, meta

            except AurexResilienceExhausted:
                raise
            except Exception as exc:
                last_exc = exc
                latency_ms = int((time.time() - started) * 1000)
                classification = classify_response(provider, None, exc)
                classification.latency_ms = latency_ms
                record = AttemptRecord(
                    attempt_index=attempt_index,
                    provider=recovery_provider,
                    model=current_model,
                    classification=classification,
                    outcome="failure",
                    cost_type="inference",
                )
                on_attempt(record, None, exc)
                meta["attempts"].append(record)

                if (
                    enforce
                    and not skip_recovery
                    and attempt < policy.max_attempts - 1
                    and is_retryable(classification.kind, policy.retry_on)
                    and _idempotency_allows_retry(policy, idempotency_key, classification.kind)
                    and extra_cost <= policy.max_extra_cost_usd
                ):
                    time.sleep(_backoff_ms(policy, attempt) / 1000.0)
                    continue

                if enforce and attempt >= policy.max_attempts - 1:
                    raise AurexResilienceExhausted(
                        str(exc),
                        workflow_id=workflow_id,
                        last_error=classification.kind,
                    ) from exc
                raise exc

        if last_exc:
            raise last_exc
        return last_resp, meta
    except AurexResilienceExhausted:
        raise
    except Exception as outer_exc:
        if last_exc is not None:
            raise last_exc
        # Fail-open: resilience orchestration bug — single raw attempt
        try:
            return call_fn(), {"resilience": "fail_open"}
        except Exception:
            raise outer_exc


async def async_execute_with_resilience(
    call_fn: Callable[[], Any],
    policy: ResiliencePolicy,
    **kwargs: Any,
) -> Tuple[Any, Dict[str, Any]]:
    """Async resilience executor — awaits coroutine call_fn when needed."""
    if not policy.enabled:
        result = call_fn()
        if asyncio.iscoroutine(result):
            return await result, {"resilience": "disabled"}
        return result, {"resilience": "disabled"}

    registered = kwargs.get("registered_fallbacks") or {}
    meta: Dict[str, Any] = {"attempts": [], "mode": policy.mode}
    last_exc: Optional[Exception] = None
    last_resp: Any = None
    extra_cost = 0.0
    enforce = policy.mode == "enforce"
    workflow_id = kwargs.get("workflow_id", "default_workflow")
    provider = kwargs.get("provider", "unknown")
    model = kwargs.get("model", "unknown")
    on_attempt = kwargs["on_attempt"]
    idempotency_key = kwargs.get("idempotency_key")
    calculate_cost_fn = kwargs.get("calculate_cost_fn")
    input_tokens_estimate = kwargs.get("input_tokens_estimate", 512)
    output_tokens_estimate = kwargs.get("output_tokens_estimate", 256)
    skip_recovery = _should_skip_recovery(policy, workflow_id, model)

    async def _invoke(fn: Callable[[], Any]) -> Any:
        result = fn()
        if asyncio.iscoroutine(result):
            if policy.timeout_ms and policy.timeout_ms > 0:
                return await asyncio.wait_for(result, timeout=policy.timeout_ms / 1000.0)
            return await result
        if policy.timeout_ms and policy.timeout_ms > 0:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: concurrent.futures.ThreadPoolExecutor(max_workers=1)
                .submit(fn)
                .result(timeout=policy.timeout_ms / 1000.0),
            )
        return result

    try:
        for attempt in range(policy.max_attempts):
            attempt_index = attempt
            started = time.time()
            current_call = call_fn
            recovery_provider = provider
            current_model = model

            fallback = _resolve_fallback(policy, attempt, registered)
            if fallback and attempt > 0:
                recovery_provider = fallback.get("provider") or provider
                current_model = fallback.get("model") or model
                fb_call = fallback.get("_callable") or fallback.get("call_fn")
                if callable(fb_call):
                    current_call = lambda fc=fb_call: fc()

            try:
                resp = await _invoke(current_call)
                latency_ms = int((time.time() - started) * 1000)
                classification = classify_response(
                    provider,
                    resp,
                    override=policy.classify_response_override,
                )
                classification.latency_ms = latency_ms

                if classification.usable:
                    outcome = "recovered" if attempt_index > 0 else "success"
                    record = AttemptRecord(
                        attempt_index=attempt_index,
                        provider=recovery_provider,
                        model=current_model,
                        classification=classification,
                        recovery_provider=recovery_provider if attempt_index > 0 else None,
                        outcome=outcome,
                        cost_type="inference",
                    )
                    if attempt_index > 0 and calculate_cost_fn:
                        record.projected_cost = estimate_projected_reroute_cost(
                            model,
                            current_model,
                            input_tokens_estimate,
                            output_tokens_estimate,
                            0.0,
                            calculate_cost_fn,
                        )
                        record.loss_avoided = record.projected_cost
                    on_attempt(record, resp, None)
                    meta["attempts"].append(record)
                    if attempt_index > 0 and policy.on_recovery:
                        try:
                            policy.on_recovery(workflow_id=workflow_id, attempt=attempt_index, model=current_model)
                        except Exception:
                            pass
                    return resp, meta

                last_resp = resp
                billed_cost = 0.0
                if classification.billed and calculate_cost_fn:
                    billed_cost = calculate_cost_fn(current_model, input_tokens_estimate, output_tokens_estimate)
                    extra_cost += billed_cost

                fb_model = None
                nxt = _resolve_fallback(policy, attempt + 1, registered)
                if nxt:
                    fb_model = nxt.get("model")

                projected = estimate_projected_reroute_cost(
                    current_model,
                    fb_model,
                    input_tokens_estimate,
                    output_tokens_estimate,
                    billed_cost,
                    calculate_cost_fn or (lambda *a, **k: 0.0),
                )
                record = AttemptRecord(
                    attempt_index=attempt_index,
                    provider=recovery_provider,
                    model=current_model,
                    classification=classification,
                    cost=billed_cost,
                    projected_cost=projected,
                    loss_avoided=projected if policy.mode == "observe" else 0.0,
                    outcome="degraded",
                    cost_type="unfulfilled_spend",
                )
                on_attempt(record, resp, None)
                meta["attempts"].append(record)

                if (
                    enforce
                    and not skip_recovery
                    and attempt < policy.max_attempts - 1
                    and is_retryable(classification.kind, policy.retry_on)
                    and _idempotency_allows_retry(policy, idempotency_key, classification.kind)
                    and extra_cost <= policy.max_extra_cost_usd
                ):
                    await asyncio.sleep(_backoff_ms(policy, attempt) / 1000.0)
                    continue

                if enforce and attempt >= policy.max_attempts - 1:
                    raise AurexResilienceExhausted(
                        f"Resilience exhausted after {policy.max_attempts} attempts",
                        workflow_id=workflow_id,
                        last_error=classification.kind,
                    )
                return resp, meta

            except AurexResilienceExhausted:
                raise
            except Exception as exc:
                last_exc = exc
                latency_ms = int((time.time() - started) * 1000)
                classification = classify_response(provider, None, exc)
                classification.latency_ms = latency_ms
                record = AttemptRecord(
                    attempt_index=attempt_index,
                    provider=recovery_provider,
                    model=current_model,
                    classification=classification,
                    outcome="failure",
                    cost_type="inference",
                )
                on_attempt(record, None, exc)
                meta["attempts"].append(record)

                if (
                    enforce
                    and not skip_recovery
                    and attempt < policy.max_attempts - 1
                    and is_retryable(classification.kind, policy.retry_on)
                    and _idempotency_allows_retry(policy, idempotency_key, classification.kind)
                    and extra_cost <= policy.max_extra_cost_usd
                ):
                    await asyncio.sleep(_backoff_ms(policy, attempt) / 1000.0)
                    continue

                if enforce and attempt >= policy.max_attempts - 1:
                    raise AurexResilienceExhausted(
                        str(exc),
                        workflow_id=workflow_id,
                        last_error=classification.kind,
                    ) from exc
                raise exc

        if last_exc:
            raise last_exc
        return last_resp, meta
    except AurexResilienceExhausted:
        raise
    except Exception:
        try:
            result = call_fn()
            if asyncio.iscoroutine(result):
                return await result, {"resilience": "fail_open"}
            return result, {"resilience": "fail_open"}
        except Exception as exc:
            raise exc
