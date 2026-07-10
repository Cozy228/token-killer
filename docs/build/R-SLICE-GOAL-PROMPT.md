---
status: active
review_after: 2026-07-25
purpose: goal prompt — the R-slice ("claim-serving integrity") retrofit on merged M1/M2 code; precondition for serving factual claims (P37 ③ satisfied — Gate-B closed 2026-07-11)
executor: single-track Opus builder in a worktree branch; Fable reviews (+ Codex post-merge review optional); P31 exec model
---

# Goal Prompt — R-slice: claim-serving integrity

## Mission

Retrofit the merged greenfield tree (`packages/core` + `packages/cli`) so every served fact
is claim-shaped per LAW §3. **Binding spec = root `CONTEXA-IMPL.md` §8 (R-slice row + the
11-item acceptance list) and Appendix A rows DR-01/02/03/04/05/06/07/09/10/12/27/31/32**
(with their P37 corrigenda/overrides). This prompt orders the work; it does not restate the
spec — on any wording conflict, CONTEXA-IMPL wins.

## Phases (ordered; each lands green before the next)

1. **Schema + backfill**: split `authority` → `derivation`(OBSERVED|DECLARED|INFERRED) +
   `confidence`(CONFIRMED|LIKELY|POSSIBLE) across claims/memory/memory_events/committed
   mem-dec grammar/TS types, backfill per DR-02 rules (ambiguous → unknown; never from
   authorship alone); per-claim `status` computed view (DR-03); `disclosure` column default
   local (DR-05 schema half); D32 generation tuple (repository revision, worktree digest,
   schema version, analysis-policy version) with reject/rebuild on mismatch (DR-06); drop
   `served_count`/`last_served` (DR-09, P37 ⑧); equivalent as-of recompute path instead of
   wiring `valid_from`/`valid_to` (DR-10, P37 ⑧ — design the recompute at reindex, document
   it, columns may be dropped only if the equivalent path fully covers §3 bitemporality).
   Forward-only migrations, one-time backfill, no daemon.
2. **Freshness wiring** (DR-04): stale links excluded or downgraded in traversal AND
   ranking; detected drift rendered (claim freshness = unknown-until-reverified); header
   state renamed honestly (index-catchup, never a false "fresh"); per-source decay class +
   re-verification trigger scaffold for non-file connectors.
3. **Restricted enforcement** (DR-05 serve half): secret guard runs on EVERY write path
   (MCP/overlay included, not just mainline); restricted bodies out of FTS/render/machine
   interfaces; cited withheld/unavailable outcome rendered instead.
4. **Claim envelope at the boundary**: minimum claim envelope (evidence anchor incl.
   revision/hash, observed time, derivation, confidence, status, freshness, disclosure)
   rendered tersely (DR-07) and serialized through MCP (DR-31); accelerator-not-validated
   disclosure on responses pre-V1 (DR-01); push block stops rendering uncited factual
   gotchas + header de-claimed (DR-32, use-blocking).
5. **Tail**: scoped expiry for semantic local overrides — eligibility loss + surfaced as
   stale, never deletion (DR-12); O-16 disclosure half only — suppress/flag the affected
   relation + named blind spot; the durable-persistence/re-resolution seam stays V1-gated
   (DR-27).

## Constraints (hard)

- Branch: work in a fresh git worktree on branch `r-slice/opus` cut from latest
  `origin/feat/1.0.0`; commit there; NEVER push to `feat/1.0.0` (reviewer merges).
  Re-fetch origin before starting — parallel sessions are active on this repo.
- pnpm only; Node floor 22.18; no egress (assertNoEgress stays enforced); token budget of
  rendered envelopes must stay terse (the product's value is fewer tokens — DR-07's 1-glyph
  spirit).
- Tests: extend the acceptance suites per phase (red→green); full core+cli suites green
  before phase close; living-repo tests follow the robust-assertion rules (assert
  drillable/resolvable, not rendered ranking).
- Deviation log (`implementation-notes` in the worktree docs/build/ area or returned
  inline) is a first-class deliverable; every spec deviation recorded.
- NON-GOALS: no M3/guide work (O-25 separate), no org connectors, no measurement changes
  (E0 owns that), no DR-27 full fix, no new MCP tools, no distribution/auto-install
  changes (pre-V1 containment stands).

## Acceptance

Self-verify against CONTEXA-IMPL §8's 11-item R-slice acceptance list, item by item, in
the deviation log. Reviewer (Fable) independently re-checks before merge; merge → push in
one go.
