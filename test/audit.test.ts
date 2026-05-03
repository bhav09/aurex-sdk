import { describe, it, expect } from "vitest";
import { AuditTracker, type UsageRow } from "../src/audit";

describe("AuditTracker", () => {
  it("should calculate totals and defaults correctly", () => {
    const tracker = new AuditTracker();
    tracker.addUsageRow({
      timestamp: new Date("2026-04-19T10:00:00Z"),
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    });

    const result = tracker.finalize();
    expect(result.rowCount).toBe(1);
    expect(result.totalInputTokens).toBe(1000);
    expect(result.totalOutputTokens).toBe(500);
    expect(result.hasPromptColumn).toBe(false);
    expect(result.duplicates.length).toBe(0);
    expect(result.runaways.length).toBe(0);
    expect(result.modelMismatches.length).toBe(1); // gpt-4o -> mini
    
    // New features added
    expect(result.timeSeriesData).toBeDefined();
    expect(result.timeSeriesData.length).toBe(1);
    expect(result.modelSpendData).toBeDefined();
    expect(result.modelSpendData.length).toBe(1);
    expect(result.modelSpendData[0].model).toBe("gpt-4o");
  });

  it("should flag duplicates", () => {
    const tracker = new AuditTracker();
    const promptStr = "Write a python script to reverse a string";
    const promptNorm = "write a python script to reverse a string";

    for (let i = 0; i < 5; i++) {
      tracker.addUsageRow({
        timestamp: new Date(`2026-04-19T10:00:0${i}Z`),
        model: "gpt-4o",
        prompt: promptStr,
        promptNorm: promptNorm,
        inputTokens: 15,
        outputTokens: 40,
      });
    }

    const result = tracker.finalize();
    expect(result.rowCount).toBe(5);
    expect(result.hasPromptColumn).toBe(true);
    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].count).toBe(5);
    expect(result.duplicateWasteInputTokens).toBe(60); // 15 * 4 wasted
  });

  it("should flag runaways", () => {
    const tracker = new AuditTracker();
    const ts = new Date("2026-04-19T10:20:00Z"); // same minute

    for (let i = 0; i < 30; i++) { // > 24 threshold
      tracker.addUsageRow({
        timestamp: new Date(ts.getTime() + i * 1000), // 1 second apart
        model: "gpt-4o",
        prompt: "Analyze this",
        promptNorm: "analyze this",
        inputTokens: 15000,
        outputTokens: 500,
      });
    }

    const result = tracker.finalize();
    expect(result.runaways.length).toBe(1);
    expect(result.runaways[0].requests).toBe(30);
    expect(result.runaways[0].peakModel).toBe("gpt-4o");
  });

  it("should flag model mismatches", () => {
    const tracker = new AuditTracker();
    tracker.addUsageRow({
      timestamp: new Date("2026-04-19T10:15:00Z"),
      model: "claude-3-5-sonnet", // premium model
      prompt: "Hello, how are you?",
      promptNorm: "hello, how are you?",
      inputTokens: 10,
      outputTokens: 10,
    });

    const result = tracker.finalize();
    expect(result.modelMismatches.length).toBe(1);
    expect(result.modelMismatches[0].suggestion).toContain("Haiku");
  });
});