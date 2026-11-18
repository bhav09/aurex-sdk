import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import {
  calculateCost,
  checkCliffStatus,
  countRequestTokens,
  getModelPricing,
} from "../src/pricing.ts";
import { InMemoryStateStore } from "../src/state_store.ts";
import {
  appendTailInstruction,
  canonicalizeJsonKeys,
  inspectPreCallShield,
} from "../src/prefix_shield.ts";
import { classifyResponse, detectGrammarLoop } from "../src/resilience.ts";
import { compareLedgers, formatRegressionMarkdown, summarizeLedger } from "../src/ci.ts";
import {
  AurexAuditor,
  AurexBlocked,
  aurexContext,
  ensureOpenAIStreamUsage,
  resolveEndpointProvider,
  sanitizeThinkingParams,
} from "../src/index.ts";

// ============================================================================
// Stage 1: Prefix Shield, Canonicalization & >200k Cliff Pricing
// ============================================================================

// 1. Deterministic JSON schema canonicalization
const s1 = canonicalizeJsonKeys({ b: 1, a: { z: true, m: [3, 1] } });
const s2 = canonicalizeJsonKeys({ a: { m: [3, 1], z: true }, b: 1 });
assert.equal(JSON.stringify(s1), JSON.stringify(s2));

// 2. Silent timestamp prefix cache-breaker offset detection
const store = new InMemoryStateStore();
const now = Date.now();
const r1 = inspectPreCallShield({
  stateStore: store,
  workflowId: "wf-node-1",
  model: "claude-sonnet-4",
  estimatedTokens: 2048,
  nowMs: now,
  systemPrompt: "Time: 2026-11-18 10:00:00 | Static system instructions",
});
assert.equal(r1.prefixBroken, false);

const r2 = inspectPreCallShield({
  stateStore: store,
  workflowId: "wf-node-1",
  model: "claude-sonnet-4",
  estimatedTokens: 2048,
  nowMs: now + 5000,
  systemPrompt: "Time: 2026-11-18 10:00:05 | Static system instructions",
});
assert.equal(r2.prefixBroken, true);
assert.equal(r2.brokenLayer, "system");
assert.equal(r2.mutatingOffset, 24);
assert.equal(r2.mutationKind, "timestamp_or_id");

// 3. Anthropic >5m idle TTL rewrite warning
const r3 = inspectPreCallShield({
  stateStore: store,
  workflowId: "wf-node-1",
  model: "claude-sonnet-4",
  estimatedTokens: 2048,
  nowMs: now + 370_000,
  systemPrompt: "Time: 2026-11-18 10:00:05 | Static system instructions",
});
assert.equal(r3.idleTtlRisk, true);

// 4. >200k 2x whole-request context pricing cliff
const below = calculateCost("claude-sonnet-4", 200_000, 1_000);
const above = calculateCost("claude-sonnet-4", 200_001, 1_000);
assert.ok(above > below * 1.99);
assert.equal(checkCliffStatus("gemini-2.5-pro", 190_000).nearCliff, true);
assert.equal(checkCliffStatus("gemini-2.5-pro", 205_000).crossedCliff, true);

// 5. Hosted vs local Llama pricing
assert.deepEqual(getModelPricing("llama3.1:8b"), [0, 0]);
assert.ok(getModelPricing("groq/llama-4-scout")[0] > 0);

// 6. Tail-only instruction append preserves index 0 prefix
const updated = appendTailInstruction(
  {
    messages: [
      { role: "system", content: "STATIC_SYSTEM_PROMPT" },
      { role: "user", content: "Hello" },
    ],
  },
  "Keep it brief.",
);
assert.equal((updated.messages as any[])[0].content, "STATIC_SYSTEM_PROMPT");
assert.ok((updated.messages as any[])[1].content.includes("[Aurex Guidance: Keep it brief.]"));

// 7. Multimodal + tools token counting
const toks = countRequestTokens({
  messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "x" } }] }],
  tools: [{ name: "search" }],
});
assert.ok(toks > 765);

console.log("   Node.js Stage 1 Prefix Shield & Pricing smoke tests PASSED");

// ============================================================================
// Stage 2: In-Flight Spend, Thinking & Stream Circuit Breaker
// ============================================================================

// 8. Endpoint base_url provider resolution (Groq vs Localhost Ollama)
assert.equal(resolveEndpointProvider("llama-4-scout", "https://api.groq.com/openai/v1"), "groq");
assert.equal(resolveEndpointProvider("llama3.1:8b", "http://localhost:11434/v1"), "ollama");

// 9. Thinking cap & downgrade parameter sanitization
const sanitizedClamped = sanitizeThinkingParams(
  { model: "claude-sonnet-4", thinking: { type: "enabled", budget_tokens: 20000 }, reasoning_effort: "high" },
  { isDowngraded: false, maxThinkingTokens: 2048 },
);
assert.equal(sanitizedClamped.thinking.budget_tokens, 2048);
assert.equal(sanitizedClamped.reasoning_effort, "low");

const sanitizedDowngraded = sanitizeThinkingParams(
  { model: "gpt-4o-mini", reasoning_effort: "high", thinking: { budget_tokens: 4096 } },
  { isDowngraded: true },
);
assert.equal("reasoning_effort" in sanitizedDowngraded, false);
assert.equal("thinking" in sanitizedDowngraded, false);

// 10. Streaming usage option injection
const streamParams = ensureOpenAIStreamUsage({ model: "gpt-4o", stream: true });
assert.deepEqual((streamParams as any).stream_options, { include_usage: true });

// 11. Session isolation, Loop Guard blocking, Aborted Stream & OpenAI Responses API
AurexAuditor.reset();
const recordedEvents: any[] = [];
const origRequire = Module.prototype.require;
let lastOptionsArg: any = null;
let lastCreateParams: any = null;
class FakeCompletions {
  _client: any;
  constructor(client: any) {
    this._client = client;
  }
  async create(params: any, opts?: any) {
    lastCreateParams = params;
    lastOptionsArg = opts;
    if (params.stream) {
      async function* gen() {
        yield { choices: [{ delta: { content: "Part 1 " } }] };
        yield { choices: [{ delta: { content: "Part 2 " } }] };
        yield { choices: [{ delta: { content: "Part 3 " } }] };
      }
      return gen();
    }
    return {
      choices: [{ message: { role: "assistant", content: "Groq ok" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    };
  }
}

class FakeResponses {
  _client: any;
  constructor(client: any) {
    this._client = client;
  }
  async create(_params: any, opts?: any) {
    lastOptionsArg = opts;
    return {
      output_text: "Responses API ok",
      usage: {
        input_tokens: 500,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 250 },
        output_tokens_details: { reasoning_tokens: 40 },
      },
    };
  }
}

const fakeOpenaiMod: any = {
  OpenAI: class FakeOpenAI {
    baseURL = "https://api.groq.com/openai/v1";
    chat = { completions: new FakeCompletions(this) };
    responses = new FakeResponses(this);
  },
};

(Module.prototype as any).require = function (id: string) {
  if (id === "openai") {
    return fakeOpenaiMod;
  }
  return origRequire.apply(this, arguments as any);
};

try {
  const auditor = AurexAuditor.getInstance({
    storageMode: "memory",
    localOnly: true,
    enableLoopGuard: true,
    resilience: { enabled: true, mode: "enforce", max_attempts: 2 },
    budgetGuard: { maxCostPerSession: 0.05, onBudgetExceeded: "throw" },
  });
  const origLog = auditor.logEvent.bind(auditor);
  auditor.logEvent = ((p: any) => {
    recordedEvents.push(p);
    return origLog(p);
  }) as any;

  // Session isolation: tenant A hits session cap, unscoped tenant B still proceeds
  await aurexContext.run({ workflowId: "tenant-a" }, async () => {
    try {
      auditor.logEvent({ model: "claude-opus-4", inputTokens: 3000, outputTokens: 500, workflowId: "tenant-a" });
    } catch {
      /* post-call budget throw expected */
    }
  });
  assert.throws(
    () => auditor.preCallCheck({ model: "claude-opus-4", prompt: "blocked", workflowId: "tenant-a" }),
    AurexBlocked,
  );
  const decUnscoped = auditor.preCallCheck({ model: "gpt-4o-mini", prompt: "isolated call" });
  assert.equal(decUnscoped.action, "proceed");

  // Structural tool loop raises AurexBlocked
  assert.throws(
    () =>
      auditor.preCallCheck({
        model: "gpt-4o",
        prompt: "repeat",
        workflowId: "wf-loop-node",
        messages: [
          {
            role: "assistant",
            tool_calls: [
              { function: { name: "get_weather" } },
              { function: { name: "get_weather" } },
              { function: { name: "get_weather" } },
            ],
          },
        ],
      }),
    AurexBlocked,
  );

  // OpenAI patcher: Groq baseURL + maxRetries=0 + stream_options + aborted stream accounting + Responses API
  auditor.patchOpenAI();
  const { OpenAI } = (Module.prototype as any).require("openai");
  const client = new OpenAI();

  await client.chat.completions.create({
    model: "llama-4-scout",
    messages: [{ role: "user", content: "Hello Groq" }],
    workflowId: "wf-node-groq",
  });
  assert.equal(lastOptionsArg?.maxRetries, 0);
  const groqEv = recordedEvents.find((e) => e.workflowId === "wf-node-groq" && e.attemptIndex === undefined);
  assert.equal(groqEv?.provider, "groq");

  // Aborted stream still logs partial spend via try...finally
  const stream = await client.chat.completions.create({
    model: "llama-4-scout",
    messages: [{ role: "user", content: "Stream abort" }],
    stream: true,
    workflowId: "wf-node-stream-abort",
  });
  assert.deepEqual(lastCreateParams?.stream_options, { include_usage: true });
  for await (const chunk of stream) {
    assert.ok(chunk);
    break; // abort after 1st chunk!
  }
  const abortEv = recordedEvents.find((e) => e.workflowId === "wf-node-stream-abort" && e.attemptIndex === undefined);
  assert.ok(abortEv);
  assert.equal(abortEv.status, "aborted_stream");
  assert.equal(abortEv.outcome, "degraded");

  // Responses API adapter
  const rResp = await client.responses.create({
    model: "o3",
    instructions: "Concise",
    input: "2+2",
    workflowId: "wf-node-responses",
  });
  assert.equal(rResp.output_text, "Responses API ok");
  const respEv = recordedEvents.find((e) => e.workflowId === "wf-node-responses" && e.attemptIndex === undefined);
  assert.equal(respEv?.inputTokens, 500);
  assert.equal(respEv?.cachedTokens, 250);
  assert.equal(respEv?.reasoningTokens, 40);
} finally {
  (Module.prototype as any).require = origRequire;
  AurexAuditor.reset();
}

console.log("   Node.js Stage 2 Runtime Circuit Breaker smoke tests PASSED");

// ============================================================================
// Stage 3: Outcome-Backed Cost, Soft-Failure Classifier, CI Diff & Tenant Policy
// ============================================================================

// 12. Grammar loop & thinking-exhausted empty output classification
assert.equal(detectGrammarLoop("{\n" + "\n".repeat(40) + "}"), true);
assert.equal(detectGrammarLoop('{"ok": true}'), false);

const cLoop = classifyResponse("openai", {
  choices: [{ message: { content: "{\n" + "\n".repeat(40) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 50, completion_tokens: 300 },
});
assert.equal(cLoop.usable, false);
assert.equal(cLoop.kind, "grammar_loop");
assert.equal(cLoop.billed, true);

const cExhausted = classifyResponse("openai", {
  choices: [{ message: { content: "" }, finish_reason: "length" }],
  usage: { prompt_tokens: 100, completion_tokens: 4096, completion_tokens_details: { reasoning_tokens: 4096 } },
});
assert.equal(cExhausted.usable, false);
assert.equal(cExhausted.kind, "thinking_exhausted");
assert.equal(cExhausted.billed, true);

// 13. Tenant margin guardrail + auto unfulfilled_spend tagging
const stage3Auditor = AurexAuditor.getInstance({ storageMode: "memory", localOnly: true });
stage3Auditor.configureTenantPolicies({
  "tenant-over": { action: "downgrade", monthly_spend_usd: 55, monthly_limit_usd: 40 },
});
const decTenant = stage3Auditor.preCallCheck({
  model: "claude-opus-4",
  prompt: "Explain ```ts\nconst x = 1;\n```",
  workflowId: "wf-t1",
  tenantId: "tenant-over",
});
assert.equal(decTenant.action, "downgrade");
AurexAuditor.reset();

// 14. Strict outcome separation & CI baseline regression diff
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aurex-smoke-"));
try {
  const basePath = path.join(tmpDir, "main.jsonl");
  const prPath = path.join(tmpDir, "pr.jsonl");
  fs.writeFileSync(
    basePath,
    [
      JSON.stringify({ model: "claude-sonnet-4", input_tokens: 10000, cached_tokens: 8000, cost: 0.02, workflow_id: "wf-1", outcome: "success", cost_type: "inference" }),
      JSON.stringify({ model: "claude-sonnet-4", input_tokens: 10000, cached_tokens: 8000, cost: 0.02, workflow_id: "wf-1", outcome: "success", cost_type: "inference" }),
      JSON.stringify({ model: "aurex-outcome", input_tokens: 0, output_tokens: 0, cost: 0, workflow_id: "wf-1", outcome: "success", cost_type: "outcome_signal" }),
    ].join("\n") + "\n",
  );
  fs.writeFileSync(
    prPath,
    [
      JSON.stringify({ model: "claude-sonnet-4", input_tokens: 205000, cached_tokens: 0, cost: 1.30, workflow_id: "wf-1", outcome: "success", cost_type: "inference" }),
      JSON.stringify({ model: "claude-sonnet-4", input_tokens: 5000, cached_tokens: 0, cost: 0.12, workflow_id: "wf-1", outcome: "degraded", cost_type: "unfulfilled_spend" }),
      JSON.stringify({ model: "aurex-outcome", input_tokens: 0, output_tokens: 0, cost: 0, workflow_id: "wf-1", outcome: "success", cost_type: "outcome_signal" }),
    ].join("\n") + "\n",
  );

  const bSum = summarizeLedger(basePath);
  assert.equal(bSum.effectiveSuccesses, 1);
  assert.equal(bSum.turnsPerSuccess, 2);
  assert.equal(bSum.costPerSuccess, 0.04);

  const diff = compareLedgers(prPath, basePath);
  assert.equal(diff.hasRegression, true);
  assert.ok(formatRegressionMarkdown(diff).includes("Cost per Successful Outcome"));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

AurexAuditor.reset();
console.log("   Node.js Stage 3 Outcomes, Soft-Failure & CI Diff smoke tests PASSED");
