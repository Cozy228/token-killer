// Rule 1: always_on_bloat (goal §"Finding rules" 1). Always-on files load into
// every session, so size and embedded task workflows are the highest-leverage
// token cost. Fix class: suggested_diff / advisory — never auto-rewrite.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import { estimateTokens } from "../metrics.js";
import type { ContextFinding } from "../types.js";
import { buildFinding } from "./helpers.js";

// Line limits aligned to published guidance: a CLAUDE.md over ~200 lines is the
// documented bloat line (one 3847→312 tok trim was a 91.9% cut, no quality loss),
// and AGENTS.md gains reverse past ~150 lines. The ~2000-token ceiling is the other
// documented limit (a 2000-tok always-on file × 30 messages ≈ 60k tokens spent on
// that file alone). See reports/token-optimization-best-practices-20260611.md.
const LINE_LIMIT = 200;
const AGENTS_LINE_LIMIT = 150;
const TOKEN_LIMIT = 2_000;

// AGENTS.md has a tighter line budget than other always-on files.
function lineLimitFor(af: AnalyzedFile): number {
  return /(^|\/)AGENTS\.md$/i.test(af.file.display) ? AGENTS_LINE_LIMIT : LINE_LIMIT;
}
const SECTION_TOKEN_LIMIT = 800;
const CODE_EXAMPLE_LINE_LIMIT = 80;
const TASK_VERBS = ["review", "generate", "migrate", "release", "deploy", "triage", "translate"];

function countCodeFenceMaxRun(text: string): number {
  const lines = text.split("\n");
  let inFence = false;
  let run = 0;
  let max = 0;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (inFence) {
        max = Math.max(max, run);
        run = 0;
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) run += 1;
  }
  return max;
}

const MOVE_RECO =
  "Move path-specific rules to .github/instructions/*.instructions.md, repeatable tasks to " +
  ".github/prompts/*.prompt.md, and persona/tool bundles to .github/agents/*.agent.md.";

export const alwaysOnBloatRule: PerFileRule = {
  type: "always_on_bloat",
  appliesTo: (file) => file.always_on,
  run(af: AnalyzedFile): ContextFinding[] {
    const findings: ContextFinding[] = [];
    const { metrics } = af;

    const lineLimit = lineLimitFor(af);
    if (metrics.line_count > lineLimit || metrics.estimated_tokens > TOKEN_LIMIT) {
      findings.push(
        buildFinding(af, {
          type: "always_on_bloat",
          severity: "warn",
          confidence: 0.8,
          evidence: `${metrics.line_count} lines (> ${lineLimit}), ~${metrics.estimated_tokens} estimated tokens in an always-on file.`,
          recommendation: MOVE_RECO,
          fix_class: "suggested_diff",
          start_line: 1,
          idExtra: "size",
        }),
      );
    }

    // Any single section over the per-section token budget.
    for (const section of af.parsed.sections) {
      if (section.heading === "") continue;
      const sectionTokens = estimateTokens(section.text);
      if (sectionTokens > SECTION_TOKEN_LIMIT) {
        findings.push(
          buildFinding(af, {
            type: "always_on_bloat",
            severity: "warn",
            confidence: 0.75,
            // Privacy (audit #9): location + lengths only, never the verbatim heading.
            evidence: `Section at line ${section.start_line} (heading ${section.heading.length} chars) is ~${sectionTokens} estimated tokens (> ${SECTION_TOKEN_LIMIT}).`,
            recommendation: MOVE_RECO,
            fix_class: "suggested_diff",
            start_line: section.start_line,
            end_line: section.end_line,
            idExtra: `section:${section.start_line}`,
          }),
        );
      }
    }

    // Long inline code examples.
    const maxFenceRun = countCodeFenceMaxRun(af.parsed.body);
    if (maxFenceRun > CODE_EXAMPLE_LINE_LIMIT) {
      findings.push(
        buildFinding(af, {
          type: "always_on_bloat",
          severity: "warn",
          confidence: 0.7,
          evidence: `A code fence spans ${maxFenceRun} lines (> ${CODE_EXAMPLE_LINE_LIMIT}); long examples bloat always-on context.`,
          recommendation:
            "Trim the example or move it to a referenced file outside always-on instructions.",
          fix_class: "advisory",
          start_line: 1,
          idExtra: "codefence",
        }),
      );
    }

    // Repeated task verbs dominating headings.
    const verbHeadings = af.parsed.sections.filter((s) => {
      const first = s.heading.toLowerCase().split(/\s+/)[0] ?? "";
      return TASK_VERBS.includes(first);
    });
    if (verbHeadings.length >= 2) {
      findings.push(
        buildFinding(af, {
          type: "always_on_bloat",
          severity: "warn",
          confidence: 0.65,
          evidence: `${verbHeadings.length} headings read as task workflows (at lines ${verbHeadings
            .map((s) => s.start_line)
            .slice(0, 3)
            .join(", ")}).`,
          recommendation:
            "Move repeatable task workflows to .github/prompts/*.prompt.md and keep only a one-line route.",
          fix_class: "advisory",
          start_line: verbHeadings[0].start_line,
          idExtra: "taskverbs",
        }),
      );
    }

    return findings;
  },
};
