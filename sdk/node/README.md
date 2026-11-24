<p align="left">
  <img alt="Aurex SDK Logo" src="https://raw.githubusercontent.com/bhav09/aurex-sdk/main/docs/assets/logo-dark.png" width="52">
</p>

# Aurex Node.js & TypeScript SDK (`aurex-sdk`)

**`aurex-sdk` is an open-source, in-process LLM cost shield, runtime circuit breaker, and CI regression gate for Node.js & TypeScript.** It runs in memory (`<0.1 ms` overhead) with **zero proxy latency** and **zero raw prompts leaving your servers**.

## What Problems Does It Solve?

- **Silent cache & `200k` price traps:** Dynamic timestamps or unstable JSON key ordering wipe out 50%–90% prompt-cache discounts, and crossing `200,000` input tokens doubles whole-request pricing on Claude and Gemini ([anthropics/claude-code#91151](https://github.com/anthropics/claude-code/issues/91151)).
- **Runaway agent loops & hidden thinking tokens:** Reasoning models burn thousands of internal thought tokens billed at output rates ([googleapis/python-genai#782](https://github.com/googleapis/python-genai/issues/782)), while stuck tool loops drain budgets mid-flight.
- **Paid `HTTP 200` soft failures:** Empty or whitespace-looped responses ([openai/codex#60294](https://github.com/openai/codex/issues/60294)) return `200 OK` and bill full price without completing the user's task.

## How It Protects Every Call (3 Stages)

1. **Before the call:** Sorts JSON keys deterministically, pinpoints the exact character index breaking your cache, flags `>5 min` idle cache-expiry gaps, and warns before crossing the `200k` 2x price jump.
2. **During the call:** Enforces per-session and per-minute USD caps (shared across pods via optional Redis), clamps thinking budgets, tracks aborted streams, and throws `AurexBlocked` on loops.
3. **After the call + CI:** Marks soft failures as wasted spend, pairs spend with `markSuccess()` for true **cost per completed task**, and diffs branch ledgers in CI.

## Quickstart (60 Seconds)

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
auditor.instrument(OpenAI); // Needed only in Next.js / Vite bundlers

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

## Production Tips

- **Keep system prompts static:** Move per-request dates or IDs to the end of the user message, and set `maxContextTokens: 195000` on Claude and Gemini workflows.
- **Scope concurrent & multi-agent runs:** Wrap requests with `aurexContext.run({ workflowId, tenantId }, async () => { ... })` so sub-agents share one isolated session budget.
- **Do not retry `AurexBlocked`:** Skip retrying `err instanceof AurexBlocked` in custom retry wrappers so intentional circuit-breaker stops halt immediately.
- **Docs & AI-agent guide:** https://github.com/bhav09/aurex-sdk (see `llms.txt` and `AGENTS.md`).
