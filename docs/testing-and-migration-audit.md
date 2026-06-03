# tg Testing & RTK Migration Audit

Single reference for **what good tests are**, **what is wrong with the suite today**, and **what is still missing from RTK → tg migration**.

Last audited: 2026-06-03

**Run gates:** `pnpm test:product` (uses `vitest.config.ts`) is the implemented-behavior fidelity suite and may turn red when a known implementation bug is promoted into fixture-backed coverage. `pnpm test:migration` (uses `vitest.migration.config.ts`) is expected to stay red until RTK migration/debt is complete. **`pnpm test:ci` must be all green before calling migration complete.**

`scripts/check-test-presence.sh` checks fixture-backed handler coverage plus core test-pair presence — necessary, **not sufficient**.

---

## 1. Executive summary

| Question | Answer |
|----------|--------|
| Is migration complete? | **No** — ~29 RTK command modules have no tg handler; migration suite is red by design. |
| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 42 real `fixtureCases`; current red tests expose real gaps. |
| Do passing tests reflect project reality? | **Partially** — core handlers work on selected real fixtures and narrow integration paths; not production-wide or RTK 1:1. |

**Baseline**

- RTK: **986** inline `#[test]` across **47** command modules (inventory only; not CI progress).
- tg: **29** registered handlers in `src/handlers/index.ts`.
- Product tests use fixture-backed handler coverage; synthetic handler `*.test.ts` files have been deleted after porting/debt capture.

**Verdict:** Do not treat RTK `#[test]` counts, synthetic handler test counts, or `check-test-presence.sh` PASS as migration progress. **Automated gates + fixture-backed fidelity** are the bar.

**Primary RTK references (read before migrating tests):**

| Document | Path | Role |
|----------|------|------|
| CLI testing strategy | `rtk/.claude/rules/cli-testing.md` | Snapshots, token savings, fixtures, integration, anti-patterns |
| Contributing — Testing | `rtk/CONTRIBUTING.md` § Testing | Test types, pre-commit gate, PR checklist |
| Coding practices — Testing | `rtk/docs/contributing/CODING_PRACTICES.md` § Testing | Co-located tests, minimal snapshot + savings example |
| TDD workflow | `rtk/.claude/skills/rtk-tdd/SKILL.md` | Red-Green-Refactor, naming, when not to unit-test |
| Test presence guard | `rtk/scripts/check-test-presence.sh` | Every changed `*_cmd.rs` must have `#[cfg(test)]` |
| Smoke suite | `rtk/scripts/test-all.sh` | End-to-end `rtk` invocations with real tools |

---

## 2. RTK testing organization & principles (reference)

This section is the **source-of-truth summary** for how RTK tests are structured and what tg migration must mirror. tg should not invent a parallel testing philosophy.

### 2.1 Scale and layout

| Metric | RTK today |
|--------|-----------|
| Command modules with tests | **47** files under `rtk/src/cmds/**` containing `#[cfg(test)]` |
| Inline unit tests | **986** `#[test]` functions (inventory only — not tg CI progress) |
| Shared fixtures | `rtk/tests/fixtures/` — real command output captured from the shell |
| Fixture-backed tests in modules | **~27** `include_str!(...)` call sites across command modules |

**Co-location rule (non-negotiable in RTK):** tests live in the **same file** as the filter they exercise, inside `#[cfg(test)] mod tests { ... }`. There is no `tests/unit/handlers/foo.test.rs` per command. Implementation, parser helpers, fixtures, and assertions stay together so a reviewer sees filter + tests in one diff.

```
rtk/
├── src/cmds/
│   ├── system/grep_cmd.rs      # filter + #[cfg(test)] mod tests
│   ├── git/git.rs              # large module: run() + many test sections
│   ├── jvm/gradlew_cmd.rs      # task detection tests + fixture savings tests
│   └── …
├── tests/fixtures/             # real stdout/stderr captures
│   ├── gradlew_*_raw.txt
│   ├── glab_*_raw.*
│   └── dotnet/
└── scripts/
    ├── test-all.sh             # smoke (spawn real rtk + assert_contains)
    └── check-test-presence.sh  # PR guard for #[cfg(test)] on *_cmd.rs
```

### 2.2 Four test layers (pyramid)

RTK uses a **layered** strategy documented in `CONTRIBUTING.md` and `cli-testing.md`:

| Layer | Where | What it proves | How to run |
|-------|-------|----------------|------------|
| **1 — Inline unit** | `#[cfg(test)]` in each `*_cmd.rs` / ecosystem module | Parser correctness, flag handling, edge cases, filter output on fixtures | `cargo test` |
| **2 — Snapshot** (policy) | Same module, `insta::assert_snapshot!` | Full filtered output shape; regression on format changes | `cargo test` + `cargo insta review` |
| **3 — Smoke** | `scripts/test-all.sh` | Real `rtk <cmd>` in a dev environment; routing + no crash | `bash scripts/test-all.sh` |
| **4 — Integration** | `#[ignore]` tests, optional `tests/integration_test.rs` | Installed binary, real git repo, output size bounds | `cargo test --ignored` |

**Reality check:** `cli-testing.md` treats **insta snapshots as primary**, but the current tree has **0** `assert_snapshot!` usages under `src/cmds/`. Most modules instead combine:

- **Pure parser tests** — input literals → `assert_eq!` on parsed fields (e.g. `parse_match_line`, `detect_task`, `state_icon`).
- **Fixture + savings tests** — `include_str!("../../../tests/fixtures/...")` → run filter → assert **critical strings kept** and **≥60% token savings** (whitespace token count).
- **Invariant / issue tests** — document bugs (`issue #1436`) and overflow math so regressions are obvious.

tg migration should follow the **intent** (real fixtures + critical content + savings where large), not cargo-insta mechanics.

### 2.3 Core principles

From `CONTRIBUTING.md` design philosophy + `cli-testing.md` + `CODING_PRACTICES.md`:

| Principle | RTK rule | tg equivalent |
|-----------|----------|---------------|
| **Correctness before compression** | Never drop paths, changed lines, error codes, failure names | `fixtureCases[].critical` + `forbidden` patterns in `fixtureContent.test.ts` |
| **Real output, not synthetic** | Fixtures from `git log -20 > tests/fixtures/...`, not hand-written fake logs | Port `rtk/tests/fixtures/*` → `tests/fixtures/**`; ban hand-built stdout-only tests in CI |
| **TDD** | Red → Green → Refactor; failing test before implementation | Port RTK `#[test]` intent first, then fix handler |
| **Token savings verified** | ≥**60%** savings on large fixtures (80–90% targets per command in `cli-testing.md`) | `expectLargeSavings` / savings assertions **only with** critical-content checks |
| **Never block the user** | Filter failure → warn + passthrough raw output | `pipeline.test.ts` fallback behavior |
| **Respect explicit verbosity** | User flags like `--nocapture`, `-la` → do not over-compress | Flag-aware tests in RTK; tg must mirror per handler |
| **Edge cases required** | empty, malformed, unicode, ANSI, stderr-only | Each handler category in `cli-testing.md` Pattern: Edge Case Testing |
| **Cross-platform** | `#[cfg(target_os = "...")]` for shell escaping | tg Node spawn — document macOS primary; integration in temp dirs |
| **No silent truncation** | Lists capped at N must have tee/recovery hint | tg `--save-raw`, `--verbose` integration tests |

### 2.4 Test categories inside each RTK module

When reading `rtk/src/cmds/<module>.rs`, expect tests grouped like this (grep_cmd.rs is representative):

| Category | Example test names | Asserts |
|----------|-------------------|---------|
| **Helper / parser** | `test_parse_match_line_*`, `test_clean_line`, `test_compact_path` | Exact struct fields, no panic on colons/windows paths |
| **Flag / arg logic** | `test_format_flag_detects_count`, `test_recursive_flag_stripped`, `test_detect_*` | Boolean detection, arg stripping, task routing |
| **Overflow / limits** | `test_grep_overflow_uses_uncapped_total` | Math invariants on hidden-match counts |
| **Filter on fixture** | `filter_gradlew_*`, `*_savings` with `include_str!` | Output contains `BUILD FAILED`, strips `PASSED`, savings ≥60–70% |
| **Issue reproducers** | Comments `// Issue #1436` | Regression for reported user bugs |
| **Optional live tool** | `test_rg_always_has_line_numbers` | Runs `rg` if installed; skips gracefully if not |

**Naming convention** (`rtk-tdd` skill): `test_{function}_{scenario}` — e.g. `test_parse_match_line_windows_path`.

### 2.5 Fixtures workflow (RTK)

1. Capture real command output into `rtk/tests/fixtures/<name>_raw.txt` (or `.json` for gh/glab).
2. Reference in module tests: `include_str!("../../../tests/fixtures/gradlew_test_raw.txt")`.
3. Call the **pure filter function** (not always full `run()` — avoids needing the binary tool in unit tests).
4. Assert:
   - **Preservation** — failure lines, file paths, error codes still present.
   - **Savings** — `100.0 - (out_tokens / in_tokens * 100.0) >= 60.0`.
5. For output-shape regressions, policy says add `assert_snapshot!` + `cargo insta review` (tg: use explicit `critical` strings or golden files if needed).

**Anti-patterns explicitly forbidden in RTK docs:**

- Hand-coded fake git/cargo output with no fixture file.
- Tests that only assert `!output.is_empty()` or high savings with no content checks.
- Skipping cross-platform cfg for shell escaping.
- Accepting &lt;60% savings on large noisy fixtures without investigation.

### 2.6 CI and guards (RTK)

| Guard | Enforces |
|-------|----------|
| `cargo fmt --all --check && cargo clippy --all-targets && cargo test` | Pre-merge mandatory |
| `scripts/check-test-presence.sh` | New/changed `src/cmds/**/*_cmd.rs` includes `#[cfg(test)]` |
| `scripts/test-all.sh` | ~69 smoke assertions across command surface |
| `scripts/validate-docs.sh` | README / hook consistency (not filter behavior) |
| PR checklist | Snapshots reviewed, savings ≥60%, truncation has recovery hint |

### 2.7 What tg must mirror (migration mapping)

| RTK artifact | tg target | Notes |
|--------------|-----------|-------|
| One `#[test]` with real fixture + preservation | One row in `tests/helpers/fixtureCases.ts` | Name after RTK intent: `// RTK: test_parse_match_line_simple` |
| `include_str!(fixtures/...)` | Same file under `tests/fixtures/**` | Copy or regenerate from same shell command |
| Parser-only `#[test]` | Either unit test on exported parser **or** fixture case if output-visible | Prefer fixture if it affects agent-visible output |
| `scripts/test-all.sh` case | `tests/integration/cli.test.ts` or `tests/smoke/smoke.sh` | E2E only; does not replace fixture fidelity |
| Module without handler | `rtkDomainCaseParity` gap | Routing + fixtureCases required before ✅ |

**Not RTK parity (tg-only, keep):** `maven`, `javac`, tg CLI flags (`parse.test.ts`), token math (`savings.test.ts`).

**Not meaningful for tg CI (do not copy):** counting 986 RTK tests as progress; synthetic vitest stdout strings without fixtures; file-existence-only gates.

### 2.8 What the ~986 tests are made of (composition, not a target count)

**How the number is produced:** count every `#[test]` function in `rtk/src/cmds/**/*.rs` (~979–986 depending on whether macro-expanded or unnamed tests are included). **47 modules**, one `#[cfg(test)] mod tests` per command file.

**Do not migrate “986 vitests”.** Migrate **the same coverage dimensions** RTK uses. Automated classification of test function names + bodies:

| Coverage dimension | ~Count | What RTK asserts | Example modules |
|--------------------|--------|------------------|-----------------|
| **A — Filter output** | **~315** | `filter_*` / end-to-end filter on sample or fixture stdout → output shape, kept lines, stripped noise | `cargo_cmd`, `git.rs`, `pytest_cmd`, `gradlew` |
| **B — Arg parse & routing** | **~230** | `parse_*`, `detect_*`, `resolve_*`, `classify_*`, task/subcommand selection | `find_cmd`, `gradlew`, `gh_cmd`, `pipe_cmd` |
| **C — Format transform** | **~161** | `compact_*`, `clean_*`, `format_*`, path shortening, hunk/header handling | `grep_cmd`, `git.rs`, `gh_cmd` |
| **D — Passthrough / preserve** | **~34** | Explicit verbose flags, small output not inflated, raw retained when filter adds no value | `gradlew`, `gh_cmd`, `git.rs` |
| **E — Compression & limits** | **~24** | Overflow/hidden counts, caps, savings ≥60% on large input | `grep_cmd`, `gradlew`, `diff_cmd` |
| **F — Empty / no-match edge** | **~13** | Empty stdout, zero matches, clean success — no throw, sensible message | scattered |
| **G — Error / stderr** | **~13** | Failed exit, stderr-only errors preserved | `tsc_cmd`, `gradlew` |
| **H — CLI flags** | **~10** | `-c`, `-l`, `-r`, `--null`, flag stripping before spawn | `grep_cmd`, `git.rs` |
| **I — Platform / encoding** | **~3+** | Windows paths, multibyte, emoji, ANSI | `grep_cmd`, `read.rs` |
| **J — Malformed input** | **~1+** | Unparseable lines → skip or passthrough, never panic | `grep_cmd` (`parse_match_line_malformed`) |
| **K — Other unit / display** | **~143** | Icons, helpers, compile-time checks, issue invariants | `glab_cmd`, `gh_cmd` |

**Fixture-backed filter tests (highest fidelity tier):** only **~27** `#[test]` blocks call `include_str!("../../../tests/fixtures/...")` today — concentrated in `gradlew_cmd.rs` (13), `glab_cmd.rs` (11), `binlog.rs` (2), `golangci_cmd.rs` (1). Most of the 986 never touch `tests/fixtures/`; they use **inline string literals** in the test body. tg should treat **real `tests/fixtures/**`** as the bar for agent-visible scenarios, not inline Rust strings copied verbatim.

**Per-module mix (examples):**

```
grep_cmd.rs (23):  parse/routing 12 | format 5 | flags 3 | compression 1 | other 2
gradlew_cmd.rs (56): parse/routing 20 | filter 7 | passthrough 8 | compression 5 | error 4 | other 12
git.rs (75):       filter 26 | parse 17 | format 16 | other 10 | passthrough 3 | flags 2 | empty 1
gh_cmd.rs (66):    passthrough 17 | format 18 | parse 14 | filter 10 | display 3 | …
pytest_cmd.rs (9): filter 8 | parse 1
```

### 2.9 Unified tg coverage matrix (same dimensions as RTK)

Every RTK module migration is **done** when tg covers **all applicable rows** for that handler — not when test count matches.

| RTK dimension | tg artifact | CI gate | tg today (honest) |
|---------------|-------------|---------|-------------------|
| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **42 rows** across registered handlers; still needs deeper per-handler variants |
| **B Arg parse & routing** | `router.test.ts` + `rtkDomainCaseParity` sample command → handler name | verified / migration gate | **Partial** — routing only, not arg edge cases |
| **C Format transform** | Unit tests on exported pure functions **or** fixtureCases when output differs | fixtureCases / future parser units | **Still thin** — add real fixture variants or exported-parser units only |
| **D Passthrough / small output** | `fixtureCases` with small fixture + max size assertion; `contracts` small-output rows | fixtureContent + (future) size caps | **Rare** — few P1 small-output cases |
| **E Compression & limits** | `fixtureCases` on large fixture + `critical` + optional `expectLargeSavings` | fixtureContent | **Partial** — no savings-only tests count |
| **F Empty / no-match** | `fixtureCases` or unit: empty input → no throw, sensible message | fixtureContent | **Sparse** |
| **G Error / stderr** | `fixtureCases` with `exitCode != 0`, stderr in fixture or merged raw | fixtureContent | **Some** (pytest, ruff, tsc, …) |
| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Gaps now visible** — grep `-c`/`-l` pass; `rg --json` is red because current handler rewrites machine-readable output |
| **I Platform / encoding** | fixtureCases with paths/unicode in fixture file | fixtureContent | **Minimal** |
| **J Malformed / unknown format** | fixtureCases: non-canonical stdout → not empty, not “0 matches” lie | fixtureContent | **Almost none** |
| **K Module inventory** | Handler exists + at least one dimension-A row | `rtkDomainCaseParity` | **47 modules tracked; most fail** |
| **Smoke E2E** | `cli.test.ts` / `smoke.sh` | integration | **~30** narrow scenarios |
| **Parser-only (B/C, no agent diff)** | exported pure-helper units only when needed | future targeted unit files | Synthetic stdout-only handler tests deleted; add parser units only for real parser contracts |

### 2.9.1 Dimension-level tg coverage (actual counts + verdict)

As of 2026-06-03, tg test cases classified against the same A–K dimensions:

| Dimension | RTK ~count | tg actual | Coverage verdict | Gap |
|-----------|-----------|-----------|------------------|-----|
| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 42 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
| **B — Arg parse/routing** | ~230 | ~55 routing / 0 internal parse | ⚠️ Routing ok, parse untested | Handler-internal parse functions (`formatStatus`, `parseMatch`, …) tested only through filter() pipeline, not in isolation |
| **C — Format transform** | ~161 | ~14 | 🔴 Thin | Only searchLike has 5+ format variants; other handlers test one canonical format only |
| **D — Passthrough/small output** | ~34 | ~14 | 🟢 Proportional | branch/list/search small-output rows now assert output growth limits |
| **E — Compression & limits** | ~24 | ~11 | 🟢 Proportional | Hidden counts, per-file caps, savings math all covered |
| **F — Empty output** | ~13 | ~10 | 🟡 Adequate | Former synthetic contracts bug was deleted; still needs fixture-backed empty-output depth |
| **G — Error/stderr** | ~13 | ~10 | 🟢 Proportional | Search regex error, read-like missing file, git failures, pipeline fallback |
| **H — CLI flags** | ~10 | ~12 | 🔴 Honest red | grep `-c`/`-l` rows pass; `rg --json` row fails until explicit machine-readable output is respected |
| **I — Platform/encoding** | ~3+ | 2 | 🟡 Minimal | ANSI strip + CJK token estimation; no emoji-in-output, no non-ASCII grep match content |
| **J — Malformed input** | ~1+ | 4 | 🔴 Honest red | `rg --json`, `git status --short`, `git status --porcelain -b`, and `git diff --stat` expose parser/format gaps |
| **K — Unit helpers** | ~143 | 0 | N/A | Intentionally not isolated; all helper logic covered through filter() pipeline |

**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed. `rg --json` deliberately stays red.

**Naming / traceability:** each tg case should cite RTK source when porting:

```typescript
{
  name: "search-like: parse_match_line windows path (RTK: test_parse_match_line_windows_path)",
  // ...
}
```

Or in unit tests: `// RTK: rtk/src/cmds/system/grep_cmd.rs test_parse_match_line_windows_path`.

**Completion rule per RTK module** (replace “986 tests”):

1. List all `#[test]` / `fn test_*` in that `.rs` file (use `rg '#\[test\]' rtk/src/cmds/<module>.rs`).
2. For each test, classify A–K above.
3. Map to tg row: **fixtureCases** (if agent-visible) or **unit test** (if parser-only) or **N/A** (document why).
4. Module ✅ when mapping table has **no open rows** and `rtkDomainCaseParity` gaps are `[]`.

**Rough tg target size (derived from composition, not 986):**

| tg bucket | Expected scale |
|-----------|----------------|
| `fixtureCases` (dimension A + flag variants + edges F/G/H/J) | **~150–350 rows** repo-wide |
| Handler unit tests (B/C/K parser-only) | **~200–500** if pure functions exported |
| Routing / module gates | **47** modules (`rtkDomainCaseParity`) |
| E2E smoke | **~50–80** (cli + smoke), not 986 |

---

## 3. Current test suite — strengths and gaps

### 3.1 What “passing” means today

The product suite (`vitest.config.ts`) intentionally includes current product behavior only: core unit tests, integration, and fixture-backed handler behavior. It does **not** include per-handler synthetic tests under `tests/unit/handlers/**` or migration/debt gates.

The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` was red (**120 pass / 1 fail**) because `rg --json` is now a real fixture-backed bug, and `pnpm test:migration` was red (**97 pass / 39 fail**). Treat failures as debt signals, not regressions to hide.

### 3.2 Categories of passing tests (quality tiers)

| Tier | Examples | Follows P0/P1 principles? | Reflects real tool output? |
|------|----------|---------------------------|----------------------------|
| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (42 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
| **B — tg internals** | `savings`, `parse`, `router`, `pipeline`, `executor`, `ansi` | **Yes** for their scope | **N/A** (not handler filters) |
| **C — E2E smoke** | `tests/integration/cli.test.ts` (~30 cases) | **Mostly** — real `spawn` of tg in temp dirs | **Partial** — narrow scenarios |
| **D — Migration/debt only** | Routing parity, fixture wiring, fixture corpus size, script path parity | **No** for product behavior | **No** — existence/routing ≠ correct compression |
| **E — Deleted synthetic** | former `handlers/**/<name>.test.ts` files | Removed | Anti-pattern removed; replacement coverage is fixture-backed or explicit regression debt |

### 3.3 Documented shortcomings (audit)

1. **Migration CI not green** — migration gates (`rtkDomainCaseParity`, `fixtureRegressionDebt`, `projectConfig`, pending script ports) still fail.
2. **Synthetic handler tests removed** — 23 inline-stdout handler test files were deleted after porting useful coverage into `fixtureCases` or explicit migration debt.
3. **One fixture per handler is not enough** — `fixtureCases` covers 42 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
4. **fixtureCases wiring debt cleared** — orphaned on-disk fixtures (`rg_default_format`, `log_standard`, `show_large`, …) and commands (`tree`, `ls`, `pnpm list`, …) are now wired into `fixtureCases`.
5. **Registered handler fixture coverage complete** — every registered non-generic handler has at least one `fixtureCases` row.
6. **No synthetic handler contract tests** — global inline contracts were removed; use fixtureCases or explicit regression debt.
7. **Fixture corpus gate narrowed** — RTK gradlew, glab, and golangci fixtures are ported; dotnet corpus-only gate was removed because dotnet has no handler yet and parity gates already track that gap.
8. **Routing tests ≠ behavior** — routing-only coverage was removed as a standalone gate; `rtkDomainCaseParity` now keeps routing tied to fixture-backed handler coverage and stays red for unimplemented RTK modules.
9. **Historical anti-pattern removed from handler tests** — savings-only and hand-built stdout handler tests were deleted; future coverage must use real fixtures or explicit parser-unit contracts.
10. **RTK scale gap** — e.g. gradlew RTK **56** tests + **6** fixtures vs tg **11** tests + **1** fixture; **986** RTK inline tests vs a thin verified layer.
11. **Former `contracts.test.ts` empty edge case bug removed** — the no-op `critical: [""]` assertions were deleted with the synthetic contracts file.
12. **`rg --json` is now intentionally red** — current `search-like` rewrites JSON output into a search summary and drops machine-readable fields.

### 3.4 What passing tests *do* justify

- Core handlers can preserve **critical signal** on **selected real fixtures** (`tests/fixtures/**` → `fixtureCases`).
- CLI works in **controlled integration** scenarios (`cli.test.ts`, smoke).
- tg **routing table** and **core math/pipeline** are regression-tested.

They do **not** justify: migration complete, full command surface, or freedom from silent data loss on arbitrary tool output.

### 3.5 Per-file test inventory (verdict + action)

Merged from `docs/test-case-audit.md` (2026-06-03), **reconciled** with `vitest.config.ts`, `vitest.migration.config.ts`, and §2.9 coverage matrix.  
**Legend:** **Product** = included in `pnpm test:product`; **Migration** = included in `pnpm test:migration`.

| Verdict | Meaning | Action |
|---------|---------|--------|
| ✅ **Product keep** | In product suite; tests tg product behavior | Keep; extend with fixtureCases where gaps remain |
| 🗑️ **Deleted synthetic** | Former inline stdout handler tests | Do not restore; add real fixtureCases or regression debt instead |
| ⚠️ **Gate** | Migration / debt tracker, not filter behavior | Keep until migration complete; then merge or delete |
| 🚦 **Migration only** | File existence, repo hygiene, or script parity debt | Keep out of product tests; keep in migration config while useful |

**Summary:**

| Bucket | Files | Count |
|--------|-------|------:|
| ✅ Product keep — core + integration + fixtureContent | §3.5.1 and §3.5.6 | 9 |
| 🚦 Migration/debt gates | §3.5.4 and §3.5.5 | 9 |
| 🗑️ Deleted synthetic handler tests | §3.5.2 | 23 |
| ⚠️ Gate — consolidate later | §3.5.4 | 2 redundant with `rtkDomainCaseParity` |

#### 3.5.1 ✅ Product keep — core & integration (8 files + fixtureContent)

| File | Product | What it tests | Action |
|------|:--:|---------------|--------|
| `tests/unit/parse.test.ts` | ✅ | `parseArgv()` — tg flags vs command flags (6) | Keep |
| `tests/unit/router.test.ts` | ✅ | `routeCommand()` — handler routing table (32) | Keep; arg edge cases belong in fixtureCases |
| `tests/unit/savings.test.ts` | ✅ | Token math, no negative savings (4) | Keep |
| `tests/unit/pipeline.test.ts` | ✅ | `filterWithFallback()` on handler throw (1) | Keep |
| `tests/unit/executor.test.ts` | ✅ | Real spawn, exit code, 127 (2) | Keep |
| `tests/unit/core/ansi.test.ts` | ✅ | ANSI strip via generic handler (1) | Keep |
| `tests/integration/cli.test.ts` | ✅ | E2E tg: ls/cat/git/rg/flags/report (~30) | Keep; primary smoke |
| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **42 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar; currently red on `rg --json` |

#### 3.5.2 🗑️ Deleted synthetic handler tests (23 files)

These files were removed because they used hand-built stdout strings and often asserted savings without enough content preservation. Do not recreate them as same-name handler unit tests unless the new file tests exported pure parser helpers that cannot be fixture-backed.

Deleted files:

`common/listLike.test.ts`, `common/readLike.test.ts`, `common/searchLike.test.ts`, `contracts.test.ts`, `generic.test.ts`, `git/branch.test.ts`, `git/diff.test.ts`, `git/extended.test.ts`, `git/hostingCli.test.ts`, `git/log.test.ts`, `git/show.test.ts`, `git/status.test.ts`, `java/gradle.test.ts`, `java/javac.test.ts`, `java/maven.test.ts`, `js/eslint.test.ts`, `js/packageList.test.ts`, `js/test.test.ts`, `js/tsc.test.ts`, `python/mypy.test.ts`, `python/pip.test.ts`, `python/pytest.test.ts`, `python/ruff.test.ts`.

Replacement coverage now lives in:

- `tests/helpers/fixtureCases.ts` + `fixtureContent.test.ts` for product fidelity.
- `fixtureRegressionDebt.test.ts` for real fixture-backed failures that cannot be marked green yet.
- RTK routing/domain gates for missing handlers.

#### 3.5.4 ⚠️ Migration gates

| File | Migration | What it tests | Verdict | Action |
|------|:--:|---------------|---------|--------|
| `handlers/rtkDomainCaseParity.test.ts` | ✅ | Per RTK module: routing + fixture coverage (47) | **Primary gate** | Keep |
| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (28) | Redundant subset | **Merge** into domain parity; then remove |
| `handlers/fixtureRegressionDebt.test.ts` | ✅ | Real fixture-backed regressions not yet implemented | **Debt gate** | Keep until fixed |
| `handlers/fixtureWiring.test.ts` | ✅ | Known fixtures/commands wired into fixtureCases | **Debt gate** | Keep while fixtures expand |
| `handlers/syntheticTestDebt.test.ts` | ✅ | Fails if synthetic handler tests return | **Guard** | Keep to prevent regression |

#### 3.5.5 🚦 Migration-only infrastructure gates (3 files)

| File | Product/Migration | Why not product tests | Action |
|------|:--:|----------------------|--------|
| `tests/unit/fixtures.test.ts` | Product ❌ / Migration ✅ | File existence + corpus counts for unported handlers | Keep as migration/debt signal only |
| `tests/unit/projectConfig.test.ts` | Product ❌ / Migration ✅ | Checks `ci.yml` / `cli-testing.md` exist | Keep as infrastructure debt signal only |
| `tests/unit/rtkScriptParity.test.ts` | Product ❌ / Migration ✅ | Script path existence + `package.json` strings | Keep as script parity debt signal only |

#### 3.5.6 Integration overlap

| File | Product | Notes | Action |
|------|:--:|-------|--------|
| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (3) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |

#### 3.5.7 File tree (CI status)

```
tests/
├── integration/
│   ├── cli.test.ts              ✅ Product
│   └── rtkParity.test.ts        ✅ Product (overlap ok)
├── unit/
│   ├── core/ansi.test.ts        ✅ Product
│   ├── parse|router|savings|pipeline|executor.test.ts  ✅ Product
│   ├── fixtures.test.ts         🚦 Migration
│   ├── projectConfig.test.ts    🚦 Migration
│   ├── rtkScriptParity.test.ts  🚦 Migration
│   └── handlers/
│       ├── fixtureContent.test.ts           ✅ Product (behavior bar)
│       ├── fixtureWiring.test.ts            🚦 Migration
│       ├── fixtureRegressionDebt.test.ts    🚦 Migration
│       ├── rtkDomainCaseParity.test.ts      🚦 Migration (primary gate)
│       ├── registeredHandlerCoverage.test.ts  ⚠️ merge → remove
│       └── syntheticTestDebt.test.ts        🚦 Migration guard
```

### 3.6 Reconciliation with `test-case-audit.md`

| test-case-audit claim | Corrected verdict | Reason |
|----------------------|-------------------|--------|
| “32 production files ✅ Keep” | **Split:** product suite + migration gates + deleted anti-patterns | Inline stdout ≠ RTK fixture bar |
| “Remove `syntheticTestDebt`” | **Keep** | Enforces port-or-delete; not harmful once understood |
| “Remove all migration meta-tests” | **Keep `rtkDomainCaseParity`; remove duplicate routing-only gates** | Need one complete gate, not zero |
| “Remove `fixtures.test.ts`” | **Agree for product tests; keep only meaningful corpus gates in migration** | Dotnet file-count gate removed because no handler exists |
| “No meaningless tests in production files” | **Now true for product handler tests** | Handler behavior is fixture-backed; remaining red gates are migration debt |

**Immediate actions (from merged audit):**

| Priority | Action |
|----------|--------|
| ✅ P0 | Delete/port §3.5.2 synthetic handler files; `syntheticTestDebt` green |
| 🔴 P0 | Keep §3.5.5 files out of `vitest.config.ts`; keep them in `vitest.migration.config.ts` |
| 🟡 P1 | Merge `registeredHandlerCoverage` into `rtkDomainCaseParity` when `check-test-presence` no longer needs the separate targeted run |
| 🟢 P2 | Expand `fixtureContent` / `cli.test` using scenario list in §3.5.2 tables |

---

## 4. Automated gates (source of truth)

### 4.1 Product gates

| Gate | File | Enforces |
|------|------|----------|
| Product behavior suite | `vitest.config.ts` | Current implemented tg behavior only |
| Fixture fidelity | `tests/unit/handlers/fixtureContent.test.ts` | Real fixture output preserves critical signal |
| CLI E2E | `tests/integration/*.test.ts` | Real tg command invocation in temp dirs |
| Core units | `tests/unit/{parse,router,savings,pipeline,executor}.test.ts`, `tests/unit/core/*.test.ts` | CLI parsing/routing/math/spawn/fallback behavior |

### 4.2 Migration and debt gates

| Gate | File | Enforces |
|------|------|----------|
| Migration suite | `vitest.migration.config.ts` | RTK/debt/infrastructure gates; expected red until migration complete |
| RTK module migration | `tests/unit/handlers/rtkDomainCaseParity.test.ts` | Per RTK module: routing + fixture-backed handler |
| Registered handler fixtures | `tests/unit/handlers/registeredHandlerCoverage.test.ts` | Every handler (except `generic`) has a `fixtureCases` entry |
| fixtureCases wiring | `tests/unit/handlers/fixtureWiring.test.ts` | On-disk fixtures and commands wired into `fixtureCases` |
| Fixture regression debt | `tests/unit/handlers/fixtureRegressionDebt.test.ts` | Real fixture-backed regressions that product tests cannot mark green yet |
| Synthetic test debt | `tests/unit/handlers/syntheticTestDebt.test.ts` | No unported synthetic handler tests remain |
| RTK scripts | `tests/unit/rtkScriptParity.test.ts` | Ported and pending RTK script surfaces |
| Handler fixture corpus | `tests/unit/fixtures.test.ts` | Files exist; corpora meet minimum size |
| CI and testing docs | `tests/unit/projectConfig.test.ts` | GitHub Actions workflow and CLI testing guide |
| Fixture file presence | `tests/unit/fixtures.test.ts` | Required fixture paths exist |

**Product include list** (`vitest.config.ts`): `tests/integration/**`, `fixtureContent.test.ts`, and `tests/unit/{parse,pipeline,router,savings,executor,core/**}.test.ts` — **not** per-handler synthetic `*.test.ts`.

**Migration include list** (`vitest.migration.config.ts`): RTK module gates, fixture wiring, fixture regression debt, registered-handler coverage, synthetic debt, fixture corpus, project config, and script parity.

---

## 5. Handler correctness requirements (tg policy)

Scope: **currently registered handlers** in `src/handlers/index.ts`. Not a substitute for RTK module migration (§6–§11). Applies tg policy aligned with RTK principles in §2.

### 5.1 Root cause

Many tests historically asserted high token savings without output fidelity. Compression is acceptable only when **critical facts survive** (paths, changed lines, error codes, failure names).

| Command | Risk | Why it matters |
|---------|------|----------------|
| `grep -r` | Parser misses `file:content` | “0 matches” while data existed |
| `find` / `tree` / `ls` | Paths collapse to counts only | Agent loses file names |
| `git diff` | Hunk headers without `+`/`-` lines | Agent sees change without content |

**Policy:** No hard savings ceiling alone — require **content-fidelity** checks alongside savings where large output is tested.

### 5.2 P0: Content preservation

Every registered handler needs at least one test proving compressed output keeps core signal.

| Handler | Critical signal | Example assertion |
|---------|-----------------|-------------------|
| `search-like` | Match count + matched line | `expect(output).toContain("export const")` |
| `list-like` | File/dir names, not only counts | `expect(output).toContain("src/cli.ts")` |
| `read-like` | Representative content/symbols | `expect(output).toContain("function")` |
| `git-diff` | Changed lines + files | `expect(output).toMatch(/^[+-]\s+\S/m)` |
| `git-status` | Important changed paths | Compare path set |
| `git-log` | Subjects (small logs) | All subjects when count ≤ 5 |
| `git-branch` | Branch names (small lists) | All names when count ≤ 5 |
| `pytest` | Failure + location + assertion | `FAILED` / `AssertionError` |
| `ruff` | Rule code + location | `/[A-Z]\d{3}/` |
| `mypy` | Error code + location | `/\[[a-z][\w-]*\]/` |
| `tsc` | TS code + location | `/TS\d{4}/` |
| `eslint` | Rule + location | `/no-\w+/` |
| `js-test` | Failed test + message | Name + reason |
| `package-list` | Package names/versions | Representative entries |
| `gradle` / `maven` / `javac` | Task/failure + location | Task or file:line |
| `generic` | Error/failure lines | `/error|failed|fatal/i` |

**Verified today:** 42 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Current red:** `rg --json` does not preserve explicit JSON output. **Still missing:** multi-scenario depth per handler and several real-format regressions in `fixtureRegressionDebt`.

### 5.3 P0: Unknown format handling

Parser handlers must not turn non-empty raw output into empty or misleading summaries.

Required cases per parser handler:

- Canonical format
- Common alternate format
- Unrecognized non-empty format → passthrough or warning with enough original text

```typescript
test("unrecognized grep output is not silently dropped", async () => {
  const rawOutput = "unusual:format:that:does:not:match\n";
  const result = await filterWith("grep", ["-r", "pattern", "src"], rawFrom(rawOutput));

  expect(result.output).not.toMatch(/0 across 0 files/);
  expect(result.output.length).toBeGreaterThan(0);
});
```

RTK grep uses a canonical NUL-separated format; `None` on non-canonical lines is **not** a general tg passthrough guarantee — tg needs explicit contract tests.

### 5.4 P1: Small output reasonableness

| Handler | Condition | Expected |
|---------|-----------|----------|
| `git-log` | commits ≤ 5 | All subjects; no noisy expansion |
| `git-branch` | branches ≤ 5 | All branch names |
| `list-like` | files ≤ 10 | Names listed, not only counts |
| `search-like` | matches ≤ 5 | All matches; no `Hidden:` |
| `generic` | small output | Passthrough unless filter adds value |

### 5.5 P1: Real fixture target map

| Fixture | Handler |
|---------|---------|
| `common/rg_many_matches.txt` | `search-like` |
| `common/grep_no_line_numbers.txt` | `search-like` (alt) |
| `common/ls_large_project.txt` | `list-like` |
| `common/cat_large_ts.txt` | `read-like` |
| `git/status_dirty.txt` | `git-status` |
| `git/diff_large.txt` | `git-diff` |
| `git/log_many.txt` | `git-log` |
| `git/branch_many.txt` | `git-branch` |
| `python/pytest_failed.txt` | `pytest` |
| `python/ruff_many.txt` | `ruff` |
| `python/mypy_many.txt` | `mypy` |
| `python/pip_list_large.txt` | `pip` |
| `js/eslint_many.txt` | `eslint` |
| `js/tsc_many.txt` | `tsc` |
| `js/vitest_failed.txt` | `js-test` |
| `js/npm_list_large.txt` | `package-list` |
| `java/maven_test_failed.txt` | `maven` |
| `java/gradle_test_failed.txt` | `gradle` |
| `java/javac_errors.txt` | `javac` |

**Previously orphaned rows now wired:** `rg_default_format.txt`, `log_standard.txt`, `show_large.txt`, `status_dirty_extended.txt`, `pytest_passed.txt`, `jest_failed.txt`; commands `tree`, `ls`, `pnpm list`. Add new real fixtures only when they express behavior, not file-count progress.

### 5.6 P2: Output size and raw roundtrip

- **Meaningful body:** `stripStructuralHeaders(output).length > 10` — safety net; prefer handler-specific assertions.
- **`--raw`:** stdout/stderr must match bare command; integration covers broadly; add focused regressions when execution changes.

### 5.7 RTK test patterns (per existing handler)

Mirror RTK per-command categories; each must be **fixture-backed in `fixtureCases.ts`** to count as product fidelity coverage:

| Pattern | tg expectation |
|---------|----------------|
| Format variants | Separate tests per output format |
| Empty output | No throw; sensible message |
| stderr-only | Error text preserved |
| Clean/success | No inflation vs raw |
| Large → savings | Real fixture; critical content kept |
| Small passthrough | Not larger than raw + small overhead |
| Content preservation | Critical strings survive |
| Malformed input | Skip gracefully; no crash |

Synthetic global contracts were removed — add fixtureCases rows or regression-debt tests instead.

---

## 6. RTK module → tg handler map

```
RTK file                                  tg handler                         tg coverage
────────────────────────────────────────────────────────────────────────────────────────────────────────────
src/cmds/system/ls.rs                     listLike.ts                        fixtureCases + fixtureContent
src/cmds/system/tree.rs                   listLike.ts                        fixtureCases + fixtureContent
src/cmds/system/read.rs                   readLike.ts                        fixtureCases + fixtureContent
src/cmds/system/find_cmd.rs               listLike.ts                        fixtureCases + fixtureContent
src/cmds/system/grep_cmd.rs               searchLike.ts                      fixtureCases + fixtureContent
src/cmds/system/log_cmd.rs                ─                                  ─
src/cmds/system/json_cmd.rs               ─                                  ─
src/cmds/system/env_cmd.rs                ─                                  ─
src/cmds/system/wc_cmd.rs                 ─                                  ─
src/cmds/system/format_cmd.rs             ─                                  ─
src/cmds/system/pipe_cmd.rs               ─                                  ─
src/cmds/system/local_llm.rs              ─                                  ─
src/cmds/git/git.rs                       git/{status,diff,log,branch,show,extended}  fixtureCases + regression debt
src/cmds/git/diff_cmd.rs                  ─ (no two-file diff handler)       ─
src/cmds/git/gh_cmd.rs                    hostingCli.ts                      fixtureContent.test.ts
src/cmds/git/glab_cmd.rs                  hostingCli.ts                      fixtureContent.test.ts
src/cmds/git/gt_cmd.rs                    ─                                  ─
src/cmds/js/npm_cmd.rs                    packageList.ts                     fixtureCases + fixtureContent
src/cmds/js/pnpm_cmd.rs                   packageList.ts                     fixtureCases + fixtureContent
src/cmds/js/tsc_cmd.rs                    tsc.ts                             fixtureCases + fixtureContent
src/cmds/js/vitest_cmd.rs                 test.ts                            fixtureCases + fixtureContent
src/cmds/js/lint_cmd.rs                   eslint.ts                          fixtureCases + fixtureContent
src/cmds/js/prettier_cmd.rs               ─                                  ─
src/cmds/js/next_cmd.rs                   ─                                  ─
src/cmds/js/playwright_cmd.rs             ─                                  ─
src/cmds/js/prisma_cmd.rs                 ─                                  ─
src/cmds/python/pytest_cmd.rs             pytest.ts                          fixtureCases + fixtureContent
src/cmds/python/ruff_cmd.rs               ruff.ts                            fixtureCases + fixtureContent
src/cmds/python/mypy_cmd.rs               mypy.ts                            fixtureCases + fixtureContent
src/cmds/python/pip_cmd.rs                pip.ts                             fixtureCases + fixtureContent
src/cmds/jvm/gradlew_cmd.rs               gradle.ts                          fixtureCases + fixtureContent
src/cmds/dotnet/* (4 modules)             ─                                  ─
src/cmds/cloud/*                          ─                                  ─
src/cmds/go/*                             ─                                  ─
src/cmds/rust/*                           ─                                  ─
src/cmds/ruby/*                           ─                                  ─
(tg-only)                                 maven.ts, javac.ts, generic.ts     fixtureCases / core tests
```

---

## 7. RTK scripts → tg scripts

```
RTK script                              tg script                          Status
──────────────────────────────────────────────────────────────────────────────
scripts/test-all.sh                     tests/smoke/smoke.sh                 ✅
scripts/check-test-presence.sh          scripts/check-test-presence.sh      ✅
scripts/validate-docs.sh                scripts/validate-docs.sh            ✅
scripts/check-installation.sh           scripts/check-installation.sh       ✅
scripts/test-install.sh                 scripts/test-install.sh             ✅
scripts/benchmark.sh                    scripts/benchmark.sh                ✅
scripts/update-readme-metrics.sh        scripts/update-readme-metrics.sh    ✅
scripts/benchmark/ (TypeScript)         ─                                   ❌
scripts/benchmark-sessions/runner.py    ─                                   ❌
scripts/test-ruby.sh                    ─                                   ❌ (no ruby handler)
package.json test:ci                    vitest + guards + smoke             ✅ (when vitest green)
```

Out of scope unless product changes: `rtk-economics.sh`, `test-tracking.sh`, `test-aristote.sh`, openclaw, hooks.

---

## 8. RTK inline test inventory (selected gaps)

Full RTK total: **986** `#[test]` in **47** modules. tg `test()` counts below are per-file mappings — **do not sum**.

```
RTK module              RTK #[test]   tg test()   State
────────────────────────────────────────────────────────
system/ls.rs                 29           11       partial via listLike
system/find_cmd.rs           29           11       partial via listLike
system/grep_cmd.rs           23           20       partial
system/pipe_cmd.rs           38            0       no handler
git/git.rs                   75           71       partial
git/diff_cmd.rs              19            0       no dedicated handler
git/gh_cmd.rs                66           41       partial via hostingCli
git/glab_cmd.rs              62           41       partial via hostingCli
jvm/gradlew_cmd.rs           56           11       high gap; RTK gradlew fixtures ported, behavior depth still shallow
cloud/aws_cmd.rs             82            0       no handler
dotnet/dotnet_cmd.rs         66            0       no handler
rust/cargo_cmd.rs            48            0       no handler
```

### RTK internal test categories → tg

| RTK category | tg coverage |
|--------------|-------------|
| Argument parsing (find/grep/git) | ❓ `parse.test.ts` = tg flags only |
| Grep format flags | ✅ partial in searchLike |
| Diff compaction / hunk limits | ❓ diff.test partial; diff_cmd 19 tests unmigrated |
| Git extended subcommands | ✅ handlers; ❓ fixtureCases incomplete |
| Pipe chaining | ❌ no handler |
| Gradlew variants + fixtures | ❓ high gap |
| Tree filter | ❓ via listLike, not dedicated |

---

## 9. RTK fixtures → tg fixtures

```
RTK / tg fixture area                    Status
─────────────────────────────────────────────────
tests/fixtures/* (tg-owned, ~25 files)   ✅ on disk; subset in fixtureCases
tests/fixtures/java/gradle*              ✅ RTK gradlew corpus ported
tests/fixtures/dotnet/*                  N/A until dotnet handler exists
tests/fixtures/go/golangci_v2_json.txt   ✅ ported
tests/fixtures/git/glab_*                ✅ RTK glab corpus ported
```

---

## 10. RTK CI / config → tg

```
RTK config                    tg equivalent                    Status
────────────────────────────────────────────────────────────────────
.claude/rules/cli-testing.md  ─                                ❌
.github/workflows/            ─                                ❌
src/core/* tests              tests/unit/{ansi,savings,...}    ✅
integration                   tests/integration/cli.test.ts  ✅
handler fidelity              fixtureContent.test.ts          ✅ product
```

---

## 11. Audit results (condensed)

| Area | Status | Notes |
|------|--------|-------|
| system ls/find/grep/read/tree | ❓ | Partial; not 1:1 with RTK inline tests |
| system log/json/env/wc/format/pipe/llm | ❌ | No handler |
| git core + extended | ❓ | Fixture-backed coverage exists; alternate formats still red in regression debt |
| git diff_cmd, gt | ❌ | No dedicated coverage |
| gh/glab | ❓ | Fixture-backed coverage exists; RTK depth not fully mapped |
| js/python/java mapped handlers | ❓ | Core scenarios; not full RTK parity |
| js prettier/next/playwright/prisma | ❌ | No handler |
| dotnet/cloud/go/rust/ruby | ❌ | No handler |
| gradlew fixtures | ✅ | RTK corpus ported |
| tg-only maven/javac/generic | ✅ | No RTK module |
| Verified CI green | ❌ | `fixtureContent` has intentional `rg --json` red; migration gates in §4 also red |
| Synthetic test debt | ✅ | 23 files deleted; guard remains |
| benchmark TS + sessions + test-ruby | ❌ | rtkScriptParity |
| GitHub CI + cli-testing.md | ❌ | projectConfig |

### Unacceptable gaps (29 RTK modules — no handler AND no migration test)

**Cloud:** aws, curl, psql, wget, docker/kubectl  
**JS:** prettier, next, playwright, prisma  
**Languages:** go, golangci-lint, cargo/rust runner, ruby (rake/rspec/rubocop)  
**.NET:** dotnet_cmd, binlog, trx, format_report  
**Git:** gt; dedicated `diff_cmd` two-file diff  
**System:** log, json, env, wc, format, pipe, local_llm  

### Implemented but severely under-tested

| Area | RTK | tg | Severity |
|------|-----|-----|----------|
| gradlew | 56 tests, 6 fixtures | fixture corpus ported, behavior still shallow | **high** |
| diff_cmd | 19 inline tests | 0 dedicated | **high** |
| git.rs | 75 inline tests | fixture-backed subset + regression debt | medium |
| readLike / tree | 8 / 6 RTK | fixture-backed subset via listLike/readLike | medium |

### Relatively complete (product bar only)

- **42 `fixtureCases`** fidelity scenarios
- **Core** unit + **integration/cli** smoke path
- **Ported** shell scripts (§7 ✅ rows)
- **tg-owned** fixture files on disk; current known orphaned fixture wiring cleared

---

## 12. Which question each artifact answers

| Artifact | Question |
|----------|----------|
| **This file** | Full picture: RTK principles (§2), per-file verdicts (§3.5), gates (§4), migration gaps |
| `tests/helpers/fixtureCases.ts` | Executable fidelity scenarios for product tests |
| `tests/unit/handlers/fixtureContent.test.ts` | Runs product fixtureCases fidelity checks |
| `tests/unit/handlers/fixtureWiring.test.ts` | Tracks fixtureCases wiring debt |
| `tests/unit/handlers/fixtureRegressionDebt.test.ts` | Tracks real fixture regressions that must stay red until implementation catches up |
| `tests/unit/handlers/rtkDomainCaseParity.test.ts` | Per-module migration completeness |
| `tests/unit/handlers/registeredHandlerCoverage.test.ts` | Every handler has fixtureCases |
| `tests/unit/handlers/syntheticTestDebt.test.ts` | No leftover synthetic handler tests |
| `docs/migration-goal-prompt.md` | Agent prompt for closing RTK gaps |

---

## 13. Priority work order

### A — Make red/green signals honest (correctness)

#### A.0 — Deepen existing handler coverage (highest ROI among already-covered handlers)

Before building new handlers or porting new fixtures, fix the "wide but shallow" problem in already-registered handlers:

1. **J — Malformed / alternate format input for git status and diff** (started in `fixtureRegressionDebt`)
   - `git status --short` and `git status --porcelain -b` currently lose paths and branch
   - `git diff --stat` currently reports zero changed files

2. **J — Malformed input for git/diff and list-like** (2 cases, &lt; 1 hour)
   - `formatDiff()` receiving non-standard diff output → should not crash or produce empty summary
   - `summarizeListing()` receiving garbled lines → skip gracefully

3. **A depth — Per-handler output variants** (pick 3–5 highest-impact handlers, 4–6 hours)
   - git-status: clean tree, staged-only, conflicts, renamed files as fixtureCases or regression debt
   - git-diff: single-file, multi-file, no-change diff
   - tsc: multi-error, clean compile
   - eslint: multi-rule, clean run
   - pytest: mixed pass/fail, clean run

#### A.1 — FixtureCases completeness

1. Add `fixtureCases` rows for **every** registered handler. **Done for at least one P0 row each.**
2. Wire **orphaned fixtures** and commands (`tree`, `ls`, `pnpm`, `rg_default`, …). **Done for current known fixtures.**
3. Port or **delete** ~23 synthetic handler tests (`syntheticTestDebt` green). **Done.**
4. Add **P0** unknown-format and **P1** small-output tests into `fixtureCases` (not only savings %). **Started:** grep `-c`/`-l`, `rg --json`, small `find`, small `git branch`.

### B — Migration completeness (RTK parity)

1. New handlers for **29** missing RTK command modules (§11).
2. Deepen existing handlers toward RTK inline categories (§5.7, §8) with real fixtures.
3. Port **dotnet** fixture corpora only after dotnet handlers exist; gradlew/glab/golangci corpora are already ported.

### C — Infrastructure

1. `scripts/benchmark/` TS suite + `benchmark-sessions` + `test-ruby.sh`.
2. `.github/workflows/ci.yml` + port/adapt CLI testing guide (`projectConfig` gate).

### D — Agent sessions

Use `docs/migration-goal-prompt.md` per module; mark progress here and in gate tests — not manual ✅ in tables alone.

---

## 14. Success criteria (repo-wide)

Migration and testing are **complete** when:

- [ ] `pnpm test:product` passes
- [ ] `pnpm test:migration` passes
- [ ] `pnpm test:ci` passes
- [ ] **0** RTK command modules without tg handler + fixture-backed coverage
- [ ] **0** unported synthetic handler tests
- [ ] Every registered handler: P0 fidelity + (where applicable) unknown-format + real fixture in `fixtureCases`
- [ ] **Per RTK module:** coverage matrix §2.9 complete (every `#[test]` mapped to fixtureCases or unit test; no open rows)
- [ ] RTK fixture corpora ported or N/A with handler present
- [ ] CI workflow and testing docs present

**Current:** NOT COMPLETE.
