import { describe, expect, it } from "vitest";
import { handlePermission, toToolOp } from "./permission-bridge.js";

describe("permission-bridge", () => {
  it("maps shell permissions to ToolOp", () => {
    expect(toToolOp({ kind: "shell", command: "pnpm test" })).toEqual({
      kind: "shell",
      command: "pnpm test",
    });
  });

  it("allows low-risk operations via authorize callback", async () => {
    const decision = await handlePermission(
      {},
      "session-1",
      { kind: "read", path: "src/a.ts" },
      async () => ({ allow: true }),
    );
    expect(decision).toEqual({ allow: true });
  });

  it("blocks high-risk operations when authorize denies", async () => {
    const decision = await handlePermission(
      {},
      "session-1",
      { kind: "shell", command: "rm -rf /" },
      async () => ({ allow: false, reason: "dangerous" }),
    );
    expect(decision).toEqual({ allow: false, reason: "dangerous" });
  });
});
