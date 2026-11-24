<p align="left">
  <img alt="Aurex SDK Logo" src="https://raw.githubusercontent.com/bhav09/aurex-sdk/main/docs/assets/logo-dark.png" width="52">
</p>

# Aurex Python SDK (`aurex-sdk`)

**`aurex-sdk` is an open-source, in-process LLM cost shield, runtime circuit breaker, and CI regression gate for Python.** It runs in memory (`<0.1 ms` overhead) with **zero proxy latency** and **zero raw prompts leaving your servers**.

## What Problems Does It Solve?

- **Silent cache & `200k` price traps:** Putting a changing timestamp or unsorted JSON schema in a system prompt wipes out 50%–90% prompt-cache discounts, and crossing `200,000` input tokens doubles whole-request pricing on Claude 4+ and Gemini 2.5+ ([anthropics/claude-code#91151](https://github.com/anthropics/claude-code/issues/91151)).
- **Runaway agent loops & hidden thinking tokens:** Reasoning models burn thousands of internal thought tokens billed at output rates ([googleapis/python-genai#782](https://github.com/googleapis/python-genai/issues/782)), while stuck tool loops drain budgets without a per-session fuse.
- **Paid `HTTP 200` soft failures:** Models return `200 OK` with empty or whitespace-looped replies ([openai/codex#60294](https://github.com/openai/codex/issues/60294)) that bill full price without completing the user's task.

## How It Protects Every Call (3 Stages)

1. **Before the call:** Sorts JSON keys deterministically, pinpoints the exact character index breaking your cache, flags `>5 min` idle cache-expiry gaps, and warns before crossing the `200k` 2x cliff.
2. **During the call:** Enforces per-session and per-minute USD caps (shared across workers via optional Redis), clamps `max_thinking_tokens`, tracks aborted streams, suppresses `6x` retry storms, and raises `AurexBlocked` on loops.
3. **After the call + CI:** Flags empty or looped `HTTP 200` outputs as wasted spend, pairs spend with `mark_success()` to measure true **cost per completed task**, and diffs Pull Requests in CI.

## Quickstart (60 Seconds)

### Step 1: Install

```bash
pip install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry extras:
pip install "aurex-sdk[redis,otel]"
```

### Step 2: Initialize Once at App Startup

```python
from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        budget_guard={
            "max_cost_per_session": 1.50,
            "max_thinking_tokens": 4096,
            "on_budget_exceeded": "throw",
        },
        enable_loop_guard=True,
    )
)
patch_all(auditor)

client = openai.OpenAI()
try:
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Draft release notes."}],
        workflow_id="release-job-1",
    )
    auditor.mark_success("release-job-1")
except AurexBlocked as err:
    print(f"Stopped runaway session {err.workflow_id}: {err.reason}")
finally:
    auditor.flush()
```

### Step 3: Audit Locally & Gate Pull Requests in CI

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression
```

*(Zero-code option: run `aurex install-hook` once, then start your app with `AUREX_ENABLED=1`.)*

## Tested on Real Open-Source Agent Stacks (`8.6 / 10`)

Verified across **SWE-agent** (autonomous coding on Google Gemini reasoning models), **LangGraph** multi-agent workflows on local **Ollama** (`granite4.2:3b`, `llama3.1`), and cloud OpenAI/Anthropic/LiteLLM pipelines—allowing normal multi-step file exploration before halting stuck structural tool loops in `<0.1 ms`.

## Production Tips

- **Keep system prompts static:** Move changing dates or request IDs to the end of the user message, and set `"max_context_tokens": 195000` on long Claude 4+ and Gemini 2.5+ threads.
- **Propagate `workflow_id` in LangGraph / sub-agents:** Use `aurex_context.set({"workflow_id": run_id})` so multi-agent nodes share one isolated session budget.
- **Do not retry `AurexBlocked`:** In `tenacity`, pass `retry=retry_if_not_exception_type(AurexBlocked)` so intentional circuit-breaker stops are not retried.
- **Interactive Docs & AI-agent guide:** https://bhav09.github.io/aurex-sdk/ and https://github.com/bhav09/aurex-sdk (see `llms.txt` and `AGENTS.md`).
