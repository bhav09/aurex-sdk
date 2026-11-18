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

export class AurexRecovered extends AurexError {
  workflowId?: string;
  attempt?: number;
  model?: string;

  constructor(
    message: string,
    opts: { workflowId?: string; attempt?: number; model?: string } = {},
  ) {
    super(message, opts);
    this.name = "AurexRecovered";
    this.workflowId = opts.workflowId;
    this.attempt = opts.attempt;
    this.model = opts.model;
  }
}

export class AurexResilienceExhausted extends AurexError {
  workflowId?: string;
  lastError?: string;

  constructor(
    message: string,
    opts: { workflowId?: string; lastError?: string } = {},
  ) {
    super(message, opts);
    this.name = "AurexResilienceExhausted";
    this.workflowId = opts.workflowId;
    this.lastError = opts.lastError;
  }
}

export class AurexProviderDriftError extends AurexError {
  provider: string;
  providerVersion?: string;
  sdkVersion?: string;
  missingSymbol?: string;

  constructor(
    message: string,
    opts: { provider: string; providerVersion?: string; sdkVersion?: string; missingSymbol?: string },
  ) {
    super(message, opts);
    this.name = "AurexProviderDriftError";
    this.provider = opts.provider;
    this.providerVersion = opts.providerVersion ?? opts.sdkVersion;
    this.sdkVersion = opts.sdkVersion ?? opts.providerVersion;
    this.missingSymbol = opts.missingSymbol;
  }
}
