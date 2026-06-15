# Plan 005: Neutralize cmd.exe `%`-expansion when spawning `.cmd`/`.bat` targets (investigate + fix)

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

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-add-ci-workflow.md (recommended)
- **Category**: bug (Windows correctness)
- **Planned at**: commit `0fcd6f6`, 2026-06-12
- **Issue**: https://github.com/Cozy228/token-killer/issues/8

## Why this matters

On Windows, tk spawns resolved `.cmd`/`.bat` tools (pnpm, yarn, npx shims) through
`cmd.exe /d /s /c`. cmd.exe performs `%VAR%` environment expansion on the command
line **regardless of double quotes**, and tk's `cmdQuote` quotes `%` but does not
neutralize it. So an argument like `%PATH%`, `%CD%`, or a grep pattern / commit
message containing `%…%` is silently rewritten by cmd before the real tool sees
it — the proxied command runs with different arguments than the user typed. tk's
contract is to be a transparent proxy; silent argument corruption on the
platform with the project's most active dogfooding is a real correctness gap.
This is a known-hard escaping problem, so this plan is staged: encode the hazard
in tests first, evaluate candidate mitigations, and **require real-Windows
verification before shipping an escape** (the repo has SSH tooling to a Windows
test box: `pnpm ssh:win`, `scripts/windows-dogfood.ps1`).

## Current state

- `src/executor.ts:231-261`:

  ```ts
  // executor.ts:236-239
  function cmdQuote(token: string): string {
    if (token.length > 0 && !/[\s"^&|<>()%!]/.test(token)) return token;
    return `"${token.replace(/"/g, '""')}"`;
  }

  // executor.ts:250-258 (inside buildSpawnTarget)
  const resolved = bakedRealBin(program, pathValue) ?? resolveProgram(program, pathValue);
  if (process.platform === "win32" && isBatchScript(resolved)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    const line = [resolved, ...args].map(cmdQuote).join(" ");
    return {
      file: comspec,
      args: ["/d", "/s", "/c", `"${line}"`],
      windowsVerbatimArguments: true,
    };
  }
  ```

- `buildSpawnTarget` is exported and unit-tested via platform faking — see
  `tests/unit/executor.test.ts:16-23` (`withPlatform` swaps `process.platform`
  with `Object.defineProperty`) and its existing `buildSpawnTarget` cases
  (around line 226). Use that exact pattern for new string-level tests.
- Hard facts about cmd.exe the fix must respect (verify on the box, do not take
  on faith):
  - `%VAR%` immediate expansion happens in cmd's earliest parsing phase,
    scans the whole line, and **ignores quote state** — quoting alone cannot
    prevent it.
  - Caret (`^`) escaping does NOT work inside double quotes, and `%` cannot be
    caret-escaped on the command line anyway.
  - `%%` is a literal-percent escape **only in batch files**, not on a
    `cmd /c` command line.
  - An unmatched/undefined `%name%` reference is left literal on the command
    line (interactive/`/c` semantics) — single `%` characters are only at risk
    when a *pair* forms across the joined line (the pair can span two different
    arguments, since expansion sees the whole line).
  - Delayed expansion (`!VAR!`) is OFF by default and `/d` skips AutoRun, but a
    user's registry can't enable it for `/c` lines when `/v` isn't passed —
    confirm `!` is actually safe under `/d /s /c` and document the finding.
- Comparison point: when an agent's shell runs `pnpm.cmd` *without* tk, the same
  cmd-level expansion can occur (this is a Windows ecosystem hazard, not purely
  a tk regression). tk's bar: be **no worse than the no-tk path**, and never
  corrupt where the native path would not.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/executor.test.ts` | all pass |
| Full suite | `pnpm test:product`     | all pass            |
| Windows box (operator-assisted) | `pnpm ssh:win` | interactive SSH to the Windows test host |

## Scope

**In scope** (the only files you should modify):
- `src/executor.ts` (`cmdQuote`, `buildSpawnTarget`, and a possible new helper)
- `tests/unit/executor.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/shim/path.ts` / generated shim wrapper scripts — wrapper generation has
  its own quoting, audited separately and found sound.
- The POSIX spawn path and non-batch Windows spawn path (plain `.exe` targets
  don't go through cmd.exe — `windowsVerbatimArguments` stays false there).
- `bakedRealBin` / PATH resolution logic.

## Git workflow

- Branch: `advisor/005-cmd-percent-expansion`
- Conventional commit, e.g. `fix(spawn): neutralize cmd.exe %VAR% expansion for batch-script targets`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Encode the hazard in string-level tests (red)

In `tests/unit/executor.test.ts`, using the existing `withPlatform("win32")`
pattern, add cases for `buildSpawnTarget("pnpm", [...], pathWithCmdShim)` where
args include: `%PATH%`, `100%`, `a%b` + `c%d` (cross-arg pair), `%UNDEFINED_XYZ%`.
Assert on the *constructed cmd line string* — the assertion should state the
post-fix expectation (whatever neutralization Step 2 chooses must make the real
tool receive the literal text). Mark them `it.todo`/failing initially if the
assertion can't be written before choosing the technique — but write at minimum
the cross-arg-pair case, which is the one naive fixes miss.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/executor.test.ts` → new cases visible (failing or todo), all pre-existing cases still pass.

### Step 2: Evaluate candidate mitigations (decision step)

Evaluate, in this order, and pick the first that survives:

1. **Env-var indirection (recommended candidate)**: for any arg containing `%`,
   replace the `%` characters with a reference to an env var that tk sets on the
   spawned child to a literal percent — e.g. set `TK_PCT=%` in the child env and
   rewrite `%PATH%` → `%TK_PCT%PATH%TK_PCT%`. cmd expands `%TK_PCT%` → `%`,
   reconstructing the literal text exactly once, immune to quote state. The
   rewrite must apply to the *resolved batch path* too if it contains `%`
   (rare). Document why the env name is collision-safe (tk-prefixed; refuse and
   fall back if the user env already defines `TK_PCT` differently).
2. **Fail-closed fallback**: if (1) proves unreliable on the real box, follow
   Rust's CVE-2024-24576 posture — when an arg contains `%` that would form an
   expandable pair and the target is a batch script, refuse the cmd path and
   fall back to `executePassthrough`-style direct spawn of the script via its
   interpreter, or emit a clear one-line error naming the offending argument
   (never silently corrupt).

Record the decision and the evidence (actual Windows outputs) in the PR/commit
body.

**Verify**: a written decision exists in the commit message / NOTES; the chosen
technique has a concrete Windows transcript behind it (Step 4).

### Step 3: Implement in `cmdQuote`/`buildSpawnTarget`

Implement the chosen mitigation, win32-batch-path only. Keep `cmdQuote`'s
existing behavior for `%`-free tokens byte-identical (the fast path must not
change). Update Step 1's assertions from todo→green.

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/executor.test.ts` → all pass, including the new `%` cases.
**Verify**: `pnpm test:product` → all pass.

### Step 4: Real-Windows verification (gate — may need the operator)

On the Windows test box (`pnpm ssh:win`), with tk built and shimmed, run through
a `.cmd` target (pnpm's own shim is the natural target), e.g.:

- `tk pnpm exec node -e "console.log(process.argv[2])" -- "%PATH%"` → prints the
  literal string `%PATH%`, not an expanded PATH value.
- Same for `100%` and the cross-arg pair case.
- One control run WITHOUT tk to record the native behavior for comparison.

If you (the executor) cannot reach the Windows box, STOP after Step 3 and report
"implemented + unit-tested, Windows verification pending" — do not mark the plan
DONE.

**Verify**: transcript shows literal `%PATH%` round-tripping through tk on real cmd.exe.

## Test plan

- New `buildSpawnTarget` win32 cases in `tests/unit/executor.test.ts` (Step 1):
  `%PATH%`, `100%`, cross-arg pair, undefined-var reference; pattern:
  the existing `withPlatform` + `buildSpawnTarget` assertions around line 226.
- Real-box manual verification per Step 4 (recorded as a transcript, since no
  Windows CI exists yet).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test:product` exits 0
- [ ] New `%`-handling tests exist in `tests/unit/executor.test.ts` and pass
- [ ] `%`-free tokens produce byte-identical spawn lines to before (covered by pre-existing tests passing unmodified)
- [ ] Windows transcript evidence for the Step 4 cases (or the plan is left explicitly NOT-done with "Windows verification pending")
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Both candidate mitigations fail on the real box — report transcripts; the
  finding then needs a design decision (e.g. resolving the `.cmd` shim's
  underlying node script and bypassing cmd entirely), which is out of scope.
- The fix requires touching the shim wrapper generators (`src/shim/path.ts`).
- You cannot access a Windows environment AND the operator is unavailable —
  stop after Step 3 as described.
- Pre-existing `buildSpawnTarget` tests need their expected strings changed
  for `%`-free inputs (the fast path must stay byte-identical).

## Maintenance notes

- `!` (delayed expansion) was left as-is pending the Step 2 confirmation that
  `/d /s /c` lines never delayed-expand; if that turns out false, `!` needs the
  same treatment — note the finding either way.
- If/when a Windows CI job lands (follow-up to plan 001), promote Step 4's
  manual cases into `scripts/windows-dogfood.ps1`.
- Reviewers: scrutinize that the mitigation applies to the joined LINE semantics
  (pairs across args), not per-token only.
