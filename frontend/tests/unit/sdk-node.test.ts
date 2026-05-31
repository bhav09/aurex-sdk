import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AurexAuditor, getModelPricing, calculateCost, normalizeModelName } from "../../../sdk/node/src/index";
import { LocalHeuristicsEngine } from "../../../sdk/node/src/heuristics";
import fs from "fs";
import path from "path";
import crypto from "crypto";

describe("Node SDK - Core Functions & Pricing", () => {
  it("should normalize model names correctly", () => {
    expect(normalizeModelName("ft:gpt-4o-mini-2024-07-18:my-org::abc123")).toBe("gpt-4o-mini-2024-07-18");
    expect(normalizeModelName("models/gemini-1.5-pro")).toBe("gemini-1.5-pro");
    expect(normalizeModelName("anthropic.claude-3-5-sonnet")).toBe("claude-3-5-sonnet");
  });

  it("should retrieve model pricing correctly", () => {
    const [gpt4oIn, gpt4oOut] = getModelPricing("gpt-4o");
    expect(gpt4oIn).toBe(2.50);
    expect(gpt4oOut).toBe(10.00);

    const [unknownIn, unknownOut] = getModelPricing("nonexistent-model");
    expect(unknownIn).toBe(1.50);
    expect(unknownOut).toBe(6.00);
  });

  it("should calculate cost with cache discounts and batch multipliers", () => {
    // Standard cost: input 10,000 tokens, output 5,000 tokens for gpt-4o ($2.50 / $10.00 per 1M)
    // input = 10000 / 1000000 * 2.50 = 0.025
    // output = 5000 / 1000000 * 10.00 = 0.050
    // total = 0.075
    const stdCost = calculateCost("gpt-4o", 10000, 5000);
    expect(stdCost).toBeCloseTo(0.075, 5);

    // OpenAI cache read (50% discount on cache read tokens)
    // input = 6000 / 1000000 * 2.50 + 4000 / 1000000 * 2.50 * 0.50 = 0.015 + 0.005 = 0.020
    // output = 5000 / 1000000 * 10.00 = 0.050
    // total = 0.070
    const oaiCacheCost = calculateCost("gpt-4o", 10000, 5000, 4000);
    expect(oaiCacheCost).toBeCloseTo(0.070, 5);

    // OpenAI Batch API discount (50% discount overall)
    const batchCost = calculateCost("gpt-4o", 10000, 5000, 0, 0, true);
    expect(batchCost).toBeCloseTo(0.075 * 0.5, 5);
  });
});

describe("Node SDK - AurexAuditor", () => {
  const ledgerPath = path.join(__dirname, "test-ledger.jsonl");

  beforeEach(() => {
    if (fs.existsSync(ledgerPath)) {
      fs.unlinkSync(ledgerPath);
    }
    const pendingPath = path.join(__dirname, "pending.jsonl");
    if (fs.existsSync(pendingPath)) {
      fs.unlinkSync(pendingPath);
    }
    // Clean singleton instance
    (AurexAuditor as any).instance = null;
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    if (fs.existsSync(ledgerPath)) {
      fs.unlinkSync(ledgerPath);
    }
    const pendingPath = path.join(__dirname, "pending.jsonl");
    if (fs.existsSync(pendingPath)) {
      fs.unlinkSync(pendingPath);
    }
    vi.restoreAllMocks();
  });

  it("should locally hash system prompts, prompts, and completions (Zero-PII guarantee)", () => {
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
      flushIntervalMs: 50,
    });

    auditor.logEvent({
      model: "gpt-4o",
      prompt: "secret user input",
      response: "secret assistant response",
      systemPrompt: "secret system prompt",
      inputTokens: 10,
      outputTokens: 5,
    });

    auditor.flush();

    expect(fs.existsSync(ledgerPath)).toBe(true);
    const content = fs.readFileSync(ledgerPath, "utf-8").trim();
    const event = JSON.parse(content);

    expect(event.prompt).toBeUndefined();
    expect(event.response).toBeUndefined();
    expect(event.systemPrompt).toBeUndefined();

    const expectedPromptHash = crypto.createHash("sha256").update("secret user input").digest("hex");
    const expectedResponseHash = crypto.createHash("sha256").update("secret assistant response").digest("hex");
    const expectedSysHash = crypto.createHash("sha256").update("secret system prompt").digest("hex");

    expect(event.prompt_hash).toBe(expectedPromptHash);
    expect(event.response_hash).toBe(expectedResponseHash);
    expect(event.system_prompt_hash).toBe(expectedSysHash);
  });

  it("should trigger budget guard in throw mode", () => {
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
      budgetGuard: {
        maxCostPerMinute: 0.0001,
        onBudgetExceeded: "throw",
      },
    });

    expect(() => {
      auditor.logEvent({
        model: "gpt-4o",
        inputTokens: 50000, // Cost is 50000 / 1000000 * 2.50 = 0.125
        outputTokens: 1000,
      });
    }).toThrow(/Cost per minute limit exceeded/);
  });

  it("should trigger budget guard in warn mode without throwing", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
      budgetGuard: {
        maxCostPerMinute: 0.0001,
        onBudgetExceeded: "warn",
      },
    });

    expect(() => {
      auditor.logEvent({
        model: "gpt-4o",
        inputTokens: 50000,
        outputTokens: 1000,
      });
    }).not.toThrow();

    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("should trigger budget guard in dryRun mode without throwing", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
      budgetGuard: {
        maxCostPerMinute: 0.0001,
        onBudgetExceeded: "throw",
        dryRun: true,
      },
    });

    expect(() => {
      auditor.logEvent({
        model: "gpt-4o",
        inputTokens: 50000,
        outputTokens: 1000,
      });
    }).not.toThrow();

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("DRY RUN"));
  });

  it("should trigger budget guard in webhook mode and make network POST request", async () => {
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
      budgetGuard: {
        maxCostPerMinute: 0.0001,
        onBudgetExceeded: "webhook",
        webhookUrl: "https://example.com/alerts",
      },
    });

    auditor.logEvent({
      model: "gpt-4o",
      inputTokens: 50000,
      outputTokens: 1000,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/alerts",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("budget_exceeded"),
      })
    );
  });
});

describe("Node SDK - LocalHeuristicsEngine", () => {
  const ledgerPath = path.join(__dirname, "test-ledger.jsonl");

  beforeEach(() => {
    if (fs.existsSync(ledgerPath)) {
      fs.unlinkSync(ledgerPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(ledgerPath)) {
      fs.unlinkSync(ledgerPath);
    }
  });

  it("should detect redundant system prompts", () => {
    const events = [
      { id: "e1", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 500, output_tokens: 50, cost: 0.002, system_prompt_hash: "sys1", cached_tokens: 0 },
      { id: "e2", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 500, output_tokens: 50, cost: 0.002, system_prompt_hash: "sys1", cached_tokens: 0 },
      { id: "e3", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 500, output_tokens: 50, cost: 0.002, system_prompt_hash: "sys1", cached_tokens: 0 },
    ];
    fs.writeFileSync(ledgerPath, events.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    const engine = new LocalHeuristicsEngine(ledgerPath);
    const report = engine.analyze();

    const promptIssues = report.issues.filter(i => i.issue_type === "redundant_system_prompt");
    expect(promptIssues.length).toBe(1);
    expect(promptIssues[0].severity).toBe("CRITICAL");
  });

  it("should detect agent runaway loops using the 2.5x exponential growth pattern", () => {
    const now = new Date();
    const events = [
      { id: "e1", timestamp: new Date(now.getTime()).toISOString(), model: "gpt-4o", input_tokens: 60, output_tokens: 50, cost: 0.001, workflow_id: "flow1" },
      { id: "e2", timestamp: new Date(now.getTime() + 1000).toISOString(), model: "gpt-4o", input_tokens: 160, output_tokens: 50, cost: 0.002, workflow_id: "flow1" },
      { id: "e3", timestamp: new Date(now.getTime() + 2000).toISOString(), model: "gpt-4o", input_tokens: 410, output_tokens: 50, cost: 0.004, workflow_id: "flow1" },
    ];
    fs.writeFileSync(ledgerPath, events.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    const engine = new LocalHeuristicsEngine(ledgerPath);
    const report = engine.analyze();

    const loopIssues = report.issues.filter(i => i.issue_type === "agent_loop");
    expect(loopIssues.length).toBe(1);
  });

  it("should detect expensive model misuse for simple inputs", () => {
    const events = [
      { id: "e1", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 100, output_tokens: 10, cost: 0.002, workflow_id: "flow2" },
      { id: "e2", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 100, output_tokens: 10, cost: 0.002, workflow_id: "flow2" },
      { id: "e3", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 100, output_tokens: 10, cost: 0.002, workflow_id: "flow2" },
    ];
    fs.writeFileSync(ledgerPath, events.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    const engine = new LocalHeuristicsEngine(ledgerPath);
    const report = engine.analyze();

    const misuseIssues = report.issues.filter(i => i.issue_type === "over_provisioned_model");
    expect(misuseIssues.length).toBe(1);
  });

  it("should detect context explosion", () => {
    const events = [
      { id: "e1", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 1000, output_tokens: 100, cost: 0.003, workflow_id: "flow3" },
      { id: "e2", timestamp: new Date().toISOString(), model: "gpt-4o", input_tokens: 2200, output_tokens: 100, cost: 0.006, workflow_id: "flow3" },
    ];
    fs.writeFileSync(ledgerPath, events.map(e => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    const engine = new LocalHeuristicsEngine(ledgerPath);
    const report = engine.analyze();

    const explosionIssues = report.issues.filter(i => i.issue_type === "context_explosion");
    expect(explosionIssues.length).toBe(1);
  });
});
