# Slice 5 — Personal overlay + three-tier scope (`--local`) (work order)

<!-- Per-slice work order (no YAML frontmatter — living-repo ingest gotcha). Death
condition: slice 5 merged → absorb the surviving verdict into the registers and
archive per the slice-1/2/3/4 precedent. Crosses a session boundary → a file. -->

**Authority (read first, do not relitigate):** `MEMORY-SYNC-GOAL-PROMPT.md` ("Implementation
slices" item 5 + hard invariants + acceptance bar), `MEMORY-DECISIONS.md` (E3, E4 — `--local` →
overlay + the per-repo opt-out knob, D27/D30 push shared config), `MEMORY-SYNC-SETTLEMENTS.md`
(the S8 write-surface matrix; the zone table rows for `.contexa/push.jsonc` = three-tier (b) and
`.contexa/*.local.*` = three-tier (c)), `MEMORY-SLICE4-NOTES.md` (Decisions + Open questions — the
`surface` fail-open advisory and the D2 handoff), repo `OPEN.md` O-17/O-18.

**Precondition:** the O-17 Codex post-merge review of slices 3+4 has run
(`MEMORY-SLICE3-CODEX-REVIEW.md`, both prompts) and its findings are fixed on `feat/1.0.0` or
explicitly waived — do not build on an unreviewed base.

## Scope

1. **CLI `remember --local` (S8 matrix / E4).** A human personal note lands in the gitignored
   personal OVERLAY as `active` (deliberately divergent my-view attention — no review queue, a
   human authored it; it just never syncs). The committed Mainline default for plain CLI
   `remember` is unchanged. MCP surface unchanged (`needs-review`, slice 4). Disclose the landing
   zone in the CLI output ("local only — never shared").
2. **`surface` becomes required (slice-4 advisory).** `RememberInput.surface` loses its `"cli"`
   default — every caller must state its surface, so a future agent-side caller cannot fail open
   into the committed zone. Compile-time enforcement (type), plus the existing runtime routing.
   Update all callers; store-only unit fixtures pick the surface they mean to test.
3. **Three-tier push config.** Shared committed `.contexa/push.jsonc` (project presentation: pins /
   vetoes — D27/D30, three-tier (b)) merged with a personal overlay config file per the
   `.contexa/*.local.*` convention (three-tier (c)). Merge semantics: project truth stays shared and
   committed; the personal layer adds LOCAL-EFFECT-ONLY attention (extra pins/vetoes for MY push
   digest) and never mutates the shared file. Deterministic merge, no write path from the
   personal layer into the committed file. Reuse the existing push-config reader seam
   (`readPushConfig`) — do not fork a second config pipeline.
4. **Per-repo opt-out knob (E4).** A repo that must not commit memory at all: with the knob set,
   EVERY memory write (including CLI `remember` and confirm-promotion) lands in the overlay with
   a success-shaped note; nothing creates or appends the committed zone. Doctor surfaces the
   mode. Knob location: the shared config (item 3) — it is project truth.
5. **Shallow-clone doctor check (slice-3 D2 handoff).** `ctx doctor` advisory: a shallow clone
   (`.git/shallow` present / missing merge-base depth) makes the `anchored-at` ancestry
   classifier unreliable (`unresolved-here` vs `target-removed`) — warn, never fail.

## Explicitly OUT

Identity-dedup-at-reindex (slice-3 D1 — **ruled to slice 6**: it is reindex semantics, best
validated by the two-working-copy collaboration eval); content-hash anchor baseline (OPEN O-18 —
**ruled to slice 6** with D1: it changes committed anchor bytes + reindex drift derivation, and
the slice-6 fresh-clone/two-copy fixtures are exactly its acceptance test); the slice-6
collaboration eval itself; overlay compaction and adapter delta-proportional pull (**not
scheduled** — evidence-gated: the doctor `shadowedOverlay` count and the A11 gates are the
triggers; revisit if either moves in real use); any M4 network-carrier work.

## Invariants & acceptance

The sync prompt's hard invariants verbatim (no LLM/network/egress at write+serve; conflicts
surfaced never auto-merged; non-destruction; E3 committed = human-authored or human-confirmed on
EVERY path). A11 not regressed: dirty < 20ms, serve < 150ms, no per-query file IO or git spawn
(the config merge must be read-once-per-process, not per-query). E-series additions: `--local`
note never appears in any committed file nor the push digest of a peer; two working copies with
the same committed config + different personal overlays render the SAME shared push digest and
different local views; opt-out repo performs zero committed-zone writes across remember /
confirm / migration / import while staying fully functional locally; `surface` required
compiles/behaves across all callers; shallow-clone doctor warning fires on a shallow fixture.
HARD CONSTRAINT unchanged: never create `.contexa/` in the token-killer repo — living-repo tests
keep their sandbox writers/`contexaRoot` injection. All three suites green before merge.

## Execution model

Unchanged (maintainer-ratified): one Opus builder subagent in a linked worktree off
`feat/1.0.0`, token-disciplined (reads only the docs above + touched code); review = Fable +
Codex jointly on the same diff (Codex deferred-to-file if quota-blocked, slice-4 precedent),
builder fixes until both pass; deviation log `docs/build/MEMORY-SLICE5-NOTES.md` (no YAML
frontmatter); merge → push immediately.
