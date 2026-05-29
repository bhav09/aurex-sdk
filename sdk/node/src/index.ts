import fs from "fs";
import path from "path";
import crypto from "crypto";

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
  private flushIntervalId: NodeJS.Timeout | null = null;
  private lastMinuteEvents: { timestamp: number; cost: number }[] = [];
  private sessionCosts: Record<string, number> = {};
  private budgetConfig: BudgetGuardConfig | null = null;
  private recentRequests: { timestamp: number; model: string; workflowId: string; systemPromptHash?: string; promptHash?: string; estimatedTokens: number }[] = [];

  private constructor(config?: AurexConfig) {
    const defaultLedger = ".aurex/ledger.jsonl";
    this.config = {
      apiKey: config?.apiKey || process.env.AUREX_API_KEY || "",
      project: config?.project || "default",
      ledgerPath: config?.ledgerPath || defaultLedger,
      cloudSync: config?.cloudSync ?? false,
      cloudEndpoint: resolveCloudEndpoint(config),
      baseUrl: config?.baseUrl || process.env.AUREX_BASE_URL || "",
      flushIntervalMs: config?.flushIntervalMs || 30000,
      maxBatchSize: config?.maxBatchSize || 100,
      localOnly: config?.localOnly ?? true,
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

  public preCallCheck(params: {
    model: string;
    prompt?: string;
    systemPrompt?: string;
    workflowId?: string;
    messages?: any[];
  }): void {
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
    const warnings: string[] = [];

    // 1. System Prompt Waste Detector
    if (sysPromptHash && workflowRequests.length >= 2) {
      const duplicates = workflowRequests.slice(0, -1).filter(r => r.systemPromptHash === sysPromptHash);
      if (duplicates.length > 0) {
        warnings.push(`System Prompt Waste: Redundant system prompt sent again in workflow '${workflowId}'. Enable Prompt Caching to optimize token spend.`);
      }
    }

    // 2. Agent Runaway Loop Detector (exponential context growth)
    if (workflowRequests.length >= 3) {
      const recent = workflowRequests.slice(-3);
      const sizes = recent.map(r => r.estimatedTokens);
      if (sizes[1] >= sizes[0] * 2.2 && sizes[2] >= sizes[1] * 2.2 && sizes[0] > 20) {
        warnings.push(`Agent Runaway Loop: Prompt context size grew exponentially in workflow '${workflowId}' (${sizes[0]} -> ${sizes[1]} -> ${sizes[2]} estimated tokens). Add context pruning.`);
      }
    }

    // 3. Expensive Model Misuse Detector
    const [inputPrice] = getModelPricing(params.model);
    const isExpensive = inputPrice > 2.00;
    const isSimple = estTokens < 150;
    if (isExpensive && isSimple) {
      const recommended = params.model.includes("gpt") || params.model.startsWith("o1") ? "gpt-4o-mini" : "claude-3-5-haiku";
      warnings.push(`Over-Provisioned Model: Using expensive model '${params.model}' for simple task (~${estTokens} tokens). Switch to '${recommended}'.`);
    }

    // 4. Context Explosion Detector
    if (workflowRequests.length >= 2) {
      const initial = workflowRequests[0].estimatedTokens;
      const current = estTokens;
      if (initial > 0 && current >= initial * 3.5) {
        warnings.push(`Context Explosion: Context grew ${(current / initial).toFixed(1)}x in workflow '${workflowId}' (${initial} -> ${current} estimated tokens). Recommend sliding window.`);
      }
    }

    if (warnings.length > 0) {
      let mode = this.budgetConfig?.onBudgetExceeded || "warn";
      if (process.env.AUREX_BLOCK_ON_WASTE === "1") {
        mode = "throw";
      }

      for (const msg of warnings) {
        const fullMsg = `[Aurex SDK Real-Time Guard] ${msg}`;
        if (mode === "throw") {
          throw new Error(fullMsg);
        } else {
          console.warn(fullMsg);
        }
      }
    }
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
        // Fail silently
      }
    } catch (err) {
      // Fail silently
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
      try {
        const messages = params.messages || [];
        let systemPrompt = "";
        let userPrompt = "";
        for (const m of messages) {
          if (m.role === "system" && typeof m.content === "string") systemPrompt = m.content;
          else if (m.role === "user" && typeof m.content === "string") userPrompt = m.content;
        }
        self.preCallCheck({
          model: params.model || "unknown",
          prompt: userPrompt,
          systemPrompt,
          workflowId: params.user || params.metadata?.workflow_id,
          messages,
        });
      } catch (err: any) {
        if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
          throw err;
        }
        console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
      }

      const resp = await original(...args);
      try {
        const usage = resp?.usage || {};
        self.logEvent({
          model: params.model || "unknown",
          inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
          outputTokens: usage.completion_tokens || usage.output_tokens || 0,
          cachedTokens: usage.cache_read_input_tokens || 0,
          cacheWriteTokens: usage.cache_creation_input_tokens || 0,
          extraMetadata: params.metadata,
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
          try {
            let systemPrompt = "";
            if (typeof params.system === "string") systemPrompt = params.system;
            else if (Array.isArray(params.system)) {
              systemPrompt = params.system.map((b: any) => typeof b === "string" ? b : (b.text || "")).join("");
            }
            const messages = params.messages || [];
            let userPrompt = "";
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
            self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId: params.metadata?.workflow_id || params.user,
              messages,
            });
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          const resp = await origCreate(...args);
          try {
            const usage = resp?.usage || {};
            self.logEvent({
              model: params.model || "unknown",
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cachedTokens: usage.cache_read_input_tokens || 0,
              cacheWriteTokens: usage.cache_creation_input_tokens || 0,
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
            self.preCallCheck({
              model: params.model || "unknown",
              prompt: userPrompt,
              systemPrompt,
              workflowId: params.user || params.metadata?.workflow_id,
              messages,
            });
          } catch (err: any) {
            if (process.env.AUREX_BLOCK_ON_WASTE === "1" || self.budgetConfig?.onBudgetExceeded === "throw") {
              throw err;
            }
            console.warn(`[Aurex SDK Real-Time Warning Check Error] ${err.message}`);
          }

          const resp = await origCreate(...args);
          try {
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
              workflowId: params.user || params.metadata?.workflow_id,
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
