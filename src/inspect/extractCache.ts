// Cross-invocation, per-file extraction cache for `tk inspect`.
//
// The scan + habits analyzers parse every transcript / session file line-by-line —
// the dominant cost of `tk inspect`. Within ONE run the FileCache dedups the *read*;
// this cache dedups the *parse* ACROSS runs. After the first scan, an unchanged file
// is served from a tiny pre-extracted record instead of being re-parsed — so repeated
// `inspect` / `optimize` (which triggers inspect) / `--fail-on` runs only pay for
// files that are NEW or CHANGED since last time.
//
// Hard rules (this ships to the whole varied install base — it can never break or
// stale-poison inspect):
//  • Keyed strictly on (path, mtimeMs, size, SCHEMA_VERSION). Any mismatch is a miss.
//  • Best-effort: every disk op is wrapped — a read/parse/write failure falls back to
//    a live parse, never throws. A corrupt entry is a miss, not an error.
//  • Kill-switch: `TK_NO_SCAN_CACHE` (any non-empty, non-"0" value) disables it.
//  • Bounded: entries older than MAX_AGE_MS are pruned opportunistically so the dir
//    can't grow without limit as transcript files come and go.

import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// Bump when the cached payload shape (FileScanExtract / FileHabitExtract) changes,
// so old entries miss instead of deserializing into the wrong shape.
export const CACHE_SCHEMA_VERSION = 1;

// Prune cached entries whose file mtime is older than this (30 days). The key already
// guarantees correctness; this only bounds disk growth.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CacheKey = { mtimeMs: number; size: number };

export interface ExtractCache<T> {
  // Return the cached payload for `file` iff an entry exists whose (mtimeMs, size)
  // match `key` and whose schema matches. Any miss / failure returns undefined.
  get(file: string, key: CacheKey): T | undefined;
  // Store `payload` for `file` under `key`. Best-effort; never throws.
  set(file: string, key: CacheKey, payload: T): void;
}

// A no-op cache (kill-switch on, or tests that want the live path).
export function makeNoopCache<T>(): ExtractCache<T> {
  return { get: () => undefined, set: () => {} };
}

export function cacheDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.TK_NO_SCAN_CACHE;
  return Boolean(v) && v !== "0";
}

type Envelope<T> = {
  v: number; // schema version
  m: number; // mtimeMs
  s: number; // size
  p: T; // payload
};

// One cache file per (namespace, source path). The filename is a hash of the absolute
// source path so arbitrary paths map to a safe, fixed-length name.
function entryPath(dir: string, file: string): string {
  const hash = createHash("sha256").update(file).digest("hex").slice(0, 32);
  return join(dir, `${hash}.json`);
}

// Build a disk-backed cache rooted at `<root>/<namespace>/`. `namespace` separates
// the scan and habits payloads (different shapes) so one never deserializes the other.
export function makeDiskExtractCache<T>(
  root: string,
  namespace: string,
  env: NodeJS.ProcessEnv = process.env,
): ExtractCache<T> {
  if (cacheDisabled(env)) return makeNoopCache<T>();
  const dir = join(root, namespace);
  let ready = false;
  function ensureDir(): boolean {
    if (ready) return true;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      // The dir can hold command/tool labels (sanitized) — keep it owner-only, and
      // retroactively tighten one an older tk version may have created world-listable.
      chmodSync(dir, 0o700);
      ready = true;
    } catch {
      ready = false;
    }
    return ready;
  }

  return {
    get(file: string, key: CacheKey): T | undefined {
      try {
        const raw = readFileSync(entryPath(dir, file), "utf8");
        const parsed = JSON.parse(raw) as Envelope<T>;
        if (parsed.v !== CACHE_SCHEMA_VERSION) return undefined;
        if (parsed.m !== key.mtimeMs || parsed.s !== key.size) return undefined;
        return parsed.p;
      } catch {
        return undefined;
      }
    },
    set(file: string, key: CacheKey, payload: T): void {
      if (!ensureDir()) return;
      const envelope: Envelope<T> = {
        v: CACHE_SCHEMA_VERSION,
        m: key.mtimeMs,
        s: key.size,
        p: payload,
      };
      try {
        writeFileSync(entryPath(dir, file), JSON.stringify(envelope), { mode: 0o600 });
      } catch {
        // Best-effort: a write failure just means the next run re-parses this file.
      }
    },
  };
}

// Stat a source file into a cache key. Returns undefined when the file can't be
// stat'd (the caller then takes the live path and does not cache).
export function statKey(file: string): CacheKey | undefined {
  try {
    const st = statSync(file);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return undefined;
  }
}

// Opportunistically drop cache entries whose own file mtime is older than MAX_AGE_MS.
// Called once per inspect run; bounded, best-effort, never throws. Keyed on the CACHE
// file's age (not the source's) so a long-untouched entry is reclaimed even if its
// source path is gone.
export function pruneCache(
  root: string,
  nowMs: number,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (cacheDisabled(env)) return;
  for (const namespace of ["scan", "scan-events", "habits"]) {
    const dir = join(root, namespace);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const p = join(dir, name);
      try {
        if (nowMs - statSync(p).mtimeMs > MAX_AGE_MS) rmSync(p, { force: true });
      } catch {
        // ignore — a file we couldn't stat/remove is left for the next run.
      }
    }
  }
}
