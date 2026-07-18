# Aurex - Design Decisions & Internal Architecture

This document explains **what Aurex is**, **how the SDK and backend actually work inside**, and **why we built things the way we did**. It is not limited to one feature or one chat session. Use it before changing SDK behavior, ingest contracts, guards, or documentation.

**Audience:** engineers, reviewers, and AI agents integrating Aurex.

**Plain-language rule:** if a section uses jargon, the next paragraph explains it in everyday terms.

---

## Table of contents

### Foundations
1. [What Aurex is (and is not)](#1-what-aurex-is-and-is-not)
2. [Core product decisions](#2-core-product-decisions)
3. [Design principles we never compromise on](#3-design-principles-we-never-compromise-on)

### How the SDK works internally
4. [SDK architecture at a glance](#4-sdk-architecture-at-a-glance)
5. [The singleton auditor](#5-the-singleton-auditor)
6. [Three ways to integrate](#6-three-ways-to-integrate)
7. [Monkey-patching providers](#7-monkey-patching-providers)
8. [The `wrap()` / manual harness path](#8-the-wrap--manual-harness-path)
9. [What happens on every LLM call (step by step)](#9-what-happens-on-every-llm-call-step-by-step)
10. [The decision engine (`pre_call_check`)](#10-the-decision-engine-pre_call_check)
11. [Budget guard: two checkpoints](#11-budget-guard-two-checkpoints)
12. [Logging an event (`log_event`)](#12-logging-an-event-log_event)
13. [The local ledger](#13-the-local-ledger)
14. [Cloud sync (SDK → backend)](#14-cloud-sync-sdk--backend)
15. [Pricing and cost calculation](#15-pricing-and-cost-calculation)
16. [Outcomes (`mark_success` / `mark_failure`)](#16-outcomes-mark_success--mark_failure)
17. [Provider resilience (retry & fallbacks)](#17-provider-resilience-retry--fallbacks)
18. [Offline heuristics and CI gates](#18-offline-heuristics-and-ci-gates)
19. [Python vs Node parity](#19-python-vs-node-parity)

### Backend & platform
20. [Backend architecture](#20-backend-architecture)
21. [Two ways events enter the database](#21-two-ways-events-enter-the-database)
22. [Authentication and multi-tenancy](#22-authentication-and-multi-tenancy)
23. [Dashboard and analytics](#23-dashboard-and-analytics)
24. [Audit upload vs live SDK telemetry](#24-audit-upload-vs-live-sdk-telemetry)

### Frontend & docs
25. [Frontend decisions](#25-frontend-decisions)
26. [Documentation structure (agent-optimized)](#26-documentation-structure-agent-optimized)

### History, ops, and gaps
27. [Decision timeline (from project history)](#27-decision-timeline-from-project-history)
28. [Rollback and deployment checklist](#28-rollback-and-deployment-checklist)
29. [Known limitations and honest gaps](#29-known-limitations-and-honest-gaps)
30. [File index](#30-file-index)

---

## 1. What Aurex is (and is not)

### What it is

Aurex is a **local-first library** (Python + Node SDK) that sits next to your LLM application. It:

- **Watches** LLM calls (OpenAI, Anthropic, Google, LiteLLM, Ollama, Hugging Face, etc.)
- **Measures** tokens and cost using a built-in pricing table
- **Guards** spend in real time (budget limits, downgrade, compress, block)
- **Records** metadata to a local JSON Lines file (`.aurex/ledger.jsonl`)
- **Optionally syncs** metadata to your Aurex backend for dashboards
- **Detects waste** offline (loops, prompt duplication, expensive model misuse)
- **Recovers** from provider failures when you opt in (classify, retry, fallback, account for “loss avoided”)

In simple terms: **Aurex is a smart electricity meter + circuit breaker for LLM spend**, not a replacement for OpenAI or Anthropic.

### What it is not

| Not this | Why we avoided it |
| :--- | :--- |
| A hosted LLM proxy/gateway | Adds latency, single point of failure, key custody; competes with LiteLLM/Portkey |
| A prompt storage product | Zero-PII default: we hash prompts locally; raw text stays on your machine |
| A generic retry library for databases/APIs | Scope is LLM provider boundaries we already patch |
| A “magic auto-save 50%” black box | Observe mode proves value before enforce mode changes call behavior |

---

## 2. Core product decisions

### 2.1 Local-first control plane

**Decision:** Write telemetry to disk (or memory) first; sync to cloud in a background thread.

**Reason:** LLM calls are latency-sensitive. Blocking every call on HTTP would add tens to hundreds of milliseconds. The hot path only enqueues a small JSON object (`put_nowait`). File I/O and network happen later.

**Trade-off:** Short-lived processes (Lambda) must call `flush()` / `flushAndWait()` before exit, or events may not reach the cloud. We document this explicitly.

### 2.2 Zero-PII by default

**Decision:** Hash prompts and responses with SHA-256 locally. Cloud payload is metadata (tokens, cost, model, workflow id, optional hashes).

**Reason:** Enterprise buyers worry about data leaving their VPC. Hashing gives deduplication and audit signals without exfiltrating content.

**Opt-in:** `sync_prompt_hashes` / `AUREX_SYNC_PROMPT_HASHES=1` sends hashes to the backend when the customer accepts that trade-off.

### 2.3 In-process guards (no network on the hot path)

**Decision:** `pre_call_check` and budget evaluation run entirely inside the customer process.

**Reason:** A budget guard that waits on a remote API is useless when the provider call itself is the expensive operation. Guards must decide **before** or **immediately after** the call without round-trips.

### 2.4 Warn by default, enforce when configured

**Decision:** Guard actions default to logging/warning. Throwing or blocking requires `on_budget_exceeded: "throw"` or `AUREX_BLOCK_ON_WASTE=1`.

**Reason:** Dropping a new SDK into production that suddenly blocks LLM traffic causes incidents. Customers opt into hard enforcement after tuning thresholds.

### 2.5 Cost identity: Aurex optimizes waste, not “cheaper models for everyone”

**Decision:** Frame features as **wasted spend prevention** (duplicate prompts, loops, billed-but-empty responses, manual reroutes), not generic model routing.

**Reason:** Keeps the product differentiated from routers and avoids race-to-bottom on model quality.

### 2.6 Python + Node parity

**Decision:** Both SDKs expose the same concepts (singleton, patch, wrap, budget guard, cloud sync, resilience).

**Reason:** Teams run Python for agents and Node for web/API. Divergent behavior would break trust and docs.

---

## 3. Design principles we never compromise on

| Principle | What it means in code |
| :--- | :--- |
| **Fail-open** | If Aurex hook, patch, or resilience code crashes, the underlying LLM call still runs (or the original error propagates). We never make reliability worse than no Aurex. |
| **Append-only telemetry** | Each attempt is a new ledger event. Corrections are new rows, not edits. |
| **Bounded work** | Queues, batch sizes, retry counts, and extra-cost caps are hard-limited. |
| **Explicit contracts** | Config fields, ingest JSON, and doc URLs are versioned and documented. |
| **Conservative retries** | Default idempotency policy does not blindly retry soft failures that may still bill. |
| **Customer owns provider keys** | Fallbacks use `register_fallback` callables with the customer’s clients. |

---

## 4. SDK architecture at a glance

Both Python (`aurex_sdk/auditor.py`) and Node (`sdk/node/src/index.ts`) follow the same shape:

```
┌─────────────────────────────────────────────────────────┐
│                    AurexAuditor (singleton)              │
├─────────────────────────────────────────────────────────┤
│  Config (AurexConfig)                                   │
│  Pricing table (MODEL_PRICING + overrides)             │
│  Resilience policy (optional)                            │
│  Budget guard config                                     │
├─────────────────────────────────────────────────────────┤
│  In-memory queue (bounded)                               │
│  Background worker (flush interval + batch size)         │
│  Session / minute cost trackers                          │
│  Recent prompts/responses (for loop detection)           │
├─────────────────────────────────────────────────────────┤
│  Integration surfaces:                                   │
│    • auto-hook (import time)                             │
│    • patch_openai / patchAll / …                         │
│    • wrap() / awrap()                                    │
│    • log_event() manual                                  │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   Local ledger (.jsonl)         POST /api/v1/ledger/events
```

**Why a singleton:** One queue, one worker thread, one patch status map per process. Multiple auditors would double-count and fight over the same ledger file.

**Escape hatch:** `AurexAuditor.reset()` for tests and serverless cold starts.

---

## 5. The singleton auditor

### Lifecycle (Python; Node mirrors this)

1. **First `AurexAuditor(...)` or `getInstance(...)`**  
   - Parses config  
   - Resolves ledger path (`prepare_ledger_storage`)  
   - Creates bounded queue (default 10,000 events)  
   - Replays `pending.jsonl` from last crash into main ledger  
   - Starts daemon worker thread  
   - Registers `atexit` / signal handlers for graceful shutdown  

2. **Second init with new config**  
   - Warns once and **ignores** new config (by design)  
   - Use `reset()` if you truly need reconfiguration  

3. **Shutdown**  
   - Stops worker  
   - Drains queue to `pending.jsonl` (file mode)  
   - Closes sync resources  

### Fork safety (Python)

After `fork()` (some WSGI/Celery setups), the worker thread is invalid. We re-init the worker in the child via `os.register_at_fork(after_in_child=...)`.

**Why:** Otherwise the child process silently stops flushing events.

---

## 6. Three ways to integrate

| Method | When to use | Double-count risk |
| :--- | :--- | :--- |
| **Auto-hook** (`aurex install-hook`, `AUREX_ENABLED=1`) | Zero code change; quick start | Low |
| **Patch** (`patch_all()`, `patchOpenAI()`, …) | You control init; want automatic interception | Low if you don’t also wrap the same call |
| **Wrap** (`wrap()` / manual `log_event`) | You already have a custom LLM wrapper or middleware | Low if patch is disabled |
| **Manual log only** | You already emit tokens elsewhere (OTel, LangChain callback) | Low if patch disabled |

**Decision:** Support all paths because real teams have different maturity levels. The harness decision matrix doc explains combinations.

**Anti-pattern we guard against:** Patching **and** wrapping the same call path → duplicate `log_event` rows. Patches set `__aurex_patched__` on functions; health output exposes `patch_status` so you can verify.

---

## 7. Monkey-patching providers

### What patching does

We replace the provider SDK’s create/chat method with a wrapper that:

1. Pulls Aurex metadata from kwargs or context (`workflow_id`, tags, …)
2. Runs `pre_call_check`
3. Applies decision (downgrade model, compress messages, block, or suggest cache)
4. Calls the provider through resilience layer (if enabled)
5. Parses usage from the response (including streams)
6. Calls `log_event`

### Patch order (`patch_all`)

LiteLLM first (multi-provider shim), then Anthropic, OpenAI, Google, Ollama, Hugging Face.

**Why LiteLLM first:** Many apps route all models through LiteLLM; patching it catches traffic that never touches native SDKs.

### Idempotent patches

Each patched function gets `__aurex_patched__ = True`. Re-patching records `"already_patched"` in `patch_status` instead of nesting wrappers.

**Why:** Double patches would duplicate logs and multiply guard overhead.

### Streaming

Stream wrappers accumulate chunks, then log **one** event when the stream completes (with total tokens if the provider exposes them).

**Why:** Per-chunk logging would inflate event count and distort cost guards.

### `cache_suggest` short-circuit

When semantic cache heuristic fires, we can return a mock response without calling the provider.

**Why:** Lets apps plug in a real cache on `on_cache_hit` without paying for an LLM call.

---

## 8. The `wrap()` / manual harness path

### Python: `contextvars`

`wrap(call_fn, build_params, options)` sets a **context variable** (`aurex_context`) for the duration of the call. Nested calls see per-request:

- `workflow_id`
- `budget_guard` overrides
- `downgrade_map`
- Heuristic thresholds

**Why contextvars:** Thread-safe and async-safe in Python 3.7+; global singleton config stays unchanged for other requests.

### Node: `AsyncLocalStorage`

Same idea: `aurexContext.run(mergedOptions, () => …)` so concurrent requests don’t leak budget limits.

### When wrap beats patch

- Multi-tenant SaaS with **per-tenant budgets** on the same process  
- LangChain/LiteLLM middleware where patch would fight existing wrappers  
- You want guards without touching global provider modules  

---

## 9. What happens on every LLM call (step by step)

Here is the full path for a patched OpenAI chat completion (non-streaming):

```
1. App calls openai.chat.completions.create(...)
2. Aurex wrapper runs
3. Extract workflow_id, tags from kwargs or context
4. pre_call_check(model, prompt, messages, workflow_id)
      → AurexDecision: proceed | downgrade | compress | block | cache_suggest
5. apply_decision_to_call_params - may change model/messages or raise AurexBlocked
6. _call_with_resilience (if resilience.enabled) OR direct original()
7. Provider returns response OR throws
8. Classify + log each resilience attempt (if enabled)
9. Parse usage tokens from response
10. log_event(model, tokens, cost, workflow_id, …)
11. _check_budget - post-call budget reaction (warn/webhook/throw)
12. Return response to app (or raise)
```

**Key insight:** Steps 4–5 happen **before** the provider call. Step 10–11 happen **after**. Resilience sits at step 6–8.

---

## 10. The decision engine (`pre_call_check`)

Implemented in `auditor.py` with types in `decisions.py`. Checks run **in order**; first match wins unless combined actions apply.

| Order | Check | Typical action | Why it exists |
| :---: | :--- | :--- | :--- |
| 1 | Semantic cache (Jaccard > 0.9 vs recent prompts) | `cache_suggest` | Avoid repeat LLM cost for near-duplicate prompts |
| 2 | Budget guard (predicted cost + limits) | `block` | Stop runaway spend before it happens |
| 3 | Ignored workflows | skip | Allowlist admin/internal flows |
| 4 | Duplicate system prompt hash | `compress` | Strip repeated system prompts from context |
| 5 | Runaway context (3 steps ≥ 2.2× growth) | `downgrade` + inject summarize instruction | Agent loops blowing context |
| 6 | Near session budget (80%) or simple prompt on expensive model | `downgrade` | Automatic model swap |
| 7 | Context explosion (≥ 3.5× first request) | `compress` | Long conversations eating input cost |
| 8 | Semantic loop (prompt similar to last responses) | `compress` + instruction | Detect “model talking to itself” |
| 9 | High retries + loop score | POST `/escalations` | Human-in-the-loop for stuck agents |

### Decision actions

| Action | Meaning |
| :--- | :--- |
| `proceed` | Call goes through unchanged |
| `downgrade` | Swap to cheaper model from downgrade map |
| `compress` | Prune or rewrite messages (system prompt dedup, instructions) |
| `block` | Stop call; optional throw `AurexBlocked` |
| `cache_suggest` | Hint app to use cache; may short-circuit with mock |

### Downgrade map

Static defaults (e.g. `gpt-4o` → `gpt-4o-mini`) plus `config.downgrade_map` plus per-`wrap()` overrides.

**Why configurable map:** Model names and pricing change; customers pick their own cheaper targets.

---

## 11. Budget guard: two checkpoints

**Important:** “Circuit breaker” in Aurex docs means **spend/rate limits**, not AWS-style open/half-open service circuits.

### Pre-call (`pre_call_check`)

Uses **predicted** cost of the upcoming call plus rolling windows:

- `max_cost_per_session` (per `workflow_id`)
- `max_cost_per_minute`
- `max_requests_per_minute`
- `max_context_tokens`

Can **block before** the provider is invoked.

### Post-call (`_check_budget` / `checkBudget`)

Runs after `log_event` updates session totals. Reacts to **actual** spend:

- `on_budget_exceeded: warn` - stderr log  
- `webhook` - POST to customer URL  
- `throw` - raise `AurexBudgetExceeded`  
- `dry_run` - evaluate only  

**Why two phases:** Pre-call prevents the next call; post-call catches drift when token estimates were wrong or multiple workers share a workflow id inconsistently.

### Budget guard ≠ provider resilience

| | Budget guard | Provider resilience |
| :--- | :--- | :--- |
| **When** | Before/after spend accounting | During provider call |
| **Goal** | Cap total spend | Recover from failed/empty responses |
| **Default** | Empty config = off | `enabled: false` |

---

## 12. Logging an event (`log_event`)

### On the caller thread (fast)

1. Timestamp (UTC ISO)  
2. Hash prompt / system / response (SHA-256)  
3. `calculate_cost(model, input_tokens, output_tokens, cache…)`  
4. Build event dict (provider, model, workflow, outcome, resilience fields, tags)  
5. Update in-memory session and minute windows (for guards)  
6. `queue.put_nowait(event)` - or spill to overflow file if full  

### On the worker thread (slow)

1. Batch when `max_batch_size` (100) or `flush_interval` (30s)  
2. Append JSON lines to ledger file **or** append to memory list  
3. If cloud sync on: `POST` batch to backend  

**Why cost is computed before queueing:** `pre_call_check` on the **next** call sees up-to-date session totals.

**Why queue instead of sync write:** Producers never block on disk or network.

---

## 13. The local ledger

### File layout

| File | Purpose |
| :--- | :--- |
| `.aurex/ledger.jsonl` | Main append-only log |
| `.aurex/ledger.<worker>.jsonl` | Per-process file when `per_process_ledger=true` |
| `pending.jsonl` | Queue drained at shutdown; replayed on next startup |
| `queue_overflow.jsonl` | Spill when in-memory queue is full |

### Storage fallback chain

1. Try configured `ledger_path`  
2. Try `/tmp/.aurex/...`  
3. Fall back to **memory-only** (warn once)  

**Why per-process ledger:** Gunicorn/K8s replicas writing one file causes corruption and lock contention.

**Why pending.jsonl:** Lambda kill / crash mid-batch shouldn’t lose queued events that never hit disk.

### Environment overrides

- `AUREX_LEDGER_PATH` - force writable path in read-only containers  
- `AUREX_WORKER_ID` - stable suffix instead of PID when workers restart  

---

## 14. Cloud sync (SDK → backend)

**Separate from provider resilience.** This section is about uploading telemetry **after** calls complete.

### Gating

Sync runs only when:

- `cloud_sync=true` (or Node default when `apiKey` set)  
- `local_only=false`  
- Valid `api_key` / `apiKey` present  

### Transport

- Endpoint: `{baseUrl}/ledger/events` (canonical v1)  
- Auth: `Bearer aux_*`  
- Payload: `{ "events": [ { …, "cost_usd": float } ] }`  
- Retries: exponential backoff + jitter; honor HTTP 429 `Retry-After`  
- Timeout: `sync_timeout_seconds` / `syncTimeoutMs` per attempt  

### Failure behavior

Failed sync increments `sync_error_count`; events **remain on disk**. We do not silently drop local ledger rows on network failure.

**Why:** Local ledger is source of truth; cloud is a mirror for dashboards.

### Privacy strip

Unless `sync_prompt_hashes`, hash fields may be stripped before upload.

---

## 15. Pricing and cost calculation

### Lookup order (`get_model_pricing`)

1. Wildcard patterns (`local/*`, `ft:*`)  
2. Exact normalized model name  
3. Longest substring match  
4. Hugging Face serverless → $0  
5. `config.default_pricing`  
6. Hard fallback ($1.50 / $6.00 per 1M in/out)  

### `calculate_cost` extras

- Cached input tokens at reduced rate (provider-specific multipliers)  
- Cache write tokens  
- Batch API 50% discount when `is_batch`  
- Reasoning tokens where exposed  

### Overrides

- JSON file via `pricing_path` / `AUREX_PRICING_PATH`  
- Runtime `register_model_pricing(model, input, output)`  

**Why client-side cost:** Guards need immediate numbers. Backend recalculates if cost missing on ingest (drift risk acknowledged; company overrides exist server-side).

---

## 16. Outcomes (`mark_success` / `mark_failure`)

Token spend alone doesn’t tell you if the **task** succeeded.

**Decision:** Apps call `mark_success(workflow_id)` or `mark_failure(workflow_id, reason)` once per logical workflow.

These log synthetic events (`model: aurex-outcome`, `cost_type: outcome_signal`) used for cost-per-success metrics on the dashboard.

**Why separate from LLM events:** A workflow may involve ten LLM calls but one business outcome.

---

## 17. Provider resilience (retry & fallbacks)

*This is the largest recent feature; summarized here in plain English. See also sections 2–3 for principles.*

### The problem

1. **Hard failures** - timeouts, 429, 5xx (often not billed; manual retry costs money)  
2. **Soft failures** - HTTP 200 but empty/filtered/truncated/refused (**still billed**)  
3. **Manual reroute** - second provider call after failure (duplicate cost; invisible savings)  

### What we built

Opt-in `resilience` config on `AurexConfig`:

| Field | Default | Purpose |
| :--- | :--- | :--- |
| `enabled` | `false` | Master switch |
| `mode` | `observe` | `observe` = measure only; `enforce` = retry/fallback |
| `max_attempts` | `2` | Cap retry count |
| `max_extra_cost_usd` | `0.05` | Cap extra spend from retries |
| `timeout_ms` | `60000` | Per-attempt timeout |
| `retry_on` | list of kinds | Which failures may retry |
| `fallbacks` | `[]` | Ordered ladder |
| `idempotency` | `auto` | Conservative retry rules |
| `proof_window_pct` | `0` | Sample enforce behavior in observe for A/B proof |

### Classification

Every response or exception gets a **kind**: `success`, `timeout`, `429`, `5xx`, `network`, `empty`, `content_filter`, `truncated`, `refusal`, `tool_error`, …

Soft failures set `billed=true` and `cost_type=unfulfilled_spend`.

**Why classification module is separate (`resilience.py` / `resilience.ts`):** Testable without mocking OpenAI; shared by all providers.

### Observe vs enforce

| Mode | Calls provider | Changes behavior? |
| :--- | :--- | :--- |
| observe | Once | No - only extra telemetry + counterfactual `loss_avoided` |
| enforce | Up to `max_attempts` | Yes - retry/backoff/fallback within cost cap |

**Rollout path:** enable → observe → prove dashboard ROI → enforce.

### Fallbacks

```python
auditor.register_fallback("mini", call_fn, provider="openai", model="gpt-4o-mini")
```

**Why registration API:** Config stays JSON-serializable; callables use **customer** API keys. Aurex never proxies LLM traffic.

### Counterfactual accounting

- `projected_cost` - what a naive manual reroute would cost  
- `loss_avoided` - value recovered or preventable waste  

Backend dashboard: `billed_but_failed_cost`, `loss_avoided`, `recovery_rate`.

### Fail-open (again)

If resilience code bugs out → single raw provider call. If provider already failed → re-raise that error (never double-call in observe mode - we fixed this bug in Node and Python).

### Exceptions

- `AurexResilienceExhausted` - enforce mode, ladder exhausted  
- `AurexRecovered` - informational recovery signal  

---

## 18. Offline heuristics and CI gates

### `aurex audit` / `npx aurex ci`

Reads local `ledger.jsonl` **without** network. Detects:

- System prompt waste (repeated hashes)  
- Agent loops (context doubling)  
- Expensive model on simple prompts  
- Context explosion  

Outputs a **credit score** (100 − waste%) and ranked issues.

**Why offline:** CI and air-gapped environments; same rules as runtime heuristics but batch analysis.

### CI flags

- `--fail-under`, `--max-waste-usd`, `--mode block` - fail pipeline on policy breach  

**Decision:** Default CI mode is `warn` (exit 0) so adoption doesn’t break builds on day one.

---

## 19. Python vs Node parity

| Area | Python | Node |
| :--- | :--- | :--- |
| Singleton | `AurexAuditor()` | `getInstance()` |
| Context | `contextvars` | `AsyncLocalStorage` |
| Worker | `threading` daemon | `setInterval` + async flush |
| Config keys | snake_case | camelCase (+ accepts snake for resilience) |
| Sync path | sync + async executors | Promise-native |
| Tests | `pytest` in `sdk/python` | vitest in `frontend/tests/unit` |

**Known minor differences:** Python has `storage_mode` memory fallback; Node uses `storageMode`. Google patch is Python-only today.

---

## 20. Backend architecture

FastAPI app at `/api/v1` with routers:

| Router | Role |
| :--- | :--- |
| `ledger.py` | Canonical SDK ingest `POST /ledger/events` |
| `keys.py` | Project API keys (`aux_*`, scopes, rotation) |
| `projects.py` | Multi-tenant projects |
| `dashboard.py` | JWT-scoped overview, events, SSE |
| `escalations.py` | SDK loop/budget escalations |
| `savings.py` | Savings realization |
| `routes.py` | Legacy audit upload, insights, analytics |

**Decision:** New SDK traffic uses `/ledger/events`; legacy `/sdk/events` and CSV upload paths remain for backward compatibility.

---

## 21. Two ways events enter the database

### Modern path (SDK live telemetry)

`POST /api/v1/ledger/events`

- Auth: API key with `ledger:write` scope  
- Project id from key - **never trust body**  
- Batch up to 500 events  
- Rate limit ~600 events/minute per key  
- Sets `LLMEvent.project_id`  

### Legacy path

`POST /api/v1/sdk/events` and CSV audit upload

- Tied to `AuditSession` and email-scoped access  
- Smaller batches; different session model  

**Why both exist:** Early product was CSV audit-first; SDK cloud sync came later. Migrating customers gradually avoids breaking old integrations.

### Ingest service (`services/ledger.py`)

- Per-event try/except - one bad row doesn’t reject batch  
- Server calculates cost if client omitted it  
- Maps resilience fields to columns + metadata  
- Optional Pub/Sub publish for realtime dashboard  

---

## 22. Authentication and multi-tenancy

### Auth modes

1. **JWT** - dashboard users (OTP email / Google OAuth)  
2. **API key** - SDK (`aux_*` Argon2; legacy `ax_live_*` SHA-256)  
3. **Hybrid** - some routes accept either  

### Security decisions (from security remediation work)

- Default JWT secret blocked in production startup  
- Company access checks use exact domain match (not substring - IDOR fix)  
- OTP: disposable email blocklist, rate limits  
- API key revocation cached in Redis with in-process fallback when Redis absent  
- Keys with `scopes=null` grandfathered (backward compat)  

### Multi-tenant scoping

Dashboard queries filter by `project_id` from JWT or org membership. SDK events bind to project via API key.

**Why project-scoped keys:** Team A must never see Team B telemetry (Profile D).

---

## 23. Dashboard and analytics

### Overview metrics (7-day window)

- Spend, success/failure counts, retry rate  
- Model and workflow breakdowns  
- **Reliability:** `billed_but_failed_cost`, `loss_avoided`, `recovery_rate`  

### Savings timeline

Categories include `reliability_savings` separate from `runaway_loop`, `expensive_model_misuse`, etc.

**Why split categories:** Different fixes - reliability needs fallbacks; misuse needs downgrade rules.

### Realtime SSE

Polls DB every ~5s (Pub/Sub optional). Honest limitation: not true push unless infra wired.

### Analytics side channel

`analytics_events.jsonl` + optional BigQuery for product analytics (CTA clicks, uploads). Separate from customer LLM ledger.

---

## 24. Audit upload vs live SDK telemetry

| | CSV / JSON audit upload | Live SDK sync |
| :--- | :--- | :--- |
| **Source** | Exported logs, batch files | Running app |
| **Engine** | `EnhancedDetectionEngine` (7 analyzers) | Runtime guards + resilience |
| **Session model** | `AuditSession` per upload | Continuous `LLMEvent` stream |
| **Use case** | Quarterly waste review | Real-time ops + CI |

**Decision:** Keep audit upload for prospects who can’t install SDK day one; SDK is the long-term control plane.

---

## 25. Frontend decisions

### App structure (Next.js App Router)

- Marketing: `/`, `/book`, legal  
- Docs: `/docs/**` split into small pages  
- Audit funnel: `/audit`  
- Product app: `/app/**` (JWT required)  

### API client

Single `NEXT_PUBLIC_API_URL`; JWT in localStorage; typed interfaces mirroring backend DTOs.

### Theme

Dark-first **oklch** semantic tokens (`--shell`, `--surface`, …). Recent work **lightened** near-black backgrounds for readability - cosmetic, not structural.

### Docs as product

Dual Python/Node code blocks; `/llms.txt` agent routing table; reliability docs mirror SDK behavior.

### Testimonials / savings UX

ROI figures updated to conservative numbers ($650/mo) - marketing honesty decision, not SDK logic.

---

## 26. Documentation structure (agent-optimized)

### Problem we solved

One 890-line reference page caused **context rot** for AI agents - too much irrelevant text per task.

### Solution

- **One concern per URL** (~200 lines max per page)  
- **Hub pages** are indexes only (`/docs/reference`, `/docs/reliability`, `/docs/deployment`)  
- **`/llms.txt`** maps task → single URL  
- **Agent hint banner** on every page  
- **`DocHashRedirect`** maps old `#anchors` to new routes  

### Two “resilience” doc families

| Docs | Meaning |
| :--- | :--- |
| `/docs/deployment/cloud-sync` | HTTP upload retries, 429, flush |
| `/docs/reliability/*` | Provider retry, fallbacks, loss accounting |

**Why:** Agents were conflating `sync_max_retries` with `resilience.enabled`.

---

## 27. Decision timeline (from project history)

Approximate evolution on branch `aa` (newest first):

| Commit theme | Decision embodied |
| :--- | :--- |
| Provider resilience + agent docs | Observe/enforce, loss accounting, doc sub-pages, `reason.md` |
| SDK cloud hardening + softer UI | `flushAndWait`, ledger fallbacks, rate limits, theme tokens |
| Dynamic pricing + Hugging Face | `register_model_pricing`, HF patch, wildcard pricing |
| Security remediations | Auth hardening, IDOR fixes, key scopes |
| Dashboard / profile | JWT app shell, project scoping |
| Auth integration | OTP/Google, multi-tenant bootstrap |
| Brand Lumina → Aurex | Single product name across CLI and UI |
| LiteLLM pricing + SDK parity | Universal router support |

**Meta-decision:** Ship **additive** features behind flags; never break existing ledger or ingest shapes without migration.

---

## 28. Rollback and deployment checklist

### Disable provider resilience instantly

```python
AurexConfig(resilience={"enabled": False})
```

### Disable cloud sync only

```python
AurexConfig(cloud_sync=False)  # or local_only=True
```

### Backend migrations

1. `migrate_001_extend_event_schema` (if needed) - status, latency, finish_reason, …  
2. `migrate_002_reliability_fields` - projected_cost, recovery_provider, attempt_index  

### Serverless checklist

- `AUREX_LEDGER_PATH=/tmp/.aurex/ledger.jsonl`  
- `per_process_ledger=true` for multi-worker  
- `await flushAndWait()` before handler return  

---

## 29. Known limitations and honest gaps

| Gap | Impact | Mitigation today |
| :--- | :--- | :--- |
| Classifier heuristics | May mis-label unusual provider responses | `classify_response_override` hook |
| Client vs server pricing drift | Cost may differ slightly | Backend recalculates on ingest; company overrides |
| Two tenancy models | Legacy sessions vs project keys | Docs + gradual migration |
| Dashboard UI lag | Not all API metrics have widgets | API ready first |
| Google patch Node missing | Node apps using Gemini natively | Use LiteLLM or Python SDK |
| `llms.txt` manual sync with nav | Drift possible | Comment in both files; optional codegen later |
| SSE not true push | 5s poll latency | Acceptable for MVP dashboard |
| Counterfactual is estimated | Not invoice-grade | Proof-window sampling; directional ROI only |

---

## 30. File index

### SDK Python (`sdk/python/aurex_sdk/`)

| File | Role |
| :--- | :--- |
| `auditor.py` | Singleton orchestrator, patch, wrap, guards, log_event |
| `resilience.py` | Classify, retry, fallback, counterfactual math |
| `decisions.py` | Decision types, apply to call params |
| `ledger_utils.py` | Path resolution, writable probes, fallbacks |
| `cloud_sync.py` | HTTP batch upload with retries |
| `hook.py` | Auto-hook on import |
| `heuristics.py` | Offline audit engine |
| `cli.py` | install-hook, audit, ci |
| `semantic.py` | Jaccard similarity for loops/cache |
| `exceptions.py` | Typed errors |

### SDK Node (`sdk/node/src/`)

| File | Role |
| :--- | :--- |
| `index.ts` | Main auditor, patch, wrap, sync |
| `resilience.ts` | Parity resilience module |
| `cloud_sync.ts` | HTTP retry |
| `ledger_utils.ts` | Path + fallback |
| `hook.ts` | Auto-hook |
| `exceptions.ts` | Typed errors |

### Backend (`backend/src/`)

| Area | Role |
| :--- | :--- |
| `api/ledger.py` | v1 ingest route |
| `services/ledger.py` | Persist events |
| `models/llm_event.py` | Schema + enums |
| `api/dashboard.py` | Overview + reliability metrics |
| `api/routes.py` | Legacy audit + savings timeline |
| `api/auth.py` | JWT + API keys |
| `scripts/migrate_002_*.py` | DB migration |

### Docs (`frontend/`)

| Path | Role |
| :--- | :--- |
| `app/docs/**` | Split documentation pages |
| `public/llms.txt` | Agent routing table |
| `components/docs/*` | DocPageShell, nav, hash redirect |

---

## How to read this document

- **Integrating the SDK?** Start with [§6 Three ways to integrate](#6-three-ways-to-integrate) and [§9 step by step](#9-what-happens-on-every-llm-call-step-by-step).  
- **Debugging missing events?** [§13 Local ledger](#13-the-local-ledger) and [§14 Cloud sync](#14-cloud-sync-sdk--backend).  
- **Turning on retry/fallback?** [§17 Provider resilience](#17-provider-resilience-retry--fallbacks) - start in **observe** mode.  
- **AI agent loading docs?** `/llms.txt` first, then **one** sub-page URL per task.  
- **Changing ingest schema?** [§21 Two ways events enter](#21-two-ways-events-enter-the-database) and migration scripts.

---

*Last updated to reflect branch `aa` through commit `17779a9` (SDK resilience, loss accounting, agent-optimized docs). Update this file when you change invariants, defaults, or public contracts.*
