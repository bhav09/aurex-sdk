"""
Aurex Zero-Trust, Local-First SDK
Protects LLM spend before, during, and after every call.
"""

from .auditor import AurexAuditor, AurexConfig
from .exceptions import (
    AurexError,
    AurexBudgetExceeded,
    AurexBlocked,
    AurexConfigError,
    AurexProviderDriftError,
    AurexProviderWarning,
    AurexRecovered,
    AurexResilienceExhausted,
)
from .resilience import ResiliencePolicy

__version__ = "0.5.3"


def patch_all(client=None):
    """Auto-detect and patch all installed LLM provider libraries."""
    if client is None:
        client = AurexAuditor()
    if isinstance(client, AurexAuditor):
        client.patch_all()
    return client


# Backwards-compatible alias
AurexClient = AurexAuditor


__all__ = [
    "__version__",
    "AurexAuditor",
    "AurexClient",
    "AurexConfig",
    "AurexError",
    "AurexBudgetExceeded",
    "AurexBlocked",
    "AurexConfigError",
    "AurexProviderDriftError",
    "AurexProviderWarning",
    "AurexRecovered",
    "AurexResilienceExhausted",
    "ResiliencePolicy",
    "patch_all",
]
