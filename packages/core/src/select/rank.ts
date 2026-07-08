/**
 * Stage 3b — post-multipliers + fusion (CONTEXA-IMPL §6.3).
 *
 * Post-multipliers on the graph (PPR) side: time decay `exp(-age/90d)` for
 * history/memory kinds ONLY (code never decays), confidence soft factor
 * `0.5 + 0.5·conf`, memory authority boost (confirmed ×1.3). Then Reciprocal
 * Rank Fusion (K=60) of graph and lexical ranks — the two scales are
 * incomparable, ranks are not. Then the history-heat boost `×(1 + 0.5·heat)`
 * for code kinds, computed free from git `touches`. Ranking is ALWAYS a
 * composite, never single-metric.
 */
import type { Store } from "../store/store.ts";
import type { Entity, EntityKind } from "../store/types.ts";
import {
  CONF_SOFT_BASE,
  CONF_SOFT_SPAN,
  DECAY_WINDOW_MS,
  HEAT_BOOST,
  HEAT_COMMIT_SATURATION,
  HEAT_FREQ_WEIGHT,
  HEAT_RECENCY_WEIGHT,
  MEMORY_CONFIRMED_BOOST,
  RRF_K,
  STALE_MEMORY_PENALTY,
} from "./constants.ts";

const HISTORY_KINDS: ReadonlySet<EntityKind> = new Set([
  "commit",
  "pr",
  "issue",
  "story",
  "meeting",
]);
const CODE_KINDS: ReadonlySet<EntityKind> = new Set(["symbol", "file", "module"]);

export function isHistoryKind(kind: EntityKind): boolean {
  return HISTORY_KINDS.has(kind);
}
export function isCodeKind(kind: EntityKind): boolean {
  return CODE_KINDS.has(kind);
}

/** Timestamp a decayable entity ages from (epoch ms), or undefined = no decay. */
export function decayBasis(store: Store, entity: Entity): number | undefined {
  if (entity.kind === "memory") {
    // "more recently-anchored ranks higher" (A6-decay): the newest anchoredTo
    // claim timestamp; entities without anchors age from last_verified.
    let latest = 0;
    for (const c of store.claimsFor(entity.id, "anchoredTo")) {
      if (c.at > latest) latest = c.at;
    }
    return latest > 0 ? latest : entity.lastVerified;
  }
  if (isHistoryKind(entity.kind)) {
    const iso = entity.attrs["date"];
    if (typeof iso === "string") {
      const t = Date.parse(iso);
      if (Number.isFinite(t)) return t;
    }
    return entity.lastVerified;
  }
  return undefined; // code/docs kinds never time-decay (§6.3)
}

/** exp(-age/90d); clamps future timestamps to age 0. */
export function timeDecay(basisMs: number, nowMs: number): number {
  const age = Math.max(0, nowMs - basisMs);
  return Math.exp(-age / DECAY_WINDOW_MS);
}

/** Confidence soft factor: 0.5 + 0.5·conf (conf ∈ [0,1]). */
export function confidenceFactor(conf: number): number {
  return CONF_SOFT_BASE + CONF_SOFT_SPAN * Math.min(Math.max(conf, 0), 1);
}

/** Memory authority boost: confirmed ×1.3; everything else ×1. */
export function authorityBoost(store: Store, entity: Entity): number {
  if (entity.kind !== "memory") return 1;
  const row = store.getMemory(entity.id);
  return row?.authority === "confirmed" ? MEMORY_CONFIRMED_BOOST : 1;
}

/**
 * Freshness/status penalty for a memory that is not a clean current fact
 * (A1/A5): superseded / needs-review, or an active entry with an OPEN
 * `stale-suspect` conflict (a `body-changed` anchor drift, A5 down-rank-only).
 * It is still served — just below clean active facts. Current-state lives on
 * the CONFLICT (resolvable by the lifecycle `confirm` verb), never on the
 * append-only `stale-reason` claims (the permanent audit trail) — a human
 * confirm restores full standing. `retired` never reaches here (visibility.ts
 * excludes it from default pull).
 */
export function memoryFreshnessPenalty(store: Store, entity: Entity): number {
  if (entity.kind !== "memory") return 1;
  const row = store.getMemory(entity.id);
  if (!row) return 1;
  if (row.status === "superseded" || row.status === "needs-review") return STALE_MEMORY_PENALTY;
  if (store.openStaleSuspects(entity.id).length > 0) return STALE_MEMORY_PENALTY;
  return 1;
}

/** Compose the §6.3 post-multipliers for one entity. */
export function postMultiplier(
  store: Store,
  entity: Entity,
  pathConfidence: number,
  nowMs: number,
): number {
  let m = confidenceFactor(pathConfidence);
  const basis = decayBasis(store, entity);
  if (basis !== undefined) m *= timeDecay(basis, nowMs);
  m *= authorityBoost(store, entity);
  m *= memoryFreshnessPenalty(store, entity);
  return m;
}

/**
 * History heat from git `touches` (§6.3):
 * heat = min(commits_90d/20, 1)·0.7 + recency·0.3, recency = share of the 90d
 * window still ahead of the latest touch (1 = touched now, 0 = ≥90d ago).
 */
export function historyHeat(store: Store, entity: Entity, nowMs: number): number {
  if (!isCodeKind(entity.kind)) return 0;
  let commits90d = 0;
  let latestTouch = 0;
  for (const l of store.linksTo(entity.id, "touches")) {
    const commit = store.getEntity(l.src);
    if (!commit || commit.kind !== "commit") continue;
    const iso = commit.attrs["date"];
    const t = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
    if (!Number.isFinite(t)) continue;
    if (nowMs - t <= DECAY_WINDOW_MS) commits90d++;
    if (t > latestTouch) latestTouch = t;
  }
  if (commits90d === 0 && latestTouch === 0) return 0;
  const freq = Math.min(commits90d / HEAT_COMMIT_SATURATION, 1);
  const recency = latestTouch > 0 ? Math.max(0, 1 - (nowMs - latestTouch) / DECAY_WINDOW_MS) : 0;
  return freq * HEAT_FREQ_WEIGHT + recency * HEAT_RECENCY_WEIGHT;
}

export function heatBoost(store: Store, entity: Entity, nowMs: number): number {
  return 1 + HEAT_BOOST * historyHeat(store, entity, nowMs);
}

/**
 * Reciprocal Rank Fusion (K=60; reference: gitnexus hybrid-search.ts).
 * Input lists are BEST-FIRST id arrays; output = id → Σ 1/(K + rank), rank
 * 1-based. Deterministic: ties in the final ordering must be broken by the
 * caller (we sort by score desc, then id asc).
 */
export function rrfFuse(lists: ReadonlyArray<readonly string[]>, k = RRF_K): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!;
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + i + 1));
    }
  }
  return fused;
}

/** Deterministic best-first ordering of a score map (score desc, id asc). */
export function rankOf(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
}
