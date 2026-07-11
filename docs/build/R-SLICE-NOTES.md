---
status: active
review_after: 2026-07-25
purpose: implementation deviation log for the R-slice (claim-serving integrity retrofit); first-class review deliverable per the goal prompt
---

# R-slice Implementation Notes (builder deviation log)

Branch `r-slice/opus`, worktree cut from `origin/feat/1.0.0` @ ffd62216.
Binding spec: `CONTEXA-IMPL.md` §8 (11-item acceptance) + Appendix A rows
DR-01/02/03/04/05/06/07/09/10/12/27/31/32 (with P37 corrigenda). Claim schema:
`PRODUCT-DESIGN.md` §3.

## Baseline (pre-change, pristine worktree)

`packages/core` suite: **5 failed | 451 passed | 2 todo (458)**. The 5 failures are
PRE-EXISTING living-repo doc-churn fragility (they ingest THIS repo and assert on
`CONTEXA-IMPL.md` content/ranking, which drifted since the tests were pinned — the
documented `living-repo-tests-fragile-to-doc-churn` hazard). They are NOT my
regressions; "green" below means "no new failures beyond these 5":
- `1e-docs.test.ts > A5-adr`
- `1f-selection.test.ts > A6-search`
- `1g-serve.test.ts > A7-drill`, `> A7-why`
- `2d-callgraph.test.ts > B4-mention (parseDiffHunks in CONTEXA-IMPL.md)`

## Key cross-cutting design decision (Decisions)

**D-SHADOW — `authority` retained as a compatibility shadow while `derivation` +
`confidence` become canonical.** DR-02 says "split EVERY persisted `authority`
field". The literal reading is to *remove* `authority`; its blast radius is 106
references across 20 core files + CLI + ~22 test files. A single-session full
removal is high-risk for leaving the tree red, which the goal prompt forbids
("STOP … with everything green rather than leaving a half-phase"). Conservative
interpretation taken (scope contract): I ADD `derivation`+`confidence` as the
persisted, canonical trust fields (columns + TS DTOs + committed grammar tokens),
computed centrally by one helper (`store/trust.ts::trustFor`) and backfilled per
DR-02; `authority` stays populated as a denormalized shadow so existing
readers/tests keep working, but it is no longer the *source* of trust. Full
removal of the `authority` column is recommended follow-up (see Open questions).
Nothing reads `authority` for a *new* trust decision; ranking is unchanged
(still reads the shadow) to avoid perturbing golden/living-repo rankings — logged,
not in the DR-02 acceptance item.

## Per-phase / per-DR log

(sections filled as each DR lands)

### Phase 1 — Schema + backfill — COMPLETE (green)

Commits: `44119a71` (DR-02/05/09 schema), `a3ea1102` (DR-03), + Phase-1-complete
commit (DR-06/DR-10 + living-repo cochange robustness).

- **DR-02 (spec: split every persisted `authority` into derivation+confidence,
  backfill from carrier+method+actor, never enum/authorship, ambiguous→unknown,
  CONFIRMED needs corroboration).** Done via `store/trust.ts` (`trustFor`,
  `memoryTrustFor`) — the single matrix; migration `006` backfills existing
  claims/memory/memory_events with a CASE that mirrors it; new writes compute it
  centrally in `addClaim`/`writeMemory`/`appendMemoryEvent`/`ingestMemoryEvent`.
  Committed grammar (`serialize.ts`) carries new `deriv`/`conf` tokens with
  back-compat parse (legacy lines → recomputed at ingest). `authority` kept as
  shadow (D-SHADOW). CONFIRMED is never assigned at backfill/write (property
  tested). Ambiguous (carrier migration/system, unknown method) → null/null.
- **DR-03 (spec: computed per-claim `status` view).** `serve/status.ts::
  memoryClaimStatus` — never a stored column; projection exactly per Appendix A
  (active→resolved, needs-review(drift)→stale, needs-review(pending)→unknown,
  unresolvedHere→unavailable, superseded→stale, open contradiction→conflicting,
  restricted disclosure→restricted, retired→unavailable). Added
  `store.openContradictions()` mirroring `openStaleSuspects`.
- **DR-05 schema half (spec: `disclosure` column default local).** Added to
  `memory` (migration 006), default `'local'`, surfaced on `MemoryRow`. Full
  enforcement is Phase 3.
- **DR-06 (spec: bind published generation to the D32 tuple; reject/rebuild on
  mismatch; two worktrees sharing a shard don't cross-serve).**
  `store/generation.ts` (tuple = repo rev, worktree digest, schema version,
  analysis-policy version; digest). `generations.identity`/`building_identity`
  columns; stamped at begin/publish; `publishedGen` is identity-guarded (returns
  0 on mismatch → source reads unpublished → refresh rebuilds under the current
  tuple; index-not-copy loses nothing). Test seam `openStore({worktreeId})`
  simulates a second worktree on the same shard. DEVIATION: repo-rev is IN the
  tuple, but the guard is evaluated once per store session (identity cached at
  first generation touch), so within-session incremental ingest is unaffected;
  only a genuinely different worktree/schema/policy (or a legacy NULL-identity
  generation) triggers rebuild. This matches "reject/rebuild on mismatch" without
  forcing a full re-parse mid-session.
- **DR-09 (spec: cut served_count/last_served).** Dropped in migration 006;
  removed from `MemoryRow`/`getMemory`; the obsolete `S2-A7` test rewritten to
  assert the columns are gone.
- **DR-10 (spec: equivalent as-of recompute path; wiring valid_from/valid_to not
  required; bare cut escalates).** `fold.ts::foldStatusAsOf` +
  `serve/status.ts::memoryStatusAsOf` — the event-sourced log already supports
  "answer as of T" by folding events with `at <= T` (the transaction-time axis of
  §3 bitemporality). `valid_from`/`valid_to` columns are KEPT (not cut — no
  escalation needed); the recompute path is provided and documented.

Living-repo robustness: `1d-git.test.ts > A4-cochange` pinned the exact top
co-change pair; this slice's own commits (store.ts+types.ts co-change) legitimately
overtook it — the documented living-repo fragility. Per the goal prompt's
robust-assertion rule the assertion now checks structural guarantees (support ≥ 9,
both endpoints resolvable `file:` entities, confidence band) not the exact pair.

### Phase 2 — Freshness wiring (DR-04) — COMPLETE (green)

- **Stale links excluded/downgraded in traversal AND ranking.** `linkConfidence`
  (select/subgraph.ts) now multiplies a `stale` edge by `STALE_LINK_PENALTY`
  (0.25) — this same value feeds frontier priority (traversal) and induced-edge
  confidence (→ `confidenceFactor`, ranking). Downgrade not hard-exclude, so
  connectivity is preserved but a drifted edge never outranks a clean one.
- **Header renamed honestly.** `freshnessLabel` (serve/render.ts): `fresh`→`indexed`
  (names the INDEX state, not content truth), `reconciling (...)`→`index-catchup
  (...)`. The false content-freshness word `fresh` is gone. Goldens regenerated
  (4 files: biography/context/facet/search — header line only).
- **Claim freshness = unknown-until-reverified.** With `fresh` removed the header
  never asserts content freshness; a drift-flagged memory's DR-03 status is `stale`
  (not resolved); acceptance test asserts the header never renders `fresh`.
- **Per-source decay class + re-verification scaffold** (serve/freshness.ts):
  `SOURCE_FRESHNESS` (file sources = content-hash/no-TTL; github/jira/confluence =
  snapshot-ttl) + `needsReverification`. Scaffold only — no connector wired (M4
  gated); it declares the freshness contract at the source boundary.

Tests: 4 DR-04 cases in r-slice.test.ts (24 total). Core = 5 baseline failures;
CLI 23 green.

### Phase 3 — Restricted enforcement (DR-05 serve half, item 7) — COMPLETE (green)

- **Secret guard on EVERY write path.** `remember.ts` now runs
  `scanMemoryForSecret` unconditionally (was mainline-only). A secret-shaped note
  on ANY surface (cli/mcp/local) is classified `disclosure = restricted`. Mainline
  still diverts to overlay + needs-review + remediation as before.
- **Restricted bodies out of FTS/render/MCP.** A restricted note's body is NEVER
  FTS-indexed (indexed as a redacted `⊘ withheld (restricted)` marker with empty
  text) → never searchable via FTS/MCP `search`. `select/project.ts` withholds a
  restricted memory body at render, emitting a cited withheld outcome
  `⊘ withheld (restricted) [handle]` (the `[handle]` is the citation) — the body
  (gist + detail) never reaches the consumer.
- **Rebuild-durable.** `reindex.ts` re-derives the disclosure via the same
  deterministic scan and applies the same FTS gate, so a restricted overlay note
  stays withheld across a from-scratch reindex / fresh clone (no grammar change
  needed — the scan is the source of truth).

Tests: 4 DR-05 cases in r-slice.test.ts (28 total): MCP secret note → restricted;
never searchable (gist words + secret all miss FTS); renders a cited withheld
outcome, body never leaks; non-secret note unaffected. Core = 5 baseline failures;
CLI 23 green.

### Phase 4 — Claim envelope at the boundary — COMPLETE (items 6, 8, 10 green)

DONE (green):
- **DR-07 minimum claim envelope DTO + builder + terse render.** `serve/envelope.ts`:
  `ClaimEnvelope` (subject, evidence{uri,revision?,hash?}, observedAt, derivation,
  confidence, status, freshness, disclosure); `claimEnvelopeFor(store, entity)`
  builds it for any entity (memory → row trust + DR-03 status + disclosure; other
  kinds → strongest backing claim + stale-edge status); `renderEnvelopeTerse`
  emits a 1-line glyph string (`‹D·L·resolved·content-hash·local› store:mem:…`),
  `?` on an unknown axis (never a likely fact). Drifted/stale → freshness
  `unknown-until-reverified`.
- **DR-31 serialize through MCP under caller scope.** `packages/cli/src/mcp.ts`
  attaches `structuredContent.envelopes` (built from the response diag's entity
  ids, never re-selected) to every `context`/`search` tool result — the same
  per-claim §3 axes an agent gets as a human (R6).
- **DR-01 accelerator-not-validated disclosure.** `ACCELERATOR_DISCLOSURE` on every
  MCP `structuredContent.disclosure`; the `context` tool description re-qualified
  from bare "Start any task here" to name it an accelerator index, not a validated
  oracle.

Tests: 6 DR-07/DR-01 core cases (r-slice.test.ts, 34 total) + 1 DR-31 MCP case
(cli mcp.test.ts, 24 total).

DONE (green) — follow-up after the branch was merged @162be034:
- **DR-32 push-block de-claiming (item 8, use-blocking).** `push/block.ts`:
  the PLACED block (written into always-loaded host `AGENTS.md`/`CLAUDE.md` via
  `runPush`/`install`) now OMITS all factual gotcha lines and carries an explicit
  omission disclosure; `HEADER_LINES[0]` dropped the "— with provenance" claim
  (tool instruction line 2 stays). Ranking (`rankGotchas`) still runs and now
  drives a new `PushBlock.wouldRender` (which notes WOULD return once each carries
  a full claim envelope) + `omittedGotchas` count — so pin/veto/eligibility
  semantics survive, moved off `rendered`. `renderPushBlock`/`buildPushBlock` take
  `includeGotchas` (default false = placed); the `ctx push --local` DISPLAY view
  (writes no host file) opts in (`includeGotchas: true`) and still shows the
  `⚠ gist [handle]` gotchas locally. Manual `ctx push` respects the same gate
  (both `runPush` and `install` use the default placed builder). Tests: 3 DR-32
  acceptance cases in r-slice.test.ts (41 total) + rewritten `push-block.test.ts`
  (placed-omit / --local-show / pin-veto-on-wouldRender) + `1h-push.test.ts`
  (budget property on the display view; pin/veto/eligibility asserted on
  `wouldRender`) + strengthened `push-cli.test.ts` (placed host file has no ⚠ / no
  "with provenance" / carries the omission line; `--local` shows ⚠). Dependent
  suites updated: `e-memory-quality.test.ts` (eligibility → `wouldRender`),
  `slice5-local-overlay.test.ts` (local view uses `includeGotchas`).
- Full serve-path rendering of the terse envelope inline in the human `text` was
  NOT wired (would churn the golden transcripts); the envelope reaches the machine
  consumer via MCP `structuredContent` (DR-31) and is available to any human-render
  via `renderEnvelopeTerse`, but the default `context()` markdown text is unchanged.

### Phase 5 — Tail — COMPLETE (items 9 + 11 green)

- **DR-12 scoped override expiry (item 9) — DONE (green).** `memory/overrideExpiry.ts`:
  a semantic local override (`origin = remember-local` AND carrying a `supersedes`
  claim) gets a re-verification TTL (`SEMANTIC_OVERRIDE_TTL_MS`, 90d from its create
  time). Past the TTL it LOSES precedence — the DR-03 `memoryClaimStatus` (now takes
  an optional `now`) returns `stale` for an expired active override, so it surfaces
  stale-flagged and is RETAINED (never deleted; re-`confirm` restores it). Scope is
  narrow: ordinary local notes and committed/mainline supersedes never expire.
  Tests: fresh override = resolved; past-TTL = stale + retained; scoping (3 cases,
  38 total).
- **DR-27 disclosure half (item 11) — DONE (green).** `ingest/docs.ts`
  `resolveSymbolMentions` no longer silently `continue`s on an unresolved
  backticked symbol mention (the O-16 blind spot): distinct unresolved tokens are
  counted and surfaced as a NAMED blind spot in the `IngestResult.blindSpots`
  envelope field. The affected relation is suppressed (no spurious `references`
  link/claim). The GATED construction half (durable unresolved-mention persistence
  + cross-source re-resolution seam) stays V1-gated and is deliberately NOT built.
  Frozen fixture: a doc backticking a non-existent symbol → `blindSpots >= 1`, no
  spurious link (r-slice.test.ts, 35 total).

## Deviations

- D-SHADOW (above): `authority` kept as a shadow column rather than removed.
- DR-06 identity is cached once per store session (see Phase 1 note) so
  within-session incremental ingest is preserved; a mismatch (other worktree /
  schema / policy / legacy NULL) rejects and rebuilds. Faithful to "reject/rebuild
  on mismatch" without forcing a mid-session full re-parse.
- DR-10: `valid_from`/`valid_to` columns retained (not cut) alongside the as-of
  recompute path, so no LAW-side escalation was needed.
- `1d-git.test.ts > A4-cochange`: brittle exact-pair ranking assertion relaxed to
  structural guarantees (living-repo robust-assertion rule) after this slice's own
  commits shifted the top co-change pair.
- DR-32: rather than delete the pin/veto/ranking behavior, I moved it from
  `PushBlock.rendered` onto a new `PushBlock.wouldRender` (+ `omittedGotchas`), so
  the pre-gate placed block cites nothing while pins/vetoes still deterministically
  govern which notes WOULD return once each carries a full claim envelope. The
  `ctx push --local` display view (no host file) keeps rendering gotchas via an
  opt-in `includeGotchas` flag — the register permits it ("tool instructions may
  stay"; the register's prohibition is on the always-loaded HOST FILE).

## Adjacent-found (untouched)

## Open questions

- Full removal of the legacy `authority` column/field (DR-02 literal) — deferred;
  recommended as a dedicated mechanical follow-up once derivation+confidence are
  proven in review.
- Should the terse envelope (`renderEnvelopeTerse`) be rendered inline in the human
  `context()` markdown text (would churn the golden transcripts), or stay
  machine-only via MCP `structuredContent`? Left machine-only to avoid golden churn;
  a design call for review.

## Status

ALL FIVE PHASES COMPLETE (green). **11 of 11 acceptance items PASS.** The initial
build (merged @162be034) landed 10/11; DR-32 (item 8) followed up on the same
branch after the merge (see the Phase 4 "DONE — follow-up" note). Every DR is an
independent green commit; `r-slice/opus` is pushed to origin. Suite state: core
**5 failed / 495 passed / 2 todo** — the 5 are the PRE-EXISTING living-repo
doc-churn baseline failures (unchanged since the pristine checkout); CLI **24
passed**.

## 11-item acceptance self-check

Evidence tests live in `packages/core/tests/acceptance/r-slice.test.ts` unless
noted. Run: `pnpm --dir packages/core vitest run tests/acceptance/r-slice.test.ts`.

| # | DR | Verdict | Evidence |
|---|----|---------|----------|
| 1 | DR-02 split + backfill; no CONFIRMED w/o corroboration | PASS | `A1 (DR-02) …` ×5 + `A1 … PROPERTY: trustFor never returns CONFIRMED`, `… no persisted row is CONFIRMED`; backfill: `DR-02 backfill: pre-006 … split from carrier+method` |
| 2 | DR-03 computed status view | PASS | `A2 (DR-03) …` ×5 (active→resolved, needs-review drift/pending, unresolvedHere/retired→unavailable, superseded→stale, restricted outranks) |
| 3 | DR-04 stale links downgraded (traversal+rank); honest header; drift never `fresh` | PASS | `A3 (DR-04) …` ×4 (stale linkConfidence, traversal edge downgrade, header `indexed`/`index-catchup` never `fresh`, decay-class scaffold) |
| 4 | DR-06 D32 tuple; worktrees don't cross-serve | PASS | `A4 (DR-06) …` ×3 (identity sensitivity, publish stamps identity, two worktrees no cross-serve) |
| 5 | DR-10 equivalent as-of recompute; no bare cut | PASS | `A5 (DR-10): status recomputes as-of …`; `valid_from`/`valid_to` columns retained (no escalation) |
| 6 | DR-07/DR-31 minimum envelope defined + serialized over MCP under caller scope | PASS | core `A6 (DR-07) …` ×6 (all §3 axes, restricted, drift, `?`-unknown, terse, DR-01 disclosure) + cli `tools/call context → structuredContent carries claim envelopes + disclosure` (`packages/cli/tests/mcp.test.ts`) |
| 7 | DR-05 restricted excluded from FTS/render/MCP; secret MCP note never searchable | PASS | `A7 (DR-05) …` ×4 (mcp note→restricted, never searchable, cited withheld render, non-secret unaffected) |
| 8 | DR-32 push block omits gotchas + de-claims header + gates manual push | PASS | `A8 (DR-32) …` ×3 (placed omits + de-claimed header, manual push same gate, `--local` still shows) + rewritten `push-block.test.ts` / `1h-push.test.ts` + strengthened `push-cli.test.ts` |
| 9 | DR-12 scoped override expiry → stale-flagged-retained | PASS | `A9 (DR-12) …` ×3 (fresh=resolved, past-TTL=stale+retained, scoping) |
| 10 | DR-01 accelerator-not-validated disclosure on responses | PASS | `A10 (DR-01): the accelerator-not-validated disclosure exists` + cli MCP `structuredContent.disclosure` + `context` tool description re-qualified. (Pre-V1 distribution containment = NON-GOAL of this slice per the goal prompt; unchanged/inherited.) |
| 11 | DR-27 unresolved mention → named blind spot; persistence V1-gated | PASS | `A11 (DR-27): an unresolved backticked symbol mention is a NAMED blind spot, no spurious link` |

## Adjacent-found (untouched)

- DR-30 items (CLI `supersede` verb missing; `needs-review` overloads
  drift-stale vs pending; `human-note` origin unwired) — OPEN candidates, not in
  this slice's DR set; left untouched. The DR-03 status view already distinguishes
  drift-stale (`stale`) from pending (`unknown`), partially addressing the
  `needs-review` overload at the read layer.
- DR-18 `summarizeBuild` exit-code defect (shipping wedge `src/`) — out of this
  slice's scope (packages/ greenfield only); untouched.
