import { describe, expect, it } from "vitest";
import { getSection18AcceptanceManifest } from "./section-18-manifest.js";

describe("spec §18 acceptance manifest — M11", () => {
  it("tracks every MVP acceptance criterion with a probe", () => {
    const manifest = getSection18AcceptanceManifest();
    expect(manifest).toHaveLength(18);
    expect(new Set(manifest.map((item) => item.id)).size).toBe(manifest.length);
    expect(manifest.every((item) => item.criterion.length > 0)).toBe(true);
    expect(manifest.every((item) => item.probe.length > 0)).toBe(true);
    expect(manifest.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "requirement-confirm",
        "docker-run-instructions",
        "delivery-report",
        "final-acceptance",
      ]),
    );
  });
});
