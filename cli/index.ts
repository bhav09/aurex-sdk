import fs from "fs";
import Papa from "papaparse";
import { AuditTracker, recordToUsageRow, type AuditResult } from "../src/audit.js";
import { unionHeaderKeys, resolveHeaderMap } from "../src/columns.js";
import { initModelCatalog } from "../src/catalog.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx cli/index.ts <path-to-usage.csv>");
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
  
  // Note: Skipping semantic clusters in basic CLI for now to avoid WASM/Node compatibility issues with Transformers.js.
  // It can be added later if needed.

  console.log(generateMarkdownReport(auditResult));
}

function generateMarkdownReport(audit: AuditResult): string {
  let md = `## Lumina Token Audit Report\n\n`;
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
