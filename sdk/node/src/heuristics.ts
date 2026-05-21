import fs from "fs";
import { getModelPricing, calculateCost } from "./index.js";

export interface LocalIssue {
  issue_type: string;
  title: string;
  severity: string;
  cost_impact: number;
  summary: string;
  fix_effort: string;
  fix_confidence: string;
  cta: string;
  affected_events: string[];
  metadata: Record<string, any>;
}

export interface LocalAuditReport {
  total_events: number;
  total_cost: number;
  wasted_cost: number;
  waste_percentage: number;
  credit_score: number;
  issues: LocalIssue[];
}

export class LocalHeuristicsEngine {
  private ledgerPath: string;
  private events: any[] = [];
  private issues: LocalIssue[] = [];

  constructor(ledgerPath: string) {
    this.ledgerPath = ledgerPath;
    this.loadLedger();
  }

  private loadLedger() {
    if (!fs.existsSync(this.ledgerPath)) return;

    try {
      const content = fs.readFileSync(this.ledgerPath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          this.events.push(JSON.parse(trimmed));
        } catch (e) {
          // Ignore parse errors
        }
      }
    } catch (err) {
      console.error(`[Aurex SDK Heuristics Error] Failed to read ledger:`, err);
    }
  }

  public analyze(): LocalAuditReport {
    if (this.events.length === 0) {
      return {
        total_events: 0,
        total_cost: 0.0,
        wasted_cost: 0.0,
        waste_percentage: 0.0,
        credit_score: 100,
        issues: [],
      };
    }

    const totalCost = this.events.reduce((sum, e) => sum + (e.cost || 0.0), 0.0);

    this.issues = [];
    this.detectSystemPromptWaste();
    this.detectAgentLoops();
    this.detectExpensiveModelMisuse();
    this.detectContextExplosion();

    // Deduplicate waste to avoid double-counting
    const eventWasteMap = new Map<string, number>();
    for (const issue of this.issues) {
      const affected = issue.affected_events;
      if (affected && affected.length > 0) {
        const perEventWaste = issue.cost_impact / affected.length;
        for (const eid of affected) {
          eventWasteMap.set(eid, (eventWasteMap.get(eid) || 0) + perEventWaste);
        }
      }
    }

    let wastedCost = 0.0;
    this.events.forEach((e, idx) => {
      const eid = e.id || `evt_${idx}`;
      const actualCost = e.cost || 0.0;
      const assignedWaste = eventWasteMap.get(eid) || 0.0;
      wastedCost += Math.min(assignedWaste, actualCost);
    });

    const wastePercentage = totalCost > 0 ? (wastedCost / totalCost * 100) : 0.0;
    const creditScore = Math.max(0, Math.min(100, Math.round(100 - wastePercentage)));

    return {
      total_events: this.events.length,
      total_cost: Number(totalCost.toFixed(4)),
      wasted_cost: Number(wastedCost.toFixed(4)),
      waste_percentage: Number(wastePercentage.toFixed(1)),
      credit_score: creditScore,
      issues: this.issues.sort((a, b) => b.cost_impact - a.cost_impact),
    };
  }

  private getInferredSessions(): Map<string, Array<{ id: string; event: any }>> {
    const sessions = new Map<string, Array<{ id: string; event: any }>>();
    const unassigned: Array<{ ts: number; id: string; event: any }> = [];

    const sortedEvents = this.events
      .map((e, idx) => {
        const id = e.id || `evt_${idx}`;
        const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0;
        return { ts, id, event: e };
      })
      .sort((a, b) => a.ts - b.ts);

    for (const wrapper of sortedEvents) {
      const e = wrapper.event;
      let wfId = e.workflow_id || e.extra_metadata?.session_id;
      if (wfId) {
        if (!sessions.has(wfId)) sessions.set(wfId, []);
        sessions.get(wfId)!.push({ id: wrapper.id, event: e });
      } else {
        unassigned.push(wrapper);
      }
    }

    if (unassigned.length > 0) {
      // Group by model
      const modelGroups = new Map<string, Array<{ ts: number; id: string; event: any }>>();
      for (const wrapper of unassigned) {
        const m = wrapper.event.model || "unknown";
        if (!modelGroups.has(m)) modelGroups.set(m, []);
        modelGroups.get(m)!.push(wrapper);
      }

      for (const [model, evs] of modelGroups.entries()) {
        let currentSessionId = "";
        let lastTime = 0;

        for (const wrapper of evs) {
          if (!currentSessionId || !lastTime || wrapper.ts - lastTime > 300 * 1000) {
            currentSessionId = `inferred_session_${Math.random().toString(36).substring(2, 10)}`;
          }

          wrapper.event.workflow_id = currentSessionId;
          if (!sessions.has(currentSessionId)) sessions.set(currentSessionId, []);
          sessions.get(currentSessionId)!.push({ id: wrapper.id, event: wrapper.event });
          lastTime = wrapper.ts;
        }
      }
    }

    return sessions;
  }

  private detectSystemPromptWaste() {
    const prompts = new Map<string, Array<{ id: string; event: any }>>();

    // Group by prompt hash
    this.events.forEach((e, idx) => {
      const id = e.id || `evt_${idx}`;
      const hash = e.system_prompt_hash;
      if (hash) {
        if (!prompts.has(hash)) prompts.set(hash, []);
        prompts.get(hash)!.push({ id, event: e });
      }
    });

    // Fallback: identical tokens inside sessions
    if (prompts.size === 0) {
      const sessions = this.getInferredSessions();
      for (const [sid, evs] of sessions.entries()) {
        if (evs.length < 3) continue;
        const tokenClusters = new Map<number, Array<{ id: string; event: any }>>();
        for (const item of evs) {
          const t = item.event.input_tokens || 0;
          if (t > 100) {
            if (!tokenClusters.has(t)) tokenClusters.set(t, []);
            tokenClusters.get(t)!.push(item);
          }
        }

        for (const [tokens, cluster] of tokenClusters.entries()) {
          if (cluster.length >= 3) {
            const key = `inferred_sys_prompt_${tokens}`;
            if (!prompts.has(key)) prompts.set(key, []);
            prompts.get(key)!.push(...cluster);
          }
        }
      }
    }

    for (const [hash, evs] of prompts.entries()) {
      if (evs.length < 2) continue;

      const repetitions = evs.length - 1;
      const totalInTokens = evs.reduce((sum, item) => sum + (item.event.input_tokens || 0), 0);
      const avgInputTokens = totalInTokens / evs.length;

      if (avgInputTokens < 100) continue;

      // Estimate waste
      const totalInputCost = evs.reduce((sum, item) => {
        const e = item.event;
        const tot = e.total_tokens || 1;
        const ratio = (e.input_tokens || 0) / tot;
        return sum + (ratio * (e.cost || 0.0));
      }, 0.0);

      const wastedCost = (totalInputCost / evs.length) * repetitions;

      this.issues.push({
        issue_type: "redundant_system_prompt",
        title: "System Prompt Waste",
        severity: "CRITICAL",
        cost_impact: Number(wastedCost.toFixed(4)),
        summary: `Sending redundant prompt (~${Math.round(avgInputTokens)} tokens) ${repetitions} times`,
        fix_effort: "5 minutes",
        fix_confidence: "HIGH",
        cta: "Enable Prompt Caching",
        affected_events: evs.map(item => item.id),
        metadata: {
          prompt_hash: hash,
          repetitions,
          avg_tokens: avgInputTokens,
        },
      });
    }
  }

  private detectAgentLoops() {
    const sessions = this.getInferredSessions();

    for (const [sid, evs] of sessions.entries()) {
      if (evs.length < 3) continue;

      const contexts = evs.map(item => item.event.input_tokens || 0);
      let doublings = 0;
      for (let i = 1; i < contexts.length; i++) {
        if (contexts[i] >= contexts[i - 1] * 1.8 && contexts[i - 1] > 50) {
          doublings++;
        }
      }

      if (doublings >= 2) {
        const loopCost = evs.reduce((sum, item) => sum + (item.event.cost || 0.0), 0.0);
        this.issues.push({
          issue_type: "agent_loop",
          title: "Agent Runaway Loop",
          severity: "CRITICAL",
          cost_impact: Number(loopCost.toFixed(4)),
          summary: `Prompt context doubled ${doublings} times in consecutive requests.`,
          fix_effort: "10 minutes",
          fix_confidence: "HIGH",
          cta: "Add Context Pruning",
          affected_events: evs.map(item => item.id),
          metadata: {
            session_id: sid,
            doublings,
            context_growth: `${contexts[0]} -> ${contexts[contexts.length - 1]}`,
          },
        });
      }
    }
  }

  private detectExpensiveModelMisuse() {
    const workflowModelEvents = new Map<string, Map<string, Array<{ id: string; event: any }>>>();

    this.events.forEach((e, idx) => {
      const id = e.id || `evt_${idx}`;
      const model = e.model || "";
      const [inputPrice] = getModelPricing(model);
      const isExpensive = inputPrice > 2.00;
      const isSimple = (e.input_tokens || 0) < 500 && (e.output_tokens || 0) < 100;

      if (isExpensive && isSimple) {
        const wfId = e.workflow_id || "default_workflow";
        if (!workflowModelEvents.has(wfId)) {
          workflowModelEvents.set(wfId, new Map());
        }
        const modelMap = workflowModelEvents.get(wfId)!;
        if (!modelMap.has(model)) {
          modelMap.set(model, []);
        }
        modelMap.get(model)!.push({ id, event: e });
      }
    });

    for (const [wfId, modelMap] of workflowModelEvents.entries()) {
      for (const [model, evs] of modelMap.entries()) {
        if (evs.length < 3) continue;

        const currentCost = evs.reduce((sum, item) => sum + (item.event.cost || 0.0), 0.0);
        const wastedCost = currentCost * 0.90; // target 90% savings

        const totalIn = evs.reduce((sum, item) => sum + (item.event.input_tokens || 0), 0);
        const totalOut = evs.reduce((sum, item) => sum + (item.event.output_tokens || 0), 0);
        const avgIn = totalIn / evs.length;
        const avgOut = totalOut / evs.length;

        const recommended = model.toLowerCase().includes("gpt") || model.toLowerCase().includes("o1") ? "gpt-4o-mini" : "claude-3-5-haiku";

        this.issues.push({
          issue_type: "over_provisioned_model",
          title: "Over-Provisioned Model",
          severity: "HIGH",
          cost_impact: Number(wastedCost.toFixed(4)),
          summary: `Using ${model} for simple tasks (avg ${Math.round(avgIn)} in / ${Math.round(avgOut)} out)`,
          fix_effort: "2 minutes",
          fix_confidence: "HIGH",
          cta: `Switch to ${recommended}`,
          affected_events: evs.map(item => item.id),
          metadata: {
            current_model: model,
            recommended_model: recommended,
            request_count: evs.length,
            avg_input: avgIn,
            avg_output: avgOut,
          },
        });
      }
    }
  }

  private detectContextExplosion() {
    const sessions = this.getInferredSessions();

    for (const [sid, evs] of sessions.entries()) {
      if (evs.length < 2) continue;

      const contexts = evs.map(item => item.event.input_tokens || 0);
      const minContext = Math.min(...contexts);
      const maxContext = Math.max(...contexts);

      if (minContext > 0 && maxContext >= minContext * 2) {
        const largeEvents = evs.filter(item => (item.event.input_tokens || 0) >= minContext * 1.5);
        const wastedCost = largeEvents.reduce((sum, item) => sum + (item.event.cost || 0.0), 0.0) * 0.50;

        this.issues.push({
          issue_type: "context_explosion",
          title: "Context Explosion",
          severity: "HIGH",
          cost_impact: Number(wastedCost.toFixed(4)),
          summary: `Context length grew ${(maxContext / minContext).toFixed(1)}x from baseline`,
          fix_effort: "15 minutes",
          fix_confidence: "MEDIUM",
          cta: "Implement Sliding Window",
          affected_events: largeEvents.map(item => item.id),
          metadata: {
            min_context: minContext,
            max_context: maxContext,
            growth_ratio: Number((maxContext / minContext).toFixed(2)),
          },
        });
      }
    }
  }
}
