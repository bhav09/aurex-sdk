<p align="left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/logo-dark.png">
    <img alt="Aurex SDK Logo" src="./assets/logo-dark.png" width="56">
  </picture>
</p>

# Aurex SDK — Plain-English Guide & Problem Evidence

[![PyPI](https://img.shields.io/pypi/v/aurex-sdk.svg)](https://pypi.org/project/aurex-sdk/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://pypi.org/project/aurex-sdk/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](../sdk/node)
[![License: MIT](https://img.shields.io/badge/license-MIT-teal.svg)](../README.md)

`aurex-sdk` is an open-source, in-process **Python** (`pip install aurex-sdk`) and **Node.js / TypeScript** (`npm install aurex-sdk`) FinOps shield, runtime circuit breaker, and CI outcome gate for LLM applications. It runs inside your own process with **`<0.1 ms` overhead**, **zero proxy network hops**, and **zero raw prompts leaving your servers**.

> Using an AI coding agent (Claude Code, Cursor, Antigravity, Codex, Copilot)? Point it to [`../llms.txt`](../llms.txt) or [`../AGENTS.md`](../AGENTS.md) for instant drop-in integration.

## 1. What Problems Are Teams Facing? (23 Real GitHub & Reddit Reports)

Most teams only discover LLM cost spikes on next month's cloud invoice. Across **13 frontier-lab GitHub issues** (`anthropics/claude-code`, `googleapis/python-genai`, `google-gemini/gemini-cli`, `openai/codex`, `openai/openai-python`, `openai/openai-agents-python`, `vllm-project/vllm`) and **10 engineering Reddit threads**, six concrete failure modes account for the majority of unexpected spend:

### Graph 1: Number of Tracked Reports per Problem Label (`n = 23`)

```mermaid
xychart-beta
    title "Tracked LLM Cost & Reliability Reports by Problem Label (n = 23)"
    x-axis ["cache-invalidation", "thinking-tokens", "200k-cliff & caps", "agent-loop", "soft-failure-200", "stream & drift"]
    y-axis "Number of Reports" 0 --> 8
    bar [7, 5, 4, 3, 2, 2]
```

### Graph 2: Upstream GitHub Maintainer Labels Across the 13 Frontier-Lab Issues

```mermaid
xychart-beta
    title "Upstream Maintainer Labels on Tracked GitHub Issues (n = 13)"
    x-axis ["bug / type:bug", "stale", "area/agent", "area:cost", "api:bedrock", "api:gemini", "has-repro", "priority:p2"]
    y-axis "Issues Tagged" 0 --> 8
    bar [7, 5, 3, 2, 2, 2, 2, 2]
```

### Complete Problem Evidence Links (GitHub Issues & Reddit Threads)

| Source & Exact Link | Problem Reported by Developers | Problem Label | Aurex Stage |
| :--- | :--- | :--- | :--- |
| [anthropics/claude-code#91151](https://github.com/anthropics/claude-code/issues/91151) | `200k` long-session prompt cache collapses back to baseline on resume, triggering massive `cache_creation` rewrite bills (`bug`, `area:cost`, `api:bedrock`, `has repro`). | `cache-invalidation` | **Stage 1** |
| [anthropics/claude-code#60830](https://github.com/anthropics/claude-code/issues/60830) | Prompt-cache writes `<2%` above `150k` context on Bedrock vs. 1P Anthropic API (`bug`, `area:cost`, `api:bedrock`). | `cache-invalidation` | **Stage 1** |
| [anthropics/claude-code#42796](https://github.com/anthropics/claude-code/issues/42796) | Extended thinking spikes and sub-agent fan-out rapidly drain session budgets (`bug`, `area:model`). | `thinking-tokens` | **Stage 2** |
| [googleapis/python-genai#782](https://github.com/googleapis/python-genai/issues/782) | `thoughts_token_count` consumes `max_output_tokens` and returns empty visible text while billing full output rates (`type: bug`, `priority: p2`, `api: gemini-api`). | `thinking-tokens` | **Stage 2 & 3** |
| [googleapis/python-genai#1795](https://github.com/googleapis/python-genai/issues/1795) | `thought_token` count unexpectedly exceeds configured thinking budget (`type: bug`, `priority: p2`). | `thinking-tokens` | **Stage 2** |
| [googleapis/python-genai#2062](https://github.com/googleapis/python-genai/issues/2062) | `max_output_tokens` caps thinking + output combined, causing truncated/empty paid responses (`type: bug`, `api: gemini-api`). | `soft-failure-200` | **Stage 3** |
| [google-gemini/gemini-cli#16448](https://github.com/google-gemini/gemini-cli/issues/16448) | Autonomous CLI agent enters a repetitive thinking loop (`area/agent`). | `agent-loop` | **Stage 2** |
| [google-gemini/gemini-cli#16160](https://github.com/google-gemini/gemini-cli/issues/16160) | Agent enters an infinite text loop during multi-step problem solving (`area/agent`). | `agent-loop` | **Stage 2** |
| [openai/codex#60294](https://github.com/openai/codex/issues/60294) | Agent hangs when an OpenAI-compatible model returns `HTTP 200` with whitespace-only (`"\n"`) content (`bug`). | `soft-failure-200` | **Stage 3** |
| [openai/openai-python#3480](https://github.com/openai/openai-python/issues/3480) | Upstream `v2.45.0` `InputTokensDetails` (`cache_write_tokens`) breaking change crashes downstream agent SDKs. | `stream & drift` | **Drift Guard** |
| [openai/openai-agents-python#462](https://github.com/openai/openai-agents-python/issues/462) | Accessing and accounting for `reasoning_tokens` across reasoning models. | `thinking-tokens` | **Stage 2** |
| [openai/openai-agents-python#442](https://github.com/openai/openai-agents-python/issues/442) | Streaming fails or omits usage when passing `stream_options={"include_usage": True}` (`feature:chat-completions`). | `stream & drift` | **Stage 2** |
| [vllm-project/vllm#44824](https://github.com/vllm-project/vllm/issues/44824) | OpenAI-compatible serving endpoint leaves `prompt_tokens_details.cached_tokens` unpopulated at `0`. | `cache-invalidation` | **Stage 1 & 2** |
| [r/ClaudeAI · `1xksgor`](https://www.reddit.com/r/ClaudeAI/comments/1xksgor/things_that_quietly_break_your_prompt_cache_in/) | How `5m` idle gaps, mid-session model switches, and dynamic prompt edits silently wipe out 90% cache discounts. | `cache-invalidation` | **Stage 1** |
| [r/ClaudeAI · `1s7mkn3`](https://www.reddit.com/r/ClaudeAI/comments/1s7mkn3/psa_claude_code_has_two_cache_bugs_that_can/) | Pre-wire payload mutations breaking exact prefix matching and multiplying bills `10x–20x`. | `cache-invalidation` | **Stage 1** |
| [r/OpenAI · `1uszfrr`](https://www.reddit.com/r/OpenAI/comments/1uszfrr/gpt56_prompt_caching_appears_completely_broken/) | Unexpected `cached_tokens = 0` misses on repeated OpenAI requests. | `cache-invalidation` | **Stage 1** |
| [r/openrouter · `1uf3ij4`](https://www.reddit.com/r/openrouter/comments/1uf3ij4/is_anyone_else_paying_1032x_more_on_openrouter/) | Multi-provider routing breaking KV caches and inflating agent bills `10x–32x`. | `cache-invalidation` | **Stage 1 & 3** |
| [r/ClaudeAI · `1p05r7p`](https://www.reddit.com/r/ClaudeAI/comments/1p05r7p/my_claude_code_context_window_strategy_200k_is/) | Why crossing `200k` tokens triggers a 2x whole-request surcharge and hurts recall. | `200k-cliff & caps` | **Stage 1** |
| [r/googlecloud · `1jz43y6`](https://www.reddit.com/r/googlecloud/comments/1jz43y6/056_to_34315_in_minutes_google_gemini_api_just/) | `\$0.56` to `\$34,315` Gemini API bill in minutes due to missing real-time spend cutoffs. | `200k-cliff & caps` | **Stage 2** |
| [r/googlecloud · `1szv8cr`](https://www.reddit.com/r/googlecloud/comments/1szv8cr/warning_google_cloudgemini_api_spend_caps_do_not/) | Why GCP/Gemini budget alerts notify hours late instead of blocking runaway live calls. | `200k-cliff & caps` | **Stage 2** |
| [r/googlecloud · `1vmxjry`](https://www.reddit.com/r/googlecloud/comments/1vmxjry/long_term_feasibility_of_using_gemini_due_to/) | Unit-economics breakdown of Gemini's `>200k` 2x tiered pricing cliff. | `200k-cliff & caps` | **Stage 1** |
| [r/ClaudeCode · `1vca1ma`](https://www.reddit.com/r/ClaudeCode/comments/1vca1ma/claude_code_burned_my_entire_fivehour_limit_in_6/) | Stuck autonomous tool-retry loop burning an entire 5-hour quota in 6 minutes. | `agent-loop` | **Stage 2** |
| [r/Bard · `1p113qb`](https://www.reddit.com/r/Bard/comments/1p113qb/api_calls_to_gemini_3_about_40_more_expensive/) | Hidden internal thinking tokens billed at output rates making routine calls ~40%+ costlier. | `thinking-tokens` | **Stage 2 & 3** |

## 2. What Does Aurex Solve? (The 3-Stage Pipeline)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/architecture-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/architecture-light.svg">
    <img alt="Aurex SDK In-Process Architecture" src="./assets/architecture-light.svg" width="100%">
  </picture>
</p>

1. **Before the Call (Stage 1 — Prefix & `200k` Cliff Shield):** Sorts JSON keys deterministically in `tools` and schemas so unstable dict ordering stops breaking caches, pinpoints the exact character index that mutated on a cache miss, warns on `>5 min` Anthropic idle TTL gaps (`1.25x` rewrite penalty), and warns before crossing `200,000` input tokens (`2x` whole-request repricing). Runtime hints append at the **tail** of messages so index `0` caches never break.
2. **During the Call (Stage 2 — Spend, Thinking & Stream Circuit Breaker):** Isolates sessions automatically (`workflow_id` -> async context -> active OpenTelemetry `trace_id`), enforces live per-session and per-minute USD caps across multi-worker pods via optional Redis, clamps `max_thinking_tokens`, injects `stream_options.include_usage`, records partial spend on aborted streams in `try...finally`, suppresses `6x` double-retry storms (`max_retries=0`), and raises `AurexBlocked` when an agent loops.
3. **After the Call + CI (Stage 3 — Verified Outcome Cost & PR Gate):** Flags empty thinking-exhausted outputs and `\n\n\n` JSON grammar loops as `unfulfilled_spend`, pairs spend with `mark_success(workflow_id)` to measure real **cost per completed task**, enforces per-tenant margin downgrades, and posts cost regression diffs on Pull Requests via `aurex ci`.

## 3. How to Use It (Step-by-Step)

### Step 1: Install

```bash
# Python
pip install aurex-sdk
# Optional Redis + OpenTelemetry extras:
pip install "aurex-sdk[redis,otel]"

# Node.js / TypeScript
npm install aurex-sdk
```

### Step 2: Initialize Once at App Startup

**Python**
```python
from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all
import openai

auditor = AurexAuditor(
    AurexConfig(
        enable_loop_guard=True,
        budget_guard={
            "max_cost_per_session": 1.50,
            "max_cost_per_minute": 15.00,
            "max_context_tokens": 195000,
            "max_thinking_tokens": 4096,
            "on_budget_exceeded": "throw",
        },
        resilience={"enabled": True, "mode": "enforce", "max_attempts": 2},
    )
)
patch_all(auditor)

client = openai.OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize support ticket #42."}],
    workflow_id="ticket-42",
    tags={"tenant_id": "acme-corp"},
)

auditor.mark_success("ticket-42")
auditor.flush()
```

**Node.js / TypeScript**
```typescript
import { AurexAuditor } from "aurex-sdk";
import OpenAI from "openai";

const auditor = AurexAuditor.getInstance({
  enableLoopGuard: true,
  budgetGuard: {
    maxCostPerSession: 1.5,
    maxCostPerMinute: 15.0,
    maxContextTokens: 195000,
    maxThinkingTokens: 4096,
    onBudgetExceeded: "throw",
  },
  resilience: { enabled: true, mode: "enforce", maxAttempts: 2 },
});
await auditor.patchAll();
auditor.instrument(OpenAI); // Explicit hook for Next.js / Vite / Vitest bundlers

const client = new OpenAI();
const resp = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize support ticket #42." }],
  workflowId: "ticket-42",
  tags: { tenant_id: "acme-corp" },
} as any);

auditor.markSuccess("ticket-42");
await auditor.flushAndWait();
```

### Step 3: Audit Locally, Gate Pull Requests in CI, or Run Zero-Code Hook

```bash
# Local waste & cache-break summary
aurex audit

# Pull Request CI regression gate
aurex ci --ledger .aurex/ledger.jsonl --baseline main_ledger.jsonl --github-comment --fail-on-regression

# Optional zero-code startup hook
aurex install-hook && AUREX_ENABLED=1 python app.py
```

### Multi-Provider Integration (LiteLLM, OpenRouter, watsonx, Anthropic, NVIDIA NIM, Groq, Gemini, OpenAI, Together, Fireworks, Ollama & Hugging Face)

A single `patch_all(auditor)` / `await auditor.patchAll()` call governs every native SDK and OpenAI-compatible endpoint under **one shared `workflow_id` session budget**:

```python
import os
from aurex_sdk import AurexAuditor, AurexConfig, patch_all
import openai, anthropic, litellm, ollama
from google import genai
from huggingface_hub import InferenceClient

auditor = AurexAuditor(
    AurexConfig(
        enable_loop_guard=True,
        budget_guard={"max_cost_per_session": 2.50, "max_thinking_tokens": 4096, "on_budget_exceeded": "throw"},
    )
)
patch_all(auditor)

wf = "pipeline-order-108"

# Anthropic Claude & Google Gemini
anthropic.Anthropic().messages.create(
    model="claude-sonnet-4", max_tokens=512,
    messages=[{"role": "user", "content": "Plan validation steps."}], workflow_id=wf,
)
genai.Client().models.generate_content(
    model="gemini-2.5-flash", contents="Extract shipping metadata.", workflow_id=wf,
)

# OpenAI + OpenAI-Compatible Gateways (Groq, OpenRouter, NVIDIA NIM, IBM watsonx, Together, Fireworks)
for base_url, api_key, model_id in [
    (None, os.getenv("OPENAI_API_KEY"), "gpt-4o-mini"),
    ("https://api.groq.com/openai/v1", os.getenv("GROQ_API_KEY"), "llama-3.3-70b-versatile"),
    ("https://openrouter.ai/api/v1", os.getenv("OPENROUTER_API_KEY"), "anthropic/claude-3-5-haiku"),
    ("https://integrate.api.nvidia.com/v1", os.getenv("NVIDIA_API_KEY"), "meta/llama-3.3-70b-instruct"),
    ("https://us-south.ml.cloud.ibm.com/ml/v1", os.getenv("WATSONX_API_KEY"), "meta-llama/llama-3-3-70b-instruct"),
    ("https://api.together.xyz/v1", os.getenv("TOGETHER_API_KEY"), "meta-llama/Llama-3.3-70B-Instruct-Turbo"),
    ("https://api.fireworks.ai/inference/v1", os.getenv("FIREWORKS_API_KEY"), "accounts/fireworks/models/llama-v3p3-70b-instruct"),
]:
    openai.OpenAI(base_url=base_url, api_key=api_key).chat.completions.create(
        model=model_id, messages=[{"role": "user", "content": "Verify tax rules."}], workflow_id=wf,
    )

# LiteLLM Router (watsonx, NVIDIA NIM, Bedrock, Vertex, Azure) + Local Ollama ($0) + Hugging Face
litellm.completion(model="watsonx/meta-llama/llama-3-3-70b-instruct", messages=[{"role": "user", "content": "Check compliance."}], workflow_id=wf)
ollama.Client().chat(model="llama3.3", messages=[{"role": "user", "content": "Local summary."}], workflow_id=wf)
InferenceClient().chat_completion(model="Qwen/Qwen2.5-72B-Instruct", messages=[{"role": "user", "content": "Tag intent."}], workflow_id=wf)

auditor.mark_success(wf)
auditor.flush()
```

### Integrate in 30 Seconds Using `llms.txt` with AI Coding Assistants

Point **Claude Code**, **Cursor**, **Antigravity**, **GitHub Copilot**, **Windsurf**, or **Codex** at [`llms.txt`](https://raw.githubusercontent.com/bhav09/aurex-sdk/main/llms.txt) so it wires Aurex into your existing codebase without rewriting client calls:

1. **Copy-Paste Prompt (Any Coding Agent):**
   ```text
   Read https://raw.githubusercontent.com/bhav09/aurex-sdk/main/llms.txt and integrate aurex-sdk into our existing codebase without rewriting our LLM client calls. Initialize AurexAuditor once at startup with enable_loop_guard and budget_guard caps, propagate workflow_id per request, exclude AurexBlocked from retry decorators, and flush on shutdown.
   ```
2. **Cursor / Windsurf `@Docs`:** Add `https://raw.githubusercontent.com/bhav09/aurex-sdk/main/llms.txt` under **Settings -> Docs** as `@Aurex`, then run `@Aurex integrate aurex-sdk into this repo`.
3. **Local Repo Copy:** Run `curl -sL https://raw.githubusercontent.com/bhav09/aurex-sdk/main/llms.txt -o .aurex-llms.txt` so offline or sandboxed agents read exact Python `snake_case` and Node.js `camelCase` rules locally.

## 4. Real-World Benchmarks: OpenHands, BrowserGym, tau-bench, terminal-bench & SWE-agent

Aurex has been verified across **six open-source agent frameworks** (**terminal-bench `8.9/10`**, **tau-bench `8.8/10`**, **OpenHands `8.7/10`**, **SWE-agent `8.6/10`**, **BrowserGym `8.4/10`**, and **LangGraph**) spanning **Claude**, **GPT**, **Gemini**, **NVIDIA NIM (`Nemotron`)**, **LiteLLM**, and local **Ollama (`Llama`)**:

### Cross-Benchmark Scorecard & Stage Coverage

| Benchmark | Archetype | Score | Hot-Path `p50` | Stage 1 (Prefix & Cliff) | Stage 2 (Loop, Spend & Concurrency) | Stage 3 (Soft Failures & `aurex ci`) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **terminal-bench** | Linux Bash (`LiteLLM` + `Terminus2` / `MCPTerminus`) | **`8.9 / 10`** | **`0.080 ms`** | Blocked `336k`-tok dump (`+\$1.01` saved); caught dropped `messages[0]` cache & char `2,884` timestamp | Clamped `16k -> 1k` think; blocked `Permission denied` loop; bypassed `3x3` `tenacity` sleep | Caught `64/64` reasoning starvation (`content=""`) · `aurex ci` exit `1` (`+9,280%`) |
| **tau-bench** | Multi-Actor Retail (`LiteLLM` + 15 tools + User Sim) | **`8.8 / 10`** | `< 0.50 ms` | Isolated `-agent` vs `-user` `workflow_id` dual `system` caches; blocked `8.3k` few-shot bloat | Clamped `8k -> 1k` think; thread-isolated `2k`-cap blocked task from `8k`-cap passing task | Caught `48/48` reasoning starvation (`content=""`) · `aurex ci` exit `1` (`+3,516%`) |
| **OpenHands** | Coding (`OpenAI` + `file_editor`) | **`8.7 / 10`** | `0.268 ms` | Kept reordered tools warm; caught `system` timestamp at char `590`; blocked `360k` cliff (`+\$1.08` saved) | Blocked stuck `file_editor` (`1.16 ms`); `80%` budget downgrade; caught mid-stream abort | Caught JSON grammar loop + `4k` think starvation · `aurex ci` exit `1` (`+861%`) |
| **SWE-agent** | Autonomous Repo Solver | **`8.6 / 10`** | `< 0.30 ms` | Zero-PII SHA-256 prompt/system hashing & `>200k` pre-call guard | Allowed multi-file discovery while halting stuck loops (`1.5M–5M+` cumulative tokens saved) | Verified `mark_success()` / `mark_failure()` cost-per-outcome ledger |
| **BrowserGym** | Multimodal Web (`OpenAI` + Vision/DOM) | **`8.4 / 10`** | `0.558 ms` | Blocked `480k`-tok DOM pre-call (`+\$1.44` saved; native callback missed it); **`64.9x`** cacheable prefix boost | Blocked stuck disabled button in `0.109 ms` pre-network; multimodal base64 digest hashing | Marked `reward=0.0` episode failed · `aurex ci` exit `1` (`+1,890%`) |

### Live End-to-End NVIDIA NIM (`Nemotron`) Runs — `4/4` Solved for `< \$0.01` Combined (`\$0.00` Wasted)

| Benchmark | Live Task Executed | Result | Wall Time | Input Tokens | Reasoning Tokens | Total Cost |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **OpenHands** | Inspect `@openhands/agent-canvas` via `file_editor` | Solved | `1.43 s` | `1,077` | `99` | **`\$0.000186`** |
| **BrowserGym** | 3-step `ExpArgs.run()` web checkout episode | Solved (`reward=1.0`) | `10.01 s` | `3,843` | `1,533` | **`\$0.001206`** |
| **tau-bench** | Retail Task 0 (16 multi-actor messages) | Solved (`Pass^1=1.0`) | `17.08 s` | `41,088` | `1,332` | **`\$0.003053`** |
| **terminal-bench** | `analyze-access-logs` (`2,000` log lines, 7 bash cmds) | Solved (`is_resolved=True`) | `15.41 s` | `25,488` | `874` | **`\$0.002989`** |

## 5. Data Privacy, Setup Improvements & Contributing

- **Zero-PII Local Default:** Without `AUREX_API_KEY`, zero data leaves your machine—metrics and one-way SHA-256 hashes write locally to `.aurex/ledger.jsonl`. Even with opt-in cloud sync enabled, raw prompt and response text are never sent or stored (`prompt=None`, `response=None`).
- **Move dynamic values to prompt tails & cap context at `195,000` tokens:** Preserve 50%–90% prefix-cache discounts and prevent accidental `200k` 2x whole-request repricing on Claude and Gemini.
- **Propagate `workflow_id` & skip retrying `AurexBlocked`:** Use `aurex_context.set({"workflow_id": run_id})` / `aurexContext.run({ workflowId }, ...)` in LangGraph or sub-agent hooks, exclude `AurexBlocked` from `tenacity` (`retry=retry_if_not_exception_type(AurexBlocked)`), and raise `loop_similarity_threshold` (`0.90`–`0.95`) when coding agents need wider file-reading headroom on large benchmarks.
- **Share state across pods & contribute:** Set `AUREX_REDIS_URL=redis://...` in multi-worker deployments. To contribute, fork [bhav09/aurex-sdk](https://github.com/bhav09/aurex-sdk), keep Python and Node.js changes in lockstep, run `AUREX_STRICT_DRIFT=1 bash .agent/skills/aurex-smoke-test/scripts/run_smoke.sh`, and open a Pull Request.

## Credits

**Author:** [Bhavishya Pandit](https://github.com/bhav09) and [Aakriti Aggarwal](https://github.com/aakriti1318)
