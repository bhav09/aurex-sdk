# Aurex SDK — Stop AI Token Waste Before, During, and After Every Call

[![PyPI](https://img.shields.io/pypi/v/aurex-sdk.svg)](https://pypi.org/project/aurex-sdk/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://pypi.org/project/aurex-sdk/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](./sdk/node)

Aurex is an open-source, in-process Python (`aurex-sdk`) and Node.js (`aurex-sdk`) FinOps & runtime guardrail SDK. It protects your LLM spend inside your own process with **`<0.1 ms` overhead**, **zero proxy network hops**, and **zero raw prompts leaving your servers**.

> **For AI Coding Agents (Claude Code, Cursor, Antigravity, Copilot, Codex):** Read [`llms.txt`](./llms.txt) and [`AGENTS.md`](./AGENTS.md) for exact drop-in integration rules across FastAPI, Django, Next.js, Express, Serverless, and multi-worker Redis pods.

---

## 1. What Problems Are People Facing?

- **Before the call:** A single dynamic timestamp or unsorted JSON tool dictionary in a `system`/`developer` prompt silently wipes out 50%–90% prompt-cache discounts—and crossing `200,000` input tokens on Claude 4+ or Gemini 2.5+ suddenly **doubles the price of the entire request**.
- **During the call:** Cloud APIs have no per-ticket or per-tenant kill switch. A looping tool agent, 25,000 hidden reasoning tokens (`o3`/`o4-mini`, Claude Extended Thinking, Gemini `thoughts`), an aborted SSE stream, or `6x` multiplied SDK retries can burn budget in seconds.
- **After the call:** Models return HTTP `200 OK` with thinking-exhausted empty outputs or `\n\n\n` JSON grammar loops that still bill at full output rates, hiding your true **cost per completed task**.

## 2. What Does Aurex Solve?

Aurex wraps your installed OpenAI, Anthropic, Google `genai`, LiteLLM, Ollama, Hugging Face, and OpenAI-compatible (Groq, Together, Fireworks, OpenRouter) clients in one 3-stage pipeline:
1. **Stage 1 — Before the Call (Prefix Cache-Shield & `200k` Cliff Guard):** Sorts tool/schema JSON keys deterministically, pinpoints the exact character offset breaking your prefix cache (including `developer` roles and Anthropic `cache_control` blocks), warns after `>5m` idle TTL gaps, and warns/reprices before the `200k` 2x cliff.
2. **Stage 2 — During the Call (Spend, Thinking & Stream Circuit Breaker):** Isolates sessions via `workflow_id`, async context, or active OpenTelemetry `trace_id`, shares live spend across pods via optional Redis, clamps thinking budgets, injects stream usage & bills aborted streams, suppresses duplicate SDK retries, and raises `AurexBlocked` on loops/caps.
3. **Stage 3 — After the Call + CI (Outcome Cost & Soft-Failure Gate):** Flags empty thinking or JSON grammar loops as `unfulfilled_spend` (without false-flagging valid Claude `ThinkingBlock` answers), joins spend with `mark_success()` for true `cost_per_success`, syncs SaaS tenant margin downgrades, and gates Pull Requests via `aurex ci`.

---

## 3. How to Use It in Existing Codebases (Step-by-Step)

### Step 1: Install

```bash
# Python (PyPI)
pip install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry support:
pip install "aurex-sdk[redis,otel]"

# Node.js / TypeScript
npm install aurex-sdk
```

### Step 2: Initialize Once at App Startup (Works Across Sync, Async, `.parse()`, `.stream()` & `responses.create`)

**Python (FastAPI / Scripts / Workers)**
```python
from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        budget_guard={"max_cost_per_session": 1.50, "max_thinking_tokens": 4096, "on_budget_exceeded": "throw"},
        enable_loop_guard=True,
    )
)
patch_all(auditor)  # Patches OpenAI, Anthropic, Google GenAI, LiteLLM, Ollama & HuggingFace

client = openai.OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "developer", "content": "Static system rules."}, {"role": "user", "content": "Summarize ticket #42."}],
    workflow_id="ticket-42",  # Auto-stripped by Aurex before hitting OpenAI's wire!
    tags={"tenant_id": "acme"},
)

auditor.mark_success("ticket-42")
auditor.flush()  # Call on app shutdown or serverless handler exit
```

**Node.js / TypeScript (Express / Next.js / Vite)**
```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: { maxCostPerSession: 1.5, maxThinkingTokens: 4096, onBudgetExceeded: "throw" },
  enableLoopGuard: true,
});
await auditor.patchAll();
auditor.instrument(OpenAI); // Recommended in Next.js Turbopack / Vite / ESM bundlers

const client = new OpenAI();
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "developer", content: "Static system rules." }, { role: "user", content: "Summarize ticket #42." }],
  workflowId: "ticket-42", // Auto-stripped before hitting the wire!
} as any);

auditor.markSuccess("ticket-42");
await auditor.flushAndWait();
```

*(Zero-code container option: run `aurex install-hook` and start with `AUREX_ENABLED=1 python app.py`.)*

### Step 3: Audit Locally & Gate Pull Requests in CI

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression
```

---

## 4. How Can You Improve Your Setup?

1. **Keep index `0` static:** When Stage 1 logs `[Aurex Shield] Prefix cache broken ... at char N`, move dynamic dates/IDs to the end of the final user message to unlock 50%–90% cache discounts.
2. **Cap context at `195,000` tokens:** Set `max_context_tokens: 195000` on Claude 4+ and Gemini 2.5+ workflows so history trims before hitting the 2x whole-request cliff.
3. **Share budgets across pods with Redis:** Set `AUREX_REDIS_URL=redis://...` so Gunicorn, Uvicorn, or Kubernetes replicas enforce one shared session cap.
4. **Catch upstream SDK breaking changes in CI:** Set `AUREX_STRICT_DRIFT=1` in CI to raise `AurexProviderDriftError` if a provider SDK upgrade changes internal method layouts (production always fails open).
