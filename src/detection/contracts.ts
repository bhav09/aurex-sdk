import { CanonicalEvent } from "../ingestion/contracts";

export interface Finding {
  id: string;
  detectorId: string;
  severity: "low" | "medium" | "high";
  costImpactUsd?: number;
  confidence: number;
  affectedEventIds?: string[];
  evidence?: any;
  suggestedFix?: string;
  message: string;
}

export interface MaterializedStats {
  totalCost: number;
  totalTokens: number;
  totalEvents: number;
  // Other aggregates can be added here
}

export interface PricingEngine {
  price(event: CanonicalEvent): number;
}

export interface DetectorContext {
  getEvents(): IterableIterator<CanonicalEvent>;
  getAggregates(): MaterializedStats;
  getPricing(): PricingEngine;
}

export interface Detector {
  id: string;
  version: string;
  severityDefault: "low" | "medium" | "high";
  requiresColumns: string[];
  requiresPromptText: boolean;
  detect(ctx: DetectorContext): Finding[];
}
