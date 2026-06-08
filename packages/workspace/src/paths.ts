import fs from "node:fs";
import path from "node:path";
import { PathEscapeError } from "./types.js";

export function resolveScopedPath(root: string, relativePath: string): string {
  const trimmed = relativePath.trim();
  if (!trimmed) {
    throw new PathEscapeError("Path is required");
  }
  if (trimmed.includes("\0")) {
    throw new PathEscapeError("Null byte in path");
  }
  if (path.isAbsolute(trimmed)) {
    throw new PathEscapeError(`Absolute paths are not allowed: ${relativePath}`);
  }

  const segments = trimmed.split(/[/\\]/);
  if (segments.some((segment) => segment === "..")) {
    throw new PathEscapeError(`Path escapes root: ${relativePath}`);
  }

  const rootResolved = path.resolve(root);
  const resolved = path.resolve(rootResolved, trimmed);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new PathEscapeError(`Path escapes root: ${relativePath}`);
  }

  return resolved;
}

export function assertInsideRepo(root: string, targetPath: string): void {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(targetPath);

  if (targetResolved !== rootResolved && !targetResolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new PathEscapeError(`Path escapes root: ${targetPath}`);
  }

  if (fs.existsSync(targetResolved)) {
    const rootReal = fs.realpathSync(rootResolved);
    const targetReal = fs.realpathSync(targetResolved);
    if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${path.sep}`)) {
      throw new PathEscapeError(`Symlink escapes root: ${targetPath}`);
    }
  }
}
