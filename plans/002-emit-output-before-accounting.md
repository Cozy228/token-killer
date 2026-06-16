# Plan 002: Emit compressed output to stdout before awaiting accounting writes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22579d2..HEAD -- src/cli.ts src/core/pipeline.ts src/core/sessionDedup.ts tests/unit/core/dedupPipeline.test.ts tests/unit/core/sessionDedup.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-add-ci-workflow.md (recommended — gives this change an automatic gate)
- **Category**: perf
- **Planned at**: commit `22579d2`, 2026-06-15 (refreshed from `0fcd6f6`; `cli.ts` line numbers shifted by the `tk support` dispatch — `runCompress` body and the finding are unchanged)
- **Issue**: https://github.com/Cozy228/token-killer/issues/5

## Why this matters

tk runs in front of **every** command an AI agent executes, so per-command latency
is the product's core constraint — the team already shipped baked binary paths,
compile-cache baking, and `--raw` streaming to shave it. But on the main compress
path, the agent still waits for **disk accounting before seeing any output**: the
pipeline awaits the session-dedup store write (lock acquire → read → JSON parse →
prune → write → rename) and the history JSONL append *before* `cli.ts` writes the
compressed result to stdout. Neither write affects the bytes being emitted. Moving
them after the stdout write removes 2–3 fs round-trips (plus up to ~40ms of lock
backoff under contention) from the user-visible latency of every compressed
command. The `--raw` path already does exactly this (output first, best-effort
accounting after) — this plan brings the compress path to the same discipline.

## Current state

- `src/cli.ts:399-440` — `runCompress` awaits the whole pipeline, then writes:

  ```ts
  // cli.ts:414-437 (abridged)
  try {
    const filtered = await runPipeline(
      { ...handler, async execute() { return raw; } },
      command,
      options,
    ).then((result) => result.filtered);
    ...
    const display = limitOutput(filtered.output, options);
    process.stdout.write(display);            // <-- output happens only AFTER all accounting
  ```

- `src/core/pipeline.ts:17-49` — `runPipeline` performs both accounting writes
  before resolving:

  ```ts
  let deduped: FilteredResult | null = null;
  try {
    deduped = await applySessionDedup({ handler, command, options, raw, filtered });
  } catch { deduped = null; }
  if (deduped) return { raw, filtered: deduped };
  try {
    await recordHistory(raw, filtered, options);   // <-- awaited pre-output
  } catch { /* fail-open */ }
  return { raw, filtered };
  ```

- `src/core/sessionDedup.ts:140-235` — `applySessionDedup` has two phases that
  must be separated:
  - **Decision phase (must stay before output)**: eligibility gates
    (lines 146-154), `readStore` (line 168), the HIT branch's snapshot
    resolution and `buildMarker` (lines 178-197) — these determine *what bytes
    are emitted* (marker vs full output).
  - **Persistence phase (can move after output)**:
    - HIT branch: `appendDedupEvent` (line 200) and the conditional
      `upsertEntry` refresh (lines 213-215).
    - MISS branch: the unconditional `upsertEntry` (line 233) — this is the
      common-case hot-path write (`src/core/dedupStore.ts:108-133`: lock with
      up to 5×8ms backoff, re-read, prune over ≤512 entries, write tmp, rename).
- `src/core/history.ts:73-102` — `recordHistory` appends one JSONL row; its
  content is fully determined by `(raw, filtered, options)` and does not depend
  on whether stdout was written yet.
- Precedent in-repo: the `--raw` paths write output FIRST, then do best-effort
  accounting in a `try {} catch { /* drop the accounting row */ }` —
  `src/cli.ts:276-317` (`recordRawLitePassthrough` / `recordRawPassthrough`).
  Match this pattern.
- Load-bearing invariant (comment at `src/cli.ts:393-400`): once the child has
  executed, **nothing may throw out of `runCompress`** — the cli-level catch
  re-spawns the command via passthrough, which would double-execute side effects.
  The deferred accounting must therefore stay inside `runCompress`'s existing
  absorb-try (or its own try/catch), exactly like today.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/core/sessionDedup.test.ts tests/unit/core/dedupPipeline.test.ts tests/unit/core/historySlimming.test.ts` | all pass |
| Full product suite | `pnpm test:product` | all pass (~1550 tests) |

## Scope

**In scope** (the only files you should modify):
- `src/core/pipeline.ts`
- `src/core/sessionDedup.ts`
- `src/cli.ts` (only the `runCompress` function)
- `src/types.ts` (only if the `PipelineResult` type lives there — it currently
  lives in `pipeline.ts`; prefer keeping it there)
- `tests/unit/core/dedupPipeline.test.ts`, `tests/unit/core/sessionDedup.test.ts`,
  and any test that asserts history/dedup rows exist immediately after
  `runPipeline` resolves (adjust to await the commit step)

**Out of scope** (do NOT touch, even though they look related):
- `src/core/dedupStore.ts` — the lock/store mechanics are correct; this plan only
  changes *when* they're invoked, not *how*.
- `src/core/history.ts` — `recordHistory` itself is unchanged.
- The `--raw` paths in `src/cli.ts` (lines 262-318) — already correct.
- The hook runtime (`src/hook/`) — it does not go through `runCompress`.
- Any change to what bytes are emitted, exit codes, or the dedup HIT/MISS
  decision logic.

## Git workflow

- Branch: `advisor/002-emit-output-before-accounting`
- Conventional commits, e.g. `perf(pipeline): emit compressed output before accounting writes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split `applySessionDedup` into decision + deferred persistence

In `src/core/sessionDedup.ts`, change the return type from
`Promise<FilteredResult | null>` to:

```ts
export type DedupDecision = {
  filtered: FilteredResult | null;        // null = no dedup, emit full output
  persist: () => Promise<void>;           // all store/ledger writes, fail-open inside
};
```

- All eligibility-gate early returns become
  `return { filtered: null, persist: async () => {} }`.
- HIT branch: keep `readStore`, snapshot resolution, and `buildMarker` inline
  (they determine the emitted bytes). Move `appendDedupEvent(...)` and the
  conditional `upsertEntry` refresh into the returned `persist` closure. The
  closure must capture the already-computed values (`marker`, `rawPointer`,
  `entry` fields) — do not recompute inside.
- MISS branch: build the `entry` object inline (it reads `filtered.rawOutputPath`
  and timestamps that are already known), and move only the `await upsertEntry(...)`
  into `persist`.
- Wrap the body of `persist` in `try { ... } catch { /* fail-open */ }` so a
  failed deferred write can never throw into the caller.

**Verify**: `pnpm typecheck` → fails only in `pipeline.ts` and tests (the
callers you fix next) — no errors inside `sessionDedup.ts` itself.

### Step 2: Have `runPipeline` return a `commit` instead of awaiting accounting

In `src/core/pipeline.ts`:

```ts
export type PipelineResult = {
  raw: RawResult;
  filtered: FilteredResult;
  commit: () => Promise<void>;   // deferred accounting: dedup persistence + history row
};
```

- Call `applySessionDedup` (still awaited — it decides the output). On a HIT
  (`decision.filtered` non-null), return
  `{ raw, filtered: decision.filtered, commit: decision.persist }`.
  **A dedup HIT must NOT write a history row** — preserve today's behavior
  (the early return at pipeline.ts:36 skips `recordHistory`; ADR 0009's
  never-sum rule depends on this).
- On no-dedup, return
  `{ raw, filtered, commit: async () => { await decision.persist(); try { await recordHistory(raw, filtered, options); } catch {} } }`.
- Keep the existing top-level `try/catch` around `applySessionDedup` (a throw
  in the decision phase still falls open to full output with a commit that
  only records history).

**Verify**: `pnpm typecheck` → errors remaining only in `src/cli.ts` and tests.

### Step 3: Reorder `runCompress` in `src/cli.ts`

Inside the existing absorb-try (after `runPipeline` resolves):

1. Compute `display`, write it to stdout (existing lines 424-428).
2. Keep the failure hint + `--stats` writes in their current order.
3. THEN `await result.commit()` — still inside the absorb-try so a commit
   failure can never reach the cli fail-open catch.
4. Keep the `tkDebug("compress", ...)` trace; it may stay before the stdout
   write (it reads only `filtered` fields).

Note `runPipeline`'s result is currently narrowed with
`.then((result) => result.filtered)` at `cli.ts:411` — remove that narrowing so
`commit` is reachable.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Update tests that assumed eager accounting

Run the targeted suites and fix failures **only** by awaiting the new commit
step where the test previously relied on `runPipeline`/`applySessionDedup`
having persisted already:

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/core/sessionDedup.test.ts tests/unit/core/dedupPipeline.test.ts tests/unit/core/historySlimming.test.ts` → all pass.

### Step 5: Add ordering regression tests

In `tests/unit/core/dedupPipeline.test.ts` (model the setup after the existing
cases in that file — temp `TOKEN_KILLER_HOME`, fake handler):

1. **Deferred persistence**: call `runPipeline` on a cacheable command; assert
   the history file does NOT exist (or has no new row) before `commit()` is
   called, and DOES after `await result.commit()`.
2. **Dedup store deferred on MISS**: same shape — dedup store file absent/
   unchanged before `commit()`, entry present after.
3. **Commit failure is absorbed**: point `TOKEN_KILLER_HOME` at an unwritable
   location (e.g. a path under a file), call `runPipeline` + `commit()`, assert
   no throw and `filtered.output` is intact.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/core/dedupPipeline.test.ts` → all pass, including 3 new tests.

### Step 6: Full suite

**Verify**: `pnpm test:product` → all pass.
**Verify**: `pnpm typecheck` → exit 0.

## Test plan

Covered in Steps 4–5: existing dedup/history suites updated to the commit
seam, plus three new ordering tests (deferred history, deferred MISS upsert,
absorbed commit failure). Pattern exemplar: `tests/unit/core/dedupPipeline.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:product` exits 0; the 3 new ordering tests exist and pass
- [ ] In `src/cli.ts`'s `runCompress`, `process.stdout.write(display)` precedes the `await ...commit()` call (read the function to confirm)
- [ ] `grep -n "await recordHistory" src/core/pipeline.ts` returns no match outside the `commit` closure
- [ ] A dedup HIT still writes no history row (existing never-sum tests pass unmodified in their assertions)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited locations doesn't match the "Current state" excerpts.
- Any test failure suggests something *reads* the history row or dedup entry in
  the same process before output is emitted (i.e. an ordering dependency the
  audit missed) — name the test and the dependency.
- Preserving the "never throw after child execution" invariant appears to
  require changes outside the in-scope files.
- More than ~10 existing tests need semantic changes (not just awaiting
  `commit`) — the blast radius assumption is then wrong.

## Maintenance notes

- Future writers adding accounting (new ledgers, telemetry counters) to the
  compress path must add them inside `commit`, not before the stdout write —
  consider a comment at the `commit` construction site saying exactly that.
- Reviewer focus: (1) the HIT path still never double-counts (no history row);
  (2) `persist` captures computed values rather than re-reading state; (3) the
  commit is awaited before `runCompress` returns (the process must not exit
  with the write still in flight — Node would keep the loop alive, but an
  explicit await keeps exit-code timing deterministic).
- Deferred (out of scope, recorded in the index): making the MISS-path
  `upsertEntry` fully fire-and-forget, and batching history+dedup into one fs
  transaction.
