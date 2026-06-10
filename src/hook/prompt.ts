// Slice 2 — prompt governance for the `userPromptSubmitted` event (DESIGN §3.5,
// §11 L1). Two independent checks, in precedence order:
//   1. token-budget: prompt over blockTokens → deny; over warnTokens → suggest
//   2. implementation-intent: an obvious "write code" prompt → suggest a cheaper
//      model (routing hint), reserving premium models for plan/review/root-cause
//
// It never rewrites and never reads anything but the prompt text. Reasons/hints
// are English (goal constraint) and carry no prompt content back out.

import { estimateTokens } from "../core/savings.js";
import type { Decision } from "./govern.js";
import type { ToolEvent } from "./normalize.js";

export type PromptThresholds = {
  warnTokens: number;
  blockTokens: number;
};

// Defaults mirror DESIGN §12.2 (no config loader exists yet; `tk config init` is
// planned). Callers may override for tests / future config wiring.
export const DEFAULT_PROMPT_THRESHOLDS: PromptThresholds = {
  warnTokens: 4000,
  blockTokens: 16000,
};

// Obvious implementation-intent verbs. Word-boundary matched, case-insensitive.
// Kept deliberately small and high-precision to avoid nagging on planning prompts.
const IMPLEMENTATION_INTENT = [
  "implement",
  "write the code",
  "write code",
  "generate",
  "scaffold",
  "boilerplate",
  "add a function",
  "add a test",
  "write tests",
  "write a test",
];

function looksLikeImplementation(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return IMPLEMENTATION_INTENT.some((kw) => lower.includes(kw));
}

const ROUTING_HINT =
  "This looks like an implementation task — a cheaper model may suffice. Reserve premium models for planning, code review, and root-cause analysis.";

export function governPrompt(
  ev: ToolEvent,
  thresholds: PromptThresholds = DEFAULT_PROMPT_THRESHOLDS,
): Decision {
  const prompt = ev.prompt ?? "";
  if (prompt.trim().length === 0) return { decision: "allow" };

  const tokens = estimateTokens(prompt);

  if (tokens >= thresholds.blockTokens) {
    return {
      decision: "deny",
      governance_kind: "denied_large_prompts",
      estimated_tokens: tokens,
      reason: `Prompt is ~${tokens} tokens (over the ${thresholds.blockTokens} block threshold); split it into smaller, focused turns.`,
    };
  }

  if (tokens >= thresholds.warnTokens) {
    return {
      decision: "suggest",
      governance_kind: "suggested_large_prompts",
      estimated_tokens: tokens,
      reason: `Prompt is ~${tokens} tokens (over the ${thresholds.warnTokens} warn threshold); consider trimming context.`,
      additional_context: `Large prompt (~${tokens} tokens) — trimming irrelevant context reduces cost and improves focus.`,
    };
  }

  // Implementation-intent is a model-routing hint, NOT a prompt-size opportunity.
  // It carries no `governance_kind`, so it is never written to governance.jsonl
  // and never counted as `suggested_large_prompts` (§0.1.10 — counts stay honest).
  if (looksLikeImplementation(prompt)) {
    return {
      decision: "suggest",
      reason: ROUTING_HINT,
      additional_context: ROUTING_HINT,
    };
  }

  return { decision: "allow" };
}
