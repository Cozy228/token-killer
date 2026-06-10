// Static-context view formatting (goal "Report format"). Renders the
// source = static_context findings as a SECTION within `tk inspect`'s report —
// not a standalone document. Groups by severity; shows evidence + recommendation
// + fix class. JSON output is the unified Finding[] (handled by the caller).

import type { ContextFinding, FindingSeverity } from "./types.js";

const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warn: 1, info: 2 };

export type StaticContextSummary = {
  files_scanned: number;
  findings: ContextFinding[];
};

function severityCounts(findings: ContextFinding[]): string {
  const counts: Record<FindingSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const parts: string[] = [];
  if (counts.error) parts.push(`error ${counts.error}`);
  if (counts.warn) parts.push(`warn ${counts.warn}`);
  if (counts.info) parts.push(`info ${counts.info}`);
  return parts.join(", ") || "none";
}

function locator(f: ContextFinding): string {
  if (!f.file) return "";
  return f.start_line ? `${f.file}:${f.start_line}` : f.file;
}

// Renders the markdown section appended to the inspect report.
export function renderStaticContextSection(summary: StaticContextSummary): string {
  const lines: string[] = [];
  lines.push("## Static context  (source = static_context)");
  lines.push("");
  lines.push(`- Files scanned: ${summary.files_scanned}`);
  lines.push(`- Findings: ${summary.findings.length} (${severityCounts(summary.findings)})`);
  lines.push("");

  if (summary.findings.length === 0) {
    lines.push("_No static-context findings._");
    lines.push("");
    return lines.join("\n");
  }

  const sorted = [...summary.findings].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return a.type.localeCompare(b.type);
  });

  for (const f of sorted) {
    const loc = locator(f);
    lines.push(`[${f.severity}] ${f.type}${loc ? ` ${loc}` : ""}`);
    lines.push(`  Evidence: ${f.evidence}`);
    lines.push(`  Recommendation: ${f.recommendation}`);
    lines.push(`  Fix: ${f.fix_class}`);
    lines.push("");
  }

  return lines.join("\n");
}
