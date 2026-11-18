import fs from "fs";
import path from "path";
import crypto from "crypto";
import Module, { createRequire } from "module";
import { fileURLToPath } from "url";
import { AsyncLocalStorage } from "async_hooks";
import type { AurexDecision } from "./decisions";
import {
  applyDecisionToCallParams,
  compressMessages,
  isExpensiveModel,
  suggestCheaperModel,
} from "./decisions";
import { jaccardNGramSimilarity } from "./semantic";
import { fetchRemotePolicies, syncBatchWithRetry } from "./cloud_sync";
import { emitWarningOnce, prepareLedgerStorage } from "./ledger_utils";
import { AurexBlocked, AurexBudgetExceeded, AurexResilienceExhausted } from "./exceptions";
import { inspectPreCallShield, shieldReportToMetadata } from "./prefix_shield";
import {
  MODEL_PRICING,
  calculateCost as coreCalculateCost,
  countRequestTokens,
  extractProvider,
  getModelPricing as coreGetModelPricing,
  normalizeModelName,
} from "./pricing";
import { buildStateStore, resolveWorkflowId } from "./state_store";
import type { StateStore } from "./state_store";
import {
  ensureOpenAIStreamUsage,
  extractClientBaseUrl,
  extractResponsesApiUsage,
  normalizeResponsesApiInput,
  resolveEndpointProvider,
  sanitizeThinkingParams,
} from "./runtime_guard";
import type { AttemptRecord, ResiliencePolicy } from "./resilience";
import { detectGrammarLoop, executeWithResilience, parseResilienceConfig } from "./resilience";

const _origProtoRequire = Module.prototype.require;
const _esmRequire: NodeRequire =
  typeof require !== "undefined"
    ? require
    : createRequire(typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url));

function _safeRequire(id: string): any {
  if (typeof require !== "undefined") {
    return require(id);
  }
  if (Module.prototype.require !== _origProtoRequire) {
    return (Module.prototype as any).require(id);
  }
  return _esmRequire(id);
}

export {
  MODEL_PRICING,
  extractProvider,
  normalizeModelName,
  resolveEndpointProvider,
  sanitizeThinkingParams,
  ensureOpenAIStreamUsage,
  AurexBlocked,
  AurexBudgetExceeded,
  AurexResilienceExhausted,
};

export const aurexContext = new AsyncLocalStorage<Record<string, any>>();

export interface BudgetGuardConfig {
  maxCostPerMinute?: number;      // e.g. 5.00
  maxCostPerSession?: number;     // e.g. 50.00
  maxRequestsPerMinute?: number;  // e.g. 100
  maxContextTokens?: number;      // e.g. 128000
  maxThinkingTokens?: number;     // e.g. 4096
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
  redisUrl?: string;
  cacheTtl?: "5m" | "1h";
  enableCompression?: boolean;
  enableLoopGuard?: boolean;
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
  tenant_id?: string;
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

export function getModelPricing(model: string, provider?: string): [number, number] {
  let dp: { input: number; output: number } | undefined;
  try {
    const instance = (AurexAuditor as any).instance as AurexAuditor | null;
    if (instance?.defaultPricing) dp = instance.defaultPricing;
  } catch {}
  return coreGetModelPricing(model, dp, provider);
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  cacheWriteTokens: number = 0,
  isBatch: boolean = false,
  cacheTtl: "5m" | "1h" = "5m",
  provider?: string,
): number {
  let dp: { input: number; output: number } | undefined;
  let ttl = cacheTtl;
  try {
    const instance = (AurexAuditor as any).instance as AurexAuditor | null;
    if (instance?.defaultPricing) dp = instance.defaultPricing;
    if (ttl === "5m" && (instance as any)?.config?.cacheTtl) {
      ttl = (instance as any).config.cacheTtl;
    }
  } catch {}
  return coreCalculateCost(
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
    isBatch,
    ttl,
    dp,
    provider,
  );
}


export class AurexAuditor {
  private static instance: AurexAuditor | null = null;
  private config: Required<AurexConfig>;
  private queue: AurexEvent[] = [];
  private lastMinuteEvents: { timestamp: number; cost: number }[] = [];
  private sessionCosts: Record<string, number> = {};
  private budgetConfig?: Record<string, any>;
  private tenantPolicies: Record<string, Record<string, any>> = {};
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
  public stateStore: StateStore;

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
      redisUrl: config?.redisUrl || process.env.AUREX_REDIS_URL || "",
      cacheTtl: config?.cacheTtl || (process.env.AUREX_CACHE_TTL === "1h" ? "1h" : "5m"),
      enableCompression: config?.enableCompression ?? false,
      enableLoopGuard: config?.enableLoopGuard ?? false,
    };

    this.stateStore = buildStateStore(this.config.redisUrl);

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
    const provider = params.provider || extractProvider(params.model);
    const cost = calculateCost(params.model, inputT, outputT, cachedT, cacheWriteT, isBatch, "5m", provider);

    let outcome = params.outcome;
    let costType = params.costType;
    let errorCode = params.errorCode;
    if (!costType && params.model !== "aurex-outcome") {
      if (detectGrammarLoop(params.response)) {
        costType = "unfulfilled_spend";
        outcome = outcome || "degraded";
        errorCode = errorCode || "grammar_loop";
      } else if (
        !(params.response && params.response.trim()) &&
        !(params.toolCallsCount && params.toolCallsCount > 0) &&
        (reasoningT > 0 || ["length", "max_tokens", "max_output_tokens"].includes((params.finishReason || "").toLowerCase()))
      ) {
        costType = "unfulfilled_spend";
        outcome = outcome || "degraded";
        errorCode = errorCode || "thinking_exhausted";
      }
    }

    const ctxStore = aurexContext.getStore() || {};
    const tenantId =
      params.tags?.tenant_id ||
      params.extraMetadata?.tenant_id ||
      ctxStore.tenantId ||
      ctxStore.tenant_id;

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
      tenant_id: tenantId ? String(tenantId) : undefined,
      system_prompt_hash: this.hashText(params.systemPrompt),
      prompt_hash: this.hashText(params.prompt),
      response_hash: this.hashText(params.response),
      extra_metadata: params.extraMetadata || {},
      retry_count: params.retryCount,
      outcome,
      cost_type: costType,
      tool_calls_count: params.toolCallsCount,
      tool_names: params.toolNames || [],
      tags: params.tags || {},
      quality_score: params.qualityScore,
      attempt_index: params.attemptIndex,
      recovery_provider: params.recoveryProvider,
      projected_cost: params.projectedCost,
      latency_ms: params.latencyMs,
      status: params.status,
      error_code: errorCode,
      finish_reason: params.finishReason,
    };

    // Optional OpenTelemetry Export
    if (this.config.otelExport) {
      try {
        const api = _safeRequire("@opentelemetry/api");
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

    // Track metrics in shared StateStore + local mirror
    const nowMs = Date.now();
    this.stateStore.addSpend(params.workflowId || "", cost, nowMs);
    this.lastMinuteEvents.push({ timestamp: nowMs, cost });
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

  public configureTenantPolicies(policies: Record<string, Record<string, any>>): void {
    this.tenantPolicies = { ...(policies || {}) };
  }

  public async syncPoliciesOnce(): Promise<boolean> {
    if (!this.config.apiKey || this.config.localOnly) return false;
    const policyEndpoint = this.config.cloudEndpoint.replace(/\/ledger\/events\/?$/, "/policies");
    const data = await fetchRemotePolicies(policyEndpoint, this.config.apiKey);
    if (!data) return false;
    if (data.pricing && typeof data.pricing === "object") {
      for (const [m, costs] of Object.entries(data.pricing as Record<string, any>)) {
        if (costs && typeof costs === "object") {
          this.registerModelPricing(m, Number(costs.input || 0), Number(costs.output || 0));
        }
      }
    }
    if (data.budget_guard && typeof data.budget_guard === "object") {
      this.configureCircuitBreaker(data.budget_guard);
    }
    if (data.tenant_policies && typeof data.tenant_policies === "object") {
      this.configureTenantPolicies(data.tenant_policies);
    }
    return true;
  }

  private estimateTokens(
    prompt?: string,
    messages?: any[],
    systemPrompt?: string,
    tools?: any,
    responseFormat?: any,
  ): number {
    return countRequestTokens({ prompt, systemPrompt, messages, tools, responseFormat });
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
    tools?: any;
    responseFormat?: any;
    tenantId?: string;
  }): AurexDecision {
    const now = Date.now();
    const ctx = aurexContext.getStore() || {};
    const workflowId = resolveWorkflowId(params.workflowId, ctx);
    const estTokens = this.estimateTokens(
      params.prompt,
      params.messages,
      params.systemPrompt,
      params.tools,
      params.responseFormat,
    );

    const promptHash = this.hashText(params.prompt);
    const sysPromptHash = this.hashText(params.systemPrompt);

    const reqMeta = {
      timestamp: now,
      model: params.model,
      workflowId,
      systemPromptHash: sysPromptHash,
      promptHash,
      promptText: params.prompt,
      estimatedTokens: estTokens,
    };

    // Filter recent requests to last 5 minutes
    this.recentRequests = this.recentRequests.filter((r) => now - r.timestamp < 300000);

    // Semantic cache suggestion check
    let cacheHitFound = false;
    if (params.prompt) {
      const workflowRequests = this.recentRequests.filter((r) => r.workflowId === workflowId);
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

    const workflowRequests = this.recentRequests.filter((r) => r.workflowId === workflowId);
    let decision: AurexDecision = { action: "proceed", reason: "ok", originalModel: params.model };

    if (this.ignoredWorkflows.has(workflowId)) {
      return decision;
    }

    // Stage 1: Run Pre-Call Prefix Cache-Shield & 200k Cliff Guard
    const shield = inspectPreCallShield({
      stateStore: this.stateStore,
      workflowId,
      model: params.model,
      estimatedTokens: estTokens,
      nowMs: now,
      systemPrompt: params.systemPrompt,
      messages: params.messages,
      tools: params.tools,
      defaultPricing: this.defaultPricing,
    });
    const shieldMeta = shieldReportToMetadata(shield);
    for (const w of shield.warnings) {
      console.warn(`[Aurex Shield] ${w}`);
    }

    const ctxBudget = ctx.budgetGuard || {};
    const budgetConfig = { ...(this.budgetConfig || {}), ...ctxBudget };

    const simplePromptTokenLimit =
      ctx.simplePromptTokenLimit !== undefined ? ctx.simplePromptTokenLimit : this.config.simplePromptTokenLimit;
    const runawayContextMultiplier =
      ctx.runawayContextMultiplier !== undefined
        ? ctx.runawayContextMultiplier
        : this.config.runawayContextMultiplier;
    const loopSimilarityThreshold =
      ctx.loopSimilarityThreshold !== undefined ? ctx.loopSimilarityThreshold : this.config.loopSimilarityThreshold;

    // Cliff-aware predicted cost (includes 2x >200k surcharge!)
    const predictedCost = calculateCost(params.model, estTokens, 0);
    let budgetExceeded = false;
    let budgetReason = "";

    const spend = this.stateStore.getSpendSummary(workflowId, now);

    if (budgetConfig) {
      if (budgetConfig.maxCostPerSession !== undefined) {
        const currentSessionCost = spend.sessionCost;
        if (currentSessionCost + predictedCost > budgetConfig.maxCostPerSession) {
          budgetExceeded = true;
          budgetReason += `Predicted cost $${predictedCost.toFixed(4)} plus session cost $${currentSessionCost.toFixed(4)} exceeds session limit of $${budgetConfig.maxCostPerSession.toFixed(4)}. `;
        }
      }

      if (budgetConfig.maxCostPerMinute !== undefined) {
        const minuteCost = spend.minuteCost;
        if (minuteCost + predictedCost > budgetConfig.maxCostPerMinute) {
          budgetExceeded = true;
          budgetReason += `Predicted cost $${predictedCost.toFixed(4)} plus minute cost $${minuteCost.toFixed(4)} exceeds minute limit of $${budgetConfig.maxCostPerMinute.toFixed(4)}. `;
        }
      }

      if (budgetConfig.maxRequestsPerMinute !== undefined) {
        const minuteRequests = spend.minuteRequests;
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
      const resolvedTenant = params.tenantId || ctx.tenantId || ctx.tenant_id;
      const tPolicy = resolvedTenant ? this.tenantPolicies[String(resolvedTenant)] : undefined;
      if (tPolicy) {
        const tAction = String(tPolicy.action || "").toLowerCase();
        if (tAction === "block") {
          decision = {
            action: "block",
            reason: `Tenant margin guardrail blocked tenant '${resolvedTenant}'`,
            originalModel: params.model,
          };
        } else if (tAction === "downgrade") {
          const cheaperT = tPolicy.target_model || suggestCheaperModel(params.model);
          if (cheaperT && cheaperT !== params.model) {
            decision = {
              action: "downgrade",
              reason: `Tenant margin guardrail downgraded tenant '${resolvedTenant}'`,
              suggestedModel: cheaperT,
              originalModel: params.model,
            };
          }
        }
      }
    }

    if (decision.action !== "block") {
      const retryCount = params.retryCount ?? this.sessionRetryCounts[workflowId] ?? 0;
      const loopScore = this.computeSemanticLoopScore(workflowId, params.prompt || "");

      // 1. Duplicate system blocks within the SAME messages array
      if (this.config.enableCompression && Array.isArray(params.messages)) {
        const deduped = compressMessages(params.messages);
        if (deduped.length < params.messages.length) {
          decision = {
            action: "compress",
            reason: `Duplicate system messages inside request in '${workflowId}'`,
            compressedMessages: deduped,
            originalModel: params.model,
          };
        }
      }

      // 2. Agent Runaway Loop Detector (exponential context growth)
      if (workflowRequests.length >= 3 && decision.action === "proceed") {
        const recent = workflowRequests.slice(-3);
        const sizes = recent.map((r) => r.estimatedTokens);
        if (
          sizes[1] >= sizes[0] * runawayContextMultiplier &&
          sizes[2] >= sizes[1] * runawayContextMultiplier &&
          sizes[0] > 20
        ) {
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
      const sessionCost = spend.sessionCost;
      const nearBudget =
        budgetConfig?.maxCostPerSession !== undefined &&
        sessionCost > budgetConfig.maxCostPerSession * 0.8;

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

      // 5. Structural tool-call & semantic loop circuit breaker (Stage 2)
      if (Array.isArray(params.messages)) {
        const toolSeq: string[] = [];
        for (const m of params.messages) {
          if (m?.role === "assistant" && Array.isArray(m.tool_calls)) {
            for (const tc of m.tool_calls) {
              if (tc?.function?.name) toolSeq.push(String(tc.function.name));
            }
          }
        }
        if (toolSeq.length >= 3) {
          const last3 = toolSeq.slice(-3);
          const pairLoop =
            toolSeq.length >= 4 &&
            toolSeq[toolSeq.length - 4] === toolSeq[toolSeq.length - 2] &&
            toolSeq[toolSeq.length - 3] === toolSeq[toolSeq.length - 1];
          if ((last3[0] === last3[1] && last3[1] === last3[2]) || pairLoop) {
            decision = {
              action: "block",
              reason: `In-Process Loop Guard triggered: Structural repetition of tool calls [${last3.join(", ")}]`,
              originalModel: params.model,
            };
          }
        }
        if (this.config.enableLoopGuard && decision.action !== "block" && workflowRequests.length >= 3) {
          const lastPrompts = workflowRequests.slice(-3).map((r) => r.promptText || "");
          if (
            lastPrompts[0] &&
            jaccardNGramSimilarity(lastPrompts[0], lastPrompts[1]) >= loopSimilarityThreshold &&
            jaccardNGramSimilarity(lastPrompts[1], lastPrompts[2]) >= loopSimilarityThreshold
          ) {
            decision = {
              action: "block",
              reason: `Loop Guard detected repeated prompt loop in '${workflowId}'`,
              originalModel: params.model,
            };
          }
        }
      }

      if (loopScore >= loopSimilarityThreshold && decision.action === "proceed") {
        decision = {
          action: "block",
          reason: `In-Process Loop Guard triggered: Semantic loop detected (score ${loopScore.toFixed(2)})`,
          loopScore,
          originalModel: params.model,
        };
      }

      if (retryCount >= 3 && (loopScore >= 0.7 || decision.action !== "proceed")) {
        void this.maybeEscalate(
          workflowId,
          spend.sessionCost,
          retryCount,
          loopScore,
          decision.reason,
        );
      }
    }

    decision.shieldMeta = shieldMeta;
    decision.warnings = [...shield.warnings];
    if (budgetConfig?.maxThinkingTokens !== undefined) {
      decision.maxThinkingTokens = Number(budgetConfig.maxThinkingTokens);
    }

    if (decision.action !== "proceed") {
      const mode =
        process.env.AUREX_BLOCK_ON_WASTE === "1" ? "throw" : budgetConfig?.onBudgetExceeded || "warn";
      const msg = `[Aurex SDK] ${decision.action}: ${decision.reason}`;
      if (mode === "throw" && decision.action === "block") {
        throw new AurexBlocked(msg, {
          workflowId,
          reason: decision.reason,
          action: decision.action,
        });
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
      const workflowId = resolveWorkflowId(
        (raw as any).metadata?.workflow_id || (raw as any).user,
        ctx,
      );
      const decision = this.preCallCheck({
        model,
        prompt: userPrompt,
        systemPrompt,
        workflowId,
        messages,
      });
      const params = ensureOpenAIStreamUsage(applyDecisionToCallParams(raw, decision));
      const provider = resolveEndpointProvider(
        String((params as any).model || model),
        extractClientBaseUrl(null, params),
      );
      return this.callWithResilience(() => callFn(params), {
        provider,
        workflowId,
        model: String((params as any).model || model),
      }).then((resp) => {
        const text =
          resp?.choices?.[0]?.message?.content ||
          resp?.content?.[0]?.text ||
          (typeof resp?.output === "string" ? resp.output : undefined);
        this.recordResponse(workflowId, text);
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
    this.lastMinuteEvents = this.lastMinuteEvents.filter((e) => now - e.timestamp < 60000);

    const spend = this.stateStore.getSpendSummary(workflowId || "", now);
    const minuteCost = spend.minuteCost;
    const minuteRequests = spend.minuteRequests;
    const currentSessionCost = workflowId ? spend.sessionCost : 0;

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
    qualityScore?: number,
    provider?: string,
  ): AsyncGenerator<any, void, unknown> {
    let accumulatedContent = "";
    let finalUsage: any = null;
    let completed = false;

    try {
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
      completed = true;
    } finally {
      this.recordResponse(workflowId, accumulatedContent);

      const inputTokens =
        finalUsage?.prompt_tokens ??
        finalUsage?.input_tokens ??
        this.estimateTokens(userPrompt, params?.messages);
      const outputTokens =
        finalUsage?.completion_tokens ??
        finalUsage?.output_tokens ??
        (accumulatedContent ? Math.max(1, Math.floor(accumulatedContent.length / 4)) : 0);
      const cachedTokens =
        finalUsage?.prompt_tokens_details?.cached_tokens ??
        finalUsage?.cache_read_input_tokens ??
        0;
      const cacheWriteTokens = finalUsage?.cache_creation_input_tokens ?? 0;
      const reasoningTokens =
        finalUsage?.completion_tokens_details?.reasoning_tokens ??
        finalUsage?.prompt_tokens_details?.reasoning_tokens ??
        0;

      try {
        this.logEvent({
          model: params?.model || "unknown",
          prompt: userPrompt,
          response: accumulatedContent,
          inputTokens,
          outputTokens,
          cachedTokens,
          cacheWriteTokens,
          reasoningTokens,
          systemPrompt,
          extraMetadata: params?.metadata,
          workflowId,
          tags,
          qualityScore,
          provider: provider || (isAnthropic ? "anthropic" : undefined),
          status: completed ? "ok" : "aborted_stream",
          outcome: completed ? "success" : "degraded",
        });
      } catch (err) {
        if (err instanceof AurexBudgetExceeded || err instanceof AurexBlocked) {
          throw err;
        }
      }
    }
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
      lite = _safeRequire("litellm");
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
        args[0] = ensureOpenAIStreamUsage(applyDecisionToCallParams(params, decision));
      } catch (err: any) {
        if (
          err instanceof AurexBlocked ||
          err instanceof AurexBudgetExceeded ||
          process.env.AUREX_BLOCK_ON_WASTE === "1" ||
          self.budgetConfig?.onBudgetExceeded === "throw"
        ) {
          throw err;
        }
        console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
      }

      const extraParams = self.extractAurexExtraParams(params);
      const workflowId = resolveWorkflowId(extraParams.workflowId, aurexContext.getStore() || {});
      const effectiveModel = String(args?.[0]?.model || params?.model || "unknown");
      const provider = resolveEndpointProvider(effectiveModel, extractClientBaseUrl(null, args?.[0] || params));
      let resp;
      resp = await self.callWithResilience(() => original(...args), {
        provider,
        workflowId,
        model: effectiveModel,
      });

      if (params.stream) {
        return self.wrapStream(resp, args[0] || params, workflowId, userPrompt, systemPrompt, false, extraParams.tags, extraParams.qualityScore, provider);
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
          model: effectiveModel,
          prompt: userPrompt,
          response: resp?.choices?.[0]?.message?.content,
          inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
          outputTokens: usage.completion_tokens || usage.output_tokens || 0,
          cachedTokens: usage.cache_read_input_tokens || usage.prompt_tokens_details?.cached_tokens || 0,
          cacheWriteTokens: usage.cache_creation_input_tokens || 0,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
          systemPrompt,
          extraMetadata: params.metadata,
          workflowId,
          tags: extraParams.tags,
          qualityScore: extraParams.qualityScore,
          toolCallsCount,
          toolNames,
          provider,
        });
      } catch (e) {
        if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
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
      anthropicMod = _safeRequire("@anthropic-ai/sdk");
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
            const msgs = params.messages || [];
            for (let i = msgs.length - 1; i >= 0; i--) {
              const m = msgs[i];
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
              messages: msgs,
              tools: params.tools,
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
            if (
              err instanceof AurexBlocked ||
              err instanceof AurexBudgetExceeded ||
              process.env.AUREX_BLOCK_ON_WASTE === "1" ||
              self.budgetConfig?.onBudgetExceeded === "throw"
            ) {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          if (self.resiliencePolicy.enabled && self.resiliencePolicy.mode === "enforce") {
            args[1] = { ...(args[1] || {}), maxRetries: 0 };
          }

          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = resolveWorkflowId(extraParams.workflowId, aurexContext.getStore() || {});
          const effectiveModel = String(args?.[0]?.model || params?.model || "unknown");
          let resp;
          resp = await self.callWithResilience(() => origCreate(...args), {
            provider: "anthropic",
            workflowId,
            model: effectiveModel,
          });

          if (params.stream) {
            return self.wrapStream(resp, args[0] || params, workflowId, userPrompt, systemPrompt, true, extraParams.tags, extraParams.qualityScore, "anthropic");
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
              model: effectiveModel,
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
              toolNames,
              provider: "anthropic",
            });
          } catch (e) {
            if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
          }
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

  /** Best-effort OpenAI SDK patcher (Chat Completions + Responses API + OpenAI-compatible endpoints). */
  public patchOpenAI(): void {
    let openaiMod: any;
    try {
      openaiMod = _safeRequire("openai");
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
              tools: params.tools,
              responseFormat: params.response_format,
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
            args[0] = ensureOpenAIStreamUsage(applyDecisionToCallParams(params, decision));
          } catch (err: any) {
            if (
              err instanceof AurexBlocked ||
              err instanceof AurexBudgetExceeded ||
              process.env.AUREX_BLOCK_ON_WASTE === "1" ||
              self.budgetConfig?.onBudgetExceeded === "throw"
            ) {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          if (self.resiliencePolicy.enabled && self.resiliencePolicy.mode === "enforce") {
            args[1] = { ...(args[1] || {}), maxRetries: 0 };
          }

          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = resolveWorkflowId(extraParams.workflowId, aurexContext.getStore() || {});
          const effectiveModel = String(args?.[0]?.model || params?.model || "unknown");
          const provider = resolveEndpointProvider(effectiveModel, extractClientBaseUrl(inst, args?.[0] || params));
          let resp;
          resp = await self.callWithResilience(() => origCreate(...args), {
            provider,
            workflowId,
            model: effectiveModel,
          });

          if (params.stream) {
            return self.wrapStream(resp, args[0] || params, workflowId, userPrompt, systemPrompt, false, extraParams.tags, extraParams.qualityScore, provider);
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
              model: effectiveModel,
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
              toolNames,
              provider,
            });
          } catch (e) {
            if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
          }
          return resp;
        };
        patched.__aurex_patched__ = true;
        chat.completions.create = patched;
      }

      // OpenAI Responses API adapter (`client.responses.create`)
      const responsesApi = inst.responses;
      if (responsesApi && typeof responsesApi.create === "function" && !responsesApi.create.__aurex_patched__) {
        const origResponsesCreate = responsesApi.create.bind(responsesApi);
        const patchedResponses: any = async function (...args: any[]) {
          const params = args[0] || {};
          const { userPrompt, systemPrompt, messages } = normalizeResponsesApiInput(params);
          const extraParams = self.extractAurexExtraParams(params);
          const workflowId = resolveWorkflowId(extraParams.workflowId, aurexContext.getStore() || {});
          try {
            const decision = self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId,
              messages,
              tools: params.tools,
            });
            let updated: Record<string, any> = { ...params };
            let downgraded = false;
            if (decision.action === "downgrade" && decision.suggestedModel) {
              updated.model = decision.suggestedModel;
              downgraded = true;
            }
            updated = sanitizeThinkingParams(updated, {
              isDowngraded: downgraded,
              maxThinkingTokens: decision.maxThinkingTokens,
            });
            args[0] = updated;
          } catch (err: any) {
            if (
              err instanceof AurexBlocked ||
              err instanceof AurexBudgetExceeded ||
              process.env.AUREX_BLOCK_ON_WASTE === "1" ||
              self.budgetConfig?.onBudgetExceeded === "throw"
            ) {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          if (self.resiliencePolicy.enabled && self.resiliencePolicy.mode === "enforce") {
            args[1] = { ...(args[1] || {}), maxRetries: 0 };
          }

          const effectiveModel = String(args?.[0]?.model || params?.model || "unknown");
          const provider = resolveEndpointProvider(effectiveModel, extractClientBaseUrl(inst, args?.[0] || params));
          const resp = await self.callWithResilience(() => origResponsesCreate(...args), {
            provider,
            workflowId,
            model: effectiveModel,
          });
          if (!params.stream) {
            try {
              const u = extractResponsesApiUsage(resp);
              if (u.responseText) self.recordResponse(workflowId, u.responseText);
              self.logEvent({
                model: effectiveModel,
                prompt: userPrompt,
                response: u.responseText,
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
                cachedTokens: u.cachedTokens,
                reasoningTokens: u.reasoningTokens,
                systemPrompt,
                extraMetadata: params.metadata,
                workflowId,
                tags: extraParams.tags,
                qualityScore: extraParams.qualityScore,
                provider,
              });
            } catch (e) {
              if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
            }
          }
          return resp;
        };
        patchedResponses.__aurex_patched__ = true;
        responsesApi.create = patchedResponses;
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
      googleMod = _safeRequire("@google/genai");
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
          const workflowId = resolveWorkflowId(extraParams.workflowId, aurexContext.getStore() || {});
          
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
            if (
              err instanceof AurexBlocked ||
              err instanceof AurexBudgetExceeded ||
              process.env.AUREX_BLOCK_ON_WASTE === "1" ||
              self.budgetConfig?.onBudgetExceeded === "throw"
            ) {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }
          
          let resp;
          resp = await self.callWithResilience(() => origGenerate(...args), {
            provider: "google",
            workflowId,
            model: (params?.model || args?.[0]?.model || "unknown") as string,
          });
          
          try {
            const usage = resp?.usageMetadata || {};
            const thoughtsTokens = Number(usage.thoughtsTokenCount || 0);
            self.logEvent({
              model,
              prompt: userPrompt,
              response: resp?.text,
              inputTokens: usage.promptTokenCount || 0,
              outputTokens: (usage.candidatesTokenCount || 0) + thoughtsTokens,
              cachedTokens: usage.cachedContentTokenCount || 0,
              reasoningTokens: thoughtsTokens,
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
          } catch (e) {
            if (e instanceof AurexBudgetExceeded || e instanceof AurexBlocked) throw e;
          }
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
          const workflowId = resolveWorkflowId(extraParams.workflowId, aurexContext.getStore() || {});
          
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
            if (
              err instanceof AurexBlocked ||
              err instanceof AurexBudgetExceeded ||
              process.env.AUREX_BLOCK_ON_WASTE === "1" ||
              self.budgetConfig?.onBudgetExceeded === "throw"
            ) {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }
          
          let resp;
          resp = await self.callWithResilience(() => origGenerateStream(...args), {
            provider: "google",
            workflowId,
            model: (params?.model || args?.[0]?.model || "unknown") as string,
          });
          
          async function* wrapGoogleStream(stream: any) {
            let accumulatedContent = "";
            let finalUsage: any = null;
            let completed = false;
            try {
              for await (const chunk of stream) {
                if (chunk.text) {
                  accumulatedContent += chunk.text;
                }
                if (chunk.usageMetadata) {
                  finalUsage = chunk.usageMetadata;
                }
                yield chunk;
              }
              completed = true;
            } finally {
              self.recordResponse(workflowId, accumulatedContent);
              const thoughtsTokens = Number(finalUsage?.thoughtsTokenCount || 0);
              const inputTokens = finalUsage?.promptTokenCount || self.estimateTokens(userPrompt, Array.isArray(contents) ? contents : undefined);
              const baseOutput =
                finalUsage?.candidatesTokenCount ??
                (accumulatedContent ? Math.max(1, Math.floor(accumulatedContent.length / 4)) : 0);
              self.logEvent({
                model,
                prompt: userPrompt,
                response: accumulatedContent,
                inputTokens,
                outputTokens: baseOutput + thoughtsTokens,
                cachedTokens: finalUsage?.cachedContentTokenCount || 0,
                reasoningTokens: thoughtsTokens,
                systemPrompt,
                extraMetadata: params.metadata,
                workflowId,
                tags: extraParams.tags,
                qualityScore: extraParams.qualityScore,
                provider: "google",
                status: completed ? "ok" : "aborted_stream",
                outcome: completed ? "success" : "degraded",
              });
            }
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
          args[0] = applyDecisionToCallParams(params, decision);
          model = args[0].model || model;
        } catch (err: any) {
          if (
            err instanceof AurexBlocked ||
            err instanceof AurexBudgetExceeded ||
            process.env.AUREX_BLOCK_ON_WASTE === "1" ||
            self.budgetConfig?.onBudgetExceeded === "throw"
          ) {
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
      ollamaMod = _safeRequire("ollama");
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
      hfMod = _safeRequire("@huggingface/inference");
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
