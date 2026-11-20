# AGENTS.md — Instructions for AI Coding Agents Integrating or Contributing to Aurex

Use this guide whenever integrating `aurex-sdk` into a user's Python or Node.js/TypeScript codebase, or when modifying this repository.

## 1. Fast Drop-In Integration Recipe (User Codebases)

### Python (`pip install aurex-sdk` or `pip install "aurex-sdk[redis,otel]"`)
1. Import and initialize **once** at process entrypoint (e.g. `main.py`, FastAPI `lifespan`, Celery `worker_process_init`, or Django `AppConfig.ready`):
   ```python
   from aurex_sdk import AurexAuditor, AurexBlocked, AurexConfig, patch_all

   auditor = AurexAuditor(
       AurexConfig(
           enable_loop_guard=True,
           budget_guard={"max_cost_per_session": 1.50, "max_thinking_tokens": 4096, "on_budget_exceeded": "throw"},
       )
   )
   patch_all(auditor)
   ```
2. **Do NOT rewrite existing LLM client calls** into custom wrappers unless requested. Patched `openai`, `anthropic`, `google-genai`, `litellm`, `ollama`, and `huggingface_hub` clients work automatically across sync, async, `.parse()`, `.stream()`, and `client.responses.create()`.
3. To scope sessions and SaaS tenants, add `workflow_id="..."` and `tags={"tenant_id": "..."}` directly to `.create()` / `.parse()` / `.stream()` calls (Aurex strips them before HTTP wire serialization), OR wrap execution with `aurex_context`:
   ```python
   from aurex_sdk.auditor import aurex_context
   tok = aurex_context.set({"workflow_id": f"req-{request_id}", "tenant_id": org_id})
   try:
       ...
   finally:
       aurex_context.reset(tok)
   ```
4. Call `auditor.mark_success(workflow_id)` when the user's task completes, and `auditor.flush()` on app shutdown or serverless exit.

### Node.js / TypeScript (`npm install aurex-sdk`)
1. Initialize **once** at server startup or in Next.js `instrumentation.ts`:
   ```typescript
   import { AurexAuditor } from "aurex-sdk";
   import OpenAI from "openai";

   export const auditor = AurexAuditor.getInstance({
     enableLoopGuard: true,
     budgetGuard: { maxCostPerSession: 1.5, maxThinkingTokens: 4096, onBudgetExceeded: "throw" },
   });
   await auditor.patchAll();
   auditor.instrument(OpenAI); // Always pass imported SDK classes in Next.js / Vite / Vitest bundlers
   ```
2. Scope concurrent requests using `aurexContext.run({ workflowId, tenantId }, async () => { ... })` or pass `workflowId` on call params.
3. Call `auditor.markSuccess(workflowId)` on task completion and `await auditor.flushAndWait()` before serverless exit.

## 2. Invariants & Anti-Hallucination Rules

- **Never invent non-existent APIs:** There is NO `AurexCompressor`, NO ONNX/LLMLingua dependency, and NO MCP server wrapper.
- **Cache-safe prompt edits:** Never prepend dynamic timestamps, UUIDs, or runtime hints at `messages[0]` or `system`. Place dynamic context at the **tail** of the last user message so provider prefix caches remain warm.
- **Multi-worker state:** In Gunicorn, Uvicorn `--workers > 1`, Celery, or Kubernetes, set `AUREX_REDIS_URL=redis://...` so `RedisStateStore` shares session/minute spend across workers.
- **Testing:** Call `AurexAuditor.reset()` in test `beforeEach` / `autouse` fixtures. Set `AUREX_STRICT_DRIFT=1` in CI to catch breaking upstream provider SDK changes via `AurexProviderDriftError`.
- **Repository verification command:** Run `bash .agent/skills/aurex-smoke-test/scripts/run_smoke.sh` from the repo root to verify Python SDK + Full-Stack E2E, Node.js `tsc` + `vitest` + smoke tests, and Backend unit tests.
