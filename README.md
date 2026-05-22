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

Instrument your application to log LLM transactions and enforce real-time budgets:

#### Node.js SDK
```typescript
import { AurexAuditor } from "@aurex/sdk-node";

const auditor = AurexAuditor.getInstance({
  apiKey: "your-aurex-api-key",
  cloudSync: true,
  budgetGuard: {
    maxCostPerMinute: 5.0, // Limit spend to $5.00/min
    onBudgetExceeded: "warn" // Configurable: 'throw' | 'warn' | 'webhook'
  }
});

// Non-blocking log event
auditor.logEvent({
  model: "gpt-4o",
  prompt: "...",
  response: "...",
  inputTokens: 120,
  outputTokens: 45
});
```

#### Python SDK
```python
from aurex_sdk import AurexAuditor

auditor = AurexAuditor.get_instance(
    api_key="your-aurex-api-key",
    cloud_sync=True,
    budget_guard={
        "max_cost_per_minute": 5.0,
        "on_budget_exceeded": "warn"
    }
)

# Non-blocking log event
auditor.log_event(
    model="gpt-4o",
    prompt="...",
    response="...",
    input_tokens=120,
    output_tokens=45
)
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
