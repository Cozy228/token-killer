# O-20 — Codex post-merge adversarial review of memory slice 5 (trigger file)

<!-- Ephemeral ops artifact. Death condition: O-20 closed (findings fixed or waived) →
/gc archives this file. Slice 5 was built with the O-17 precondition explicitly waived
(maintainer, 2026-07-07, "no codex now — leave prompt for codex to review"); run the
O-17 slice-3/4 reviews (MEMORY-SLICE3-CODEX-REVIEW.md) BEFORE this one — slice 5
builds on both. -->

Run from the repo root (`/Users/ziyu/Workspace/token-killer`, `feat/1.0.0` checked out;
deps installed — codex sandbox cannot pnpm-install). Findings → fix commits on
`feat/1.0.0` (M2 precedent), then check off O-20 in `OPEN.md`.

## Slice 5 review (personal overlay + three-tier scope / `--local`)

```bash
codex exec --sandbox read-only --cd . "$(sed -n '/^PROMPT-SLICE5$/,/^END-SLICE5$/p' docs/build/MEMORY-SLICE5-CODEX-REVIEW.md | sed '1d;$d')" 2>&1 | tee /tmp/codex-slice5-review.log
```

PROMPT-SLICE5
You are an adversarial second-opinion reviewer for slice 5 (personal overlay + three-tier scope / `--local`) of a memory re-architecture, reviewing POST-MERGE. The diff under review is `git diff 6f2b881..a7e969f` (merge commit a7e969f on feat/1.0.0, branch memory/slice5-local-overlay, ~979 insertions).

Authority docs (read first, do not relitigate their rulings): docs/build/MEMORY-SLICE5-GOAL-PROMPT.md (the 5 scope items + Explicitly OUT + invariants/acceptance), docs/build/MEMORY-SYNC-GOAL-PROMPT.md (hard invariants + acceptance bar), docs/build/MEMORY-DECISIONS.md (E3, E4, D27/D30), docs/build/MEMORY-SYNC-SETTLEMENTS.md (S8/S8a matrix; the `.contexa/push.jsonc` three-tier (b) and `.contexa/*.local.*` three-tier (c) zone rows), docs/build/MEMORY-SLICE5-NOTES.md (Decisions/Deviations/Open questions — the builder's rulings).

IMPORTANT — a Fable review round already ran and PASSED the diff with no fix rounds; do NOT re-report what it verified correct: (a) `recordDecision` store events carry no zone field, so the opt-out file redirect cannot desync store vs rebuilt store; (b) `ensureScaffold` creates only dirs + .gitattributes/.gitignore/.gitkeep, never the mainline logs — the opt-out acceptance asserts `log.md`/`decisions.md` literally absent; (c) `origin` round-trips verbatim through serialize/parse (only ABSENT origin defaults to "remember"), so `remember-local` push-exclusion survives reindex; (d) all `MemoryFiles` construction sites are cold-path (CLI command, MCP remember write, adapter ingest, doctor read-only) — no per-query config read. Also do not re-report the notes' recorded rulings: the placed push block is SHARED-config-only with `ctx push --local` as a display-only merged view; `commitMemory` is shared-layer-only project truth; an opt-out repo's ordinary notes keep `origin: "remember"` and still surface in its locally-placed block (open question handed to slice 6); the migration `CatchUpReport.toMainline` counter reflects the logical zone under redirect.

Slice-5 intent: `remember()` surface becomes REQUIRED with a `ROUTE_FOR_SURFACE` table (`cli` → mainline/active, `mcp` → overlay/needs-review, `local` → overlay/active); `--local` notes get `origin: "remember-local"` and are excluded from the push digest (both auto-rank and pin resolution in rank.ts); three-tier push config = shared `.contexa/push.jsonc` + personal `.contexa/push.local.jsonc` merged deterministically (`mergePushConfig`, shared-first dedup) for the local view only; E4 opt-out `commitMemory: false` enforced at `MemoryFiles.localOnly` (`#writeZone` redirects every mainline write to the overlay; reads address literal zones), mirrored in `remember`/`setMemoryLifecycle` (promotion skipped entirely under opt-out) with success-shaped disclosures; `editPinVeto` preserves the opt-out across pin/veto edits; doctor gains the opt-out mode line + a `git-depth` shallow-clone advisory (pure-filesystem `.git`/gitdir-pointer/commondir resolution, always ok:true).

ONE KNOWN-NARROW hunt seed (Fable-found, unfixed as unreachable-in-production — try to widen it): a STORE-ONLY event with `origin: "remember-local"` (possible only via a crash between the store write and the file append while the migration marker is still unstamped, or a files-less `remember()` caller) would be routed by catchup.ts's zone default (host-import→overlay, else→MAINLINE) into the COMMITTED zone on migration — the exclusion set (both zones, event-id-keyed) only protects rows that reached the files. If you find a REACHABLE path to a store-only remember-local (or mcp) row, that is a MAJOR finding.

Hunt adversarially for: `--local` leakage into ANY committed artifact (push digest via pins/vetoes/`editPinVeto` id round-trips, E6 canonical dump, biography/`2d` renders, migration/catch-up export, confirm-promotion of a remember-local row — can `ctx memory confirm` promote a `--local` note to mainline? should it?); E4 opt-out bypasses (any committed-zone writer NOT going through `MemoryFiles.appendMemory`/`appendDecision` — direct `appendLine`/`writeFileSync` callers, sidecar writes, snapshot/export paths, `editPinVeto` writing `.contexa/push.jsonc` itself in an opt-out repo); three-tier merge determinism holes (pin∩veto across layers, dedup order dependence, warnings concatenation affecting `ok`, overlay config attempting `commitMemory`); `surface`-required regressions (any caller that lost its intended zone in the ~40-site batch test update; the two `remb` wrapper defaults masking a fixture's intent); opt-out interaction edges (opt-out flipped ON mid-life: existing mainline rows + new overlay writes — double-count or shadow at reindex? opt-out flipped OFF: overlay rows stranded?); shallow-clone detection false negatives/positives (worktree `commondir` chains, `gitdir:` relative paths, submodules); A11 regressions (per-query file IO or git spawn on any serve path — check `dirtyCheck` never constructs `MemoryFiles` and nothing per-query calls `readMemoryOptOut`/`readMergedPushConfig`); living-repo test isolation (any new code path a test can drive at REPO_ROOT without a sandbox `contexaRoot`).

Output: numbered findings, each with severity (MAJOR/MEDIUM/MINOR), file:line, what breaks, and a concrete failing scenario (inputs → wrong output). Separate "verified correct" section for suspicious-but-sound things you checked. No redesign proposals.
END-SLICE5
