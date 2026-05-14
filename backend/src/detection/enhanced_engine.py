"""
Enhanced Detection Engine with Executive-Level Insights
Implements production-grade detection with workflow-level analysis
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
import json

from src.models import LLMEvent


class ExecutiveSummary:
    """Executive-level summary for C-suite presentation"""
    
    def __init__(
        self,
        current_spend: float,
        wasted_amount: float,
        optimized_spend: float,
        period_days: int = 7
    ):
        self.current_weekly_spend = current_spend
        self.wasted_amount = wasted_amount
        self.waste_percentage = (wasted_amount / current_spend * 100) if current_spend > 0 else 0
        self.optimized_spend = optimized_spend
        self.annual_savings_projection = wasted_amount * 52  # Weekly to annual
        self.period_days = period_days
        
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
            "current_weekly_spend": round(self.current_weekly_spend, 2),
            "wasted_amount": round(self.wasted_amount, 2),
            "waste_percentage": round(self.waste_percentage, 1),
            "optimized_spend": round(self.optimized_spend, 2),
            "annual_savings_projection": round(self.annual_savings_projection, 2),
            "period_days": self.period_days,
            "severity": self.severity
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
            "affected_events_sample": self.affected_events[:5],  # First 5
            "metadata": self.metadata
        }


class EnhancedDetectionEngine:
    """Production-grade detection engine with executive insights"""
    
    def __init__(self, db: Session, email: Optional[str] = None):
        self.db = db
        self.email = email
        self.issues: List[EnhancedIssue] = []
        self.workflow_analyses: Dict[str, WorkflowAnalysis] = {}
    
    def _get_events_query(self):
        query = self.db.query(LLMEvent)
        if self.email:
            from src.models import AuditSession
            sessions = self.db.query(AuditSession.id).filter(func.lower(AuditSession.email) == func.lower(self.email)).all()
            session_ids = [s[0] for s in sessions]
            if session_ids:
                query = query.filter(LLMEvent.upload_session_id.in_(session_ids))
            else:
                query = query.filter(LLMEvent.id == 'no-match')
        return query
    
    def analyze_complete(self) -> Dict[str, Any]:
        """
        Complete analysis with executive summary
        """
        # Get all events
        events = self._get_events_query().all()
        
        if not events:
            return {
                "error": "No events found in database",
                "executive_summary": None,
                "top_issues": [],
                "workflow_breakdown": []
            }
        
        # Calculate totals
        total_cost = sum(e.cost for e in events)
        
        # Run all detections
        self.detect_system_prompt_waste()
        self.detect_agent_loops_enhanced()
        self.detect_expensive_model_misuse_enhanced()
        self.detect_context_explosion_enhanced()
        
        # Calculate wasted cost (avoid double-counting by tracking unique event IDs)
        # Issues can overlap (same events flagged by multiple detectors)
        unique_wasted_events = set()
        for issue in self.issues:
            unique_wasted_events.update(issue.affected_events)
        
        # Calculate actual waste from unique events
        if unique_wasted_events:
            wasted_events = self.db.query(LLMEvent).filter(LLMEvent.id.in_(unique_wasted_events)).all()
            # Conservative estimate: 70% of flagged event cost is waste
            wasted_cost = sum(e.cost for e in wasted_events) * 0.70
        else:
            wasted_cost = 0
        
        # Ensure waste doesn't exceed total cost
        wasted_cost = min(wasted_cost, total_cost * 0.95)  # Cap at 95% of total
        optimized_cost = total_cost - wasted_cost
        
        # Analyze workflows
        self._analyze_workflows()
        
        # Create executive summary
        exec_summary = ExecutiveSummary(
            current_spend=total_cost,
            wasted_amount=wasted_cost,
            optimized_spend=max(0, optimized_cost),
            period_days=7
        )
        
        # Sort issues by cost impact
        self.issues.sort(key=lambda x: x.weekly_cost, reverse=True)
        
        # Assign ranks
        for i, issue in enumerate(self.issues, 1):
            issue.rank = i
        
        return {
            "executive_summary": exec_summary.to_dict(),
            "top_issues": [issue.to_dict() for issue in self.issues[:10]],  # Top 10
            "workflow_breakdown": [wa.to_dict() for wa in sorted(
                self.workflow_analyses.values(),
                key=lambda x: x.total_cost,
                reverse=True
            )],
            "total_events": len(events),
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
    
    def _analyze_workflows(self):
        """Analyze cost per workflow"""
        # Group events by workflow
        workflow_events = defaultdict(list)
        
        for event in self._get_events_query().all():
            wf_id = event.workflow_id or "unknown"
            workflow_events[wf_id].append(event)
        
        # Create analyses
        for wf_id, events in workflow_events.items():
            self.workflow_analyses[wf_id] = WorkflowAnalysis(wf_id, events)
    
    def detect_system_prompt_waste(self):
        """
        CRITICAL: Detect redundant system prompts
        This is often the #1 cost driver
        """
        # Find events with system_prompt_hash in metadata
        events_with_prompts = []
        
        for event in self._get_events_query().all():
            if event.extra_metadata:
                prompt_hash = event.extra_metadata.get("system_prompt_hash")
                prompt_tokens = event.extra_metadata.get("system_prompt_tokens")
                
                if prompt_hash and prompt_tokens:
                    events_with_prompts.append({
                        "event": event,
                        "hash": prompt_hash,
                        "tokens": int(prompt_tokens)
                    })
        
        if not events_with_prompts:
            return
        
        # Group by hash
        hash_groups = defaultdict(list)
        for item in events_with_prompts:
            hash_groups[item["hash"]].append(item)
        
        # Find redundant prompts
        for prompt_hash, items in hash_groups.items():
            if len(items) < 2:
                continue
            
            # Calculate waste
            prompt_tokens = items[0]["tokens"]
            repetitions = len(items)
            total_wasted_tokens = prompt_tokens * (repetitions - 1)  # First one is necessary
            
            # Estimate cost (assuming $2.50 per 1M input tokens for GPT-4o)
            wasted_cost = (total_wasted_tokens / 1_000_000) * 2.50
            
            # Get affected workflow
            workflows = set(item["event"].workflow_id for item in items if item["event"].workflow_id)
            affected_workflow = list(workflows)[0] if workflows else None
            
            issue = EnhancedIssue(
                rank=0,  # Will be assigned later
                issue_type="redundant_system_prompt",
                title="System Prompt Waste",
                severity="CRITICAL",
                weekly_cost=wasted_cost,
                one_line_summary=f"Sending {prompt_tokens:,} tokens {repetitions:,} times",
                fix_effort="5 minutes",
                fix_confidence="HIGH",
                cta="Enable Prompt Caching",
                affected_workflow=affected_workflow,
                affected_events=[item["event"].id for item in items],
                metadata={
                    "prompt_hash": prompt_hash,
                    "prompt_tokens": prompt_tokens,
                    "repetitions": repetitions,
                    "total_wasted_tokens": total_wasted_tokens,
                    "fix_instructions": "Enable prompt caching in your API calls or move system prompt to a shared context"
                }
            )
            
            self.issues.append(issue)
    
    def detect_agent_loops_enhanced(self):
        """Enhanced agent loop detection with exponential pattern recognition"""
        # Group by session_id (not workflow_id) to detect loops within agent sessions
        sessions = defaultdict(list)
        for event in self._get_events_query().order_by(LLMEvent.timestamp).all():
            # Extract session_id from metadata
            session_id = None
            if event.extra_metadata:
                session_id = event.extra_metadata.get("session_id")
            
            # Fallback to workflow_id if no session_id
            if not session_id:
                session_id = event.workflow_id
            
            if session_id:
                sessions[session_id].append(event)
        
        for session_id, events in sessions.items():
            if len(events) < 3:
                continue
            
            # Check for exponential context growth
            contexts = [e.context_length for e in events if e.context_length]
            
            if len(contexts) < 3:
                continue
            
            # Detect doubling pattern
            doublings = 0
            for i in range(1, len(contexts)):
                if contexts[i] >= contexts[i-1] * 1.8:  # Allow some variance
                    doublings += 1
            
            if doublings >= 2:  # At least 2 doublings = exponential
                # Calculate cost
                loop_cost = sum(e.cost for e in events)
                
                # Get time range
                timestamps = [e.timestamp for e in events if e.timestamp]
                if timestamps:
                    duration = (max(timestamps) - min(timestamps)).total_seconds() / 3600  # hours
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
                    affected_workflow=session_id,  # Fixed: use session_id not wf_id
                    affected_events=[e.id for e in events],
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
        Enhanced expensive model detection with workflow-specific recommendations
        Detects over-provisioned models: expensive models used for simple tasks
        """
        # Define what's "expensive" and what's "simple"
        expensive_models = ["gpt-4o", "gpt-4", "gpt-4-turbo", "claude-3-opus", "claude-opus-4", "claude-3-7-sonnet"]
        
        # Group by workflow and model
        workflow_model_events = defaultdict(lambda: defaultdict(list))
        
        for event in self._get_events_query().all():
            is_expensive = any(exp in event.model.lower() for exp in expensive_models)
            
            # User's criteria: <500 input tokens AND <100 output tokens = simple task
            is_simple = event.input_tokens < 500 and event.output_tokens < 100
            
            if is_expensive and is_simple:
                wf_id = event.workflow_id or "unknown"
                workflow_model_events[wf_id][event.model].append(event)
        
        # Analyze each workflow
        for wf_id, model_events in workflow_model_events.items():
            for model, events in model_events.items():
                if len(events) < 3:  # Need at least 3 occurrences to flag
                    continue
                
                # Calculate actual waste based on model pricing
                current_cost = sum(e.cost for e in events)
                
                # Estimate savings: gpt-4o → gpt-4o-mini is ~15x cheaper
                # gpt-4o: $2.50/$10 per 1M tokens vs gpt-4o-mini: $0.15/$0.60 per 1M tokens
                if "gpt-4o" in model.lower() and "mini" not in model.lower():
                    savings_multiplier = 0.94  # 94% savings
                elif "gpt-4" in model.lower():
                    savings_multiplier = 0.95  # 95% savings
                elif "claude" in model.lower() and "opus" in model.lower():
                    savings_multiplier = 0.93  # 93% savings
                elif "claude" in model.lower() and "sonnet" in model.lower():
                    savings_multiplier = 0.85  # 85% savings
                else:
                    savings_multiplier = 0.90  # Default 90% savings
                
                wasted_cost = current_cost * savings_multiplier
                
                # Calculate average tokens for metadata
                avg_input = sum(e.input_tokens for e in events) / len(events)
                avg_output = sum(e.output_tokens for e in events) / len(events)
                
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="over_provisioned_model",
                    title="Over-Provisioned Model",
                    severity="HIGH",
                    weekly_cost=wasted_cost,
                    one_line_summary=f"Using {model} for {len(events)} simple tasks (avg {avg_input:.0f} in / {avg_output:.0f} out tokens)",
                    fix_effort="2 minutes",
                    fix_confidence="HIGH",
                    cta="Switch to GPT-4o-mini or Haiku",
                    affected_workflow=wf_id,
                    affected_events=[e.id for e in events],
                    metadata={
                        "current_model": model,
                        "recommended_model": "gpt-4o-mini" if "gpt" in model.lower() else "claude-3-5-haiku",
                        "request_count": len(events),
                        "avg_input_tokens": round(avg_input, 0),
                        "avg_output_tokens": round(avg_output, 0),
                        "current_cost": round(current_cost, 2),
                        "potential_cost": round(current_cost - wasted_cost, 2),
                        "savings_percentage": round(savings_multiplier * 100, 0),
                        "fix_instructions": "Route simple tasks (<500 input, <100 output tokens) to cheaper models like gpt-4o-mini or claude-haiku"
                    }
                )
                
                self.issues.append(issue)
    
    def detect_context_explosion_enhanced(self):
        """Enhanced context explosion detection"""
        workflows = defaultdict(list)
        for event in self._get_events_query().order_by(LLMEvent.timestamp).all():
            if event.workflow_id and event.context_length:
                workflows[event.workflow_id].append(event)
        
        for wf_id, events in workflows.items():
            if len(events) < 2:
                continue
            
            contexts = [e.context_length for e in events]
            min_context = min(contexts)
            max_context = max(contexts)
            
            if max_context >= min_context * 2:
                # Calculate cost of large context events
                large_events = [e for e in events if e.context_length >= min_context * 1.5]
                wasted_cost = sum(e.cost for e in large_events) * 0.5  # Estimate 50% waste
                
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="context_explosion",
                    title="Context Explosion",
                    severity="HIGH",
                    weekly_cost=wasted_cost,
                    one_line_summary=f"Context grew {max_context/min_context:.1f}x",
                    fix_effort="15 minutes",
                    fix_confidence="MEDIUM",
                    cta="Implement Sliding Window",
                    affected_workflow=wf_id,
                    affected_events=[e.id for e in large_events],
                    metadata={
                        "min_context": min_context,
                        "max_context": max_context,
                        "growth_factor": round(max_context / min_context, 2),
                        "fix_instructions": "Implement context summarization or sliding window"
                    }
                )
                
                self.issues.append(issue)


