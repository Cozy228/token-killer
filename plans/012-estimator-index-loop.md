# Plan 012: Estimate tokens with an index loop instead of per-codepoint `for..of`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22579d2..HEAD -- src/core/tokens.ts scripts/calibrate-tokens.ts tests/unit/core/tokens.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `22579d2`, 2026-06-15
- **Issue**: https://github.com/Cozy228/token-killer/issues/14

## Why this matters

tk runs in front of **every** proxied command, and `estimateTokens` is on that
hot path: `src/core/savings.ts:17-18` calls it **twice per invocation** (once on
the raw output, once on the compressed output) to compute savings, and the
telemetry/ledger paths call it too. The estimator iterates the input with
`for (const ch of text)` (`src/core/tokens.ts:79`). In V8 the string iterator
materializes a fresh single-character string object for **every codepoint**, so
the loop allocates O(n) short-lived strings and pays GC for them. A
`codePointAt(i)` index loop reads the same codepoints with **zero** per-char
allocation. On large tool output (multi-MB logs, JSON, diffs) the difference is
~4.5× on the estimator (measured ~52 ms vs ~12 ms on 10 MB; ~8 ms vs ~2.6 ms on
1 MB) — and it is paid twice per command.

This is a pure, **behavior-preserving** micro-optimization on the product's core
constraint (per-command latency). The previous audit deferred the estimator's
per-codepoint cost pending a profile; the estimator was since rewritten into the
heavier segmented bucketer (more work per char), so this is the measured
follow-through.

## Current state

- `src/core/tokens.ts:72-96` — `estimateTokens`:

  ```ts
  export function estimateTokens(text: string): number {
    let cjk = 0;
    let letters = 0;
    let digits = 0;
    let symbols = 0;
    let whitespaceChars = 0;

    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      if (isWhitespace(cp)) whitespaceChars += 1;
      else if (isCjk(cp)) cjk += 1;
      else if (isDigit(cp)) digits += 1;
      else if (isLetter(cp)) letters += ch.length;   // ch.length === 2 for a surrogate pair
      else symbols += ch.length;
    }

    const tokens = /* … weighted sum of the buckets … */;
    return Math.ceil(tokens);
  }
  ```

  **Critical**: `ch.length` is `1` for a BMP codepoint and `2` for an astral one
  (surrogate pair). The letter/symbol buckets therefore count **UTF-16 units**,
  not codepoints. The rewrite MUST reproduce this exactly.

- `src/core/savings.ts:17-18` — `estimateTokens(raw)` and `estimateTokens(output)`,
  the two hot-path calls per invocation.
- `scripts/calibrate-tokens.ts:60-71` — `featurize` is a **second, independent
  copy** of this exact loop (dev-time calibration; not shipped at runtime). It
  must stay structurally identical to the runtime bucketer or a future refit
  computes ratios on a different bucketing than runtime uses.
- Existing tests: `tests/unit/core/tokens.test.ts` (extend it).

Facts the executor needs:

- `for (const ch of text)` yields codepoint **substrings** (allocates per char);
  `text.codePointAt(i)` returns the numeric codepoint with no allocation but
  indexes by **UTF-16 unit**, so an astral codepoint must advance `i` by 2.
- The optimization must be **output-identical for every input**. The bucketing
  rule (whitespace / cjk / digit / letter / symbol) and the `ch.length` (1 vs 2)
  accounting must be reproduced precisely. Do not change the ratios or predicates.

## Commands you will need

| Purpose            | Command                                                                  | Expected on success |
|--------------------|--------------------------------------------------------------------------|---------------------|
| Install            | `pnpm install`                                                          | exit 0              |
| Typecheck          | `pnpm typecheck`                                                        | exit 0, no errors   |
| Targeted tests     | `pnpm vitest run --config vitest.config.ts tests/unit/core/tokens.test.ts` | all pass         |
| Full product suite | `pnpm test:product`                                                    | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/core/tokens.ts` (the `estimateTokens` loop only)
- `scripts/calibrate-tokens.ts` (the `featurize` loop only — keep in lockstep)
- `tests/unit/core/tokens.test.ts` (add the reference-equivalence cases)

**Out of scope** (do NOT touch, even though they look related):
- The `CHARS_PER_TOKEN` / `WHITESPACE_CHARS_PER_TOKEN` / `CJK_TOKENS_PER_CHAR`
  ratios and the `isCjk`/`isWhitespace`/`isDigit`/`isLetter` predicates — this is
  a loop rewrite, NOT a recalibration. Changing any of these changes outputs.
- The rest of `savings.ts` / ledger / telemetry — they only call `estimateTokens`.
- Any change to the returned value for any input — if the rewrite alters a single
  count, it is wrong.

## Git workflow

- Branch: `advisor/011-estimator-index-loop`
- Conventional commit: `perf(tokens): estimate via index loop, drop per-codepoint allocation`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pin current behavior with a reference-equivalence test FIRST

Before changing `tokens.ts`, add cases to `tests/unit/core/tokens.test.ts` that
assert the **exact** current output of `estimateTokens` for a representative
corpus, so the rewrite is provably output-preserving. Cover:

- empty string → `0`
- all-whitespace (e.g. `"   \t\n  "`)
- ASCII prose; ASCII code with symbols (`"const x = foo.bar(1, 2);"`)
- pure digits (`"1234567890"`)
- CJK (`"你好世界"`)
- astral / surrogate emoji (`"👍🏽 code 😀"`) — this is what exercises the
  `ch.length === 2` accounting
- a mixed blob combining several of the above

Obtain the expected numbers from the CURRENT implementation (run the suite once
with `expect(estimateTokens(input)).toBe(/* placeholder */)` and read the actual,
or temporarily `console.log` them), then hard-code them as the expected values.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/core/tokens.test.ts`
→ all pass against the **unchanged** implementation.

### Step 2: Rewrite the loop to index-based `codePointAt`

Replace the `for (const ch of text)` body in `estimateTokens` with:

```ts
for (let i = 0; i < text.length; i += 1) {
  const cp = text.codePointAt(i) ?? 0;
  const units = cp > 0xffff ? 2 : 1;   // astral codepoint spans 2 UTF-16 units
  if (units === 2) i += 1;             // skip the trailing low surrogate
  if (isWhitespace(cp)) whitespaceChars += 1;
  else if (isCjk(cp)) cjk += 1;
  else if (isDigit(cp)) digits += 1;
  else if (isLetter(cp)) letters += units;
  else symbols += units;
}
```

This is allocation-free and reproduces `ch.length` exactly via `units`.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/core/tokens.test.ts`
→ all Step-1 cases still pass (outputs identical). If any differ, the rewrite is
wrong — fix the loop (almost always the surrogate `units` handling), never the
expected values.

### Step 3: Apply the identical transform to `calibrate-tokens.ts:featurize`

Mirror the same loop shape in `scripts/calibrate-tokens.ts:60-71` (letters/symbols
use `units`; advance `i` by 2 for an astral codepoint). The script is dev-only —
the goal is keeping the two bucketers byte-for-byte equivalent so a future refit
matches runtime.

**Verify**: `pnpm typecheck` → exit 0. (No runtime test covers the script; the
equivalence is structural — confirm by eye that the bucketing branches match
`tokens.ts` exactly.)

### Step 4: Full suite

**Verify**: `pnpm test:product` → all pass.

## Test plan

Step 1's reference-equivalence cases ARE the gate: they assert exact counts and
fail loudly if the rewrite changes any bucket (including the surrogate-pair case).
Pattern: existing cases in `tests/unit/core/tokens.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test:product` exits 0
- [ ] `tests/unit/core/tokens.test.ts` has reference-equivalence cases including an astral/emoji case; all pass
- [ ] `grep -n "for (const ch of" src/core/tokens.ts scripts/calibrate-tokens.ts` → no matches (both loops converted)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `tokens.test.ts` already pins outputs that the new loop changes — that means the
  rewrite is not output-preserving; fix the loop, do NOT edit the existing
  expected values.
- The `estimateTokens` excerpt no longer matches the live code (drift).
- A measured win failing to appear is **not** a STOP condition — output-preserving
  correctness is the bar; the perf gain is guaranteed by the allocation-free shape.

## Maintenance notes

- `tokens.ts` and `calibrate-tokens.ts:featurize` are intentionally identical
  bucketers; a change to one must change the other (the file comment in `tokens.ts`
  already points at the script). If they drift again, consider extracting a shared
  `featurize` helper — deferred here to keep the change surgical.
- If a future estimator adds or splits a bucket, update both loops and add a
  reference-equivalence case for the new class.
