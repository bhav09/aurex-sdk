"""
Enhanced Detection Engine with Executive-Level Insights (Async)
Implements production-grade detection with workflow-level analysis
Now with 7 advanced improvements:
1. Workflow Naming & Tagging
2. False Positive Tuning (Configurable Thresholds)
3. Model-Level Cost Comparison
4. Prompt Efficiency Metrics
5. Caching Opportunities
6. Output Length Optimization
7. Provider Cost Comparison
"""

from typing import List, Dict, Any, Optional
from collections import defaultdict
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy import func, desc

from src.models import LLMEvent
from src.utils.logger import get_logger
from src.detection.config import DetectionConfig
from src.detection.analyzers import (
    WorkflowNamingAnalyzer,
    ModelEfficiencyAnalyzer,
    PromptEfficiencyAnalyzer,
    CachingOpportunityAnalyzer,
    OutputLengthAnalyzer,
    ProviderComparisonAnalyzer
)

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
        self.optimized_spend = optimized_spend
        self.period_days = max(period_days, 1)  # Guard against zero
        
        self.current_weekly_spend = (current_spend / self.period_days) * 7
        self.wasted_amount = (wasted_amount / self.period_days) * 7
        self.waste_percentage = (wasted_amount / current_spend * 100) if current_spend > 0 else 0
        
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
            "current_weekly_spend": round(self.current_weekly_spend, 2),
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
    
    def __init__(
        self,
        db,
        session_id: Optional[str] = None,
        email: Optional[str] = None,
        project_id: Optional[str] = None,
        config: Optional[DetectionConfig] = None,
    ):
        self.db = db
        self.session_id = session_id
        self.email = email
        self.project_id = project_id
        self.config = config or DetectionConfig()
        self.issues: List[EnhancedIssue] = []
        self.workflow_analyses: Dict[str, WorkflowAnalysis] = {}
        self.events: Optional[List[LLMEvent]] = None
        self.pricing_overrides: Dict[str, tuple[float, float]] = {}
        
        # Initialize analyzers
        self.workflow_naming = WorkflowNamingAnalyzer()
        self.model_efficiency = ModelEfficiencyAnalyzer(self.config)
        self.prompt_efficiency = PromptEfficiencyAnalyzer(self.config)
        self.caching_opportunity = CachingOpportunityAnalyzer(self.config)
        self.output_length = OutputLengthAnalyzer(self.config)
        self.provider_comparison = ProviderComparisonAnalyzer(self.config)
    
    async def load_events(self):
        company_name = None
        
        # Load company_name if session_id is available
        if self.session_id:
            from src.models import AuditSession
            session_query = select(AuditSession).where(AuditSession.id == self.session_id)
            session_res = await self.db.execute(session_query)
            session_obj = session_res.scalars().first()
            if session_obj:
                company_name = session_obj.company_name
        elif self.email:
            # Try to get the latest company name for the email
            from src.models import AuditSession
            session_query = select(AuditSession.company_name).where(
                func.lower(AuditSession.email) == func.lower(self.email)
            ).order_by(desc(AuditSession.created_at)).limit(1)
            session_res = await self.db.execute(session_query)
            company_name = session_res.scalar()
            
        if company_name:
            from src.models import PricingOverride
            override_query = select(PricingOverride).where(
                func.lower(PricingOverride.company_name) == func.lower(company_name)
            )
            override_res = await self.db.execute(override_query)
            for override in override_res.scalars().all():
                from src.utils.pricing import normalize_model_name
                norm_key = normalize_model_name(override.model_name)
                self.pricing_overrides[norm_key] = (override.input_price_per_1m, override.output_price_per_1m)

        if self.project_id:
            query = select(LLMEvent).where(LLMEvent.project_id == self.project_id)
        elif self.session_id:
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
            # Prevent tenant isolation bypass: do not load all events
            self.events = []
            return
            
        result = await self.db.execute(query)
        self.events = result.scalars().all()
        
        # Dynamically recalculate cost using overrides
        if self.pricing_overrides and self.events:
            from src.utils.pricing import calculate_cost
            for e in self.events:
                cache_read = 0
                cache_create = 0
                if e.extra_metadata:
                    cache_read = e.extra_metadata.get("cache_read_tokens", 0)
                    cache_create = e.extra_metadata.get("cache_creation_tokens", 0)
                e.cost = calculate_cost(
                    e.model,
                    e.input_tokens,
                    e.output_tokens,
                    cache_read_tokens=cache_read,
                    cache_creation_tokens=cache_create,
                    pricing_overrides=self.pricing_overrides
                )
    
    async def analyze_complete(self) -> Dict[str, Any]:
        """
        Complete analysis with executive summary + 7 new advanced analyses
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
        
        # Run all detections (with configurable thresholds)
        self.detect_wasteful_prompts_from_metadata()  # NEW: Read wasteful_prompt field
        self.detect_system_prompt_waste()
        self.detect_agent_loops_enhanced()
        self.detect_expensive_model_misuse_enhanced()
        self.detect_context_explosion_enhanced()
        self.detect_tool_bloat()
        self.detect_retry_cascades()
        self.detect_output_verbosity()
        
        # Run new advanced analyses
        model_efficiency_analysis = self.model_efficiency.analyze_model_efficiency(self.events, self.pricing_overrides)
        prompt_efficiency_analysis = self.prompt_efficiency.analyze_prompt_efficiency(self.events)
        caching_analysis = self.caching_opportunity.detect_caching_opportunities(self.events, self.pricing_overrides)
        output_length_analysis = self.output_length.detect_output_length_waste(self.events)
        provider_comparison_analysis = self.provider_comparison.analyze_provider_efficiency(self.events, self.pricing_overrides)
        
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
            "analysis_timestamp": datetime.utcnow().isoformat(),
            
            # NEW: Advanced Analysis Sections
            "advanced_analysis": {
                "model_efficiency": model_efficiency_analysis,
                "prompt_efficiency": prompt_efficiency_analysis,
                "caching_opportunities": caching_analysis,
                "output_length_optimization": output_length_analysis,
                "provider_comparison": provider_comparison_analysis
            },
            "detection_config": self.config.to_dict()
        }
    
    def _analyze_workflows(self):
        """Analyze cost per workflow with enhanced naming"""
        workflow_events = defaultdict(list)
        for event in self.events:
            wf_id = event.workflow_id or "unknown"
            workflow_events[wf_id].append(event)
        
        for wf_id, events_list in workflow_events.items():
            # Generate better workflow name using WorkflowNamingAnalyzer
            improved_name, category, confidence = self.workflow_naming.generate_workflow_name(events_list, wf_id)
            
            # Create WorkflowAnalysis object with improved naming
            workflow_analysis = WorkflowAnalysis(
                workflow_id=improved_name,  # Use improved name
                events=events_list
            )
            
            # Add naming metadata
            workflow_analysis.original_id = wf_id
            workflow_analysis.naming_category = category
            workflow_analysis.naming_confidence = confidence
            
            self.workflow_analyses[wf_id] = workflow_analysis
    
    def detect_wasteful_prompts_from_metadata(self):
        """
        PRIORITY: Read wasteful_prompt field from metadata
        This detects pre-labeled wasteful requests and groups them by workflow/feature
        """
        # Group wasteful events by workflow
        wasteful_by_workflow = defaultdict(list)
        
        for event in self.events:
            # Check if wasteful_prompt field exists in metadata
            is_wasteful = False
            if event.extra_metadata:
                # Check various possible field names
                is_wasteful = event.extra_metadata.get("wasteful_prompt", False)
                if not is_wasteful:
                    is_wasteful = event.extra_metadata.get("wasteful", False)
                if not is_wasteful:
                    is_wasteful = event.extra_metadata.get("is_wasteful", False)
            
            if is_wasteful:
                workflow = event.workflow_id or "unknown"
                wasteful_by_workflow[workflow].append(event)
        
        # Create issues for each workflow with wasteful requests
        for workflow_id, wasteful_events in wasteful_by_workflow.items():
            if not wasteful_events:
                continue
                
            total_wasteful_cost = sum(e.cost for e in wasteful_events)
            total_workflow_events = sum(1 for e in self.events if (e.workflow_id or "unknown") == workflow_id)
            wasteful_count = len(wasteful_events)
            waste_rate = (wasteful_count / total_workflow_events * 100) if total_workflow_events > 0 else 0
            
            # Calculate period days for weekly projection
            timestamps = [e.timestamp for e in self.events if e.timestamp]
            if timestamps:
                import math
                time_delta = max(timestamps) - min(timestamps)
                period_days = max(1, math.ceil(time_delta.total_seconds() / 86400.0))
            else:
                period_days = 7
            
            weekly_cost = (total_wasteful_cost / period_days) * 7
            
            # Determine severity based on waste rate
            if waste_rate > 50:
                severity = "HIGH"
            elif waste_rate > 30:
                severity = "MEDIUM"
            else:
                severity = "LOW"
            
            issue = EnhancedIssue(
                rank=0,  # Will be assigned later
                issue_type="wasteful_prompts",
                title=f"{workflow_id} - {wasteful_count}/{total_workflow_events} calls wasteful",
                severity=severity,
                weekly_cost=weekly_cost,
                one_line_summary=f"{wasteful_count} wasteful requests detected in {workflow_id} workflow",
                fix_effort="Medium",
                fix_confidence="High",
                cta=f"Review and optimize {workflow_id} prompts to reduce waste",
                affected_workflow=workflow_id,
                affected_events=[e.id for e in wasteful_events],
                metadata={
                    "wasteful_count": wasteful_count,
                    "total_count": total_workflow_events,
                    "waste_rate": round(waste_rate, 1),
                    "total_wasteful_cost": round(total_wasteful_cost, 2)
                }
            )
            self.issues.append(issue)
    
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
            
            severity = "CRITICAL"
            if any(getattr(e, "session_confidence", None) == "low" for e in events_list):
                severity = "MEDIUM"
                
            issue = EnhancedIssue(
                rank=0,
                issue_type="redundant_system_prompt",
                title="System Prompt Waste",
                severity=severity,
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
        Otherwise, falls back to multi-dimensional temporal clustering.
        """
        import os
        import uuid
        gap_seconds = int(os.getenv("SESSION_GAP_SECONDS", "300"))
        
        sessions = defaultdict(list)
        unassigned_with_user = []
        unassigned_without_user = []
        
        for event in sorted(self.events, key=lambda e: e.timestamp or datetime.min):
            session_id = None
            if event.extra_metadata and isinstance(event.extra_metadata, dict):
                session_id = event.extra_metadata.get("session_id")
            if not session_id and event.workflow_id:
                if not str(event.workflow_id).startswith("inferred_"):
                    session_id = event.workflow_id
            
            if session_id:
                event.session_confidence = "high"
                sessions[session_id].append(event)
            else:
                user_id = None
                if event.extra_metadata and isinstance(event.extra_metadata, dict):
                    user_id = event.extra_metadata.get("user_id")
                if user_id:
                    unassigned_with_user.append((user_id, event))
                else:
                    unassigned_without_user.append(event)
                    
        # Group by (model, user_id)
        if unassigned_with_user:
            user_groups = defaultdict(list)
            for user_id, e in unassigned_with_user:
                user_groups[(e.model, user_id)].append(e)
                
            for (model, user_id), evs in user_groups.items():
                current_session_id = None
                last_time = None
                for e in evs:
                    ts = e.timestamp or datetime.min
                    if not current_session_id or not last_time or (ts - last_time).total_seconds() > gap_seconds:
                        current_session_id = f"inferred_user_{uuid.uuid4().hex[:8]}"
                    e.workflow_id = current_session_id
                    e.session_confidence = "medium"
                    sessions[current_session_id].append(e)
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
            for e in unassigned_without_user:
                bucket = get_token_bucket(e.input_tokens)
                bucket_groups[(e.model, bucket)].append(e)
                
            for (model, bucket), evs in bucket_groups.items():
                current_session_id = None
                last_time = None
                for e in evs:
                    ts = e.timestamp or datetime.min
                    if not current_session_id or not last_time or (ts - last_time).total_seconds() > gap_seconds:
                        current_session_id = f"inferred_bucket_{uuid.uuid4().hex[:8]}"
                    e.workflow_id = current_session_id
                    e.session_confidence = "low"
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
                if contexts[i] >= contexts[i-1] * 2.5:
                    doublings += 1
            
            if doublings >= 2:
                loop_cost = sum(e.cost for e in events_list)
                
                timestamps = [e.timestamp for e in events_list if e.timestamp]
                if timestamps:
                    duration = (max(timestamps) - min(timestamps)).total_seconds() / 3600
                    time_str = f"{duration:.1f} hours"
                else:
                    time_str = "unknown duration"
                
                severity = "CRITICAL"
                if any(getattr(e, "session_confidence", None) == "low" for e in events_list):
                    severity = "MEDIUM"
                    
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="agent_loop",
                    title="Agent Runaway Loop",
                    severity=severity,
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
            input_price, output_price = get_model_pricing(event.model, pricing_overrides=self.pricing_overrides)
            
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
            if len(events_list) < 2:  # Need at least 2 turns to detect explosion
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
                
                severity = "HIGH"
                if any(getattr(e, "session_confidence", None) == "low" for e in large_events):
                    severity = "MEDIUM"
                    
                issue = EnhancedIssue(
                    rank=0,
                    issue_type="context_explosion",
                    title="Context Explosion",
                    severity=severity,
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

    def detect_tool_bloat(self):
        """
        Detect tool bloat: passing many tools but using few, wasting tokens
        """
        wasted_tokens = 0
        affected_events = []
        
        for event in self.events:
            avail_count = 0
            tool_definitions_tokens = 0
            
            if event.extra_metadata:
                avail_count = event.extra_metadata.get("tools_available_count", 0)
                tool_definitions_tokens = event.extra_metadata.get("tool_definitions_tokens", 0)
                
            if avail_count > 10:
                invocations = event.extra_metadata.get("tool_invocations") if event.extra_metadata else None
                used_count = self._get_used_tools_count(invocations)
                if used_count < 3:
                    wasted = tool_definitions_tokens if tool_definitions_tokens > 0 else (avail_count * 50)
                    wasted_tokens += wasted
                    affected_events.append(event)
                    
        if wasted_tokens > 10000:
            total_input_tokens = sum(e.input_tokens for e in affected_events)
            total_cost = sum(e.cost for e in affected_events)
            avg_price_per_token = (total_cost / total_input_tokens) if total_input_tokens > 0 else (0.0015 / 1000)
            wasted_cost = wasted_tokens * avg_price_per_token
            
            workflows = set(e.workflow_id for e in affected_events if e.workflow_id)
            affected_workflow = list(workflows)[0] if workflows else "unknown"
            
            issue = EnhancedIssue(
                rank=0,
                issue_type="tool_bloat",
                title="Tool Bloat Waste",
                severity="MEDIUM",
                weekly_cost=wasted_cost,
                one_line_summary=f"Passing many tools but using few. Approx {wasted_tokens:,} tokens wasted.",
                fix_effort="10 minutes",
                fix_confidence="HIGH",
                cta="Reduce Tool Definitions",
                affected_workflow=affected_workflow,
                affected_events=[e.id for e in affected_events],
                metadata={
                    "wasted_tokens": wasted_tokens,
                    "affected_events_count": len(affected_events),
                    "fix_instructions": "Only pass relevant tool definitions based on the query classification or reduce descriptions."
                }
            )
            self.issues.append(issue)

    def _get_used_tools_count(self, invocations) -> int:
        if not invocations:
            return 0
        if isinstance(invocations, str):
            import json
            try:
                parsed = json.loads(invocations)
                if isinstance(parsed, list):
                    return len(parsed)
                elif isinstance(parsed, dict):
                    return len(parsed)
                return 1
            except:
                return 1
        if isinstance(invocations, list):
            return len(invocations)
        if isinstance(invocations, dict):
            return len(invocations)
        return 1

    def detect_retry_cascades(self):
        """
        Detect rapid 5xx retry loops that burn input tokens on repetitive failures.
        """
        sorted_events = sorted(self.events, key=lambda e: e.timestamp or datetime.min)
        cascade_count = 0
        affected_events = []
        
        for i in range(1, len(sorted_events)):
            prev = sorted_events[i - 1]
            curr = sorted_events[i]
            
            if not prev.timestamp or not curr.timestamp:
                continue
                
            time_delta = (curr.timestamp - prev.timestamp).total_seconds() * 1000
            if time_delta < 5000 and curr.model == prev.model and curr.input_tokens == prev.input_tokens:
                prev_status = None
                if prev.extra_metadata:
                    prev_status = prev.extra_metadata.get("http_status")
                
                if prev_status and prev_status >= 500:
                    cascade_count += 1
                    affected_events.extend([prev, curr])
                    
        if cascade_count > 5:
            wasted_cost = sum(e.cost for e in set(affected_events))
            
            workflows = set(e.workflow_id for e in affected_events if e.workflow_id)
            affected_workflow = list(workflows)[0] if workflows else "unknown"
            
            issue = EnhancedIssue(
                rank=0,
                issue_type="retry_cascades",
                title="Retry Cascade Loops",
                severity="HIGH",
                weekly_cost=wasted_cost,
                one_line_summary=f"Detected {cascade_count} likely retry cascades due to downstream 5xx errors.",
                fix_effort="15 minutes",
                fix_confidence="HIGH",
                cta="Configure SDK Exponential Backoff",
                affected_workflow=affected_workflow,
                affected_events=[e.id for e in set(affected_events)],
                metadata={
                    "cascade_count": cascade_count,
                    "fix_instructions": "Implement standard backoff, check downstream availability, or configure circuit breakers to stop retrying immediately on 5xx."
                }
            )
            self.issues.append(issue)

    def detect_output_verbosity(self):
        """
        Detect conversational filler/verbosity in model outputs (conversations with output > 50 tokens and filler text).
        """
        chatty_count = 0
        affected_events = []
        
        for event in self.events:
            if event.response and event.output_tokens > 50:
                text = event.response.lower()
                if "certainly! here's" in text or "let me know if you need anything else" in text:
                    chatty_count += 1
                    affected_events.append(event)
                    
        if chatty_count > 20:
            wasted_cost = sum(event.cost * 0.20 for event in affected_events)
            
            workflows = set(e.workflow_id for e in affected_events if e.workflow_id)
            affected_workflow = list(workflows)[0] if workflows else "unknown"
            
            issue = EnhancedIssue(
                rank=0,
                issue_type="output_verbosity",
                title="Conversational Filler Waste",
                severity="LOW",
                weekly_cost=wasted_cost,
                one_line_summary=f"Detected conversational filler in {chatty_count} responses.",
                fix_effort="5 minutes",
                fix_confidence="HIGH",
                cta="Optimize System Prompt",
                affected_workflow=affected_workflow,
                affected_events=[e.id for e in affected_events],
                metadata={
                    "chatty_responses_count": chatty_count,
                    "suggested_fix": "Add 'Do not output conversational filler. Output only the requested data.' to your system prompt.",
                    "fix_instructions": "Inject constraints to prevent introductory and concluding politeness phrases which cost extra output tokens."
                }
            )
            self.issues.append(issue)
