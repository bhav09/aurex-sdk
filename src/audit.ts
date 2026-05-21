import {
  resolveHeaderMap,
  normalizePromptText,
  unionHeaderKeys,
} from "./columns";
import {
  estimateCostUSD,
  downgradeHint,
  getPricingFootnote,
} from "./pricing";

export type UsageRow = {
  timestamp: Date;
  model: string;
  prompt?: string;
  promptNorm?: string;
  inputTokens: number;
  outputTokens: number;
  requestId?: string;
};

export type DuplicateGroup = {
  promptPreview: string;
  count: number;
  wastedInputTokens: number;
  models: string[];
};

export type RunawayWindow = {
  start: Date;
  end: Date;
  requests: number;
  estCostUSD: number;
  peakModel?: string;
};

export type ModelMismatchRow = {
  model: string;
  suggestion: string;
  reason: string;
  approxSavingsUSD: number;
  samplePrompt: string;
};

export type SemanticCluster = {
  clusterPreview: string;
  count: number;
  wastedInputTokens: number;
  models: string[];
};

export type AuditResult = {
  rowCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estCostUSD: number;
  hasPromptColumn: boolean;
  duplicates: DuplicateGroup[];
  semanticClusters: SemanticCluster[];
  duplicateWasteInputTokens: number;
  runaways: RunawayWindow[];
  modelMismatches: ModelMismatchRow[];
  potentialDowngradeSavingsUSD: number;
  tokenROI?: { revenueUSD: number; perMillionTokens: number };
  warnings: string[];
  insights: string[];
  timeSeriesData: { timestamp: number; requests: number; estCostUSD: number }[];
  modelSpendData: { model: string; estCostUSD: number }[];
};

const COMPLEX_RE =
  /step[\s-]*by[\s-]*step|chain[\s-]*of[\s-]*thought|formal proof|theorem|prove that|reasoning model|think aloud/i;

function parseTs(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    const d = new Date(v > 1e12 ? v : v * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function recordToUsageRow(
  rec: Record<string, unknown>,
  map: ReturnType<typeof resolveHeaderMap>,
  headerNorms: Set<string>
): UsageRow | null {
  if (!map) return null;

  // Detect if this is a Google Cloud Billing export
  const isGcpBilling =
    headerNorms.has("sku_description") ||
    headerNorms.has("sku description") ||
    headerNorms.has("sku") ||
    headerNorms.has("billing_account_id") ||
    headerNorms.has("billing account id") ||
    String(map.model).toLowerCase().includes("sku");

  let ts: Date | null = null;
  let modelStr = "";
  let inputT = 0;
  let outputT = 0;

  if (isGcpBilling) {
    // 1. Resolve Timestamp
    const tsRaw =
      rec[map.timestamp] ??
      rec["Usage Start Time"] ??
      rec["usage_start_time"] ??
      (rec["usage"] as any)?.usage_start_time;
    ts = parseTs(tsRaw);

    // 2. Resolve Model
    const skuRaw =
      rec[map.model] ??
      rec["SKU Description"] ??
      rec["sku_description"] ??
      rec["sku"];
    let skuStr = "";
    if (skuRaw && typeof skuRaw === "object") {
      const skuObj = skuRaw as any;
      skuStr = String(skuObj.description ?? skuObj.Description ?? skuObj.id ?? "");
    } else if (skuRaw != null) {
      skuStr = String(skuRaw);
    }
    modelStr = extractModelFromSku(skuStr);

    // 3. Resolve Usage Amount & Token Types
    let usageAmount = 0;
    const usageRaw = rec["Usage.Amount"] ?? rec["usage_amount"] ?? rec["usage"];
    if (usageRaw && typeof usageRaw === "object") {
      const usageObj = usageRaw as any;
      usageAmount = num(usageObj.amount ?? usageObj.Amount ?? 0);
    } else {
      usageAmount = num(usageRaw);
    }

    const skuLower = skuStr.toLowerCase();
    if (skuLower.includes("input") || skuLower.includes("prompt")) {
      inputT = usageAmount;
      outputT = 0;
    } else if (
      skuLower.includes("output") ||
      skuLower.includes("completion") ||
      skuLower.includes("candidate")
    ) {
      inputT = 0;
      outputT = usageAmount;
    } else {
      // Default fallback
      inputT = usageAmount;
      outputT = 0;
    }
  } else {
    // Standard execution log mapping
    ts = parseTs(rec[map.timestamp]);
    const rawModel = rec[map.model];
    modelStr = rawModel != null ? String(rawModel).trim() : "";

    inputT = map.input_tokens ? num(rec[map.input_tokens]) : 0;
    outputT = map.output_tokens ? num(rec[map.output_tokens]) : 0;

    if (
      inputT === 0 &&
      outputT === 0 &&
      (headerNorms.has("total_tokens") || headerNorms.has("totaltokens"))
    ) {
      const raw =
        rec["total_tokens"] ?? rec["Total_Tokens"] ?? rec["total token count"];
      const tot = num(raw);
      if (tot > 0) {
        inputT = Math.round(tot * 0.35);
        outputT = Math.max(0, tot - inputT);
      }
    }
  }

  if (!ts || !modelStr) return null;

  const hasPrompt = Boolean(map.prompt);
  const promptRaw = hasPrompt ? rec[map.prompt!] : undefined;
  const promptStr = normalizePromptText(promptRaw);
  const promptNorm = promptStr
    ? promptStr.replace(/\s+/g, " ").trim().toLowerCase()
    : undefined;

  return {
    timestamp: ts,
    model: modelStr,
    prompt: promptStr,
    promptNorm,
    inputTokens: Math.max(0, inputT),
    outputTokens: Math.max(0, outputT),
    requestId:
      map.request_id && rec[map.request_id] != null
        ? String(rec[map.request_id])
        : undefined,
  };
}

function extractModelFromSku(sku: string): string {
  const s = sku.toLowerCase();
  if (s.includes("gemini 1.5 pro")) return "gemini-1.5-pro";
  if (s.includes("gemini 1.5 flash")) return "gemini-1.5-flash";
  if (s.includes("gemini 2.0 flash")) return "gemini-2.0-flash";
  if (s.includes("gemini 2.5 pro")) return "gemini-2.5-pro";
  if (s.includes("gemini 2.5 flash")) return "gemini-2.5-flash";
  if (s.includes("claude 3.5 sonnet")) return "claude-3-5-sonnet";
  if (s.includes("claude 3.7 sonnet")) return "claude-3-7-sonnet";
  if (s.includes("claude 3.5 haiku")) return "claude-3-5-haiku";
  if (s.includes("claude 3 haiku")) return "claude-3-haiku";
  if (s.includes("claude 3 opus")) return "claude-3-opus";
  if (s.includes("gpt 4o mini") || s.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (s.includes("gpt 4o") || s.includes("gpt-4o")) return "gpt-4o";
  if (s.includes("gpt 4 turbo") || s.includes("gpt-4-turbo")) return "gpt-4-turbo";
  if (s.includes("o1")) return "o1";

  return s
    .replace(/\b(input|output|completion|cached|tokens|token|charges|charge)\b/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Parse tabular records (already objects keyed by CSV headers). */
export function recordsToUsageRows(
  records: Record<string, unknown>[]
): { rows: UsageRow[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!records.length) return { rows: [], warnings: ["No rows found."] };

  const headers = unionHeaderKeys(records);
  const map = resolveHeaderMap(headers);
  if (!map) {
    warnings.push(
      "Could not detect required columns (need timestamp + model). Check export format."
    );
    return { rows: [], warnings };
  }

  const hasPrompt = Boolean(map.prompt);
  if (!hasPrompt) {
    warnings.push(
      "No prompt/message column found — redundancy analysis may be limited."
    );
  }

  const rows: UsageRow[] = [];
  const headerNorms = new Set(headers.map((h) => h.trim().toLowerCase()));

  for (const rec of records) {
    const row = recordToUsageRow(rec, map, headerNorms);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (!rows.length) warnings.push("No valid rows after parsing.");
  return { rows, warnings };
}

function heuristicMismatch(
  r: UsageRow,
  suggestion: string
): { ok: boolean; reason: string; savings: number } {
  if (!suggestion) return { ok: false, reason: "", savings: 0 };
  const plen = r.prompt?.length ?? 0;
  if (r.outputTokens > 2048 && plen > 8000) {
    return {
      ok: false,
      reason: "High output / long prompt — review manually.",
      savings: 0,
    };
  }
  if (r.prompt && COMPLEX_RE.test(r.prompt)) {
    return {
      ok: false,
      reason: "Prompt signals heavy reasoning — not auto-flagged.",
      savings: 0,
    };
  }
  if (plen > 6000 && r.outputTokens > 1024) {
    return { ok: false, reason: "Large prompt+output — review manually.", savings: 0 };
  }
  const current = estimateCostUSD(r.model, r.inputTokens, r.outputTokens);
  const savings = current * 0.55;
  return {
    ok: true,
    reason: "Shorter task pattern; cheaper tier may suffice (verify quality).",
    savings,
  };
}

const WINDOW_MS = 60_000;
/** Burst heuristics: many calls or material USD in a single minute (tune to your ICP). */
const RUNAWAY_REQ = 24;
const RUNAWAY_USD = 8;

export class AuditTracker {
  totalInput = 0;
  totalOutput = 0;
  estTotal = 0;
  rowCount = 0;
  hasPromptColumn = false;
  warnings: string[] = [];
  
  // Limit map size to prevent OOM
  dupMap = new Map<string, { inputs: number[]; models: Set<string>; preview: string }>();
  buckets = new Map<number, { requests: number; estCostUSD: number; first: Date; last: Date; modelCount: Map<string, number> }>();
  modelMismatches: ModelMismatchRow[] = [];
  potentialDowngradeSavingsUSD = 0;
  modelSpend = new Map<string, number>();

  revenueUSD?: number;

  constructor(revenueUSD?: number) {
    this.revenueUSD = revenueUSD;
  }

  addUsageRow(r: UsageRow) {
    this.rowCount++;
    this.totalInput += r.inputTokens;
    this.totalOutput += r.outputTokens;
    const cost = estimateCostUSD(r.model, r.inputTokens, r.outputTokens);
    this.estTotal += cost;
    this.modelSpend.set(r.model, (this.modelSpend.get(r.model) ?? 0) + cost);

    if (r.prompt && r.prompt.length > 0) {
      this.hasPromptColumn = true;
    }

    // Duplicates (limit to 50k unique prompts to prevent memory exhaust)
    if (r.promptNorm && r.promptNorm.length >= 8) {
      if (this.dupMap.has(r.promptNorm) || this.dupMap.size < 50_000) {
        const g = this.dupMap.get(r.promptNorm) ?? {
          inputs: [],
          models: new Set<string>(),
          preview: (r.prompt ?? r.promptNorm).slice(0, 160),
        };
        g.inputs.push(r.inputTokens);
        g.models.add(r.model);
        this.dupMap.set(r.promptNorm, g);
      }
    }

    // Runaways
    const k = Math.floor(r.timestamp.getTime() / WINDOW_MS);
    const b = this.buckets.get(k) ?? {
      requests: 0,
      estCostUSD: 0,
      first: r.timestamp,
      last: r.timestamp,
      modelCount: new Map<string, number>(),
    };
    b.requests += 1;
    b.estCostUSD += cost;
    if (r.timestamp < b.first) b.first = r.timestamp;
    if (r.timestamp > b.last) b.last = r.timestamp;
    b.modelCount.set(r.model, (b.modelCount.get(r.model) ?? 0) + 1);
    this.buckets.set(k, b);

    // Mismatches
    const hint = downgradeHint(r.model);
    if (hint) {
      const h = heuristicMismatch(r, hint);
      if (h.ok) {
        this.potentialDowngradeSavingsUSD += h.savings;
        this.modelMismatches.push({
          model: r.model,
          suggestion: hint,
          reason: h.reason,
          approxSavingsUSD: h.savings,
          samplePrompt: r.prompt || r.promptNorm || "No prompt text",
        });
      }
    }
  }

  finalize(): AuditResult {
    const duplicates: DuplicateGroup[] = [];
    let duplicateWasteInputTokens = 0;
    for (const [, g] of this.dupMap) {
      if (g.inputs.length < 2) continue;
      const sumIn = g.inputs.reduce((a, b) => a + b, 0);
      const wasted = Math.max(0, sumIn - g.inputs[0]);
      duplicateWasteInputTokens += wasted;
      duplicates.push({
        promptPreview: g.preview + (g.preview.length >= 160 ? "…" : ""),
        count: g.inputs.length,
        wastedInputTokens: Math.round(wasted),
        models: [...g.models],
      });
    }
    duplicates.sort((a, b) => b.count - a.count);

    const runaways: RunawayWindow[] = [];
    for (const b of this.buckets.values()) {
      if (b.requests < RUNAWAY_REQ && b.estCostUSD < RUNAWAY_USD) continue;
      let peakModel: string | undefined;
      let peakN = 0;
      for (const [m, n] of b.modelCount) {
        if (n > peakN) {
          peakN = n;
          peakModel = m;
        }
      }
      runaways.push({
        start: b.first,
        end: b.last,
        requests: b.requests,
        estCostUSD: b.estCostUSD,
        peakModel,
      });
    }
    runaways.sort((a, b) => b.estCostUSD - a.estCostUSD);

    this.modelMismatches.sort((a, b) => b.approxSavingsUSD - a.approxSavingsUSD);
    if (this.modelMismatches.length > 500) {
      this.modelMismatches = this.modelMismatches.slice(0, 500);
    }

    let tokenROI: AuditResult["tokenROI"];
    if (this.revenueUSD != null && this.revenueUSD > 0 && this.totalInput + this.totalOutput > 0) {
      const toks = this.totalInput + this.totalOutput;
      tokenROI = {
        revenueUSD: this.revenueUSD,
        perMillionTokens: (this.revenueUSD / toks) * 1_000_000,
      };
    }

    if (!this.hasPromptColumn && this.rowCount > 0) {
      this.warnings.push("Semantic redundancy uses exact prompt match when prompt text exists.");
    }

    const resultOut = {
      rowCount: this.rowCount,
      totalInputTokens: this.totalInput,
      totalOutputTokens: this.totalOutput,
      estCostUSD: this.estTotal,
      hasPromptColumn: this.hasPromptColumn,
      duplicates,
      semanticClusters: [] as SemanticCluster[],
      duplicateWasteInputTokens: Math.round(duplicateWasteInputTokens),
      runaways,
      modelMismatches: this.modelMismatches,
      potentialDowngradeSavingsUSD: this.potentialDowngradeSavingsUSD,
      tokenROI,
      warnings: this.warnings,
      timeSeriesData: Array.from(this.buckets.entries())
        .map(([k, b]) => ({ timestamp: k * WINDOW_MS, requests: b.requests, estCostUSD: b.estCostUSD }))
        .sort((a, b) => a.timestamp - b.timestamp),
      modelSpendData: Array.from(this.modelSpend.entries())
        .map(([model, estCostUSD]) => ({ model, estCostUSD }))
        .sort((a, b) => b.estCostUSD - a.estCostUSD),
    };

    const insights = generateInsights(resultOut, this.modelSpend);

    return {
      ...resultOut,
      insights,
    };
  }
}

export function generateInsights(
  result: Omit<AuditResult, "insights">,
  modelSpend: Map<string, number>
): string[] {
  const insights: string[] = [];

  // Spend Concentration
  if (result.estCostUSD > 0) {
    let topModel = "";
    let topSpend = 0;
    for (const [m, s] of modelSpend) {
      if (s > topSpend) {
        topSpend = s;
        topModel = m;
      }
    }
    const pct = (topSpend / result.estCostUSD) * 100;
    if (pct > 50 && modelSpend.size > 1) {
      insights.push(
        `**Spend Concentration:** ${pct.toFixed(0)}% of your total spend ($${topSpend.toFixed(2)}) is on \`${topModel}\`. Consider routing simpler tasks.`
      );
    }
  }

  // Waste Impact
  if (result.duplicateWasteInputTokens > 0 && result.estCostUSD > 0) {
    if (result.totalInputTokens > 0) {
      const pct = (result.duplicateWasteInputTokens / result.totalInputTokens) * 100;
      if (pct > 5) {
        insights.push(
          `**Waste Impact:** Exact duplicates account for ${pct.toFixed(0)}% of your input tokens. Implementing caching could noticeably reduce spend.`
        );
      }
    }
  }

  // Burst Activity
  if (result.runaways.length > 0) {
    insights.push(
      `**Burst Activity:** Detected ${result.runaways.length} high-spend burst windows. Ensure your agents have iteration caps and backoff logic.`
    );
  }

  if (insights.length === 0) {
    insights.push("No major inefficiencies detected. Your token usage looks healthy based on current heuristics.");
  }

  return insights;
}

export function runAudit(
  rows: UsageRow[],
  revenueUSD?: number
): AuditResult {
  const tracker = new AuditTracker(revenueUSD);
  for (const r of rows) {
    tracker.addUsageRow(r);
  }
  return tracker.finalize();
}

export function creditScore(result: AuditResult): {
  score: number;
  breakdown: { label: string; delta: number }[];
} {
  let score = 72;
  const breakdown: { label: string; delta: number }[] = [];

  const dupRatio =
    result.rowCount && result.duplicates.length
      ? result.duplicateWasteInputTokens /
        Math.max(1, result.totalInputTokens)
      : 0;
  if (dupRatio > 0.15) {
    const d = -18;
    score += d;
    breakdown.push({ label: "High repeat-input waste (cache opportunity)", delta: d });
  } else if (dupRatio > 0.05) {
    const d = -10;
    score += d;
    breakdown.push({ label: "Moderate repeat-input waste", delta: d });
  }

  const topRun = result.runaways[0];
  if (topRun && topRun.estCostUSD > 25) {
    const d = -15;
    score += d;
    breakdown.push({ label: "Severe burst spend (possible agent runaway)", delta: d });
  } else if (topRun && topRun.estCostUSD > 8) {
    const d = -8;
    score += d;
    breakdown.push({ label: "Notable burst spend in short windows", delta: d });
  }

  const mmSaved = result.potentialDowngradeSavingsUSD;
  if (mmSaved > result.estCostUSD * 0.25 && result.estCostUSD > 5) {
    const d = -12;
    score += d;
    breakdown.push({ label: "Heavy premium-model usage on lighter tasks", delta: d });
  }

  if (result.tokenROI && result.tokenROI.perMillionTokens > 50) {
    const d = 10;
    score += d;
    breakdown.push({ label: "Strong implied token ROI", delta: d });
  } else if (result.tokenROI && result.tokenROI.perMillionTokens < 5) {
    const d = -6;
    score += d;
    breakdown.push({ label: "Low revenue per token (verify attribution)", delta: d });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, breakdown };
}

export function optimizationRoadmap(result: AuditResult): string[] {
  const steps: string[] = [];
  if (result.duplicates.length) {
    steps.push(
      "Introduce semantic / exact-match cache for top repeated prompts (see Semantic Redundancy section)."
    );
  }
  if (result.runaways.length) {
    steps.push(
      "Add circuit breakers: max tool iterations, spend caps per session, and backoff when error rate spikes."
    );
  }
  if (result.modelMismatches.length) {
    steps.push(
      "Route low-risk traffic through cheaper models (Universal API-style gateway with eval gates)."
    );
  }
  if (result.tokenROI) {
    steps.push(
      "Treat Token ROI as a lending signal — tie cost dashboards to revenue attribution per product surface."
    );
  }
  if (!steps.length) {
    steps.push(
      "Logs look comparatively healthy on heuristics; deepen instrumentation before financing terms."
    );
  }
  steps.push(
    getPricingFootnote()
  );
  return steps;
}
