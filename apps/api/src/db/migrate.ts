import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "./client";

/**
 * Apply all pending Drizzle migrations to the local SQLite database.
 * Run via `npm run db:migrate`.
 */
function runMigrations(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  // migrations live in apps/api/drizzle
  const migrationsFolder = resolve(here, "../../drizzle");

  const { db, close } = createDb();
  try {
    migrate(db, { migrationsFolder });
    // eslint-disable-next-line no-console
    console.log(`[db] Migrations applied from ${migrationsFolder}`);
  } finally {
    close();
  }
}

runMigrations();
