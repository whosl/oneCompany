import os from "node:os";
import { describe, expect, it } from "vitest";
import { buildSeatbeltProfile, isSeatbeltAvailable, runInSandbox } from "./sandbox.js";

describe("OS-native sandbox (Seatbelt)", () => {
  it("builds a profile that denies network and restricts writes to the repo + tmp", () => {
    const profile = buildSeatbeltProfile("/tmp/repo");
    expect(profile).toContain("(deny network*)");
    expect(profile).toContain("(deny file-write*)");
    expect(profile).toContain("(allow file-write*");
    expect(profile).toContain('"/private/tmp"');
  });

  it("runs approved commands without docker (seatbelt or local fallback)", async () => {
    const result = await runInSandbox(os.tmpdir(), "echo sandboxed");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("sandboxed");
  });

  it("blocks writes outside the project path when seatbelt is available", async () => {
    if (!isSeatbeltAvailable()) return;
    const target = `/Users/.oc-sandbox-test-${Date.now()}`;
    const result = await runInSandbox(os.tmpdir(), `touch ${target}`);
    expect(result.exitCode).not.toBe(0);
  });

  it("allows writes inside the project path", async () => {
    const dir = os.tmpdir();
    const result = await runInSandbox(dir, `touch .oc-sandbox-ok && rm .oc-sandbox-ok`);
    expect(result.exitCode).toBe(0);
  });
});
