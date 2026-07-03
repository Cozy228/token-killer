/**
 * @ctx/core — public entry.
 *
 * The store, ingest, extract, select and serve layers land in later M1 slices
 * (1b onward, CTX-IMPL §1/§9). Slice 1a only establishes the package so the
 * foundation can later pin the shared `Store` / `SourceAdapter` contract that
 * every downstream slice builds against. This surface is intentionally empty
 * until 1b.
 */

/** Milestone marker for the scaffolding; replaced by real exports in slice 1b. */
export const CTX_CORE_SCAFFOLD = "m1-1a" as const;
