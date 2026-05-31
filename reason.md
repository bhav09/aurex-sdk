# Implementation Rationale — SDK Reliability, Backend Accounting & Agent-Optimized Docs

This document explains **what was built**, **why it was built that way**, and **what was deliberately not built**. It covers the reliability/loss-recovery feature set, backend ingest and analytics, test strategy, and the documentation sub-page overhaul on branch `aa`.

Read this before changing resilience behavior, ledger ingest fields, or doc structure.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [The problem we are solving](#2-the-problem-we-are-solving)
3. [Product boundaries (anti-dilution)](#3-product-boundaries-anti-dilution)
4. [Design principles and invariants](#4-design-principles-and-invariants)
5. [Architecture overview](#5-architecture-overview)
6. [SDK — Python (`aurex_sdk/resilience.py`)](#6-sdk--python-aurex_sdkresiliencepy)
7. [SDK — Python auditor integration](#7-sdk--python-auditor-integration)
8. [SDK — Node (`sdk/node/src/resilience.ts`)](#8-sdk--node-sdknodesrcresiliencets)
9. [SDK — Node auditor integration & `flushAndWait` fix](#9-sdk--node-auditor-integration--flushandwait-fix)
10. [Exceptions: `AurexRecovered` and `AurexResilienceExhausted`](#10-exceptions-aurexrecovered-and-aurexresilienceexhausted)
11. [Counterfactual accounting (`loss_avoided`, `projected_cost`)](#11-counterfactual-accounting-loss_avoided-projected_cost)
12. [Observe vs enforce modes](#12-observe-vs-enforce-modes)
13. [Idempotency policy](#13-idempotency-policy)
14. [Proof-window sampling](#14-proof-window-sampling)
15. [Fail-open semantics](#15-fail-open-semantics)
16. [Fallback registration (customer-owned keys)](#16-fallback-registration-customer-owned-keys)
17. [Backend — schema and migration 002](#17-backend--schema-and-migration-002)
18. [Backend — ledger ingest mapping](#18-backend--ledger-ingest-mapping)
19. [Backend — dashboard and savings analytics](#19-backend--dashboard-and-savings-analytics)
20. [Testing strategy](#20-testing-strategy)
21. [Documentation overhaul (agent-optimized)](#21-documentation-overhaul-agent-optimized)
22. [Naming: cloud sync resilience vs provider resilience](#22-naming-cloud-sync-resilience-vs-provider-resilience)
23. [Rollback, ops, and migration order](#23-rollback-ops-and-migration-order)
24. [Known limitations and future work](#24-known-limitations-and-future-work)
25. [File index (what changed where)](#25-file-index-what-changed-where)

---

## 1. Executive summary

This changeset adds **provider-call resilience** to the Aurex SDK (Python + Node parity), **counterfactual loss accounting** so customers can see billed-but-failed spend and recovery value, **backend support** for new event fields and dashboard metrics, and an **agent-optimized documentation split** so AI coding assistants load one small page per task instead of an 890-line reference page.

Everything is **opt-in** (`resilience.enabled=false` by default), **flag-gated** (`mode: observe | enforce`), and **additive** on the backend (nullable columns, new enum values). Disabling resilience restores prior behavior.

---

## 2. The problem we are solving

LLM providers are not 100% reliable. Customers lose money and latency in three distinct ways:

### 2.1 Hard failures

Provider throws: `429`, `5xx`, timeout, network reset. Often **not billed**, but the customer's app manually retries or reroutes → **duplicate cost + latency**. Real-time and low-latency workloads feel this most.

**Before this work:** Aurex only saw exceptions in patchers and marked workflow failure. No structured classification, no recovery ladder, no accounting for what a manual reroute would have cost.

### 2.2 Soft failures (“billed-but-failed”)

HTTP **200** with unusable output:

- `finish_reason: content_filter`
- Truncation (`length` / `max_tokens`)
- Empty `content`
- Refusal
- Malformed tool/JSON responses

**The provider still bills input + partial output. The customer pays for nothing usable.**

**Before this work:** Patchers treated HTTP 200 as success. Aurex was **blind** to unfulfilled spend — the core gap this feature addresses.

### 2.3 Manual reroute tax

On failure, apps often call a second provider/model. That **duplicate spend** is invisible in dashboards and hard to attribute to “reliability savings.”

**Why counterfactual accounting:** We record `projected_cost` (what a naive manual reroute would cost) and `loss_avoided` (value of recovery or observe-mode prevention) so reliability ROI is **measurable**, not anecdotal.

---

## 3. Product boundaries (anti-dilution)

### IN scope

- Reliability at **LLM provider-call boundaries we already patch** (OpenAI, Anthropic, Google, LiteLLM, Ollama, Hugging Face) plus `wrap()` / `awrap()`.
- Framed as **wasted-spend prevention** — cost identity preserved (Profile A: fintech/ledger).
- Generic `wrap()` seam for customers to extend patterns themselves.

### OUT of scope (deliberate)

| Not building | Why |
| :--- | :--- |
| Hosted inline proxy/gateway (LiteLLM/Portkey/Cloudflare style) | Adds latency SPOF; competes outside Aurex identity; we are a **library**, not a network hop |
| Storing or proxying provider API keys | Security/compliance; customer registers callables with **their** clients |
| Reliability for arbitrary DB/storage/cloud APIs | Scope creep; LLM boundary is where we already intercept |
| Silent auto-reroute in production by default | Trust requires observe-first rollout |

---

## 4. Design principles and invariants

| Invariant | Implementation | Profile |
| :--- | :--- | :--- |
| **Fail-open** | If resilience orchestration errors, fall back to single raw `call_fn()` | Safety |
| **Bounded execution** | `max_attempts`, `timeout_ms`, `max_extra_cost_usd` | C (AI/agentic) |
| **Idempotency** | Conservative retry rules; `require_key` mode for tool calls | A (ledger) |
| **Append-only accounting** | Each attempt → separate `log_event`; no mutation of prior rows | A (audit) |
| **Opt-in & phased** | Default off; `observe` before `enforce` | Rollout trust |
| **Conservation awareness** | Extra retry spend tracked against `max_extra_cost_usd` | A |
| **Zero PII default** | Same metadata-only cloud sync; no prompt bodies unless opted in | Privacy |

**BudgetGuard vs provider resilience:** BudgetGuard is an **in-process spend circuit breaker** (block before call). Provider resilience is **after the call** (classify, retry, fallback). Docs call this out explicitly so agents and humans do not conflate them.

---

## 5. Architecture overview

```
Customer app
  └─ AurexAuditor (singleton)
       ├─ pre_call_check (existing guards — unchanged semantics)
       └─ patched provider call OR wrap()
            └─ execute_with_resilience / callWithResilience (when enabled)
                 ├─ classify response OR exception
                 ├─ log_event per attempt (append-only)
                 ├─ observe: no retry; record projected loss_avoided
                 └─ enforce: backoff → retry / registered fallback (cost-capped)
                      └─ cloud sync → POST /api/v1/ledger/events
                           └─ dashboard: billed_but_failed_cost, loss_avoided, recovery_rate
```

**Why choke-point routing:** We already wrap `original_create(...)` at provider patch sites. Inserting resilience there captures **all** auto-instrumented traffic without requiring customers to rewrite call sites. `wrap()` gets the same path for harness users.

**Why a separate `resilience.py` / `resilience.ts` module:** Keeps `auditor.py` / `index.ts` from becoming unmaintainable; enables unit tests on classifier and executor without mocking entire patchers; mirrors Python/Node parity structure used elsewhere in the SDK.

---

## 6. SDK — Python (`aurex_sdk/resilience.py`)

### 6.1 `ResiliencePolicy`

Declarative config parsed from `AurexConfig.resilience`:

| Field | Default | Rationale |
| :--- | :--- | :--- |
| `enabled` | `false` | Zero behavior change until opt-in |
| `mode` | `"observe"` | Trust builder: measure before mutating production calls |
| `timeout_ms` | `60000` | Per-attempt wall clock; prevents hung threads in enforce |
| `max_attempts` | `2` | Hard cap on retry fan-out (initial + 1 retry by default) |
| `max_extra_cost_usd` | `0.05` | Prevents runaway retry cost blowup |
| `retry_on` | see `DEFAULT_RETRY_ON` | Explicit allowlist of retriable kinds |
| `backoff` | base 200ms, max 5s, jitter 0.5 | Reduces thundering herd on 429/5xx |
| `idempotency` | `"auto"` | Conservative retry for soft failures |
| `fallbacks` | `[]` | Ordered ladder; names map to `register_fallback` |
| `proof_window_pct` | `0.0` | Optional controlled experiment sampling |
| `on_recovery` | optional callback | Customer hook without parsing ledger |
| `classify_response_override` | optional | Enterprise/custom classifier escape hatch |

### 6.2 Classification

**Why two classifiers (`classify_response` + `classify_exception`):** Soft failures arrive as successful HTTP responses; hard failures arrive as exceptions. Single code path would miss billed-but-empty 200s.

**`ClassificationResult` fields:**

- `usable` — can downstream logic proceed?
- `kind` — stable string for `retry_on` matching and analytics
- `billed` — did provider likely charge? (empty/filter/truncated → `true`)
- `status` — `ok` | `degraded` | `error` for dashboard filtering
- `finish_reason`, `error_code`, `latency_ms` — provider telemetry for ingest

**Provider-agnostic text extraction (`_extract_text`, `_extract_finish_reason`):** OpenAI uses `choices[0].message.content`; Anthropic uses `content` blocks; dict-shaped responses supported for tests and LiteLLM. Without this, classification would be OpenAI-only and parity would break.

**Default `retry_on` kinds:** `timeout`, `429`, `5xx`, `network`, `empty`, `content_filter`, `truncated`, `refusal`, `tool_error` — covers both hard and soft recoverable cases in enforce mode.

### 6.3 `execute_with_resilience`

**Sync executor with optional thread-pool timeout:** Python provider SDKs are often sync; `concurrent.futures` enforces `timeout_ms` without assuming async clients.

**Attempt loop:**

1. Resolve fallback for attempt index from policy + registered callables.
2. Call provider (with timeout).
3. Classify → if usable, return (outcome `success` or `recovered`).
4. If soft failure → record `cost_type=unfulfilled_spend`, `outcome=degraded`, compute `projected_cost`.
5. If enforce + retryable + within caps → backoff and continue.
6. If exhausted in enforce → raise `AurexResilienceExhausted`.

**Why `async_execute_with_resilience` duplicate:** Async patch paths (`awrap`, async OpenAI) must not block the event loop with sync sleep/thread pool in the async path; mirror logic uses `asyncio.sleep` and async call semantics.

### 6.4 `estimate_projected_reroute_cost`

Models **naive manual recovery**: `billed_cost_of_failed_attempt + estimated_full_second_call_on_fallback_model`.

**Why naive is OK:** Counterfactual is for **directional ROI**, not invoicing. Uses existing `calculate_cost` / `MODEL_PRICING` so estimates stay consistent with the rest of Aurex billing views.

---

## 7. SDK — Python auditor integration

### 7.1 `_call_with_resilience` / `_acall_with_resilience`

Thin adapters that:

1. Wire `on_attempt` → `_resilience_on_attempt` → `log_event`.
2. Pass registered fallbacks dict into executor.
3. When `policy.enabled=false`, preserve **legacy** behavior: direct call + `mark_failure` on exception.

**Why every patch choke point was updated:** Missing one provider would create silent holes in reliability coverage and inconsistent ledger data.

### 7.2 `_resilience_on_attempt`

Maps `AttemptRecord` → extended `log_event` fields:

- `outcome`, `cost_type`, `attempt_index`, `recovery_provider`, `projected_cost`
- `status`, `error_code`, `latency_ms`, `finish_reason`
- `extra_metadata.resilience_kind`, `extra_metadata.loss_avoided`

**Why log every attempt:** Append-only audit trail (Profile A). Analytics can reconstruct ladders; no UPDATE-in-place on events.

### 7.3 `register_fallback(name, call_fn, *, provider, model)`

**Why named registration instead of inline lambdas in config:** Config must be JSON-serializable for env-based setup; callables live in code. Names referenced in `fallbacks: [{ "call": "openai_mini", ... }]`.

**Why we never hold provider keys:** Customer's `call_fn` uses their OpenAI/Anthropic client. Aurex stays out of key management and proxy liability.

### 7.4 `AurexConfig.resilience`

Added to config dataclass and parsed once at auditor init into `_resilience_policy`. **Why parse once:** Avoid re-parsing dict on every LLM call (hot path).

### 7.5 Cloud integration test fix (`test_cloud_integration.py`)

Added `setUp`/`tearDown` `AurexAuditor.reset()` so singleton state does not leak between tests. **Why:** Resilience work increased auditor state; tests became order-dependent without reset.

---

## 8. SDK — Node (`sdk/node/src/resilience.ts`)

**Parity goal:** Node SDK is used in serverless/Edge; behavioral drift from Python would break dual-stack customers.

### 8.1 Config parsing

`parseResilienceConfig` accepts **both** snake_case and camelCase (`timeout_ms` / `timeoutMs`). **Why:** Python SDK uses snake_case; Node idiomatic is camelCase; single config object may come from JSON shared across stacks.

### 8.2 Classification & executor

Same truth table as Python. `callWithResilience` is async-native (Promise-based providers).

### 8.3 Observe-mode double-call bug fix

**Problem:** Outer fail-open catch could re-invoke `callFn()` after observe mode already executed once, doubling provider calls.

**Fix:** Re-raise when `lastExc` is set instead of falling through to fail-open second call. **Why this matters:** Observe mode must be **strictly non-mutating**; double calls violate the trust contract and cost money.

Same fix applied symmetrically in Python's outer `except` (`if last_exc is not None: raise last_exc`).

---

## 9. SDK — Node auditor integration & `flushAndWait` fix

### 9.1 `callWithResilience` on patch sites

All async `origCreate` / `original` choke points route through `callWithResilience` when enabled — same reasoning as Python choke points.

### 9.2 `registerFallback`

Mirrors Python `register_fallback` API surface.

### 9.3 `flushAndWait(timeoutMs)` fix

**Before:** Timeout parameter was effectively a no-op; serverless handlers could exit before sync completed.

**After:** Uses `Promise.race` against queue drain with remaining time budget. **Why:** Cloud deployment docs promise flush-before-return; broken timeout undermined serverless reliability (cloud **sync** resilience, not provider resilience).

---

## 10. Exceptions: `AurexRecovered` and `AurexResilienceExhausted`

| Exception | When | Rationale |
| :--- | :--- | :--- |
| `AurexRecovered` | Informational signal that recovery succeeded | Lets `on_recovery` hooks and tests detect recovery without parsing ledger |
| `AurexResilienceExhausted` | Enforce mode, ladder exhausted | Explicit failure mode vs ambiguous provider error; carries `workflow_id`, `last_error` |

**Why not raise on observe soft failures:** Observe must not change control flow; caller still receives the degraded response or original exception.

---

## 11. Counterfactual accounting (`loss_avoided`, `projected_cost`)

### 11.1 On soft failure (degraded)

- Record actual `cost` when `classification.billed`.
- Compute `projected_cost` = estimated manual reroute cost.
- In **observe** mode: `loss_avoided = projected_cost` (what you **would** have wasted without a future recovery policy).
- In **enforce** mode: soft failure may retry; `loss_avoided` on intermediate attempts stays 0 until recovery math applies.

### 11.2 On recovery (attempt > 0, usable response)

- `outcome = recovered`
- `projected_cost` ≈ cost of naive reroute without resilience
- `loss_avoided = projected_cost` (value of automated recovery vs manual duplicate call)

**Why store in both top-level ingest fields and `extra_metadata`:** Backend ingest historically used `extra_metadata` for extensibility; top-level columns enable SQL aggregation on dashboard.

---

## 12. Observe vs enforce modes

| Mode | Provider calls | Ledger | Production risk |
| :--- | :--- | :--- | :--- |
| **observe** | Single call only | Classifies + counterfactual metrics | None — behavior identical to today except extra telemetry |
| **enforce** | Retry/fallback within caps | Records ladder + recovered/degraded outcomes | Low if caps configured; mitigated by defaults |

**Default when enabling:** `mode: observe` — **why:** Sales and engineering can prove ROI (`loss_avoided` in dashboard) before turning on mutating retries.

---

## 13. Idempotency policy

| Value | Behavior | Why |
| :--- | :--- | :--- |
| `off` | Never retry in enforce | Maximum safety for side-effecting tools |
| `require_key` | Retry hard failures only if `idempotency_key` present | Explicit caller contract |
| `auto` (default) | Retry only `timeout`, `429`, `5xx`, `network` — **not** soft failures by default | Soft failures may still charge; blind retry doubles spend |

**Conservative default:** Profile A — retries never double-charge on ambiguous tool calls unless customer opts in.

---

## 14. Proof-window sampling

`proof_window_pct` (0–1): deterministic hash bucket on `workflow_id:model` decides if enforce recovery runs **even in observe mode** for a small fraction of traffic.

**Why:** Observe mode cannot measure **actual** recovered value without occasionally executing recovery. Sampling is:

- Deterministic (same workflow always same bucket — debuggable)
- Capped by percentage
- Off by default (`0.0`)

**Why hash-based not random:** Reproducible in tests and support investigations.

---

## 15. Fail-open semantics

If resilience **orchestration** throws (bug, unexpected provider shape):

1. Python: if `last_exc` from provider → re-raise provider error (not double call).
2. Else: single raw `call_fn()` attempt with meta `{ resilience: "fail_open" }`.
3. Node: same pattern with async `callFn()`.

**Why:** Aurex must **never** make reliability worse than no Aurex. A bug in classification should not block production LLM traffic.

---

## 16. Fallback registration (customer-owned keys)

Fallback ladder entries:

```json
{ "name": "openai_mini", "after": ["network", "5xx"], "provider": "openai", "model": "gpt-4o-mini" }
```

Or `{ "call": "registered_name" }` → `register_fallback("registered_name", fn, ...)`.

**Same-provider cheaper model:** Mutate model in params and re-call original client — no extra registration.

**Cross-provider:** Requires registered callable — **why:** Aurex cannot instantiate Anthropic/OpenAI clients without customer credentials.

---

## 17. Backend — schema and migration 002

### 17.1 ORM extensions (`backend/src/models/llm_event.py`)

**OutcomeEnum additions:**

- `RECOVERED` — successful recovery after failure
- `DEGRADED` — billed-but-failed / soft failure path

**CostTypeEnum addition:**

- `UNFULFILLED_SPEND` — money spent without usable output

**Columns (reliability telemetry):**

| Column | Purpose |
| :--- | :--- |
| `status` | Provider-level status string from SDK |
| `error_code` | Classified kind / error code |
| `latency_ms` | Attempt latency |
| `finish_reason` | Provider finish reason |
| `reported_cost_usd`, `cost_source` | Align with migrate_001 spec |
| `projected_cost` | Counterfactual reroute estimate |
| `recovery_provider` | Provider used after fallback |
| `attempt_index` | Position in retry ladder |

**Why additive nullable columns:** Zero-downtime deploy; old SDK clients still ingest; rollback = stop sending new fields.

### 17.2 Migration `backend/scripts/migrate_002_reliability_fields.py`

Idempotent `ALTER TABLE` for `projected_cost`, `recovery_provider`, `attempt_index`. Supports SQLite (dev) and Postgres-style `information_schema` (prod).

**Run order:** migrate_001 (if not already) → migrate_002 before trusting dashboard reliability metrics.

---

## 18. Backend — ledger ingest mapping

`backend/src/services/ledger.py` changes:

- `_parse_outcome` / `_parse_cost_type` — tolerant string parsing (`recovered`, `unfulfilled_spend`, enum prefixes).
- Map previously dropped SDK fields: `latency_ms`, `status`, `error_code`, `finish_reason`, `projected_cost`, `recovery_provider`, `attempt_index`.
- Merge `loss_avoided` from top-level or `extra_metadata`.

**Why per-event try/except ingest:** One bad event must not reject entire batch (existing pattern preserved).

**Why duplicate `projected_cost` into metadata:** Older analytics readers may only scan JSON metadata; dashboard SQL uses columns.

---

## 19. Backend — dashboard and savings analytics

### 19.1 Dashboard overview (`backend/src/api/dashboard.py`)

New metrics:

| Metric | Definition |
| :--- | :--- |
| `billed_but_failed_cost` | Sum of `cost` where outcome/cost_type indicates unfulfilled/degraded spend |
| `loss_avoided` | From recovered events' `projected_cost - cost` plus observe-mode `extra_metadata.loss_avoided` |
| `recovery_rate` | `recovered / (failures + degraded + unfulfilled)` |

**Why both column and metadata for `loss_avoided`:** Observe-mode events may only populate metadata during phased rollout; summing both avoids under-reporting.

### 19.2 Savings timeline (`backend/src/api/routes.py`)

- New category `reliability_savings` in `category_breakdown`.
- Timeline entries include `loss_avoided` from session `analysis_results.reliability_summary`.
- Intervention types `reliability_savings`, `unfulfilled_spend`, `billed_but_failed` map into category rollup.

**Why a separate savings category:** FinOps users need to distinguish **model downgrade savings** from **reliability/recovery savings** — different intervention levers.

---

## 20. Testing strategy

### 20.1 Python (`sdk/python/test_resilience.py`)

- Classifier truth table (success, empty, content_filter, timeout)
- `parse_resilience_config`
- Observe: single call on network error (no retry)
- Enforce: recovery on second attempt
- Enforce exhausted → `AurexResilienceExhausted`
- Projected reroute cost math

**Why unit tests on `resilience.py` directly:** Fast, deterministic, no patcher mock choreography (Profile Z testing anti-pattern avoided).

### 20.2 Python patchers / cloud (`test_patchers.py`, `test_cloud_integration.py`)

Existing suites extended; singleton reset prevents cross-test pollution.

### 20.3 Node (`frontend/tests/unit/sdk-node-resilience.test.ts`)

Mirrors Python scenarios for `classifyResponse`, observe/enforce, fail-open, counterfactual.

**Why tests live under `frontend/tests/unit`:** Existing Node SDK test harness runs via frontend vitest — convention preserved.

### 20.4 Backend (`backend/tests/unit/test_resilience_ingest.py`, `test_dashboard_reliability.py`)

- Ingest accepts new fields and enum values
- Dashboard rollup math for reliability metrics

**Why backend tests separate from SDK:** Contract verification at HTTP/DB boundary; catches ingest mapping regressions SDK tests would miss.

---

## 21. Documentation overhaul (agent-optimized)

### 21.1 Problem

- `frontend/app/docs/reference/page.tsx` was **~890 lines** — context rot for AI agents.
- `llms.txt` pointed agents at `#anchors` on that monolith.
- Reliability feature had **zero** doc pages despite full implementation.

### 21.2 Solution — one concern per URL

| Area | Hub | Sub-pages |
| :--- | :--- | :--- |
| API Reference | `/docs/reference` | 11 pages (autohook, integration, config, …) |
| Cloud Deployment | `/docs/deployment` | serverless-flush, filesystem, cloud-sync, rate-limits |
| Reliability | `/docs/reliability` | overview, policy, observe-enforce, fallbacks, classification, accounting |
| Install / Harness | existing + | env-vars, decision-matrix |

**Page template (every sub-page):**

1. Agent hint banner
2. Scope in / out
3. Minimal Python + Node example
4. Focused reference table
5. “See also” links (no duplicated full config tables)

**Shared components:** `DocPageShell`, `DocSeeAlso`, `DocHubCards`, `DocHashRedirect`.

### 21.3 `llms.txt` rewrite

- Task → **single URL** routing table (no `#anchors` on reference).
- Slim API summary pointing to sub-pages for details.
- Reliability routes and new exceptions documented.
- Rule: **fetch one page per task**; do not load hubs for implementation detail.

### 21.4 Backward compatibility

- `DocHashRedirect` on hub pages maps legacy hashes (`#config-reference` → `/docs/reference/config`, etc.).
- `next.config.mjs` path redirects for old slugs.
- Updated in-repo links; overview card for Reliability added.

**Why invest in docs structure:** Agents are first-class SDK consumers; bad docs → bad integrations → support cost and wrong retry semantics in production.

---

## 22. Naming: cloud sync resilience vs provider resilience

Two different concepts — **must not be conflated:**

| Term | Doc path | Meaning |
| :--- | :--- | :--- |
| **Cloud sync resilience** | `/docs/deployment/cloud-sync` | SDK → Aurex backend HTTP: retries, 429, `events_dropped`, `flushAndWait` |
| **Provider-call resilience** | `/docs/reliability/*` | SDK → OpenAI/Anthropic: classify, retry, fallback, `loss_avoided` |

**Why separate URLs:** Agents searching “resilience” were loading cloud sync docs and misconfiguring `resilience.enabled` vs `sync_max_retries`.

---

## 23. Rollback, ops, and migration order

### Instant SDK rollback

```python
AurexConfig(resilience={"enabled": False})
```

Or remove `resilience` key entirely. Behavior matches pre-feature SDK.

### Backend rollback

Columns are nullable; old code ignores new fields. No destructive migration required.

### Deploy checklist

1. Deploy backend with ORM + ingest mapping.
2. Run `python -m scripts.migrate_002_reliability_fields` on target DB.
3. Ship SDK with `resilience.enabled=false` default.
4. Customer enables `mode: observe` → validate dashboard metrics.
5. Customer enables `mode: enforce` with caps.

---

## 24. Known limitations and future work

| Limitation | Reason | Possible follow-up |
| :--- | :--- | :--- |
| Classifier is heuristic | Provider response shapes evolve | `classify_response_override` hook; golden tests per provider |
| Counterfactual is estimated | No ground truth without proof window | Proof-window sampling; manual reconciliation jobs |
| No hosted fallback routing | Product boundary | Document patterns for LiteLLM router + Aurex observe |
| Async Python timeout uses thread pool | Sync client compatibility | Native async timeout when all patch paths async |
| `AurexRecovered` not raised on all paths | Informational exception optional | Document as hook/callback primary signal |
| Dashboard UI may not surface all new metrics yet | Backend/API first | Frontend widgets for `billed_but_failed_cost` |
| `llms.txt` / `docs-nav.ts` manual sync | No codegen yet | Optional build step to generate routing table |

---

## 25. File index (what changed where)

### SDK Python

| File | Change |
| :--- | :--- |
| `sdk/python/aurex_sdk/resilience.py` | **New** — policy, classify, execute, counterfactual math |
| `sdk/python/aurex_sdk/auditor.py` | Wire resilience at choke points; `register_fallback`; extended `log_event` |
| `sdk/python/aurex_sdk/exceptions.py` | `AurexRecovered`, `AurexResilienceExhausted` |
| `sdk/python/aurex_sdk/__init__.py` | Export resilience types |
| `sdk/python/test_resilience.py` | **New** unit tests |
| `sdk/python/test_cloud_integration.py` | Singleton reset in tests |

### SDK Node

| File | Change |
| :--- | :--- |
| `sdk/node/src/resilience.ts` | **New** — parity module |
| `sdk/node/src/index.ts` | `callWithResilience`, `registerFallback`, patch wiring, `flushAndWait` fix |
| `sdk/node/src/exceptions.ts` | New exception classes |
| `frontend/tests/unit/sdk-node-resilience.test.ts` | **New** tests |

### Backend

| File | Change |
| :--- | :--- |
| `backend/src/models/llm_event.py` | Enums + columns |
| `backend/scripts/migrate_002_reliability_fields.py` | **New** migration |
| `backend/src/services/ledger.py` | Ingest mapping |
| `backend/src/api/dashboard.py` | Reliability metrics |
| `backend/src/api/routes.py` | `reliability_savings` category |
| `backend/tests/unit/test_resilience_ingest.py` | **New** |
| `backend/tests/unit/test_dashboard_reliability.py` | **New** |

### Docs / frontend

| File | Change |
| :--- | :--- |
| `frontend/app/docs/reference/*` | 11 sub-pages + hub |
| `frontend/app/docs/reliability/*` | 6 sub-pages + hub |
| `frontend/app/docs/deployment/*` | 4 sub-pages + slim hub |
| `frontend/app/docs/installation/env-vars/` | Canonical env reference |
| `frontend/app/docs/harness/decision-matrix/` | Harness matrix extracted |
| `frontend/components/docs/doc-*.tsx` | Shared doc components |
| `frontend/components/docs/docs-nav.ts` | Sub-route nav + Reliability group |
| `frontend/public/llms.txt` | Agent routing rewrite |
| `frontend/next.config.mjs` | Legacy path redirects |
| `frontend/app/docs/page.tsx` | Overview cards + agent banner |

---

## Closing note

This implementation prioritizes **trust** (observe before enforce), **safety** (fail-open, bounded caps, idempotency), **auditability** (append-only per-attempt events), and **measurable ROI** (counterfactual accounting) over **magic** (hosted gateway, silent reroute, key custody). The documentation structure matches that philosophy: small, truthful pages so humans and agents integrate without context rot.

For doc routing, start at `/llms.txt`. For behavioral truth, start at `sdk/python/aurex_sdk/resilience.py` and `sdk/node/src/resilience.ts`.
