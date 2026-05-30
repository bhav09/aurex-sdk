/**
 * CI gate — scan local ledger for waste heuristics.
 */

import * as fs from "fs";
import * as path from "path";

export interface CiConfig {
  mode?: "warn" | "block";
  max_waste_percentage?: number;
  ledgerPath?: string;
}

export interface CiIssue {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  detail: string;
}

export function loadCiConfig(cwd: string = process.cwd()): CiConfig {
  const configPath = path.join(cwd, ".aurex", "config.json");
  if (!fs.existsSync(configPath)) return { mode: "warn", max_waste_percentage: 30 };
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { mode: "warn", max_waste_percentage: 30, ...(raw.ci || {}) };
  } catch {
    return { mode: "warn", max_waste_percentage: 30 };
  }
}

export function runCiScan(config: CiConfig): { issues: CiIssue[]; wastePct: number; totalCost: number } {
  const ledgerPath = config.ledgerPath || path.join(".aurex", "ledger.jsonl");
  if (!fs.existsSync(ledgerPath)) {
    return { issues: [], wastePct: 0, totalCost: 0 };
  }
  const lines = fs.readFileSync(ledgerPath, "utf-8").split("\n").filter(Boolean);
  const events: any[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  const llmEvents = events.filter((e) => e.cost_type !== "outcome_signal");
  const totalCost = llmEvents.reduce((s, e) => s + (e.cost || 0), 0);
  const retryCost = llmEvents
    .filter((e) => (e.retry_count || 0) > 0)
    .reduce((s, e) => s + (e.cost || 0), 0);
  const wastePct = totalCost > 0 ? (retryCost / totalCost) * 100 : 0;

  const issues: CiIssue[] = [];
  if (wastePct > (config.max_waste_percentage ?? 30)) {
    issues.push({
      severity: "CRITICAL",
      title: "Retry waste exceeds threshold",
      detail: `Retry-related spend is ${wastePct.toFixed(1)}% of total (max ${config.max_waste_percentage}%)`,
    });
  }

  const byWorkflow: Record<string, number> = {};
  for (const e of llmEvents) {
    const wf = e.workflow_id || "default";
    byWorkflow[wf] = (byWorkflow[wf] || 0) + (e.cost || 0);
  }
  const top = Object.entries(byWorkflow).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > totalCost * 0.5 && totalCost > 1) {
    issues.push({
      severity: "HIGH",
      title: "Workflow concentration risk",
      detail: `Workflow '${top[0]}' accounts for ${((top[1] / totalCost) * 100).toFixed(0)}% of spend`,
    });
  }

  return { issues, wastePct, totalCost };
}

export function formatGithubComment(result: ReturnType<typeof runCiScan>): string {
  const lines = ["## Aurex CI Report", ""];
  lines.push(`- Total tracked cost: $${result.totalCost.toFixed(4)}`);
  lines.push(`- Estimated retry waste: ${result.wastePct.toFixed(1)}%`);
  if (result.issues.length === 0) {
    lines.push("", "No issues above configured thresholds.");
  } else {
    lines.push("", "### Issues");
    for (const i of result.issues) {
      lines.push(`- **${i.severity}** ${i.title}: ${i.detail}`);
    }
  }
  return lines.join("\n");
}
