import crypto from "crypto";
import { AurexResilienceExhausted } from "./exceptions";

export const DEFAULT_RETRY_ON = [
  "timeout",
  "429",
  "5xx",
  "network",
  "empty",
  "content_filter",
  "truncated",
  "refusal",
  "tool_error",
];

export interface ResiliencePolicy {
  enabled: boolean;
  mode: "observe" | "enforce";
  timeoutMs: number;
  maxAttempts: number;
  maxExtraCostUsd: number;
  retryOn: string[];
  backoff: { baseMs: number; maxMs: number; jitter: number };
  idempotency: "auto" | "require_key" | "off";
  fallbacks: Array<Record<string, unknown>>;
  proofWindowPct: number;
  onRecovery?: (ctx: { workflowId: string; attempt: number; model: string }) => void;
  classifyResponseOverride?: (ctx: {
    provider: string;
    resp: unknown;
    exc?: unknown;
  }) => ClassificationResult;
}

export interface ClassificationResult {
  usable: boolean;
  kind: string;
  billed?: boolean;
  errorCode?: string;
  finishReason?: string;
  status: string;
  latencyMs?: number;
}

export interface AttemptRecord {
  attemptIndex: number;
  provider: string;
  model: string;
  classification: ClassificationResult;
  cost?: number;
  projectedCost?: number;
  lossAvoided?: number;
  recoveryProvider?: string;
  outcome?: string;
  costType?: string;
}

export function parseResilienceConfig(raw?: Record<string, unknown>): ResiliencePolicy {
  if (!raw) {
    return defaultPolicy();
  }
  const backoff = (raw.backoff as Record<string, number>) || {};
  return {
    enabled: Boolean(raw.enabled),
    mode: (raw.mode as "observe" | "enforce") || "observe",
    timeoutMs: Number(raw.timeout_ms ?? raw.timeoutMs ?? 60_000),
    maxAttempts: Math.max(1, Number(raw.max_attempts ?? raw.maxAttempts ?? 2)),
    maxExtraCostUsd: Number(raw.max_extra_cost_usd ?? raw.maxExtraCostUsd ?? 0.05),
    retryOn: (raw.retry_on as string[]) || (raw.retryOn as string[]) || [...DEFAULT_RETRY_ON],
    backoff: {
      baseMs: Number(backoff.base_ms ?? backoff.baseMs ?? 200),
      maxMs: Number(backoff.max_ms ?? backoff.maxMs ?? 5000),
      jitter: Number(backoff.jitter ?? 0.5),
    },
    idempotency: (raw.idempotency as ResiliencePolicy["idempotency"]) || "auto",
    fallbacks: (raw.fallbacks as Array<Record<string, unknown>>) || [],
    proofWindowPct: Number(raw.proof_window_pct ?? raw.proofWindowPct ?? 0),
    onRecovery: raw.on_recovery as ResiliencePolicy["onRecovery"],
    classifyResponseOverride: raw.classify_response as ResiliencePolicy["classifyResponseOverride"],
  };
}

function defaultPolicy(): ResiliencePolicy {
  return {
    enabled: false,
    mode: "observe",
    timeoutMs: 60_000,
    maxAttempts: 2,
    maxExtraCostUsd: 0.05,
    retryOn: [...DEFAULT_RETRY_ON],
    backoff: { baseMs: 200, maxMs: 5000, jitter: 0.5 },
    idempotency: "auto",
    fallbacks: [],
    proofWindowPct: 0,
  };
}

function extractText(resp: any): string {
  if (!resp) return "";
  if (resp.choices?.[0]?.message?.content) return resp.choices[0].message.content || "";
  if (resp.choices?.[0]?.text) return resp.choices[0].text || "";
  if (resp.content) {
    if (Array.isArray(resp.content)) {
      return resp.content.map((b: any) => b.text ?? String(b)).join("");
    }
    return String(resp.content);
  }
  return "";
}

function extractFinishReason(resp: any): string | undefined {
  if (!resp) return undefined;
  return resp.choices?.[0]?.finish_reason || resp.stop_reason;
}

export function classifyException(exc: unknown): ClassificationResult {
  const msg = String((exc as Error)?.message || exc).toLowerCase();
  const name = String((exc as Error)?.name || "").toLowerCase();
  if (msg.includes("timeout") || name.includes("timeout") || msg.includes("timed out")) {
    return { usable: false, kind: "timeout", billed: false, errorCode: "timeout", status: "error" };
  }
  if (msg.includes("429") || msg.includes("rate limit")) {
    return { usable: false, kind: "429", billed: false, errorCode: "429", status: "error" };
  }
  if (["500", "502", "503", "504", "5xx"].some((c) => msg.includes(c))) {
    return { usable: false, kind: "5xx", billed: false, errorCode: "5xx", status: "error" };
  }
  if (["connection", "network", "unreachable", "refused", "reset"].some((k) => msg.includes(k))) {
    return { usable: false, kind: "network", billed: false, errorCode: "network", status: "error" };
  }
  return { usable: false, kind: "unknown", billed: false, errorCode: name || "error", status: "error" };
}

export function classifyResponse(
  provider: string,
  resp: unknown,
  exc?: unknown,
  override?: ResiliencePolicy["classifyResponseOverride"],
): ClassificationResult {
  if (override) return override({ provider, resp, exc });
  if (exc) return classifyException(exc);
  if (!resp) return { usable: false, kind: "empty", billed: false, status: "degraded" };

  const finish = (extractFinishReason(resp) || "").toLowerCase();
  const text = extractText(resp).trim();

  if (finish === "content_filter" || finish === "content-filter") {
    return {
      usable: false,
      kind: "content_filter",
      billed: true,
      finishReason: finish,
      status: "degraded",
      errorCode: "content_filter",
    };
  }
  if (finish === "length" || finish === "max_tokens") {
    return {
      usable: false,
      kind: "truncated",
      billed: true,
      finishReason: finish,
      status: "degraded",
      errorCode: "truncated",
    };
  }
  if (finish === "refusal" || finish === "refused") {
    return {
      usable: false,
      kind: "refusal",
      billed: true,
      finishReason: finish,
      status: "degraded",
      errorCode: "refusal",
    };
  }
  if (!text) {
    return { usable: false, kind: "empty", billed: true, finishReason: finish || "empty", status: "degraded" };
  }
  return { usable: true, kind: "success", billed: true, finishReason: finish || "stop", status: "ok" };
}

export function isRetryable(kind: string, retryOn: string[]): boolean {
  return retryOn.includes(kind) || (kind === "unknown" && retryOn.includes("5xx"));
}

function backoffMs(policy: ResiliencePolicy, attempt: number): number {
  const delay = Math.min(policy.backoff.maxMs, policy.backoff.baseMs * 2 ** attempt);
  return delay + Math.random() * delay * policy.backoff.jitter;
}

function shouldSkipRecovery(policy: ResiliencePolicy, workflowId: string, model: string): boolean {
  if (policy.proofWindowPct <= 0) return false;
  const digest = crypto.createHash("sha256").update(`${workflowId}:${model}`).digest("hex");
  const bucket = parseInt(digest.slice(0, 8), 16) % 100;
  return bucket < policy.proofWindowPct;
}

function idempotencyAllowsRetry(
  policy: ResiliencePolicy,
  idempotencyKey: string | undefined,
  kind: string,
): boolean {
  if (policy.idempotency === "off") return false;
  if (policy.idempotency === "require_key") {
    return Boolean(idempotencyKey) && ["timeout", "429", "5xx", "network"].includes(kind);
  }
  return ["timeout", "429", "5xx", "network"].includes(kind);
}

export function estimateProjectedRerouteCost(
  model: string,
  fallbackModel: string | undefined,
  inputTokens: number,
  outputTokens: number,
  billedCost: number,
  calculateCostFn: (model: string, input: number, output: number) => number,
): number {
  const secondModel = fallbackModel || model;
  const duplicate = calculateCostFn(secondModel, inputTokens, Math.max(outputTokens, 256));
  return Math.round((billedCost + duplicate) * 1e6) / 1e6;
}

function resolveFallback(
  policy: ResiliencePolicy,
  attemptIndex: number,
  registered: Record<string, () => Promise<unknown> | unknown>,
): Record<string, unknown> | undefined {
  if (!policy.fallbacks.length) return undefined;
  const idx = attemptIndex - 1;
  if (idx < 0 || idx >= policy.fallbacks.length) return undefined;
  const entry = { ...policy.fallbacks[idx] };
  const callName = entry.call as string;
  if (callName && registered[callName]) {
    entry._callable = registered[callName];
  }
  return entry;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeWithResilience<T>(
  callFn: () => Promise<T> | T,
  policy: ResiliencePolicy,
  opts: {
    provider: string;
    model: string;
    workflowId: string;
    onAttempt: (record: AttemptRecord, resp: unknown, exc?: unknown) => void;
    registeredFallbacks?: Record<string, () => Promise<unknown> | unknown>;
    idempotencyKey?: string;
    calculateCostFn?: (model: string, input: number, output: number) => number;
    inputTokensEstimate?: number;
    outputTokensEstimate?: number;
  },
): Promise<{ resp: T; meta: Record<string, unknown> }> {
  if (!policy.enabled) {
    try {
      const resp = await Promise.resolve(callFn());
      return { resp, meta: { resilience: "disabled" } };
    } catch (exc) {
      throw exc;
    }
  }

  const registered = opts.registeredFallbacks || {};
  const meta: Record<string, unknown> = { attempts: [], mode: policy.mode };
  let lastExc: unknown;
  let lastResp: unknown;
  let extraCost = 0;
  const enforce = policy.mode === "enforce";
  const skipRecovery = shouldSkipRecovery(policy, opts.workflowId, opts.model);
  const calculateCostFn = opts.calculateCostFn || (() => 0);
  const inputTokens = opts.inputTokensEstimate ?? 512;
  const outputTokens = opts.outputTokensEstimate ?? 256;

  try {
    for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
      const attemptIndex = attempt;
      const started = Date.now();
      let currentCall = callFn;
      let recoveryProvider = opts.provider;
      let currentModel = opts.model;

      const fallback = resolveFallback(policy, attempt, registered);
      if (fallback && attempt > 0) {
        recoveryProvider = (fallback.provider as string) || opts.provider;
        currentModel = (fallback.model as string) || opts.model;
        const fbCall = (fallback._callable || fallback.call_fn) as (() => Promise<unknown> | unknown) | undefined;
        if (typeof fbCall === "function") {
          currentCall = () => fbCall() as Promise<T> | T;
        }
      }

      try {
        let resp: T;
        if (policy.timeoutMs > 0) {
          resp = await Promise.race([
            Promise.resolve(currentCall()),
            sleep(policy.timeoutMs).then(() => {
              throw new Error("timeout");
            }),
          ]);
        } else {
          resp = await Promise.resolve(currentCall());
        }

        const latencyMs = Date.now() - started;
        const classification = classifyResponse(
          opts.provider,
          resp,
          undefined,
          policy.classifyResponseOverride,
        );
        classification.latencyMs = latencyMs;

        if (classification.usable) {
          const record: AttemptRecord = {
            attemptIndex,
            provider: recoveryProvider,
            model: currentModel,
            classification,
            recoveryProvider: attemptIndex > 0 ? recoveryProvider : undefined,
            outcome: attemptIndex > 0 ? "recovered" : "success",
            costType: "inference",
          };
          if (attemptIndex > 0) {
            record.projectedCost = estimateProjectedRerouteCost(
              opts.model,
              currentModel,
              inputTokens,
              outputTokens,
              0,
              calculateCostFn,
            );
            record.lossAvoided = record.projectedCost;
          }
          opts.onAttempt(record, resp);
          (meta.attempts as AttemptRecord[]).push(record);
          if (attemptIndex > 0 && policy.onRecovery) {
            try {
              policy.onRecovery({ workflowId: opts.workflowId, attempt: attemptIndex, model: currentModel });
            } catch {
              /* ignore */
            }
          }
          return { resp, meta };
        }

        lastResp = resp;
        let billedCost = 0;
        if (classification.billed) {
          billedCost = calculateCostFn(currentModel, inputTokens, outputTokens);
          extraCost += billedCost;
        }
        const nxt = resolveFallback(policy, attempt + 1, registered);
        const projected = estimateProjectedRerouteCost(
          currentModel,
          nxt?.model as string | undefined,
          inputTokens,
          outputTokens,
          billedCost,
          calculateCostFn,
        );
        const record: AttemptRecord = {
          attemptIndex,
          provider: recoveryProvider,
          model: currentModel,
          classification,
          cost: billedCost,
          projectedCost: projected,
          lossAvoided: policy.mode === "observe" ? projected : 0,
          outcome: "degraded",
          costType: "unfulfilled_spend",
        };
        opts.onAttempt(record, resp);
        (meta.attempts as AttemptRecord[]).push(record);

        if (
          enforce &&
          !skipRecovery &&
          attempt < policy.maxAttempts - 1 &&
          isRetryable(classification.kind, policy.retryOn) &&
          idempotencyAllowsRetry(policy, opts.idempotencyKey, classification.kind) &&
          extraCost <= policy.maxExtraCostUsd
        ) {
          await sleep(backoffMs(policy, attempt));
          continue;
        }
        if (enforce && attempt >= policy.maxAttempts - 1) {
          throw new AurexResilienceExhausted(
            `Resilience exhausted after ${policy.maxAttempts} attempts`,
            { workflowId: opts.workflowId, lastError: classification.kind },
          );
        }
        return { resp, meta };
      } catch (exc) {
        if (exc instanceof AurexResilienceExhausted) throw exc;
        lastExc = exc;
        const latencyMs = Date.now() - started;
        const classification = classifyResponse(opts.provider, null, exc);
        classification.latencyMs = latencyMs;
        const record: AttemptRecord = {
          attemptIndex,
          provider: recoveryProvider,
          model: currentModel,
          classification,
          outcome: "failure",
          costType: "inference",
        };
        opts.onAttempt(record, null, exc);
        (meta.attempts as AttemptRecord[]).push(record);

        if (
          enforce &&
          !skipRecovery &&
          attempt < policy.maxAttempts - 1 &&
          isRetryable(classification.kind, policy.retryOn) &&
          idempotencyAllowsRetry(policy, opts.idempotencyKey, classification.kind) &&
          extraCost <= policy.maxExtraCostUsd
        ) {
          await sleep(backoffMs(policy, attempt));
          continue;
        }
        if (enforce && attempt >= policy.maxAttempts - 1) {
          throw new AurexResilienceExhausted(String((exc as Error)?.message || exc), {
            workflowId: opts.workflowId,
            lastError: classification.kind,
          });
        }
        throw exc;
      }
    }

    if (lastExc) throw lastExc;
    return { resp: lastResp as T, meta };
  } catch (exc) {
    if (exc instanceof AurexResilienceExhausted) throw exc;
    if (lastExc) throw lastExc;
    try {
      const resp = await Promise.resolve(callFn());
      return { resp, meta: { resilience: "fail_open" } };
    } catch (inner) {
      throw inner;
    }
  }
}
