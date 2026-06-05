// Rule 11: copilot_review_truncation (goal §"Finding rules" 11). Copilot code
// review reads only the first ~4,000 characters of an instruction file. Review
// rules that start after that mark are silently ignored. Fix class:
// suggested_diff — do NOT auto-reorder.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding, lineAtCharOffset } from "./helpers.js";

const REVIEW_LIMIT = 4_000;
const REVIEW_RULE_RE = /\b(review|pull request|\bPR\b|approve|reviewer|code review)\b/i;

const REVIEW_SURFACES = new Set([
  "copilot_instructions",
  "path_instructions",
  "agent_instructions",
]);

export const copilotReviewTruncationRule: PerFileRule = {
  type: "copilot_review_truncation",
  appliesTo: (file) => REVIEW_SURFACES.has(file.surface),
  run(af: AnalyzedFile): ContextFinding[] {
    if (af.content.length <= REVIEW_LIMIT) return [];

    const tail = af.content.slice(REVIEW_LIMIT);
    if (!REVIEW_RULE_RE.test(tail)) {
      // File is long but no review-specific rule lives past the cutoff.
      return [];
    }

    const line = lineAtCharOffset(af, REVIEW_LIMIT);
    return [
      buildFinding(af, {
        type: "copilot_review_truncation",
        severity: "warn",
        confidence: 0.7,
        evidence: `File is ${af.content.length} chars; a review-specific rule appears after the ~4,000-char cutoff Copilot review reads.`,
        recommendation:
          "Move review-critical rules into the first 4,000 characters, or scope them to .github/instructions/*.instructions.md.",
        fix_class: "suggested_diff",
        start_line: line,
        idExtra: "truncation",
      }),
    ];
  },
};
