"""Stage 3 real-usage tests: Claude ThinkingBlock non-false-positive, soft-failure auto-tagging, fallback recovery, subprocess CLI & .pth hook."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import anthropic
import openai
import pytest

from aurex_sdk import AurexAuditor, AurexConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
PY_SDK_DIR = REPO_ROOT / "sdk" / "python"


def test_claude_thinking_block_not_false_positive_and_1h_5m_cache_split_exact(wire_server, corpus):
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    auditor.patch_anthropic()

    client = anthropic.Anthropic(api_key="sk-ant-real", base_url=wire_server.base_url)

    # 1. Valid Extended Thinking response: content[0] is ThinkingBlock, content[1] is TextBlock, mixed 5m+1h cache_creation
    wire_server.enqueue({"json": corpus["anthropic_claude_code"]["extended_thinking_response"]})
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        thinking={"type": "enabled", "budget_tokens": 1024},
        messages=[{"role": "user", "content": "Diagnose QueuePool TimeoutError"}],
        workflow_id="wf-claude-thinking-ok",
    )
    assert any(getattr(b, "type", None) == "text" for b in msg.content)

    # 2. Thinking-exhausted response: ONLY ThinkingBlock (zero TextBlock!) and stop_reason="max_tokens"
    wire_server.enqueue({"json": corpus["anthropic_claude_code"]["thinking_exhausted_response"]})
    client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        thinking={"type": "enabled", "budget_tokens": 4096},
        messages=[{"role": "user", "content": "Analyze all 48 shard permutations"}],
        workflow_id="wf-claude-thinking-exhausted",
    )

    auditor.flush()
    by_wf = {e["workflow_id"]: e for e in auditor.get_local_events()}

    ok_ev = by_wf["wf-claude-thinking-ok"]
    assert ok_ev["cost_type"] != "unfulfilled_spend"
    assert ok_ev["response_hash"] is not None
    assert ok_ev["input_tokens"] == 140 + 18_500 + 4_200
    assert ok_ev["cached_tokens"] == 18_500
    assert ok_ev["cache_write_tokens"] == 4_200
    assert ok_ev["reasoning_tokens"] > 0
    # Verify exact mixed 5m (1200 @ 1.25x) + 1h (3000 @ 2.0x) cache write cost math on Claude Sonnet 4 ($3/$15):
    expected_cost = (
        (140 / 1e6 * 3.0)
        + (18_500 / 1e6 * 3.0 * 0.10)
        + (1_200 / 1e6 * 3.0 * 1.25)
        + (3_000 / 1e6 * 3.0 * 2.00)
        + (820 / 1e6 * 15.0)
    )
    assert ok_ev["cost"] == pytest.approx(expected_cost, rel=1e-5)

    exh_ev = by_wf["wf-claude-thinking-exhausted"]
    assert exh_ev["cost_type"] == "unfulfilled_spend"
    assert exh_ev["outcome"] == "degraded"
    assert exh_ev["error_code"] == "thinking_exhausted"


def test_openai_grammar_loops_and_reasoning_content_fallback_over_wire(wire_server, corpus):
    auditor = AurexAuditor(AurexConfig(storage_mode="memory", local_only=True))
    auditor.patch_openai()
    client = openai.OpenAI(api_key="sk-test", base_url=f"{wire_server.base_url}/v1")

    # 1. Constrained decoding newline flood (HTTP 200 soft failure)
    wire_server.enqueue(
        {
            "json": {
                "id": "cmpl_loop_1",
                "object": "chat.completion",
                "created": 1763470000,
                "model": "gpt-4o",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": corpus["openai_payloads"]["grammar_newline_flood"]}, "finish_reason": "length"}],
                "usage": {"prompt_tokens": 200, "completion_tokens": 4096, "total_tokens": 4296},
            }
        }
    )
    client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": "Extract JSON"}], workflow_id="wf-nl-loop")

    # 2. DeepSeek/Together style reasoning_content with empty visible content (no completion_tokens_details)
    wire_server.enqueue(
        {
            "json": {
                "id": "cmpl_ds_1",
                "object": "chat.completion",
                "created": 1763470000,
                "model": "deepseek-r1",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "", "reasoning_content": "Thinking step by step until max_tokens ran out..."}, "finish_reason": "length"}],
                "usage": {"prompt_tokens": 150, "completion_tokens": 1024, "total_tokens": 1174},
            }
        }
    )
    client.chat.completions.create(model="deepseek-r1", messages=[{"role": "user", "content": "Prove theorem"}], workflow_id="wf-ds-exhausted")

    auditor.flush()
    by_wf = {e["workflow_id"]: e for e in auditor.get_local_events()}
    assert by_wf["wf-nl-loop"]["cost_type"] == "unfulfilled_spend"
    assert by_wf["wf-nl-loop"]["error_code"] == "grammar_loop"

    assert by_wf["wf-ds-exhausted"]["reasoning_tokens"] > 0
    assert by_wf["wf-ds-exhausted"]["cost_type"] == "unfulfilled_spend"
    assert by_wf["wf-ds-exhausted"]["error_code"] == "thinking_exhausted"


def test_cross_provider_resilience_fallback_over_real_clients(wire_server):
    auditor = AurexAuditor(
        AurexConfig(
            storage_mode="memory",
            local_only=True,
            resilience={
                "enabled": True,
                "mode": "enforce",
                "max_attempts": 2,
                "max_extra_cost_usd": 0.50,
                "fallbacks": [{"name": "claude_backup", "provider": "anthropic", "model": "claude-3-5-haiku"}],
                "backoff": {"base_ms": 1, "max_ms": 5, "jitter": 0.0},
            },
        )
    )
    oa_client = openai.OpenAI(api_key="sk-oa", base_url=f"{wire_server.base_url}/v1", max_retries=0)
    ant_client = anthropic.Anthropic(api_key="sk-ant", base_url=wire_server.base_url, max_retries=0)

    auditor.register_fallback(
        "claude_backup",
        lambda: ant_client.messages.create(
            model="claude-3-5-haiku",
            max_tokens=128,
            messages=[{"role": "user", "content": "Fallback answer"}],
        ),
        provider="anthropic",
        model="claude-3-5-haiku",
    )
    auditor.patch_openai()

    # Primary OpenAI fails with 503 -> Aurex automatically recovers via Anthropic fallback!
    wire_server.enqueue({"status": 503, "error_message": "Upstream overloaded"})
    wire_server.enqueue({"status": 200})

    recovered = oa_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "High priority customer query"}],
        workflow_id="wf-cross-fallback",
    )
    assert recovered.content[0].text == "Anthropic wire OK"

    auditor.flush()
    evs = [e for e in auditor.get_local_events() if e["workflow_id"] == "wf-cross-fallback"]
    assert any(e.get("recovery_provider") == "anthropic" and e.get("outcome") == "recovered" for e in evs)


def test_subprocess_cli_github_markdown_and_zero_code_startup_hook(tmp_path, wire_server):
    base_ledger = tmp_path / "base.jsonl"
    pr_ledger = tmp_path / "pr.jsonl"

    base_ledger.write_text(
        json.dumps({"model": "claude-sonnet-4", "input_tokens": 10000, "cached_tokens": 9000, "output_tokens": 200, "cost": 0.01, "workflow_id": "w1", "outcome": "success", "cost_type": "inference"}) + "\n"
        + json.dumps({"model": "aurex-outcome", "input_tokens": 0, "output_tokens": 0, "cost": 0.0, "workflow_id": "w1", "outcome": "success", "cost_type": "outcome_signal"}) + "\n",
        encoding="utf-8",
    )
    pr_ledger.write_text(
        json.dumps({"model": "claude-sonnet-4", "input_tokens": 210000, "cached_tokens": 0, "output_tokens": 1000, "cost": 1.32, "workflow_id": "w1", "outcome": "success", "cost_type": "inference"}) + "\n"
        + json.dumps({"model": "aurex-outcome", "input_tokens": 0, "output_tokens": 0, "cost": 0.0, "workflow_id": "w1", "outcome": "success", "cost_type": "outcome_signal"}) + "\n",
        encoding="utf-8",
    )

    env = {**os.environ, "PYTHONPATH": str(PY_SDK_DIR)}

    # 1. --github-comment without --fail-on-regression -> exits 0 and emits pure Markdown (zero ANSI escape codes!)
    proc_warn = subprocess.run(
        [sys.executable, "-m", "aurex_sdk.cli", "ci", "--ledger", str(pr_ledger), "--baseline", str(base_ledger), "--github-comment"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_warn.returncode == 0
    assert "\x1b[" not in proc_warn.stdout
    assert "## Aurex CI FinOps Diff" in proc_warn.stdout
    assert ">200k 2x pricing cliff" in proc_warn.stdout

    # 2. --fail-on-regression -> exits 1!
    proc_fail = subprocess.run(
        [sys.executable, "-m", "aurex_sdk.cli", "ci", "--ledger", str(pr_ledger), "--baseline", str(base_ledger), "--fail-on-regression"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_fail.returncode == 1

    # 3. Zero-code aurex_sdk.hook in fresh Python subprocess against live WireServer!
    wire_server.reset()
    wire_server.enqueue({"status": 200})  # for OpenAI chat completion
    wire_server.enqueue({"status": 200, "json": {"accepted": 1, "rejected": 0}})  # for cloud sync /ledger/events
    hook_env = {
        **env,
        "AUREX_ENABLED": "1",
        "AUREX_API_KEY": "aux_live_hook_subprocess_key_1234",
        "AUREX_BASE_URL": wire_server.base_url,
    }
    proc_hook = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import aurex_sdk.hook, openai; "
                "from aurex_sdk import AurexAuditor; "
                f"c = openai.OpenAI(api_key='sk-hook', base_url='{wire_server.base_url}/v1'); "
                "c.chat.completions.create(model='gpt-4o-mini', messages=[{'role':'user','content':'zero code hook'}]); "
                "AurexAuditor().flush()"
            ),
        ],
        env=hook_env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc_hook.returncode == 0, proc_hook.stderr
    assert any("/ledger/events" in r["path"] for r in wire_server.requests)
