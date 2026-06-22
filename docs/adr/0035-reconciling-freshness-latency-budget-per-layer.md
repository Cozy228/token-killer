# Big-jump freshness = RECONCILING state + latency-budget execution + per-layer freshness

A large HEAD movement (e.g. `git pull` of 500 files) must not be resolved by either of the two
naive options: silently blocking the interactive query to run a full recompute (a multi-second
freeze, worse under Windows AV), or serving the stale index behind a banner (returns wrong
canonical edges — violates "never confidently wrong"). We adopt a third model.

## Decision

**E9's `FULL_UPDATE` decides only *which layers* must recompute — it does NOT decide whether to
block the query.** The two concerns are decoupled.

On the first query after a big jump:

1. **Cheap synchronous reconciliation runs first** — compute the changed-files set + the reverse
   `calls`/`imports` invalidation closure, and mark the affected canonical facts `pending`
   (invisible to ranking/projection). This stage does **not** re-parse the files, so it cannot
   cause a multi-second freeze.
2. **Execution timing is latency-budget-gated** by the estimated p95 cost of the full recompute:
   - **< 1s** → inline refresh (do it now, brief block).
   - **1–2s and the current query does not depend on the affected region** → serve the unaffected
     results immediately; recompute proceeds without blocking.
   - **> 2s** → never block; the per-session MCP continues reconciliation within the session.
   - `tk sync` remains an explicit warm-up / recovery channel, but is **not** the only recovery
     path after a big jump.

## Safety constraint (the non-negotiable part)

Never return affected **stale canonical edges** with only a banner (the rejected option). Instead:

- **Unaffected facts** → returned in full.
- **Changed files** → answerable via live-read / file-local parse (fresh without the full graph).
- **Results that depend on to-be-rebuilt edges** (callers / flow / impact) → marked `PARTIAL` /
  `UNKNOWN`, or the query returns `SYNC_REQUIRED` when it cannot be answered honestly.

This yields no global first-query freeze **and** no confidently-wrong answer.

## Consequences

- **New index state `RECONCILING`** (big jump in progress) — distinct from `FROZEN`, which is now
  **reserved for sync *failure* only**.
- **Freshness model upgrades** from a single `stale: boolean` to **per-result / per-layer
  `resultFreshness` + `completeness`**. Ranking, projection, and both surfaces (codemap agent +
  codeguide) read the per-layer value, not a global flag.
- E1/E3/E9/E14 keep their scoping mechanics; what changes is that staleness becomes a graded,
  per-layer, budget-scheduled state rather than a binary blocking decision.

(User-authored design, grilling 2026-06-22 round 4 — preferred over both silent-block and
freeze-banner.)
