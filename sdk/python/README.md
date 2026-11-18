# Aurex Python SDK (`aurex-sdk`)

In-process LLM cost shield, circuit breaker, and CI regression gate for Python (`0 ms` proxy latency, zero-PII local ledger).

## 1. What Problems Are People Facing?

- Changing timestamps or unsorted JSON schemas silently break 90% prompt-cache discounts, and crossing `200k` tokens doubles whole-request pricing on Claude and Gemini.
- Looping tool calls, hidden reasoning tokens (`o3`, Claude thinking, Gemini `thoughts_token_count`), aborted streams, and nested SDK retries burn budget mid-run.
- HTTP `200 OK` empty outputs and `\n\n\n` JSON loops still cost money while inflating cost per completed task.

## 2. What Does Aurex Solve?

`aurex-sdk` wraps `openai` (Chat Completions, `responses.create`, and Groq/Together/Fireworks/Ollama `base_url` clients), `anthropic`, `google-genai`, and `litellm` in three connected stages:
1. **Before the call:** Canonicalizes JSON keys, pinpoints prefix-cache mutations, checks `>5m` cache TTL gaps, and warns before the `200k` 2x cliff.
2. **During the call:** Isolates sessions via context/OpenTelemetry, shares spend across workers via optional Redis, clamps thinking tokens, tracks aborted streams, and blocks loops with `AurexBlocked`.
3. **After the call:** Tags soft failures as `unfulfilled_spend`, joins spend with `mark_success()`, and diffs PR ledgers in CI.

## 3. How to Use It (Step-by-Step)

### Step 1: Install

```bash
pip install aurex-sdk
# Optional multi-worker Redis + OpenTelemetry trace support:
pip install "aurex-sdk[redis,otel]"
```

### Step 2: Patch & Protect

```python
from aurex_sdk import AurexAuditor, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        budget_guard={
            "max_cost_per_session": 1.00,
            "max_thinking_tokens": 4096,
            "on_budget_exceeded": "throw",
        },
        enable_loop_guard=True,
    )
)
patch_all(auditor)

client = openai.OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Draft release notes."}],
    workflow_id="release-job-1",
)

auditor.mark_success("release-job-1")
auditor.flush()
```

### Step 3: Run Local Audit & CI Diff

```bash
aurex audit
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment
```

*(Zero-code option: run `aurex install-hook` and set `AUREX_ENABLED=1`.)*

## 4. How Can You Improve Your Setup?

- Keep static instructions at `messages[0]` and append dynamic dates/IDs at the end of the user prompt.
- Prune conversation history before `185,000` tokens on Claude and Gemini to avoid the 2x `200k` cliff.
- Set `AUREX_REDIS_URL=redis://localhost:6379/0` so Gunicorn/Uvicorn workers enforce one shared budget.
- Add `--fail-on-regression` to `aurex ci` in GitHub Actions to block PRs that spike `cost_per_success`.
