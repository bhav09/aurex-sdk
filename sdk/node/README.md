# Aurex Node.js & TypeScript SDK (`aurex-sdk`)

Open-source, in-process LLM cost shield, runtime circuit breaker, and CI regression gate for Node.js & TypeScript—with **zero proxy latency** and **zero raw prompts leaving your servers**.

## 1. What Problems Are People Facing?

- **Silent cache & cliff traps:** Dynamic timestamps or unstable JSON key ordering wipe out 50%–90% prompt-cache discounts, and crossing `200,000` input tokens doubles the entire request cost on Claude 4+ and Gemini 2.5+.
- **Unbounded runtime spend:** Runaway agent loops, hidden thinking tokens, aborted streams, and multiplied SDK retries drain budgets mid-flight.
- **Paid soft failures:** Thinking-exhausted empty outputs and repeated JSON/newline loops return HTTP `200 OK` and waste budget without completing the user's task.

## 2. What Does Aurex Solve?

`aurex-sdk` drops into your existing OpenAI, Anthropic, Google Gemini, Groq, Together, LiteLLM, Hugging Face, and Ollama calls with zero rewrites—protecting every request across three stages:

1. **Before the call:** Sorts JSON keys deterministically, pinpoints the exact character offset breaking your cache, flags `>5 min` idle cache-expiry gaps, and warns before the `200k` 2x price jump.
2. **During the call:** Enforces per-session and per-minute dollar caps (shared across pods via optional Redis), caps thinking budgets, tracks aborted streams, and throws `AurexBlocked` on loops.
3. **After the call + CI:** Marks soft failures as wasted spend, pairs spend with `markSuccess()` for true **cost per completed task**, and compares branch ledgers in CI.

## 3. How to Use It (Step-by-Step)

### Step 1: Install

```bash
npm install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry peer packages:
npm install ioredis @opentelemetry/api
```

### Step 2: Initialize Once at App Startup

```typescript
import { AurexAuditor, AurexBlocked } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: {
    maxCostPerSession: 1.5,
    maxThinkingTokens: 4096,
    onBudgetExceeded: "throw",
  },
  enableLoopGuard: true,
});

await auditor.patchAll();
auditor.instrument(OpenAI); // Optional: needed only in Next.js / Vite bundlers

const client = new OpenAI();
try {
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Draft release notes." }],
    workflowId: "release-job-1",
  } as any);

  auditor.markSuccess("release-job-1");
} catch (err) {
  if (err instanceof AurexBlocked) console.error("Stopped runaway session:", err.reason);
} finally {
  await auditor.flushAndWait();
}
```

### Step 3: Run CI Regression Check

```bash
npx aurex ci --ledger=.aurex/ledger.jsonl --baseline=main_ledger.jsonl --github-comment --fail-on-regression
```

*(Zero-code option: run `npx aurex install-hook` and `source .env.aurex`.)*

## 4. How Can You Improve Your Setup?

- **Keep your system prompt static:** Move per-request dates or IDs to the end of the user message so prefix caches stay warm.
- **Avoid the `200k` 2x cliff:** Set `maxContextTokens: 195000` on Claude 4+ and Gemini 2.5+ workflows.
- **Share budgets across pods with Redis:** Set `AUREX_REDIS_URL=redis://...` in multi-instance deployments.
- **Auto-downgrade heavy SaaS tenants:** Use `auditor.configureTenantPolicies(...)` or `await auditor.syncPoliciesOnce()`.
