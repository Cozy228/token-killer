// The single token estimator (metrics-ledger Gap A, ADR 0004 Decision 8). Every
// ledger and the telemetry builder import from here so the estimate can never
// drift between what `tk gain` shows and what telemetry sends. Rough heuristic
// only — ~4 chars per token, no exact tokenization.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
