# Aurex Python SDK (`aurex-sdk`)

Open-source, in-process LLM cost shield, runtime circuit breaker, and CI regression gate for Python—with **zero proxy latency** and **zero raw prompts leaving your servers**.

## 1. What Problems Are People Facing?

- **Silent cache & cliff traps:** Putting a changing timestamp or unsorted JSON schema in a system prompt wipes out 50%–90% prompt-cache discounts, and crossing `200,000` input tokens doubles the price of the entire request on Claude 4+ and Gemini 2.5+.
- **Unbounded runtime spend:** Looping agents, hidden reasoning tokens, aborted streams, and multiplied SDK retries can drain budgets in seconds without a per-session kill switch.
- **Paid soft failures:** Models return HTTP `200 OK` with empty text or repeated JSON/newline loops that still bill at full output rates while producing nothing usable.

## 2. What Does Aurex Solve?

`aurex-sdk` drops into your existing OpenAI, Anthropic, Google Gemini, Groq, Together, LiteLLM, Hugging Face, and Ollama calls with zero rewrites—protecting every request across three stages:

1. **Before the call:** Keeps prompt caches warm by sorting JSON keys deterministically, pinpoints the exact character offset breaking your cache, flags `>5 min` idle cache-expiry gaps, and warns before the `200k` 2x price jump.
2. **During the call:** Enforces per-session and per-minute dollar caps (shared across workers via optional Redis), caps hidden thinking tokens, tracks aborted streams, stops duplicate retries, and raises `AurexBlocked` on loops.
3. **After the call + CI:** Flags paid empty or looped HTTP-200 responses as wasted spend, pairs spend with `mark_success()` to measure true **cost per completed task**, and posts cost regression diffs on Pull Requests.

## 3. How to Use It (Step-by-Step)

### Step 1: Install

```bash
pip install aurex-sdk
# Optional multi-worker Redis & OpenTelemetry support:
pip install "aurex-sdk[redis,otel]"
```

### Step 2: Initialize Once at App Startup

```python
from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        budget_guard={
            "max_cost_per_session": 1.50,
            "max_thinking_tokens": 4096,
            "on_budget_exceeded": "throw",
        },
        enable_loop_guard=True,
    )
)
patch_all(auditor)

client = openai.OpenAI()
try:
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Draft release notes."}],
        workflow_id="release-job-1",
    )
    auditor.mark_success("release-job-1")
except AurexBlocked as err:
    print(f"Stopped runaway session {err.workflow_id}: {err.reason}")
finally:
    auditor.flush()
```

### Step 3: Run Local Audit & CI PR Gate

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression
```

*(Zero-code option: run `aurex install-hook` once, then start your app with `AUREX_ENABLED=1`.)*

## 4. How Can You Improve Your Setup?

- **Keep your system prompt static:** Move changing dates, request IDs, or user context to the end of the user message so 50%–90% cache discounts stay active.
- **Avoid the `200k` 2x cliff:** Set `"max_context_tokens": 195000` in `budget_guard` on long Claude 4+ and Gemini 2.5+ threads.
- **Enable Redis across workers:** Set `AUREX_REDIS_URL=redis://localhost:6379/0` so Gunicorn, Uvicorn, or Celery workers enforce one shared budget.
- **Full docs & AI-agent guide:** Visit https://github.com/bhav09/aurex-sdk (includes `llms.txt` and `AGENTS.md` for coding assistants).
