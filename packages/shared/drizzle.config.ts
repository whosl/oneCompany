import { defineConfig } from "drizzle-kit";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "../../data/app.sqlite");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
