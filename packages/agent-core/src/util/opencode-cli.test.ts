import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isMimoCodingCli, resolveOpencodeExecutable } from "./opencode-cli.js";

describe("opencode cli resolution", () => {
  const originalBin = process.env.OC_OPENCODE_BIN;
  const originalPath = process.env.PATH;

  afterEach(() => {
    if (originalBin === undefined) delete process.env.OC_OPENCODE_BIN;
    else process.env.OC_OPENCODE_BIN = originalBin;
    process.env.PATH = originalPath;
  });

  it("honors OC_OPENCODE_BIN when the file exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-opencode-"));
    const bin = path.join(dir, "opencode");
    fs.writeFileSync(bin, "#!/bin/sh\n", { mode: 0o755 });
    process.env.OC_OPENCODE_BIN = bin;
    expect(resolveOpencodeExecutable()).toBe(bin);
  });

  it("detects mimo when OC_OPENCODE_BIN points to mimo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-mimo-"));
    const bin = path.join(dir, "mimo");
    fs.writeFileSync(bin, "#!/bin/sh\n", { mode: 0o755 });
    process.env.OC_OPENCODE_BIN = bin;
    expect(resolveOpencodeExecutable()).toBe(bin);
    expect(isMimoCodingCli(bin)).toBe(true);
  });
});
