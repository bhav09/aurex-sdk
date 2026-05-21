import { BaseNormalizer, NormalizerContext } from "./base";
import { CanonicalEvent } from "../contracts";

export interface UserColumnMapping {
  timestamp: string;
  model: string;
  inputTokens: string[];
  outputTokens: string;
  totalTokens?: string;
}

export class UserMappedCsvNormalizer extends BaseNormalizer {
  constructor(private mapping: UserColumnMapping) {
    super();
  }

  canHandle(headers: string[], firstRows?: Record<string, unknown>[]): boolean {
    // This normalizer is manually invoked, so it doesn't sniff.
    return false;
  }

  normalize(rowRaw: Record<string, unknown>, ctx: NormalizerContext): void {
    const row = this.normalizeRowKeys(rowRaw);
    
    // Also normalize the mapping keys in case there are hidden spaces in the CSV headers
    const tsKey = this.normalizeKey(this.mapping.timestamp);
    const modKey = this.normalizeKey(this.mapping.model);
    const outKey = this.normalizeKey(this.mapping.outputTokens);
    const totKey = this.mapping.totalTokens ? this.normalizeKey(this.mapping.totalTokens) : null;

    const timestamp = this.parseTimestamp(row[tsKey] ?? rowRaw[this.mapping.timestamp]);
    const model = String(row[modKey] ?? rowRaw[this.mapping.model] ?? "").trim() || "unknown-model";

    let inputTokens = 0;
    for (const rawCol of this.mapping.inputTokens) {
      const col = this.normalizeKey(rawCol);
      inputTokens += this.num(row[col] ?? rowRaw[rawCol]);
    }

    let outputTokens = this.num(row[outKey] ?? rowRaw[this.mapping.outputTokens]);
    
    // If inputTokens wasn't mapped or was 0, but total tokens exists, we can fallback
    if (inputTokens === 0 && outputTokens > 0 && totKey) {
      const total = this.num(row[totKey] ?? rowRaw[this.mapping.totalTokens!]);
      if (total > outputTokens) {
        inputTokens = total - outputTokens;
      }
    }

    const event: CanonicalEvent = {
      timestamp,
      provider: "custom",
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };

    ctx.onEvent(event);
  }
}
