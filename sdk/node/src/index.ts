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
  flushIntervalMs?: number;
  maxBatchSize?: number;
  localOnly?: boolean;
  budgetGuard?: BudgetGuardConfig;
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

  private constructor(config?: AurexConfig) {
    const defaultLedger = ".aurex/ledger.jsonl";
    this.config = {
      apiKey: config?.apiKey || process.env.AUREX_API_KEY || "",
      project: config?.project || "default",
      ledgerPath: config?.ledgerPath || defaultLedger,
      cloudSync: config?.cloudSync ?? false,
      cloudEndpoint: config?.cloudEndpoint || "http://localhost:8000/api/v1/upload/csv",
      flushIntervalMs: config?.flushIntervalMs || 1000,
      maxBatchSize: config?.maxBatchSize || 50,
      localOnly: config?.localOnly ?? true,
      budgetGuard: config?.budgetGuard || {},
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
      const payload = {
        project: this.config.project,
        data: batch,
      };
      
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
}
