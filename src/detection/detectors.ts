import { CanonicalEvent } from "../ingestion/contracts";
import { Detector, DetectorContext, Finding } from "./contracts";

export class ToolBloatDetector implements Detector {
  id = "tool-bloat";
  version = "1.0.0";
  severityDefault: "medium" = "medium";
  requiresColumns = ["tools_available_count", "tool_invocations", "tool_definitions_tokens"];
  requiresPromptText = false;

  detect(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    let wastedTokens = 0;
    
    for (const event of ctx.getEvents()) {
      const availCount = event.tools_available_count || 0;
      if (availCount > 10) {
        // If they provide many tools but use few, flag it
        const usedCount = this.getUsedToolsCount(event.tool_invocations);
        if (usedCount < 3) {
          wastedTokens += event.tool_definitions_tokens || (availCount * 50); 
        }
      }
    }
    
    if (wastedTokens > 10000) {
      findings.push({
        id: "tb-1",
        detectorId: this.id,
        severity: this.severityDefault,
        confidence: 0.8,
        message: `High tool bloat detected. You are passing many tools but using few. Approx ${wastedTokens} tokens wasted.`,
      });
    }
    return findings;
  }

  private getUsedToolsCount(invocations: string | object | undefined): number {
    if (!invocations) return 0;
    if (typeof invocations === 'string') {
      try {
        const parsed = JSON.parse(invocations);
        return Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      } catch {
        return 1;
      }
    }
    return Array.isArray(invocations) ? invocations.length : Object.keys(invocations).length;
  }
}

export class RetryCascadeDetector implements Detector {
  id = "retry-cascades";
  version = "1.0.0";
  severityDefault: "high" = "high";
  requiresColumns = ["http_status"];
  requiresPromptText = false;

  detect(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    const events = Array.from(ctx.getEvents());
    
    // Sort by timestamp
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    let cascadeCount = 0;
    
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      
      const timeDelta = curr.timestamp.getTime() - prev.timestamp.getTime();
      if (timeDelta < 5000 && curr.model === prev.model && curr.input_tokens === prev.input_tokens) {
        if (prev.http_status && prev.http_status >= 500) {
          cascadeCount++;
        }
      }
    }
    
    if (cascadeCount > 5) {
      findings.push({
        id: "rc-1",
        detectorId: this.id,
        severity: this.severityDefault,
        confidence: 0.9,
        message: `Detected ${cascadeCount} likely retry cascades due to server errors. Check SDK retry settings.`,
      });
    }
    
    return findings;
  }
}

export class OutputVerbosityDetector implements Detector {
  id = "output-verbosity";
  version = "1.0.0";
  severityDefault: "low" = "low";
  requiresColumns = ["output_tokens"];
  requiresPromptText = true;

  detect(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    let chattyCount = 0;

    for (const event of ctx.getEvents()) {
      if (event.response && event.output_tokens > 50) {
        const text = event.response.toLowerCase();
        if (text.includes("certainly! here's") || text.includes("let me know if you need anything else")) {
          chattyCount++;
        }
      }
    }

    if (chattyCount > 20) {
      findings.push({
        id: "ov-1",
        detectorId: this.id,
        severity: this.severityDefault,
        confidence: 0.85,
        message: `Detected conversational filler ("Certainly!", etc) in ${chattyCount} responses. Output tokens cost 2-3x input.`,
        suggestedFix: "Add 'Do not output conversational filler. Output only the requested data.' to your system prompt.",
      });
    }
    
    return findings;
  }
}

export const builtInDetectors = [
  new ToolBloatDetector(),
  new RetryCascadeDetector(),
  new OutputVerbosityDetector(),
];
