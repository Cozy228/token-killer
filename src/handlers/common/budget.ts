import { estimateTokens } from "../../core/tokens.js";
import type { OmissionDeclaration } from "../../types.js";

// ADR 0001 decision 3: the full→reduced flip is gated on *estimated tokens*
// (chars/4), not item count — we gate on what we bill. ~2000 tokens ≈ 8KB of a
// full `file:line:content` listing. The value is a placeholder to be calibrated
// against real fixtures (ADR "Consequences"); centralised here so every handler
// flips on the same threshold.
export const LISTING_TOKEN_BUDGET = 2000;

export function withinBudget(text: string, budget = LISTING_TOKEN_BUDGET): boolean {
  return estimateTokens(text) <= budget;
}

export type LadderResult = { text: string; omission?: OmissionDeclaration };

// Run the ADR 0001 over-budget ladder for one listing. No `+N more` is ever
// produced — reduction is either lossless (step 1, `digest`) or a complete
// replacement (step 2, `replacement`).
//
//   full        the complete, zero-loss rendering (emitted as-is when it fits).
//   digest()    the step-1 *lossless* reduction, built lazily only if needed —
//               location-class drops match content but keeps every file:line;
//               stream-class de-dups repeated lines but keeps every unique line.
//               Omit when the class has no lossless step (a flat all-evidence
//               list); the ladder then falls straight to replacement.
//   replacement() the step-2 complete-replacement summary: an aggregate count
//               (optionally per-group counts) and *no* partial list.
//
// The returned omission declaration (when set) is handed to makeFilteredResult,
// which force-persists raw and appends the snapshot pointer.
export function overBudgetLadder(opts: {
  full: string;
  digest?: () => string;
  replacement: () => string;
  budget?: number;
}): LadderResult {
  const budget = opts.budget ?? LISTING_TOKEN_BUDGET;
  if (withinBudget(opts.full, budget)) return { text: opts.full };
  if (opts.digest) {
    const digested = opts.digest();
    if (withinBudget(digested, budget)) {
      return { text: digested, omission: { kind: "digest" } };
    }
  }
  return { text: opts.replacement(), omission: { kind: "replacement" } };
}
