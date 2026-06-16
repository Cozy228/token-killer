# Plan 003: Restrict metrics-store file permissions to owner-only (0700/0600)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0fcd6f6..HEAD -- src/core/history.ts src/core/dedupLedger.ts src/core/governance.ts src/core/dedupStore.ts src/core/pathCache.ts src/core/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `0fcd6f6`, 2026-06-12
- **Issue**: https://github.com/Cozy228/token-killer/issues/6

## Why this matters

tk persists the **full command line of every proxied command** (which routinely
carries secrets: `Authorization: Bearer …` headers in `curl` args, connection
strings, `--token` flags) into `~/.token-killer/.../history.jsonl` and related
stores — created with default permissions (0644 files / umask dirs), readable by
any local user on a shared host. The project already recognized this class of
data as sensitive: raw output snapshots are deliberately written with
`mode: 0o700` dirs and `0o600` files (`src/core/rawStore.ts:58-64`, comment
"keeps the file off other users' eyes (H21)"). That protection is undercut while
the same secret appears verbatim in the command string stored world-readable
next door. This plan applies the rawStore precedent to every other store under
the tk data dir.

## Current state

All writes below currently pass **no `mode`**. The fix is mechanical: dirs get
`{ mode: 0o700 }`, files get `{ mode: 0o600 }`.

- `src/core/history.ts:61-71` — `appendJsonLine`:

  ```ts
  await writeFile(file, line, { encoding: "utf8", flag: "a" });
  ...
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, line, { encoding: "utf8", flag: "a" });
  ```

  (Stores `command: raw.command` — the full command line — per row, line 83.)
- `src/core/dedupLedger.ts:34-35` — `mkdir(..., { recursive: true })` +
  `writeFile(file, ..., { encoding: "utf8", flag: "a" })` (stores `norm_cmd`).
- `src/core/governance.ts:47,52` — same append pattern for `governance.jsonl`.
- `src/core/dedupStore.ts:115,126` — `mkdir(dirname(file), { recursive: true })`
  + `writeFile(tmp, JSON.stringify(store), "utf8")` then rename (stores
  `normCmd` per entry). Also the lock file created via `open(lockPath, "wx")`
  inside `acquireLock` (around lines 150-182).
- `src/core/pathCache.ts:49-52` — `mkdirSync(tokenKillerHome(), { recursive: true })`
  + `writeFileSync(tmp, JSON.stringify(cache))` then rename.
- `src/core/config.ts:138-139` — `mkdirSync(dirname(path), { recursive: true })`
  + `writeFileSync(...)`.
- The in-repo exemplar to match — `src/core/rawStore.ts:57-65`:

  ```ts
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${absolutePath}.${process.pid}.${(saveCounter += 1)}.tmp`;
  await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(tmpPath, absolutePath);
  ```

Facts the executor needs:

- `mode` on `writeFile` applies **only when the file is created**; appends to an
  existing file keep its existing mode. Existing installs therefore keep their
  old 0644 files — that is accepted; see Maintenance notes (do NOT add a chmod
  migration sweep in this plan).
- On Windows, the `mode` option is ignored by Node — no platform gating needed.
- `mkdir { recursive: true, mode }` applies the mode to directories it creates;
  pre-existing dirs are untouched. Same acceptance as above.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/core/` | all pass |
| Full product suite | `pnpm test:product` | all pass |

## Scope

**In scope** (the only files you should modify):
- `src/core/history.ts`
- `src/core/dedupLedger.ts`
- `src/core/governance.ts`
- `src/core/dedupStore.ts`
- `src/core/pathCache.ts`
- `src/core/config.ts`
- `tests/unit/core/dataPermissions.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `src/core/rawStore.ts` — already correct; it is the pattern, not a target.
- Any chmod/migration of pre-existing files in real installs — explicitly
  deferred (recorded in plans/README.md).
- `src/core/atomicWrite.ts` — check whether the in-scope files route writes
  through it; if they do, add the mode there ONLY for call sites in scope, and
  if that would change out-of-scope callers (e.g. report/HTML writers), STOP.
- HTML report output under `~/.token-killer/reports/` — user-facing artifacts,
  intentionally not secret-bearing in the same way; leave as-is. (The `reports/`
  directory + HTML file permissions are now handled separately by **plan 011** —
  the directory became sensitive once `tk support` started writing diagnostic
  bundles into it.)
- `src/telemetry/state.ts` or other telemetry files — separate surface; leave
  as-is unless tests reveal they share the exact helpers being edited.

## Git workflow

- Branch: `advisor/003-restrict-data-dir-permissions`
- Conventional commit, e.g. `fix(security): create metrics stores with owner-only permissions`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Apply modes at every write/mkdir site listed in Current state

For each file in scope: dirs → `{ mode: 0o700 }` added to the existing mkdir
options; file creations → `{ mode: 0o600 }` added to writeFile/writeFileSync/open
options. For `dedupStore.ts`'s lock file (`open(lockPath, "wx")`), pass `0o600`
as the third argument to `open`.

Keep every other option byte-identical (flags, encodings, recursive).

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `grep -n "writeFile\|mkdir\|open(" src/core/history.ts src/core/dedupLedger.ts src/core/governance.ts src/core/dedupStore.ts src/core/pathCache.ts src/core/config.ts | grep -v "0o6\|0o7\|readFile" ` → review each remaining line; every creation site should now carry a mode (read-only calls are fine).

### Step 2: Add permission tests

Create `tests/unit/core/dataPermissions.test.ts`. Model the setup on an existing
core test that writes through a temp `TOKEN_KILLER_HOME`
(`tests/unit/core/gc.test.ts` or `tests/unit/core/sessionDedup.test.ts` show the
pattern — temp dir per test, the global `tests/setup/isolateHome.ts` net is in
place).

Cases (gate each with `it.skipIf(process.platform === "win32")` since mode is
ignored there):

1. After `recordHistory(...)` creates a fresh history file:
   `statSync(file).mode & 0o777` === `0o600`, and its parent dir `& 0o777` === `0o700`.
2. After a dedup store write (`upsertEntry`), `dedup.json` mode is `0o600`.
3. After a governance append, `governance.jsonl` mode is `0o600`.
4. Appending a second row to an existing file does not throw (mode only applies
   at creation — regression guard for the append path).

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/core/dataPermissions.test.ts` → all pass (new file, ≥4 tests).

### Step 3: Full suite

**Verify**: `pnpm test:product` → all pass. (Watch specifically for tests that
assert directory modes or copy fixtures into the data dir — if any fail on mode
assertions, they are in-scope test updates; semantic failures are a STOP.)

## Test plan

Step 2's new file covers: fresh-create modes for history/dedup/governance, dir
mode, and append-to-existing regression. Exemplar: `tests/unit/core/gc.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:product` exits 0; `tests/unit/core/dataPermissions.test.ts` exists with ≥4 passing tests
- [ ] Every creation-site in the six in-scope src files carries an explicit `mode` (Step 1 grep review clean)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cited write sites don't match the excerpts (drift).
- The in-scope files route writes through a shared helper whose other callers
  are out of scope (e.g. `atomicWrite.ts` used by report writers) — report the
  call graph instead of changing shared behavior.
- Any existing test asserts group/world readability of these files (would mean
  the openness was deliberate somewhere — surface it).

## Maintenance notes

- Pre-existing installs keep 0644 files until rows rotate/recreate. A one-time
  best-effort `chmod` repair sweep (e.g. on `tk install`/`tk status`) is the
  natural follow-up — deferred to keep this change purely additive.
- Anyone adding a new store under `~/.token-killer/` should copy the rawStore
  pattern (0700 dir / 0600 file); reviewers should reject new bare `writeFile`
  creations in `src/core/`.
- Related but separate (recorded in the index): raw outputs of non-masking
  handlers still persist tool-printed secrets in content (SECURITY-02) — that is
  a content-scrubbing design question, not a permissions fix.
