---
name: aurex-smoke-test
description: >-
  End-to-end smoke testing skill for Aurex across Python SDK, Node.js SDK, and
  FastAPI Backend. Activate after implementing each stage (Stage 1, Stage 2,
  Stage 3) and after documentation/API updates to verify nothing is broken.
---

# Aurex Smoke Test Skill

Run this workflow after every implementation stage to guarantee Python SDK, Node.js SDK, and Backend API remain green and fast.

## 1. Run the Automated Smoke Script

Execute the unified smoke test runner from the repository root:

```bash
bash .agent/skills/aurex-smoke-test/scripts/run_smoke.sh
```

([run_smoke.sh](./scripts/run_smoke.sh))

## 2. What Each Stage Must Prove in Smoke Tests

Keep smoke tests fast (<15 seconds total), offline-capable (no real paid OpenAI/Anthropic keys required), and deterministic:

- **Shared Foundation:**
  - `tiktoken` / `js-tiktoken` counts text, multimodal blocks, and schemas accurately.
  - `StateStore` works identically in `InMemoryStateStore` mode and (when mocked/configured) `RedisStateStore` mode.
- **Stage 1 (Before the Call — Prefix & `200k` Cliff Shield):**
  - Unstable JSON dict key order is canonicalized to the exact same hash.
  - Mutating a timestamp at the start of a system prompt is pinpointed at its character offset on cache miss.
  - Crossing `200,000` input tokens triggers 2x tiered cliff pricing + pre-call cliff warning.
  - `>5 min` Anthropic idle gap flags `1.25x` cache-rewrite risk; runtime instructions append at the tail (never index `0`).
- **Stage 2 (During the Call — Spend, Thinking & Stream Breaker):**
  - Concurrent calls without explicit `workflow_id` isolate cleanly via context/OTel trace (no `"default_workflow"` cross-talk).
  - Hosted Llama models (`groq/llama-4-scout`, `together_ai/...`) bill real dollars while `localhost` Ollama bills `$0.00`.
  - Streaming (`stream=True`) auto-injects `stream_options={"include_usage": True}` and logs partial spend even if aborted mid-stream.
  - Blocking raises `AurexBlocked` (no `MagicMock` chat strings) and active `resilience` sets underlying SDK `max_retries=0`.
- **Stage 3 (After the Call + CI — Outcome & Soft-Failure Gate):**
  - Thinking-exhausted empty outputs and `\n\n\n` JSON/whitespace loops classify as `unfulfilled_spend`.
  - Backend SQL aggregations (`dashboard.py`, `savings.py`) accurately compute `cost_per_success` without `.limit(5000)` truncation or double-counting per-call attempts, and `GET /api/v1/policies` returns 200.
  - `aurex audit` / `aurex ci` outputs clear baseline vs. branch regression diffs.

## 3. Failure Rule

Never proceed to the next stage if `run_smoke.sh` exits non-zero or TypeScript compilation (`npm run build` in `sdk/node`) fails.
