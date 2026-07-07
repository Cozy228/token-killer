# Memory-line tail — work order for what's left after slice 6

<!-- Per-slice work order (no YAML frontmatter — living-repo ingest gotcha). Death
condition: every item below lands, is re-routed to a milestone, or is explicitly
waived → absorb the surviving verdict into OPEN.md/decision log and archive, per
the slice-1..6 precedent. Written 2026-07-07 at the close of the sync
re-architecture (slices 1–6 all merged; O-17/O-20 review debts closed). -->

**Authority (read first, do not relitigate):** `MEMORY-SYNC-GOAL-PROMPT.md` (hard invariants +
acceptance bar — they still bind every item here), `MEMORY-DECISIONS.md` (E-group, esp. E7),
`MEMORY-SLICE6-NOTES.md` (Adjacent-found + review rounds), repo `OPEN.md` (O-03/O-05/O-07/O-08/
O-09/O-16/O-21), `CTX-IMPL.md` §"M3/M4/M5" (milestone boundaries).

**Standing order gate:** OPEN.md **O-14** rules "crude self-measurement BEFORE next feature".
The R1 grid (maintainer authors ~10 `accept_cmd`s from `tools/measurement/task-bank-review.md`,
picks auth mode, runs 60 cells) precedes any M3/M4 feature start. Items 1–2 below are
DEFECT/ALIGNMENT work on already-shipped behavior, not features — they do not trip O-14.

## Build-ready (no new design needed; one builder, one review round each)

1. **E7 reconciliation — align `flagAnchorDrift` (`ingest/code/incremental.ts`) to A5 +
   Decision 5** (= OPEN.md **O-05**; ratified in `MEMORY-DECISIONS.md` E7, scheduled-not-built
   since 2026-07-05; the "adjacent-found, untouched" note has ridden along since slice 3):
   (a) `body-changed` → down-rank only (today it flips ALL three reason classes to
   `needs-review`); (b) drift must also file a reason-classed `stale-suspect` CONFLICT via
   `addConflict`, not just a `stale-reason` claim, so `conflictCandidates()`/doctor/guide see it;
   (c) verify/add `file:`-anchor `target-removed` coverage. This unifies the within-branch entry
   point with the reindex path that slices 3+6 built (`fileDrift` is the shape to converge on —
   consider extracting/reusing it). Acceptance: the three E7 sub-items each get a red→green test;
   within-branch and reindex derivation agree on the same fixture (same target change → same
   reason class, same conflict, same status effect); existing 2c/slice-3/slice-6 suites green.

2. **Derived-layer determinism sweep — `recomputeDriftAtReindex` stale-additive-row exposure**
   (slice-6 C6-3 adjacent-found; pre-slice-3 shape): an additive full reindex derives drift from
   `store.allMemories()`, which can include rows absent from the current files, diverging a
   long-lived peer from a fresh clone. Apply the SAME `seenIds` filter slice 6 gave
   `recomputeIdentityAtReindex` (reuse the set `reindexMemoryFromFiles` already collects; the
   pull-delta path keeps `undefined`). Acceptance: mirror of the C6-3 test for drift — peer
   reindexes M1+M2 then reindexes files carrying only M1 → no drift/stale-suspect re-filed from
   the stale row; E6 conflict-level convergence with a fresh clone.

3. **O-21 — overlay-only retire/supersede writes a dangling mainline dec** (D3's retire
   variant). *In flight 2026-07-07 evening (builder on `memory/o21-lifecycle-zone`); if merged,
   check it off in OPEN.md and strike this item.* Fix shape (arbitrated): every lifecycle verb
   routes its dec (and F-E resolutions) to the zone where the create lives when the id is absent
   from mainline and not just promoted.

## Decision-needed (grill/ratify BEFORE any code — do not build from this doc)

4. **O-16 MENTION-SHADOW** — docs re-resolution on code-add (persist unresolved symbol mentions
   + a code→docs re-resolution seam). A DESIGN change touching the claims/conflicts lifecycle;
   needs its own grilled ruling. Entry: OPEN.md O-16 (root cause recorded there).
5. **O-03 listMemory API** — memory enumeration missing from the `Store` interface (a second
   read-only `DatabaseSync` workaround exists in `remember.ts`). Small API decision; bundle into
   the next grill session, then it becomes a one-sitting build item.
6. **Evidence-gated, still NOT scheduled** — overlay compaction + adapter delta-proportional
   pull. Triggers unchanged: doctor `shadowedOverlay` counts and the A11 gates. Re-check the
   triggers at each doctor-report review; do not build without the evidence.
7. **O-07 served_count / usage signal** — belongs to **M5** free instrumentation
   (record-only). Do not build early; strike from memory-line tracking.
8. **O-08 git-evidence target-removed / O-09 import timestamps** — named registers; fold their
   residue into the next design round or close with a one-line ruling each.

## Comprehension gate (merge-ritual debt — user action, not agent)

Quiz packages for slices 4, 5, 6 live in the session scratchpad (`quiz-slice4/5/6/`). The user
passes (or explicitly skips + logs) each; results go to the quiz-log per workflow.md phase 6.

## Milestone pointers (context, not scope)

- **M3 "Humans see it"** (guide: loopback server, 6 pages, evidence drawer, snapshot export;
  Playwright smoke + provenance-traced facts). Memory prerequisites are DONE (E8 ops report,
  needs-review queue stats, conflict surfacing). Startable once O-14's R1 measurement has run.
- **M4 "Org context flows in"** (GitHub/Jira/Confluence ingress-only snapshot importers +
  cross-carrier arbitration). Groundwork DONE (S9 `unresolved-here`, category-③ external
  anchors, dated-snapshot layout). Ordered after M3 per the P26 route; activates the full S9
  scenario.

## Invariants & execution model (unchanged)

Sync-prompt hard invariants verbatim (no LLM/network/egress at write+serve; conflicts surfaced
never auto-merged; non-destruction; E3 on every path; A11 dirty <20ms / serve <150ms, no
per-query file IO or git spawn). Never create `.ctx/` in this repo — sandbox fixtures only.
One Opus builder per item in a linked worktree off `feat/1.0.0`; review = Fable + Codex jointly
(Codex deferred-to-file if quota-blocked); deviation notes appended to the relevant register;
merge → push immediately.
