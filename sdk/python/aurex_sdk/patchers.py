"""Modular provider SDK auto-instrumentation adapters with upstream drift diagnostics."""

from __future__ import annotations

import os
import sys
from typing import Any, Callable, Dict, Optional, Tuple

from aurex_sdk.decisions import AurexDecision, apply_decision_to_call_params
from aurex_sdk.exceptions import AurexBlocked, AurexBudgetExceeded, AurexProviderDriftError
from aurex_sdk.prefix_shield import append_tail_instruction
from aurex_sdk.pricing import extract_provider, normalize_model_name
from aurex_sdk.runtime_guard import (
    build_cached_response,
    disable_sdk_internal_retries,
    ensure_openai_stream_usage,
    extract_anthropic_response_details,
    extract_client_base_url,
    extract_messages_prompts,
    extract_openai_response_details,
    extract_responses_api_usage,
    normalize_responses_api_input,
    report_provider_drift,
    resolve_endpoint_provider,
    sanitize_thinking_params,
    strip_aurex_params,
)
from aurex_sdk.state_store import resolve_workflow_id


def _active(fallback: Any) -> Any:
    from aurex_sdk.auditor import AurexAuditor

    return AurexAuditor._instance or fallback


def _drift(auditor: Any, provider: str, mod: Any, symbol: str, msg: str) -> None:
    auditor._patch_status[provider] = f"drift:{symbol}"
    report_provider_drift(
        provider=provider,
        missing_symbol=symbol,
        message=msg,
        provider_version=getattr(mod, "__version__", None),
        strict=bool(getattr(auditor.config, "strict_provider_drift", False)),
        drift_log=auditor._drift_warnings,
    )


def _merge_decision_meta(aurex_meta: Dict[str, Any], decision: Optional[AurexDecision], orig_model: Any) -> None:
    if not decision:
        return
    if decision.action == "downgrade" and decision.suggested_model:
        aurex_meta["aurex_original_model"] = decision.original_model or orig_model
        aurex_meta["aurex_model_downgraded"] = True
    if decision.shield_meta:
        aurex_meta["stage1_shield"] = decision.shield_meta


def _should_rethrow(auditor: Any, exc: BaseException, decision: Optional[AurexDecision]) -> bool:
    if isinstance(exc, (AurexBlocked, AurexBudgetExceeded, AurexProviderDriftError)):
        return True
    if decision and decision.action == "block":
        return True
    return os.getenv("AUREX_BLOCK_ON_WASTE") == "1" or auditor._budget_config.get("on_budget_exceeded") == "throw"


def _run_chat_precheck(
    auditor: Any,
    kwargs: Dict[str, Any],
    *,
    provider: str,
    workflow_id: str,
    user_prompt: Optional[str],
    system_prompt: Optional[Any],
    messages: Any,
    tenant_id: Optional[str],
    aurex_meta: Dict[str, Any],
    response_format: Optional[Any] = None,
) -> Tuple[Dict[str, Any], Optional[Any]]:
    decision: Optional[AurexDecision] = None
    orig_model = kwargs.get("model", "unknown")
    try:
        decision = auditor.pre_call_check(
            model=orig_model,
            prompt=user_prompt,
            system_prompt=system_prompt,
            workflow_id=workflow_id,
            messages=messages,
            tools=kwargs.get("tools"),
            response_format=response_format if response_format is not None else kwargs.get("response_format"),
            tenant_id=tenant_id,
        )
        if decision:
            if decision.action == "cache_suggest" and decision.response:
                return kwargs, build_cached_response(provider, decision.response, orig_model)
            kwargs = apply_decision_to_call_params(kwargs, decision)
            _merge_decision_meta(aurex_meta, decision, orig_model)
    except Exception as exc:
        if _should_rethrow(auditor, exc, decision):
            raise
        print(f"[Aurex SDK Real-Time Warning Check Error] {exc}", file=sys.stderr)
    return kwargs, None


def log_openai_response(
    auditor: Any,
    kwargs: Dict[str, Any],
    resp: Any,
    *,
    tags: Optional[Dict[str, str]] = None,
    quality_score: Optional[float] = None,
    provider: Optional[str] = None,
    workflow_id: Optional[str] = None,
    aurex_meta: Optional[Dict[str, Any]] = None,
    ctx: Optional[Dict[str, Any]] = None,
) -> None:
    det = extract_openai_response_details(resp)
    system_prompt, user_prompt = extract_messages_prompts(kwargs.get("messages", []))
    wf = workflow_id or resolve_workflow_id(kwargs.get("user"), ctx)
    if det["response_text"]:
        auditor.record_response(wf, det["response_text"])
    merged_meta = dict(aurex_meta or {})
    if isinstance(kwargs.get("metadata"), dict):
        merged_meta.update(kwargs["metadata"])
    auditor.log_event(
        model=kwargs.get("model", "unknown"),
        prompt=user_prompt,
        response=det["response_text"],
        input_tokens=det["input_tokens"],
        output_tokens=det["output_tokens"],
        cached_tokens=det["cached_tokens"],
        reasoning_tokens=det["reasoning_tokens"],
        workflow_id=wf,
        system_prompt=system_prompt,
        extra_metadata=merged_meta or None,
        tool_calls_count=det["tool_calls_count"],
        tool_names=det["tool_names"],
        tags=tags,
        quality_score=quality_score,
        provider=provider,
        finish_reason=det["finish_reason"],
    )


def log_anthropic_response(
    auditor: Any,
    kwargs: Dict[str, Any],
    resp: Any,
    *,
    tags: Optional[Dict[str, str]] = None,
    quality_score: Optional[float] = None,
    workflow_id: Optional[str] = None,
    aurex_meta: Optional[Dict[str, Any]] = None,
    ctx: Optional[Dict[str, Any]] = None,
) -> None:
    det = extract_anthropic_response_details(resp)
    _, user_prompt = extract_messages_prompts(kwargs.get("messages", []))
    raw_sys = kwargs.get("system")
    meta_wf = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None
    wf = workflow_id or meta_wf or resolve_workflow_id(None, ctx)
    if det["response_text"]:
        auditor.record_response(wf, det["response_text"])
    merged_meta = dict(aurex_meta or {})
    if isinstance(kwargs.get("metadata"), dict):
        merged_meta.update(kwargs["metadata"])
    auditor.log_event(
        model=kwargs.get("model", "unknown"),
        prompt=user_prompt,
        response=det["response_text"],
        input_tokens=det["input_tokens"],
        output_tokens=det["output_tokens"],
        cached_tokens=det["cached_tokens"],
        cache_write_tokens=det["cache_write_tokens"],
        cache_write_1h_tokens=det["cache_write_1h_tokens"],
        reasoning_tokens=det["reasoning_tokens"],
        workflow_id=wf,
        system_prompt=raw_sys,
        extra_metadata=merged_meta or None,
        tool_calls_count=det["tool_calls_count"],
        tool_names=det["tool_names"],
        tags=tags,
        quality_score=quality_score,
        provider="anthropic",
        finish_reason=det["finish_reason"],
    )


def _wrap_openai_stream_helper(orig_fn: Callable[..., Any], ctx_var: Any) -> Callable[..., Any]:
    def stream_helper_wrapped(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
        ctx = ctx_var.get()
        clean_kw, ex = strip_aurex_params(kwargs, provider="openai", ctx=ctx)
        overrides: Dict[str, Any] = {}
        if ex["workflow_id"]:
            overrides["workflow_id"] = ex["workflow_id"]
        if ex["tags"]:
            overrides["tags"] = ex["tags"]
        if ex["quality_score"] is not None:
            overrides["quality_score"] = ex["quality_score"]
        if ex["tenant_id"]:
            overrides["tenant_id"] = ex["tenant_id"]
        if not overrides:
            return orig_fn(cls_self, *args, **clean_kw)
        merged_ctx = dict(ctx)
        merged_ctx.update(overrides)
        tok = ctx_var.set(merged_ctx)
        try:
            mgr = orig_fn(cls_self, *args, **clean_kw)
            # Re-bind __enter__ / __aenter__ so contextvars stay active when request fires on enter!
            if hasattr(mgr, "__enter__"):
                orig_enter = mgr.__enter__

                def _enter_with_ctx() -> Any:
                    t2 = ctx_var.set(merged_ctx)
                    try:
                        return orig_enter()
                    finally:
                        ctx_var.reset(t2)

                mgr.__enter__ = _enter_with_ctx
            return mgr
        finally:
            ctx_var.reset(tok)

    stream_helper_wrapped.__aurex_patched__ = True  # type: ignore[attr-defined]
    return stream_helper_wrapped


def _wrap_openai_chat_method(auditor: Any, orig_fn: Callable[..., Any], *, is_async: bool, is_parse: bool, ctx_var: Any) -> Callable[..., Any]:
    if not is_async:
        def sync_wrapped(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
            aud = _active(auditor)
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="openai", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            sys_p, user_p = extract_messages_prompts(clean_kw.get("messages", []))
            clean_kw, cached = _run_chat_precheck(
                aud, clean_kw, provider="openai", workflow_id=wf, user_prompt=user_p,
                system_prompt=sys_p, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
                aurex_meta=ex["extra_metadata"],
            )
            if cached is not None:
                return cached
            base_url = extract_client_base_url(cls_self, clean_kw)
            prov = resolve_endpoint_provider(clean_kw.get("model", "unknown"), base_url)
            if not is_parse:
                clean_kw = ensure_openai_stream_usage(clean_kw)
            enforced = bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce")
            target = disable_sdk_internal_retries(cls_self, enforced)
            resp = aud._call_with_resilience(
                lambda: orig_fn(target, *args, **clean_kw),
                provider=prov, workflow_id=wf, model=clean_kw.get("model", "unknown"),
            )
            if not is_parse and clean_kw.get("stream") is True:
                return aud._wrap_sync_stream(
                    resp, clean_kw, wf, user_p, sys_p, provider=prov,
                    tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                )
            try:
                log_openai_response(
                    aud, clean_kw, resp, tags=ex["tags"], quality_score=ex["quality_score"],
                    provider=prov, workflow_id=wf, aurex_meta=ex["extra_metadata"], ctx=ctx,
                )
            except (AurexBlocked, AurexBudgetExceeded):
                raise
            except Exception as err:
                print(f"[Aurex SDK Patch Error] OpenAI patch failed: {err}", file=sys.stderr)
            return resp
        sync_wrapped.__aurex_patched__ = True  # type: ignore[attr-defined]
        return sync_wrapped

    async def async_wrapped(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
        aud = _active(auditor)
        ctx = ctx_var.get()
        clean_kw, ex = strip_aurex_params(kwargs, provider="openai", ctx=ctx)
        wf = resolve_workflow_id(ex["workflow_id"], ctx)
        sys_p, user_p = extract_messages_prompts(clean_kw.get("messages", []))
        clean_kw, cached = _run_chat_precheck(
            aud, clean_kw, provider="openai", workflow_id=wf, user_prompt=user_p,
            system_prompt=sys_p, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
            aurex_meta=ex["extra_metadata"],
        )
        if cached is not None:
            return cached
        base_url = extract_client_base_url(cls_self, clean_kw)
        prov = resolve_endpoint_provider(clean_kw.get("model", "unknown"), base_url)
        if not is_parse:
            clean_kw = ensure_openai_stream_usage(clean_kw)
        enforced = bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce")
        target = disable_sdk_internal_retries(cls_self, enforced)
        resp = await aud._acall_with_resilience(
            lambda: orig_fn(target, *args, **clean_kw),
            provider=prov, workflow_id=wf, model=clean_kw.get("model", "unknown"),
        )
        if not is_parse and clean_kw.get("stream") is True:
            return aud._wrap_async_stream(
                resp, clean_kw, wf, user_p, sys_p, provider=prov,
                tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
            )
        try:
            log_openai_response(
                aud, clean_kw, resp, tags=ex["tags"], quality_score=ex["quality_score"],
                provider=prov, workflow_id=wf, aurex_meta=ex["extra_metadata"], ctx=ctx,
            )
        except (AurexBlocked, AurexBudgetExceeded):
            raise
        except Exception as err:
            print(f"[Aurex SDK Patch Error] OpenAI async patch failed: {err}", file=sys.stderr)
        return resp
    async_wrapped.__aurex_patched__ = True  # type: ignore[attr-defined]
    return async_wrapped


def _wrap_openai_responses_method(auditor: Any, orig_fn: Callable[..., Any], *, is_async: bool, ctx_var: Any) -> Callable[..., Any]:
    def _log_resp(aud: Any, clean_kw: Dict[str, Any], resp: Any, wf: str, user_p: Optional[str], sys_p: Optional[str], prov: str, ex: Dict[str, Any]) -> None:
        parsed = extract_responses_api_usage(resp)
        if parsed["response_text"]:
            aud.record_response(wf, parsed["response_text"])
        merged_meta = dict(ex["extra_metadata"] or {})
        if isinstance(clean_kw.get("metadata"), dict):
            merged_meta.update(clean_kw["metadata"])
        aud.log_event(
            model=clean_kw.get("model", "unknown"),
            prompt=user_p,
            response=parsed["response_text"],
            input_tokens=parsed["input_tokens"],
            output_tokens=parsed["output_tokens"],
            cached_tokens=parsed["cached_tokens"],
            reasoning_tokens=parsed["reasoning_tokens"],
            workflow_id=wf,
            system_prompt=sys_p,
            extra_metadata=merged_meta or None,
            tags=ex["tags"],
            quality_score=ex["quality_score"],
            provider=prov,
            finish_reason=parsed["finish_reason"],
        )

    if not is_async:
        def sync_resp(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
            aud = _active(auditor)
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="openai", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            user_p, sys_p, messages = normalize_responses_api_input(clean_kw)
            rf = clean_kw.get("text_format") or clean_kw.get("text")
            clean_kw, _ = _run_chat_precheck(
                aud, clean_kw, provider="openai", workflow_id=wf, user_prompt=user_p,
                system_prompt=sys_p, messages=messages, tenant_id=ex["tenant_id"],
                aurex_meta=ex["extra_metadata"], response_format=rf,
            )
            prov = resolve_endpoint_provider(clean_kw.get("model", "unknown"), extract_client_base_url(cls_self, clean_kw))
            target = disable_sdk_internal_retries(cls_self, bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce"))
            resp = aud._call_with_resilience(
                lambda: orig_fn(target, *args, **clean_kw),
                provider=prov, workflow_id=wf, model=clean_kw.get("model", "unknown"),
            )
            if clean_kw.get("stream") is True:
                return aud._wrap_sync_stream(
                    resp, {**clean_kw, "messages": messages}, wf, user_p, sys_p, provider=prov,
                    tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                )
            try:
                _log_resp(aud, clean_kw, resp, wf, user_p, sys_p, prov, ex)
            except (AurexBlocked, AurexBudgetExceeded):
                raise
            except Exception as err:
                print(f"[Aurex SDK Patch Error] OpenAI Responses patch failed: {err}", file=sys.stderr)
            return resp
        sync_resp.__aurex_patched__ = True  # type: ignore[attr-defined]
        return sync_resp

    async def async_resp(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
        aud = _active(auditor)
        ctx = ctx_var.get()
        clean_kw, ex = strip_aurex_params(kwargs, provider="openai", ctx=ctx)
        wf = resolve_workflow_id(ex["workflow_id"], ctx)
        user_p, sys_p, messages = normalize_responses_api_input(clean_kw)
        rf = clean_kw.get("text_format") or clean_kw.get("text")
        clean_kw, _ = _run_chat_precheck(
            aud, clean_kw, provider="openai", workflow_id=wf, user_prompt=user_p,
            system_prompt=sys_p, messages=messages, tenant_id=ex["tenant_id"],
            aurex_meta=ex["extra_metadata"], response_format=rf,
        )
        prov = resolve_endpoint_provider(clean_kw.get("model", "unknown"), extract_client_base_url(cls_self, clean_kw))
        target = disable_sdk_internal_retries(cls_self, bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce"))
        resp = await aud._acall_with_resilience(
            lambda: orig_fn(target, *args, **clean_kw),
            provider=prov, workflow_id=wf, model=clean_kw.get("model", "unknown"),
        )
        if clean_kw.get("stream") is True:
            return aud._wrap_async_stream(
                resp, {**clean_kw, "messages": messages}, wf, user_p, sys_p, provider=prov,
                tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
            )
        try:
            _log_resp(aud, clean_kw, resp, wf, user_p, sys_p, prov, ex)
        except (AurexBlocked, AurexBudgetExceeded):
            raise
        except Exception as err:
            print(f"[Aurex SDK Patch Error] OpenAI AsyncResponses patch failed: {err}", file=sys.stderr)
        return resp
    async_resp.__aurex_patched__ = True  # type: ignore[attr-defined]
    return async_resp


def patch_openai_sdk(auditor: Any, ctx_var: Any) -> None:
    try:
        import openai
    except ImportError:
        auditor._patch_status["openai"] = "not_installed"
        return

    chat_mod = getattr(getattr(getattr(openai, "resources", None), "chat", None), "completions", None)
    comp_cls = getattr(chat_mod, "Completions", None)
    acomp_cls = getattr(chat_mod, "AsyncCompletions", None)
    if comp_cls is None or not hasattr(comp_cls, "create"):
        _drift(auditor, "openai", openai, "resources.chat.completions.Completions.create",
               "OpenAI SDK layout changed: missing Completions.create")
        return

    if getattr(comp_cls.create, "__aurex_patched__", False):
        auditor._patch_status["openai"] = "already_patched"
        return

    comp_cls.create = _wrap_openai_chat_method(auditor, comp_cls.create, is_async=False, is_parse=False, ctx_var=ctx_var)
    if hasattr(comp_cls, "parse") and not getattr(comp_cls.parse, "__aurex_patched__", False):
        comp_cls.parse = _wrap_openai_chat_method(auditor, comp_cls.parse, is_async=False, is_parse=True, ctx_var=ctx_var)
    if hasattr(comp_cls, "stream") and not getattr(comp_cls.stream, "__aurex_patched__", False):
        comp_cls.stream = _wrap_openai_stream_helper(comp_cls.stream, ctx_var=ctx_var)

    if acomp_cls is not None and hasattr(acomp_cls, "create") and not getattr(acomp_cls.create, "__aurex_patched__", False):
        acomp_cls.create = _wrap_openai_chat_method(auditor, acomp_cls.create, is_async=True, is_parse=False, ctx_var=ctx_var)
        if hasattr(acomp_cls, "parse") and not getattr(acomp_cls.parse, "__aurex_patched__", False):
            acomp_cls.parse = _wrap_openai_chat_method(auditor, acomp_cls.parse, is_async=True, is_parse=True, ctx_var=ctx_var)
        if hasattr(acomp_cls, "stream") and not getattr(acomp_cls.stream, "__aurex_patched__", False):
            acomp_cls.stream = _wrap_openai_stream_helper(acomp_cls.stream, ctx_var=ctx_var)

    resp_mod = getattr(getattr(openai, "resources", None), "responses", None)
    if resp_mod is None:
        try:
            import openai.resources.responses as resp_mod  # type: ignore
        except ImportError:
            resp_mod = None
    if resp_mod is not None:
        r_cls = getattr(resp_mod, "Responses", None)
        ar_cls = getattr(resp_mod, "AsyncResponses", None)
        if r_cls is not None:
            if hasattr(r_cls, "create") and not getattr(r_cls.create, "__aurex_patched__", False):
                r_cls.create = _wrap_openai_responses_method(auditor, r_cls.create, is_async=False, ctx_var=ctx_var)
            if hasattr(r_cls, "parse") and not getattr(r_cls.parse, "__aurex_patched__", False):
                r_cls.parse = _wrap_openai_responses_method(auditor, r_cls.parse, is_async=False, ctx_var=ctx_var)
            if hasattr(r_cls, "stream") and not getattr(r_cls.stream, "__aurex_patched__", False):
                r_cls.stream = _wrap_openai_stream_helper(r_cls.stream, ctx_var=ctx_var)
        if ar_cls is not None:
            if hasattr(ar_cls, "create") and not getattr(ar_cls.create, "__aurex_patched__", False):
                ar_cls.create = _wrap_openai_responses_method(auditor, ar_cls.create, is_async=True, ctx_var=ctx_var)
            if hasattr(ar_cls, "parse") and not getattr(ar_cls.parse, "__aurex_patched__", False):
                ar_cls.parse = _wrap_openai_responses_method(auditor, ar_cls.parse, is_async=True, ctx_var=ctx_var)
            if hasattr(ar_cls, "stream") and not getattr(ar_cls.stream, "__aurex_patched__", False):
                ar_cls.stream = _wrap_openai_stream_helper(ar_cls.stream, ctx_var=ctx_var)

    auditor._patch_status["openai"] = "patched"


def _wrap_anthropic_method(auditor: Any, orig_fn: Callable[..., Any], *, is_async: bool, is_stream_mgr: bool, ctx_var: Any) -> Callable[..., Any]:
    if is_stream_mgr:
        def stream_mgr_wrapped(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
            aud = _active(auditor)
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="anthropic", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            raw_sys = clean_kw.get("system")
            _, user_p = extract_messages_prompts(clean_kw.get("messages", []))
            clean_kw, _ = _run_chat_precheck(
                aud, clean_kw, provider="anthropic", workflow_id=wf, user_prompt=user_p,
                system_prompt=raw_sys, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
                aurex_meta=ex["extra_metadata"], response_format=clean_kw.get("output_format"),
            )
            target = disable_sdk_internal_retries(cls_self, bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce"))
            mgr = orig_fn(target, *args, **clean_kw)
            priv_attr = "_AsyncMessageStreamManager__api_request" if is_async else "_MessageStreamManager__api_request"
            orig_req = getattr(mgr, priv_attr, None)
            if callable(orig_req):
                if is_async:
                    async def wrapped_areq() -> Any:
                        raw_s = await orig_req()
                        return _active(aud)._wrap_async_stream(
                            raw_s, clean_kw, wf, user_p, raw_sys, provider="anthropic",
                            tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                        )
                    setattr(mgr, priv_attr, wrapped_areq)
                else:
                    def wrapped_req() -> Any:
                        raw_s = orig_req()
                        return _active(aud)._wrap_sync_stream(
                            raw_s, clean_kw, wf, user_p, raw_sys, provider="anthropic",
                            tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                        )
                    setattr(mgr, priv_attr, wrapped_req)
            return mgr
        stream_mgr_wrapped.__aurex_patched__ = True  # type: ignore[attr-defined]
        return stream_mgr_wrapped

    if not is_async:
        def sync_anth(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
            aud = _active(auditor)
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="anthropic", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            raw_sys = clean_kw.get("system")
            _, user_p = extract_messages_prompts(clean_kw.get("messages", []))
            clean_kw, cached = _run_chat_precheck(
                aud, clean_kw, provider="anthropic", workflow_id=wf, user_prompt=user_p,
                system_prompt=raw_sys, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
                aurex_meta=ex["extra_metadata"], response_format=clean_kw.get("output_format"),
            )
            if cached is not None:
                return cached
            target = disable_sdk_internal_retries(cls_self, bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce"))
            resp = aud._call_with_resilience(
                lambda: orig_fn(target, *args, **clean_kw),
                provider="anthropic", workflow_id=wf, model=clean_kw.get("model", "unknown"),
            )
            if clean_kw.get("stream") is True:
                return aud._wrap_sync_stream(
                    resp, clean_kw, wf, user_p, raw_sys, provider="anthropic",
                    tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                )
            try:
                log_anthropic_response(
                    aud, clean_kw, resp, tags=ex["tags"], quality_score=ex["quality_score"],
                    workflow_id=wf, aurex_meta=ex["extra_metadata"], ctx=ctx,
                )
            except (AurexBlocked, AurexBudgetExceeded):
                raise
            except Exception as err:
                print(f"[Aurex SDK Patch Error] Anthropic patch failed: {err}", file=sys.stderr)
            return resp
        sync_anth.__aurex_patched__ = True  # type: ignore[attr-defined]
        return sync_anth

    async def async_anth(cls_self: Any, *args: Any, **kwargs: Any) -> Any:
        aud = _active(auditor)
        ctx = ctx_var.get()
        clean_kw, ex = strip_aurex_params(kwargs, provider="anthropic", ctx=ctx)
        wf = resolve_workflow_id(ex["workflow_id"], ctx)
        raw_sys = clean_kw.get("system")
        _, user_p = extract_messages_prompts(clean_kw.get("messages", []))
        clean_kw, cached = _run_chat_precheck(
            aud, clean_kw, provider="anthropic", workflow_id=wf, user_prompt=user_p,
            system_prompt=raw_sys, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
            aurex_meta=ex["extra_metadata"], response_format=clean_kw.get("output_format"),
        )
        if cached is not None:
            return cached
        target = disable_sdk_internal_retries(cls_self, bool(aud._resilience_policy.enabled and aud._resilience_policy.mode == "enforce"))
        resp = await aud._acall_with_resilience(
            lambda: orig_fn(target, *args, **clean_kw),
            provider="anthropic", workflow_id=wf, model=clean_kw.get("model", "unknown"),
        )
        if clean_kw.get("stream") is True:
            return aud._wrap_async_stream(
                resp, clean_kw, wf, user_p, raw_sys, provider="anthropic",
                tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
            )
        try:
            log_anthropic_response(
                aud, clean_kw, resp, tags=ex["tags"], quality_score=ex["quality_score"],
                workflow_id=wf, aurex_meta=ex["extra_metadata"], ctx=ctx,
            )
        except (AurexBlocked, AurexBudgetExceeded):
            raise
        except Exception as err:
            print(f"[Aurex SDK Patch Error] Anthropic async patch failed: {err}", file=sys.stderr)
        return resp
    async_anth.__aurex_patched__ = True  # type: ignore[attr-defined]
    return async_anth


def patch_anthropic_sdk(auditor: Any, ctx_var: Any) -> None:
    try:
        import anthropic
    except ImportError:
        auditor._patch_status["anthropic"] = "not_installed"
        return

    msg_mod = getattr(getattr(anthropic, "resources", None), "messages", None)
    m_cls = getattr(msg_mod, "Messages", None)
    am_cls = getattr(msg_mod, "AsyncMessages", None)
    if m_cls is None or not hasattr(m_cls, "create"):
        _drift(auditor, "anthropic", anthropic, "resources.messages.Messages.create",
               "Anthropic SDK layout changed: missing Messages.create")
        return

    if getattr(m_cls.create, "__aurex_patched__", False):
        auditor._patch_status["anthropic"] = "already_patched"
        return

    m_cls.create = _wrap_anthropic_method(auditor, m_cls.create, is_async=False, is_stream_mgr=False, ctx_var=ctx_var)
    if hasattr(m_cls, "parse") and not getattr(m_cls.parse, "__aurex_patched__", False):
        m_cls.parse = _wrap_anthropic_method(auditor, m_cls.parse, is_async=False, is_stream_mgr=False, ctx_var=ctx_var)
    if hasattr(m_cls, "stream") and not getattr(m_cls.stream, "__aurex_patched__", False):
        m_cls.stream = _wrap_anthropic_method(auditor, m_cls.stream, is_async=False, is_stream_mgr=True, ctx_var=ctx_var)

    if am_cls is not None:
        if hasattr(am_cls, "create") and not getattr(am_cls.create, "__aurex_patched__", False):
            am_cls.create = _wrap_anthropic_method(auditor, am_cls.create, is_async=True, is_stream_mgr=False, ctx_var=ctx_var)
        if hasattr(am_cls, "parse") and not getattr(am_cls.parse, "__aurex_patched__", False):
            am_cls.parse = _wrap_anthropic_method(auditor, am_cls.parse, is_async=True, is_stream_mgr=False, ctx_var=ctx_var)
        if hasattr(am_cls, "stream") and not getattr(am_cls.stream, "__aurex_patched__", False):
            am_cls.stream = _wrap_anthropic_method(auditor, am_cls.stream, is_async=True, is_stream_mgr=True, ctx_var=ctx_var)

    auditor._patch_status["anthropic"] = "patched"


def log_google_response(
    auditor: Any,
    model_self: Any,
    args: tuple,
    kwargs: Dict[str, Any],
    resp: Any,
    *,
    workflow_id: Optional[str] = None,
    tags: Optional[Dict[str, str]] = None,
    quality_score: Optional[float] = None,
    aurex_meta: Optional[Dict[str, Any]] = None,
    ctx: Optional[Dict[str, Any]] = None,
) -> None:
    model = normalize_model_name(model_self if isinstance(model_self, str) else getattr(model_self, "model_name", "gemini-2.5-flash"))

    def _as_int(v: Any) -> int:
        return v if isinstance(v, int) and not isinstance(v, bool) else 0

    in_toks = out_toks = thoughts_toks = cached_toks = 0
    um = getattr(resp, "usage_metadata", None)
    if um:
        in_toks = _as_int(getattr(um, "prompt_token_count", 0))
        cands = _as_int(getattr(um, "candidates_token_count", 0))
        thoughts_toks = _as_int(getattr(um, "thoughts_token_count", 0))
        cached_toks = _as_int(getattr(um, "cached_content_token_count", 0))
        out_toks = cands + thoughts_toks

    contents = kwargs.get("contents") or (args[0] if args else None)
    user_p = contents if isinstance(contents, str) else (" ".join(str(c) for c in contents) if isinstance(contents, list) else (str(contents) if contents else None))
    sys_p: Optional[str] = None
    cfg = kwargs.get("config") or (None if isinstance(model_self, str) else (getattr(model_self, "_system_instruction", None) or getattr(model_self, "system_instruction", None)))
    if cfg is not None:
        if hasattr(cfg, "system_instruction") and cfg.system_instruction:
            instr = cfg.system_instruction
            sys_p = " ".join(getattr(p, "text", str(p)) for p in instr.parts) if getattr(instr, "parts", None) else str(instr)
        elif isinstance(cfg, dict) and cfg.get("system_instruction"):
            sys_p = str(cfg["system_instruction"])
        elif hasattr(cfg, "parts") and cfg.parts:
            sys_p = " ".join(getattr(p, "text", str(p)) for p in cfg.parts)

    resp_text: Optional[str] = None
    try:
        if hasattr(resp, "text"):
            resp_text = resp.text
    except Exception:
        pass

    meta_wf = (kwargs.get("metadata") or {}).get("workflow_id") if isinstance(kwargs.get("metadata"), dict) else None
    wf = workflow_id or meta_wf or resolve_workflow_id(None, ctx)
    if resp_text:
        auditor.record_response(wf, resp_text)
    auditor.log_event(
        model=model,
        prompt=user_p,
        response=resp_text,
        input_tokens=in_toks,
        output_tokens=out_toks,
        cached_tokens=cached_toks,
        reasoning_tokens=thoughts_toks,
        workflow_id=wf,
        system_prompt=sys_p,
        extra_metadata=aurex_meta or None,
        tags=tags,
        quality_score=quality_score,
        provider="google",
    )


def _prepare_google_genai_call(auditor: Any, args: tuple, kwargs: Dict[str, Any], ctx: Dict[str, Any]) -> Tuple[tuple, Dict[str, Any], str, str, Optional[str], Optional[str], Dict[str, Any]]:
    clean_kw, ex = strip_aurex_params(kwargs, provider="google", ctx=ctx)
    wf = resolve_workflow_id(ex["workflow_id"], ctx)
    model = str(args[0] if len(args) > 0 else clean_kw.get("model") or "gemini-2.5-flash")
    contents = args[1] if len(args) > 1 else clean_kw.get("contents")
    cfg = args[2] if len(args) > 2 else clean_kw.get("config")

    user_p = contents if isinstance(contents, str) else (" ".join(str(c) for c in contents) if isinstance(contents, list) else (str(contents) if contents else None))
    sys_p: Optional[str] = None
    if cfg is not None:
        if hasattr(cfg, "system_instruction") and getattr(cfg, "system_instruction", None):
            instr = cfg.system_instruction
            sys_p = " ".join(getattr(p, "text", str(p)) for p in instr.parts) if getattr(instr, "parts", None) else str(instr)
        elif isinstance(cfg, dict) and cfg.get("system_instruction"):
            sys_p = str(cfg["system_instruction"])

    decision: Optional[AurexDecision] = None
    try:
        decision = auditor.pre_call_check(
            model=normalize_model_name(model), prompt=user_p, system_prompt=sys_p,
            workflow_id=wf, tenant_id=ex["tenant_id"],
        )
        if decision:
            downgraded = False
            if decision.action == "downgrade" and decision.suggested_model:
                model = decision.suggested_model
                downgraded = True
                if len(args) > 0:
                    args = (model,) + args[1:]
                else:
                    clean_kw["model"] = model
            # Tail-only guidance on contents (NEVER mutate system_instruction!)
            if decision.inject_system_instruction:
                tail_updated = append_tail_instruction({"contents": contents}, decision.inject_system_instruction)
                contents = tail_updated.get("contents")
                if len(args) > 1:
                    args = (args[0], contents) + args[2:]
                else:
                    clean_kw["contents"] = contents
            sanitized = sanitize_thinking_params(
                {"model": model, "config": cfg},
                is_downgraded=downgraded,
                max_thinking_tokens=decision.max_thinking_tokens,
            )
            if "config" in sanitized and cfg is not None:
                if len(args) > 2:
                    args = args[:2] + (sanitized["config"],) + args[3:]
                else:
                    clean_kw["config"] = sanitized["config"]
            _merge_decision_meta(ex["extra_metadata"], decision, model)
            if decision.action == "block":
                raise AurexBlocked(f"[Aurex] Blocked: {decision.reason}", workflow_id=wf, reason=decision.reason, action="block")
    except Exception as exc:
        if _should_rethrow(auditor, exc, decision):
            raise
        print(f"[Aurex SDK Real-Time Warning Check Error] {exc}", file=sys.stderr)

    return args, clean_kw, model, wf, user_p, sys_p, ex


def patch_google_sdk(auditor: Any, ctx_var: Any) -> None:
    patched_any = False
    try:
        from google import genai as google_genai  # type: ignore
        genai_models = getattr(google_genai, "models", None)
        if genai_models is None:
            import google.genai.models as genai_models  # type: ignore

        m_cls = getattr(genai_models, "Models", None)
        am_cls = getattr(genai_models, "AsyncModels", None)
        if m_cls is None or not hasattr(m_cls, "generate_content"):
            _drift(auditor, "google", google_genai, "models.Models.generate_content",
                   "google-genai SDK layout changed: missing Models.generate_content")
        else:
            if not getattr(m_cls.generate_content, "__aurex_patched__", False):
                orig_gen = m_cls.generate_content

                def sync_gen(models_self: Any, *args: Any, **kwargs: Any) -> Any:
                    aud = _active(auditor)
                    ctx = ctx_var.get()
                    args, clean_kw, model, wf, _, _, ex = _prepare_google_genai_call(aud, args, kwargs, ctx)
                    resp = aud._call_with_resilience(
                        lambda: orig_gen(models_self, *args, **clean_kw),
                        provider="google", workflow_id=wf, model=model,
                    )
                    try:
                        log_google_response(
                            aud, model, args[1:] if len(args) > 1 else (), clean_kw, resp,
                            workflow_id=wf, tags=ex["tags"], quality_score=ex["quality_score"],
                            aurex_meta=ex["extra_metadata"], ctx=ctx,
                        )
                    except (AurexBlocked, AurexBudgetExceeded):
                        raise
                    except Exception as err:
                        print(f"[Aurex SDK Patch Error] Google GenAI patch failed: {err}", file=sys.stderr)
                    return resp

                sync_gen.__aurex_patched__ = True  # type: ignore[attr-defined]
                m_cls.generate_content = sync_gen

            if hasattr(m_cls, "generate_content_stream") and not getattr(m_cls.generate_content_stream, "__aurex_patched__", False):
                orig_stream = m_cls.generate_content_stream

                def sync_gen_stream(models_self: Any, *args: Any, **kwargs: Any) -> Any:
                    aud = _active(auditor)
                    ctx = ctx_var.get()
                    args, clean_kw, model, wf, user_p, sys_p, ex = _prepare_google_genai_call(aud, args, kwargs, ctx)
                    resp = aud._call_with_resilience(
                        lambda: orig_stream(models_self, *args, **clean_kw),
                        provider="google", workflow_id=wf, model=model,
                    )
                    return aud._wrap_sync_stream(
                        resp, {"model": model}, wf, user_p, sys_p, provider="google",
                        tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                    )

                sync_gen_stream.__aurex_patched__ = True  # type: ignore[attr-defined]
                m_cls.generate_content_stream = sync_gen_stream

            if am_cls is not None:
                if hasattr(am_cls, "generate_content") and not getattr(am_cls.generate_content, "__aurex_patched__", False):
                    orig_agen = am_cls.generate_content

                    async def async_gen(models_self: Any, *args: Any, **kwargs: Any) -> Any:
                        aud = _active(auditor)
                        ctx = ctx_var.get()
                        args, clean_kw, model, wf, _, _, ex = _prepare_google_genai_call(aud, args, kwargs, ctx)
                        resp = await aud._acall_with_resilience(
                            lambda: orig_agen(models_self, *args, **clean_kw),
                            provider="google", workflow_id=wf, model=model,
                        )
                        try:
                            log_google_response(
                                aud, model, args[1:] if len(args) > 1 else (), clean_kw, resp,
                                workflow_id=wf, tags=ex["tags"], quality_score=ex["quality_score"],
                                aurex_meta=ex["extra_metadata"], ctx=ctx,
                            )
                        except (AurexBlocked, AurexBudgetExceeded):
                            raise
                        except Exception as err:
                            print(f"[Aurex SDK Patch Error] Google GenAI async patch failed: {err}", file=sys.stderr)
                        return resp

                    async_gen.__aurex_patched__ = True  # type: ignore[attr-defined]
                    am_cls.generate_content = async_gen

                if hasattr(am_cls, "generate_content_stream") and not getattr(am_cls.generate_content_stream, "__aurex_patched__", False):
                    orig_astream = am_cls.generate_content_stream

                    async def async_gen_stream(models_self: Any, *args: Any, **kwargs: Any) -> Any:
                        aud = _active(auditor)
                        ctx = ctx_var.get()
                        args, clean_kw, model, wf, user_p, sys_p, ex = _prepare_google_genai_call(aud, args, kwargs, ctx)
                        resp = await aud._acall_with_resilience(
                            lambda: orig_astream(models_self, *args, **clean_kw),
                            provider="google", workflow_id=wf, model=model,
                        )
                        return aud._wrap_async_stream(
                            resp, {"model": model}, wf, user_p, sys_p, provider="google",
                            tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"],
                        )

                    async_gen_stream.__aurex_patched__ = True  # type: ignore[attr-defined]
                    am_cls.generate_content_stream = async_gen_stream

            patched_any = True
    except ImportError:
        pass

    # Legacy google-generativeai fallback
    try:
        import google.generativeai as legacy_genai  # type: ignore

        gm = getattr(legacy_genai, "GenerativeModel", None)
        if gm is not None and hasattr(gm, "generate_content") and not getattr(gm.generate_content, "__aurex_patched__", False):
            orig_leg = gm.generate_content

            def leg_gen(model_self: Any, *args: Any, **kwargs: Any) -> Any:
                ctx = ctx_var.get()
                clean_kw, ex = strip_aurex_params(kwargs, provider="google", ctx=ctx)
                wf = resolve_workflow_id(ex["workflow_id"], ctx)
                model_name = normalize_model_name(getattr(model_self, "model_name", "gemini-1.5-flash"))
                contents = clean_kw.get("contents") or (args[0] if args else None)
                user_p = str(contents) if contents else None
                decision = auditor.pre_call_check(model=model_name, prompt=user_p, workflow_id=wf, tenant_id=ex["tenant_id"])
                if decision.action == "block":
                    raise AurexBlocked(f"[Aurex] Blocked: {decision.reason}", workflow_id=wf, reason=decision.reason, action="block")
                resp = auditor._call_with_resilience(lambda: orig_leg(model_self, *args, **clean_kw), provider="google", workflow_id=wf, model=model_name)
                if clean_kw.get("stream") is True:
                    return auditor._wrap_sync_stream(resp, {"model": model_name}, wf, user_p, None, provider="google")
                log_google_response(auditor, model_self, args, clean_kw, resp, workflow_id=wf, tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"], ctx=ctx)
                return resp

            leg_gen.__aurex_patched__ = True  # type: ignore[attr-defined]
            gm.generate_content = leg_gen
            patched_any = True
    except ImportError:
        pass

    if patched_any:
        auditor._patch_status["google"] = "patched"
    elif "google" not in auditor._patch_status:
        auditor._patch_status["google"] = "not_installed"


def log_litellm_response(auditor: Any, kwargs: Dict[str, Any], resp: Any, *, workflow_id: Optional[str] = None, tags: Optional[Dict[str, str]] = None, quality_score: Optional[float] = None, aurex_meta: Optional[Dict[str, Any]] = None, ctx: Optional[Dict[str, Any]] = None) -> None:
    det = extract_openai_response_details(resp)
    sys_p, user_p = extract_messages_prompts(kwargs.get("messages") or [])
    wf = workflow_id or resolve_workflow_id(kwargs.get("user"), ctx)
    if det["response_text"]:
        auditor.record_response(wf, det["response_text"])
    auditor.log_event(
        model=kwargs.get("model", "unknown"),
        prompt=user_p,
        response=det["response_text"],
        input_tokens=det["input_tokens"],
        output_tokens=det["output_tokens"],
        cached_tokens=det["cached_tokens"],
        reasoning_tokens=det["reasoning_tokens"],
        workflow_id=wf,
        system_prompt=sys_p,
        extra_metadata=aurex_meta or (kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else None),
        tool_calls_count=det["tool_calls_count"],
        tool_names=det["tool_names"],
        tags=tags,
        quality_score=quality_score,
        finish_reason=det["finish_reason"],
    )


def patch_litellm_sdk(auditor: Any, ctx_var: Any) -> None:
    try:
        import litellm  # type: ignore
    except ImportError:
        auditor._patch_status["litellm"] = "not_installed"
        return

    if not hasattr(litellm, "completion"):
        _drift(auditor, "litellm", litellm, "completion", "LiteLLM layout changed: missing litellm.completion")
        return

    orig = litellm.completion
    if not getattr(orig, "__aurex_patched__", False):
        def patched_comp(*args: Any, **kwargs: Any) -> Any:
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="litellm", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            sys_p, user_p = extract_messages_prompts(clean_kw.get("messages", []))
            prov = resolve_endpoint_provider(clean_kw.get("model", "unknown"), extract_client_base_url(None, clean_kw))
            clean_kw, cached = _run_chat_precheck(
                auditor, clean_kw, provider=prov, workflow_id=wf, user_prompt=user_p,
                system_prompt=sys_p, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
                aurex_meta=ex["extra_metadata"],
            )
            if cached is not None:
                return cached
            clean_kw = ensure_openai_stream_usage(clean_kw)
            resp = auditor._call_with_resilience(lambda: orig(*args, **clean_kw), provider=prov, workflow_id=wf, model=clean_kw.get("model", "unknown"))
            if clean_kw.get("stream") is True:
                return auditor._wrap_sync_stream(resp, clean_kw, wf, user_p, sys_p, provider=prov, tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"])
            log_litellm_response(auditor, clean_kw, resp, workflow_id=wf, tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"], ctx=ctx)
            return resp
        patched_comp.__aurex_patched__ = True  # type: ignore[attr-defined]
        litellm.completion = patched_comp

    orig_a = getattr(litellm, "acompletion", None)
    if orig_a is not None and not getattr(orig_a, "__aurex_patched__", False):
        async def patched_acomp(*args: Any, **kwargs: Any) -> Any:
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="litellm", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            sys_p, user_p = extract_messages_prompts(clean_kw.get("messages", []))
            prov = resolve_endpoint_provider(clean_kw.get("model", "unknown"), extract_client_base_url(None, clean_kw))
            clean_kw, cached = _run_chat_precheck(
                auditor, clean_kw, provider=prov, workflow_id=wf, user_prompt=user_p,
                system_prompt=sys_p, messages=clean_kw.get("messages", []), tenant_id=ex["tenant_id"],
                aurex_meta=ex["extra_metadata"],
            )
            if cached is not None:
                return cached
            clean_kw = ensure_openai_stream_usage(clean_kw)
            resp = await auditor._acall_with_resilience(lambda: orig_a(*args, **clean_kw), provider=prov, workflow_id=wf, model=clean_kw.get("model", "unknown"))
            if clean_kw.get("stream") is True:
                return auditor._wrap_async_stream(resp, clean_kw, wf, user_p, sys_p, provider=prov, tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"])
            log_litellm_response(auditor, clean_kw, resp, workflow_id=wf, tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"], ctx=ctx)
            return resp
        patched_acomp.__aurex_patched__ = True  # type: ignore[attr-defined]
        litellm.acompletion = patched_acomp

    auditor._patch_status["litellm"] = "patched"


def patch_ollama_sdk(auditor: Any, ctx_var: Any) -> None:
    try:
        import ollama  # type: ignore
    except ImportError:
        auditor._patch_status["ollama"] = "not_installed"
        return

    if not hasattr(ollama, "Client"):
        _drift(auditor, "ollama", ollama, "Client", "Ollama SDK layout changed: missing ollama.Client")
        return

    def _log_ol(aud: Any, model: str, resp: Any, wf: str, user_p: Optional[str], sys_p: Optional[str], ex: Dict[str, Any]) -> None:
        in_t = int((resp.get("prompt_eval_count", 0) if isinstance(resp, dict) else getattr(resp, "prompt_eval_count", 0)) or 0)
        out_t = int((resp.get("eval_count", 0) if isinstance(resp, dict) else getattr(resp, "eval_count", 0)) or 0)
        msg_obj = resp.get("message") if isinstance(resp, dict) else getattr(resp, "message", None)
        content = (msg_obj.get("content") if isinstance(msg_obj, dict) else getattr(msg_obj, "content", None)) if msg_obj else (resp.get("response") if isinstance(resp, dict) else getattr(resp, "response", None))
        if content:
            aud.record_response(wf, str(content))
        aud.log_event(model=model, prompt=user_p, response=content, input_tokens=in_t, output_tokens=out_t, workflow_id=wf, system_prompt=sys_p, tags=ex["tags"], quality_score=ex["quality_score"], extra_metadata=ex["extra_metadata"] or None, provider="ollama")

    def _make(orig: Callable[..., Any], is_chat: bool, is_async: bool) -> Callable[..., Any]:
        if not is_async:
            def sync_ol(*args: Any, **kwargs: Any) -> Any:
                aud = _active(auditor)
                ctx = ctx_var.get()
                clean_kw, ex = strip_aurex_params(kwargs, provider="ollama", ctx=ctx)
                wf = resolve_workflow_id(ex["workflow_id"], ctx)
                model = str(clean_kw.get("model") or "unknown")
                sys_p, user_p = extract_messages_prompts(clean_kw.get("messages", [])) if is_chat else (clean_kw.get("system"), clean_kw.get("prompt"))
                clean_kw, cached = _run_chat_precheck(aud, clean_kw, provider="ollama", workflow_id=wf, user_prompt=user_p, system_prompt=sys_p, messages=clean_kw.get("messages") if is_chat else None, tenant_id=ex["tenant_id"], aurex_meta=ex["extra_metadata"])
                if cached is not None:
                    return cached
                resp = aud._call_with_resilience(lambda: orig(*args, **clean_kw), provider="ollama", workflow_id=wf, model=clean_kw.get("model", model))
                if clean_kw.get("stream") is True:
                    return resp
                _log_ol(aud, clean_kw.get("model", model), resp, wf, user_p, sys_p, ex)
                return resp
            sync_ol.__aurex_patched__ = True  # type: ignore[attr-defined]
            return sync_ol

        async def async_ol(*args: Any, **kwargs: Any) -> Any:
            aud = _active(auditor)
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="ollama", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            model = str(clean_kw.get("model") or "unknown")
            sys_p, user_p = extract_messages_prompts(clean_kw.get("messages", [])) if is_chat else (clean_kw.get("system"), clean_kw.get("prompt"))
            clean_kw, cached = _run_chat_precheck(aud, clean_kw, provider="ollama", workflow_id=wf, user_prompt=user_p, system_prompt=sys_p, messages=clean_kw.get("messages") if is_chat else None, tenant_id=ex["tenant_id"], aurex_meta=ex["extra_metadata"])
            if cached is not None:
                return cached
            resp = await aud._acall_with_resilience(lambda: orig(*args, **clean_kw), provider="ollama", workflow_id=wf, model=clean_kw.get("model", model))
            if clean_kw.get("stream") is True:
                return resp
            _log_ol(aud, clean_kw.get("model", model), resp, wf, user_p, sys_p, ex)
            return resp
        async_ol.__aurex_patched__ = True  # type: ignore[attr-defined]
        return async_ol

    for target, is_a in [(ollama.Client, False), (getattr(ollama, "AsyncClient", None), True)]:
        if target is None:
            continue
        for m_name, is_c in [("chat", True), ("generate", False)]:
            fn = getattr(target, m_name, None)
            if fn and not getattr(fn, "__aurex_patched__", False):
                setattr(target, m_name, _make(fn, is_c, is_a))
    auditor._patch_status["ollama"] = "patched"


def patch_huggingface_sdk(auditor: Any, ctx_var: Any) -> None:
    try:
        import huggingface_hub  # type: ignore
    except ImportError:
        auditor._patch_status["huggingface"] = "not_installed"
        return

    inf_cls = getattr(huggingface_hub, "InferenceClient", None)
    ainf_cls = getattr(huggingface_hub, "AsyncInferenceClient", None)
    if inf_cls is None or not hasattr(inf_cls, "chat_completion"):
        _drift(auditor, "huggingface", huggingface_hub, "InferenceClient.chat_completion",
               "huggingface_hub layout changed: missing InferenceClient.chat_completion")
        return

    if not getattr(inf_cls.chat_completion, "__aurex_patched__", False):
        orig_c = inf_cls.chat_completion

        def sync_hf(self_c: Any, *args: Any, **kwargs: Any) -> Any:
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="huggingface", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            model = str(clean_kw.get("model") or getattr(self_c, "model", None) or "unknown")
            msgs = clean_kw.get("messages") or (args[0] if args else [])
            sys_p, user_p = extract_messages_prompts(msgs)
            clean_kw["model"] = model
            clean_kw, _ = _run_chat_precheck(auditor, clean_kw, provider="huggingface", workflow_id=wf, user_prompt=user_p, system_prompt=sys_p, messages=msgs, tenant_id=ex["tenant_id"], aurex_meta=ex["extra_metadata"])
            resp = auditor._call_with_resilience(lambda: orig_c(self_c, *args, **clean_kw), provider="huggingface", workflow_id=wf, model=clean_kw.get("model", model))
            if clean_kw.get("stream") is True:
                return auditor._wrap_sync_stream(resp, clean_kw, wf, user_p, sys_p, provider="huggingface", tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"])
            log_openai_response(auditor, clean_kw, resp, tags=ex["tags"], quality_score=ex["quality_score"], provider="huggingface", workflow_id=wf, aurex_meta=ex["extra_metadata"], ctx=ctx)
            return resp

        sync_hf.__aurex_patched__ = True  # type: ignore[attr-defined]
        inf_cls.chat_completion = sync_hf

    if ainf_cls is not None and hasattr(ainf_cls, "chat_completion") and not getattr(ainf_cls.chat_completion, "__aurex_patched__", False):
        orig_ac = ainf_cls.chat_completion

        async def async_hf(self_c: Any, *args: Any, **kwargs: Any) -> Any:
            ctx = ctx_var.get()
            clean_kw, ex = strip_aurex_params(kwargs, provider="huggingface", ctx=ctx)
            wf = resolve_workflow_id(ex["workflow_id"], ctx)
            model = str(clean_kw.get("model") or getattr(self_c, "model", None) or "unknown")
            msgs = clean_kw.get("messages") or (args[0] if args else [])
            sys_p, user_p = extract_messages_prompts(msgs)
            clean_kw["model"] = model
            clean_kw, _ = _run_chat_precheck(auditor, clean_kw, provider="huggingface", workflow_id=wf, user_prompt=user_p, system_prompt=sys_p, messages=msgs, tenant_id=ex["tenant_id"], aurex_meta=ex["extra_metadata"])
            resp = await auditor._acall_with_resilience(lambda: orig_ac(self_c, *args, **clean_kw), provider="huggingface", workflow_id=wf, model=clean_kw.get("model", model))
            if clean_kw.get("stream") is True:
                return auditor._wrap_async_stream(resp, clean_kw, wf, user_p, sys_p, provider="huggingface", tags=ex["tags"], quality_score=ex["quality_score"], aurex_meta=ex["extra_metadata"])
            log_openai_response(auditor, clean_kw, resp, tags=ex["tags"], quality_score=ex["quality_score"], provider="huggingface", workflow_id=wf, aurex_meta=ex["extra_metadata"], ctx=ctx)
            return resp

        async_hf.__aurex_patched__ = True  # type: ignore[attr-defined]
        ainf_cls.chat_completion = async_hf

    auditor._patch_status["huggingface"] = "patched"
