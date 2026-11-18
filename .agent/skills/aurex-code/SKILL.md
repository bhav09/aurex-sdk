---
name: aurex-code
description: >-
  Architectural, SOLID, security, and shared-component coding skill for Aurex
  (Python SDK, Node.js SDK, and FastAPI Backend). Activate whenever designing,
  editing, or refactoring Aurex code across Stage 1 (Pre-Call Shield),
  Stage 2 (In-Flight Circuit Breaker), or Stage 3 (Outcome & Soft-Failure Gate).
---

# Aurex Code Architecture & Implementation Skill

Follow these engineering rules whenever writing or modifying code in `sdk/python`, `sdk/node`, or `backend`.

## 1. One Unified 3-Stage Pipeline (Shared Foundation)

All three Aurex stages MUST share the same core helper modules rather than duplicating math or bloating `auditor.py` / `index.ts`:

1. **`pricing` (`pricing.py` / `pricing.ts`)** — Single source of truth used by Stages 1, 2, and 3:
   - Exact token counting via open-source `tiktoken` (Python default) / `js-tiktoken` (Node default) with safe `len(text) // 4` fallback if encoding lookup fails; counts multimodal blocks and schema payloads.
   - Tiered context brackets (`>200k` 2x whole-request repricing on Claude & Gemini), Anthropic `5m` (`1.25x`) vs `1h` (`2.0x`) `cache_creation` multipliers, Gemini/OpenAI/Claude thinking tokens, and endpoint-aware Llama pricing (`localhost` Ollama = `$0`, hosted Groq/Together/Fireworks/Bedrock = real token pricing).
2. **`state_store` (`state_store.py` / `state_store.ts`)** — Dependency-Inverted state store used by Stages 1, 2, and 3:
   - Clean protocol/interface (`StateStore`) with `InMemoryStateStore` default and optional `RedisStateStore` (auto-enabled when `redis` / `AUREX_REDIS_URL` is present).
   - `resolve_workflow_id()` helper: reads explicit `workflow_id` -> contextvars/`AsyncLocalStorage` -> active OpenTelemetry `trace_id` (`opentelemetry-api` if installed) -> `AUREX_WORKFLOW_ID`, avoiding `"default_workflow"` multi-user collisions.
3. **`prefix_shield` (`prefix_shield.py` / `prefix_shield.ts`)** — Stage 1 pure helper functions:
   - Deterministic JSON key canonicalization (prevents unstable dict ordering from breaking caches).
   - Layered prefix segment hashing (`system` -> `context` -> `history`), first-mutating character-offset diffing, `>5m` idle TTL warning, and `>200k` cliff pre-warning.

## 2. SOLID & Minimalist Code Principles

- **Single Responsibility (SRP):** Keep every helper function focused on one job (<40 lines per function; <250 lines per new module). Extract pure calculation helpers out of `AurexAuditor` so they can be unit-tested without mocking network clients.
- **Open/Closed (OCP):** Add new provider rules, tiered pricing brackets, or soft-failure classifiers via data tables/registries rather than sprawling `if/elif` chains.
- **Interface Segregation & Dependency Inversion (ISP/DIP):** `AurexAuditor` depends on the `StateStore` abstraction, never hardcoding Redis or file I/O inside guard logic.
- **Reuse Open-Source First:** Leverage `tiktoken` / `js-tiktoken`, optional `redis`, optional `opentelemetry-api`, and FastAPI/SQLAlchemy SQL aggregations (`func.sum`, `func.count`, `group_by`) instead of reinventing parsers or aggregating `.limit(5000)` rows in Python memory.
- **Python + Node Lockstep:** Every SDK capability, config field, and ledger JSON field added in Python (`sdk/python/aurex_sdk`) MUST have an equivalent in Node (`sdk/node/src`).

## 3. Non-Negotiable Safety & Security Invariants

1. **Fail-Open Always:** Wrap all Aurex pre-call, stream, and sync hooks in `try/except` so an internal Aurex bug never crashes the host application's LLM call (only explicit `on_budget_exceeded="throw"` or `AurexBlocked` may halt a call).
2. **Cache-Safe Mutations:** Never prepend runtime instructions at index `0` of `messages` or `system`. Append any guidance at the **tail** of the prompt so provider prefix caches remain intact.
3. **No Fake Responses:** Never return `unittest.mock.MagicMock` or fake error chat strings to end users; raise typed `AurexBlocked` / `AurexBudgetExceeded` exceptions when blocking.
4. **Zero-PII Default:** Never transmit raw prompt or response strings to the cloud sync endpoint unless explicitly opted in; strip secrets and bind ingest strictly to API-key `project_id`.
5. **No Retry Multiplication:** When Aurex `resilience` (`mode="enforce"`) is active, pass `max_retries=0` (or equivalent) to underlying OpenAI/Anthropic SDK calls so retries do not multiply (`2 x 3 = 6`).

## 4. Post-Stage Delivery Rule

After completing any stage, verify with the `aurex-smoke-test` skill and output a flat, simple summary listing **every created/modified file name + a 1-line plain-English description**.
