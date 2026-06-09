import { describe, expect, it } from "vitest";
import { getEngineReadiness } from "./engine-readiness.js";

describe("engine readiness — M9.5", () => {
  it("reports workflow and opencode readiness flags", () => {
    const readiness = getEngineReadiness();
    expect(typeof readiness.workflowLlmReady).toBe("boolean");
    expect(typeof readiness.opencodeCliReady).toBe("boolean");
    expect(typeof readiness.opencodeModelReady).toBe("boolean");
  });
});
