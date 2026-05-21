import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface AurexConfig {
  apiKey?: string;
  project?: string;
  ledgerPath?: string;
  cloudSync?: boolean;
  cloudEndpoint?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  localOnly?: boolean;
}

export interface AurexEvent {
  timestamp: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
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
  // Remove common prefixes
  model = model.replace(/^(models\/|publishers\/google\/models\/|anthropic\.|amazon\.|bedrock\/)/g, "");
  model = model.replace(/[\s_]+/g, "-");
  return model;
}

export function getModelPricing(model: string): [number, number] {
  if (!model) return [3.00, 12.00];
  const queryNorm = normalizeModelName(model);
  const pricing = MODEL_PRICING[queryNorm];
  if (pricing) return [pricing.input, pricing.output];
  
  const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (queryNorm.includes(key)) {
      return [MODEL_PRICING[key].input, MODEL_PRICING[key].output];
    }
  }
  return [15.00, 60.00];
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const [inputPrice, outputPrice] = getModelPricing(model);
  return (inputTokens / 1_000_000 * inputPrice) + (outputTokens / 1_000_000 * outputPrice);
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
    };

    // Ensure ledger directory exists
    const ledgerDir = path.dirname(this.config.ledgerPath);
    if (ledgerDir && ledgerDir !== "." && !fs.existsSync(ledgerDir)) {
      try {
        fs.mkdirSync(ledgerDir, { recursive: true });
      } catch (err) {
        console.error(`[Aurex Warning] Could not create ledger directory:`, err);
      }
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
    workflowId?: string;
    systemPrompt?: string;
    extraMetadata?: Record<string, any>;
  }) {
    const inputT = params.inputTokens || 0;
    const outputT = params.outputTokens || 0;
    const cost = calculateCost(params.model, inputT, outputT);
    const provider = extractProvider(params.model);

    const event: AurexEvent = {
      timestamp: new Date().toISOString(),
      provider,
      model: params.model,
      input_tokens: inputT,
      output_tokens: outputT,
      total_tokens: inputT + outputT,
      cost,
      workflow_id: params.workflowId,
      system_prompt_hash: this.hashText(params.systemPrompt),
      prompt_hash: this.hashText(params.prompt),
      response_hash: this.hashText(params.response),
      extra_metadata: params.extraMetadata || {},
    };

    this.queue.push(event);

    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush();
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

  /** Tear down the auditor instance and clean up queue loops */
  public shutdown() {
    this.flush();
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
  }
}
