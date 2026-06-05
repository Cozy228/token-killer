// User-level context advice writer (goal §"Advice format"). Writes Markdown to
// ~/.token-guard/advice/context/<fingerprint>.md (project) or user.md (user).
// Heuristic wording only — never claim provider token savings.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tokenGuardHome } from "../core/dataDir.js";
import type { ContextFinding, ContextScope } from "./types.js";

export function contextAdviceDir(): string {
  return join(tokenGuardHome(), "advice", "context");
}

export function adviceFilePath(scope: ContextScope, fingerprint?: string): string {
  const name = scope === "user" ? "user.md" : `${(fingerprint ?? "unknown").replace(/^repo:/, "")}.md`;
  return join(contextAdviceDir(), name);
}

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const;

export function renderContextAdvice(opts: {
  scope: ContextScope;
  fingerprint?: string;
  generatedAt: string;
  filesScanned: number;
  findings: ContextFinding[];
  safeAppliesAvailable: boolean;
}): string {
  const lines: string[] = [];
  lines.push("# Copilot Context Advice");
  lines.push("");
  lines.push(`Scope: ${opts.scope}`);
  if (opts.scope === "project") lines.push(`Project: ${opts.fingerprint ?? "unknown"}`);
  lines.push(`Generated: ${opts.generatedAt}`);
  lines.push(`Files scanned: ${opts.filesScanned}`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");

  const sorted = [...opts.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.type.localeCompare(b.type),
  );
  if (sorted.length === 0) {
    lines.push("_No static-context findings._");
    lines.push("");
  }
  for (const f of sorted) {
    lines.push(`### [${f.severity}] ${f.type}`);
    lines.push(`- Surface: ${f.surface}`);
    if (f.file) lines.push(`- File: ${f.file}${f.start_line ? `:${f.start_line}` : ""}`);
    if (f.adapter) lines.push(`- Adapter: ${f.adapter}`);
    lines.push(`- Evidence: ${f.evidence}`);
    lines.push(`- Recommendation: ${f.recommendation}`);
    lines.push(`- Fix class: ${f.fix_class}`);
    lines.push("");
  }

  if (opts.safeAppliesAvailable) {
    lines.push("## Safe applies available");
    lines.push("");
    lines.push(
      "- Run `tg optimize context --token-budget-block --apply-safe` to install the managed token budget block in your user-level agent instructions.",
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function writeContextAdvice(scope: ContextScope, fingerprint: string | undefined, content: string): string {
  const dir = contextAdviceDir();
  mkdirSync(dir, { recursive: true });
  const path = adviceFilePath(scope, fingerprint);
  writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`);
  return path;
}
