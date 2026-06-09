import { describe, expect, it } from "vitest";
import { resolveEngineMode } from "./engine-mode.js";

describe("engine mode — M9.5", () => {
  it("defaults to real when OC_USE_STUB_ENGINE is unset", () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    delete process.env.OC_USE_STUB_ENGINE;
    try {
      expect(resolveEngineMode()).toBe("real");
    } finally {
      if (previous === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previous;
      }
    }
  });

  it("uses stub when OC_USE_STUB_ENGINE=1", () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    process.env.OC_USE_STUB_ENGINE = "1";
    try {
      expect(resolveEngineMode()).toBe("stub");
    } finally {
      if (previous === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previous;
      }
    }
  });
});
