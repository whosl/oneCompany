import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAuthorize } from "./authorize.js";

describe("authorize hook — M5", () => {
  it("allows low-risk shell commands without a gate", async () => {
    const authorize = createAuthorize("proj-1", {
      repoPath: "/tmp/repo",
      createGate: vi.fn(),
      waitForGate: vi.fn(),
    });

    await expect(authorize({ kind: "shell", command: "npm test" })).resolves.toEqual({
      allow: true,
    });
  });

  it("denies high-risk shell commands when gate rejects", async () => {
    const authorize = createAuthorize("proj-1", {
      repoPath: "/tmp/repo",
      createGate: vi.fn(() => ({ id: randomUUID(), projectId: "proj-1", gateType: "dangerous_operation" })),
      waitForGate: vi.fn(async () => "reject"),
    });

    await expect(authorize({ kind: "shell", command: "npm install" })).resolves.toEqual({
      allow: false,
      reason: expect.stringContaining("reject"),
    });
  });

  it("allows edits with absolute paths inside the repo", async () => {
    const authorize = createAuthorize("proj-1", {
      repoPath: "/tmp/repo",
      createGate: vi.fn(),
      waitForGate: vi.fn(),
    });

    await expect(
      authorize({ kind: "edit", path: "/tmp/repo/src/add.ts" }),
    ).resolves.toEqual({ allow: true });
  });

  it("denies edits that escape the repo path", async () => {
    const authorize = createAuthorize("proj-1", {
      repoPath: "/tmp/repo",
      createGate: vi.fn(),
      waitForGate: vi.fn(),
    });

    await expect(authorize({ kind: "edit", path: "../outside.ts" })).resolves.toEqual({
      allow: false,
      reason: "Path escapes project root",
    });
  });
});
