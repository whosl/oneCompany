export class StubModeForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StubModeForbiddenError";
  }
}

function isStubAllowedEnv(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  // vitest sets VITEST="true" while NODE_ENV may stay "development" under
  // pnpm/turbo; accept both signals (mirrors loop-policy and checkpointer).
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.OC_ALLOW_STUB === "1"
  );
}

export function assertStubEngineAllowed(): void {
  if (process.env.OC_USE_STUB_ENGINE !== "1") {
    return;
  }
  if (!isStubAllowedEnv()) {
    throw new StubModeForbiddenError(
      "OC_USE_STUB_ENGINE is only allowed when NODE_ENV=test or OC_ALLOW_STUB=1 (never in production)",
    );
  }
}

export function assertTestingFixtureAllowed(): void {
  if (process.env.OC_TESTING_FIXTURE !== "1") {
    return;
  }
  if (!isStubAllowedEnv()) {
    throw new StubModeForbiddenError(
      "OC_TESTING_FIXTURE is only allowed when NODE_ENV=test or OC_ALLOW_STUB=1 (never in production)",
    );
  }
}

export function isDegradedStubMode(): boolean {
  return process.env.OC_USE_STUB_ENGINE === "1" || process.env.OC_TESTING_FIXTURE === "1";
}
