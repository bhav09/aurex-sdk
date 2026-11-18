/**
 * Stage 2: In-Flight Runtime Guard helpers (endpoint provider, thinking caps, stream & Responses API).
 */
import { extractProvider, normalizeModelName } from "./pricing";

const NON_REASONING_HINTS = ["mini", "nano", "haiku", "flash", "gpt-3.5", "gpt-4o", "gpt-4-turbo"];

export function extractClientBaseUrl(clientOrResource: any, params?: Record<string, any>): string | undefined {
  if (params?.baseURL || params?.base_url || params?.api_base) {
    return String(params.baseURL || params.base_url || params.api_base);
  }
  const base = clientOrResource?.baseURL || clientOrResource?._client?.baseURL;
  return base ? String(base) : undefined;
}

export function resolveEndpointProvider(model: string, baseUrl?: string): string {
  if (baseUrl) {
    const b = baseUrl.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", ":11434"].some((h) => b.includes(h))) {
      return "ollama";
    }
    const domainMap: Array<[string, string]> = [
      ["groq.com", "groq"],
      ["together.xyz", "together"],
      ["fireworks.ai", "fireworks"],
      ["openrouter.ai", "openrouter"],
      ["amazonaws.com", "bedrock"],
      ["azure.com", "azure"],
      ["googleapis.com", "google"],
      ["anthropic.com", "anthropic"],
      ["openai.com", "openai"],
    ];
    for (const [domain, prov] of domainMap) {
      if (b.includes(domain)) return prov;
    }
  }
  return extractProvider(model);
}

export function isReasoningCapableModel(model: string): boolean {
  const norm = normalizeModelName(model);
  if (norm.startsWith("o1") || norm.startsWith("o3") || norm.startsWith("o4") || norm.includes("deepseek-r1")) {
    return true;
  }
  if (["opus-4", "sonnet-4", "3-7-sonnet", "gpt-5", "gemini-2.5-pro"].some((x) => norm.includes(x))) {
    return true;
  }
  if (NON_REASONING_HINTS.some((h) => norm.includes(h))) {
    return false;
  }
  return false;
}

export function sanitizeThinkingParams<T extends Record<string, any>>(
  params: T,
  opts: { isDowngraded?: boolean; maxThinkingTokens?: number } = {},
): T {
  const out: Record<string, any> = { ...params };
  const targetModel = String(out.model || "");

  if (opts.isDowngraded && !isReasoningCapableModel(targetModel)) {
    delete out.reasoning_effort;
    delete out.reasoning;
    delete out.thinking;
    return out as T;
  }

  const cap = opts.maxThinkingTokens;
  if (cap !== undefined && cap > 0) {
    if (out.thinking && typeof out.thinking === "object" && "budget_tokens" in out.thinking) {
      const clamped = Math.max(1024, Math.min(Number(out.thinking.budget_tokens), cap));
      out.thinking = { ...out.thinking, budget_tokens: clamped };
    }
    const targetEffort = cap <= 2048 ? "low" : cap <= 8192 ? "medium" : "high";
    if (out.reasoning_effort === "high" && targetEffort !== "high") {
      out.reasoning_effort = targetEffort;
    }
    if (out.reasoning && typeof out.reasoning === "object" && out.reasoning.effort === "high" && targetEffort !== "high") {
      out.reasoning = { ...out.reasoning, effort: targetEffort };
    }
  }

  return out as T;
}

export function ensureOpenAIStreamUsage<T extends Record<string, any>>(params: T): T {
  if (params?.stream !== true) return params;
  const out: Record<string, any> = { ...params };
  if (!out.stream_options) {
    out.stream_options = { include_usage: true };
  } else if (typeof out.stream_options === "object" && !("include_usage" in out.stream_options)) {
    out.stream_options = { ...out.stream_options, include_usage: true };
  }
  return out as T;
}

export function normalizeResponsesApiInput(params: Record<string, any>): {
  userPrompt?: string;
  systemPrompt?: string;
  messages: any[];
} {
  const systemPrompt = typeof params.instructions === "string" ? params.instructions : undefined;
  const messages: any[] = [];
  let userPrompt: string | undefined;

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (typeof params.input === "string") {
    userPrompt = params.input;
    messages.push({ role: "user", content: params.input });
  } else if (Array.isArray(params.input)) {
    for (const item of params.input) {
      if (item && typeof item === "object") {
        messages.push(item);
        if (item.role === "user" && typeof item.content === "string") {
          userPrompt = item.content;
        }
      }
    }
  }
  return { userPrompt, systemPrompt, messages };
}

export function extractResponsesApiUsage(resp: any): {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  responseText?: string;
} {
  const usage = resp?.usage || {};
  return {
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    cachedTokens: Number(usage.input_tokens_details?.cached_tokens || 0),
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens || 0),
    responseText: typeof resp?.output_text === "string" ? resp.output_text : undefined,
  };
}
