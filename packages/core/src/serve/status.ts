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
import { composeStatus, foldStatusAsOf } from "../memory/fold.ts";
import { isOverrideExpired } from "../memory/overrideExpiry.ts";
import type { Store } from "../store/store.ts";
import type { ClaimStatus, MemoryRow, MemoryStatus } from "../store/types.ts";

/**
 * Compute the §3 status of a memory claim from its row + the store's conflict
 * signals. Precedence is deliberate: disclosure and availability outrank a stale
 * body (a restricted or absent claim must never render as merely `stale`), and an
 * open contradiction outranks the lifecycle status.
 */
export function memoryClaimStatus(
  store: Store,
  row: MemoryRow,
  now: number = Date.now(),
): ClaimStatus {
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

  if (row.status === "active") {
    // DR-12: an expired semantic local override loses precedence — surfaced as
    // stale-until-reverified (retained, never deleted); re-`confirm` restores it.
    if (isOverrideExpired(store, row.entityId, now)) return "stale";
    return "resolved";
  }
  return "unknown";
}

/**
 * DR-10 — the memory lifecycle status recomputed AS OF a past instant, by folding
 * the event log up to `asOf` (see `foldStatusAsOf`). The current drift annotation
 * is composed in (drift is per-checkout index state, not a historical event); pass
 * the row's `driftReason` when a served answer is wanted, or omit for pure
 * transaction-time lifecycle history. This is the equivalent as-of recompute path
 * §3 bitemporality requires — no `valid_from`/`valid_to` read needed.
 */
export function memoryStatusAsOf(
  store: Store,
  memoryId: string,
  asOf: number,
  drift?: MemoryRow["driftReason"],
): MemoryStatus {
  return composeStatus(foldStatusAsOf(store.memoryEvents(memoryId), asOf), drift);
}
