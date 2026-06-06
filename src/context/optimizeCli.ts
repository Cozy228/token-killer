// `tk optimize` — the downstream CONSUMER of inspect (goal §"Slice 5").
// Reads inspect's persisted per-scope bucket (project by default; user for
// --surface skills user-level work), filters to source = static_context, and
// plans patches. Default mode is read-only; it triggers a full inspect when the
// bucket is absent. It never calls the command-compression pipeline.

import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import {
  inspectBucketPath,
  readInspectBucket,
  type InspectBucketReport,
  type ScopeBucket,
} from "../inspect/persist.js";
import { renderContextAdvice, writeContextAdvice } from "./advice.js";
import { contextProjectFingerprint, isGitProject, readContextFile } from "./discover.js";
import {
  planForFinding,
  renderFrontmatterSetDiff,
  type ContextPatchPlan,
  type PlanOutcome,
} from "./patchPlan.js";
import type { ContextFinding, ContextScope, ContextSurface } from "./types.js";

export type OptimizeArgs = {
  dryRun: boolean;
  writeAdvice: boolean;
  apply: boolean;
  tokenBudgetBlock: boolean;
  vscodeSettings: boolean;
  restore: boolean;
  backup: boolean;
  paths: string[]; // explicit files for --backup; empty → all in-scope context files
  scopeUser: boolean;
  scopeProject: boolean;
  surface?: string;
  error?: string;
};

const SURFACE_SELECTORS: Record<string, ContextSurface[]> = {
  instructions: ["copilot_instructions", "path_instructions", "agent_instructions"],
  prompts: ["prompt_file"],
  agents: ["custom_agent"],
  skills: ["skill"],
};

export function parseOptimizeArgs(argv: string[]): OptimizeArgs {
  const args: OptimizeArgs = {
    dryRun: false,
    writeAdvice: false,
    apply: false,
    tokenBudgetBlock: false,
    vscodeSettings: false,
    restore: false,
    backup: false,
    paths: [],
    scopeUser: false,
    scopeProject: false,
  };
  // `context` used to be a required target; it is now optional. A leading
  // `context` token is still accepted (and ignored) for back-compat.
  const tokens = argv[0] === "context" ? argv.slice(1) : argv;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === "--dry-run") args.dryRun = true;
    else if (t === "--write-advice") args.writeAdvice = true;
    else if (t === "--apply") args.apply = true;
    else if (t === "--token-budget-block") args.tokenBudgetBlock = true;
    else if (t === "--vscode-settings") args.vscodeSettings = true;
    else if (t === "--restore") args.restore = true;
    else if (t === "--backup") {
      args.backup = true;
      // Consume following non-flag tokens as explicit file paths to snapshot.
      while (i + 1 < tokens.length && !tokens[i + 1].startsWith("--")) {
        args.paths.push(tokens[i + 1]);
        i += 1;
      }
    } else if (t === "--project") args.scopeProject = true;
    else if (t === "--user") args.scopeUser = true;
    else if (t === "--surface") {
      const v = tokens[i + 1];
      i += 1;
      if (v && SURFACE_SELECTORS[v]) args.surface = v;
      else
        args.error = `invalid --surface '${v ?? ""}' (expected instructions | prompts | agents | skills)`;
    } else {
      args.error = `unknown flag '${t}'`;
    }
  }
  return args;
}

// Git-aware scope resolution. Explicit --user/--project win; --surface skills is
// always user-level work. Otherwise: off-git directories optimize the user scope
// only (there is no project to speak of), and inside a git repo we operate on
// both the user and project scopes together.
export function resolveOptimizeScopes(args: OptimizeArgs, cwd: string): ContextScope[] {
  if (args.scopeUser) return ["user"];
  if (args.scopeProject) return ["project"];
  if (args.surface === "skills") return ["user"];
  return isGitProject(cwd) ? ["user", "project"] : ["user"];
}

function resolveLivePath(file: string, home: string, cwd: string): string {
  if (file.startsWith("~/")) return join(home, file.slice(2));
  if (isAbsolute(file)) return file;
  return join(cwd, file);
}

// Inspect trigger is injected so src/context stays independent of the inspect
// command module (default uses a dynamic import — no static cycle).
export type OptimizeDeps = {
  triggerInspect?: (
    scope: ContextScope,
    home: string,
    cwd: string,
    nowMs: number,
  ) => void | Promise<void>;
};

async function defaultTriggerInspect(
  scope: ContextScope,
  home: string,
  cwd: string,
  nowMs: number,
): Promise<void> {
  // Dynamic import avoids a static inspect↔context cycle. A full inspect run
  // (runtime + static) keeps the persisted bucket complete (goal §"Optimize").
  // We only want inspect's side effect (the persisted bucket), so its stdout
  // report is suppressed — optimize owns the output stream.
  const argv = scope === "user" ? ["--user"] : ["--project"];
  const mod = await import("../inspect/cli.js");
  await withSuppressedStdout(() => {
    mod.runInspect(argv, nowMs, home, cwd);
  });
}

// Swallow process.stdout during `fn` (inspect's report). stderr is left intact.
export async function withSuppressedStdout(fn: () => void): Promise<void> {
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = () => true;
  try {
    fn();
  } finally {
    (process.stdout as { write: typeof original }).write = original;
  }
}

export async function runOptimize(
  argv: string[],
  nowMs: number = Date.now(),
  home: string = homedir(),
  cwd: string = process.cwd(),
  deps: OptimizeDeps = {},
): Promise<number> {
  const args = parseOptimizeArgs(argv);
  if (args.error) {
    process.stderr.write(`tk optimize: ${args.error}\n`);
    return 1;
  }

  // Scheme 1: VS Code token-lean settings is a self-contained, host-native path
  // (apply/restore/report compressOutput; advisory on the rest). It does not use
  // the inspect bucket / finding pipeline, so dispatch before anything else.
  if (args.vscodeSettings) {
    const { runVscodeSettings } = await import("./vscodeSettings.js");
    return runVscodeSettings(args, nowMs, home);
  }

  // Managed token-budget block (folds in the former `tk agentsmd`): a user-level
  // marker-block write. `--restore` removes it; otherwise it is installed.
  if (args.tokenBudgetBlock) {
    const { applyMarkerBlock } = await import("./applySafe.js");
    return applyMarkerBlock(home, args.restore ? "remove" : "insert", nowMs);
  }

  // `--backup` snapshots files BEFORE they are edited (by an agent following a
  // copied prompt, or by hand), so `--restore` can later revert those edits.
  if (args.backup) {
    const { runBackup } = await import("./applySafe.js");
    return runBackup(args, nowMs, home, cwd);
  }

  // `--restore` reverts the most recent backup set — whether it was written by
  // `--apply`, `--token-budget-block`, or a pre-edit `--backup` (so it can undo
  // an agent's manual edits taken after that snapshot).
  if (args.restore) {
    const { runRestore } = await import("./applySafe.js");
    return runRestore(nowMs);
  }

  // `--apply` writes every deterministic change across the resolved scopes.
  if (args.apply) {
    const { runApply } = await import("./applySafe.js");
    return runApply(args, nowMs, home, cwd, deps);
  }

  try {
    const scopes = resolveOptimizeScopes(args, cwd);
    const trigger = deps.triggerInspect ?? defaultTriggerInspect;

    for (const scope of scopes) {
      const fingerprint = scope === "project" ? contextProjectFingerprint(cwd) : undefined;
      const bucketRef: ScopeBucket =
        scope === "user" ? { scope: "user" } : { scope: "project", fingerprint: fingerprint! };

      let bucket = readInspectBucket(bucketRef);
      if (!bucket) {
        // Bucket absent → trigger a full inspect for this scope, then re-read.
        await trigger(scope, home, cwd, nowMs);
        bucket = readInspectBucket(bucketRef);
      }

      const findings = selectStaticFindings(bucket, args.surface);

      if (args.writeAdvice) {
        const content = renderContextAdvice({
          scope,
          fingerprint,
          generatedAt: new Date(nowMs).toISOString(),
          filesScanned: bucket?.files_scanned ?? 0,
          findings,
          safeAppliesAvailable: scope === "user",
        });
        const path = writeContextAdvice(scope, fingerprint, content);
        process.stdout.write(`Wrote context advice: ${path}\n`);
        continue;
      }

      // Default + --dry-run: plan patches and print, never write.
      printDryRun(findings, home, cwd, scope, bucketRef);
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `tk optimize: internal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 3;
  }
}

export function selectStaticFindings(
  bucket: InspectBucketReport | undefined,
  surface?: string,
): ContextFinding[] {
  if (!bucket) return [];
  const statics = bucket.findings.filter(
    (f): f is ContextFinding => (f as ContextFinding).source === "static_context",
  );
  if (!surface) return statics;
  const allowed = new Set(SURFACE_SELECTORS[surface] ?? []);
  return statics.filter((f) => allowed.has(f.surface));
}

function printDryRun(
  findings: ContextFinding[],
  home: string,
  cwd: string,
  scope: ContextScope,
  bucketRef: ScopeBucket,
): void {
  const out: string[] = [];
  out.push(`# tk optimize (--dry-run, scope = ${scope})`);
  out.push(`Reading findings from: ${inspectBucketPath(bucketRef)}`);
  out.push(`Static-context findings: ${findings.length}`);
  out.push("");

  if (findings.length === 0) {
    out.push("_No static-context findings to optimize._");
    process.stdout.write(`${out.join("\n")}\n`);
    return;
  }

  for (const finding of findings) {
    const livePath = finding.file ? resolveLivePath(finding.file, home, cwd) : undefined;
    const live = livePath ? readContextFile(livePath) : undefined;
    const outcome = planForFinding(finding, live);
    out.push(...renderOutcome(finding, outcome, live));
    out.push("");
  }

  process.stdout.write(`${out.join("\n")}\n`);
}

function renderOutcome(
  finding: ContextFinding,
  outcome: PlanOutcome,
  live: string | undefined,
): string[] {
  const head = `[${finding.severity}] ${finding.type} ${finding.file ?? ""}${finding.start_line ? `:${finding.start_line}` : ""}`;
  if (outcome.status === "file_missing") {
    return [head, "  (file not found on disk — re-run inspect)"];
  }
  if (outcome.status === "hash_mismatch") {
    return [
      head,
      "  (file changed since inspect — re-run `tk inspect` before optimizing; stale diff suppressed)",
    ];
  }
  if (outcome.status === "skipped") {
    return [head, `  (skipped: ${outcome.reason})`];
  }
  return [head, `  fix: ${outcome.plan.fix_class}`, ...renderPlan(outcome.plan, live)];
}

export function renderPlan(plan: ContextPatchPlan, live: string | undefined): string[] {
  const lines: string[] = [];
  for (const op of plan.operations) {
    if (op.kind === "frontmatter_set" && live !== undefined) {
      lines.push(
        ...renderFrontmatterSetDiff(op.path, op.key, op.value, live)
          .split("\n")
          .map((l) => `  ${l}`),
      );
    } else if (op.kind === "suggested_diff") {
      lines.push(...op.diff.split("\n").map((l) => `  ${l}`));
    } else if (op.kind === "insert_marker_block") {
      lines.push(`  + insert Token Killer ${op.marker} marker block in ${op.path}`);
    } else if (op.kind === "remove_marker_block") {
      lines.push(`  - remove Token Killer ${op.marker} marker block from ${op.path}`);
    } else if (op.kind === "frontmatter_set") {
      lines.push(`  + set ${op.key} = ${JSON.stringify(op.value)} in ${op.path}`);
    }
  }
  return lines;
}

export { resolveLivePath };
