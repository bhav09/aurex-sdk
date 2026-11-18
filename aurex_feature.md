# Aurex — Top 3 Interrelated Priority Features

**One Storyline ("Before -> During -> After Every LLM Call"):**
Aurex protects AI unit economics across one continuous pipeline: **(1) Pre-Call Prefix & Cliff Shield** calculates real cache/tier cost and stops silent input waste -> feeds exact spend predictions into **(2) In-Flight Session & Thinking Circuit Breaker** to hard-cap live execution -> emits clean, lossless ledger rows into **(3) Outcome-Backed Cost & Soft-Failure Gate** to prove verified savings in CI and production.

---

## 1. Pre-Call Prefix Cache-Shield & `200k` Cliff Guard *(Stage 1: Before the Call)*

**Description**
Detects silent prompt-cache invalidations, idle cache-TTL rewrite penalties (`1.25x`–`2x`), and `>200k` whole-request 2x pricing cliffs *before* an LLM request fires. Diffs consecutive prompt prefixes in-process to pinpoint the exact character offset breaking cache hits (e.g., dynamic timestamps or unstable JSON key order) and warns before crossing tier surcharges.

**Simple English / Analogy**
A pre-flight check that stops you from paying to reprint a 500-page manual on every turn just because today's timestamp changed on page 1—and warns you one token before crossing a 2x surge-pricing tollbooth.

**Implementation Framework / Thinking Process**
1. **Layered Prefix Hashing:** In `pre_call_check`, hash static prefix segments (`system` -> context -> history) separately rather than hashing `system_prompt` as one opaque string.
2. **Deterministic JSON Canonicalization:** Auto-sort outgoing request schema keys in-process so non-deterministic dictionary ordering stops silently invalidating OpenAI and Claude prefix caches.
3. **First-Mutating-Offset Diffing:** Compare outgoing prefix hashes against response `cached_tokens` / `cache_write_tokens`; when expected cache reads drop to `0`, pinpoint the exact mutating offset (e.g., timestamp/UUID).
4. **Idle TTL & Storage Tracker:** Measure inter-call gaps per `workflow_id` to catch Anthropic's `>5 min` idle `1.25x` `cache_creation` rewrite trap and flag idle Gemini explicit caches burning hourly storage fees.
5. **Tiered Pricing Engine:** Upgrade `calculate_cost` with `>200k` 2x whole-request repricing brackets (Claude/Gemini), multimodal content-block counting, and real model-family tokenizers instead of flat `chars // 4`.
6. **Cache-Safe Runtime Nudges:** Fix `sdk/python/aurex_sdk/decisions.py` to append Aurex instructions at the **tail** of `messages` (never index `0`), and retire placeholder `compressor.py`.

**Priority**
**P0 (Build First — Foundation of the Pipeline)** — Cuts input bills 50%–85% with **zero quality risk** and gives Feature #2 accurate pre-call cost math.

**Other Relevant Details**
- **How It Connects:** Outputs accurate tiered + cache-aware `predicted_cost` and `cache_hit_delta` directly into Feature #2's circuit breaker and Feature #3's savings ledger.
- **Provider/Reddit Issues Solved:** Silent cache breakers (All 4), `>200k` 2x context cliffs (Claude/Gemini/OpenAI), Anthropic `5m` TTL `1.25x` write spikes, OpenAI `Responses API` `cached_tokens=0` misses.
- **Aurex Files Fixed:** `sdk/python/aurex_sdk/auditor.py`, `decisions.py`, `heuristics.py`, `sdk/node/src/index.ts`, and `compressor.py`.

---

## 2. Session-Isolated Spend, Thinking & Stream Circuit Breaker *(Stage 2: During the Call)*

**Description**
Turns `BudgetGuard` and `LoopGuard` into a multi-worker, cross-pod hard kill-switch that enforces real-time dollar caps across standard tokens, hidden reasoning/thinking tokens, retry loops, and live streams. Provides the hard spend cutoff on Gemini/Vertex, AWS Bedrock, OpenAI, Claude, and hosted Llama that cloud providers omit.

**Simple English / Analogy**
A shared prepaid fuse box across all your servers that trips mid-run before a looping agent burns 25,000 invisible "thinking" tokens, triggers a `6x` retry storm, or racks up a $10,000 overnight bill.

**Implementation Framework / Thinking Process**
1. **Zero-Code Session Isolation:** Auto-extract `workflow_id` from active OpenTelemetry `trace_id` / ASGI request context when unset, eliminating `"default_workflow"` cross-user collisions in `hook.py`.
2. **Shared Multi-Worker State:** Add an optional non-blocking Redis/Valkey sliding-window adapter (with in-memory dev fallback) so session/minute budgets and `LoopGuard` hold across 20+ Kubernetes/Gunicorn workers.
3. **Thinking-Token & Downgrade Safety:** Capture Gemini `thoughts_token_count` + OpenAI/Claude thinking tokens, enforce pre-call caps on `thinking.budget_tokens` / `reasoning_effort`, and strip incompatible thinking params on graceful downgrade to prevent HTTP 400 crashes.
4. **Lossless Streaming & Retry Hygiene:** Auto-inject `stream_options={"include_usage": True}`, log partial tokens in `try...finally` on aborted streams, set native SDK `max_retries=0` when Aurex `resilience` runs (stopping `6x` retry amplification), and raise `AurexBlocked` instead of returning `MagicMock` strings.
5. **Provider Pricing & Endpoint Fixes:** Fix hosted Llama `$0.00` pricing (distinguishing `localhost` Ollama from paid Groq/Together/Bedrock endpoints), fix `patch_anthropic`'s `provider="openai"` bug, and patch OpenAI `Responses API` + AWS Bedrock.

**Priority**
**P0 (Core Runtime Control — Build Immediately After #1)** — Makes Aurex's "stops waste before it fires" headline true in real multi-pod production.

**Other Relevant Details**
- **How It Connects:** Consumes Feature #1's pre-call cost math to block/degrade accurately, and writes clean, lossless per-workflow `LLMEvent` rows (including partial streams, thinking tokens, and retries) for Feature #3.
- **Provider/Reddit Issues Solved:** Missing GCP/Bedrock hard spend caps, hidden reasoning token sticker shock, `stream=True` usage loss, `429` double-retry storms, hosted Llama `$0.00` bug, multi-worker loop leaks.
- **Aurex Files Fixed:** `sdk/python/aurex_sdk/auditor.py`, `loop_guard.py`, `resilience.py`, `hook.py`, and backend `/api/v1/policies`.

---

## 3. Outcome-Backed Cost & Soft-Failure Regression Gate *(Stage 3: After the Call + CI)*

**Description**
Joins Feature #1 and #2's clean ledger with `mark_success()` / `mark_failure()` to measure true `cost_per_successful_outcome` (`workflow_id` + `tenant_id`) while catching "unfulfilled spend"—HTTP 200 empty/truncated responses, JSON/whitespace grammar loops, and silent model/quantization degradation that inflates turns per task. Surfaces proof in both GitHub PR comments and CFO dashboards.

**Simple English / Analogy**
A fuel-efficiency gauge plus "Infracost for AI": it tracks *resolved tasks per dollar* rather than price per token, alerting you on a Pull Request or live dashboard when degraded models or code changes halve your mileage.

**Implementation Framework / Thinking Process**
1. **SQL-Native Outcome Accounting:** Move `backend/src/api/dashboard.py` and `savings.py` aggregations into SQL `SUM`/`GROUP BY` (removing `.limit(5000)`) and strictly separate workflow `mark_success()` signals from per-call resilience attempts.
2. **Soft-Failure & Grammar-Loop Classifier:** Extend `resilience.py` to flag constrained-decoding `\n\n\n` whitespace/repeated-key JSON loops and thinking-exhausted empty outputs (`finish_reason="length"` with empty text) as `unfulfilled_spend`.
3. **Silent Degradation / Quantization Drift:** Track rolling `turns_per_success` and `unfulfilled_spend` per `(model, provider_host)` to detect when quantized Llama hosts (`FP8`/`INT4` on aggregators) or peak-hour model shifts quietly double retry turns.
4. **Shift-Left CI PR Diff (`aurex ci`):** Diff a PR's test `ledger.jsonl` against `main` baseline to post a warn-first comment showing changes in cache hit % (Feature #1), thinking/cliff spend (Feature #2), and projected monthly `cost_per_success`.
5. **Tenant Margin Guardrails:** Feed `tenant_id` spend rollups back into Feature #2's `pre_call_check` policy sync (`/api/v1/policies`) so over-budget SaaS power users automatically route to cheaper models to protect gross margins.

**Priority**
**P1 (Closes the Loop — Build Week 3)** — Turns Features #1 and #2 into verified dollar-savings proof for CFOs and viral PR checks for developers.

**Other Relevant Details**
- **How It Connects:** Aggregates telemetry from #1 (cache/cliff waste) and #2 (session/thinking/retry spend) against workflow outcomes, and feeds updated `tenant_id` / workflow policies right back into #1 and #2 via `PolicySyncThread`.
- **Provider/Reddit Issues Solved:** Workflow/tenant attribution blindness, Llama aggregator quantization roulette, JSON/whitespace output runaways, billed HTTP-200 soft failures, SaaS flat-seat margin bleed.
- **Aurex Files Fixed:** `backend/src/api/savings.py`, `dashboard.py`, `sdk/python/aurex_sdk/resilience.py`, `policy_sync.py`, `cli.py`, and `sdk/node/src/ci.ts`.
