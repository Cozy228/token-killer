// ADR 0009 — the persistent, cross-process per-project dedup store. One JSON file
// per project (`projects/<fingerprint>/dedup.json`); the fingerprint is implicit in
// the path, so the in-file key is the normalized command alone. Every hook/shim
// invocation is a fresh process, so the store is on disk and concurrency-safe:
// reads are lock-free (an atomic rename guarantees a complete prior-or-new file),
// writes take a best-effort advisory lock then temp-file + rename. Everything is
// fail-open — a lost update only ever causes under-dedup (a missed suppression),
// never a wrong "unchanged" and never a corrupt store.

import { createHash } from "node:crypto";
import { open, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

import type { ParsedCommand, TtlClass } from "../types.js";

export const TTL_MS: Record<TtlClass, number> = {
  fast: 30_000,
  medium: 120_000,
  slow: 300_000,
};

export type DedupEntry = {
  // The normalized command this entry caches (debug / marker wording).
  normCmd: string;
  // sha256 of the RAW output (ANSI-stripped) — the exact-compare key. Keying on RAW,
  // not the compressed view, keeps dedup honest for lossy/capped handlers: two
  // different raws can compress to identical bytes, and keying on the compressed view
  // would emit a false "unchanged" marker + a stale recovery pointer (H2).
  rawHash: string;
  // Part of identity — never dedup a changed-exit result.
  exitCode: number;
  ttlClass: TtlClass;
  // ms epoch of the last FULL emit (re-anchor reference; not refreshed on a hit).
  lastEmittedAt: number;
  // ms epoch of the last time the output CHANGED (the marker's "unchanged since").
  lastDifferedAt: number;
  // rawStore recovery pointer (relative path) — the marker's "full: <pointer>".
  rawPointer: string;
  // Best-effort session id that established this entry. ATTRIBUTE ONLY — never part
  // of the key; used solely to sharpen marker wording ("in this session" vs "here").
  session_id?: string;
};

const STORE_VERSION = 2 as const; // bumped: rawHash replaces the old compressed-output hash (H2)
type Store = { v: typeof STORE_VERSION; entries: Record<string, DedupEntry> };

const MAX_ENTRIES = 512;
const HARD_TTL_MS = 60 * 60 * 1000; // drop anything older than 1h on write (size bound)

const LOCK_STALE_MS = 2000;
const LOCK_RETRIES = 5;
const LOCK_RETRY_MS = 8;

let tmpCounter = 0;

function emptyStore(): Store {
  return { v: STORE_VERSION, entries: {} };
}

// Normalize the command into the store key form: basename the program so `ls` and
// `/bin/ls` share a key, then join with single spaces. Reuses the parsed command;
// no second parser.
export function normalizeCommand(command: ParsedCommand): string {
  const prog = basename(command.program) || command.program;
  // Join with single spaces at the SEAMS only; never collapse whitespace INSIDE a
  // token, or two distinct commands map to one key — a grep pattern `'foo  bar'`
  // must stay distinct from `'foo bar'`. (Exact rawHash still guards content; this
  // keeps the key — and the marker's command label — honest.)
  return [prog, ...command.args].join(" ").trim();
}

// key = (project_fingerprint, normCmd). The fingerprint is implicit in the file
// path, so the in-file key only needs to be a stable hash of the normalized command.
export function entryKey(normCmd: string): string {
  return createHash("sha256").update(normCmd).digest("hex").slice(0, 24);
}

export function hashOutput(output: string): string {
  return createHash("sha256").update(output).digest("hex");
}

export function isFresh(entry: DedupEntry, now: number): boolean {
  return now - entry.lastEmittedAt <= TTL_MS[entry.ttlClass];
}

// Lock-free read. ENOENT or any corruption → empty store (re-established on the
// next write). The atomic-rename write contract means a reader never sees a torn file.
export async function readStore(file: string): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Store;
    if (
      !parsed ||
      parsed.v !== STORE_VERSION ||
      typeof parsed.entries !== "object" ||
      parsed.entries === null
    ) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

// Read-modify-write under a best-effort advisory lock, then temp + atomic rename.
// Fail-open: a lock we cannot take → the write is SKIPPED (the full output was still
// emitted; the store is simply not updated). Any error leaves the store untouched.
export async function upsertEntry(
  file: string,
  key: string,
  entry: DedupEntry,
  now: number,
): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  } catch {
    return; // can't even create the dir — fail open
  }
  const release = await acquireLock(`${file}.lock`);
  if (!release) return; // contended — skip the write (lost update fails open)
  try {
    const store = await readStore(file);
    store.entries[key] = entry;
    prune(store, now);
    const tmp = `${file}.${process.pid}.${(tmpCounter += 1)}.tmp`;
    await writeFile(tmp, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
    await rename(tmp, file);
  } catch {
    // fail-open: leave the store as-is
  } finally {
    await release();
  }
}

function prune(store: Store, now: number): void {
  for (const [k, e] of Object.entries(store.entries)) {
    if (now - e.lastEmittedAt > HARD_TTL_MS) delete store.entries[k];
  }
  const remaining = Object.entries(store.entries);
  if (remaining.length > MAX_ENTRIES) {
    remaining.sort((a, b) => a[1].lastEmittedAt - b[1].lastEmittedAt);
    for (const [k] of remaining.slice(0, remaining.length - MAX_ENTRIES)) {
      delete store.entries[k];
    }
  }
}

// Advisory lock via exclusive-create. Returns a release fn, or null when the lock
// can't be taken within the bounded retry budget (caller then skips the write).
async function acquireLock(lockPath: string): Promise<(() => Promise<void>) | null> {
  for (let attempt = 0; attempt <= LOCK_RETRIES; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      return async () => {
        try {
          await handle.close();
        } catch {
          /* already closed */
        }
        try {
          await unlink(lockPath);
        } catch {
          /* already removed */
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") return null; // unexpected — fail open
      // Steal a stale lock (a process that died holding it), else back off briefly.
      try {
        const st = await stat(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          await unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        // lock vanished between open and stat — retry immediately
      }
      if (attempt < LOCK_RETRIES) await delay(LOCK_RETRY_MS);
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
