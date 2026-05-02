"""
Detection Engine - Core Logic for Identifying Cost Inefficiencies
Implements 5 key detectors:
1. Agent Loop Detection
2. Context Explosion
3. Redundant System Prompts
4. Expensive Model Misuse
5. Top Cost Drivers
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict, Counter
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func

from src.models import LLMEvent


class IssueDetection:
    """Container for detected issues"""
    def __init__(
        self,
        issue_type: str,
        severity: str,
        cost_impact: float,
        description: str,
        recommendation: str,
        affected_events: List[str] = None,
        metadata: Dict[str, Any] = None
    ):
        self.issue_type = issue_type
        self.severity = severity
        self.cost_impact = cost_impact
        self.description = description
        self.recommendation = recommendation
        self.affected_events = affected_events or []
        self.metadata = metadata or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.issue_type,
            "severity": self.severity,
            "cost_impact": round(self.cost_impact, 4),
            "description": self.description,
            "recommendation": self.recommendation,
            "affected_events": self.affected_events,
            "metadata": self.metadata
        }


class DetectionEngine:
    """Main detection engine for cost inefficiencies"""
    
    def __init__(self, db: Session):
        self.db = db
        self.issues: List[IssueDetection] = []
    
    def run_all_detectors(self, workflow_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Run all detection algorithms
        
        Args:
            workflow_id: Optional workflow ID to analyze specific workflow
        
        Returns:
            List of detected issues
        """
        self.issues = []
        
        # Run each detector
        self.detect_agent_loops(workflow_id)
        self.detect_context_explosion(workflow_id)
        self.detect_redundant_system_prompts(workflow_id)
        self.detect_expensive_model_misuse(workflow_id)
        self.detect_top_cost_drivers(workflow_id)
        
        # Sort by cost impact (highest first)
        self.issues.sort(key=lambda x: x.cost_impact, reverse=True)
        
        return [issue.to_dict() for issue in self.issues]
    
    def detect_agent_loops(self, workflow_id: Optional[str] = None):
        """
        Detector 1: Agent Loop Detection
        
        Logic:
        - Same prompt repeats multiple times
        - Context length increasing each step
        - Flag if repeated > 3 times with increasing tokens
        """
        query = self.db.query(LLMEvent)
        if workflow_id:
            query = query.filter(LLMEvent.workflow_id == workflow_id)
        
        # Group by workflow
        workflows = defaultdict(list)
        for event in query.order_by(LLMEvent.timestamp).all():
            if event.workflow_id:
                workflows[event.workflow_id].append(event)
        
        for wf_id, events in workflows.items():
            # Track prompt repetitions and context growth
            prompt_sequence = []
            context_sequence = []
            
            for event in events:
                if event.prompt:
                    # Use first 100 chars as prompt signature
                    prompt_sig = event.prompt[:100] if event.prompt else ""
                    prompt_sequence.append(prompt_sig)
                    context_sequence.append(event.context_length or 0)
            
            # Detect loops: same prompt appearing 3+ times with growing context
            prompt_counts = Counter(prompt_sequence)
            
            for prompt_sig, count in prompt_counts.items():
                if count >= 3:
                    # Check if context is growing
                    indices = [i for i, p in enumerate(prompt_sequence) if p == prompt_sig]
                    contexts = [context_sequence[i] for i in indices]
                    
                    # Check if context is monotonically increasing
                    is_growing = all(contexts[i] < contexts[i+1] for i in range(len(contexts)-1))
                    
                    if is_growing:
                        # Calculate wasted cost
                        affected_event_ids = [events[i].id for i in indices[1:]]  # Skip first occurrence
                        wasted_cost = sum(events[i].cost for i in indices[1:])
                        
                        issue = IssueDetection(
                            issue_type="agent_loop",
                            severity="high",
                            cost_impact=wasted_cost,
                            description=f"Agent loop detected in workflow {wf_id}: prompt repeated {count} times with growing context ({contexts[0]} → {contexts[-1]} tokens)",
                            recommendation="Add termination condition or avoid re-sending full conversation history. Consider summarizing context.",
                            affected_events=affected_event_ids,
                            metadata={
                                "workflow_id": wf_id,
                                "repetitions": count,
                                "context_growth": f"{contexts[0]} → {contexts[-1]}"
                            }
                        )
                        self.issues.append(issue)
    
    def detect_context_explosion(self, workflow_id: Optional[str] = None):
        """
        Detector 2: Context Explosion
        
        Logic:
        - Context length grows monotonically within workflow
        - Flag if increase > 2x within same workflow
        """
        query = self.db.query(LLMEvent)
        if workflow_id:
            query = query.filter(LLMEvent.workflow_id == workflow_id)
        
        # Group by workflow
        workflows = defaultdict(list)
        for event in query.order_by(LLMEvent.timestamp).all():
            if event.workflow_id and event.context_length:
                workflows[event.workflow_id].append(event)
        
        for wf_id, events in workflows.items():
            if len(events) < 2:
                continue
            
            # Check for 2x growth
            contexts = [e.context_length for e in events]
            min_context = min(contexts)
            max_context = max(contexts)
            
            if max_context >= min_context * 2:
                # Calculate cost of events with large context
                large_context_events = [e for e in events if e.context_length >= min_context * 1.5]
                wasted_cost = sum(e.cost for e in large_context_events)
                
                issue = IssueDetection(
                    issue_type="context_explosion",
                    severity="high",
                    cost_impact=wasted_cost,
                    description=f"Context explosion in workflow {wf_id}: grew from {min_context} to {max_context} tokens ({max_context/min_context:.1f}x increase)",
                    recommendation="Implement context summarization or trim conversation history. Consider using a sliding window approach.",
                    affected_events=[e.id for e in large_context_events],
                    metadata={
                        "workflow_id": wf_id,
                        "min_context": min_context,
                        "max_context": max_context,
                        "growth_factor": round(max_context / min_context, 2)
                    }
                )
                self.issues.append(issue)
    
    def detect_redundant_system_prompts(self, workflow_id: Optional[str] = None):
        """
        Detector 3: Redundant System Prompts
        
        Logic:
        - Identical system_prompt_hash across events
        - Flag if repeated system prompts consume >20% of tokens
        """
        query = self.db.query(LLMEvent)
        if workflow_id:
            query = query.filter(LLMEvent.workflow_id == workflow_id)
        
        # Group by system prompt hash
        prompt_groups = defaultdict(list)
        total_tokens = 0
        
        for event in query.all():
            if event.system_prompt_hash:
                prompt_groups[event.system_prompt_hash].append(event)
            total_tokens += event.total_tokens
        
        for prompt_hash, events in prompt_groups.items():
            if len(events) < 3:  # Only flag if repeated 3+ times
                continue
            
            # Calculate token usage
            prompt_tokens = sum(e.input_tokens for e in events)
            prompt_percentage = (prompt_tokens / total_tokens * 100) if total_tokens > 0 else 0
            
            if prompt_percentage > 20:
                wasted_cost = sum(e.cost for e in events[1:])  # Cost of repetitions
                
                issue = IssueDetection(
                    issue_type="redundant_system_prompts",
                    severity="medium",
                    cost_impact=wasted_cost,
                    description=f"System prompt repeated {len(events)} times, consuming {prompt_percentage:.1f}% of total tokens",
                    recommendation="Move system prompt to shared memory or cache. Use prompt caching features if available.",
                    affected_events=[e.id for e in events],
                    metadata={
                        "prompt_hash": prompt_hash,
                        "repetitions": len(events),
                        "token_percentage": round(prompt_percentage, 2)
                    }
                )
                self.issues.append(issue)
    
    def detect_expensive_model_misuse(self, workflow_id: Optional[str] = None):
        """
        Detector 4: Expensive Model Misuse
        
        Logic:
        - High-cost model used for low token/simple tasks
        - Flag if expensive model (GPT-4, Opus) used for <200 tokens repeatedly
        """
        expensive_models = [
            "gpt-4", "gpt-4-turbo", "claude-3-opus", "claude-opus-4",
            "claude-3-opus-20240229", "claude-opus-4-20250514"
        ]
        
        query = self.db.query(LLMEvent)
        if workflow_id:
            query = query.filter(LLMEvent.workflow_id == workflow_id)
        
        # Find events using expensive models for simple tasks
        misuse_events = []
        
        for event in query.all():
            # Check if using expensive model
            is_expensive = any(exp_model in event.model.lower() for exp_model in expensive_models)
            
            if is_expensive and event.total_tokens < 200:
                misuse_events.append(event)
        
        if len(misuse_events) >= 3:  # Flag if happens 3+ times
            wasted_cost = sum(e.cost for e in misuse_events)
            
            # Estimate savings with cheaper model
            # Assume 10x cheaper model (e.g., GPT-4 → GPT-3.5, Opus → Haiku)
            potential_savings = wasted_cost * 0.9
            
            issue = IssueDetection(
                issue_type="expensive_model_misuse",
                severity="high",
                cost_impact=potential_savings,
                description=f"Expensive models used for {len(misuse_events)} simple tasks (<200 tokens each)",
                recommendation="Use cheaper models (GPT-3.5-turbo, Claude Haiku) for simple tasks. Implement model routing based on task complexity.",
                affected_events=[e.id for e in misuse_events],
                metadata={
                    "misuse_count": len(misuse_events),
                    "models_used": list(set(e.model for e in misuse_events)),
                    "avg_tokens": round(sum(e.total_tokens for e in misuse_events) / len(misuse_events))
                }
            )
            self.issues.append(issue)
    
    def detect_top_cost_drivers(self, workflow_id: Optional[str] = None):
        """
        Detector 5: Top Cost Drivers
        
        Logic:
        - Identify top 20% events contributing to 80% of cost (Pareto principle)
        - Group by workflow, model, and feature
        """
        query = self.db.query(LLMEvent)
        if workflow_id:
            query = query.filter(LLMEvent.workflow_id == workflow_id)
        
        events = query.order_by(LLMEvent.cost.desc()).all()
        
        if not events:
            return
        
        total_cost = sum(e.cost for e in events)
        
        # Find events contributing to 80% of cost
        cumulative_cost = 0
        top_events = []
        
        for event in events:
            cumulative_cost += event.cost
            top_events.append(event)
            
            if cumulative_cost >= total_cost * 0.8:
                break
        
        # Calculate percentage
        top_percentage = (len(top_events) / len(events) * 100) if events else 0
        
        if top_percentage < 30:  # If less than 30% of events cause 80% of cost
            # Group by model
            model_costs = defaultdict(float)
            for event in top_events:
                model_costs[event.model] += event.cost
            
            issue = IssueDetection(
                issue_type="top_cost_drivers",
                severity="medium",
                cost_impact=cumulative_cost,
                description=f"Top {len(top_events)} events ({top_percentage:.1f}%) account for 80% of total cost (${cumulative_cost:.2f})",
                recommendation="Focus optimization efforts on these high-cost events. Consider model downgrading or prompt optimization.",
                affected_events=[e.id for e in top_events[:20]],  # Limit to top 20
                metadata={
                    "total_events": len(events),
                    "top_events_count": len(top_events),
                    "top_events_percentage": round(top_percentage, 2),
                    "model_breakdown": {k: round(v, 4) for k, v in sorted(model_costs.items(), key=lambda x: x[1], reverse=True)}
                }
            )
            self.issues.append(issue)


def analyze_workflow(db: Session, workflow_id: str) -> Dict[str, Any]:
    """
    Analyze a specific workflow
    
    Args:
        db: Database session
        workflow_id: Workflow ID to analyze
    
    Returns:
        Analysis results with detected issues
    """
    engine = DetectionEngine(db)
    issues = engine.run_all_detectors(workflow_id)
    
    # Get workflow summary
    events = db.query(LLMEvent).filter(LLMEvent.workflow_id == workflow_id).all()
    
    total_cost = sum(e.cost for e in events)
    wasted_cost = sum(issue["cost_impact"] for issue in issues)
    
    return {
        "workflow_id": workflow_id,
        "total_events": len(events),
        "total_cost": round(total_cost, 4),
        "wasted_cost": round(wasted_cost, 4),
        "efficiency_score": round((1 - wasted_cost / total_cost) * 100, 2) if total_cost > 0 else 100,
        "issues": issues
    }


def analyze_all(db: Session) -> Dict[str, Any]:
    """
    Analyze all events in database
    
    Args:
        db: Database session
    
    Returns:
        Complete analysis results
    """
    engine = DetectionEngine(db)
    issues = engine.run_all_detectors()
    
    # Get overall summary
    total_events = db.query(func.count(LLMEvent.id)).scalar()
    total_cost = db.query(func.sum(LLMEvent.cost)).scalar() or 0
    wasted_cost = sum(issue["cost_impact"] for issue in issues)
    
    return {
        "total_events": total_events,
        "total_cost": round(total_cost, 4),
        "wasted_cost": round(wasted_cost, 4),
        "potential_savings_percentage": round((wasted_cost / total_cost * 100) if total_cost > 0 else 0, 2),
        "issues_found": len(issues),
        "issues": issues
    }


