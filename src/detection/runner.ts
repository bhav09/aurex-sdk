import { CanonicalEvent } from "../ingestion/contracts";
import { Detector, DetectorContext, Finding, MaterializedStats, PricingEngine } from "./contracts";

export class SimpleDetectorContext implements DetectorContext {
  private events: CanonicalEvent[];
  private stats: MaterializedStats;
  private pricing: PricingEngine;

  constructor(events: CanonicalEvent[], stats: MaterializedStats, pricing: PricingEngine) {
    this.events = events;
    this.stats = stats;
    this.pricing = pricing;
  }

  *getEvents(): IterableIterator<CanonicalEvent> {
    for (const event of this.events) {
      yield event;
    }
  }

  getAggregates(): MaterializedStats {
    return this.stats;
  }

  getPricing(): PricingEngine {
    return this.pricing;
  }
}

export function runDetectors(
  detectors: Detector[],
  events: CanonicalEvent[],
  stats: MaterializedStats,
  pricing: PricingEngine
): Finding[] {
  const ctx = new SimpleDetectorContext(events, stats, pricing);
  const allFindings: Finding[] = [];

  for (const detector of detectors) {
    try {
      const findings = detector.detect(ctx);
      allFindings.push(...findings);
    } catch (err) {
      console.error(`Detector ${detector.id} failed:`, err);
    }
  }

  return allFindings;
}
