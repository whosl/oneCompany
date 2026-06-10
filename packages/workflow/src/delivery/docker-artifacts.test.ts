import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { artifacts } from "@oc/shared";
import { ensureDeliveryDockerArtifacts } from "./docker-artifacts.js";
import { seedTestingProject, setupTestDb } from "../test-utils.js";

describe("delivery docker artifacts — M11", () => {
  it("generates Dockerfile, compose, and run instructions", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-docker-artifacts-"));
    const { projectId } = seedTestingProject(db, repoPath);
    try {
      const files = ensureDeliveryDockerArtifacts(
        { db },
        {
          projectId,
          repoPath,
        },
      );

      expect(files).toEqual(["Dockerfile", "docker-compose.yml", "RUN.md"]);
      expect(fs.existsSync(path.join(repoPath, "Dockerfile"))).toBe(true);
      expect(fs.existsSync(path.join(repoPath, "docker-compose.yml"))).toBe(true);
      expect(fs.existsSync(path.join(repoPath, "RUN.md"))).toBe(true);
      expect(fs.readFileSync(path.join(repoPath, "Dockerfile"), "utf8")).not.toContain("|| true");
      expect(db.select().from(artifacts).all().map((row) => row.path)).toEqual(
        expect.arrayContaining(["Dockerfile", "docker-compose.yml", "RUN.md"]),
      );
    } finally {
      cleanup();
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
