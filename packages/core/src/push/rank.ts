/**
 * Gotcha ranking for the push digest (CTX-IMPL §7).
 *
 * The push block surfaces the top memory gists ("gotchas"). Ranking REUSES the
 * selection engine's memory primitives (§6.3) rather than inventing a second
 * scale: `authorityBoost` (confirmed ×1.3) × `timeDecay` over the entry's
 * decay basis (the most recently anchored claim, else last-verified). This
 * keeps push and pull ranking consistent — a gotcha the selection engine would
 * rank highly is the same one the digest pins to the top.
 *
 * Pins force-include (moved to the front, in listed order); vetoes force-exclude
 * (a veto wins over a pin on collision). Both operate on entity ids resolved
 * from either a full id or a short [handle].
 */
import type { Store } from "../store/store.ts";
import type { Authority } from "../store/types.ts";
import { authorityBoost, decayBasis, memoryFreshnessPenalty, timeDecay } from "../select/rank.ts";
import { listMemories } from "../memory/remember.ts";
import type { PushConfig } from "./config.ts";

export interface GotchaCandidate {
  entityId: string;
  gist: string;
  handle: string;
  authority: Authority;
  /** Composite §6.3 memory score (authority × recency decay). */
  score: number;
  /** True when force-included by a `.ctx/push.jsonc` pin. */
  pinned: boolean;
}

/** Resolve a pin/veto id (full id OR short [handle]) to an existing entity id. */
function resolveEntityId(store: Store, idOrHandle: string): string | undefined {
  const viaHandle = store.resolveHandle(idOrHandle);
  if (viaHandle && store.getEntity(viaHandle.entityId)) return viaHandle.entityId;
  if (store.getEntity(idOrHandle)) return idOrHandle;
  return undefined;
}

/**
 * A2/E5: a memory may be PINNED into push only if it is push-eligible — `active`
 * and not stale-flagged (no OPEN `stale-suspect` conflict, i.e. not a currently
 * drifted entry). A pin may order/force among eligible items; it may NOT force
 * in a needs-review / superseded / retired / drifted entry. Veto always wins
 * (applied separately, before this). Current-state is the resolvable CONFLICT,
 * not the append-only stale-reason claims — `confirm` restores eligibility.
 */
function isPushEligible(store: Store, entityId: string): boolean {
  const row = store.getMemory(entityId);
  if (!row || row.status !== "active") return false;
  if (store.openStaleSuspects(entityId).length > 0) return false;
  return true;
}

/** Composite memory score = authority boost × recency time-decay × freshness (§6.3). */
function scoreOf(store: Store, entityId: string, now: number): number {
  const entity = store.getEntity(entityId);
  if (!entity) return 0;
  const basis = decayBasis(store, entity);
  const decay = basis !== undefined ? timeDecay(basis, now) : 1;
  // A5: a `body-changed`-drifted active gotcha stays pushable but sinks.
  return authorityBoost(store, entity) * decay * memoryFreshnessPenalty(store, entity);
}

/**
 * Rank active memory gists into gotcha candidates, applying pin/veto. Deterministic:
 * pins first (in config order), then auto-ranked by score desc, entity-id asc.
 * Each candidate carries an interned, resolvable [handle] (G-5 spirit).
 */
export function rankGotchas(
  store: Store,
  config: PushConfig = { pin: [], veto: [], warnings: [], ok: true },
  now: number = Date.now(),
): GotchaCandidate[] {
  const veto = new Set<string>();
  for (const id of config.veto) {
    const resolved = resolveEntityId(store, id);
    if (resolved) veto.add(resolved);
  }
  const pinOrder: string[] = [];
  const pinned = new Set<string>();
  for (const id of config.pin) {
    const resolved = resolveEntityId(store, id);
    // A2: veto wins, and a pin only orders among ELIGIBLE items — it may not
    // force in a needs-review / superseded / retired / stale-flagged memory.
    if (
      resolved &&
      !pinned.has(resolved) &&
      !veto.has(resolved) &&
      isPushEligible(store, resolved)
    ) {
      pinned.add(resolved);
      pinOrder.push(resolved);
    }
  }

  // Enumerate active memories; index by entity id so pins (all eligible → active)
  // promote members and reference gists uniformly.
  const byId = new Map<string, { gist: string; authority: Authority }>();
  for (const m of listMemories(store, { status: "active" })) {
    byId.set(m.entityId, { gist: m.gist, authority: m.authority });
  }

  const build = (entityId: string, isPinned: boolean): GotchaCandidate => {
    const info = byId.get(entityId)!;
    return {
      entityId,
      gist: info.gist,
      handle: store.internHandle(entityId),
      authority: info.authority,
      score: scoreOf(store, entityId, now),
      pinned: isPinned,
    };
  };

  const out: GotchaCandidate[] = [];
  for (const id of pinOrder) {
    if (byId.has(id)) out.push(build(id, true));
  }

  const auto: GotchaCandidate[] = [];
  for (const entityId of byId.keys()) {
    if (pinned.has(entityId) || veto.has(entityId)) continue;
    auto.push(build(entityId, false));
  }
  auto.sort((a, b) => b.score - a.score || (a.entityId < b.entityId ? -1 : 1));
  out.push(...auto);
  return out;
}
