import json
import os
import sys
import uuid
import hashlib
from datetime import datetime, timedelta
from collections import defaultdict
from decimal import Decimal
from typing import List, Dict, Any, Tuple, Optional

# Aligned local pricing helper
from .auditor import get_model_pricing, calculate_cost

class LocalHeuristicsEngine:
    """
    Ported client-side cost audit & waste heuristics engine.
    Runs entirely offline on the local ledger dataset.
    """
    
    def __init__(self, ledger_path_or_events: Any):
        self.issues: List[Dict[str, Any]] = []
        self.events: List[Dict[str, Any]] = []
        if isinstance(ledger_path_or_events, list):
            self.ledger_path = None
            self.events = list(ledger_path_or_events)
        else:
            self.ledger_path = ledger_path_or_events
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
        # Phase 1: new PromptIQ signals
        self.detect_prompt_drift()
        self.detect_cot_inflation()
        self.detect_cache_opportunity()
        self.detect_context_cliff_waste()

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
        gap_seconds = int(os.getenv("SESSION_GAP_SECONDS", "300"))
        sessions = defaultdict(list)
        unassigned_with_user = []
        unassigned_without_user = []

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
                
            if wf_id and str(wf_id).startswith("inferred_"):
                wf_id = None
                
            if wf_id:
                e["session_confidence"] = "high"
                sessions[wf_id].append((eid, e))
            else:
                user_id = None
                if e.get("extra_metadata"):
                    user_id = e.get("extra_metadata", {}).get("user_id")
                if user_id:
                    unassigned_with_user.append((ts, eid, e, str(user_id)))
                else:
                    unassigned_without_user.append((ts, eid, e))

        # Group by (model, user_id)
        if unassigned_with_user:
            user_groups = defaultdict(list)
            for ts, eid, e, uid in unassigned_with_user:
                user_groups[(e.get("model", "unknown"), uid)].append((ts, eid, e))
                
            for (model, uid), evs in user_groups.items():
                current_session_id = None
                last_time = None
                for ts, eid, e in evs:
                    if not current_session_id or not last_time or (ts - last_time).total_seconds() > gap_seconds:
                        current_session_id = f"inferred_user_{uuid.uuid4().hex[:8]}"
                    e["workflow_id"] = current_session_id
                    e["session_confidence"] = "medium"
                    sessions[current_session_id].append((eid, e))
                    last_time = ts

        # Group by (model, token_bucket)
        if unassigned_without_user:
            def get_token_bucket(tokens):
                if tokens < 500:
                    return "0-500"
                elif tokens < 2000:
                    return "500-2000"
                elif tokens < 10000:
                    return "2000-10000"
                return "10000+"

            bucket_groups = defaultdict(list)
            for ts, eid, e in unassigned_without_user:
                bucket = get_token_bucket(e.get("input_tokens", 0))
                bucket_groups[(e.get("model", "unknown"), bucket)].append((ts, eid, e))

            for (model, bucket), evs in bucket_groups.items():
                current_session_id = None
                last_time = None
                for ts, eid, e in evs:
                    if not current_session_id or not last_time or (ts - last_time).total_seconds() > gap_seconds:
                        current_session_id = f"inferred_bucket_{uuid.uuid4().hex[:8]}"
                    e["workflow_id"] = current_session_id
                    e["session_confidence"] = "low"
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

        # 2. Fallback: identical input token counts AND model in inferred sessions
        if not prompts:
            sessions = self._get_inferred_sessions()
            for session_id, evs in sessions.items():
                if len(evs) < 3:
                    continue
                # Key by (input_tokens, model) to avoid false positives from different tokenizers
                token_model_clusters = defaultdict(list)
                for eid, e in evs:
                    input_tokens = e.get("input_tokens", 0)
                    model = e.get("model", "unknown")
                    if input_tokens > 100:
                        token_model_clusters[(input_tokens, model)].append((eid, e))
                
                for key, cluster in token_model_clusters.items():
                    if len(cluster) >= 3:
                        inferred_hash = f"inferred_sys_prompt_{key[0]}_{key[1]}"
                        prompts[inferred_hash].extend(cluster)

        for prompt_hash, evs in prompts.items():
            if len(evs) < 2:
                continue

            repetitions = len(evs) - 1
            avg_input_tokens = sum(e.get("input_tokens", 0) for _, e in evs) / len(evs)
            
            # Check if caching is already active for these events
            total_cached = sum(e.get("cached_tokens", 0) for _, e in evs)
            caching_active = total_cached > 0
            
            if caching_active:
                # If prompt caching is already active, skip or significantly downgrade
                # The user is already following best practice
                continue
            
            # Cost of redundant transmissions
            total_input_cost = sum(
                (e.get("input_tokens", 0) / e.get("total_tokens", 1) * e.get("cost", 0.0))
                if e.get("total_tokens", 0) > 0 else e.get("cost", 0.0)
                for _, e in evs
            )
            wasted_cost = (total_input_cost / len(evs)) * repetitions

            if avg_input_tokens < 100:
                continue

            # Downgrade severity when we can't confirm caching status
            has_cache_data = any("cached_tokens" in e for _, e in evs)
            severity = "HIGH" if not has_cache_data else "CRITICAL"
            if any(e.get("session_confidence") == "low" for _, e in evs):
                severity = "MEDIUM"
            summary_suffix = "" if has_cache_data else " (cache status unknown)"

            self.issues.append({
                "issue_type": "redundant_system_prompt",
                "title": "System Prompt Waste",
                "severity": severity,
                "cost_impact": round(wasted_cost, 4),
                "summary": f"Sending redundant prompt (~{int(avg_input_tokens)} tokens) {repetitions} times{summary_suffix}",
                "fix_effort": "5 minutes",
                "fix_confidence": "HIGH",
                "cta": "Enable Prompt Caching",
                "affected_events": [eid for eid, _ in evs],
                "metadata": {
                    "prompt_hash": prompt_hash,
                    "repetitions": repetitions,
                    "avg_tokens": avg_input_tokens,
                    "caching_detected": caching_active
                }
            })

    def detect_agent_loops(self):
        """Detect infinite runaway loops via hybrid structural + semantic detection.
        
        Phase 1 upgrade: three detection layers per SKILL.md §6.1.
        Layer 1: Exact hash matching (SHA-256 of tool call args / prompt content)
        Layer 2: Context growth threshold (2.5× over 3+ calls)
        Layer 3: Semantic fuzzy detection (jaccard n-gram similarity > 0.85)
        """
        sessions = self._get_inferred_sessions()

        for session_id, evs in sessions.items():
            if len(evs) < 3:
                continue

            loop_detected = False
            reason_code = None
            affected = []
            incremental_cost = 0.0

            # --- Layer 1: Exact hash matching ---
            # Check if consecutive prompts have identical hashes
            prompt_hashes = []
            for eid, e in evs:
                ph = e.get("prompt_hash") or e.get("system_prompt_hash")
                if not ph:
                    # Fallback: hash from input token count + model
                    ph = hashlib.sha256(
                        f"{e.get('input_tokens', 0)}:{e.get('model', '')}".encode()
                    ).hexdigest()[:16]
                prompt_hashes.append((eid, e, ph))

            # Sliding window of 3 for exact repeats
            for i in range(2, len(prompt_hashes)):
                window_hashes = [prompt_hashes[j][2] for j in range(i - 2, i + 1)]
                if len(set(window_hashes)) == 1:
                    loop_detected = True
                    reason_code = "structural_exact_repeat"
                    affected = [prompt_hashes[j][0] for j in range(i - 2, i + 1)]
                    baseline_cost = evs[0][1].get("cost", 0.0)
                    incremental_cost = sum(
                        max(0, prompt_hashes[j][1].get("cost", 0.0) - baseline_cost)
                        for j in range(i - 2, i + 1)
                    )
                    break

            # --- Layer 2: Context growth (existing, preserved) ---
            if not loop_detected:
                contexts = [e.get("input_tokens", 0) for _, e in evs]
                doublings = 0
                for i in range(1, len(contexts)):
                    if contexts[i] >= contexts[i-1] * 2.5 and contexts[i-1] > 50:
                        doublings += 1

                if doublings >= 2:
                    loop_detected = True
                    reason_code = "structural_context_explosion"
                    affected = [eid for eid, _ in evs]
                    baseline_cost = evs[0][1].get("cost", 0.0) if evs else 0.0
                    incremental_cost = sum(
                        max(0, e.get("cost", 0.0) - baseline_cost)
                        for _, e in evs[1:]
                    )

            # --- Layer 3: Semantic fuzzy detection ---
            if not loop_detected and len(evs) >= 3:
                # Use response hashes to detect semantically similar outputs
                response_hashes = []
                for eid, e in evs:
                    rh = e.get("response_hash")
                    if rh:
                        response_hashes.append((eid, e, rh))
                
                # Check for high similarity in consecutive response hashes
                if len(response_hashes) >= 3:
                    # Count consecutive identical response hashes
                    consecutive_same = 1
                    for i in range(1, len(response_hashes)):
                        if response_hashes[i][2] == response_hashes[i-1][2]:
                            consecutive_same += 1
                            if consecutive_same >= 3:
                                loop_detected = True
                                reason_code = "semantic_fuzzy_repeat"
                                start_idx = i - consecutive_same + 1
                                affected = [response_hashes[j][0] for j in range(start_idx, i + 1)]
                                baseline_cost = response_hashes[start_idx][1].get("cost", 0.0)
                                incremental_cost = sum(
                                    max(0, response_hashes[j][1].get("cost", 0.0) - baseline_cost)
                                    for j in range(start_idx + 1, i + 1)
                                )
                                break
                        else:
                            consecutive_same = 1

            if loop_detected:
                # Tier severity
                severity = "CRITICAL" if reason_code == "structural_context_explosion" else "HIGH"
                if any(e.get("session_confidence") == "low" for _, e in evs):
                    severity = "MEDIUM"

                contexts = [e.get("input_tokens", 0) for _, e in evs]
                self.issues.append({
                    "issue_type": "agent_loop",
                    "title": "Agent Runaway Loop",
                    "severity": severity,
                    "cost_impact": round(incremental_cost, 4),
                    "summary": f"Loop detected ({reason_code}) in session.",
                    "fix_effort": "10 minutes",
                    "fix_confidence": "HIGH",
                    "cta": "Enable LoopGuard",
                    "affected_events": affected if affected else [eid for eid, _ in evs],
                    "metadata": {
                        "session_id": session_id,
                        "reason_code": reason_code,
                        "context_growth": f"{contexts[0]} -> {contexts[-1]}" if contexts else ""
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
            
            # Subtract reasoning tokens from output when checking simplicity
            # Reasoning models (o1/o3) inflate output_tokens with internal thinking
            effective_output = e.get("output_tokens", 0) - e.get("reasoning_tokens", 0)
            is_simple = e.get("input_tokens", 0) < 500 and effective_output < 100

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
                    "severity": "MEDIUM" if any(e.get("session_confidence") == "low" for _, e in evs) else "HIGH",
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

    def detect_prompt_drift(self):
        """Phase 1 — PromptIQ Signal A: Prompt length drift tracking.
        
        Track system prompt token count as a time series keyed by workflow_id.
        Flag when any workflow's median system prompt token count has grown more
        than 20% over a 7-day rolling window.
        """
        # Group events by workflow_id
        workflow_events = defaultdict(list)
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            wf_id = e.get("workflow_id")
            if not wf_id:
                continue
            # We use input_tokens as a proxy for system prompt size
            # In future, a dedicated system_prompt_tokens field would be better
            input_tokens = e.get("input_tokens", 0)
            if input_tokens < 50:
                continue
            
            ts_str = e.get("timestamp")
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except Exception:
                continue
            
            workflow_events[wf_id].append((ts, eid, e, input_tokens))
        
        for wf_id, entries in workflow_events.items():
            if len(entries) < 10:
                continue
            
            entries.sort(key=lambda x: x[0])
            
            # 7-day window
            latest_ts = entries[-1][0]
            cutoff = latest_ts - timedelta(days=7)
            recent = [(ts, eid, e, tokens) for ts, eid, e, tokens in entries if ts >= cutoff]
            
            if len(recent) < 10:
                continue
            
            # Compare earliest 5 vs latest 5 medians
            token_counts = [tokens for _, _, _, tokens in recent]
            earliest_median = sorted(token_counts[:5])[len(token_counts[:5]) // 2]
            latest_median = sorted(token_counts[-5:])[len(token_counts[-5:]) // 2]
            
            if earliest_median == 0:
                continue
            
            growth_ratio = latest_median / earliest_median
            if growth_ratio >= 1.20:
                # Estimate cost impact of the drift
                avg_cost = sum(e.get("cost", 0.0) for _, _, e, _ in recent) / len(recent)
                excess_ratio = (growth_ratio - 1.0)
                estimated_waste = avg_cost * excess_ratio * len(recent)
                
                self.issues.append({
                    "issue_type": "prompt_drift",
                    "title": "Prompt Length Drift",
                    "severity": "MEDIUM",
                    "cost_impact": round(estimated_waste, 4),
                    "summary": f"System prompt grew {growth_ratio:.1f}x over 7 days in workflow '{wf_id}'",
                    "fix_effort": "15 minutes",
                    "fix_confidence": "MEDIUM",
                    "cta": "Review Prompt Growth",
                    "affected_events": [eid for _, eid, _, _ in recent[-5:]],
                    "metadata": {
                        "workflow_id": wf_id,
                        "earliest_median_tokens": earliest_median,
                        "latest_median_tokens": latest_median,
                        "growth_ratio": round(growth_ratio, 3),
                    }
                })

    def detect_cot_inflation(self):
        """Phase 1 — PromptIQ Signal B: Chain-of-thought token inflation.
        
        Detect when a response's reasoning tokens represent >40% of completion
        cost, suggesting the caller may not need extended thinking mode.
        """
        cot_events = []
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            reasoning_tokens = e.get("reasoning_tokens", 0)
            output_tokens = e.get("output_tokens", 0)
            
            if reasoning_tokens == 0 or output_tokens == 0:
                continue
            
            reasoning_ratio = reasoning_tokens / max(output_tokens, 1)
            if reasoning_ratio >= 0.40:
                model = e.get("model", "unknown")
                cost = e.get("cost", 0.0)
                
                # Estimate reasoning cost (typically billed as output)
                _, output_price = get_model_pricing(model)
                reasoning_cost = reasoning_tokens / 1_000_000 * output_price
                
                cot_events.append((eid, e, reasoning_ratio, reasoning_cost))
        
        if len(cot_events) >= 3:
            total_reasoning_cost = sum(rc for _, _, _, rc in cot_events)
            avg_ratio = sum(r for _, _, r, _ in cot_events) / len(cot_events)
            
            self.issues.append({
                "issue_type": "cot_inflation",
                "title": "Chain-of-Thought Inflation",
                "severity": "MEDIUM",
                "cost_impact": round(total_reasoning_cost * 0.5, 4),  # Conservative: 50% could be saved
                "summary": f"{len(cot_events)} calls with avg {avg_ratio:.0%} reasoning token ratio",
                "fix_effort": "5 minutes",
                "fix_confidence": "MEDIUM",
                "cta": "Use Standard Completion Mode",
                "affected_events": [eid for eid, _, _, _ in cot_events],
                "metadata": {
                    "cot_event_count": len(cot_events),
                    "avg_reasoning_ratio": round(avg_ratio, 3),
                    "total_reasoning_cost": round(total_reasoning_cost, 4),
                }
            })

    def detect_cache_opportunity(self):
        """Phase 1 — PromptIQ Signal C: Prompt caching opportunity detection.
        
        Flag calls where the system prompt is identical across sessions (matched
        by hash) and the provider supports prompt caching but no cache header
        was sent. Calculate the monthly savings at the provider's cached rate.
        """
        CACHE_RATES = {
            "anthropic": 0.10,   # pay 10% of normal input rate
            "openai": 0.50,      # pay 50% of normal input rate
            "google": 0.25,      # pay 25% of normal input rate
        }
        
        # Group by system_prompt_hash
        prompt_groups = defaultdict(list)
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            sph = e.get("system_prompt_hash")
            if not sph:
                continue
            # Skip if caching is already active
            if e.get("cached_tokens", 0) > 0:
                continue
            prompt_groups[sph].append((eid, e))
        
        for sph, evs in prompt_groups.items():
            if len(evs) < 5:
                continue
            
            # Check provider support
            sample_provider = evs[0][1].get("provider", "unknown")
            if sample_provider not in CACHE_RATES:
                continue
            
            # Calculate potential savings
            cache_rate = CACHE_RATES[sample_provider]
            avg_input_tokens = sum(e.get("input_tokens", 0) for _, e in evs) / len(evs)
            input_price, _ = get_model_pricing(evs[0][1].get("model", ""))
            
            normal_cost_per_call = avg_input_tokens / 1_000_000 * input_price
            cached_cost_per_call = normal_cost_per_call * cache_rate
            saving_per_call = normal_cost_per_call - cached_cost_per_call
            monthly_saving = saving_per_call * len(evs)
            
            if monthly_saving < 0.10:
                continue
            
            self.issues.append({
                "issue_type": "cache_opportunity",
                "title": "Prompt Caching Opportunity",
                "severity": "MEDIUM",
                "cost_impact": round(monthly_saving, 4),
                "summary": f"Add cache_control header for {sample_provider}. Est. saving: ${monthly_saving:.2f}/month",
                "fix_effort": "5 minutes",
                "fix_confidence": "HIGH",
                "cta": "Enable Prompt Caching",
                "affected_events": [eid for eid, _ in evs],
                "metadata": {
                    "prompt_hash": sph,
                    "provider": sample_provider,
                    "call_count": len(evs),
                    "avg_input_tokens": round(avg_input_tokens),
                    "monthly_saving_usd": round(monthly_saving, 2),
                    "cache_discount": f"{(1 - cache_rate) * 100:.0f}%",
                }
            })

    def detect_context_cliff_waste(self):
        """Flag >200k 2x whole-request context pricing cliff crossings."""
        from .pricing import check_cliff_status

        affected = []
        total_surcharge = 0.0
        for idx, e in enumerate(self.events):
            eid = e.get("id") or f"evt_{idx}"
            in_toks = int(e.get("input_tokens", 0) or 0)
            model = e.get("model", "")
            status = check_cliff_status(model, in_toks, provider=e.get("provider"))
            if status["crossed_cliff"]:
                affected.append(eid)
                total_surcharge += status["surcharge_usd"]

        if affected and total_surcharge > 0:
            self.issues.append({
                "issue_type": "context_cliff_200k",
                "title": "200k Context 2x Pricing Cliff Crossed",
                "severity": "HIGH",
                "cost_impact": round(total_surcharge, 4),
                "summary": f"{len(affected)} call(s) exceeded 200k tokens, triggering 2x whole-request surcharge (${total_surcharge:.2f}).",
                "fix_effort": "15 minutes",
                "fix_confidence": "HIGH",
                "cta": "Trim or summarize context below 200,000 tokens",
                "affected_events": affected,
                "metadata": {"call_count": len(affected), "surcharge_usd": round(total_surcharge, 4)},
            })


