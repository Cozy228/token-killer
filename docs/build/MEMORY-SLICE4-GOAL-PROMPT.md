# Slice 4 — Memory as a real dirty source + import→overlay→confirm (work order)

<!-- Per-slice work order (no YAML frontmatter — living-repo ingest gotcha). Death
condition: slice 4 merged → absorb the surviving verdict into the registers and
archive per the slice-1/2/3 precedent. Prior slices' work orders were issued
inline to the builder; this one is a file because it crosses a session boundary. -->

**Authority (read first, do not relitigate):** `MEMORY-SYNC-GOAL-PROMPT.md` ("Implementation
slices" item 4 + hard invariants + acceptance bar), `MEMORY-DECISIONS.md` (A3/A4, E3/E4/E8),
`MEMORY-SYNC-SETTLEMENTS.md` (S8a, S9, S10 #1/#5), `MEMORY-SLICE3-NOTES.md` (the slice-3
handoffs this slice exists to close — Open-questions section + D1/D2/D3), repo `OPEN.md`
O-06/O-11/O-17/O-19.

**Precondition:** the O-17 Codex post-merge review of slice 3 has run and its findings are
either fixed on `feat/1.0.0` or explicitly waived — do not build on an unreviewed base.

## Scope

1. **Memory becomes a real dirty source (S10 #1/#5).** `memory/adapter.ts` `dirtyCheck` =
   mtime-first + manifest short-circuit over `.ctx/memory/` + the overlay files (unchanged
   tree ≈ one stat, < 1ms); checksum only files whose own mtime advanced. Refresh ingests
   memory via the slice-3 reindex functions (additive for appends; reset for non-append
   shapes). Cadence = the M1 first-call per-process catch-up gate (D25) — never per-query,
   never a watcher.
2. **Write-through becomes always-on.** Remove the opt-in `files?` default-off seam:
   production write paths (CLI, MCP `remember` in `serve.ts`, refresh-path import) always
   carry a `MemoryFiles`. HARD CONSTRAINT unchanged: never create `.ctx/` in the
   token-killer repo — the living-repo tests that call core write paths on `REPO_ROOT`
   (`2d-biography`, `1h-push`) must be re-pointed at sandbox fixture repos (or an
   equivalent isolation), not "solved" by keeping the writer optional.
3. **Migration cold-path trigger.** Wire `isMigrationDue` → catch-up export → reset rebuild
   into the refresh cold path (slice 3 left them callable+tested). Fix the false
   `cmdImport` CLI text (O-06: "imported automatically on cold-path sync" — make it true or
   make it honest).
4. **Import→overlay→confirm pipeline completed.** Host imports land in the overlay as
   `needs-review` (already routed); **`confirm` PROMOTES the overlay create body to
   Mainline** — writes the mem line (+ sidecar) and the confirm dec line to the committed
   zone. This closes slice-3 D3 (dangling mainline dec lines referencing overlay-only ids).
   The stale overlay line stays (append-only) and is shadowed by mainline-wins (slice-3 F6);
   record the orphan-overlay-line story in the notes.
5. **S8a caller-surface split.** CLI `remember` (human) → Mainline `active`; MCP `remember`
   (agent) → overlay **`needs-review`** (today it lands overlay `active` — align to the S8
   matrix). `--local` and the full three-tier scope stay slice 5.
6. **E4 secret guard on the live paths.** Run `secretGuard` on every write headed for the
   committed zone (CLI remember, confirm-promotion) — divert to overlay `needs-review` with
   the success-shaped remediation note. The migration path already has it.
7. **`unresolved-here` first-class (S9).** Surface the derived annotation (external target
   not imported / branch-absent per the `anchored-at` ancestry classifier) in projection
   with the context-appropriate hint; NEVER down-ranked as stale, committed status
   unchanged, locally excluded from the push digest (Decision 7).
8. **E8 ops surface.** `ctx doctor` (and the guide Knowledge page seam, read-only): review
   queue size + oldest-item age, reindex `skipped` line counts, sidecar dangling/orphan
   warnings, `shadowedOverlay` count, snapshot ages (S9 advisory cadence).

## Explicitly OUT

`--local` + three-tier push-config merge (slice 5); two-working-copy collaboration eval
(slice 6); E1 identity-dedup-at-reindex (slice-3 D1 — schedule with slice 5 or 6, do not
bolt on here); content-hash anchor baseline (OPEN O-18); shallow-clone doctor check beyond a
note (slice-3 D2).

## Invariants & acceptance

The sync prompt's hard invariants verbatim (no LLM/network/egress at write+serve;
conflicts surfaced never auto-merged; non-destruction; E3 committed = human-authored or
human-confirmed — now enforced by construction on EVERY path). A11 not regressed: dirty
< 20ms (unchanged tree ≈ one stat), serve < 150ms, no per-query file IO or git spawn.
E-series additions: import→overlay→confirm→promotion round-trip (peer sees the promoted
memory after pull+reindex); S8a split; live secret-guard diversion; unresolved-here
rendering; migration-trigger idempotence on the cold path; A11 timing asserts on a large
fixture. All three suites green before merge.

## Execution model

Unchanged (maintainer-ratified): one Opus builder subagent in a linked worktree off
`feat/1.0.0`, token-disciplined (reads only the docs above + touched code); review =
Fable + Codex jointly on the same diff, builder fixes until both pass; deviation log
`docs/build/MEMORY-SLICE4-NOTES.md` (no YAML frontmatter); merge → push immediately.
