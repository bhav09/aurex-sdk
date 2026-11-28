/**
 * Stage 2: In-Flight Runtime Guard helpers (wire stripping, drift diagnostics, thinking caps, stream & Responses API).
 */
import { AurexProviderDriftError } from "./exceptions";
import { countTextTokens, extractProvider, normalizeModelName } from "./pricing";

const NON_REASONING_HINTS = ["mini", "nano", "haiku", "flash", "gpt-3.5", "gpt-4o", "gpt-4-turbo"];

export interface DriftWarningEntry {
  provider: string;
  providerVersion?: string;
  missingSymbol: string;
  message: string;
}

export function reportProviderDrift(opts: {
  provider: string;
  missingSymbol: string;
  message: string;
  providerVersion?: string;
  strict?: boolean;
  driftLog?: DriftWarningEntry[];
}): void {
  const entry: DriftWarningEntry = {
    provider: opts.provider,
    providerVersion: opts.providerVersion,
    missingSymbol: opts.missingSymbol,
    message: opts.message,
  };
  if (opts.driftLog) opts.driftLog.push(entry);
  const isStrict = opts.strict ?? (process.env.AUREX_STRICT_DRIFT === "1");
  if (isStrict) {
    throw new AurexProviderDriftError(opts.message, {
      provider: opts.provider,
      providerVersion: opts.providerVersion,
      missingSymbol: opts.missingSymbol,
    });
  }
  console.warn(`[Aurex Provider Warning] ${opts.message}`);
}

export function stripAurexParams<T extends Record<string, any>>(
  params: T,
  opts: { provider?: string; ctx?: Record<string, any> } = {},
): {
  cleanParams: T;
  tags?: Record<string, string>;
  qualityScore?: number;
  workflowId?: string;
  tenantId?: string;
  extraMetadata: Record<string, any>;
} {
  if (!params || typeof params !== "object") {
    return { cleanParams: params, extraMetadata: {} };
  }
  const clean: Record<string, any> = { ...params };
  const ctx = opts.ctx || {};

  let tags = clean.tags;
  let qualityScore = clean.qualityScore ?? clean.quality_score;
  let workflowId = clean.workflowId ?? clean.workflow_id;
  let tenantId = clean.tenantId ?? clean.tenant_id;
  const extraMetaIn = clean.extra_metadata;
  const aurexMeta: Record<string, any> =
    extraMetaIn && typeof extraMetaIn === "object" ? { ...extraMetaIn } : {};

  delete clean.tags;
  delete clean.qualityScore;
  delete clean.quality_score;
  delete clean.workflowId;
  delete clean.workflow_id;
  delete clean.tenantId;
  delete clean.tenant_id;
  delete clean.extra_metadata;

  if (clean.metadata && typeof clean.metadata === "object") {
    const metaCopy: Record<string, any> = { ...clean.metadata };
    if (!tags) tags = metaCopy.tags;
    if (qualityScore === undefined) qualityScore = metaCopy.qualityScore ?? metaCopy.quality_score;
    if (!workflowId) workflowId = metaCopy.workflowId ?? metaCopy.workflow_id;
    if (!tenantId) tenantId = metaCopy.tenantId ?? metaCopy.tenant_id;
    Object.assign(aurexMeta, clean.metadata);

    delete metaCopy.tags;
    delete metaCopy.qualityScore;
    delete metaCopy.quality_score;
    delete metaCopy.workflowId;
    delete metaCopy.workflow_id;
    delete metaCopy.tenantId;
    delete metaCopy.tenant_id;

    if (opts.provider === "anthropic") {
      if (metaCopy.user_id !== undefined && metaCopy.user_id !== null) {
        clean.metadata = { user_id: String(metaCopy.user_id) };
      } else {
        delete clean.metadata;
      }
    } else if (opts.provider === "google") {
      delete clean.metadata;
    } else {
      const strMeta: Record<string, string> = {};
      for (const [k, v] of Object.entries(metaCopy)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          strMeta[k] = String(v);
        }
      }
      if (Object.keys(strMeta).length > 0) {
        clean.metadata = strMeta;
      } else {
        delete clean.metadata;
      }
    }
  }

  if (!workflowId && typeof clean.user === "string" && clean.user) {
    workflowId = clean.user;
  }
  if (tags && typeof tags !== "object") tags = undefined;
  tags = tags || ctx.tags;
  if (qualityScore === undefined) qualityScore = ctx.qualityScore ?? ctx.quality_score;
  workflowId = workflowId || ctx.workflowId || ctx.workflow_id;
  tenantId = tenantId || tags?.tenant_id || ctx.tenantId || ctx.tenant_id;
  if (tenantId) {
    tags = { ...(tags || {}), tenant_id: String(tenantId) };
  }

  return {
    cleanParams: clean as T,
    tags,
    qualityScore,
    workflowId,
    tenantId: tenantId ? String(tenantId) : undefined,
    extraMetadata: aurexMeta,
  };
}

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
    const domainMap: Array<[string, string]> = [
      ["groq.com", "groq"],
      ["together.xyz", "together"],
      ["fireworks.ai", "fireworks"],
      ["openrouter.ai", "openrouter"],
      ["nvidia.com", "nvidia_nim"],
      ["cloud.ibm.com", "watsonx"],
      ["watsonx", "watsonx"],
      ["amazonaws.com", "bedrock"],
      ["azure.com", "azure"],
      ["googleapis.com", "google"],
      ["anthropic.com", "anthropic"],
      ["openai.com", "openai"],
    ];
    for (const [domain, prov] of domainMap) {
      if (b.includes(domain)) return prov;
    }
    if (b.includes(":11434") || b.includes("ollama")) return "ollama";
    if (["localhost", "127.0.0.1", "0.0.0.0"].some((h) => b.includes(h))) {
      const inferred = extractProvider(model);
      return inferred === "ollama" || inferred === "unknown" ? "ollama" : inferred;
    }
  }
  return extractProvider(model);
}

export function isReasoningCapableModel(model: string): boolean {
  const norm = normalizeModelName(model);
  if (norm.startsWith("o1") || norm.startsWith("o3") || norm.startsWith("o4") || norm.includes("deepseek-r1")) {
    return true;
  }
  if (["opus-4", "sonnet-4", "3-7-sonnet", "gpt-5", "gemini-2.5-pro", "gemini-2.5-flash"].some((x) => norm.includes(x))) {
    return !norm.includes("flash-lite");
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
    if (out.config && typeof out.config === "object") {
      const cfgCopy = { ...out.config };
      delete cfgCopy.thinkingConfig;
      delete cfgCopy.thinking_config;
      out.config = cfgCopy;
    }
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
    if (out.config && typeof out.config === "object") {
      const tc = out.config.thinkingConfig || out.config.thinking_config;
      if (tc && typeof tc === "object") {
        const key = "thinkingBudget" in tc ? "thinkingBudget" : "thinking_budget";
        if (typeof tc[key] === "number" && tc[key] > cap) {
          const propName = "thinkingConfig" in out.config ? "thinkingConfig" : "thinking_config";
          out.config = { ...out.config, [propName]: { ...tc, [key]: cap } };
        }
      }
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

export function extractMessagesPrompts(messages: any): { systemPrompt?: string; userPrompt?: string } {
  if (!Array.isArray(messages)) return {};
  const sysParts: string[] = [];
  let userPrompt: string | undefined;
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    let textVal: string | undefined;
    if (typeof m.content === "string") {
      textVal = m.content;
    } else if (Array.isArray(m.content)) {
      textVal = m.content.map((b: any) => (typeof b === "string" ? b : b?.text || "")).join("");
    }
    if ((m.role === "system" || m.role === "developer") && textVal) {
      sysParts.push(textVal);
    } else if (m.role === "user" && textVal !== undefined) {
      userPrompt = textVal;
    }
  }
  return {
    systemPrompt: sysParts.length > 0 ? sysParts.join("\n") : undefined,
    userPrompt,
  };
}

export function normalizeResponsesApiInput(params: Record<string, any>): {
  userPrompt?: string;
  systemPrompt?: string;
  messages: any[];
} {
  let systemPrompt = typeof params.instructions === "string" ? params.instructions : undefined;
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
        if ((item.role === "system" || item.role === "developer") && typeof item.content === "string" && !systemPrompt) {
          systemPrompt = item.content;
        } else if (item.role === "user") {
          if (typeof item.content === "string") {
            userPrompt = item.content;
          } else if (Array.isArray(item.content)) {
            userPrompt = item.content.map((b: any) => b?.text || "").join("");
          }
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
  finishReason?: string;
} {
  const usage = resp?.usage || {};
  let responseText = typeof resp?.output_text === "string" ? resp.output_text : undefined;
  if (!responseText && Array.isArray(resp?.output)) {
    const parts: string[] = [];
    for (const item of resp.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") parts.push(c.text);
        }
      }
    }
    if (parts.length > 0) responseText = parts.join("");
  }
  const incReason = resp?.incomplete_details?.reason;
  const finishReason = incReason ? String(incReason) : resp?.status === "completed" ? "stop" : undefined;

  return {
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    cachedTokens: Number(usage.input_tokens_details?.cached_tokens || 0),
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens || 0),
    responseText,
    finishReason,
  };
}

export function extractAnthropicResponseDetails(resp: any): {
  inputTokens: number;
  rawInputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  cacheWrite1hTokens: number;
  reasoningTokens: number;
  responseText?: string;
  toolCallsCount: number;
  toolNames: string[];
  finishReason?: string;
} {
  const usage = resp?.usage || {};
  const rawIn = Number(usage.input_tokens || 0);
  const outToks = Number(usage.output_tokens || 0);
  const cacheRead = Number(usage.cache_read_input_tokens || 0);
  let cacheWrite = Number(usage.cache_creation_input_tokens || 0);
  const cacheWrite1h = Number(usage.cache_creation?.ephemeral_1h_input_tokens || 0);
  const cacheWrite5m = Number(usage.cache_creation?.ephemeral_5m_input_tokens || 0);
  if (cacheWrite === 0 && (cacheWrite1h > 0 || cacheWrite5m > 0)) {
    cacheWrite = cacheWrite5m + cacheWrite1h;
  }

  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolNames: string[] = [];

  if (Array.isArray(resp?.content)) {
    for (const b of resp.content) {
      if (!b) continue;
      if (b.type === "text" || !b.type) {
        if (b.text) textParts.push(String(b.text));
      } else if (b.type === "thinking") {
        if (b.thinking) thinkingParts.push(String(b.thinking));
      } else if (b.type === "tool_use") {
        toolNames.push(String(b.name || "unknown"));
      }
    }
  } else if (typeof resp?.content === "string") {
    textParts.push(resp.content);
  }

  return {
    inputTokens: rawIn + cacheRead + cacheWrite,
    rawInputTokens: rawIn,
    outputTokens: outToks,
    cachedTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    cacheWrite1hTokens: cacheWrite1h,
    reasoningTokens: thinkingParts.length > 0 ? countTextTokens(thinkingParts.join("\n")) : 0,
    responseText: textParts.length > 0 ? textParts.join("") : undefined,
    toolCallsCount: toolNames.length,
    toolNames,
    finishReason: resp?.stop_reason ? String(resp.stop_reason) : undefined,
  };
}

export function extractOpenAIResponseDetails(resp: any): {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  responseText?: string;
  finishReason?: string;
  toolCallsCount: number;
  toolNames: string[];
} {
  const usage = resp?.usage || {};
  const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const cachedTokens = Number(usage.prompt_tokens_details?.cached_tokens || usage.cache_read_input_tokens || 0);
  let reasoningTokens = Number(usage.completion_tokens_details?.reasoning_tokens || 0);

  const c0 = resp?.choices?.[0];
  const msg = c0?.message;
  let responseText: string | undefined = typeof msg?.content === "string" ? msg.content : undefined;
  if (!responseText && msg?.parsed !== undefined && msg?.parsed !== null) {
    responseText = JSON.stringify(msg.parsed);
  }
  if (reasoningTokens === 0 && typeof msg?.reasoning_content === "string" && msg.reasoning_content.length > 0) {
    reasoningTokens = countTextTokens(msg.reasoning_content);
  }
  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
  const toolNames = toolCalls.map((tc: any) => String(tc?.function?.name || tc?.name || "unknown"));

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    responseText,
    finishReason: c0?.finish_reason ? String(c0.finish_reason) : undefined,
    toolCallsCount: toolNames.length,
    toolNames,
  };
}

export class StreamUsageAccumulator {
  public textParts: string[] = [];
  public reasoningParts: string[] = [];
  public toolNames: string[] = [];
  public hasUsage = false;
  public inputTokens = 0;
  public outputTokens = 0;
  public cachedTokens = 0;
  public cacheWriteTokens = 0;
  public cacheWrite1hTokens = 0;
  public reasoningTokens = 0;
  public finishReason?: string;

  public feed(chunk: any): void {
    if (!chunk || typeof chunk !== "object") return;
    const ctype = chunk.type;

    if (typeof ctype === "string" && ctype.startsWith("response.")) {
      if (ctype === "response.output_text.delta" && typeof chunk.delta === "string") {
        this.textParts.push(chunk.delta);
      } else if (["response.completed", "response.incomplete", "response.failed"].includes(ctype) && chunk.response) {
        const u = extractResponsesApiUsage(chunk.response);
        this.hasUsage = true;
        this.inputTokens = u.inputTokens || this.inputTokens;
        this.outputTokens = u.outputTokens || this.outputTokens;
        this.cachedTokens = u.cachedTokens || this.cachedTokens;
        this.reasoningTokens = u.reasoningTokens || this.reasoningTokens;
        if (u.finishReason) this.finishReason = u.finishReason;
      }
      return;
    }

    if (
      ctype === "message_start" ||
      ctype === "content_block_start" ||
      ctype === "content_block_delta" ||
      ctype === "message_delta" ||
      ctype === "message_stop"
    ) {
      if (ctype === "message_start" && chunk.message) {
        const det = extractAnthropicResponseDetails(chunk.message);
        this.hasUsage = true;
        this.cachedTokens = det.cachedTokens;
        this.cacheWriteTokens = det.cacheWriteTokens;
        this.cacheWrite1hTokens = det.cacheWrite1hTokens;
        this.inputTokens = det.inputTokens;
        if (det.outputTokens) this.outputTokens = det.outputTokens;
      } else if (ctype === "content_block_start" && chunk.content_block?.type === "tool_use") {
        this.toolNames.push(String(chunk.content_block.name || "unknown"));
      } else if (ctype === "content_block_delta" && chunk.delta) {
        if (typeof chunk.delta.text === "string" && (!chunk.delta.type || chunk.delta.type === "text_delta")) {
          this.textParts.push(chunk.delta.text);
        } else if (typeof chunk.delta.thinking === "string") {
          this.reasoningParts.push(chunk.delta.thinking);
        }
      } else if (ctype === "message_delta") {
        if (chunk.delta?.stop_reason) this.finishReason = String(chunk.delta.stop_reason);
        if (chunk.usage?.output_tokens) {
          this.hasUsage = true;
          this.outputTokens = Number(chunk.usage.output_tokens);
        }
      }
      return;
    }

    if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
      const c0 = chunk.choices[0];
      if (c0?.finish_reason) this.finishReason = String(c0.finish_reason);
      if (typeof c0?.delta?.content === "string" && c0.delta.content) {
        this.textParts.push(c0.delta.content);
      }
      if (typeof c0?.delta?.reasoning_content === "string" && c0.delta.reasoning_content) {
        this.reasoningParts.push(c0.delta.reasoning_content);
      }
      if (Array.isArray(c0?.delta?.tool_calls)) {
        for (const tc of c0.delta.tool_calls) {
          const nm = tc?.function?.name || tc?.name;
          if (nm) this.toolNames.push(String(nm));
        }
      }
    }

    if (chunk.usage) {
      this.hasUsage = true;
      const pt = Number(chunk.usage.prompt_tokens || chunk.usage.input_tokens || 0);
      const ct = Number(chunk.usage.completion_tokens || chunk.usage.output_tokens || 0);
      if (pt) this.inputTokens = pt;
      if (ct) this.outputTokens = ct;
      if (chunk.usage.prompt_tokens_details?.cached_tokens) {
        this.cachedTokens = Number(chunk.usage.prompt_tokens_details.cached_tokens);
      }
      if (chunk.usage.completion_tokens_details?.reasoning_tokens) {
        this.reasoningTokens = Number(chunk.usage.completion_tokens_details.reasoning_tokens);
      }
    }

    const um = chunk.usageMetadata || chunk.usage_metadata;
    if (um) {
      this.hasUsage = true;
      const ptc = Number(um.promptTokenCount || um.prompt_token_count || 0);
      const ctc = Number(um.candidatesTokenCount || um.candidates_token_count || 0);
      const ttc = Number(um.thoughtsTokenCount || um.thoughts_token_count || 0);
      const cc = Number(um.cachedContentTokenCount || um.cached_content_token_count || 0);
      if (ptc > 0) this.inputTokens = ptc;
      if (ctc > 0 || ttc > 0) this.outputTokens = ctc + ttc;
      if (ttc > 0) this.reasoningTokens = ttc;
      if (cc > 0) this.cachedTokens = cc;
    }

    if (!chunk.choices && typeof chunk.text === "string" && chunk.text) {
      this.textParts.push(chunk.text);
    }
  }

  public finalizeMetrics(estimateInputFn: () => number) {
    const responseText = this.textParts.join("");
    let reasoningTokens = this.reasoningTokens;
    if (reasoningTokens === 0 && this.reasoningParts.length > 0) {
      reasoningTokens = countTextTokens(this.reasoningParts.join(""));
    }
    const inputTokens = this.hasUsage && this.inputTokens > 0 ? this.inputTokens : estimateInputFn();
    const outputTokens =
      this.hasUsage && this.outputTokens > 0
        ? this.outputTokens
        : responseText
          ? countTextTokens(responseText)
          : reasoningTokens;
    return {
      responseText,
      inputTokens,
      outputTokens,
      cachedTokens: this.cachedTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      cacheWrite1hTokens: this.cacheWrite1hTokens,
      reasoningTokens,
      finishReason: this.finishReason,
      toolCallsCount: this.toolNames.length,
      toolNames: this.toolNames,
    };
  }
}

export function createStreamProxy<T extends object>(
  rawStream: T,
  acc: StreamUsageAccumulator,
  onFinalize: (completed: boolean) => void,
): T {
  let finalized = false;
  const finish = (completed: boolean) => {
    if (!finalized) {
      finalized = true;
      onFinalize(completed);
    }
  };

  async function* auditedGenerator() {
    let completed = false;
    try {
      for await (const chunk of rawStream as any) {
        acc.feed(chunk);
        yield chunk;
      }
      completed = true;
    } finally {
      finish(completed);
    }
  }

  if (!rawStream || typeof rawStream !== "object") {
    return auditedGenerator() as unknown as T;
  }

  return new Proxy(rawStream, {
    get(target, prop) {
      if (prop === Symbol.asyncIterator) {
        return () => auditedGenerator();
      }
      const val = Reflect.get(target, prop, target);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}

export function attachApiPromiseMethods<T>(
  mainPromise: Promise<T>,
  withResponseFn?: () => Promise<{ data: T; response: any; request_id?: string }>,
): Promise<T> {
  const p: any = mainPromise;
  p._thenUnwrap = (transform: (data: T) => any) => attachApiPromiseMethods(mainPromise.then(transform));
  if (withResponseFn) {
    p.withResponse = withResponseFn;
    p.asResponse = async () => (await withResponseFn()).response;
  }
  return p;
}
