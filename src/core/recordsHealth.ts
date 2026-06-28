// Records health — the data-store half of `tk doctor`. Diagnoses and (under
// `--fix`) repairs the per-project metrics store under ~/.token-killer/projects/*.
//
// The store is keyed by an irreversible fingerprint (`repo:<sha>` = a one-way hash
// of the repo-root path; see dataDir.ts). The DISPLAY name a report shows lives in a
// sibling meta.json (`{label}`), self-healed on every command — but ONLY for the repo
// you are currently in. Buckets you never revisit can therefore drift into two bad
// states that `tk gain --user` then renders verbatim:
//   - ORPHAN: no usable meta.json → gain falls back to a bare hash ("a47085322e05").
//   - DUPLICATE: the SAME repo split across a `repo:<sha>` and a `repo-<sha>` dir (a
//     store copied between POSIX and Windows, where the colon is path-illegal).
// Because the fingerprint is a hash, the name CANNOT be recovered from the store
// alone. Recovery is therefore best-effort: scan a directory for real git repos,
// hash each, and match. Whatever stays unmatched is folded into one `archived`
// bucket so reports never show a hash — the token TOTALS are preserved (the rows are
// merged, not dropped), only the hash-named directories are removed.
//
// Every function is fail-open and keyed off TOKEN_KILLER_HOME (via tokenKillerHome),
// so a test sets that env and operates on a temp store.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import path from "node:path";

import {
  fingerprintSegment,
  projectFingerprint,
  projectLabel,
  projectMetaFileForFingerprint,
  tokenKillerHome,
} from "./dataDir.js";

// The synthetic bucket unmatched orphans are folded into. Not a `repo:` hash, so it
// is never itself flagged as an orphan, and its meta label reads cleanly in reports.
export const ARCHIVE_BUCKET = "archived";
const ARCHIVE_LABEL = "archived";

export type RollupState = "fresh" | "stale" | "corrupt" | "missing" | "empty";

export type BucketHealth = {
  // Raw directory name under projects/ (e.g. "repo:abc…", "repo-abc…", "archived").
  dir: string;
  // Absolute path to the bucket directory.
  path: string;
  // Canonical logical fingerprint (`repo-` folded to `repo:`; synthetic names as-is).
  fingerprint: string;
  // Physical history.jsonl line count (0 when missing/empty).
  historyLines: number;
  rollup: RollupState;
  // Valid label from meta.json, if present and not itself junk (a hash / path).
  label?: string;
  hasMeta: boolean;
  // meta.json exists but is malformed or holds a junk label (cleared on --fix).
  badMeta: boolean;
  // What a report shows TODAY: label ?? short-hash. Surfaced so the report is honest.
  displayName: string;
  // No usable label → a report would render a bare hash. The normalization target.
  orphan: boolean;
  // No history data at all (and no dedup/governance) → a dead directory.
  empty: boolean;
};

export type DupGroup = {
  fingerprint: string;
  // The canonical destination dir name on THIS platform (colon on POSIX, dash on Win).
  canonicalDir: string;
  // The other physical dirs for the same fingerprint that should merge into it.
  duplicates: string[];
};

export type RecordsReport = {
  projectsDir: string;
  buckets: BucketHealth[];
  staleRollups: BucketHealth[];
  emptyBuckets: BucketHealth[];
  orphanBuckets: BucketHealth[];
  dupGroups: DupGroup[];
};

function projectsDir(): string {
  return path.join(tokenKillerHome(), "projects");
}

// `repo-<sha>` (Windows-stored, colon→dash) folds back to the canonical `repo:<sha>`.
// Synthetic dir names (e.g. "archived") and already-canonical names pass through.
export function canonicalFingerprint(dirName: string): string {
  if (dirName.startsWith("repo:")) return dirName;
  if (dirName.startsWith("repo-")) return `repo:${dirName.slice(5)}`;
  return dirName;
}

// Mirror gain.ts's shortFingerprint so the report shows the SAME hash gain would.
function shortHash(fingerprint: string): string {
  return fingerprint.replace(/^repo:/, "").slice(0, 8);
}

// A meta label is JUNK (worse than no label) when it is empty, a path fragment, a
// `repo:`/`repo-` id, a bare hash, or a FLATTENED absolute path that leaked into the
// name slot (the legacy bug — e.g. "-Users-ziyu-Workspace-foo" or Windows
// "C-Users-..."). Such labels are cleared on --fix so the bucket can be re-derived or
// archived rather than rendered as a weird name in a report.
function labelIsJunk(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (trimmed.includes("/") || trimmed.includes("\\")) return true;
  if (/^repo[:-]/.test(trimmed)) return true;
  // A bare hash that leaked into the name slot (8+ hex chars and nothing else). This
  // already covers "label == the short-hash fallback" for real repo: buckets, whose
  // hashes are hex — so there is no separate short-hash-equality check (that would
  // misfire on a synthetic bucket like "archived", whose name is coincidentally 8 chars).
  if (/^[0-9a-f]{8,}$/i.test(trimmed)) return true;
  // Flattened absolute path: a leading separator (POSIX → leading dash) or a
  // "<root>-Users-/-home-/-mnt-/-root-" segment. No real project basename looks like
  // this, so it is safe to treat as junk (and conservative enough not to flag normal
  // dash-cased names like "atlas-agent-e2e").
  if (trimmed.startsWith("-")) return true;
  if (/-(Users|home|mnt|root|var|private)-/.test(trimmed)) return true;
  return false;
}

function countLines(file: string): number {
  try {
    const text = readFileSync(file, "utf8");
    if (!text.trim()) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") count += 1;
    if (!text.endsWith("\n")) count += 1;
    return count;
  } catch {
    return 0;
  }
}

function fileLineCount(file: string): number {
  return existsSync(file) ? countLines(file) : 0;
}

// Read a meta.json label. Returns present/bad flags so the caller can distinguish
// "no meta" from "meta exists but is junk" (both yield no usable label).
function readMeta(metaFile: string): { label?: string; present: boolean; bad: boolean } {
  if (!existsSync(metaFile)) return { present: false, bad: false };
  try {
    const parsed = JSON.parse(readFileSync(metaFile, "utf8")) as { label?: unknown };
    const label = typeof parsed.label === "string" ? parsed.label : undefined;
    if (label === undefined) return { present: true, bad: true };
    if (labelIsJunk(label)) return { present: true, bad: true };
    return { label, present: true, bad: false };
  } catch {
    return { present: true, bad: true };
  }
}

// Classify the rollup cache against the history that is its source of truth. A rollup
// whose recorded source_lines no longer matches the physical history line count is
// STALE (gain would silently rebuild it, but doctor flags it); an unparseable or
// wrong-version rollup is CORRUPT.
function classifyRollup(rollupFile: string, historyLines: number): RollupState {
  if (historyLines === 0) return "empty";
  if (!existsSync(rollupFile)) return "missing";
  try {
    const parsed = JSON.parse(readFileSync(rollupFile, "utf8")) as {
      version?: number;
      source_lines?: number;
    };
    if (parsed.version !== 1) return "corrupt";
    return parsed.source_lines === historyLines ? "fresh" : "stale";
  } catch {
    return "corrupt";
  }
}

function listBucketDirs(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
}

// Read-only scan of the whole metrics store. Pure (no writes); doctor renders it and,
// under --fix, hands the same classification to the repair functions below.
export function diagnoseRecords(): RecordsReport {
  const dir = projectsDir();
  const buckets: BucketHealth[] = [];
  // Group physical dirs by canonical fingerprint to detect repo:/repo- duplicates.
  const byFingerprint = new Map<string, string[]>();

  for (const entry of listBucketDirs(dir)) {
    const bucketPath = path.join(dir, entry.name);
    const fingerprint = canonicalFingerprint(entry.name);
    const historyLines = fileLineCount(path.join(bucketPath, "history.jsonl"));
    const dedupLines = fileLineCount(path.join(bucketPath, "dedup-events.jsonl"));
    const govLines = fileLineCount(path.join(bucketPath, "governance.jsonl"));
    const meta = readMeta(path.join(bucketPath, "meta.json"));
    const rollup = classifyRollup(path.join(bucketPath, "rollup.json"), historyLines);
    const empty = historyLines === 0 && dedupLines === 0 && govLines === 0;
    // What a report shows TODAY (mirrors gain.ts): a usable label, else the short hash.
    const displayName = meta.label ?? shortHash(fingerprint);
    // ORPHAN = has data but the name a report would show is JUNK (a bare hash, or a
    // flattened path that leaked into a legacy bucket's meta). readMeta already filters
    // junk labels to undefined, so this fires only when there is no clean label AND the
    // fallback display is junk — covering both repo: hash buckets and legacy non-repo
    // dirs. A bucket with a clean label (an active project) is never an orphan.
    const orphan = historyLines > 0 && meta.label === undefined && labelIsJunk(displayName);

    buckets.push({
      dir: entry.name,
      path: bucketPath,
      fingerprint,
      historyLines,
      rollup,
      label: meta.label,
      hasMeta: meta.present,
      badMeta: meta.bad,
      displayName,
      orphan,
      empty,
    });

    const group = byFingerprint.get(fingerprint);
    if (group) group.push(entry.name);
    else byFingerprint.set(fingerprint, [entry.name]);
  }

  const dupGroups: DupGroup[] = [];
  for (const [fingerprint, dirs] of byFingerprint) {
    if (dirs.length < 2) continue;
    const canonicalDir = fingerprintSegment(fingerprint);
    const duplicates = dirs.filter((d) => d !== canonicalDir);
    // If the canonical spelling isn't among the dirs, keep the first as destination.
    dupGroups.push({
      fingerprint,
      canonicalDir: dirs.includes(canonicalDir) ? canonicalDir : dirs[0],
      duplicates: dirs.includes(canonicalDir) ? duplicates : dirs.slice(1),
    });
  }

  return {
    projectsDir: dir,
    buckets,
    staleRollups: buckets.filter(
      (b) => b.rollup === "stale" || b.rollup === "corrupt" || b.rollup === "missing",
    ),
    emptyBuckets: buckets.filter((b) => b.empty),
    orphanBuckets: buckets.filter((b) => b.orphan),
    dupGroups,
  };
}

// --- repairs (only called under `tk doctor --fix`) -------------------------

// Concatenate src's content onto dst, guaranteeing a newline boundary so the last
// row of src and the first row of dst never fuse into one corrupt JSONL line.
function appendFileContent(dst: string, src: string): void {
  if (!existsSync(src)) return;
  let text = readFileSync(src, "utf8");
  if (!text) return;
  if (!text.endsWith("\n")) text += "\n";
  appendFileSync(dst, text, { mode: 0o600 });
}

function removeBucketDir(dir: string): void {
  // maxRetries/retryDelay: a Windows AV/handle can briefly hold a just-closed file
  // (EBUSY); a bare rm flakes. Best-effort — a leftover dir is harmless.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* leave it; the next doctor run retries */
  }
}

// Merge each repo:/repo- duplicate pair into one canonical directory (history +
// dedup + governance ledgers concatenated), then remove the redundant dirs. The two
// dirs are the SAME project recorded under two key-spellings at different times, so
// their rows do not overlap; the rollup is rebuilt afterward by rebuildAllRollups.
export function mergeDuplicateBuckets(): { merged: number; details: string[] } {
  const base = projectsDir();
  const { dupGroups } = diagnoseRecords();
  const details: string[] = [];
  let merged = 0;

  for (const group of dupGroups) {
    const destDir = path.join(base, group.canonicalDir);
    try {
      mkdirSync(destDir, { recursive: true, mode: 0o700 });
    } catch {
      continue;
    }
    for (const dupName of group.duplicates) {
      const dupDir = path.join(base, dupName);
      if (dupDir === destDir) continue;
      for (const ledger of ["history.jsonl", "dedup-events.jsonl", "governance.jsonl"]) {
        appendFileContent(path.join(destDir, ledger), path.join(dupDir, ledger));
      }
      removeBucketDir(dupDir);
      merged += 1;
      details.push(`${dupName} → ${group.canonicalDir}`);
    }
  }
  return { merged, details };
}

// Walk `scanRoot` for git repositories (bounded), and return a fingerprint→label map
// the orphan recovery uses to match hash-named buckets back to real project names.
// Stops descending once a `.git` is found (a repo's subdirs share its fingerprint),
// skips node_modules / dot-dirs / symlinks, and caps total dirs visited.
export function scanGitRepos(
  scanRoot: string,
  maxDepth = 8,
  maxDirs = 20_000,
): Map<string, string> {
  const found = new Map<string, string>();
  let visited = 0;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: path.resolve(scanRoot), depth: 0 }];

  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    if (visited >= maxDirs) break;
    visited += 1;

    if (existsSync(path.join(dir, ".git"))) {
      try {
        found.set(projectFingerprint(dir), projectLabel(dir));
      } catch {
        /* unreadable path — skip */
      }
      continue; // do not descend into a repo
    }
    if (depth >= maxDepth) continue;

    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return found;
}

function writeMetaLabel(fingerprint: string, label: string): void {
  const metaFile = projectMetaFileForFingerprint(fingerprint);
  mkdirSync(path.dirname(metaFile), { recursive: true, mode: 0o700 });
  writeFileSync(metaFile, `${JSON.stringify({ label })}\n`, { encoding: "utf8", mode: 0o600 });
}

// Recover real project names for orphan (hash-named) buckets by matching their
// fingerprint against the repos found under `scanRoot`. Writes meta.json for each
// match. Returns the names recovered and the count still unmatched.
export function recoverOrphanNames(scanRoot: string): {
  recovered: Array<{ fingerprint: string; label: string }>;
  unmatched: number;
} {
  const repoMap = scanGitRepos(scanRoot);
  const { orphanBuckets } = diagnoseRecords();
  const recovered: Array<{ fingerprint: string; label: string }> = [];
  let unmatched = 0;

  for (const bucket of orphanBuckets) {
    const label = repoMap.get(bucket.fingerprint);
    if (label) {
      writeMetaLabel(bucket.fingerprint, label);
      recovered.push({ fingerprint: bucket.fingerprint, label });
    } else {
      unmatched += 1;
    }
  }
  return { recovered, unmatched };
}

// Fold every still-orphan (hash-named, unrecoverable) bucket into one `archived`
// bucket: append its history into archived/history.jsonl (TOKEN TOTALS PRESERVED),
// then delete the hash-named directory. The result is a single clean "archived" row
// in reports instead of N bare hashes. Also clears junk meta on non-orphan buckets so
// a malformed label can't survive. Rollups are rebuilt by the caller afterward.
export function archiveUnresolvedOrphans(): { archived: number; details: string[] } {
  const base = projectsDir();
  const report = diagnoseRecords();
  const details: string[] = [];

  // Clear junk meta on buckets that still have a usable identity path (so a bad label
  // is removed; the bucket then self-heals or, if it has no name, archives below).
  for (const bucket of report.buckets) {
    if (bucket.badMeta && !bucket.orphan) {
      try {
        rmSync(path.join(bucket.path, "meta.json"), { force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  const orphans = report.orphanBuckets;
  if (orphans.length === 0) return { archived: 0, details };

  const archiveDir = path.join(base, ARCHIVE_BUCKET);
  try {
    mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  } catch {
    return { archived: 0, details };
  }
  const archiveHist = path.join(archiveDir, "history.jsonl");

  let archived = 0;
  for (const bucket of orphans) {
    appendFileContent(archiveHist, path.join(bucket.path, "history.jsonl"));
    // Preserve the dedup/governance ledgers too, so no measured dimension is lost.
    appendFileContent(
      path.join(archiveDir, "dedup-events.jsonl"),
      path.join(bucket.path, "dedup-events.jsonl"),
    );
    appendFileContent(
      path.join(archiveDir, "governance.jsonl"),
      path.join(bucket.path, "governance.jsonl"),
    );
    removeBucketDir(bucket.path);
    archived += 1;
    details.push(bucket.displayName);
  }
  // Stamp the clean display label and drop any stale rollup so it rebuilds from the
  // freshly-merged history.
  writeFileSync(
    path.join(archiveDir, "meta.json"),
    `${JSON.stringify({ label: ARCHIVE_LABEL })}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  try {
    rmSync(path.join(archiveDir, "rollup.json"), { force: true });
  } catch {
    /* best-effort */
  }
  return { archived, details };
}

// Remove truly-dead directories (no history, dedup, or governance data). These never
// appear in gain (the readers skip zero-history buckets) — pure hygiene.
export function pruneEmptyBuckets(): { pruned: number; details: string[] } {
  const { emptyBuckets } = diagnoseRecords();
  const details: string[] = [];
  for (const bucket of emptyBuckets) {
    if (bucket.dir === ARCHIVE_BUCKET) continue;
    removeBucketDir(bucket.path);
    details.push(bucket.dir);
  }
  return { pruned: details.length, details };
}

// Rebuild every stale/corrupt/missing rollup cache from its history.jsonl (the source
// of truth). Delegates to listProjectRollups, which already rebuilds-and-persists any
// rollup whose stamp no longer matches its history — so this both repairs caches and
// regenerates the archived bucket's rollup after a merge. Returns how many were stale.
export async function rebuildAllRollups(): Promise<number> {
  const before = diagnoseRecords().staleRollups.length;
  try {
    const { listProjectRollups } = await import("./rollup.js");
    await listProjectRollups();
  } catch {
    /* fail-open: a rebuild failure leaves the (stale) cache, gain still recomputes */
  }
  return before;
}

function statSafe(p: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

// True when the metrics store directory exists at all (nothing to diagnose otherwise).
export function recordsStoreExists(): boolean {
  return statSafe(projectsDir())?.isDirectory() ?? false;
}
