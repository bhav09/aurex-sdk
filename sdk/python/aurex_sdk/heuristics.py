import json
import os
import sys
import uuid
from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Any, Tuple, Optional

# Aligned local pricing helper
from .auditor import get_model_pricing, calculate_cost

class LocalHeuristicsEngine:
    """
    Ported client-side cost audit & waste heuristics engine.
    Runs entirely offline on the local ledger dataset.
    """
    
    def __init__(self, ledger_path: str):
        self.ledger_path = ledger_path
        self.events: List[Dict[str, Any]] = []
        self.issues: List[Dict[str, Any]] = []
        self.load_ledger()

    def load_ledger(self):
        """Read all JSONL lines from the local ledger"""
        if not os.path.exists(self.ledger_path):
            return
        
        try:
            with open(self.ledger_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        self.events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            print(f"[Aurex SDK Heuristics Error] Failed to read ledger: {e}", file=sys.stderr)

    def analyze(self) -> Dict[str, Any]:
        """Perform cost optimization audit on loaded events"""
        if not self.events:
            return {
                "total_events": 0,
                "total_cost": 0.0,
                "wasted_cost": 0.0,
                "credit_score": 100,
                "issues": [],
                "waste_percentage": 0.0
            }

        total_cost = sum(e.get("cost", 0.0) for e in self.events)

        # Run local heuristics
        self.issues = []
        self.detect_system_prompt_waste()
        self.detect_agent_loops()
        self.detect_expensive_model_misuse()
        self.detect_context_explosion()

        # Prevent double-counting: assign waste proportionally per event, capped at actual event cost
        event_waste_map = defaultdict(float)
        for issue in self.issues:
            affected_ids = issue.get("affected_events", [])
            if affected_ids:
                per_event_waste = issue.get("cost_impact", 0.0) / len(affected_ids)
                for eid in affected_ids:
                    event_waste_map[eid] += per_event_waste

        # Map each event's index/uuid to its cost
        event_costs = {}
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            event_costs[eid] = e.get("cost", 0.0)

        wasted_cost = 0.0
        for eid, total_assigned_waste in event_waste_map.items():
            actual_cost = event_costs.get(eid, 0.0)
            wasted_cost += min(total_assigned_waste, actual_cost)

        waste_percentage = (wasted_cost / total_cost * 100) if total_cost > 0 else 0.0
        credit_score = max(0, min(100, round(100 - waste_percentage)))

        return {
            "total_events": len(self.events),
            "total_cost": round(total_cost, 4),
            "wasted_cost": round(wasted_cost, 4),
            "waste_percentage": round(waste_percentage, 1),
            "credit_score": int(credit_score),
            "issues": sorted(self.issues, key=lambda x: x.get("cost_impact", 0.0), reverse=True)
        }

    def _get_inferred_sessions(self) -> Dict[str, List[Tuple[str, Dict[str, Any]]]]:
        """Group ledger events into workflow sessions using timestamps (5-min fallback)"""
        sessions = defaultdict(list)
        unassigned = []

        # Parse and sort events
        parsed_events = []
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            ts_str = e.get("timestamp")
            try:
                # support standard ISO timestamp parsing
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except Exception:
                ts = datetime.min
            parsed_events.append((ts, eid, e))

        parsed_events.sort(key=lambda x: x[0])

        for ts, eid, e in parsed_events:
            wf_id = e.get("workflow_id")
            if not wf_id and e.get("extra_metadata"):
                wf_id = e.get("extra_metadata", {}).get("session_id")
                
            if wf_id:
                sessions[wf_id].append((eid, e))
            else:
                unassigned.append((ts, eid, e))

        # Perform temporal clustering (5-minute inactivity threshold)
        if unassigned:
            # Group by model type to represent independent pipelines
            model_groups = defaultdict(list)
            for ts, eid, e in unassigned:
                model_groups[e.get("model")].append((ts, eid, e))

            for model, evs in model_groups.items():
                current_session_id = None
                last_time = None

                for ts, eid, e in evs:
                    if not current_session_id or not last_time or (ts - last_time).total_seconds() > 300:
                        current_session_id = f"inferred_session_{uuid.uuid4().hex[:8]}"
                    
                    e["workflow_id"] = current_session_id
                    sessions[current_session_id].append((eid, e))
                    last_time = ts

        return sessions

    def detect_system_prompt_waste(self):
        """Find redundant system prompts locally using cryptographic prompt hashes"""
        # 1. Group by SHA-256 system_prompt_hash
        prompts = defaultdict(list)
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            phash = e.get("system_prompt_hash")
            if phash:
                prompts[phash].append((eid, e))

        # 2. Fallback: identical input token counts in inferred sessions
        if not prompts:
            sessions = self._get_inferred_sessions()
            for session_id, evs in sessions.items():
                if len(evs) < 3:
                    continue
                token_clusters = defaultdict(list)
                for eid, e in evs:
                    input_tokens = e.get("input_tokens", 0)
                    if input_tokens > 100:
                        token_clusters[input_tokens].append((eid, e))
                
                for tokens, cluster in token_clusters.items():
                    if len(cluster) >= 3:
                        inferred_hash = f"inferred_sys_prompt_{tokens}"
                        prompts[inferred_hash].extend(cluster)

        for prompt_hash, evs in prompts.items():
            if len(evs) < 2:
                continue

            repetitions = len(evs) - 1
            avg_input_tokens = sum(e.get("input_tokens", 0) for _, e in evs) / len(evs)
            
            # Cost of redundant transmissions
            total_input_cost = sum(
                (e.get("input_tokens", 0) / e.get("total_tokens", 1) * e.get("cost", 0.0))
                if e.get("total_tokens", 0) > 0 else e.get("cost", 0.0)
                for _, e in evs
            )
            wasted_cost = (total_input_cost / len(evs)) * repetitions

            if avg_input_tokens < 100:
                continue

            self.issues.append({
                "issue_type": "redundant_system_prompt",
                "title": "System Prompt Waste",
                "severity": "CRITICAL",
                "cost_impact": round(wasted_cost, 4),
                "summary": f"Sending redundant prompt (~{int(avg_input_tokens)} tokens) {repetitions} times",
                "fix_effort": "5 minutes",
                "fix_confidence": "HIGH",
                "cta": "Enable Prompt Caching",
                "affected_events": [eid for eid, _ in evs],
                "metadata": {
                    "prompt_hash": prompt_hash,
                    "repetitions": repetitions,
                    "avg_tokens": avg_input_tokens
                }
            })

    def detect_agent_loops(self):
        """Detect infinite runaway loops via exponential context expansion"""
        sessions = self._get_inferred_sessions()

        for session_id, evs in sessions.items():
            if len(evs) < 3:
                continue

            # Check context lengths (input tokens)
            contexts = [e.get("input_tokens", 0) for _, e in evs]
            if len(contexts) < 3:
                continue

            doublings = 0
            for i in range(1, len(contexts)):
                if contexts[i] >= contexts[i-1] * 1.8 and contexts[i-1] > 50:
                    doublings += 1

            if doublings >= 2:
                loop_cost = sum(e.get("cost", 0.0) for _, e in evs)
                self.issues.append({
                    "issue_type": "agent_loop",
                    "title": "Agent Runaway Loop",
                    "severity": "CRITICAL",
                    "cost_impact": round(loop_cost, 4),
                    "summary": f"Prompt context doubled {doublings} times in consecutive requests.",
                    "fix_effort": "10 minutes",
                    "fix_confidence": "HIGH",
                    "cta": "Add Context Pruning",
                    "affected_events": [eid for eid, _ in evs],
                    "metadata": {
                        "session_id": session_id,
                        "doublings": doublings,
                        "context_growth": f"{contexts[0]} -> {contexts[-1]}"
                    }
                })

    def detect_expensive_model_misuse(self):
        """Identify over-provisioned models where a cheap model suffices for simple requests"""
        workflow_model_events = defaultdict(lambda: defaultdict(list))

        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            model = e.get("model", "")
            
            input_price, _ = get_model_pricing(model)
            is_expensive = input_price > 2.00 # > $2.00 per 1M tokens
            is_simple = e.get("input_tokens", 0) < 500 and e.get("output_tokens", 0) < 100

            if is_expensive and is_simple:
                wf_id = e.get("workflow_id") or "default_workflow"
                workflow_model_events[wf_id][model].append((eid, e))

        for wf_id, model_events in workflow_model_events.items():
            for model, evs in model_events.items():
                if len(evs) < 3:
                    continue

                current_cost = sum(e.get("cost", 0.0) for _, e in evs)
                wasted_cost = current_cost * 0.90 # Conservative 90% savings target

                avg_in = sum(e.get("input_tokens", 0) for _, e in evs) / len(evs)
                avg_out = sum(e.get("output_tokens", 0) for _, e in evs) / len(evs)
                recommended = "gpt-4o-mini" if "gpt" in model.lower() or "o1" in model.lower() else "claude-3-5-haiku"

                self.issues.append({
                    "issue_type": "over_provisioned_model",
                    "title": "Over-Provisioned Model",
                    "severity": "HIGH",
                    "cost_impact": round(wasted_cost, 4),
                    "summary": f"Using {model} for simple tasks (avg {int(avg_in)} in / {int(avg_out)} out)",
                    "fix_effort": "2 minutes",
                    "fix_confidence": "HIGH",
                    "cta": f"Switch to {recommended}",
                    "affected_events": [eid for eid, _ in evs],
                    "metadata": {
                        "current_model": model,
                        "recommended_model": recommended,
                        "request_count": len(evs),
                        "avg_input": avg_in,
                        "avg_output": avg_out
                    }
                })

    def detect_context_explosion(self):
        """Identify gradual context explosions within individual workflows"""
        sessions = self._get_inferred_sessions()

        for wf_id, evs in sessions.items():
            if len(evs) < 2:
                continue

            contexts = [e.get("input_tokens", 0) for _, e in evs]
            min_context = min(contexts)
            max_context = max(contexts)

            if min_context > 0 and max_context >= min_context * 2:
                # Find events that are >= 1.5x the start context size
                large_events = [(eid, e) for eid, e in evs if e.get("input_tokens", 0) >= min_context * 1.5]
                wasted_cost = sum(e.get("cost", 0.0) for _, e in large_events) * 0.50

                self.issues.append({
                    "issue_type": "context_explosion",
                    "title": "Context Explosion",
                    "severity": "HIGH",
                    "cost_impact": round(wasted_cost, 4),
                    "summary": f"Context length grew {max_context / min_context:.1f}x from baseline",
                    "fix_effort": "15 minutes",
                    "fix_confidence": "MEDIUM",
                    "cta": "Implement Sliding Window",
                    "affected_events": [eid for eid, _ in large_events],
                    "metadata": {
                        "min_context": min_context,
                        "max_context": max_context,
                        "growth_ratio": round(max_context / min_context, 2)
                    }
                })
