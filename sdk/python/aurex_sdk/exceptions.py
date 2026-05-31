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


class AurexRecovered(AurexError):
    """Informational: a failed call was recovered via resilience policy."""

    def __init__(
        self,
        message: str,
        *,
        workflow_id: str | None = None,
        attempt: int | None = None,
        model: str | None = None,
    ):
        super().__init__(message, workflow_id=workflow_id, attempt=attempt, model=model)
        self.workflow_id = workflow_id
        self.attempt = attempt
        self.model = model


class AurexResilienceExhausted(AurexError):
    """All resilience attempts exhausted (enforce mode only)."""

    def __init__(
        self,
        message: str,
        *,
        workflow_id: str | None = None,
        last_error: str | None = None,
    ):
        super().__init__(message, workflow_id=workflow_id, last_error=last_error)
        self.workflow_id = workflow_id
        self.last_error = last_error
