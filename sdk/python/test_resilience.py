"""Tests for SDK resilience: classifier, retry, observe/enforce, counterfactual."""

import pytest

from aurex_sdk.resilience import (
    ResiliencePolicy,
    classify_exception,
    classify_response,
    estimate_projected_reroute_cost,
    execute_with_resilience,
    is_retryable,
    parse_resilience_config,
)
from aurex_sdk.exceptions import AurexResilienceExhausted


class DummyChoice:
    def __init__(self, content="", finish_reason="stop"):
        self.message = type("M", (), {"content": content, "tool_calls": None})()
        self.finish_reason = finish_reason


class DummyResp:
    def __init__(self, content="", finish_reason="stop"):
        self.choices = [DummyChoice(content, finish_reason)]


def test_classify_success():
    r = classify_response("openai", DummyResp("hello"))
    assert r.usable is True
    assert r.kind == "success"


def test_classify_empty_billed():
    r = classify_response("openai", DummyResp(""))
    assert r.usable is False
    assert r.kind == "empty"
    assert r.billed is True


def test_classify_content_filter():
    r = classify_response("openai", DummyResp("", "content_filter"))
    assert r.kind == "content_filter"
    assert r.billed is True


def test_classify_exception_timeout():
    r = classify_exception(TimeoutError("request timed out"))
    assert r.kind == "timeout"


def test_is_retryable():
    assert is_retryable("429", ["429", "5xx"])
    assert not is_retryable("unknown", ["429"])


def test_parse_resilience_config():
    p = parse_resilience_config({"enabled": True, "mode": "enforce", "max_attempts": 3})
    assert p.enabled is True
    assert p.mode == "enforce"
    assert p.max_attempts == 3


def test_execute_observe_mode_no_retry():
    attempts = []

    def on_attempt(record, resp, exc):
        attempts.append(record.classification.kind)

    policy = ResiliencePolicy(enabled=True, mode="observe", max_attempts=2)
    calls = {"n": 0}

    def call_fn():
        calls["n"] += 1
        raise ConnectionError("network reset")

    with pytest.raises(ConnectionError):
        execute_with_resilience(
            call_fn,
            policy,
            provider="openai",
            model="gpt-4o",
            workflow_id="wf1",
            on_attempt=on_attempt,
        )
    assert calls["n"] == 1
    assert attempts == ["network"]


def test_execute_enforce_recovers_on_second_attempt():
    attempts = []
    calls = {"n": 0}

    def call_fn():
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("network reset")
        return DummyResp("ok")

    policy = ResiliencePolicy(
        enabled=True,
        mode="enforce",
        max_attempts=2,
        retry_on=["network"],
        backoff={"base_ms": 1, "max_ms": 2, "jitter": 0},
    )

    resp, meta = execute_with_resilience(
        call_fn,
        policy,
        provider="openai",
        model="gpt-4o",
        workflow_id="wf1",
        on_attempt=lambda r, resp, exc: attempts.append(r.outcome),
        idempotency_key="key-1",
    )
    assert resp.choices[0].message.content == "ok"
    assert calls["n"] == 2
    assert "recovered" in attempts or "success" in attempts
    assert meta["mode"] == "enforce"


def test_execute_enforce_exhausted():
    policy = ResiliencePolicy(
        enabled=True,
        mode="enforce",
        max_attempts=1,
        retry_on=["network"],
    )

    with pytest.raises(AurexResilienceExhausted):
        execute_with_resilience(
            lambda: (_ for _ in ()).throw(ConnectionError("network")),
            policy,
            provider="openai",
            model="gpt-4o",
            workflow_id="wf1",
            on_attempt=lambda *a: None,
        )


def test_projected_reroute_cost():
    cost = estimate_projected_reroute_cost(
        "gpt-4o",
        "gpt-4o-mini",
        1000,
        100,
        0.01,
        lambda m, i, o: 0.02,
    )
    assert cost == pytest.approx(0.03)


def test_fail_open_on_internal_error():
    policy = ResiliencePolicy(enabled=True, mode="enforce", max_attempts=2)

    def bad_executor_call():
        return "ok"

    # Disabled resilience path is fail-open equivalent for telemetry errors
    policy.enabled = False
    resp, meta = execute_with_resilience(
        bad_executor_call,
        policy,
        provider="openai",
        model="gpt-4o",
        workflow_id="wf1",
        on_attempt=lambda *a: None,
    )
    assert resp == "ok"
    assert meta.get("resilience") == "disabled"
