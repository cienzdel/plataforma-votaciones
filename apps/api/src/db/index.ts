import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Opens (or creates) the database and applies pending migrations. `secure_delete` overwrites
 * deleted content, so erased data does not stay in free pages (ADR-0018).
 */
export function openDb(path: string, trace?: (sql: string) => void): Db {
  const sqlite = new Database(path, trace === undefined ? {} : { verbose: (s) => trace(String(s)) });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("secure_delete = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}
