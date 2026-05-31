import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AurexAuditor } from "../../../sdk/node/src/index";
import path from "path";
import fs from "fs";

describe("Node SDK - Cloud Integration", () => {
  const ledgerPath = path.join(__dirname, "cloud-test-ledger.jsonl");

  beforeEach(() => {
    if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath);
    AurexAuditor.reset();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    AurexAuditor.reset();
    if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath);
    vi.restoreAllMocks();
  });

  it("flushAndWait writes to ledger in local-only mode", async () => {
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
    });
    auditor.logEvent({ model: "gpt-4o-mini", inputTokens: 10, outputTokens: 5 });
    const ok = await auditor.flushAndWait();
    expect(ok).toBe(true);
    expect(fs.existsSync(ledgerPath)).toBe(true);
  });

  it("getHealth exposes extended cloud integration fields", () => {
    const auditor = AurexAuditor.getInstance({
      ledgerPath,
      localOnly: true,
      perProcessLedger: false,
    });
    const health = auditor.getHealth();
    expect(health).toHaveProperty("status");
    expect(health).toHaveProperty("eventsLogged");
    expect(health).toHaveProperty("eventsDropped");
    expect(health).toHaveProperty("patchStatus");
    expect(health).toHaveProperty("storageMode");
  });

  it("reset allows reconfiguration", () => {
    AurexAuditor.getInstance({ localOnly: true, project: "first" });
    AurexAuditor.reset();
    const auditor = AurexAuditor.getInstance({ localOnly: true, project: "second" });
    expect((auditor as any).config.project).toBe("second");
  });
});
