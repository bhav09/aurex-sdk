"""
Aurex Zero-Trust, Local-First SDK
Provides asynchronous, zero-PII auditing for LLM costs and credit scoring.
"""

from .auditor import AurexAuditor, AurexConfig
from .decisions import AurexDecision, AurexAction
from .exceptions import AurexError, AurexBudgetExceeded, AurexBlocked, AurexConfigError

__all__ = [
    "AurexAuditor",
    "AurexConfig",
    "AurexDecision",
    "AurexAction",
    "AurexError",
    "AurexBudgetExceeded",
    "AurexBlocked",
    "AurexConfigError",
]
