import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runMigrations, schemaVersionOf } from "../../src/store/migrate.ts";
import { openDatabase } from "../../src/store/sqlite.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

describe("migrations (forward-only, NNN-<name>.sql, one transaction each)", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir("ctx-migrate-");
  });
  afterEach(() => {
    cleanupTempDir(dir);
  });

  test("fresh DB: applies 001-init + 002-memory-events and lands the §2 tables", () => {
    const db = openDatabase(join(dir, "store.sqlite"));
    const outcome = runMigrations(db);
    expect(outcome.applied).toEqual([1, 2]); // slice 2 added 002-memory-events
    expect(outcome.schemaVersion).toBe(2);
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    for (const required of [
      "entities",
      "claims",
      "links",
      "conflicts",
      "memory",
      "anchors",
      "handles",
      "cursors",
      "generations",
      "meta",
      "fts",
      "memory_events",
    ]) {
      expect(tables).toContain(required);
    }
    db.close();
  });

  test("re-running is a no-op; schema_version = highest applied NNN", () => {
    const db = openDatabase(join(dir, "store.sqlite"));
    runMigrations(db);
    const again = runMigrations(db);
    expect(again.applied).toEqual([]);
    expect(schemaVersionOf(db)).toBe(2);
    db.close();
  });

  test("applies only migrations above the current version, in NNN order", () => {
    const migrations = join(dir, "migrations");
    mkdirSync(migrations);
    writeFileSync(join(migrations, "001-a.sql"), "CREATE TABLE a (x INTEGER);");
    writeFileSync(join(migrations, "003-c.sql"), "CREATE TABLE c (x INTEGER);");
    writeFileSync(join(migrations, "002-b.sql"), "CREATE TABLE b (x INTEGER);");
    writeFileSync(join(migrations, "junk.txt"), "not a migration");
    const db = new DatabaseSync(join(dir, "custom.sqlite"));
    expect(runMigrations(db, migrations).applied).toEqual([1, 2, 3]);
    expect(schemaVersionOf(db)).toBe(3);
    db.close();
  });

  test("a failing migration rolls back atomically (one transaction each)", () => {
    const migrations = join(dir, "migrations");
    mkdirSync(migrations);
    writeFileSync(
      join(migrations, "001-bad.sql"),
      "CREATE TABLE good (x INTEGER); CREATE TABLE good (x INTEGER);", // dup → error
    );
    const db = new DatabaseSync(join(dir, "bad.sqlite"));
    expect(() => runMigrations(db, migrations)).toThrow();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'good'")
      .all() as unknown[];
    expect(tables).toHaveLength(0); // rolled back
    expect(schemaVersionOf(db)).toBe(0); // version untouched
    db.close();
  });
});
