import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { env } from "../config/env";
import { schema } from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** Low-level better-sqlite3 handle (exposed for migrations / graceful close). */
export interface DbHandle {
  db: AppDatabase;
  sqlite: Database.Database;
  close: () => void;
}

/**
 * Create a SQLite-backed Drizzle database.
 *
 * The database file and its parent directory are created on demand so the
 * app is truly local-first and works with zero external setup.
 */
export function createDb(databasePath: string = env.DATABASE_PATH): DbHandle {
  const isMemory = databasePath === ":memory:";
  let target = databasePath;

  if (!isMemory) {
    target = resolve(process.cwd(), databasePath);
    const dir = dirname(target);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(target);
  // Pragmas for better local concurrency & integrity.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
