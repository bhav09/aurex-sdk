/**
 * Live model pricing: community-maintained catalog (pulls OpenAI, Vertex, etc.).
 * Source: LiteLLM `model_prices_and_context_window.json` (GitHub, CORS-friendly).
 * Not an official vendor API — always validate numbers for finance use.
 */
import { canonModel, type PriceKey } from "./model-normalize";

const LITELLM_CATALOG_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

export type PricingMeta = {
  /** Label for UI, e.g. date or "live catalog" */
  label: string;
  source: "litellm-github" | "embedded-fallback";
  modelCount: number;
};

let shortKeyPrices = new Map<string, PriceKey>();
let initPromise: Promise<void> | null = null;
let meta: PricingMeta = {
  label: "embedded",
  source: "embedded-fallback",
  modelCount: 0,
};

const priceMemo = new Map<string, PriceKey | undefined>();

export function clearPriceMemo(): void {
  priceMemo.clear();
}

function providerScore(litellmProvider: string | undefined): number {
  if (!litellmProvider) return 1;
  const p = litellmProvider.toLowerCase();
  if (p === "openai") return 100;
  if (p.includes("vertex")) return 95;
  if (p === "azure") return 80;
  if (p.includes("anthropic")) return 75;
  if (p.includes("google")) return 70;
  return 50;
}

function entryToPrice(v: unknown): PriceKey | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const inp = o.input_cost_per_token;
  const out = o.output_cost_per_token;
  if (typeof inp !== "number" || typeof out !== "number") return null;
  if (inp <= 0 && out <= 0) return null;
  return {
    inputPerMillion: inp * 1_000_000,
    outputPerMillion: out * 1_000_000,
  };
}

function ingestLiteLLM(json: Record<string, unknown>): void {
  const next = new Map<string, PriceKey>();
  const ranks = new Map<string, number>();

  for (const [rawKey, val] of Object.entries(json)) {
    if (rawKey === "sample_spec") continue;
    const price = entryToPrice(val);
    if (!price) continue;
    const segment = rawKey.split("/").pop() ?? rawKey;
    const short = canonModel(segment);
    if (short.length < 2) continue;
    const prov = (val as { litellm_provider?: string }).litellm_provider;
    const score = providerScore(prov);
    const prevR = ranks.get(short) ?? -1;
    if (score >= prevR) {
      next.set(short, price);
      ranks.set(short, score);
    }
  }

  shortKeyPrices = next;
  clearPriceMemo();
  meta = {
    label: new Date().toISOString().slice(0, 10),
    source: "litellm-github",
    modelCount: next.size,
  };
}

async function tryFetchCatalog(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { cache: "no-cache", credentials: "omit" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function initModelCatalog(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    let local: Record<string, unknown> | null = null;
    
    if (typeof window !== "undefined") {
      const basePath = (import.meta as any).env?.BASE_URL || "/";
      const localUrl = new URL("model-catalog.json", `${window.location.origin}${basePath}`).href;
      local = await tryFetchCatalog(localUrl);
    }

    if (local) {
      ingestLiteLLM(local);
      meta.label = "bundled snapshot";
      return;
    }

    try {
      const json = await tryFetchCatalog(LITELLM_CATALOG_URL);
      if (!json) throw new Error("empty");
      ingestLiteLLM(json);
    } catch {
      shortKeyPrices = new Map();
      clearPriceMemo();
      meta = {
        label: "embedded (catalog fetch failed)",
        source: "embedded-fallback",
        modelCount: 0,
      };
    }
  })();
  return initPromise;
}

export function getPricingMeta(): PricingMeta {
  return { ...meta };
}

/** Resolve price from live catalog; returns null if unknown or catalog empty. */
export function getLivePriceForModel(model: string): PriceKey | null {
  if (shortKeyPrices.size === 0) return null;

  const u = canonModel(model);
  if (priceMemo.has(u)) {
    const c = priceMemo.get(u);
    return c === undefined ? null : c;
  }

  if (shortKeyPrices.has(u)) {
    const p = shortKeyPrices.get(u)!;
    priceMemo.set(u, p);
    return p;
  }

  let best: PriceKey | null = null;
  let bestLen = 0;

  for (const [short, price] of shortKeyPrices) {
    if (short.length < 4) continue;
    if (u.includes(short) || short.includes(u)) {
      const len = short.length;
      if (len > bestLen) {
        bestLen = len;
        best = price;
      }
    }
  }

  priceMemo.set(u, best ?? undefined);
  return best;
}
