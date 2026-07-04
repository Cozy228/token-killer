/**
 * Selection-engine constants (CTX-IMPL §6) — ALL tunables live here and are
 * envelope-disclosed (`disclosedConstants()` feeds the typed envelope struct).
 *
 * Sources: §6 pinned values (α=0.25/25 iters, RRF K=60, lean ≈1200 tokens with
 * fixed percentages, heat formula, decay window); codegraph query-utils
 * conventions for the lexical side (top-64, stopwords, test demotion); P28
 * addendum `budget:'wide'` = 3× lean caps, same percentages.
 */

// ---- seeds / lexical (stage 1) ----
/** FTS5 bm25 candidate cap (§6.1 "top-64"). */
export const FTS_SEED_LIMIT = 64;
/** Seed-scoring sums only the top-N FTS hits per file (§6.1 "top-3 matches per file"). */
export const MAX_SEEDS_PER_FILE = 3;
/** Seed mass for a named-seed injection (force-include; aider's 100-mass convention). */
export const NAMED_SEED_WEIGHT = 100;
/** Down-weight for query tokens that are part of the project name (§6.1). */
export const PROJECT_NAME_TOKEN_WEIGHT = 0.25;
/** Weight of a split sub-token relative to its compound token. */
export const SUBTOKEN_WEIGHT = 0.6;
/** Weight of a stem variant relative to its source token. */
export const STEM_VARIANT_WEIGHT = 0.5;
/** Test-file demotion factor, applied unless the query is about tests (§6.1). */
export const TEST_FILE_DEMOTION = 0.3;
/** Kind bonuses (§6.1: class/function/method small boost — meaningful at M2). */
export const KIND_BONUS: Readonly<Record<string, number>> = {
  symbol: 1.15,
  module: 1.05,
};

// ---- subgraph expansion (stage 2) ----
export const EXPANSION_MAX_DEPTH = 2;
export const EXPANSION_NODE_CAP = 512;
/** Score damp applied per hop for search()'s flat ranking of expanded nodes. */
export const EXPANSION_HOP_DAMP = 0.5;

// ---- PPR (stage 3) ----
/** Restart probability α (§6.3, codegraph's production-tuned constant). */
export const PPR_ALPHA = 0.25;
/** Fixed power-iteration count (§6.3) — no early exit, deterministic. */
export const PPR_ITERATIONS = 25;

// ---- post-multipliers + fusion (stage 3) ----
/** Time-decay window for history/memory kinds: exp(-age / 90d). Code never decays. */
export const DECAY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
/** Confidence soft factor = CONF_SOFT_BASE + CONF_SOFT_SPAN · conf (§6.3). */
export const CONF_SOFT_BASE = 0.5;
export const CONF_SOFT_SPAN = 0.5;
/** Per-predicate confidence floors, used when a link carries no confidence (§6.3). */
export const PREDICATE_CONFIDENCE_FLOOR: Readonly<Record<string, number>> = {
  touches: 1.0,
  "renamed-to": 0.9,
  references: 0.6,
  "co-changed": 0.4,
  anchoredTo: 1.0,
  supersedes: 1.0,
  amends: 1.0,
};
export const DEFAULT_CONFIDENCE_FLOOR = 0.5;
/** Memory authority boost: confirmed entries ×1.3 (§6.3). */
export const MEMORY_CONFIRMED_BOOST = 1.3;
/** Reciprocal Rank Fusion constant (§6.3, gitnexus hybrid-search). */
export const RRF_K = 60;
/** History-heat boost: score × (1 + HEAT_BOOST · heat) for code kinds (§6.3). */
export const HEAT_BOOST = 0.5;
/** heat = min(commits_90d / HEAT_COMMIT_SATURATION, 1)·HEAT_FREQ_WEIGHT + recency·HEAT_RECENCY_WEIGHT */
export const HEAT_COMMIT_SATURATION = 20;
export const HEAT_FREQ_WEIGHT = 0.7;
export const HEAT_RECENCY_WEIGHT = 0.3;

// ---- sections + budget (stage 4) ----
/** Lean-tier total budget in tokens (§6.4 "≈1200"). */
export const LEAN_TOTAL_TOKENS = 1200;
/** budget:'wide' = 3× lean caps, same percentages (P28 addendum / FORK-3). */
export const WIDE_MULTIPLIER = 3;
/** Section shares of the total budget (§6.4). Must sum to 1.0. */
export const SECTION_SHARE = {
  subject: 0.15,
  code: 0.3,
  decisions: 0.15,
  history: 0.15,
  memory: 0.1,
  conflicts: 0.1,
  envelope: 0.05,
} as const;

// ---- projection (stage 5) ----
/** Token estimate = chars / 4 (§6.5). */
export const CHARS_PER_TOKEN = 4;
/** Render-tier thresholds as fractions of the section's top score. */
export const FULL_TIER_MIN_FRACTION = 0.5;
export const SKELETON_TIER_MIN_FRACTION = 0.15;
/**
 * Marginal-score floor (§6.5 omit-with-handle beats degraded-inline): items
 * below this fraction of the section's top score render at most a handle line.
 */
export const MARGINAL_SCORE_FLOOR = 0.05;

// ---- search / facets ----
/** Flat ranked search render cap (auto-cap; excess counted, never silent). */
export const SEARCH_MAX_RESULTS = 20;
/** Facet drill-downs skip PPR and get their own budget (§6 "~800 tokens"). */
export const FACET_BUDGET_TOKENS = 800;

/** Envelope disclosure (§6: "all constants live in select/constants.ts, envelope-disclosed"). */
export function disclosedConstants(): Record<string, number | string> {
  return {
    ftsSeedLimit: FTS_SEED_LIMIT,
    maxSeedsPerFile: MAX_SEEDS_PER_FILE,
    namedSeedWeight: NAMED_SEED_WEIGHT,
    testFileDemotion: TEST_FILE_DEMOTION,
    expansionMaxDepth: EXPANSION_MAX_DEPTH,
    expansionNodeCap: EXPANSION_NODE_CAP,
    pprAlpha: PPR_ALPHA,
    pprIterations: PPR_ITERATIONS,
    decayWindowDays: DECAY_WINDOW_MS / 86_400_000,
    memoryConfirmedBoost: MEMORY_CONFIRMED_BOOST,
    rrfK: RRF_K,
    heatBoost: HEAT_BOOST,
    leanTotalTokens: LEAN_TOTAL_TOKENS,
    wideMultiplier: WIDE_MULTIPLIER,
    sectionShare: Object.entries(SECTION_SHARE)
      .map(([k, v]) => `${k}=${v}`)
      .join(","),
    charsPerToken: CHARS_PER_TOKEN,
    marginalScoreFloor: MARGINAL_SCORE_FLOOR,
    searchMaxResults: SEARCH_MAX_RESULTS,
    facetBudgetTokens: FACET_BUDGET_TOKENS,
  };
}
