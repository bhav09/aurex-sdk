/**
 * Pre-call decision types and helpers for applying guard actions.
 */
import { AurexAuditor, aurexContext } from "./index";
import { AurexBlocked } from "./exceptions";
import { appendTailInstruction, canonicalizeJsonKeys } from "./prefix_shield";
import { normalizeModelName } from "./pricing";
import { sanitizeThinkingParams } from "./runtime_guard";

export type AurexAction = "proceed" | "downgrade" | "compress" | "block" | "cache_suggest";

export interface AurexDecision {
  action: AurexAction;
  reason: string;
  suggestedModel?: string;
  compressedMessages?: any[];
  loopScore?: number;
  injectSystemInstruction?: string;
  originalModel?: string;
  response?: string;
  shieldMeta?: Record<string, any>;
  warnings?: string[];
  maxThinkingTokens?: number;
}

export const MODEL_DOWNGRADE_MAP: Record<string, string> = {
  "gpt-4o": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4o-mini",
  "gpt-4": "gpt-4o-mini",
  "gpt-5": "gpt-4o-mini",
  "gpt-5.1": "gpt-4o-mini",
  "gpt-4.1-mini": "gpt-4.1-nano",
  "o1": "o3-mini",
  "o3": "o4-mini",
  "o4-mini": "gpt-4o-mini",
  "claude-opus-4-20250514": "claude-3-5-haiku",
  "claude-3-opus": "claude-3-5-haiku",
  "claude-opus-4": "claude-3-5-haiku",
  "claude-sonnet-4": "claude-3-5-haiku",
  "claude-3-5-sonnet": "claude-3-5-haiku",
  "claude-sonnet-4-5-20250929": "claude-3-5-haiku",
  "gemini-2.5-pro": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-1.5-flash",
  "deepseek-r1": "deepseek-v3",
};

export function suggestCheaperModel(model: string): string | undefined {
  const norm = normalizeModelName(model);

  try {
    const ctx = aurexContext.getStore();
    if (ctx && ctx.downgradeMap && ctx.downgradeMap[norm]) {
      return ctx.downgradeMap[norm];
    }
  } catch {}

  try {
    const instance = AurexAuditor.getInstance();
    if (instance?.downgradeMap?.[norm]) {
      return instance.downgradeMap[norm];
    }
  } catch {}

  if (MODEL_DOWNGRADE_MAP[norm]) return MODEL_DOWNGRADE_MAP[norm];
  if (norm.includes("gpt") || norm.startsWith("o1") || norm.startsWith("o3") || norm.startsWith("o4")) return "gpt-4o-mini";
  if (norm.includes("claude")) return "claude-3-5-haiku";
  if (norm.includes("gemini")) return "gemini-2.5-flash";
  return undefined;
}

const EXPENSIVE_HINTS = ["opus", "gpt-4-turbo", "gpt-4o", "gpt-5", "o1", "sonnet-4", "gemini-2.5-pro"];

export function isExpensiveModel(model: string): boolean {
  const norm = normalizeModelName(model);
  if (norm.includes("mini") || norm.includes("haiku") || norm.includes("flash") || norm.includes("nano")) return false;
  return EXPENSIVE_HINTS.some((h) => norm.includes(h));
}

/** Deduplicate consecutive system/developer messages within a single chat payload. */
export function compressMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length < 2) return messages;
  const out: any[] = [];
  let lastSystemHash: string | undefined;
  for (const m of messages) {
    if ((m?.role === "system" || m?.role === "developer") && typeof m.content === "string") {
      const h = m.content.slice(0, 64);
      if (h === lastSystemHash) continue;
      lastSystemHash = h;
    }
    out.push(m);
  }
  return out.length ? out : messages;
}

export function applyDecisionToCallParams<T extends Record<string, unknown>>(
  params: T,
  decision: AurexDecision,
): T {
  if (decision.action === "block") {
    throw new AurexBlocked(`[Aurex] Blocked: ${decision.reason}`, {
      reason: decision.reason,
      action: decision.action,
    });
  }
  let next: Record<string, unknown> = { ...params };

  // Stage 1: Deterministically canonicalize schema keys so dict ordering never breaks caches
  if ("tools" in next && next.tools !== undefined) {
    next.tools = canonicalizeJsonKeys(next.tools);
  }
  if (
    "response_format" in next &&
    next.response_format &&
    typeof next.response_format === "object" &&
    !(next.response_format as any)._def &&
    !(next.response_format as any)._zod &&
    typeof (next.response_format as any).__parse !== "function"
  ) {
    next.response_format = canonicalizeJsonKeys(next.response_format);
  }

  if (decision.action === "downgrade" && decision.suggestedModel) {
    next.model = decision.suggestedModel;
  }
  if (decision.compressedMessages) {
    next.messages = decision.compressedMessages;
  } else if (decision.action === "compress" && Array.isArray(next.messages)) {
    next.messages = compressMessages(next.messages);
  }

  // Stage 1 Cache-Safety Invariant: Always append runtime instructions at the TAIL (never index 0!)
  if (decision.injectSystemInstruction) {
    next = appendTailInstruction(next, decision.injectSystemInstruction);
  }

  // Stage 2: Clamp thinking budgets & strip incompatible reasoning params on downgrade
  next = sanitizeThinkingParams(next, {
    isDowngraded: decision.action === "downgrade" && Boolean(decision.suggestedModel),
    maxThinkingTokens: decision.maxThinkingTokens,
  });

  return next as T;
}
