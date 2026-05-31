import { MODEL_PRICING } from "../../sdk/node/src/index";
import { FALLBACK_SHOWCASE_MODELS } from "./showcase-models-fallback";

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** Models we never surface in marketing UI */
const DEPRECATED_ID_PATTERNS: RegExp[] = [
  /gpt-3/i,
  /^gpt-4-\d{4}/,
  /^gpt-4$/,
  /davinci|curie|babbage|ada/i,
  /claude-1|claude-2|claude-instant/i,
  /claude-3-opus|claude-3-sonnet|claude-3-haiku|claude-3-5-haiku/i,
  /gemini-1\.0|(^|-)gemini-pro($|-)/i,
  /gemini-1\.5-(pro|flash)/i,
  /text-bison|chat-bison|palm/i,
  /llama-2|llama2/i,
  /command-light|command-nightly/i,
  /instruct/i,
  /-\d{8}$/,
];

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google",
  google: "Google",
  vertex_ai: "Google",
  deepseek: "DeepSeek",
  meta: "Meta",
  mistral: "Mistral",
  cohere: "Cohere",
  bedrock: "AWS Bedrock",
  azure: "Azure OpenAI",
};

const PROVIDER_PRIORITY = [
  "openai",
  "anthropic",
  "gemini",
  "google",
  "deepseek",
  "meta",
  "mistral",
  "cohere",
  "bedrock",
];

const INTEGRATION_LABELS = ["LiteLLM", "Hugging Face"];

type LiteLLMEntry = {
  mode?: string;
  litellm_provider?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  deprecation_date?: string;
};

function normalizeModelId(id: string): string {
  return id
    .replace(/^models\//, "")
    .replace(/^anthropic\//, "")
    .replace(/^openai\//, "")
    .replace(/^google\//, "")
    .replace(/^bedrock\//, "")
    .replace(/^publishers\/google\/models\//, "")
    .toLowerCase();
}

function isDeprecatedModelId(id: string): boolean {
  const norm = normalizeModelId(id);
  return DEPRECATED_ID_PATTERNS.some((re) => re.test(norm));
}

function scoreModel(id: string): number {
  const norm = normalizeModelId(id);
  if (/flash-lite|nano/.test(norm)) return 0;
  let score = 0;
  if (/gpt-5|gpt-4\.1|gpt-4o|^o3|^o4-mini/.test(norm)) score += 100;
  if (/claude-opus-4|claude-sonnet-4/.test(norm)) score += 120;
  else if (/claude-3-7/.test(norm)) score += 95;
  if (/gemini-2\.5-pro|gemini-2\.5-flash(?!-lite)/.test(norm)) score += 100;
  else if (/gemini-2\.0/.test(norm)) score += 90;
  if (/deepseek-v3|deepseek-r1/.test(norm)) score += 90;
  if (/llama-4|llama-3\.3/.test(norm)) score += 85;
  if (/mistral-large|command-r\+/.test(norm)) score += 80;
  if (/mini|haiku|8b|7b/.test(norm)) score -= 40;
  if (/\d{4}-\d{2}-\d{2}|\d{8}/.test(norm)) score -= 10;
  score += Math.min(norm.length, 40);
  return score;
}

function humanizeModelName(modelId: string): string {
  const base = normalizeModelId(modelId)
    .replace(/\.(v\d+|r\d+)$/, (m) => m.toUpperCase())
    .replace(/gemini-(\d)/, "Gemini $1")
    .replace(/gpt-(\d)/, "GPT-$1")
    .replace(/^o(\d)/, "o$1")
    .replace(/claude-opus-(\d)/, "Claude Opus $1")
    .replace(/claude-sonnet-(\d)/, "Claude Sonnet $1")
    .replace(/claude-(\d)-(\d)/, "Claude $1.$2")
    .replace(/llama-(\d)/, "Llama $1")
    .replace(/mistral-large/, "Large")
    .replace(/deepseek-(v\d|r\d)/, (_, t) => t.toUpperCase())
    .replace(/-/g, " ");

  return base
    .split(" ")
    .map((word) => {
      if (/^gpt-/i.test(word)) return word.toUpperCase();
      if (/^o\d/i.test(word)) return word.toLowerCase();
      if (/^v\d|^r\d/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatShowcaseLabel(provider: string, modelId: string): string {
  const providerLabel = PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${providerLabel} ${humanizeModelName(modelId)}`.replace(/\s+/g, " ").trim();
}

export function buildShowcaseFromLiteLLM(raw: Record<string, LiteLLMEntry>): string[] {
  const bestByProvider = new Map<string, { score: number; label: string }>();

  for (const [modelId, entry] of Object.entries(raw)) {
    if (entry.mode && entry.mode !== "chat") continue;
    if (entry.deprecation_date) continue;
    if (!entry.input_cost_per_token || !entry.output_cost_per_token) continue;
    if (isDeprecatedModelId(modelId)) continue;

    const provider = (entry.litellm_provider || "unknown").toLowerCase();
    if (!PROVIDER_PRIORITY.includes(provider) && provider !== "vertex_ai") continue;

    const score = scoreModel(modelId);
    if (score < 50) continue;

    const label = formatShowcaseLabel(provider === "vertex_ai" ? "google" : provider, modelId);
    const existing = bestByProvider.get(provider);
    if (!existing || score > existing.score) {
      bestByProvider.set(provider, { score, label });
    }

    const secondKey = `${provider}:alt`;
    const altExisting = bestByProvider.get(secondKey);
    if (
      /pro|flash|opus|sonnet|large|o3|gpt-4o|gpt-4\.1/.test(normalizeModelId(modelId)) &&
      (!altExisting || (score > altExisting.score - 15 && score < (existing?.score ?? score)))
    ) {
      if (!existing || label !== existing.label) {
        bestByProvider.set(secondKey, { score, label });
      }
    }
  }

  const labels: string[] = [];
  for (const provider of PROVIDER_PRIORITY) {
    const primary = bestByProvider.get(provider);
    if (primary) labels.push(primary.label);
    const alt = bestByProvider.get(`${provider}:alt`);
    if (alt && alt.label !== primary?.label) labels.push(alt.label);
  }

  const deduped = [...new Set(labels)];
  if (deduped.length >= 6) {
    return [...deduped, ...INTEGRATION_LABELS];
  }
  return buildShowcaseFromSdkPricing();
}

export function buildShowcaseFromSdkPricing(): string[] {
  const bestByProvider = new Map<string, { score: number; label: string }>();

  for (const modelId of Object.keys(MODEL_PRICING)) {
    if (isDeprecatedModelId(modelId)) continue;
    const score = scoreModel(modelId);
    if (score < 50) continue;

    let provider = "openai";
    if (/claude/i.test(modelId)) provider = "anthropic";
    else if (/gemini/i.test(modelId)) provider = "google";
    else if (/deepseek/i.test(modelId)) provider = "deepseek";
    else if (/llama/i.test(modelId)) provider = "meta";
    else if (/mistral|qwen/i.test(modelId)) provider = "mistral";

    const label = formatShowcaseLabel(provider, modelId);
    const existing = bestByProvider.get(provider);
    if (!existing || score > existing.score) {
      bestByProvider.set(provider, { score, label });
    }

    const altKey = `${provider}:alt`;
    if (/pro|flash|opus|sonnet|large|o3|gpt-4o|gpt-4\.1|maverick|scout/.test(normalizeModelId(modelId))) {
      const altExisting = bestByProvider.get(altKey);
      if (
        (!altExisting || score > altExisting.score) &&
        label !== bestByProvider.get(provider)?.label
      ) {
        bestByProvider.set(altKey, { score, label });
      }
    }
  }

  const labels: string[] = [];
  for (const provider of PROVIDER_PRIORITY) {
    const primary = bestByProvider.get(provider);
    if (primary) labels.push(primary.label);
    const alt = bestByProvider.get(`${provider}:alt`);
    if (alt && alt.label !== primary?.label) labels.push(alt.label);
  }

  const deduped = [...new Set(labels)];
  return deduped.length >= 6 ? [...deduped, ...INTEGRATION_LABELS] : FALLBACK_SHOWCASE_MODELS;
}

export async function fetchShowcaseModels(): Promise<{
  models: string[];
  source: "litellm" | "sdk" | "fallback";
  updatedAt: string;
}> {
  try {
    const res = await fetch(LITELLM_PRICING_URL, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`LiteLLM fetch failed: ${res.status}`);
    const data = (await res.json()) as Record<string, LiteLLMEntry>;
    const models = buildShowcaseFromLiteLLM(data);
    const fromSdk = models.length < 6;
    return {
      models: fromSdk ? buildShowcaseFromSdkPricing() : models,
      source: fromSdk ? "sdk" : "litellm",
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      models: buildShowcaseFromSdkPricing(),
      source: "sdk",
      updatedAt: new Date().toISOString(),
    };
  }
}
