import { describe, expect, it } from "vitest";
import {
  assertToolAllowed,
  getIntegrationById,
  listIntegrations,
  registerIntegration,
  resetIntegrationRegistryForTests,
  seedDefaultIntegrations,
} from "./registry.js";

describe("integration registry — M12", () => {
  it("lists P1 integrations plus development-assist MCPs", () => {
    expect(listIntegrations().map((row) => row.id).sort()).toEqual([
      "codegraph",
      "context7",
      "figma",
      "github",
      "playwright",
      "supabase",
      "vercel",
      "web-search",
    ]);
  });

  it("rejects tools outside the allowlist", () => {
    const github = getIntegrationById("github");
    expect(() => assertToolAllowed(github, "delete_repo")).toThrow(/allowlist/);
  });

  it("rejects duplicate registration of unknown integration lookup", () => {
    resetIntegrationRegistryForTests();
    expect(() => getIntegrationById("missing")).toThrow(/not registered/);
    seedDefaultIntegrations();
  });

  it("registers custom integrations", () => {
    resetIntegrationRegistryForTests();
    registerIntegration({
      id: "custom",
      version: "0.1.0",
      protocol: "native",
      mode: "local",
      displayName: "Custom",
      description: "Test connector",
      toolAllowlist: ["ping"],
      permissions: ["read"],
      riskLevel: "low",
      secretRefs: [],
    });
    expect(getIntegrationById("custom").toolAllowlist).toEqual(["ping"]);
    seedDefaultIntegrations();
  });
});
