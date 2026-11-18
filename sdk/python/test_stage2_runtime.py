"""Stage 2 smoke & unit tests: In-Flight Spend, Thinking & Stream Circuit Breaker."""
import sys
import types
import unittest.mock
import pytest

from aurex_sdk import AurexAuditor, AurexBlocked, AurexBudgetExceeded, AurexConfig
from aurex_sdk.auditor import aurex_context
from aurex_sdk.decisions import AurexDecision, apply_decision_to_call_params
from aurex_sdk.pricing import calculate_cost
from aurex_sdk.runtime_guard import (
    build_cached_response,
    ensure_openai_stream_usage,
    resolve_endpoint_provider,
    sanitize_thinking_params,
)


@pytest.fixture(autouse=True)
def reset_auditor():
    AurexAuditor.reset()
    yield
    AurexAuditor.reset()


def test_session_isolation_prevents_default_workflow_crosstalk():
    auditor = AurexAuditor(
        AurexConfig(
            storage_mode="memory",
            local_only=True,
            budget_guard={"max_cost_per_session": 0.05, "on_budget_exceeded": "throw"},
        )
    )
    t1 = aurex_context.set({"workflow_id": "tenant-alpha"})
    try:
        with pytest.raises(AurexBudgetExceeded):
            auditor.log_event(model="claude-opus-4", input_tokens=3000, output_tokens=500, workflow_id="tenant-alpha")
    finally:
        aurex_context.reset(t1)

    # Tenant Alpha exceeded $0.05 -> pre_call_check also blocks
    with pytest.raises(AurexBlocked):
        auditor.pre_call_check(model="claude-opus-4", prompt="more work", workflow_id="tenant-alpha")

    # Unscoped call gets isolated auto-generated session ID instead of colliding on 'default_workflow'
    dec_other = auditor.pre_call_check(model="gpt-4o-mini", prompt="hello")
    assert dec_other.action == "proceed"


def test_endpoint_provider_distinguishes_hosted_llama_from_local_ollama():
    assert resolve_endpoint_provider("llama-4-scout", "https://api.groq.com/openai/v1") == "groq"
    assert resolve_endpoint_provider("meta-llama/Llama-3.3-70B-Instruct", "https://api.together.xyz/v1") == "together"
    assert resolve_endpoint_provider("llama3.1:8b", "http://localhost:11434/v1") == "ollama"

    groq_cost = calculate_cost("llama-4-scout", 100_000, 10_000, provider="groq")
    local_cost = calculate_cost("llama-4-scout", 100_000, 10_000, provider="ollama")
    assert groq_cost > 0.0
    assert local_cost == 0.0


def test_thinking_params_clamped_and_stripped_on_downgrade():
    clamped = sanitize_thinking_params(
        {
            "model": "claude-sonnet-4",
            "thinking": {"type": "enabled", "budget_tokens": 32000},
            "reasoning_effort": "high",
        },
        is_downgraded=False,
        max_thinking_tokens=2048,
    )
    assert clamped["thinking"]["budget_tokens"] == 2048
    assert clamped["reasoning_effort"] == "low"

    decision = AurexDecision(
        action="downgrade",
        reason="near budget",
        suggested_model="gpt-4o-mini",
        original_model="o3",
        max_thinking_tokens=2048,
    )
    downgraded = apply_decision_to_call_params(
        {"model": "o3", "reasoning_effort": "high", "messages": [{"role": "user", "content": "hi"}]},
        decision,
    )
    assert downgraded["model"] == "gpt-4o-mini"
    assert "reasoning_effort" not in downgraded


def test_stream_usage_injection_and_aborted_stream_accounting():
    injected = ensure_openai_stream_usage({"model": "gpt-4o", "stream": True})
    assert injected["stream_options"] == {"include_usage": True}

    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    events = []
    orig_log = auditor.log_event
    auditor.log_event = lambda **kw: (events.append(kw), orig_log(**kw))[1]

    class FakeChunk:
        def __init__(self, text):
            self.choices = [types.SimpleNamespace(delta=types.SimpleNamespace(content=text))]
            self.usage = None

    def raw_gen():
        yield FakeChunk("Hello ")
        yield FakeChunk("world ")
        yield FakeChunk("never reached")

    wrapped = auditor._wrap_sync_stream(
        raw_gen(),
        {"model": "gpt-4o", "messages": [{"role": "user", "content": "stream test"}]},
        "wf-stream-abort",
        "stream test",
        None,
        provider="openai",
    )
    assert next(wrapped).choices[0].delta.content == "Hello "
    wrapped.close()  # Simulate client disconnect / GeneratorExit mid-stream

    assert len(events) == 1
    assert events[0]["workflow_id"] == "wf-stream-abort"
    assert events[0]["status"] == "aborted_stream"
    assert events[0]["outcome"] == "degraded"
    assert events[0]["output_tokens"] >= 1


def test_loop_guard_blocks_cleanly_without_magicmock():
    cached_shim = build_cached_response("openai", "cached hello", "gpt-4o")
    assert not isinstance(cached_shim, unittest.mock.MagicMock)
    assert cached_shim.choices[0].message.content == "cached hello"

    auditor = AurexAuditor(
        AurexConfig(
            storage_mode="memory",
            local_only=True,
            enable_loop_guard=True,
            budget_guard={"on_budget_exceeded": "throw"},
        )
    )
    loop_msgs = [
        {"role": "user", "content": "find order status"},
        {
            "role": "assistant",
            "tool_calls": [
                {"function": {"name": "lookup_order"}},
                {"function": {"name": "lookup_order"}},
                {"function": {"name": "lookup_order"}},
            ],
        },
    ]
    with pytest.raises(AurexBlocked):
        auditor.pre_call_check(model="gpt-4o", prompt="find order status", workflow_id="wf-loop", messages=loop_msgs)


def test_openai_responses_api_and_retry_suppression_and_gemini_thoughts(monkeypatch):
    auditor = AurexAuditor(
        AurexConfig(
            storage_mode="memory",
            local_only=True,
            resilience={"enabled": True, "mode": "enforce", "max_attempts": 2},
        )
    )
    logged = []
    orig_log = auditor.log_event
    auditor.log_event = lambda **kw: (logged.append(kw), orig_log(**kw))[1]

    with_options_calls = []

    class FakeCompletions:
        def __init__(self, base_url="https://api.groq.com/openai/v1"):
            self._client = types.SimpleNamespace(base_url=base_url)

        def with_options(self, **opts):
            with_options_calls.append(opts)
            return self

        def create(self, *args, **kw):
            return types.SimpleNamespace(
                choices=[types.SimpleNamespace(message=types.SimpleNamespace(content="ok", tool_calls=None))],
                usage=types.SimpleNamespace(
                    prompt_tokens=100,
                    completion_tokens=20,
                    prompt_tokens_details=None,
                    completion_tokens_details=None,
                ),
            )

    class FakeAsyncCompletions(FakeCompletions):
        async def create(self, *args, **kw):
            return super().create(*args, **kw)

    class FakeResponses:
        def __init__(self, base_url="https://api.openai.com/v1"):
            self._client = types.SimpleNamespace(base_url=base_url)

        def with_options(self, **opts):
            with_options_calls.append(opts)
            return self

        def create(self, *args, **kw):
            return types.SimpleNamespace(
                output_text="Responses API output",
                usage=types.SimpleNamespace(
                    input_tokens=120,
                    output_tokens=40,
                    input_tokens_details=types.SimpleNamespace(cached_tokens=60),
                    output_tokens_details=types.SimpleNamespace(reasoning_tokens=15),
                ),
            )

    fake_mod = types.ModuleType("openai")
    fake_mod.resources = types.SimpleNamespace(
        chat=types.SimpleNamespace(
            completions=types.SimpleNamespace(
                Completions=FakeCompletions,
                AsyncCompletions=FakeAsyncCompletions,
            )
        ),
        responses=types.SimpleNamespace(Responses=FakeResponses),
    )
    monkeypatch.setitem(sys.modules, "openai", fake_mod)

    auditor.patch_openai()
    comp_resource = FakeCompletions(base_url="https://api.groq.com/openai/v1")
    resp_resource = FakeResponses(base_url="https://api.openai.com/v1")

    comp_resource.create(
        model="llama-4-scout",
        messages=[{"role": "user", "content": "hi"}],
        workflow_id="wf-groq",
    )
    resp2 = resp_resource.create(
        model="o3",
        instructions="Be concise",
        input="Solve 2+2",
        workflow_id="wf-responses",
    )
    assert resp2.output_text == "Responses API output"
    assert {"max_retries": 0} in with_options_calls

    groq_ev = next(e for e in logged if e["workflow_id"] == "wf-groq" and "attempt_index" not in e)
    assert groq_ev["provider"] == "groq"

    resp_ev = next(e for e in logged if e["workflow_id"] == "wf-responses" and "attempt_index" not in e)
    assert resp_ev["input_tokens"] == 120
    assert resp_ev["cached_tokens"] == 60
    assert resp_ev["reasoning_tokens"] == 15

    # Gemini thoughts_token_count accounting
    g_resp = types.SimpleNamespace(
        text="42",
        usage_metadata=types.SimpleNamespace(
            prompt_token_count=200,
            candidates_token_count=30,
            thoughts_token_count=150,
            cached_content_token_count=0,
        ),
    )
    auditor._log_google_response(
        "gemini-2.5-pro",
        ("question",),
        {"metadata": {"workflow_id": "wf-gemini"}},
        g_resp,
    )
    gem_ev = next(e for e in logged if e["workflow_id"] == "wf-gemini")
    assert gem_ev["provider"] == "google"
    assert gem_ev["reasoning_tokens"] == 150
    assert gem_ev["output_tokens"] == 180
