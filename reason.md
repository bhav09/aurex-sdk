# Why Aurex Exists

## 1. What Problems Are Teams Facing?

Most AI teams discover cloud bill spikes weeks too late—on next month's invoice. Dashboards that only chart historical spend miss four quiet leaks happening inside code right now:

1. **Silent Cache & Tier Traps (Before the Call):** A single `datetime.now()` at character 20 of a system prompt wipes out 90% prompt-cache discounts on every turn. One extra document pushing context from `199,900` to `200,100` tokens doubles the price of the *entire* request on Claude and Gemini.
2. **Unbounded Runtime Spend (During the Call):** Cloud APIs do not give you a per-user or per-ticket fuse. Agents loop on failing tools, reasoning models burn 20,000 invisible thinking tokens before writing a word, aborted streams drop usage chunks, and nested SDK retries multiply `429` traffic `6x`.
3. **Billed Soft Failures & Outcome Blindness (After the Call):** Providers bill full price for HTTP `200 OK` responses that contain empty text or `\n\n\n` JSON loops. Worse, lowering price-per-token means nothing if a quantized or degraded model takes twice as many turns to finish a job.

## 2. What Aurex Solves

Aurex is **in-process cost prevention, not a proxy gateway**. Your prompts never route through a third-party server, adding `0 ms` network latency and keeping raw prompt text inside your VPC.

One lightweight SDK connects three stages around every LLM call:
- **Before the call:** Keeps prefix caches intact and warns before the `200k` 2x cliff.
- **During the call:** Enforces per-session, per-minute, and thinking-token circuit breakers across workers.
- **After the call:** Flags billed soft failures (`unfulfilled_spend`), calculates real **cost per successful outcome**, and diffs cost regressions on every Pull Request.

## 3. How to Use It in 3 Steps

1. **Install:** `pip install aurex-sdk` or `npm install aurex-sdk`.
2. **Enable:** Call `patch_all()` (Python) or `auditor.patchAll()` (Node.js) with a `budget_guard` limit, or run `aurex install-hook` for zero-code startup.
3. **Verify:** Call `mark_success(workflow_id)` when a workflow completes and run `aurex ci --baseline main_ledger.jsonl` in CI.

## 4. How Teams Improve Over Time

- Fix prefix-cache breaks flagged by Stage 1 to cut input spend 50%–85% with zero model changes.
- Cap `max_thinking_tokens` and enable `AUREX_REDIS_URL` in Stage 2 so no user session can run away across pods.
- Gate PRs with `--fail-on-regression` and sync tenant margin policies (`/api/v1/policies`) in Stage 3 so heavy flat-rate tenants automatically downgrade to cheaper models before eroding gross margin.
