/**
 * Forward-only SQL migrations (CTX-IMPL §2 notes + §9 P28 addenda):
 * files named `NNN-<name>.sql`, applied in ascending NNN order, one transaction
 * each; `meta.schema_version` = highest applied NNN. Never a down migration —
 * rollback story is delete-the-store + resync (§11, sources are authoritative).
 *
 * Files are resolved relative to this module, so the same code works from
 * src/ (dev, vitest) and from dist/ (copy-assets mirrors src/**\/*.sql).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./sqlite.ts";

const MIGRATION_FILE = /^(\d{3})-[\w-]+\.sql$/;

export interface MigrationOutcome {
  applied: number[]; // NNN of migrations applied in this run
  schemaVersion: number; // highest applied NNN after the run
}

export function schemaVersionOf(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

export function runMigrations(db: DatabaseSync, dir?: string): MigrationOutcome {
  const migrationsDir = dir ?? fileURLToPath(new URL("./migrations/", import.meta.url));
  // Bootstrap meta outside migrations: schema_version lives there.
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");

  const pending = readdirSync(migrationsDir)
    .map((name) => {
      const m = MIGRATION_FILE.exec(name);
      return m ? { nnn: Number(m[1]), name } : undefined;
    })
    .filter((f): f is { nnn: number; name: string } => f !== undefined)
    .sort((a, b) => a.nnn - b.nnn);

  const current = schemaVersionOf(db);
  const applied: number[] = [];
  for (const file of pending) {
    if (file.nnn <= current) continue;
    const sql = readFileSync(join(migrationsDir, file.name), "utf8");
    transaction(db, () => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(String(file.nnn));
    });
    applied.push(file.nnn);
  }
  return { applied, schemaVersion: schemaVersionOf(db) };
}
