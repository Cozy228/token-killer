# Slice 6 — identity dedup + content-hash anchors + two-copy collaboration eval (work order)

<!-- Per-slice work order (no YAML frontmatter — living-repo ingest gotcha). Death
condition: slice 6 merged → absorb the surviving verdict into the registers and
archive per the slice-1/2/3/4/5 precedent. Crosses a session boundary → a file. -->

**Authority (read first, do not relitigate):** `MEMORY-SYNC-GOAL-PROMPT.md` ("Implementation
slices" item 6 — the two-working-copy eval spec — + hard invariants + acceptance bar),
`MEMORY-DECISIONS.md` (E1 three-layer conflict model, E5 decision-collision fold, E6 canonical
logical dump), `MEMORY-SLICE3-NOTES.md` (D1 ruling; R2 + R9 — the named content-hash follow-up
and its two documented edges), `MEMORY-SLICE5-NOTES.md` (Open questions — the opt-out push
provenance handoff), repo `OPEN.md` O-08/O-18.

**Precondition:** the O-17 (slices 3+4) AND O-20 (slice 5) Codex post-merge reviews have run
(`MEMORY-SLICE3-CODEX-REVIEW.md`, `MEMORY-SLICE5-CODEX-REVIEW.md`) and their findings are fixed
on `feat/1.0.0` or explicitly waived — this slice rebuilds reindex semantics on top of exactly
the code those reviews target; do not build on an unreviewed base. (Slices 4+5 merged with the
precedent waived twice — a third waiver needs the maintainer to say so explicitly again.)

## Scope

1. **D1 — the E1 identity layer: dedup → `sameAsCandidate` at reindex.** Reindex derives
   identity-duplicate candidates from the committed bytes (two zones or two merged branches
   carrying the same-or-near-identical memory) and files them as OPEN identity conflicts —
   surfaced, never auto-merged; the human resolves via the existing decision-log verbs (the
   resolution is itself an append-only event, C4). This closes the slice-3 D1 scope limit:
   dedup links become committed-DERIVED state (identical across peers and fresh clones, E6),
   not author-local. Candidate derivation must be deterministic (content-keyed, no wall-clock
   or ordering dependence) and recomputed-per-checkout like drift (S4: derived index state —
   "claims=evidence, conflicts=state" applies; never gate on append-only rows).
2. **O-18 — committed content-hash baseline in the anchor bytes.** Anchoring (and R9 confirm)
   records a content hash of the anchored target in the COMMITTED anchor bytes, so
   signature/body-changed drift re-derives deterministically at full reindex and on fresh
   clones (today those classes are dropped at reindex; only ancestry-provable `target-removed`
   survives — R2's named follow-up). This also closes R9's documented edge (reappear-then-
   removed-again after a confirm: hash comparison beats trusting the stale `clearedDrift`).
   Constraints: the hash field is OPTIONAL in the grammar — an absent hash is a legacy anchor
   and degrades to today's behavior exactly (no migration rewrite of history; non-destruction);
   reuse the store's existing hash primitive (`blake2bHex`) — no second hash pipeline; hashing
   happens at write/confirm/reindex time only (A11: no per-query file IO or git spawn). What
   exactly is hashed (normalized signature vs body span) is the builder's to settle and record
   in the notes — the acceptance bar is the E-series determinism below, not a particular scheme.
3. **Two-working-copy collaboration eval (sync prompt item 6, verbatim spec).** Extend the
   E-series with fixtures that clone/merge REAL git working copies (sandboxed — never this
   repo): (a) **merge-clean-but-contradictory (E1):** two branches with contradictory memories
   merge CLEANLY in git; the post-merge reindex MUST file the contradiction as an open conflict
   — the case git cannot test; (b) **convergence:** A commits a memory + a resolution, B pulls,
   both reindex to canonical logical equality (E6 — logical, not byte-identical); (c)
   **overlay-never-committed** across the pair (a `--local`/overlay note on A never reaches B by
   any git operation); (d) **secret-guard-effective** on every path the pair exercises; (e) the
   **E5 decision-collision fold** (same memory, two decisions on two branches → later-by-total-
   order wins + contradiction conflict filed). These fixtures are the acceptance instrument for
   items 1+2 (the slice-5 ruling that sent D1/O-18 here) — write them FIRST where practical.
4. **Slice-5 handoff — committed-vs-overlay provenance at reindex.** Reindex records which zone
   a memory's create currently lives in as a rebuildable index column, so an opt-out repo's own
   locally-placed push digest can exclude overlay-kept notes (the slice-5 open question). Same
   pattern as `unresolved_here`: derived, recomputed per checkout, never a status change, no
   migration of committed bytes.

## Explicitly OUT

Overlay compaction and adapter delta-proportional pull (**still evidence-gated, NOT
scheduled** — doctor `shadowedOverlay` + A11 gates are the triggers); O-16 MENTION-SHADOW
(docs re-resolution — a DESIGN change needing ratification, not a bolt-on); O-03 listMemory
API and O-07 served_count (open API decisions); any M4 network-carrier work; any change to
the push placement pipeline beyond item 4's eligibility read.

## Invariants & acceptance

The sync prompt's hard invariants verbatim (no LLM/network/egress at write+serve; conflicts
surfaced never auto-merged; non-destruction; E3 committed = human-authored or human-confirmed
on EVERY path). A11 not regressed: dirty < 20ms, serve < 150ms, no per-query file IO or git
spawn. E-series additions (the acceptance instrument): the five two-copy fixtures above all
green; identity candidates and drift re-derivation byte-deterministic across a long-lived peer
vs a fresh clone (E6 dump equality); legacy anchors (no hash) behave exactly as today on every
path; opt-out repo's local push digest excludes overlay-kept notes while a peer's shared digest
is unchanged. HARD CONSTRAINT unchanged: never create `.ctx/` in the token-killer repo —
two-copy fixtures build their OWN sandbox repos (mkdtemp + git init), and living-repo tests
keep their sandbox writers/`ctxRoot` injection. All three suites green before merge.

## Execution model

Unchanged (maintainer-ratified): one Opus builder subagent in a linked worktree off
`feat/1.0.0`, token-disciplined (reads only the docs above + touched code); review = Fable +
Codex jointly on the same diff (Codex deferred-to-file if quota-blocked, slice-4/5 precedent),
builder fixes until both pass; deviation log `docs/build/MEMORY-SLICE6-NOTES.md` (no YAML
frontmatter); merge → push immediately. Comprehension debt note: the slice-4 and slice-5
quizzes are still owed to the merge ritual — generate them before or alongside this slice.
