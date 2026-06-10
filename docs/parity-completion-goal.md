# Goal: Finish RTK command-proxy parity (Track A)

Drive agent sessions that turn the **migration parity track green** by implementing the
remaining RTK command filters that `token-killer` still lacks. This is the near-term,
test-pinned work: every item below already has a red test under
`tests/unit/handlers/` (or `tests/unit/rtkScriptParity.test.ts`) that defines the
exact expected behavior.

- **Behavior source of truth:** `rtk/src/cmds/**/*.rs`
- **Acceptance source of truth:** the failing tests in `tests/unit/handlers/*.test.ts`
  (their `critical` / `forbidden` / `maxOutputChars` / `exact` assertions are the contract)
- **Implementation target:** `src/handlers/**/*.ts`, registered in `src/handlers/index.ts`
- **Companion docs:** `docs/migration-goal-prompt.md` (full migration method),
  `docs/align-rtk-divergences.md` (intentional non-alignments)

## Scope decision (2026-06-05)

**Excluded ecosystems — DO NOT implement, remove from the parity suite instead.**
Go, Rust, and Ruby are out of product scope. Quarantine their parity tests so
`pnpm test:migration` can go green without them:

| Test file | Ecosystem | Action |
|-----------|-----------|--------|
| `tests/unit/handlers/rtkGoBehavior.test.ts` | Go | delete or move under a `tests/out-of-scope/` dir excluded from `vitest.migration.config.ts` |
| `tests/unit/handlers/rtkGolangciBehavior.test.ts` | Go | same |
| `tests/unit/handlers/rtkCargoBehavior.test.ts` | Rust | same |
| `tests/unit/handlers/rtkRakeBehavior.test.ts` | Ruby | same |
| `tests/unit/handlers/rtkRspecBehavior.test.ts` | Ruby | same |
| `tests/unit/handlers/rtkRubocopBehavior.test.ts` | Ruby | same |
| `rtkScriptParity` → `ruby smoke script` case | Ruby | drop the `scripts/test-ruby.sh` row from `migratedScripts` |

Record this exclusion in `docs/align-rtk-divergences.md` (new section "Out-of-scope
ecosystems") so a future "complete RTK parity" pass does not re-add them by mistake.
Do **not** weaken or fake-pass the kept tests below to compensate.

## In-scope work (each maps to a red test)

### Phase 1 — Generic wrapper filters (highest ROI, no ecosystem dependency)

These are RTK meta-commands: `tk <wrapper> <real command>` runs the wrapped command
and applies a cross-cutting filter. New handlers in `src/handlers/system/` (or
`src/handlers/generic/`), registered before `genericHandler`.

| Wrapper | Red test | Expected behavior (from test) |
|---------|----------|-------------------------------|
| `err <cmd>` | `rtkErrBehavior.test.ts` | Keep `warning:` / `error:` blocks and their `file:line` follow-ups; drop `info:` noise. `maxOutputChars 120`. RTK: error-block extraction. |
| `summary <cmd>` | `rtkSummaryBehavior.test.ts` | Emit `[FAIL] Command: <cmd>` + `Test Results:` + `[ok] N passed` / `[FAIL] N failed` + failing file lines; drop `Snapshots:` noise. `maxOutputChars 260`. RTK: `rtk/src/cmds/system/summary.rs`. |
| `test <cmd>` | `rtkTestBehavior.test.ts` | Generic test extraction: `[FAIL] FAILURES:` + failing test names + `SUMMARY:` + `test result:` line; drop per-test `... ok` chatter. `maxOutputChars 220`. |
| `deps` | `rtkDepsBehavior.test.ts` | Summarize `package.json` by ecosystem: `Node.js (package.json):`, `Dependencies (N):`, `name (version)`, `Dev (N):`; drop raw `"scripts"` / quoted JSON keys. `maxOutputChars 220`. RTK: `rtk/src/cmds/system/deps.rs`. |
| `smart <file>` | `rtkSmartBehavior.test.ts` | Local-LLM summary passthrough: keep the `Summary:` payload only, strip `System prompt:` boilerplate. Output must `exact`-equal the summary text. RTK: `rtk/src/cmds/system/local_llm.rs`. |
| `npx <tool> …` | `rtkNpxBehavior.test.ts` | Route `npx tsc` through the existing TypeScript filter → `TypeScript: N errors in M files` + `TSxxxx` codes; drop `Found N errors` line. `maxOutputChars 260`. Generalize: `npx <tool>` re-dispatches to the handler that matches `<tool>`. |

### Phase 2 — .NET handlers

New `src/handlers/dotnet/` subsystem (mirror the `cloud/` / `java/` layout).
RTK sources: `rtk/src/cmds/dotnet/{dotnet_cmd,dotnet_trx,binlog,dotnet_format_report}.rs`.

| Command | Red test | Expected behavior |
|---------|----------|-------------------|
| `dotnet test` | `rtkDotnetBehavior.test.ts` | Keep test-failure summary, strip restore/build boilerplate. `maxOutputChars 180`. |
| `dotnet test --logger trx` | `rtkDotnetTrxBehavior.test.ts` | Parse TRX XML → failed test names + messages. `maxOutputChars 160`. |
| `dotnet msbuild -bl` | `rtkDotnetBinlogBehavior.test.ts` | Extract build errors, **redact sensitive env values**. `maxOutputChars 180`. |
| `dotnet format --verify-no-changes` | `rtkDotnetFormatBehavior.test.ts` | Summarize files with formatting changes from report JSON. `maxOutputChars 120`. |

### Phase 3 — Infrastructure parity (`rtkScriptParity.test.ts`, ecosystem-neutral cases only)

Port the remaining RTK scripts the parity test still expects (skip the Ruby smoke case):

| Case | RTK path | tk path |
|------|----------|---------|
| benchmark run entrypoint | `rtk/scripts/benchmark/run.ts` | `scripts/benchmark/run.ts` |
| benchmark rebuild entrypoint | `rtk/scripts/benchmark/rebuild.ts` | `scripts/benchmark/rebuild.ts` |
| benchmark cleanup entrypoint | `rtk/scripts/benchmark/cleanup.ts` | `scripts/benchmark/cleanup.ts` |
| benchmark sessions runner | `rtk/scripts/benchmark-sessions/lib/runner.py` | `scripts/benchmark-sessions/lib/runner.py` |

Adapt to tk conventions (pnpm, `tk` binary, `~/.token-killer` data dir). Do not copy
RTK-economics / aristote / openclaw scripts (out of scope per `migration-goal-prompt.md`).

## Definition of Done (per item)

1. **Handler** implements `CommandHandler` (`name`, `matches()`, `execute()`, `filter()`),
   uses `makeFilteredResult()` from `src/handlers/base.ts`, registered in
   `src/handlers/index.ts` before `genericHandler`. File under 500 lines.
2. **Red test passes** unchanged — never edit the `critical`/`forbidden`/`maxOutputChars`
   contract to force green.
3. **Quality gate honored** — if the filter cannot represent the input without omission,
   it passes through raw rather than emitting `+N more` / `Hidden` markers (DESIGN §1.6).
4. **Fixtures** — port RTK file-backed samples to `tests/fixtures/<domain>/` where RTK uses them.
5. **Docs/guards** — update `README.md` handler list and `scripts/check-test-presence.sh`
   so the new handler is covered.

## Acceptance (Track A complete)

1. Excluded ecosystems quarantined and recorded in `docs/align-rtk-divergences.md`.
2. All in-scope red tests (Phases 1–3) pass.
3. `pnpm typecheck && pnpm test:product && pnpm test:migration` all green.
4. `pnpm test:check-presence && pnpm test:validate-docs && pnpm test:smoke` pass.
5. Short report per item: handler added, before/after test status, any divergence recorded.

## Constraints

- pnpm only. English in code, comments, tests, commit messages.
- One coherent item (or wrapper group) per session/commit. Surgical changes.
- Never drop key diagnostics for compression: error codes, `file:line`, failing test
  names, counts.
- Do not remove tk-only handlers (`maven`, `javac`, `generic`) or their tests.
