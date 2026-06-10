import { describe, expect, it, vi } from "vitest";
import { handlePermission, toToolOp } from "./permission-bridge.js";

describe("permission-bridge", () => {
  it("maps shell permissions to ToolOp", () => {
    expect(toToolOp({ kind: "shell", command: "pnpm test" })).toEqual({
      kind: "shell",
      command: "pnpm test",
    });
  });

  it("maps opencode bash permission metadata to ToolOp", () => {
    expect(
      toToolOp({
        type: "bash",
        metadata: { command: "pnpm vitest run" },
      }),
    ).toEqual({
      kind: "shell",
      command: "pnpm vitest run",
    });
  });

  it("replies once when authorize allows", async () => {
    const reply = vi.fn(async () => ({ data: true }));
    const client = {
      postSessionIdPermissionsPermissionId: reply,
    };

    const decision = await handlePermission(
      client as never,
      "session-1",
      {
        id: "perm-1",
        type: "bash",
        sessionID: "session-1",
        messageID: "msg-1",
        title: "run tests",
        metadata: { command: "pnpm test" },
        time: { created: Date.now() },
      },
      async () => ({ allow: true }),
      { directory: "/tmp/repo" },
    );

    expect(decision).toEqual({ allow: true });
    expect(reply).toHaveBeenCalledWith({
      path: { id: "session-1", permissionID: "perm-1" },
      body: { response: "once" },
      query: { directory: "/tmp/repo" },
    });
  });

  it("rejects when authorize denies", async () => {
    const reply = vi.fn(async () => ({ data: true }));
    const client = {
      postSessionIdPermissionsPermissionId: reply,
    };

    const decision = await handlePermission(
      client as never,
      "session-1",
      {
        id: "perm-2",
        type: "bash",
        sessionID: "session-1",
        messageID: "msg-1",
        title: "dangerous",
        metadata: { command: "rm -rf /" },
        time: { created: Date.now() },
      },
      async () => ({ allow: false, reason: "dangerous" }),
    );

    expect(decision).toEqual({ allow: false, reason: "dangerous" });
    expect(reply).toHaveBeenCalledWith({
      path: { id: "session-1", permissionID: "perm-2" },
      body: { response: "reject" },
      query: undefined,
    });
  });

  it("proxies high-risk shell through governed execution", async () => {
    const reply = vi.fn(async () => ({ data: true }));
    const promptAsync = vi.fn(async () => ({ data: true }));
    const client = {
      postSessionIdPermissionsPermissionId: reply,
      session: { promptAsync },
    };
    const runGovernedCommand = vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    }));

    const decision = await handlePermission(
      client as never,
      "session-1",
      {
        id: "perm-3",
        type: "bash",
        sessionID: "session-1",
        messageID: "msg-1",
        title: "install",
        metadata: { command: "npm install lodash" },
        time: { created: Date.now() },
      },
      async () => ({ allow: true }),
      {
        directory: "/tmp/repo",
        classifyShellRisk: () => "high",
        runGovernedCommand,
      },
    );

    expect(decision).toEqual({ allow: true });
    expect(reply).toHaveBeenCalledWith({
      path: { id: "session-1", permissionID: "perm-3" },
      body: { response: "reject" },
      query: { directory: "/tmp/repo" },
    });
    expect(runGovernedCommand).toHaveBeenCalledWith("npm install lodash");
    expect(promptAsync).toHaveBeenCalled();
  });
});
