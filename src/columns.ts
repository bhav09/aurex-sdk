/** Map normalized header -> canonical field */
const ALIASES: Record<string, string[]> = {
  timestamp: [
    "timestamp",
    "created_at",
    "time",
    "date",
    "start_time",
    "request_timestamp",
    "usage_timestamp",
    "end_time",
    "completion_time",
  ],
  model: ["model", "model_name", "deployment", "engine_id", "publisher_model"],
  prompt: [
    "prompt",
    "input",
    "prompt_text",
    "messages",
    "request",
    "user_prompt",
    "query",
    "contents",
  ],
  input_tokens: [
    "input_tokens",
    "prompt_tokens",
    "input_token_count",
    "prompt_token_count",
    "cached_input_tokens",
  ],
  output_tokens: [
    "output_tokens",
    "completion_tokens",
    "output_token_count",
    "candidates_token_count",
    "completion_token_count",
    "total_tokens",
  ],
  request_id: ["request_id", "id", "requestid", "trace", "span_id"],
};

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s.]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Union column names from the first N rows (ragged CSVs may omit cells in row 1). */
export function unionHeaderKeys(
  records: Record<string, unknown>[],
  scanLimit = 2000
): string[] {
  const seen = new Set<string>();
  const n = Math.min(records.length, Math.max(1, scanLimit));
  for (let i = 0; i < n; i++) {
    for (const k of Object.keys(records[i] ?? {})) seen.add(k);
  }
  return [...seen];
}

export function resolveHeaderMap(
  headers: string[]
): Record<string, string> | null {
  const inv: Record<string, string> = {};
  for (const h of headers) {
    inv[normKey(h)] = h;
  }
  const out: Record<string, string> = {};
  for (const [canonical, keys] of Object.entries(ALIASES)) {
    for (const k of keys) {
      const nk = normKey(k);
      if (inv[nk]) {
        out[canonical] = inv[nk];
        break;
      }
    }
  }
  if (!out.timestamp || !out.model) return null;
  return out;
}

export function normalizePromptText(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length ? t : undefined;
  }
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}
