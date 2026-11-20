# Aurex SDK — Stop AI Token Waste Before, During, and After Every Call

[![PyPI](https://img.shields.io/pypi/v/aurex-sdk.svg)](https://pypi.org/project/aurex-sdk/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://pypi.org/project/aurex-sdk/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](./sdk/node)

Aurex is an open-source, in-process Python and Node.js SDK that protects your LLM bill with **zero proxy latency** and **zero raw prompts leaving your servers**.

> Using an AI coding assistant (Claude Code, Cursor, Antigravity, Copilot, Codex)? Point it to [`llms.txt`](./llms.txt) or [`AGENTS.md`](./AGENTS.md) for instant drop-in setup.

## 1. What Problems Are People Facing?

- **Before the call:** Putting a changing timestamp or unsorted JSON schema in a system prompt silently wipes out 50%–90% prompt-cache discounts—and crossing `200,000` input tokens on Claude 4+ or Gemini 2.5+ suddenly **doubles the price of the entire request**.
- **During the call:** Cloud providers have no per-ticket or per-user kill switch. A looping agent, hidden reasoning tokens, an aborted stream, or multiplied SDK retries can burn budget in seconds.
- **After the call:** Models return HTTP `200 OK` with empty text or repeated JSON/newline loops that you still pay full price for, hiding your real **cost per completed task**.

## 2. What Does Aurex Solve?

Aurex drops into your existing OpenAI, Anthropic, Google Gemini, Groq, Together, LiteLLM, Hugging Face, and Ollama calls with zero rewrites—protecting every request across three stages:

1. **Before the Call (Prefix & `200k` Cliff Shield):** Keeps prompt caches warm by sorting JSON keys deterministically, pinpoints the exact character offset breaking your cache, flags `>5 min` idle cache-expiry gaps, and warns before the `200k` 2x price jump.
2. **During the Call (Live Spend & Loop Circuit Breaker):** Enforces per-session and per-minute dollar caps (shared across workers via optional Redis), caps hidden thinking tokens, tracks aborted streams, stops duplicate retries, and raises `AurexBlocked` when an agent loops.
3. **After the Call + CI (Outcome Cost & PR Gate):** Flags paid empty or looped HTTP-200 responses as wasted spend, pairs spend with `mark_success()` to measure true **cost per completed task**, and posts cost regression diffs on Pull Requests.

## 3. How to Use It (Step-by-Step)

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
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize support ticket #42."}],
    workflow_id="ticket-42",
)

auditor.mark_success("ticket-42")
auditor.flush()
```

**Node.js / TypeScript**
```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: { maxCostPerSession: 1.5, maxThinkingTokens: 4096, onBudgetExceeded: "throw" },
  enableLoopGuard: true,
});
await auditor.patchAll();
auditor.instrument(OpenAI); // Optional: needed only in Next.js / Vite bundlers

const client = new OpenAI();
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize support ticket #42." }],
  workflowId: "ticket-42",
} as any);

auditor.markSuccess("ticket-42");
await auditor.flushAndWait();
```

*(Zero-code option: run `aurex install-hook` and start your app with `AUREX_ENABLED=1`.)*

### Step 3: Audit Locally & Gate Pull Requests in CI

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression
```

## 4. How Can You Improve Your Setup?

1. **Move dates & IDs to the end of prompts:** Keep your system prompt static and put changing timestamps or user context at the end of the user message to keep 50%–90% cache discounts active.
2. **Cap long context at `195,000` tokens:** Set `max_context_tokens: 195000` on Claude 4+ and Gemini 2.5+ workflows so history trims before hitting the 2x whole-request cliff.
3. **Share budgets across servers with Redis:** Set `AUREX_REDIS_URL=redis://...` so Gunicorn, Uvicorn, or Kubernetes pods enforce one shared session cap.
4. **Gate cost regressions on every PR:** Run `aurex ci --fail-on-regression` in GitHub Actions so prompt bloat never reaches production.
