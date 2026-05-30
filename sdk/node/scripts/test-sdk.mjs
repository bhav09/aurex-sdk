/**
 * SDK integration smoke test (run with AUREX_API_KEY set).
 * Usage: AUREX_API_KEY=... AUREX_BASE_URL=http://localhost:8000/api/v1 node scripts/test-sdk.mjs
 */

import { AurexAuditor } from "../dist/index.js";

const API_KEY = process.env.AUREX_API_KEY;
const BASE = (process.env.AUREX_BASE_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");

if (!API_KEY) {
  console.error("Set AUREX_API_KEY");
  process.exit(1);
}

const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`✓ ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, pass: false, detail });
  console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
}

async function http(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

// --- Direct API probes ---
console.log("\n--- Backend API ---\n");

const health = await fetch(`${BASE.replace("/api/v1", "")}/health`.replace("http://localhost:8000/api/v1", "http://localhost:8000"));
// fix health url
const healthRes = await fetch("http://localhost:8000/health");
if (healthRes.ok) ok("GET /health");
else fail("GET /health", String(healthRes.status));

const ledgerBody = {
  events: [
    {
      timestamp: new Date().toISOString(),
      provider: "openai",
      model: "gpt-4o-mini",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.001,
      workflow_id: "sdk_smoke_test",
      outcome: "pending",
    },
  ],
};
const ledger = await http("POST", "/ledger/events", ledgerBody);
if (ledger.status === 200 && ledger.json?.accepted >= 1) {
  ok("POST /ledger/events", `accepted=${ledger.json.accepted}`);
} else if (ledger.status === 400 && String(ledger.json?.detail || "").includes("project")) {
  fail("POST /ledger/events", "key not bound to project — use Phase 1 key from /app/api-keys");
} else if (ledger.status === 401) {
  fail("POST /ledger/events", "unauthorized — invalid or revoked key");
} else {
  fail("POST /ledger/events", `${ledger.status} ${JSON.stringify(ledger.json)}`);
}

const sdkLegacy = await http("POST", "/sdk/events", {
  project: "sdk_smoke",
  events: [
    {
      timestamp: new Date().toISOString(),
      provider: "openai",
      model: "gpt-4o-mini",
      input_tokens: 10,
      output_tokens: 5,
      cost: 0.0001,
      workflow_id: "sdk_smoke_legacy",
    },
  ],
});
if (sdkLegacy.status === 200) ok("POST /sdk/events (legacy)", JSON.stringify(sdkLegacy.json).slice(0, 80));
else fail("POST /sdk/events (legacy)", `${sdkLegacy.status} ${JSON.stringify(sdkLegacy.json)}`);

// --- SDK class ---
console.log("\n--- AurexAuditor ---\n");

const auditor = AurexAuditor.getInstance({
  apiKey: API_KEY,
  cloudSync: true,
  localOnly: false,
  baseUrl: BASE,
  ledgerPath: ".aurex/test-ledger.jsonl",
  flushIntervalMs: 500,
});

auditor.markSuccess("sdk_smoke_test", { testRun: true });
auditor.markFailure("sdk_smoke_fail", "synthetic_timeout", { retries: 1 });
auditor.logEvent({
  model: "gpt-4o-mini",
  inputTokens: 200,
  outputTokens: 80,
  workflowId: "sdk_smoke_test",
  retryCount: 0,
});

const decision = auditor.preCallCheck({
  model: "gpt-4o",
  prompt: "Say hi",
  systemPrompt: "You are helpful",
  workflowId: "sdk_smoke_test",
  messages: [{ role: "user", content: "Say hi" }],
});
if (decision && decision.action) {
  ok("preCallCheck returns AurexDecision", `action=${decision.action}`);
} else {
  fail("preCallCheck", "missing decision");
}

auditor.flush();
await new Promise((r) => setTimeout(r, 1500));
auditor.shutdown();

import fs from "fs";
const ledgerPath = ".aurex/test-ledger.jsonl";
if (fs.existsSync(ledgerPath)) {
  const lines = fs.readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean);
  const hasOutcome = lines.some((l) => {
    try {
      const e = JSON.parse(l);
      return e.cost_type === "outcome_signal" || e.outcome === "success";
    } catch {
      return false;
    }
  });
  if (lines.length >= 3 && hasOutcome) ok("local ledger", `${lines.length} events incl. outcome signals`);
  else fail("local ledger", `${lines.length} lines`);
} else {
  fail("local ledger", "file missing");
}

const passed = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n--- ${passed}/${total} passed ---\n`);
process.exit(passed === total ? 0 : 1);
