import { describe, expect, it } from "vitest";
import { IntegrationDefinitionSchema, SkillPackSchema } from "./integration.js";

describe("integration schemas — M12", () => {
  const base = {
    id: "github",
    version: "1.0.0",
    protocol: "native" as const,
    mode: "remote" as const,
    displayName: "GitHub",
    description: "Repository and PR handoff",
    toolAllowlist: ["list_repos", "create_branch"],
    permissions: ["read", "write"] as const,
    riskLevel: "medium" as const,
    secretRefs: ["GITHUB_TOKEN"],
    offlineFallbackSkillPackId: "github-offline",
  };

  it("accepts valid integration definitions", () => {
    expect(IntegrationDefinitionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects embedded secret values", () => {
    const result = IntegrationDefinitionSchema.safeParse({
      ...base,
      displayName: "GitHub sk-live-abcdefghijklmnop",
    });
    expect(result.success).toBe(false);
  });

  it("rejects secret values in secretRefs", () => {
    const result = IntegrationDefinitionSchema.safeParse({
      ...base,
      secretRefs: ["ghp_abcdefghijklmnopqrstuvwxyz1234567890"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts skill pack manifests", () => {
    expect(
      SkillPackSchema.safeParse({
        id: "github-offline",
        version: "1.0.0",
        replacesIntegrationIds: ["github"],
        title: "GitHub Offline",
        description: "Local git workflow recipes",
        capabilities: ["branch", "pr-template"],
        requiredLocalTools: ["git"],
        docsPath: "docs",
      }).success,
    ).toBe(true);
  });
});
