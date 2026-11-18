/**
 * Shared pricing, tiered 200k cliff math, and token counting engine (Stages 1-3).
 */
import { createRequire } from "module";

export const CLIFF_THRESHOLD_TOKENS = 200_000;
export const NEAR_CLIFF_TOKENS = 180_000;

const PAID_CLOUD_PREFIXES = [
  "groq/",
  "together/",
  "together_ai/",
  "fireworks/",
  "fireworks_ai/",
  "openrouter/",
  "bedrock/",
  "amazon.",
  "meta.",
  "vertex_ai/",
  "azure/",
  "deepinfra/",
];

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-4.1": { input: 2.00, output: 8.00 },
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "gpt-4.1-nano": { input: 0.10, output: 0.40 },
  "gpt-5": { input: 5.00, output: 15.00 },
  "gpt-5.1": { input: 5.00, output: 15.00 },
  "o3-mini": { input: 1.10, output: 4.40 },
  "o3": { input: 10.00, output: 40.00 },
  "o4-mini": { input: 1.10, output: 4.40 },
  "o1": { input: 15.00, output: 60.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  "gemini-1.5-pro": { input: 1.25, output: 5.00 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.5-pro": { input: 1.25, output: 5.00 },
  "gemini-2.5-flash": { input: 0.10, output: 0.40 },
  "gemini-2.5-flash-lite": { input: 0.00, output: 0.00 },
  "claude-opus-4": { input: 15.00, output: 75.00 },
  "claude-opus-4-20250514": { input: 15.00, output: 75.00 },
  "claude-3-opus": { input: 15.00, output: 75.00 },
  "claude-3-opus-20240229": { input: 15.00, output: 75.00 },
  "claude-sonnet-4": { input: 3.00, output: 15.00 },
  "claude-3-5-sonnet": { input: 3.00, output: 15.00 },
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
  "claude-sonnet-4-5-20250929": { input: 3.00, output: 15.00 },
  "claude-3-sonnet": { input: 3.00, output: 15.00 },
  "claude-3-sonnet-20240229": { input: 3.00, output: 15.00 },
  "claude-3-5-haiku": { input: 0.80, output: 4.00 },
  "claude-3-5-haiku-20241022": { input: 0.80, output: 4.00 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "claude-3-7-sonnet": { input: 3.00, output: 15.00 },
  "claude-3-7-sonnet-20250219": { input: 3.00, output: 15.00 },
  "deepseek-r1": { input: 0.55, output: 2.19 },
  "deepseek-v3": { input: 0.27, output: 1.10 },
  "mistral-large": { input: 2.00, output: 6.00 },
  "llama3.1": { input: 0.0, output: 0.0 },
  "llama-3.1": { input: 0.0, output: 0.0 },
  "llama-3.3": { input: 0.0, output: 0.0 },
  "llama-4-scout": { input: 0.0, output: 0.0 },
  "llama-4-maverick": { input: 0.0, output: 0.0 },
  "qwen2.5": { input: 0.0, output: 0.0 },
  "qwen3": { input: 0.0, output: 0.0 },
  "mistral": { input: 0.0, output: 0.0 },
};

export const HOSTED_OPEN_WEIGHT_PRICING: Record<string, { input: number; output: number }> = {
  "llama-4-maverick": { input: 0.27, output: 0.85 },
  "llama-4-scout": { input: 0.18, output: 0.60 },
  "llama-3.3-70b": { input: 0.59, output: 0.79 },
  "llama-3.1-70b": { input: 0.59, output: 0.79 },
  "llama3-70b": { input: 0.59, output: 0.79 },
  "llama-3.1-8b": { input: 0.05, output: 0.08 },
  "llama3-8b": { input: 0.05, output: 0.08 },
  "qwen2.5-72b": { input: 0.35, output: 0.40 },
  "qwen3": { input: 0.30, output: 0.60 },
  "mistral-7b": { input: 0.15, output: 0.15 },
};

let tiktokenEncoder: any = undefined;

import { fileURLToPath } from "url";

function getTiktokenEncoder(): any {
  if (tiktokenEncoder !== undefined) return tiktokenEncoder;
  try {
    const base = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
    const req = createRequire(base);
    const mod = req("js-tiktoken");
    tiktokenEncoder = mod.getEncoding("o200k_base");
  } catch {
    tiktokenEncoder = null;
  }
  return tiktokenEncoder;
}

export function countTextTokens(text?: string): number {
  if (!text) return 0;
  const enc = getTiktokenEncoder();
  if (enc) {
    try {
      return Math.max(1, enc.encode(text).length);
    } catch {}
  }
  const pieces = text.match(/\w+|[^\w\s]/g);
  return Math.max(1, pieces ? pieces.length : 0, Math.floor(text.length / 4));
}

export function countRequestTokens(params: {
  prompt?: string;
  systemPrompt?: string;
  messages?: any[];
  tools?: any;
  responseFormat?: any;
}): number {
  let total = 0;
  let hasSystemInMessages = false;

  if (Array.isArray(params.messages) && params.messages.length > 0) {
    for (const msg of params.messages) {
      if (!msg || typeof msg !== "object") {
        total += countTextTokens(String(msg));
        continue;
      }
      if (msg.role === "system") hasSystemInMessages = true;
      const content = msg.content;
      if (typeof content === "string") {
        total += countTextTokens(content) + 4;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === "object") {
            const btype = block.type || "";
            if (btype === "image" || btype === "image_url" || btype === "input_image") {
              total += 765;
            } else if ("text" in block) {
              total += countTextTokens(String(block.text));
            } else {
              total += countTextTokens(JSON.stringify(block));
            }
          } else {
            total += countTextTokens(String(block));
          }
        }
      }
      if (msg.tool_calls) {
        total += countTextTokens(JSON.stringify(msg.tool_calls));
      }
    }
  } else if (params.prompt) {
    total += countTextTokens(params.prompt);
  }

  if (params.systemPrompt && !hasSystemInMessages) {
    total += countTextTokens(params.systemPrompt);
  }
  if (params.tools) {
    total += countTextTokens(JSON.stringify(params.tools));
  }
  if (params.responseFormat && typeof params.responseFormat === "object") {
    total += countTextTokens(JSON.stringify(params.responseFormat));
  }
  return Math.max(1, total);
}

export function normalizeModelName(m: string): string {
  let model = m.trim().toLowerCase();
  const ftMatch = model.match(/^ft:([^:]+)/);
  if (ftMatch) model = ftMatch[1];
  model = model.split(":")[0];
  const parts = model.split("/");
  model = parts[parts.length - 1];
  model = model.replace(/-\d{8}$/, "");
  return model.replace(/[\s_]+/g, "-");
}

function wildcardMatch(str: string, rule: string): boolean {
  const escapeRegex = (s: string) => s.replace(/([.+?^=!:${}()|[\]/\\])/g, "\\$1");
  return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str);
}

export function isPaidCloudOpenWeight(model: string, provider?: string): boolean {
  const ml = (model || "").trim().toLowerCase();
  const prov = (provider || "").trim().toLowerCase();
  if (ml.startsWith("ollama/") || ml.startsWith("local/") || prov === "ollama") return false;
  if (["groq", "together", "fireworks", "openrouter", "bedrock", "azure", "vertex"].includes(prov)) return true;
  return PAID_CLOUD_PREFIXES.some((p) => ml.startsWith(p));
}

export function extractProvider(model: string): string {
  const ml = (model || "").toLowerCase().trim();
  const prefixMap: Array<[string, string]> = [
    ["groq/", "groq"],
    ["together/", "together"],
    ["together_ai/", "together"],
    ["fireworks/", "fireworks"],
    ["openrouter/", "openrouter"],
    ["bedrock/", "bedrock"],
    ["amazon.", "bedrock"],
    ["ollama/", "ollama"],
  ];
  for (const [pref, prov] of prefixMap) {
    if (ml.startsWith(pref)) return prov;
  }
  if (ml.includes("/") && !["openai/", "google/", "anthropic/", "bedrock/", "vertex_ai/"].some((x) => ml.includes(x))) {
    return "huggingface";
  }
  if (ml.includes("claude")) return "anthropic";
  if (ml.includes("gpt") || ml.startsWith("o1") || ml.startsWith("o3") || ml.startsWith("o4")) return "openai";
  if (ml.includes("gemini")) return "google";
  if (["llama", "mistral", "qwen", "deepseek"].some((x) => ml.includes(x))) return "ollama";
  return "unknown";
}

export function getModelPricing(
  model: string,
  defaultPricing?: { input: number; output: number },
  provider?: string,
): [number, number] {
  if (!model) {
    return defaultPricing ? [defaultPricing.input, defaultPricing.output] : [1.50, 6.00];
  }
  const queryNorm = normalizeModelName(model);

  for (const [pattern, pricing] of Object.entries(MODEL_PRICING)) {
    if (pattern.includes("*") && wildcardMatch(queryNorm, pattern)) {
      return [pricing.input, pricing.output];
    }
  }

  if (isPaidCloudOpenWeight(model, provider)) {
    const hostedKeys = Object.keys(HOSTED_OPEN_WEIGHT_PRICING).sort((a, b) => b.length - a.length);
    for (const key of hostedKeys) {
      if (queryNorm.includes(key)) {
        return [HOSTED_OPEN_WEIGHT_PRICING[key].input, HOSTED_OPEN_WEIGHT_PRICING[key].output];
      }
    }
  }

  if (MODEL_PRICING[queryNorm]) {
    return [MODEL_PRICING[queryNorm].input, MODEL_PRICING[queryNorm].output];
  }

  const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (queryNorm.includes(key)) {
      return [MODEL_PRICING[key].input, MODEL_PRICING[key].output];
    }
  }

  if ((provider || extractProvider(model)) === "huggingface") {
    return [0.0, 0.0];
  }

  return defaultPricing ? [defaultPricing.input, defaultPricing.output] : [1.50, 6.00];
}

export function has200kCliff(model: string, provider?: string): boolean {
  const prov = provider || extractProvider(model);
  const norm = normalizeModelName(model);
  if (prov === "anthropic" || prov === "google") {
    return (MODEL_PRICING[norm]?.input ?? 1.0) > 0;
  }
  return false;
}

export function checkCliffStatus(
  model: string,
  inputTokens: number,
  defaultPricing?: { input: number; output: number },
  provider?: string,
): {
  applies: boolean;
  crossedCliff: boolean;
  nearCliff: boolean;
  multiplier: number;
  surchargeUsd: number;
} {
  const applies = has200kCliff(model, provider);
  const crossedCliff = applies && inputTokens > CLIFF_THRESHOLD_TOKENS;
  const nearCliff = applies && inputTokens >= NEAR_CLIFF_TOKENS && inputTokens <= CLIFF_THRESHOLD_TOKENS;
  const [inPrice] = getModelPricing(model, defaultPricing, provider);
  const baseInCost = (inputTokens / 1_000_000) * inPrice;
  return {
    applies,
    crossedCliff,
    nearCliff,
    multiplier: crossedCliff ? 2.0 : 1.0,
    surchargeUsd: crossedCliff ? Number(baseInCost.toFixed(6)) : 0,
  };
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  cacheWriteTokens: number = 0,
  isBatch: boolean = false,
  cacheTtl: "5m" | "1h" = "5m",
  defaultPricing?: { input: number; output: number },
  provider?: string,
): number {
  const resolvedProv = provider || extractProvider(model);
  let [inPrice, outPrice] = getModelPricing(model, defaultPricing, resolvedProv);

  if (has200kCliff(model, resolvedProv) && inputTokens > CLIFF_THRESHOLD_TOKENS) {
    inPrice *= 2.0;
    outPrice *= 2.0;
  }

  const nonCached = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);

  let readMult = 0.25;
  let writeMult = 1.0;
  if (resolvedProv === "anthropic") {
    readMult = 0.10;
    writeMult = cacheTtl === "1h" ? 2.0 : 1.25;
  } else if (resolvedProv === "openai") {
    readMult = 0.50;
    writeMult = 1.0;
  }

  const cost =
    (nonCached / 1_000_000) * inPrice +
    (cachedTokens / 1_000_000) * inPrice * readMult +
    (cacheWriteTokens / 1_000_000) * inPrice * writeMult +
    (outputTokens / 1_000_000) * outPrice;

  return isBatch ? cost * 0.5 : cost;
}
