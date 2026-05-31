# 🛡️ Aurex

**The enterprise-grade, local-first AI cost-optimization and budget circuit-breaker platform.**

Aurex helps engineering teams detect and block LLM cost waste in real-time. It provides deep visibility into LLM usage, surfaces inefficiencies (such as prompt waste, agent loop cascades, tool bloat, and output verbosity), and calculates a Token Credit Score for optimization profiling.

---

## 🏗️ Architecture Overview

```
                      +───────────────────────────+
                      │    Your LLM Application   │
                      │  (Python / Node.js Apps)  │
                      +─────────────┬─────────────+
                                    │
                       (Auto-Hook / Manual SDK)
                                    │
                                    ▼
                      +───────────────────────────+
                      │    Aurex Auditor SDK      │
                      │  (Local Heuristics Engine)│
                      +─────────────┬─────────────+
                                    │
                    (Asynchronous local write < 0.1ms)
                                    ▼
                      +───────────────────────────+
                      │ Local Ledger (.jsonl file)│
                      +─────────────┬─────────────+
                                    │
                        (Asynchronous Sync Queue)
                                    ▼
                      +───────────────────────────+
                      │   Aurex Cloud/Self-Host   │
                      │    (FastAPI Backend)      │
                      +─────────────┬─────────────+
                                    │
                         (REST API / PostgreSQL)
                                    ▼
                      +───────────────────────────+
                      │      Aurex Dashboard      │
                      │ (Next.js Optimization UI) │
                      +───────────────────────────+
```

Aurex is built with a **local-first control plane**:
- **Local SDK Ledger**: Metadata is written locally to disk first.
- **Asynchronous Batching**: Telemetry sync runs in a separate background thread/event-loop, introducing `<0.1ms` latency overhead to critical path calls.
- **Privacy First**: Prompts and responses are hashed locally and never sent to the server unless explicitly enabled.
- **In-Memory Circuit Breaking**: Real-time guards run entirely local to the host application without blocking on network roundtrips.

---

## 📋 Prerequisites

- **Node.js** 18+ (for frontend and Node.js SDK)
- **Python** 3.10+ (for backend and Python SDK)
- **Database**: SQLite (default for development) or PostgreSQL

---

## ⚡ Quick Start

### 1. Start the Backend API

From the `backend/` directory:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or your platform's equivalent
pip install -r requirements.txt
python main.py
```
* API playground and Swagger docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

### 2. Start the Frontend Dashboard

From the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev
```
* Access the dashboard at [http://localhost:3000](http://localhost:3000).

---

## 🛠️ SDK Usage

Detailed documentation and examples are available on the frontend docs page at [http://localhost:3000/docs](http://localhost:3000/docs).

### 1. Installation

| Language | Package Install Command |
| :--- | :--- |
| **Python** | `pip install aurex-sdk` |
| **Node.js** | `npm install aurex-sdk` |

### 2. Zero-Code Auto-Hook (Recommended)

Intercept and track LLM SDK calls automatically with zero code changes.

#### Python Setup
```bash
# Install the hook into your active site-packages
aurex install-hook

# Configure env vars and run your app
export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_yourkey
python your_app.py
```

#### Node.js Setup
```bash
# Generate the env file
npx aurex install-hook

# Source environment variables and run your app
source .env.aurex
export AUREX_API_KEY=aux_dev_yourkey
node your_app.js
```

---

### 3. Manual Instrumentation

Initialize the SDK and auto-patch LLM clients directly in your codebase.

#### Python
```python
from aurex_sdk import AurexAuditor, AurexConfig

# Initialize singleton with configuration
auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    project="my-project",
    storage_mode="file",                  # "file" or "memory"
    ledger_path=".aurex/ledger.jsonl",
    cloud_sync=True                       # Enable backend sync
))

# Patch all supported providers (OpenAI, Anthropic, Google Gemini, LiteLLM)
auditor.patch_all()
```

#### Node.js
```typescript
import { AurexAuditor } from "aurex-sdk";

// Initialize singleton with configuration
const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_yourkey",
  project: "my-project",
  ledgerPath: ".aurex/ledger.jsonl",
  cloudSync: true                        // Enable backend sync
});

// Patch all supported clients (OpenAI, Anthropic, LiteLLM)
auditor.patchAll();
```

---

### 4. Real-Time Guards & Circuit Breakers

Enforce budgets and prevent runaway loops before making API calls.

#### Python
```python
from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor()
auditor.configure_circuit_breaker({
    "max_cost_per_minute": 5.00,
    "max_cost_per_session": 50.00,
    "on_budget_exceeded": "throw"  # "throw" | "warn" | "webhook"
})

# Run pre-call check
decision = auditor.pre_call_check(
    model="gpt-4o",
    prompt="Hello!",
    workflow_id="user-session-123"
)

if decision.action == "block":
    raise Exception(f"Blocked: {decision.reason}")
elif decision.action == "downgrade":
    model = decision.suggested_model # Use cheaper alternative
```

#### Node.js
```typescript
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance();
auditor.configureCircuitBreaker({
  maxCostPerMinute: 5.00,
  maxCostPerSession: 50.00,
  onBudgetExceeded: "throw"  // "throw" | "warn" | "webhook"
});

// Run pre-call check
const decision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Hello!",
  workflowId: "user-session-123"
});

if (decision.action === "block") {
  throw new Error(`Blocked: ${decision.reason}`);
} else if (decision.action === "downgrade") {
  const model = decision.suggestedModel; // Use cheaper alternative
}
```

---

## 🎛️ Environment Variables Reference

Configure SDK and CLI behavior globally via environment variables:

| Variable | Type | Description |
| :--- | :--- | :--- |
| `AUREX_ENABLED` | `0` / `1` | Globally enable or disable Aurex instrumentation. |
| `AUREX_API_KEY` | `string` | Your project-specific API key (e.g. `aux_dev_...`). |
| `AUREX_BASE_URL` | `string` | The API root URL of your Aurex backend (default: `http://localhost:8000/api/v1`). |
| `AUREX_WORKFLOW_ID` | `string` | Logical workflow identifier to track cost attribution. |
| `AUREX_SYNC_PROMPT_HASHES` | `0` / `1` | Opt-in to hash and sync prompts/responses to dashboard. |
| `AUREX_PRICING_PATH` | `string` | Path to a custom JSON pricing configuration. |

---

## 🚀 CI/CD Build Breaker Policies

Analyze local telemetries offline or in your CI/CD pipelines to fail builds when efficiency falls or cost limits are exceeded.

#### Python CLI (`aurex audit`)
```bash
# Fail build if Token Credit Score is below 85 or waste exceeds $5
aurex audit --ledger .aurex/ledger.jsonl --fail-under 85 --max-waste-usd 5.00 --mode block
```

#### Node.js CLI (`npx aurex ci`)
```bash
# Fail build in CI if critical cost leaks are found
npx aurex ci --mode=block
```

---

## 🔌 Supported Providers Matrix

| Provider | Python SDK | Node.js SDK | Auto-Patch Support |
| :--- | :---: | :---: | :--- |
| **OpenAI** (v1.0+) | ✅ | ✅ | Yes (`patch_openai()` / `patchOpenAI()`) |
| **Anthropic** (v0.18+) | ✅ | ✅ | Yes (`patch_anthropic()` / `patchAnthropic()`) |
| **Google Gemini** | ✅ | ❌ | Yes (`patch_google()`, Python Only) |
| **LiteLLM** / **Portkey** | ✅ | ✅ | Yes (`patch_litellm()` / `patchLiteLLM()`) |
| **Ollama** / **Llama.cpp** | ✅ | ✅ | Yes (`patch_ollama()` / `patchOllama()`) |
| **Hugging Face** | ✅ | ✅ | Yes (`patch_huggingface()` / `patchHuggingFace()`) |

---

## 📄 License & Documentation

For details on API options, custom pricing overrides, and alerts setup:
- Full interactive docs are at [http://localhost:3000/docs](http://localhost:3000/docs)
- Python SDK source: [sdk/python/](file:///Users/bhavishya/VSC%20Projects/tbank/sdk/python)
- Node.js SDK source: [sdk/node/](file:///Users/bhavishya/VSC%20Projects/tbank/sdk/node)
