// Shared helpers for static-context finding rules. Keep evidence sanitized:
// counts, lengths, and labels only — never raw instruction bodies (goal "Data
// model").

import type { AnalyzedFile } from "../analyzer.js";
import { makeFindingId } from "../analyzer.js";
import type {
  ContextFinding,
  ContextFindingType,
  FindingSeverity,
  FixClass,
} from "../types.js";

export type FindingDraft = {
  type: ContextFindingType;
  severity: FindingSeverity;
  confidence: number;
  evidence: string;
  recommendation: string;
  fix_class: FixClass;
  start_line?: number;
  end_line?: number;
  idExtra?: string;
};

// Build a ContextFinding from a draft, filling in source/surface/file/locators
// from the analyzed file. scope/adapter/body_hash are completed by the analyzer.
export function buildFinding(af: AnalyzedFile, draft: FindingDraft): ContextFinding {
  return {
    id: makeFindingId(draft.type, af.file.display, draft.start_line, draft.idExtra ?? ""),
    source: "static_context",
    type: draft.type,
    severity: draft.severity,
    confidence: draft.confidence,
    surface: af.file.surface,
    file: af.file.display,
    start_line: draft.start_line,
    end_line: draft.end_line,
    evidence: draft.evidence,
    recommendation: draft.recommendation,
    fix_class: draft.fix_class,
  };
}

// First line index (0-based, into the full file) at which `char` chars of body
// have accrued. Used by copilot_review_truncation to locate the 4,000-char mark.
export function lineAtCharOffset(af: AnalyzedFile, charOffset: number): number {
  const lines = af.content.split("\n");
  let acc = 0;
  for (let i = 0; i < lines.length; i += 1) {
    acc += lines[i].length + 1; // +1 for the newline
    if (acc >= charOffset) return i + 1; // 1-based
  }
  return lines.length;
}

export function frontmatterString(af: AnalyzedFile, key: string): string | undefined {
  const v = af.parsed.frontmatter.values[key];
  return typeof v === "string" ? v : undefined;
}

export function hasFrontmatterKey(af: AnalyzedFile, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(af.parsed.frontmatter.values, key);
}

export function frontmatterList(af: AnalyzedFile, key: string): string[] {
  const v = af.parsed.frontmatter.values[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}
