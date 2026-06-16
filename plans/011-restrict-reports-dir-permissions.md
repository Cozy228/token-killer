# Plan 011: Create the `reports/` directory and HTML reports owner-only (0700/0600)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 22579d2..HEAD -- src/report/open.ts`
> If the in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sibling to plan 003 — disjoint files)
- **Category**: security
- **Planned at**: commit `22579d2`, 2026-06-15
- **Issue**: https://github.com/Cozy228/token-killer/issues/13

## Why this matters

tk writes generated reports to `~/.token-killer/reports/`. **Two writers now
share that directory**: `src/report/open.ts` (the HTML `tk gain` / `tk inspect`
reports) and `src/support/report.ts` (the `tk support` diagnostic bundle, which
contains the user's command lines, command output, tk logs, and host config).
`open.ts` creates the directory with `mkdirSync(dir, { recursive: true })` and
writes each HTML file with `writeFileSync(path, …)` — **both with no `mode`** — so
on a multi-user host the directory lands at `0755` (world-listable) and every
HTML report at `0644` (world-readable). The support bundle file itself is
correctly `0600`, but when `open.ts` created the directory first (any prior
`tk gain`/`tk inspect` run), the `0755` directory lets other local users *list*
it — revealing that a `support-<timestamp>.md` exists and when — and *read* the
world-readable HTML reports (project names, per-command savings, handler
breakdowns).

The project already treats this data class as owner-only: `src/core/rawStore.ts`
and the just-shipped `src/support/report.ts:111-119` use `0700` dirs / `0600`
files. This plan brings `open.ts` to the same discipline and retroactively
tightens a `reports/` directory a previous tk version created `0755`.

(Note: this is the exact gap plan 003 deliberately left out of scope — "HTML
report output … intentionally not secret-bearing in the same way." That call
predated `tk support` writing sensitive bundles into the same directory; this
plan closes it at the directory level, which protects both writers.)

## Current state

- `src/report/open.ts:12-14` — `reportsDir()` returns `join(tokenKillerHome(), "reports")`.
- `src/report/open.ts:6` — `import { mkdirSync, writeFileSync } from "node:fs";` (add `chmodSync`).
- `src/report/open.ts:20-26` — `writeReport`:

  ```ts
  export function writeReport(doc: ReportDoc, nowMs: number): string {
    const dir = reportsDir();
    mkdirSync(dir, { recursive: true });             // <-- no mode → 0755 dir
    const path = join(dir, `${doc.kind}-${stamp(nowMs)}.html`);
    writeFileSync(path, renderReportHtml(doc));       // <-- no mode → 0644 file
    return path;
  }
  ```

- In-repo exemplar to match — `src/support/report.ts:111-119` (same directory, just shipped):

  ```ts
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  ...
  writeFileSync(path, markdown, { mode: 0o600 });
  ```

- Older precedent (cited by plan 003): `src/core/rawStore.ts` — `0700` dir / `0600` file.

Facts the executor needs:

- `mode` on `mkdirSync({ recursive: true, mode })` and `writeFileSync({ mode })`
  applies **only when the dir/file is created**. A directory that already exists
  is **not** re-chmod'd by `mkdirSync` (documented Node behavior). That is why
  this plan adds an explicit `chmodSync(dir, 0o700)` after the mkdir — to tighten
  a `reports/` dir a prior tk version created `0755`.
- Pre-existing `0644` HTML *files* are left as-is (same acceptance as plan 003);
  new files get `0600`, and the `0700` dir makes existing ones unreachable by
  other users anyway.
- On Windows, Node ignores POSIX mode/chmod bits — no platform gating needed; the
  calls are harmless no-ops there.
- `chmodSync` on a directory the current user owns only clears group/world bits
  and cannot fail for a permission reason on an owned dir. `writeReport` already
  throws on write failure, so a plain `chmodSync` (no try/catch) is consistent
  with the function's existing error behavior.

## Commands you will need

| Purpose            | Command                                                           | Expected on success |
|--------------------|------------------------------------------------------------------|---------------------|
| Install            | `pnpm install`                                                   | exit 0              |
| Typecheck          | `pnpm typecheck`                                                 | exit 0, no errors   |
| Targeted tests     | `pnpm vitest run --config vitest.config.ts tests/unit/report/`  | all pass            |
| Full product suite | `pnpm test:product`                                             | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/report/open.ts`
- `tests/unit/report/openPermissions.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `src/support/report.ts` — already creates the dir `0700` / file `0600` on
  first-create; the `chmodSync` added here also tightens the shared dir when
  `gain`/`inspect` created it first. The only residual (a user who runs
  `tk support` first on a legacy `0755` dir, before any `tk gain`) leaks the
  bundle *filename* only — its content stays `0600`. Folding the same chmod into
  `support/report.ts:115` is a future one-liner; do NOT do it in this plan.
- The six core stores (`history.ts`/`dedupLedger.ts`/`governance.ts`/
  `dedupStore.ts`/`pathCache.ts`/`config.ts`) — plan 003's territory; disjoint.
- Any chmod migration of pre-existing `0644` HTML files — accepted as-is.
- `openInBrowser` (the spawn path) — unrelated to permissions.

## Git workflow

- Branch: `advisor/010-restrict-reports-dir-permissions`
- Conventional commit: `fix(security): create reports dir + HTML reports owner-only`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add modes + a retroactive chmod in `writeReport`

1. Add `chmodSync` to the `node:fs` import on `src/report/open.ts:6`.
2. In `writeReport` (lines 20-26):
   - `mkdirSync(dir, { recursive: true })` → `mkdirSync(dir, { recursive: true, mode: 0o700 })`
   - immediately after the mkdir, add `chmodSync(dir, 0o700);` (tightens a
     pre-existing `0755` dir — the mkdir mode is a no-op on an existing dir)
   - `writeFileSync(path, renderReportHtml(doc))` → `writeFileSync(path, renderReportHtml(doc), { mode: 0o600 })`

   Keep every other option byte-identical.

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `grep -n "mkdirSync\|chmodSync\|writeFileSync" src/report/open.ts` →
the mkdir carries `mode: 0o700`, a `chmodSync(dir, 0o700)` line follows it, and
the writeFile carries `mode: 0o600`.

### Step 2: Add permission tests

Create `tests/unit/report/openPermissions.test.ts`. Model the per-test temp
`TOKEN_KILLER_HOME` setup on `tests/unit/core/gc.test.ts` (the global
`tests/setup/isolateHome.ts` net is in place), and how to construct a `ReportDoc`
on `tests/unit/report/html.test.ts`.

Cases (gate each with `it.skipIf(process.platform === "win32")` since POSIX modes
are ignored on Windows):

1. After `writeReport(doc, now)`: `statSync(path).mode & 0o777` === `0o600`, and
   its parent dir `& 0o777` === `0o700`.
2. **Retroactive tighten (regression guard for the mkdir no-op trap)**: create
   the reports dir loose first (`mkdirSync(reportsDir, { recursive: true })` then
   `chmodSync(reportsDir, 0o755)`), then call `writeReport`, then assert the dir
   `& 0o777` === `0o700`.
3. A second `writeReport` into the now-`0700` dir does not throw.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/report/openPermissions.test.ts`
→ all pass (new file, ≥3 tests).

### Step 3: Full suite

**Verify**: `pnpm test:product` → all pass. (Watch for any existing test that
asserts world-readable report files/dirs — if one exists, the openness was
deliberate somewhere: STOP and report rather than changing the test.)

## Test plan

Step 2's new file covers: fresh-create file+dir modes, retroactive tightening of
a pre-existing loose dir, and the append/second-write regression. Exemplars:
`tests/unit/core/gc.test.ts` (temp home) + `tests/unit/report/html.test.ts`
(building a `ReportDoc`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:product` exits 0; `tests/unit/report/openPermissions.test.ts` exists with ≥3 passing tests
- [ ] `writeReport` creates the dir `0700` (+ explicit `chmodSync`) and files `0600` (Step 1 grep clean)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/report/open.ts` no longer matches the "Current state" excerpt (drift).
- Any existing test asserts that report files or the reports dir are
  group/world-readable (the openness was deliberate somewhere — surface it).
- The build cannot resolve `chmodSync` from `node:fs` (it can — but if it
  complains, report rather than importing from elsewhere).

## Maintenance notes

- `src/support/report.ts` shares this directory and already does `0700`/`0600` on
  first-create; the residual filename-only leak (support-first on a legacy `0755`
  dir) is closed by folding the same `chmodSync` into `support/report.ts:115` — a
  one-liner for a future PR.
- Pre-existing `0644` HTML files stay until overwritten; the `0700` dir makes them
  unreachable by others meanwhile. A one-time chmod sweep on `tk status` /
  `tk install` is the natural migration (pairs with plan 003's identical
  follow-up).
- Reviewers: reject any new bare `writeFile`/`mkdir` under `~/.token-killer/` —
  copy the `rawStore.ts` / `support/report.ts` pattern (`0700` dir / `0600` file).
