// Safe apply + restore (goal §"Safe apply rules", §"Slice 6"). Writes ONLY when:
//  - target is user-level, or a Token Guard managed marker block, AND
//  - the operation is fix_class === "safe_mechanical", AND
//  - a reversible backup is written under ~/.token-guard/backups/context/<ts>/.
// The generated diff is always printed. Project files are never modified.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { tokenGuardHome } from "../core/dataDir.js";
import { readInspectBucket, type ScopeBucket } from "../inspect/persist.js";
import { readContextFile } from "./discover.js";
import type { OptimizeArgs, OptimizeDeps } from "./optimizeCli.js";
import {
  resolveLivePath,
  resolveOptimizeScope,
  selectStaticFindings,
  withSuppressedStdout,
} from "./optimizeCli.js";
import { planForFinding } from "./patchPlan.js";
import type { ContextScope } from "./types.js";

export const MARKER_START = "<!-- tg:token_budget:start -->";
export const MARKER_END = "<!-- tg:token_budget:end -->";

// Stable, cacheable managed block — no timestamps/IDs (cacheability_churn-clean),
// ≤ 15 lines (DESIGN §5.3). Points at concrete, already-shipped read/rg/tree flags
// instead of generic advice (docs/handler-compression-rg-tree-goal.md Phase 3).
const MANAGED_BLOCK = [
  MARKER_START,
  "## Token Guard — managed token budget",
  "- Large files: `tg read --max-lines 200 <file>` (or `--level aggressive` for a symbol outline).",
  "- Searches: `tg rg <pattern> <path>` scoped to a directory — tg caps results automatically; `--level minimal` keeps every match (deduped, lossless), `--raw` for verbatim.",
  "- Structure: `tg tree <path>` — tg auto-caps oversized directories; `-L <n>` to go shallower.",
  "- Prefer `tg <command>` for any high-output shell command to reduce token pressure.",
  MARKER_END,
].join("\n");

// Default user-level instruction target; overridable so a user-level AGENTS.md
// can be the explicit instruction target (goal "Allowed writes").
export function userTargetPath(home: string): string {
  const override = process.env.TG_USER_AGENT_INSTRUCTIONS;
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

// Removes only the Token Guard managed block; leaves all other content intact.
export function removeMarkerBlock(content: string): string {
  if (!hasMarkerBlock(content)) return content;
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END) + MARKER_END.length;
  let before = content.slice(0, start);
  let after = content.slice(end);
  // Collapse the blank line(s) the block left behind.
  before = before.replace(/\n+$/, "\n");
  after = after.replace(/^\n+/, "");
  if (before === "" ) return after.replace(/^\n+/, "");
  return `${before}${after}`;
}

function backupTimestamp(nowMs: number): string {
  return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}

export function writeBackup(path: string, content: string, nowMs: number): string {
  const dir = join(tokenGuardHome(), "backups", "context", backupTimestamp(nowMs));
  mkdirSync(dir, { recursive: true });
  const tag = createHash("sha256").update(path).digest("hex").slice(0, 6);
  const dest = join(dir, `${basename(path)}.${tag}`);
  writeFileSync(dest, content);
  return dest;
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

// ── Token-budget managed block (insert/remove) ───────────────────────────────

export function applyMarkerBlock(home: string, mode: "insert" | "remove", nowMs: number): number {
  const target = userTargetPath(home);
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";

  if (mode === "remove" && !hasMarkerBlock(existing)) {
    process.stdout.write(`tg: no Token Guard managed block in ${target}\n`);
    return 0;
  }

  const next = mode === "insert" ? insertMarkerBlock(existing) : removeMarkerBlock(existing);
  if (next === existing) {
    process.stdout.write(`tg: ${target} already up to date (idempotent, no change)\n`);
    return 0;
  }

  if (existing.length > 0) {
    const backup = writeBackup(target, existing, nowMs);
    process.stdout.write(`Backup: ${backup}\n`);
  }
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, next);
  process.stdout.write(`${mode === "insert" ? "Installed" : "Removed"} Token Guard managed block in ${target}\n`);
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

export async function runApplySafe(
  args: OptimizeArgs,
  nowMs: number,
  home: string,
  cwd: string,
  deps: OptimizeDeps,
): Promise<number> {
  // The managed token-budget block is always a user-level write, regardless of scope.
  if (args.tokenBudgetBlock) {
    return applyMarkerBlock(home, "insert", nowMs);
  }

  const scope = resolveOptimizeScope(args);
  if (scope === "project") {
    process.stderr.write(
      "tg optimize: --apply-safe refuses project-level edits. Use --dry-run or --write-advice; pass --user (or --surface skills) for user-level safe applies.\n",
    );
    return 1;
  }

  // Frontmatter safe applies require an explicit surface (goal rules 5 & 7).
  if (!args.surface) {
    process.stderr.write(
      "tg optimize: --apply-safe needs an explicit --surface (e.g. --surface skills) for frontmatter changes.\n",
    );
    return 1;
  }

  const bucketRef: ScopeBucket = { scope: "user" };
  let bucket = readInspectBucket(bucketRef);
  if (!bucket) {
    const trigger =
      deps.triggerInspect ??
      (async (_s: ContextScope, h: string, c: string, n: number) => {
        const mod = await import("../inspect/cli.js");
        await withSuppressedStdout(() => mod.runInspect(["--user"], n, h, c));
      });
    await trigger("user", home, cwd, nowMs);
    bucket = readInspectBucket(bucketRef);
  }

  const findings = selectStaticFindings(bucket, args.surface).filter(
    (f) => f.fix_class === "safe_mechanical",
  );
  if (findings.length === 0) {
    process.stdout.write("tg optimize: no safe_mechanical frontmatter changes available for this surface.\n");
    return 0;
  }

  let applied = 0;
  for (const finding of findings) {
    if (!finding.file) continue;
    const livePath = resolveLivePath(finding.file, home, cwd);
    const live = readContextFile(livePath);
    const outcome = planForFinding(finding, live);
    if (outcome.status !== "ok" || live === undefined) {
      process.stdout.write(`Skipped ${finding.file}: ${outcome.status}\n`);
      continue;
    }
    const op = outcome.plan.operations.find((o) => o.kind === "frontmatter_set");
    if (!op || op.kind !== "frontmatter_set") continue;

    const next = setFrontmatterKey(live, op.key, op.value);
    if (next === live) continue;
    const backup = writeBackup(livePath, live, nowMs);
    writeFileSync(livePath, next);
    applied += 1;
    process.stdout.write(`Applied ${finding.type} to ${finding.file} (set ${op.key})\n`);
    process.stdout.write(`Backup: ${backup}\n`);
    process.stdout.write(`${miniDiff(finding.file, live, next)}\n`);
  }

  process.stdout.write(`tg optimize: applied ${applied} safe change(s).\n`);
  return 0;
}

export { setFrontmatterKey };
