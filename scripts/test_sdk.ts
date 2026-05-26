import fs from "fs";
import path from "path";
import { AurexAuditor } from "../sdk/node/src/index.ts";
import { LocalHeuristicsEngine } from "../sdk/node/src/heuristics.ts";

async function runNodeTest() {
  const ledgerPath = ".aurex/node_test_ledger.jsonl";
  
  if (fs.existsSync(ledgerPath)) {
    fs.unlinkSync(ledgerPath);
  }

  console.log("🚀 Initializing Aurex Node.js/TypeScript SDK...");
  const auditor = AurexAuditor.getInstance({
    ledgerPath,
    flushIntervalMs: 200,
  });

  console.log("📝 Simulating Node LLM Events...");

  // 1. Simulate Redundant System Prompts (3 calls with identical system prompt)
  const systemPrompt = "You are a helpful assistant. Act extremely professional and verbose.";
  for (let i = 0; i < 3; i++) {
    auditor.logEvent({
      model: "gpt-4o",
      prompt: "Tell me a long joke about VCs.",
      response: "Why did the VC cross the road? To fund the other side!",
      inputTokens: 1000,
      outputTokens: 150,
      workflowId: "wf-node-redundant-prompts",
      systemPrompt,
    });
  }

  // 2. Simulate runaway loops (input tokens doubling: 100 -> 260 -> 680)
  const contexts = [100, 260, 680];
  for (const c of contexts) {
    auditor.logEvent({
      model: "claude-3-5-sonnet",
      prompt: "Let's continue this conversation",
      response: "Ok",
      inputTokens: c,
      outputTokens: 20,
      workflowId: "wf-node-runaway-loop",
      systemPrompt: "Pruning context system prompt",
    });
  }

  // 3. Simulate expensive model misuse (simple requests < 500 in, < 100 out on > $2.00 model)
  for (let i = 0; i < 4; i++) {
    auditor.logEvent({
      model: "gpt-4o",
      prompt: `ping ${i}`,
      response: "pong",
      inputTokens: 50,
      outputTokens: 10,
      workflowId: "wf-node-expensive-misuse",
      systemPrompt: "Short prompt system",
    });
  }

  console.log("⏳ Flushing queue...");
  // Wait for flush
  await new Promise(resolve => setTimeout(resolve, 800));
  auditor.shutdown();

  // --- VERIFICATION ---
  console.log("\n--- 🛡️ VERIFYING ZERO-TRUST PAYLOAD GUARANTEE ---");
  if (!fs.existsSync(ledgerPath)) {
    console.error("❌ Error: Ledger file not created!");
    process.exit(1);
  }

  const content = fs.readFileSync(ledgerPath, "utf-8");
  const lines = content.split("\n");
  let rawLeaked = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const evt = JSON.parse(trimmed);

    // Assert no raw strings of prompt or response are present!
    for (const field of ["prompt", "response", "systemPrompt", "system_prompt"]) {
      if (evt[field]) {
        console.error(`❌ Failure: Raw field '${field}' leaked into ledger event: ${evt[field]}`);
        rawLeaked = true;
      }
    }

    // Assert hashes exist instead
    if (!evt.prompt_hash || !evt.system_prompt_hash || !evt.response_hash) {
      console.error(`❌ Failure: Missing cryptographic hashes in event:`, evt);
      rawLeaked = true;
    }
  }

  if (rawLeaked) {
    console.error("❌ Zero-Trust test failed! Raw prompt/response values leaked into the ledger.");
    process.exit(1);
  } else {
    console.log("✅ Zero-Trust Guarantee fully verified: No raw prompts, responses, or system prompts found in the ledger!");
    console.log("✅ Cryptographic hashes (SHA-256) correctly populated.");
  }

  console.log("\n--- 🧠 VERIFYING LOCAL HEURISTICS & CREDIT SCORE ENGINE ---");
  const engine = new LocalHeuristicsEngine(ledgerPath);
  const report = engine.analyze();

  console.log(`  • Total Events audited:  ${report.total_events}`);
  console.log(`  • Total calculated cost: $${report.total_cost.toFixed(4)}`);
  console.log(`  • Local Wasted Cost:     $${report.wasted_cost.toFixed(4)}`);
  console.log(`  • Waste Percentage:      ${report.waste_percentage}%`);
  console.log(`  • Local Credit Score:    ${report.credit_score} / 100`);

  // Verify heuristics are flagged
  const foundIssues = report.issues.map(issue => issue.issue_type);
  const expectedIssues = ["redundant_system_prompt", "agent_loop", "over_provisioned_model"];
  
  const missing = expectedIssues.filter(exp => !foundIssues.includes(exp));
  if (missing.length > 0) {
    console.error(`❌ Failure: Expected heuristics not detected locally:`, missing);
    process.exit(1);
  } else {
    console.log("✅ Local Heuristics engine successfully flagged loops, redundant prompts, and model misuse!");
    console.log("✅ Local Credit Score successfully computed entirely offline.");
  }

  // Clean up
  fs.unlinkSync(ledgerPath);
  console.log("\n🎉 ALL NODE SDK CORE FUNCTIONALITY VALIDATED SUCCESSFULLY!");
  process.exit(0);
}

runNodeTest().catch(err => {
  console.error("❌ Node test run failed:", err);
  process.exit(1);
});
