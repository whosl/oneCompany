import fs from "node:fs";
import path from "node:path";

/** 1×1 PNG — enough for mock / recovery paths to be openable in Preview. */
export const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function writeMockPng(
  artifactsPath: string | undefined,
  filename: string,
): { path: string; absolutePath?: string } {
  const relative = filename.includes("/") ? filename : `integrations/${filename}`;
  const artifactRef = relative.startsWith("artifacts/") ? relative : `artifacts/${relative}`;
  if (!artifactsPath) {
    return { path: artifactRef };
  }
  const fullPath = path.join(artifactsPath, relative.replace(/^artifacts\//, ""));
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, MINIMAL_PNG);
  return { path: artifactRef, absolutePath: fullPath };
}
