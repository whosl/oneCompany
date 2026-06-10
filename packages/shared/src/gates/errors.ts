export class GateResumeFailedError extends Error {
  readonly gateId: string;

  constructor(gateId: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GateResumeFailedError";
    this.gateId = gateId;
  }
}

export class GateResumeConflictError extends Error {
  readonly reason: string;

  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.name = "GateResumeConflictError";
    this.reason = reason;
  }
}
