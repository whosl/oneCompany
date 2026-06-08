import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getDbPath } from "./paths.js";

mkdirSync(path.dirname(getDbPath()), { recursive: true });
execSync("drizzle-kit push", { stdio: "inherit", cwd: path.resolve(process.cwd()) });
console.log(`Database ready at ${getDbPath()}`);
