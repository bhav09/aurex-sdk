import { CanonicalEvent } from "../contracts";

export interface NormalizerContext {
  onEvent(event: CanonicalEvent): void;
  onWarning(message: string): void;
}

export interface Normalizer {
  /**
   * Sniffs the headers/first few rows to determine if this normalizer can handle the file
   */
  canHandle(headers: string[], firstRows?: Record<string, unknown>[]): boolean;

  /**
   * Normalize a single row from the CSV/JSON into a CanonicalEvent
   */
  normalize(row: Record<string, unknown>, ctx: NormalizerContext): void;
}

export abstract class BaseNormalizer implements Normalizer {
  abstract canHandle(headers: string[], firstRows?: Record<string, unknown>[]): boolean;
  abstract normalize(row: Record<string, unknown>, ctx: NormalizerContext): void;

  protected normalizeKey(key: string): string {
    return key
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/__+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  protected normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const normKey = this.normalizeKey(key);
      normalized[normKey] = value;
      // Also keep original key to avoid breaking any custom logic that might depend on it
      if (!(key in normalized)) {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  protected parseTimestamp(v: unknown): Date {
    if (v == null) return new Date();
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v === "number") {
      const d = new Date(v > 1e12 ? v : v * 1000);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    }
    const s = String(v).trim();
    if (!s) return new Date();
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  protected num(v: unknown, fallback = 0): number {
    if (v == null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
}
