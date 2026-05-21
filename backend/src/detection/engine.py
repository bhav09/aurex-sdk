"""
Enhanced Detection Engine with Executive-Level Insights (Async)
Implements production-grade detection with workflow-level analysis
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy import func, desc

from src.models import LLMEvent
from src.utils.logger import get_logger

logger = get_logger(__name__)


class ExecutiveSummary:
    """Executive-level summary for C-suite presentation"""
    
    def __init__(
        self,
        current_spend: float,
        wasted_amount: float,
        optimized_spend: float,
        period_days: int = 7
    ):
        self.current_period_spend = current_spend
        self.wasted_amount = wasted_amount
        self.waste_percentage = (wasted_amount / current_spend * 100) if current_spend > 0 else 0
        self.optimized_spend = optimized_spend
        self.period_days = max(period_days, 1)  # Guard against zero
        
        # Compute annual projection from ACTUAL date span
        daily_waste = wasted_amount / self.period_days
        self.annual_savings_projection = daily_waste * 365
        self.credit_score = max(0, min(100, round(100.0 - self.waste_percentage)))
        
        # Determine severity
        if self.waste_percentage > 50:
            self.severity = "CRITICAL"
        elif self.waste_percentage > 30:
            self.severity = "HIGH"
        elif self.waste_percentage > 15:
            self.severity = "MEDIUM"
        else:
            self.severity = "LOW"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "current_period_spend": round(self.current_period_spend, 2),
            "wasted_amount": round(self.wasted_amount, 2),
            "waste_percentage": round(self.waste_percentage, 1),
            "optimized_spend": round(self.optimized_spend, 2),
            "annual_savings_projection": round(self.annual_savings_projection, 2),
            "period_days": self.period_days,
            "severity": self.severity,
            "credit_score": self.credit_score
        }


class WorkflowAnalysis:
    """Per-workflow cost analysis"""
    
    def __init__(self, workflow_id: str, events: List[LLMEvent]):
        self.workflow_id = workflow_id
        self.request_count = len(events)
        self.total_cost = sum(e.cost for e in events)
        self.total_tokens = sum(e.total_tokens for e in events)
        self.avg_cost_per_request = self.total_cost / self.request_count if self.request_count > 0 else 0
        self.models_used = list(set(e.model for e in events))
        
        # Time range
        timestamps = [e.timestamp for e in events if e.timestamp]
        self.first_request = min(timestamps) if timestamps else None
        self.last_request = max(timestamps) if timestamps else None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "request_count": self.request_count,
            "total_cost": round(self.total_cost, 2),
            "cost_per_request": round(self.avg_cost_per_request, 4),
            "total_tokens": self.total_tokens,
            "models_used": self.models_used,
            "first_request": self.first_request.isoformat() if self.first_request else None,
            "last_request": self.last_request.isoformat() if self.last_request else None
        }


class EnhancedIssue:
    """Enhanced issue with executive-friendly formatting"""
    
    def __init__(
        self,
        rank: int,
        issue_type: str,
        title: str,
        severity: str,
        weekly_cost: float,
        one_line_summary: str,
        fix_effort: str,
        fix_confidence: str,
        cta: str,
        affected_workflow: Optional[str] = None,
        affected_events: List[str] = None,
        metadata: Dict[str, Any] = None
    ):
        self.rank = rank
        self.issue_type = issue_type
        self.title = title
        self.severity = severity
        self.weekly_cost = weekly_cost
        self.one_line_summary = one_line_summary
        self.fix_effort = fix_effort
        self.fix_confidence = fix_confidence
        self.cta = cta
        self.affected_workflow = affected_workflow
        self.affected_events = affected_events or []
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "rank": self.rank,
            "issue_type": self.issue_type,
            "title": self.title,
            "severity": self.severity,
            "weekly_cost": round(self.weekly_cost, 2),
            "one_line_summary": self.one_line_summary,
            "fix_effort": self.fix_effort,
            "fix_confidence": self.fix_confidence,
            "cta": self.cta,
            "affected_workflow": self.affected_workflow,
            "affected_event_count": len(self.affected_events),
            "affected_events_sample": self.affected_events[:5],
            "metadata": self.metadata
        }


class EnhancedDetectionEngine:
    """Production-grade detection engine with executive insights (Async)"""
    
    def __init__(self, db, session_id: Optional[str] = None, email: Optional[str] = None):
        self.db = db
        self.session_id = session_id
        self.email = email
        self.issues: List[EnhancedIssue] = []
        self.workflow_analyses: Dict[str, WorkflowAnalysis] = {}
        self.events: Optional[List[LLMEvent]] = None
    
    async def load_events(self):
        if self.session_id:
            query = select(LLMEvent).where(LLMEvent.upload_session_id == self.session_id)
        elif self.email:
            from src.models import AuditSession
            sessions_query = select(AuditSession.id).where(func.lower(AuditSession.email) == func.lower(self.email))
            result = await self.db.execute(sessions_query)
            session_ids = [row[0] for row in result.all()]
            if session_ids:
                query = select(LLMEvent).where(LLMEvent.upload_session_id.in_(session_ids))
            else:
                self.events = []
                return
        else:
            query = select(LLMEvent)
            
        result = await self.db.execute(query)
        self.events = result.scalars().all()
    
    async def analyze_complete(self) -> Dict[str, Any]:
        """
        Complete analysis with executive summary
        """
        if self.events is None:
            await self.load_events()
        
        if not self.events:
            return {
                "error": "No events found in database",
                "executive_summary": {
                    "current_weekly_spend": 0.0,
                    "wasted_amount": 0.0,
                    "waste_percentage": 0.0,
                    "optimized_spend": 0.0,
                    "annual_savings_projection": 0.0,
                    "period_days": 7,
                    "severity": "LOW"
                },
                "top_issues": [],
                "workflow_breakdown": [],
                "total_events": 0,
                "analysis_timestamp": datetime.utcnow().isoformat()
            }
        
        total_cost = sum(e.cost for e in self.events)
        
        # Run all detections
        self.detect_system_prompt_waste()
        self.detect_agent_loops_enhanced()
        self.detect_expensive_model_misuse_enhanced()
        self.detect_context_explosion_enhanced()
        
        # Calculate wasted cost transparently (avoid double-counting by capping at event cost)
        event_waste_map = defaultdict(float)
        for issue in self.issues:
            if issue.affected_events:
                per_event_waste = issue.weekly_cost / len(issue.affected_events)
                for event_id in issue.affected_events:
                    event_waste_map[event_id] += per_event_waste
                    
        wasted_cost = 0.0
        event_cost_map = {e.id: e.cost for e in self.events}
        for event_id, total_assigned_waste in event_waste_map.items():
            actual_cost = event_cost_map.get(event_id, 0.0)
            wasted_cost += min(total_assigned_waste, actual_cost)
            
        optimized_cost = total_cost - wasted_cost
        
        # Analyze workflows
        self._analyze_workflows()
        
        # Calculate actual period days dynamically
        timestamps = [e.timestamp for e in self.events if e.timestamp]
        if timestamps:
            import math
            time_delta = max(timestamps) - min(timestamps)
            period_days = max(1, math.ceil(time_delta.total_seconds() / 86400.0))
        else:
            period_days = 7

        # Create executive summary
        exec_summary = ExecutiveSummary(
            current_spend=total_cost,
            wasted_amount=wasted_cost,
            optimized_spend=max(0.0, optimized_cost),
            period_days=period_days
        )
        
        # Sort issues by cost impact
        self.issues.sort(key=lambda x: x.weekly_cost, reverse=True)
        
        # Assign ranks
        for i, issue in enumerate(self.issues, 1):
            issue.rank = i
        
        logger.info(
            "Detection engine complete",
            workflow_count=len(self.workflow_analyses),
            issues_found=len(self.issues),
            wasted_amount=wasted_cost,
            total_cost=total_cost,
            session_id=self.session_id,
            email=self.email
        )
        
        return {
            "executive_summary": exec_summary.to_dict(),
            "credit_score": exec_summary.credit_score,
            "top_issues": [issue.to_dict() for issue in self.issues[:10]],  # Top 10
            "workflow_breakdown": [wa.to_dict() for wa in sorted(
                self.workflow_analyses.values(),
                key=lambda x: x.total_cost,
                reverse=True
            )],
            "total_events": len(self.events),
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
    
    def _analyze_workflows(self):
        """Analyze cost per workflow"""
        workflow_events = defaultdict(list)
        for event in self.events:
            wf_id = event.workflow_id or "unknown"
            workflow_events[wf_id].append(event)
        
        for wf_id, events_list in workflow_events.items():
            self.workflow_analyses[wf_id] = WorkflowAnalysis(wf_id, events_list)
    
    def detect_system_prompt_waste(self):
        """
        CRITICAL: Detect redundant system prompts
        This is often the #1 cost driver
        """
        prompts = defaultdict(list)
        
        # 1. Group by exact prompt hash (if available)
        for event in self.events:
            prompt_hash = event.system_prompt_hash
            if not prompt_hash and event.extra_metadata:
                prompt_hash = event.extra_metadata.get("system_prompt_hash")
                
            if prompt_hash:
                prompts[prompt_hash].append(event)
                
        # 2. Fallback: Group by exact input tokens within an inferred session
        if not prompts:
            sessions = self._get_inferred_sessions()
            for session_id, events_list in sessions.items():
                if len(events_list) < 3:
                    continue
                # Cluster by identical input_tokens
                token_clusters = defaultdict(list)
                for e in events_list:
                    if e.input_tokens > 100: # Only care about decently large redundant prompts
                        token_clusters[e.input_tokens].append(e)
                
                for tokens, evs in token_clusters.items():
                    if len(evs) >= 3:
                        import uuid
                        inferred_hash = f"inferred_prompt_{tokens}_{uuid.uuid4().hex[:8]}"
                        prompts[inferred_hash].extend(evs)
                
        for prompt_hash, events_list in prompts.items():
            if len(events_list) < 2:
                continue
            
            events_list.sort(key=lambda e: e.timestamp or datetime.min)
            repetitions = len(events_list) - 1
            if repetitions <= 0:
                continue
                
            prompt_tokens = 0
            for e in events_list:
                if e.extra_metadata and "prompt_tokens" in e.extra_metadata:
                    prompt_tokens = int(e.extra_metadata["prompt_tokens"])
                    break
            if prompt_tokens == 0:
                prompt_tokens = int(sum(e.input_tokens for e in events_list) / len(events_list))
                
            if prompt_tokens < 100:
                continue
                
            total_wasted_tokens = prompt_tokens * repetitions
            total_input_cost = sum((e.input_tokens / e.total_tokens * e.cost) if e.total_tokens > 0 else e.cost for e in events_list)
            wasted_cost = (total_input_cost / len(events_list)) * repetitions
            
            workflows = set(e.workflow_id for e in events_list if e.workflow_id)
            affected_workflow = list(workflows)[0] if workflows else "unknown"
            
            issue = EnhancedIssue(
                rank=0,
                issue_type="redundant_system_prompt",
                title="System Prompt Waste",
                severity="CRITICAL",
                weekly_cost=wasted_cost,
                one_line_summary=f"Sending {prompt_tokens:,} tokens {repetitions:,} times",
                fix_effort="5 minutes",
                fix_confidence="HIGH",
                cta="Enable Prompt Caching",
                affected_workflow=affected_workflow,
                affected_events=[e.id for e in events_list],
                metadata={
                    "prompt_hash": prompt_hash,
                    "prompt_tokens": prompt_tokens,
                    "repetitions": repetitions,
                    "total_wasted_tokens": total_wasted_tokens,
                    "fix_instructions": "Enable prompt caching in your API calls or move system prompt to a shared context"
                }
            )
            self.issues.append(issue)
    
    def _get_inferred_sessions(self) -> Dict[str, List[LLMEvent]]:
        """
        Groups events into sessions. Uses explicit workflow_id/session_id if available.
        Otherwise, falls back to temporal clustering (5-min window).
        """
        sessions = defaultdict(list)
        unassigned_events = []
        
        for event in sorted(self.events, key=lambda e: e.timestamp or datetime.min):
            session_id = None
            if event.extra_metadata:
                session_id = event.extra_metadata.get("session_id")
            if not session_id:
                session_id = event.workflow_id
            
            if session_id:
                sessions[session_id].append(event)
            else:
                unassigned_events.append(event)
                
        if unassigned_events:
            # Group by model
            model_groups = defaultdict(list)
            for e in unassigned_events:
                model_groups[e.model].append(e)
                
            for model, evs in model_groups.items():
                current_session_id = None
                last_time = None
                
                for e in evs:
                    ts = e.timestamp or datetime.min
                    
                    if not current_session_id or not last_time or (ts - last_time).total_seconds() > 300:
                        import uuid
                        current_session_id = f"inferred_session_{uuid.uuid4().hex[:8]}"
                    
                    e.workflow_id = current_session_id
                    sessions[current_session_id].append(e)
                    last_time = ts
                    
        return sessions

    def detect_agent_loops_enhanced(self):
        """Enhanced agent loop detection with exponential pattern recognition and temporal fallback"""
        sessions = self._get_inferred_sessions()
        
        for session_id, events_list in sessions.items():
            if len(events_list) < 3:
                continue
            
            contexts = [e.context_length for e in events_list if e.context_length is not None]
            if len(contexts) < 3:
                contexts = [e.input_tokens for e in events_list if e.input_tokens > 0]
                
            if len(contexts) < 3:
                continue
            
            doublings = 0
            for i in range(1, len(contexts)):
                if contexts[i] >= contexts[i-1] * 1.8:
                    doublings += 1
            
            if doublings >= 2:
                loop_cost = sum(e.cost for e in events_list)
                
                timestamps = [e.timestamp for e in events_list if e.timestamp]
                if timestamps:
                    duration = (max(timestamps) - min(timestamps)).total_seconds() / 3600
                    time_str = f"{duration:.1f} hours"
                else:
                    time_str = "unknown duration"
                
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="agent_loop",
                    title="Agent Runaway Loop",
                    severity="CRITICAL",
                    weekly_cost=loop_cost,
                    one_line_summary=f"Context doubled {doublings}x in {time_str}",
                    fix_effort="10 minutes",
                    fix_confidence="HIGH",
                    cta="Add Context Pruning",
                    affected_workflow=session_id,
                    affected_events=[e.id for e in events_list],
                    metadata={
                        "context_pattern": f"{contexts[0]} → {contexts[-1]}",
                        "doublings": doublings,
                        "duration": time_str,
                        "session_id": session_id,
                        "fix_instructions": "Add max iteration limit and context summarization"
                    }
                )
                self.issues.append(issue)
    
    def detect_expensive_model_misuse_enhanced(self):
        """
        Dynamic expensive model detection with workflow-specific recommendations
        Detects over-provisioned models: expensive models used for simple tasks
        """
        from src.utils.pricing import get_model_pricing
        
        workflow_model_events = defaultdict(lambda: defaultdict(list))
        
        for event in self.events:
            input_price, output_price = get_model_pricing(event.model)
            
            # Dynamic expensive classification: If input price > $2.00 per 1M tokens
            is_expensive = input_price > 2.00
            
            # Simple task threshold
            is_simple = event.input_tokens < 500 and event.output_tokens < 100
            
            if is_expensive and is_simple:
                wf_id = event.workflow_id or "unknown"
                workflow_model_events[wf_id][event.model].append(event)
        
        for wf_id, model_events in workflow_model_events.items():
            for model, events_list in model_events.items():
                if len(events_list) < 3:
                    continue
                
                current_cost = sum(e.cost for e in events_list)
                
                # Assume a cheap model fallback like gpt-4o-mini or claude-3-haiku
                # e.g., input price drops from $5.00 to $0.15 (~97% savings)
                # Let's conservatively estimate 90% savings for standard generic simple tasks
                savings_multiplier = 0.90
                
                wasted_cost = current_cost * savings_multiplier
                avg_input = sum(e.input_tokens for e in events_list) / len(events_list)
                avg_output = sum(e.output_tokens for e in events_list) / len(events_list)
                
                recommended_model = "gpt-4o-mini" if "gpt" in model.lower() or "o1" in model.lower() else "claude-3-5-haiku"
                
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="over_provisioned_model",
                    title="Over-Provisioned Model",
                    severity="HIGH",
                    weekly_cost=wasted_cost,
                    one_line_summary=f"Using {model} for {len(events_list)} simple tasks (avg {avg_input:.0f} in / {avg_output:.0f} out tokens)",
                    fix_effort="2 minutes",
                    fix_confidence="HIGH",
                    cta=f"Switch to {recommended_model}",
                    affected_workflow=wf_id,
                    affected_events=[e.id for e in events_list],
                    metadata={
                        "current_model": model,
                        "recommended_model": recommended_model,
                        "request_count": len(events_list),
                        "avg_input_tokens": round(avg_input, 0),
                        "avg_output_tokens": round(avg_output, 0),
                        "current_cost": round(current_cost, 2),
                        "potential_cost": round(current_cost - wasted_cost, 2),
                        "savings_percentage": round(savings_multiplier * 100, 0),
                        "fix_instructions": f"Route simple tasks (<500 input, <100 output tokens) to cheaper models like {recommended_model}",
                        "calculation_formula": "wasted_cost = current_cost * 0.90 (estimated savings)"
                    }
                )
                self.issues.append(issue)
    
    def detect_context_explosion_enhanced(self):
        """
        Enhanced context explosion detection using per-turn delta analysis.
        
        The old approach flagged any session where max_context >= 2x min_context,
        which falsely flags normal multi-turn chatbots (context naturally doubles
        as conversation history accumulates).
        
        New approach: Check if any SINGLE turn causes a disproportionate context
        jump (>= 1.8x the previous turn). Normal multi-turn conversations grow
        linearly (~+500-2000 tokens per turn). Exponential growth signals an
        agent loop or missing context management.
        """
        sessions = self._get_inferred_sessions()
        
        for wf_id, events_list in sessions.items():
            if len(events_list) < 3:  # Need at least 3 turns to detect explosion
                continue
            
            contexts = [e.context_length if e.context_length is not None else e.input_tokens for e in events_list]
            
            # Skip if any context is zero (missing data)
            if any(c == 0 or c is None for c in contexts):
                continue
            
            # Calculate per-turn deltas
            explosive_turns = []  # Indices where context jumped >= 1.8x
            for i in range(1, len(contexts)):
                prev = contexts[i - 1]
                curr = contexts[i]
                if prev > 0 and curr >= prev * 1.8:
                    explosive_turns.append(i)
            
            # Also check total growth, but only flag if individual jumps are explosive
            total_growth = contexts[-1] / contexts[0] if contexts[0] > 0 else 0
            
            # Flag only if:
            # 1. At least 2 explosive turns (not just one large message), OR
            # 2. Total growth >= 5x (even if individual jumps are spread out)
            if len(explosive_turns) >= 2 or (total_growth >= 5 and len(explosive_turns) >= 1):
                # The "wasted" events are those after the first explosion
                first_explosion_idx = explosive_turns[0]
                large_events = events_list[first_explosion_idx:]
                wasted_cost = sum(e.cost for e in large_events) * 0.5
                
                max_jump = max(
                    contexts[i] / contexts[i - 1]
                    for i in explosive_turns
                ) if explosive_turns else 0
                
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="context_explosion",
                    title="Context Explosion",
                    severity="HIGH",
                    weekly_cost=wasted_cost,
                    one_line_summary=f"Context grew {total_growth:.1f}x total, {len(explosive_turns)} explosive turn(s)",
                    fix_effort="15 minutes",
                    fix_confidence="MEDIUM",
                    cta="Implement Sliding Window",
                    affected_workflow=wf_id,
                    affected_events=[e.id for e in large_events],
                    metadata={
                        "min_context": contexts[0],
                        "max_context": max(contexts),
                        "total_growth_factor": round(total_growth, 2),
                        "explosive_turns": len(explosive_turns),
                        "max_single_turn_jump": round(max_jump, 2),
                        "fix_instructions": "Implement context summarization or sliding window to cap context growth"
                    }
                )
                self.issues.append(issue)
