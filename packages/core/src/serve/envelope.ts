/**
 * DR-07 / DR-31 — the minimum claim envelope (LAW §3, R6).
 *
 * Every served fact must reach the consumer as a claim, not a bare locator: the
 * envelope carries the per-claim trust data the consumer needs to decide whether
 * to rely on it. Before the R-slice the MCP served locators with no evidence
 * anchor, derivation, confidence, status, freshness, or disclosure — an agent
 * could neither cite nor gauge a served fact. This module defines the DTO, builds
 * it for any served entity, and renders it TERSELY (DR-07's 1-glyph spirit — the
 * product's value is fewer tokens).
 *
 * Under R6 the SAME envelope is serialized to the machine (MCP) interface under
 * the caller's scope (DR-31), so an agent gets the same claims + citations +
 * UNKNOWN/restricted outcomes a human does.
 */
import { memoryClaimStatus } from "./status.ts";
import type { Store } from "../store/store.ts";
import type { Confidence, Derivation, Disclosure, Entity, ClaimStatus } from "../store/types.ts";

/** Pre-V1 accelerator disclosure (DR-01): every response carries it. The served
 *  graph is a rebuildable accelerator, NOT a validated decision oracle. */
export const ACCELERATOR_DISCLOSURE =
  "accelerator, not validated — a rebuildable index of cited sources, not a verified decision oracle";

export interface ClaimEvidence {
  /** Source anchor URI (locator). */
  uri: string;
  /** Immutable state key (git rev / snapshot date / write rev) when known. */
  revision?: string;
  /** Content hash of the anchored artifact when known. */
  hash?: string;
}

/** The minimum claim envelope (LAW §3). `null` on a trust axis = unknown. */
export interface ClaimEnvelope {
  subject: string;
  evidence: ClaimEvidence;
  /** As-of computation time (epoch-ms). */
  observedAt: number;
  derivation: Derivation | null;
  confidence: Confidence | null;
  status: ClaimStatus;
  /** Per-claim freshness: `unknown-until-reverified` once drift/stale is detected,
   *  else the source's decay class (never a false content-freshness claim). */
  freshness: string;
  disclosure: Disclosure;
}

/** Locator → source-anchor URI. */
function locatorUri(entity: Entity): string {
  const l = entity.locator;
  switch (l.t) {
    case "file":
      return l.span ? `file:${l.path}:${l.span[0]}-${l.span[1]}` : `file:${l.path}`;
    case "git":
      return `git:${l.oid}`;
    case "snapshot":
      return `snapshot:${l.carrier}:${l.file}${l.ptr ? `#${l.ptr}` : ""}`;
    case "store":
      return `store:${entity.id}`;
  }
}

/** Does any link touching this entity read stale (DR-04 freshness signal)? */
function hasStaleEdge(store: Store, entityId: string): boolean {
  return (
    store.linksFrom(entityId).some((l) => l.stale) || store.linksTo(entityId).some((l) => l.stale)
  );
}

/**
 * Build the minimum claim envelope for a served entity. Memory entities carry
 * their trust data directly (DR-02/03/05); other kinds derive it from the entity
 * and its strongest backing claim + freshness signals.
 */
export function claimEnvelopeFor(store: Store, entity: Entity): ClaimEnvelope {
  const evidence: ClaimEvidence = {
    uri: locatorUri(entity),
    ...(entity.sourceRev ? { revision: entity.sourceRev } : {}),
    ...(entity.contentHash ? { hash: entity.contentHash } : {}),
  };

  if (entity.kind === "memory") {
    const row = store.getMemory(entity.id);
    const status: ClaimStatus = row ? memoryClaimStatus(store, row) : "unknown";
    const drifted = row?.driftReason !== undefined || status === "stale";
    return {
      subject: entity.id,
      evidence,
      observedAt: entity.lastVerified,
      derivation: row?.derivation ?? null,
      confidence: row?.confidence ?? null,
      status,
      freshness: drifted ? "unknown-until-reverified" : "content-hash",
      disclosure: row?.disclosure ?? "local",
    };
  }

  // Non-memory: derive trust from the strongest backing claim (first by id), and
  // status from the freshness signal (a stale edge → stale, else resolved).
  const claim = store.claimsFor(entity.id)[0];
  const stale = hasStaleEdge(store, entity.id);
  return {
    subject: entity.id,
    evidence,
    observedAt: entity.lastVerified,
    derivation: claim?.derivation ?? null,
    confidence: claim?.confidence ?? null,
    status: stale ? "stale" : "resolved",
    freshness: stale ? "unknown-until-reverified" : "content-hash",
    disclosure: "local",
  };
}

const DERIV_GLYPH: Record<Derivation, string> = { OBSERVED: "O", DECLARED: "D", INFERRED: "I" };
const CONF_GLYPH: Record<Confidence, string> = { CONFIRMED: "C", LIKELY: "L", POSSIBLE: "P" };

/**
 * Terse one-line render of an envelope (DR-07 1-glyph spirit). Example:
 *   ‹O·L·resolved·content-hash·local › git:abc123
 * `?` on a trust axis = unknown (never rendered as a likely fact).
 */
export function renderEnvelopeTerse(env: ClaimEnvelope): string {
  const d = env.derivation ? DERIV_GLYPH[env.derivation] : "?";
  const c = env.confidence ? CONF_GLYPH[env.confidence] : "?";
  const rev = env.evidence.revision ? `@${env.evidence.revision.slice(0, 8)}` : "";
  return `‹${d}·${c}·${env.status}·${env.freshness}·${env.disclosure}› ${env.evidence.uri}${rev}`;
}
