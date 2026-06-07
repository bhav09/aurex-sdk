"""
Aurex Zero-Trust, Local-First SDK
Provides asynchronous, zero-PII auditing for LLM costs and credit scoring.
Token waste prevention platform — detects loops, compresses prompts, routes
to cheaper models, and fails over between providers.
"""

import warnings

from .auditor import AurexAuditor, AurexConfig
from .exceptions import (
    AurexError,
    AurexBudgetExceeded,
    AurexBlocked,
    AurexConfigError,
)
from .compressor import AurexCompressor


def patch_all(client=None):
    """Auto-detect and patch all installed LLM provider libraries.
    
    Convenience wrapper around AurexAuditor.patch_all(). Safe to call
    multiple times — idempotent.
    
    Args:
        client: An AurexAuditor instance. If None, uses the singleton.
    
    Returns:
        The AurexAuditor instance that was patched.
    """
    if client is None:
        client = AurexAuditor()
    if isinstance(client, AurexAuditor):
        client.patch_all()
    return client


# Backwards-compatible alias
AurexClient = AurexAuditor


__all__ = [
    "AurexAuditor",
    "AurexClient",
    "AurexConfig",
    "AurexError",
    "AurexBudgetExceeded",
    "AurexBlocked",
    "AurexConfigError",
    "patch_all",
    "AurexCompressor",
]
