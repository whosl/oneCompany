import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runLocalCommand } from "./local-exec.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("runLocalCommand", () => {
  it("passes custom env vars to the child process", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "oc-local-exec-"));
    tempDirs.push(cwd);

    const result = await runLocalCommand(
      'node -e "console.log(process.env.OC_TEST_ENV || \'\')"',
      cwd,
      { OC_TEST_ENV: "visible" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("visible");
  });
});
