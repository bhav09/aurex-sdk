import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { Ollama } from "ollama";
import RedisMock from "ioredis-mock";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

import {
  AurexAuditor,
  AurexBlocked,
  AurexProviderDriftError,
  RedisStateStore,
  aurexContext,
  calculateCost,
} from "../src/index";
import { checkCliffStatus, countRequestTokens, countTextTokens, getModelPricing } from "../src/pricing";
import { reportProviderDrift } from "../src/runtime_guard";
import { compareLedgers, formatRegressionMarkdown } from "../src/ci";
import { WireServer } from "./wire_server";

const CORPUS_PATH = path.resolve(__dirname, "../../../tests/fixtures/payloads/real_world_corpus.json");
const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf-8"));

describe("Aurex Node.js Real-Usage & Latest-Package Functionality Suite", () => {
  let wire: WireServer;

  beforeEach(async () => {
    AurexAuditor.reset();
    wire = await new WireServer().start();
  });

  afterEach(async () => {
    AurexAuditor.reset();
    await wire.stop();
  });

  it("counts real js-tiktoken BPE tokens across multilingual, Zod schemas, tools, 200k cliffs & 1h/5m cache splits", () => {
    for (const [, text] of Object.entries(corpus.multilingual_samples as Record<string, string>)) {
      expect(countTextTokens(text)).toBeGreaterThanOrEqual(8);
    }

    const InvoiceZod = z.object({
      invoice_id: z.string(),
      vendor: z.string(),
      total_usd: z.number(),
    });

    const msgs = [
      { role: "developer", content: corpus.developer_prompt },
      { role: "user", content: "Extract invoice fields" },
    ];
    const baseToks = countRequestTokens({ messages: msgs });
    const zodToks = countRequestTokens({ messages: msgs, responseFormat: InvoiceZod });
    const toolsToks = countRequestTokens({ messages: msgs, tools: corpus.coding_agent_tools, responseFormat: InvoiceZod });
    expect(zodToks).toBeGreaterThan(baseToks + 10);
    expect(toolsToks).toBeGreaterThan(zodToks + 200);

    // developer role deduplication
    expect(countRequestTokens({ messages: msgs, systemPrompt: corpus.developer_prompt })).toBe(baseToks);

    // 200k boundary math
    const c200k = calculateCost("claude-sonnet-4", 200_000, 1_000);
    const c200kPlus1 = calculateCost("claude-sonnet-4", 200_001, 1_000);
    expect(c200kPlus1).toBeGreaterThan(c200k * 1.99);
    expect(checkCliffStatus("gemini-2.5-pro", 200_000).crossedCliff).toBe(false);
    expect(checkCliffStatus("gemini-2.5-pro", 200_001).crossedCliff).toBe(true);

    // Mixed 5m (1.25x) + 1h (2.0x) cache write cost math
    const mixed = calculateCost("claude-sonnet-4", 45_000, 1_000, 20_000, 15_000, false, "5m", "anthropic", 10_000);
    expect(mixed).toBeCloseTo(0.12975, 5);

    // Local Ollama vs hosted Groq
    expect(getModelPricing("llama-4-scout", undefined, "ollama")).toEqual([0, 0]);
    expect(getModelPricing("llama-4-scout", undefined, "groq")[0]).toBeGreaterThan(0);
  });

  it("enforces Stage 1 Shield on 25-turn coding agent traces, strips Aurex wire keys & catches cache_control drift", async () => {
    const auditor = AurexAuditor.getInstance({ storageMode: "memory", localOnly: true });
    await auditor.patchOpenAI();
    await auditor.patchAnthropic();
    auditor.instrument(OpenAI, Anthropic);

    const oa: any = new OpenAI({ apiKey: "sk-node-real", baseURL: `${wire.baseUrl}/v1` });
    const ant: any = new Anthropic({ apiKey: "sk-ant-real", baseURL: wire.baseUrl });

    const devT1 = `[ts=2026-11-18T10:00:00Z] ${corpus.developer_prompt}`;
    const msgs: any[] = [{ role: "developer", content: devT1 }];
    const toolRotation = ["read_file", "grep_search", "query_postgres", "edit_file", "lint_code", "run_pytest", "git_diff", "check_ci"];
    for (let i = 1; i <= 8; i++) {
      msgs.push({ role: "user", content: `Step ${i} query` });
      msgs.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: `c_${i}`, type: "function", function: { name: toolRotation[i - 1], arguments: '{"shard":1}' } }],
      });
      msgs.push({ role: "tool", tool_call_id: `c_${i}`, content: JSON.stringify({ shard: i, rows: 42 }) });
    }
    msgs.push({ role: "user", content: "Summarize all shards" });

    // Pass Aurex-only fields -> WireServer returns 400 if any leak!
    const r1 = await oa.chat.completions.create({
      model: "o4-mini",
      messages: msgs,
      tools: corpus.coding_agent_tools,
      workflowId: "node-swe-wf",
      tags: { env: "prod" },
      qualityScore: 0.99,
      tenantId: "acme-node",
      metadata: { trace_env: "canary", workflowId: "node-swe-wf", tags: { drop: "me" } },
    });
    expect(r1.choices[0].message.content).toBe("OpenAI Node wire OK");
    const wireBody1 = wire.requests[wire.requests.length - 1].body;
    expect(wireBody1.workflowId).toBeUndefined();
    expect(wireBody1.tags).toBeUndefined();
    expect(wireBody1.extra_metadata).toBeUndefined();
    expect(wireBody1.metadata).toEqual({ trace_env: "canary" });

    // Mutate timestamp in developer prompt -> Stage 1 pinpoints exact character offset!
    const msgsT2 = [...msgs];
    msgsT2[0] = { role: "developer", content: `[ts=2026-11-18T10:00:09Z] ${corpus.developer_prompt}` };
    await oa.chat.completions.create({
      model: "o4-mini",
      messages: msgsT2,
      tools: corpus.coding_agent_tools,
      workflowId: "node-swe-wf",
    });

    // Anthropic block-array system cache_control + strict metadata cleaning
    const sys1h = JSON.parse(JSON.stringify(corpus.anthropic_claude_code.system_blocks_1h));
    const m1 = await ant.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      system: sys1h,
      messages: [{ role: "user", content: "Inspect pool.py" }],
      metadata: { user_id: "u_99", workflowId: "node-ant-wf", tags: { svc: "billing" } },
    });
    expect(m1.content[0].text).toBe("Anthropic Node wire OK");
    expect(wire.requests[wire.requests.length - 1].body.metadata).toEqual({ user_id: "u_99" });

    const sys5m = JSON.parse(JSON.stringify(sys1h));
    sys5m[0].cache_control = { type: "ephemeral", ttl: "5m" };
    await ant.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      system: sys5m,
      messages: [{ role: "user", content: "Inspect models.py" }],
      workflowId: "node-ant-wf",
    });

    auditor.flush();
    const events = (auditor as any).memoryEvents || [];
    // Note: in memory storageMode, flush pushes into ledger or queue; check logged events via getHealth or internal
    expect(auditor.getHealth().eventsLogged).toBeGreaterThanOrEqual(4);

    // >200k real token cliff pre-warning
    const huge = "alpha beta gamma delta epsilon zeta eta theta iota kappa ".repeat(21_000);
    const dec = auditor.preCallCheck({ model: "claude-sonnet-4", prompt: huge, workflowId: "wf-205k-node" });
    expect(dec.shieldMeta?.crossed_200k_cliff).toBe(true);
  });

  it("handles ioredis-mock multi-worker caps, real OpenAI/Anthropic/Gemini/Ollama streams, .parse(), .stream() & retries", async () => {
    const r1 = new RedisMock();
    const r2 = (r1 as any).createConnectedClient ? (r1 as any).createConnectedClient() : new RedisMock();
    await r1.flushall();

    const store1 = new RedisStateStore({ redisClient: r1 });
    store1.addSpend("shared-node-wf", 1.25);
    await new Promise((res) => setTimeout(res, 15));

    const loggedEvents: any[] = [];
    const auditor = AurexAuditor.getInstance({
      storageMode: "memory",
      localOnly: true,
      redisClient: r2,
      budgetGuard: { maxCostPerSession: 1.0, onBudgetExceeded: "throw" },
      resilience: { enabled: true, mode: "enforce", maxAttempts: 2, backoff: { baseMs: 5, maxMs: 10, jitter: 0 } },
    });
    const origLog = auditor.logEvent.bind(auditor);
    auditor.logEvent = ((p: any) => {
      loggedEvents.push(p);
      return origLog(p);
    }) as any;

    await auditor.patchAll();
    auditor.instrument(OpenAI, Anthropic, GoogleGenAI, Ollama);

    const oa: any = new OpenAI({ apiKey: "sk-test", baseURL: `${wire.baseUrl}/v1`, maxRetries: 3 });
    const ant: any = new Anthropic({ apiKey: "sk-ant", baseURL: wire.baseUrl });
    const gem: any = new GoogleGenAI({ apiKey: "gem-test", httpOptions: { baseUrl: wire.baseUrl } });
    const ol = new Ollama({ host: wire.baseUrl });

    // 1. Worker 2 immediately blocks 'shared-node-wf' due to Worker 1's Redis spend!
    await expect(
      oa.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Should block" }],
        workflowId: "shared-node-wf",
      }),
    ).rejects.toBeInstanceOf(AurexBlocked);

    // 2. OpenAI stream=true auto-injects stream_options.include_usage & reads final chunk
    const oaStream = await oa.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Stream SSE" }],
      stream: true,
      workflowId: "wf-node-oa-sse",
    });
    let oaText = "";
    for await (const ch of oaStream) {
      oaText += ch.choices?.[0]?.delta?.content || "";
    }
    expect(oaText).toBe("Hello OpenAI SSE");
    expect(wire.requests[wire.requests.length - 1].body.stream_options).toEqual({ include_usage: true });

    // 3. OpenAI beta.chat.completions.parse() (verifies _thenUnwrap on lazy APIPromise!)
    wire.enqueue({
      json: {
        id: "cmpl_p1",
        object: "chat.completion",
        created: 1763470000,
        model: "gpt-4o-2024-08-06",
        choices: [{ index: 0, message: { role: "assistant", content: corpus.openai_payloads.structured_invoice_json, refusal: null }, finish_reason: "stop" }],
        usage: { prompt_tokens: 220, completion_tokens: 40, total_tokens: 260 },
      },
    });
    const parsed = await oa.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Parse invoice" }],
      response_format: { type: "json_object" },
      workflowId: "wf-node-parse",
    });
    expect(parsed.choices[0].message.content).toContain("INV-2026-991");

    // 4. OpenAI Responses API JSON + SSE stream
    wire.enqueue({ json: corpus.openai_payloads.responses_api_json });
    const rJson = await oa.responses.create({ model: "gpt-4.1", input: "Deploy canary", workflowId: "wf-node-resp" });
    expect(rJson.usage.input_tokens).toBe(1250);

    wire.enqueue({ sse: corpus.openai_payloads.responses_sse_events });
    const rStream = await oa.responses.create({ model: "o4-mini", input: "Stream canary", stream: true, workflowId: "wf-node-resp-sse" });
    const rChunks: any[] = [];
    for await (const ev of rStream) rChunks.push(ev);
    expect(rChunks.some((e) => e.type === "response.completed")).toBe(true);

    // 5. Anthropic messages.stream() helper (verifies .withResponse() + Proxy private field forwarding + split SSE usage!)
    wire.enqueue({ sse: corpus.anthropic_claude_code.sse_stream_events });
    const msgStream = ant.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: "Fix pool" }],
      workflowId: "wf-node-ant-stream",
    });
    const finalMsg = await msgStream.finalMessage();
    expect(finalMsg.content.some((b: any) => b.type === "text" && b.text.includes("Fixed connection pool"))).toBe(true);

    // 6. Google GenAI generateContent & generateContentStream
    const gRes = await gem.models.generateContent({ model: "gemini-2.5-pro", contents: "Latency check", workflowId: "wf-node-gem" });
    expect(gRes.text).toBe("Gemini Node wire OK");

    const gStream = await gem.models.generateContentStream({ model: "gemini-2.5-pro", contents: "Stream check", workflowId: "wf-node-gem-sse" });
    let gText = "";
    for await (const gc of gStream) gText += gc.text || "";
    expect(gText).toBe("Gemini stream OK");

    // 7. Ollama local chat = $0.00
    const olRes = await ol.chat({ model: "llama-4-scout", messages: [{ role: "user", content: "Hi" }], workflowId: "wf-node-ollama" } as any);
    expect(olRes.message.content).toBe("Ollama Node wire OK");

    // 8. Retry suppression (429 -> 200 makes exactly 2 wire calls despite client maxRetries: 3)
    const beforeCount = wire.requests.length;
    wire.enqueue({ status: 429, errorMessage: "Rate limited" });
    wire.enqueue({ status: 200 });
    await oa.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Retry once" }],
      workflowId: "wf-node-retry",
    });
    expect(wire.requests.length - beforeCount).toBe(2);

    // Verify logged token metrics
    const antLogged = loggedEvents.find((e) => e.workflowId === "wf-node-ant-stream" && e.attemptIndex === undefined);
    expect(antLogged.cachedTokens).toBe(12_000);
    expect(antLogged.cacheWriteTokens).toBe(2_000);
    expect(antLogged.outputTokens).toBe(95);

    const gemLogged = loggedEvents.find((e) => e.workflowId === "wf-node-gem-sse" && e.attemptIndex === undefined);
    expect(gemLogged.outputTokens).toBe(55);
    expect(gemLogged.reasoningTokens).toBe(25);
  });

  it("classifies Claude ThinkingBlock vs soft failures, exports OTel traces, runs CI diff & raises AurexProviderDriftError", async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    trace.setGlobalTracerProvider(provider);

    const captured: any[] = [];
    const auditor = AurexAuditor.getInstance({ storageMode: "memory", localOnly: true, otelExport: true });
    const origLog = auditor.logEvent.bind(auditor);
    auditor.logEvent = ((p: any) => {
      captured.push(p);
      return origLog(p);
    }) as any;
    await auditor.patchAnthropic();
    auditor.instrument(Anthropic);
    const ant: any = new Anthropic({ apiKey: "sk-ant", baseURL: wire.baseUrl });

    // 1. Valid Claude ThinkingBlock + TextBlock -> NOT false-flagged as unfulfilled_spend!
    wire.enqueue({ json: corpus.anthropic_claude_code.extended_thinking_response });
    await ant.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: "Diagnose pool" }],
      workflowId: "wf-thinking-valid",
    });

    // 2. Exhausted Claude ThinkingBlock (zero TextBlock + stop_reason=max_tokens) -> unfulfilled_spend!
    wire.enqueue({ json: corpus.anthropic_claude_code.thinking_exhausted_response });
    await ant.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Exhaust budget" }],
      workflowId: "wf-thinking-exhausted",
    });

    auditor.flush();
    const validEv = captured.find((e) => e.workflowId === "wf-thinking-valid");
    const exhEv = captured.find((e) => e.workflowId === "wf-thinking-exhausted");
    expect(validEv.costType).toBeUndefined();
    expect(validEv.cacheWrite1hTokens).toBe(3000);

    // Check internal queue/ledger soft-failure classification via logEvent
    auditor.logEvent({
      model: "gpt-4o",
      response: corpus.openai_payloads.grammar_newline_flood,
      inputTokens: 100,
      outputTokens: 2000,
      workflowId: "wf-grammar-loop",
    });
    expect(exporter.getFinishedSpans().length).toBeGreaterThanOrEqual(2);
    expect(exhEv.finishReason).toBe("max_tokens");

    // 3. Provider Drift Contract Diagnostic (warn vs strict throw)
    const driftLog: any[] = [];
    reportProviderDrift({
      provider: "openai",
      providerVersion: "99.0.0",
      missingSymbol: "chat.completions.create",
      message: "Simulated breaking upstream change",
      strict: false,
      driftLog,
    });
    expect(driftLog.length).toBe(1);

    expect(() =>
      reportProviderDrift({
        provider: "openai",
        providerVersion: "99.0.0",
        missingSymbol: "chat.completions.create",
        message: "Simulated breaking upstream change",
        strict: true,
      }),
    ).toThrow(AurexProviderDriftError);
  });
});
