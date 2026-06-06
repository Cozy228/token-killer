// `tk optimize context` — the downstream CONSUMER of inspect (goal §"Slice 5").
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
import { contextProjectFingerprint, readContextFile } from "./discover.js";
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
  applySafe: boolean;
  tokenBudgetBlock: boolean;
  vscodeSettings: boolean;
  restore: boolean;
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
    applySafe: false,
    tokenBudgetBlock: false,
    vscodeSettings: false,
    restore: false,
    scopeUser: false,
    scopeProject: false,
  };
  // The first token must be the `context` target (the only optimize target).
  if (argv[0] !== "context") {
    args.error = `unknown optimize target '${argv[0] ?? ""}' (expected: context)`;
    return args;
  }
  for (let i = 1; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--dry-run") args.dryRun = true;
    else if (t === "--write-advice") args.writeAdvice = true;
    else if (t === "--apply-safe") args.applySafe = true;
    else if (t === "--token-budget-block") args.tokenBudgetBlock = true;
    else if (t === "--vscode-settings") args.vscodeSettings = true;
    else if (t === "--restore") args.restore = true;
    else if (t === "--project") args.scopeProject = true;
    else if (t === "--user") args.scopeUser = true;
    else if (t === "--surface") {
      const v = argv[i + 1];
      i += 1;
      if (v && SURFACE_SELECTORS[v]) args.surface = v;
      else args.error = `invalid --surface '${v ?? ""}' (expected instructions | prompts | agents | skills)`;
    } else {
      args.error = `unknown flag '${t}'`;
    }
  }
  return args;
}

// Optimize reads the project bucket by default; user bucket for --surface skills
// user-level work or explicit --user (goal §"Module layout").
export function resolveOptimizeScope(args: OptimizeArgs): ContextScope {
  if (args.scopeUser) return "user";
  if (args.scopeProject) return "project";
  if (args.surface === "skills") return "user";
  return "project";
}

function resolveLivePath(file: string, home: string, cwd: string): string {
  if (file.startsWith("~/")) return join(home, file.slice(2));
  if (isAbsolute(file)) return file;
  return join(cwd, file);
}

// Inspect trigger is injected so src/context stays independent of the inspect
// command module (default uses a dynamic import — no static cycle).
export type OptimizeDeps = {
  triggerInspect?: (scope: ContextScope, home: string, cwd: string, nowMs: number) => void | Promise<void>;
};

async function defaultTriggerInspect(scope: ContextScope, home: string, cwd: string, nowMs: number): Promise<void> {
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

  // Slice 6 owns --apply-safe; refuse it cleanly here so it's never a silent no-op.
  if (args.applySafe) {
    const { runApplySafe } = await import("./applySafe.js");
    return runApplySafe(args, nowMs, home, cwd, deps);
  }

  try {
    const scope = resolveOptimizeScope(args);
    const fingerprint = scope === "project" ? contextProjectFingerprint(cwd) : undefined;
    const bucketRef: ScopeBucket =
      scope === "user" ? { scope: "user" } : { scope: "project", fingerprint: fingerprint! };

    let bucket = readInspectBucket(bucketRef);
    if (!bucket) {
      // Bucket absent → trigger a full inspect for this scope, then re-read.
      const trigger = deps.triggerInspect ?? defaultTriggerInspect;
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
      return 0;
    }

    // Default + --dry-run: plan patches and print, never write.
    printDryRun(findings, home, cwd, scope, bucketRef);
    return 0;
  } catch (error) {
    process.stderr.write(`tk optimize: internal error: ${error instanceof Error ? error.message : String(error)}\n`);
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
  out.push(`# tk optimize context (--dry-run, scope = ${scope})`);
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

function renderOutcome(finding: ContextFinding, outcome: PlanOutcome, live: string | undefined): string[] {
  const head = `[${finding.severity}] ${finding.type} ${finding.file ?? ""}${finding.start_line ? `:${finding.start_line}` : ""}`;
  if (outcome.status === "file_missing") {
    return [head, "  (file not found on disk — re-run inspect)"];
  }
  if (outcome.status === "hash_mismatch") {
    return [head, "  (file changed since inspect — re-run `tk inspect` before optimizing; stale diff suppressed)"];
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
      lines.push(...renderFrontmatterSetDiff(op.path, op.key, op.value, live).split("\n").map((l) => `  ${l}`));
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
