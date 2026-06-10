import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandExists } from "./command.js";

const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(os.homedir(), ".local", "bin"),
];

/**
 * Resolve the opencode executable. Honors OC_OPENCODE_BIN, then PATH, then common install dirs.
 */
export function resolveOpencodeExecutable(): string | undefined {
  const explicit = process.env.OC_OPENCODE_BIN?.trim();
  if (explicit) {
    if (fs.existsSync(explicit)) {
      return explicit;
    }
    return undefined;
  }

  if (commandExists("opencode")) {
    return "opencode";
  }

  for (const dir of COMMON_BIN_DIRS) {
    const candidate = path.join(dir, "opencode");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Ensure the directory containing opencode is on PATH so @opencode-ai/sdk can spawn it.
 * Call once during API bootstrap (IDE/turbo often omit Homebrew from PATH).
 */
export function ensureOpencodeOnPath(): string | undefined {
  const resolved = resolveOpencodeExecutable();
  if (!resolved) {
    return undefined;
  }

  if (resolved === "opencode") {
    return resolved;
  }

  const dir = path.dirname(resolved);
  const parts = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  if (!parts.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
  }
  return resolved;
}
