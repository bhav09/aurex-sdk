export class AurexError extends Error {
  context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "AurexError";
    this.context = context;
  }
}

export class AurexBudgetExceeded extends AurexError {
  workflowId?: string;
  limit?: string;
  current?: number;

  constructor(
    message: string,
    opts: { workflowId?: string; limit?: string; current?: number } = {},
  ) {
    super(message, opts);
    this.name = "AurexBudgetExceeded";
    this.workflowId = opts.workflowId;
    this.limit = opts.limit;
    this.current = opts.current;
  }
}

export class AurexBlocked extends AurexError {
  workflowId?: string;
  reason?: string;
  action?: string;

  constructor(
    message: string,
    opts: { workflowId?: string; reason?: string; action?: string } = {},
  ) {
    super(message, opts);
    this.name = "AurexBlocked";
    this.workflowId = opts.workflowId;
    this.reason = opts.reason;
    this.action = opts.action;
  }
}
