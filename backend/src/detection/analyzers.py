"""
Advanced Analysis Modules for Enhanced Detection Engine
Implements 7 key improvements:
1. Workflow Naming & Tagging
2. Model-Level Cost Comparison
3. Prompt Efficiency Metrics
4. Caching Opportunities
5. Output Length Optimization
6. Provider Cost Comparison
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
from datetime import datetime
import hashlib

from src.models import LLMEvent
from src.utils.logger import get_logger
from src.detection.config import DetectionConfig

logger = get_logger(__name__)


class WorkflowNamingAnalyzer:
    """Improved workflow naming with semantic heuristics"""
    
    @staticmethod
    def generate_workflow_name(events: List[LLMEvent], workflow_id: str) -> Tuple[str, str, float]:
        """
        Generate human-readable workflow name from events
        Returns: (name, category, confidence_score)
        """
        if not events:
            return workflow_id, "unknown", 0.0
        
        # If workflow_id is already semantic (not inferred), use it
        if not str(workflow_id).startswith("inferred_"):
            return workflow_id, "explicit", 1.0
        
        # Extract features from events
        models = [e.model for e in events]
        unique_models = list(set(models))
        
        # Check for feature field in metadata
        features = []
        for e in events:
            if e.extra_metadata and isinstance(e.extra_metadata, dict):
                feature = e.extra_metadata.get("feature") or e.extra_metadata.get("workflow_name")
                if feature:
                    features.append(feature)
        
        if features:
            # Use most common feature name
            from collections import Counter
            most_common = Counter(features).most_common(1)[0][0]
            return most_common, "feature_tagged", 0.9
        
        # Analyze patterns
        avg_input = sum(e.input_tokens for e in events) / len(events)
        avg_output = sum(e.output_tokens for e in events) / len(events)
        
        # Heuristic-based naming
        if avg_input < 200 and avg_output < 50:
            return "Quick Queries", "pattern_inferred", 0.6
        elif avg_input > 5000:
            return "Document Processing", "pattern_inferred", 0.6
        elif avg_output > 1000:
            return "Content Generation", "pattern_inferred", 0.6
        elif len(unique_models) == 1 and "gpt-4" in unique_models[0].lower():
            return "GPT-4 Workflow", "model_based", 0.5
        elif len(unique_models) == 1 and "claude" in unique_models[0].lower():
            return "Claude Workflow", "model_based", 0.5
        elif len(unique_models) == 1 and "gemini" in unique_models[0].lower():
            return "Gemini Workflow", "model_based", 0.5
        else:
            # Use token bucket as fallback
            if avg_input < 500:
                return "Small Tasks", "token_based", 0.4
            elif avg_input < 2000:
                return "Medium Tasks", "token_based", 0.4
            else:
                return "Large Tasks", "token_based", 0.4


class ModelEfficiencyAnalyzer:
    """Analyze model selection efficiency using LiteLLM pricing"""
    
    def __init__(self, config: DetectionConfig):
        self.config = config
    
    def analyze_model_efficiency(self, events: List[LLMEvent], pricing_overrides: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Compare actual model usage vs optimal model selection
        Returns cost savings opportunities from model downgrading
        """
        from src.utils.pricing import get_model_pricing
        
        # Group events by workflow
        workflow_events = defaultdict(list)
        for e in events:
            wf = e.workflow_id or "unknown"
            workflow_events[wf].append(e)
        
        opportunities = []
        total_potential_savings = 0.0
        
        for workflow_id, wf_events in workflow_events.items():
            if len(wf_events) < self.config.expensive_model_min_requests:
                continue
            
            # Analyze task complexity
            avg_input = sum(e.input_tokens for e in wf_events) / len(wf_events)
            avg_output = sum(e.output_tokens for e in wf_events) / len(wf_events)
            
            # Check if using expensive model for simple tasks
            for event in wf_events:
                input_price, output_price = get_model_pricing(event.model, pricing_overrides)
                
                # Simple task: low input/output tokens
                is_simple_task = (
                    event.input_tokens < self.config.simple_task_input_threshold and
                    event.output_tokens < self.config.simple_task_output_threshold
                )
                
                # Expensive model: high input price
                is_expensive = input_price > self.config.expensive_model_threshold
                
                if is_simple_task and is_expensive:
                    # Find cheaper alternative
                    provider = self._extract_provider(event.model)
                    cheaper_model = self._find_cheaper_alternative(
                        event.model, provider, input_price, pricing_overrides
                    )
                    
                    if cheaper_model:
                        cheaper_input, cheaper_output = get_model_pricing(cheaper_model, pricing_overrides)
                        current_cost = (event.input_tokens / 1_000_000 * input_price + 
                                      event.output_tokens / 1_000_000 * output_price)
                        optimal_cost = (event.input_tokens / 1_000_000 * cheaper_input + 
                                      event.output_tokens / 1_000_000 * cheaper_output)
                        savings = current_cost - optimal_cost
                        
                        if savings > 0:
                            total_potential_savings += savings
            
            # Calculate workflow-level savings
            if total_potential_savings > self.config.min_cost_threshold:
                current_cost = sum(e.cost for e in wf_events)
                savings_pct = (total_potential_savings / current_cost * 100) if current_cost > 0 else 0
                
                opportunities.append({
                    "workflow_id": workflow_id,
                    "current_model": wf_events[0].model,
                    "recommended_model": cheaper_model if 'cheaper_model' in locals() else "gpt-3.5-turbo",
                    "current_cost": round(current_cost, 4),
                    "potential_savings": round(total_potential_savings, 4),
                    "savings_percentage": round(savings_pct, 1),
                    "event_count": len(wf_events),
                    "avg_input_tokens": round(avg_input, 0),
                    "avg_output_tokens": round(avg_output, 0)
                })
        
        return {
            "opportunities": opportunities,
            "total_potential_savings": round(total_potential_savings, 4),
            "analyzed_workflows": len(workflow_events)
        }
    
    def _extract_provider(self, model: str) -> str:
        """Extract provider from model name"""
        model_lower = model.lower()
        if "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        elif "gemini" in model_lower or "google" in model_lower:
            return "google"
        elif "bedrock" in model_lower:
            return "aws"
        return "unknown"
    
    def _find_cheaper_alternative(self, current_model: str, provider: str,
                                  current_price: float, pricing_overrides: Optional[Dict] = None) -> Optional[str]:
        """Find cheaper model alternative from same provider"""
        from src.utils.pricing import get_model_pricing
        
        # Provider-specific cheaper alternatives
        alternatives = {
            "openai": ["gpt-3.5-turbo", "gpt-4o-mini"],
            "anthropic": ["claude-3-haiku-20240307", "claude-instant-1.2"],
            "google": ["gemini-1.5-flash", "gemini-pro"]
        }
        
        for alt_model in alternatives.get(provider, []):
            alt_price, _ = get_model_pricing(alt_model, pricing_overrides)
            if alt_price < current_price * 0.5:  # At least 50% cheaper
                return alt_model
        
        return None


class PromptEfficiencyAnalyzer:
    """Analyze prompt efficiency and compression opportunities"""
    
    def __init__(self, config: DetectionConfig):
        self.config = config
    
    def analyze_prompt_efficiency(self, events: List[LLMEvent]) -> Dict[str, Any]:
        """
        Analyze prompt/completion ratio and identify verbose prompts
        """
        workflow_metrics: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "total_input": 0,
            "total_output": 0,
            "events": []
        })
        
        for e in events:
            wf = e.workflow_id or "unknown"
            workflow_metrics[wf]["total_input"] += e.input_tokens
            workflow_metrics[wf]["total_output"] += e.output_tokens
            workflow_metrics[wf]["events"].append(e)
        
        inefficient_workflows = []
        
        for workflow_id, metrics in workflow_metrics.items():
            if len(metrics["events"]) < self.config.min_events_for_analysis:
                continue
            
            ratio = metrics["total_input"] / metrics["total_output"] if metrics["total_output"] > 0 else 0
            
            # Flag if prompt/completion ratio > threshold
            if ratio > self.config.prompt_efficiency_threshold:
                avg_input = metrics["total_input"] / len(metrics["events"])
                avg_output = metrics["total_output"] / len(metrics["events"])
                
                # Estimate compression opportunity
                # Assume 20-30% of prompt tokens can be compressed
                compression_potential = avg_input * self.config.prompt_compression_opportunity_threshold
                
                total_cost = sum(e.cost for e in metrics["events"])
                # Estimate savings from compression (proportional to input cost)
                input_cost_ratio = 0.6  # Assume 60% of cost is input
                potential_savings = total_cost * input_cost_ratio * self.config.prompt_compression_opportunity_threshold
                
                inefficient_workflows.append({
                    "workflow_id": workflow_id,
                    "prompt_completion_ratio": round(ratio, 2),
                    "avg_input_tokens": round(avg_input, 0),
                    "avg_output_tokens": round(avg_output, 0),
                    "compression_potential_tokens": round(compression_potential, 0),
                    "potential_savings": round(potential_savings, 4),
                    "event_count": len(metrics["events"]),
                    "recommendation": "Consider prompt compression, remove redundant instructions, or use prompt templates"
                })
        
        return {
            "inefficient_workflows": sorted(inefficient_workflows, 
                                          key=lambda x: x["potential_savings"], 
                                          reverse=True),
            "total_analyzed": len(workflow_metrics)
        }


class CachingOpportunityAnalyzer:
    """Detect repeated prompts that could benefit from caching"""
    
    def __init__(self, config: DetectionConfig):
        self.config = config
    
    def detect_caching_opportunities(self, events: List[LLMEvent], pricing_overrides: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Identify repeated prompts without caching enabled
        Calculate savings from prompt caching
        """
        from src.utils.pricing import get_model_pricing
        
        # Group by prompt hash
        prompt_groups = defaultdict(list)
        
        for e in events:
            # Create prompt hash from input tokens and model
            # In production, use actual prompt content hash
            prompt_key = f"{e.model}_{e.input_tokens}"
            
            # Check if prompt is large enough to cache
            if e.input_tokens >= self.config.cache_min_prompt_tokens:
                prompt_groups[prompt_key].append(e)
        
        opportunities = []
        total_cache_savings = 0.0
        
        for prompt_key, prompt_events in prompt_groups.items():
            repetitions = len(prompt_events)
            
            # Only flag if repeated enough times
            if repetitions < self.config.cache_repetition_threshold:
                continue
            
            # Check if caching is already enabled
            has_cache = any(
                e.extra_metadata and 
                (e.extra_metadata.get("cache_read_tokens", 0) > 0 or
                 e.extra_metadata.get("cache_creation_tokens", 0) > 0)
                for e in prompt_events
            )
            
            if not has_cache:
                # Calculate potential savings
                model = prompt_events[0].model
                input_price, _ = get_model_pricing(model, pricing_overrides)
                
                # Cache pricing multipliers (provider-specific)
                cache_multiplier = self._get_cache_multiplier(model)
                
                # First call: full price + cache write
                # Subsequent calls: cache read price (10-50% of full price)
                avg_input_tokens = sum(e.input_tokens for e in prompt_events) / len(prompt_events)
                
                # Current cost (no caching)
                current_cost = (avg_input_tokens / 1_000_000 * input_price) * repetitions
                
                # With caching: first call full price, rest at cache read price
                cached_cost = (avg_input_tokens / 1_000_000 * input_price) + \
                             (avg_input_tokens / 1_000_000 * input_price * cache_multiplier * (repetitions - 1))
                
                savings = current_cost - cached_cost
                
                if savings > self.config.min_cost_threshold:
                    total_cache_savings += savings
                    
                    opportunities.append({
                        "workflow_id": prompt_events[0].workflow_id or "unknown",
                        "model": model,
                        "repetitions": repetitions,
                        "avg_prompt_tokens": round(avg_input_tokens, 0),
                        "current_cost": round(current_cost, 4),
                        "cached_cost": round(cached_cost, 4),
                        "potential_savings": round(savings, 4),
                        "savings_percentage": round((savings / current_cost * 100) if current_cost > 0 else 0, 1),
                        "recommendation": f"Enable prompt caching for this {model} workflow"
                    })
        
        return {
            "opportunities": sorted(opportunities, key=lambda x: x["potential_savings"], reverse=True),
            "total_potential_savings": round(total_cache_savings, 4),
            "cacheable_prompts_found": len(opportunities)
        }
    
    def _get_cache_multiplier(self, model: str) -> float:
        """Get cache read price multiplier for provider"""
        model_lower = model.lower()
        if "claude" in model_lower or "anthropic" in model_lower:
            return 0.10  # Anthropic: 90% discount on cache reads
        elif "gpt" in model_lower or "openai" in model_lower:
            return 0.50  # OpenAI: 50% discount on cache reads
        elif "gemini" in model_lower:
            return 0.25  # Google: 75% discount on cache reads
        return 0.50  # Default: 50% discount


class OutputLengthAnalyzer:
    """Detect unnecessarily long outputs"""
    
    def __init__(self, config: DetectionConfig):
        self.config = config
    
    def detect_output_length_waste(self, events: List[LLMEvent]) -> Dict[str, Any]:
        """
        Identify workflows with unnecessarily long outputs
        Recommend max_tokens settings
        """
        workflow_outputs = defaultdict(list)
        
        for e in events:
            if e.output_tokens > self.config.output_length_min_tokens:
                wf = e.workflow_id or "unknown"
                workflow_outputs[wf].append(e)
        
        wasteful_workflows = []
        
        for workflow_id, wf_events in workflow_outputs.items():
            if len(wf_events) < self.config.min_events_for_analysis:
                continue
            
            # Calculate output statistics
            outputs = [e.output_tokens for e in wf_events]
            avg_output = sum(outputs) / len(outputs)
            max_output = max(outputs)
            
            # Check if outputs are consistently long
            # Flag if average output > threshold and variance is low (consistent length)
            import statistics
            if len(outputs) > 1:
                stdev = statistics.stdev(outputs)
                coefficient_of_variation = stdev / avg_output if avg_output > 0 else 0
                
                # Low variance + high output = likely over-provisioned max_tokens
                if coefficient_of_variation < 0.3 and avg_output > 500:
                    # Calculate potential savings
                    total_cost = sum(e.cost for e in wf_events)
                    
                    # Assume output cost is ~40% of total (varies by model)
                    output_cost = total_cost * 0.4
                    
                    # Recommend max_tokens = avg + 1 stdev (covers 84% of cases)
                    recommended_max_tokens = int(avg_output + stdev)
                    
                    # Estimate savings from reducing max_tokens
                    # Assume 20-30% reduction in output tokens
                    potential_savings = output_cost * 0.25
                    
                    wasteful_workflows.append({
                        "workflow_id": workflow_id,
                        "avg_output_tokens": round(avg_output, 0),
                        "max_output_tokens": max_output,
                        "recommended_max_tokens": recommended_max_tokens,
                        "current_cost": round(total_cost, 4),
                        "potential_savings": round(potential_savings, 4),
                        "event_count": len(wf_events),
                        "recommendation": f"Set max_tokens={recommended_max_tokens} to reduce output length"
                    })
        
        return {
            "wasteful_workflows": sorted(wasteful_workflows, 
                                        key=lambda x: x["potential_savings"], 
                                        reverse=True),
            "total_analyzed": len(workflow_outputs)
        }


class ProviderComparisonAnalyzer:
    """Compare costs across providers for equivalent tasks"""
    
    def __init__(self, config: DetectionConfig):
        self.config = config
    
    def analyze_provider_efficiency(self, events: List[LLMEvent], pricing_overrides: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Cross-provider cost comparison for equivalent tasks
        Recommend cheaper providers
        """
        from src.utils.pricing import get_model_pricing
        
        # Group by task complexity (token buckets)
        task_groups = defaultdict(lambda: defaultdict(list))
        
        for e in events:
            # Categorize by input/output token range
            task_category = self._categorize_task(e.input_tokens, e.output_tokens)
            provider = self._extract_provider(e.model)
            
            task_groups[task_category][provider].append(e)
        
        comparisons = []
        
        for task_category, provider_events in task_groups.items():
            if len(provider_events) < 2:  # Need at least 2 providers to compare
                continue
            
            # Calculate cost per provider
            provider_costs = {}
            for provider, events_list in provider_events.items():
                total_cost = sum(e.cost for e in events_list)
                avg_cost_per_request = total_cost / len(events_list)
                provider_costs[provider] = {
                    "total_cost": total_cost,
                    "avg_cost_per_request": avg_cost_per_request,
                    "event_count": len(events_list),
                    "events": events_list
                }
            
            # Find cheapest provider
            cheapest_provider = min(provider_costs.items(), 
                                   key=lambda x: x[1]["avg_cost_per_request"])
            
            # Compare others to cheapest
            for provider, metrics in provider_costs.items():
                if provider == cheapest_provider[0]:
                    continue
                
                savings_pct = ((metrics["avg_cost_per_request"] - cheapest_provider[1]["avg_cost_per_request"]) / 
                              metrics["avg_cost_per_request"] * 100) if metrics["avg_cost_per_request"] > 0 else 0
                
                if savings_pct > self.config.provider_savings_threshold * 100:
                    potential_savings = metrics["total_cost"] - (
                        cheapest_provider[1]["avg_cost_per_request"] * metrics["event_count"]
                    )
                    
                    comparisons.append({
                        "task_category": task_category,
                        "current_provider": provider,
                        "recommended_provider": cheapest_provider[0],
                        "current_cost": round(metrics["total_cost"], 4),
                        "potential_cost": round(cheapest_provider[1]["avg_cost_per_request"] * metrics["event_count"], 4),
                        "potential_savings": round(potential_savings, 4),
                        "savings_percentage": round(savings_pct, 1),
                        "event_count": metrics["event_count"],
                        "recommendation": f"Switch {task_category} tasks from {provider} to {cheapest_provider[0]}"
                    })
        
        return {
            "comparisons": sorted(comparisons, key=lambda x: x["potential_savings"], reverse=True),
            "total_task_categories": len(task_groups)
        }
    
    def _categorize_task(self, input_tokens: int, output_tokens: int) -> str:
        """Categorize task by complexity"""
        if input_tokens < 500 and output_tokens < 100:
            return "simple_queries"
        elif input_tokens < 2000 and output_tokens < 500:
            return "medium_tasks"
        elif input_tokens > 5000 or output_tokens > 1000:
            return "complex_tasks"
        else:
            return "standard_tasks"
    
    def _extract_provider(self, model: str) -> str:
        """Extract provider from model name"""
        model_lower = model.lower()
        if "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        elif "gemini" in model_lower or "google" in model_lower:
            return "google"
        elif "bedrock" in model_lower:
            return "aws"
        return "unknown"


