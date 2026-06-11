// Rule 3: path_instruction_overbreadth (goal §"Finding rules" 3). Applies to
// .github/instructions/**/*.instructions.md. Narrow applyTo + add excludeAgent
// only as suggested diffs (they change which Copilot surfaces see the rule).

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding, frontmatterString, hasFrontmatterKey } from "./helpers.js";

// Content hints that a rule is local-only / unsuitable for cloud code review.
// Deliberately SPECIFIC: bare "token" (e.g. "token budget", "auth token docs") and
// bare "local" ("local development") are common, non-secret words that produced
// false positives — require a secrets-bearing phrase, not one overloaded keyword.
const REVIEW_UNSAFE =
  /\b(secret|credential|password|api[ -]?key|access[ -]?token|private[ -]?key|\.env\b|local-only|do not run|run locally)\b/i;

const BROAD_GLOBS = new Set(["**", "**/*", "*"]);

export const pathInstructionOverbreadthRule: PerFileRule = {
  type: "path_instruction_overbreadth",
  appliesTo: (file) => file.surface === "path_instructions",
  run(af: AnalyzedFile): ContextFinding[] {
    const findings: ContextFinding[] = [];
    const applyTo = frontmatterString(af, "applyTo")?.trim();
    const fmEnd = af.parsed.frontmatter.end_line ?? 1;

    if (!hasFrontmatterKey(af, "applyTo")) {
      findings.push(
        buildFinding(af, {
          type: "path_instruction_overbreadth",
          severity: "warn",
          confidence: 0.85,
          evidence: "Path instruction file has no applyTo glob, so it applies everywhere.",
          recommendation: "Add an applyTo glob narrowing the rule to the files it governs.",
          fix_class: "suggested_diff",
          start_line: fmEnd,
          idExtra: "missing-applyto",
        }),
      );
    } else if (applyTo && BROAD_GLOBS.has(applyTo)) {
      findings.push(
        buildFinding(af, {
          type: "path_instruction_overbreadth",
          severity: "warn",
          confidence: 0.8,
          evidence: `applyTo: "${applyTo}" is repo-wide on a path-specific instruction file.`,
          recommendation: "Narrow applyTo to the concrete paths/languages this rule governs.",
          fix_class: "suggested_diff",
          start_line: af.parsed.frontmatter.start_line ?? 1,
          idExtra: "broad-applyto",
        }),
      );
    }

    // excludeAgent missing when content is clearly unsuitable for cloud agent / review.
    if (!hasFrontmatterKey(af, "excludeAgent") && REVIEW_UNSAFE.test(af.parsed.body)) {
      findings.push(
        buildFinding(af, {
          type: "path_instruction_overbreadth",
          severity: "info",
          confidence: 0.6,
          evidence: "Content looks local-only or secrets-related but excludeAgent is unset.",
          recommendation:
            "Consider adding excludeAgent so the Copilot coding/review agent does not load local-only or secrets-handling steps.",
          fix_class: "suggested_diff",
          start_line: fmEnd,
          idExtra: "missing-excludeagent",
        }),
      );
    }

    return findings;
  },
};
