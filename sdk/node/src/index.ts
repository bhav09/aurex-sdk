import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  AurexDecision,
  applyDecisionToCallParams,
  compressMessages,
  isExpensiveModel,
  suggestCheaperModel,
} from "./decisions";
import { jaccardNGramSimilarity } from "./semantic";

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
}

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-4.1": { input: 2.00, output: 8.00 },
  "gpt-5": { input: 5.00, output: 15.00 },
  "gpt-5.1": { input: 5.00, output: 15.00 },
  "o3-mini": { input: 1.10, output: 4.40 },
  "o1": { input: 15.00, output: 60.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  "gemini-1.5-pro": { input: 1.25, output: 5.00 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.5-pro": { input: 1.25, output: 5.00 },
  "gemini-2.5-flash": { input: 0.10, output: 0.40 },
  "claude-opus-4-20250514": { input: 15.00, output: 75.00 },
  "claude-3-opus": { input: 15.00, output: 75.00 },
  "claude-3-opus-20240229": { input: 15.00, output: 75.00 },
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
  "llama3.1:70b": { input: 0.0, output: 0.0 },
  "llama3.1:8b": { input: 0.0, output: 0.0 },
  "qwen2.5:72b": { input: 0.0, output: 0.0 },
  "mistral:7b": { input: 0.0, output: 0.0 },
};

export function normalizeModelName(m: string): string {
  let model = m.trim().toLowerCase();
  // Strip fine-tuned model prefixes (e.g. "ft:gpt-4o-mini-2024-07-18:my-org::abc123" → base model)
  const ftMatch = model.match(/^ft:([^:]+)/);
  if (ftMatch) {
    model = ftMatch[1];
  }
  // Remove common prefixes
  model = model.replace(/^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/)/g, "");
  model = model.replace(/[\s_]+/g, "-");
  return model;
}

export function getModelPricing(model: string): [number, number] {
  if (!model) return [1.50, 6.00];
  const queryNorm = normalizeModelName(model);
  const pricing = MODEL_PRICING[queryNorm];
  if (pricing) return [pricing.input, pricing.output];
  
  const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (queryNorm.includes(key)) {
      return [MODEL_PRICING[key].input, MODEL_PRICING[key].output];
    }
  }
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
  if (modelLower.includes("claude")) return "anthropic";
  if (modelLower.includes("gpt") || modelLower.startsWith("o1") || modelLower.startsWith("o3")) return "openai";
  if (modelLower.includes("gemini")) return "google";
  if (["llama", "mistral", "qwen"].some(x => modelLower.includes(x))) return "ollama";
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
    };

    if (config?.budgetGuard) {
      this.budgetConfig = config.budgetGuard;
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
  }) {
    const inputT = params.inputTokens || 0;
    const outputT = params.outputTokens || 0;
    const cachedT = params.cachedTokens || 0;
    const cacheWriteT = params.cacheWriteTokens || 0;
    const reasoningT = params.reasoningTokens || 0;
    const isBatch = params.isBatch || false;
    const cost = calculateCost(params.model, inputT, outputT, cachedT, cacheWriteT, isBatch);
    const provider = extractProvider(params.model);

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
    };

    // Track metrics for the sliding window
    this.lastMinuteEvents.push({ timestamp: Date.now(), cost });
    if (params.workflowId) {
      this.sessionCosts[params.workflowId] = (this.sessionCosts[params.workflowId] || 0) + cost;
    }

    this.queue.push(event);

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
      estimatedTokens: estTokens
    };

    // Filter recent requests to last 5 minutes
    this.recentRequests = this.recentRequests.filter(r => now - r.timestamp < 300000);
    this.recentRequests.push(reqMeta);
    if (this.recentRequests.length > 200) {
      this.recentRequests.shift();
    }

    const workflowRequests = this.recentRequests.filter(r => r.workflowId === workflowId);
    let decision: AurexDecision = { action: "proceed", reason: "ok", originalModel: params.model };

    if (this.ignoredWorkflows.has(workflowId)) {
      return decision;
    }

    // Pre-emptive budget check
    const [inputPrice] = getModelPricing(params.model);
    const predictedCost = (estTokens / 1000000) * inputPrice;
    let budgetExceeded = false;
    let budgetReason = "";

    if (this.budgetConfig) {
      if (this.budgetConfig.maxCostPerSession !== undefined) {
        const currentSessionCost = this.sessionCosts[workflowId] || 0;
        if (currentSessionCost + predictedCost > this.budgetConfig.maxCostPerSession) {
          budgetExceeded = true;
          budgetReason += `Predicted cost $${predictedCost.toFixed(4)} plus session cost $${currentSessionCost.toFixed(4)} exceeds session limit of $${this.budgetConfig.maxCostPerSession.toFixed(4)}. `;
        }
      }

      if (this.budgetConfig.maxCostPerMinute !== undefined) {
        const minuteCost = this.lastMinuteEvents.reduce((acc, e) => acc + e.cost, 0);
        if (minuteCost + predictedCost > this.budgetConfig.maxCostPerMinute) {
          budgetExceeded = true;
          budgetReason += `Predicted cost $${predictedCost.toFixed(4)} plus minute cost $${minuteCost.toFixed(4)} exceeds minute limit of $${this.budgetConfig.maxCostPerMinute.toFixed(4)}. `;
        }
      }

      if (this.budgetConfig.maxRequestsPerMinute !== undefined) {
        const minuteRequests = this.lastMinuteEvents.length;
        if (minuteRequests + 1 > this.budgetConfig.maxRequestsPerMinute) {
          budgetExceeded = true;
          budgetReason += `Adding this request would exceed minute requests limit of ${this.budgetConfig.maxRequestsPerMinute}. `;
        }
      }

      if (this.budgetConfig.maxContextTokens !== undefined && estTokens > this.budgetConfig.maxContextTokens) {
        budgetExceeded = true;
        budgetReason += `Estimated input tokens ${estTokens} exceeds maximum context token limit of ${this.budgetConfig.maxContextTokens}. `;
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
        if (sizes[1] >= sizes[0] * 2.2 && sizes[2] >= sizes[1] * 2.2 && sizes[0] > 20) {
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
      const isSimple = estTokens < 150;
      const nearBudget =
        this.budgetConfig?.maxCostPerSession !== undefined &&
        (this.sessionCosts[workflowId] || 0) > (this.budgetConfig.maxCostPerSession * 0.8);
      if (((isExpensiveModel(params.model) && isSimple) || nearBudget) && decision.action === "proceed") {
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
      if (loopScore >= 0.8) {
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
      const mode = process.env.AUREX_BLOCK_ON_WASTE === "1" ? "throw" : (this.budgetConfig?.onBudgetExceeded || "warn");
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
  ): Promise<any> {
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
    const decision = this.preCallCheck({
      model,
      prompt: userPrompt,
      systemPrompt,
      workflowId: (raw as any).metadata?.workflow_id || (raw as any).user,
      messages,
    });
    const params = applyDecisionToCallParams(raw, decision);
    return callFn(params).then((resp) => {
      const text =
        resp?.choices?.[0]?.message?.content ||
        resp?.content?.[0]?.text ||
        (typeof resp?.output === "string" ? resp.output : undefined);
      this.recordResponse(
        (raw as any).metadata?.workflow_id || process.env.AUREX_WORKFLOW_ID || "default_workflow",
        text,
      );
      return resp;
    });
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
        throw new Error(message);
      }
    }
  }

  /** Force flush the in-memory queue to disk/cloud sync */
  public flush() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    // Local-first ledger file appending
    try {
      const dataStr = batch.map(e => JSON.stringify(e)).join("\n") + "\n";
      fs.appendFileSync(this.config.ledgerPath, dataStr, "utf-8");
    } catch (err) {
      console.error(`[Aurex SDK Ledger Error] Failed to write events to ledger:`, err);
    }

    // Sync metadata to Cloud if allowed
    if (this.config.cloudSync && !this.config.localOnly && this.config.apiKey) {
      this.syncToCloud(batch).catch(() => {
        // Fail silently
      });
    }
  }

  private async syncToCloud(batch: AurexEvent[]): Promise<void> {
    try {
      const cleaned = batch.map(e => {
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
        ? { events: cleaned.map(e => ({ ...e, cost_usd: e.cost })) }
        : { project: this.config.project, data: cleaned };

      const response = await fetch(this.config.cloudEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Cloud sync response status ${response.status}`);
      }
    } catch (err: any) {
      this.syncErrorCount++;
      this.lastSyncError = err.message || String(err);
      if (process.env.AUREX_DEBUG === "1") {
        console.warn("[Aurex Debug] Cloud sync failed:", err);
      }
    }
  }

  public persistPendingAndShutdown() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
    if (this.queue.length > 0) {
      const ledgerDir = path.dirname(this.config.ledgerPath);
      const pendingPath = path.join(ledgerDir || ".", "pending.jsonl");
      try {
        const dataStr = this.queue.map(e => JSON.stringify(e)).join("\n") + "\n";
        fs.appendFileSync(pendingPath, dataStr, "utf-8");
        this.queue = [];
      } catch (err) {
        console.error(`[Aurex Warning] Failed to persist pending events:`, err);
      }
    }
  }

  /** Tear down the auditor instance and clean up queue loops */
  public shutdown() {
    this.persistPendingAndShutdown();
  }

  public getHealth(): Record<string, any> {
    return {
      syncErrorCount: this.syncErrorCount,
      lastSyncError: this.lastSyncError,
      sessionCostsTracked: Object.keys(this.sessionCosts).length,
      queueSize: this.queue.length,
    };
  }

  private async *wrapStream(
    stream: any,
    params: any,
    workflowId: string,
    userPrompt: string,
    systemPrompt: string,
    isAnthropic = false
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
    const reasoningTokens = finalUsage?.completion_tokens_details?.reasoning_tokens || 0;

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
    });
  }

  // ==========================================================================
  // Auto-instrumentation
  // ==========================================================================

  /** Best-effort LiteLLM patcher (covers most users via the SDK shim). */
  public patchLiteLLM(): void {
    let lite: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        const decision = self.preCallCheck({
          model: params.model || "unknown",
          prompt: userPrompt,
          systemPrompt,
          workflowId: params.user || params.metadata?.workflow_id,
          messages,
        });
        args[0] = applyDecisionToCallParams(params, decision);
      } catch (err: any) {
        if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
          throw err;
        }
        console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
      }

      const workflowId = params.user || params.metadata?.workflow_id || "default_workflow";
      let resp;
      try {
        resp = await original(...args);
      } catch (ex: any) {
        self.markFailure(workflowId, ex.message || String(ex));
        throw ex;
      }

      if (params.stream) {
        return self.wrapStream(resp, params, workflowId, userPrompt, systemPrompt, false);
      }

      try {
        const content = resp?.choices?.[0]?.message?.content;
        self.recordResponse(workflowId, content);
      } catch {}
      try {
        const usage = resp?.usage || {};
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
            const decision = self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId: params.metadata?.workflow_id || params.user,
              messages,
            });
            args[0] = applyDecisionToCallParams(params, decision);
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          const workflowId = params.metadata?.workflow_id || params.user || "default_workflow";
          let resp;
          try {
            resp = await origCreate(...args);
          } catch (ex: any) {
            self.markFailure(workflowId, ex.message || String(ex));
            throw ex;
          }

          if (params.stream) {
            return self.wrapStream(resp, params, workflowId, userPrompt, systemPrompt, true);
          }

          try {
            const text = resp?.content?.[0]?.text;
            self.recordResponse(workflowId, text);
          } catch {}
          try {
            const usage = resp?.usage || {};
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
            const decision = self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId: params.user || params.metadata?.workflow_id,
              messages,
            });
            args[0] = applyDecisionToCallParams(params, decision);
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          const workflowId = params.user || params.metadata?.workflow_id || "default_workflow";
          let resp;
          try {
            resp = await origCreate(...args);
          } catch (ex: any) {
            self.markFailure(workflowId, ex.message || String(ex));
            throw ex;
          }

          if (params.stream) {
            return self.wrapStream(resp, params, workflowId, userPrompt, systemPrompt, false);
          }

          try {
            self.recordResponse(
              workflowId,
              resp?.choices?.[0]?.message?.content,
            );
            const usage = resp?.usage || {};
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

  public patchAll(): void {
    this.patchLiteLLM();
    this.patchAnthropic();
    this.patchOpenAI();
  }
}

export type { AurexDecision, AurexAction } from "./decisions";
export { applyDecisionToCallParams, suggestCheaperModel } from "./decisions";
