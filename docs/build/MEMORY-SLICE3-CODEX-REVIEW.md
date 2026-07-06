# O-17 — Codex post-merge adversarial review of memory slices 3 + 4 (trigger file)

<!-- Ephemeral ops artifact. Death condition: O-17 closed (findings fixed or waived) →
/gc archives this file. Codex quota resets 2026-07-07 11:13. Slice 4 was built with the
O-17 precondition explicitly waived (maintainer, 2026-07-07); BOTH reviews below are
therefore pending and should run in order (slice 3 first — slice 4 builds on it). -->

Run from the repo root (`/Users/ziyu/Workspace/token-killer`, `feat/1.0.0` checked out;
deps installed — codex sandbox cannot pnpm-install). Findings → fix commits on
`feat/1.0.0` (M2 precedent), then check off O-17 in `OPEN.md`.

## Slice 3 review (storage locus swap)

```bash
codex exec --sandbox read-only --cd . "$(sed -n '/^PROMPT-SLICE3$/,/^END-SLICE3$/p' docs/build/MEMORY-SLICE3-CODEX-REVIEW.md | sed '1d;$d')" 2>&1 | tee /tmp/codex-slice3-review.log
```

PROMPT-SLICE3
You are an adversarial second-opinion reviewer for slice 3 (storage locus swap) of a memory re-architecture, reviewing POST-MERGE. The diff under review is `git diff 74f600b..264291a` (merge commit 264291a on feat/1.0.0, branch memory/slice3-storage-swap, ~2900 insertions).

Authority docs (read first, do not relitigate their rulings): docs/build/MEMORY-SYNC-GOAL-PROMPT.md (slice 3 scope, hard invariants, acceptance bar), docs/build/MEMORY-DECISIONS.md (B1, C1-C5, E1-E8), docs/build/MEMORY-SYNC-SETTLEMENTS.md (S1-residual/S3/S4/S8/S10), docs/build/MEMORY-SLICE2-NOTES.md, docs/build/MEMORY-SLICE3-NOTES.md.

IMPORTANT — three review rounds already ran and fixed 20 findings; they are all documented in MEMORY-SLICE3-NOTES.md (rounds: R1-R7, R8-R10, F1-F7+D1-D3). Do NOT re-report anything the notes record as fixed or ruled. Your job is to find what all three rounds missed.

Slice-3 intent: committed .ctx/ files become the source of truth for memory events (mainline log/decisions + gitignored overlay, one-line percent-encoded grammar, detail sidecars, merge=union); the SQLite store becomes a rebuildable index (INSERT OR IGNORE replay + ONE sanctioned resetMemoryCache seam); S3 migration = verbatim event-history catch-up export (event-id-keyed, crash-resumable, marker=stamp not gate); E4 secret guard on export; E6 canonical logical dump (content-addressed conflict keys); S10#3 pull-delta reindex (--no-ext-diff --no-textconv --no-renames, route-by-file-header, non-append→reset fallback); drift recomputed from scratch at reindex via committed anchored-at ancestry, with confirm suppression via confirmedAt/clearedDrift refs.

Hunt adversarially for: correctness bugs in edge paths (union-merge interleavings, duplicate ULIDs across zones, catch-up exclusion-set edges, reset-vs-concurrent-writer races, percent-encoding corner cases, CRLF/BOM); invariant violations (E3 on ANY path, zero egress, non-destruction, conflicts auto-merged); E6 determinism holes across peers/fresh clones/shallow clones beyond the documented D2 precondition; silent data loss (especially around resetMemoryCache + the catchUpStoreOnlyEvents exclusion set); A11 regressions (per-query file IO or git spawns); contract mismatches vs the settlement docs.

Output: numbered findings, each with severity (MAJOR/MEDIUM/MINOR), file:line, what breaks, and a concrete failing scenario (inputs → wrong output). Separate "verified correct" section for suspicious-but-sound things you checked. No redesign proposals.
END-SLICE3

## Slice 4 review (dirty source + import→overlay→confirm)

```bash
codex exec --sandbox read-only --cd . "$(sed -n '/^PROMPT-SLICE4$/,/^END-SLICE4$/p' docs/build/MEMORY-SLICE3-CODEX-REVIEW.md | sed '1d;$d')" 2>&1 | tee /tmp/codex-slice4-review.log
```

PROMPT-SLICE4
You are an adversarial second-opinion reviewer for slice 4 (memory as a real dirty source + import→overlay→confirm) of a memory re-architecture, reviewing POST-MERGE. The diff under review is `git diff b3b4b14..36801a1` (merge commit 36801a1 on feat/1.0.0, branch memory/slice4-dirty-import, ~1250 insertions).

Authority docs (read first, do not relitigate their rulings): docs/build/MEMORY-SLICE4-GOAL-PROMPT.md (the 8 scope items + hard invariants), docs/build/MEMORY-SYNC-GOAL-PROMPT.md (invariants + acceptance bar), docs/build/MEMORY-DECISIONS.md (A3/A4, E3/E4/E8), docs/build/MEMORY-SYNC-SETTLEMENTS.md (S8a matrix, S9, S10 #1/#5), docs/build/MEMORY-SLICE3-NOTES.md and docs/build/MEMORY-SLICE4-NOTES.md.

IMPORTANT — a Fable review round already ran and fixed 3 findings (F1 drift-wins-over-unresolved-here anchor-scan, F2 promotion-guard returns boolean + overlay dec routing, F3 dirtyCheck mtime+size short-circuit); its rulings (files?-param stays optional as the sandbox-injection seam; wider living-repo test re-pointing; surface defaults to "cli" flagged as a slice-5 advisory) are recorded in MEMORY-SLICE4-NOTES.md. Do NOT re-report anything the notes record as fixed or ruled. Your job is to find what that round missed.

Slice-4 intent: memory/adapter.ts dirtyCheck = mtime+size-first manifest short-circuit over the 4 .ctx log files + host-dir watermark + one-time synced flag (unchanged tree ≈ one stat per file, < 20ms); ingest = host-import→overlay-needs-review, then isMigrationDue→catch-up-export→reset-rebuild on the cold path, else additive/reset reindex chosen by retained-prefix hash; write-through always-on for every production surface (CLI remember surface:"cli"→Mainline active, MCP serve surface:"mcp"→overlay needs-review, refresh-path import); confirm PROMOTES an overlay-only create body to Mainline reusing the ORIGINAL event id/at (F6 shadows the leftover overlay line); E4 secretGuard on every committed-zone write with success-shaped overlay diversion (including the confirm-promotion path, where the dec line also stays in the overlay); unresolved_here = new rebuildable index column recomputed at reindex (drift wins on mixed anchors), hint-rendered, never down-ranked, push-digest-excluded; E8 memoryOpsReport read-only seam wired into ctx doctor.

Hunt adversarially for: S8a/E3 violations (ANY path landing agent-authored content in the committed zone without a human confirm — check every remember/import/migration/promotion caller); E4 bypasses (a secret-shaped body reaching mainline via promotion reconstruction, migration export, or supersede events); promotion reconstruction infidelity (percent-encoding, sidecar pointer, anchoredAt, validity window, authority — anything where the peer's fold of the promoted line diverges from the author's pre-promotion state); dirtyCheck misses (mtime+size collision rewrites, manifest staleness after touched-but-identical files, host-watermark races, the synced-flag/manifest interplay across concurrent processes); migration cold-path re-entrancy (crash between catch-up and reset, two processes ingesting at once, store-only rows written AFTER the first sync); unresolved-here vs drift precedence edges (confirm suppression interplay, external anchors once M4 lands, classifyAbsentAnchor skip cases); A11 regressions (per-query file IO or git spawn on any serve path); doctor read-only guarantee (checkMemoryOps must never create .ctx/ or mutate the store); living-repo test isolation (any core write path a test can still drive at REPO_ROOT without a sandbox writer).

Output: numbered findings, each with severity (MAJOR/MEDIUM/MINOR), file:line, what breaks, and a concrete failing scenario (inputs → wrong output). Separate "verified correct" section for suspicious-but-sound things you checked. No redesign proposals.
END-SLICE4
