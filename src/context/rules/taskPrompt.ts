// Rule 4: task_prompt_in_instruction (goal §"Finding rules" 4). Repeatable
// workflow templates living in always-on instructions belong in
// .github/prompts/<name>.prompt.md. Fix class advisory — generating a prompt
// file changes workflow semantics.

import type { AnalyzedFile, PerFileRule } from "../analyzer.js";
import type { ContextFinding } from "../types.js";
import { buildFinding } from "./helpers.js";

const PLACEHOLDER = /<[a-z][\w-]*>|\$ARGUMENTS\b|\{[a-z][\w-]*\}/i;
const MARKERS = /\buse this prompt\b|\bwhen the user asks you to\b|\btemplate\b|\bchecklist\b/i;
const NUMBERED_PHASE = /^\s*\d+[.)]\s+\S/;
const INVOCATION = /\/[a-z][\w-]+|\bwhen the user (asks|says|runs)\b/i;

export const taskPromptInInstructionRule: PerFileRule = {
  type: "task_prompt_in_instruction",
  appliesTo: (file) => file.always_on,
  run(af: AnalyzedFile): ContextFinding[] {
    const body = af.parsed.body;
    const lines = body.split("\n");

    const hasPlaceholder = PLACEHOLDER.test(body);
    const hasMarker = MARKERS.test(body);
    const numberedCount = lines.filter((l) => NUMBERED_PHASE.test(l)).length;
    const hasWorkflow = numberedCount >= 3 && INVOCATION.test(body);

    if (!hasPlaceholder && !hasMarker && !hasWorkflow) return [];

    const reasons: string[] = [];
    if (hasPlaceholder) reasons.push("argument placeholders");
    if (hasMarker) reasons.push("template/checklist markers");
    if (hasWorkflow) reasons.push(`${numberedCount} numbered phases with an invocation shape`);

    return [
      buildFinding(af, {
        type: "task_prompt_in_instruction",
        severity: "info",
        confidence: 0.6,
        evidence: `Always-on file embeds a repeatable workflow (${reasons.join(", ")}).`,
        recommendation:
          "Move the workflow to .github/prompts/<name>.prompt.md and keep only a one-line route in always-on instructions.",
        fix_class: "advisory",
        start_line: 1,
        idExtra: "taskprompt",
      }),
    ];
  },
};
