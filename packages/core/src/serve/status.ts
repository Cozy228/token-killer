/**
 * DR-03 — per-claim `status` computed view (LAW §3 status enum).
 *
 * `status` is NEVER a stored column: it is derived on demand from the scattered
 * signals the store already keeps — `memory.status` (the fold cache), the anchor
 * `drift_reason` annotation, `unresolved_here`, `disclosure`, and the open
 * `conflicts` rows. Keeping it computed is the point: a stored status would drift
 * from its inputs the moment any one of them changed (the whole class of bug
 * `claims=evidence, conflicts=state` warns about).
 *
 * Documented memory-status projection (DR-03 / Appendix A):
 *   active                    → resolved
 *   needs-review (drift)      → stale       (an anchor drifted; reverify)
 *   needs-review (pending)    → unknown     (auto-note awaiting human confirm)
 *   unresolvedHere            → unavailable (committed anchor absent on this checkout)
 *   restricted (disclosure)   → restricted  (DR-05; body withheld)
 * plus, over the conflict signals:
 *   open contradiction        → conflicting
 *   open stale-suspect / superseded → stale
 *   retired                   → unavailable (hard-excluded from default pull)
 */
import type { Store } from "../store/store.ts";
import type { ClaimStatus, MemoryRow } from "../store/types.ts";

/**
 * Compute the §3 status of a memory claim from its row + the store's conflict
 * signals. Precedence is deliberate: disclosure and availability outrank a stale
 * body (a restricted or absent claim must never render as merely `stale`), and an
 * open contradiction outranks the lifecycle status.
 */
export function memoryClaimStatus(store: Store, row: MemoryRow): ClaimStatus {
  // 1. Disclosure gate (DR-05): a restricted body is withheld, not served stale.
  if (row.disclosure === "restricted") return "restricted";

  // 2. Availability: absent-on-this-checkout or retired → not servable as a fact.
  if (row.unresolvedHere) return "unavailable";
  if (row.status === "retired") return "unavailable";

  // 3. An open contradiction is the sharpest live-state signal → conflicting.
  if (store.openContradictions(row.entityId).length > 0) return "conflicting";

  // 4. Lifecycle / drift projection.
  if (row.status === "needs-review") {
    // needs-review is overloaded (DR-30): drift-stale vs confirmation-pending.
    return row.driftReason !== undefined ? "stale" : "unknown";
  }
  if (row.status === "superseded") return "stale";

  // 5. An active row with an open stale-suspect (body-changed drift, down-rank
  //    only) is stale-until-reverified, never a clean current fact.
  if (row.driftReason !== undefined) return "stale";
  if (store.openStaleSuspects(row.entityId).length > 0) return "stale";

  if (row.status === "active") return "resolved";
  return "unknown";
}
