// Rule registration entry point. Idempotently registers every static-context
// rule into the analyzer. Slices 2–4 add rule modules here. Kept idempotent so
// repeated imports (e.g. across tests) never double-register.

import { clearRules, registerCrossFileRule, registerPerFileRule } from "../analyzer.js";
import { agentOverbreadthRule } from "./agents.js";
import { alwaysOnBloatRule } from "./alwaysOn.js";
import { cacheabilityChurnRule } from "./cacheability.js";
import { conditionalRuleInAlwaysOnRule } from "./conditionalRule.js";
import { instructionConflictRule } from "./conflicts.js";
import { instructionDuplicateRule } from "./duplicates.js";
import { pathInstructionOverbreadthRule } from "./pathInstructions.js";
import { promptMetadataGapRule } from "./prompts.js";
import { copilotReviewTruncationRule } from "./reviewTruncation.js";
import {
  skillCountRule,
  skillDescriptionBloatRule,
  skillEntrypointBloatRule,
  skillInvocationPolicyRule,
} from "./skills.js";
import { taskPromptInInstructionRule } from "./taskPrompt.js";

let registered = false;

export function registerAllRules(): void {
  if (registered) return;
  registered = true;
  clearRules();
  // Slice 2 — low-risk rules.
  registerPerFileRule(alwaysOnBloatRule);
  registerPerFileRule(pathInstructionOverbreadthRule);
  registerPerFileRule(promptMetadataGapRule);
  registerPerFileRule(copilotReviewTruncationRule);
  registerPerFileRule(cacheabilityChurnRule);
  // Slice 3 — duplicate/conflict/task rules.
  registerPerFileRule(conditionalRuleInAlwaysOnRule);
  registerPerFileRule(taskPromptInInstructionRule);
  registerPerFileRule(agentOverbreadthRule);
  registerCrossFileRule(instructionDuplicateRule);
  registerCrossFileRule(instructionConflictRule);
  // Slice 4 — skill rules.
  registerPerFileRule(skillInvocationPolicyRule);
  registerPerFileRule(skillEntrypointBloatRule);
  registerPerFileRule(skillDescriptionBloatRule);
  registerCrossFileRule(skillCountRule);
}
