/**
 * Pre-call decision types and helpers for applying guard actions.
 */

function normalizeModelName(m: string): string {
  let model = m.trim().toLowerCase();
  const ftMatch = model.match(/^ft:([^:]+)/);
  if (ftMatch) model = ftMatch[1];
  model = model.replace(/^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/)/g, "");
  return model.replace(/[\s_]+/g, "-");
}

export type AurexAction = "proceed" | "downgrade" | "compress" | "block";

export interface AurexDecision {
  action: AurexAction;
  reason: string;
  suggestedModel?: string;
  compressedMessages?: any[];
  loopScore?: number;
  injectSystemInstruction?: string;
  originalModel?: string;
}

export const MODEL_DOWNGRADE_MAP: Record<string, string> = {
  "gpt-4o": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4o-mini",
  "gpt-4": "gpt-4o-mini",
  "gpt-5": "gpt-4o-mini",
  "gpt-5.1": "gpt-4o-mini",
  "o1": "o3-mini",
  "claude-opus-4-20250514": "claude-3-5-haiku",
  "claude-3-opus": "claude-3-5-haiku",
  "claude-3-5-sonnet": "claude-3-5-haiku",
  "claude-sonnet-4-5-20250929": "claude-3-5-haiku",
  "gemini-2.5-pro": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-1.5-flash",
};

export function suggestCheaperModel(model: string): string | undefined {
  const norm = normalizeModelName(model);
  if (MODEL_DOWNGRADE_MAP[norm]) return MODEL_DOWNGRADE_MAP[norm];
  if (norm.includes("gpt") || norm.startsWith("o1") || norm.startsWith("o3")) return "gpt-4o-mini";
  if (norm.includes("claude")) return "claude-3-5-haiku";
  if (norm.includes("gemini")) return "gemini-2.5-flash";
  return undefined;
}

const EXPENSIVE_HINTS = ["opus", "gpt-4-turbo", "gpt-4o", "gpt-5", "o1", "sonnet-4", "gemini-2.5-pro"];

export function isExpensiveModel(model: string): boolean {
  const norm = normalizeModelName(model);
  if (norm.includes("mini") || norm.includes("haiku") || norm.includes("flash")) return false;
  return EXPENSIVE_HINTS.some((h) => norm.includes(h));
}

/** Deduplicate consecutive system messages in a chat payload. */
export function compressMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length < 2) return messages;
  const out: any[] = [];
  let lastSystemHash: string | undefined;
  for (const m of messages) {
    if (m?.role === "system" && typeof m.content === "string") {
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
    throw new Error(`[Aurex] Blocked: ${decision.reason}`);
  }
  const next: Record<string, unknown> = { ...params };
  if (decision.action === "downgrade" && decision.suggestedModel) {
    next.model = decision.suggestedModel;
    next.extra_metadata = {
      ...(next.extra_metadata || {}),
      aurex_original_model: decision.originalModel || (params.model as string | undefined),
      aurex_model_downgraded: true,
    };
  }
  if (decision.compressedMessages) {
    next.messages = decision.compressedMessages;
  } else if (decision.action === "compress" && Array.isArray(next.messages)) {
    next.messages = compressMessages(next.messages);
  }
  if (decision.injectSystemInstruction) {
    const messages = Array.isArray(next.messages) ? [...next.messages] : [];
    messages.unshift({ role: "system", content: decision.injectSystemInstruction });
    next.messages = messages;
  }
  return next as T;
}
