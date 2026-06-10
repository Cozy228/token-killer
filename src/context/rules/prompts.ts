// Rule 5: prompt_metadata_gap (goal §"Finding rules" 5). Applies to
// .github/prompts/**/*.prompt.md. A missing description inferable from the file
// name is safe_mechanical only under explicit --apply-safe --surface prompts;
// everything else is suggested_diff.

import { basename } from "node:path";

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding, frontmatterList, hasFrontmatterKey } from "./helpers.js";

const PLACEHOLDER_RE = /<[a-z][\w-]*>|\$ARGUMENTS|\$\{?\w+\}?|\{\w+\}/i;
// Tools that imply write/terminal access — "broad" for a read-only prompt.
const WRITE_TOOLS = /\b(edit|write|create|apply_patch|terminal|run|shell|delete)\b/i;
const READONLY_BODY = /\b(summari[sz]e|review|explain|describe|list|report|analy[sz]e)\b/i;

function inferDescription(file: string): string {
  const name = basename(file).replace(/\.prompt\.md$/, "");
  return name.replace(/[-_]+/g, " ").trim();
}

export const promptMetadataGapRule: PerFileRule = {
  type: "prompt_metadata_gap",
  appliesTo: (file) => file.surface === "prompt_file",
  run(af: AnalyzedFile): ContextFinding[] {
    const findings: ContextFinding[] = [];
    const fmEnd = af.parsed.frontmatter.end_line ?? 1;
    const hasPlaceholders = PLACEHOLDER_RE.test(af.parsed.body);

    if (!hasFrontmatterKey(af, "description")) {
      // safe_mechanical: description inferable from file name.
      findings.push(
        buildFinding(af, {
          type: "prompt_metadata_gap",
          severity: "info",
          confidence: 0.7,
          evidence: "Prompt file has no description.",
          recommendation: `Add description (e.g. "${inferDescription(af.file.display)}"). Run with --apply-safe --surface prompts to set it automatically.`,
          fix_class: "safe_mechanical",
          start_line: fmEnd,
          idExtra: "missing-description",
        }),
      );
    }

    if (hasPlaceholders && !hasFrontmatterKey(af, "argument-hint")) {
      findings.push(
        buildFinding(af, {
          type: "prompt_metadata_gap",
          severity: "info",
          confidence: 0.65,
          evidence: "Body contains argument placeholders but no argument-hint metadata.",
          recommendation: "Add an argument-hint describing the expected input.",
          fix_class: "suggested_diff",
          start_line: fmEnd,
          idExtra: "missing-arghint",
        }),
      );
    }

    // Broad tools list while the prompt is read-only.
    const tools = frontmatterList(af, "tools");
    if (tools.length > 0) {
      const broad = tools.some((t) => WRITE_TOOLS.test(t));
      if (broad && READONLY_BODY.test(af.parsed.body) && !WRITE_TOOLS.test(af.parsed.body)) {
        findings.push(
          buildFinding(af, {
            type: "prompt_metadata_gap",
            severity: "warn",
            confidence: 0.6,
            evidence: `Prompt declares write/terminal tools (${tools.join(", ")}) but reads as a read-only task.`,
            recommendation:
              "Prefer a minimal tool list — VS Code gives prompt-file tools priority over custom-agent/default tools.",
            fix_class: "suggested_diff",
            start_line: af.parsed.frontmatter.start_line ?? 1,
            idExtra: "broad-tools",
          }),
        );
      }
    }

    return findings;
  },
};
