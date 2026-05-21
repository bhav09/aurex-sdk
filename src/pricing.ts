import { canonModel, type PriceKey } from "./model-normalize";
import { getLivePriceForModel, getPricingMeta } from "./catalog";

export type { PriceKey } from "./model-normalize";
export { canonModel } from "./model-normalize";

/** Static fallback date when live catalog is unavailable */
export const EMBEDDED_PRICING_AS_OF = "2026-04-01";

export function getPricingLabel(): string {
  const m = getPricingMeta();
  if (m.source === "litellm-github") {
    return `${m.label} · ~${m.modelCount.toLocaleString()} ids (LiteLLM)`;
  }
  return `${EMBEDDED_PRICING_AS_OF} · embedded`;
}

export function getPricingFootnote(): string {
  const m = getPricingMeta();
  if (m.source === "litellm-github") {
    return `Estimates use the LiteLLM community pricing map (~${m.modelCount.toLocaleString()} model ids from OpenAI, Vertex, Anthropic, etc.). Not a vendor-official API — confirm before finance use.`;
  }
  return `Estimates use embedded fallback (${EMBEDDED_PRICING_AS_OF}) — replace with your negotiated rates.`;
}

const TABLE: Record<string, PriceKey> = {
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10, outputPerMillion: 30 },
  "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
  "gpt-5": { inputPerMillion: 5, outputPerMillion: 15 },
  "gpt-5.1": { inputPerMillion: 5, outputPerMillion: 15 },
  "o3-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  "o1": { inputPerMillion: 15, outputPerMillion: 60 },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5 },
  "gemini-2.5-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  "claude-3-opus": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-3-5-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-3-7-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-3-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-3-5-haiku": { inputPerMillion: 0.8, outputPerMillion: 4 },
  "claude-3-haiku": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  default: { inputPerMillion: 1.5, outputPerMillion: 6 },
};

function lookupEmbedded(model: string): PriceKey {
  const key = canonModel(model);
  let p = TABLE[key];
  if (!p) {
    for (const k of Object.keys(TABLE)) {
      if (k !== "default" && key.includes(k)) {
        p = TABLE[k];
        break;
      }
    }
  }
  return p ?? TABLE.default;
}

export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const live = getLivePriceForModel(model);
  const p = live ?? lookupEmbedded(model);
  return (
    (inputTokens / 1_000_000) * p.inputPerMillion +
    (outputTokens / 1_000_000) * p.outputPerMillion
  );
}

/** Suggested cheaper tier for messaging (not a quality guarantee). */
export const DOWNGRADE_MAP: Record<string, string> = {
  "gpt-4o": "GPT-4o mini or Gemini Flash",
  "gpt-4-turbo": "GPT-4o mini or Gemini Flash",
  "gpt-4.1": "GPT-4o mini",
  "gpt-5": "GPT-4o mini or Gemini Flash (for simple tasks)",
  "gpt-5.1": "GPT-4o mini or Gemini Flash (for simple tasks)",
  "o1": "o3-mini or GPT-4o mini (when reasoning depth is overkill)",
  "gemini-1.5-pro": "Gemini 1.5 Flash / 2.x Flash",
  "gemini-2.5-pro": "Gemini 2.5 Flash",
  "claude-3-opus": "Claude 3.5 Sonnet or 3.7 Sonnet",
  "claude-3-5-sonnet": "Claude 3.5 Haiku or Gemini Flash",
  "claude-3-7-sonnet": "Claude 3.5 Haiku or Gemini Flash",
  "claude-3-sonnet": "Claude 3.5 Haiku",
};

export function downgradeHint(model: string): string | null {
  const k = canonModel(model);
  for (const [expensive, hint] of Object.entries(DOWNGRADE_MAP)) {
    // Avoid circular downgrade suggestions where mini/haiku models inherit their premium versions' rules
    if (k.includes("-mini") || k.includes("-haiku")) {
      if (k === expensive) return hint;
      continue;
    }
    if (k.includes(expensive) || expensive.includes(k)) return hint;
  }
  return null;
}
