/**
 * DR-12 — scoped expiry for SEMANTIC LOCAL overrides (LAW §3 "local overrides
 * expire"; Appendix A DR-12).
 *
 * As merged, an override's precedence only soft-decayed with age (90d) but never
 * lost eligibility — a stale `remember --local --supersedes` note could keep
 * winning forever, turning the compiler into another stale catalog. DR-12 (Gate-A
 * downgrade): expiry = loss of current precedence/ELIGIBILITY, NOT deletion. An
 * expired override is RETAINED and surfaced as stale-flagged; only its precedence
 * lapses (LAW §3 "corrections are claims … local overrides expire").
 *
 * SCOPE (deliberately narrow — the register's "scope to semantic local overrides"):
 * a memory is a semantic local override iff it is `origin = remember-local`
 * (a deliberately-never-shared personal note) AND it carries a `supersedes` claim
 * (it overrode another claim). Ordinary local notes and committed/mainline
 * supersedes are untouched.
 *
 * TRIGGER/cadence is an implementation choice (register): a re-verification TTL
 * from the override's creation time. Past the TTL the override must be re-verified
 * (re-`confirm`ed / re-asserted) to regain precedence.
 */
import type { Store } from "../store/store.ts";

/** Re-verification horizon for a semantic local override (90d — the store's
 *  existing decay horizon). Past this the override lapses to stale-until-reverified. */
export const SEMANTIC_OVERRIDE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** A `remember-local` note that superseded another claim (a semantic override). */
export function isSemanticLocalOverride(store: Store, entityId: string): boolean {
  const row = store.getMemory(entityId);
  if (!row || row.origin !== "remember-local") return false;
  return store.claimsFor(entityId, "supersedes").length > 0;
}

/** The override's assertion time = its `create` event `at`, else the entity's
 *  first-seen (a store-only row with no event log). */
export function overrideCreatedAt(store: Store, entityId: string): number | undefined {
  const create = store.memoryEvents(entityId).find((e) => e.verb === "create");
  if (create) return create.at;
  return store.getEntity(entityId)?.firstSeen;
}

/**
 * Has a semantic local override passed its re-verification TTL (as of `now`)?
 * Non-overrides always return false (only this class expires — DR-12 scope).
 */
export function isOverrideExpired(
  store: Store,
  entityId: string,
  now: number,
  ttlMs: number = SEMANTIC_OVERRIDE_TTL_MS,
): boolean {
  if (!isSemanticLocalOverride(store, entityId)) return false;
  const createdAt = overrideCreatedAt(store, entityId);
  if (createdAt === undefined) return false;
  return now - createdAt >= ttlMs;
}
