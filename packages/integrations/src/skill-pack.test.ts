import { describe, expect, it } from "vitest";
import path from "node:path";
import { listInstalledSkillPacks, loadSkillPack } from "./skill-pack-loader.js";

describe("skill packs — M12", () => {
  const root = path.resolve(process.cwd(), "../../skill-packs");

  it("loads P1 offline pack manifests", () => {
    const packs = listInstalledSkillPacks(root);
    expect(packs.map((pack) => pack.id).sort()).toEqual([
      "figma-offline",
      "github-offline",
      "playwright-offline",
      "supabase-offline",
      "vercel-offline",
    ]);
  });

  it("loads github offline docs", () => {
    const pack = loadSkillPack("github-offline", root);
    expect(pack.replacesIntegrationIds).toContain("github");
  });
});
