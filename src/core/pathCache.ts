import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveBinaryPath } from "../executor.js";
import { ensureTokenKillerHome, tokenKillerHome } from "./dataDir.js";

// Persistent memo of the Windows PATH×PATHEXT walk for the HOOK path (2.1 item 4).
// The shim wrapper bakes TK_REAL_BIN so the command-proxy path skips the walk, but a
// hook invocation has no wrapper env — so it would re-walk PATH on every tool event.
// We cache the resolved path under ~/.token-killer (so a future AV folder exclusion
// covers it), keyed by a hash of (PATH + PATHEXT): any PATH change opens a fresh
// namespace, and stale entries are simply never read. Every hit is revalidated with
// ONE existsSync, so a moved/uninstalled binary falls back to a fresh walk.
//
// Fail-safe by construction: every read/write/parse error degrades to a direct walk.
// This sits under the hook's "pure and total — never throws" contract.

type CacheShape = Record<string, Record<string, string>>;

// Field separator for hash material: NUL can never appear in a PATH entry or in
// PATHEXT, so it disambiguates the two fields. Built via fromCharCode so the SOURCE
// file holds no literal NUL byte (which would make git/rg treat it as binary and the
// build chunk binary) — only the runtime string contains the NUL.
const FIELD_SEP = String.fromCharCode(0);

function cacheFile(): string {
  return join(tokenKillerHome(), "path-cache.json");
}

// One namespace per (PATH, PATHEXT). A NUL separator keeps the two fields unambiguous.
function envKey(pathValue: string | undefined): string {
  const material = `${pathValue ?? ""}${FIELD_SEP}${process.env.PATHEXT ?? ""}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function readCache(): CacheShape {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(), "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as CacheShape) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape): void {
  try {
    const file = join(ensureTokenKillerHome(), "path-cache.json");
    // Write-then-rename so a concurrent reader (or a crash) never sees a torn file.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    // Best-effort cache: a write failure just means the next call walks again.
  }
}

// Resolve `program` to an absolute path on `pathValue`, memoized across invocations.
// Returns undefined when nothing resolves (NOT negatively cached — a tool installed
// later is picked up on the next call, no invalidation needed). Worst case on a hit
// is one wasted stat (the revalidation) before falling back to a walk.
export function resolveCachedBinary(
  program: string,
  pathValue: string | undefined,
): string | undefined {
  const key = envKey(pathValue);
  const cache = readCache();
  const bucket = cache[key];
  const hit = bucket?.[program];
  if (hit) {
    if (existsSync(hit)) return hit; // one revalidation stat replaces the whole walk
    if (bucket) delete bucket[program]; // stale → drop and re-walk below
  }

  const resolved = resolveBinaryPath(program, pathValue);
  if (resolved) {
    const next = bucket ?? {};
    next[program] = resolved;
    cache[key] = next;
    writeCache(cache);
  }
  return resolved;
}
