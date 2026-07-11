/**
 * DR-04 — per-source freshness decay class + re-verification trigger (scaffold).
 *
 * LAW §3 `freshness: per-source decay class + re-verification trigger`. File-backed
 * sources (git/code/docs/memory) are re-verified mechanically at ingest — a content
 * hash change flips the edge `stale` and the anchor `drift_reason`, and the served
 * claim reads unknown-until-reverified (see subgraph downgrade + DR-03 status).
 *
 * Non-file connectors (github/jira/confluence — M4, RESERVED) have no local content
 * hash: a snapshot ages and must be re-verified on a per-source cadence before it can
 * back a served claim. This module is the SCAFFOLD for that: a decay class per source
 * and the trigger shape a connector will implement. No connector is wired yet (M4 is
 * gated), so nothing here runs in the M1/M2 serve path — it exists so the freshness
 * contract is declared at the source boundary, not bolted on later.
 */
import type { SourceId } from "../ingest/adapter.ts";

/**
 * How a source's freshness decays:
 *   - `content-hash`  file-backed: freshness is re-derived from a byte hash at
 *                     ingest; no time decay (git/code/docs/memory).
 *   - `snapshot-ttl`  connector snapshot: freshness decays with age; a served
 *                     claim past its TTL must be re-verified (github/jira/confluence).
 */
export type DecayClass = "content-hash" | "snapshot-ttl";

export interface SourceFreshnessPolicy {
  decay: DecayClass;
  /** Re-verification cadence for a `snapshot-ttl` source (ms). Absent = N/A. */
  ttlMs?: number;
}

/** Default per-source freshness policy. File sources = content-hash (no TTL);
 *  connectors = snapshot-ttl (revalidate before a served claim, M4). */
export const SOURCE_FRESHNESS: Readonly<Record<SourceId, SourceFreshnessPolicy>> = {
  git: { decay: "content-hash" },
  code: { decay: "content-hash" },
  docs: { decay: "content-hash" },
  memory: { decay: "content-hash" },
  // Connectors (M4, reserved): a snapshot must be re-verified before trigger-time.
  github: { decay: "snapshot-ttl", ttlMs: 15 * 60_000 },
  jira: { decay: "snapshot-ttl", ttlMs: 60 * 60_000 },
  confluence: { decay: "snapshot-ttl", ttlMs: 60 * 60_000 },
};

/**
 * Should a `snapshot-ttl` source be re-verified given the snapshot age? Content-hash
 * sources are never time-stale (they re-verify at ingest) → always false. The M4
 * connector layer calls this before serving a snapshot-backed claim; until then it
 * is unreferenced scaffold (documented, tested pure).
 */
export function needsReverification(source: SourceId, snapshotAgeMs: number): boolean {
  const policy = SOURCE_FRESHNESS[source];
  if (policy.decay !== "snapshot-ttl" || policy.ttlMs === undefined) return false;
  return snapshotAgeMs >= policy.ttlMs;
}
