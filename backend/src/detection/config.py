"""
Detection Engine Configuration
Configurable thresholds for all detection algorithms
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class DetectionConfig:
    """
    Configurable thresholds for detection algorithms.
    Allows fine-tuning to reduce false positives and customize sensitivity.
    """
    
    # Context Explosion Detection
    context_explosion_threshold: float = 2.0  # Only flag if context grows 2x+
    explosive_turn_threshold: float = 1.8  # Flag single turns with 1.8x+ growth
    context_explosion_min_turns: int = 2  # Minimum explosive turns to flag
    
    # Agent Loop Detection
    agent_loop_doubling_threshold: float = 2.5  # Context doubling threshold
    agent_loop_min_doublings: int = 2  # Minimum doublings to flag
    
    # Expensive Model Detection
    expensive_model_threshold: float = 2.00  # Input price > $2/1M = expensive
    simple_task_input_threshold: int = 500  # Input tokens < 500 = simple
    simple_task_output_threshold: int = 100  # Output tokens < 100 = simple
    expensive_model_min_requests: int = 3  # Minimum requests to flag
    
    # Prompt Efficiency
    prompt_efficiency_threshold: float = 3.0  # Prompt/completion ratio > 3 = inefficient
    prompt_compression_opportunity_threshold: float = 0.20  # 20%+ compression possible
    
    # Caching Opportunities
    cache_repetition_threshold: int = 3  # Repeated prompts >= 3 times
    cache_min_prompt_tokens: int = 100  # Only cache prompts > 100 tokens
    
    # Output Length Optimization
    output_length_waste_threshold: float = 0.50  # 50%+ of output unused
    output_length_min_tokens: int = 200  # Only flag outputs > 200 tokens
    
    # General Thresholds
    min_cost_threshold: float = 0.05  # Ignore issues < $0.05/week
    min_events_for_analysis: int = 10  # Minimum events needed for analysis
    
    # Provider Comparison
    provider_savings_threshold: float = 0.30  # 30%+ savings to recommend switch
    
    @classmethod
    def from_dict(cls, config_dict: Optional[dict] = None) -> 'DetectionConfig':
        """Create config from dictionary, using defaults for missing values"""
        if not config_dict:
            return cls()
        return cls(**{k: v for k, v in config_dict.items() if hasattr(cls, k)})
    
    def to_dict(self) -> dict:
        """Convert config to dictionary"""
        return {
            'context_explosion_threshold': self.context_explosion_threshold,
            'explosive_turn_threshold': self.explosive_turn_threshold,
            'context_explosion_min_turns': self.context_explosion_min_turns,
            'agent_loop_doubling_threshold': self.agent_loop_doubling_threshold,
            'agent_loop_min_doublings': self.agent_loop_min_doublings,
            'expensive_model_threshold': self.expensive_model_threshold,
            'simple_task_input_threshold': self.simple_task_input_threshold,
            'simple_task_output_threshold': self.simple_task_output_threshold,
            'expensive_model_min_requests': self.expensive_model_min_requests,
            'prompt_efficiency_threshold': self.prompt_efficiency_threshold,
            'prompt_compression_opportunity_threshold': self.prompt_compression_opportunity_threshold,
            'cache_repetition_threshold': self.cache_repetition_threshold,
            'cache_min_prompt_tokens': self.cache_min_prompt_tokens,
            'output_length_waste_threshold': self.output_length_waste_threshold,
            'output_length_min_tokens': self.output_length_min_tokens,
            'min_cost_threshold': self.min_cost_threshold,
            'min_events_for_analysis': self.min_events_for_analysis,
            'provider_savings_threshold': self.provider_savings_threshold,
        }


