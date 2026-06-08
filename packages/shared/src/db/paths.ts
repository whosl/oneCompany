import path from "node:path";

/** Resolve `data/app.sqlite` from monorepo root when cwd is `packages/shared`. */
export function getDbPath(): string {
  if (process.env.OC_TEST_DB_PATH) {
    return process.env.OC_TEST_DB_PATH;
  }
  return path.resolve(process.cwd(), "../../data/app.sqlite");
}
