# Plan 014: Rename Token Killer (`tk`) to Contexa (`ctx`) from the 0.3.2 baseline

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving to the next step. If a STOP
> condition occurs, stop and report instead of improvising. When done, update
> `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat fb7a2be..HEAD -- package.json README.md docs src tests scripts .github plans
> ```
>
> If any in-scope file changed since this plan was written, compare the "Current
> state" section against live code before editing. Treat mismatches as STOP conditions.

## Status

- **Priority**: P1 for 1.0.0 naming
- **Effort**: L
- **Risk**: MEDIUM (repo-wide public surface rename, but no compatibility/migration burden because 0.3.2 has no users yet)
- **Depends on**: PR #57 / `feat/0.3.2` green CI
- **Category**: product / release / migration
- **Planned at**: commit `fb7a2be`, 2026-07-08
- **Target release**: 1.0.0
- **Decision**: product name **Contexa**, CLI command **`ctx`**, MCP tool name **`context()`**

## Goal

Ship 0.3.2 / 1.0.0 as **Contexa**, a developer-local context base for agents and humans,
with **`ctx`** as the command-line entry point. The rename starts from the current
0.3.2 code line, not from `feat/1.0.0`, because that branch includes a much larger
greenfield workspace, memory/codemap implementation, and design corpus that should
not be merged as a mechanical rename.

The rename must be runtime-complete, not just text-complete: package metadata, bin
names, help text, install artifacts, shim wrappers, env vars, data directories,
tests, scripts, docs, telemetry/support wording, and release notes all need to agree.
There are no 0.3.2 users yet, so this is a **hard rename**: do not carry `tk`
aliases, legacy env vars, legacy data-dir fallbacks, or migration code.

## Non-goals

- Do not merge the greenfield `feat/1.0.0` workspace (`packages/core`,
  `packages/cli`, `.github/workflows/ctx-ci.yml`) into 0.3.2 as part of this rename.
- Do not implement new context-base features (`context()`, memory, sync, guide,
  codegraph) in this plan.
- Do not change compression behavior, handler output, telemetry payload content, or
  support routing semantics except for names/paths needed by the rename.
- Do not build compatibility shims for `tk`, `TOKEN_KILLER_HOME`, `TK_SHIM_DIR`, or
  `~/.token-killer`.

## Current state

- `package.json`:
  - `"name": "token-killer"`
  - `"version": "0.3.2"`
  - `"bin": { "tk": "./dist/cli.js" }`
- User command: `tk`
- Product name: `Token Killer`
- Data/config root: `~/.token-killer`, env override `TOKEN_KILLER_HOME`
- Shim env: `TK_SHIM_DIR`
- User docs lead with `# Token Killer (\`tk\`)`
- Existing release line includes `tk install`, `tk doctor`, `tk support`,
  `tk inspect`, `tk gain`, `tk telemetry`, `tk optimize`.
- `feat/1.0.0` already uses `ctx` vocabulary, but it is not a clean rename branch.
  It adds a workspace and broad new product scope, so use it only as naming evidence.

## Target naming contract

| Surface | 0.3.2 current | 1.0.0 target |
|---|---|---|
| Product name | Token Killer | Contexa |
| CLI primary bin | `tk` | `ctx` |
| Compatibility bin | none | none |
| Package name | `token-killer` | `contexa` |
| Data/config root | `~/.token-killer` | `~/.contexa` |
| Data/config env override | `TOKEN_KILLER_HOME` | `CONTEXA_HOME` |
| Shim env | `TK_SHIM_DIR` | `CTX_SHIM_DIR` |
| Agent guidance file | `TK.md`, optional `PONYTAIL.md` | `CTX.md`, optional guidance kept as-is unless product-copy requires rename |
| Support command | `tk support` | `ctx support` |
| MCP tool name | none in 0.3.2 | reserve `context()` wording in docs only; no implementation in this plan |

Hard-rename rules:

- `ctx` is the primary command in docs, help, install output, tests, and examples.
- `tk` is removed from package bins, help, tests, docs, install output, and smoke.
- `TOKEN_KILLER_HOME` is removed from runtime resolution; use `CONTEXA_HOME` only.
- `TK_SHIM_DIR` is removed from new runtime/install behavior; use `CTX_SHIM_DIR` only.
- `~/.token-killer` is not read or migrated; use `~/.contexa`.

## Implementation plan

### Step 1 — Rename constants and command identity

Edit the central identity surface first, then compile.

Files to inspect/edit:

- `package.json`
- `src/version.ts`
- `src/cli.ts`
- `src/core/dataDir.ts`
- `src/shim/*`
- `src/support/*`
- `src/telemetry/*`
- `src/report/*`
- `src/context/*`

Required changes:

- Rename package metadata to Contexa:
  - `"name": "contexa"`
  - keep `"version": "0.3.2"` until release finalization; bump to `1.0.0` in the release step.
  - `"bin": { "ctx": "./dist/cli.js" }`
- Introduce a small identity module if one does not already exist, e.g.
  `src/core/identity.ts`, containing:
  - `PRODUCT_NAME = "Contexa"`
  - `PRIMARY_BIN = "ctx"`
  - `HOME_ENV = "CONTEXA_HOME"`
  - `DEFAULT_HOME_DIR = ".contexa"`
  - `SHIM_ENV = "CTX_SHIM_DIR"`
- Replace duplicated string literals where they affect runtime behavior.
- Remove `tk`-specific command identity and tests.

Verification:

```bash
CI=true pnpm typecheck
CI=true pnpm exec vitest run tests/unit/parse.test.ts tests/integration/allCommands.test.ts --config vitest.config.ts
```

### Step 2 — Data directory behavior

Files to inspect/edit:

- `src/core/dataDir.ts`
- `src/core/history.ts`
- `src/core/rawStore.ts`
- `src/core/rollup.ts`
- `src/core/config.ts`
- `src/shim/doctor.ts`
- `tests/unit/core/dataDir.test.ts`
- `tests/unit/core/dataPermissions.test.ts`
- `tests/unit/shim/doctor.test.ts`

Required changes:

- `tokenKillerHome()` becomes `contexaHome()` or a neutral `productHome()`.
- Resolution order:
  1. `CONTEXA_HOME`
  2. `~/.contexa`
- `ctx doctor` reports:
  - active home path
  - whether the Contexa data/config root exists
  - whether ownership/permissions are healthy
- Do not read, copy, or mention `~/.token-killer` in runtime code; this release has
  no compatibility migration.
- Existing file permissions remain `0700` dirs and `0600` files.

Verification:

```bash
CI=true pnpm exec vitest run tests/unit/core/dataDir.test.ts tests/unit/core/dataPermissions.test.ts tests/unit/shim/doctor.test.ts --config vitest.config.ts
```

Manual acceptance:

```bash
tmp="$(mktemp -d)"
CONTEXA_HOME="$tmp/new" node dist/cli.js doctor
```

Expected: output names Contexa/ctx surfaces and reports only the Contexa home.

### Step 3 — Install, shim, hook, and guidance surfaces

Files to inspect/edit:

- `src/shim/init.ts`
- `src/shim/guidance.ts`
- `src/shim/programs.ts`
- `src/shim/hostAdapter.ts`
- `src/hook/*`
- `tests/unit/shim/*`
- `tests/unit/hook/*`
- `scripts/check-installation.sh`
- `scripts/test-install.sh`

Required changes:

- New installs write `ctx` commands and `CTX_SHIM_DIR`.
- Generated wrapper/shim names and comments say Contexa/ctx.
- Guidance file becomes `CTX.md`. If `TK.md` exists in a managed block, `ctx doctor --fix`
  can remove/replace only managed Contexa-owned content. It must not touch unmanaged text.
- No `tk install` alias exists.

Verification:

```bash
CI=true pnpm exec vitest run tests/unit/shim/initCli.test.ts tests/unit/shim/doctor.test.ts tests/unit/hook/cli.test.ts --config vitest.config.ts
CI=true pnpm test:install
```

### Step 4 — CLI help, errors, support, telemetry, reports

Files to inspect/edit:

- `src/cli.ts`
- `src/support/cli.ts`
- `src/support/report.ts`
- `src/support/send.ts`
- `src/telemetry/build.ts`
- `src/telemetry/dispatch.ts`
- `src/report/html.ts`
- `src/core/gain.ts`
- `src/inspect/cli.ts`
- tests under `tests/unit/support`, `tests/unit/telemetry`, `tests/unit/report`, `tests/unit/inspect`

Required changes:

- Every user-facing command example uses `ctx`.
- Support reports identify the product as Contexa.
- Telemetry field names that are product identifiers may remain structurally stable
  if changing them would break backend consumers; display text changes to Contexa.
- HTML report title/copy says Contexa where it previously said Token Killer or tk.
- No telemetry payload expands scope or adds user command text as part of the rename.

Verification:

```bash
CI=true pnpm exec vitest run tests/unit/support tests/unit/telemetry tests/unit/report tests/unit/inspect --config vitest.config.ts
```

### Step 5 — Repo-wide tests and fixtures

Files to inspect/edit:

- `tests/integration/*`
- `tests/unit/*`
- `tests/smoke/smoke.sh`
- `tests/helpers/*`
- fixtures under `tests/fixtures`

Required changes:

- Replace expected command names, help text, install output, paths, and env vars.
- Remove legacy expectations:
  - no `tk --version`
  - no `tk doctor`
  - no `TOKEN_KILLER_HOME` fallback
  - no `TK_SHIM_DIR` fallback
- Do not mass-rewrite historical fixture content unless tests assert it as current
  product output. Historical transcripts can remain historical.

Verification:

```bash
CI=true pnpm test:product
```

### Step 6 — Docs and release notes

Files to inspect/edit:

- `README.md`
- `docs/INSTALL.md`
- `docs/TELEMETRY.md`
- `docs/PRINCIPLES.md`
- `docs/DESIGN.md`
- `docs/WINDOWS-TESTER-GUIDE.md`
- `docs/adr/*`
- `plans/README.md`

Required changes:

- README title becomes `# Contexa (\`ctx\`)`.
- First paragraph positions the product as:
  - "Contexa keeps project context local, current, and citable for agents and humans."
  - It may still mention command-output compression as the current shipped engine.
- Install docs use `ctx`; do not add legacy `tk` upgrade notes.
- Add or update an ADR for the rename:
  - Contexa is the product.
  - `ctx` is the CLI.
  - `.contexa` / `CONTEXA_HOME` are the new data/config roots.
  - No `tk`/`TOKEN_KILLER_HOME`/`TK_SHIM_DIR` compatibility is shipped because 0.3.2
    has no users yet.
- Update release notes / PR body with the hard-rename decision.
- Keep archive/report docs historical unless they are active user-facing docs.

Verification:

```bash
CI=true bash scripts/validate-docs.sh
git diff --check
```

### Step 7 — Full release gate

Run the same gates used for the 0.3.2 PR plus rename-specific checks:

```bash
CI=true pnpm typecheck
CI=true pnpm test:product
CI=true pnpm test:install
CI=true bash scripts/check-test-presence.sh
CI=true bash scripts/validate-docs.sh
CI=true pnpm run build
CI=true bash tests/smoke/smoke.sh
node dist/cli.js --version
node dist/cli.js --help
node dist/cli.js doctor
node dist/cli.js gain --text
```

Then test package bins:

```bash
npm pack
tmp="$(mktemp -d)"
npm install -g ./contexa-1.0.0.tgz --prefix "$tmp"
"$tmp/bin/ctx" --version
```

Expected:

- `ctx` is the only package bin.
- No current user-facing surface says Token Killer.
- No current user-facing surface says `tk`.
- No new command output references `~/.token-killer`.

## STOP conditions

Stop and report if any of these occur:

- The rename requires changing compression behavior to make tests pass.
- `pnpm test:product` exposes more than rename-text failures.
- Any active docs still describe the product as Token Killer after Step 6.
- Any current runtime code still accepts `TOKEN_KILLER_HOME` or `TK_SHIM_DIR`.
- Registry/package naming requires an external account decision before `npm pack`
  can be verified locally.

## Rollback plan

This rename is mostly code/docs metadata, but user data paths are stateful:

- Before release, rollback is `git revert` of the rename commits.
- Because 0.3.2 has no users, no data migration or alias cleanup is required.
- If Contexa naming is rejected late, keep `ctx` CLI work isolated behind the
  identity constants so product text can be changed without reworking runtime paths.

## Acceptance checklist

- [ ] `ctx` is the primary command in package metadata, help, docs, tests, and smoke.
- [ ] `tk` is not present as a package bin or current command example.
- [ ] `CONTEXA_HOME` and `~/.contexa` are the only active home surfaces.
- [ ] `TOKEN_KILLER_HOME` and `~/.token-killer` appear only in historical/archive context, if at all.
- [ ] `CTX_SHIM_DIR` is the only active shim env.
- [ ] `TK_SHIM_DIR` appears only in historical/archive context, if at all.
- [ ] `ctx install`, `ctx doctor`, `ctx support`, `ctx inspect`, `ctx gain`, and
      `ctx telemetry` all work in source and built dist.
- [ ] Active docs contain no accidental Token Killer/tk references.
- [ ] Full CI-equivalent local gate passes.
