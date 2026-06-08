import path from "node:path";

/** Resolve `data/app.sqlite` from monorepo root when cwd is `packages/shared`. */
export function getDbPath(): string {
  return path.resolve(process.cwd(), "../../data/app.sqlite");
}
