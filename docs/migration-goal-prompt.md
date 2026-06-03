# RTK → tg Migration Goal Prompt

Use this prompt to drive agent sessions that close the RTK → tg parity gap. Copy everything below the `---` line into a new task.

---

## Mission

Complete the **RTK → tg migration** for the `token-guard` repo: every RTK command filter in `rtk/src/cmds/**` must have equivalent tg behavior in `src/handlers/**`, with **test parity** derived from RTK's inline `#[cfg(test)]` suites and fixtures.

**Source of truth (behavior):** `rtk/src/cmds/**/*.rs`  
**Target (implementation):** `src/handlers/**/*.ts`  
**Target (tests):** `tests/helpers/fixtureCases.ts`, `tests/unit/handlers/fixtureContent.test.ts`, migration debt gates, `tests/fixtures/**`  
**Audit baseline:** `docs/testing-and-migration-audit.md` (canonical; includes review checklist + missing test conditions + suite gaps)

**Current baseline:**
- RTK: **986 inline `#[test]`** across 47 command modules
- tg: registered handlers have fixture-backed product coverage through `fixtureCases`
- `pnpm test:product` is the green product gate for implemented behavior
- `pnpm test:migration` is currently red: missing RTK module gaps, script parity gaps, and repo infrastructure gaps
- `scripts/check-test-presence.sh` checks fixture-backed handler coverage and core test files — this is necessary but **not sufficient**

**Non-negotiable:** A module is NOT migrated if tg only has generic passthrough or a comment like "no tg X handler". Each RTK command surface needs handler + dedicated tests + fixtures where RTK has them.
**No fake green:** do not weaken assertions, move failing tests out of the suite, mark gaps as N/A, or replace real fixtures with synthetic stdout to make commands pass.

---

## Definition of Done (per RTK module)

For each `rtk/src/cmds/<area>/<module>.rs`:

1. **Handler** — tg routes matching commands to a filter in `src/handlers/` (new file or extension of existing handler). Register in `src/handlers/index.ts` and `src/router`/`matches()` logic.
2. **Filter parity** — Output preserves RTK's critical information (paths, line numbers, error codes, exit semantics) while achieving comparable compression on large noisy output.
3. **Test parity** — For every meaningful RTK `#[test]` in that module, add a real fixture-backed `fixtureCases` row or a targeted exported-parser unit test. Name tests after RTK intent when possible.
4. **Fixtures** — Port RTK fixture files from `rtk/tests/fixtures/` to `tests/fixtures/<domain>/` when RTK uses file-backed samples.
5. **Regression debt** — If current implementation cannot satisfy a real fixture yet, add it to `fixtureRegressionDebt.test.ts` instead of weakening product tests.
6. **Docs & guards** — Update `README.md` handler list; extend `scripts/check-test-presence.sh`, `scripts/validate-docs.sh`, `tests/smoke/smoke.sh` as needed.
7. **Verification** — `pnpm typecheck && pnpm test:product && pnpm test:check-presence && pnpm test:validate-docs`; run `pnpm test:migration` to confirm remaining red gates are expected. Migration may stay red until all handlers/infrastructure are implemented.

---

## RTK Test Patterns (every handler MUST cover)

Mirror RTK's per-command test categories. Each handler test file should include cases for:

| Pattern | RTK example | tg expectation |
|---------|-------------|----------------|
| Format variants | `grep -r` vs `-rn` vs `rg --null` | Separate tests per output format |
| Empty output | no matches / clean tree | No throw; sensible message |
| stderr-only | regex parse error | Error text preserved |
| Clean/success | `nothing to commit`, `0 errors` | No inflation vs raw |
| Large → savings | noisy build log | `savingsPct >= 60–80%`, critical content kept |
| Small passthrough | 2–3 branch names | Output not larger than raw + small overhead |
| Content preservation | file:line:code, TS error codes | Assert critical strings survive |
| Malformed input | unparseable grep lines | Skip gracefully, no crash |

Do not use synthetic stdout-only handler tests. Product handler behavior must be fixture-backed; parser-only units are allowed only for exported pure parser contracts.

---

## Work Method (test-first from RTK)

For each module, follow this loop:

```
1. Read rtk/src/cmds/<module>.rs
   - Identify filter function(s) and all #[test] blocks
   - List input stdout/stderr samples and expected filtered output

2. Read existing tg handler + tests (if any)
   - Note gaps vs RTK test list

3. Write/extend tests FIRST
   - Port RTK test inputs as real fixtures where agent-visible output is involved
   - Use tests/helpers/fixtureCases.ts critical/forbidden assertions
   - Use fixtureRegressionDebt.test.ts for real red tests that implementation cannot pass yet

4. Implement or fix handler until tests pass

5. Update router.test.ts, smoke.sh, README, check-test-presence.sh as needed

6. Mark module done in `docs/testing-and-migration-audit.md` §11 audit table
```

When RTK merges multiple commands into one tg handler (e.g. ls + find → listLike), **all** RTK inline tests from both modules must be represented — either in the shared test file with describe blocks per command, or split if handlers diverge.

---

## Priority Phases

### Phase -1 — Fix current fixture-backed red tests first

Start implementation here before adding new command surfaces. These failures already have real fixture-backed tests, so do **not** add more tests unless the fix reveals a new distinct behavior gap.

| Failing gate | Current failure | Implementation target |
|--------------|-----------------|-----------------------|
| `fixtureContent.test.ts` | `rg --json` is rewritten into a `Search:` summary and drops JSON fields | Respect explicit machine-readable / verbose format flags such as `--json`; passthrough raw or preserve JSON lines |
| `fixtureRegressionDebt.test.ts` | `git status --short` loses modified/untracked paths | Parse short status and preserve changed path names |
| `fixtureRegressionDebt.test.ts` | `git status --porcelain -b` loses branch and paths | Parse porcelain branch header and preserve changed path names |
| `fixtureRegressionDebt.test.ts` | `git diff --stat` becomes `Files changed: 0, +0 -0` | Detect stat output and preserve file count / insertion / deletion totals |

Done for Phase -1 when:

```bash
pnpm typecheck
pnpm test:product
pnpm exec vitest run --config vitest.migration.config.ts tests/unit/handlers/fixtureRegressionDebt.test.ts
pnpm test:check-presence
pnpm test:validate-docs
```

`pnpm test:migration` may still be red after Phase -1 because missing RTK handlers, scripts, and repo infrastructure are separate work.

### Phase 0 — Deepen existing handlers (highest ROI, no new surface)

These have handlers but severe test/behavior gaps:

| RTK module | tg target | RTK tests | tg tests | Action |
|------------|-----------|-----------|----------|--------|
| `system/read.rs` | `readLike.ts` | 8 | 1 | stdin, tail, multi-file, binary, locale |
| `system/grep_cmd.rs` | `searchLike.ts` | 23 | fixture-backed subset | explicit `--json`, `-c`, `-l`, `-L`, `-o`, BRE `\|` escape, grep -r without line numbers |
| `system/tree.rs` | listLike or new tree filter | 6 | 0 | tree summary removal, structure preservation |
| `git/git.rs` | git/*.ts | 75 | fixture-backed subset | add, commit, push, pull, fetch, stash, worktree |
| `git/diff_cmd.rs` | `diff.ts` | 19 | 5 | hunk limits, stat passthrough, full header context |
| `jvm/gradlew_cmd.rs` | `gradle.ts` | 56 | fixture-backed subset | RTK gradlew fixtures are ported; deepen build/lint/connected behavior |
| `system/ls.rs` + `find_cmd.rs` | `listLike.ts` | 58 | 7 | symlink, device files, spaces in paths, noise dirs |

### Phase 1 — Missing handlers with RTK fixtures ready

| Domain | RTK modules | Fixtures |
|--------|-------------|----------|
| .NET | `dotnet_cmd.rs`, `binlog.rs`, `dotnet_trx.rs`, `dotnet_format_report.rs` | add fixtures after handlers exist |
| Git hosting CLIs | `gt_cmd.rs` | glab corpus already ported; gt still missing |
| Go | `go_cmd.rs`, `golangci_cmd.rs` | golangci fixture already ported; handlers missing |

### Phase 2 — Missing handlers (no fixtures yet, port from RTK inline tests)

**Cloud:** `aws_cmd.rs` (82 tests), `curl_cmd.rs`, `psql_cmd.rs`, `wget_cmd.rs`, `container.rs`  
**Rust:** `cargo_cmd.rs`, `runner.rs`  
**Ruby:** `rake_cmd.rs`, `rspec_cmd.rs`, `rubocop_cmd.rs`  
**JS:** `prettier_cmd.rs`, `next_cmd.rs`, `playwright_cmd.rs`, `prisma_cmd.rs`  
**System:** `log_cmd.rs`, `json_cmd.rs`, `env_cmd.rs`, `wc_cmd.rs`, `format_cmd.rs`, `pipe_cmd.rs`, `local_llm.rs`

### Phase 3 — Infrastructure

- Port `rtk/scripts/benchmark/` TypeScript suite → `scripts/benchmark/`
- Add `.github/workflows/ci.yml` running `pnpm test:ci`
- Port or adapt `rtk/.claude/rules/cli-testing.md` for tg conventions

**Out of scope (unless product scope changes):** `rtk-economics.sh`, `test-tracking.sh`, `test-aristote.sh`, openclaw, hooks.

---

## tg Conventions (match existing code)

- Handlers implement `CommandHandler`: `name`, `matches()`, `execute()`, `filter()`
- Use `makeFilteredResult()` from `src/handlers/base.ts`
- Use `executeCommand()` for default execution
- Test layout: product handler behavior lives in `tests/helpers/fixtureCases.ts`; migration-only failures live in gate files under `tests/unit/handlers/`
- Keep files **under 500 lines** — split handlers if needed
- English only in code, comments, tests, commit messages
- Minimize scope: one RTK module (or coherent group) per PR/session
- Do not remove tg-only handlers (`maven`, `javac`, `generic`) — keep their tests

---

## Reference: RTK module → tg mapping

```
IMPLEMENTED (deepen tests):
  ls, find, grep, read          → common/{listLike,searchLike,readLike}
  git status/diff/log/show/branch → git/*
  pytest/ruff/mypy/pip          → python/*
  npm/pnpm test, eslint, tsc    → js/*
  gradlew                       → java/gradle

NOT IMPLEMENTED (need handler + tests):
  tree (dedicated), log, json, env, wc, format, pipe, local_llm
  git: gt
  prettier, next, playwright, prisma
  dotnet (4 modules), aws, curl, psql, wget, docker/kubectl
  go, golangci, cargo, ruby (3)

TG-ONLY (keep):
  maven, javac, generic
```

Full inventory: see `docs/testing-and-migration-audit.md` §6 and §8.

---

## Session Task Template

When starting a focused session, specify:

```
Migrate RTK module: rtk/src/cmds/<path>/<module>.rs

Deliverables:
- [ ] Handler: src/handlers/...
- [ ] Tests: tests/helpers/fixtureCases.ts or fixtureRegressionDebt.test.ts (N cases mapped from RTK #[test] list)
- [ ] Fixtures: tests/fixtures/... (if applicable)
- [ ] router.test.ts + smoke.sh + README + check-test-presence.sh updates

RTK #[test] functions to port (paste from rg 'fn test_' rtk/src/cmds/...):
  - test_...
  - test_...

Done when: pnpm vitest run <test-file> && check-test-presence && validate-docs pass
```

---

## Example: first session prompt (copy-paste ready)

```
Migrate RTK → tg Phase 0: searchLike grep parity.

Read rtk/src/cmds/system/grep_cmd.rs — port all #[test] cases related to:
- format flags: -c, -l, -L, -o, --null, --json
- BRE alternation \| → |
- grep -r (file:content, no line numbers)
- malformed lines, empty content, windows paths, colons in content

Read current src/handlers/common/searchLike.ts and `tests/helpers/fixtureCases.ts`.
Existing product handler coverage is fixture-backed; add real fixtures or regression-debt rows first, then make implementation match RTK behavior.

Also update fixtureRegressionDebt if a real RTK fixture exposes a current implementation gap.

Verify: pnpm typecheck && pnpm test:product && pnpm test:check-presence && pnpm test:validate-docs
```

---

## Success Metrics (repo-wide)

Migration is complete when:

- [ ] **0** RTK command modules lack tg handler + fixture-backed coverage
- [ ] Every RTK `#[test]` in `rtk/src/cmds/**` has a documented tg equivalent (test name or comment linking `RTK: test_*`)
- [ ] All RTK fixtures under `rtk/tests/fixtures/` ported or explicitly N/A with handler present
- [ ] `docs/testing-and-migration-audit.md` §11 shows ✅ for all audit rows
- [ ] `pnpm test:ci` passes in CI

**Current verdict:** NOT COMPLETE — 29 RTK modules without handler/test, plus current fixture-backed red implementation gaps; mapped modules cover a fraction of 986 RTK inline tests.
