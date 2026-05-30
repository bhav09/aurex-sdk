"""Aurex Python SDK — zero-code patches for common LLM clients."""

from aurex.auditor import AurexAuditor, mark_failure, mark_success
from aurex.patches import patch_anthropic, patch_litellm, patch_openai

__all__ = [
    "AurexAuditor",
    "mark_success",
    "mark_failure",
    "patch_openai",
    "patch_anthropic",
    "patch_litellm",
]
