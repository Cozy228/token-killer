// output_verbosity_unset — an always-on instruction file that never tells the agent
// to keep OUTPUT terse. Output tokens are billed ~4× input, and a one-line "respond
// with code only, no prose explanation" directive is reported to cut output volume
// 40–70% on coding tasks — the highest ROI-per-byte change to an instructions file.
// (github/copilot-token-optimization; see reports/token-optimization-best-practices.)
//
// Fires once per always-on instruction surface (CLAUDE.md / AGENTS.md /
// copilot-instructions) that lacks any brevity directive. Advisory: appending a
// behavioral instruction is the user's call, not a mechanical edit.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding, ContextSurface } from "../types.js";
import { buildFinding } from "./helpers.js";

const INSTRUCTION_SURFACES: ContextSurface[] = ["agent_instructions", "copilot_instructions"];

// Any of these reads as "keep output short / don't over-explain".
const BREVITY_DIRECTIVE =
  /\b(code only|no (explanation|prose|preamble|commentary|narration)|be concise|concise(ly)?|minimal (prose|explanation|output)|terse|don'?t (explain|over-?explain)|without (explanation|commentary)|skip the (preamble|explanation))\b/i;

export const outputVerbosityRule: PerFileRule = {
  type: "output_verbosity_unset",
  appliesTo: (file) => file.always_on && INSTRUCTION_SURFACES.includes(file.surface),
  run(af: AnalyzedFile): ContextFinding[] {
    const haystack = `${af.parsed.frontmatter.values.description ?? ""}\n${af.parsed.body}`;
    if (BREVITY_DIRECTIVE.test(haystack)) return [];
    return [
      buildFinding(af, {
        type: "output_verbosity_unset",
        severity: "info",
        confidence: 0.6,
        evidence:
          "This always-on instruction file sets no output-brevity directive; output tokens are billed ~4× input.",
        recommendation:
          'Add a line like "Respond with code only — no prose explanation unless asked." Reported to cut output tokens 40–70% on coding tasks.',
        fix_class: "advisory",
        start_line: 1,
        idExtra: "verbosity",
      }),
    ];
  },
};
