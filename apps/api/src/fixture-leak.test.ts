import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiSrc = fileURLToPath(new URL(".", import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(join(apiSrc, relativePath), "utf8");
}

describe("fixture leak guard — M9.5", () => {
  it("web api client does not send fixture profile", () => {
    const apiTs = readFileSync(
      fileURLToPath(new URL("../../web/src/lib/api.ts", import.meta.url)),
      "utf8",
    );
    expect(apiTs).not.toContain('profile: "happy_path"');
  });

  it("production API routes reject fixture profile outside stub mode", () => {
    const requirementRoutes = readSource("requirement/routes.ts");
    const developmentRoutes = readSource("development/routes.ts");
    expect(requirementRoutes).toContain("isFixtureProfileAllowed");
    expect(developmentRoutes).toContain("isFixtureProfileAllowed");
  });
});
