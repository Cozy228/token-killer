# O-17 — Codex post-merge adversarial review of memory slice 3 (trigger file)

<!-- Ephemeral ops artifact. Death condition: O-17 closed (findings fixed or waived) →
/gc archives this file. Codex quota resets 2026-07-07 11:13. -->

Run from the repo root (`/Users/ziyu/Workspace/token-killer`, `feat/1.0.0` checked out;
deps installed — codex sandbox cannot pnpm-install):

```bash
codex exec --sandbox read-only --cd . "$(cat docs/build/MEMORY-SLICE3-CODEX-REVIEW.md | sed -n '/^PROMPT:$/,$p' | tail -n +2)" 2>&1 | tee /tmp/codex-slice3-review.log
```

Findings → fix commits on `feat/1.0.0` (M2 precedent), then check off O-17 in `OPEN.md`.

PROMPT:
You are an adversarial second-opinion reviewer for slice 3 (storage locus swap) of a memory re-architecture, reviewing POST-MERGE. The diff under review is `git diff 74f600b..264291a` (merge commit 264291a on feat/1.0.0, branch memory/slice3-storage-swap, ~2900 insertions).

Authority docs (read first, do not relitigate their rulings): docs/build/MEMORY-SYNC-GOAL-PROMPT.md (slice 3 scope, hard invariants, acceptance bar), docs/build/MEMORY-DECISIONS.md (B1, C1-C5, E1-E8), docs/build/MEMORY-SYNC-SETTLEMENTS.md (S1-residual/S3/S4/S8/S10), docs/build/MEMORY-SLICE2-NOTES.md, docs/build/MEMORY-SLICE3-NOTES.md.

IMPORTANT — three review rounds already ran and fixed 20 findings; they are all documented in MEMORY-SLICE3-NOTES.md (rounds: R1-R7, R8-R10, F1-F7+D1-D3). Do NOT re-report anything the notes record as fixed or ruled. Your job is to find what all three rounds missed.

Slice-3 intent: committed .ctx/ files become the source of truth for memory events (mainline log/decisions + gitignored overlay, one-line percent-encoded grammar, detail sidecars, merge=union); the SQLite store becomes a rebuildable index (INSERT OR IGNORE replay + ONE sanctioned resetMemoryCache seam); S3 migration = verbatim event-history catch-up export (event-id-keyed, crash-resumable, marker=stamp not gate); E4 secret guard on export; E6 canonical logical dump (content-addressed conflict keys); S10#3 pull-delta reindex (--no-ext-diff --no-textconv --no-renames, route-by-file-header, non-append→reset fallback); drift recomputed from scratch at reindex via committed anchored-at ancestry, with confirm suppression via confirmedAt/clearedDrift refs.

Hunt adversarially for: correctness bugs in edge paths (union-merge interleavings, duplicate ULIDs across zones, catch-up exclusion-set edges, reset-vs-concurrent-writer races, percent-encoding corner cases, CRLF/BOM); invariant violations (E3 on ANY path, zero egress, non-destruction, conflicts auto-merged); E6 determinism holes across peers/fresh clones/shallow clones beyond the documented D2 precondition; silent data loss (especially around resetMemoryCache + the catchUpStoreOnlyEvents exclusion set); A11 regressions (per-query file IO or git spawns); contract mismatches vs the settlement docs.

Output: numbered findings, each with severity (MAJOR/MEDIUM/MINOR), file:line, what breaks, and a concrete failing scenario (inputs → wrong output). Separate "verified correct" section for suspicious-but-sound things you checked. No redesign proposals.
