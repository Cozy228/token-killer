# Memory tail — items 1+2 (E7 convergence + drift determinism) — implementation notes

<!-- Deviation-log build artifact (no YAML frontmatter: this repo ingests itself, and a
`status:` frontmatter field would classify as a decision entity and trip the living-repo doc
assertion — see slice-3/4/5/6 notes). Surviving verdict absorbed into OPEN.md (O-05 closed);
this file is the death-condition register for MEMORY-TAIL-GOAL-PROMPT.md items 1–2. -->

Work order: `MEMORY-TAIL-GOAL-PROMPT.md` items 1–2, under `MEMORY-SYNC-GOAL-PROMPT.md` (hard
invariants + acceptance bar) and `MEMORY-DECISIONS.md` (E7/A5). Built on `feat/1.0.0 @ db1ccd7`,
merged @4f7f4c4, pushed 2026-07-08. One Opus builder in a linked worktree; main-loop (Fable-role)
review, 0 fix rounds; Codex deferred (heterogeneous 2nd opinion not run — a small defect/alignment
change on already-shipped behavior, independently re-verified: full suite green + red-state confirmed).

## What shipped, per scope item

1. **E7 convergence (item 1) — within-branch ↔ reindex drift agree.** The IMPL for E7 (a)+(b)+(c)
   already existed (within-branch landed 2026-07-05 @6039156; the reindex path was built by slices 3+6);
   the tail item was a TEST + convergence proof, not re-implementation:
   - (a) `body-changed` → down-rank only, (b) reason-classed `stale-suspect` conflict via `addConflict`:
     already present in `flagAnchored` (`incremental.ts`) + `fileDrift` (`reindex.ts`), locked by 2c "B3-drift".
   - (c) `file:`-anchor `target-removed`: impl present at `adapter.ts:290`
     (`flagAnchored(fileEntityId(path), "target-removed")`), previously UNTESTED → new red→green
     test `2c "B3-drift-file"` (delete an anchored file → `target-removed` drift + stale-suspect + needs-review).
   - Convergence proof: new `slice6-identity-hash.test.ts` cases run the SAME fixture through BOTH
     derivation paths and assert the reason-class TRIPLE `{driftReason, stale-suspect conflict object,
     served status}` agrees. Content-keyed by design — the carrier difference (`tree-sitter` vs `reindex`)
     and the idempotency difference (`addClaim` vs `findOrAddClaim`) are invisible to the E6 conflict dump
     (keyed by claim CONTENT subject|predicate|object|locus), so they do not break agreement. Two
     convergent-region fixtures: PRESENT-target signature change (arity 1→2) and deleted-file `target-removed`.
   - KNOWN NON-CONVERGENT EDGE (documented in the test, out of scope, NOT asserted): overload/rename
     re-key. Within-branch re-resolves by qualified name → `signature-changed`; reindex sees an absent id →
     ancestry-classified `target-removed`. BOTH → needs-review, so the served effect is identical; only the
     reason CLASS differs. Left as a known edge — revisit only if a fixture ever needs class-exact agreement
     across the rekey path.
   - Advisory `flagAnchored`→`fileDrift` refactor NOT taken (every convergence assertion passed without it).

2. **Drift determinism sweep (item 2) — `recomputeDriftAtReindex` sheds stale additive rows.**
   Added `seenIds?: ReadonlySet<string>`; the DERIVE loop skips ids absent from the current files, the
   CLEAR loop stays UNFILTERED (every row, incl. stale, has its drift/unresolved-here annotation reset),
   threaded `seenMemoryIds` at the full-reindex call site, pull-delta stays `undefined` (append-only, no
   removals). Mirrors the slice-6 C6-3 identity fix exactly. Without it, an additive reindex re-files a
   `stale-suspect` from a row whose committed line is GONE on this checkout, diverging a long-lived peer
   from a fresh clone (E6). New `slice6-identity-hash.test.ts` "item 2" test: peer reindexes M1+M2 then
   M1-only files → the stale M2 row files no drift; peer == fresh clone. Red→green independently confirmed
   (RED: 2 suspects vs 1; GREEN: 1 == 1).

## Verification
- `pnpm --filter core test`: 48 files, 456 passed / 2 todo — independently re-run on the merged tree.
- Item-2 red state independently confirmed by removing the DERIVE-loop guard (fails at the E6 convergence
  assertion, `[…(2)] ≠ [Array(1)]`), then restored.
- typecheck (`tsc --noEmit`) + build (`tsdown`) green; diff = `reindex.ts` + 2 test files only; no `.ctx/`
  created in the repo.

## Commits (feat/1.0.0, pushed → 3-OS CI)
- `f9b126d` fix(memory): recomputeDriftAtReindex sheds stale additive rows (tail item 2)
- `4f7f4c4` test(memory): drift convergence + file-anchor target-removed coverage (tail item 1)

## Residue → registers (death condition satisfied)
- **O-05 CLOSED** — item 1 E7 alignment landed + within-branch↔reindex convergence proven.
- Items 4–8 remain decision-needed / evidence-gated / milestone-routed — already tracked in OPEN.md:
  **O-16** (MENTION-SHADOW → next grill), **O-03** (listMemory API → next grill), **O-07** (served_count
  → M5 record-only), **O-08/O-09** (git-evidence target-removed / import timestamps → next design round
  or one-line ruling). Compaction + adapter delta-pull stay evidence-gated (doctor `shadowedOverlay` +
  A11 triggers). Slice-4/5/6 comprehension quizzes pending (user action; packages in session scratchpad).
