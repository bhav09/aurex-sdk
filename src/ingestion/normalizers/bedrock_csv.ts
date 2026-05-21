import { CanonicalEvent } from "../contracts";
import { BaseNormalizer, NormalizerContext } from "./base";

export class BedrockCsvNormalizer extends BaseNormalizer {
  canHandle(headers: string[], firstRows?: Record<string, unknown>[]): boolean {
    const norms = headers.map(h => this.normalizeKey(h));
    if (norms.includes('invocationlatency') || norms.includes('invocation_latency')) return true;
    if (firstRows && firstRows.length > 0) {
      const firstLineStr = Object.keys(firstRows[0]).join(',') + Object.values(firstRows[0]).join(',');
      if (firstLineStr.includes('AWS/Bedrock')) return true;
    }
    return false;
  }

  normalize(row: Record<string, unknown>, ctx: NormalizerContext): void {
    const normRow = this.normalizeRowKeys(row);
    const keys = Object.keys(normRow);
    // CloudWatch Bedrock format: Timestamp, InputTokenCount, InvocationLatency, Invocations, OutputTokenCount
    const timestampKey = keys[0];
    if (!timestampKey || !normRow[timestampKey]) return;

    const timestampStr = String(normRow.timestamp || normRow.Timestamp || normRow[timestampKey]);
    const timestamp = this.parseTimestamp(timestampStr);

    // Use normalized keys, fallback to index keys or original keys
    const input_tokens = this.num(normRow.inputtokencount || normRow.input_token_count || normRow.InputTokenCount || normRow[keys[1]]);
    const latency = this.num(normRow.invocationlatency || normRow.invocation_latency || normRow.InvocationLatency || normRow[keys[2]]);
    const invocations = this.num(normRow.invocations || normRow.Invocations || normRow[keys[3]]);
    const output_tokens = this.num(normRow.outputtokencount || normRow.output_token_count || normRow.OutputTokenCount || normRow[keys[4]]);

    if (invocations === 0) return;

    const model = "claude-sonnet-4-5-20250929";
    const provider = "anthropic";

    for (let i = 0; i < invocations; i++) {
      const event: CanonicalEvent = {
        timestamp,
        provider,
        model,
        input_tokens,
        output_tokens,
        total_tokens: input_tokens + output_tokens,
        latency_ms: latency,
        extra_metadata: {
          source: "bedrock_cloudwatch"
        }
      };
      ctx.onEvent(event);
    }
  }
}
