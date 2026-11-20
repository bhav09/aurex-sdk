# Aurex Python SDK (`aurex-sdk`)

Open-source, in-process LLM FinOps shield, runtime circuit breaker, and CI regression gate for Python (`<0.1 ms` overhead, zero proxy hops, zero-PII local ledger).

## 1. What Problems Are People Facing?

- **Silent cache & cliff traps:** Dynamic timestamps or unsorted JSON tool schemas in `system`/`developer` prompts break 50%–90% prompt-cache discounts, and crossing `200,000` input tokens doubles whole-request pricing on Claude 4+ and Gemini 2.5+.
- **Unbounded runtime spend:** Looping tool calls, hidden reasoning tokens (`o3`/`o4-mini`, Claude Extended Thinking, Gemini `thoughts_token_count`), aborted SSE streams, and multiplied SDK retries drain budgets mid-flight.
- **Billed HTTP-200 soft failures:** Thinking-exhausted empty outputs and `\n\n\n` JSON grammar loops return HTTP `200 OK` and bill full output rates while producing nothing usable.

## 2. What Does Aurex Solve?

`aurex-sdk` instruments `openai` (`.create`, `.parse`, `.stream`, `responses.create`, plus Groq/Together/Fireworks/OpenRouter/Ollama `base_url` clients), `anthropic` (`messages.create`, `.parse`, `.stream`, `1h`/`5m` prompt caching, `ThinkingBlock`), `google-genai` (sync & `.aio` async), `litellm`, `ollama`, and `huggingface_hub` across three stages:
1. **Before the call (Stage 1):** Deterministically sorts tool/schema JSON keys, pinpoints prefix-cache mutations by character offset, flags `>5m` Anthropic idle TTL gaps, and warns before the `200k` 2x cliff.
2. **During the call (Stage 2):** Isolates workflows via `workflow_id` / `contextvars` / OpenTelemetry `trace_id`, shares spend across workers via optional Redis, clamps thinking budgets, injects stream usage & bills aborted streams, disables duplicate SDK retries, and raises `AurexBlocked`.
3. **After the call + CI (Stage 3):** Tags HTTP-200 soft failures as `unfulfilled_spend`, pairs spend with `mark_success()` to measure true `cost_per_success`, and diffs PR ledgers in CI.

## 3. How to Use It in Any Python Codebase (Step-by-Step)

### Step 1: Install

```bash
pip install aurex-sdk
# Optional Redis multi-worker state + OpenTelemetry trace correlation:
pip install "aurex-sdk[redis,otel]"
```

### Step 2: Initialize Once at Startup (FastAPI, Django, Celery, LangGraph, Scripts)

```python
from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        redis_url="redis://localhost:6379/0",  # Optional: omit for in-memory single-process mode
        enable_loop_guard=True,
        budget_guard={
            "max_cost_per_session": 1.50,
            "max_thinking_tokens": 4096,
            "on_budget_exceeded": "throw",
        },
    )
)
patch_all(auditor)

client = openai.OpenAI()
try:
    # Works identically for sync, AsyncOpenAI, .parse(response_format=Model), .stream(), and client.responses.create()
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "developer", "content": "You are a concise support engineer."},
            {"role": "user", "content": "Draft release notes for v0.5.0."},
        ],
        workflow_id="release-job-1",  # Stripped cleanly before hitting provider HTTP wire
        tags={"tenant_id": "acme"},
    )
    auditor.mark_success("release-job-1")
except AurexBlocked as err:
    print(f"Blocked runaway workflow {err.workflow_id}: {err.reason}")
finally:
    auditor.flush()  # Call on app shutdown or AWS Lambda / Cloud Run request exit
```

### Step 3: Run Local Audit & CI PR Gate

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression
```

*(Zero-code startup hook: run `aurex install-hook` once in your virtualenv/image, then run with `AUREX_ENABLED=1`.)*

## 4. How Can You Improve Your Setup?

- **Move dynamic values to the tail:** Keep `messages[0]` / `system` static and append timestamps or request IDs at the end of the user turn.
- **Guard the `200k` cliff:** Set `"max_context_tokens": 195000` in `budget_guard` on Claude 4+ and Gemini 2.5+ workflows.
- **Enable Redis across workers:** Set `AUREX_REDIS_URL=redis://localhost:6379/0` so Gunicorn/Uvicorn workers share live session spend.
- **Fail CI on upstream SDK drift:** Set `AUREX_STRICT_DRIFT=1` in CI to raise `AurexProviderDriftError` if a future `openai` / `anthropic` / `google-genai` major bump renames internal classes (production always fails open and logs `auditor.get_health()["drift_warnings"]`).

---

## Quick Reference for AI Coding Agents

- **Singleton lifecycle:** Initialize `AurexAuditor(AurexConfig(...))` + `patch_all(auditor)` **once** at process startup (e.g., FastAPI `lifespan`). Call `AurexAuditor.reset()` between unit tests.
- **Auto-stripped call kwargs:** `workflow_id`, `tags`, `tenant_id`, and `quality_score` can be passed directly to any patched provider `.create()`, `.parse()`, or `.stream()` call—Aurex removes them before HTTP serialization.
- **Read-only containers / Lambda:** Use `storage_mode="memory"` (or let Aurex auto-fallback when the filesystem is read-only) and call `auditor.flush()` (or `auditor.flush_async()`) before exit.
- **Typed exceptions:** Catch `AurexBlocked` / `AurexBudgetExceeded` (from `aurex_sdk`). Real provider exceptions (`openai.APIError`, `anthropic.APIError`) pass through unchanged.
