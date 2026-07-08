# Plan 001: Add a GitHub Actions CI workflow that runs the existing verification gates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0fcd6f6..HEAD -- package.json scripts/ tests/smoke/ .github/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `0fcd6f6`, 2026-06-12
- **Issue**: https://github.com/Cozy228/token-killer/issues/4

## Why this matters

The repo has ~1550 vitest tests, a docs validator, an install test, and a smoke
suite — all chained behind one script (`pnpm test:ci`) — but **no `.github/`
directory exists at all**, so nothing runs any of it automatically. Regressions
land silently unless someone remembers to run the chain locally. Several audit
findings (stale docs that `validate-docs.sh` should catch, the built `dist/cli.js`
never being exercised) trace directly to this gap. This is the verification
baseline for every other plan in `plans/`: once CI exists, each later change gets
an automatic gate.

## Current state

- `package.json:28` already defines the full chain:

  ```json
  "test:ci": "pnpm test:product && pnpm test:install && bash scripts/check-test-presence.sh && bash scripts/validate-docs.sh && bash tests/smoke/smoke.sh",
  ```

  - `test:product` = `vitest run --config vitest.config.ts` (~1550 tests)
  - `test:install` = `bash scripts/test-install.sh` — **this script runs
    `pnpm run build` itself** (line 21: `if pnpm run build >/dev/null 2>&1`),
    so `dist/cli.js` exists for the smoke suite that follows.
  - `scripts/validate-docs.sh` — checks README documents all handler-covered commands.
  - `tests/smoke/smoke.sh` — end-to-end exercise of tk commands; exit code = number of failures.
- `package.json:29` defines `"typecheck": "tsc --noEmit"` (verified green at the
  planned-at commit).
- `package.json:6` pins `"packageManager": "pnpm@11.10.0"` — use this via corepack
  or `pnpm/action-setup` (which reads the `packageManager` field when no version
  is given).
- `package.json:38-40` requires `"node": ">=22.18.0"`.
- There is **no `.github/` directory** (verified: `ls -d .github` → not found).
- The repo's commit style is conventional commits (e.g. `fix(spawn): …`,
  `docs: …` — see `git log --oneline`).
- Note: tests assume a POSIX host (Windows branches are unit-tested via
  platform faking only) — use `ubuntu-latest`. A real Windows job is a known
  follow-up, deliberately out of scope here (see Maintenance notes).
- Caution on the Step 1 local run: developer machines that have tk itself
  installed carry env/state the suite can be sensitive to (`TK_SHIM_DIR`, tk
  shims on PATH aliasing `cat`/`ls`, a real `~/.token-killer` with persistent
  dedup/history state — the `tests/setup/isolateHome.ts` net has known gaps).
  Run Step 1 from a **clean checkout at HEAD** (not a dirty working tree) with
  tk env unset: `unset TK_SHIM_DIR TOKEN_KILLER_HOME TK_SESSION_DEDUP` and a
  PATH without the tk shim dir. CI's environment is clean by construction; the
  local run only needs to approximate it well enough to validate the premise.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Full gate | `pnpm test:ci`           | exit 0 (all suites green) |
| Lint a workflow file | `node -e "const f=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log('bytes',f.length)"` | prints byte count (basic existence check); rely on GitHub's parser for YAML validity |

## Scope

**In scope** (the only files you should create/modify):
- `.github/workflows/ci.yml` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `package.json` — the scripts are already correct; do not add or rename scripts.
- `scripts/*.sh`, `tests/smoke/smoke.sh` — if one of them fails in CI, that is a
  STOP condition, not something to patch here.
- Any Windows runner job — follow-up, not this plan.
- `server/` — separate deploy unit, not gated by this workflow.

## Git workflow

- Branch: `advisor/001-add-ci-workflow`
- Single commit, message: `ci: add GitHub Actions workflow running typecheck + test:ci`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify the gate is green locally before wiring it

Run, from the repo root:

**Verify**: `pnpm install` → exit 0
**Verify**: `pnpm typecheck` → exit 0
**Verify**: `pnpm test:ci` → exit 0. This takes a few minutes (it builds, runs
~1550 tests, the install test, doc validation, and the smoke suite). If it fails
on a clean checkout, STOP (see STOP conditions) — the failure pre-exists this
plan and must be reported, not fixed here.

### Step 2: Create `.github/workflows/ci.yml`

Create the file with this exact shape (adjust only if a STOP condition forces it):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4   # reads packageManager from package.json
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test:ci
```

Notes:
- `pnpm/action-setup@v4` with no `version` input resolves pnpm from the
  `packageManager` field — do not hardcode a pnpm version.
- `cache: pnpm` on setup-node caches the pnpm store keyed on `pnpm-lock.yaml`.

**Verify**: `git status --short` → only `.github/workflows/ci.yml` (and the
plans/README.md row when you update it) appear.

### Step 3: Sanity-run the workflow's commands exactly as CI will

Run the same sequence the workflow runs, in order:

**Verify**: `pnpm install --frozen-lockfile` → exit 0 (proves the lockfile is in
sync; if this fails while plain `pnpm install` passed, the lockfile is stale —
STOP and report).
**Verify**: `pnpm typecheck && pnpm test:ci` → exit 0.

## Test plan

No new tests — this plan wires existing suites into CI. The verification is
Step 1/Step 3 running the full chain green locally.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and contains `pnpm test:ci`
- [ ] `pnpm install --frozen-lockfile` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:ci` exits 0
- [ ] `git status --short` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm test:ci` fails on a clean checkout at Step 1 — report the failing suite
  and its output verbatim; the plan's premise ("the gate is green, it just isn't
  wired") is then false.
- `pnpm install --frozen-lockfile` fails while plain install passes (stale lockfile).
- You find an existing `.github/` directory with workflows (drift since planning).
- Wiring CI appears to require changing `package.json` scripts or any `scripts/*.sh`.

## Maintenance notes

- Known follow-ups deliberately excluded: (1) a `windows-latest` job running the
  suite + `scripts/windows-dogfood.ps1` against `dist/cli.js` — the Windows
  branches (GBK decode, `.cmd` spawn, drive-case) are currently only unit-tested
  via platform faking; (2) a startup-latency regression guard (spawn
  `dist/cli.js --version` N times, assert a generous median ceiling) — the
  project's perf work has no automated protection; (3) `pnpm audit` for
  `server/app` runtime deps (the CLI itself has zero runtime deps).
- Reviewers: check the workflow does NOT add a publish/release step — the
  package is not yet published and release automation is a separate decision.
