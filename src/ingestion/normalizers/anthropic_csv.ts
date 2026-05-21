import { CanonicalEvent } from "../contracts";
import { extractProviderFromModel } from "../utils";
import { BaseNormalizer, NormalizerContext } from "./base";

export class AnthropicCsvNormalizer extends BaseNormalizer {
  canHandle(headers: string[]): boolean {
    const norms = headers.map(h => this.normalizeKey(h));
    return norms.includes('cache_creation_input_tokens') || 
           norms.includes('cache_read_input_tokens') || 
           norms.includes('cache_creation_tokens') || 
           norms.includes('cache_read_tokens') || 
           (norms.includes('prompt_tokens') && norms.includes('completion_tokens')) ||
           (norms.includes('input_tokens') && norms.includes('output_tokens') && norms.includes('total_cost_usd'));
  }

  normalize(row: Record<string, unknown>, ctx: NormalizerContext): void {
    const normRow = this.normalizeRowKeys(row);
    const timestamp = this.parseTimestamp(normRow.timestamp || normRow.date || normRow.created_at || normRow.created);
    const model = String(normRow.model || "unknown");
    const provider = extractProviderFromModel(model);

    const workflow_id = (normRow.workflow_id || normRow.workflow)?.toString();
    let session_id = (normRow.session_id || normRow.session)?.toString();
    let request_id = (normRow.request_id || normRow.step_id || normRow.id)?.toString();

    const prompt = (normRow.prompt || normRow.prompt_text || normRow.input)?.toString();

    const input_tokens = this.num(normRow.input_tokens || normRow.prompt_tokens);
    const output_tokens = this.num(normRow.output_tokens || normRow.completion_tokens);
    const total_tokens = input_tokens + output_tokens;

    const cache_creation_input_tokens = this.num(normRow.cache_creation_input_tokens || normRow.cache_creation_tokens);
    const cached_input_tokens = this.num(normRow.cache_read_input_tokens || normRow.cache_read_tokens);

    let provider_reported_cost_usd: number | undefined;
    const costRaw = normRow.total_cost_usd || normRow.total_cost || normRow.cost_usd || normRow.cost;
    if (costRaw != null && costRaw !== "") {
      provider_reported_cost_usd = this.num(costRaw);
    }

    const extra_metadata: Record<string, any> = {
      source: "anthropic_csv"
    };

    let system_prompt_hash = row.system_prompt_hash?.toString();
    const metadata_raw = row.metadata || row.extra_metadata;

    if (metadata_raw && typeof metadata_raw === "string") {
      try {
        const metadata_dict = JSON.parse(metadata_raw);
        Object.assign(extra_metadata, metadata_dict);
        
        if (!system_prompt_hash) system_prompt_hash = metadata_dict.system_prompt_hash;
        if (!session_id) session_id = metadata_dict.session_id;
        if (!request_id) request_id = metadata_dict.request_id;
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
      cached_input_tokens,
      cache_creation_input_tokens,
      provider_reported_cost_usd,
      system_prompt_hash,
      prompt,
      extra_metadata,
    };

    ctx.onEvent(event);
  }
}
