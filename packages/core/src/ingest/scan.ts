/**
 * Shared source-file scan (CONTEXA-IMPL §4.2/§4.4). Factored out of the 1e docs
 * scan so the code source (2a) and docs source share ONE gitignore-honoring
 * walk — the acceptance bar calls this "the `git ls-files` fast path (1e
 * precedent, shared scan)".
 *
 * In a git work tree the visible file list IS the scan (tracked + untracked-
 * but-not-ignored, `ls-files -co --exclude-standard`), so a dev checkout's
 * git-ignored material (research dumps, scratch plans, build output) never gets
 * indexed. Outside git we fall back to a recursive walk honoring the D13 ignore
 * name-set. Either way the D13 name-set applies per path segment and the D4 size
 * ceiling caps oversized files. Scans yield to the event loop every 1000 entries
 * (the serve path runs this inline and must not block).
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { MAX_FILE_SIZE, isIgnoredDir } from "./ignore.ts";

const YIELD_EVERY = 1000;

export interface ScannedFile {
  /** Project-relative, forward-slashed. */
  path: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

/**
 * Shared-scan TTL (§4.2). The `git ls-files` spawn is the whole cost of a warm
 * file-source dirtyCheck (~11 ms on this dev box; the stats are ~0.5 ms); docs
 * (1e) and code (2a) both scan the same tree, so without sharing a warm
 * all-source dirtyCheck spends two spawns and blows the 20 ms A11 bar. Caching
 * the visible-file list for a short window lets every file source in one refresh
 * cycle reuse ONE spawn. The window also bounds how long a brand-new untracked
 * file can go unseen — the same order as the accepted (size,mtime) blind spot,
 * and `ctx sync` / cold paths clear it.
 */
export const SCAN_CACHE_TTL_MS = 1000;

interface CacheEntry {
  at: number;
  value: Set<string> | undefined;
}
const scanCache = new Map<string, CacheEntry>();

/** Drop the shared-scan cache (cold paths / tests that mutate the tree). */
export function clearScanCache(): void {
  scanCache.clear();
}

/**
 * Tracked + untracked-but-not-ignored paths from git, forward-slashed and
 * relative to `root` (the shared `git ls-files` fast path, cached for
 * SCAN_CACHE_TTL_MS). `undefined` when `root` is not a git work tree or git is
 * unavailable — callers then fall back to a filesystem walk (the D13 name-set
 * still applies, but without .gitignore semantics).
 */
export function gitVisibleSet(
  root: string,
  ttlMs: number = SCAN_CACHE_TTL_MS,
): Set<string> | undefined {
  const now = Date.now();
  const hit = scanCache.get(root);
  if (hit && now - hit.at < ttlMs) return hit.value;
  const value = gitVisibleSetUncached(root);
  scanCache.set(root, { at: now, value });
  return value;
}

function gitVisibleSetUncached(root: string): Set<string> | undefined {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(out.split("\n").filter(Boolean));
  } catch {
    return undefined;
  }
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/** Scan `root` for files whose extension is in `exts` (lower-cased, dotted). */
export async function scanSourceFiles(
  root: string,
  exts: ReadonlySet<string>,
): Promise<ScannedFile[]> {
  const visible = gitVisibleSet(root);
  const out =
    visible !== undefined
      ? await scanFromGitList(root, visible, exts)
      : await scanRecursive(root, exts);
  out.sort((a, b) => a.path.localeCompare(b.path)); // deterministic order
  return out;
}

async function scanFromGitList(
  root: string,
  visible: Set<string>,
  exts: ReadonlySet<string>,
): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  let seen = 0;
  for (const rel of visible) {
    if (++seen % YIELD_EVERY === 0) await new Promise<void>((r) => setImmediate(r));
    if (!exts.has(extOf(rel))) continue;
    if (rel.split("/").some((segment) => isIgnoredDir(segment))) continue;
    const abs = join(root, rel);
    let st: import("node:fs").Stats;
    try {
      st = statSync(abs);
    } catch {
      continue; // listed but gone from the working tree
    }
    if (!st.isFile() || st.size > MAX_FILE_SIZE) continue;
    out.push({ path: rel, abs, size: st.size, mtimeMs: st.mtimeMs });
  }
  return out;
}

async function scanRecursive(root: string, exts: ReadonlySet<string>): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  let seen = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++seen % YIELD_EVERY === 0) await new Promise<void>((r) => setImmediate(r));
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || isIgnoredDir(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!exts.has(extOf(entry.name))) continue;
      let st: import("node:fs").Stats;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.size > MAX_FILE_SIZE) continue; // D4 size ceiling
      out.push({
        path: relative(root, abs).split(sep).join("/"),
        abs,
        size: st.size,
        mtimeMs: st.mtimeMs,
      });
    }
  }
  return out;
}
