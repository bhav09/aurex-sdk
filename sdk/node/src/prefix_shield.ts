/**
 * Stage 1: Pre-Call Prefix Cache-Shield & 200k Cliff Guard helpers (Node.js).
 */
import crypto from "crypto";
import { checkCliffStatus, extractProvider } from "./pricing";
import type { StateStore } from "./state_store";

const ANTHROPIC_DEFAULT_TTL_MS = 300_000;
const EXTENDED_TTL_MS = 3_600_000;
const DYNAMIC_TOKEN_RE = /(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|[0-9a-f]{8}-[0-9a-f]{4}|\b\d{10,13}\b)/i;

export interface PrefixShieldReport {
  prefixBroken: boolean;
  brokenLayer?: "tools" | "system";
  mutatingOffset?: number;
  mutationKind?: string;
  idleTtlRisk: boolean;
  idleGapSeconds?: number;
  crossed200kCliff: boolean;
  near200kCliff: boolean;
  cliffSurchargeUsd: number;
  warnings: string[];
}

export function shieldReportToMetadata(r: PrefixShieldReport): Record<string, any> {
  const meta: Record<string, any> = {};
  if (r.prefixBroken) {
    meta.prefix_broken = true;
    meta.broken_layer = r.brokenLayer;
    meta.mutating_offset = r.mutatingOffset;
    meta.mutation_kind = r.mutationKind;
  }
  if (r.idleTtlRisk) {
    meta.idle_ttl_risk = true;
    meta.idle_gap_seconds = Number((r.idleGapSeconds || 0).toFixed(1));
  }
  if (r.crossed200kCliff || r.near200kCliff) {
    meta.crossed_200k_cliff = r.crossed200kCliff;
    meta.near_200k_cliff = r.near200kCliff;
    meta.cliff_surcharge_usd = r.cliffSurchargeUsd;
  }
  return meta;
}

export function canonicalizeJsonKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJsonKeys);
  }
  if (obj && typeof obj === "object" && obj.constructor === Object) {
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = canonicalizeJsonKeys(obj[k]);
    }
    return sorted;
  }
  return obj;
}

function sha256(text?: string): string | null {
  if (!text) return null;
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}

export function findFirstMutatingOffset(
  prevText: string,
  currText: string,
): { offset?: number; kind?: string } {
  if (!prevText || !currText || prevText === currText) return {};
  const limit = Math.min(prevText.length, currText.length);
  let offset = limit;
  for (let i = 0; i < limit; i++) {
    if (prevText[i] !== currText[i]) {
      offset = i;
      break;
    }
  }
  const winStart = Math.max(0, offset - 10);
  const windowStr = currText.slice(winStart, offset + 32);
  const kind = DYNAMIC_TOKEN_RE.test(windowStr) ? "timestamp_or_id" : "text_edit";
  return { offset, kind };
}

export function inspectPreCallShield(params: {
  stateStore: StateStore;
  workflowId: string;
  model: string;
  estimatedTokens: number;
  nowMs: number;
  systemPrompt?: string;
  messages?: any[];
  tools?: any;
  defaultPricing?: { input: number; output: number };
  provider?: string;
}): PrefixShieldReport {
  const report: PrefixShieldReport = {
    prefixBroken: false,
    idleTtlRisk: false,
    crossed200kCliff: false,
    near200kCliff: false,
    cliffSurchargeUsd: 0,
    warnings: [],
  };

  const resolvedProv = params.provider || extractProvider(params.model);

  let effectiveSystem = params.systemPrompt || "";
  if (!effectiveSystem && Array.isArray(params.messages)) {
    for (const m of params.messages) {
      if (m && typeof m === "object" && m.role === "system" && typeof m.content === "string") {
        effectiveSystem = m.content;
        break;
      }
    }
  }

  const canonToolsStr = params.tools ? JSON.stringify(canonicalizeJsonKeys(params.tools)) : "";
  const toolsHash = sha256(canonToolsStr);
  const systemHash = sha256(effectiveSystem);

  const prev = params.stateStore.getPrefixState(params.workflowId);
  if (prev && params.workflowId !== "default_workflow") {
    if (prev.toolsHash && toolsHash && prev.toolsHash !== toolsHash) {
      report.prefixBroken = true;
      report.brokenLayer = "tools";
      const { offset, kind } = findFirstMutatingOffset(prev.toolsSample || "", canonToolsStr.slice(0, 4096));
      report.mutatingOffset = offset;
      report.mutationKind = kind || "schema_change";
      report.warnings.push(
        `Prefix cache broken in '${params.workflowId}': tool definitions mutated at char ${offset}.`,
      );
    } else if (prev.systemHash && systemHash && prev.systemHash !== systemHash) {
      report.prefixBroken = true;
      report.brokenLayer = "system";
      const { offset, kind } = findFirstMutatingOffset(prev.systemSample || "", effectiveSystem.slice(0, 4096));
      report.mutatingOffset = offset;
      report.mutationKind = kind;
      const hint = kind === "timestamp_or_id" ? "dynamic timestamp/ID" : "text edit";
      report.warnings.push(
        `Prefix cache broken in '${params.workflowId}': system prompt mutated at char ${offset} (${hint}). Move dynamic values to the end of the user message.`,
      );
    }

    if (prev.lastTimestamp !== undefined && params.estimatedTokens >= 1024) {
      const gapMs = params.nowMs - prev.lastTimestamp;
      if (resolvedProv === "anthropic" && gapMs > ANTHROPIC_DEFAULT_TTL_MS && gapMs <= EXTENDED_TTL_MS) {
        report.idleTtlRisk = true;
        report.idleGapSeconds = gapMs / 1000;
        report.warnings.push(
          `Anthropic 5m cache TTL expired after ${Math.round(gapMs / 1000)}s idle in '${params.workflowId}' (triggers 1.25x cache_creation rewrite; consider 1h TTL or compacting).`,
        );
      } else if (resolvedProv === "google" && gapMs > EXTENDED_TTL_MS) {
        report.idleTtlRisk = true;
        report.idleGapSeconds = gapMs / 1000;
        report.warnings.push(
          `Gemini context idle for ${Math.round(gapMs / 1000)}s in '${params.workflowId}'; verify explicit cachedContent TTL is not billing idle hourly storage.`,
        );
      }
    }
  }

  const cliff = checkCliffStatus(params.model, params.estimatedTokens, params.defaultPricing, resolvedProv);
  report.crossed200kCliff = cliff.crossedCliff;
  report.near200kCliff = cliff.nearCliff;
  report.cliffSurchargeUsd = cliff.surchargeUsd;

  if (report.crossed200kCliff) {
    report.warnings.push(
      `200k context cliff crossed (${params.estimatedTokens.toLocaleString()} tokens) on ${params.model}: entire request bills at 2x (+$${report.cliffSurchargeUsd.toFixed(4)} input surcharge).`,
    );
  } else if (report.near200kCliff) {
    const rem = 200_000 - params.estimatedTokens;
    report.warnings.push(
      `Approaching 200k 2x pricing cliff on ${params.model}: ${params.estimatedTokens.toLocaleString()} tokens (${rem.toLocaleString()} tokens left before 2x whole-request surcharge).`,
    );
  }

  params.stateStore.setPrefixState(params.workflowId, {
    toolsHash,
    systemHash,
    toolsSample: canonToolsStr.slice(0, 4096),
    systemSample: effectiveSystem.slice(0, 4096),
    lastTimestamp: params.nowMs,
    model: params.model,
  });

  return report;
}

export function appendTailInstruction<T extends Record<string, unknown>>(
  params: T,
  instruction: string,
): T {
  if (!instruction) return params;
  const next: Record<string, unknown> = { ...params };
  const messages = Array.isArray(next.messages) ? [...next.messages] : [];
  const suffix = `\n\n[Aurex Guidance: ${instruction}]`;

  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last && typeof last === "object" && last.role === "user" && typeof last.content === "string") {
      messages[messages.length - 1] = { ...last, content: `${last.content}${suffix}` };
      next.messages = messages;
      return next as T;
    }
  }
  messages.push({ role: "user", content: instruction });
  next.messages = messages;
  return next as T;
}
