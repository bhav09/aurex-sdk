# Aurex — Stop AI Token Waste Before, During, and After Every Call

Aurex is a local-first Python and Node.js SDK (+ optional FinOps dashboard) that protects your LLM bill in-process with **0 ms proxy latency** and **zero raw prompts leaving your servers**.

---

## 1. What Problems Are People Facing?

- **Before the call:** Putting a changing timestamp or unsorted JSON dictionary at the top of a system prompt silently breaks 90% prompt-cache discounts—and crossing `200,000` input tokens on Claude or Gemini suddenly **doubles the price of the entire request**.
- **During the call:** Cloud providers lack real-time per-session kill switches. A looping agent, an aborted stream (`stream=True`), a `6x` retry storm, or 25,000 hidden "thinking" tokens can burn thousands of dollars overnight.
- **After the call:** Models return HTTP `200 OK` with empty thinking-exhausted text or `\n\n\n` JSON loops that you still pay for, and teams cannot tell which code change doubled their **cost per completed task**.

## 2. What Does Aurex Solve?

Aurex wraps your existing OpenAI, Anthropic, Google Gemini, LiteLLM, and Llama clients in one continuous 3-stage pipeline:
1. **Stage 1 — Before the Call (Prefix Cache-Shield & `200k` Cliff Guard):** Sorts JSON keys so caches stay warm, pinpoints the exact character offset breaking your prefix cache, warns after `>5 min` cache-TTL idle gaps, and reprices/warns before the `200k` 2x cliff.
2. **Stage 2 — During the Call (Session, Thinking & Stream Circuit Breaker):** Isolates sessions automatically, shares spend state across workers via optional Redis, caps hidden thinking tokens, tracks aborted streams, disables duplicate SDK retries, and raises `AurexBlocked` before budgets blow up.
3. **Stage 3 — After the Call + CI (Outcome Cost & Soft-Failure Gate):** Flags empty/looped HTTP-200 responses as `unfulfilled_spend`, joins spend with `mark_success()` to measure true **cost per successful outcome**, auto-downgrades over-budget SaaS tenants, and posts baseline cost diffs on Pull Requests.

---

## 3. How to Use It (Step-by-Step)

### Step 1: Install the SDK

```bash
# Python
pip install aurex-sdk

# Node.js / TypeScript
npm install aurex-sdk
```

*(Optional multi-worker & trace extras: `pip install "aurex-sdk[redis,otel]"` or `npm install ioredis @opentelemetry/api`.)*

### Step 2: Patch Your LLM Clients & Set a Budget Cap

**Python**
```python
from aurex_sdk import AurexAuditor, AurexConfig, patch_all
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
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize this ticket."}],
    workflow_id="support-ticket-42",
)

# Stage 3: Record when the user's task actually succeeded
auditor.mark_success("support-ticket-42")
auditor.flush()
```

**Node.js / TypeScript**
```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: {
    maxCostPerSession: 1.5,
    maxThinkingTokens: 4096,
    onBudgetExceeded: "throw",
  },
  enableLoopGuard: true,
});
auditor.patchAll();

const client = new OpenAI();
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize this ticket." }],
  metadata: { workflow_id: "support-ticket-42" },
});

auditor.markSuccess("support-ticket-42");
auditor.flush();
```

### Step 3: Audit Locally & Gate Pull Requests in CI

```bash
# Inspect your local zero-PII ledger (.aurex/ledger.jsonl)
aurex audit

# Compare current branch against main (warns by default; add --fail-on-regression to fail CI)
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment
```

---

## 4. How Can You Improve Your Setup?

1. **Move timestamps & user IDs to the end of prompts:** When Stage 1 logs `[Aurex Shield] Prefix cache broken in 'system' at char ...`, move changing dates or request IDs to the last user message so your static system prompt gets 50%–90% cache discounts.
2. **Trim history before `185k` tokens:** Keep long RAG/agent threads under `200,000` input tokens on Claude and Gemini to avoid paying 2x on the entire prompt.
3. **Turn on Redis in multi-worker production:** Set `AUREX_REDIS_URL=redis://...` so Gunicorn, FastAPI, or Kubernetes pods share one live session budget instead of per-process counters.
4. **Track `cost_per_success` in CI:** Call `mark_success(workflow_id)` when a job finishes and run `aurex ci --baseline main_ledger.jsonl --fail-on-regression` on every PR so prompt bloat never ships to production.

---

## Repository Layout

- `sdk/python/` — Python SDK (`aurex_sdk`)
- `sdk/node/` — Node.js / TypeScript SDK (`aurex-sdk`)
- `backend/` — FastAPI FinOps ingest, SQL outcome rollups, and `/api/v1/policies` sync
- `frontend/` — Next.js dashboard, `/audit` CSV analyzer, and `/docs`
