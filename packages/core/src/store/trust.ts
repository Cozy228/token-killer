/**
 * Trust classification (R-slice / DR-02, PRODUCT-DESIGN.md §3).
 *
 * The pre-R-slice store carried a single 4-value `authority` enum
 * (observed|derived|inferred|confirmed) that conflated two orthogonal axes LAW
 * §3 keeps separate:
 *
 *   - `derivation`  — HOW the fact was obtained: OBSERVED (read mechanically off a
 *                     source artifact), DECLARED (a human/agent asserted it), or
 *                     INFERRED (a heuristic proposed it).
 *   - `confidence`  — how well corroborated: CONFIRMED (independent corroboration),
 *                     LIKELY (one authoritative source), POSSIBLE (heuristic).
 *
 * This module is the SINGLE source of truth for the split. `trustFor` maps a
 * claim/event's `(carrier, method, actor)` to `{derivation, confidence}`. The SQL
 * backfill in `migrations/006-*.sql` mirrors this matrix exactly (kept in sync by
 * hand — see the table comment there); any change here must be reflected there.
 *
 * DR-02 rules that never bend:
 *   - Backfill from carrier+method+actor, NEVER from the legacy 4-value enum and
 *     NEVER from authorship alone.
 *   - `CONFIRMED` requires independent corroboration → `trustFor` NEVER returns it
 *     (a single row is never self-corroborating). CONFIRMED is reserved for an
 *     explicit corroboration signal (e.g. SCIP upgrading a tree-sitter link), set
 *     by that path, not here.
 *   - Ambiguous provenance stays `unknown` (null derivation / null confidence) and
 *     must never render as a likely fact.
 */

/** Derivation axis — how the fact was obtained (LAW §3). `null` = unknown. */
export type Derivation = "OBSERVED" | "DECLARED" | "INFERRED";

/** Confidence axis — corroboration tier (LAW §3). `null` = unassessed/unknown. */
export type Confidence = "CONFIRMED" | "LIKELY" | "POSSIBLE";

export interface TrustClass {
  derivation: Derivation | null;
  confidence: Confidence | null;
}

const DECLARING_CARRIERS = new Set(["remember", "remember-local", "memory", "cli"]);
const OBSERVED_METHODS = new Set(["path-match", "symbol-match", "rename-tracked", "structural"]);

/**
 * Map a claim/event's provenance to its derivation+confidence class.
 * Pure and total; unrecognized inputs resolve to `unknown` (both null).
 */
export function trustFor(carrier: string, method: string, _actor?: string): TrustClass {
  // Synthetic migration/system rows have no honest provenance → unknown.
  if (carrier === "migration" || carrier === "system") {
    return { derivation: null, confidence: null };
  }

  // Host imports: the host declared it, but it is imported and unverified.
  if (carrier.startsWith("host:") || carrier.startsWith("host-import:")) {
    return { derivation: "DECLARED", confidence: "POSSIBLE" };
  }

  let derivation: Derivation | null;
  if (DECLARING_CARRIERS.has(carrier)) {
    derivation = "DECLARED";
  } else if (method === "semantic-proposal") {
    derivation = "INFERRED";
  } else if (method === "explicit-key") {
    // An author wrote an explicit key/trailer (frontmatter amends/supersedes,
    // git trailer) — a declaration carried in a source artifact.
    derivation = "DECLARED";
  } else if (OBSERVED_METHODS.has(method)) {
    derivation = "OBSERVED";
  } else {
    derivation = null;
  }

  let confidence: Confidence | null;
  if (method === "semantic-proposal") {
    confidence = "POSSIBLE"; // heuristic — can never satisfy a control/authority Q
  } else if (derivation === "OBSERVED" || derivation === "DECLARED") {
    confidence = "LIKELY"; // one authoritative source; CONFIRMED needs corroboration
  } else {
    confidence = null; // unknown derivation → unknown confidence
  }

  return { derivation, confidence };
}

/**
 * Trust class for a memory row, derived from its `origin` (the memory subsystem's
 * provenance carrier; the row has no carrier/method columns). Mirrors the SQL
 * memory backfill in migration 006 exactly.
 *   - `remember` / `remember-local` / `human-note` → a human/agent DECLARED it (LIKELY).
 *   - `host-import:*`                               → imported, unverified (DECLARED, POSSIBLE).
 *   - anything else                                 → unknown.
 */
export function memoryTrustFor(origin: string): TrustClass {
  if (origin.startsWith("host-import:")) {
    return { derivation: "DECLARED", confidence: "POSSIBLE" };
  }
  if (origin === "remember" || origin === "remember-local" || origin === "human-note") {
    return { derivation: "DECLARED", confidence: "LIKELY" };
  }
  return { derivation: null, confidence: null };
}
