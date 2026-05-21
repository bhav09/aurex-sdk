import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { AuditTracker, recordToUsageRow, type AuditResult } from "../src/audit.js";
import { unionHeaderKeys, resolveHeaderMap } from "../src/columns.js";
import { initModelCatalog } from "../src/catalog.js";
import { LocalHeuristicsEngine } from "../sdk/node/src/heuristics.ts";

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let ledgerPath = "";
  let csvPath = "";
  let failUnder = 0;
  let maxWaste = Infinity;
  let maxSpend = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ledger") {
      ledgerPath = args[i + 1] || ".aurex/ledger.jsonl";
      i++;
    } else if (args[i] === "--fail-under") {
      failUnder = parseInt(args[i + 1], 10) || 0;
      i++;
    } else if (args[i] === "--max-waste-usd") {
      maxWaste = parseFloat(args[i + 1]) || Infinity;
      i++;
    } else if (args[i] === "--max-spend-usd") {
      maxSpend = parseFloat(args[i + 1]) || Infinity;
      i++;
    } else if (!args[i].startsWith("-")) {
      // Positional argument
      if (args[i].endsWith(".csv") || args[i].endsWith(".json")) {
        csvPath = args[i];
      }
    }
  }

  // Handle local ledger audit & build breaking mode
  if (ledgerPath || (args.includes("check") && fs.existsSync(".aurex/ledger.jsonl"))) {
    const finalLedger = ledgerPath || ".aurex/ledger.jsonl";
    if (!fs.existsSync(finalLedger)) {
      console.error(`\x1b[93m[Aurex Warning] Local ledger not found at: ${finalLedger}\x1b[0m`);
      process.exit(1);
    }

    const engine = new LocalHeuristicsEngine(finalLedger);
    const report = engine.analyze();

    const scoreColor = report.credit_score >= 85 ? "\x1b[92m" : report.credit_score >= 70 ? "\x1b[93m" : "\x1b[91m";

    console.log("\n" + "=" .repeat(55));
    console.log(`      🛡️  Aurex Local FinOps Audit Report`);
    console.log("=" .repeat(55));
    console.log(`  • Local Ledger File:    ${finalLedger}`);
    console.log(`  • Total LLM Requests:   ${report.total_events.toLocaleString()}`);
    console.log(`  • Total Spend USD:      $${report.total_cost.toFixed(4)}`);
    console.log(`  • Wasted Spend USD:     $${report.wasted_cost.toFixed(4)}`);
    console.log(`  • Waste Ratio:          ${report.waste_percentage}%`);
    console.log(`  • Token Credit Score:   ${scoreColor}${report.credit_score} / 100\x1b[0m`);
    console.log("=" .repeat(55));

    if (report.issues.length > 0) {
      console.log("\n🔎 Detected Waste Drivers:");
      report.issues.slice(0, 5).forEach((issue, idx) => {
        const sevColor = issue.severity === "CRITICAL" ? "\x1b[91m" : "\x1b[93m";
        console.log(`  ${idx + 1}. ${sevColor}[${issue.severity}]\x1b[0m \x1b[1m${issue.title}\x1b[0m (-$${issue.cost_impact.toFixed(2)})`);
        console.log(`     └─ ${issue.summary}`);
        console.log(`     └─ CTA: \x1b[96m${issue.cta}\x1b[0m`);
      });
      if (report.issues.length > 5) {
        console.log(`  ... and ${report.issues.length - 5} more issues.`);
      }
    } else {
      console.log("\n\x1b[92m🎉 Excellent! No cost leakage or loop risks detected in the ledger.\x1b[0m");
    }
    console.log("=" .repeat(55));

    // CI/CD Build Breaker Evaluation
    let failed = false;
    const failReasons: string[] = [];

    if (failUnder > 0 && report.credit_score < failUnder) {
      failed = true;
      failReasons.push(`Credit Score (${report.credit_score}) is below the required threshold of ${failUnder}.`);
    }
    if (report.wasted_cost > maxWaste) {
      failed = true;
      failReasons.push(`Wasted cost ($${report.wasted_cost.toFixed(4)}) exceeds the maximum allowed waste of $${maxWaste.toFixed(4)}.`);
    }
    if (report.total_cost > maxSpend) {
      failed = true;
      failReasons.push(`Total spend ($${report.total_cost.toFixed(4)}) exceeds the maximum budget of $${maxSpend.toFixed(4)}.`);
    }

    if (failed) {
      console.log("\n\x1b[91m🚨 BUILD BREAKER TRIPPED! CI/CD Audit Failed:\x1b[0m");
      failReasons.forEach(reason => console.log(`  ❌ ${reason}`));
      console.log("\nPlease optimize your LLM orchestration (e.g. enable caching, prune context) before deploying.");
      console.log("=" .repeat(55) + "\n");
      process.exit(1);
    } else {
      console.log("\n\x1b[92m✅ CI/CD BUILD PASSED. Cost & efficiency policies are fully satisfied.\x1b[0m\n");
      process.exit(0);
    }
  }

  // Legacy CSV Mode if ledger is not run
  const filePath = csvPath || args[0];
  if (!filePath) {
    console.error("\x1b[93mUsage:\x1b[0m");
    console.error("  npx tsx cli/index.ts <path-to-usage.csv>");
    console.error("  npx tsx cli/index.ts --ledger <path-to-ledger.jsonl> [options]");
    console.error("\n\x1b[93mOptions:\x1b[0m");
    console.error("  --fail-under <score>       Fails build if Token Credit Score is below score");
    console.error("  --max-waste-usd <amount>    Fails build if cost waste in USD is above amount");
    console.error("  --max-spend-usd <amount>    Fails build if total cost in USD is above budget");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  await initModelCatalog();

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const ext = filePath.split(".").pop()?.toLowerCase();
  
  let records: Record<string, unknown>[] = [];
  
  if (ext === "json") {
    let data = JSON.parse(fileContent) as any;
    if (!Array.isArray(data)) {
      if (data && typeof data === "object") {
        if (Array.isArray(data.data)) data = data.data;
        else if (Array.isArray(data.rows)) data = data.rows;
        else if (Array.isArray(data.items)) data = data.items;
      }
    }
    if (!Array.isArray(data)) {
      throw new Error("JSON must be an array of objects or { data: [...] }.");
    }
    records = data;
  } else {
    const parsed = Papa.parse<Record<string, unknown>>(fileContent, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length) {
      console.error("CSV Parse Errors:", parsed.errors);
    }
    records = parsed.data;
  }

  if (records.length === 0) {
    console.log("No valid records found.");
    return;
  }

  const tracker = new AuditTracker();
  const headers = unionHeaderKeys(records);
  const map = resolveHeaderMap(headers);

  if (!map) {
    console.error("Could not detect required columns (need timestamp + model).");
    process.exit(1);
  }

  const headerNorms = new Set(headers.map((h) => h.trim().toLowerCase()));

  for (const rec of records) {
    const row = recordToUsageRow(rec, map, headerNorms);
    if (row) tracker.addUsageRow(row);
  }

  const auditResult = tracker.finalize();
  console.log(generateMarkdownReport(auditResult));
}

function generateMarkdownReport(audit: AuditResult): string {
  let md = `## Aurex Token Audit Report\n\n`;
  md += `- **Requests Parsed:** ${audit.rowCount.toLocaleString()}\n`;
  md += `- **Estimated Spend:** $${audit.estCostUSD.toFixed(2)}\n`;
  md += `- **Exact-match Duplicates:** ${audit.duplicates.length} groups\n`;
  md += `- **Burst Windows:** ${audit.runaways.length}\n`;
  
  if (audit.insights.length > 0) {
    md += `\n### Key Insights\n`;
    for (const insight of audit.insights) {
      md += `- ${insight}\n`;
    }
  }

  if (audit.modelMismatches.length > 0) {
    md += `\n### Potential Downgrade Savings: ~$${audit.potentialDowngradeSavingsUSD.toFixed(2)}\n`;
  }
  
  return md;
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
