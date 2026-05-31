# Aurex Node.js SDK

The lightweight, zero-PII Node.js SDK for Aurex AI cost-optimization and budget circuit-breaking.

## Installation

Install the SDK in your project:

```bash
npm install aurex-sdk
```

---

## Features

- **Zero-code Auto-Instrumentation**: Automatically patch LLM clients (OpenAI, Anthropic, LiteLLM) via a Node.js require-hook.
- **Real-Time Guardrails (`preCallCheck`)**: Detect and block/redirect loops, system prompt waste, and expensive models before they execute.
- **In-Memory Budget Circuit Breaker**: Prevent budget overrun with context token limits and rate guards.
- **Local-First & Privacy-Focused**: Telemetry is batched asynchronously and kept offline in `.aurex/ledger.jsonl`. Prompts are not synced by default.
- **Crash Safety**: Persistent queue handling keeps your local metrics safe even during process shutdown.

---

## Quick Start

### 1. Zero-Code Auto-Hook (Recommended)

Generate a workspace environment hook configuration file. Node.js processes will load the auto-instrumentation automatically.

```bash
# Generate the .env.aurex configuration file
npx aurex install-hook

# Source the configuration to set NODE_OPTIONS and run your app
source .env.aurex
export AUREX_API_KEY=aux_dev_yourkey
node your_app.js
```

To remove the hook:
```bash
npx aurex uninstall-hook
```

### 2. Manual Integration

```typescript
import { AurexAuditor } from "aurex-sdk";

// Initialize the auditor singleton
const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "production-service",
  ledgerPath: ".aurex/ledger.jsonl",
  cloudSync: true
});

// Patch all supported clients (OpenAI, Anthropic, LiteLLM)
auditor.patchAll();

// Or patch manually/selectively
// auditor.patchOpenAI();
// auditor.patchAnthropic();
// auditor.patchLiteLLM();
```

---

## API Reference

### `AurexConfig` Parameters

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `apiKey` | `string` | `undefined` / `env(AUREX_API_KEY)` | Your Aurex Project API key. |
| `project` | `string` | `"default"` | Logical project identifier. |
| `ledgerPath` | `string` | `".aurex/ledger.jsonl"` | Path to write the local telemetry ledger to. |
| `cloudSync` | `boolean` | `false` | Sync telemetry events asynchronously to the cloud dashboard. |
| `cloudEndpoint`| `string` | `undefined` | Endpoint for cloud syncing. Overrides default API endpoint. |
| `baseUrl` | `string` | `undefined` / `env(AUREX_BASE_URL)` | Base URL of backend API (defaults to `http://localhost:8000/api/v1`). |
| `flushIntervalMs` | `number` | `30000` | Telemetry sync queue flush interval in milliseconds. |
| `maxBatchSize` | `number` | `100` | Maximum batch size of synced events. |
| `localOnly` | `boolean` | `true` | Runs fully locally without cloud sync. (Turn off for cloud sync) |
| `syncPromptHashes` | `boolean` | `false` | Sync prompt/response hashes to the cloud dashboard. |
| `budgetGuard` | `BudgetGuardConfig` | `undefined` | Configuration object for budget limits (see below). |
| `pricingPath` | `string` | `undefined` / `env(AUREX_PRICING_PATH)` | Path to a custom JSON pricing configuration. |
| `defaultPricing` | `object` | `undefined` | Fallback cost object with keys `input` and `output` (USD per 1M tokens) for unknown models. |
| `simplePromptTokenLimit` | `number` | `120` | Threshold token count below which prompts are classified as simple. |
| `runawayContextMultiplier` | `number` | `2.2` | Scaling multiplier representing runaway context growth checks. |
| `loopSimilarityThreshold` | `number` | `0.8` | Jaccard similarity threshold for semantic loop checks. |
| `downgradeMap` | `object` | `undefined` | Custom model mappings representing downgrade paths (e.g. `{"gpt-4o": "gpt-4o-mini"}`). |

### Dynamic Pricing & Programmatic Registration

You can specify custom pricing using a local JSON file or register rates programmatically:

1. **Custom JSON File (`pricingPath` or `env(AUREX_PRICING_PATH)`)**:
   Create a JSON pricing file:
   ```json
   {
     "my-custom-model": { "input": 12.50, "output": 35.00 },
     "finetuned-gpt-*": { "input": 3.00, "output": 12.00 }
   }
   ```

2. **Programmatic Registration**:
   ```typescript
   auditor.registerModelPricing("custom-model", 10.0, 30.0);
   ```

### Budget Guard Configuration (`BudgetGuardConfig`)

Pass an object to `budgetGuard` to enforce runtime limits:

```typescript
const auditor = AurexAuditor.getInstance({
  budgetGuard: {
    maxCostPerMinute: 5.00,
    maxCostPerSession: 50.00,
    maxRequestsPerMinute: 100,
    maxContextTokens: 128000,
    onBudgetExceeded: "throw",    // "throw" | "warn" | "webhook"
    webhookUrl: "https://api.yourdomain.com/aurex-alert",
    dryRun: false
  }
});
```

---

## Context Overrides (Per-Call Options)

When using wrapper methods (`wrap`), you can pass request-scoped options (e.g., `tags`, custom thresholds, loop sensitivity) via the third parameter using `AsyncLocalStorage`:

```typescript
const resp = await auditor.wrap(
  async (params) => {
    return client.chat.completions.create(params);
  },
  () => ({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Query..." }]
  }),
  {
    workflowId: "tenant_abc_session",
    tags: { tier: "enterprise" },
    simplePromptTokenLimit: 50, // override default threshold
    budgetGuard: {
      maxCostPerSession: 2.00 // custom budget limit for this call
    }
  }
);
```

---

## Hugging Face Native Integration

Auto-instrument Hugging Face text generation and chat completions.

Call `patchAll()` or `patchHuggingFace()` to instrument standard `@huggingface/inference` client calls:

```typescript
import { AurexAuditor } from "aurex-sdk";
import { HfInference } from "@huggingface/inference";

const auditor = AurexAuditor.getInstance();
auditor.patchHuggingFace();

const client = new HfInference("your-hf-token");
const resp = await client.chatCompletion({
  model: "meta-llama/Llama-3-8b-Instruct",
  messages: [{ role: "user", content: "Hello" }]
});
// Tracked at $0.00 (Hugging Face serverless defaults to free cost)
```

To configure pricing for dedicated Hugging Face endpoints, use the dynamic pricing configuration or register the endpoint name under wildcard pricing.

---

---

## Real-Time Guards (`preCallCheck`)

For manual LLM calls, run a pre-call check to catch loops and budget overruns before calling the LLM API.

```typescript
import { AurexAuditor, AurexDecision, AurexAction } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();

// Perform the check
const decision: AurexDecision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Generate code for Antigravity...",
  systemPrompt: "You are a senior dev...",
  workflowId: "user_session_123",
  messages: [{ role: "user", content: "..." }]
});

if (decision.action === "block") {
  throw new Error(`Request blocked: ${decision.reason}`);
} else if (decision.action === "downgrade") {
  // Use cheaper model suggestion
  const model = decision.suggestedModel; // e.g. "gpt-4o-mini"
  console.log(`Downgrading to ${model} because: ${decision.reason}`);
} else if (decision.action === "compress") {
  // Use compressed messages to avoid system prompt waste
  const messages = decision.compressedMessages;
}
```

---

## CLI Commands

The Node.js SDK comes with a built-in CLI command run via `npx aurex`.

### `npx aurex install-hook [target]`
Generates the `.env.aurex` environment file for pre-requiring the hook.
- `target`: Optional explicit directory path.

### `npx aurex uninstall-hook [target]`
Removes the `.env.aurex` file.

### `npx aurex ci [--mode=warn|block] [--github-comment]`
Analyze a local ledger offline to check against CI policies (Build Breaker).
- `--mode`: CI/CD action mode: `warn` (default) or `block` (returns exit code `1` on failure if critical issues are found).
- `--github-comment`: Outputs a formatted Markdown summary (useful for posting back in PR actions).

Example:
```bash
npx aurex ci --mode=block
```

---

## Health & Monitoring

Check the status of the auditor instance:

```typescript
const health = auditor.getHealth();
console.log(health);
// Output:
// {
//   status: "healthy",
//   queueSize: 0,
//   threadActive: true, // always true in Node (event loop based)
//   eventsLogged: 12
// }
```
