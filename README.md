<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs/assets/logo-dark.png">
    <img alt="Aurex SDK Logo" src="./docs/assets/logo-dark.png" width="56">
  </picture>
</p>

# Aurex SDK — Stop AI Token Waste Before, During, and After Every Call

[![PyPI](https://img.shields.io/pypi/v/aurex-sdk.svg)](https://pypi.org/project/aurex-sdk/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://pypi.org/project/aurex-sdk/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](./sdk/node)
[![License: MIT](https://img.shields.io/badge/license-MIT-teal.svg)](./LICENSE)

**Aurex (`aurex-sdk`) is an open-source Python and Node.js guardrail that protects your LLM bill inside your own app.** Because it runs directly in memory (`<0.1 ms` overhead) instead of routing traffic through a third-party proxy, it adds **zero network latency** and **zero raw prompts ever leave your servers**.

> **Docs & AI Coding Agents:** Browse the interactive docs & issue breakdown at [**bhav09.github.io/aurex-sdk**](https://bhav09.github.io/aurex-sdk/), or point Claude Code, Cursor, Antigravity, Copilot, or Codex to [`llms.txt`](./llms.txt) and [`AGENTS.md`](./AGENTS.md) for instant drop-in setup.

## What Problem Are Teams Facing?

Most engineering teams only discover runaway AI spend weeks later on their monthly cloud invoice:

- **Quiet prompt-cache & `200k` price traps:** Changing a single timestamp at the top of a system prompt wipes out 50%–90% prompt-cache discounts—and crossing `200,000` input tokens on Claude 4+ or Gemini 2.5+ suddenly **doubles the price of the entire request**.
- **No per-task kill switch while agents run:** Cloud budget alerts arrive hours late. Meanwhile, a stuck tool loop, 20,000 hidden "thinking" tokens billed at output rates, or nested `429` retries can drain budget in minutes.
- **Paying full price for broken `HTTP 200` replies:** Models regularly return `200 OK` with empty text or repeated whitespace/JSON loops—charging full price while leaving the user's task unfinished.

## Why Aurex?

Dashboards only show you yesterday's token spike after the money is spent, and proxy gateways force you to route sensitive prompts and API keys through an external server. Aurex sits inside your process to prevent real upstream failure modes developers hit every day:

- **Hidden reasoning tokens exhausting `max_output_tokens` and returning empty or hung `HTTP 200` replies:** Reported in [googleapis/python-genai#782](https://github.com/googleapis/python-genai/issues/782) and [openai/codex#60294](https://github.com/openai/codex/issues/60294).
- **Long-session prompt caches collapsing & missing live cloud spend cutoffs:** Reported in [anthropics/claude-code#91151](https://github.com/anthropics/claude-code/issues/91151) and [`r/googlecloud` (`\$0.56` to `\$34,315` Gemini bill in minutes)](https://www.reddit.com/r/googlecloud/comments/1jz43y6/056_to_34315_in_minutes_google_gemini_api_just/).

*(See all 23 tracked frontier-lab GitHub issues and Reddit threads in [`docs/README.md`](./docs/README.md).)*

## What Does Aurex Solve?

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/architecture-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./docs/assets/architecture-light.svg">
    <img alt="Aurex SDK In-Process Architecture" src="./docs/assets/architecture-light.svg" width="100%">
  </picture>
</p>

Aurex hooks into your existing OpenAI, Anthropic, Google Gemini, Groq, Together, LiteLLM, Hugging Face, and Ollama clients with zero code rewrites across three stages:

1. **Before the Call (Prefix & `200k` Cliff Shield):** Keeps prompt caches warm by sorting JSON keys deterministically, pinpoints the exact character index breaking your cache, flags `>5 min` idle cache-expiry gaps, and warns before crossing the `200k` 2x price cliff.
2. **During the Call (Live Spend & Loop Circuit Breaker):** Enforces per-session and per-minute dollar caps (shared across pods via optional Redis), clamps hidden thinking budgets, logs aborted streams, stops duplicate retries, and raises `AurexBlocked` when an agent loops.
3. **After the Call + CI (Outcome Cost & PR Gate):** Flags empty or looped `HTTP 200` replies as wasted spend, pairs spend with `mark_success()` to measure true **cost per completed task**, and posts cost regression diffs on Pull Requests.

## How to Use It

### Step 1: Install

```bash
# Python
pip install aurex-sdk

# Node.js / TypeScript
npm install aurex-sdk
```

*(Optional multi-worker Redis & OpenTelemetry support: `pip install "aurex-sdk[redis,otel]"` or `npm install ioredis @opentelemetry/api`.)*

### Step 2: Initialize Once at App Startup

**Python**
```python
from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        budget_guard={"max_cost_per_session": 1.50, "max_thinking_tokens": 4096, "on_budget_exceeded": "throw"},
        enable_loop_guard=True,
    )
)
patch_all(auditor)

client = openai.OpenAI()
try:
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Summarize support ticket #42."}],
        workflow_id="ticket-42",
    )
    auditor.mark_success("ticket-42")
except AurexBlocked as err:
    print("Circuit breaker stopped session:", err.reason)
finally:
    auditor.flush()
```

**Node.js / TypeScript**
```typescript
import { AurexAuditor, AurexBlocked } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: { maxCostPerSession: 1.5, maxThinkingTokens: 4096, onBudgetExceeded: "throw" },
  enableLoopGuard: true,
});
await auditor.patchAll();
auditor.instrument(OpenAI); // Needed only in Next.js / Vite bundlers

const client = new OpenAI();
try {
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Summarize support ticket #42." }],
    workflowId: "ticket-42",
  } as any);
  auditor.markSuccess("ticket-42");
} catch (err) {
  if (err instanceof AurexBlocked) console.error("Circuit breaker stopped session:", err.reason);
} finally {
  await auditor.flushAndWait();
}
```

*(Zero-code option: run `aurex install-hook` once and start your app with `AUREX_ENABLED=1`.)*

### Step 3: Audit Locally & Gate Pull Requests in CI

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression
```

## Real-World Testing & Open-Source Agent Benchmarks

Aurex has been verified end-to-end across autonomous coding agents (**SWE-agent** with Google Gemini `gemini-2.5-flash` reasoning models), **LangGraph** multi-agent loops on local **Ollama** (`granite4.2:3b`, `llama3.1`), and **110+ automated Python, Node.js, and Backend tests**:

### SWE-agent Trajectory Verification

Instead of blocking on the first failed file lookup, Aurex gave the coding agent **3 exploration steps** to locate and read files before halting non-progressive tool repetition on **Step 4**—while tracking streamed Gemini thought tokens and Zero-PII SHA-256 prompt hashes. On real multi-file repository tasks (`40k–120k` context tokens + `4k–16k` reasoning tokens per step), cutting off a stuck `30–50` step loop at Step 4 prevents **1.5M–5M+ wasted tokens** per runaway trajectory:

| Step | SWE-agent Action | Observation | Aurex Decision |
| :--- | :--- | :--- | :--- |
| **Step 1** | `str_replace_editor view .../missing_colon.py` | File not found (wrong directory path) | **Allowed** |
| **Step 2** | `str_replace_editor view .../test-repo` | Listed folder structure to locate file | **Allowed** |
| **Step 3** | `str_replace_editor view .../tests/missing_colon.py` | Read and displayed target source file | **Allowed** |
| **Step 4** | 4th consecutive `str_replace_editor` without a diff | Repeated pattern `['str_replace_editor', 'str_replace_editor', 'str_replace_editor']` | **Blocked (`AurexBlocked`)** |

### End-to-End Evaluation Scorecard (SWE-agent + LangGraph + Ollama + Gemini)

| Evaluation Category | Score | Key Takeaway |
| :--- | :---: | :--- |
| **1. Code Implementation (DX)** | **9.0 / 10** | One-line `patch_all(auditor)` setup across LiteLLM, OpenAI, Gemini, and Ollama with clean `AurexConfig`. |
| **2. Guardrails & Governance Features** | **8.8 / 10** | Accurate streaming reasoning-token capture, balanced 3-step loop headroom, and hard USD session caps. |
| **3. Log & Telemetry Clarity** | **8.5 / 10** | Clear `AurexBlocked` explanations and rich Zero-PII `.aurex/ledger.*.jsonl` outcome records. |
| **4. Framework Resilience & Compatibility** | **8.0 / 10** | `<0.1 ms` overhead across local Ollama (`\$0.00`) and cloud APIs; pairs cleanly with custom agent hooks. |
| **Composite Score** | **8.6 / 10** | **Production-ready in-process cost & loop control.** |

## How Can You Improve Your Setup?

1. **Keep system prompts static & cap context at `195k`:** Move changing dates or user IDs to the end of the user message so 50%–90% cache discounts stay active, and set `max_context_tokens: 195000` to avoid the `200k` 2x price cliff.
2. **Scope multi-agent runs (LangGraph / SWE-agent):** Wrap graph or task execution with `aurex_context.set({"workflow_id": run_id})` (Python) or `aurexContext.run({ workflowId }, ...)` (Node.js) so sub-agents share one session budget instead of falling back to `default_workflow`.
3. **Exclude `AurexBlocked` from external retry wrappers:** If your app uses `tenacity` or `backoff`, configure `retry=retry_if_not_exception_type(AurexBlocked)` so retry decorators do not re-fire intentionally blocked loops—and raise `loop_similarity_threshold` (e.g. `0.90`–`0.95`) when coding agents need wider exploration headroom on large repos.
4. **Share budgets across pods & gate PRs:** Set `AUREX_REDIS_URL=redis://...` for multi-worker Gunicorn or Kubernetes deployments, and run `aurex ci --fail-on-regression` on every Pull Request.

## Contributing

Contributions, bug reports, and provider adapter PRs are welcome!
1. Fork [bhav09/aurex-sdk](https://github.com/bhav09/aurex-sdk), create a feature branch, and keep Python (`sdk/python`) and Node.js (`sdk/node`) changes in lockstep.
2. Run `AUREX_STRICT_DRIFT=1 bash .agent/skills/aurex-smoke-test/scripts/run_smoke.sh` from the repo root to verify all Python, Node.js, and Backend checks pass.
3. Open a Pull Request describing the problem solved and test coverage added.
