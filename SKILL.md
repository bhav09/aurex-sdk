---
name: aurex-platform
description: >
  Use this skill whenever working on the Aurex platform (heyaurex.com) — its SDK,
  website, docs, backend, or any feature across the four pillars (LoopGuard,
  PromptIQ, CascadeRouter, ProviderShield). Covers the current production
  implementation, all Phase 1 modifications, architectural constraints, data-privacy
  invariants, and engineering conventions. Trigger on any task that touches the
  Aurex codebase, product copy, SDK API surface, ledger format, detection
  heuristics, pricing, docs, CI/CD gates, or cloud control plane.
version: 1.0.0
status: active
phase: phase-1-in-progress
last-updated: 2026-06-04
authors: [aakriti, bhavishya]
---

# Aurex Platform — Engineering Skill

## 1. North Star and Positioning

Aurex is a **token waste prevention platform**. It sits in-process between
application code and LLM provider APIs, intercepting and preventing the four
root causes of AI token waste before a single wasted token is billed. It is not
an observability tool. The mental model is:

> Helicone and Langfuse are the instrument panel — they show what happened.
> Aurex is the autopilot — it stops the bad thing from happening.

Every engineering decision must be evaluated against this positioning. If a
proposed feature only illuminates waste after the fact, it belongs in the
observability export layer (OpenTelemetry), not in the prevention core.

### The Four Pillars

The entire product surface is organised into four named capabilities. Use these
names consistently in code, docs, config keys, error messages, and marketing
copy — they are the product vocabulary.

| Pillar | Responsibility | Status (Phase 1) |
|---|---|---|
| **LoopGuard** | Detect and break agent runaway loops before they burn tokens | Upgrade required (see §6.1) |
| **PromptIQ** | Detect prompt bloat, drift, CoT inflation, caching gaps | Partial — extend (see §6.2) |
| **CascadeRouter** | Route queries cheap-first; escalate only on quality failure | Planned Phase 2 |
| **ProviderShield** | Circuit breakers, fallback chains, provider resilience | Partial — extend (see §6.3) |

---

## 2. Repository Structure (Current)

```
aurex/
├── sdk/                        # Python SDK (primary deliverable)
│   ├── aurex_sdk/
│   │   ├── __init__.py         # Public API surface — treat as contract
│   │   ├── client.py           # AurexClient — wraps provider clients
│   │   ├── ledger.py           # Local JSONL ledger writer
│   │   ├── heuristics/
│   │   │   ├── loop_guard.py   # LoopGuard detection (upgrade target)
│   │   │   ├── prompt_iq.py    # PromptIQ detection (extend target)
│   │   │   └── budget.py       # BudgetGuard spend limits
│   │   ├── hooks/
│   │   │   ├── openai_hook.py  # patch_openai() — only provider today
│   │   │   └── base_hook.py    # AbstractHook — all providers must extend
│   │   ├── scoring/
│   │   │   └── credit_score.py # Token Credit Score calculation
│   │   └── config.py           # AurexConfig dataclass
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── benchmarks/         # F1 benchmarks for LoopGuard
│   ├── pyproject.toml
│   └── README.md
├── cloud/                      # Cloud control plane (FastAPI)
│   ├── api/
│   ├── db/                     # ClickHouse for telemetry
│   └── rules/                  # Compiled rule bundles pushed to SDKs
├── web/                        # heyaurex.com (Next.js)
│   ├── app/
│   │   ├── page.tsx            # Homepage
│   │   ├── docs/               # /docs route
│   │   ├── audit/              # /audit route (Phase 1: deprioritise)
│   │   └── pricing/
│   └── components/
├── ci/
│   ├── budget-gate.yml         # GitHub Actions token score gate
│   └── benchmark.yml           # LoopGuard F1 regression test
└── SKILL.md                    # This file
```

### Critical invariants for this structure

The `sdk/aurex_sdk/__init__.py` file is a **public contract**. Any symbol
exported from it is semver-governed. Never remove or rename an exported symbol
in a patch or minor release. Internal modules under `heuristics/`, `hooks/`,
and `scoring/` are private — prefix with `_` if they must not be imported
directly by users.

The `cloud/rules/` directory contains compiled rule bundles (JSON) that the SDK
fetches asynchronously at startup and every five minutes. **No proprietary
detection logic lives in the SDK package in plain Python.** Complex rules are
compiled server-side and cached locally. This is the architectural moat — see
§4.

---

## 3. Current Production Implementation

### 3.1 SDK installation and auto-hook (current state)

```python
# Current — only OpenAI is auto-patched
from aurex_sdk import AurexClient, patch_openai

client = AurexClient(api_key="ax-...")
patch_openai(client)  # Wraps openai.OpenAI globally

# Manual instrumentation path (still supported for advanced users)
client.log_event(
    model="gpt-4o",
    prompt_tokens=1240,
    completion_tokens=380,
    cost_usd=0.0142,
    session_id="sess_abc123",
    workflow_id="customer-support-v2",
)
```

**Phase 1 change:** `patch_openai()` becomes `patch_all()`. See §6.3.

### 3.2 Local JSONL ledger format (current)

Each line is one LLM call event. The ledger file lives at
`~/.aurex/ledger.jsonl` by default, configurable via `AUREX_LEDGER_PATH`.

```jsonc
{
  "ts": "2026-06-04T09:12:33.441Z",      // ISO-8601 UTC
  "session_id": "sess_abc123",            // caller-supplied or auto-generated UUID
  "workflow_id": "customer-support-v2",  // groups calls into logical workflows
  "model": "gpt-4o",
  "provider": "openai",
  "prompt_tokens": 1240,
  "completion_tokens": 380,
  "total_tokens": 1620,
  "cost_usd": 0.014220,                  // calculated locally using price table
  "latency_ms": 1843,
  "prompt_hash": null,                   // Phase 1: add SHA-256 here (see §6.4)
  "similarity_score": null,              // Phase 1: add embedding score here
  "flags": [],                           // e.g. ["loop_detected", "prompt_bloat"]
  "token_credit_score": null,            // populated on ledger flush
  "metadata": {}                         // arbitrary caller-supplied KV pairs
}
```

**Never store raw prompt or completion text in the ledger.** This is a
non-negotiable privacy invariant. The ledger file must be inspectable by a
security auditor and contain zero PII or customer data. Violations of this rule
are treated as critical security bugs.

### 3.3 Detection heuristics (current)

#### LoopGuard (current — structural only)

The existing implementation triggers when context token count grows more than
2.5× across three or more consecutive queries in the same session. This is a
structural heuristic only. Academic benchmark: F1 ≈ 0.08. It catches obvious
runaway loops but misses fuzzy repetition — the agent rephrasing the same
failing tool call slightly differently each time.

```python
# Current heuristic in heuristics/loop_guard.py (simplified)
def check_loop(session_history: list[LedgerEntry]) -> bool:
    if len(session_history) < 3:
        return False
    baseline = session_history[0].total_tokens
    latest = session_history[-1].total_tokens
    return (latest / baseline) >= 2.5
```

#### PromptIQ (current — two heuristics)

**System prompt redundancy:** flags when the identical system prompt (matched
by token count + first-100-char prefix) appears in more than three consecutive
sessions without a `cache_control` header present in the request metadata.

**Context explosion:** flags when a single session's cumulative token count
exceeds 2× the session baseline established at the first call.

#### BudgetGuard (current — working well, keep as-is)

Hard spend ceiling enforced via `pre_call_check()`. If the projected cost of a
pending call would push the session over the configured `max_session_usd` or
the workflow over `max_workflow_usd`, the call is blocked and a
`BudgetExceededError` is raised before the API request fires.

```python
# Config example — keep this API stable
client = AurexClient(
    api_key="ax-...",
    config=AurexConfig(
        max_session_usd=0.50,
        max_workflow_usd=5.00,
        max_daily_usd=50.00,
        loop_guard_enabled=True,
        prompt_iq_enabled=True,
    )
)
```

### 3.4 Token Credit Score (current)

The score is a single integer 0–100 recalculated on every ledger flush (default
every 60 seconds or every 50 events, whichever comes first). Lower is worse.

Current formula weights:

| Signal | Weight | Direction |
|---|---|---|
| Loop events per 1,000 calls | 30% | Penalise |
| System prompt redundancy rate | 25% | Penalise |
| Expensive model misuse ratio | 25% | Penalise |
| Context explosion events | 20% | Penalise |

**Phase 1 change:** add prompt caching gap and CoT inflation as signals.
Rebalance weights. See §6.2.

### 3.5 CI/CD budget gate (current — keep, promote)

A GitHub Actions step reads the latest ledger snapshot and fails the build if
the Token Credit Score drops below the configured threshold. This feature is
underused and underpromoted. It is Aurex's most original capability.

```yaml
# ci/budget-gate.yml (current, keep as-is)
- name: Check token credit score
  run: |
    aurex score --fail-below 70 --ledger .aurex/ledger.jsonl
  env:
    AUREX_API_KEY: ${{ secrets.AUREX_API_KEY }}
```

### 3.6 Cloud sync (current — opt-in, keep default off)

When `cloud_sync=True` is set in `AurexConfig`, the SDK sends a stripped
telemetry payload to `api.heyaurex.com/v1/ingest` every flush cycle. The
payload contains only numeric metadata — token counts, latencies, costs,
flags, hashes — never raw text. This invariant is enforced at the serialiser
level: the `TelemetryPayload` Pydantic model has no `str` fields that could
accidentally carry prompt content.

```python
# cloud/api/models/telemetry.py — enforce at type level
class TelemetryPayload(BaseModel):
    session_id: UUID
    workflow_id: str
    model: str
    provider: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: Decimal
    latency_ms: int
    prompt_hash: str | None        # SHA-256, not text
    similarity_score: float | None # 0.0–1.0, not text
    flags: list[str]
    token_credit_score: int | None
    # NO str fields that could carry prompt content — enforce via validator
```

---

## 4. Architectural Invariants (Non-Negotiable)

These constraints must be satisfied by every feature in every phase. If a
proposed implementation violates any of these, stop and redesign before writing
code.

### 4.1 Zero raw-text egress

Raw prompt text and raw completion text must never leave the host machine
except via the Client-Side Encryption path (Phase 3). The SDK must never log,
serialize, hash, embed, or transmit prompt text in any readable form. The only
text-derived signals permitted in cloud payloads are SHA-256 hashes (which
cannot be reversed) and floating-point similarity scores (which contain no
lexical information).

**How to test this invariant:** run `strings ~/.aurex/ledger.jsonl | grep -v
"^\s*{" | head -50` and verify no human-readable prompt fragments appear.

### 4.2 Hot-path latency under 2ms

Every operation that executes synchronously in `pre_call_check()` must complete
in under 2ms on a standard developer laptop (M-series Mac or equivalent x86).
This means: no synchronous HTTP calls, no disk reads (ledger writes are async),
no embedding model inference in the hot path.

The rule lookup that powers LoopGuard and PromptIQ runs against a compiled rule
bundle cached in memory. The bundle is refreshed asynchronously by a background
thread. The hot-path check is a dictionary lookup and a few arithmetic
comparisons — always sub-millisecond.

**How to enforce:** the benchmark suite in `tests/benchmarks/` includes a
`test_pre_call_latency` test that measures P99 latency over 10,000 simulated
calls and fails if P99 exceeds 2ms.

### 4.3 Open-source SDK, cloud-tethered intelligence

The SDK package must be 100% open-source and readable. Security and compliance
teams at enterprise customers will audit the source before approving
installation. An obfuscated binary would fail that audit.

However, proprietary detection logic — the semantic similarity thresholds,
the trained routing classifier weights, the compiled regex patterns — must live
in the cloud rule bundles, not in the SDK source. The SDK contains only the
evaluation engine (how to apply a rule) not the rules themselves (what the
thresholds are). This keeps the SDK auditable and the intelligence proprietary.

Think of it as: the SDK is the CPU, the rule bundles are the compiled
program. You can read the CPU manual (SDK source) but the program
(rule bundle) is what gives it its specific behaviour.

### 4.4 Semver and backwards compatibility

The SDK follows strict semantic versioning. The public API surface (everything
in `__init__.py`) is governed by this contract:

- **Patch** (0.0.x): bug fixes only, no API changes.
- **Minor** (0.x.0): new features, backwards-compatible. Existing configs must
  continue to work unchanged.
- **Major** (x.0.0): breaking changes. Requires deprecation notice in two prior
  minor releases and a migration guide.

Config keys are especially sensitive — never rename a config key in a minor
release. If a new name is better, add it as an alias and deprecate the old one
with a warning for two minor versions before removing it.

### 4.5 Fail open, never fail closed

If the Aurex SDK encounters an error — network timeout fetching rule bundles,
malformed ledger, unexpected exception in a heuristic — it must log the error
and allow the underlying LLM call to proceed normally. Aurex must never be the
reason an AI feature goes down. BudgetGuard is the only exception: if the SDK
cannot determine whether a spend limit would be exceeded (e.g., the price table
is stale beyond 24 hours), it raises a `StaleConfigWarning` but still allows
the call unless `strict_budget=True` is explicitly set.

---

## 5. What to Remove — Phase 1

These items actively harm positioning, conversion, or developer trust. Removing
them is as important as adding new features.

### 5.1 Remove: "Audit Edition" framing everywhere

The phrase "Audit Edition" appears in the pricing tier name, the free-tier
description, the `/audit` route CTA, and the docs overview. Replace with
"Developer" tier throughout. The audit metaphor positions Aurex as a log
analyser, not a prevention platform.

Files to update: `web/app/page.tsx` (hero, pricing section), `web/app/docs/
page.tsx` (overview paragraph), `web/components/PricingCard.tsx`, and any
string literals in `sdk/README.md`.

### 5.2 Remove: 1-audit-per-month hard cap on the free tier

The current free tier gate (`max_audits_per_month=1` in the cloud entitlements
table) prevents developers from experiencing the SDK's real-time prevention
capabilities. A developer who installs the SDK, runs it once, and hits a cap
will churn immediately. Remove the cap. The free tier is now unlimited local
SDK with all four heuristics running locally, no cloud sync required, no
account needed for the first 30 days.

File to update: `cloud/api/entitlements.py` — set `free_tier_local_unlimited=
True`. The rate limit on cloud sync (telemetry ingest) remains at 10K events/
month on the free tier to protect infrastructure costs.

### 5.3 Remove: "Upload. Analyze. Optimize." flow as primary CTA

The drag-and-drop log upload flow on the homepage teaches users the wrong mental
model — that Aurex is a batch log analyser rather than a live in-process
interceptor. Deprioritise this to a secondary "advanced" path under docs. The
primary homepage CTA becomes SDK installation.

The upload flow itself can remain in `web/app/audit/` for users who genuinely
want to analyse historical logs. It just must not be the hero action.

### 5.4 Remove: "$500/month + 10% of realized savings" pricing model

The success-fee component creates friction and distrust. "Realized savings" is
hard to audit from the customer's perspective and creates a perverse incentive
where customers might feel Aurex is motivated to over-report waste. Replace with
flat-rate pricing: Developer (free), Team ($299/month), Enterprise (custom).
File to update: `web/app/pricing/page.tsx` and `web/components/PricingCard.tsx`.

### 5.5 Remove: Generic "100% usage transparency" and "100% control" stat badges

These claims are indistinguishable from Helicone and Langfuse's messaging. They
must be replaced with specific, differentiated statistics derived from the
research literature. See §7 for the replacement copy.

---

## 6. What to Modify — Phase 1

### 6.1 Upgrade: LoopGuard — structural to hybrid detection

**Current state:** structural heuristic only, F1 ≈ 0.08.
**Target state:** hybrid structural + semantic, F1 ≈ 0.72 (per arXiv:2511.10650).

The upgrade adds a second detection layer alongside the existing structural
check. The semantic layer computes cosine similarity between consecutive tool
call argument vectors using a local embedding model (`all-MiniLM-L6-v2` running
in ONNX Runtime). Crucially, the embedding model runs locally and only the
similarity score (a float) is stored in the ledger — never the tool call text.

```python
# sdk/aurex_sdk/heuristics/loop_guard.py — upgraded implementation

from __future__ import annotations
import hashlib
import time
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

from aurex_sdk._onnx import get_embedding_model  # lazy-loaded, cached


@dataclass
class LoopGuardConfig:
    # Structural layer
    structural_window: int = 3          # consecutive calls to inspect
    context_growth_threshold: float = 2.5

    # Semantic layer
    semantic_enabled: bool = True
    similarity_threshold: float = 0.92  # cosine sim above this = loop
    semantic_window: int = 5            # sliding window for fuzzy detection

    # Circuit breaker
    cooldown_seconds: int = 30          # pause after loop detected


@dataclass
class LoopGuardState:
    """Per-session mutable state. Lives in memory, never persisted."""
    call_hashes: list[str] = field(default_factory=list)
    similarity_scores: list[float] = field(default_factory=list)
    last_trip_ts: float = 0.0


class LoopGuard:
    def __init__(self, config: LoopGuardConfig):
        self.config = config
        self._sessions: dict[str, LoopGuardState] = {}

    def check(
        self,
        session_id: str,
        tool_call_args: str | None,  # raw JSON string of tool call arguments
        context_tokens: int,
        baseline_tokens: int,
    ) -> tuple[bool, str | None]:
        """
        Returns (is_loop, reason_code).
        Must complete in under 0.5ms to stay within hot-path budget.

        Note: tool_call_args is used only for hash/embedding — never stored.
        """
        state = self._sessions.setdefault(session_id, LoopGuardState())

        # Cooldown gate — if we tripped recently, stay tripped
        if time.time() - state.last_trip_ts < self.config.cooldown_seconds:
            return True, "loop_cooldown"

        # --- Layer 1: Structural (exact hash matching) ---
        if tool_call_args is not None:
            call_hash = hashlib.sha256(tool_call_args.encode()).hexdigest()[:16]
            state.call_hashes.append(call_hash)

            window = state.call_hashes[-self.config.structural_window:]
            if len(window) == self.config.structural_window and len(set(window)) == 1:
                state.last_trip_ts = time.time()
                return True, "structural_exact_repeat"

        # --- Layer 2: Structural context growth ---
        if baseline_tokens > 0:
            growth = context_tokens / baseline_tokens
            if growth >= self.config.context_growth_threshold:
                state.last_trip_ts = time.time()
                return True, "structural_context_explosion"

        # --- Layer 3: Semantic fuzzy detection ---
        if self.config.semantic_enabled and tool_call_args is not None:
            model = get_embedding_model()  # cached ONNX session, <0.1ms after warm
            # Embedding runs locally; only the score is kept, not the text
            score = model.similarity_to_recent(
                tool_call_args,
                state,
                window=self.config.semantic_window,
            )
            if score is not None:
                state.similarity_scores.append(score)
                if score >= self.config.similarity_threshold:
                    state.last_trip_ts = time.time()
                    return True, "semantic_fuzzy_repeat"

        return False, None

    def reset_session(self, session_id: str) -> None:
        """Call this when a session legitimately completes."""
        self._sessions.pop(session_id, None)
```

**Testing requirement:** the upgraded LoopGuard must be benchmarked against the
arXiv:2511.10650 test suite. Add `tests/benchmarks/test_loop_guard_f1.py` that
loads the published dataset and asserts F1 ≥ 0.70 (a 5% margin below the 0.72
target). This benchmark runs in CI on every PR that touches `loop_guard.py`.

### 6.2 Extend: PromptIQ — add drift tracking, CoT flagging, caching detection

Three new signals to add in Phase 1, each addressable independently.

#### Signal A — Prompt length drift tracking

Track system prompt token count as a time series keyed by `workflow_id`.
Flag when any workflow's median system prompt token count has grown more than
20% over a 7-day rolling window. This catches the "500 tokens → 2,000 tokens
silently over months" pattern.

```python
# sdk/aurex_sdk/heuristics/prompt_iq.py — add to existing class

def check_prompt_drift(
    self,
    workflow_id: str,
    system_prompt_tokens: int,
    event_ts: datetime,
) -> bool:
    """
    Returns True if the workflow's system prompt has grown >20% over 7 days.
    History is stored in the local ledger; this reads from the rolling cache.
    """
    history = self._drift_cache.get(workflow_id, [])
    history.append((event_ts, system_prompt_tokens))

    # Retain only the last 7 days
    cutoff = event_ts - timedelta(days=7)
    history = [(ts, tokens) for ts, tokens in history if ts >= cutoff]
    self._drift_cache[workflow_id] = history

    if len(history) < 10:  # Need enough samples to detect a trend
        return False

    earliest_median = np.median([t for _, t in history[:5]])
    latest_median = np.median([t for _, t in history[-5:]])

    if earliest_median == 0:
        return False

    growth_ratio = latest_median / earliest_median
    return growth_ratio >= 1.20  # 20% growth threshold
```

#### Signal B — Chain-of-thought token inflation detection

Detect when a response's completion contains reasoning token metadata (currently
available via the `usage.completion_tokens_details.reasoning_tokens` field in
OpenAI's API response and `usage.thinking_tokens` in Anthropic's). Calculate
the cost uplift from reasoning tokens vs a hypothetical direct-answer call.

```python
def check_cot_inflation(
    self,
    reasoning_tokens: int,
    completion_tokens: int,
    cost_usd: Decimal,
    model: str,
) -> dict | None:
    """
    Returns a flag dict if reasoning tokens represent >40% of completion cost,
    suggesting the caller may not need extended thinking mode for this query.
    Returns None if no inflation detected.
    """
    if reasoning_tokens == 0:
        return None

    reasoning_ratio = reasoning_tokens / max(completion_tokens, 1)
    if reasoning_ratio < 0.40:
        return None

    # Estimate cost of reasoning tokens (typically 1x input rate, billed as output)
    price_per_token = get_model_output_price(model)
    reasoning_cost = Decimal(str(reasoning_tokens * price_per_token))

    return {
        "flag": "cot_inflation",
        "reasoning_tokens": reasoning_tokens,
        "reasoning_ratio": round(reasoning_ratio, 3),
        "estimated_reasoning_cost_usd": float(reasoning_cost),
        "suggestion": "Consider using standard completion mode for this query type.",
    }
```

#### Signal C — Prompt caching opportunity detection

Flag calls where the system prompt is identical across sessions (matched by
token count + SHA-256 hash) and the provider supports prompt caching but no
cache header was sent. Calculate the monthly savings at the provider's cached
rate.

```python
def check_cache_opportunity(
    self,
    prompt_hash: str,
    system_prompt_tokens: int,
    provider: str,
    has_cache_header: bool,
    calls_last_30d: int,  # how many times this hash appeared in ledger
) -> dict | None:
    """
    Returns a saving opportunity dict if caching would help, None otherwise.
    Providers that support prompt caching: anthropic (10% of input rate),
    openai (50% discount on cached input tokens), google (75% discount).
    """
    CACHE_RATES = {
        "anthropic": 0.10,   # pay 10% of normal input rate
        "openai": 0.50,      # pay 50% of normal input rate
        "google": 0.25,      # pay 25% of normal input rate
    }
    if provider not in CACHE_RATES or has_cache_header:
        return None
    if calls_last_30d < 5:  # not worth flagging low-frequency prompts
        return None

    normal_cost = get_model_input_price(provider) * system_prompt_tokens
    cached_cost = normal_cost * CACHE_RATES[provider]
    saving_per_call = normal_cost - cached_cost
    monthly_saving = saving_per_call * calls_last_30d

    if monthly_saving < 0.10:  # ignore trivial savings
        return None

    return {
        "flag": "cache_opportunity",
        "prompt_hash": prompt_hash,
        "monthly_saving_usd": round(float(monthly_saving), 2),
        "provider": provider,
        "suggestion": f"Add cache_control header to this system prompt. "
                      f"Estimated saving: ${monthly_saving:.2f}/month.",
    }
```

### 6.3 Extend: ProviderShield — expand patch_all() to all providers

The current `patch_openai()` only wraps the `openai.OpenAI` client. Phase 1
adds `patch_all()` which auto-detects installed provider libraries and patches
each one.

```python
# sdk/aurex_sdk/hooks/__init__.py

def patch_all(client: AurexClient) -> dict[str, bool]:
    """
    Auto-detect and patch all installed LLM provider clients.
    Returns a dict of {provider_name: was_patched}.
    Safe to call multiple times — idempotent.

    Supported providers: openai, anthropic, google-generativeai, litellm,
    mistralai, cohere, together, fireworks.
    """
    patched = {}

    _try_patch("openai", _patch_openai, client, patched)
    _try_patch("anthropic", _patch_anthropic, client, patched)
    _try_patch("google.generativeai", _patch_google, client, patched)
    _try_patch("litellm", _patch_litellm, client, patched)
    _try_patch("mistralai", _patch_mistral, client, patched)

    if not any(patched.values()):
        import warnings
        warnings.warn(
            "aurex.patch_all() found no supported LLM libraries installed. "
            "Install openai, anthropic, or another supported library first.",
            stacklevel=2,
        )

    return patched


def _try_patch(
    module_name: str,
    patch_fn: callable,
    client: AurexClient,
    result: dict,
) -> None:
    try:
        import importlib
        importlib.import_module(module_name)
        patch_fn(client)
        result[module_name] = True
    except ImportError:
        result[module_name] = False
    except Exception as e:
        import logging
        logging.getLogger("aurex").warning(
            f"Failed to patch {module_name}: {e}. "
            f"LLM calls will proceed normally without Aurex interception."
        )
        result[module_name] = False
```

Keep `patch_openai()` as a backwards-compatible alias — it must not be removed
in Phase 1. Deprecate with a `DeprecationWarning` pointing users to
`patch_all()`.

### 6.4 Modify: Ledger — add prompt_hash and similarity_score fields

Update the ledger schema to include the two new privacy-preserving fingerprints.
These are computed in the hook layer, never stored as text.

```python
# sdk/aurex_sdk/ledger.py — updated LedgerEntry

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
import hashlib


@dataclass
class LedgerEntry:
    # Identity
    ts: datetime
    session_id: str
    workflow_id: str

    # Model
    model: str
    provider: str

    # Tokens and cost — all computed locally
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int = 0    # Phase 1: new field
    total_tokens: int = 0        # computed: prompt + completion + reasoning
    cost_usd: Decimal = Decimal("0")

    # Performance
    latency_ms: int = 0

    # Privacy-preserving fingerprints — Phase 1: new fields
    prompt_hash: str | None = None          # SHA-256 of (system_prompt + user_message)
    similarity_score: float | None = None   # cosine sim vs previous call in session

    # Detection signals
    flags: list[str] = field(default_factory=list)
    has_cache_header: bool = False           # Phase 1: new field

    # Score
    token_credit_score: int | None = None

    # Caller-supplied
    metadata: dict = field(default_factory=dict)

    def __post_init__(self):
        self.total_tokens = self.prompt_tokens + self.completion_tokens + self.reasoning_tokens

    @staticmethod
    def compute_prompt_hash(system_prompt: str, user_message: str) -> str:
        """
        One-way hash. Cannot be reversed to recover prompt text.
        Used for: exact-duplicate detection, cache hit analysis, loop detection.
        """
        combined = f"{system_prompt}\x00{user_message}"
        return hashlib.sha256(combined.encode("utf-8")).hexdigest()
```

### 6.5 Modify: Token Credit Score — add new signals, rebalance weights

```python
# sdk/aurex_sdk/scoring/credit_score.py — updated weights

SCORE_WEIGHTS = {
    # Existing signals — rebalanced
    "loop_events_per_1k_calls":      0.25,  # was 0.30
    "system_prompt_redundancy_rate": 0.20,  # was 0.25
    "expensive_model_misuse_ratio":  0.20,  # was 0.25
    "context_explosion_events":      0.15,  # was 0.20

    # Phase 1: new signals
    "prompt_drift_flag":             0.10,  # 0 if no drift detected, 1 if yes
    "cot_inflation_ratio":           0.05,  # proportion of calls with CoT inflation
    "cache_gap_ratio":               0.05,  # proportion of cacheable calls without cache header
}
# Weights must sum to 1.0 — enforce with assertion in __init__
assert abs(sum(SCORE_WEIGHTS.values()) - 1.0) < 1e-9
```

---

## 7. What to Add — Phase 1 (New Surface Area)

### 7.1 Add: Homepage hero copy (web/app/page.tsx)

Replace the existing hero section content with the following copy. Do not alter
layout or component structure — only content strings.

**Eyebrow label:** `Token waste prevention platform`

**H1:** `Stop the token waste before it fires.`

**Subheadline:** `Helicone shows you what burned. Langfuse traces how it
happened. Aurex prevents it — an in-process SDK that detects loops, compresses
prompts, routes to cheaper models, and fails over between providers before a
single wasted token reaches your API bill.`

**Hero stats (replace the three existing vague badges):**

| Stat | Source |
|---|---|
| F1 0.72 loop detection accuracy | arXiv:2511.10650 |
| Up to 20× prompt compression | Microsoft LLMLingua-2 |
| Up to 98% cost reduction via cascade routing | Stanford FrugalGPT |

**Primary CTA:** `Install SDK free` → links to `/docs#quickstart`
**Secondary CTA:** `See how it works` → smooth-scrolls to the four-pillar section

### 7.2 Add: Four-pillar feature section (replace "Smart auditing" section)

The three-item value prop grid (Cost Savings, Visibility, Control) must be
replaced with a four-pillar grid. Each pillar card contains: pillar name,
one-sentence mechanism description, one concrete outcome stat, and a link to
the pillar's dedicated docs page.

| Pillar | Mechanism line | Outcome stat |
|---|---|---|
| LoopGuard | Hybrid structural + semantic cycle detection catches runaway agents before they burn tokens | F1: 0.72 vs 0.08 for naive step limits |
| PromptIQ | Detects prompt bloat drift, chain-of-thought inflation, and missed caching opportunities before the call fires | Flags $60/day in prompt drift on a typical RAG pipeline |
| CascadeRouter | Routes to the cheapest model that can handle the query; escalates only when quality fails | Up to 98% cost reduction (Stanford FrugalGPT) |
| ProviderShield | Scoped circuit breakers and automatic fallback chains, in-process, zero network hop | No latency penalty vs 20–80ms for external gateways |

### 7.3 Add: Docs quickstart section (/docs#quickstart)

The docs page currently leads with conceptual overview. Add a quickstart block
at the top that gets a developer from zero to first detection in under two
minutes.

```python
# Step 1: Install
# pip install aurex-sdk

# Step 2: Initialise and auto-patch all providers
from aurex_sdk import AurexClient, patch_all

client = AurexClient(api_key="ax-...")  # or set AUREX_API_KEY env var
patch_all(client)

# Step 3: Use your LLM library exactly as before — Aurex intercepts automatically
import openai
response = openai.OpenAI().chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain quantum entanglement."}]
)

# Step 4: Check your Token Credit Score
score = client.score()
print(f"Token Credit Score: {score.value}/100")
# => Token Credit Score: 84/100
# => Flags: ['cache_opportunity: $12.40/month saving on system prompt']
```

After the quickstart, add a note explaining that no data leaves the machine
by default. Cloud sync is opt-in. The ledger file at `~/.aurex/ledger.jsonl`
is human-readable JSON and can be inspected at any time.

### 7.4 Add: Pricing tier rename and restructure

Update all pricing components to reflect the new tier structure. The mapping is:

| Old name | New name | Key change |
|---|---|---|
| Audit Edition | Developer | Unlimited local SDK, no cap |
| Control Plan | Team | Flat $299/month, no success fee |
| Enterprise | Enterprise | Unchanged, add CSE callout |

On the Team tier, add explicit pillar-by-pillar feature gating so buyers know
exactly what they get:

```
Developer (free):
  ✓ LoopGuard (local heuristics)
  ✓ PromptIQ (local heuristics)
  ✓ BudgetGuard (hard spend limits)
  ✓ patch_all() auto-hook
  ✓ Local JSONL ledger, unlimited events
  ✓ Token Credit Score (local)
  ✓ CI/CD budget gate
  — Cloud dashboard
  — CascadeRouter
  — ProviderShield circuit breakers
  — Team governance
  — OTel export

Team ($299/month):
  ✓ Everything in Developer
  ✓ Cloud dashboard with trace trees
  ✓ CascadeRouter (Phase 2)
  ✓ ProviderShield circuit breakers
  ✓ Team cost governance
  ✓ OpenTelemetry export
  ✓ Slack/email alerts
  ✓ Priority support
```

### 7.5 Add: /changelog page

Create `web/app/changelog/page.tsx`. Ship at least three entries on launch:
Phase 1 LoopGuard upgrade (F1 0.08 → 0.72), `patch_all()` multi-provider
support, and prompt caching opportunity detection. Update with every release.
A public changelog signals active development — it is one of the most effective
trust signals for developer tools.

### 7.6 Add: Research backing section (homepage)

Add a section between the four-pillar grid and the case study. Title:
`Built on peer-reviewed research`. Three rows, each with: paper name,
institution, key finding, and a link to the arXiv or ACL page.

| Paper | Institution | Finding |
|---|---|---|
| FrugalGPT | Stanford University | Cascade routing achieves up to 98% cost reduction at matched accuracy |
| LLMLingua-2 | Microsoft Research | Token classification compression runs 3–6× faster with minimal quality loss |
| Unsupervised Cycle Detection in Agentic Applications | arXiv:2511.10650 | Hybrid structural + semantic detection achieves F1 0.72 vs 0.08 for structural-only |

This section exists to establish credibility through intellectual honesty. Aurex
is not claiming to have invented these techniques — it is claiming to be the
product that packages them into a single in-process SDK. That framing is more
credible, not less.

---

## 8. Testing Standards

### 8.1 Unit tests

Every heuristic function must have unit tests covering: the true-positive case
(waste correctly detected), the false-positive case (legitimate usage not
flagged), the edge case (empty session, single call, zero tokens), and the
boundary case (exactly at the threshold vs one below).

Use `pytest` with `pytest-benchmark` for any function that runs in the hot path.

```python
# tests/unit/test_loop_guard.py — example structure

def test_structural_exact_repeat_detected():
    """Three identical tool call hashes in a row should trip the breaker."""
    ...

def test_structural_no_false_positive_on_legitimate_long_session():
    """A session with 100 diverse tool calls should never trip."""
    ...

def test_semantic_fuzzy_repeat_detected():
    """Tool calls with 0.95 cosine similarity should trip the semantic layer."""
    ...

def test_cooldown_prevents_double_trip():
    """A second trip within the cooldown window should not fire a new event."""
    ...

def test_hot_path_latency_under_2ms(benchmark):
    """P99 latency of check() must stay under 2ms."""
    result = benchmark(loop_guard.check, session_id="s1", ...)
    assert result.stats["max"] < 0.002  # 2ms in seconds
```

### 8.2 Integration tests

Integration tests run against a live provider using a test API key from
environment variables. They are tagged `@pytest.mark.integration` and excluded
from CI unless the `AUREX_RUN_INTEGRATION` env var is set. They test: end-to-
end hook interception, ledger write, cloud sync payload (mocked server), and
score calculation.

### 8.3 F1 benchmark (LoopGuard)

The LoopGuard F1 benchmark is a first-class CI job, not an optional test. It
runs on every PR touching `loop_guard.py` and on every release. Failure
threshold: F1 < 0.70. If a code change causes F1 to drop below 0.70, the PR
is blocked.

```yaml
# ci/benchmark.yml
name: LoopGuard F1 Benchmark
on:
  pull_request:
    paths: ['sdk/aurex_sdk/heuristics/loop_guard.py']
  release:
    types: [published]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -e "sdk/[dev]"
      - run: pytest tests/benchmarks/test_loop_guard_f1.py -v
        env:
          LOOP_GUARD_F1_THRESHOLD: "0.70"
```

---

## 9. Common Mistakes and How to Avoid Them

**Do not add synchronous HTTP calls to `pre_call_check()`.** The rule bundle
is fetched asynchronously in the background. If the bundle is stale, use the
last good version. Never block the hot path on a network call.

**Do not store the `tool_call_args` string anywhere.** Pass it to the hash and
embedding functions, consume the result (a hash string or a float), and let the
string go out of scope immediately. The linter rule `no-store-prompt-text`
(custom pylint plugin, `ci/linting/`) will flag violations.

**Do not rename config keys in a minor release.** If `loop_guard_enabled` needs
to become `loop_guard.enabled` for structural reasons, add the new key, accept
both, and emit `DeprecationWarning` for the old one. Set a calendar reminder to
remove the old key in the next major version.

**Do not add new pillar names without updating all four canonical locations:**
`sdk/__init__.py`, `web/app/page.tsx` (features section), `web/app/docs/
page.tsx` (overview), and this SKILL.md. Pillar names are product vocabulary —
inconsistency erodes brand clarity.

**Do not let the free tier feel artificially limited.** The free tier is the
adoption engine. Every restriction on the free tier that doesn't protect
infrastructure costs (server compute, storage) should be removed. Restrictions
that protect business logic (CascadeRouter, cloud dashboard, team governance)
are appropriate gates.

---

## 10. Glossary

| Term | Definition |
|---|---|
| Token Credit Score | Single integer 0–100 summarising token efficiency across all signals. Lower = more waste. |
| LoopGuard | The Aurex pillar responsible for detecting and breaking agent runaway loops. |
| PromptIQ | The Aurex pillar responsible for prompt quality, bloat, drift, and caching analysis. |
| CascadeRouter | The Aurex pillar responsible for model routing and quality-scored escalation. Phase 2. |
| ProviderShield | The Aurex pillar responsible for provider resilience, circuit breakers, and fallbacks. |
| Ledger | The local JSONL file at `~/.aurex/ledger.jsonl` that records every intercepted LLM call as metadata only. |
| Rule bundle | A compiled JSON file pushed from the Aurex cloud containing the current detection thresholds and routing rules. Fetched async; evaluated locally. |
| Prompt hash | SHA-256 hash of system prompt + user message, used for exact-duplicate detection without storing text. |
| Similarity score | Cosine similarity between the current call's embedding and the previous call's embedding, computed locally, stored as a float. |
| hot path | The synchronous execution path inside `pre_call_check()` that runs before every LLM API call. Must complete in under 2ms. |
| Fail open | The behaviour of allowing an LLM call to proceed normally if Aurex encounters an internal error. The opposite of fail closed. |
| patch_all() | The Phase 1 replacement for `patch_openai()` that auto-detects and wraps all installed provider clients. |
