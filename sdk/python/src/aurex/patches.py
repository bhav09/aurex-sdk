"""Optional monkey-patches for OpenAI, Anthropic, LiteLLM."""

from __future__ import annotations

from typing import Any, Callable

from aurex.auditor import AurexAuditor


def _usage_tokens(usage: Any) -> tuple[int, int]:
    if usage is None:
        return 0, 0
    if isinstance(usage, dict):
        return int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0), int(
            usage.get("completion_tokens") or usage.get("output_tokens") or 0
        )
    return (
        int(getattr(usage, "prompt_tokens", None) or getattr(usage, "input_tokens", 0) or 0),
        int(getattr(usage, "completion_tokens", None) or getattr(usage, "output_tokens", 0) or 0),
    )


def patch_openai() -> None:
    try:
        from openai.resources.chat.completions import Completions
    except ImportError:
        return
    if getattr(Completions.create, "_aurex_patched", False):
        return
    auditor = AurexAuditor.get_instance()
    orig = Completions.create

    def wrapped(self, *args: Any, **kwargs: Any):
        model = kwargs.get("model", "unknown")
        result = orig(self, *args, **kwargs)
        usage = getattr(result, "usage", None)
        inp, out = _usage_tokens(usage)
        auditor.log_event(model=model, input_tokens=inp, output_tokens=out, provider="openai")
        return result

    wrapped._aurex_patched = True  # type: ignore[attr-defined]
    Completions.create = wrapped  # type: ignore[method-assign]


def patch_anthropic() -> None:
    try:
        import anthropic
    except ImportError:
        return
    Messages = anthropic.resources.messages.Messages
    if getattr(Messages.create, "_aurex_patched", False):
        return
    auditor = AurexAuditor.get_instance()
    orig = Messages.create

    def wrapped(self, *args: Any, **kwargs: Any):
        model = kwargs.get("model", "unknown")
        result = orig(self, *args, **kwargs)
        usage = getattr(result, "usage", None)
        inp, out = _usage_tokens(usage)
        auditor.log_event(model=model, input_tokens=inp, output_tokens=out, provider="anthropic")
        return result

    wrapped._aurex_patched = True  # type: ignore[attr-defined]
    Messages.create = wrapped  # type: ignore[method-assign]


def patch_litellm() -> None:
    try:
        import litellm
    except ImportError:
        return
    if getattr(litellm.completion, "_aurex_patched", False):
        return
    auditor = AurexAuditor.get_instance()
    orig: Callable[..., Any] = litellm.completion

    def wrapped(*args: Any, **kwargs: Any):
        model = kwargs.get("model", "unknown")
        result = orig(*args, **kwargs)
        usage = result.get("usage") if isinstance(result, dict) else getattr(result, "usage", None)
        inp, out = _usage_tokens(usage)
        auditor.log_event(model=model, input_tokens=inp, output_tokens=out, provider="litellm")
        return result

    wrapped._aurex_patched = True  # type: ignore[attr-defined]
    litellm.completion = wrapped
