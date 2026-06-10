import { describe, expect, it } from "vitest";
import {
  normalizeIntegrationId,
  normalizeRequirementIntegrationIds,
} from "./integration-id-normalize.js";

describe("normalizeIntegrationId", () => {
  it("maps aliases and exact ids to registered integrations", () => {
    expect(normalizeIntegrationId("playwright").integrationId).toBe("playwright");
    expect(normalizeIntegrationId("Browser MCP").integrationId).toBe("playwright");
    expect(normalizeIntegrationId("Figma").integrationId).toBe("figma");
    expect(normalizeIntegrationId("GitHub API").integrationId).toBe("github");
  });

  it("returns unknown for unregistered integrations", () => {
    expect(normalizeIntegrationId("stripe").status).toBe("unknown");
    expect(normalizeIntegrationId("").status).toBe("unknown");
  });
});

describe("normalizeRequirementIntegrationIds", () => {
  it("deduplicates normalized ids and collects unknown entries", () => {
    const result = normalizeRequirementIntegrationIds([
      "Browser MCP",
      "figma",
      "Figma design",
      "stripe",
    ]);
    expect(result.normalized).toEqual(["playwright", "figma"]);
    expect(result.unknown).toEqual(["stripe"]);
  });
});
