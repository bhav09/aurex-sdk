# Aurex

**The enterprise-grade AI cost-optimization and budget circuit-breaker platform.**

Aurex helps engineering teams detect and block LLM cost waste in real-time. It provides deep visibility into LLM usage, surfaces inefficiencies (such as prompt waste, agent loop cascades, tool bloat, and output verbosity), and calculates a Token Credit Score for optimization profiling.

---

## Architecture Overview

Aurex consists of three core components:

1. **Frontend (`frontend/`)** — A Next.js App Router dashboard featuring savings realization tracking, custom enterprise pricing uploads, team configuration, and PDF export reporting.
2. **Backend (`backend/`)** — A FastAPI REST API service featuring the Enhanced Detection Engine, SQLAlchemy ORM, rate limiting, and integrations for Slack alerts.
3. **SDKs (`sdk/`)** — Zero-PII, lightweight developer SDKs (Python and Node.js) with local heuristics, non-blocking asynchronous event batching, and configurable budget circuit-breaker guards.

---

## Prerequisites

- **Node.js** 18+ (for frontend and Node SDK)
- **Python** 3.10+ (for backend and Python SDK)
- **Database** SQLite (default for development) or PostgreSQL

---

## Quick Start

### 1. Start the Backend API

From the `backend/` directory:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or your platform's equivalent
pip install -r requirements.txt
python main.py
```

* Swagger API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### 2. Start the Frontend Dashboard

From the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev
```

* Access the dashboard at [http://localhost:3000](http://localhost:3000).

### 3. Integrated SDK Usage

#### Zero-code auto-hook (recommended)

No code changes needed — install the hook once, set two env vars, run your app.

```bash
# Python
pip install aurex-sdk
aurex install-hook

export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_...   # from /app/api-keys
python your_app.py                 # all LLM calls tracked automatically

# Node
npm install aurex-sdk
npx aurex install-hook

AUREX_ENABLED=1 AUREX_API_KEY=aux_dev_... node your_app.js
```

#### Manual instrumentation

```python
# Python — manual log_event or patch specific providers
from aurex_sdk import AurexAuditor, AurexConfig

auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_...",
    project="my-project",
    flush_interval_seconds=30,
    max_batch_size=100,
))

# Patch all supported providers at once (LiteLLM → Anthropic → OpenAI → Google)
auditor.patch_all()

# Or manually log events
auditor.log_event(
    model="gpt-4o",
    input_tokens=120,
    output_tokens=45,
    workflow_id="my-workflow"
)
```

```typescript
// Node — manual logEvent or patchAll
import { AurexAuditor } from "aurex-sdk";

const auditor = AurexAuditor.getInstance({
  apiKey: "aux_dev_...",
  project: "my-project",
  budgetGuard: {
    maxCostPerMinute: 5.0,
    onBudgetExceeded: "warn"  // 'throw' | 'warn' | 'webhook'
  }
});

auditor.patchAll(); // covers LiteLLM, Anthropic, OpenAI
```

---

## Security & Privacy

Aurex is built with a **Zero-PII local-first promise**:
- Prompts and completions are hashed locally (SHA-256) inside the SDKs before being synced to the cloud.
- Actual prompt text is never uploaded unless explicitly opted-in, preventing leak of sensitive business metadata or customer PII.
- Real-time circuit breaking runs entirely in-memory within the host application thread, introducing <1ms of latency overhead.

---

## License & Support
For terms of service, policies, and configuration details, refer to the dashboard documentation page.
