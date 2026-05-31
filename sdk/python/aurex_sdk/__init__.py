"""
Aurex Zero-Trust, Local-First SDK
Provides asynchronous, zero-PII auditing for LLM costs and credit scoring.
"""

from .auditor import AurexAuditor, AurexConfig
from .decisions import AurexDecision, AurexAction
from .exceptions import (
    AurexError,
    AurexBudgetExceeded,
    AurexBlocked,
    AurexConfigError,
    AurexRecovered,
    AurexResilienceExhausted,
)
from .resilience import ResiliencePolicy, classify_response, parse_resilience_config

__all__ = [
    "AurexAuditor",
    "AurexConfig",
    "AurexDecision",
    "AurexAction",
    "AurexError",
    "AurexBudgetExceeded",
    "AurexBlocked",
    "AurexConfigError",
    "AurexRecovered",
    "AurexResilienceExhausted",
    "ResiliencePolicy",
    "classify_response",
    "parse_resilience_config",
]
