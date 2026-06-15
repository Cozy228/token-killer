# Plan 004: Docs truth sweep — README acquisition path, Codex claim, stale DESIGN.md flags, dead `--no-dedup` remnant

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0fcd6f6..HEAD -- README.md docs/DESIGN.md docs/cli-surface-cleanup-goal.md src/types.ts src/core/sessionDedup.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `0fcd6f6`, 2026-06-12
- **Issue**: https://github.com/Cozy228/token-killer/issues/7

## Why this matters

Three documentation failures hit users/agents at first contact, and one dead code
remnant misleads readers: (1) the README's Install section starts at `tk install`
but never says how to **obtain** tk — the package is unpublished (v0.1.0, no
registry), so a fresh user cannot reach the first command; (2) the README's
headline claims Codex support that the code does not implement; (3) DESIGN.md —
the primary architecture reference — documents flags removed in recent CLI
cleanups (`--report`, `gain report`, `inspect --copilot-context`,
`--token-budget-block`), so anyone learning the surface from it types commands
that error; (4) a `--no-dedup` flag was removed from the parser but its
`TkOptions` field and consuming branch remain, sending future readers hunting
for a flag that doesn't exist.

## Current state

- **README.md:6** — "Works with Claude Code, GitHub Copilot (CLI + VS Code), and
  Codex." But `src/shim/detect.ts:10` is
  `export type Host = "claude-code" | "copilot-cli" | "vscode" | "unknown";`
  — no Codex host, no detection branch, no adapter. (README line ~226 also
  mentions Codex but in a different, **correct** sense — session-gain
  computability — leave that one alone.)
- **README.md:55-75** — the Install section opens with the `tk install` code
  block; no `git clone` / `pnpm build` / `pnpm link` / npm instructions anywhere
  in the file. `package.json` has `"bin": { "tk": "./dist/cli.js" }` and
  `"packageManager": "pnpm@11.5.0"`; the build command is `pnpm build` (tsdown).
- **README.md:209-210** — the Session dedup section ends with "Disabled by
  default; enable with `TK_SESSION_DEDUP=1`." This is stale: dedup is
  **default-ON** (`src/core/sessionDedup.ts:46-57` — absent config ⇒ enabled;
  only explicit `TK_SESSION_DEDUP=0`/`false` or config `sessionDedup: false`
  disables). Note this contradicts README:65 ("apply automatically") two
  sections earlier in the same file.
- **docs/DESIGN.md** — has an ADR-0006 staleness banner at top, but these blocks
  show removed syntax as live (verified against `src/parse.ts` /
  `src/inspect/cli.ts` / `src/context/optimizeCli.ts`, none of which parse them):
  - ~line 142: `tk --report [--json|--csv]`
  - ~lines 566-570: `tk inspect --copilot-context` (twice, incl. "窄化" bullet)
  - ~lines 853-860: the whole `tk gain report` block (`gain report --user/--json/--csv`)
  - ~line 929: `tk optimize --token-budget-block`
  - ~line 931: `tk gain report` mention
  - Current real surface: `tk gain [--text|--json]` (HTML default), `tk inspect
    [--text|--json] [--project] [--surface <name>] [--since <d>]`, `tk optimize
    [--apply]`. If unsure of a flag, check `src/cli.ts`'s help text and
    `src/parse.ts` rather than guessing.
- **docs/cli-surface-cleanup-goal.md** — fully implemented (the deletions above
  shipped in commits `0e106ac`, `3c6a63d`, `9f1cfae`) but every acceptance box
  at lines 53-62 is still `[ ]` and its "现状" section describes the old surface
  as current. Completed goal docs live in `docs/archive/` (existing convention —
  see `docs/archive/` contents).
- **Dead `--no-dedup` remnant**:
  - `src/types.ts:79` — `dedup?: boolean;` with a comment referencing the
    removed `--no-dedup` flag.
  - `src/core/sessionDedup.ts:146` —
    `if (options.dedup === false) return null; // \`--no-dedup\` per-command opt-out`
  - `src/parse.ts` parses no such flag; nothing in `src/` assigns
    `options.dedup`. Tests may still construct `TkOptions` with `dedup: false` —
    those test cases must be removed with the field.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Docs gate | `bash scripts/validate-docs.sh` | exit 0           |
| Full product suite | `pnpm test:product` | all pass        |
| Find dedup-flag remnants | `grep -rn "no-dedup\|dedup === false\|dedup: false" src tests docs README.md` | (used in steps; end state: no hits in src/, README, DESIGN.md) |

## Scope

**In scope** (the only files you should modify):
- `README.md`
- `docs/DESIGN.md`
- `docs/cli-surface-cleanup-goal.md` (move to `docs/archive/`)
- `src/types.ts` (only the `dedup` field + its comment)
- `src/core/sessionDedup.ts` (only the `options.dedup === false` gate)
- Test files that construct `TkOptions` with `dedup:` (remove those cases only)

**Out of scope** (do NOT touch, even though they look related):
- Implementing Codex support — that is a separate direction decision (see
  plans/README.md, direction findings).
- Any other DESIGN.md content (architecture prose, ADR references) — fix only
  the listed stale command blocks; this is not a full-doc rewrite.
- `TK.md` / `src/shim/guidance.ts` (the generated usage guide) — different
  artifact, audited separately.
- `scripts/validate-docs.sh` — extending it to check DESIGN.md is a recorded
  follow-up, not this plan.
- The `sessionDedup.ts` eligibility gates other than the dead one.

## Git workflow

- Branch: `advisor/004-docs-truth-sweep`
- Two commits: `docs: fix README acquisition path, Codex claim, stale DESIGN.md surface`
  and `refactor(dedup): drop dead --no-dedup remnant`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: README — add an acquisition block, scope the Codex claim

1. In the Install section (before the `tk install` code block), add a short
   "Get tk" block:

   ```bash
   git clone https://github.com/Cozy228/token-killer.git
   cd token-killer
   pnpm install && pnpm build
   pnpm link --global   # puts `tk` on your PATH
   ```

   with one line noting npm publication is planned (keep it to ~5 lines; match
   the README's existing terse code-block style).
2. Line 6: change the support claim to name only what's implemented, e.g.
   "Works with Claude Code and GitHub Copilot (CLI + VS Code); Codex support is
   planned." Do not edit the line-226 session-gain sentence.
3. Lines 209-210: replace "Disabled by default; enable with
   `TK_SESSION_DEDUP=1`." with the true default-on semantics (on by default;
   disable with `TK_SESSION_DEDUP=0` or config `sessionDedup: false` — verify
   wording against `src/core/sessionDedup.ts:46-57` before writing).

**Verify**: `bash scripts/validate-docs.sh` → exit 0.
**Verify**: `grep -n "and Codex" README.md` → no hit on the support claim line.
**Verify**: `grep -n "Disabled by default" README.md` → no hits.

### Step 2: DESIGN.md — correct the five cited blocks, then sweep for ALL removed surface

First fix the blocks listed in Current state to the real current surface
(confirm each replacement flag exists by grepping `src/parse.ts`,
`src/inspect/cli.ts`, `src/cli.ts` help text first — never document a flag you
didn't verify). Where a feature was deleted outright (`gain report`,
`--token-budget-block`, `--copilot-context`), rewrite the sentence to the
current equivalent (`tk gain`, guidance default-installed via `tk install`,
`tk inspect` always-unified) rather than deleting context wholesale.

Then sweep the WHOLE file — the five cited blocks are the ones the audit
spot-checked, not an exhaustive list. Grep DESIGN.md for every string removed
in the recent CLI cleanups and fix each hit presenting it as current syntax:

```
grep -nE -- "--report|gain report|--copilot-context|--token-budget-block|--no-dedup|--write-advice|--vscode-settings|--repo-context|--telemetry-export|--dry-run|--verbose|tk init|agentsmd" docs/DESIGN.md
```

(`tk init` was renamed to `tk install`; `optimize --dry-run`, `--write-advice`,
`--vscode-settings`, `inspect --repo-context`, `--telemetry-export`, the
`agentsmd` subcommand, and the global `--verbose` were all deleted. A hit
inside an ADR-history note explicitly marked as removed/superseded is
acceptable; a hit in runnable-syntax position is not.)

**Verify**: re-run the grep above → every remaining hit is an explicitly
historical mention; none documents current syntax.
Also fix any "default-off"/opt-in claims about session dedup in DESIGN.md
found via `grep -n "SESSION_DEDUP\|default-off\|默认关" docs/DESIGN.md`.

### Step 3: Archive the completed goal doc

Mark the acceptance boxes done (or add a one-line "DONE, shipped in 0e106ac /
3c6a63d / 9f1cfae" header), fix the "现状" line that claims session-dedup is
default-off (it is default-ON — `src/core/sessionDedup.ts:53`), and
`git mv docs/cli-surface-cleanup-goal.md docs/archive/`.

**Verify**: `ls docs/cli-surface-cleanup-goal.md` → not found; `ls docs/archive/ | grep cli-surface` → present.

### Step 4: Remove the dead `--no-dedup` remnant

1. Delete `dedup?: boolean;` (+ its comment) from `src/types.ts:79`.
2. Delete the `if (options.dedup === false) return null;` line from
   `src/core/sessionDedup.ts:146`.
3. `grep -rn "dedup: false\|dedup === false\|no-dedup" src tests` and remove the
   now-orphaned test cases / fixture fields (delete only cases that exist to
   exercise the removed opt-out; if a test uses `dedup: false` to isolate some
   OTHER behavior under test, replace it with the supported env/config disable
   — `TK_SESSION_DEDUP=0` or config `sessionDedup: false`, see
   `sessionDedup.ts:46-57`).

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `grep -rn "no-dedup" src/ README.md docs/DESIGN.md` → no hits.
**Verify**: `pnpm test:product` → all pass.

## Test plan

No new tests. Step 4 removes obsolete cases; the full suite plus
`validate-docs.sh` are the gates.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0 and `pnpm test:product` exits 0
- [ ] `bash scripts/validate-docs.sh` exits 0
- [ ] README contains a working acquisition block (clone→build→link) and no unscoped Codex support claim
- [ ] `grep -rn "no-dedup" src/` returns nothing
- [ ] `docs/cli-surface-cleanup-goal.md` lives under `docs/archive/`
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A "stale" DESIGN.md flag turns out to still be parsed somewhere in `src/`
  (the audit may have missed a parse path) — verify before rewriting, report if found.
- Removing `dedup?: boolean` breaks a non-test consumer (something in `src/`
  actually assigns it) — that would mean the flag isn't dead.
- `validate-docs.sh` fails for reasons unrelated to your edits.

## Maintenance notes

- Follow-up recorded in the index: extend `scripts/validate-docs.sh` to also
  grep DESIGN.md for removed-flag strings, so this class of staleness fails CI
  (pairs with plan 001).
- When Codex support actually lands (direction finding DIR-02), revert the
  README claim in the same PR that adds the `Host` value.
- Reviewers: check Step 2 didn't invent flags — every documented flag must be
  greppable in `src/parse.ts` or a subcommand CLI file.
