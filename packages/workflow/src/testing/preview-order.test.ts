import { describe, expect, it } from "vitest";
import { runPlaywright } from "@oc/workspace";
import { assertPreviewBeforePlaywright } from "./engine.js";

describe("preview order", () => {
  it("rejects playwright without preview URL", async () => {
    expect(() => assertPreviewBeforePlaywright(undefined)).toThrow(/preview URL/i);

    const result = await runPlaywright(
      {
        shell: {
          db: {} as never,
          projectId: "p1",
          repoPath: "/tmp",
          logsPath: "/tmp/logs",
          createGate: () => ({ id: "g1", projectId: "p1", gateType: "x" }),
          waitForGate: async () => "approve",
          runLocal: async () => ({ exitCode: 0, stdout: "{}", stderr: "" }),
          runSandbox: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          isDockerAvailable: () => false,
        },
        repoPath: "/tmp",
      },
      { suite: "final:playwright", command: "echo", previewUrl: undefined },
    );
    expect(result.status).toBe("failed");
    expect(result.details).toMatch(/preview URL/i);
  });
});
