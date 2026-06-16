// Shared pricing (ADR 0004 §4). The default constant is Claude Sonnet 4.6 input
// $/Mtok — the headline standard. BOTH `tk gain --quota` and the telemetry
// `estimated_savings_usd_30d` field import from here — there is no second price
// path. The constant and the table are documented in docs/TELEMETRY.md. Unknown/
// typo model names fall back to the default constant, never an error.
//
// AI Credits口径 (VS Code / GitHub Copilot, 2026-06-01 usage-based billing): usage
// is metered in GitHub AI Credits where 1 credit = $0.01 USD, computed from token
// consumption at each model's listed API rate. So Credits is a re-denomination of
// USD (×100). tk saves INPUT/context tokens (it compresses tool output that would
// otherwise enter the model's context), so saved tokens are priced at the INPUT
// rate, then converted to credits.

import type { HistoryRecord } from "./history.js";

// Default estimate constant — Claude Sonnet 4.6 input price, the honest fallback
// when a row carries no model (every shell command-proxy row). This is also the
// headline reference model.
export const DEFAULT_INPUT_PRICE_PER_MTOK = 3; // $/Mtok

// The headline standard and a well-known cross-reference, surfaced side by side so
// both the Claude and the OpenAI/Copilot worlds get a number they recognize.
export const REFERENCE_MODEL = "claude-sonnet-4-6"; // default anchor
export const CROSS_REFERENCE_MODEL = "gpt-5.5"; // well-known cross-reference

// GitHub AI Credits: 1 credit = $0.01 USD (flat under the 2026-06 usage-based
// scheme; the old per-model "multiplier" system is gone — the model's API rate
// already encodes cost). Credits = USD × 100.
export const USD_PER_AI_CREDIT = 0.01;

// model id (and short alias) → input $/Mtok. Aliases (`opus`/`sonnet`/`haiku`) let
// `-t opus` work; full ids let a hook-runtime `model` row price itself. Values are
// current input rates (claude-api skill, 2026-06): Sonnet 4.6 $3, Opus 4.8 $5,
// Haiku 4.5 $1, Fable 5 $10; GPT-5.5 $5 (OpenAI API pricing, 2026-04).
export const MODEL_INPUT_PRICE_PER_MTOK: Record<string, number> = {
  opus: 5,
  sonnet: 3,
  haiku: 1,
  "claude-opus-4-8": 5,
  "claude-opus-4-7": 5,
  "claude-opus-4-6": 5,
  "claude-sonnet-4-6": 3,
  "claude-sonnet-4-5": 3,
  "claude-haiku-4-5": 1,
  "claude-fable-5": 10,
  "gpt-5.5": 5,
  "gpt-5.5-pro": 30,
};

// Resolve the per-Mtok input price for a model id/alias. Absent or unknown ⇒ the
// default constant (honest estimate), never a throw.
export function priceForModel(model: string | undefined): number {
  if (!model) return DEFAULT_INPUT_PRICE_PER_MTOK;
  return MODEL_INPUT_PRICE_PER_MTOK[model.toLowerCase()] ?? DEFAULT_INPUT_PRICE_PER_MTOK;
}

export function tokensToUsd(tokens: number, pricePerMtok = DEFAULT_INPUT_PRICE_PER_MTOK): number {
  return (tokens / 1e6) * pricePerMtok;
}

// USD → AI Credits (1 credit = $0.01). The headline savings unit.
export function usdToCredits(usd: number): number {
  return usd / USD_PER_AI_CREDIT;
}

// Saved tokens → AI Credits at a model's input rate, in one step.
export function tokensToCredits(
  tokens: number,
  pricePerMtok = DEFAULT_INPUT_PRICE_PER_MTOK,
): number {
  return usdToCredits(tokensToUsd(tokens, pricePerMtok));
}

// Estimated USD saved across rows (ADR 0004 §4). Pricing is PER ROW: a row whose
// best-effort `model` is known prices at that model's rate; a row with no model
// prices at the default constant. `override` (from `-t <model>`) forces ONE model's
// rate for every row. The figure is an ESTIMATE (estimate_kind: "heuristic"), never
// `saved_tokens`.
export function estimateSavingsUsd(records: HistoryRecord[], override?: string): number {
  const overridePrice = override ? priceForModel(override) : undefined;
  let usd = 0;
  for (const record of records) {
    const price = overridePrice ?? priceForModel(record.model);
    usd += tokensToUsd(record.saved_tokens, price);
  }
  return usd;
}

// Rollup-backed estimate: uses per-model saved totals from the incremental cache.
export function estimateSavingsUsdFromRollup(
  savedByModel: Record<string, number>,
  override?: string,
): number {
  if (override) {
    const total = Object.values(savedByModel).reduce((sum, saved) => sum + saved, 0);
    return tokensToUsd(total, priceForModel(override));
  }
  let usd = 0;
  for (const [model, saved] of Object.entries(savedByModel)) {
    usd += tokensToUsd(saved, priceForModel(model || undefined));
  }
  return usd;
}
