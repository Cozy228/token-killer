# Plan 006: Make the 64MB capture cap truncation-safe for multibyte output decode

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0fcd6f6..HEAD -- src/executor.ts tests/unit/executor.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (file-adjacent to plan 005 — coordinate if run concurrently)
- **Category**: bug
- **Planned at**: commit `0fcd6f6`, 2026-06-12
- **Issue**: https://github.com/Cozy228/token-killer/issues/9

## Why this matters

When captured child output hits the 64MB-per-stream cap, tk stops buffering at a
**chunk boundary** — an arbitrary byte position that can fall mid-way through a
multibyte UTF-8 sequence. The decoder then strict-decodes the whole buffer with
`{ fatal: true }`; one split codepoint at the very end makes the *entire* buffer
fail strict UTF-8, which on Windows silently reroutes all 64MB to the legacy
code-page decoder (GBK/Shift-JIS…) — turning every non-ASCII character in
otherwise-valid UTF-8 output into mojibake. The recently shipped
legacy-codepage fallback fires on exactly the wrong input. The blast radius is
narrow (capped output + multibyte content + Windows), but the failure is total
when it hits, and the fix is a small, well-testable boundary trim.

## Current state

- `src/executor.ts:293-314` (capture loop) — chunks are kept whole; once
  `stdoutBytes >= MAX_CAPTURE_BYTES` further chunks are dropped and `truncated`
  is set. The last kept chunk ends wherever the OS pipe happened to split —
  possibly inside a UTF-8 sequence.
- **Caution: `truncated` is a SINGLE flag shared by both streams** (one
  `let truncated = false` set by either the stdout or the stderr handler). A
  trim keyed on that shared flag would also touch the stream that did NOT
  truncate — and if that other stream is complete legacy-encoded (GBK) data
  whose final byte happens to look like a UTF-8 lead byte, the trim would
  silently delete real bytes before the legacy fallback runs. The fix must
  track truncation **per stream** (see Step 2).
- `src/executor.ts:87-95` — the decoder:

  ```ts
  export function decodeChildOutput(buf: Buffer): string {
    if (buf.length === 0) return "";
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      const legacy = getLegacyDecoder();
      return legacy ? legacy.decode(buf) : buf.toString("utf8");
    }
  }
  ```

  On POSIX `getLegacyDecoder()` returns null (executor.ts:74) so the fallback is
  lossy-but-local `buf.toString("utf8")` — only the broken tail mangles. On
  Windows the legacy decoder reinterprets the ENTIRE buffer.
- `decodeChildOutput` is exported for tests, and `resetLegacyDecoderCache()`
  (executor.ts:99-101) exists as a test seam.
- Existing decode tests live in `tests/unit/executor.test.ts` (the GBK/legacy
  fallback cases) — model new tests on them.
- UTF-8 structure facts for the trim helper: a continuation byte is
  `0b10xxxxxx` (`(b & 0xC0) === 0x80`); lead bytes declare sequence length
  (0xC2–0xDF→2, 0xE0–0xEF→3, **0xF0–0xF4→4 — F5–FF are NOT valid UTF-8 lead
  bytes** (max codepoint U+10FFFF) and must be left in place so they still
  reach the legacy fallback); a complete buffer never needs more than the last
  3 bytes inspected to find an incomplete trailing sequence.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/executor.test.ts` | all pass |
| Full suite | `pnpm test:product`     | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/executor.ts` (a new small helper + the two `decodeChildOutput` call sites
  in the `close` handler at executor.ts:336-348)
- `tests/unit/executor.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- The legacy decoder selection logic (`detectWindowsLegacyLabel`,
  `getLegacyDecoder`) — correct for genuinely-legacy output; don't change when
  it fires for non-truncated buffers.
- `MAX_CAPTURE_BYTES` and the truncation-marker stderr text.
- Handler-level output processing.

## Git workflow

- Branch: `advisor/006-truncation-safe-decode`
- Conventional commit, e.g. `fix(executor): trim split UTF-8 tail at the capture cap before strict decode`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `trimIncompleteUtf8Tail(buf: Buffer): Buffer` helper

In `src/executor.ts`, near `decodeChildOutput`. Behavior: inspect at most the
last 3 bytes; if the buffer ends with an incomplete (but otherwise plausible)
UTF-8 sequence — a lead byte whose declared length extends past the end,
preceded only by valid continuation bytes — return a subarray without those
trailing bytes; otherwise return the buffer unchanged. It must NOT trim
genuinely invalid bytes in the middle (that's real legacy data and must still
reach the fallback). Export it for tests.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Split truncation tracking per stream, then apply the trim per stream

1. In the capture loop (executor.ts:293-314), replace the shared
   `let truncated = false` with `let stdoutTruncated = false` /
   `let stderrTruncated = false`, each set only by its own stream's handler.
   The existing stderr truncation-notice message keeps firing when **either**
   flag is set (`stdoutTruncated || stderrTruncated` — message behavior
   unchanged).
2. In the `close` handler (executor.ts:336-348): pass the stdout buffer through
   `trimIncompleteUtf8Tail` only when `stdoutTruncated` is true, and the stderr
   buffer only when `stderrTruncated` is true. A stream that did not truncate
   must reach the decoder byte-identical (complete legacy-encoded output relies
   on strict decode failing over the **untouched** buffer).

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `grep -n "truncated" src/executor.ts` → only the two per-stream flags (plus the combined message check); no shared flag remains.

### Step 3: Tests

In `tests/unit/executor.test.ts` (alongside the existing decode cases):

1. `trimIncompleteUtf8Tail` unit cases: complete ASCII (unchanged), complete
   multibyte (unchanged), 2/3/4-byte sequence split at each possible position
   (trimmed to the boundary), buffer of pure continuation bytes (unchanged —
   not a split tail, genuinely invalid), **trailing 0xF5–0xFF byte (unchanged —
   invalid lead, must reach the fallback)**, empty buffer.
   Plus a per-stream case: stdout truncated mid-sequence while stderr is a
   complete GBK buffer whose last byte is in 0xE0–0xEF — assert stderr is NOT
   trimmed and still legacy-decodes intact.
2. End-to-end decode case: a valid UTF-8 buffer of e.g. repeated `"汉"` cut
   mid-character → after trim, strict decode succeeds and the result contains
   no U+FFFD and no legacy-decoder invocation (use `resetLegacyDecoderCache()`
   and the existing platform-faking pattern if asserting the Windows branch).
3. Regression: an actually-GBK buffer (copy an existing fixture in the file)
   still reaches the legacy fallback unchanged.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/executor.test.ts` → all pass, including the new cases.
**Verify**: `pnpm test:product` → all pass.

## Test plan

As Step 3 — helper unit matrix, the truncated-multibyte end-to-end case (the
bug this plan fixes), and the legacy-fallback regression guard. Pattern:
existing decode tests in `tests/unit/executor.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test:product` exits 0
- [ ] `trimIncompleteUtf8Tail` exists, is exported, and its test matrix passes
- [ ] Truncation is tracked per stream; the trim is applied only to the stream whose own flag is true (read the close handler to confirm)
- [ ] 0xF5–0xFF trailing bytes are never trimmed (test exists)
- [ ] Existing legacy-decode tests pass unmodified
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The capture loop no longer matches the excerpt (e.g. someone switched to a
  streaming TextDecoder — the fix may already be subsumed).
- Plan 005 is concurrently editing `src/executor.ts` in a conflicting region —
  coordinate ordering rather than merging blind.
- Trimming requires touching how `truncated` is computed or surfaced.

## Maintenance notes

- The strictly-better long-term shape is a streaming `TextDecoder` with
  `{ stream: true }` per chunk (no whole-buffer retry at all); that's a larger
  refactor of the capture loop and was deliberately not chosen here.
- If `MAX_CAPTURE_BYTES` ever becomes configurable/smaller, this trim becomes
  more load-bearing — keep the test matrix.
