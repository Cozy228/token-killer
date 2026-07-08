// Bridge: inspect → static-context analyzer (goal "Module layout"). Keeps
// src/context independent of the inspect command — this module wires the analyzer
// into the inspect run, splits findings by scope, and persists the per-scope
// unified Finding[] buckets that `ctx optimize context` consumes.

import { analyzeContext, type AnalyzeResult } from "../context/analyzer.js";
import { contextProjectFingerprint } from "../context/discover.js";
import { registerAllRules } from "../context/rules/index.js";
import { vscodeCompressFinding } from "../context/vscodeSettings.js";
import type { ContextFinding, ContextScope, ContextSurface } from "../context/types.js";
import { writeInspectBucket, type InspectBucketReport, type ScopeBucket } from "./persist.js";
import type { Finding, RuntimeFinding } from "./unified.js";

export type StaticContextRun = {
  result: AnalyzeResult;
  scopes: ContextScope[];
};

export function runStaticContext(opts: {
  scopes: ContextScope[];
  surface?: ContextSurface | string;
  home?: string;
  cwd?: string;
  onProgress?: (completed: number, total: number, detail?: string) => void;
}): StaticContextRun {
  registerAllRules();
  const result = analyzeContext({
    scopes: opts.scopes,
    surface: opts.surface as ContextSurface | undefined,
    home: opts.home,
    cwd: opts.cwd,
    onProgress: opts.onProgress,
  });
  // VS Code's host-native terminal-output compression toggle is a user-scope,
  // non-markdown finding — injected here (not a per-file rule) when the user scope
  // is in play and no `--surface` narrows to a specific markdown surface.
  if (opts.scopes.includes("user") && !opts.surface) {
    const vscode = vscodeCompressFinding(process.platform, opts.home);
    if (vscode) result.findings.push(vscode);
  }
  return { result, scopes: opts.scopes };
}

function findingsForScope(findings: ContextFinding[], scope: ContextScope): ContextFinding[] {
  return findings.filter((f) => (f.scope ?? scope) === scope);
}

// Persist one bucket per produced scope. Runtime findings are orthogonal to
// scope (goal "Discovery") and written into whichever bucket(s) the run produces.
export function persistScopeBuckets(opts: {
  scopes: ContextScope[];
  staticFindings: ContextFinding[];
  runtimeFindings: RuntimeFinding[];
  generatedAt: string;
  files_scanned: number;
  cwd?: string;
}): string[] {
  const written: string[] = [];
  for (const scope of opts.scopes) {
    const bucket: ScopeBucket =
      scope === "user"
        ? { scope: "user" }
        : { scope: "project", fingerprint: contextProjectFingerprint(opts.cwd ?? process.cwd()) };

    const scoped = findingsForScope(opts.staticFindings, scope);
    const findings: Finding[] = [...opts.runtimeFindings, ...scoped];
    const report: InspectBucketReport = {
      schemaVersion: "1",
      generatedAt: opts.generatedAt,
      scope,
      ...(bucket.scope === "project" ? { fingerprint: bucket.fingerprint } : {}),
      files_scanned: opts.files_scanned,
      findings,
    };
    written.push(writeInspectBucket(bucket, report));
  }
  return written;
}
