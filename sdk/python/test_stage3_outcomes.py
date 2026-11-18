"""Stage 3 smoke & unit tests: Outcome-Backed Cost, Soft-Failure Classifier, CI Diff & Tenant Margin Guardrails."""
import argparse
import json
import types
import pytest

from aurex_sdk import AurexAuditor, AurexConfig
from aurex_sdk.ci_diff import compare_ledgers, format_regression_markdown, summarize_ledger
from aurex_sdk.cli import cmd_audit
from aurex_sdk.resilience import classify_response, detect_grammar_loop


@pytest.fixture(autouse=True)
def reset_auditor():
    AurexAuditor.reset()
    yield
    AurexAuditor.reset()


def test_grammar_loop_and_thinking_exhausted_classified_as_unfulfilled_spend():
    # 1. Constrained decoding newline/whitespace runaway
    assert detect_grammar_loop("{\n" + "\n" * 40 + "}") is True
    # 2. Repeated JSON key loop
    repeated_json = '{"item": 1, ' + ", ".join(['"item": 1'] * 10) + "}"
    assert detect_grammar_loop(repeated_json) is True
    assert detect_grammar_loop('{"status": "ok", "items": [1, 2, 3]}') is False

    loop_resp = types.SimpleNamespace(
        choices=[
            types.SimpleNamespace(
                message=types.SimpleNamespace(content="{\n" + "\n" * 40, tool_calls=None),
                finish_reason="stop",
            )
        ],
        usage=types.SimpleNamespace(prompt_tokens=100, completion_tokens=500),
    )
    c_loop = classify_response("openai", loop_resp)
    assert c_loop.usable is False
    assert c_loop.kind == "grammar_loop"
    assert c_loop.billed is True

    # 3. Thinking-exhausted empty output (finish_reason='length', visible content='', reasoning_tokens=4096)
    exhausted_resp = types.SimpleNamespace(
        choices=[
            types.SimpleNamespace(
                message=types.SimpleNamespace(content="", tool_calls=None),
                finish_reason="length",
            )
        ],
        usage=types.SimpleNamespace(
            prompt_tokens=200,
            completion_tokens=4096,
            completion_tokens_details=types.SimpleNamespace(reasoning_tokens=4096),
        ),
    )
    c_exh = classify_response("openai", exhausted_resp)
    assert c_exh.usable is False
    assert c_exh.kind == "thinking_exhausted"
    assert c_exh.billed is True

    # 4. Auto-tagged in log_event even when resilience is disabled
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True, flush_interval_seconds=0.05))
    auditor.log_event(
        model="o3",
        response="",
        input_tokens=500,
        output_tokens=2048,
        reasoning_tokens=2048,
        finish_reason="length",
        workflow_id="wf-soft-fail",
        tags={"tenant_id": "acme-corp"},
    )
    auditor.flush()
    evs = auditor.get_local_events()
    assert len(evs) == 1
    assert evs[0]["cost_type"] == "unfulfilled_spend"
    assert evs[0]["outcome"] == "degraded"
    assert evs[0]["error_code"] == "thinking_exhausted"
    assert evs[0]["tenant_id"] == "acme-corp"


def test_outcome_separation_and_ci_baseline_diff_warn_vs_fail(tmp_path):
    base_file = tmp_path / "main_ledger.jsonl"
    pr_file = tmp_path / "pr_ledger.jsonl"

    # Baseline: 1 workflow with 3 LLM calls ($0.03 total, 80% cache hit) + 1 mark_success -> $0.03 / success (NOT $0.03 / 4!)
    base_rows = [
        {"model": "claude-sonnet-4", "input_tokens": 10000, "cached_tokens": 8000, "output_tokens": 200, "cost": 0.01, "workflow_id": "wf-1", "outcome": "success", "cost_type": "inference"},
        {"model": "claude-sonnet-4", "input_tokens": 10000, "cached_tokens": 8000, "output_tokens": 200, "cost": 0.01, "workflow_id": "wf-1", "outcome": "success", "cost_type": "inference"},
        {"model": "claude-sonnet-4", "input_tokens": 10000, "cached_tokens": 8000, "output_tokens": 200, "cost": 0.01, "workflow_id": "wf-1", "outcome": "success", "cost_type": "inference"},
        {"model": "aurex-outcome", "input_tokens": 0, "output_tokens": 0, "cost": 0.0, "workflow_id": "wf-1", "outcome": "success", "cost_type": "outcome_signal"},
    ]
    base_file.write_text("\n".join(json.dumps(r) for r in base_rows) + "\n", encoding="utf-8")

    b_summary = summarize_ledger(str(base_file))
    assert b_summary.effective_successes == 1
    assert b_summary.turns_per_success == 3.0
    assert b_summary.cost_per_success == pytest.approx(0.03)
    assert b_summary.cache_hit_pct == pytest.approx(80.0)

    # PR branch: broke prefix cache (0% cache hit), crossed >200k cliff, and had unfulfilled spend -> $1.40 / success
    pr_rows = [
        {"model": "claude-sonnet-4", "input_tokens": 205000, "cached_tokens": 0, "output_tokens": 1000, "cost": 1.25, "workflow_id": "wf-1", "outcome": "success", "cost_type": "inference"},
        {"model": "claude-sonnet-4", "input_tokens": 10000, "cached_tokens": 0, "output_tokens": 500, "cost": 0.15, "workflow_id": "wf-1", "outcome": "degraded", "cost_type": "unfulfilled_spend"},
        {"model": "aurex-outcome", "input_tokens": 0, "output_tokens": 0, "cost": 0.0, "workflow_id": "wf-1", "outcome": "success", "cost_type": "outcome_signal"},
    ]
    pr_file.write_text("\n".join(json.dumps(r) for r in pr_rows) + "\n", encoding="utf-8")

    diff = compare_ledgers(str(pr_file), str(base_file))
    assert diff.has_regression is True
    md = format_regression_markdown(diff)
    assert "Cost per Successful Outcome" in md
    assert "Prefix cache hit rate dropped" in md
    assert ">200k 2x pricing cliff" in md

    # Warn-by-default exits 0; --fail-on-regression exits 1
    warn_ns = argparse.Namespace(
        ledger=str(pr_file),
        baseline=str(base_file),
        fail_on_regression=False,
        max_regression_pct=15.0,
        github_comment=True,
        fail_under=0,
        max_waste_usd=float("inf"),
        max_spend_usd=float("inf"),
        mode="warn",
    )
    assert cmd_audit(warn_ns) == 0

    fail_ns = argparse.Namespace(**{**vars(warn_ns), "fail_on_regression": True})
    assert cmd_audit(fail_ns) == 1


def test_tenant_margin_guardrail_downgrades_over_budget_tenant():
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    auditor.configure_tenant_policies(
        {"tenant-heavy": {"action": "downgrade", "monthly_spend_usd": 52.0, "monthly_limit_usd": 40.0}}
    )

    dec_heavy = auditor.pre_call_check(
        model="claude-opus-4",
        prompt="Write a full architecture spec with ```python\nprint(1)\n```",
        workflow_id="wf-tenant-1",
        tenant_id="tenant-heavy",
    )
    assert dec_heavy.action == "downgrade"
    assert dec_heavy.suggested_model is not None

    dec_normal = auditor.pre_call_check(
        model="claude-opus-4",
        prompt="Write a full architecture spec with ```python\nprint(1)\n```",
        workflow_id="wf-tenant-2",
        tenant_id="tenant-light",
    )
    assert dec_normal.action == "proceed"
