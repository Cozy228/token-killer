# PR3 Readiness Blockers And Issues

Date: 2026-06-16 07:53 CST
Last updated: 2026-06-16 08:02 CST
Worktree: `/Users/ziyu/Workspace/token-killer-codex`
Local branch: `codex`
Base PR: [#3](https://github.com/Cozy228/token-killer/pull/3)

## Current Verdict

PR3 is **not ready to merge yet**.

The local `codex` worktree contains fixes for the issues below and has passed the local
gate, but PR3's remote branch currently points at
`84ab31bb1b0197c2c91234b7fca420a3138e10f1` and does not contain the `codex`
worktree fixes. The remote PR CI is green for that remote head, not for this local branch.
The remaining hard gate is to run the new Windows `.cmd` end-to-end regression on a
Windows runner or reachable Windows host after these fixes are pushed into a PR branch.

## Hard Blockers

### B-001: PR3 Remote Branch Does Not Contain The Local Fixes

Status: open

Evidence:
- Live PR #3 head: `token-killer-node-cli` at `84ab31bb1b0197c2c91234b7fca420a3138e10f1`.
- Local `codex` branch is ahead of that head and contains additional commits.
- Existing PR #3 CI is green, but it tested the remote head, not these local fixes.

Required closure:
- Push the `codex` fixes to a branch covered by `pull_request` CI, or apply them to
  `token-killer-node-cli`.
- Re-run the full GitHub CI matrix.
- Only then reassess PR3 merge readiness.

### B-002: Real Windows `.cmd` Percent-Roundtrip E2E Is Not Executed Yet

Status: open

Evidence:
- Added `tests/unit/executor.test.ts` coverage that runs only on `process.platform === "win32"`.
- Local macOS run skips that test by design.
- Latest remote PR #3 CI passed before these local fixes were pushed, so it did not execute
  the new `.cmd` regression.
- Live Windows host check failed: `ssh -o BatchMode=yes -o ConnectTimeout=5 cozyultra hostname`
  timed out against `192.168.31.129`.
- PR #3 body itself still says Windows real-box verification is pending for the Windows
  delivery path.

Required closure:
- Run the new test on `windows-latest` CI after the fixes are pushed, or run the same branch
  on a reachable Windows host.
- Confirm the test passes for literal args such as `%PATH%`, `100%`, `a%b`, and `c%d`.

## Fixed Locally In `codex`

### F-001: Preflight Treated Non-Zero Host Version Commands As Successful

Status: fixed locally

Risk:
- `tk status` and install-time host-version recording could accept a failing host command
  as present if it printed version-like stdout or stderr before exiting non-zero.

Fix:
- `src/shim/preflight.ts` now returns `ok: r.status === 0`.
- `probeHostVersion` now uses the exported production runner.
- Regression tests cover non-zero and zero-exit command probes.

### F-002: `debug.log` And `errors.log` Were Not Owner-Only

Status: fixed locally

Risk:
- `logFatalError` and hook debug traces can contain command context, local paths, or stack
  details. With default process umask, the log directory/file could be readable by other users.

Fix:
- `src/hook/debug.ts` now creates/repairs the log directory as `0700` and log files as `0600`.
- Regression test pre-creates loose `0755`/`0644` paths and verifies they are tightened.

### F-003: `tk status` Help Claimed It Wrote Nothing

Status: fixed locally

Risk:
- `tk status` intentionally refreshes delivery-state `lastVerified`, so help text and comments
  claiming "read-only / writes nothing" were false and made issue #26 harder to audit.

Fix:
- CLI help now says status refreshes the delivery verification timestamp and does not change
  hook or shim installation.
- Tests assert the old "Read-only - writes nothing" claim is gone.

### F-004: `docs/TELEMETRY.md` Price Table Was Incomplete

Status: fixed locally

Risk:
- Plan 004 and issue #7 required the telemetry docs to include the current shared pricing
  table, but the docs omitted `claude-fable-5` and `gpt-5.5-pro` in the narrative sections.

Fix:
- `docs/TELEMETRY.md` now lists `claude-fable-5` at `$10 / Mtok` and `gpt-5.5-pro`
  at `$30 / Mtok` in both pricing references.

### F-005: Plan Status Tracking Was Stale

Status: fixed locally

Risk:
- `plans/README.md` still showed completed PR3 plan rows as `TODO`, making the plan index
  disagree with the implemented branch and issue review state.

Fix:
- Plans 001-004 and 006-008 are now marked `DONE`.
- Plan 005 is marked `BLOCKED (real .cmd E2E awaits Windows CI)`.

## Open Metadata And Tracking Issues

### T-001: PR Body Does Not Close Implemented Issues #12, #13, And #14

Status: open metadata issue

Evidence:
- Live PR #3 `closingIssuesReferences` includes #1, #4-#11, #18-#23, #25, and #26.
- The branch also contains work for #12, #13, and #14, but PR #3 does not currently close
  those issues.

Required closure:
- If PR3 is intended to close #12-#14, update the PR body with explicit closing keywords.
- If they should remain outside PR3, document that as an intentional scope decision.

### T-002: PR Body Test Count Is Stale After Local Fixes

Status: open metadata issue

Evidence:
- PR body currently says `1832 green`.
- Local `codex` verification after merging the latest PR head reports `1773 passed | 4 skipped` in the
  product suite, plus install/docs/smoke gates.

Required closure:
- Update the PR body test section after the branch that will actually be merged has finished CI.

### T-003: Deferred Issues Remain Explicitly Out Of Scope

Status: tracked, not a PR3 blocker

Items:
- #24: Copilot-CLI-only `postToolUse.modifiedResult` result compression.
- #27: RTK parity `exclude_commands` / `transparent_prefixes`.
- Plan 010: GitHub Agent Plugin distribution spike.

Required closure:
- Keep them out of PR3 unless the PR scope is deliberately expanded.

## Verification Evidence For Local `codex`

Commands already passed in this worktree during this readiness sweep:

- `CI=true pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm exec vitest run tests/unit/shim/preflight.test.ts tests/unit/hook/debug.test.ts tests/unit/executor.test.ts tests/integration/cli.test.ts tests/unit/shim/initCli.test.ts`
- `pnpm exec vitest run tests/unit/shim/preflight.test.ts tests/unit/hook/debug.test.ts tests/unit/executor.test.ts tests/integration/cli.test.ts tests/unit/shim/initCli.test.ts tests/unit/core/dataPermissions.test.ts`
- `CI=true env -u TK_SHIM_DIR -u TK_SESSION_DEDUP TOKEN_KILLER_HOME=/tmp/token-killer-codex-ci pnpm test:ci`
- `git diff --check`
- `pnpm pack --dry-run`

Local gate result:
- Focused tests: `6 passed` files, `193 passed | 1 skipped` tests.
- Product tests: `169 passed | 1 skipped` files, `1773 passed | 4 skipped` tests.
- Install tests: `6 passed`.
- Docs validation: `35/35 passed`.
- Smoke tests: `52 passed`.
- Package dry-run: tarball contains `dist/`, `package.json`, and `README.md`.

Remote PR #3 state at record time:
- State: open.
- Mergeable: mergeable.
- Existing CI: 4/4 passing on `84ab31bb1b0197c2c91234b7fca420a3138e10f1`.
- Blocker: remote PR head does not include this `codex` worktree's fixes.
