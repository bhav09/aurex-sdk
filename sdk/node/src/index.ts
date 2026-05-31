import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import {
  AurexDecision,
  applyDecisionToCallParams,
  compressMessages,
  isExpensiveModel,
  suggestCheaperModel,
} from "./decisions";
import { jaccardNGramSimilarity } from "./semantic";
import { syncBatchWithRetry } from "./cloud_sync";
import { emitWarningOnce, prepareLedgerStorage } from "./ledger_utils";
import { AurexBudgetExceeded, AurexResilienceExhausted } from "./exceptions";
import {
  AttemptRecord,
  executeWithResilience,
  parseResilienceConfig,
  ResiliencePolicy,
} from "./resilience";

export const aurexContext = new AsyncLocalStorage<Record<string, any>>();

export interface BudgetGuardConfig {
  maxCostPerMinute?: number;      // e.g. 5.00
  maxCostPerSession?: number;     // e.g. 50.00
  maxRequestsPerMinute?: number;  // e.g. 100
  maxContextTokens?: number;      // e.g. 128000
  onBudgetExceeded?: 'throw' | 'warn' | 'webhook'; // 'throw' | 'warn' | 'webhook'
  webhookUrl?: string;
  dryRun?: boolean;
}

export interface AurexConfig {
  apiKey?: string;
  project?: string;
  ledgerPath?: string;
  cloudSync?: boolean;
  cloudEndpoint?: string;
  baseUrl?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  localOnly?: boolean;
  budgetGuard?: BudgetGuardConfig;
  syncPromptHashes?: boolean;
  autoDowngradeSimplePrompts?: boolean;
  otelExport?: boolean;
  onCacheHit?: (workflowId: string, prompt: string) => string | undefined;
  onCacheMiss?: (workflowId: string, prompt: string) => void;
  pricingPath?: string;
  defaultPricing?: { input: number; output: number };
  simplePromptTokenLimit?: number;
  runawayContextMultiplier?: number;
  loopSimilarityThreshold?: number;
  downgradeMap?: Record<string, string>;
  maxQueueSize?: number;
  syncTimeoutMs?: number;
  syncMaxRetries?: number;
  perProcessLedger?: boolean;
  storageMode?: "file" | "memory";
  resilience?: Record<string, unknown>;
}

function resolveCloudEndpoint(config?: AurexConfig): string {
  if (config?.cloudEndpoint) return config.cloudEndpoint;
  const base = (config?.baseUrl || process.env.AUREX_BASE_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
  return `${base}/ledger/events`;
}

export interface AurexEvent {
  timestamp: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  is_batch: boolean;
  total_tokens: number;
  cost: number;
  workflow_id?: string;
  system_prompt_hash?: string;
  prompt_hash?: string;
  response_hash?: string;
  extra_metadata?: Record<string, any>;
  retry_count?: number;
  outcome?: string;
  cost_type?: string;
  tool_calls_count?: number;
  tool_names?: string[];
  tags?: Record<string, string>;
  quality_score?: number;
  attempt_index?: number;
  recovery_provider?: string;
  projected_cost?: number;
  latency_ms?: number;
  status?: string;
  error_code?: string;
  finish_reason?: string;
}

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
  "llama3.1:70b": { input: 0.0, output: 0.0 },
  "llama3.1:8b": { input: 0.0, output: 0.0 },
  "llama-4-scout": { input: 0.0, output: 0.0 },
  "llama-4-maverick": { input: 0.0, output: 0.0 },
  "qwen2.5:72b": { input: 0.0, output: 0.0 },
  "qwen3": { input: 0.0, output: 0.0 },
  "mistral:7b": { input: 0.0, output: 0.0 },
  "mistral-large": { input: 2.00, output: 6.00 },
};

export function normalizeModelName(m: string): string {
  let model = m.trim().toLowerCase();
  // Strip fine-tuned model prefixes (e.g. "ft:gpt-4o-mini-2024-07-18:my-org::abc123" → base model)
  const ftMatch = model.match(/^ft:([^:]+)/);
  if (ftMatch) {
    model = ftMatch[1];
  }
  // Remove common prefixes & OpenRouter prefixes in a loop
  let prev = "";
  const prefixRegex = /^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/|openrouter\/|google\/|anthropic\/|meta-llama\/|deepseek\/|mistralai\/|openai\/|qwen\/)/;
  while (model !== prev) {
    prev = model;
    model = model.replace(prefixRegex, "");
  }
  model = model.replace(/[\s_]+/g, "-");
  return model;
}

function wildcardMatch(str: string, rule: string): boolean {
  const escapeRegex = (s: string) => s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str);
}

export function getModelPricing(model: string): [number, number] {
  if (!model) return [1.50, 6.00];
  const queryNorm = normalizeModelName(model);

  // Check wildcard patterns first
  for (const [pattern, pricing] of Object.entries(MODEL_PRICING)) {
    if (pattern.includes("*")) {
      if (wildcardMatch(queryNorm, pattern)) {
        return [pricing.input, pricing.output];
      }
    }
  }

  const pricing = MODEL_PRICING[queryNorm];
  if (pricing) return [pricing.input, pricing.output];
  
  const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (queryNorm.includes(key)) {
      return [MODEL_PRICING[key].input, MODEL_PRICING[key].output];
    }
  }

  // Check if huggingface is the provider
  const prov = extractProvider(model);
  if (prov === "huggingface") {
    return [0.0, 0.0];
  }

  // Fallback to configured default pricing on singleton instance if available
  try {
    const instance = AurexAuditor.getInstance();
    if (instance && instance.defaultPricing) {
      return [instance.defaultPricing.input, instance.defaultPricing.output];
    }
  } catch (e) {}

  // Moderate fallback — avoids extreme overcharging for unknown/new models
  return [1.50, 6.00];
}

/**
 * Cache-aware cost calculation.
 * @param cachedTokens - tokens served from provider cache
 * @param cacheWriteTokens - tokens written to cache
 * @param isBatch - if true, applies 50% discount (OpenAI Batch API)
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  cacheWriteTokens: number = 0,
  isBatch: boolean = false,
): number {
  const [inputPrice, outputPrice] = getModelPricing(model);
  const provider = extractProvider(model);
  
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
  
  let cacheReadMult = 1.0;
  let cacheCreateMult = 1.0;
  
  if (provider === "anthropic") {
    cacheReadMult = 0.10;
    cacheCreateMult = 1.25;
  } else if (provider === "openai") {
    cacheReadMult = 0.50;
    cacheCreateMult = 1.0;
  } else if (provider === "google") {
    cacheReadMult = 0.25;
    cacheCreateMult = 1.0;
  } else {
    cacheReadMult = 0.25;
    cacheCreateMult = 1.0;
  }
  
  let cost = (
    (nonCachedInput / 1_000_000 * inputPrice) +
    (cachedTokens / 1_000_000 * inputPrice * cacheReadMult) +
    (cacheWriteTokens / 1_000_000 * inputPrice * cacheCreateMult) +
    (outputTokens / 1_000_000 * outputPrice)
  );
  
  if (isBatch) {
    cost *= 0.50; // 50% Batch API discount
  }
  
  return cost;
}

export function extractProvider(model: string): string {
  const modelLower = model.toLowerCase();
  if (model.includes("/")) {
    if (!["openai/", "google/", "anthropic/", "bedrock/"].some(x => modelLower.includes(x))) {
      return "huggingface";
    }
  }
  if (modelLower.includes("claude")) return "anthropic";
  if (modelLower.includes("gpt") || modelLower.startsWith("o1") || modelLower.startsWith("o3") || modelLower.startsWith("o4")) return "openai";
  if (modelLower.includes("gemini")) return "google";
  if (["llama", "mistral", "qwen", "deepseek"].some(x => modelLower.includes(x))) return "ollama";
  return "unknown";
}


export class AurexAuditor {
  private static instance: AurexAuditor | null = null;
  private config: Required<AurexConfig>;
  private queue: AurexEvent[] = [];
  private lastMinuteEvents: { timestamp: number; cost: number }[] = [];
  private sessionCosts: Record<string, number> = {};
  private budgetConfig?: Record<string, any>;
  private flushIntervalId: any = null;
  private recentRequests: any[] = [];
  private recentResponses: any[] = [];
  private ignoredWorkflows = new Set<string>();
  private sessionRetryCounts: Record<string, number> = {};
  private syncErrorCount = 0;
  private lastSyncError: string | null = null;
  private eventsLogged = 0;
  private eventsDropped = 0;
  private patchStatus: Record<string, string> = {};
  private readonly warningFlag = { emitted: false };
  private resiliencePolicy: ResiliencePolicy;
  private registeredFallbacks: Record<
    string,
    { callFn: () => Promise<unknown> | unknown; provider: string; model: string }
  > = {};

  public downgradeMap: Record<string, string> = {};
  public defaultPricing?: { input: number; output: number };

  private constructor(config?: AurexConfig) {
    const defaultLedger = ".aurex/ledger.jsonl";
    this.config = {
      apiKey: config?.apiKey || process.env.AUREX_API_KEY || "",
      project: config?.project || "default",
      ledgerPath: config?.ledgerPath || defaultLedger,
      cloudSync: config?.cloudSync ?? !!(config?.apiKey || process.env.AUREX_API_KEY),
      cloudEndpoint: resolveCloudEndpoint(config),
      baseUrl: config?.baseUrl || process.env.AUREX_BASE_URL || "",
      flushIntervalMs: config?.flushIntervalMs || 30000,
      maxBatchSize: config?.maxBatchSize || 100,
      localOnly: config?.localOnly ?? !(config?.apiKey || process.env.AUREX_API_KEY),
      budgetGuard: config?.budgetGuard || {},
      syncPromptHashes: config?.syncPromptHashes ?? (process.env.AUREX_SYNC_PROMPT_HASHES === "1" || process.env.AUREX_SYNC_PROMPT_HASHES === "true"),
      autoDowngradeSimplePrompts: config?.autoDowngradeSimplePrompts ?? false,
      otelExport: config?.otelExport ?? false,
      onCacheHit: config?.onCacheHit || (() => undefined),
      onCacheMiss: config?.onCacheMiss || (() => {}),
      pricingPath: config?.pricingPath || process.env.AUREX_PRICING_PATH || "",
      defaultPricing: config?.defaultPricing || { input: 1.50, output: 6.00 },
      simplePromptTokenLimit: config?.simplePromptTokenLimit ?? 120,
      runawayContextMultiplier: config?.runawayContextMultiplier ?? 2.2,
      loopSimilarityThreshold: config?.loopSimilarityThreshold ?? 0.8,
      downgradeMap: config?.downgradeMap || {},
      maxQueueSize: config?.maxQueueSize ?? 10000,
      syncTimeoutMs: config?.syncTimeoutMs ?? 10000,
      syncMaxRetries: config?.syncMaxRetries ?? 3,
      perProcessLedger: config?.perProcessLedger ?? true,
      storageMode: config?.storageMode ?? "file",
      resilience: config?.resilience || {},
    };

    this.resiliencePolicy = parseResilienceConfig(this.config.resilience);

    const prepared = prepareLedgerStorage(
      this.config.ledgerPath,
      this.config.storageMode,
      this.config.perProcessLedger,
    );
    this.config.ledgerPath = prepared.ledgerPath;
    this.config.storageMode = prepared.storageMode;
    if (prepared.warning) {
      emitWarningOnce(prepared.warning, this.warningFlag);
    }

    this.downgradeMap = this.config.downgradeMap || {};
    this.defaultPricing = this.config.defaultPricing;

    if (config?.budgetGuard) {
      this.budgetConfig = config.budgetGuard;
    }

    // Load custom pricing path if exists
    if (this.config.pricingPath && fs.existsSync(this.config.pricingPath)) {
      try {
        const content = fs.readFileSync(this.config.pricingPath, "utf-8");
        const customPricing = JSON.parse(content);
        if (customPricing && typeof customPricing === "object") {
          for (const [k, v] of Object.entries(customPricing)) {
            if (v && typeof v === "object" && "input" in v && "output" in v) {
              MODEL_PRICING[k] = {
                input: Number((v as any).input),
                output: Number((v as any).output),
              };
            }
          }
        }
      } catch (err) {
        console.error(`[Aurex Warning] Failed to load custom pricing from ${this.config.pricingPath}:`, err);
      }
    }

    // Ensure ledger directory exists
    const ledgerDir = path.dirname(this.config.ledgerPath);
    if (ledgerDir && ledgerDir !== "." && !fs.existsSync(ledgerDir)) {
      try {
        fs.mkdirSync(ledgerDir, { recursive: true });
      } catch (err) {
        console.error(`[Aurex Warning] Could not create ledger directory:`, err);
      }
    }

    // Queue crash recovery: check if pending.jsonl exists, load events, then delete file
    const pendingPath = path.join(ledgerDir || ".", "pending.jsonl");
    if (fs.existsSync(pendingPath)) {
      try {
        const content = fs.readFileSync(pendingPath, "utf-8");
        const lines = content.split("\n").filter(line => line.trim().length > 0);
        const recoveredEvents: AurexEvent[] = [];
        for (const line of lines) {
          try {
            recoveredEvents.push(JSON.parse(line));
          } catch (e) {}
        }
        if (recoveredEvents.length > 0) {
          // Write recovered events directly to ledger
          const dataStr = recoveredEvents.map(e => JSON.stringify(e)).join("\n") + "\n";
          fs.appendFileSync(this.config.ledgerPath, dataStr, "utf-8");
          // Optionally sync to cloud
          if (this.config.cloudSync && !this.config.localOnly && this.config.apiKey) {
            this.syncToCloud(recoveredEvents).catch(() => {});
          }
        }
        fs.unlinkSync(pendingPath);
      } catch (err) {
        console.error(`[Aurex Warning] Failed to recover pending events:`, err);
      }
    }

    // Register process exit listeners for graceful shutdown and queue persistence
    if (typeof process !== "undefined") {
      let exitHandled = false;
      const handleExit = () => {
        if (exitHandled) return;
        exitHandled = true;
        this.persistPendingAndShutdown();
      };
      
      process.on("beforeExit", handleExit);
      process.on("exit", handleExit);
      process.on("SIGINT", () => {
        handleExit();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        handleExit();
        process.exit(0);
      });
    }

    // Spawn non-blocking background queue flush loop
    this.flushIntervalId = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  public static getInstance(config?: AurexConfig): AurexAuditor {
    if (!AurexAuditor.instance) {
      AurexAuditor.instance = new AurexAuditor(config);
    } else if (config) {
      emitWarningOnce(
        "[Aurex Warning] AurexAuditor already initialized; ignoring new config. Call AurexAuditor.reset() first.",
        AurexAuditor.instance.warningFlag,
      );
    }
    return AurexAuditor.instance;
  }

  public static reset(): void {
    if (AurexAuditor.instance) {
      AurexAuditor.instance.shutdown();
      AurexAuditor.instance = null;
    }
  }

  private hashText(text?: string): string | undefined {
    if (!text) return undefined;
    return crypto.createHash("sha256").update(text).digest("hex");
  }

  public registerModelPricing(model: string, inputCost: number, outputCost: number): void {
    MODEL_PRICING[model] = { input: inputCost, output: outputCost };
  }

  public registerFallback(
    name: string,
    callFn: () => Promise<unknown> | unknown,
    opts: { provider: string; model: string },
  ): void {
    this.registeredFallbacks[name] = {
      callFn,
      provider: opts.provider,
      model: opts.model,
    };
  }

  private resilienceOnAttempt(
    record: AttemptRecord,
    workflowId: string,
    resp: unknown,
    exc?: unknown,
  ): void {
    const extra: Record<string, unknown> = {
      resilience_kind: record.classification.kind,
      loss_avoided: record.lossAvoided,
    };
    if (exc) extra.error = String((exc as Error)?.message || exc);
    this.logEvent({
      model: record.model,
      workflowId,
      outcome: record.outcome,
      costType: record.costType,
      retryCount: record.attemptIndex,
      provider: record.provider,
      attemptIndex: record.attemptIndex,
      recoveryProvider: record.recoveryProvider,
      projectedCost: record.projectedCost,
      latencyMs: record.classification.latencyMs,
      status: record.classification.status,
      errorCode: record.classification.errorCode,
      finishReason: record.classification.finishReason,
      extraMetadata: extra,
    });
    if (record.outcome === "failure" && exc) {
      this.markFailure(workflowId, String((exc as Error)?.message || exc), extra as Record<string, any>);
    }
  }

  public async callWithResilience<T>(
    callFn: () => Promise<T> | T,
    opts: { provider: string; workflowId: string; model: string; idempotencyKey?: string },
  ): Promise<T> {
    const policy = this.resiliencePolicy;
    if (!policy.enabled) {
      try {
        return await Promise.resolve(callFn());
      } catch (ex) {
        this.markFailure(opts.workflowId, String((ex as Error)?.message || ex));
        throw ex;
      }
    }

    const registered: Record<string, () => Promise<unknown> | unknown> = {};
    for (const [k, v] of Object.entries(this.registeredFallbacks)) {
      registered[k] = v.callFn;
    }

    const { resp } = await executeWithResilience(callFn, policy, {
      provider: opts.provider,
      model: opts.model,
      workflowId: opts.workflowId,
      idempotencyKey: opts.idempotencyKey,
      onAttempt: (record, r, exc) => this.resilienceOnAttempt(record, opts.workflowId, r, exc),
      registeredFallbacks: registered,
      calculateCostFn: (m, i, o) => calculateCost(m, i, o),
    });
    return resp;
  }

  /**
   * Log LLM metadata asynchronously.
   * Prompts and completions are hashed locally (Zero-PII Promise) before logging.
   */
  public logEvent(params: {
    model: string;
    prompt?: string;
    response?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    isBatch?: boolean;
    workflowId?: string;
    systemPrompt?: string;
    extraMetadata?: Record<string, any>;
    retryCount?: number;
    outcome?: string;
    costType?: string;
    toolCallsCount?: number;
    toolNames?: string[];
    tags?: Record<string, string>;
    qualityScore?: number;
    provider?: string;
    attemptIndex?: number;
    recoveryProvider?: string;
    projectedCost?: number;
    latencyMs?: number;
    status?: string;
    errorCode?: string;
    finishReason?: string;
  }) {
    const inputT = params.inputTokens || 0;
    const outputT = params.outputTokens || 0;
    const cachedT = params.cachedTokens || 0;
    const cacheWriteT = params.cacheWriteTokens || 0;
    const reasoningT = params.reasoningTokens || 0;
    const isBatch = params.isBatch || false;
    const cost = calculateCost(params.model, inputT, outputT, cachedT, cacheWriteT, isBatch);
    const provider = params.provider || extractProvider(params.model);

    const event: AurexEvent = {
      timestamp: new Date().toISOString(),
      provider,
      model: params.model,
      input_tokens: inputT,
      output_tokens: outputT,
      cached_tokens: cachedT,
      cache_write_tokens: cacheWriteT,
      reasoning_tokens: reasoningT,
      is_batch: isBatch,
      total_tokens: inputT + outputT,
      cost,
      workflow_id: params.workflowId,
      system_prompt_hash: this.hashText(params.systemPrompt),
      prompt_hash: this.hashText(params.prompt),
      response_hash: this.hashText(params.response),
      extra_metadata: params.extraMetadata || {},
      retry_count: params.retryCount,
      outcome: params.outcome,
      cost_type: params.costType,
      tool_calls_count: params.toolCallsCount,
      tool_names: params.toolNames || [],
      tags: params.tags || {},
      quality_score: params.qualityScore,
      attempt_index: params.attemptIndex,
      recovery_provider: params.recoveryProvider,
      projected_cost: params.projectedCost,
      latency_ms: params.latencyMs,
      status: params.status,
      error_code: params.errorCode,
      finish_reason: params.finishReason,
    };

    // Optional OpenTelemetry Export
    if (this.config.otelExport) {
      try {
        const api = require("@opentelemetry/api");
        const tracer = api.trace.getTracer("aurex-sdk");
        const span = tracer.startSpan("llm_call");
        span.setAttribute("llm.model", params.model);
        span.setAttribute("llm.provider", provider);
        span.setAttribute("llm.input_tokens", inputT);
        span.setAttribute("llm.output_tokens", outputT);
        span.setAttribute("llm.cost", cost);
        if (params.workflowId) {
          span.setAttribute("llm.workflow_id", params.workflowId);
        }
        if (params.tags) {
          for (const [k, v] of Object.entries(params.tags)) {
            span.setAttribute(`llm.tags.${k}`, v);
          }
        }
        if (params.qualityScore !== undefined) {
          span.setAttribute("llm.quality_score", params.qualityScore);
        }
        span.end();
      } catch (err) {}
    }

    // Track metrics for the sliding window
    this.lastMinuteEvents.push({ timestamp: Date.now(), cost });
    if (params.workflowId) {
      this.sessionCosts[params.workflowId] = (this.sessionCosts[params.workflowId] || 0) + cost;
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      this.handleQueueOverflow(event);
    } else {
      this.queue.push(event);
    }

    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush();
    }

    // Evaluate budget and trigger circuit breaker if exceeded
    this.checkBudget(cost, inputT, params.workflowId);
  }

  public configureCircuitBreaker(config: BudgetGuardConfig): void {
    this.budgetConfig = config;
  }

  private estimateTokens(prompt?: string, messages?: any[]): number {
    if (messages) {
      let chars = 0;
      for (const m of messages) {
        if (typeof m.content === "string") {
          chars += m.content.length;
        }
      }
      return Math.max(1, Math.floor(chars / 4));
    }
    if (prompt) {
      return Math.max(1, Math.floor(prompt.length / 4));
    }
    return 1;
  }

  public markSuccess(workflowId: string, metadata?: Record<string, any>): void {
    this.logEvent({
      model: "aurex-outcome",
      inputTokens: 0,
      outputTokens: 0,
      workflowId,
      outcome: "success",
      costType: "outcome_signal",
      extraMetadata: metadata,
    });
  }

  public markFailure(workflowId: string, reason?: string, metadata?: Record<string, any>): void {
    this.logEvent({
      model: "aurex-outcome",
      inputTokens: 0,
      outputTokens: 0,
      workflowId,
      outcome: "failure",
      costType: "outcome_signal",
      extraMetadata: { reason, ...metadata },
    });
  }

  public ignore(workflowId?: string): void {
    const wf = workflowId || process.env.AUREX_WORKFLOW_ID || "default_workflow";
    this.ignoredWorkflows.add(wf);
  }

  public preCallCheck(params: {
    model: string;
    prompt?: string;
    systemPrompt?: string;
    workflowId?: string;
    messages?: any[];
    retryCount?: number;
  }): AurexDecision {
    const now = Date.now();
    const workflowId = params.workflowId || process.env.AUREX_WORKFLOW_ID || "default_workflow";
    const estTokens = this.estimateTokens(params.prompt, params.messages);

    const promptHash = this.hashText(params.prompt);
    const sysPromptHash = this.hashText(params.systemPrompt);

    const reqMeta = {
      timestamp: now,
      model: params.model,
      workflowId,
      systemPromptHash: sysPromptHash,
      promptHash,
      promptText: params.prompt,
      estimatedTokens: estTokens
    };

    // Filter recent requests to last 5 minutes
    this.recentRequests = this.recentRequests.filter(r => now - r.timestamp < 300000);
    
    // Semantic cache suggestion check
    let cacheHitFound = false;
    if (params.prompt) {
      const workflowRequests = this.recentRequests.filter(r => r.workflowId === workflowId);
      for (let i = workflowRequests.length - 1; i >= 0; i--) {
        const prevPrompt = workflowRequests[i].promptText;
        if (prevPrompt && jaccardNGramSimilarity(params.prompt, prevPrompt) > 0.9) {
          cacheHitFound = true;
          break;
        }
      }
    }
    
    this.recentRequests.push(reqMeta);
    if (this.recentRequests.length > 200) {
      this.recentRequests.shift();
    }

    // Trigger cache hooks
    if (cacheHitFound && this.config.onCacheHit) {
      try {
        const cachedRes = this.config.onCacheHit(workflowId, params.prompt || "");
        if (cachedRes) {
          return {
            action: "cache_suggest",
            reason: `Semantic cache hit (similarity > 0.9) in workflow '${workflowId}'`,
            response: cachedRes,
            originalModel: params.model,
          };
        }
      } catch (err: any) {
        console.error(`[Aurex SDK Cache Callback Error]`, err);
      }
    } else if (!cacheHitFound && this.config.onCacheMiss) {
      try {
        this.config.onCacheMiss(workflowId, params.prompt || "");
      } catch (err: any) {
        console.error(`[Aurex SDK Cache Callback Error]`, err);
      }
    }

    const workflowRequests = this.recentRequests.filter(r => r.workflowId === workflowId);
    let decision: AurexDecision = { action: "proceed", reason: "ok", originalModel: params.model };

    if (this.ignoredWorkflows.has(workflowId)) {
      return decision;
    }

    const ctx = aurexContext.getStore() || {};
    const ctxBudget = ctx.budgetGuard || {};
    const budgetConfig = { ...(this.budgetConfig || {}), ...ctxBudget };

    const simplePromptTokenLimit = ctx.simplePromptTokenLimit !== undefined ? ctx.simplePromptTokenLimit : this.config.simplePromptTokenLimit;
    const runawayContextMultiplier = ctx.runawayContextMultiplier !== undefined ? ctx.runawayContextMultiplier : this.config.runawayContextMultiplier;
    const loopSimilarityThreshold = ctx.loopSimilarityThreshold !== undefined ? ctx.loopSimilarityThreshold : this.config.loopSimilarityThreshold;

    // Pre-emptive budget check
    const [inputPrice] = getModelPricing(params.model);
    const predictedCost = (estTokens / 1000000) * inputPrice;
    let budgetExceeded = false;
    let budgetReason = "";

    if (budgetConfig) {
      if (budgetConfig.maxCostPerSession !== undefined) {
        const currentSessionCost = this.sessionCosts[workflowId] || 0;
        if (currentSessionCost + predictedCost > budgetConfig.maxCostPerSession) {
          budgetExceeded = true;
          budgetReason += `Predicted cost $${predictedCost.toFixed(4)} plus session cost $${currentSessionCost.toFixed(4)} exceeds session limit of $${budgetConfig.maxCostPerSession.toFixed(4)}. `;
        }
      }

      if (budgetConfig.maxCostPerMinute !== undefined) {
        const minuteCost = this.lastMinuteEvents.reduce((acc, e) => acc + e.cost, 0);
        if (minuteCost + predictedCost > budgetConfig.maxCostPerMinute) {
          budgetExceeded = true;
          budgetReason += `Predicted cost $${predictedCost.toFixed(4)} plus minute cost $${minuteCost.toFixed(4)} exceeds minute limit of $${budgetConfig.maxCostPerMinute.toFixed(4)}. `;
        }
      }

      if (budgetConfig.maxRequestsPerMinute !== undefined) {
        const minuteRequests = this.lastMinuteEvents.length;
        if (minuteRequests + 1 > budgetConfig.maxRequestsPerMinute) {
          budgetExceeded = true;
          budgetReason += `Adding this request would exceed minute requests limit of ${budgetConfig.maxRequestsPerMinute}. `;
        }
      }

      if (budgetConfig.maxContextTokens !== undefined && estTokens > budgetConfig.maxContextTokens) {
        budgetExceeded = true;
        budgetReason += `Estimated input tokens ${estTokens} exceeds maximum context token limit of ${budgetConfig.maxContextTokens}. `;
      }
    }

    if (budgetExceeded) {
      decision = {
        action: "block",
        reason: budgetReason.trim(),
        originalModel: params.model,
      };
    }

    if (decision.action !== "block") {
      const retryCount = params.retryCount ?? this.sessionRetryCounts[workflowId] ?? 0;
      const loopScore = this.computeSemanticLoopScore(workflowId, params.prompt || "");

      // 1. System Prompt Waste Detector
      if (sysPromptHash && workflowRequests.length >= 2) {
        const duplicates = workflowRequests.slice(0, -1).filter(r => r.systemPromptHash === sysPromptHash);
        if (duplicates.length > 0 && params.messages) {
          decision = {
            action: "compress",
            reason: `System prompt waste in workflow '${workflowId}'`,
            compressedMessages: compressMessages(params.messages),
            originalModel: params.model,
          };
        }
      }

      // 2. Agent Runaway Loop Detector (exponential context growth)
      if (workflowRequests.length >= 3 && decision.action === "proceed") {
        const recent = workflowRequests.slice(-3);
        const sizes = recent.map(r => r.estimatedTokens);
        if (sizes[1] >= sizes[0] * runawayContextMultiplier && sizes[2] >= sizes[1] * runawayContextMultiplier && sizes[0] > 20) {
          const cheaper = suggestCheaperModel(params.model);
          decision = {
            action: "downgrade",
            reason: `Runaway context growth in '${workflowId}'`,
            suggestedModel: cheaper,
            injectSystemInstruction:
              "Summarize prior context briefly, then continue with a shorter answer.",
            originalModel: params.model,
            loopScore,
          };
          this.sessionRetryCounts[workflowId] = (this.sessionRetryCounts[workflowId] || 0) + 1;
        }
      }

      // 3. Expensive Model Misuse + adaptive downgrade near budget
      let isSimple = estTokens < simplePromptTokenLimit;
      if (params.prompt && (params.prompt.includes("```") || params.prompt.includes("~~~"))) {
        isSimple = false;
      }
      const sessionCost = this.sessionCosts[workflowId] || 0;
      const nearBudget =
        budgetConfig?.maxCostPerSession !== undefined &&
        sessionCost > (budgetConfig.maxCostPerSession * 0.8);
      
      let shouldDowngrade = false;
      if (decision.action === "proceed") {
        if (nearBudget) {
          shouldDowngrade = true;
        } else if (this.config.autoDowngradeSimplePrompts && isExpensiveModel(params.model) && isSimple) {
          shouldDowngrade = true;
        }
      }
      if (shouldDowngrade && decision.action === "proceed") {
        const recommended = suggestCheaperModel(params.model);
        if (recommended) {
          decision = {
            action: "downgrade",
            reason: nearBudget
              ? `Budget threshold near for '${workflowId}'`
              : `Over-provisioned model for simple task (~${estTokens} tokens)`,
            suggestedModel: recommended,
            originalModel: params.model,
          };
        }
      }

      // 4. Context Explosion Detector
      if (workflowRequests.length >= 2 && params.messages && decision.action === "proceed") {
        const initial = workflowRequests[0].estimatedTokens;
        const current = estTokens;
        if (initial > 0 && current >= initial * 3.5) {
          decision = {
            action: "compress",
            reason: `Context explosion in '${workflowId}' (${initial} -> ${current} est. tokens)`,
            compressedMessages: compressMessages(params.messages),
            originalModel: params.model,
          };
        }
      }

      // 5. Semantic loop detection
      if (loopScore >= loopSimilarityThreshold) {
        decision = {
          action: "compress",
          reason: `Semantic loop detected (score ${loopScore.toFixed(2)})`,
          loopScore,
          injectSystemInstruction:
            "You appear to be repeating yourself. Summarize your current state and try a different approach.",
          compressedMessages: params.messages ? compressMessages(params.messages) : undefined,
          originalModel: params.model,
        };
      }

      if (retryCount >= 3 && (loopScore >= 0.7 || decision.action !== "proceed")) {
        void this.maybeEscalate(workflowId, this.sessionCosts[workflowId] || 0, retryCount, loopScore, decision.reason);
      }
    }

    if (decision.action !== "proceed") {
      const mode = process.env.AUREX_BLOCK_ON_WASTE === "1" ? "throw" : (budgetConfig?.onBudgetExceeded || "warn");
      const msg = `[Aurex SDK] ${decision.action}: ${decision.reason}`;
      if (mode === "throw" && decision.action === "block") {
        throw new Error(msg);
      } else if (mode !== "throw") {
        console.warn(msg);
      }
    }

    return decision;
  }

  private computeSemanticLoopScore(workflowId: string, promptText: string): number {
    const recent = this.recentResponses
      .filter((r) => r.workflowId === workflowId && r.responseText)
      .slice(-5);
    if (recent.length < 2 || !promptText) return 0;
    const scores = recent.map((r) => jaccardNGramSimilarity(promptText, r.responseText || ""));
    const high = scores.filter((s) => s >= 0.8);
    return high.length >= 2 ? Math.max(...scores) : 0;
  }

  public recordResponse(workflowId: string, response?: string): void {
    if (!response) return;
    this.recentResponses.push({
      workflowId,
      responseHash: this.hashText(response),
      responseText: response.slice(0, 2000),
      timestamp: Date.now(),
    });
    if (this.recentResponses.length > 100) this.recentResponses.shift();
  }

  private async maybeEscalate(
    workflowId: string,
    costSoFar: number,
    retryCount: number,
    loopScore: number,
    reason: string,
  ): Promise<void> {
    if (!this.config.apiKey || this.config.localOnly) return;
    const base = (this.config.baseUrl || process.env.AUREX_BASE_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
    try {
      await fetch(`${base}/escalations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          workflow_id: workflowId,
          cost_so_far: costSoFar,
          retry_count: retryCount,
          loop_score: loopScore,
          reason,
        }),
      });
    } catch {
      /* fail silently */
    }
  }

  public wrap<T extends Record<string, any>>(
    callFn: (params: T) => Promise<any>,
    buildParams: () => T,
    options?: Record<string, any>
  ): Promise<any> {
    const runInContext = () => {
      const raw = buildParams();
      const model = (raw as any).model || "unknown";
      const messages = (raw as any).messages;
      let systemPrompt = "";
      let userPrompt = "";
      if (Array.isArray(messages)) {
        for (const m of messages) {
          if (m.role === "system" && typeof m.content === "string") systemPrompt = m.content;
          if (m.role === "user" && typeof m.content === "string") userPrompt = m.content;
        }
      }
      const ctx = aurexContext.getStore() || {};
      const decision = this.preCallCheck({
        model,
        prompt: userPrompt,
        systemPrompt,
        workflowId: (raw as any).metadata?.workflow_id || (raw as any).user || ctx.workflowId || "default_workflow",
        messages,
      });
      const params = applyDecisionToCallParams(raw, decision);
      const workflowId =
        (raw as any).metadata?.workflow_id ||
        (raw as any).user ||
        ctx.workflowId ||
        "default_workflow";
      return this.callWithResilience(() => callFn(params), {
        provider: extractProvider(String(params.model || model)),
        workflowId,
        model: String((params as any).model || model),
      }).then((resp) => {
        const text =
          resp?.choices?.[0]?.message?.content ||
          resp?.content?.[0]?.text ||
          (typeof resp?.output === "string" ? resp.output : undefined);
        this.recordResponse(
          (raw as any).metadata?.workflow_id || (raw as any).user || ctx.workflowId || process.env.AUREX_WORKFLOW_ID || "default_workflow",
          text,
        );
        return resp;
      });
    };

    if (options) {
      const merged = { ...(aurexContext.getStore() || {}), ...options };
      return aurexContext.run(merged, runInContext);
    }
    return runInContext();
  }

  private checkBudget(newEventCost: number, inputTokens: number, workflowId?: string): void {
    if (!this.budgetConfig) return;

    const now = Date.now();
    // Keep sliding 60s window
    this.lastMinuteEvents = this.lastMinuteEvents.filter(e => now - e.timestamp < 60000);

    const minuteCost = this.lastMinuteEvents.reduce((sum, e) => sum + e.cost, 0);
    const minuteRequests = this.lastMinuteEvents.length;

    let currentSessionCost = 0;
    if (workflowId) {
      currentSessionCost = this.sessionCosts[workflowId] || 0;
    }

    let budgetExceeded = false;
    let reason = "";

    if (this.budgetConfig.maxCostPerMinute !== undefined && minuteCost > this.budgetConfig.maxCostPerMinute) {
      budgetExceeded = true;
      reason += `Cost per minute limit exceeded: $${minuteCost.toFixed(4)} > $${this.budgetConfig.maxCostPerMinute.toFixed(4)}. `;
    }

    if (this.budgetConfig.maxRequestsPerMinute !== undefined && minuteRequests > this.budgetConfig.maxRequestsPerMinute) {
      budgetExceeded = true;
      reason += `Requests per minute limit exceeded: ${minuteRequests} > ${this.budgetConfig.maxRequestsPerMinute}. `;
    }

    if (workflowId && this.budgetConfig.maxCostPerSession !== undefined && currentSessionCost > this.budgetConfig.maxCostPerSession) {
      budgetExceeded = true;
      reason += `Cost per session limit exceeded for workflow "${workflowId}": $${currentSessionCost.toFixed(4)} > $${this.budgetConfig.maxCostPerSession.toFixed(4)}. `;
    }

    if (this.budgetConfig.maxContextTokens !== undefined && inputTokens > this.budgetConfig.maxContextTokens) {
      budgetExceeded = true;
      reason += `Input context token limit exceeded: ${inputTokens} > ${this.budgetConfig.maxContextTokens}. `;
    }

    if (budgetExceeded) {
      const mode = this.budgetConfig.onBudgetExceeded || "warn";
      const message = `[Aurex SDK Budget Guard] ${reason}`;

      if (this.budgetConfig.dryRun) {
        console.warn(`[Aurex SDK Budget Guard DRY RUN] Would block: ${reason}`);
        return;
      }

      if (mode === "warn") {
        console.warn(message);
      } else if (mode === "webhook" && this.budgetConfig.webhookUrl) {
        const payload = {
          event: "budget_exceeded",
          reason,
          timestamp: new Date().toISOString(),
          details: {
            minuteCost,
            minuteRequests,
            sessionCost: workflowId ? currentSessionCost : undefined,
            inputTokens,
            workflowId
          }
        };
        fetch(this.budgetConfig.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).catch(err => console.error("[Aurex SDK Budget Guard] Webhook failed:", err));
      } else if (mode === "throw") {
        throw new AurexBudgetExceeded(message, {
          workflowId,
          limit: reason.trim(),
          current: workflowId ? currentSessionCost : minuteCost,
        });
      }
    }
  }

  private writeBatchToStorage(batch: AurexEvent[]): void {
    this.eventsLogged += batch.length;
    if (this.config.storageMode !== "file") {
      return;
    }
    try {
      const dataStr = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
      fs.appendFileSync(this.config.ledgerPath, dataStr, "utf-8");
    } catch (err) {
      console.error(`[Aurex SDK Ledger Error] Failed to write events to ledger:`, err);
    }
  }

  private handleQueueOverflow(event: AurexEvent): void {
    if (this.config.storageMode === "file") {
      const ledgerDir = path.dirname(this.config.ledgerPath);
      const recoveryPath = path.join(ledgerDir || ".", "queue_overflow.jsonl");
      try {
        fs.appendFileSync(recoveryPath, JSON.stringify(event) + "\n", "utf-8");
        return;
      } catch {
        /* fall through to drop counter */
      }
    }
    this.eventsDropped += 1;
    emitWarningOnce(
      "[Aurex Warning] Event queue full; dropping telemetry event. Increase maxQueueSize or call flush() more frequently.",
      this.warningFlag,
    );
  }

  /** Force flush the in-memory queue to disk/cloud sync */
  public flush() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];
    this.writeBatchToStorage(batch);

    if (this.config.cloudSync && !this.config.localOnly && this.config.apiKey) {
      this.syncToCloud(batch).catch(() => {
        /* tracked via syncErrorCount */
      });
    }
  }

  /** Flush queued events and await cloud sync completion */
  public async flushAndWait(timeoutMs = 30000): Promise<boolean> {
    const errorsBefore = this.syncErrorCount;
    const deadline = Date.now() + timeoutMs;

    const runFlush = async () => {
      if (this.queue.length === 0) return;
      const batch = [...this.queue];
      this.queue = [];
      this.writeBatchToStorage(batch);
      if (this.config.cloudSync && !this.config.localOnly && this.config.apiKey) {
        await this.syncToCloud(batch);
      }
    };

    await Promise.race([
      runFlush(),
      new Promise<void>((_, reject) => {
        const remaining = deadline - Date.now();
        setTimeout(() => reject(new Error("flushAndWait timeout")), Math.max(0, remaining));
      }),
    ]).catch(() => {
      /* timeout — return false below */
    });

    if (Date.now() > deadline) {
      return false;
    }
    return this.syncErrorCount === errorsBefore;
  }

  private async syncToCloud(batch: AurexEvent[]): Promise<void> {
    const cleaned = batch.map((e) => {
      const copy = { ...e };
      if (!this.config.syncPromptHashes) {
        delete copy.prompt_hash;
        delete copy.system_prompt_hash;
        delete copy.response_hash;
      }
      return copy;
    });

    const isLedgerEndpoint = /\/ledger\/events\/?$/.test(this.config.cloudEndpoint);
    const payload = isLedgerEndpoint
      ? { events: cleaned.map((e) => ({ ...e, cost_usd: e.cost })) }
      : { project: this.config.project, data: cleaned };

    const result = await syncBatchWithRetry(
      this.config.cloudEndpoint,
      payload,
      this.config.apiKey,
      {
        timeoutMs: this.config.syncTimeoutMs,
        maxRetries: this.config.syncMaxRetries,
      },
    );

    if (!result.ok) {
      this.syncErrorCount++;
      this.lastSyncError = result.error || "Cloud sync failed";
      if (process.env.AUREX_DEBUG === "1") {
        console.warn("[Aurex Debug] Cloud sync failed:", result.error);
      }
    }
  }

  public persistPendingAndShutdown() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
    if (this.queue.length > 0) {
      const batch = [...this.queue];
      this.queue = [];
      this.writeBatchToStorage(batch);
      if (this.config.cloudSync && !this.config.localOnly && this.config.apiKey) {
        void this.syncToCloud(batch);
      }
    }
  }

  /** Async shutdown that waits for cloud flush */
  public async shutdownAsync(): Promise<void> {
    await this.flushAndWait();
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
  }

  /** Tear down the auditor instance and clean up queue loops */
  public shutdown() {
    this.persistPendingAndShutdown();
  }

  public getHealth(): Record<string, any> {
    const ledgerDir = path.dirname(this.config.ledgerPath) || ".";
    const pendingPath = path.join(ledgerDir, "pending.jsonl");
    const status =
      this.syncErrorCount > 0 || this.eventsDropped > 0 ? "degraded" : "healthy";
    return {
      status,
      syncErrorCount: this.syncErrorCount,
      lastSyncError: this.lastSyncError,
      sessionCostsTracked: Object.keys(this.sessionCosts).length,
      queueSize: this.queue.length,
      eventsLogged: this.eventsLogged,
      eventsDropped: this.eventsDropped,
      threadActive: true,
      pendingFileExists: fs.existsSync(pendingPath),
      storageMode: this.config.storageMode,
      ledgerPath: this.config.ledgerPath,
      patchStatus: { ...this.patchStatus },
    };
  }

  private async *wrapStream(
    stream: any,
    params: any,
    workflowId: string,
    userPrompt: string,
    systemPrompt: string,
    isAnthropic = false,
    tags?: Record<string, string>,
    qualityScore?: number
  ): AsyncGenerator<any, void, unknown> {
    let accumulatedContent = "";
    let finalUsage: any = null;

    for await (const chunk of stream) {
      let text = "";
      if (isAnthropic) {
        if (chunk.type === "content_block_delta" && chunk.delta?.text) {
          text = chunk.delta.text;
        }
      } else {
        if (chunk.choices?.[0]?.delta?.content) {
          text = chunk.choices[0].delta.content;
        }
      }
      accumulatedContent += text;
      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
      yield chunk;
    }

    this.recordResponse(workflowId, accumulatedContent);

    const inputTokens = finalUsage?.prompt_tokens || finalUsage?.input_tokens || this.estimateTokens(userPrompt, params.messages);
    const outputTokens = finalUsage?.completion_tokens || finalUsage?.output_tokens || Math.max(1, Math.floor(accumulatedContent.length / 4));
    const cachedTokens = finalUsage?.prompt_tokens_details?.cached_tokens || finalUsage?.cache_read_input_tokens || 0;
    const reasoningTokens = finalUsage?.prompt_tokens_details?.reasoning_tokens || 0;

    this.logEvent({
      model: params.model || "unknown",
      prompt: userPrompt,
      response: accumulatedContent,
      inputTokens,
      outputTokens,
      cachedTokens,
      reasoningTokens,
      systemPrompt,
      extraMetadata: params.metadata,
      workflowId,
      tags,
      qualityScore
    });
  }

  private extractAurexExtraParams(params: any): { tags?: Record<string, string>; qualityScore?: number; workflowId?: string } {
    if (!params) return {};
    let tags = params.tags;
    let qualityScore = params.qualityScore ?? params.quality_score;
    let workflowId = params.workflowId ?? params.workflow_id;

    const metadata = params.metadata;
    if (metadata && typeof metadata === "object") {
      if (!tags) tags = metadata.tags;
      if (qualityScore === undefined) qualityScore = metadata.qualityScore ?? metadata.quality_score;
      if (!workflowId) workflowId = metadata.workflowId ?? metadata.workflow_id;
    }
    
    if (!workflowId) {
      workflowId = params.user;
    }

    if (tags && typeof tags !== "object") {
      tags = undefined;
    }
    
    return { tags, qualityScore, workflowId };
  }

  // ==========================================================================
  // Auto-instrumentation
  // ==========================================================================

  /** Best-effort LiteLLM patcher (covers most users via the SDK shim). */
  public patchLiteLLM(): void {
    let lite: any;
    try {
      lite = require("litellm");
    } catch {
      return;
    }
    if (!lite || typeof lite.completion !== "function" || lite.completion.__aurex_patched__) return;

    const original = lite.completion.bind(lite);
    const self = this;
    const patched: any = async function (...args: any[]) {
      const params = args[0] || {};
      let systemPrompt = "";
      let userPrompt = "";
      try {
        const messages = params.messages || [];
        for (const m of messages) {
          if (m.role === "system" && typeof m.content === "string") systemPrompt = m.content;
          else if (m.role === "user" && typeof m.content === "string") userPrompt = m.content;
        }
        const extraParams = self.extractAurexExtraParams(params);
        const decision = self.preCallCheck({
          model: params.model || "unknown",
          prompt: userPrompt,
          systemPrompt,
          workflowId: extraParams.workflowId,
          messages,
        });
        if (decision.action === "cache_suggest" && decision.response) {
          if (params.stream) {
            async function* mockLiteLLMStream() {
              yield { choices: [{ delta: { content: decision.response } }] };
            }
            return mockLiteLLMStream();
          }
          return {
            choices: [{ message: { role: "assistant", content: decision.response } }],
            usage: { prompt_tokens: 0, completion_tokens: 0 }
          };
        }
        args[0] = applyDecisionToCallParams(params, decision);
      } catch (err: any) {
        if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
          throw err;
        }
        console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
      }

      const extraParams = self.extractAurexExtraParams(params);
      const workflowId = extraParams.workflowId || "default_workflow";
      let resp;
      resp = await self.callWithResilience(() => original(...args), {
        provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
        workflowId,
        model: (params?.model || args?.[0]?.model || 'unknown') as string,
      });

      if (params.stream) {
        return self.wrapStream(resp, params, workflowId, userPrompt, systemPrompt, false, extraParams.tags, extraParams.qualityScore);
      }

      try {
        const content = resp?.choices?.[0]?.message?.content;
        self.recordResponse(workflowId, content);
      } catch {}
      try {
        const usage = resp?.usage || {};
        const toolCalls = resp?.choices?.[0]?.message?.tool_calls || [];
        const toolCallsCount = toolCalls.length;
        const toolNames = toolCalls.map((tc: any) => tc.function?.name || tc.name).filter(Boolean);

        self.logEvent({
          model: params.model || "unknown",
          prompt: userPrompt,
          response: resp?.choices?.[0]?.message?.content,
          inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
          outputTokens: usage.completion_tokens || usage.output_tokens || 0,
          cachedTokens: usage.cache_read_input_tokens || 0,
          cacheWriteTokens: usage.cache_creation_input_tokens || 0,
          systemPrompt,
          extraMetadata: params.metadata,
          workflowId,
          tags: extraParams.tags,
          qualityScore: extraParams.qualityScore,
          toolCallsCount,
          toolNames
        });
      } catch (e) {
        // never break the app
      }
      return resp;
    };
    patched.__aurex_patched__ = true;
    lite.completion = patched;
  }

  /** Best-effort Anthropic SDK patcher. */
  public patchAnthropic(): void {
    let anthropicMod: any;
    try {
      anthropicMod = require("@anthropic-ai/sdk");
    } catch {
      return;
    }
    const Cls = anthropicMod?.default || anthropicMod?.Anthropic;
    if (!Cls || Cls.__aurex_patched__) return;

    const self = this;
    const Wrapped: any = function (...ctorArgs: any[]) {
      // @ts-ignore
      const inst = new Cls(...ctorArgs);
      const messages = inst.messages;
      if (messages && typeof messages.create === "function" && !messages.create.__aurex_patched__) {
        const origCreate = messages.create.bind(messages);
        const patched: any = async function (...args: any[]) {
          const params = args[0] || {};
          let systemPrompt = "";
          let userPrompt = "";
          try {
            if (typeof params.system === "string") systemPrompt = params.system;
            else if (Array.isArray(params.system)) {
              systemPrompt = params.system.map((b: any) => typeof b === "string" ? b : (b.text || "")).join("");
            }
            const messages = params.messages || [];
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m.role === "user") {
                if (typeof m.content === "string") {
                  userPrompt = m.content;
                } else if (Array.isArray(m.content)) {
                  userPrompt = m.content.map((item: any) => typeof item === "string" ? item : (item.text || "")).join("");
                }
                break;
              }
            }
            const extraParams = self.extractAurexExtraParams(params);
            const decision = self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId: extraParams.workflowId,
              messages,
            });
            if (decision.action === "cache_suggest" && decision.response) {
              if (params.stream) {
                async function* mockAnthropicStream() {
                  yield { type: "content_block_delta", delta: { text: decision.response } };
                }
                return mockAnthropicStream();
              }
              return {
                content: [{ type: "text", text: decision.response }],
                usage: { input_tokens: 0, output_tokens: 0 }
              };
            }
            args[0] = applyDecisionToCallParams(params, decision);
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = extraParams.workflowId || "default_workflow";
          let resp;
          resp = await self.callWithResilience(() => origCreate(...args), {
            provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
            workflowId,
            model: (params?.model || args?.[0]?.model || 'unknown') as string,
          });

          if (params.stream) {
            return self.wrapStream(resp, params, workflowId, userPrompt, systemPrompt, true, extraParams.tags, extraParams.qualityScore);
          }

          try {
            const text = resp?.content?.[0]?.text;
            self.recordResponse(workflowId, text);
          } catch {}
          try {
            const usage = resp?.usage || {};
            const contentBlocks = resp?.content || [];
            const toolCalls = contentBlocks.filter((b: any) => b.type === "tool_use");
            const toolCallsCount = toolCalls.length;
            const toolNames = toolCalls.map((b: any) => b.name);

            self.logEvent({
              model: params.model || "unknown",
              prompt: userPrompt,
              response: resp?.content?.[0]?.text,
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cachedTokens: usage.cache_read_input_tokens || 0,
              cacheWriteTokens: usage.cache_creation_input_tokens || 0,
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              toolCallsCount,
              toolNames
            });
          } catch {}
          return resp;
        };
        patched.__aurex_patched__ = true;
        messages.create = patched;
      }
      return inst;
    };
    Wrapped.prototype = Cls.prototype;
    Wrapped.__aurex_patched__ = true;

    if (anthropicMod.default) anthropicMod.default = Wrapped;
    if (anthropicMod.Anthropic) anthropicMod.Anthropic = Wrapped;
  }

  /** Best-effort OpenAI SDK patcher. */
  public patchOpenAI(): void {
    let openaiMod: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      openaiMod = require("openai");
    } catch {
      return;
    }
    const Cls = openaiMod?.default || openaiMod?.OpenAI;
    if (!Cls || Cls.__aurex_patched__) return;

    const self = this;
    const Wrapped: any = function (...ctorArgs: any[]) {
      // @ts-ignore
      const inst = new Cls(...ctorArgs);
      const chat = inst.chat;
      if (chat && chat.completions && typeof chat.completions.create === "function" && !chat.completions.create.__aurex_patched__) {
        const origCreate = chat.completions.create.bind(chat.completions);
        const patched: any = async function (...args: any[]) {
          const params = args[0] || {};
          let systemPrompt = "";
          let userPrompt = "";
          try {
            const messages = params.messages || [];
            for (const m of messages) {
              if (m.role === "system" && typeof m.content === "string") {
                systemPrompt = m.content;
              } else if (m.role === "user" && typeof m.content === "string") {
                userPrompt = m.content;
              }
            }
            const extraParams = self.extractAurexExtraParams(params);
            const decision = self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId: extraParams.workflowId,
              messages,
            });
            if (decision.action === "cache_suggest" && decision.response) {
              if (params.stream) {
                async function* mockOpenAIStream() {
                  yield { choices: [{ delta: { content: decision.response } }] };
                }
                return mockOpenAIStream();
              }
              return {
                choices: [{ message: { role: "assistant", content: decision.response } }],
                usage: { prompt_tokens: 0, completion_tokens: 0 }
              };
            }
            args[0] = applyDecisionToCallParams(params, decision);
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = extraParams.workflowId || "default_workflow";
          let resp;
          resp = await self.callWithResilience(() => origCreate(...args), {
            provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
            workflowId,
            model: (params?.model || args?.[0]?.model || 'unknown') as string,
          });

          if (params.stream) {
            return self.wrapStream(resp, params, workflowId, userPrompt, systemPrompt, false, extraParams.tags, extraParams.qualityScore);
          }

          try {
            self.recordResponse(
              workflowId,
              resp?.choices?.[0]?.message?.content,
            );
            const usage = resp?.usage || {};
            const toolCalls = resp?.choices?.[0]?.message?.tool_calls || [];
            const toolCallsCount = toolCalls.length;
            const toolNames = toolCalls.map((tc: any) => tc.function?.name || tc.name).filter(Boolean);

            self.logEvent({
              model: params.model || "unknown",
              prompt: userPrompt,
              response: resp?.choices?.[0]?.message?.content,
              inputTokens: usage.prompt_tokens || 0,
              outputTokens: usage.completion_tokens || 0,
              cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
              reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              toolCallsCount,
              toolNames
            });
          } catch {}
          return resp;
        };
        patched.__aurex_patched__ = true;
        chat.completions.create = patched;
      }
      return inst;
    };
    Wrapped.prototype = Cls.prototype;
    Wrapped.__aurex_patched__ = true;

    if (openaiMod.default) openaiMod.default = Wrapped;
    if (openaiMod.OpenAI) openaiMod.OpenAI = Wrapped;
  }

  /** Best-effort Google GenAI SDK patcher (@google/genai). */
  public patchGoogle(): void {
    let googleMod: any;
    try {
      googleMod = require("@google/genai");
    } catch {
      return;
    }
    const Cls = googleMod.GoogleGenAI;
    if (!Cls || Cls.__aurex_patched__) return;

    const self = this;
    const Wrapped: any = function (...ctorArgs: any[]) {
      // @ts-ignore
      const inst = new Cls(...ctorArgs);
      const models = inst.models;
      if (models && typeof models.generateContent === "function" && !models.generateContent.__aurex_patched__) {
        const origGenerate = models.generateContent.bind(models);
        const patchedGenerate: any = async function (...args: any[]) {
          const params = args[0] || {};
          let model = params.model || "gemini-2.5-flash";
          const contents = params.contents;
          let userPrompt = "";
          if (typeof contents === "string") {
            userPrompt = contents;
          } else if (Array.isArray(contents)) {
            userPrompt = contents.map((c: any) => typeof c === "string" ? c : (c.text || JSON.stringify(c))).join(" ");
          } else if (contents) {
            userPrompt = typeof contents === "object" ? JSON.stringify(contents) : String(contents);
          }
          
          let systemPrompt = "";
          const config = params.config;
          if (config) {
            if (typeof config.systemInstruction === "string") {
              systemPrompt = config.systemInstruction;
            } else if (config.systemInstruction) {
              const instr = config.systemInstruction;
              if (Array.isArray(instr.parts)) {
                systemPrompt = instr.parts.map((p: any) => typeof p === "string" ? p : (p.text || "")).join(" ");
              } else {
                systemPrompt = String(instr);
              }
            }
          }
          
          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = extraParams.workflowId || "default_workflow";
          
          let decision;
          try {
            decision = self.preCallCheck({
              model,
              prompt: userPrompt,
              systemPrompt,
              workflowId,
              messages: Array.isArray(contents) ? contents : undefined,
            });
            if (decision.action === "cache_suggest" && decision.response) {
              return {
                text: decision.response,
                usageMetadata: {
                  promptTokenCount: 0,
                  candidatesTokenCount: 0,
                  totalTokenCount: 0
                }
              };
            }
            if (decision.action === "downgrade" && decision.suggestedModel) {
              params.model = decision.suggestedModel;
              model = decision.suggestedModel;
            }
            if (decision.injectSystemInstruction) {
              if (!params.config) params.config = {};
              params.config.systemInstruction = (params.config.systemInstruction ? params.config.systemInstruction + "\n" : "") + decision.injectSystemInstruction;
            }
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }
          
          let resp;
          resp = await self.callWithResilience(() => origGenerate(...args), {
            provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
            workflowId,
            model: (params?.model || args?.[0]?.model || 'unknown') as string,
          });
          
          try {
            const usage = resp?.usageMetadata || {};
            self.logEvent({
              model,
              prompt: userPrompt,
              response: resp?.text,
              inputTokens: usage.promptTokenCount || 0,
              outputTokens: usage.candidatesTokenCount || 0,
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              provider: "google"
            });
            if (resp?.text) {
              self.recordResponse(workflowId, resp.text);
            }
          } catch {}
          return resp;
        };
        patchedGenerate.__aurex_patched__ = true;
        models.generateContent = patchedGenerate;
      }
      
      if (models && typeof models.generateContentStream === "function" && !models.generateContentStream.__aurex_patched__) {
        const origGenerateStream = models.generateContentStream.bind(models);
        const patchedGenerateStream: any = async function (...args: any[]) {
          const params = args[0] || {};
          let model = params.model || "gemini-2.5-flash";
          const contents = params.contents;
          let userPrompt = "";
          if (typeof contents === "string") {
            userPrompt = contents;
          } else if (Array.isArray(contents)) {
            userPrompt = contents.map((c: any) => typeof c === "string" ? c : (c.text || JSON.stringify(c))).join(" ");
          } else if (contents) {
            userPrompt = typeof contents === "object" ? JSON.stringify(contents) : String(contents);
          }
          
          let systemPrompt = "";
          const config = params.config;
          if (config) {
            if (typeof config.systemInstruction === "string") {
              systemPrompt = config.systemInstruction;
            } else if (config.systemInstruction) {
              const instr = config.systemInstruction;
              if (Array.isArray(instr.parts)) {
                systemPrompt = instr.parts.map((p: any) => typeof p === "string" ? p : (p.text || "")).join(" ");
              } else {
                systemPrompt = String(instr);
              }
            }
          }
          
          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = extraParams.workflowId || "default_workflow";
          
          let decision;
          try {
            decision = self.preCallCheck({
              model,
              prompt: userPrompt,
              systemPrompt,
              workflowId,
              messages: Array.isArray(contents) ? contents : undefined,
            });
            if (decision.action === "cache_suggest" && decision.response) {
              const cachedResponse = decision.response;
              const mockChunk = {
                text: cachedResponse,
                usageMetadata: {
                  promptTokenCount: 0,
                  candidatesTokenCount: 0,
                  totalTokenCount: 0
                }
              };
              async function* mockStream() {
                yield mockChunk;
              }
              return mockStream();
            }
            if (decision.action === "downgrade" && decision.suggestedModel) {
              params.model = decision.suggestedModel;
              model = decision.suggestedModel;
            }
            if (decision.injectSystemInstruction) {
              if (!params.config) params.config = {};
              params.config.systemInstruction = (params.config.systemInstruction ? params.config.systemInstruction + "\n" : "") + decision.injectSystemInstruction;
            }
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }
          
          let resp;
          resp = await self.callWithResilience(() => origGenerateStream(...args), {
            provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
            workflowId,
            model: (params?.model || args?.[0]?.model || 'unknown') as string,
          });
          
          async function* wrapGoogleStream(stream: any) {
            let accumulatedContent = "";
            let finalUsage: any = null;
            for await (const chunk of stream) {
              if (chunk.text) {
                accumulatedContent += chunk.text;
              }
              if (chunk.usageMetadata) {
                finalUsage = chunk.usageMetadata;
              }
              yield chunk;
            }
            self.recordResponse(workflowId, accumulatedContent);
            const inputTokens = finalUsage?.promptTokenCount || self.estimateTokens(userPrompt, Array.isArray(contents) ? contents : undefined);
            const outputTokens = finalUsage?.candidatesTokenCount || Math.max(1, Math.floor(accumulatedContent.length / 4));
            self.logEvent({
              model,
              prompt: userPrompt,
              response: accumulatedContent,
              inputTokens,
              outputTokens,
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              provider: "google"
            });
          }
          return wrapGoogleStream(resp);
        };
        patchedGenerateStream.__aurex_patched__ = true;
        models.generateContentStream = patchedGenerateStream;
      }
      
      return inst;
    };
    Wrapped.prototype = Cls.prototype;
    Wrapped.__aurex_patched__ = true;

    if (googleMod.GoogleGenAI) googleMod.GoogleGenAI = Wrapped;
  }

  private patchOllamaMethods(target: any) {
    const self = this;

    if (typeof target.chat === "function" && !target.chat.__aurex_patched__) {
      const originalChat = target.chat.bind(target);
      const patchedChat: any = async function (...args: any[]) {
        const params = args[0] || {};
        let model = params.model || "llama-4-scout";
        const messages = params.messages || [];
        
        let userPrompt = "";
        let systemPrompt = "";
        for (const m of messages) {
          if (m.role === "system" && typeof m.content === "string") {
            systemPrompt = m.content;
          } else if (m.role === "user" && typeof m.content === "string") {
            userPrompt = m.content;
          }
        }
        
        const extraParams = self.extractAurexExtraParams(params);
        const workflowId = extraParams.workflowId || "default_workflow";
        
        let decision;
        try {
          decision = self.preCallCheck({
            model,
            prompt: userPrompt,
            systemPrompt,
            workflowId,
            messages,
          });
          if (decision.action === "cache_suggest" && decision.response) {
            return {
              model,
              message: { role: "assistant", content: decision.response },
              done: true,
              prompt_eval_count: 0,
              eval_count: 0
            };
          }
          if (decision.action === "downgrade" && decision.suggestedModel) {
            params.model = decision.suggestedModel;
            model = decision.suggestedModel;
          }
          if (decision.injectSystemInstruction) {
            messages.unshift({ role: "system", content: decision.injectSystemInstruction });
            params.messages = messages;
          }
        } catch (err: any) {
          if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
            throw err;
          }
          console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
        }
        
        let resp;
        resp = await self.callWithResilience(() => originalChat(...args), {
          provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
          workflowId,
          model: (params?.model || args?.[0]?.model || 'unknown') as string,
        });
        
        if (params.stream) {
          async function* wrapOllamaStream(stream: any) {
            let accumulatedContent = "";
            let prompt_eval_count = 0;
            let eval_count = 0;
            for await (const chunk of stream) {
              if (chunk.message?.content) {
                accumulatedContent += chunk.message.content;
              }
              if (chunk.prompt_eval_count) prompt_eval_count = chunk.prompt_eval_count;
              if (chunk.eval_count) eval_count = chunk.eval_count;
              yield chunk;
            }
            self.recordResponse(workflowId, accumulatedContent);
            self.logEvent({
              model,
              prompt: userPrompt,
              response: accumulatedContent,
              inputTokens: prompt_eval_count,
              outputTokens: eval_count,
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              provider: "ollama"
            });
          }
          return wrapOllamaStream(resp);
        }
        
        try {
          const content = resp?.message?.content;
          self.recordResponse(workflowId, content);
          self.logEvent({
            model,
            prompt: userPrompt,
            response: content,
            inputTokens: resp?.prompt_eval_count || 0,
            outputTokens: resp?.eval_count || 0,
            systemPrompt,
            extraMetadata: params.metadata,
            workflowId,
            tags: extraParams.tags,
            qualityScore: extraParams.qualityScore,
            provider: "ollama"
          });
        } catch {}
        return resp;
      };
      patchedChat.__aurex_patched__ = true;
      target.chat = patchedChat;
    }
    
    if (typeof target.generate === "function" && !target.generate.__aurex_patched__) {
      const originalGenerate = target.generate.bind(target);
      const patchedGenerate: any = async function (...args: any[]) {
        const params = args[0] || {};
        let model = params.model || "llama-4-scout";
        const userPrompt = params.prompt || "";
        const systemPrompt = params.system || "";
        
        const extraParams = self.extractAurexExtraParams(params);
        const workflowId = extraParams.workflowId || "default_workflow";
        
        let decision;
        try {
          decision = self.preCallCheck({
            model,
            prompt: userPrompt,
            systemPrompt,
            workflowId,
          });
          if (decision.action === "cache_suggest" && decision.response) {
            return {
              model,
              response: decision.response,
              done: true,
              prompt_eval_count: 0,
              eval_count: 0
            };
          }
          if (decision.action === "downgrade" && decision.suggestedModel) {
            params.model = decision.suggestedModel;
            model = decision.suggestedModel;
          }
          if (decision.injectSystemInstruction) {
            params.prompt = `${decision.injectSystemInstruction}\n${userPrompt}`;
          }
        } catch (err: any) {
          if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
            throw err;
          }
          console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
        }
        
        let resp;
        resp = await self.callWithResilience(() => originalGenerate(...args), {
          provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
          workflowId,
          model: (params?.model || args?.[0]?.model || 'unknown') as string,
        });
        
        if (params.stream) {
          async function* wrapOllamaStream(stream: any) {
            let accumulatedContent = "";
            let prompt_eval_count = 0;
            let eval_count = 0;
            for await (const chunk of stream) {
              if (chunk.response) {
                accumulatedContent += chunk.response;
              }
              if (chunk.prompt_eval_count) prompt_eval_count = chunk.prompt_eval_count;
              if (chunk.eval_count) eval_count = chunk.eval_count;
              yield chunk;
            }
            self.recordResponse(workflowId, accumulatedContent);
            self.logEvent({
              model,
              prompt: userPrompt,
              response: accumulatedContent,
              inputTokens: prompt_eval_count,
              outputTokens: eval_count,
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              provider: "ollama"
            });
          }
          return wrapOllamaStream(resp);
        }
        
        try {
          const content = resp?.response;
          self.recordResponse(workflowId, content);
          self.logEvent({
            model,
            prompt: userPrompt,
            response: content,
            inputTokens: resp?.prompt_eval_count || 0,
            outputTokens: resp?.eval_count || 0,
            systemPrompt,
            extraMetadata: params.metadata,
            workflowId,
            tags: extraParams.tags,
            qualityScore: extraParams.qualityScore,
            provider: "ollama"
          });
        } catch {}
        return resp;
      };
      patchedGenerate.__aurex_patched__ = true;
      target.generate = patchedGenerate;
    }
  }

  /** Best-effort Ollama SDK patcher (ollama). */
  public patchOllama(): void {
    let ollamaMod: any;
    try {
      ollamaMod = require("ollama");
    } catch {
      return;
    }
    const Cls = ollamaMod.Ollama || ollamaMod.default?.Ollama;
    const targetClass = Cls || (typeof ollamaMod.default === "function" ? ollamaMod.default : null);
    if (!targetClass) {
      const defaultExport = ollamaMod.default || ollamaMod;
      if (defaultExport && typeof defaultExport.chat === "function" && !defaultExport.chat.__aurex_patched__) {
        this.patchOllamaMethods(defaultExport);
      }
      return;
    }

    if (targetClass.prototype && !targetClass.prototype.chat?.__aurex_patched__) {
      this.patchOllamaMethods(targetClass.prototype);
    }
  }

  /** Best-effort Hugging Face SDK patcher (@huggingface/inference). */
  public patchHuggingFace(): void {
    let hfMod: any;
    try {
      hfMod = require("@huggingface/inference");
    } catch {
      return;
    }
    const Cls = hfMod.HfInference;
    if (!Cls || Cls.__aurex_patched__) return;

    const self = this;

    if (Cls.prototype.chatCompletion && !Cls.prototype.chatCompletion.__aurex_patched__) {
      const origChat = Cls.prototype.chatCompletion;
      Cls.prototype.chatCompletion = async function (this: any, ...args: any[]) {
        const params = args[0] || {};
        const model = params.model || "unknown";
        const messages = params.messages || [];
        
        let systemPrompt = "";
        let userPrompt = "";
        for (const m of messages) {
          if (m.role === "system" && typeof m.content === "string") {
            systemPrompt = m.content;
          } else if (m.role === "user" && typeof m.content === "string") {
            userPrompt = m.content;
          }
        }
        
        const ctx = aurexContext.getStore() || {};
        const extraParams = self.extractAurexExtraParams(params);
        const workflowId = extraParams.workflowId || ctx.workflowId || "default_workflow";
        
        const decision = self.preCallCheck({
          model,
          prompt: userPrompt,
          systemPrompt,
          workflowId,
          messages,
        });
        
        if (decision.action === "block") {
          throw new Error(`[Aurex] Blocked: ${decision.reason}`);
        }
        if (decision.action === "downgrade" && decision.suggestedModel) {
          params.model = decision.suggestedModel;
        }
        
        let resp;
        resp = await self.callWithResilience(() => origChat.call(this, ...args), {
          provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
          workflowId,
          model: (params?.model || args?.[0]?.model || 'unknown') as string,
        });
        
        // Handle streaming
        if (params.stream) {
          const origStream = resp;
          async function* wrappedChatStream() {
            const accumulated: string[] = [];
            for await (const chunk of origStream) {
              const text = chunk?.choices?.[0]?.delta?.content || "";
              if (text) accumulated.push(text);
              yield chunk;
            }
            const fullContent = accumulated.join("");
            self.recordResponse(workflowId, fullContent);
            self.logEvent({
              model: params.model || model,
              prompt: userPrompt,
              response: fullContent,
              inputTokens: self.estimateTokens(userPrompt, messages),
              outputTokens: Math.max(1, Math.floor(fullContent.length / 4)),
              systemPrompt,
              extraMetadata: params.metadata,
              workflowId,
              tags: extraParams.tags,
              qualityScore: extraParams.qualityScore,
              provider: "huggingface",
            });
          }
          return wrappedChatStream();
        }
        
        // Non-streaming response
        const text = resp?.choices?.[0]?.message?.content || "";
        self.recordResponse(workflowId, text);
        const inputTokens = resp?.usage?.prompt_tokens || self.estimateTokens(userPrompt, messages);
        const outputTokens = resp?.usage?.completion_tokens || Math.max(1, Math.floor(text.length / 4));
        self.logEvent({
          model: params.model || model,
          prompt: userPrompt,
          response: text,
          inputTokens,
          outputTokens,
          systemPrompt,
          extraMetadata: params.metadata,
          workflowId,
          tags: extraParams.tags,
          qualityScore: extraParams.qualityScore,
          provider: "huggingface",
        });
        return resp;
      };
      Cls.prototype.chatCompletion.__aurex_patched__ = true;
    }

    if (Cls.prototype.textGeneration && !Cls.prototype.textGeneration.__aurex_patched__) {
      const origGen = Cls.prototype.textGeneration;
      Cls.prototype.textGeneration = async function (this: any, ...args: any[]) {
        const params = args[0] || {};
        const model = params.model || "unknown";
        const prompt = params.inputs || "";
        
        const ctx = aurexContext.getStore() || {};
        const extraParams = self.extractAurexExtraParams(params);
        const workflowId = extraParams.workflowId || ctx.workflowId || "default_workflow";
        
        const decision = self.preCallCheck({
          model,
          prompt,
          workflowId,
        });
        
        if (decision.action === "block") {
          throw new Error(`[Aurex] Blocked: ${decision.reason}`);
        }
        if (decision.action === "downgrade" && decision.suggestedModel) {
          params.model = decision.suggestedModel;
        }
        
        let resp;
        resp = await self.callWithResilience(() => origGen.call(this, ...args), {
          provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
          workflowId,
          model: (params?.model || args?.[0]?.model || 'unknown') as string,
        });
        
        const text = typeof resp === "string" ? resp : (resp?.generated_text || "");
        self.recordResponse(workflowId, text);
        self.logEvent({
          model: params.model || model,
          prompt,
          response: text,
          inputTokens: self.estimateTokens(prompt),
          outputTokens: Math.max(1, Math.floor(text.length / 4)),
          extraMetadata: params.metadata,
          workflowId,
          tags: extraParams.tags,
          qualityScore: extraParams.qualityScore,
          provider: "huggingface",
        });
        return resp;
      };
      Cls.prototype.textGeneration.__aurex_patched__ = true;
    }

    if (Cls.prototype.textGenerationStream && !Cls.prototype.textGenerationStream.__aurex_patched__) {
      const origGenStream = Cls.prototype.textGenerationStream;
      Cls.prototype.textGenerationStream = async function (this: any, ...args: any[]) {
        const params = args[0] || {};
        const model = params.model || "unknown";
        const prompt = params.inputs || "";
        
        const ctx = aurexContext.getStore() || {};
        const extraParams = self.extractAurexExtraParams(params);
        const workflowId = extraParams.workflowId || ctx.workflowId || "default_workflow";
        
        const decision = self.preCallCheck({
          model,
          prompt,
          workflowId,
        });
        
        if (decision.action === "block") {
          throw new Error(`[Aurex] Blocked: ${decision.reason}`);
        }
        if (decision.action === "downgrade" && decision.suggestedModel) {
          params.model = decision.suggestedModel;
        }
        
        let resp;
        resp = await self.callWithResilience(() => origGenStream.call(this, ...args), {
          provider: extractProvider((params?.model || args?.[0]?.model || 'unknown') as string),
          workflowId,
          model: (params?.model || args?.[0]?.model || 'unknown') as string,
        });
        
        const origStream = resp;
        async function* wrappedGenStream() {
          const accumulated: string[] = [];
          for await (const chunk of origStream) {
            const text = chunk?.token?.text || chunk?.generated_text || "";
            if (text) accumulated.push(text);
            yield chunk;
          }
          const fullContent = accumulated.join("");
          self.recordResponse(workflowId, fullContent);
          self.logEvent({
            model: params.model || model,
            prompt,
            response: fullContent,
            inputTokens: self.estimateTokens(prompt),
            outputTokens: Math.max(1, Math.floor(fullContent.length / 4)),
            extraMetadata: params.metadata,
            workflowId,
            tags: extraParams.tags,
            qualityScore: extraParams.qualityScore,
            provider: "huggingface",
          });
        }
        return wrappedGenStream();
      };
      Cls.prototype.textGenerationStream.__aurex_patched__ = true;
    }
  }

  public patchAll(): void {
    this.patchLiteLLM();
    this.patchAnthropic();
    this.patchOpenAI();
    this.patchGoogle();
    this.patchOllama();
    this.patchHuggingFace();
  }
}

export type { AurexDecision, AurexAction } from "./decisions";
export { applyDecisionToCallParams, suggestCheaperModel } from "./decisions";
