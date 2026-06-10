// Rule 2: conditional_rule_in_always_on (goal §"Finding rules" 2). Narrow
// path/language/framework-scoped rules living in always-on files belong in
// .github/instructions/*.instructions.md with an applyTo glob. Fix class
// suggested_diff — do NOT auto-create the new file.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding } from "./helpers.js";

const PATH_GLOB = /(?:^|\s)(?:[\w.-]+\/)*\*\*(?:\/|\s|$)|\*\.[a-z]{1,5}\b|packages\/[\w-]+|src\/\*\*|docs\/\*\*/;
const FRAMEWORK = /\b(React|Django|Rails|Terraform|Kubernetes|Swift|Next\.js|Vue)\b/;
const PHRASE = /\bwhen editing\b|\bfor files under\b|\bonly in\b|\bfrontend\b|\bbackend\b/i;

export const conditionalRuleInAlwaysOnRule: PerFileRule = {
  type: "conditional_rule_in_always_on",
  appliesTo: (file) => file.always_on,
  run(af: AnalyzedFile): ContextFinding[] {
    const lines = af.parsed.body.split("\n");
    let firstLine = -1;
    let hits = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (PATH_GLOB.test(line) || PHRASE.test(line) || (FRAMEWORK.test(line) && /`|\brun\b|\bnpm\b|\bpnpm\b/i.test(line))) {
        hits += 1;
        if (firstLine === -1) firstLine = af.parsed.body_start_line + i;
      }
    }
    if (hits === 0) return [];

    return [
      buildFinding(af, {
        type: "conditional_rule_in_always_on",
        severity: "warn",
        confidence: 0.6,
        evidence: `${hits} line(s) reference path/framework-specific scopes inside an always-on file.`,
        recommendation:
          "Move these to a .github/instructions/<name>.instructions.md target with an applyTo glob (do not auto-create).",
        fix_class: "suggested_diff",
        start_line: firstLine,
        idExtra: "conditional",
      }),
    ];
  },
};
