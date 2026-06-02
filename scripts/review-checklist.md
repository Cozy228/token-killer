# RTK → tg Test Migration Completeness Review

## Objective

Verify that RTK's test infrastructure has been **completely** ported to tg, module by module, file by file. Flag every gap.

Scope: migration **completeness** (handler + test + fixture + script existence). Does **not** evaluate whether tests currently pass.

Last audited: 2026-06-02

---

## 1. RTK Source Module → tg Handler Coverage

For each RTK command module, check if tg has the handler AND tests:

```
RTK file                                  tg handler                         tg test
─────────────────────────────────────────────────────────────────────────────────────────
src/cmds/system/ls.rs                     src/handlers/common/listLike.ts    tests/unit/handlers/common/listLike.test.ts
src/cmds/system/tree.rs                   listLike (routed, no tree filter)  ─ (no tree-specific tests)
src/cmds/system/read.rs                   src/handlers/common/readLike.ts    tests/unit/handlers/common/readLike.test.ts
src/cmds/system/find_cmd.rs               src/handlers/common/listLike.ts    tests/unit/handlers/common/listLike.test.ts
src/cmds/system/grep_cmd.rs               src/handlers/common/searchLike.ts  tests/unit/handlers/common/searchLike.test.ts
src/cmds/system/log_cmd.rs                ─ (no tg log handler)             ─
src/cmds/system/json_cmd.rs               ─ (no tg json handler)            ─
src/cmds/system/env_cmd.rs                ─ (no tg env handler)             ─
src/cmds/system/wc_cmd.rs                 ─ (no tg wc handler)              ─
src/cmds/system/format_cmd.rs             ─ (no tg format handler)          ─
src/cmds/system/pipe_cmd.rs               ─ (no tg pipe handler)            ─
src/cmds/system/local_llm.rs              ─ (no tg local llm handler)       ─
src/cmds/git/git.rs                       src/handlers/git/{status,diff,log,branch,show}.ts  tests/unit/handlers/git/*.test.ts
src/cmds/git/diff_cmd.rs                  src/handlers/git/diff.ts          tests/unit/handlers/git/diff.test.ts
src/cmds/git/gh_cmd.rs                    ─ (no tg gh handler)              ─
src/cmds/git/glab_cmd.rs                  ─ (no tg glab handler)            ─
src/cmds/git/gt_cmd.rs                    ─ (no tg gt handler)              ─
src/cmds/js/npm_cmd.rs                    src/handlers/js/packageList.ts    tests/unit/handlers/js/packageList.test.ts
src/cmds/js/pnpm_cmd.rs                   src/handlers/js/packageList.ts    tests/unit/handlers/js/packageList.test.ts
src/cmds/js/tsc_cmd.rs                    src/handlers/js/tsc.ts            tests/unit/handlers/js/tsc.test.ts
src/cmds/js/vitest_cmd.rs                 src/handlers/js/test.ts           tests/unit/handlers/js/test.test.ts
src/cmds/js/lint_cmd.rs                   src/handlers/js/eslint.ts         tests/unit/handlers/js/eslint.test.ts
src/cmds/js/prettier_cmd.rs               ─ (no tg prettier handler)        ─
src/cmds/js/next_cmd.rs                   ─ (no tg next handler)            ─
src/cmds/js/playwright_cmd.rs             ─ (no tg playwright handler)      ─
src/cmds/js/prisma_cmd.rs                 ─ (no tg prisma handler)          ─
src/cmds/python/pytest_cmd.rs             src/handlers/python/pytest.ts     tests/unit/handlers/python/pytest.test.ts
src/cmds/python/ruff_cmd.rs               src/handlers/python/ruff.ts       tests/unit/handlers/python/ruff.test.ts
src/cmds/python/mypy_cmd.rs               src/handlers/python/mypy.ts       tests/unit/handlers/python/mypy.test.ts
src/cmds/python/pip_cmd.rs                src/handlers/python/pip.ts        tests/unit/handlers/python/pip.test.ts
src/cmds/jvm/gradlew_cmd.rs               src/handlers/java/gradle.ts       tests/unit/handlers/java/gradle.test.ts
src/cmds/dotnet/dotnet_cmd.rs             ─ (no tg dotnet handler)          ─
src/cmds/dotnet/binlog.rs                 ─ (no tg dotnet handler)          ─
src/cmds/dotnet/dotnet_trx.rs             ─ (no tg dotnet handler)          ─
src/cmds/dotnet/dotnet_format_report.rs   ─ (no tg dotnet handler)          ─
src/cmds/cloud/aws_cmd.rs                 ─ (no tg aws handler)             ─
src/cmds/cloud/container.rs               ─ (no tg docker/kubectl handler)  ─
src/cmds/cloud/curl_cmd.rs                ─ (no tg curl handler)            ─
src/cmds/cloud/psql_cmd.rs                ─ (no tg psql handler)            ─
src/cmds/cloud/wget_cmd.rs                ─ (no tg wget handler)            ─
src/cmds/go/go_cmd.rs                     ─ (no tg go handler)              ─
src/cmds/go/golangci_cmd.rs               ─ (no tg golangci handler)        ─
src/cmds/rust/cargo_cmd.rs                ─ (no tg cargo handler)           ─
src/cmds/rust/runner.rs                   ─ (no tg rust runner)             ─
src/cmds/ruby/rake_cmd.rs                 ─ (no tg rake handler)            ─
src/cmds/ruby/rspec_cmd.rs                ─ (no tg rspec handler)           ─
src/cmds/ruby/rubocop_cmd.rs              ─ (no tg rubocop handler)         ─
(tg-only)                                 src/handlers/java/maven.ts        tests/unit/handlers/java/maven.test.ts
(tg-only)                                 src/handlers/java/javac.ts        tests/unit/handlers/java/javac.test.ts
(tg-only)                                 src/handlers/generic.ts         tests/unit/handlers/generic.test.ts
```

**check-test-presence.sh:** all 20 handler files have corresponding `*.test.ts` — PASS.

---

## 2. RTK Test Scripts → tg Scripts

```
RTK script                                    tg script                                   Status
─────────────────────────────────────────────────────────────────────────────────────────────────
scripts/test-all.sh                            tests/smoke/smoke.sh                        ✅
scripts/check-test-presence.sh                 scripts/check-test-presence.sh               ✅
scripts/validate-docs.sh                       scripts/validate-docs.sh                     ✅
scripts/check-installation.sh                  scripts/check-installation.sh                ✅
scripts/test-install.sh                        scripts/test-install.sh                      ✅
scripts/benchmark.sh                           scripts/benchmark.sh                         ✅
scripts/update-readme-metrics.sh               scripts/update-readme-metrics.sh               ✅
scripts/benchmark/ (TypeScript suite)          ─                                           ❌ MISSING
scripts/benchmark-sessions/lib/runner.py       ─                                           ❌ MISSING
scripts/rtk-economics.sh                       ─                                           ─ (no tg cc-economics)
scripts/test-tracking.sh                       ─                                           ─ (no tg tracking)
scripts/test-aristote.sh                       ─                                           ─ (no tg equivalent)
scripts/test-ruby.sh                           ─                                           ❌ (no tg ruby handler)
package.json test:ci                           vitest + check-presence + validate + smoke   ✅
```

---

## 3. RTK Test Patterns → tg Test Patterns (per-handler)

For each handler that EXISTS in tg:

- [x] **Format variant tests** — ❓ partial: search/git/js/python/java mostly covered; readLike and grep `-c`/`-l`/`-L` missing
- [x] **Empty output test** — ❓ partial: most handlers have; readLike and listLike lack dedicated cases
- [x] **Error/stderr-only test** — ❓ partial: searchLike, ruff, git-show have; readLike/listLike/pip lack
- [x] **Clean/success output test** — ❓ partial: eslint/tsc/mypy/ruff/maven/gradle/javac/status covered
- [x] **Large output → savings test** — ✅ all major handlers + contracts.test.ts
- [x] **Small output passthrough test** — ❓ partial: listLike/log/branch/generic; readLike missing
- [x] **Content preservation test** — ✅ contracts.test.ts covers all 21 handlers
- [x] **Malformed input test** — ❓ partial: searchLike only; other handlers mostly missing

---

## 4. RTK `#[cfg(test)]` Internal Test Patterns → tg

RTK has inline tests inside every `*_cmd.rs` file. tg equivalent coverage:

| RTK test category | tg coverage |
|------------------|-------------|
| Argument parsing tests (e.g., `parse_find_args`) | ❓ `parse.test.ts` covers tg flags only; RTK find/grep/git arg parsing not migrated |
| Format flag detection tests (e.g., `has_format_flag` for grep) | ❌ RTK 6 tests for `-c`, `-l`, `-L`, `-o`; tg has none |
| Content compaction tests (e.g., `compact_diff`, `clean_line`) | ❓ `diff.test.ts` partial; RTK `diff_cmd.rs` has 19 inline tests |
| Output truncation tests (e.g., `test_compact_diff_increased_hunk_limit`) | ❓ not fully migrated |
| Passthrough tests (e.g., unsupported git subcommands) | ❌ RTK git.rs covers add/commit/push/pull/fetch/stash/worktree; tg only 5 subcommands |
| Regex/pattern escape tests (e.g., BRE alternation `\|` → `\|`) | ❌ missing |
| Tree filter (summary removal, structure) | ❌ RTK 6 tests; tg routes to listLike, no tree-specific tests |
| Read stdin/tail/multi-file/binary | ❌ RTK 8 tests; tg readLike has 1 test |
| Pipe command chaining | ❌ RTK 38 tests; no tg pipe handler |
| Gradlew build/lint/connected variants | ❓ RTK 56 tests + 6 fixtures; tg 4 tests + 1 fixture |
| Stash list / worktree list filters | ❌ RTK has; tg missing |
| Git status state headers (rebase/cherry-pick/merge) | ❓ partial in status.test.ts |

Inline test counts (RTK → tg handler tests):

```
RTK module                    RTK #[test]   tg test()   Gap
────────────────────────────────────────────────────────────
system/read.rs                     8            1       severe
system/ls.rs                      29            7       merged into listLike
system/find_cmd.rs                29            7       merged into listLike
system/tree.rs                     6            0       no tree-specific tests
system/grep_cmd.rs                23           14       missing -c/-l/-L/BRE tests
git/git.rs                        75           27       5/12 subcommands only
git/diff_cmd.rs                   19            5       hunk-limit tests missing
jvm/gradlew_cmd.rs                56            4       fixture corpus thin
cloud/aws_cmd.rs                  82            0       no handler
git/gh_cmd.rs                     66            0       no handler
dotnet/dotnet_cmd.rs              66            0       no handler
git/glab_cmd.rs                   62            0       no handler
rust/cargo_cmd.rs                 48            0       no handler
system/pipe_cmd.rs                38            0       no handler
```

---

## 5. RTK Fixtures → tg Fixtures

```
RTK fixture                              tg equivalent                              Status
─────────────────────────────────────────────────────────────────────────────────────────
tests/fixtures/dotnet/* (5 files)        ─ (no tg dotnet handler)                  ❌
tests/fixtures/glab_* (5 files)          ─ (no tg glab handler)                    ❌
tests/fixtures/golangci_v2_json.txt      ─ (no tg golangci handler)                 ❌
tests/fixtures/gradlew_* (6 files)       tests/fixtures/java/gradle_test_failed.txt ❌ (1/6)
tests/fixtures/* (tg-owned, 25 files)    tests/fixtures/**                          ✅
```

---

## 6. RTK CI / Config → tg

```
RTK config                                 tg equivalent                              Status
─────────────────────────────────────────────────────────────────────────────────────────
.claude/rules/cli-testing.md               ─                                         ❌ MISSING
.github/workflows/ (CI)                    ─                                         ❌ MISSING
openclaw/ (config)                         ─                                         ─ (tg doesn't use openclaw)
hooks/ (hook scripts)                      ─                                         ─ (tg doesn't have hooks)
src/core/* tests                           tests/unit/{ansi,savings,pipeline,...}     ✅
integration tests                          tests/integration/cli.test.ts              ✅ (tg-only)
handler contract tests                     tests/unit/handlers/contracts.test.ts      ✅ (tg-only, 21 handlers)
```

---

## Audit Results

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | system/ls.rs → listLike | ❓ | Handler merged; RTK 29 ls-specific inline tests not fully migrated |
| 2 | system/find_cmd.rs → listLike | ❓ | find scenarios covered; RTK 29 parse/compact tests not 1:1 |
| 3 | system/tree.rs | ❌ | Routed to listLike; no tree filter or tree-specific tests |
| 4 | system/read.rs → readLike | ❌ | RTK 8 tests → tg 1 test (stdin/tail/multi-file/binary missing) |
| 5 | system/grep_cmd.rs → searchLike | ❓ | Main formats covered; `-c`/`-l`/`-L` and BRE escape tests missing |
| 6 | system/log_cmd.rs | ❌ | No handler, no test |
| 7 | system/json_cmd.rs | ❌ | No handler, no test |
| 8 | system/env_cmd.rs | ❌ | No handler, no test |
| 9 | system/wc_cmd.rs | ❌ | No handler, no test |
| 10 | system/format_cmd.rs | ❌ | No handler, no test |
| 11 | system/pipe_cmd.rs | ❌ | No handler, no test (RTK 38 inline tests) |
| 12 | system/local_llm.rs | ❌ | No handler, no test |
| 13 | git/git.rs (5 subcommands) | ❓ | status/diff/log/show/branch have handlers + tests |
| 14 | git/git.rs (add/commit/push/pull/fetch/stash/worktree) | ❌ | RTK filters exist; tg has no handler or test |
| 15 | git/diff_cmd.rs | ❓ | Basic diff tests; hunk-limit / stat passthrough not fully migrated |
| 16 | git/gh_cmd.rs | ❌ | No handler, no test (RTK 66 inline tests) |
| 17 | git/glab_cmd.rs | ❌ | No handler, no test (RTK 62 inline tests) |
| 18 | git/gt_cmd.rs | ❌ | No handler, no test |
| 19 | js/npm + pnpm → packageList | ❓ | list covered; install/outdated scenarios not migrated |
| 20 | js/tsc, vitest, lint | ❓ | Core scenarios covered; RTK inline tests not 1:1 |
| 21 | js/prettier, next, playwright, prisma | ❌ | No handler, no test |
| 22 | python/pytest, ruff, mypy, pip | ❓ | Core scenarios covered |
| 23 | jvm/gradlew → gradle | ❓ | RTK 56 tests + 6 fixtures → tg 4 tests + 1 fixture |
| 24 | dotnet/* (4 modules) | ❌ | No handler, no test |
| 25 | cloud/aws, container, curl, psql, wget | ❌ | No handler, no test |
| 26 | go/go, golangci | ❌ | No handler, no test |
| 27 | rust/cargo, runner | ❌ | No handler, no test |
| 28 | ruby/rake, rspec, rubocop | ❌ | No handler, no test |
| 29 | tg-only: maven, javac, generic | ✅ | Implemented with tests (no RTK module) |
| 30 | Handler test-presence guard | ✅ | scripts/check-test-presence.sh — 20/20 PASS |
| 31 | Smoke / validate-docs / install scripts | ✅ | Ported |
| 32 | benchmark.sh + update-readme-metrics.sh | ✅ | Present in tg |
| 33 | benchmark/ TS suite + benchmark-sessions | ❌ | Not migrated |
| 34 | test-ruby.sh | ❌ | Blocked by missing ruby handlers |
| 35 | Test pattern: savings + content preservation | ✅ | Per-handler tests + contracts.test.ts |
| 36 | Test pattern: format variants / malformed / passthrough | ❓ | Uneven; readLike and grep flags are worst gaps |
| 37 | RTK fixtures for missing handlers | ❌ | dotnet, glab, golangci not migrated |
| 38 | gradlew fixture corpus | ❌ | 1/6 migrated |
| 39 | .claude/rules/cli-testing.md | ❌ | Not migrated |
| 40 | .github/workflows CI | ❌ | tg has no .github/ |

---

## Conclusion

### Summary

```
  ✅ Complete:        14   (implemented handlers all have test files + core scripts/contract tests)
  ❌ Missing:         42   (29 RTK command domains with no handler/test + 13 pattern/fixture/CI gaps)
  ❓ Partial/Verify:  22   (implemented but RTK inline tests not fully migrated)
  ─ Not applicable:    5   (economics, tracking, aristote, openclaw, hooks)
```

### Unacceptable gaps (no handler AND no test — 29 RTK command domains)

These must not be treated as "out of scope"; each needs handler + `*.test.ts` + fixtures before migration is complete:

- **Cloud:** aws, curl, psql, wget, docker/kubectl
- **Languages:** go, golangci-lint, cargo/rust, ruby (rake/rspec/rubocop)
- **.NET:** dotnet_cmd, binlog, trx, format_report
- **Git extensions:** gh, glab, gt; plus git.rs subcommands add, commit, push, pull, fetch, stash, worktree
- **System extensions:** tree (dedicated filter), log, json, env, wc, format, pipe, local_llm

### Implemented but severely under-tested

| Area | RTK | tg | Severity |
|------|-----|----|----|
| readLike | 8 inline tests | 1 test | severe |
| grep format flags / BRE | 6+ inline tests | 0 | severe |
| git.rs (all subcommands) | 75 inline tests | 27 tests, 5 subcommands | severe |
| gradlew | 56 tests, 6 fixtures | 4 tests, 1 fixture | high |
| tree | 6 inline tests | 0 tree-specific | high |
| diff_cmd compaction limits | 19 inline tests | 5 tests | medium |

### Relatively complete

- All **20 existing handler `.ts` files** have matching `*.test.ts` (check-test-presence PASS)
- **Smoke / check-presence / validate-docs / benchmark.sh / update-readme-metrics** scripts ported
- **`contracts.test.ts`** provides unified content-preservation + empty-edge coverage for all 21 registered handlers (tg addition, no RTK equivalent)
- **Core module tests** (ansi, savings, pipeline, parse, router, executor) present
- **tg-owned fixture corpus** (25 files) covers implemented handler domains

### Verdict

RTK → tg test migration is **not complete**. tg covers roughly **21/50** RTK command surfaces (counting dotnet submodules and tg-only additions). Within implemented handlers, test **presence** is 100%, but test **depth** often falls far short of RTK's inline `#[cfg(test)]` suites — especially read, grep flags, git extended subcommands, and gradle fixtures.

Priority order for closing the gap:

1. Missing handlers for RTK-covered commands (cloud, rust, go, ruby, dotnet, git CLI tools, system utilities)
2. Deepen tests for existing handlers to match RTK inline test categories (readLike, searchLike flags, git.rs, gradlew fixtures)
3. Migrate benchmark TS suite and GitHub CI workflow
4. Port `.claude/rules/cli-testing.md` or tg equivalent testing guidelines
