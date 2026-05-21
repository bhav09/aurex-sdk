import { CanonicalEvent } from "../contracts";
import { extractProviderFromModel } from "../utils";
import { BaseNormalizer, NormalizerContext } from "./base";

export class OpenAiCsvNormalizer extends BaseNormalizer {
  canHandle(headers: string[]): boolean {
    const norms = headers.map(h => this.normalizeKey(h));
    return (norms.includes('n_context_tokens_total') && norms.includes('n_generated_tokens_total')) || 
           ((norms.includes('prompt_tokens') || norms.includes('input_tokens')) && !norms.includes('cache_creation_input_tokens') && !norms.includes('invocation_latency') && !norms.includes('invocationlatency'));
  }

  normalize(row: Record<string, unknown>, ctx: NormalizerContext): void {
    const normRow = this.normalizeRowKeys(row);
    const timestamp = this.parseTimestamp(normRow.timestamp || normRow.created || normRow.created_at);
    const model = String(normRow.model || "unknown");
    const provider = extractProviderFromModel(model);

    const workflow_id = normRow.workflow_id?.toString();
    let session_id = normRow.session_id?.toString();
    let request_id = normRow.request_id?.toString();

    const input_tokens = this.num(normRow.input_tokens || normRow.prompt_tokens || normRow.n_context_tokens_total);
    const output_tokens = this.num(normRow.output_tokens || normRow.completion_tokens || normRow.n_generated_tokens_total);
    const total_tokens = this.num(normRow.total_tokens, input_tokens + output_tokens);

    let provider_reported_cost_usd: number | undefined;
    const costRaw = normRow.cost_usd || normRow.cost || normRow.total_cost || normRow.total_cost_usd;
    if (costRaw != null && costRaw !== "") {
      provider_reported_cost_usd = this.num(costRaw);
    }

    const extra_metadata: Record<string, any> = {
      source: "openai_csv"
    };

    let system_prompt_hash: string | undefined;
    const metadata_raw = normRow.metadata;

    if (metadata_raw && typeof metadata_raw === "string") {
      try {
        const metadata_dict = JSON.parse(metadata_raw);
        Object.assign(extra_metadata, metadata_dict);
        
        system_prompt_hash = metadata_dict.system_prompt_hash;
        if (!session_id && metadata_dict.session_id) session_id = metadata_dict.session_id;
        if (!request_id && metadata_dict.request_id) request_id = metadata_dict.request_id;
      } catch {
        extra_metadata.raw_metadata = String(metadata_raw);
      }
    }

    const event: CanonicalEvent = {
      timestamp,
      provider,
      model,
      workflow_id,
      session_id,
      request_id,
      input_tokens,
      output_tokens,
      total_tokens,
      provider_reported_cost_usd,
      system_prompt_hash,
      extra_metadata,
    };

    ctx.onEvent(event);
  }
}
