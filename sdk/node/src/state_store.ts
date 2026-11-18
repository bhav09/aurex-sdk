/**
 * Dependency-inverted workflow state store shared across Stages 1, 2, and 3 (Node.js).
 */
import { createRequire } from "module";
import path from "path";

export function resolveWorkflowId(
  explicitId?: string,
  ctx?: Record<string, any>,
): string {
  if (explicitId && explicitId !== "default_workflow") return explicitId;
  if (ctx?.workflowId) return String(ctx.workflowId);
  if (ctx?.workflow_id) return String(ctx.workflow_id);

  // Auto-detect active OpenTelemetry trace_id if @opentelemetry/api is installed
  try {
    const base = typeof __filename !== "undefined" ? __filename : path.join(process.cwd(), "package.json");
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
  syncWorkflow?(workflowId: string, nowMs?: number): Promise<void>;
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

export class RedisStateStore implements StateStore {
  private fallback = new InMemoryStateStore();
  private client: any = null;
  private ns: string;
  private ttl: number;
  private remoteSpendCache = new Map<string, { sessionCost: number; minuteCost: number; minuteRequests: number }>();

  constructor(opts: { redisUrl?: string; redisClient?: any; namespace?: string; ttlSeconds?: number } = {}) {
    this.ns = opts.namespace || "aurex";
    this.ttl = opts.ttlSeconds || 7200;
    if (opts.redisClient) {
      this.client = opts.redisClient;
    } else if (opts.redisUrl) {
      try {
        const base = typeof __filename !== "undefined" ? __filename : path.join(process.cwd(), "package.json");
        const req = createRequire(base);
        const IORedis = req("ioredis");
        const Cls = IORedis.default || IORedis;
        this.client = new Cls(opts.redisUrl, { connectTimeout: 500, maxRetriesPerRequest: 1, lazyConnect: true });
        this.client.on?.("error", () => {});
      } catch {
        this.client = null;
      }
    }
  }

  private readSyncMockKey(key: string): string | null {
    try {
      const val = this.client?.data?.get?.(key);
      return val !== undefined && val !== null ? String(val) : null;
    } catch {
      return null;
    }
  }

  async syncWorkflow(workflowId: string, nowMs?: number): Promise<void> {
    if (!this.client) return;
    const now = nowMs ?? Date.now();
    const bucket = Math.floor(now / 60_000);
    try {
      const [rawPrefix, mgetVals] = await Promise.all([
        workflowId ? this.client.get(`${this.ns}:prefix:${workflowId}`) : Promise.resolve(null),
        this.client.mget(
          workflowId ? `${this.ns}:session_cost:${workflowId}` : `${this.ns}:none`,
          `${this.ns}:min_cost:${bucket}`,
          `${this.ns}:min_reqs:${bucket}`,
        ),
      ]);
      if (rawPrefix) {
        this.fallback.setPrefixState(workflowId, JSON.parse(rawPrefix));
      }
      if (Array.isArray(mgetVals)) {
        this.remoteSpendCache.set(workflowId || "__global__", {
          sessionCost: Number(mgetVals[0] || 0),
          minuteCost: Number(mgetVals[1] || 0),
          minuteRequests: Number(mgetVals[2] || 0),
        });
      }
    } catch {}
  }

  getPrefixState(workflowId: string): PrefixSnapshot | undefined {
    const syncRaw = this.readSyncMockKey(`${this.ns}:prefix:${workflowId}`);
    if (syncRaw) {
      try {
        return JSON.parse(syncRaw);
      } catch {}
    }
    return this.fallback.getPrefixState(workflowId);
  }

  setPrefixState(workflowId: string, state: PrefixSnapshot): void {
    this.fallback.setPrefixState(workflowId, state);
    if (this.client) {
      try {
        Promise.resolve(this.client.setex(`${this.ns}:prefix:${workflowId}`, this.ttl, JSON.stringify(state))).catch(() => {});
      } catch {}
    }
  }

  addSpend(workflowId: string, cost: number, nowMs?: number): void {
    const now = nowMs ?? Date.now();
    this.fallback.addSpend(workflowId, cost, now);
    if (!this.client) return;
    try {
      const bucket = Math.floor(now / 60_000);
      const pipe = this.client.pipeline?.();
      if (pipe) {
        if (workflowId) {
          const sKey = `${this.ns}:session_cost:${workflowId}`;
          pipe.incrbyfloat(sKey, cost);
          pipe.expire(sKey, this.ttl);
        }
        const mCostKey = `${this.ns}:min_cost:${bucket}`;
        const mReqKey = `${this.ns}:min_reqs:${bucket}`;
        pipe.incrbyfloat(mCostKey, cost);
        pipe.expire(mCostKey, 120);
        pipe.incr(mReqKey);
        pipe.expire(mReqKey, 120);
        Promise.resolve(pipe.exec()).catch(() => {});
      }
    } catch {}
  }

  getSpendSummary(workflowId: string, nowMs?: number) {
    const now = nowMs ?? Date.now();
    const bucket = Math.floor(now / 60_000);
    const sRaw = workflowId ? this.readSyncMockKey(`${this.ns}:session_cost:${workflowId}`) : null;
    const mCostRaw = this.readSyncMockKey(`${this.ns}:min_cost:${bucket}`);
    const mReqRaw = this.readSyncMockKey(`${this.ns}:min_reqs:${bucket}`);
    if (sRaw !== null || mCostRaw !== null || mReqRaw !== null) {
      return {
        sessionCost: Number(sRaw || 0),
        minuteCost: Number(mCostRaw || 0),
        minuteRequests: Number(mReqRaw || 0),
      };
    }
    const cached = this.remoteSpendCache.get(workflowId || "__global__");
    const local = this.fallback.getSpendSummary(workflowId, now);
    if (cached) {
      return {
        sessionCost: Math.max(cached.sessionCost, local.sessionCost),
        minuteCost: Math.max(cached.minuteCost, local.minuteCost),
        minuteRequests: Math.max(cached.minuteRequests, local.minuteRequests),
      };
    }
    return local;
  }

  getPolicy(key: string): Record<string, any> | undefined {
    const raw = this.readSyncMockKey(`${this.ns}:policy:${key}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return this.fallback.getPolicy(key);
  }

  setPolicy(key: string, policy: Record<string, any>): void {
    this.fallback.setPolicy(key, policy);
    if (this.client) {
      try {
        Promise.resolve(this.client.setex(`${this.ns}:policy:${key}`, this.ttl, JSON.stringify(policy))).catch(() => {});
      } catch {}
    }
  }

  clear(): void {
    this.fallback.clear();
    this.remoteSpendCache.clear();
  }
}

export function buildStateStore(redisUrl?: string, redisClient?: any): StateStore {
  if (redisClient) {
    return new RedisStateStore({ redisClient });
  }
  const resolved = redisUrl || process.env.AUREX_REDIS_URL;
  if (resolved) {
    return new RedisStateStore({ redisUrl: resolved });
  }
  return new InMemoryStateStore();
}
