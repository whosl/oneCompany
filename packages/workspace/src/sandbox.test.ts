import { describe, expect, it, vi } from "vitest";
import * as sandbox from "./sandbox.js";
import { DockerUnavailableError } from "./sandbox.js";

describe("docker sandbox — M5", () => {
  it("reports docker availability without throwing", async () => {
    const available = await sandbox.isDockerAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("throws when docker is unavailable instead of running locally", async () => {
    vi.spyOn(sandbox, "isDockerAvailable").mockResolvedValue(false);

    await expect(sandbox.runInSandbox("/tmp/repo", "rm -rf node_modules")).rejects.toBeInstanceOf(
      DockerUnavailableError,
    );
  });
});
