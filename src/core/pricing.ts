// Shared pricing (ADR 0004 §4). The default constant is Claude Sonnet input
// $/Mtok. BOTH `tg gain --quota` and the telemetry `estimated_savings_usd_30d`
// field import from here — there is no second price path. The constant and the
// table are documented in docs/TELEMETRY.md. Unknown/typo model names fall back to
// the default constant, never an error.

import type { HistoryRecord } from "./history.js";

// Default estimate constant — Claude Sonnet input price, the honest fallback when a
// row carries no model (every shell command-proxy row).
export const DEFAULT_INPUT_PRICE_PER_MTOK = 3; // $/Mtok

// model id (and short alias) → input $/Mtok. Aliases (`opus`/`sonnet`/`haiku`) let
// `-t opus` work; full ids let a hook-runtime `model` row price itself.
export const MODEL_INPUT_PRICE_PER_MTOK: Record<string, number> = {
  opus: 15,
  sonnet: 3,
  haiku: 0.8,
  "claude-opus-4-8": 15,
  "claude-opus-4-7": 15,
  "claude-opus-4-6": 15,
  "claude-sonnet-4-6": 3,
  "claude-sonnet-4-5": 3,
  "claude-haiku-4-5": 0.8,
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
