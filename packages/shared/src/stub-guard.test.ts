import { describe, expect, it } from "vitest";
import { assertStubEngineAllowed, StubModeForbiddenError } from "./stub-guard.js";

describe("stub guard — M13 F-09", () => {
  it("rejects stub engine in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousStub = process.env.OC_USE_STUB_ENGINE;
    process.env.NODE_ENV = "production";
    process.env.OC_USE_STUB_ENGINE = "1";

    try {
      expect(() => assertStubEngineAllowed()).toThrow(StubModeForbiddenError);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousStub === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previousStub;
      }
    }
  });
});
