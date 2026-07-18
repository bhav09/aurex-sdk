<div align="center">
  <img src="https://raw.githubusercontent.com/heyaurex/aurex-sdk/main/frontend/public/heyaurex_logo/1.png" alt="Aurex Logo" width="160" />
  <h1>Aurex Python SDK</h1>
  <p><b>The In-Process AI Runtime Layer for Production Agent Infrastructure</b></p>
</div>

Aurex is an in-process AI runtime layer designed for production LLM applications and autonomous agent frameworks. Embedded directly within your application host process, Aurex intercepts LLM provider calls with under 2 milliseconds of overhead to handle model routing, context compression, behavioral loop detection, and automatic provider failover.

---

## Key Features

* **Sub-2ms In-Process Execution**: All decisions, loop guards, and routing rules execute locally in memory with zero network hop latency.
* **Universal Auto-Patching**: Single-line integration for OpenAI, Anthropic, Google Gemini, LiteLLM, Ollama, and Hugging Face.
* **Zero Prompt Data Egress**: Operates local-first using SHA-256 signatures. Sensitive prompt payloads and LLM responses never leave your application host.
* **Adaptive Model Routing**: Dynamically routes low-complexity calls to higher-efficiency model tiers (for example, GPT-4o to GPT-4o-mini).
* **Behavioral Loop Mitigation**: Hybrid structural and semantic detection (F1 score: 0.72) stops infinite agent loops and recursive tool cascades.

---

## Installation

```bash
pip install aurex-sdk
```

For Node.js environments:
```bash
npm install aurex-sdk
```

---

## Quick Start Guide

### Option A: Zero-Code Auto-Hook (Recommended)

Attach Aurex runtime hooks at application launch with no modifications to existing codebase logic.

```bash
# Register global site-packages import hooks
aurex install-hook

# Configure environment variables and start your application
export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_yourkey
python your_app.py
```

---

### Option B: Programmatic SDK Setup

Initialize the Aurex auditor singleton and auto-patch your LLM clients directly.

```python
import openai
from aurex_sdk import AurexAuditor, patch_all

# Initialize the auditor and patch installed providers
auditor = AurexAuditor()
patch_all()

# Use standard provider clients as usual
client = openai.OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain quantum computing in simple terms."}]
)

# Access runtime health and efficiency metrics
report = auditor.get_score()
print(f"Efficiency Score: {report.value}/100")
```

---

### Option C: Runtime Guards and Circuit Breakers

Enforce spending limits and pre-call policy routing before sending API calls to providers.

```python
from aurex_sdk import AurexAuditor

auditor = AurexAuditor()
auditor.configure_circuit_breaker({
    "max_cost_per_minute": 5.00,
    "max_cost_per_session": 50.00,
    "on_budget_exceeded": "throw"  # Options: "throw", "warn", "webhook"
})

# Pre-call evaluation
decision = auditor.pre_call_check(
    model="gpt-4o",
    prompt="Generate system report.",
    workflow_id="session_4921"
)

if decision.action == "block":
    raise Exception(f"Call blocked: {decision.reason}")
elif decision.action == "downgrade":
    model = decision.suggested_model  # Route to suggested efficient model
```

---

## Offline CI/CD Quality Gates

Enforce cost and efficiency thresholds during continuous integration builds:

```bash
# Scan local ledger for optimization opportunities and fail CI build on policy breach
aurex audit --ledger .aurex/ledger.jsonl --fail-under 85 --mode block
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
