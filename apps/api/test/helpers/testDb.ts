import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb } from "../../src/db/client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../../drizzle");

export interface TestDb {
  databasePath: string;
  cleanup: () => void;
}

/**
 * Create a throwaway, migrated SQLite database in a temp dir for tests.
 * Returns the path so a container can open the same file.
 */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), "tourest-test-"));
  const databasePath = join(dir, "test.db");

  const handle = createDb(databasePath);
  migrate(handle.db, { migrationsFolder });
  handle.close();

  return {
    databasePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
