import { describe, it, expect, vi } from 'vitest';
import { AnthropicCsvNormalizer, OpenAiCsvNormalizer, BedrockCsvNormalizer } from '../../../../src/ingestion/normalizers';

describe('Normalizers', () => {
  describe('AnthropicCsvNormalizer', () => {
    const normalizer = new AnthropicCsvNormalizer();

    it('canHandle returns true for Anthropic-specific columns', () => {
      expect(normalizer.canHandle(['cache_creation_input_tokens'])).toBe(true);
      expect(normalizer.canHandle(['prompt_tokens', 'completion_tokens'])).toBe(true);
    });

    it('canHandle returns true for official Anthropic console headers containing spaces and casing', () => {
      expect(normalizer.canHandle([
        'Date', 'Model', 'Input Tokens', 'Output Tokens',
        'Cache Creation Input Tokens', 'Cache Read Input Tokens', 'Total Cost (USD)'
      ])).toBe(true);
    });

    it('normalizes Anthropic CSV row properly', () => {
      const mockCtx = {
        onEvent: vi.fn(),
        onWarning: vi.fn(),
      };

      const row = {
        timestamp: '2023-10-01T12:00:00Z',
        model: 'claude-2',
        input_tokens: '100',
        output_tokens: '50',
        cache_creation_input_tokens: '10'
      };

      normalizer.normalize(row, mockCtx);

      expect(mockCtx.onEvent).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-2',
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        cache_creation_input_tokens: 10
      }));
    });

    it('normalizes official Anthropic console row with spaces and casing', () => {
      const mockCtx = {
        onEvent: vi.fn(),
        onWarning: vi.fn(),
      };

      const row = {
        'Date': '2026-05-15T10:00:00Z',
        'Model': 'claude-3-7-sonnet-20250219',
        'Input Tokens': '500',
        'Output Tokens': '200',
        'Cache Creation Input Tokens': '3500',
        'Cache Read Input Tokens': '1500',
        'Total Cost (USD)': '0.01525',
        'Request ID': 'req_xyz123'
      };

      normalizer.normalize(row, mockCtx);

      expect(mockCtx.onEvent).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-20250219',
        input_tokens: 500,
        output_tokens: 200,
        total_tokens: 700,
        cache_creation_input_tokens: 3500,
        cached_input_tokens: 1500,
        provider_reported_cost_usd: 0.01525,
        request_id: 'req_xyz123'
      }));
    });
  });

  describe('OpenAiCsvNormalizer', () => {
    const normalizer = new OpenAiCsvNormalizer();

    it('canHandle returns true for OpenAI specific columns', () => {
      expect(normalizer.canHandle(['n_context_tokens_total', 'n_generated_tokens_total'])).toBe(true);
      expect(normalizer.canHandle(['input_tokens', 'output_tokens'])).toBe(true);
      // should not match Anthropic or Bedrock
      expect(normalizer.canHandle(['cache_creation_input_tokens'])).toBe(false);
      expect(normalizer.canHandle(['InvocationLatency'])).toBe(false);
    });

    it('canHandle returns true for official OpenAI console headers containing spaces and casing', () => {
      expect(normalizer.canHandle([
        'Timestamp', 'Organization ID', 'Project ID', 'API Key ID', 'Model',
        'Prompt Tokens', 'Completion Tokens', 'Cost', 'Request Count', 'Status'
      ])).toBe(true);
    });

    it('normalizes OpenAI CSV row properly', () => {
      const mockCtx = {
        onEvent: vi.fn(),
        onWarning: vi.fn(),
      };

      const row = {
        timestamp: '2023-10-01T12:00:00Z',
        model: 'gpt-4',
        n_context_tokens_total: '200',
        n_generated_tokens_total: '100',
        cost_usd: '0.05'
      };

      normalizer.normalize(row, mockCtx);

      expect(mockCtx.onEvent).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4',
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
        provider_reported_cost_usd: 0.05
      }));
    });

    it('normalizes official OpenAI console row with spaces and casing', () => {
      const mockCtx = {
        onEvent: vi.fn(),
        onWarning: vi.fn(),
      };

      const row = {
        'Timestamp': '2026-05-15T10:00:00Z',
        'Model': 'o3-mini',
        'Prompt Tokens': '1200',
        'Completion Tokens': '400',
        'Cost': '0.00308',
        'Status': 'success'
      };

      normalizer.normalize(row, mockCtx);

      expect(mockCtx.onEvent).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        model: 'o3-mini',
        input_tokens: 1200,
        output_tokens: 400,
        total_tokens: 1600,
        provider_reported_cost_usd: 0.00308
      }));
    });
  });

  describe('BedrockCsvNormalizer', () => {
    const normalizer = new BedrockCsvNormalizer();

    it('canHandle detects Bedrock via CloudWatch header', () => {
      expect(normalizer.canHandle(['InvocationLatency'])).toBe(true);
      expect(normalizer.canHandle(['something'], [{'col1': 'AWS/Bedrock'}])).toBe(true);
    });

    it('normalizes Bedrock CSV row correctly mapping multiple invocations', () => {
      const mockCtx = {
        onEvent: vi.fn(),
        onWarning: vi.fn(),
      };

      const row = {
        'Timestamp': '2023-10-01T12:00:00Z',
        'InputTokenCount': '50',
        'InvocationLatency': '120',
        'Invocations': '2',
        'OutputTokenCount': '30'
      };

      normalizer.normalize(row, mockCtx);

      // Should emit 2 events because Invocations = 2
      expect(mockCtx.onEvent).toHaveBeenCalledTimes(2);
      expect(mockCtx.onEvent).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'anthropic',
        input_tokens: 50,
        output_tokens: 30,
        latency_ms: 120
      }));
    });
  });
});
