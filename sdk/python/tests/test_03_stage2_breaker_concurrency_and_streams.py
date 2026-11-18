"""Stage 2 real-usage tests: fakeredis multi-worker concurrency, real OTel spans, sync/async SSE streams, .parse/.stream, retries & drift."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import types
from typing import List
import warnings

import anthropic
import fakeredis
from google import genai
import ollama
import openai
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import BaseModel
import pytest

from aurex_sdk import (
    AurexAuditor,
    AurexBlocked,
    AurexConfig,
    AurexProviderDriftError,
    AurexProviderWarning,
)
from aurex_sdk.state_store import RedisStateStore


class ExtractedReport(BaseModel):
    invoice_id: str
    vendor: str
    total_usd: float


def test_fakeredis_multi_worker_shared_circuit_breaker(wire_server):
    shared_server = fakeredis.FakeServer()
    r_worker_1 = fakeredis.FakeRedis(server=shared_server, decode_responses=True)
    r_worker_2 = fakeredis.FakeRedis(server=shared_server, decode_responses=True)

    store_1 = RedisStateStore(redis_client=r_worker_1)
    store_2 = RedisStateStore(redis_client=r_worker_2)

    # 8 concurrent threads writing $0.15 each across Worker 1 and Worker 2 to 'shared-wf'
    def _record(idx: int) -> None:
        target = store_1 if idx % 2 == 0 else store_2
        target.add_spend("shared-wf", 0.15)
        target.add_spend(f"isolated-wf-{idx}", 0.05)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(_record, range(8)))

    summary_from_w2 = store_2.get_spend_summary("shared-wf")
    assert summary_from_w2["session_cost"] == pytest.approx(1.20, rel=1e-5)
    assert store_1.get_spend_summary("isolated-wf-3")["session_cost"] == pytest.approx(0.05, rel=1e-5)

    # Configure Auditor on Worker 2 with $1.00 session limit -> immediately blocks 'shared-wf' while allowing 'isolated-wf-3'!
    auditor = AurexAuditor(
        AurexConfig(
            storage_mode="memory",
            local_only=True,
            redis_client=r_worker_2,
            budget_guard={"max_cost_per_session": 1.00, "on_budget_exceeded": "throw"},
        )
    )
    auditor.patch_openai()
    client = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")

    with pytest.raises(AurexBlocked):
        client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Blocked by Worker 1 spend"}],
            workflow_id="shared-wf",
        )

    ok_resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Isolated workflow succeeds"}],
        workflow_id="isolated-wf-3",
    )
    assert ok_resp.choices[0].message.content == "OpenAI wire OK"


def test_real_opentelemetry_trace_workflow_binding_and_span_export(wire_server):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = provider.get_tracer("test-suite")

    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True, otel_export=True))
    auditor.patch_openai()
    client = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")

    # Activate real OTel span WITHOUT passing workflow_id -> Aurex binds to otel_<trace_id>!
    with tracer.start_as_current_span("parent_http_request") as parent_span:
        expected_trace_hex = f"otel_{parent_span.get_span_context().trace_id:032x}"
        # Temporarily point global tracer check if not yet set, or use use_span
        with otel_trace.use_span(parent_span, end_on_exit=False):
            client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": "Trace me automatically"}],
            )

    auditor.flush()
    ev = auditor.get_local_events()[-1]
    assert ev["workflow_id"] == expected_trace_hex


def test_all_sync_and_async_streams_parse_responses_and_abort(wire_server, corpus):
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    auditor.patch_all()

    oa_sync = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")
    oa_async = openai.AsyncOpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")
    ant_sync = anthropic.Anthropic(api_key="sk-ant", base_url=wire_server.base_url)
    ant_async = anthropic.AsyncAnthropic(api_key="sk-ant", base_url=wire_server.base_url)
    gem_client = genai.Client(api_key="gem-test", http_options={"base_url": wire_server.base_url})
    ol_client = ollama.Client(host=wire_server.base_url)

    # 1. OpenAI Chat Completions stream=True -> auto-injects stream_options.include_usage & reads choices=[] final chunk
    s_chunks = list(
        oa_sync.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Stream hello"}],
            stream=True,
            workflow_id="wf-oa-stream",
        )
    )
    assert wire_server.requests[-1]["body"]["stream_options"] == {"include_usage": True}
    assert "".join(c.choices[0].delta.content or "" for c in s_chunks if c.choices) == "Hello OpenAI SSE"

    # 2. OpenAI Structured Outputs .parse() with real Pydantic BaseModel
    wire_server.enqueue(
        {
            "json": {
                "id": "chatcmpl_parse_1",
                "object": "chat.completion",
                "created": 1763470000,
                "model": "gpt-4o-2024-08-06",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": corpus["openai_payloads"]["structured_invoice_json"],
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 310, "completion_tokens": 45, "total_tokens": 355},
            }
        }
    )
    parsed_comp = oa_sync.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[{"role": "user", "content": "Parse invoice"}],
        response_format=ExtractedReport,
        workflow_id="wf-oa-parse",
    )
    assert parsed_comp.choices[0].message.parsed.invoice_id == "INV-2026-991"

    # 3. OpenAI .stream() context manager
    with oa_sync.chat.completions.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Context manager stream"}],
        workflow_id="wf-oa-ctx-stream",
    ) as stream_mgr:
        final_comp = stream_mgr.get_final_completion()
        assert final_comp.choices[0].message.content == "Hello OpenAI SSE"

    # 4. OpenAI Responses API sync + stream SSE
    wire_server.enqueue({"json": corpus["openai_payloads"]["responses_api_json"]})
    r_resp = oa_sync.responses.create(model="gpt-4.1", input="Deploy canary", instructions="Be brief", workflow_id="wf-resp-json")
    assert "Deployed canary" in r_resp.output_text

    wire_server.enqueue({"sse": corpus["openai_payloads"]["responses_sse_events"]})
    r_events = list(oa_sync.responses.create(model="o4-mini", input="Check canary", stream=True, workflow_id="wf-resp-sse"))
    assert any(getattr(e, "type", "") == "response.completed" for e in r_events)

    # 5. Anthropic Messages split-event SSE (create(stream=True) AND messages.stream() context manager!)
    wire_server.enqueue({"sse": corpus["anthropic_claude_code"]["sse_stream_events"]})
    with ant_sync.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=256,
        messages=[{"role": "user", "content": "Fix pool leak"}],
        workflow_id="wf-ant-mgr-stream",
    ) as ant_stream:
        collected_text = "".join(ant_stream.text_stream)
    assert collected_text == "Fixed connection pool leak in production."

    # 6. Google GenAI generate_content & generate_content_stream (thoughtsTokenCount billed!)
    g_res = gem_client.models.generate_content(model="gemini-2.5-pro", contents="Check latency", workflow_id="wf-gem-sync")
    assert g_res.text == "Gemini wire OK"

    g_stream_text: List[str] = []
    for gc in gem_client.models.generate_content_stream(model="gemini-2.5-pro", contents="Stream latency", workflow_id="wf-gem-stream"):
        if gc.text:
            g_stream_text.append(gc.text)
    assert "".join(g_stream_text) == "Gemini stream OK"

    # 7. Ollama local client ($0.00 cost)
    ol_res = ol_client.chat(model="llama-4-scout", messages=[{"role": "user", "content": "Local check"}], workflow_id="wf-ollama")
    assert ol_res.message.content == "Ollama wire OK"

    # 8. Async OpenAI + Async Anthropic streams + Mid-stream abort!
    async def _run_async_checks() -> None:
        a_stream = await oa_async.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Async stream"}],
            stream=True,
            workflow_id="wf-async-oa",
        )
        chunks = [c async for c in a_stream]
        assert len(chunks) >= 2

        wire_server.enqueue({"sse": corpus["anthropic_claude_code"]["sse_stream_events"]})
        ant_as = await ant_async.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=256,
            messages=[{"role": "user", "content": "Async Claude"}],
            stream=True,
            workflow_id="wf-async-ant",
        )
        ant_chunks = [c async for c in ant_as]
        assert len(ant_chunks) >= 5

        # Mid-stream consumer break / close -> status="aborted_stream", outcome="degraded"
        partial = await oa_async.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Abort mid stream"}],
            stream=True,
            workflow_id="wf-aborted-stream",
        )
        async for first_c in partial:
            if first_c.choices and first_c.choices[0].delta.content:
                break
        await partial.aclose()

    asyncio.run(_run_async_checks())

    auditor.flush()
    by_wf = {e["workflow_id"]: e for e in auditor.get_local_events()}

    assert by_wf["wf-oa-stream"]["input_tokens"] == 145
    assert by_wf["wf-oa-stream"]["cached_tokens"] == 64
    assert by_wf["wf-oa-parse"]["input_tokens"] == 310
    assert by_wf["wf-resp-sse"]["input_tokens"] == 900
    assert by_wf["wf-resp-sse"]["reasoning_tokens"] == 96

    # Anthropic split-event SSE MUST preserve message_start input+cache tokens AND message_delta output_tokens!
    ant_ev = by_wf["wf-ant-mgr-stream"]
    assert ant_ev["cached_tokens"] == 12_000
    assert ant_ev["cache_write_tokens"] == 2_000
    assert ant_ev["input_tokens"] == 120 + 12_000 + 2_000
    assert ant_ev["output_tokens"] == 95

    # Gemini thoughtsTokenCount (25) added to candidatesTokenCount (30) = 55 output_tokens!
    assert by_wf["wf-gem-stream"]["output_tokens"] == 55
    assert by_wf["wf-gem-stream"]["reasoning_tokens"] == 25

    # Ollama local = $0.00
    assert by_wf["wf-ollama"]["cost"] == 0.0

    # Aborted stream salvaged partial output
    assert by_wf["wf-aborted-stream"]["status"] == "aborted_stream"
    assert by_wf["wf-aborted-stream"]["outcome"] == "degraded"


def test_retry_storm_suppression_and_real_upstream_error_propagation(wire_server):
    auditor = AurexAuditor(
        AurexConfig(
            storage_mode="memory",
            local_only=True,
            resilience={
                "enabled": True,
                "mode": "enforce",
                "max_attempts": 2,
                "backoff": {"base_ms": 5, "max_ms": 10, "jitter": 0.0},
            },
        )
    )
    auditor.patch_openai()
    # Client has default max_retries=3 -> without Aurex retry suppression, a 429 would trigger multiple SDK retries!
    client = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1", max_retries=3)

    wire_server.reset()
    wire_server.enqueue({"status": 429, "error_message": "Rate limit reached"})
    wire_server.enqueue({"status": 200})

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Retry exactly once"}],
        workflow_id="wf-retry-cap",
    )
    assert resp.choices[0].message.content == "OpenAI wire OK"
    # Proof: Aurex forced SDK max_retries=0, so WireServer received EXACTLY 2 HTTP calls (1st 429 + 1 Aurex retry)!
    assert len(wire_server.requests) == 2

    # Non-retryable 400 BadRequestError MUST propagate as real openai.BadRequestError!
    wire_server.enqueue({"status": 400, "error_message": "Invalid parameter value"})
    with pytest.raises(openai.BadRequestError):
        client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Trigger 400"}],
            workflow_id="wf-400",
        )


def test_provider_drift_strict_exception_vs_prod_warning_fail_open(monkeypatch):
    import sys

    broken_openai = types.ModuleType("openai")
    broken_openai.__version__ = "99.0.0"
    broken_openai.resources = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace()))
    monkeypatch.setitem(sys.modules, "openai", broken_openai)

    # 1. Production default: emits AurexProviderWarning, records in get_health()["drift_warnings"], does NOT crash!
    aud_prod = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True, strict_provider_drift=False))
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        aud_prod.patch_openai()
    assert any(issubclass(w.category, AurexProviderWarning) for w in caught)
    health = aud_prod.get_health()
    assert len(health["drift_warnings"]) == 1
    assert health["drift_warnings"][0]["provider"] == "openai"
    assert health["drift_warnings"][0]["provider_version"] == "99.0.0"
    assert "Completions.create" in health["drift_warnings"][0]["missing_symbol"]

    # 2. Strict / CI mode: raises typed AurexProviderDriftError immediately!
    AurexAuditor.reset()
    aud_strict = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True, strict_provider_drift=True))
    with pytest.raises(AurexProviderDriftError) as exc_info:
        aud_strict.patch_openai()
    assert exc_info.value.provider == "openai"
    assert exc_info.value.provider_version == "99.0.0"
    assert "Completions.create" in (exc_info.value.missing_symbol or "")
