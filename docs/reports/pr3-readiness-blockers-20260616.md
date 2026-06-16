# PR3 Readiness Blockers And Issues

Date: 2026-06-16 07:53 CST
Last updated: 2026-06-16 08:24 CST
Worktree: `/Users/ziyu/Workspace/token-killer-codex`
Local branch: `codex`
Base PR: [#3](https://github.com/Cozy228/token-killer/pull/3)

## Current Verdict

This report records the blockers found during the PR3 readiness sweep and the closure
evidence required for each blocker.

At this revision, the PR3 readiness sweep includes the follow-up findings from issues #30
and #31 plus a Windows CI test-gate fix discovered after pushing `9cf55be`. Final merge
readiness still depends on pushing this revision to PR3 and getting the full GitHub CI
matrix green on the exact PR head that contains it.

## Hard Blockers

### B-001: PR3 Remote Branch Must Contain The Latest Local Fixes

Status: open until this revision is pushed

Evidence:

- Earlier local `codex` fixes were pushed to PR3's `token-killer-node-cli` branch.
- New local fixes now cover #30, #31, and the Windows CI native-control test failure.

Required closure:

- Push this revision to PR3's `token-killer-node-cli` branch.
- Re-run the full GitHub CI matrix on the pushed PR3 head before merge.

### B-002: Real Windows Batch Percent-Roundtrip E2E Must Pass On CI

Status: fixed locally, waiting for GitHub Windows CI

Evidence:

- Added `tests/unit/executor.test.ts` coverage that runs only on `process.platform === "win32"`.
- The Windows-only test now includes:
  - a no-tk `cmd.exe` control proving `%VAR%` expansion occurs natively;
  - tk `executeCommand` round-trip through real `.cmd` and `.bat` targets for `%PATH%`,
    `100%`, `a%b`, and `c%d`;
  - a percent-dense long-line case that must fail closed with the `8191-char limit` error.
- GitHub Windows CI on head `9cf55be` failed because the native no-tk control used
  `cmd.exe /d /s /c`, whose quote-stripping behavior made the control command itself
  return status 1 before testing tk behavior.
- The local fix now invokes the control as `cmd.exe /d /c call "<script>" "%TK_PERCENT_E2E%"`.
- Live Windows host check failed: `ssh -o BatchMode=yes -o ConnectTimeout=5 cozyultra hostname`
  timed out against `192.168.31.129`, so GitHub-hosted Windows CI is the authoritative
  Windows execution gate for this PR.

Required closure:

- Confirm `windows-latest` Node 20 and Node 22 CI pass on the PR3 head containing the
  fixed Windows-only test above.

## Fixed Locally In `codex`

### F-001: Preflight Treated Non-Zero Host Version Commands As Successful

Status: fixed

Risk:

- `tk status` and install-time host-version recording could accept a failing host command
  as present if it printed version-like stdout or stderr before exiting non-zero.

Fix:

- `src/shim/preflight.ts` now returns `ok: r.status === 0`.
- `probeHostVersion` now uses the exported production runner.
- Regression tests cover non-zero and zero-exit command probes.

### F-002: `debug.log` And `errors.log` Were Not Owner-Only

Status: fixed

Risk:

- `logFatalError` and hook debug traces can contain command context, local paths, or stack
  details. With default process umask, the log directory/file could be readable by other users.

Fix:

- `src/hook/debug.ts` now creates/repairs the log directory as `0700` and log files as `0600`.
- Regression test pre-creates loose `0755`/`0644` paths and verifies they are tightened.

### F-003: `tk status` Help Claimed It Wrote Nothing

Status: fixed

Risk:

- `tk status` intentionally refreshes delivery-state `lastVerified`, so help text and comments
  claiming "read-only / writes nothing" were false and made issue #26 harder to audit.

Fix:

- CLI help now says status refreshes the delivery verification timestamp and does not change
  hook or shim installation.
- Tests assert the old "Read-only - writes nothing" claim is gone.

### F-004: `docs/TELEMETRY.md` Price Table Was Incomplete

Status: fixed

Risk:

- Plan 004 and issue #7 required the telemetry docs to include the current shared pricing
  table, but the docs omitted `claude-fable-5` and `gpt-5.5-pro` in the narrative sections.

Fix:

- `docs/TELEMETRY.md` now lists `claude-fable-5` at `$10 / Mtok` and `gpt-5.5-pro`
  at `$30 / Mtok` in both pricing references.

### F-005: Plan Status Tracking Was Stale

Status: fixed

Risk:

- `plans/README.md` still showed completed PR3 plan rows as `TODO`, making the plan index
  disagree with the implemented branch and issue review state.

Fix:

- Plans 001-004 and 006-008 are now marked `DONE`.
- Plan 005 is marked `DONE`.

### F-006: `DESIGN.md` Current-Surface Prose Still Cited Removed Commands (#30)

Status: fixed

Risk:

- The top runnable examples were current, but deeper design-rationale prose still pointed
  readers at `tk init`, `tk optimize --vscode-settings`, and removed inspect flags.

Fix:

- `docs/DESIGN.md` now uses `tk install` for the current Token Killer delivery surface.
- The VS Code settings section now states that settings flow through normal
  `tk optimize` / `--apply` / `--restore`.
- The inspect status row explicitly records that `--repo-context` and `--telemetry-export`
  CLI flags have been removed.
- Historical RTK examples and explicit "`tk init` was renamed" notes remain as history.

### F-007: Telemetry And Delivery State Could First-Create The Data Dir Root Loose (#31)

Status: fixed

Risk:

- `src/telemetry/state.ts` first-created `$TOKEN_KILLER_HOME` with a bare recursive mkdir.
  Under the default `022` umask this could make the data-dir root `0755`; later `mode: 0o700`
  mkdirs are no-ops against an existing directory.
- `delivery-state.json`, `path-cache.json`, and `config.jsonc` are also root-level state
  writers, so they should use the same data-dir root gate.

Fix:

- Added `ensureTokenKillerHome()` in `src/core/dataDir.ts`; it creates the root `0700` and
  tightens existing roots with `chmod`.
- Routed telemetry state, delivery state, path cache writes, and config template writes
  through that helper.
- Telemetry state files are now written `0600` and tightened on rewrite.
- Regression tests assert fresh first-writer roots are `0700` and root-level state files are
  `0600`.

## Open Metadata And Tracking Issues

### T-001: PR Body Does Not Close Implemented Issues #12, #13, And #14

Status: resolved

Evidence:

- Live PR #3 `closingIssuesReferences` now includes #12, #13, and #14 in addition to the
  original issue set.

Required closure:

- Keep the explicit closing keywords in the PR body until merge.

### T-002: PR Body Test Count Is Stale After Local Fixes

Status: needs refresh after this revision is pushed

Evidence:

- PR body no longer uses the stale `1832 green` claim.
- Local `codex` verification after this revision reports `1774 passed | 4 skipped`
  in the product suite, plus install/docs/smoke gates.

Required closure:

- Keep the PR body test section tied to the actual PR3 head and CI result.

### T-004: PR Body Must Close Follow-Up Issues #30 And #31

Status: open until PR body refresh

Evidence:

- #30 and #31 were opened after the previous PR body refresh.
- This revision fixes both issue bodies' actionable items, including the minor `.bat`
  Windows batch coverage note from #31.

Required closure:

- Add explicit closing keywords for #30 and #31 to the PR body before final merge.

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
- `pnpm exec vitest run tests/unit/telemetry/state.test.ts tests/unit/shim/capability.test.ts tests/unit/executor.test.ts`
- `CI=true env -u TK_SHIM_DIR -u TK_SESSION_DEDUP TOKEN_KILLER_HOME=/tmp/token-killer-codex-ci pnpm test:ci`
- `git diff --check`
- `pnpm pack --dry-run`

Local gate result:

- Focused tests for the latest fixes: `3 passed` files, `82 passed | 1 skipped` tests.
- Product tests: `169 passed | 1 skipped` files, `1774 passed | 4 skipped` tests.
- Install tests: `6 passed`.
- Docs validation: `35/35 passed`.
- Smoke tests: `52 passed`.
- Package dry-run: tarball contains `dist/`, `package.json`, and `README.md`.

Remote PR #3 state at record time:

- State: open.
- Mergeable: mergeable.
- Existing CI: Ubuntu Node 20/22 passed on `9cf55be`; Windows Node 20/22 failed on the
  now-fixed native control test.
- Blocker: remote PR head does not include this revision's #30/#31 and Windows CI fixes.
