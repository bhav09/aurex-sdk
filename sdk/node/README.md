# Aurex Node.js & TypeScript SDK (`aurex-sdk`)

In-process LLM cost shield, circuit breaker, and CI regression gate for Node.js & TypeScript (`0 ms` proxy latency, zero-PII local ledger).

## 1. What Problems Are People Facing?

- Dynamic timestamps or unstable JSON key ordering silently invalidate 90% prompt-cache discounts, and crossing `200k` input tokens doubles the entire request cost on Claude and Gemini.
- Runaway agent loops, hidden thinking tokens, aborted streams (`stream: true`), and multiplied SDK retries drain budgets mid-flight.
- Billed HTTP `200 OK` empty outputs and `\n\n\n` JSON loops waste money without completing user tasks.

## 2. What Does Aurex Solve?

`aurex-sdk` instruments `openai` (Chat Completions, `responses.create`, and Groq/Together/Fireworks/Ollama `baseURL` endpoints), `@anthropic-ai/sdk`, `@google/genai`, `ollama`, and `litellm` across three stages:
1. **Before the call:** Sorts JSON keys deterministically, pinpoints prefix-cache breaks, flags `>5m` idle TTL gaps, and warns before the `200k` 2x cliff.
2. **During the call:** Isolates sessions via `AsyncLocalStorage` / OpenTelemetry, caps thinking tokens, logs partial spend on aborted streams via `try...finally`, and throws `AurexBlocked` on loops.
3. **After the call:** Marks soft failures as `unfulfilled_spend`, pairs spend with `markSuccess()`, and compares branch ledgers in CI.

## 3. How to Use It (Step-by-Step)

### Step 1: Install

```bash
npm install aurex-sdk
# Optional Redis + OpenTelemetry peer packages:
npm install ioredis @opentelemetry/api
```

### Step 2: Patch & Protect

```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  budgetGuard: {
    maxCostPerSession: 1.0,
    maxThinkingTokens: 4096,
    onBudgetExceeded: "throw",
  },
  enableLoopGuard: true,
});
auditor.patchAll();

const client = new OpenAI();
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Draft release notes." }],
  metadata: { workflow_id: "release-job-1" },
});

auditor.markSuccess("release-job-1");
auditor.flush();
```

### Step 3: Run CI Regression Check

```bash
npx aurex ci --ledger=.aurex/ledger.jsonl --baseline=main_ledger.jsonl --github-comment
```

*(Zero-code option: run `npx aurex install-hook` and `source .env.aurex`.)*

## 4. How Can You Improve Your Setup?

- Keep `messages[0]` static and put timestamps or per-request context at the end of the user turn.
- Trim long threads before `185,000` tokens on Claude/Gemini to avoid 2x whole-request repricing.
- Pass `--fail-on-regression` to `npx aurex ci` in GitHub Actions to fail PRs that increase `costPerSuccess` by `>15%`.
- Use `auditor.configureTenantPolicies(...)` or `await auditor.syncPoliciesOnce()` to auto-downgrade over-budget SaaS tenants.
