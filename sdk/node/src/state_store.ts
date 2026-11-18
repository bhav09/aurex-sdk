/**
 * Dependency-inverted workflow state store shared across Stages 1, 2, and 3 (Node.js).
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";

export function resolveWorkflowId(
  explicitId?: string,
  ctx?: Record<string, any>,
): string {
  if (explicitId && explicitId !== "default_workflow") return explicitId;
  if (ctx?.workflowId) return String(ctx.workflowId);
  if (ctx?.workflow_id) return String(ctx.workflow_id);

  // Auto-detect active OpenTelemetry trace_id if @opentelemetry/api is installed
  try {
    const base = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
    const req = createRequire(base);
    const otel = req("@opentelemetry/api");
    const span = otel.trace?.getActiveSpan?.();
    const spanCtx = span?.spanContext?.();
    if (spanCtx?.traceId && spanCtx.traceId !== "00000000000000000000000000000000") {
      return `otel_${spanCtx.traceId}`;
    }
  } catch {}

  if (process.env.AUREX_WORKFLOW_ID) return process.env.AUREX_WORKFLOW_ID;
  return explicitId || "default_workflow";
}

export interface PrefixSnapshot {
  toolsHash?: string | null;
  systemHash?: string | null;
  toolsSample?: string;
  systemSample?: string;
  lastTimestamp?: number;
  model?: string;
}

export interface StateStore {
  getPrefixState(workflowId: string): PrefixSnapshot | undefined;
  setPrefixState(workflowId: string, state: PrefixSnapshot): void;
  addSpend(workflowId: string, cost: number, nowMs?: number): void;
  getSpendSummary(workflowId: string, nowMs?: number): {
    sessionCost: number;
    minuteCost: number;
    minuteRequests: number;
  };
  getPolicy(key: string): Record<string, any> | undefined;
  setPolicy(key: string, policy: Record<string, any>): void;
  clear(): void;
}

export class InMemoryStateStore implements StateStore {
  private maxWorkflows: number;
  private prefixStates = new Map<string, PrefixSnapshot>();
  private sessionCosts = new Map<string, number>();
  private minuteEvents: Array<{ timestamp: number; cost: number }> = [];
  private policies = new Map<string, Record<string, any>>();

  constructor(maxWorkflows: number = 2000) {
    this.maxWorkflows = maxWorkflows;
  }

  getPrefixState(workflowId: string): PrefixSnapshot | undefined {
    const state = this.prefixStates.get(workflowId);
    return state ? { ...state } : undefined;
  }

  setPrefixState(workflowId: string, state: PrefixSnapshot): void {
    if (!this.prefixStates.has(workflowId) && this.prefixStates.size >= this.maxWorkflows) {
      const oldest = this.prefixStates.keys().next().value;
      if (oldest !== undefined) this.prefixStates.delete(oldest);
    }
    this.prefixStates.set(workflowId, { ...state });
  }

  addSpend(workflowId: string, cost: number, nowMs?: number): void {
    const now = nowMs ?? Date.now();
    this.minuteEvents = this.minuteEvents.filter((e) => now - e.timestamp < 60_000);
    this.minuteEvents.push({ timestamp: now, cost });
    if (workflowId) {
      if (!this.sessionCosts.has(workflowId) && this.sessionCosts.size >= this.maxWorkflows) {
        const oldest = this.sessionCosts.keys().next().value;
        if (oldest !== undefined) this.sessionCosts.delete(oldest);
      }
      this.sessionCosts.set(workflowId, (this.sessionCosts.get(workflowId) || 0) + cost);
    }
  }

  getSpendSummary(workflowId: string, nowMs?: number) {
    const now = nowMs ?? Date.now();
    this.minuteEvents = this.minuteEvents.filter((e) => now - e.timestamp < 60_000);
    return {
      sessionCost: workflowId ? this.sessionCosts.get(workflowId) || 0 : 0,
      minuteCost: this.minuteEvents.reduce((acc, e) => acc + e.cost, 0),
      minuteRequests: this.minuteEvents.length,
    };
  }

  getPolicy(key: string): Record<string, any> | undefined {
    const p = this.policies.get(key);
    return p ? { ...p } : undefined;
  }

  setPolicy(key: string, policy: Record<string, any>): void {
    this.policies.set(key, { ...policy });
  }

  clear(): void {
    this.prefixStates.clear();
    this.sessionCosts.clear();
    this.minuteEvents = [];
    this.policies.clear();
  }
}

export function buildStateStore(_redisUrl?: string): StateStore {
  return new InMemoryStateStore();
}
