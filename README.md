<div align="center">
  <img src="frontend/public/heyaurex_logo/1.png" alt="Aurex Logo" width="160" />
  <h1>Aurex</h1>
  <p><b>The In-Process AI Runtime Layer for Production Agent Infrastructure</b></p>
</div>

Aurex is an in-process runtime layer for artificial intelligence applications and autonomous agent systems. Operating directly within application host processes, Aurex monitors, routes, compresses, and safeguards every large language model (LLM) interaction in real time with under 2 milliseconds of overhead.

Designed for enterprise engineering teams and technology leadership, Aurex provides high-reliability execution, intelligent model routing, and automated cost optimization without compromising data privacy or application responsiveness.

---

## Executive Summary and Business Value

Autonomous AI agents and LLM applications introduce novel operational risks and unpredictability into software architectures. Recurring loop iterations, unoptimized context windows, provider outages, and over-provisioned model usage directly inflate infrastructure expenses and degrade user experience.

Aurex addresses these challenges by embedding an active intelligence layer between your software and upstream AI model providers.

### Key Business Metrics

* **Sub-2 Millisecond Overhead**: Decision logic runs in-process without network roundtrips.
* **Up to 98% Cost Reduction**: Automated query complexity scoring routes simple requests to high-efficiency models (for example, GPT-4o to GPT-4o-mini).
* **Zero Prompt Data Egress**: Operates local-first using SHA-256 hashing. Raw prompt data and sensitive payloads never leave your environment.
* **Universal Multi-Provider Coverage**: Auto-patching for OpenAI, Anthropic, Google Gemini, LiteLLM, Ollama, and Hugging Face.

---

## System Architecture

```
                      +───────────────────────────+
                      │    Your Application       │
                      │  (Python / Node.js Apps)  │
                      +─────────────┬─────────────+
                                    │
                       (Auto-Hook / Manual SDK)
                                    │
                                    ▼
                      +───────────────────────────+
                      │     Aurex Runtime Layer   │
                      │  (Local Decision Engine)  │
                      +─────────────┬─────────────+
                                    │
                    (Asynchronous Local Write < 0.1ms)
                                    ▼
                      +───────────────────────────+
                      │ Local Ledger (.jsonl file)│
                      +─────────────┬─────────────+
                                    │
                        (Asynchronous Sync Queue)
                                    ▼
                      +───────────────────────────+
                      │   Aurex Backend Server    │
                      │    (FastAPI / Database)   │
                      +─────────────┬─────────────+
                                    │
                         (REST API / PostgreSQL)
                                    ▼
                      +───────────────────────────+
                      │      Aurex Dashboard      │
                      │   (Next.js Analytics UI)  │
                      +───────────────────────────+
```

### Architectural Principles

1. **Local-First Control Plane**: Real-time evaluation, budget enforcement, and loop detection execute entirely in memory on the application host.
2. **Asynchronous Telemetry Pipeline**: Event metrics write to a local JSONL disk buffer and flush asynchronously to backend services, ensuring zero blocking on the critical execution path.
3. **Deterministic Privacy Protection**: Prompts and responses are hashed using SHA-256 locally. Cloud synchronization sends metadata metrics only.
4. **Resilient Circuit Breaking**: Spending limits and rate guards trigger immediately within application processes without external API dependency.

---

## Core Capabilities

### 1. Behavioral Awareness and Loop Mitigation
Utilizes a hybrid structural and semantic detection algorithm (F1 score: 0.72) to identify agent infinite loops, recursive tool invocation, and runaway context growth. It distinguishes genuine step progression from repetitive patterns.

### 2. Adaptive Model Routing
Evaluates prompt complexity and dynamically selects the optimal model tier. Simple requests are seamlessly routed to lower-cost models while preserving model capacity for complex tasks.

### 3. Context Optimization and Compression
Identifies redundant system prompts, chain-of-thought inflation, and cache opportunities across sessions, automatically pruning repetitive context blocks.

### 4. Provider Continuity and Failover
Monitors provider health and API latency in real time. In the event of provider rate limits or outages, requests automatically fail over to secondary providers without application code modifications.

---

## Prerequisites

* **Node.js**: 18+ (for Node.js SDK and Dashboard UI)
* **Python**: 3.10+ (for Python SDK and Backend API)
* **Database**: SQLite (local development default) or PostgreSQL (production deployment)

---

## Quick Start Guide

### 1. Backend API Setup

Navigate to the `backend/` directory:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

The interactive API documentation is available at `https://heyaurex.com/docs`.

### 2. Frontend Analytics Dashboard

Navigate to the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev
```

Access the dashboard at `https://heyaurex.com`.

---

## SDK Integration Guide

### Installation

| Environment | Package Manager | Installation Command |
| :--- | :--- | :--- |
| **Python** | PyPI | `pip install aurex-sdk` |
| **Node.js** | npm | `npm install aurex-sdk` |

---

### Integration Options

#### Option A: Zero-Code Auto-Hook (Recommended)

Interceptors attach to supported LLM provider packages at module import time, requiring no modifications to existing business logic.

##### Python Integration

```bash
# Register global import hooks
aurex install-hook

# Configure environment variables and launch application
export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_yourkey
python your_app.py
```

##### Node.js Integration

```bash
# Generate environment configuration
npx aurex install-hook

# Source environment variables and launch application
source .env.aurex
export AUREX_API_KEY=aux_dev_yourkey
node your_app.js
```

---

#### Option B: Programmatic SDK Instrumentation

Initialize the Aurex auditor singleton and patch provider clients directly within your codebase.

##### Python Example

```python
from aurex_sdk import AurexAuditor, AurexConfig
import openai

# Initialize auditor singleton
auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    project="production-service",
    storage_mode="file",
    ledger_path=".aurex/ledger.jsonl",
    cloud_sync=True
))

# Patch all installed providers automatically
auditor.patch_all()

# Standard provider calls execute with active Aurex runtime protection
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Analyze system architecture."}]
)

# Inspect runtime efficiency metrics
report = auditor.get_score()
print(f"Efficiency Score: {report.value}/100")
```

##### Node.js / TypeScript Example

```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

// Initialize auditor singleton
const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "production-service",
  ledgerPath: ".aurex/ledger.jsonl",
  cloudSync: true
});

// Patch all installed providers automatically
auditor.patchAll();

// Standard provider calls execute with active Aurex runtime protection
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Analyze system architecture." }]
});
```

---

### Real-Time Guards and Circuit Breakers

Enforce session budgets and execution controls prior to outbound API dispatch.

##### Python

```python
from aurex_sdk import AurexAuditor

auditor = AurexAuditor()
auditor.configure_circuit_breaker({
    "max_cost_per_minute": 5.00,
    "max_cost_per_session": 50.00,
    "on_budget_exceeded": "throw"  # Options: "throw", "warn", "webhook"
})

# Pre-call policy check
decision = auditor.pre_call_check(
    model="gpt-4o",
    prompt="Execute workflow tasks.",
    workflow_id="session_8921"
)

if decision.action == "block":
    raise Exception(f"Execution blocked: {decision.reason}")
elif decision.action == "downgrade":
    model = decision.suggested_model  # Utilize recommended efficient model
```

##### Node.js / TypeScript

```typescript
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();
auditor.configureCircuitBreaker({
  maxCostPerMinute: 5.00,
  maxCostPerSession: 50.00,
  onBudgetExceeded: "throw"  // Options: "throw", "warn", "webhook"
});

// Pre-call policy check
const decision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Execute workflow tasks.",
  workflowId: "session_8921"
});

if (decision.action === "block") {
  throw new Error(`Execution blocked: ${decision.reason}`);
} else if (decision.action === "downgrade") {
  const model = decision.suggestedModel;  // Utilize recommended efficient model
}
```

---

## Environment Variables Reference

Global SDK behavior can be configured through standard environment variables:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `AUREX_ENABLED` | Integer (`0`/`1`) | `1` | Globally activates or deactivates Aurex runtime logic. |
| `AUREX_API_KEY` | String | `None` | Project API key for authentication and cloud synchronization. |
| `AUREX_BASE_URL` | String | `https://heyaurex.com/api/v1` | Endpoint URL for the Aurex backend service. |
| `AUREX_WORKFLOW_ID` | String | `default` | Logical grouping tag for cost allocation and analytics. |
| `AUREX_SYNC_PROMPT_HASHES` | Integer (`0`/`1`) | `0` | Opts into hashing and transmitting prompt signatures for telemetry. |
| `AUREX_PRICING_PATH` | String | `None` | File path to custom model pricing configuration overrides. |

---

## Continuous Integration and Quality Gates

Incorporate offline ledger analysis into CI/CD build pipelines to enforce cost and efficiency compliance prior to code merging.

### Python CLI

```bash
# Validate ledger telemetry against policy thresholds
aurex audit --ledger .aurex/ledger.jsonl --fail-under 85 --max-waste-usd 5.00 --mode block
```

### Node.js CLI

```bash
# Execute automated CI verification
npx aurex ci --mode=block
```

---

## Supported Provider Coverage

| Provider | Python Support | Node.js Support | Auto-Patch Mechanism |
| :--- | :---: | :---: | :--- |
| **OpenAI** (v1.0+) | Supported | Supported | `patch_openai()` / `patchOpenAI()` |
| **Anthropic** (v0.18+) | Supported | Supported | `patch_anthropic()` / `patchAnthropic()` |
| **Google Gemini** | Supported | Not Supported | `patch_google()` (Python) |
| **LiteLLM** / **Portkey** | Supported | Supported | `patch_litellm()` / `patchLiteLLM()` |
| **Ollama** / **Llama.cpp** | Supported | Supported | `patch_ollama()` / `patchOllama()` |
| **Hugging Face** | Supported | Supported | `patch_huggingface()` / `patchHuggingFace()` |

---

## Technical Documentation and Resources

* **Web Documentation**: [https://heyaurex.com/docss](https://heyaurex.com/docs)
* **Python SDK Module**: `sdk/python/`
* **Node.js SDK Module**: `sdk/node/`
* **API Specifications**: `https://heyaurex.com/docs`
