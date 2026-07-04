/**
 * Runtime assertions for `ctx doctor` (CTX-IMPL sqlite.ts header): Node ≥22.13
 * (node:sqlite present; `--experimental-sqlite` unflagged from 22.13) and the
 * bundled SQLite library ≥3.43 (contentless-FTS + the features the store DDL
 * relies on). Read-only — doctor REPORTS, it never mutates the runtime.
 */
import { DatabaseSync } from "node:sqlite";

export const MIN_NODE = "22.13.0";
export const MIN_SQLITE = "3.43.0";

/** Compare dotted numeric versions; trailing/prerelease tags are ignored. */
export function compareVersion(a: string, b: string): number {
  const pa = a.split(/[-+]/, 1)[0]!.split(".");
  const pb = b.split(/[-+]/, 1)[0]!.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i] ?? 0);
    const nb = Number(pb[i] ?? 0);
    if (Number.isNaN(na) || Number.isNaN(nb)) continue;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/** The running Node version (major.minor.patch). */
export function nodeVersion(): string {
  return process.versions.node;
}

/** The SQLite library version node:sqlite is linked against. */
export function sqliteVersion(): string {
  const db = new DatabaseSync(":memory:");
  try {
    const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
    return row.v;
  } finally {
    db.close();
  }
}
