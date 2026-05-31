"""Typed exceptions for Aurex SDK integration and guardrails."""


class AurexError(Exception):
    """Base class for Aurex SDK errors."""

    def __init__(self, message: str, **context):
        super().__init__(message)
        self.message = message
        self.context = context


class AurexConfigError(AurexError):
    """Invalid or conflicting SDK configuration."""


class AurexBudgetExceeded(AurexError):
    """Budget guard threshold exceeded."""

    def __init__(
        self,
        message: str,
        *,
        workflow_id: str | None = None,
        limit: str | None = None,
        current: float | None = None,
    ):
        super().__init__(
            message,
            workflow_id=workflow_id,
            limit=limit,
            current=current,
        )
        self.workflow_id = workflow_id
        self.limit = limit
        self.current = current


class AurexBlocked(AurexError):
    """Pre-call guard blocked the request."""

    def __init__(
        self,
        message: str,
        *,
        workflow_id: str | None = None,
        reason: str | None = None,
        action: str | None = None,
    ):
        super().__init__(
            message,
            workflow_id=workflow_id,
            reason=reason,
            action=action,
        )
        self.workflow_id = workflow_id
        self.reason = reason
        self.action = action
