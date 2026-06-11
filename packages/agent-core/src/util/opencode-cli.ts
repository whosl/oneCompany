import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandExists } from "./command.js";

const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(os.homedir(), ".local", "bin"),
];

const CLI_NAMES = ["mimo", "opencode"] as const;

function resolveFromCommonDirs(name: string): string | undefined {
  for (const dir of COMMON_BIN_DIRS) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Resolve the coding harness CLI (mimo preferred, opencode fallback).
 * Honors OC_OPENCODE_BIN, then PATH, then common install dirs.
 */
export function resolveOpencodeExecutable(): string | undefined {
  const explicit = process.env.OC_OPENCODE_BIN?.trim();
  if (explicit) {
    if (fs.existsSync(explicit)) {
      return explicit;
    }
    return undefined;
  }

  for (const name of CLI_NAMES) {
    if (commandExists(name)) {
      return name;
    }
    const fromDir = resolveFromCommonDirs(name);
    if (fromDir) {
      return fromDir;
    }
  }

  return undefined;
}

export function isMimoCodingCli(executable = resolveOpencodeExecutable()): boolean {
  if (!executable) {
    return false;
  }
  return path.basename(executable) === "mimo";
}

/**
 * Ensure the directory containing a non-PATH coding CLI is on PATH (legacy SDK spawn).
 * Call once during API bootstrap (IDE/turbo often omit Homebrew from PATH).
 */
export function ensureOpencodeOnPath(): string | undefined {
  const resolved = resolveOpencodeExecutable();
  if (!resolved) {
    return undefined;
  }

  if (!path.isAbsolute(resolved)) {
    return resolved;
  }

  const dir = path.dirname(resolved);
  const parts = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  if (!parts.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
  }
  return resolved;
}
