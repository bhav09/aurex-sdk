# Aurex Node.js & TypeScript SDK (`aurex-sdk`)

Open-source, in-process LLM FinOps shield, runtime circuit breaker, and CI regression gate for Node.js & TypeScript (`<0.1 ms` overhead, zero proxy hops, zero-PII local ledger).

## 1. What Problems Are People Facing?

- **Silent cache & cliff traps:** Dynamic timestamps or unstable JSON key ordering invalidate 50%–90% prompt-cache discounts, and crossing `200,000` input tokens doubles the entire request cost on Claude 4+ and Gemini 2.5+.
- **Unbounded runtime spend:** Runaway agent loops, hidden thinking tokens, aborted SSE streams (`stream: true`), and multiplied SDK retries drain budgets mid-flight.
- **Billed HTTP-200 soft failures:** Thinking-exhausted empty outputs and `\n\n\n` JSON grammar loops return HTTP `200 OK` and waste budget without solving the user's task.

## 2. What Does Aurex Solve?

`aurex-sdk` instruments `openai` (Chat `.create`, `beta.chat.completions.parse` with Zod, `responses.create`, plus Groq/Together/Fireworks/Ollama `baseURL` endpoints), `@anthropic-ai/sdk` (`messages.create`, `messages.stream`, `1h`/`5m` caching, `ThinkingBlock`), `@google/genai`, `ollama`, `@huggingface/inference`, and `litellm` across three stages:
1. **Before the call (Stage 1):** Sorts tool/schema JSON keys deterministically (preserving Zod schemas), pinpoints prefix-cache breaks, flags `>5m` idle TTL gaps, and warns before the `200k` 2x cliff.
2. **During the call (Stage 2):** Isolates sessions via `workflowId` / `AsyncLocalStorage` / OpenTelemetry `traceId`, shares spend across pods via optional `ioredis`, clamps thinking budgets, tracks aborted streams in `try...finally`, and throws `AurexBlocked` on loops/caps.
3. **After the call + CI (Stage 3):** Marks soft failures as `unfulfilled_spend`, pairs spend with `markSuccess()` for true `costPerSuccess`, and compares branch ledgers in CI.

## 3. How to Use It in Any Node / TypeScript Codebase (Step-by-Step)

### Step 1: Install

```bash
npm install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry peer packages:
npm install ioredis @opentelemetry/api
```

### Step 2: Initialize Once at Startup (Express, Fastify, Next.js, Vite, Serverless)

```typescript
import { AurexAuditor, AurexBlocked } from "aurex-sdk";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const auditor = AurexAuditor.getInstance({
  redisUrl: process.env.AUREX_REDIS_URL, // Optional shared multi-pod state
  enableLoopGuard: true,
  budgetGuard: {
    maxCostPerSession: 1.5,
    maxThinkingTokens: 4096,
    onBudgetExceeded: "throw",
  },
});

await auditor.patchAll(); // Patches both CJS require() and ESM import() prototypes
auditor.instrument(OpenAI, Anthropic); // Explicit hook for Next.js Turbopack / Vite / Vitest bundlers

const client = new OpenAI();
try {
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "developer", content: "You are a concise support engineer." },
      { role: "user", content: "Draft release notes for v0.5.0." },
    ],
    workflowId: "release-job-1", // Stripped cleanly before hitting OpenAI's HTTP wire!
    tags: { tenant_id: "acme" },
  } as any);

  auditor.markSuccess("release-job-1");
} catch (err) {
  if (err instanceof AurexBlocked) console.error("Blocked:", err.reason);
} finally {
  await auditor.flushAndWait(); // Use before serverless handler exit
}
```

### Step 3: Run CI Regression Check

```bash
npx aurex ci --ledger=.aurex/ledger.jsonl --baseline=main_ledger.jsonl --github-comment --fail-on-regression
```

*(Zero-code option: run `npx aurex install-hook` and `source .env.aurex`.)*

## 4. How Can You Improve Your Setup?

- **Keep `messages[0]` static:** Move per-request dates or IDs to the end of the final user turn so prefix caches stay warm.
- **Avoid the `200k` 2x cliff:** Set `maxContextTokens: 195000` on Claude 4+ and Gemini 2.5+ workflows.
- **Catch SDK drift in CI:** Set `AUREX_STRICT_DRIFT=1` in CI to throw `AurexProviderDriftError` if a provider SDK upgrade breaks prototype layouts (production fails open and populates `auditor.getHealth().driftWarnings`).
- **Auto-downgrade heavy SaaS tenants:** Use `auditor.configureTenantPolicies(...)` or `await auditor.syncPoliciesOnce()`.
