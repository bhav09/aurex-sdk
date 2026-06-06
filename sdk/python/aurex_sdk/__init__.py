"""
Aurex Zero-Trust, Local-First SDK
Provides asynchronous, zero-PII auditing for LLM costs and credit scoring.
Token waste prevention platform — detects loops, compresses prompts, routes
to cheaper models, and fails over between providers.
"""

import warnings

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


def patch_openai(client=None):
    """Backward-compatible alias for patch_all().
    
    Deprecated: Use patch_all() instead, which auto-detects and patches
    all installed provider libraries.
    """
    warnings.warn(
        "patch_openai() is deprecated — use patch_all() instead, which "
        "auto-detects and patches all installed provider libraries.",
        DeprecationWarning,
        stacklevel=2,
    )
    return patch_all(client)


# Backwards-compatible alias
AurexClient = AurexAuditor


__all__ = [
    "AurexAuditor",
    "AurexClient",
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
    "patch_all",
    "patch_openai",
    "AurexCompressor",
    "create_self_diagnostics_tool",
    "handle_self_diagnostics_call"
]

from aurex_sdk.compressor import AurexCompressor
from aurex_sdk.diagnostics import create_self_diagnostics_tool, handle_self_diagnostics_call
