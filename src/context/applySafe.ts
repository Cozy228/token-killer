// Apply + restore for `tk optimize`. `--apply` writes every deterministic
// optimization (frontmatter sets and managed marker blocks) across the resolved
// scopes (user-only off-git; user + project inside a git repo). Free-form
// suggestions are printed for manual review, never written. Before any write the
// full plan is disclosed, and every touched file is backed up under
// ~/.token-killer/backups/context/<ts>/ with a manifest so `--restore` can revert
// the most recent apply.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { readInspectBucket, type ScopeBucket } from "../inspect/persist.js";
import { exposureForSurface, recordOptimizeAction } from "../inspect/optimizeActions.js";
import { estimateTokens, hashText } from "./metrics.js";
import { parseMarkdown } from "./parseMarkdown.js";
import { contextProjectFingerprint, discoverContextFiles, readContextFile } from "./discover.js";
import type { OptimizeArgs, OptimizeDeps } from "./optimizeCli.js";
import {
  resolveLivePath,
  resolveOptimizeScopes,
  selectStaticFindings,
  withSuppressedStdout,
} from "./optimizeCli.js";
import { planForFinding } from "./patchPlan.js";
import type { ContextScope, ContextSurface } from "./types.js";

export const MARKER_START = "<!-- tk:token_budget:start -->";
export const MARKER_END = "<!-- tk:token_budget:end -->";

// Stable, cacheable managed block — no timestamps/IDs (cacheability_churn-clean),
// ≤ 15 lines (DESIGN §5.3). Points at concrete, already-shipped read/rg/tree flags
// instead of generic advice (docs/handler-compression-rg-tree-goal.md Phase 3).
const MANAGED_BLOCK = [
  MARKER_START,
  "## Token Killer — managed token budget",
  "- Large files: `tk read --max-lines 200 <file>` (or `--level aggressive` for a symbol outline).",
  "- Searches: `tk rg <pattern> <path>` scoped to a directory — tk caps results automatically; `--level minimal` keeps every match (deduped, lossless), `--raw` for verbatim.",
  "- Structure: `tk tree <path>` — tk auto-caps oversized directories; `-L <n>` to go shallower.",
  "- Prefer `tk <command>` for any high-output shell command to reduce token pressure.",
  MARKER_END,
].join("\n");

// Default user-level instruction target; overridable so a user-level AGENTS.md
// can be the explicit instruction target (goal "Allowed writes").
export function userTargetPath(home: string): string {
  const override = process.env.TK_USER_AGENT_INSTRUCTIONS;
  if (override && override.length > 0) return override;
  return join(home, ".copilot", "copilot-instructions.md");
}

export function hasMarkerBlock(content: string): boolean {
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

// Idempotent: replace an existing managed block, else append one.
export function insertMarkerBlock(content: string): string {
  if (hasMarkerBlock(content)) {
    const start = content.indexOf(MARKER_START);
    const end = content.indexOf(MARKER_END) + MARKER_END.length;
    return `${content.slice(0, start)}${MANAGED_BLOCK}${content.slice(end)}`;
  }
  const sep = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  const lead = content.length === 0 ? "" : "\n";
  return `${content}${sep}${lead}${MANAGED_BLOCK}\n`;
}

// Removes only the Token Killer managed block; leaves all other content intact.
export function removeMarkerBlock(content: string): string {
  if (!hasMarkerBlock(content)) return content;
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END) + MARKER_END.length;
  let before = content.slice(0, start);
  let after = content.slice(end);
  // Collapse the blank line(s) the block left behind.
  before = before.replace(/\n+$/, "\n");
  after = after.replace(/^\n+/, "");
  if (before === "") return after.replace(/^\n+/, "");
  return `${before}${after}`;
}

function backupTimestamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}

function backupsRoot(): string {
  return join(tokenKillerHome(), "backups", "context");
}

type ManifestEntry = { target: string; backup: string };

// Write a reversible backup of `path` into the timestamp dir for `nowMs`, and
// record it in that dir's manifest.json so `tk optimize --restore` can map the
// backup file back to its original location (the raw path is never inferable
// from the backup filename alone).
export function writeBackup(path: string, content: string, nowMs: number): string {
  const dir = join(backupsRoot(), backupTimestamp(nowMs));
  mkdirSync(dir, { recursive: true });
  const tag = createHash("sha256").update(path).digest("hex").slice(0, 6);
  const backupName = `${basename(path)}.${tag}`;
  writeFileSync(join(dir, backupName), content);

  const manifestPath = join(dir, "manifest.json");
  let entries: ManifestEntry[] = [];
  if (existsSync(manifestPath)) {
    try {
      entries = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[];
    } catch {
      entries = [];
    }
  }
  if (!entries.some((e) => e.target === path)) entries.push({ target: path, backup: backupName });
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2));
  return join(dir, backupName);
}

// Restore the most recent apply: read the latest timestamp dir's manifest and
// copy each backup file back over its original target.
export function runRestore(_nowMs: number): number {
  const root = backupsRoot();
  if (!existsSync(root)) {
    process.stdout.write("tk optimize: nothing to restore (no backups recorded yet).\n");
    return 0;
  }
  const dirs = readdirSync(root)
    .filter((name) => {
      try {
        return statSync(join(root, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort(); // ISO-ish timestamps sort chronologically
  const latest = dirs[dirs.length - 1];
  const manifestPath = latest ? join(root, latest, "manifest.json") : undefined;
  if (!manifestPath || !existsSync(manifestPath)) {
    process.stdout.write("tk optimize: nothing to restore (no restorable backup found).\n");
    return 0;
  }
  let entries: ManifestEntry[];
  try {
    entries = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[];
  } catch {
    process.stderr.write("tk optimize: latest backup manifest is unreadable.\n");
    return 1;
  }
  let restored = 0;
  for (const entry of entries) {
    try {
      const content = readFileSync(join(root, latest!, entry.backup), "utf8");
      mkdirSync(join(entry.target, ".."), { recursive: true });
      writeFileSync(entry.target, content);
      process.stdout.write(`Restored ${entry.target}\n`);
      restored += 1;
    } catch (error) {
      process.stderr.write(
        `tk optimize: could not restore ${entry.target}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  process.stdout.write(`tk optimize: restored ${restored} file(s) from ${latest}.\n`);
  return 0;
}

function miniDiff(path: string, before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const out = [`--- ${path}`, `+++ ${path}`];
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  for (const l of beforeLines) if (!afterSet.has(l)) out.push(`-${l}`);
  for (const l of afterLines) if (!beforeSet.has(l)) out.push(`+${l}`);
  return out.join("\n");
}

// `--backup`: snapshot files BEFORE they are edited (explicit paths, or all
// in-scope context files when none are given), into ONE backup set with a
// manifest. A later `tk optimize --restore` reverts those files to this
// snapshot — so it can undo manual edits an agent makes after this runs.
export function runBackup(args: OptimizeArgs, nowMs: number, home: string, cwd: string): number {
  const targets =
    args.paths.length > 0
      ? args.paths.map((p) => resolveLivePath(p, home, cwd))
      : discoverContextFiles({ scopes: resolveOptimizeScopes(args, cwd), home, cwd }).files.map(
          (f) => f.path,
        );

  let count = 0;
  for (const target of targets) {
    const content = readContextFile(target);
    if (content === undefined) continue;
    writeBackup(target, content, nowMs);
    count += 1;
  }
  if (count === 0) {
    process.stdout.write("tk optimize: nothing to back up (no readable files found).\n");
    return 0;
  }
  process.stdout.write(
    `tk optimize: backed up ${count} file(s) to ${join(backupsRoot(), backupTimestamp(nowMs))}\n`,
  );
  process.stdout.write(
    "Edit the files now; revert everything later with `tk optimize --restore`.\n",
  );
  return 0;
}

// ── Token-budget managed block (insert/remove) ───────────────────────────────

export function applyMarkerBlock(home: string, mode: "insert" | "remove", nowMs: number): number {
  const target = userTargetPath(home);
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";

  if (mode === "remove" && !hasMarkerBlock(existing)) {
    process.stdout.write(`tk: no Token Killer managed block in ${target}\n`);
    return 0;
  }

  const next = mode === "insert" ? insertMarkerBlock(existing) : removeMarkerBlock(existing);
  if (next === existing) {
    process.stdout.write(`tk: ${target} already up to date (idempotent, no change)\n`);
    return 0;
  }

  if (existing.length > 0) {
    const backup = writeBackup(target, existing, nowMs);
    process.stdout.write(`Backup: ${backup}\n`);
  }
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, next);
  process.stdout.write(
    `${mode === "insert" ? "Installed" : "Removed"} Token Killer managed block in ${target}\n`,
  );
  process.stdout.write(`${miniDiff(target, existing, next)}\n`);
  return 0;
}

// ── Frontmatter safe applies (user-level only, explicit --surface) ───────────

function setFrontmatterKey(content: string, key: string, value: unknown): string {
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);
  const newLine = `${key}: ${valueStr}`;
  const lines = content.split("\n");
  if (lines[0]?.trim() === "---") {
    let end = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    if (end !== -1) {
      for (let i = 1; i < end; i += 1) {
        const m = /^(\s*)([A-Za-z0-9_-]+):/.exec(lines[i]);
        if (m && m[2] === key) {
          lines[i] = `${m[1]}${newLine}`;
          return lines.join("\n");
        }
      }
      lines.splice(end, 0, newLine);
      return lines.join("\n");
    }
  }
  return `---\n${newLine}\n---\n${content}`;
}

type PlannedWrite = {
  livePath: string;
  displayFile: string;
  scope: ContextScope;
  surface: ContextSurface;
  original: string;
  next: string;
  type: string;
};

async function triggerInspectForScope(
  deps: OptimizeDeps,
  scope: ContextScope,
  home: string,
  cwd: string,
  nowMs: number,
): Promise<void> {
  const trigger =
    deps.triggerInspect ??
    (async (s: ContextScope, h: string, c: string, n: number) => {
      const mod = await import("../inspect/cli.js");
      await withSuppressedStdout(() =>
        mod.runInspect(s === "user" ? ["--user"] : ["--project"], n, h, c),
      );
    });
  await trigger(scope, home, cwd, nowMs);
}

// `tk optimize --apply` — apply every deterministic optimization across the
// resolved scopes, after disclosing the full plan and backing up each file.
// Free-form `suggested_diff` findings are printed for manual review, never
// written (they are not guaranteed to apply cleanly).
export async function runApply(
  args: OptimizeArgs,
  nowMs: number,
  home: string,
  cwd: string,
  deps: OptimizeDeps,
): Promise<number> {
  const scopes = resolveOptimizeScopes(args, cwd);
  const writes = new Map<string, PlannedWrite>();
  const suggestions: { scope: ContextScope; file: string; diff: string }[] = [];
  const deferred = new Set<string>();

  for (const scope of scopes) {
    const bucketRef: ScopeBucket =
      scope === "user"
        ? { scope: "user" }
        : { scope: "project", fingerprint: contextProjectFingerprint(cwd) };
    let bucket = readInspectBucket(bucketRef);
    if (!bucket) {
      await triggerInspectForScope(deps, scope, home, cwd, nowMs);
      bucket = readInspectBucket(bucketRef);
    }

    for (const finding of selectStaticFindings(bucket, args.surface)) {
      if (!finding.file) continue;
      const livePath = resolveLivePath(finding.file, home, cwd);
      const live = readContextFile(livePath);
      if (live === undefined) continue;
      const outcome = planForFinding(finding, live);
      if (outcome.status !== "ok") continue;

      for (const op of outcome.plan.operations) {
        if (op.kind === "suggested_diff") {
          suggestions.push({ scope, file: finding.file, diff: op.diff });
          continue;
        }
        let next: string | undefined;
        if (op.kind === "frontmatter_set") next = setFrontmatterKey(live, op.key, op.value);
        else if (op.kind === "insert_marker_block") next = insertMarkerBlock(live);
        else if (op.kind === "remove_marker_block") next = removeMarkerBlock(live);
        if (next === undefined || next === live) continue;
        // One auto-write per file per run; further findings on the same file are
        // deferred so a later op never plans against stale content.
        if (writes.has(livePath)) {
          deferred.add(finding.file);
          continue;
        }
        writes.set(livePath, {
          livePath,
          displayFile: finding.file,
          scope,
          surface: finding.surface,
          original: live,
          next,
          type: finding.type,
        });
      }
    }
  }

  // Disclosure — always printed in full before any file is touched.
  process.stdout.write(`# tk optimize --apply (scopes: ${scopes.join(", ")})\n`);
  if (writes.size === 0 && suggestions.length === 0) {
    process.stdout.write("Nothing to optimize — no changes or suggestions found.\n");
    return 0;
  }
  process.stdout.write(`\nChanges to apply (${writes.size}):\n`);
  for (const w of writes.values()) {
    process.stdout.write(`\n[${w.scope}] ${w.displayFile} — ${w.type}\n`);
    process.stdout.write(`${miniDiff(w.displayFile, w.original, w.next)}\n`);
  }
  if (suggestions.length > 0) {
    process.stdout.write(`\nSuggestions for manual review (${suggestions.length}, not applied):\n`);
    for (const s of suggestions) process.stdout.write(`\n[${s.scope}] ${s.file}\n${s.diff}\n`);
  }
  if (deferred.size > 0) {
    process.stdout.write(
      `\nDeferred (multiple changes on one file; re-run \`tk optimize --apply\` to catch these): ${[...deferred].join(", ")}\n`,
    );
  }

  if (writes.size === 0) {
    process.stdout.write(
      `\nNo auto-applicable changes; the ${suggestions.length} suggestion(s) above are for manual review.\n`,
    );
    return 0;
  }

  // Apply with reversible backups.
  let applied = 0;
  for (const w of writes.values()) {
    writeBackup(w.livePath, w.original, nowMs);
    mkdirSync(join(w.livePath, ".."), { recursive: true });
    writeFileSync(w.livePath, w.next);
    applied += 1;
    // Ledger 2: one append-only record per applied action (best-effort, never a
    // path leak — before/after_hash are body hashes in inspect's space).
    try {
      recordOptimizeAction(
        w.scope === "user"
          ? { scope: "user" }
          : { scope: "project", fingerprint: contextProjectFingerprint(cwd) },
        {
          surface: w.surface,
          before_hash: hashText(parseMarkdown(w.original).body),
          after_hash: hashText(parseMarkdown(w.next).body),
          before_tokens: estimateTokens(w.original),
          after_tokens: estimateTokens(w.next),
          exposure_class: exposureForSurface(w.surface),
          ts: new Date(nowMs).toISOString(),
        },
      );
    } catch (error) {
      process.stderr.write(
        `tk optimize: ledger 2 record skipped: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  process.stdout.write(
    `\ntk optimize: applied ${applied} change(s). Backups under ${join(backupsRoot(), backupTimestamp(nowMs))}\n`,
  );
  process.stdout.write("Run `tk optimize --restore` to revert the last apply.\n");
  return 0;
}

export { setFrontmatterKey };
