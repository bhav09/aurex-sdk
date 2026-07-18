<div align="center">
  <img src="https://raw.githubusercontent.com/heyaurex/aurex-sdk/main/frontend/public/heyaurex_logo/1.png" alt="Aurex Logo" width="160" />
  <h1>Aurex Node.js SDK</h1>
  <p><b>The In-Process AI Runtime Layer for Production Agent Infrastructure</b></p>
</div>

Aurex is an in-process AI runtime layer designed for production LLM applications and autonomous agent frameworks. Embedded directly within your application host process, Aurex intercepts LLM provider calls with under 2 milliseconds of overhead to handle model routing, context compression, behavioral loop detection, and automatic provider failover.

---

## Key Features

* **Sub-2ms In-Process Execution**: All decisions, loop guards, and routing rules execute locally in memory with zero network hop latency.
* **Universal Auto-Patching**: Single-line integration for OpenAI, Anthropic, LiteLLM, Ollama, and Hugging Face.
* **Zero Prompt Data Egress**: Operates local-first using SHA-256 signatures. Sensitive prompt payloads and LLM responses never leave your application host.
* **Adaptive Model Routing**: Dynamically routes low-complexity calls to higher-efficiency model tiers (for example, GPT-4o to GPT-4o-mini).
* **Behavioral Loop Mitigation**: Hybrid structural and semantic detection (F1 score: 0.72) stops infinite agent loops and recursive tool cascades.

---

## Installation

```bash
npm install aurex-sdk
```

For Python environments:
```bash
pip install aurex-sdk
```

---

## Quick Start Guide

### Option A: Zero-Code Auto-Hook (Recommended)

Attach Aurex runtime hooks at application launch with no modifications to existing codebase logic.

```bash
# Generate environment configuration file
npx aurex install-hook

# Source environment variables and start your application
source .env.aurex
export AUREX_API_KEY=aux_dev_yourkey
node your_app.js
```

---

### Option B: Programmatic SDK Setup

Initialize the Aurex auditor singleton and auto-patch your LLM clients directly.

```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

// Initialize auditor singleton
const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "production-service",
  cloudSync: true
});

// Patch all installed provider packages automatically
auditor.patchAll();

// Use standard provider clients as usual
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Explain quantum computing in simple terms." }]
});
```

---

### Option C: Runtime Guards and Circuit Breakers

Enforce spending limits and pre-call policy routing before sending API calls to providers.

```typescript
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();
auditor.configureCircuitBreaker({
  maxCostPerMinute: 5.00,
  maxCostPerSession: 50.00,
  onBudgetExceeded: "throw"  // Options: "throw", "warn", "webhook"
});

// Pre-call evaluation
const decision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Generate system report.",
  workflowId: "session_4921"
});

if (decision.action === "block") {
  throw new Error(`Call blocked: ${decision.reason}`);
} else if (decision.action === "downgrade") {
  const model = decision.suggestedModel;  // Route to suggested efficient model
}
```

---

## Offline CI/CD Quality Gates

Enforce cost and efficiency thresholds during continuous integration builds:

```bash
# Execute automated CI verification
npx aurex ci --mode=block
```

---

## Self-Hosting and Dashboard Setup (Optional)

For local development and self-hosted deployments, telemetry flushes asynchronously to an optional Aurex backend and analytics dashboard.

1. **Backend Server**: Runs on FastAPI at `http://localhost:8000`.
2. **Analytics Dashboard**: Next.js UI running at `http://localhost:3000`.

To run the local control plane during development, clone the repository and refer to the full deployment documentation at `http://localhost:3000/docs`.

---

## License and Documentation

* **Interactive Documentation**: `http://localhost:3000/docs`
* **GitHub Repository**: `https://github.com/heyaurex/aurex-sdk`
