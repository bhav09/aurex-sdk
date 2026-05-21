export interface CanonicalEvent {
  // Base Identity
  id?: string;
  timestamp: Date;
  provider: string;
  model: string;

  // Correlation IDs
  request_id?: string;
  parent_request_id?: string;
  workflow_id?: string;
  session_id?: string;
  agent_id?: string;
  agent_role?: string;
  dedupe_key?: string; // sha256(tenant + provider + request_id)

  // Tokens: Base
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;

  // Tokens: Advanced (Cache & Multimodal & Reasoning)
  cached_input_tokens?: number;
  cache_creation_input_tokens?: number;
  reasoning_tokens?: number;
  audio_input_tokens?: number;
  audio_output_tokens?: number;
  image_input_tokens?: number;
  image_input_count?: number;
  
  // Tools & Prompts
  tool_definitions_tokens?: number;
  tool_invocations?: string | object; // JSON string or object
  tools_available_count?: number;
  system_prompt_tokens?: number;
  dynamic_prefix_first_n_hash?: string;
  system_prompt_hash?: string;

  // Outcome
  finish_reason?: string;
  http_status?: number;
  latency_ms?: number;
  ttft_ms?: number;

  // Costs
  provider_reported_cost_usd?: number;
  our_calculated_cost_usd?: number;
  cost_reconciliation_delta_pct?: number;

  // Versions
  pricing_version?: string;
  tokenizer_version?: string;
  
  // Privacy & Multilingual
  language_detected?: string;
  pii_scrubbed?: boolean;
  prompt_text_storage?: 'plaintext' | 'hashed' | 'dropped';

  // Raw Content (Will be dropped before sending to backend or processed via hash)
  prompt?: string;
  response?: string;
  
  // Extra
  extra_metadata?: Record<string, any>;
}

export interface CanonicalSession {
  id: string;
  events: CanonicalEvent[];
  started_at: Date;
  finished_at?: Date;
  status: 'uploading' | 'queued' | 'normalizing' | 'analyzing' | 'complete' | 'failed';
}
