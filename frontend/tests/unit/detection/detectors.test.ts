import { describe, it, expect } from 'vitest';
import { ToolBloatDetector, RetryCascadeDetector, OutputVerbosityDetector } from '../../../../src/detection/detectors';
import { SimpleDetectorContext } from '../../../../src/detection/runner';
import { CanonicalEvent } from '../../../../src/ingestion/contracts';
import { PricingEngine } from '../../../../src/detection/contracts';

const mockPricing: PricingEngine = {
  price: () => 0.01,
};

describe('Detectors', () => {
  describe('ToolBloatDetector', () => {
    const detector = new ToolBloatDetector();

    it('detects high tool bloat when many tools provided but few used', () => {
      const events: CanonicalEvent[] = [
        {
          timestamp: new Date(), provider: 'openai', model: 'gpt-4',
          input_tokens: 15000, output_tokens: 10, total_tokens: 15010,
          tools_available_count: 20, tool_invocations: '["tool1"]', tool_definitions_tokens: 11000
        }
      ];
      const ctx = new SimpleDetectorContext(events, { totalCost: 0, totalTokens: 0, totalEvents: 1 }, mockPricing);
      const findings = detector.detect(ctx);
      
      expect(findings.length).toBe(1);
      expect(findings[0].id).toBe('tb-1');
    });

    it('does not flag when tool bloat is low or tools used frequently', () => {
      const events: CanonicalEvent[] = [
        {
          timestamp: new Date(), provider: 'openai', model: 'gpt-4',
          input_tokens: 2000, output_tokens: 10, total_tokens: 2010,
          tools_available_count: 5, tool_invocations: '["tool1", "tool2", "tool3"]', tool_definitions_tokens: 1000
        }
      ];
      const ctx = new SimpleDetectorContext(events, { totalCost: 0, totalTokens: 0, totalEvents: 1 }, mockPricing);
      const findings = detector.detect(ctx);
      
      expect(findings.length).toBe(0);
    });
  });

  describe('RetryCascadeDetector', () => {
    const detector = new RetryCascadeDetector();

    it('detects retry cascades on rapid 5xx errors', () => {
      const baseTime = new Date('2023-10-01T12:00:00Z').getTime();
      const events: CanonicalEvent[] = Array(7).fill(0).map((_, i) => ({
        timestamp: new Date(baseTime + i * 1000), // 1 second apart
        provider: 'openai', model: 'gpt-4',
        input_tokens: 500, output_tokens: 0, total_tokens: 500,
        http_status: 500
      }));
      
      const ctx = new SimpleDetectorContext(events, { totalCost: 0, totalTokens: 0, totalEvents: 7 }, mockPricing);
      const findings = detector.detect(ctx);
      
      expect(findings.length).toBe(1);
      expect(findings[0].id).toBe('rc-1');
    });

    it('ignores retries that are spaced out or different models/inputs', () => {
      const baseTime = new Date('2023-10-01T12:00:00Z').getTime();
      const events: CanonicalEvent[] = Array(7).fill(0).map((_, i) => ({
        timestamp: new Date(baseTime + i * 10000), // 10 seconds apart
        provider: 'openai', model: 'gpt-4',
        input_tokens: 500 + i, output_tokens: 0, total_tokens: 500,
        http_status: 500
      }));
      
      const ctx = new SimpleDetectorContext(events, { totalCost: 0, totalTokens: 0, totalEvents: 7 }, mockPricing);
      const findings = detector.detect(ctx);
      
      expect(findings.length).toBe(0);
    });
  });

  describe('OutputVerbosityDetector', () => {
    const detector = new OutputVerbosityDetector();

    it('detects conversational filler', () => {
      const events: CanonicalEvent[] = Array(25).fill(0).map(() => ({
        timestamp: new Date(), provider: 'openai', model: 'gpt-4',
        input_tokens: 50, output_tokens: 100, total_tokens: 150,
        response: "Certainly! Here's the data you requested: ..."
      }));
      
      const ctx = new SimpleDetectorContext(events, { totalCost: 0, totalTokens: 0, totalEvents: 25 }, mockPricing);
      const findings = detector.detect(ctx);
      
      expect(findings.length).toBe(1);
      expect(findings[0].id).toBe('ov-1');
    });

    it('ignores concise outputs', () => {
      const events: CanonicalEvent[] = Array(25).fill(0).map(() => ({
        timestamp: new Date(), provider: 'openai', model: 'gpt-4',
        input_tokens: 50, output_tokens: 100, total_tokens: 150,
        response: '{"status": "success", "data": [1, 2, 3]}'
      }));
      
      const ctx = new SimpleDetectorContext(events, { totalCost: 0, totalTokens: 0, totalEvents: 25 }, mockPricing);
      const findings = detector.detect(ctx);
      
      expect(findings.length).toBe(0);
    });
  });
});
