/**
 * Stage 3: CI gate — scan local ledger & diff against baseline (`main`) ledger.jsonl.
 */

import * as fs from "fs";
import * as path from "path";

export interface CiConfig {
  mode?: "warn" | "block";
  max_waste_percentage?: number;
  max_regression_pct?: number;
  ledgerPath?: string;
  baselinePath?: string;
  failOnRegression?: boolean;
}

export interface CiIssue {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  detail: string;
}

export interface LedgerMetrics {
  totalCost: number;
  llmCalls: number;
  effectiveSuccesses: number;
  costPerSuccess: number | null;
  turnsPerSuccess: number | null;
  inputTokens: number;
  cachedTokens: number;
  cacheHitPct: number;
  cliff200kCalls: number;
  prefixBreaks: number;
  reasoningTokens: number;
  abortedStreams: number;
  unfulfilledSpend: number;
}

export interface RegressionDiff {
  baseline: LedgerMetrics;
  current: LedgerMetrics;
  regressions: string[];
  hasRegression: boolean;
}

function readJsonl(filePath?: string): any[] {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const rows: any[] = [];
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      /* skip malformed line */
    }
  }
  return rows;
}

export function summarizeLedger(filePath: string): LedgerMetrics {
  const events = readJsonl(filePath);
  const m: LedgerMetrics = {
    totalCost: 0,
    llmCalls: 0,
    effectiveSuccesses: 0,
    costPerSuccess: null,
    turnsPerSuccess: null,
    inputTokens: 0,
    cachedTokens: 0,
    cacheHitPct: 0,
    cliff200kCalls: 0,
    prefixBreaks: 0,
    reasoningTokens: 0,
    abortedStreams: 0,
    unfulfilledSpend: 0,
  };

  const wfSigTotal: Record<string, number> = {};
  const wfSigSucc: Record<string, number> = {};
  const wfCallSucc: Record<string, number> = {};
  let unscopedSigTotal = 0;
  let unscopedSigSucc = 0;
  let unscopedCallSucc = 0;

  for (const ev of events) {
    const ct = String(ev.cost_type || "").toLowerCase();
    const out = String(ev.outcome || "").toLowerCase();
    const wf = ev.workflow_id ? String(ev.workflow_id) : "";

    if (ct === "outcome_signal") {
      if (wf) {
        wfSigTotal[wf] = (wfSigTotal[wf] || 0) + 1;
        if (out === "success") wfSigSucc[wf] = (wfSigSucc[wf] || 0) + 1;
      } else {
        unscopedSigTotal += 1;
        if (out === "success") unscopedSigSucc += 1;
      }
      continue;
    }

    const cost = Number(ev.cost ?? ev.cost_usd ?? 0);
    const inToks = Number(ev.input_tokens || 0);
    const cached = Number(ev.cached_tokens || 0);
    const reas = Number(ev.reasoning_tokens || 0);

    m.totalCost += cost;
    m.llmCalls += 1;
    m.inputTokens += inToks;
    m.cachedTokens += cached;
    m.reasoningTokens += reas;

    if (inToks > 200_000) m.cliff200kCalls += 1;
    if (ev.extra_metadata?.aurex_shield?.prefix_broken) m.prefixBreaks += 1;
    if (String(ev.status || "").toLowerCase() === "aborted_stream") m.abortedStreams += 1;
    if (ct === "unfulfilled_spend" || out === "degraded") m.unfulfilledSpend += cost;

    if (wf) {
      if (out === "success") wfCallSucc[wf] = (wfCallSucc[wf] || 0) + 1;
    } else if (out === "success") {
      unscopedCallSucc += 1;
    }
  }

  const allWfs = new Set([...Object.keys(wfSigTotal), ...Object.keys(wfCallSucc)]);
  let succ = 0;
  for (const wf of allWfs) {
    succ += (wfSigTotal[wf] || 0) > 0 ? wfSigSucc[wf] || 0 : wfCallSucc[wf] || 0;
  }
  succ += unscopedSigTotal > 0 ? unscopedSigSucc : unscopedCallSucc;

  m.effectiveSuccesses = succ;
  m.cacheHitPct = m.inputTokens > 0 ? Math.round((m.cachedTokens / m.inputTokens) * 1000) / 10 : 0;
  m.costPerSuccess = succ > 0 ? Math.round((m.totalCost / succ) * 1e6) / 1e6 : null;
  m.turnsPerSuccess = succ > 0 ? Math.round((m.llmCalls / succ) * 100) / 100 : null;
  m.totalCost = Math.round(m.totalCost * 1e6) / 1e6;
  m.unfulfilledSpend = Math.round(m.unfulfilledSpend * 1e6) / 1e6;
  return m;
}

export function compareLedgers(
  currentPath: string,
  baselinePath: string,
  maxRegressionPct = 15.0,
): RegressionDiff {
  const base = summarizeLedger(baselinePath);
  const curr = summarizeLedger(currentPath);
  const regressions: string[] = [];

  if (base.costPerSuccess && curr.costPerSuccess) {
    const deltaPct = ((curr.costPerSuccess - base.costPerSuccess) / base.costPerSuccess) * 100;
    if (deltaPct > maxRegressionPct) {
      regressions.push(
        `Cost per success increased by +${deltaPct.toFixed(1)}% ($${base.costPerSuccess.toFixed(4)} -> $${curr.costPerSuccess.toFixed(4)})`,
      );
    }
  } else if (base.totalCost > 0 && curr.totalCost > base.totalCost * (1 + maxRegressionPct / 100)) {
    const deltaPct = ((curr.totalCost - base.totalCost) / base.totalCost) * 100;
    regressions.push(
      `Total LLM spend increased by +${deltaPct.toFixed(1)}% ($${base.totalCost.toFixed(4)} -> $${curr.totalCost.toFixed(4)})`,
    );
  }

  if (base.cacheHitPct - curr.cacheHitPct > 15.0) {
    regressions.push(
      `Prefix cache hit rate dropped from ${base.cacheHitPct.toFixed(1)}% to ${curr.cacheHitPct.toFixed(1)}%`,
    );
  }
  if (curr.cliff200kCalls > base.cliff200kCalls) {
    regressions.push(
      `New >200k 2x pricing cliff calls introduced (${base.cliff200kCalls} -> ${curr.cliff200kCalls})`,
    );
  }
  if (curr.unfulfilledSpend > base.unfulfilledSpend + 1e-6) {
    regressions.push(
      `Unfulfilled soft-failure spend increased ($${base.unfulfilledSpend.toFixed(4)} -> $${curr.unfulfilledSpend.toFixed(4)})`,
    );
  }

  return { baseline: base, current: curr, regressions, hasRegression: regressions.length > 0 };
}

export function formatRegressionMarkdown(diff: RegressionDiff): string {
  const b = diff.baseline;
  const c = diff.current;
  const bCps = b.costPerSuccess !== null ? `$${b.costPerSuccess.toFixed(4)}` : "n/a";
  const cCps = c.costPerSuccess !== null ? `$${c.costPerSuccess.toFixed(4)}` : "n/a";
  const bTps = b.turnsPerSuccess !== null ? b.turnsPerSuccess.toFixed(2) : "n/a";
  const cTps = c.turnsPerSuccess !== null ? c.turnsPerSuccess.toFixed(2) : "n/a";
  const status = diff.hasRegression ? "⚠️ Regression Detected" : "✅ No Cost Regression";

  const lines = [
    `## Aurex CI FinOps Diff (${status})`,
    "",
    "| Metric | Baseline (`main`) | Current Branch |",
    "| :--- | :---: | :---: |",
    `| Cost per Successful Outcome | ${bCps} | ${cCps} |`,
    `| Turns per Success | ${bTps} | ${cTps} |`,
    `| Prefix Cache Hit % | ${b.cacheHitPct.toFixed(1)}% | ${c.cacheHitPct.toFixed(1)}% |`,
    `| \`>200k\` 2x Cliff Calls | ${b.cliff200kCalls} | ${c.cliff200kCalls} |`,
    `| Reasoning / Thinking Tokens | ${b.reasoningTokens} | ${c.reasoningTokens} |`,
    `| Unfulfilled Soft-Failure Spend | $${b.unfulfilledSpend.toFixed(4)} | $${c.unfulfilledSpend.toFixed(4)} |`,
    `| Total Tracked Spend | $${b.totalCost.toFixed(4)} | $${c.totalCost.toFixed(4)} |`,
  ];
  if (diff.regressions.length > 0) {
    lines.push("", "### Regressions Flagged");
    for (const r of diff.regressions) lines.push(`- ${r}`);
  }
  return lines.join("\n");
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

export function runCiScan(config: CiConfig): {
  issues: CiIssue[];
  wastePct: number;
  totalCost: number;
  diff?: RegressionDiff;
} {
  const ledgerPath = config.ledgerPath || path.join(".aurex", "ledger.jsonl");
  const events = readJsonl(ledgerPath);
  const llmEvents = events.filter((e) => e.cost_type !== "outcome_signal");
  const totalCost = llmEvents.reduce((s, e) => s + Number(e.cost ?? e.cost_usd ?? 0), 0);
  const retryCost = llmEvents
    .filter(
      (e) =>
        (e.retry_count || 0) > 0 ||
        e.cost_type === "unfulfilled_spend" ||
        e.outcome === "degraded",
    )
    .reduce((s, e) => s + Number(e.cost ?? e.cost_usd ?? 0), 0);
  const wastePct = totalCost > 0 ? (retryCost / totalCost) * 100 : 0;

  const issues: CiIssue[] = [];
  if (wastePct > (config.max_waste_percentage ?? 30)) {
    issues.push({
      severity: "CRITICAL",
      title: "Retry & soft-failure waste exceeds threshold",
      detail: `Unfulfilled/retry spend is ${wastePct.toFixed(1)}% of total (max ${config.max_waste_percentage}%)`,
    });
  }

  let diff: RegressionDiff | undefined;
  if (config.baselinePath) {
    diff = compareLedgers(ledgerPath, config.baselinePath, config.max_regression_pct ?? 15.0);
    if (diff.hasRegression) {
      for (const r of diff.regressions) {
        issues.push({
          severity: config.failOnRegression || config.mode === "block" ? "CRITICAL" : "HIGH",
          title: "Baseline regression",
          detail: r,
        });
      }
    }
  }

  return { issues, wastePct, totalCost, diff };
}

export function formatGithubComment(result: ReturnType<typeof runCiScan>): string {
  if (result.diff) {
    return formatRegressionMarkdown(result.diff);
  }
  const lines = ["## Aurex CI Report", ""];
  lines.push(`- Total tracked cost: $${result.totalCost.toFixed(4)}`);
  lines.push(`- Estimated retry/soft-failure waste: ${result.wastePct.toFixed(1)}%`);
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
