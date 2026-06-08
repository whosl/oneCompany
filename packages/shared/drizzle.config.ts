import { defineConfig } from "drizzle-kit";
import { getDbPath } from "./src/db/paths.ts";

const dbPath = getDbPath();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
