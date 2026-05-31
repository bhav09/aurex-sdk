# Aurex Python SDK

The lightweight, zero-PII Python SDK for Aurex AI cost-optimization and budget circuit-breaking.

## Installation

Install the SDK in your project:

```bash
pip install aurex-sdk
```

Or for local development / editable mode:

```bash
pip install -e sdk/python
```

---

## Features

- **Zero-code Auto-Instrumentation**: Automatically patch LLM providers (OpenAI, Anthropic, Google Gemini, LiteLLM) via a site-packages hook.
- **Real-Time Guardrails (`pre_call_check`)**: Detect and block/redirect loops, system prompt waste, and expensive models before they occur.
- **In-Memory Budget Circuit Breaker**: Prevent budget overrun with context token limits and rate guards.
- **Local-First & Privacy-Focused**: Telemetry is batched asynchronously and kept offline in `.aurex/ledger.jsonl`. Prompts are not synced by default.
- **Crash Safety**: In-flight events are saved to `pending.jsonl` to ensure durability.

---

## Quick Start

### 1. Zero-Code Auto-Hook (Recommended)

Run the CLI command once to install the import hook into your Python site-packages. This intercepts LLM SDK calls automatically with zero code modification.

```bash
# Install the hook
aurex install-hook

# Configure env vars and run your application
export AUREX_ENABLED=1
export AUREX_API_KEY=aux_dev_yourkey
python your_app.py
```

To remove the hook:
```bash
aurex uninstall-hook
```

### 2. Manual Integration

```python
from aurex_sdk import AurexAuditor, AurexConfig

# Initialize the auditor singleton
auditor = AurexAuditor(AurexConfig(
    api_key="aux_dev_yourkey",
    project="production-service",
    storage_mode="file",                  # "file" or "memory"
    ledger_path=".aurex/ledger.jsonl",
    cloud_sync=True
))

# Patch all supported providers (OpenAI, Anthropic, Google Gemini, LiteLLM)
auditor.patch_all()

# Or patch manually/selectively
# auditor.patch_openai()
# auditor.patch_anthropic()
# auditor.patch_google()
# auditor.patch_litellm()
```

---

## API Reference

### `AurexConfig` Parameters

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `api_key` | `str` | `None` / `env(AUREX_API_KEY)` | Your Aurex Project API key. |
| `project` | `str` | `"default"` | Logical project identifier. |
| `ledger_path` | `str` | `".aurex/ledger.jsonl"` | Path to write the local telemetry ledger to. |
| `cloud_sync` | `bool` | `False` | Sync telemetry events asynchronously to the cloud dashboard. |
| `cloud_endpoint`| `str` | `None` | Endpoint for cloud syncing. Overrides default API endpoint. |
| `base_url` | `str` | `None` / `env(AUREX_BASE_URL)` | Base URL of backend API (defaults to `http://localhost:8000/api/v1`). |
| `flush_interval_seconds` | `float` | `30.0` | Telemetry sync queue flush interval. |
| `max_batch_size` | `int` | `100` | Maximum batch size of synced events. |
| `local_only` | `bool` | `True` | Runs fully locally without cloud sync. (Turn off for cloud sync) |
| `storage_mode` | `str` | `"file"` | `"file"` to write to disk ledger, or `"memory"` for memory-only store. |
| `sync_prompt_hashes` | `bool` | `False` / `env(AUREX_SYNC_PROMPT_HASHES)` | Sync prompt/response hashes to the cloud dashboard. |
| `budget_guard` | `dict` | `None` | Configuration dictionary for budget limits (see below). |
| `pricing_path` | `str` | `None` / `env(AUREX_PRICING_PATH)` | Path to a custom JSON pricing configuration. |
| `default_pricing` | `dict` | `None` | Fallback cost dict with keys `input` and `output` (USD per 1M tokens) for unknown models. |
| `simple_prompt_token_limit` | `int` | `120` | Threshold token count below which prompts are classified as simple. |
| `runaway_context_multiplier` | `float` | `2.2` | Scaling multiplier representing runaway context growth checks. |
| `loop_similarity_threshold` | `float` | `0.8` | Jaccard similarity threshold for semantic loop checks. |
| `downgrade_map` | `dict` | `None` | Custom model mappings representing downgrade paths (e.g. `{"gpt-4o": "gpt-4o-mini"}`). |

### Dynamic Pricing & Programmatic Registration

You can specify custom pricing using a local JSON file or register rates programmatically:

1. **Custom JSON File (`pricing_path` or `env(AUREX_PRICING_PATH)`)**:
   Create a JSON pricing file:
   ```json
   {
     "my-custom-model": { "input": 12.50, "output": 35.00 },
     "finetuned-gpt-*": { "input": 3.00, "output": 12.00 }
   }
   ```

2. **Programmatic Registration**:
   ```python
   auditor.register_model_pricing("custom-model", input_cost=10.0, output_cost=30.0)
   ```

### Budget Guard Configuration (`budget_guard`)

Pass a dictionary to `budget_guard` to enforce runtime limits:

```python
config = AurexConfig(
    budget_guard={
        "max_cost_per_minute": 5.00,
        "max_cost_per_session": 50.00,
        "max_requests_per_minute": 100,
        "max_context_tokens": 128000,
        "on_budget_exceeded": "throw",  # "throw" | "warn" | "webhook"
        "webhook_url": "https://api.yourdomain.com/aurex-alert",
        "dry_run": False
    }
)
```

---

## Context Overrides (Per-Call Options)

When using wrapper methods (`wrap` / `awrap`), you can pass request-scoped options (e.g., `tags`, custom thresholds, loop sensitivity) to insulate different execution contexts:

```python
resp = auditor.wrap(
    lambda params: client.chat.completions.create(**params),
    lambda: {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Query..."}]
    },
    options={
        "workflow_id": "tenant_abc_session",
        "tags": {"tier": "enterprise"},
        "simple_prompt_token_limit": 50, # override default threshold
        "budget_guard": {
            "max_cost_per_session": 2.00 # custom budget limit for this call
        }
    }
)
```

---

## Hugging Face Native Integration

Auto-instrument Hugging Face text generation and chat completions. Register the optional dependency in your environment:

```bash
pip install aurex-sdk[huggingface]
```

Call `patch_all()` or `patch_huggingface()` to instrument standard `huggingface_hub` client calls:

```python
from aurex_sdk import AurexAuditor
from huggingface_hub import InferenceClient

auditor = AurexAuditor()
auditor.patch_huggingface()

client = InferenceClient(model="meta-llama/Llama-3-8b-Instruct")
resp = client.chat_completion(messages=[{"role": "user", "content": "Hello"}])
# Tracked at $0.00 (Hugging Face serverless defaults to free cost)
```

To configure pricing for dedicated Hugging Face endpoints, use the dynamic pricing configuration or register the endpoint name under wildcard pricing.

---

---

## Real-Time Guards (`pre_call_check`)

For manual LLM flows, execute a pre-call check to catch loops and budget overruns before calling the LLM API.

```python
from aurex_sdk import AurexAuditor, AurexDecision, AurexAction

auditor = AurexAuditor()

# Perform the check
decision: AurexDecision = auditor.pre_call_check(
    model="gpt-4o",
    prompt="Generate code for Antigravity...",
    system_prompt="You are a senior dev...",
    workflow_id="user_session_123",
    messages=[{"role": "user", "content": "..."}]
)

if decision.action == "block":
    raise Exception(f"Request blocked: {decision.reason}")
elif decision.action == "downgrade":
    # Use cheaper model suggestion
    model = decision.suggested_model # e.g. "gpt-4o-mini"
    print(f"Downgrading to {model} because: {decision.reason}")
elif decision.action == "compress":
    # Use compressed messages to avoid system prompt waste
    messages = decision.compressed_messages
```

---

## CLI Commands

The Python SDK comes with a built-in CLI command `aurex` (or `python -m aurex_sdk.cli`).

### `aurex install-hook`
Installs the zero-code auto-instrumentation `.pth` hook.
- `--target`: Optional explicit path to `site-packages`.

### `aurex uninstall-hook`
Removes the hook.

### `aurex audit`
Analyze a local ledger offline to run heuristics and check against CI policies (Build Breaker).
- `--ledger`: Path to ledger file (default: `.aurex/ledger.jsonl`).
- `--fail-under`: Score threshold (0-100) below which the build will fail.
- `--max-waste-usd`: Maximum allowed wasted cost before failing.
- `--max-spend-usd`: Maximum allowed budget cost before failing.
- `--mode`: CI/CD action mode: `warn` (default) or `block` (returns exit code `1` on failure).

Example:
```bash
aurex audit --ledger .aurex/ledger.jsonl --fail-under 85 --max-waste-usd 10.00 --mode block
```

---

## Health & Monitoring

Check the status of the auditor thread and queue size:

```python
health = auditor.get_health()
print(health)
# Output:
# {
#   "status": "healthy",
#   "queue_size": 0,
#   "pending_file_exists": False,
#   "thread_active": True,
#   "events_logged": 42
# }
```
