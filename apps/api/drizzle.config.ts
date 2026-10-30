import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for SQLite.
 * Migrations are emitted to ./drizzle and applied with `npm run db:migrate`.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/tourest.db",
  },
  strict: true,
  verbose: true,
});
