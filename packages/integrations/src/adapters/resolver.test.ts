import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getIntegrationById } from "../registry.js";
import { clearRealAdaptersForTests, registerRealAdapter, resolveAdapter } from "./resolver.js";

describe("resolveAdapter — unified adapter", () => {
  const previousMode = process.env.OC_INTEGRATION_ADAPTER_MODE;

  beforeEach(() => {
    clearRealAdaptersForTests();
  });

  afterEach(() => {
    if (previousMode === undefined) {
      delete process.env.OC_INTEGRATION_ADAPTER_MODE;
    } else {
      process.env.OC_INTEGRATION_ADAPTER_MODE = previousMode;
    }
    clearRealAdaptersForTests();
  });

  it("returns mock adapters by default", () => {
    delete process.env.OC_INTEGRATION_ADAPTER_MODE;
    const adapter = resolveAdapter(getIntegrationById("figma"));
    expect(adapter.integrationId).toBe("figma");
  });

  it("throws when real mode has no registered adapter", () => {
    process.env.OC_INTEGRATION_ADAPTER_MODE = "real";
    expect(() => resolveAdapter(getIntegrationById("figma"))).toThrow(/No real adapter/);
  });

  it("returns a registered real adapter", () => {
    process.env.OC_INTEGRATION_ADAPTER_MODE = "real";
    registerRealAdapter("figma", {
      integrationId: "figma",
      async callTool() {
        return { ok: true };
      },
    });
    const adapter = resolveAdapter(getIntegrationById("figma"));
    expect(adapter.integrationId).toBe("figma");
  });
});
