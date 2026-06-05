# tk vs rtk — Three-Way Comparison

Generated: 2026-06-05
Project: `token-killer` (/Users/ziyu/Workspace/token-killer)
Scope: 76 cases with full outputs (43 live, 39 fixture-backed); 6 large cases stats-only (raw > 3000 tokens)
rtk: rtk 0.42.1

**Method**
- **raw (live)**: underlying command stdout+stderr (`git --no-pager` for git)
- **raw (fixture)**: recorded stdout in `tests/fixtures/**`
- **tk (live)**: `node dist/cli.js <command>`
- **tk (fixture)**: handler filter on fixture stdout (same pipeline as product tests)
- **rtk (live)**: mapped native `rtk` subcommand
- **rtk (fixture)**: `cat <fixture> | rtk …` when stdin filter exists (see per-case RTK cmd)
- **rtk (wrapper)**: err/summary/deps/smart read a command/file/dir, so the fixture is fed via `rtk <sub> "cat <fixture>"`, `rtk smart <fixture>`, or `rtk deps <tmpdir>` (see per-case RTK cmd)
- **rtk (unsupported)**: tk-only handlers rtk has no filter for (e.g. terraform) are shown as rtk raw passthrough (0% savings)
- **savingsPct**: token estimate vs raw (`ceil(chars/4)`), same as tk core
- **Sort**: cases ordered by |tk savingsPct − rtk savingsPct| (largest gap first)
- **Large outputs**: cases with raw > 3000 tokens listed under “Omitted large outputs” (no full text)

## Summary

| # | Case | Handler | raw | tk | rtk | tk savings | rtk savings | Δ |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | git-commit: dry-run | git-commit | 664 | 664 | 1 | 0% | 99.8% | 99.8pp rtk +99.8pp |
| 2 | wget: example.com head | wget | 132 | 6 | 132 | 95.5% | 0% | 95.5pp tk +95.5pp |
| 3 | [fixture] kubectl get pods summarizes readiness and crashloop issues | kubectl | 147 | 29 | 147 | 80.3% | 0% | 80.3pp tk +80.3pp |
| 4 | git-stash: invalid ref | git-stash | 12 | 12 | 3 | 0% | 75% | 75.0pp rtk +75.0pp |
| 5 | [fixture] terraform plan keeps resource changes and plan summary | terraform | 436 | 203 | 436 | 53.4% | 0% | 53.4pp tk +53.4pp |
| 6 | [fixture] psql table format emits tab-separated rows | psql | 91 | 48 | 1 | 47.3% | 98.9% | 51.6pp rtk +51.6pp |
| 7 | [fixture] js-test keeps failed test and assertion from Vitest fixture | js-test | 49 | 46 | 21 | 6.1% | 57.1% | 51.0pp rtk +51.0pp |
| 8 | [fixture] gt log keeps the stack graph but strips author emails | gt | 55 | 48 | 20 | 12.7% | 63.6% | 50.9pp rtk +50.9pp |
| 9 | [fixture] terraform test keeps failed run and assertion | terraform | 132 | 77 | 132 | 41.7% | 0% | 41.7pp tk +41.7pp |
| 10 | prettier: check package.json | generic | 17 | 17 | 10 | 0% | 41.2% | 41.2pp rtk +41.2pp |
| 11 | [fixture] pip keeps package problems from fixture | pip | 32 | 46 | 19 | 0% | 40.6% | 40.6pp rtk +40.6pp |
| 12 | [fixture] list-like keeps useful paths from real project listing | list-like | 31 | 21 | 45 | 32.3% | 0% | 32.3pp tk +32.3pp |
| 13 | [fixture] git-log keeps standard commit subjects | git-log | 119 | 84 | 47 | 29.4% | 60.5% | 31.1pp rtk +31.1pp |
| 14 | eslint: eslint package.json | eslint | 126 | 8 | 39 | 93.7% | 69% | 24.7pp tk +24.7pp |
| 15 | glab: mr list | glab | 128 | 106 | 128 | 17.2% | 0% | 17.2pp tk +17.2pp |
| 16 | [fixture] smart keeps the summary payload without prompt boilerplate | smart | 20 | 9 | 12 | 55% | 40% | 15.0pp tk +15.0pp |
| 17 | [fixture] find groups matches by directory like RTK | list-like | 16 | 14 | 23 | 12.5% | 0% | 12.5pp tk +12.5pp |
| 18 | [fixture] js-test keeps failed Jest test name from fixture | js-test | 36 | 32 | 36 | 11.1% | 0% | 11.1pp tk +11.1pp |
| 19 | format: format --check | format | 32 | 7 | 10 | 78.1% | 68.8% | 9.3pp tk +9.3pp |
| 20 | [fixture] glab mr list keeps merge request identity and branches | glab | 2366 | 200 | 0 | 91.5% | 100% | 8.5pp rtk +8.5pp |
| 21 | list-like: ls -la . | ls | 390 | 121 | 90 | 69% | 76.9% | 7.9pp rtk +7.9pp |
| 22 | js-test: vitest run savings test | js-test | 53 | 8 | 5 | 84.9% | 90.6% | 5.7pp rtk +5.7pp |
| 23 | [fixture] find small output keeps root files without excessive growth | list-like | 41 | 39 | 48 | 4.9% | 0% | 4.9pp tk +4.9pp |
| 24 | [fixture] npx tsc routes through the TypeScript filter | npx | 309 | 292 | 302 | 5.5% | 2.3% | 3.2pp tk +3.2pp |
| 25 | [fixture] tsc keeps TypeScript diagnostic codes from fixture | tsc | 309 | 292 | 302 | 5.5% | 2.3% | 3.2pp tk +3.2pp |
| 26 | [fixture] git-status keeps extended dirty status paths | git-status | 46 | 46 | 45 | 0% | 2.2% | 2.2pp rtk +2.2pp |
| 27 | [fixture] deps summarizes a package.json manifest | deps | 52 | 33 | 34 | 36.5% | 34.6% | 1.9pp tk +1.9pp |
| 28 | [fixture] git-diff keeps changed lines from real diff | git-diff | 64 | 46 | 45 | 28.1% | 29.7% | 1.6pp rtk +1.6pp |
| 29 | json: json package.json | json | 0 | 6 | 277 | 0% | 0% | 0.0pp ≈ |
| 30 | search-like: rg export src/ | search-like | 2540 | 2540 | 2647 | 0% | 0% | 0.0pp ≈ |
| 31 | [fixture] search-like keeps rg default format matches | search-like | 62 | 68 | 85 | 0% | 0% | 0.0pp ≈ |
| 32 | [fixture] ruff keeps rule codes and file locations from fixture | ruff | 49 | 49 | 65 | 0% | 0% | 0.0pp ≈ |
| 33 | [fixture] search-like keeps rg matches from real output | search-like | 29 | 29 | 43 | 0% | 0% | 0.0pp ≈ |
| 34 | [fixture] summary digests a test run instead of replaying lines | summary | 24 | 45 | 57 | 0% | 0% | 0.0pp ≈ |
| 35 | tsc: type error in temp file | tsc | 41 | 50 | 59 | 0% | 0% | 0.0pp ≈ |
| 36 | diff: diff old.ts new.ts | diff | 8 | 49 | 57 | 0% | 0% | 0.0pp ≈ |
| 37 | git-fetch: missing remote | git-fetch | 51 | 63 | 55 | 0% | 0% | 0.0pp ≈ |
| 38 | tsc: tsc --noEmit clean project | tsc | 0 | 0 | 7 | 0% | 0% | 0.0pp ≈ |
| 39 | git-add: missing path | git-add | 18 | 18 | 22 | 0% | 0% | 0.0pp ≈ |
| 40 | git-pull: ff-only local | git-pull | 40 | 40 | 44 | 0% | 0% | 0.0pp ≈ |
| 41 | git-push: dry-run local | git-push | 14 | 17 | 21 | 0% | 0% | 0.0pp ≈ |
| 42 | [fixture] diff stdin condenses unified diff by file | diff | 97 | 28 | 28 | 71.1% | 71.1% | 0.0pp ≈ |
| 43 | [fixture] diff stdin keeps all unified diff changes | diff | 70 | 56 | 56 | 20% | 20% | 0.0pp ≈ |
| 44 | [fixture] err keeps error blocks and drops info noise | err | 27 | 19 | 19 | 29.6% | 29.6% | 0.0pp ≈ |
| 45 | [fixture] gh repo view keeps repository identity and URL | gh | 42 | 23 | 23 | 45.2% | 45.2% | 0.0pp ≈ |
| 46 | [fixture] git-log keeps commit subject from real log | git-log | 31 | 31 | 31 | 0% | 0% | 0.0pp ≈ |
| 47 | [fixture] git-status keeps porcelain branch context | git-status | 190 | 190 | 190 | 0% | 0% | 0.0pp ≈ |
| 48 | [fixture] git-status keeps staged modified and untracked paths | git-status | 21 | 20 | 20 | 4.8% | 4.8% | 0.0pp ≈ |
| 49 | [fixture] git-worktree keeps worktree path and branch | git-worktree | 18 | 16 | 16 | 11.1% | 11.1% | 0.0pp ≈ |
| 50 | [fixture] js-test formats passing Vitest output like RTK | js-test | 34 | 8 | 8 | 76.5% | 76.5% | 0.0pp ≈ |
| 51 | [fixture] log deduplicates repeated lines into a summary | log | 148 | 98 | 98 | 33.8% | 33.8% | 0.0pp ≈ |
| 52 | [fixture] mypy keeps error codes and file locations from fixture | mypy | 55 | 79 | 79 | 0% | 0% | 0.0pp ≈ |
| 53 | [fixture] pipe grep groups matches by file | pipe | 85 | 84 | 84 | 1.2% | 1.2% | 0.0pp ≈ |
| 54 | [fixture] prettier check lists files needing formatting | prettier | 60 | 59 | 59 | 1.7% | 1.7% | 0.0pp ≈ |
| 55 | [fixture] pytest keeps failing test and assertion from fixture | pytest | 220 | 88 | 88 | 60% | 60% | 0.0pp ≈ |
| 56 | [fixture] pytest keeps passing summary from fixture | pytest | 5 | 5 | 5 | 0% | 0% | 0.0pp ≈ |
| 57 | [fixture] search-like keeps grep matches without line numbers | search-like | 395 | 395 | 395 | 0% | 0% | 0.0pp ≈ |
| 58 | curl: httpbin json | curl | 41 | 41 | 41 | 0% | 0% | 0.0pp ≈ |
| 59 | docker: compose ps (temp project) | docker | 29 | 29 | 29 | 0% | 0% | 0.0pp ≈ |
| 60 | env: env snapshot | env | 1425 | 590 | 590 | 58.6% | 58.6% | 0.0pp ≈ |
| 61 | generic: echo hello | generic | 2 | 2 | 2 | 0% | 0% | 0.0pp ≈ |
| 62 | gh: gh repo view | gh | 15 | 23 | 23 | 0% | 0% | 0.0pp ≈ |
| 63 | git-branch: git branch | git-branch | 9 | 9 | 9 | 0% | 0% | 0.0pp ≈ |
| 64 | git-log: git log --oneline -10 | git-log | 191 | 191 | 191 | 0% | 0% | 0.0pp ≈ |
| 65 | git-show: git show -1 --stat | git-show | 315 | 315 | 315 | 0% | 0% | 0.0pp ≈ |
| 66 | git-status: git status | git-status | 664 | 445 | 445 | 33% | 33% | 0.0pp ≈ |
| 67 | git-worktree: git worktree list | git-worktree | 18 | 16 | 16 | 11.1% | 11.1% | 0.0pp ≈ |
| 68 | gt: gt log | gt | 21 | 20 | 20 | 4.8% | 4.8% | 0.0pp ≈ |
| 69 | list-like: find src -name *.ts | list-like | 463 | 166 | 166 | 64.1% | 64.1% | 0.0pp ≈ |
| 70 | log: log repeated app fixture | log | 183 | 98 | 98 | 46.4% | 46.4% | 0.0pp ≈ |
| 71 | mypy: mypy src/handlers/index.ts | mypy | 30 | 33 | 33 | 0% | 0% | 0.0pp ≈ |
| 72 | package-list: pnpm list --depth=0 | package-list | 75 | 46 | 46 | 38.7% | 38.7% | 0.0pp ≈ |
| 73 | pytest: pytest --collect-only | pytest | 36 | 7 | 7 | 80.6% | 80.6% | 0.0pp ≈ |
| 74 | read-like: cat package.json | read | 320 | 320 | 320 | 0% | 0% | 0.0pp ≈ |
| 75 | read-like: cat src/cli.ts | read | 818 | 818 | 818 | 0% | 0% | 0.0pp ≈ |
| 76 | wc: wc README.md | wc | 9 | 4 | 4 | 55.6% | 55.6% | 0.0pp ≈ |

**Aggregate (token-weighted across 76 cases with full outputs):**
- raw: 14943 tokens
- tk: 9900 tokens (33.7% savings)
- rtk: 9944 tokens (33.5% savings)

### Omitted large outputs (stats only)

Per-case dumps excluded when raw exceeds 3000 tokens.

| Case | Handler | raw | tk | rtk | tk savings | rtk savings | Δ |
|---|---|---:|---:|---:|---:|---:|---:|
| git-diff: git diff HEAD~1 | git-diff | 53311 | 7653 | 8205 | 85.6% | 84.6% | 1.0pp tk +1.0pp |
| ruff: ruff check src/handlers/index.ts | ruff | 24609 | 954 | 1164 | 96.1% | 95.3% | 0.8pp tk +0.8pp |
| list-like: tree . | tree | 37641 | 5272 | 5272 | 86% | 86% | 0.0pp ≈ |
| pip: pip list | pip | 4295 | 1924 | 1924 | 55.2% | 55.2% | 0.0pp ≈ |
| read-like: cat docs/DESIGN.md | read | 10994 | 10994 | 10994 | 0% | 0% | 0.0pp ≈ |
| search-like: grep -r import src/ | search-like | 5536 | 4110 | 4110 | 25.8% | 25.8% | 0.0pp ≈ |

### Skipped cases

- [fixture] rg --json respects explicit machine-readable output: rg --json is explicit machine-readable output
- [fixture] grep -c respects explicit count format output: no fixture-safe rtk stdin mapping
- [fixture] grep -l respects explicit file-list format output: no fixture-safe rtk stdin mapping
- [fixture] tree preserves hierarchy and strips the summary line (RTK tree.rs): no fixture-safe rtk stdin mapping
- [fixture] ls compacts ls -la long format with octal perms and sizes (RTK ls.rs): no fixture-safe rtk stdin mapping
- [fixture] read keeps source symbols at the default filter level (RTK read.rs): no fixture-safe rtk stdin mapping
- [fixture] read-like keeps concatenated multi-file content: no fixture-safe rtk stdin mapping
- [fixture] diff keeps file metadata and aligned LCS insertion: no fixture-safe rtk stdin mapping
- [fixture] git-show keeps commit metadata and recovery hint: no fixture-safe rtk stdin mapping
- [fixture] git-branch keeps current and nearby branch names: no fixture-safe rtk stdin mapping
- [fixture] git-branch small output passes through branch names: no fixture-safe rtk stdin mapping
- [fixture] git-add preserves missing path failures: no fixture-safe rtk stdin mapping
- [fixture] git-commit preserves dry-run dirty tree details: no fixture-safe rtk stdin mapping
- [fixture] git-push keeps dry-run pushed ref target: no fixture-safe rtk stdin mapping
- [fixture] git-pull preserves unstaged-change failure: no fixture-safe rtk stdin mapping
- [fixture] git-fetch preserves missing remote failure: no fixture-safe rtk stdin mapping
- [fixture] git-stash preserves invalid ref failure: no fixture-safe rtk stdin mapping
- [fixture] eslint keeps rule names and source locations from fixture: no fixture-safe rtk stdin mapping
- [fixture] package-list keeps invalid missing and peer dependency problems: no fixture-safe rtk stdin mapping
- [fixture] package-list keeps pnpm invalid missing and peer dependency problems: no fixture-safe rtk stdin mapping
- [fixture] package-list formats pnpm depth zero like RTK deps: no fixture-safe rtk stdin mapping
- [fixture] maven keeps failing test and summary from fixture: no fixture-safe rtk stdin mapping
- [fixture] gradle keeps failed task test and user frame from fixture: no fixture-safe rtk stdin mapping
- [fixture] javac keeps compiler diagnostics from fixture: no fixture-safe rtk stdin mapping
- [fixture] curl preserves a large JSON body without truncation: rtk invokes network fetch; see live curl/wget cases
- [fixture] read-like keeps source symbols for less: no fixture-safe rtk stdin mapping
- [fixture] format summarizes prettier files needing formatting: no fixture-safe rtk stdin mapping
- [fixture] next build summarizes routes and bundles: no fixture-safe rtk stdin mapping
- [fixture] npm install strips WARN and notice noise: no fixture-safe rtk stdin mapping
- [fixture] prisma migrate deploy counts applied migrations: no fixture-safe rtk stdin mapping
- [fixture] playwright JSON reporter collapses to compact pass summary: no fixture-safe rtk stdin mapping
- [fixture] aws cloudformation describe-stacks compacts to name/status/outputs: rtk aws filter does not accept fixture stdin reliably
- [fixture] wget reduces a download transcript to one result line: rtk invokes network fetch; see live curl/wget cases
- [fixture] docker compose ps compacts services and shortens images: rtk docker compose ps does not read fixture stdin; see live docker case
- [fixture] wc single file compacts to L/W/B counts: no fixture-safe rtk stdin mapping
- [fixture] env groups variables and masks secrets: no fixture-safe rtk stdin mapping
- [fixture] json compacts a package response with sorted keys: no fixture-safe rtk stdin mapping
- [fixture] test extracts cargo failures and summary: rtk test detects the framework from the executed command string; feeding fixture stdin via `cat` falls to the generic branch (not comparable)
- [fixture] dotnet test keeps failures and strips restore boilerplate: rtk dotnet needs a real project / TRX file; no fixture stdin mapping

---

## Per-case outputs

### 1. git-commit: dry-run

- Handler: `git-commit`
- tk: `tk git commit --dry-run`
- raw: `git --no-pager commit --dry-run`
- rtk: `git commit --dry-run`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 2655 | 664 | 0% |
| tk | 2654 | 664 | 0% |
| rtk | 3 | 1 | 99.8% |

**raw** (2655 chars, 664 tokens):

```text
On branch codex/token-killer-node-cli
Your branch is up to date with 'origin/codex/token-killer-node-cli'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	renamed:    tests/unit/handlers/rtkCargoBehavior.test.ts -> tests/out-of-scope/rtkCargoBehavior.test.ts
	renamed:    tests/unit/handlers/rtkGoBehavior.test.ts -> tests/out-of-scope/rtkGoBehavior.test.ts
	renamed:    tests/unit/handlers/rtkGolangciBehavior.test.ts -> tests/out-of-scope/rtkGolangciBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRakeBehavior.test.ts -> tests/out-of-scope/rtkRakeBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRspecBehavior.test.ts -> tests/out-of-scope/rtkRspecBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRubocopBehavior.test.ts -> tests/out-of-scope/rtkRubocopBehavior.test.ts

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   README.md
	modified:   docs/DESIGN.md
	modified:   docs/align-rtk-divergences.md
	modified:   docs/three-way-comparison.md
	modified:   scripts/check-test-presence.sh
	modified:   scripts/fixtureComparison.ts
	modified:   scripts/generate-three-way-report.ts
	modified:   scripts/validate-docs.sh
	modified:   src/handlers/base.ts
	modified:   src/handlers/index.ts
	modified:   src/handlers/js/tsc.ts
	modified:   tests/helpers/fixtureCases.ts
	modified:   tests/out-of-scope/rtkCargoBehavior.test.ts
	modified:   tests/out-of-scope/rtkGoBehavior.test.ts
	modified:   tests/out-of-scope/rtkGolangciBehavior.test.ts
	modified:   tests/out-of-scope/rtkRakeBehavior.test.ts
	modified:   tests/out-of-scope/rtkRspecBehavior.test.ts
	modified:   tests/out-of-scope/rtkRubocopBehavior.test.ts
	modified:   tests/smoke/smoke.sh
	modified:   tests/unit/handlers/rtkSmartBehavior.test.ts
	modified:   tests/unit/rtkScriptParity.test.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	CONTEXT.md
	docs/adr/
	docs/layer2-hook-protocol-spike.md
	docs/layer2-hooks-inspect-goal.md
	docs/parity-completion-goal.md
	scripts/benchmark-sessions/
	scripts/benchmark/
	src/handlers/dotnet/
	src/handlers/iac/
	src/handlers/system/deps.ts
	src/handlers/system/err.ts
	src/handlers/system/npx.ts
	src/handlers/system/smart.ts
	src/handlers/system/summary.ts
	src/handlers/system/testRunner.ts
	tests/fixtures/dotnet/
	tests/fixtures/system/deps_package.json
	tests/fixtures/system/err_build.txt
	tests/fixtures/system/smart_summary.txt
	tests/fixtures/system/summary_test_run.txt
	tests/fixtures/system/test_cargo.txt
	tests/fixtures/terraform/


```

**tk** (2654 chars, 664 tokens, 0% savings):

```text
On branch codex/token-killer-node-cli
Your branch is up to date with 'origin/codex/token-killer-node-cli'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	renamed:    tests/unit/handlers/rtkCargoBehavior.test.ts -> tests/out-of-scope/rtkCargoBehavior.test.ts
	renamed:    tests/unit/handlers/rtkGoBehavior.test.ts -> tests/out-of-scope/rtkGoBehavior.test.ts
	renamed:    tests/unit/handlers/rtkGolangciBehavior.test.ts -> tests/out-of-scope/rtkGolangciBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRakeBehavior.test.ts -> tests/out-of-scope/rtkRakeBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRspecBehavior.test.ts -> tests/out-of-scope/rtkRspecBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRubocopBehavior.test.ts -> tests/out-of-scope/rtkRubocopBehavior.test.ts

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   README.md
	modified:   docs/DESIGN.md
	modified:   docs/align-rtk-divergences.md
	modified:   docs/three-way-comparison.md
	modified:   scripts/check-test-presence.sh
	modified:   scripts/fixtureComparison.ts
	modified:   scripts/generate-three-way-report.ts
	modified:   scripts/validate-docs.sh
	modified:   src/handlers/base.ts
	modified:   src/handlers/index.ts
	modified:   src/handlers/js/tsc.ts
	modified:   tests/helpers/fixtureCases.ts
	modified:   tests/out-of-scope/rtkCargoBehavior.test.ts
	modified:   tests/out-of-scope/rtkGoBehavior.test.ts
	modified:   tests/out-of-scope/rtkGolangciBehavior.test.ts
	modified:   tests/out-of-scope/rtkRakeBehavior.test.ts
	modified:   tests/out-of-scope/rtkRspecBehavior.test.ts
	modified:   tests/out-of-scope/rtkRubocopBehavior.test.ts
	modified:   tests/smoke/smoke.sh
	modified:   tests/unit/handlers/rtkSmartBehavior.test.ts
	modified:   tests/unit/rtkScriptParity.test.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	CONTEXT.md
	docs/adr/
	docs/layer2-hook-protocol-spike.md
	docs/layer2-hooks-inspect-goal.md
	docs/parity-completion-goal.md
	scripts/benchmark-sessions/
	scripts/benchmark/
	src/handlers/dotnet/
	src/handlers/iac/
	src/handlers/system/deps.ts
	src/handlers/system/err.ts
	src/handlers/system/npx.ts
	src/handlers/system/smart.ts
	src/handlers/system/summary.ts
	src/handlers/system/testRunner.ts
	tests/fixtures/dotnet/
	tests/fixtures/system/deps_package.json
	tests/fixtures/system/err_build.txt
	tests/fixtures/system/smart_summary.txt
	tests/fixtures/system/summary_test_run.txt
	tests/fixtures/system/test_cargo.txt
	tests/fixtures/terraform/

```

**rtk** (3 chars, 1 tokens, 99.8% savings):

```text
ok

```

---

### 2. wget: example.com head

- Handler: `wget`
- tk: `tk wget -q -O - https://example.com/`
- raw: `wget -q -O - https://example.com/`
- rtk: `wget -q -O - https://example.com/`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 528 | 132 | 0% |
| tk | 24 | 6 | 95.5% |
| rtk | 528 | 132 | 0% |

**raw** (528 chars, 132 tokens):

```text
<!doctype html><html lang="en"><head><title>Example Domain</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#eee;width:60vw;margin:15vh auto;font-family:system-ui,sans-serif}h1{font-size:1.5em}div{opacity:0.8}a:link,a:visited{color:#348}</style></head><body><div><h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p><p><a href="https://iana.org/domains/example">Learn more</a></p></div></body></html>

```

**tk** (24 chars, 6 tokens, 95.5% savings):

```text
example.com/ ok | - | ?

```

**rtk** (528 chars, 132 tokens, 0% savings):

```text
<!doctype html><html lang="en"><head><title>Example Domain</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#eee;width:60vw;margin:15vh auto;font-family:system-ui,sans-serif}h1{font-size:1.5em}div{opacity:0.8}a:link,a:visited{color:#348}</style></head><body><div><h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p><p><a href="https://iana.org/domains/example">Learn more</a></p></div></body></html>

```

---

### 3. [fixture] kubectl get pods summarizes readiness and crashloop issues

- Handler: `kubectl`
- tk: `tk filter kubectl get pods`
- raw: `fixture: tests/fixtures/cloud/kubectl_get_pods.json`
- rtk: `cat tests/fixtures/cloud/kubectl_get_pods.json | rtk kubectl get pods -o json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 586 | 147 | 0% |
| tk | 115 | 29 | 80.3% |
| rtk | 586 | 147 | 0% |

**raw** (586 chars, 147 tokens):

```text
{
  "items": [
    {
      "metadata": { "namespace": "default", "name": "web-1" },
      "status": { "phase": "Running", "containerStatuses": [{ "restartCount": 0 }] }
    },
    {
      "metadata": { "namespace": "default", "name": "api-123" },
      "status": {
        "phase": "Unknown",
        "containerStatuses": [{ "restartCount": 3, "state": { "waiting": { "reason": "CrashLoopBackOff" } } }]
      }
    },
    {
      "metadata": { "namespace": "batch", "name": "worker-7" },
      "status": { "phase": "Pending", "containerStatuses": [{ "restartCount": 0 }] }
    }
  ]
}

```

**tk** (115 chars, 29 tokens, 80.3% savings):

```text
3 pods: 1, 1 pending, 1 [x], 3 restarts
[warn] Issues:
  default/api-123 CrashLoopBackOff
  batch/worker-7 Pending

```

**rtk** (586 chars, 147 tokens, 0% savings):

```text
{
  "items": [
    {
      "metadata": { "namespace": "default", "name": "web-1" },
      "status": { "phase": "Running", "containerStatuses": [{ "restartCount": 0 }] }
    },
    {
      "metadata": { "namespace": "default", "name": "api-123" },
      "status": {
        "phase": "Unknown",
        "containerStatuses": [{ "restartCount": 3, "state": { "waiting": { "reason": "CrashLoopBackOff" } } }]
      }
    },
    {
      "metadata": { "namespace": "batch", "name": "worker-7" },
      "status": { "phase": "Pending", "containerStatuses": [{ "restartCount": 0 }] }
    }
  ]
}

```

---

### 4. git-stash: invalid ref

- Handler: `git-stash`
- tk: `tk git stash show stash@{999999}`
- raw: `git --no-pager stash show stash@{999999}`
- rtk: `git stash show stash@{999999}`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 47 | 12 | 0% |
| tk | 47 | 12 | 0% |
| rtk | 12 | 3 | 75% |

**raw** (47 chars, 12 tokens):

```text
error: stash@{999999} is not a valid reference

```

**tk** (47 chars, 12 tokens, 0% savings):

```text
error: stash@{999999} is not a valid reference

```

**rtk** (12 chars, 3 tokens, 75% savings):

```text
Empty stash

```

---

### 5. [fixture] terraform plan keeps resource changes and plan summary

- Handler: `terraform`
- tk: `tk filter terraform plan`
- raw: `fixture: tests/fixtures/terraform/plan_changes.txt`
- rtk: `unsupported (rtk has no terraform filter; raw passthrough)`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1742 | 436 | 0% |
| tk | 812 | 203 | 53.4% |
| rtk | 1742 | 436 | 0% |

**raw** (1742 chars, 436 tokens):

```text
Acquiring state lock. This may take a few moments...
data.aws_caller_identity.current: Reading...
data.aws_caller_identity.current: Read complete after 0s [id=123456789012]
data.aws_region.current: Reading...
data.aws_region.current: Read complete after 0s [id=us-east-1]
random_pet.name: Refreshing state... [id=cute-mongoose]
aws_s3_bucket.data: Refreshing state... [id=acme-data-bucket]
aws_iam_role.lambda_exec: Refreshing state... [id=acme-lambda-exec]
aws_lambda_function.api: Refreshing state... [id=acme-api]

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place
  - destroy

Terraform will perform the following actions:

  # aws_instance.web will be created
  + resource "aws_instance" "web" {
      + ami                          = "ami-0abcd1234ef567890"
      + instance_type                = "t3.micro"
      + availability_zone            = (known after apply)
      + id                           = (known after apply)
      + tags                         = {
          + "Name" = "web"
        }
    }

  # aws_s3_bucket.data will be updated in-place
  ~ resource "aws_s3_bucket" "data" {
        id     = "acme-data-bucket"
      ~ tags   = {
          + "env" = "prod"
        }
    }

  # random_pet.name will be destroyed
  - resource "random_pet" "name" {
      - id     = "cute-mongoose" -> null
      - length = 2 -> null
    }

Plan: 1 to add, 1 to change, 1 to destroy.

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.

```

**tk** (812 chars, 203 tokens, 53.4% savings):

```text
Terraform will perform the following actions:

  # aws_instance.web will be created
  + resource "aws_instance" "web" {
      + ami                          = "ami-0abcd1234ef567890"
      + instance_type                = "t3.micro"
      + availability_zone            = (known after apply)
      + id                           = (known after apply)
      + tags                         = {
          + "Name" = "web"
        }
    }

  # aws_s3_bucket.data will be updated in-place
  ~ resource "aws_s3_bucket" "data" {
        id     = "acme-data-bucket"
      ~ tags   = {
          + "env" = "prod"
        }
    }

  # random_pet.name will be destroyed
  - resource "random_pet" "name" {
      - id     = "cute-mongoose" -> null
      - length = 2 -> null
    }

Plan: 1 to add, 1 to change, 1 to destroy.

```

**rtk** (1742 chars, 436 tokens, 0% savings):

```text
Acquiring state lock. This may take a few moments...
data.aws_caller_identity.current: Reading...
data.aws_caller_identity.current: Read complete after 0s [id=123456789012]
data.aws_region.current: Reading...
data.aws_region.current: Read complete after 0s [id=us-east-1]
random_pet.name: Refreshing state... [id=cute-mongoose]
aws_s3_bucket.data: Refreshing state... [id=acme-data-bucket]
aws_iam_role.lambda_exec: Refreshing state... [id=acme-lambda-exec]
aws_lambda_function.api: Refreshing state... [id=acme-api]

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place
  - destroy

Terraform will perform the following actions:

  # aws_instance.web will be created
  + resource "aws_instance" "web" {
      + ami                          = "ami-0abcd1234ef567890"
      + instance_type                = "t3.micro"
      + availability_zone            = (known after apply)
      + id                           = (known after apply)
      + tags                         = {
          + "Name" = "web"
        }
    }

  # aws_s3_bucket.data will be updated in-place
  ~ resource "aws_s3_bucket" "data" {
        id     = "acme-data-bucket"
      ~ tags   = {
          + "env" = "prod"
        }
    }

  # random_pet.name will be destroyed
  - resource "random_pet" "name" {
      - id     = "cute-mongoose" -> null
      - length = 2 -> null
    }

Plan: 1 to add, 1 to change, 1 to destroy.

─────────────────────────────────────────────────────────────────────────────

Note: You didn't use the -out option to save this plan, so Terraform can't
guarantee to take exactly these actions if you run "terraform apply" now.

```

---

### 6. [fixture] psql table format emits tab-separated rows

- Handler: `psql`
- tk: `tk filter psql -c select * from users`
- raw: `fixture: tests/fixtures/cloud/psql_table_users.txt`
- rtk: `cat tests/fixtures/cloud/psql_table_users.txt | rtk psql -c select * from users`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 361 | 91 | 0% |
| tk | 191 | 48 | 47.3% |
| rtk | 1 | 1 | 98.9% |

**raw** (361 chars, 91 tokens):

```text
 id | name  | email          | status   | created_at          | role
----+-------+----------------+----------+---------------------+-----------
  1 | alice | alice@b.com    | active   | 2024-01-01 09:00:00 | admin
  2 | bob   | bob@b.com      | active   | 2024-01-02 10:15:00 | user
  3 | carol | carol@b.com    | inactive | 2024-01-03 11:30:00 | user
(3 rows)

```

**tk** (191 chars, 48 tokens, 47.3% savings):

```text
id	name	email	status	created_at	role
1	alice	alice@b.com	active	2024-01-01 09:00:00	admin
2	bob	bob@b.com	active	2024-01-02 10:15:00	user
3	carol	carol@b.com	inactive	2024-01-03 11:30:00	user
```

**rtk** (1 chars, 1 tokens, 98.9% savings):

```text


```

---

### 7. [fixture] js-test keeps failed test and assertion from Vitest fixture

- Handler: `js-test`
- tk: `tk filter vitest run`
- raw: `fixture: tests/fixtures/js/vitest_failed.txt`
- rtk: `cat tests/fixtures/js/vitest_failed.txt | rtk pipe -f vitest`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 193 | 49 | 0% |
| tk | 181 | 46 | 6.1% |
| rtk | 82 | 21 | 57.1% |

**raw** (193 chars, 49 tokens):

```text
FAIL  src/order/submit.test.ts > prevents duplicate submit
AssertionError: expected "api.submit" to be called 1 time, got 2
 ❯ src/order/submit.test.ts:42:15
Tests  3 failed | 215 passed (218)

```

**tk** (181 chars, 46 tokens, 6.1% savings):

```text
PASS (215) FAIL (3)

1. src/order/submit.test.ts > prevents duplicate submit
   AssertionError: expected "api.submit" to be called 1 time, got 2
   ❯ src/order/submit.test.ts:42:15

```

**rtk** (82 chars, 21 tokens, 57.1% savings):

```text
PASS (215) FAIL (3)

1. FAIL  src/order/submit.test.ts > prevents duplicate submit
```

---

### 8. [fixture] gt log keeps the stack graph but strips author emails

- Handler: `gt`
- tk: `tk filter gt log`
- raw: `fixture: tests/fixtures/git/gt_log_stack.txt`
- rtk: `cat tests/fixtures/git/gt_log_stack.txt | rtk gt log`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 220 | 55 | 0% |
| tk | 189 | 48 | 12.7% |
| rtk | 80 | 20 | 63.6% |

**raw** (220 chars, 55 tokens):

```text
◉  abc1234 feat/add-auth 2d ago
│  feat(auth): add login endpoint
│
◉  def5678 feat/add-db 3d ago user@example.com
│  feat(db): add migration system
│
◉  ghi9012 main 5d ago admin@corp.io
│  chore: update dependencies
~

```

**tk** (189 chars, 48 tokens, 12.7% savings):

```text
◉  abc1234 feat/add-auth 2d ago
│  feat(auth): add login endpoint
│
◉  def5678 feat/add-db 3d ago
│  feat(db): add migration system
│
◉  ghi9012 main 5d ago
│  chore: update dependencies
~

```

**rtk** (80 chars, 20 tokens, 63.6% savings):

```text
◯ main
│ 3 days ago
│
│ 0a15557 - docs: add token killer product documentation
│

```

---

### 9. [fixture] terraform test keeps failed run and assertion

- Handler: `terraform`
- tk: `tk filter terraform test`
- raw: `fixture: tests/fixtures/terraform/test_failed.txt`
- rtk: `unsupported (rtk has no terraform filter; raw passthrough)`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 528 | 132 | 0% |
| tk | 308 | 77 | 41.7% |
| rtk | 528 | 132 | 0% |

**raw** (528 chars, 132 tokens):

```text
tests/defaults.tftest.hcl... in progress
  run "uses_default_cidr"... in progress
  run "uses_default_cidr"... pass
  run "rejects_invalid_cidr"... in progress
  run "rejects_invalid_cidr"... fail
╷
│ Error: Invalid value for variable
│
│   on tests/defaults.tftest.hcl line 18, in run "rejects_invalid_cidr":
│   18:     cidr_block = "not-a-cidr"
│
│ The cidr_block value must be valid CIDR notation, got "not-a-cidr".
╵
tests/defaults.tftest.hcl... tearing down
tests/defaults.tftest.hcl... fail

Failure! 1 passed, 1 failed.

```

**tk** (308 chars, 77 tokens, 41.7% savings):

```text
run "rejects_invalid_cidr"... fail
Error: Invalid value for variable
  on tests/defaults.tftest.hcl line 18, in run "rejects_invalid_cidr":
  18:     cidr_block = "not-a-cidr"
The cidr_block value must be valid CIDR notation, got "not-a-cidr".
tests/defaults.tftest.hcl... fail

Failure! 1 passed, 1 failed.

```

**rtk** (528 chars, 132 tokens, 0% savings):

```text
tests/defaults.tftest.hcl... in progress
  run "uses_default_cidr"... in progress
  run "uses_default_cidr"... pass
  run "rejects_invalid_cidr"... in progress
  run "rejects_invalid_cidr"... fail
╷
│ Error: Invalid value for variable
│
│   on tests/defaults.tftest.hcl line 18, in run "rejects_invalid_cidr":
│   18:     cidr_block = "not-a-cidr"
│
│ The cidr_block value must be valid CIDR notation, got "not-a-cidr".
╵
tests/defaults.tftest.hcl... tearing down
tests/defaults.tftest.hcl... fail

Failure! 1 passed, 1 failed.

```

---

### 10. prettier: check package.json

- Handler: `generic`
- tk: `tk pnpm exec prettier --check package.json`
- raw: `pnpm exec prettier --check package.json`
- rtk: `prettier --check package.json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 66 | 17 | 0% |
| tk | 66 | 17 | 0% |
| rtk | 40 | 10 | 41.2% |

**raw** (66 chars, 17 tokens):

```text
Checking formatting...
All matched files use Prettier code style!

```

**tk** (66 chars, 17 tokens, 0% savings):

```text
Checking formatting...
All matched files use Prettier code style!

```

**rtk** (40 chars, 10 tokens, 41.2% savings):

```text
Prettier: All files formatted correctly

```

---

### 11. [fixture] pip keeps package problems from fixture

- Handler: `pip`
- tk: `tk filter pip list`
- raw: `fixture: tests/fixtures/python/pip_list_large.txt`
- rtk: `cat tests/fixtures/python/pip_list_large.txt | rtk pip list`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 128 | 32 | 0% |
| tk | 183 | 46 | 0% |
| rtk | 75 | 19 | 40.6% |

**raw** (128 chars, 32 tokens):

```text
Package Version
------- -------
requests 2.32.0
broken-package 1.0.0 invalid
peer-tool 2.0.0 conflict
missing-lib 0.0.0 missing

```

**tk** (183 chars, 46 tokens, 0% savings):

```text
pip list: 1 packages
═══════════════════════════════════════

[R]
  requests (2.32.0)

Problems:
- broken-package 1.0.0 invalid
- peer-tool 2.0.0 conflict
- missing-lib 0.0.0 missing

```

**rtk** (75 chars, 19 tokens, 40.6% savings):

```text
pip list (JSON parse failed: EOF while parsing a value at line 1 column 0)

```

---

### 12. [fixture] list-like keeps useful paths from real project listing

- Handler: `list-like`
- tk: `tk filter find .`
- raw: `fixture: tests/fixtures/common/ls_large_project.txt`
- rtk: `cat tests/fixtures/common/ls_large_project.txt | rtk pipe -f find`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 124 | 31 | 0% |
| tk | 81 | 21 | 32.3% |
| rtk | 180 | 45 | 0% |

**raw** (124 chars, 31 tokens):

```text
./src/cli.ts
./src/parse.ts
./tests/unit/parse.test.ts
./README.md
./package.json
./node_modules/pkg/index.js
./dist/cli.js

```

**tk** (81 chars, 21 tokens, 32.3% savings):

```text
5F 3D:

./ README.md package.json
src/ cli.ts parse.ts
tests/unit/ parse.test.ts

```

**rtk** (180 chars, 45 tokens, 0% savings):

```text
7 files in 5 dirs:

./  (2)
  README.md
  package.json
./dist/  (1)
  cli.js
./node_modules/pkg/  (1)
  index.js
./src/  (2)
  cli.ts
  parse.ts
./tests/unit/  (1)
  parse.test.ts

```

---

### 13. [fixture] git-log keeps standard commit subjects

- Handler: `git-log`
- tk: `tk filter git log`
- raw: `fixture: tests/fixtures/git/log_standard.txt`
- rtk: `cat tests/fixtures/git/log_standard.txt | rtk pipe -f git-log`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 474 | 119 | 0% |
| tk | 336 | 84 | 29.4% |
| rtk | 185 | 47 | 60.5% |

**raw** (474 chars, 119 tokens):

```text
commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
Author: Test User <test@example.com>
Date:   Mon Jun 2 15:30:00 2026 +0800

    feat: add token killer command proxy

commit b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1
Author: Test User <test@example.com>
Date:   Mon Jun 2 14:00:00 2026 +0800

    fix: handle edge case in parser

commit c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2
Author: Another Dev <another@example.com>
Date:   Sun Jun 1 12:00:00 2026 +0800

    Initial commit

```

**tk** (336 chars, 84 tokens, 29.4% savings):

```text
Git Log: 3 commits

a1b2c3d4e5f6 feat: add token killer command proxy
  Test User <test@example.com> | Mon Jun 2 15:30:00 2026 +0800
b2c3d4e5f6a7 fix: handle edge case in parser
  Test User <test@example.com> | Mon Jun 2 14:00:00 2026 +0800
c3d4e5f6a7b8 Initial commit
  Another Dev <another@example.com> | Sun Jun 1 12:00:00 2026 +0800

```

**rtk** (185 chars, 47 tokens, 60.5% savings):

```text
commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
  Author: Test User <test@example.com>
  Date:   Mon Jun 2 15:30:00 2026 +0800
  feat: add token killer command proxy
  [+8 lines omitted]
```

---

### 14. eslint: eslint package.json

- Handler: `eslint`
- tk: `tk pnpm exec eslint package.json`
- raw: `pnpm exec eslint package.json`
- rtk: `lint package.json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 502 | 126 | 0% |
| tk | 30 | 8 | 93.7% |
| rtk | 154 | 39 | 69% |

**raw** (502 chars, 126 tokens):

```text

Oops! Something went wrong! :(

ESLint: 10.4.1

ESLint couldn't find an eslint.config.(js|mjs|cjs) file.

From ESLint v9.0.0, the default configuration file is now eslint.config.js.
If you are using a .eslintrc.* file, please follow the migration guide
to update your configuration file to the new format:

https://eslint.org/docs/latest/use/configure/migration-guide

If you still have problems after following the migration guide, please stop by
https://eslint.org/chat/help to chat with the team.


```

**tk** (30 chars, 8 tokens, 93.7% savings):

```text
ESLint: 0 problems in 0 files

```

**rtk** (154 chars, 39 tokens, 69% savings):

```text
ESLint output (JSON parse failed: EOF while parsing a value at line 1 column 0)

[full output: ~/Library/Application Support/rtk/tee/1780642816_lint.log]

```

---

### 15. glab: mr list

- Handler: `glab`
- tk: `tk glab mr list`
- raw: `glab mr list`
- rtk: `glab mr list`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 510 | 128 | 0% |
| tk | 424 | 106 | 17.2% |
| rtk | 510 | 128 | 0% |

**raw** (510 chars, 128 tokens):

```text
          
   ERROR  
          
  None of the git remotes configured for this repository point to a known GitLab host. Please use `glab auth login` to
  authenticate and configure a new host for glab.                                                                     
                                                                                                                      
  Configured remotes: github.com.                                                                                     


```

**tk** (424 chars, 106 tokens, 17.2% savings):

```text
          
   ERROR  
          
  None of the git remotes configured for this repository point to a known GitLab host. Please use `glab auth login` to
  authenticate and configure a new host for glab.                                                                     
                                                                                                                      
  Configured remotes: github.com.

```

**rtk** (510 chars, 128 tokens, 0% savings):

```text
          
   ERROR  
          
  None of the git remotes configured for this repository point to a known GitLab host. Please use `glab auth login` to
  authenticate and configure a new host for glab.                                                                     
                                                                                                                      
  Configured remotes: github.com.                                                                                     


```

---

### 16. [fixture] smart keeps the summary payload without prompt boilerplate

- Handler: `smart`
- tk: `tk filter smart src/main.rs`
- raw: `fixture: tests/fixtures/system/smart_summary.txt`
- rtk: `rtk smart tests/fixtures/system/smart_summary.txt`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 79 | 20 | 0% |
| tk | 34 | 9 | 55% |
| rtk | 46 | 12 | 40% |

**raw** (79 chars, 20 tokens):

```text
System prompt: summarize this file
Summary: parser routes commands to handlers

```

**tk** (34 chars, 9 tokens, 55% savings):

```text
parser routes commands to handlers
```

**rtk** (46 chars, 12 tokens, 40% savings):

```text
Data code (2 lines)
General purpose code file

```

---

### 17. [fixture] find groups matches by directory like RTK

- Handler: `list-like`
- tk: `tk filter find src -name *.ts`
- raw: `fixture: tests/fixtures/common/find_src_ts.txt`
- rtk: `cat tests/fixtures/common/find_src_ts.txt | rtk pipe -f find`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 63 | 16 | 0% |
| tk | 54 | 14 | 12.5% |
| rtk | 90 | 23 | 0% |

**raw** (63 chars, 16 tokens):

```text
src/core/history.ts
src/core/report.ts
src/cli.ts
src/parse.ts

```

**tk** (54 chars, 14 tokens, 12.5% savings):

```text
4F 2D:

./ cli.ts parse.ts
core/ history.ts report.ts

```

**rtk** (90 chars, 23 tokens, 0% savings):

```text
4 files in 2 dirs:

src/  (2)
  cli.ts
  parse.ts
src/core/  (2)
  history.ts
  report.ts

```

---

### 18. [fixture] js-test keeps failed Jest test name from fixture

- Handler: `js-test`
- tk: `tk filter jest`
- raw: `fixture: tests/fixtures/js/jest_failed.txt`
- rtk: `cat tests/fixtures/js/jest_failed.txt | rtk pipe -f vitest`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 143 | 36 | 0% |
| tk | 125 | 32 | 11.1% |
| rtk | 143 | 36 | 0% |

**raw** (143 chars, 36 tokens):

```text
FAIL src/order/submit.test.ts
  prevents duplicate submit
  expect(api.submit).toHaveBeenCalledTimes(1)
Tests: 3 failed, 215 passed, 218 total

```

**tk** (125 chars, 32 tokens, 11.1% savings):

```text
PASS (215) FAIL (3)

1. src/order/submit.test.ts
   prevents duplicate submit
   expect(api.submit).toHaveBeenCalledTimes(1)

```

**rtk** (143 chars, 36 tokens, 0% savings):

```text
FAIL src/order/submit.test.ts
  prevents duplicate submit
  expect(api.submit).toHaveBeenCalledTimes(1)
Tests: 3 failed, 215 passed, 218 total

```

---

### 19. format: format --check

- Handler: `format`
- tk: `tk format --check`
- raw: `pnpm exec prettier --check package.json README.md src/cli.ts`
- rtk: `format --check`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 125 | 32 | 0% |
| tk | 26 | 7 | 78.1% |
| rtk | 40 | 10 | 68.8% |

**raw** (125 chars, 32 tokens):

```text
Checking formatting...
[warn] src/cli.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.

```

**tk** (26 chars, 7 tokens, 78.1% savings):

```text
format: command not found

```

**rtk** (40 chars, 10 tokens, 68.8% savings):

```text
Prettier: All files formatted correctly

```

---

### 20. [fixture] glab mr list keeps merge request identity and branches

- Handler: `glab`
- tk: `tk filter glab mr list`
- raw: `fixture: tests/fixtures/git/glab_mr_list_raw.json`
- rtk: `cat tests/fixtures/git/glab_mr_list_raw.json | rtk glab mr list`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 9463 | 2366 | 0% |
| tk | 798 | 200 | 91.5% |
| rtk | 0 | 0 | 100% |

**raw** (9463 chars, 2366 tokens):

````text
[
  {
    "iid": 314,
    "title": "feat(glab): add GitLab CLI (glab) command support",
    "state": "opened",
    "author": {"username": "alice_dev", "name": "Alice Developer", "id": 42},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/314",
    "created_at": "2026-03-01T10:00:00Z",
    "updated_at": "2026-03-05T14:30:00Z",
    "source_branch": "feat/glab-support",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["enhancement", "cli"],
    "assignees": [{"username": "alice_dev", "name": "Alice Developer"}],
    "reviewers": [{"username": "bob_review"}, {"username": "carol_review"}],
    "description": "## Summary\n\nAdd GitLab CLI support.\n\n<!-- auto-generated -->\n\n## Changes\n- New module\n- MR/issue/CI filtering\n- Token savings 80-87%\n\n---\n\n[![CI](https://img.shields.io/badge/CI-passing-green)](https://ci.example.com)\n",
    "head_pipeline": {"id": 98765, "status": "success", "ref": "feat/glab-support"}
  },
  {
    "iid": 310,
    "title": "fix(git): handle merge commits in compact diff",
    "state": "merged",
    "author": {"username": "dave_fix", "name": "Dave Fixer", "id": 100},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/310",
    "created_at": "2026-02-28T08:00:00Z",
    "updated_at": "2026-03-02T16:00:00Z",
    "source_branch": "fix/merge-commits",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["bug", "git"],
    "assignees": [{"username": "dave_fix"}],
    "reviewers": [{"username": "eve_review"}],
    "description": "Fix handling of merge commits in `compact_diff`. Previously, merge commits were being skipped entirely which lost context.\n\n### Test Plan\n- [x] Unit tests added\n- [x] Manual verification with merge-heavy repos\n",
    "head_pipeline": {"id": 98700, "status": "success", "ref": "fix/merge-commits"}
  },
  {
    "iid": 305,
    "title": "feat(aws): add AWS CLI module with token-optimized output",
    "state": "opened",
    "author": {"username": "frank_contrib", "name": "Frank Contributor", "id": 200},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/305",
    "created_at": "2026-02-25T12:00:00Z",
    "updated_at": "2026-03-04T09:00:00Z",
    "source_branch": "feat/aws-cli",
    "target_branch": "master",
    "merge_status": "cannot_be_merged",
    "draft": true,
    "labels": ["enhancement", "infra"],
    "assignees": [],
    "reviewers": [{"username": "grace_review"}, {"username": "heidi_review"}],
    "description": "Add AWS CLI support.\n\n![architecture](https://example.com/arch.png)\n\n## Commands\n- `rtk aws s3 ls`\n- `rtk aws ec2 describe-instances`\n- `rtk aws ecs list-services`\n\n## Token Savings\n| Command | Savings |\n|---------|--------|\n| s3 ls | 75% |\n| ec2 describe | 85% |\n| ecs list | 80% |\n",
    "head_pipeline": {"id": 98650, "status": "failed", "ref": "feat/aws-cli"}
  },
  {
    "iid": 302,
    "title": "chore(master): release 0.24.0",
    "state": "merged",
    "author": {"username": "release-bot", "name": "Release Bot", "id": 1},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/302",
    "created_at": "2026-02-20T00:00:00Z",
    "updated_at": "2026-02-20T01:00:00Z",
    "source_branch": "release-please--branches--master",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["release"],
    "assignees": [],
    "reviewers": [],
    "description": "## [0.24.0](https://example.com/compare/v0.23.0...v0.24.0)\n\n### Features\n* feat(aws): add AWS CLI module\n* feat(psql): add PostgreSQL module\n\n### Bug Fixes\n* fix(playwright): fix JSON parser\n",
    "head_pipeline": {"id": 98600, "status": "success", "ref": "release-please--branches--master"}
  },
  {
    "iid": 298,
    "title": "docs: update README with Python and Go command examples",
    "state": "merged",
    "author": {"username": "ivan_docs", "name": "Ivan Writer", "id": 300},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/298",
    "created_at": "2026-02-18T15:00:00Z",
    "updated_at": "2026-02-19T10:00:00Z",
    "source_branch": "docs/python-go-examples",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["documentation"],
    "assignees": [{"username": "ivan_docs"}],
    "reviewers": [{"username": "judy_review"}],
    "description": "Update README.md with comprehensive examples for:\n- Python commands (ruff, pytest, pip)\n- Go commands (go test, go build, golangci-lint)\n\nAll examples tested manually.",
    "head_pipeline": null
  },
  {
    "iid": 295,
    "title": "refactor: extract parser module from runner.rs",
    "state": "closed",
    "author": {"username": "karl_refactor", "name": "Karl Refactorer", "id": 400},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/295",
    "created_at": "2026-02-15T09:00:00Z",
    "updated_at": "2026-02-16T11:00:00Z",
    "source_branch": "refactor/parser-module",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["refactor"],
    "assignees": [{"username": "karl_refactor"}],
    "reviewers": [],
    "description": "Extract parser logic from runner.rs into dedicated parser/ module.\n\n---\n\nThis was superseded by #300 which took a different approach.\n\n***\n",
    "head_pipeline": {"id": 98500, "status": "canceled", "ref": "refactor/parser-module"}
  },
  {
    "iid": 290,
    "title": "feat(tee): save raw output on failure for LLM re-read",
    "state": "merged",
    "author": {"username": "lisa_feat", "name": "Lisa Feature", "id": 500},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/290",
    "created_at": "2026-02-10T08:00:00Z",
    "updated_at": "2026-02-12T16:00:00Z",
    "source_branch": "feat/tee-output",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["enhancement"],
    "assignees": [{"username": "lisa_feat"}],
    "reviewers": [{"username": "mike_review"}],
    "description": "## Tee Output Recovery\n\nSave raw unfiltered output on command failure.\nPrint one-line hint so LLMs can re-read instead of re-run.\n\n### Configuration\n```toml\n[tee]\nenabled = true\ndir = \"~/.local/share/rtk/tee\"\nmax_files = 20\nmax_size = 1048576\n```\n",
    "head_pipeline": {"id": 98400, "status": "success", "ref": "feat/tee-output"}
  },
  {
    "iid": 285,
    "title": "ci: add ARM64 Linux build to release workflow",
    "state": "merged",
    "author": {"username": "nancy_ci", "name": "Nancy CI", "id": 600},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/285",
    "created_at": "2026-02-05T14:00:00Z",
    "updated_at": "2026-02-06T09:00:00Z",
    "source_branch": "ci/arm64-build",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["ci"],
    "assignees": [{"username": "nancy_ci"}],
    "reviewers": [{"username": "oscar_review"}],
    "description": "Add ARM64 Linux target to the release workflow.\n\n- Uses `cross` for cross-compilation\n- Generates `.deb` and `.rpm` packages\n- Tested on Raspberry Pi 4 and AWS Graviton",
    "head_pipeline": {"id": 98300, "status": "success", "ref": "ci/arm64-build"}
  },
  {
    "iid": 280,
    "title": "fix(vitest): handle watch mode output gracefully",
    "state": "opened",
    "author": {"username": "peter_bugfix", "name": "Peter Bugfix", "id": 700},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/280",
    "created_at": "2026-02-01T11:00:00Z",
    "updated_at": "2026-02-03T15:00:00Z",
    "source_branch": "fix/vitest-watch",
    "target_branch": "master",
    "merge_status": "unchecked",
    "draft": false,
    "labels": ["bug", "vitest"],
    "assignees": [{"username": "peter_bugfix"}],
    "reviewers": [],
    "description": "When vitest runs in watch mode, output is continuous and doesn't have a clear end marker. This fix detects watch mode and falls back to passthrough.\n\n<!-- TODO: add unit test -->\n",
    "head_pipeline": {"id": 98200, "status": "running", "ref": "fix/vitest-watch"}
  },
  {
    "iid": 275,
    "title": "feat(discover): add rtk discover command for missed savings analysis",
    "state": "merged",
    "author": {"username": "quinn_dev", "name": "Quinn Developer", "id": 800},
    "web_url": "https://gitlab.example.com/acme/toolkit/-/merge_requests/275",
    "created_at": "2026-01-28T10:00:00Z",
    "updated_at": "2026-01-30T12:00:00Z",
    "source_branch": "feat/discover",
    "target_branch": "master",
    "merge_status": "can_be_merged",
    "draft": false,
    "labels": ["enhancement", "analytics"],
    "assignees": [{"username": "quinn_dev"}],
    "reviewers": [{"username": "rachel_review"}, {"username": "sam_review"}],
    "description": "Add `rtk discover` command that scans Claude Code JSONL sessions and reports missed savings opportunities.\n\n## Features\n- Classifies commands as Supported/Unsupported/Ignored\n- Groups by category with estimated token savings\n- Reports top missed commands\n\n## Example\n```\n$ rtk discover\nAnalyzed 1,234 commands across 45 sessions\n\nMissed savings by category:\n  Git: 234 commands, ~16,800 tokens\n  Cargo: 89 commands, ~7,120 tokens\n```\n",
    "head_pipeline": {"id": 98100, "status": "success", "ref": "feat/discover"}
  }
]

````

**tk** (798 chars, 200 tokens, 91.5% savings):

```text
Merge Requests
  [open] !314 feat(glab): add GitLab CLI (glab) command support (alice_dev)
  [merged] !310 fix(git): handle merge commits in compact diff (dave_fix)
  [open] !305 feat(aws): add AWS CLI module with token-optimized output (frank_contrib)
  [merged] !302 chore(master): release 0.24.0 (release-bot)
  [merged] !298 docs: update README with Python and Go command examples (ivan_docs)
  [closed] !295 refactor: extract parser module from runner.rs (karl_refactor)
  [merged] !290 feat(tee): save raw output on failure for LLM re-read (lisa_feat)
  [merged] !285 ci: add ARM64 Linux build to release workflow (nancy_ci)
  [open] !280 fix(vitest): handle watch mode output gracefully (peter_bugfix)
  [merged] !275 feat(discover): add rtk discover command for missed savin... (quinn_dev)

```

**rtk** (0 chars, 0 tokens, 100% savings):

```text

```

---

### 21. list-like: ls -la .

- Handler: `ls`
- tk: `tk ls -la .`
- raw: `ls -la .`
- rtk: `ls -la .`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1559 | 390 | 0% |
| tk | 483 | 121 | 69% |
| rtk | 358 | 90 | 76.9% |

**raw** (1559 chars, 390 tokens):

```text
total 216
drwxr-xr-x  27 ziyu  staff    864  6月  5 15:00 .
drwxr-xr-x@ 62 ziyu  staff   1984  6月  2 11:29 ..
drwxr-xr-x@  3 ziyu  staff     96  6月  5 11:15 .claude
drwxr-xr-x  21 ziyu  staff    672  6月  5 11:44 .git
-rw-r--r--@  1 ziyu  staff     30  6月  2 18:10 .gitignore
drwxr-xr-x@  5 ziyu  staff    160  6月  5 08:32 .mypy_cache
drwxr-xr-x@  6 ziyu  staff    192  6月  5 08:24 .pytest_cache
drwxr-xr-x@  6 ziyu  staff    192  6月  5 11:01 .ruff_cache
drwxr-xr-x@  4 ziyu  staff    128  6月  2 17:46 .tk
-rw-r--r--@  1 ziyu  staff   2429  6月  4 23:34 AGENTS.md
-rw-r--r--@  1 ziyu  staff     18  6月  4 23:34 CLAUDE.md
-rw-r--r--@  1 ziyu  staff   8525  6月  5 15:00 CONTEXT.md
drwxr-xr-x@  3 ziyu  staff     96  6月  5 15:00 dist
drwxr-xr-x  20 ziyu  staff    640  6月  5 13:38 docs
drwxr-xr-x@ 18 ziyu  staff    576  6月  5 08:33 node_modules
-rw-r--r--   1 ziyu  staff   1277  6月  5 09:24 package.json
-rw-r--r--   1 ziyu  staff  55735  6月  5 09:24 pnpm-lock.yaml
-rw-r--r--@  1 ziyu  staff     82  6月  2 17:02 pnpm-workspace.yaml
-rw-r--r--@  1 ziyu  staff   2723  6月  5 11:38 README.md
drwxr-xr-x  36 ziyu  staff   1152  6月  3 15:08 rtk
drwxr-xr-x@ 14 ziyu  staff    448  6月  5 14:58 scripts
drwxr-xr-x@  9 ziyu  staff    288  6月  5 08:24 src
drwxr-xr-x@  8 ziyu  staff    256  6月  5 11:26 tests
-rw-r--r--@  1 ziyu  staff    370  6月  2 16:59 tsconfig.json
-rw-r--r--@  1 ziyu  staff    216  6月  2 17:05 tsdown.config.ts
-rw-r--r--@  1 ziyu  staff   1037  6月  5 08:10 vitest.config.ts
-rw-r--r--@  1 ziyu  staff    512  6月  4 16:57 vitest.migration.config.ts

```

**tk** (483 chars, 121 tokens, 69% savings):

```text
755  .claude/
755  .git/
755  .mypy_cache/
755  .pytest_cache/
755  .ruff_cache/
755  .tk/
755  dist/
755  docs/
755  node_modules/
755  rtk/
755  scripts/
755  src/
755  tests/
644  .gitignore  30B
644  AGENTS.md  2.4K
644  CLAUDE.md  18B
644  CONTEXT.md  8.3K
644  README.md  2.7K
644  package.json  1.2K
644  pnpm-lock.yaml  54.4K
644  pnpm-workspace.yaml  82B
644  tsconfig.json  370B
644  tsdown.config.ts  216B
644  vitest.config.ts  1.0K
644  vitest.migration.config.ts  512B

```

**rtk** (358 chars, 90 tokens, 76.9% savings):

```text
.claude/
.git/
.mypy_cache/
.pytest_cache/
.ruff_cache/
.tk/
dist/
docs/
node_modules/
rtk/
scripts/
src/
tests/
.gitignore  30B
AGENTS.md  2.4K
CLAUDE.md  18B
CONTEXT.md  8.3K
README.md  2.7K
package.json  1.2K
pnpm-lock.yaml  54.4K
pnpm-workspace.yaml  82B
tsconfig.json  370B
tsdown.config.ts  216B
vitest.config.ts  1.0K
vitest.migration.config.ts  512B

```

---

### 22. js-test: vitest run savings test

- Handler: `js-test`
- tk: `tk pnpm exec vitest run tests/unit/savings.test.ts`
- raw: `pnpm exec vitest run tests/unit/savings.test.ts`
- rtk: `vitest run tests/unit/savings.test.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 212 | 53 | 0% |
| tk | 30 | 8 | 84.9% |
| rtk | 18 | 5 | 90.6% |

**raw** (212 chars, 53 tokens):

```text

 RUN  v4.1.8 /Users/ziyu/Workspace/token-killer


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  15:00:14
   Duration  90ms (transform 18ms, setup 0ms, import 23ms, tests 2ms, environment 0ms)


```

**tk** (30 chars, 8 tokens, 84.9% savings):

```text
PASS (4) FAIL (0)

Time: 75ms

```

**rtk** (18 chars, 5 tokens, 90.6% savings):

```text
PASS (4) FAIL (0)

```

---

### 23. [fixture] find small output keeps root files without excessive growth

- Handler: `list-like`
- tk: `tk filter find . -maxdepth 1 -type f`
- raw: `fixture: tests/fixtures/common/find_small_root_files.txt`
- rtk: `cat tests/fixtures/common/find_small_root_files.txt | rtk pipe -f find`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 162 | 41 | 0% |
| tk | 155 | 39 | 4.9% |
| rtk | 190 | 48 | 0% |

**raw** (162 chars, 41 tokens):

```text
./.gitignore
./README.md
./package.json
./pnpm-lock.yaml
./pnpm-workspace.yaml
./tsconfig.json
./tsdown.config.ts
./vitest.config.ts
./vitest.migration.config.ts

```

**tk** (155 chars, 39 tokens, 4.9% savings):

```text
9F 1D:

./ .gitignore README.md package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsdown.config.ts vitest.config.ts vitest.migration.config.ts

```

**rtk** (190 chars, 48 tokens, 0% savings):

```text
9 files in 1 dirs:

./  (9)
  .gitignore
  README.md
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  vitest.migration.config.ts

```

---

### 24. [fixture] npx tsc routes through the TypeScript filter

- Handler: `npx`
- tk: `tk filter npx tsc --noEmit`
- raw: `fixture: tests/fixtures/js/tsc_many.txt`
- rtk: `cat tests/fixtures/js/tsc_many.txt | rtk pipe -f tsc`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1235 | 309 | 0% |
| tk | 1166 | 292 | 5.5% |
| rtk | 1205 | 302 | 2.3% |

**raw** (1235 chars, 309 tokens):

```text
src/order/submit.ts(42,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/order/submit.ts(58,3): error TS2345: Argument of type 'Order' is not assignable to parameter of type 'OrderInput'.
src/order/api.ts(88,12): error TS2339: Property 'id' does not exist on type 'Order | undefined'.
src/order/api.ts(91,5): error TS2322: Type 'number' is not assignable to type 'string'.
src/cart/index.ts(12,9): error TS2554: Expected 2 arguments, but got 1.
src/cart/index.ts(30,15): error TS2339: Property 'total' does not exist on type 'Cart'.
src/auth/session.ts(15,5): error TS2322: Type 'null' is not assignable to type 'Session'.
  Type 'null' is not assignable to type 'Session'.
src/auth/session.ts(44,7): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'Token'.
src/payment/stripe.ts(102,3): error TS2339: Property 'charge' does not exist on type 'StripeClient'.
src/payment/stripe.ts(140,9): error TS2554: Expected 3 arguments, but got 2.
src/components/Button.tsx(20,7): error TS2322: Type 'boolean' is not assignable to type 'string'.
src/components/Button.tsx(33,11): error TS2339: Property 'onClick' does not exist on type 'ButtonProps'.
Found 12 errors in 6 files.

```

**tk** (1166 chars, 292 tokens, 5.5% savings):

```text
TypeScript: 12 errors in 6 files
Top codes: TS2322 (4x), TS2339 (4x), TS2345 (2x), TS2554 (2x)

src/auth/session.ts (2 errors)
  L15: TS2322 Type 'null' is not assignable to type 'Session'.
    Type 'null' is not assignable to type 'Session'.
  L44: TS2345 Argument of type 'undefined' is not assignable to parameter of type 'Token'.

src/cart/index.ts (2 errors)
  L12: TS2554 Expected 2 arguments, but got 1.
  L30: TS2339 Property 'total' does not exist on type 'Cart'.

src/components/Button.tsx (2 errors)
  L20: TS2322 Type 'boolean' is not assignable to type 'string'.
  L33: TS2339 Property 'onClick' does not exist on type 'ButtonProps'.

src/order/api.ts (2 errors)
  L88: TS2339 Property 'id' does not exist on type 'Order | undefined'.
  L91: TS2322 Type 'number' is not assignable to type 'string'.

src/order/submit.ts (2 errors)
  L42: TS2322 Type 'string | undefined' is not assignable to type 'string'.
  L58: TS2345 Argument of type 'Order' is not assignable to parameter of type 'OrderInput'.

src/payment/stripe.ts (2 errors)
  L102: TS2339 Property 'charge' does not exist on type 'StripeClient'.
  L140: TS2554 Expected 3 arguments, but got 2.

```

**rtk** (1205 chars, 302 tokens, 2.3% savings):

```text
TypeScript: 12 errors in 6 files
═══════════════════════════════════════
Top codes: TS2339 (4x), TS2322 (4x), TS2554 (2x), TS2345 (2x)

src/payment/stripe.ts (2 errors)
  L102: TS2339 Property 'charge' does not exist on type 'StripeClient'.
  L140: TS2554 Expected 3 arguments, but got 2.

src/order/submit.ts (2 errors)
  L42: TS2322 Type 'string | undefined' is not assignable to type 'string'.
  L58: TS2345 Argument of type 'Order' is not assignable to parameter of type 'OrderInput'.

src/cart/index.ts (2 errors)
  L12: TS2554 Expected 2 arguments, but got 1.
  L30: TS2339 Property 'total' does not exist on type 'Cart'.

src/components/Button.tsx (2 errors)
  L20: TS2322 Type 'boolean' is not assignable to type 'string'.
  L33: TS2339 Property 'onClick' does not exist on type 'ButtonProps'.

src/order/api.ts (2 errors)
  L88: TS2339 Property 'id' does not exist on type 'Order | undefined'.
  L91: TS2322 Type 'number' is not assignable to type 'string'.

src/auth/session.ts (2 errors)
  L15: TS2322 Type 'null' is not assignable to type 'Session'.
    Type 'null' is not assignable to type 'Session'.
  L44: TS2345 Argument of type 'undefined' is not assignable to parameter of type 'Token'.
```

---

### 25. [fixture] tsc keeps TypeScript diagnostic codes from fixture

- Handler: `tsc`
- tk: `tk filter tsc --noEmit`
- raw: `fixture: tests/fixtures/js/tsc_many.txt`
- rtk: `cat tests/fixtures/js/tsc_many.txt | rtk pipe -f tsc`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1235 | 309 | 0% |
| tk | 1166 | 292 | 5.5% |
| rtk | 1205 | 302 | 2.3% |

**raw** (1235 chars, 309 tokens):

```text
src/order/submit.ts(42,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/order/submit.ts(58,3): error TS2345: Argument of type 'Order' is not assignable to parameter of type 'OrderInput'.
src/order/api.ts(88,12): error TS2339: Property 'id' does not exist on type 'Order | undefined'.
src/order/api.ts(91,5): error TS2322: Type 'number' is not assignable to type 'string'.
src/cart/index.ts(12,9): error TS2554: Expected 2 arguments, but got 1.
src/cart/index.ts(30,15): error TS2339: Property 'total' does not exist on type 'Cart'.
src/auth/session.ts(15,5): error TS2322: Type 'null' is not assignable to type 'Session'.
  Type 'null' is not assignable to type 'Session'.
src/auth/session.ts(44,7): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'Token'.
src/payment/stripe.ts(102,3): error TS2339: Property 'charge' does not exist on type 'StripeClient'.
src/payment/stripe.ts(140,9): error TS2554: Expected 3 arguments, but got 2.
src/components/Button.tsx(20,7): error TS2322: Type 'boolean' is not assignable to type 'string'.
src/components/Button.tsx(33,11): error TS2339: Property 'onClick' does not exist on type 'ButtonProps'.
Found 12 errors in 6 files.

```

**tk** (1166 chars, 292 tokens, 5.5% savings):

```text
TypeScript: 12 errors in 6 files
Top codes: TS2322 (4x), TS2339 (4x), TS2345 (2x), TS2554 (2x)

src/auth/session.ts (2 errors)
  L15: TS2322 Type 'null' is not assignable to type 'Session'.
    Type 'null' is not assignable to type 'Session'.
  L44: TS2345 Argument of type 'undefined' is not assignable to parameter of type 'Token'.

src/cart/index.ts (2 errors)
  L12: TS2554 Expected 2 arguments, but got 1.
  L30: TS2339 Property 'total' does not exist on type 'Cart'.

src/components/Button.tsx (2 errors)
  L20: TS2322 Type 'boolean' is not assignable to type 'string'.
  L33: TS2339 Property 'onClick' does not exist on type 'ButtonProps'.

src/order/api.ts (2 errors)
  L88: TS2339 Property 'id' does not exist on type 'Order | undefined'.
  L91: TS2322 Type 'number' is not assignable to type 'string'.

src/order/submit.ts (2 errors)
  L42: TS2322 Type 'string | undefined' is not assignable to type 'string'.
  L58: TS2345 Argument of type 'Order' is not assignable to parameter of type 'OrderInput'.

src/payment/stripe.ts (2 errors)
  L102: TS2339 Property 'charge' does not exist on type 'StripeClient'.
  L140: TS2554 Expected 3 arguments, but got 2.

```

**rtk** (1205 chars, 302 tokens, 2.3% savings):

```text
TypeScript: 12 errors in 6 files
═══════════════════════════════════════
Top codes: TS2339 (4x), TS2322 (4x), TS2554 (2x), TS2345 (2x)

src/payment/stripe.ts (2 errors)
  L102: TS2339 Property 'charge' does not exist on type 'StripeClient'.
  L140: TS2554 Expected 3 arguments, but got 2.

src/components/Button.tsx (2 errors)
  L20: TS2322 Type 'boolean' is not assignable to type 'string'.
  L33: TS2339 Property 'onClick' does not exist on type 'ButtonProps'.

src/cart/index.ts (2 errors)
  L12: TS2554 Expected 2 arguments, but got 1.
  L30: TS2339 Property 'total' does not exist on type 'Cart'.

src/auth/session.ts (2 errors)
  L15: TS2322 Type 'null' is not assignable to type 'Session'.
    Type 'null' is not assignable to type 'Session'.
  L44: TS2345 Argument of type 'undefined' is not assignable to parameter of type 'Token'.

src/order/submit.ts (2 errors)
  L42: TS2322 Type 'string | undefined' is not assignable to type 'string'.
  L58: TS2345 Argument of type 'Order' is not assignable to parameter of type 'OrderInput'.

src/order/api.ts (2 errors)
  L88: TS2339 Property 'id' does not exist on type 'Order | undefined'.
  L91: TS2322 Type 'number' is not assignable to type 'string'.
```

---

### 26. [fixture] git-status keeps extended dirty status paths

- Handler: `git-status`
- tk: `tk filter git status`
- raw: `fixture: tests/fixtures/git/status_dirty_extended.txt`
- rtk: `cat tests/fixtures/git/status_dirty_extended.txt | rtk pipe -f git-status`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 182 | 46 | 0% |
| tk | 181 | 46 | 0% |
| rtk | 180 | 45 | 2.2% |

**raw** (182 chars, 46 tokens):

```text
## codex/token-killer-node-cli
 D DESIGN.md
 M README.md
 M package.json
?? .gitignore
?? dist/
?? scripts/
?? src/
?? tests/
?? tsconfig.json
?? tsdown.config.ts
?? vitest.config.ts

```

**tk** (181 chars, 46 tokens, 0% savings):

```text
* codex/token-killer-node-cli
 D DESIGN.md
 M README.md
 M package.json
?? .gitignore
?? dist/
?? scripts/
?? src/
?? tests/
?? tsconfig.json
?? tsdown.config.ts
?? vitest.config.ts

```

**rtk** (180 chars, 45 tokens, 2.2% savings):

```text
* codex/token-killer-node-cli
 D DESIGN.md
 M README.md
 M package.json
?? .gitignore
?? dist/
?? scripts/
?? src/
?? tests/
?? tsconfig.json
?? tsdown.config.ts
?? vitest.config.ts
```

---

### 27. [fixture] deps summarizes a package.json manifest

- Handler: `deps`
- tk: `tk filter deps`
- raw: `fixture: tests/fixtures/system/deps_package.json`
- rtk: `rtk deps <tmpdir with deps_package.json as package.json>`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 206 | 52 | 0% |
| tk | 129 | 33 | 36.5% |
| rtk | 134 | 34 | 34.6% |

**raw** (206 chars, 52 tokens):

```text
{
  "name": "demo-app",
  "version": "1.2.0",
  "dependencies": {
    "react": "19.0.0",
    "zod": "3.24.0"
  },
  "devDependencies": {
    "vitest": "4.1.8"
  },
  "scripts": {
    "test": "vitest"
  }
}

```

**tk** (129 chars, 33 tokens, 36.5% savings):

```text
Node.js (package.json):
  demo-app @ 1.2.0
  Dependencies (2):
    react (19.0.0)
    zod (3.24.0)
  Dev (1):
    vitest (4.1.8)

```

**rtk** (134 chars, 34 tokens, 34.6% savings):

```text
Node.js (package.json):
  demo-app @ 1.2.0
  Dependencies (2):
    react (19.0.0)
    zod (3.24.0)
  Dev Dependencies (1):
    vitest

```

---

### 28. [fixture] git-diff keeps changed lines from real diff

- Handler: `git-diff`
- tk: `tk filter git diff`
- raw: `fixture: tests/fixtures/git/diff_large.txt`
- rtk: `cat tests/fixtures/git/diff_large.txt | rtk pipe -f git-diff`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 253 | 64 | 0% |
| tk | 183 | 46 | 28.1% |
| rtk | 180 | 45 | 29.7% |

**raw** (253 chars, 64 tokens):

```text
diff --git a/src/order/submit.ts b/src/order/submit.ts
--- a/src/order/submit.ts
+++ b/src/order/submit.ts
@@ -40,7 +40,9 @@ export async function submitOrder(payload) {
-  return api.submit(payload)
+  return api.submit({ ...payload, idempotencyKey })

```

**tk** (183 chars, 46 tokens, 28.1% savings):

```text
src/order/submit.ts
  @@ -40,7 +40,9 @@ export async function submitOrder(payload) {
  -  return api.submit(payload)
  +  return api.submit({ ...payload, idempotencyKey })
  
  +1 -1

```

**rtk** (180 chars, 45 tokens, 29.7% savings):

```text

src/order/submit.ts
  @@ -40,7 +40,9 @@ export async function submitOrder(payload) {
  -  return api.submit(payload)
  +  return api.submit({ ...payload, idempotencyKey })
  +1 -1
```

---

### 29. json: json package.json

- Handler: `json`
- tk: `tk json package.json`
- raw: `json package.json`
- rtk: `json package.json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 0 | 0 | 0% |
| tk | 24 | 6 | 0% |
| rtk | 1105 | 277 | 0% |

**raw** (0 chars, 0 tokens):

```text

```

**tk** (24 chars, 6 tokens, 0% savings):

```text
json: command not found

```

**rtk** (1105 chars, 277 tokens, 0% savings):

```text
{
  bin:
  {
    tk: "./dist/cli.js"
  }
  dependencies:
  {
    strip-ansi: "^7.2.0"
  }
  description: "RTK-style token-saving command proxy."
  devDependencies:
  {
    @types/node: "^25.9.1"
    prettier: "^3.8.3"
    tsdown: "^0.22.1"
    tsx: "^4.22.4"
    typescript: "^6.0.3"
    vitest: "^4.1.8"
  }
  engines:
  {
    node: ">=20"
  }
  files:
  ["dist", "README.md"]
  name: "@company/tk"
  packageManager: "pnpm@11.5.0"
  scripts:
  {
    build: "tsdown"
    check:installation: "bash scripts/check-installation.sh"
    dev: "tsx src/cli.ts"
    test: "vitest --config vitest.config.ts"
    test:check-presence: "bash scripts/check-test-presence.sh"
    test:ci: "pnpm test:product && pnpm test:install && pnpm test:migration && bash scripts..."
    test:install: "bash scripts/test-install.sh"
    test:migration: "vitest run --config vitest.migration.config.ts"
    test:product: "vitest run --config vitest.config.ts"
    test:smoke: "bash tests/smoke/smoke.sh"
    test:validate-docs: "bash scripts/validate-docs.sh"
    typecheck: "tsc --noEmit"
  }
  type: "module"
  version: "0.1.0"
}

```

---

### 30. search-like: rg export src/

- Handler: `search-like`
- tk: `tk rg export src/`
- raw: `rg export src/`
- rtk: `grep export src/`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 10159 | 2540 | 0% |
| tk | 10159 | 2540 | 0% |
| rtk | 10588 | 2647 | 0% |

**raw** (10159 chars, 2540 tokens):

```text
src/handlers/git/show.ts:export const gitShowHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/extended.ts:export function buildAddArgs(args: string[]): string[] {
src/handlers/git/extended.ts:export function formatAddSummary(shortstatStdout: string): string {
src/handlers/git/extended.ts:export const gitExtendedHandlers: CommandHandler[] = [
src/handlers/git/graphite.ts:export const gtHandler: CommandHandler = {
src/handlers/git/hostingCli.ts:export function buildGhArgs(args: string[]): string[] {
src/handlers/git/hostingCli.ts:export function buildGlabArgs(args: string[]): string[] {
src/handlers/git/hostingCli.ts:export const ghHandler = makeHostingHandler("gh", buildGhArgs, formatGh);
src/handlers/git/hostingCli.ts:export const glabHandler = makeHostingHandler("glab", buildGlabArgs, formatGlab);
src/handlers/git/branch.ts:export function branchMode(rest: string[]): BranchMode {
src/handlers/git/branch.ts:export function buildBranchArgs(args: string[]): string[] {
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/compactDiff.ts:export function compactUnifiedDiff(diff: string, maxLines = 500): string {
src/handlers/git/compactDiff.ts:export function extractDiffStatLines(text: string): string[] {
src/handlers/git/status.ts:export function usesCompactStatusPath(args: string[]): boolean {
src/handlers/git/status.ts:export function buildStatusArgs(args: string[]): string[] {
src/handlers/git/status.ts:export function formatStatusOutput(porcelain: string, detached?: string): string {
src/handlers/git/status.ts:export function extractStateHeader(raw: string): string | undefined {
src/handlers/git/status.ts:export function extractDetachedHead(raw: string): string | undefined {
src/handlers/git/status.ts:export function filterStatusWithArgs(output: string): string {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/cloud/curl.ts:export function buildCurlArgs(args: string[]): string[] {
src/handlers/cloud/curl.ts:export const curlHandler: CommandHandler = {
src/handlers/cloud/aws.ts:export const awsHandler: CommandHandler = {
src/handlers/cloud/container.ts:export function buildDockerArgs(args: string[]): string[] {
src/handlers/cloud/container.ts:export function buildKubectlArgs(args: string[]): string[] {
src/handlers/cloud/container.ts:export const dockerHandler: CommandHandler = {
src/handlers/cloud/container.ts:export const kubectlHandler: CommandHandler = {
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/cloud/psql.ts:export const psqlHandler: CommandHandler = {
src/handlers/cloud/wget.ts:export const wgetHandler: CommandHandler = {
src/router.ts:export function routeCommand(command: ParsedCommand): CommandHandler {
src/parse.ts:export function parseArgv(argv: string[]): ParsedArgv {
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TkOptions = {
src/types.ts:export type ParseMode = "command" | "report" | "help" | "version";
src/types.ts:export type ParsedArgv = {
src/types.ts:export interface CommandHandler {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/base.ts:export function outputOmitsContent(output: string): boolean {
src/handlers/base.ts:export async function makeFilteredResult(
src/handlers/common/readLike.ts:      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/js/playwright.ts:export const playwrightHandler: CommandHandler = {
src/executor.ts:export function executeCommand(
src/handlers/js/prisma.ts:export const prismaHandler: CommandHandler = {
src/handlers/js/tsc.ts:export const tscHandler: CommandHandler = {
src/core/outputLimit.ts:export function limitLines(text: string, _maxLines: number): string {
src/core/outputLimit.ts:export function limitChars(text: string, _maxChars: number): string {
src/core/outputLimit.ts:export function limitOutput(text: string, _options: TkOptions): string {
src/handlers/iac/terraform.ts:export const terraformHandler: CommandHandler = {
src/handlers/js/packageList.ts:export const packageListHandler: CommandHandler = {
src/core/ansi.ts:export function removeAnsi(text: string): string {
src/handlers/js/next.ts:export function extractTime(line: string): string | undefined {
src/handlers/js/next.ts:export const nextHandler: CommandHandler = {
src/handlers/dotnet/dotnet.ts:export const dotnetHandler: CommandHandler = {
src/core/report.ts:export async function buildReport(options: TkOptions): Promise<string> {
src/handlers/js/eslint.ts:export const eslintHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/core/patterns.ts:export const IMPORTANT_PATTERN =
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/handlers/js/test.ts:export const jsTestHandler: CommandHandler = {
src/handlers/python/mypy.ts:export const mypyHandler: CommandHandler = {
src/handlers/js/prettier.ts:export const prettierHandler: CommandHandler = {
src/handlers/js/npm.ts:export const npmHandler: CommandHandler = {
src/core/fallback.ts:export async function filterWithGenericFallback(
src/handlers/common/diff.ts:export function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
src/handlers/common/diff.ts:export const diffHandler: CommandHandler = {
src/core/dataDir.ts:export function tokenKillerHome(): string {
src/core/dataDir.ts:export function projectFingerprint(cwd: string): string {
src/core/dataDir.ts:export function projectDataDir(cwd: string): string {
src/core/dataDir.ts:export function historyFile(cwd: string): string {
src/core/dataDir.ts:export function rawOutputDir(cwd: string): string {
src/core/dataDir.ts:export function rawOutputPathRelative(cwd: string, fileName: string): string {
src/core/dataDir.ts:export function resolveStoredPath(storedPath: string): string {
src/handlers/common/grepFilter.ts:export const GREP_MAX_LINE_LEN = 80;
src/handlers/common/grepFilter.ts:export const GREP_MAX_RESULTS = 200;
src/handlers/common/grepFilter.ts:export const GREP_MAX_PER_FILE = 25;
src/handlers/common/grepFilter.ts:export type GrepMatch = { file: string; line: number; content: string };
src/handlers/common/grepFilter.ts:export function hasFormatFlag(args: string[]): boolean {
src/handlers/common/grepFilter.ts:export function parseMatchLine(line: string): GrepMatch | null {
src/handlers/common/grepFilter.ts:export function compactPath(path: string): string {
src/handlers/common/grepFilter.ts:export function cleanLine(line: string, maxLen: number, pattern: string): string {
src/handlers/common/grepFilter.ts:export type GrepGroupOptions = {
src/handlers/common/grepFilter.ts:export function groupGrepOutput(
src/handlers/python/ruff.ts:export function buildRuffArgs(userArgs: string[]): string[] {
src/handlers/python/ruff.ts:export const ruffHandler: CommandHandler = {
src/core/rawStore.ts:export async function maybeSaveRawOutput(
src/core/path.ts:export function safePathPart(value: string): string {
src/handlers/python/pytest.ts:export const pytestHandler: CommandHandler = {
src/handlers/common/searchLike.ts:export function buildGrepArgs(program: string, userArgs: string[]): string[] {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/python/pip.ts:export const pipHandler: CommandHandler = {
src/handlers/java/gradle.ts:export const gradleHandler: CommandHandler = {
src/core/stats.ts:export function formatStats(result: {
src/handlers/system/tree.ts:export function buildTreeArgs(userArgs: string[]): string[] {
src/handlers/system/tree.ts:export const treeHandler: CommandHandler = {
src/handlers/java/maven.ts:export const mavenHandler: CommandHandler = {
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/handlers/java/javac.ts:export const javacHandler: CommandHandler = {
src/handlers/system/summary.ts:export const summaryHandler: CommandHandler = {
src/core/text.ts:export function uniqueLines(lines: string[]): string[] {
src/core/text.ts:export function ensureTrailingNewline(text: string): string {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/pipeline.ts:export async function filterWithFallback(
src/handlers/system/pipe.ts:export const pipeHandler: CommandHandler = {
src/handlers/system/log.ts:export const logHandler: CommandHandler = {
src/handlers/system/env.ts:export const envHandler: CommandHandler = {
src/handlers/system/read.ts:      trimmed.startsWith("export ") ||
src/handlers/system/read.ts:export function buildCatArgs(args: string[]): string[] {
src/handlers/system/read.ts:export const readHandler: CommandHandler = {
src/handlers/system/err.ts:export const errHandler: CommandHandler = {
src/handlers/system/wc.ts:export const wcHandler: CommandHandler = {
src/handlers/system/npx.ts:export const npxHandler: CommandHandler = {
src/handlers/system/deps.ts:export const depsHandler: CommandHandler = {
src/handlers/system/format.ts:export const formatHandler: CommandHandler = {
src/handlers/system/json.ts:export const jsonHandler: CommandHandler = {
src/handlers/system/smart.ts:export const smartHandler: CommandHandler = {
src/handlers/system/ls.ts:export function buildLsArgs(userArgs: string[]): string[] {
src/handlers/system/ls.ts:export const lsHandler: CommandHandler = {
src/handlers/system/testRunner.ts:export const testRunnerHandler: CommandHandler = {

```

**tk** (10159 chars, 2540 tokens, 0% savings):

```text
src/handlers/git/show.ts:export const gitShowHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/extended.ts:export function buildAddArgs(args: string[]): string[] {
src/handlers/git/extended.ts:export function formatAddSummary(shortstatStdout: string): string {
src/handlers/git/extended.ts:export const gitExtendedHandlers: CommandHandler[] = [
src/handlers/git/graphite.ts:export const gtHandler: CommandHandler = {
src/handlers/git/hostingCli.ts:export function buildGhArgs(args: string[]): string[] {
src/handlers/git/hostingCli.ts:export function buildGlabArgs(args: string[]): string[] {
src/handlers/git/hostingCli.ts:export const ghHandler = makeHostingHandler("gh", buildGhArgs, formatGh);
src/handlers/git/hostingCli.ts:export const glabHandler = makeHostingHandler("glab", buildGlabArgs, formatGlab);
src/handlers/git/branch.ts:export function branchMode(rest: string[]): BranchMode {
src/handlers/git/branch.ts:export function buildBranchArgs(args: string[]): string[] {
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/compactDiff.ts:export function compactUnifiedDiff(diff: string, maxLines = 500): string {
src/handlers/git/compactDiff.ts:export function extractDiffStatLines(text: string): string[] {
src/handlers/git/status.ts:export function usesCompactStatusPath(args: string[]): boolean {
src/handlers/git/status.ts:export function buildStatusArgs(args: string[]): string[] {
src/handlers/git/status.ts:export function formatStatusOutput(porcelain: string, detached?: string): string {
src/handlers/git/status.ts:export function extractStateHeader(raw: string): string | undefined {
src/handlers/git/status.ts:export function extractDetachedHead(raw: string): string | undefined {
src/handlers/git/status.ts:export function filterStatusWithArgs(output: string): string {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/cloud/curl.ts:export function buildCurlArgs(args: string[]): string[] {
src/handlers/cloud/curl.ts:export const curlHandler: CommandHandler = {
src/handlers/cloud/aws.ts:export const awsHandler: CommandHandler = {
src/handlers/cloud/container.ts:export function buildDockerArgs(args: string[]): string[] {
src/handlers/cloud/container.ts:export function buildKubectlArgs(args: string[]): string[] {
src/handlers/cloud/container.ts:export const dockerHandler: CommandHandler = {
src/handlers/cloud/container.ts:export const kubectlHandler: CommandHandler = {
src/handlers/cloud/psql.ts:export const psqlHandler: CommandHandler = {
src/handlers/cloud/wget.ts:export const wgetHandler: CommandHandler = {
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/iac/terraform.ts:export const terraformHandler: CommandHandler = {
src/handlers/common/readLike.ts:      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/handlers/common/diff.ts:export function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
src/handlers/common/diff.ts:export const diffHandler: CommandHandler = {
src/handlers/common/searchLike.ts:export function buildGrepArgs(program: string, userArgs: string[]): string[] {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/common/grepFilter.ts:export const GREP_MAX_LINE_LEN = 80;
src/handlers/common/grepFilter.ts:export const GREP_MAX_RESULTS = 200;
src/handlers/common/grepFilter.ts:export const GREP_MAX_PER_FILE = 25;
src/handlers/common/grepFilter.ts:export type GrepMatch = { file: string; line: number; content: string };
src/handlers/common/grepFilter.ts:export function hasFormatFlag(args: string[]): boolean {
src/handlers/common/grepFilter.ts:export function parseMatchLine(line: string): GrepMatch | null {
src/handlers/common/grepFilter.ts:export function compactPath(path: string): string {
src/handlers/common/grepFilter.ts:export function cleanLine(line: string, maxLen: number, pattern: string): string {
src/handlers/common/grepFilter.ts:export type GrepGroupOptions = {
src/handlers/common/grepFilter.ts:export function groupGrepOutput(
src/handlers/system/tree.ts:export function buildTreeArgs(userArgs: string[]): string[] {
src/handlers/system/tree.ts:export const treeHandler: CommandHandler = {
src/handlers/system/wc.ts:export const wcHandler: CommandHandler = {
src/handlers/system/deps.ts:export const depsHandler: CommandHandler = {
src/handlers/system/env.ts:export const envHandler: CommandHandler = {
src/handlers/system/log.ts:export const logHandler: CommandHandler = {
src/handlers/system/smart.ts:export const smartHandler: CommandHandler = {
src/handlers/system/format.ts:export const formatHandler: CommandHandler = {
src/handlers/system/ls.ts:export function buildLsArgs(userArgs: string[]): string[] {
src/handlers/system/ls.ts:export const lsHandler: CommandHandler = {
src/handlers/system/summary.ts:export const summaryHandler: CommandHandler = {
src/handlers/system/npx.ts:export const npxHandler: CommandHandler = {
src/handlers/system/err.ts:export const errHandler: CommandHandler = {
src/handlers/system/json.ts:export const jsonHandler: CommandHandler = {
src/handlers/system/pipe.ts:export const pipeHandler: CommandHandler = {
src/handlers/system/read.ts:      trimmed.startsWith("export ") ||
src/handlers/system/read.ts:export function buildCatArgs(args: string[]): string[] {
src/handlers/system/read.ts:export const readHandler: CommandHandler = {
src/handlers/system/testRunner.ts:export const testRunnerHandler: CommandHandler = {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/base.ts:export function outputOmitsContent(output: string): boolean {
src/handlers/base.ts:export async function makeFilteredResult(
src/parse.ts:export function parseArgv(argv: string[]): ParsedArgv {
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TkOptions = {
src/types.ts:export type ParseMode = "command" | "report" | "help" | "version";
src/types.ts:export type ParsedArgv = {
src/types.ts:export interface CommandHandler {
src/executor.ts:export function executeCommand(
src/handlers/java/gradle.ts:export const gradleHandler: CommandHandler = {
src/core/outputLimit.ts:export function limitLines(text: string, _maxLines: number): string {
src/core/outputLimit.ts:export function limitChars(text: string, _maxChars: number): string {
src/core/outputLimit.ts:export function limitOutput(text: string, _options: TkOptions): string {
src/router.ts:export function routeCommand(command: ParsedCommand): CommandHandler {
src/core/ansi.ts:export function removeAnsi(text: string): string {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/pipeline.ts:export async function filterWithFallback(
src/handlers/java/maven.ts:export const mavenHandler: CommandHandler = {
src/core/dataDir.ts:export function tokenKillerHome(): string {
src/core/dataDir.ts:export function projectFingerprint(cwd: string): string {
src/core/dataDir.ts:export function projectDataDir(cwd: string): string {
src/core/dataDir.ts:export function historyFile(cwd: string): string {
src/core/dataDir.ts:export function rawOutputDir(cwd: string): string {
src/core/dataDir.ts:export function rawOutputPathRelative(cwd: string, fileName: string): string {
src/core/dataDir.ts:export function resolveStoredPath(storedPath: string): string {
src/handlers/python/ruff.ts:export function buildRuffArgs(userArgs: string[]): string[] {
src/handlers/python/ruff.ts:export const ruffHandler: CommandHandler = {
src/handlers/dotnet/dotnet.ts:export const dotnetHandler: CommandHandler = {
src/handlers/python/mypy.ts:export const mypyHandler: CommandHandler = {
src/handlers/python/pip.ts:export const pipHandler: CommandHandler = {
src/core/patterns.ts:export const IMPORTANT_PATTERN =
src/handlers/java/javac.ts:export const javacHandler: CommandHandler = {
src/core/text.ts:export function uniqueLines(lines: string[]): string[] {
src/core/text.ts:export function ensureTrailingNewline(text: string): string {
src/core/stats.ts:export function formatStats(result: {
src/core/fallback.ts:export async function filterWithGenericFallback(
src/handlers/js/tsc.ts:export const tscHandler: CommandHandler = {
src/handlers/js/playwright.ts:export const playwrightHandler: CommandHandler = {
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/handlers/js/test.ts:export const jsTestHandler: CommandHandler = {
src/handlers/js/prisma.ts:export const prismaHandler: CommandHandler = {
src/handlers/python/pytest.ts:export const pytestHandler: CommandHandler = {
src/core/rawStore.ts:export async function maybeSaveRawOutput(
src/handlers/js/npm.ts:export const npmHandler: CommandHandler = {
src/handlers/js/packageList.ts:export const packageListHandler: CommandHandler = {
src/core/report.ts:export async function buildReport(options: TkOptions): Promise<string> {
src/handlers/js/next.ts:export function extractTime(line: string): string | undefined {
src/handlers/js/next.ts:export const nextHandler: CommandHandler = {
src/core/path.ts:export function safePathPart(value: string): string {
src/handlers/js/eslint.ts:export const eslintHandler: CommandHandler = {
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/handlers/js/prettier.ts:export const prettierHandler: CommandHandler = {

```

**rtk** (10588 chars, 2647 tokens, 0% savings):

```text
131 matches in 72 files:

src/core/ansi.ts:3:export function removeAnsi(text: string): string {
src/core/dataDir.ts:14:export function tokenKillerHome(): string {
src/core/dataDir.ts:21:export function projectFingerprint(cwd: string): string {
src/core/dataDir.ts:27:export function projectDataDir(cwd: string): string {
src/core/dataDir.ts:31:export function historyFile(cwd: string): string {
src/core/dataDir.ts:35:export function rawOutputDir(cwd: string): string {
src/core/dataDir.ts:39:export function rawOutputPathRelative(cwd: string, fileName: string): string {
src/core/dataDir.ts:43:export function resolveStoredPath(storedPath: string): string {
src/core/fallback.ts:4:export async function filterWithGenericFallback(
src/core/history.ts:7:export type HistoryRecord = {
src/core/history.ts:24:export async function recordHistory(
src/core/history.ts:52:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/core/outputLimit.ts:3:export function limitLines(text: string, _maxLines: number): string {
src/core/outputLimit.ts:7:export function limitChars(text: string, _maxChars: number): string {
src/core/outputLimit.ts:11:export function limitOutput(text: string, _options: TkOptions): string {
src/core/path.ts:1:export function safePathPart(value: string): string {
src/core/patterns.ts:1:export const IMPORTANT_PATTERN =
src/core/pipeline.ts:5:export type PipelineResult = {
src/core/pipeline.ts:10:export async function runPipeline(
src/core/pipeline.ts:21:export async function filterWithFallback(
src/core/rawStore.ts:15:export async function maybeSaveRawOutput(
src/core/report.ts:4:export async function buildReport(options: TkOptions): Promise<string> {
src/core/savings.ts:1:export type Savings = {
src/core/savings.ts:10:export function estimateTokens(text: string): number {
src/core/savings.ts:14:export function calculateSavings(raw: string, output: string): Savings {
src/core/stats.ts:1:export function formatStats(result: {
src/core/text.ts:1:export function uniqueLines(lines: string[]): string[] {
src/core/text.ts:5:export function ensureTrailingNewline(text: string): string {
src/executor.ts:5:export function executeCommand(
src/handlers/base.ts:7:export function rawText(raw: RawResult): string {
src/handlers/base.ts:75:export function outputOmitsContent(output: string): boolean {
src/handlers/base.ts:93:export async function makeFilteredResult(
src/handlers/cloud/aws.ts:275:export const awsHandler: CommandHandler = {
src/handlers/cloud/container.ts:436:export function buildDockerArgs(args: string[]): string[] {
src/handlers/cloud/container.ts:483:export function buildKubectlArgs(args: string[]): string[] {
src/handlers/cloud/container.ts:610:export const dockerHandler: CommandHandler = {
src/handlers/cloud/container.ts:631:export const kubectlHandler: CommandHandler = {
src/handlers/cloud/curl.ts:18:export function buildCurlArgs(args: string[]): string[] {
src/handlers/cloud/curl.ts:60:export const curlHandler: CommandHandler = {
src/handlers/cloud/psql.ts:159:export const psqlHandler: CommandHandler = {
src/handlers/cloud/wget.ts:166:export const wgetHandler: CommandHandler = {
src/handlers/common/diff.ts:22:export function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[]...
src/handlers/common/diff.ts:196:export const diffHandler: CommandHandler = {
src/handlers/common/grepFilter.ts:12:export const GREP_MAX_LINE_LEN = 80;
src/handlers/common/grepFilter.ts:13:export const GREP_MAX_RESULTS = 200;
src/handlers/common/grepFilter.ts:14:export const GREP_MAX_PER_FILE = 25;
src/handlers/common/grepFilter.ts:16:export type GrepMatch = { file: string; line: number; content: string };
src/handlers/common/grepFilter.ts:33:export function hasFormatFlag(args: string[]): boolean {
src/handlers/common/grepFilter.ts:43:export function parseMatchLine(line: string): GrepMatch | null {
src/handlers/common/grepFilter.ts:52:export function compactPath(path: string): string {
src/handlers/common/grepFilter.ts:63:export function cleanLine(line: string, maxLen: number, pattern: string): string...
src/handlers/common/grepFilter.ts:87:export type GrepGroupOptions = {
src/handlers/common/grepFilter.ts:97:export function groupGrepOutput(
src/handlers/common/listLike.ts:211:export const listLikeHandler: CommandHandler = {
src/handlers/common/readLike.ts:26:/^(import |from |export |function |const \w+\s*=|class |interface |type |def |pa...
src/handlers/common/readLike.ts:219:export const readLikeHandler: CommandHandler = {
src/handlers/common/searchLike.ts:23:export function buildGrepArgs(program: string, userArgs: string[]): string[] {
src/handlers/common/searchLike.ts:29:export const searchLikeHandler: CommandHandler = {
src/handlers/dotnet/dotnet.ts:223:export const dotnetHandler: CommandHandler = {
src/handlers/generic.ts:5:export const genericHandler: CommandHandler = {
src/handlers/git/branch.ts:103:export function branchMode(rest: string[]): BranchMode {
src/handlers/git/branch.ts:115:export function buildBranchArgs(args: string[]): string[] {
src/handlers/git/branch.ts:127:export const gitBranchHandler: CommandHandler = {
src/handlers/git/compactDiff.ts:1:export function compactUnifiedDiff(diff: string, maxLines = 500): string {
src/handlers/git/compactDiff.ts:93:export function extractDiffStatLines(text: string): string[] {
src/handlers/git/diff.ts:22:export const gitDiffHandler: CommandHandler = {
src/handlers/git/extended.ts:81:export function buildAddArgs(args: string[]): string[] {
src/handlers/git/extended.ts:89:export function formatAddSummary(shortstatStdout: string): string {
src/handlers/git/extended.ts:203:export const gitExtendedHandlers: CommandHandler[] = [
src/handlers/git/graphite.ts:169:export const gtHandler: CommandHandler = {
src/handlers/git/hostingCli.ts:34:export function buildGhArgs(args: string[]): string[] {
src/handlers/git/hostingCli.ts:68:export function buildGlabArgs(args: string[]): string[] {
src/handlers/git/hostingCli.ts:280:export const ghHandler = makeHostingHandler("gh", buildGhArgs, formatGh);
src/handlers/git/hostingCli.ts:281:export const glabHandler = makeHostingHandler("glab", buildGlabArgs, formatGlab)...
src/handlers/git/log.ts:107:export const gitLogHandler: CommandHandler = {
src/handlers/git/show.ts:61:export const gitShowHandler: CommandHandler = {
src/handlers/git/status.ts:9:export function usesCompactStatusPath(args: string[]): boolean {
src/handlers/git/status.ts:34:export function buildStatusArgs(args: string[]): string[] {
src/handlers/git/status.ts:45:export function formatStatusOutput(porcelain: string, detached?: string): string...
src/handlers/git/status.ts:108:export function extractStateHeader(raw: string): string | undefined {
src/handlers/git/status.ts:130:export function extractDetachedHead(raw: string): string | undefined {
src/handlers/git/status.ts:139:export function filterStatusWithArgs(output: string): string {
src/handlers/git/status.ts:168:export const gitStatusHandler: CommandHandler = {
src/handlers/iac/terraform.ts:112:export const terraformHandler: CommandHandler = {
src/handlers/index.ts:54:export const handlers: CommandHandler[] = [
src/handlers/java/gradle.ts:21:export const gradleHandler: CommandHandler = {
src/handlers/java/javac.ts:43:export const javacHandler: CommandHandler = {
src/handlers/java/maven.ts:18:export const mavenHandler: CommandHandler = {
src/handlers/js/eslint.ts:81:export const eslintHandler: CommandHandler = {
src/handlers/js/next.ts:46:export function extractTime(line: string): string | undefined {
src/handlers/js/next.ts:162:export const nextHandler: CommandHandler = {
src/handlers/js/npm.ts:61:export const npmHandler: CommandHandler = {
src/handlers/js/packageList.ts:154:export const packageListHandler: CommandHandler = {
src/handlers/js/playwright.ts:177:export const playwrightHandler: CommandHandler = {
src/handlers/js/prettier.ts:115:export const prettierHandler: CommandHandler = {
src/handlers/js/prisma.ts:303:export const prismaHandler: CommandHandler = {
src/handlers/js/test.ts:195:export const jsTestHandler: CommandHandler = {
src/handlers/js/tsc.ts:106:export const tscHandler: CommandHandler = {
src/handlers/python/mypy.ts:112:export const mypyHandler: CommandHandler = {
src/handlers/python/pip.ts:146:export const pipHandler: CommandHandler = {
src/handlers/python/pytest.ts:211:export const pytestHandler: CommandHandler = {
src/handlers/python/ruff.ts:153:export function buildRuffArgs(userArgs: string[]): string[] {
src/handlers/python/ruff.ts:176:export const ruffHandler: CommandHandler = {
src/handlers/system/deps.ts:198:export const depsHandler: CommandHandler = {
src/handlers/system/env.ts:212:export const envHandler: CommandHandler = {
src/handlers/system/err.ts:85:export const errHandler: CommandHandler = {
src/handlers/system/format.ts:354:export const formatHandler: CommandHandler = {
src/handlers/system/json.ts:155:export const jsonHandler: CommandHandler = {
src/handlers/system/log.ts:186:export const logHandler: CommandHandler = {
src/handlers/system/ls.ts:235:export function buildLsArgs(userArgs: string[]): string[] {
src/handlers/system/ls.ts:251:export const lsHandler: CommandHandler = {
src/handlers/system/npx.ts:21:export const npxHandler: CommandHandler = {
src/handlers/system/pipe.ts:194:export const pipeHandler: CommandHandler = {
src/handlers/system/read.ts:115:trimmed.startsWith("export ") ||
src/handlers/system/read.ts:400:export function buildCatArgs(args: string[]): string[] {
src/handlers/system/read.ts:416:export const readHandler: CommandHandler = {
src/handlers/system/smart.ts:34:export const smartHandler: CommandHandler = {
src/handlers/system/summary.ts:239:export const summaryHandler: CommandHandler = {
src/handlers/system/testRunner.ts:82:export const testRunnerHandler: CommandHandler = {
src/handlers/system/tree.ts:45:export function buildTreeArgs(userArgs: string[]): string[] {
src/handlers/system/tree.ts:94:export const treeHandler: CommandHandler = {
src/handlers/system/wc.ts:146:export const wcHandler: CommandHandler = {
src/parse.ts:44:export function parseArgv(argv: string[]): ParsedArgv {
src/router.ts:4:export function routeCommand(command: ParsedCommand): CommandHandler {
src/types.ts:1:export type ParsedCommand = {
src/types.ts:8:export type RawResult = {
src/types.ts:21:export type FilteredResult = {
src/types.ts:36:export type TkOptions = {
src/types.ts:47:export type ParseMode = "command" | "report" | "help" | "version";
src/types.ts:49:export type ParsedArgv = {
src/types.ts:55:export interface CommandHandler {

```

---

### 31. [fixture] search-like keeps rg default format matches

- Handler: `search-like`
- tk: `tk filter rg pattern src`
- raw: `fixture: tests/fixtures/common/rg_default_format.txt`
- rtk: `cat tests/fixtures/common/rg_default_format.txt | rtk pipe -f rg`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 246 | 62 | 0% |
| tk | 269 | 68 | 0% |
| rtk | 340 | 85 | 0% |

**raw** (246 chars, 62 tokens):

```text
src/core/history.ts:1:export type HistoryRecord = {
src/core/pipeline.ts:2:export type PipelineResult = {
src/core/savings.ts:3:export type Savings = {
src/core/report.ts:4:export async function buildReport(options: TkOptions): Promise<string> {

```

**tk** (269 chars, 68 tokens, 0% savings):

```text
4 matches in 4 files:

src/core/history.ts:1:export type HistoryRecord = {
src/core/pipeline.ts:2:export type PipelineResult = {
src/core/report.ts:4:export async function buildReport(options: TkOptions): Promise<string> {
src/core/savings.ts:3:export type Savings = {

```

**rtk** (340 chars, 85 tokens, 0% savings):

```text
4 matches in 4F:

[file] src/core/history.ts (1):
     1: export type HistoryRecord = {

[file] src/core/pipeline.ts (1):
     2: export type PipelineResult = {

[file] src/core/report.ts (1):
     4: export async function buildReport(options: TkOptions): Promise<string> {

[file] src/core/savings.ts (1):
     3: export type Savings = {


```

---

### 32. [fixture] ruff keeps rule codes and file locations from fixture

- Handler: `ruff`
- tk: `tk filter ruff check .`
- raw: `fixture: tests/fixtures/python/ruff_many.txt`
- rtk: `cat tests/fixtures/python/ruff_many.txt | rtk pipe -f ruff-check`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 193 | 49 | 0% |
| tk | 193 | 49 | 0% |
| rtk | 259 | 65 | 0% |

**raw** (193 chars, 49 tokens):

```text
src/order/submit.py:42:5: F401 `os` imported but unused
src/order/submit.py:88:12: B008 Do not perform function call in argument defaults
Found 2 errors.
[*] 1 fixable with the `--fix` option.

```

**tk** (193 chars, 49 tokens, 0% savings):

```text
src/order/submit.py:42:5: F401 `os` imported but unused
src/order/submit.py:88:12: B008 Do not perform function call in argument defaults
Found 2 errors.
[*] 1 fixable with the `--fix` option.

```

**rtk** (259 chars, 65 tokens, 0% savings):

```text
Ruff check (JSON parse failed: expected value at line 1 column 1)
src/order/submit.py:42:5: F401 `os` imported but unused
src/order/submit.py:88:12: B008 Do not perform function call in argument defaults
Found 2 errors.
[*] 1 fixable with the `--fix` option.

```

---

### 33. [fixture] search-like keeps rg matches from real output

- Handler: `search-like`
- tk: `tk filter rg submitOrder src`
- raw: `fixture: tests/fixtures/common/rg_many_matches.txt`
- rtk: `cat tests/fixtures/common/rg_many_matches.txt | rtk pipe -f rg`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 116 | 29 | 0% |
| tk | 116 | 29 | 0% |
| rtk | 170 | 43 | 0% |

**raw** (116 chars, 29 tokens):

```text
src/order/submit.ts:42:export async function submitOrder(payload) {
src/order/api.ts:88:return submitOrder(payload)

```

**tk** (116 chars, 29 tokens, 0% savings):

```text
src/order/submit.ts:42:export async function submitOrder(payload) {
src/order/api.ts:88:return submitOrder(payload)

```

**rtk** (170 chars, 43 tokens, 0% savings):

```text
2 matches in 2F:

[file] src/order/api.ts (1):
    88: return submitOrder(payload)

[file] src/order/submit.ts (1):
    42: export async function submitOrder(payload) {


```

---

### 34. [fixture] summary digests a test run instead of replaying lines

- Handler: `summary`
- tk: `tk filter summary npm test`
- raw: `fixture: tests/fixtures/system/summary_test_run.txt`
- rtk: `rtk summary 'cat tests/fixtures/system/summary_test_run.txt'`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 94 | 24 | 0% |
| tk | 177 | 45 | 0% |
| rtk | 228 | 57 | 0% |

**raw** (94 chars, 24 tokens):

```text
PASS src/a.test.ts
FAIL src/b.test.ts
Tests: 1 failed, 12 passed, 13 total
Snapshots: 0 total

```

**tk** (177 chars, 45 tokens, 0% savings):

```text
[FAIL] Command: npm test
   5 lines of output

Test Results:
   [ok] 12 passed
   [FAIL] 1 failed

   Failures:
   • FAIL src/b.test.ts
   • Tests: 1 failed, 12 passed, 13 total
```

**rtk** (228 chars, 57 tokens, 0% savings):

```text
[ok] Command: cat '/Users/ziyu/Workspace/token-killer/tests/fixtures/sys...
   5 lines of output

Test Results:
   [ok] 12 passed
   [FAIL] 1 failed

   Failures:
   • FAIL src/b.test.ts
   • Tests: 1 failed, 12 passed, 13 total

```

---

### 35. tsc: type error in temp file

- Handler: `tsc`
- tk: `tk pnpm exec tsc --noEmit --ignoreConfig /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-tsc-LXRX8r/broken.ts`
- raw: `pnpm exec tsc --noEmit --ignoreConfig /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-tsc-LXRX8r/broken.ts`
- rtk: `tsc --noEmit --ignoreConfig /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-tsc-LXRX8r/broken.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 162 | 41 | 0% |
| tk | 198 | 50 | 0% |
| rtk | 234 | 59 | 0% |

**raw** (162 chars, 41 tokens):

```text
../../../../var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-tsc-LXRX8r/broken.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.

```

**tk** (198 chars, 50 tokens, 0% savings):

```text
TypeScript: 1 errors in 1 files
../../../../var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-tsc-LXRX8r/broken.ts (1 errors)
  L1: TS2322 Type 'string' is not assignable to type 'number'.

```

**rtk** (234 chars, 59 tokens, 0% savings):

```text
../../../../var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-tsc-LXRX8r/broken.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
═══════════════════════════════════════
TypeScript: 1 errors in 1 files

```

---

### 36. diff: diff old.ts new.ts

- Handler: `diff`
- tk: `tk diff /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/old.ts /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/new.ts`
- raw: `diff /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/old.ts /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/new.ts`
- rtk: `diff /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/old.ts /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/new.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 30 | 8 | 0% |
| tk | 196 | 49 | 0% |
| rtk | 228 | 57 | 0% |

**raw** (30 chars, 8 tokens):

```text
1a2
> export const extra = 2;

```

**tk** (196 chars, 49 tokens, 0% savings):

```text
/var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/old.ts -> /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/new.ts (+1 -0)

+ export const extra = 2;

```

**rtk** (228 chars, 57 tokens, 0% savings):

```text
/var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/old.ts → /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tk-compare-diff-FYcbsI/new.ts
   +1 added, -0 removed, ~0 modified

+   2 export const extra = 2;

```

---

### 37. git-fetch: missing remote

- Handler: `git-fetch`
- tk: `tk git fetch /tmp/__tk_missing_remote__ main`
- raw: `git --no-pager fetch /tmp/__tk_missing_remote__ main`
- rtk: `git fetch /tmp/__tk_missing_remote__ main`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 201 | 51 | 0% |
| tk | 251 | 63 | 0% |
| rtk | 220 | 55 | 0% |

**raw** (201 chars, 51 tokens):

```text
fatal: '/tmp/__tk_missing_remote__' does not appear to be a git repository
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.

```

**tk** (251 chars, 63 tokens, 0% savings):

```text
FAILED: git fetch /tmp/__tk_missing_remote__ main
fatal: '/tmp/__tk_missing_remote__' does not appear to be a git repository
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.

```

**rtk** (220 chars, 55 tokens, 0% savings):

```text
FAILED: git fetch
fatal: '/tmp/__tk_missing_remote__' does not appear to be a git repository
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.


```

---

### 38. tsc: tsc --noEmit clean project

- Handler: `tsc`
- tk: `tk tsc --noEmit`
- raw: `pnpm exec tsc --noEmit`
- rtk: `tsc --noEmit`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 0 | 0 | 0% |
| tk | 0 | 0 | 0% |
| rtk | 28 | 7 | 0% |

**raw** (0 chars, 0 tokens):

```text

```

**tk** (0 chars, 0 tokens, 0% savings):

```text

```

**rtk** (28 chars, 7 tokens, 0% savings):

```text
TypeScript: No errors found

```

---

### 39. git-add: missing path

- Handler: `git-add`
- tk: `tk git add __tk_missing_fixture_file__`
- raw: `git --no-pager add __tk_missing_fixture_file__`
- rtk: `git add __tk_missing_fixture_file__`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 70 | 18 | 0% |
| tk | 70 | 18 | 0% |
| rtk | 87 | 22 | 0% |

**raw** (70 chars, 18 tokens):

```text
fatal: pathspec '__tk_missing_fixture_file__' did not match any files

```

**tk** (70 chars, 18 tokens, 0% savings):

```text
fatal: pathspec '__tk_missing_fixture_file__' did not match any files

```

**rtk** (87 chars, 22 tokens, 0% savings):

```text
FAILED: git add
fatal: pathspec '__tk_missing_fixture_file__' did not match any files


```

---

### 40. git-pull: ff-only local

- Handler: `git-pull`
- tk: `tk git pull --ff-only . HEAD`
- raw: `git --no-pager pull --ff-only . HEAD`
- rtk: `git pull --ff-only . HEAD`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 157 | 40 | 0% |
| tk | 157 | 40 | 0% |
| rtk | 175 | 44 | 0% |

**raw** (157 chars, 40 tokens):

```text
error: cannot pull with rebase: You have unstaged changes.
error: additionally, your index contains uncommitted changes.
error: Please commit or stash them.

```

**tk** (157 chars, 40 tokens, 0% savings):

```text
error: cannot pull with rebase: You have unstaged changes.
error: additionally, your index contains uncommitted changes.
error: Please commit or stash them.

```

**rtk** (175 chars, 44 tokens, 0% savings):

```text
FAILED: git pull
error: cannot pull with rebase: You have unstaged changes.
error: additionally, your index contains uncommitted changes.
error: Please commit or stash them.


```

---

### 41. git-push: dry-run local

- Handler: `git-push`
- tk: `tk git push --dry-run . HEAD:refs/heads/__tk_fixture_branch__`
- raw: `git --no-pager push --dry-run . HEAD:refs/heads/__tk_fixture_branch__`
- rtk: `git push --dry-run . HEAD:refs/heads/__tk_fixture_branch__`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 56 | 14 | 0% |
| tk | 66 | 17 | 0% |
| rtk | 81 | 21 | 0% |

**raw** (56 chars, 14 tokens):

```text
To .
 * [new branch]      HEAD -> __tk_fixture_branch__

```

**tk** (66 chars, 17 tokens, 0% savings):

```text
To .
 * [new branch]      HEAD -> __tk_fixture_branch__
ok pushed

```

**rtk** (81 chars, 21 tokens, 0% savings):

```text
To .
 * [new branch]      HEAD -> __tk_fixture_branch__
ok __tk_fixture_branch__

```

---

### 42. [fixture] diff stdin condenses unified diff by file

- Handler: `diff`
- tk: `tk filter diff -`
- raw: `fixture: tests/fixtures/common/diff_unified_stdin.txt`
- rtk: `cat tests/fixtures/common/diff_unified_stdin.txt | rtk diff -`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 386 | 97 | 0% |
| tk | 112 | 28 | 71.1% |
| rtk | 112 | 28 | 71.1% |

**raw** (386 chars, 97 tokens):

```text
diff --git a/src/main.ts b/src/main.ts
index 1111111..2222222 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,4 +1,5 @@
 export function main() {
+  console.log("hello");
   console.log("world");
 }
diff --git a/src/config.ts b/src/config.ts
index 3333333..4444444 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,2 @@
 export const enabled = true;
-export const retries = 3;

```

**tk** (112 chars, 28 tokens, 71.1% savings):

```text
[file] src/main.ts (+1 -0)
  +  console.log("hello");
[file] src/config.ts (+0 -1)
  -export const retries = 3;

```

**rtk** (112 chars, 28 tokens, 71.1% savings):

```text
[file] src/main.ts (+1 -0)
  +  console.log("hello");
[file] src/config.ts (+0 -1)
  -export const retries = 3;

```

---

### 43. [fixture] diff stdin keeps all unified diff changes

- Handler: `diff`
- tk: `tk filter diff -`
- raw: `fixture: tests/fixtures/common/diff_unified_large.txt`
- rtk: `cat tests/fixtures/common/diff_unified_large.txt | rtk diff -`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 279 | 70 | 0% |
| tk | 221 | 56 | 20% |
| rtk | 221 | 56 | 20% |

**raw** (279 chars, 70 tokens):

```text
diff --git a/config.yaml b/config.yaml
index 1111111..2222222 100644
--- a/config.yaml
+++ b/config.yaml
@@ -1,12 +1,12 @@
-old_value_0
-old_value_1
-old_value_2
-old_value_3
-old_value_4
-old_value_5
+new_value_0
+new_value_1
+new_value_2
+new_value_3
+new_value_4
+new_value_5

```

**tk** (221 chars, 56 tokens, 20% savings):

```text
[file] config.yaml (+6 -6)
  -old_value_0
  -old_value_1
  -old_value_2
  -old_value_3
  -old_value_4
  -old_value_5
  +new_value_0
  +new_value_1
  +new_value_2
  +new_value_3
  +new_value_4
  +new_value_5
  ... +2 more

```

**rtk** (221 chars, 56 tokens, 20% savings):

```text
[file] config.yaml (+6 -6)
  -old_value_0
  -old_value_1
  -old_value_2
  -old_value_3
  -old_value_4
  -old_value_5
  +new_value_0
  +new_value_1
  +new_value_2
  +new_value_3
  +new_value_4
  +new_value_5
  ... +2 more

```

---

### 44. [fixture] err keeps error blocks and drops info noise

- Handler: `err`
- tk: `tk filter err npm run build`
- raw: `fixture: tests/fixtures/system/err_build.txt`
- rtk: `rtk err 'cat tests/fixtures/system/err_build.txt'`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 107 | 27 | 0% |
| tk | 74 | 19 | 29.6% |
| rtk | 75 | 19 | 29.6% |

**raw** (107 chars, 27 tokens):

```text
info: starting build
warning: deprecated option --legacy
error: build failed
  at src/app.ts:10
info: done

```

**tk** (74 chars, 19 tokens, 29.6% savings):

```text
warning: deprecated option --legacy
error: build failed
  at src/app.ts:10
```

**rtk** (75 chars, 19 tokens, 29.6% savings):

```text
warning: deprecated option --legacy
error: build failed
  at src/app.ts:10

```

---

### 45. [fixture] gh repo view keeps repository identity and URL

- Handler: `gh`
- tk: `tk filter gh repo view`
- raw: `fixture: tests/fixtures/git/gh_repo_view.json`
- rtk: `cat tests/fixtures/git/gh_repo_view.json | rtk gh repo view`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 166 | 42 | 0% |
| tk | 92 | 23 | 45.2% |
| rtk | 92 | 23 | 45.2% |

**raw** (166 chars, 42 tokens):

```text
{"name":"token-killer","owner":{"login":"Cozy228"},"description":"","url":"https://github.com/Cozy228/token-killer","stargazerCount":0,"forkCount":0,"isPrivate":false}

```

**tk** (92 chars, 23 tokens, 45.2% savings):

```text
Cozy228/token-killer
  [public]
  0 stars | 0 forks
  https://github.com/Cozy228/token-killer

```

**rtk** (92 chars, 23 tokens, 45.2% savings):

```text
Cozy228/token-killer
  [public]
  0 stars | 0 forks
  https://github.com/Cozy228/token-killer

```

---

### 46. [fixture] git-log keeps commit subject from real log

- Handler: `git-log`
- tk: `tk filter git log`
- raw: `fixture: tests/fixtures/git/log_many.txt`
- rtk: `cat tests/fixtures/git/log_many.txt | rtk pipe -f git-log`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 122 | 31 | 0% |
| tk | 122 | 31 | 0% |
| rtk | 122 | 31 | 0% |

**raw** (122 chars, 31 tokens):

```text
commit abcdef1234567890
Author: Test User <test@example.com>
Date:   Tue Jun 02 10:00:00 2026 +0800

    retained subject

```

**tk** (122 chars, 31 tokens, 0% savings):

```text
commit abcdef1234567890
Author: Test User <test@example.com>
Date:   Tue Jun 02 10:00:00 2026 +0800

    retained subject

```

**rtk** (122 chars, 31 tokens, 0% savings):

```text
commit abcdef1234567890
  Author: Test User <test@example.com>
  Date:   Tue Jun 02 10:00:00 2026 +0800
  retained subject
```

---

### 47. [fixture] git-status keeps porcelain branch context

- Handler: `git-status`
- tk: `tk filter git status --short --branch`
- raw: `fixture: tests/fixtures/git/status_porcelain_branch_current.txt`
- rtk: `cat tests/fixtures/git/status_porcelain_branch_current.txt | rtk pipe -f git-status`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 760 | 190 | 0% |
| tk | 759 | 190 | 0% |
| rtk | 758 | 190 | 0% |

**raw** (760 chars, 190 tokens):

```text
## codex/token-killer-node-cli...origin/codex/token-killer-node-cli
 M docs/testing-and-migration-audit.md
 M package.json
 M tests/helpers/fixtureCases.ts
 M tests/smoke/smoke.sh
 M tests/unit/handlers/fixtureContent.test.ts
 M tests/unit/handlers/syntheticTestDebt.test.ts
 M tests/unit/rtkScriptParity.test.ts
 M vitest.config.ts
?? tests/fixtures/git/add_missing_path.txt
?? tests/fixtures/git/commit_dry_run_dirty.txt
?? tests/fixtures/git/fetch_missing_remote.txt
?? tests/fixtures/git/gh_repo_view.json
?? tests/fixtures/git/pull_unstaged_changes.txt
?? tests/fixtures/git/push_dry_run_local.txt
?? tests/fixtures/git/stash_invalid_ref.txt
?? tests/fixtures/git/worktree_list.txt
?? tests/unit/handlers/fixtureWiring.test.ts
?? vitest.migration.config.ts

```

**tk** (759 chars, 190 tokens, 0% savings):

```text
* codex/token-killer-node-cli...origin/codex/token-killer-node-cli
 M docs/testing-and-migration-audit.md
 M package.json
 M tests/helpers/fixtureCases.ts
 M tests/smoke/smoke.sh
 M tests/unit/handlers/fixtureContent.test.ts
 M tests/unit/handlers/syntheticTestDebt.test.ts
 M tests/unit/rtkScriptParity.test.ts
 M vitest.config.ts
?? tests/fixtures/git/add_missing_path.txt
?? tests/fixtures/git/commit_dry_run_dirty.txt
?? tests/fixtures/git/fetch_missing_remote.txt
?? tests/fixtures/git/gh_repo_view.json
?? tests/fixtures/git/pull_unstaged_changes.txt
?? tests/fixtures/git/push_dry_run_local.txt
?? tests/fixtures/git/stash_invalid_ref.txt
?? tests/fixtures/git/worktree_list.txt
?? tests/unit/handlers/fixtureWiring.test.ts
?? vitest.migration.config.ts

```

**rtk** (758 chars, 190 tokens, 0% savings):

```text
* codex/token-killer-node-cli...origin/codex/token-killer-node-cli
 M docs/testing-and-migration-audit.md
 M package.json
 M tests/helpers/fixtureCases.ts
 M tests/smoke/smoke.sh
 M tests/unit/handlers/fixtureContent.test.ts
 M tests/unit/handlers/syntheticTestDebt.test.ts
 M tests/unit/rtkScriptParity.test.ts
 M vitest.config.ts
?? tests/fixtures/git/add_missing_path.txt
?? tests/fixtures/git/commit_dry_run_dirty.txt
?? tests/fixtures/git/fetch_missing_remote.txt
?? tests/fixtures/git/gh_repo_view.json
?? tests/fixtures/git/pull_unstaged_changes.txt
?? tests/fixtures/git/push_dry_run_local.txt
?? tests/fixtures/git/stash_invalid_ref.txt
?? tests/fixtures/git/worktree_list.txt
?? tests/unit/handlers/fixtureWiring.test.ts
?? vitest.migration.config.ts
```

---

### 48. [fixture] git-status keeps staged modified and untracked paths

- Handler: `git-status`
- tk: `tk filter git status`
- raw: `fixture: tests/fixtures/git/status_dirty.txt`
- rtk: `cat tests/fixtures/git/status_dirty.txt | rtk pipe -f git-status`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 81 | 21 | 0% |
| tk | 80 | 20 | 4.8% |
| rtk | 79 | 20 | 4.8% |

**raw** (81 chars, 21 tokens):

```text
## feature/token-proxy
A  src/cli.ts
 M src/parse.ts
?? tests/unit/parse.test.ts

```

**tk** (80 chars, 20 tokens, 4.8% savings):

```text
* feature/token-proxy
A  src/cli.ts
 M src/parse.ts
?? tests/unit/parse.test.ts

```

**rtk** (79 chars, 20 tokens, 4.8% savings):

```text
* feature/token-proxy
A  src/cli.ts
 M src/parse.ts
?? tests/unit/parse.test.ts
```

---

### 49. [fixture] git-worktree keeps worktree path and branch

- Handler: `git-worktree`
- tk: `tk filter git worktree list`
- raw: `fixture: tests/fixtures/git/worktree_list.txt`
- rtk: `cat tests/fixtures/git/worktree_list.txt | rtk git worktree list`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 72 | 18 | 0% |
| tk | 61 | 16 | 11.1% |
| rtk | 61 | 16 | 11.1% |

**raw** (72 chars, 18 tokens):

```text
/Users/ziyu/Workspace/token-killer  62d59ca [codex/token-killer-node-cli]

```

**tk** (61 chars, 16 tokens, 11.1% savings):

```text
~/Workspace/token-killer 62d59ca [codex/token-killer-node-cli]

```

**rtk** (61 chars, 16 tokens, 11.1% savings):

```text
~/Workspace/token-killer eccdcd5 [codex/token-killer-node-cli]

```

---

### 50. [fixture] js-test formats passing Vitest output like RTK

- Handler: `js-test`
- tk: `tk filter vitest run`
- raw: `fixture: tests/fixtures/js/vitest_passed.txt`
- rtk: `cat tests/fixtures/js/vitest_passed.txt | rtk pipe -f vitest`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 136 | 34 | 0% |
| tk | 31 | 8 | 76.5% |
| rtk | 30 | 8 | 76.5% |

**raw** (136 chars, 34 tokens):

```text
 RUN  v4.1.8 /repo

 ✓ tests/unit/savings.test.ts (4 tests) 3ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  120ms

```

**tk** (31 chars, 8 tokens, 76.5% savings):

```text
PASS (4) FAIL (0)

Time: 120ms

```

**rtk** (30 chars, 8 tokens, 76.5% savings):

```text
PASS (4) FAIL (0)

Time: 120ms
```

---

### 51. [fixture] log deduplicates repeated lines into a summary

- Handler: `log`
- tk: `tk filter log app.log`
- raw: `fixture: tests/fixtures/system/app_repeated.log`
- rtk: `cat tests/fixtures/system/app_repeated.log | rtk pipe -f log`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 592 | 148 | 0% |
| tk | 390 | 98 | 33.8% |
| rtk | 389 | 98 | 33.8% |

**raw** (592 chars, 148 tokens):

```text
2024-01-01 10:00:00 ERROR: Connection failed to /api/server
2024-01-01 10:00:01 ERROR: Connection failed to /api/server
2024-01-01 10:00:02 ERROR: Connection failed to /api/server
2024-01-01 10:00:03 ERROR: Disk write to /var/log/app.log failed
2024-01-01 10:00:04 WARN: Retrying connection to /api/server
2024-01-01 10:00:05 WARN: Retrying connection to /api/server
2024-01-01 10:00:06 WARN: Cache miss for /tmp/cache/object
2024-01-01 10:00:07 INFO: Connected to /api/server
2024-01-01 10:00:08 INFO: Request served from /tmp/cache/object
2024-01-01 10:00:09 INFO: Connected to /api/server

```

**tk** (390 chars, 98 tokens, 33.8% savings):

```text
Log Summary
   [error] 4 errors (2 unique)
   [warn] 3 warnings (2 unique)
   [info] 3 info messages

[ERRORS]
   [×3] 2024-01-01 10:00:00 ERROR: Connection failed to /api/server
   2024-01-01 10:00:03 ERROR: Disk write to /var/log/app.log failed

[WARNINGS]
   [×2] 2024-01-01 10:00:04 WARN: Retrying connection to /api/server
   2024-01-01 10:00:06 WARN: Cache miss for /tmp/cache/object

```

**rtk** (389 chars, 98 tokens, 33.8% savings):

```text
Log Summary
   [error] 4 errors (2 unique)
   [warn] 3 warnings (2 unique)
   [info] 3 info messages

[ERRORS]
   [×3] 2024-01-01 10:00:00 ERROR: Connection failed to /api/server
   2024-01-01 10:00:03 ERROR: Disk write to /var/log/app.log failed

[WARNINGS]
   [×2] 2024-01-01 10:00:04 WARN: Retrying connection to /api/server
   2024-01-01 10:00:06 WARN: Cache miss for /tmp/cache/object
```

---

### 52. [fixture] mypy keeps error codes and file locations from fixture

- Handler: `mypy`
- tk: `tk filter mypy src`
- raw: `fixture: tests/fixtures/python/mypy_many.txt`
- rtk: `cat tests/fixtures/python/mypy_many.txt | rtk pipe -f mypy`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 220 | 55 | 0% |
| tk | 316 | 79 | 0% |
| rtk | 315 | 79 | 0% |

**raw** (220 chars, 55 tokens):

```text
src/order/submit.py:82: error: Argument 1 has incompatible type "str"; expected "Order"  [arg-type]
src/order/api.py:31: error: Item "None" of "Order | None" has no attribute "id"  [union-attr]
Found 2 errors in 2 files

```

**tk** (316 chars, 79 tokens, 0% savings):

```text
mypy: 2 errors in 2 files
═══════════════════════════════════════
Top codes: arg-type (1x), union-attr (1x)

src/order/api.py (1 errors)
  L31: [union-attr] Item "None" of "Order | None" has no attribute "id"

src/order/submit.py (1 errors)
  L82: [arg-type] Argument 1 has incompatible type "str"; expected "Order"

```

**rtk** (315 chars, 79 tokens, 0% savings):

```text
mypy: 2 errors in 2 files
═══════════════════════════════════════
Top codes: union-attr (1x), arg-type (1x)

src/order/api.py (1 errors)
  L31: [union-attr] Item "None" of "Order | None" has no attribute "id"

src/order/submit.py (1 errors)
  L82: [arg-type] Argument 1 has incompatible type "str"; expected "Order"
```

---

### 53. [fixture] pipe grep groups matches by file

- Handler: `pipe`
- tk: `tk filter pipe grep`
- raw: `fixture: tests/fixtures/system/pipe_grep_matches.txt`
- rtk: `cat tests/fixtures/system/pipe_grep_matches.txt | rtk pipe -f grep`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 338 | 85 | 0% |
| tk | 335 | 84 | 1.2% |
| rtk | 335 | 84 | 1.2% |

**raw** (338 chars, 85 tokens):

```text
src/cmds/system/handler.rs:10:    let result = process_request(ctx, &payload).await?;
src/cmds/system/handler.rs:20:    let result = process_request(ctx, &payload).await?;
src/cmds/git/handler.rs:30:    let result = process_request(ctx, &payload).await?;
src/cmds/git/handler.rs:40:    let result = process_request(ctx, &payload).await?;

```

**tk** (335 chars, 84 tokens, 1.2% savings):

```text
4 matches in 2F:

[file] src/cmds/git/handler.rs (2):
    30: let result = process_request(ctx, &payload).await?;
    40: let result = process_request(ctx, &payload).await?;

[file] src/cmds/system/handler.rs (2):
    10: let result = process_request(ctx, &payload).await?;
    20: let result = process_request(ctx, &payload).await?;


```

**rtk** (335 chars, 84 tokens, 1.2% savings):

```text
4 matches in 2F:

[file] src/cmds/git/handler.rs (2):
    30: let result = process_request(ctx, &payload).await?;
    40: let result = process_request(ctx, &payload).await?;

[file] src/cmds/system/handler.rs (2):
    10: let result = process_request(ctx, &payload).await?;
    20: let result = process_request(ctx, &payload).await?;


```

---

### 54. [fixture] prettier check lists files needing formatting

- Handler: `prettier`
- tk: `tk filter prettier --check src`
- raw: `fixture: tests/fixtures/js/prettier_check.txt`
- rtk: `cat tests/fixtures/js/prettier_check.txt | rtk pipe -f prettier`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 237 | 60 | 0% |
| tk | 236 | 59 | 1.7% |
| rtk | 235 | 59 | 1.7% |

**raw** (237 chars, 60 tokens):

```text
Checking formatting...
src/components/ui/button.tsx
src/lib/auth/session.ts
src/pages/dashboard.tsx
src/pages/settings.tsx
src/lib/api/client.ts
src/lib/api/routes.ts
Code style issues found in the above file(s). Forgot to run Prettier?

```

**tk** (236 chars, 59 tokens, 1.7% savings):

```text
Prettier: 6 files need formatting
═══════════════════════════════════════
1. src/components/ui/button.tsx
2. src/lib/auth/session.ts
3. src/pages/dashboard.tsx
4. src/pages/settings.tsx
5. src/lib/api/client.ts
6. src/lib/api/routes.ts

```

**rtk** (235 chars, 59 tokens, 1.7% savings):

```text
Prettier: 6 files need formatting
═══════════════════════════════════════
1. src/components/ui/button.tsx
2. src/lib/auth/session.ts
3. src/pages/dashboard.tsx
4. src/pages/settings.tsx
5. src/lib/api/client.ts
6. src/lib/api/routes.ts
```

---

### 55. [fixture] pytest keeps failing test and assertion from fixture

- Handler: `pytest`
- tk: `tk filter pytest`
- raw: `fixture: tests/fixtures/python/pytest_failed.txt`
- rtk: `cat tests/fixtures/python/pytest_failed.txt | rtk pipe -f pytest`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 880 | 220 | 0% |
| tk | 351 | 88 | 60% |
| rtk | 350 | 88 | 60% |

**raw** (880 chars, 220 tokens):

```text
============================= test session starts ==============================
platform darwin -- Python 3.11.0, pytest-8.1.0, pluggy-1.4.0
rootdir: /Users/dev/project
collected 119 items

tests/order/test_submit.py .....................F......................  [100%]

=================================== FAILURES ===================================
___________________________ test_duplicate_submit ______________________________

    def test_duplicate_submit():
        result = submit(order)
>       assert result.calls == 1
E       AssertionError: expected 1 call, got 2

src/order/submit.py:82: AssertionError
=========================== short test summary info ============================
FAILED tests/order/test_submit.py::test_duplicate_submit - AssertionError: expected 1 call, got 2
=================== 1 failed, 118 passed, 4 warnings in 3.50s ===================

```

**tk** (351 chars, 88 tokens, 60% savings):

```text
Pytest: 118 passed, 1 failed
═══════════════════════════════════════

Failures:
1. [FAIL] test_duplicate_submit
     >       assert result.calls == 1
     E       AssertionError: expected 1 call, got 2
     src/order/submit.py:82: AssertionError

2. [FAIL] tests/order/test_submit.py::test_duplicate_submit
     AssertionError: expected 1 call, got 2

```

**rtk** (350 chars, 88 tokens, 60% savings):

```text
Pytest: 118 passed, 1 failed
═══════════════════════════════════════

Failures:
1. [FAIL] test_duplicate_submit
     >       assert result.calls == 1
     E       AssertionError: expected 1 call, got 2
     src/order/submit.py:82: AssertionError

2. [FAIL] tests/order/test_submit.py::test_duplicate_submit
     AssertionError: expected 1 call, got 2
```

---

### 56. [fixture] pytest keeps passing summary from fixture

- Handler: `pytest`
- tk: `tk filter pytest`
- raw: `fixture: tests/fixtures/python/pytest_passed.txt`
- rtk: `cat tests/fixtures/python/pytest_passed.txt | rtk pipe -f pytest`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 20 | 5 | 0% |
| tk | 19 | 5 | 0% |
| rtk | 18 | 5 | 0% |

**raw** (20 chars, 5 tokens):

```text
118 passed in 3.50s

```

**tk** (19 chars, 5 tokens, 0% savings):

```text
Pytest: 118 passed

```

**rtk** (18 chars, 5 tokens, 0% savings):

```text
Pytest: 118 passed
```

---

### 57. [fixture] search-like keeps grep matches without line numbers

- Handler: `search-like`
- tk: `tk filter grep -r export src`
- raw: `fixture: tests/fixtures/common/grep_no_line_numbers.txt`
- rtk: `cat tests/fixtures/common/grep_no_line_numbers.txt | rtk pipe -f grep`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1580 | 395 | 0% |
| tk | 1580 | 395 | 0% |
| rtk | 1580 | 395 | 0% |

**raw** (1580 chars, 395 tokens):

```text
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/core/report.ts:export async function buildReport(options: TkOptions): Promise<string> {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TkOptions = {
src/types.ts:export interface CommandHandler {

```

**tk** (1580 chars, 395 tokens, 0% savings):

```text
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/core/report.ts:export async function buildReport(options: TkOptions): Promise<string> {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TkOptions = {
src/types.ts:export interface CommandHandler {

```

**rtk** (1580 chars, 395 tokens, 0% savings):

```text
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/core/report.ts:export async function buildReport(options: TkOptions): Promise<string> {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TkOptions = {
src/types.ts:export interface CommandHandler {

```

---

### 58. curl: httpbin json

- Handler: `curl`
- tk: `tk curl -s https://httpbin.org/json`
- raw: `curl -s https://httpbin.org/json`
- rtk: `curl -s https://httpbin.org/json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 162 | 41 | 0% |
| tk | 161 | 41 | 0% |
| rtk | 161 | 41 | 0% |

**raw** (162 chars, 41 tokens):

```text
<html>
<head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
</body>
</html>

```

**tk** (161 chars, 41 tokens, 0% savings):

```text
<html>
<head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
</body>
</html>

```

**rtk** (161 chars, 41 tokens, 0% savings):

```text
<html>
<head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
</body>
</html>

```

---

### 59. docker: compose ps (temp project)

- Handler: `docker`
- tk: `tk docker compose ps`
- raw: `docker compose ps`
- rtk: `docker compose ps`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 113 | 29 | 0% |
| tk | 113 | 29 | 0% |
| rtk | 114 | 29 | 0% |

**raw** (113 chars, 29 tokens):

```text
Cannot connect to the Docker daemon at unix:///Users/ziyu/.docker/run/docker.sock. Is the docker daemon running?

```

**tk** (113 chars, 29 tokens, 0% savings):

```text
Cannot connect to the Docker daemon at unix:///Users/ziyu/.docker/run/docker.sock. Is the docker daemon running?

```

**rtk** (114 chars, 29 tokens, 0% savings):

```text
Cannot connect to the Docker daemon at unix:///Users/ziyu/.docker/run/docker.sock. Is the docker daemon running?


```

---

### 60. env: env snapshot

- Handler: `env`
- tk: `tk env`
- raw: `env`
- rtk: `env`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 5698 | 1425 | 0% |
| tk | 2360 | 590 | 58.6% |
| rtk | 2360 | 590 | 58.6% |

**raw** (5698 chars, 1425 tokens):

```text
NVM_INC=/Users/ziyu/.nvm/versions/node/v22.22.2/include/node
MANPATH=/Users/ziyu/.nvm/versions/node/v22.22.2/share/man::/usr/share/man:/usr/local/share/man:/Applications/cmux.app/Contents/Resources/man:/Applications/cmux.app/Contents/Resources/ghostty/../man:
CMUX_BUNDLED_CLI_PATH=/Applications/cmux.app/Contents/Resources/bin/cmux
GHOSTTY_RESOURCES_DIR=/Applications/cmux.app/Contents/Resources/ghostty
NoDefaultCurrentDirectoryInExePath=1
TERM_PROGRAM=ghostty
CMUX_SHELL_INTEGRATION_DIR=/Applications/cmux.app/Contents/Resources/shell-integration
CLAUDE_CODE_ENTRYPOINT=cli
CLAUDE_EFFORT=high
CMUX_NO_PR_WATCH=
GHOSTTY_SURFACE_ID=0x4cb7bc8999ad185b
ANDROID_HOME=/Users/ziyu/Library/Android/sdk
PYENV_ROOT=/Users/ziyu/.pyenv
NVM_CD_FLAGS=-q
SHELL=/bin/zsh
CMUX_BUNDLE_ID=com.cmuxterm.app
TERM=xterm-256color
HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles
HOMEBREW_API_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api
HOMEBREW_REPOSITORY=/opt/homebrew
CMUX_PANEL_ID=70D7681B-2A8C-4E29-85E3-197A4B088D5B
TMPDIR=/var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/
CMUX_SOCKET=
TERM_PROGRAM_VERSION=1.3.2-issue-themes-broken-ctrl-np-+176bd550f
FPATH=/Users/ziyu/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting:/Users/ziyu/.oh-my-zsh/custom/plugins/zsh-autosuggestions:/Users/ziyu/.oh-my-zsh/plugins/git:/Users/ziyu/.oh-my-zsh/functions:/Users/ziyu/.oh-my-zsh/completions:/Users/ziyu/.oh-my-zsh/custom/functions:/Users/ziyu/.oh-my-zsh/custom/completions:/Users/ziyu/.oh-my-zsh/cache/completions:/Users/ziyu/.zsh/completions:/opt/homebrew/share/zsh/site-functions:/usr/local/share/zsh/site-functions:/usr/share/zsh/site-functions:/usr/share/zsh/5.9/functions:/Applications/OrbStack.app/Contents/MacOS/../Resources/completions/zsh
HOMEBREW_AUTO_UPDATE_SECS=86400
PNPM_HOME=/Users/ziyu/Library/pnpm
ZSH=/Users/ziyu/.oh-my-zsh
AI_AGENT=claude-code_2-1-163_agent
GIT_EDITOR=true
NVM_DIR=/Users/ziyu/.nvm
USER=ziyu
LS_COLORS=di=1;36:ln=35:so=32:pi=33:ex=31:bd=34;46:cd=34;43:su=30;41:sg=30;46:tw=30;42:ow=30;43
COMMAND_MODE=unix2003
SCRCPY_SERVER_PATH=/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/scrcpy-server
CMUX_SUPPRESS_SUBAGENT_NOTIFICATIONS=1
SSH_AUTH_SOCK=/var/run/com.apple.launchd.CGAkIlQATn/Listeners
CMUX_AGENT_LAUNCH_ARGV_B64=L1VzZXJzL3ppeXUvLmxvY2FsL2Jpbi9jbGF1ZGUA
__CF_USER_TEXT_ENCODING=0x1F5:0x19:0x34
PAGER=
CMUX_AGENT_LAUNCH_CWD=/Users/ziyu/Workspace/token-killer
LSCOLORS=Gxfxcxdxbxegedabagacad
PATH=./node_modules/.bin:/Users/ziyu/Workspace/token-killer/node_modules/.bin:/Applications/cmux.app/Contents/Resources/bin:/opt/homebrew/opt/openjdk@21/bin:/Users/ziyu/.antigravity/antigravity/bin:/Users/ziyu/Library/Android/sdk:/Users/ziyu/Library/pnpm/bin:/Users/ziyu/.bun/bin:/Users/ziyu/.pyenv/shims:/opt/homebrew/opt/ruby/bin:/opt/homebrew/opt/postgresql@17/bin:/Users/ziyu/.codeium/windsurf/bin:/opt/homebrew/opt/postgresql@17/bin:/Users/ziyu/.nvm/versions/node/v22.22.2/bin:/Users/ziyu/.nvm/versions/node/v22.22.2/bin:/Users/ziyu/.local/bin:/Library/Frameworks/Python.framework/Versions/3.13/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/pkg/env/global/bin:/Library/Apple/usr/bin:/Users/ziyu/.cargo/bin:/Users/ziyu/.orbstack/bin:/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools:/Users/ziyu/.cache/lm-studio/bin:/Users/ziyu/.claude/plugins/cache/openai-codex/codex/1.0.4/bin
CMUX_PORT=9130
GHOSTTY_SHELL_FEATURES=cursor:blink,path,title
CMUX_CLAUDE_HOOK_CMUX_BIN=/Applications/cmux.app/Contents/Resources/bin/cmux
__CFBundleIdentifier=com.cmuxterm.app
npm_command=exec
PWD=/Users/ziyu/Workspace/token-killer
CMUX_PORT_END=9139
CMUX_NO_GIT_WATCH=
CMUX_WORKSPACE_ID=7E263E2C-9923-4F07-823C-5B6D3735040B
CMUX_SHELL_INTEGRATION=1
LANG=zh_CN.UTF-8
NODE_PATH=/Users/ziyu/Workspace/token-killer/node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/node_modules:/Users/ziyu/Workspace/token-killer/node_modules/.pnpm/tsx@4.22.4/node_modules:/Users/ziyu/Workspace/token-killer/node_modules/.pnpm/node_modules
XPC_FLAGS=0x0
CMUX_KIRO_NOTIFICATION_LEVEL=standard
CMUX_LOAD_GHOSTTY_ZSH_INTEGRATION=1
pnpm_config_verify_deps_before_run=false
XPC_SERVICE_NAME=0
PYENV_SHELL=zsh
HOME=/Users/ziyu
CMUX_TAB_ID=7E263E2C-9923-4F07-823C-5B6D3735040B
SHLVL=2
CMUX_CLAUDE_PID=8030
TERMINFO=/Applications/cmux.app/Contents/Resources/terminfo
CLAUDE_CODE_EXECPATH=/Users/ziyu/.local/share/claude/versions/2.1.163
HOMEBREW_PREFIX=/opt/homebrew
CMUX_PORT_RANGE=10
LESS=-R
LOGNAME=ziyu
PNPM_PACKAGE_NAME=@company/tk
XDG_DATA_DIRS=/Applications/cmux.app/Contents/Resources:/usr/local/share:/usr/share:/Applications/cmux.app/Contents/Resources/ghostty/..
CODEX_COMPANION_SESSION_ID=09be39f0-e6ba-4831-989a-61c83acf0491
GHOSTTY_BIN_DIR=/Applications/cmux.app/Contents/MacOS
COREPACK_ENABLE_AUTO_PIN=0
BUN_INSTALL=/Users/ziyu/.bun
NVM_BIN=/Users/ziyu/.nvm/versions/node/v22.22.2/bin
npm_config_user_agent=pnpm/11.5.0 npm/? node/v22.22.2 darwin arm64
INFOPATH=/opt/homebrew/share/info:
HOMEBREW_CELLAR=/opt/homebrew/Cellar
CMUX_SOCKET_PATH=/Users/ziyu/.local/state/cmux/cmux.sock
CLAUDE_CODE_SESSION_ID=09be39f0-e6ba-4831-989a-61c83acf0491
CMUX_AGENT_LAUNCH_KIND=claude
OSLogRateLimit=64
CLAUDE_PLUGIN_DATA=/Users/ziyu/.claude/plugins/data/codex-openai-codex
CMUX_AGENT_LAUNCH_EXECUTABLE=/Users/ziyu/.local/bin/claude
CMUX_SURFACE_ID=70D7681B-2A8C-4E29-85E3-197A4B088D5B
CLAUDECODE=1
COLORTERM=truecolor
GIT_PAGER=
NO_COLOR=1

```

**tk** (2360 chars, 590 tokens, 58.6% savings):

```text
PATH Variables:
  CLAUDE_CODE_EXECPATH=/Users/ziyu/.local/share/claude/versions/2.1.163
  CMUX_BUNDLED_CLI_PATH=/Applications/cmux.app/Contents/Resources/bin/cmux
  CMUX_SOCKET_PATH=/Users/ziyu/.local/state/cmux/cmux.sock
  FPATH=/Users/ziyu/.oh-my-zsh/custom/plugins/zsh-syntax-h... (579 chars)
  INFOPATH=/opt/homebrew/share/info:
  MANPATH=/Users/ziyu/.nvm/versions/node/v22.22.2/share/man:... (190 chars)
  NODE_PATH=/Users/ziyu/Workspace/token-killer/node_modules/.pn... (236 chars)
  PATH (2 entries):
    ./node_modules/.bin
    /Users/ziyu/Workspace/token-gu... (1199 chars)
  SCRCPY_SERVER_PATH=/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/scrcpy-server

Language/Runtime:
  BUN_INSTALL=/Users/ziyu/.bun
  CMUX_BUNDLE_ID=com.cmuxterm.app
  NoDefaultCurrentDirectoryInExePath=1
  PNPM_HOME=/Users/ziyu/Library/pnpm
  PNPM_PACKAGE_NAME=@company/tk
  __CFBundleIdentifier=com.cmuxterm.app
  npm_command=exec
  npm_config_user_agent=pnpm/11.5.0 npm/? node/v22.22.2 darwin arm64
  pnpm_config_verify_deps_before_run=false

Tools:
  CLAUDECODE=1
  CLAUDE_CODE_ENTRYPOINT=cli
  CLAUDE_CODE_SESSION_ID=09be39f0-e6ba-4831-989a-61c83acf0491
  CLAUDE_EFFORT=high
  CLAUDE_PLUGIN_DATA=/Users/ziyu/.claude/plugins/data/codex-openai-codex
  CMUX_CLAUDE_HOOK_CMUX_BIN=/Applications/cmux.app/Contents/Resources/bin/cmux
  CMUX_CLAUDE_PID=8030
  CMUX_NO_GIT_WATCH=
  CMUX_SHELL_INTEGRATION=1
  CMUX_SHELL_INTEGRATION_DIR=/Applications/cmux.app/Contents/Resources/shell-integration
  COLORTERM=truecolor
  GHOSTTY_SHELL_FEATURES=cursor:blink,path,title
  GIT_EDITOR=true
  GIT_PAGER=
  HOMEBREW_API_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api
  HOMEBREW_AUTO_UPDATE_SECS=86400
  HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles
  HOMEBREW_CELLAR=/opt/homebrew/Cellar
  HOMEBREW_PREFIX=/opt/homebrew
  HOMEBREW_REPOSITORY=/opt/homebrew
  PYENV_SHELL=zsh
  SHELL=/bin/zsh
  SSH_AUTH_SOCK=/v****rs
  TERM=xterm-256color
  TERMINFO=/Applications/cmux.app/Contents/Resources/terminfo
  TERM_PROGRAM=ghostty
  TERM_PROGRAM_VERSION=1.3.2-issue-themes-broken-ctrl-np-+176bd550f
  XDG_DATA_DIRS=/Applications/cmux.app/Contents/Resources:/usr/loc... (122 chars)

Other:
  HOME=/Users/ziyu
  LANG=zh_CN.UTF-8
  PWD=/Users/ziyu/Workspace/token-killer
  USER=ziyu

Total: 92 vars (showing 50 relevant)

```

**rtk** (2360 chars, 590 tokens, 58.6% savings):

```text
PATH Variables:
  CLAUDE_CODE_EXECPATH=/Users/ziyu/.local/share/claude/versions/2.1.163
  CMUX_BUNDLED_CLI_PATH=/Applications/cmux.app/Contents/Resources/bin/cmux
  CMUX_SOCKET_PATH=/Users/ziyu/.local/state/cmux/cmux.sock
  FPATH=/Users/ziyu/.oh-my-zsh/custom/plugins/zsh-syntax-h... (579 chars)
  INFOPATH=/opt/homebrew/share/info:
  MANPATH=/Users/ziyu/.nvm/versions/node/v22.22.2/share/man:... (190 chars)
  NODE_PATH=/Users/ziyu/Workspace/token-killer/node_modules/.pn... (236 chars)
  PATH (2 entries):
    ./node_modules/.bin
    /Users/ziyu/Workspace/token-gu... (1199 chars)
  SCRCPY_SERVER_PATH=/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/scrcpy-server

Language/Runtime:
  BUN_INSTALL=/Users/ziyu/.bun
  CMUX_BUNDLE_ID=com.cmuxterm.app
  NoDefaultCurrentDirectoryInExePath=1
  PNPM_HOME=/Users/ziyu/Library/pnpm
  PNPM_PACKAGE_NAME=@company/tk
  __CFBundleIdentifier=com.cmuxterm.app
  npm_command=exec
  npm_config_user_agent=pnpm/11.5.0 npm/? node/v22.22.2 darwin arm64
  pnpm_config_verify_deps_before_run=false

Tools:
  CLAUDECODE=1
  CLAUDE_CODE_ENTRYPOINT=cli
  CLAUDE_CODE_SESSION_ID=09be39f0-e6ba-4831-989a-61c83acf0491
  CLAUDE_EFFORT=high
  CLAUDE_PLUGIN_DATA=/Users/ziyu/.claude/plugins/data/codex-openai-codex
  CMUX_CLAUDE_HOOK_CMUX_BIN=/Applications/cmux.app/Contents/Resources/bin/cmux
  CMUX_CLAUDE_PID=8030
  CMUX_NO_GIT_WATCH=
  CMUX_SHELL_INTEGRATION=1
  CMUX_SHELL_INTEGRATION_DIR=/Applications/cmux.app/Contents/Resources/shell-integration
  COLORTERM=truecolor
  GHOSTTY_SHELL_FEATURES=cursor:blink,path,title
  GIT_EDITOR=true
  GIT_PAGER=
  HOMEBREW_API_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api
  HOMEBREW_AUTO_UPDATE_SECS=86400
  HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles
  HOMEBREW_CELLAR=/opt/homebrew/Cellar
  HOMEBREW_PREFIX=/opt/homebrew
  HOMEBREW_REPOSITORY=/opt/homebrew
  PYENV_SHELL=zsh
  SHELL=/bin/zsh
  SSH_AUTH_SOCK=/v****rs
  TERM=xterm-256color
  TERMINFO=/Applications/cmux.app/Contents/Resources/terminfo
  TERM_PROGRAM=ghostty
  TERM_PROGRAM_VERSION=1.3.2-issue-themes-broken-ctrl-np-+176bd550f
  XDG_DATA_DIRS=/Applications/cmux.app/Contents/Resources:/usr/loc... (122 chars)

Other:
  HOME=/Users/ziyu
  LANG=zh_CN.UTF-8
  PWD=/Users/ziyu/Workspace/token-killer
  USER=ziyu

Total: 92 vars (showing 50 relevant)

```

---

### 61. generic: echo hello

- Handler: `generic`
- tk: `tk echo hello`
- raw: `echo hello`
- rtk: `echo hello`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 6 | 2 | 0% |
| tk | 6 | 2 | 0% |
| rtk | 6 | 2 | 0% |

**raw** (6 chars, 2 tokens):

```text
hello

```

**tk** (6 chars, 2 tokens, 0% savings):

```text
hello

```

**rtk** (6 chars, 2 tokens, 0% savings):

```text
hello

```

---

### 62. gh: gh repo view

- Handler: `gh`
- tk: `tk gh repo view`
- raw: `gh repo view`
- rtk: `gh repo view`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 58 | 15 | 0% |
| tk | 92 | 23 | 0% |
| rtk | 92 | 23 | 0% |

**raw** (58 chars, 15 tokens):

```text
name:	Cozy228/token-killer
description:	
--
# token-killer


```

**tk** (92 chars, 23 tokens, 0% savings):

```text
Cozy228/token-killer
  [public]
  0 stars | 0 forks
  https://github.com/Cozy228/token-killer

```

**rtk** (92 chars, 23 tokens, 0% savings):

```text
Cozy228/token-killer
  [public]
  0 stars | 0 forks
  https://github.com/Cozy228/token-killer

```

---

### 63. git-branch: git branch

- Handler: `git-branch`
- tk: `tk git branch`
- raw: `git --no-pager branch`
- rtk: `git branch`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 36 | 9 | 0% |
| tk | 36 | 9 | 0% |
| rtk | 36 | 9 | 0% |

**raw** (36 chars, 9 tokens):

```text
* codex/token-killer-node-cli
  main

```

**tk** (36 chars, 9 tokens, 0% savings):

```text
* codex/token-killer-node-cli
  main

```

**rtk** (36 chars, 9 tokens, 0% savings):

```text
* codex/token-killer-node-cli
  main

```

---

### 64. git-log: git log --oneline -10

- Handler: `git-log`
- tk: `tk git log --oneline -10`
- raw: `git --no-pager log --oneline -10`
- rtk: `git log --oneline -10`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 764 | 191 | 0% |
| tk | 764 | 191 | 0% |
| rtk | 764 | 191 | 0% |

**raw** (764 chars, 191 tokens):

```text
eccdcd5 feat(handlers): align RTK compression for gh, glab, read, log, tree, grep, ruff
71fe846 feat(handlers/git): align RTK behavior for status, diff, branch, and extended
1f820ae feat(handlers/cloud): align RTK command construction for docker, kubectl, curl
c0a6ce4 feat(comparison): add fixture-backed three-way comparison infrastructure
1450d03 docs: add product principles and RTK alignment goals
fadd9ef chore: update vitest config, check-test-presence script, and design docs
cc5c2cb test(handlers): add tests for new handlers and update existing ones
4b29d3b test(helpers): enhance fixtureCases and rtkCommandHarness
2e3d3d4 test(fixtures): add fixtures for new handlers
bdef140 feat(git): add graphite (gt) handler and register all new handlers in index

```

**tk** (764 chars, 191 tokens, 0% savings):

```text
eccdcd5 feat(handlers): align RTK compression for gh, glab, read, log, tree, grep, ruff
71fe846 feat(handlers/git): align RTK behavior for status, diff, branch, and extended
1f820ae feat(handlers/cloud): align RTK command construction for docker, kubectl, curl
c0a6ce4 feat(comparison): add fixture-backed three-way comparison infrastructure
1450d03 docs: add product principles and RTK alignment goals
fadd9ef chore: update vitest config, check-test-presence script, and design docs
cc5c2cb test(handlers): add tests for new handlers and update existing ones
4b29d3b test(helpers): enhance fixtureCases and rtkCommandHarness
2e3d3d4 test(fixtures): add fixtures for new handlers
bdef140 feat(git): add graphite (gt) handler and register all new handlers in index

```

**rtk** (764 chars, 191 tokens, 0% savings):

```text
eccdcd5 feat(handlers): align RTK compression for gh, glab, read, log, tree, grep, ruff
71fe846 feat(handlers/git): align RTK behavior for status, diff, branch, and extended
1f820ae feat(handlers/cloud): align RTK command construction for docker, kubectl, curl
c0a6ce4 feat(comparison): add fixture-backed three-way comparison infrastructure
1450d03 docs: add product principles and RTK alignment goals
fadd9ef chore: update vitest config, check-test-presence script, and design docs
cc5c2cb test(handlers): add tests for new handlers and update existing ones
4b29d3b test(helpers): enhance fixtureCases and rtkCommandHarness
2e3d3d4 test(fixtures): add fixtures for new handlers
bdef140 feat(git): add graphite (gt) handler and register all new handlers in index

```

---

### 65. git-show: git show -1 --stat

- Handler: `git-show`
- tk: `tk git show -1 --stat`
- raw: `git --no-pager show -1 --stat`
- rtk: `git show -1 --stat`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1257 | 315 | 0% |
| tk | 1257 | 315 | 0% |
| rtk | 1257 | 315 | 0% |

**raw** (1257 chars, 315 tokens):

```text
commit eccdcd58a66b2e9fd347a7c16084bb5a205b77e7
Author: Cozy <cozy228@outlook.com>
Date:   Fri Jun 5 09:22:43 2026 +0800

    feat(handlers): align RTK compression for gh, glab, read, log, tree, grep, ruff
    
    Whitelists gh/glab structural summaries, strengthens read/log/tree/ruff/grep
    filters, and adds RTK behavior tests for each handler surface.

 src/handlers/base.ts                        |   8 +
 src/handlers/common/searchLike.ts           |  29 +++-
 src/handlers/git/hostingCli.ts              | 120 ++++++++++++-
 src/handlers/python/ruff.ts                 | 157 +++++++++++++++--
 src/handlers/system/log.ts                  |  29 +++-
 src/handlers/system/read.ts                 | 261 ++++++++++++++++++++++++++--
 src/handlers/system/tree.ts                 |  63 ++++++-
 tests/unit/handlers/rtkGhBehavior.test.ts   | 124 +++++++++++++
 tests/unit/handlers/rtkGlabBehavior.test.ts |  30 ++++
 tests/unit/handlers/rtkGrepBehavior.test.ts |  26 +++
 tests/unit/handlers/rtkLogBehavior.test.ts  |  41 +++++
 tests/unit/handlers/rtkReadBehavior.test.ts |  62 +++++++
 tests/unit/handlers/rtkRuffBehavior.test.ts |  54 ++++++
 tests/unit/handlers/rtkTreeBehavior.test.ts |  25 +++
 14 files changed, 989 insertions(+), 40 deletions(-)

```

**tk** (1257 chars, 315 tokens, 0% savings):

```text
commit eccdcd58a66b2e9fd347a7c16084bb5a205b77e7
Author: Cozy <cozy228@outlook.com>
Date:   Fri Jun 5 09:22:43 2026 +0800

    feat(handlers): align RTK compression for gh, glab, read, log, tree, grep, ruff
    
    Whitelists gh/glab structural summaries, strengthens read/log/tree/ruff/grep
    filters, and adds RTK behavior tests for each handler surface.

 src/handlers/base.ts                        |   8 +
 src/handlers/common/searchLike.ts           |  29 +++-
 src/handlers/git/hostingCli.ts              | 120 ++++++++++++-
 src/handlers/python/ruff.ts                 | 157 +++++++++++++++--
 src/handlers/system/log.ts                  |  29 +++-
 src/handlers/system/read.ts                 | 261 ++++++++++++++++++++++++++--
 src/handlers/system/tree.ts                 |  63 ++++++-
 tests/unit/handlers/rtkGhBehavior.test.ts   | 124 +++++++++++++
 tests/unit/handlers/rtkGlabBehavior.test.ts |  30 ++++
 tests/unit/handlers/rtkGrepBehavior.test.ts |  26 +++
 tests/unit/handlers/rtkLogBehavior.test.ts  |  41 +++++
 tests/unit/handlers/rtkReadBehavior.test.ts |  62 +++++++
 tests/unit/handlers/rtkRuffBehavior.test.ts |  54 ++++++
 tests/unit/handlers/rtkTreeBehavior.test.ts |  25 +++
 14 files changed, 989 insertions(+), 40 deletions(-)

```

**rtk** (1257 chars, 315 tokens, 0% savings):

```text
commit eccdcd58a66b2e9fd347a7c16084bb5a205b77e7
Author: Cozy <cozy228@outlook.com>
Date:   Fri Jun 5 09:22:43 2026 +0800

    feat(handlers): align RTK compression for gh, glab, read, log, tree, grep, ruff
    
    Whitelists gh/glab structural summaries, strengthens read/log/tree/ruff/grep
    filters, and adds RTK behavior tests for each handler surface.

 src/handlers/base.ts                        |   8 +
 src/handlers/common/searchLike.ts           |  29 +++-
 src/handlers/git/hostingCli.ts              | 120 ++++++++++++-
 src/handlers/python/ruff.ts                 | 157 +++++++++++++++--
 src/handlers/system/log.ts                  |  29 +++-
 src/handlers/system/read.ts                 | 261 ++++++++++++++++++++++++++--
 src/handlers/system/tree.ts                 |  63 ++++++-
 tests/unit/handlers/rtkGhBehavior.test.ts   | 124 +++++++++++++
 tests/unit/handlers/rtkGlabBehavior.test.ts |  30 ++++
 tests/unit/handlers/rtkGrepBehavior.test.ts |  26 +++
 tests/unit/handlers/rtkLogBehavior.test.ts  |  41 +++++
 tests/unit/handlers/rtkReadBehavior.test.ts |  62 +++++++
 tests/unit/handlers/rtkRuffBehavior.test.ts |  54 ++++++
 tests/unit/handlers/rtkTreeBehavior.test.ts |  25 +++
 14 files changed, 989 insertions(+), 40 deletions(-)

```

---

### 66. git-status: git status

- Handler: `git-status`
- tk: `tk git status`
- raw: `git --no-pager status`
- rtk: `git status`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 2655 | 664 | 0% |
| tk | 1779 | 445 | 33% |
| rtk | 1779 | 445 | 33% |

**raw** (2655 chars, 664 tokens):

```text
On branch codex/token-killer-node-cli
Your branch is up to date with 'origin/codex/token-killer-node-cli'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	renamed:    tests/unit/handlers/rtkCargoBehavior.test.ts -> tests/out-of-scope/rtkCargoBehavior.test.ts
	renamed:    tests/unit/handlers/rtkGoBehavior.test.ts -> tests/out-of-scope/rtkGoBehavior.test.ts
	renamed:    tests/unit/handlers/rtkGolangciBehavior.test.ts -> tests/out-of-scope/rtkGolangciBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRakeBehavior.test.ts -> tests/out-of-scope/rtkRakeBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRspecBehavior.test.ts -> tests/out-of-scope/rtkRspecBehavior.test.ts
	renamed:    tests/unit/handlers/rtkRubocopBehavior.test.ts -> tests/out-of-scope/rtkRubocopBehavior.test.ts

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   README.md
	modified:   docs/DESIGN.md
	modified:   docs/align-rtk-divergences.md
	modified:   docs/three-way-comparison.md
	modified:   scripts/check-test-presence.sh
	modified:   scripts/fixtureComparison.ts
	modified:   scripts/generate-three-way-report.ts
	modified:   scripts/validate-docs.sh
	modified:   src/handlers/base.ts
	modified:   src/handlers/index.ts
	modified:   src/handlers/js/tsc.ts
	modified:   tests/helpers/fixtureCases.ts
	modified:   tests/out-of-scope/rtkCargoBehavior.test.ts
	modified:   tests/out-of-scope/rtkGoBehavior.test.ts
	modified:   tests/out-of-scope/rtkGolangciBehavior.test.ts
	modified:   tests/out-of-scope/rtkRakeBehavior.test.ts
	modified:   tests/out-of-scope/rtkRspecBehavior.test.ts
	modified:   tests/out-of-scope/rtkRubocopBehavior.test.ts
	modified:   tests/smoke/smoke.sh
	modified:   tests/unit/handlers/rtkSmartBehavior.test.ts
	modified:   tests/unit/rtkScriptParity.test.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	CONTEXT.md
	docs/adr/
	docs/layer2-hook-protocol-spike.md
	docs/layer2-hooks-inspect-goal.md
	docs/parity-completion-goal.md
	scripts/benchmark-sessions/
	scripts/benchmark/
	src/handlers/dotnet/
	src/handlers/iac/
	src/handlers/system/deps.ts
	src/handlers/system/err.ts
	src/handlers/system/npx.ts
	src/handlers/system/smart.ts
	src/handlers/system/summary.ts
	src/handlers/system/testRunner.ts
	tests/fixtures/dotnet/
	tests/fixtures/system/deps_package.json
	tests/fixtures/system/err_build.txt
	tests/fixtures/system/smart_summary.txt
	tests/fixtures/system/summary_test_run.txt
	tests/fixtures/system/test_cargo.txt
	tests/fixtures/terraform/


```

**tk** (1779 chars, 445 tokens, 33% savings):

```text
* codex/token-killer-node-cli...origin/codex/token-killer-node-cli
 M README.md
 M docs/DESIGN.md
 M docs/align-rtk-divergences.md
 M docs/three-way-comparison.md
 M scripts/check-test-presence.sh
 M scripts/fixtureComparison.ts
 M scripts/generate-three-way-report.ts
 M scripts/validate-docs.sh
 M src/handlers/base.ts
 M src/handlers/index.ts
 M src/handlers/js/tsc.ts
 M tests/helpers/fixtureCases.ts
RM tests/unit/handlers/rtkCargoBehavior.test.ts -> tests/out-of-scope/rtkCargoBehavior.test.ts
RM tests/unit/handlers/rtkGoBehavior.test.ts -> tests/out-of-scope/rtkGoBehavior.test.ts
RM tests/unit/handlers/rtkGolangciBehavior.test.ts -> tests/out-of-scope/rtkGolangciBehavior.test.ts
RM tests/unit/handlers/rtkRakeBehavior.test.ts -> tests/out-of-scope/rtkRakeBehavior.test.ts
RM tests/unit/handlers/rtkRspecBehavior.test.ts -> tests/out-of-scope/rtkRspecBehavior.test.ts
RM tests/unit/handlers/rtkRubocopBehavior.test.ts -> tests/out-of-scope/rtkRubocopBehavior.test.ts
 M tests/smoke/smoke.sh
 M tests/unit/handlers/rtkSmartBehavior.test.ts
 M tests/unit/rtkScriptParity.test.ts
?? CONTEXT.md
?? docs/adr/
?? docs/layer2-hook-protocol-spike.md
?? docs/layer2-hooks-inspect-goal.md
?? docs/parity-completion-goal.md
?? scripts/benchmark-sessions/
?? scripts/benchmark/
?? src/handlers/dotnet/
?? src/handlers/iac/
?? src/handlers/system/deps.ts
?? src/handlers/system/err.ts
?? src/handlers/system/npx.ts
?? src/handlers/system/smart.ts
?? src/handlers/system/summary.ts
?? src/handlers/system/testRunner.ts
?? tests/fixtures/dotnet/
?? tests/fixtures/system/deps_package.json
?? tests/fixtures/system/err_build.txt
?? tests/fixtures/system/smart_summary.txt
?? tests/fixtures/system/summary_test_run.txt
?? tests/fixtures/system/test_cargo.txt
?? tests/fixtures/terraform/

```

**rtk** (1779 chars, 445 tokens, 33% savings):

```text
* codex/token-killer-node-cli...origin/codex/token-killer-node-cli
 M README.md
 M docs/DESIGN.md
 M docs/align-rtk-divergences.md
 M docs/three-way-comparison.md
 M scripts/check-test-presence.sh
 M scripts/fixtureComparison.ts
 M scripts/generate-three-way-report.ts
 M scripts/validate-docs.sh
 M src/handlers/base.ts
 M src/handlers/index.ts
 M src/handlers/js/tsc.ts
 M tests/helpers/fixtureCases.ts
RM tests/unit/handlers/rtkCargoBehavior.test.ts -> tests/out-of-scope/rtkCargoBehavior.test.ts
RM tests/unit/handlers/rtkGoBehavior.test.ts -> tests/out-of-scope/rtkGoBehavior.test.ts
RM tests/unit/handlers/rtkGolangciBehavior.test.ts -> tests/out-of-scope/rtkGolangciBehavior.test.ts
RM tests/unit/handlers/rtkRakeBehavior.test.ts -> tests/out-of-scope/rtkRakeBehavior.test.ts
RM tests/unit/handlers/rtkRspecBehavior.test.ts -> tests/out-of-scope/rtkRspecBehavior.test.ts
RM tests/unit/handlers/rtkRubocopBehavior.test.ts -> tests/out-of-scope/rtkRubocopBehavior.test.ts
 M tests/smoke/smoke.sh
 M tests/unit/handlers/rtkSmartBehavior.test.ts
 M tests/unit/rtkScriptParity.test.ts
?? CONTEXT.md
?? docs/adr/
?? docs/layer2-hook-protocol-spike.md
?? docs/layer2-hooks-inspect-goal.md
?? docs/parity-completion-goal.md
?? scripts/benchmark-sessions/
?? scripts/benchmark/
?? src/handlers/dotnet/
?? src/handlers/iac/
?? src/handlers/system/deps.ts
?? src/handlers/system/err.ts
?? src/handlers/system/npx.ts
?? src/handlers/system/smart.ts
?? src/handlers/system/summary.ts
?? src/handlers/system/testRunner.ts
?? tests/fixtures/dotnet/
?? tests/fixtures/system/deps_package.json
?? tests/fixtures/system/err_build.txt
?? tests/fixtures/system/smart_summary.txt
?? tests/fixtures/system/summary_test_run.txt
?? tests/fixtures/system/test_cargo.txt
?? tests/fixtures/terraform/

```

---

### 67. git-worktree: git worktree list

- Handler: `git-worktree`
- tk: `tk git worktree list`
- raw: `git --no-pager worktree list`
- rtk: `git worktree list`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 72 | 18 | 0% |
| tk | 61 | 16 | 11.1% |
| rtk | 61 | 16 | 11.1% |

**raw** (72 chars, 18 tokens):

```text
/Users/ziyu/Workspace/token-killer  eccdcd5 [codex/token-killer-node-cli]

```

**tk** (61 chars, 16 tokens, 11.1% savings):

```text
~/Workspace/token-killer eccdcd5 [codex/token-killer-node-cli]

```

**rtk** (61 chars, 16 tokens, 11.1% savings):

```text
~/Workspace/token-killer eccdcd5 [codex/token-killer-node-cli]

```

---

### 68. gt: gt log

- Handler: `gt`
- tk: `tk gt log`
- raw: `gt log`
- rtk: `gt log`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 81 | 21 | 0% |
| tk | 80 | 20 | 4.8% |
| rtk | 80 | 20 | 4.8% |

**raw** (81 chars, 21 tokens):

```text
◯ main
│ 3 days ago
│ 
│ 0a15557 - docs: add token killer product documentation
│

```

**tk** (80 chars, 20 tokens, 4.8% savings):

```text
◯ main
│ 3 days ago
│
│ 0a15557 - docs: add token killer product documentation
│

```

**rtk** (80 chars, 20 tokens, 4.8% savings):

```text
◯ main
│ 3 days ago
│
│ 0a15557 - docs: add token killer product documentation
│

```

---

### 69. list-like: find src -name *.ts

- Handler: `list-like`
- tk: `tk find src -name *.ts`
- raw: `find src -name *.ts`
- rtk: `find src -name *.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1852 | 463 | 0% |
| tk | 663 | 166 | 64.1% |
| rtk | 663 | 166 | 64.1% |

**raw** (1852 chars, 463 tokens):

```text
src/executor.ts
src/core/history.ts
src/core/rawStore.ts
src/core/report.ts
src/core/path.ts
src/core/fallback.ts
src/core/ansi.ts
src/core/text.ts
src/core/stats.ts
src/core/pipeline.ts
src/core/savings.ts
src/core/dataDir.ts
src/core/patterns.ts
src/core/outputLimit.ts
src/parse.ts
src/router.ts
src/cli.ts
src/types.ts
src/handlers/base.ts
src/handlers/python/pip.ts
src/handlers/python/ruff.ts
src/handlers/python/pytest.ts
src/handlers/python/mypy.ts
src/handlers/js/prisma.ts
src/handlers/js/next.ts
src/handlers/js/packageList.ts
src/handlers/js/tsc.ts
src/handlers/js/npm.ts
src/handlers/js/test.ts
src/handlers/js/prettier.ts
src/handlers/js/eslint.ts
src/handlers/js/playwright.ts
src/handlers/java/maven.ts
src/handlers/java/javac.ts
src/handlers/java/gradle.ts
src/handlers/dotnet/dotnet.ts
src/handlers/system/read.ts
src/handlers/system/testRunner.ts
src/handlers/system/pipe.ts
src/handlers/system/json.ts
src/handlers/system/err.ts
src/handlers/system/npx.ts
src/handlers/system/summary.ts
src/handlers/system/ls.ts
src/handlers/system/format.ts
src/handlers/system/smart.ts
src/handlers/system/log.ts
src/handlers/system/env.ts
src/handlers/system/deps.ts
src/handlers/system/wc.ts
src/handlers/system/tree.ts
src/handlers/common/grepFilter.ts
src/handlers/common/searchLike.ts
src/handlers/common/diff.ts
src/handlers/common/listLike.ts
src/handlers/common/readLike.ts
src/handlers/iac/terraform.ts
src/handlers/generic.ts
src/handlers/cloud/wget.ts
src/handlers/cloud/psql.ts
src/handlers/cloud/container.ts
src/handlers/cloud/aws.ts
src/handlers/cloud/curl.ts
src/handlers/index.ts
src/handlers/git/status.ts
src/handlers/git/compactDiff.ts
src/handlers/git/diff.ts
src/handlers/git/branch.ts
src/handlers/git/hostingCli.ts
src/handlers/git/graphite.ts
src/handlers/git/extended.ts
src/handlers/git/log.ts
src/handlers/git/show.ts

```

**tk** (663 chars, 166 tokens, 64.1% savings):

```text
73F 12D:

./ cli.ts executor.ts parse.ts router.ts types.ts
core/ ansi.ts dataDir.ts fallback.ts history.ts outputLimit.ts path.ts patterns.ts pipeline.ts rawStore.ts report.ts savings.ts stats.ts text.ts
handlers/ base.ts generic.ts index.ts
handlers/cloud/ aws.ts container.ts curl.ts psql.ts wget.ts
handlers/common/ diff.ts grepFilter.ts listLike.ts readLike.ts searchLike.ts
handlers/dotnet/ dotnet.ts
handlers/git/ branch.ts compactDiff.ts diff.ts extended.ts graphite.ts hostingCli.ts log.ts show.ts status.ts
handlers/iac/ terraform.ts
handlers/java/ gradle.ts javac.ts maven.ts
handlers/js/ eslint.ts next.ts npm.ts packageList.ts playwright.ts
+23 more

```

**rtk** (663 chars, 166 tokens, 64.1% savings):

```text
73F 12D:

./ cli.ts executor.ts parse.ts router.ts types.ts
core/ ansi.ts dataDir.ts fallback.ts history.ts outputLimit.ts path.ts patterns.ts pipeline.ts rawStore.ts report.ts savings.ts stats.ts text.ts
handlers/ base.ts generic.ts index.ts
handlers/cloud/ aws.ts container.ts curl.ts psql.ts wget.ts
handlers/common/ diff.ts grepFilter.ts listLike.ts readLike.ts searchLike.ts
handlers/dotnet/ dotnet.ts
handlers/git/ branch.ts compactDiff.ts diff.ts extended.ts graphite.ts hostingCli.ts log.ts show.ts status.ts
handlers/iac/ terraform.ts
handlers/java/ gradle.ts javac.ts maven.ts
handlers/js/ eslint.ts next.ts npm.ts packageList.ts playwright.ts
+23 more

```

---

### 70. log: log repeated app fixture

- Handler: `log`
- tk: `tk log tests/fixtures/system/app_repeated.log`
- raw: `log tests/fixtures/system/app_repeated.log`
- rtk: `log tests/fixtures/system/app_repeated.log`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 732 | 183 | 0% |
| tk | 390 | 98 | 46.4% |
| rtk | 390 | 98 | 46.4% |

**raw** (732 chars, 183 tokens):

```text
log: Unknown subcommand 'tests/fixtures/system/app_repeated.log'
usage:
    log <command>

global options:
    -?, --help
    -q, --quiet
    -v, --verbose

commands:
    collect         gather system logs into a log archive
    config          view/change logging system settings
    diagnose        diagnose an archive for a variety of issues
    erase           delete system logging data
    repack          repack a log archive using a predicate
    show            view/search system logs
    stream          watch live system logs
    stats           show system logging statistics
    emit            emit a log message into the log store

further help:
    log help <command>
    log help predicates
    log help shorthand

```

**tk** (390 chars, 98 tokens, 46.4% savings):

```text
Log Summary
   [error] 4 errors (2 unique)
   [warn] 3 warnings (2 unique)
   [info] 3 info messages

[ERRORS]
   [×3] 2024-01-01 10:00:00 ERROR: Connection failed to /api/server
   2024-01-01 10:00:03 ERROR: Disk write to /var/log/app.log failed

[WARNINGS]
   [×2] 2024-01-01 10:00:04 WARN: Retrying connection to /api/server
   2024-01-01 10:00:06 WARN: Cache miss for /tmp/cache/object

```

**rtk** (390 chars, 98 tokens, 46.4% savings):

```text
Log Summary
   [error] 4 errors (2 unique)
   [warn] 3 warnings (2 unique)
   [info] 3 info messages

[ERRORS]
   [×3] 2024-01-01 10:00:00 ERROR: Connection failed to /api/server
   2024-01-01 10:00:03 ERROR: Disk write to /var/log/app.log failed

[WARNINGS]
   [×2] 2024-01-01 10:00:04 WARN: Retrying connection to /api/server
   2024-01-01 10:00:06 WARN: Cache miss for /tmp/cache/object

```

---

### 71. mypy: mypy src/handlers/index.ts

- Handler: `mypy`
- tk: `tk mypy src/handlers/index.ts`
- raw: `mypy src/handlers/index.ts`
- rtk: `mypy src/handlers/index.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 117 | 30 | 0% |
| tk | 129 | 33 | 0% |
| rtk | 129 | 33 | 0% |

**raw** (117 chars, 30 tokens):

```text
src/handlers/index.ts:1: error: Invalid syntax  [syntax]
Found 1 error in 1 file (errors prevented further checking)

```

**tk** (129 chars, 33 tokens, 0% savings):

```text
mypy: 1 errors in 1 files
═══════════════════════════════════════
src/handlers/index.ts (1 errors)
  L1: [syntax] Invalid syntax

```

**rtk** (129 chars, 33 tokens, 0% savings):

```text
mypy: 1 errors in 1 files
═══════════════════════════════════════
src/handlers/index.ts (1 errors)
  L1: [syntax] Invalid syntax

```

---

### 72. package-list: pnpm list --depth=0

- Handler: `package-list`
- tk: `tk pnpm list --depth=0`
- raw: `pnpm list --depth=0`
- rtk: `pnpm list --depth=0`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 297 | 75 | 0% |
| tk | 181 | 46 | 38.7% |
| rtk | 181 | 46 | 38.7% |

**raw** (297 chars, 75 tokens):

```text
Legend: production dependency, optional only, dev only

@company/tk@0.1.0 /Users/ziyu/Workspace/token-killer
│
│   dependencies:
├── strip-ansi@7.2.0
│
│   devDependencies:
├── @types/node@25.9.1
├── prettier@3.8.3
├── tsdown@0.22.1
├── tsx@4.22.4
├── typescript@6.0.3
└── vitest@4.1.8

7 packages

```

**tk** (181 chars, 46 tokens, 38.7% savings):

```text
8 packages (2 prod / 6 dev)
[prod]
  @company/tk 0.1.0
  strip-ansi 7.2.0
[dev]
  @types/node 25.9.1
  prettier 3.8.3
  tsdown 0.22.1
  tsx 4.22.4
  typescript 6.0.3
  vitest 4.1.8

```

**rtk** (181 chars, 46 tokens, 38.7% savings):

```text
8 packages (2 prod / 6 dev)
[prod]
  @company/tk 0.1.0
  strip-ansi 7.2.0
[dev]
  tsdown 0.22.1
  vitest 4.1.8
  @types/node 25.9.1
  prettier 3.8.3
  typescript 6.0.3
  tsx 4.22.4

```

---

### 73. pytest: pytest --collect-only

- Handler: `pytest`
- tk: `tk pytest --collect-only -q tests/unit/savings.test.ts`
- raw: `pytest --collect-only -q tests/unit/savings.test.ts`
- rtk: `pytest --collect-only -q tests/unit/savings.test.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 143 | 36 | 0% |
| tk | 27 | 7 | 80.6% |
| rtk | 27 | 7 | 80.6% |

**raw** (143 chars, 36 tokens):

```text

no tests collected in 0.00s
ERROR: not found: /Users/ziyu/Workspace/token-killer/tests/unit/savings.test.ts
(no match in any of [<Dir unit>])


```

**tk** (27 chars, 7 tokens, 80.6% savings):

```text
Pytest: No tests collected

```

**rtk** (27 chars, 7 tokens, 80.6% savings):

```text
Pytest: No tests collected

```

---

### 74. read-like: cat package.json

- Handler: `read`
- tk: `tk cat package.json`
- raw: `cat package.json`
- rtk: `read package.json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1277 | 320 | 0% |
| tk | 1277 | 320 | 0% |
| rtk | 1277 | 320 | 0% |

**raw** (1277 chars, 320 tokens):

```text
{
  "name": "@company/tk",
  "version": "0.1.0",
  "description": "RTK-style token-saving command proxy.",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "tk": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsdown",
    "test": "vitest --config vitest.config.ts",
    "test:product": "vitest run --config vitest.config.ts",
    "test:migration": "vitest run --config vitest.migration.config.ts",
    "test:smoke": "bash tests/smoke/smoke.sh",
    "test:check-presence": "bash scripts/check-test-presence.sh",
    "test:validate-docs": "bash scripts/validate-docs.sh",
    "test:install": "bash scripts/test-install.sh",
    "check:installation": "bash scripts/check-installation.sh",
    "test:ci": "pnpm test:product && pnpm test:install && pnpm test:migration && bash scripts/check-test-presence.sh && bash scripts/validate-docs.sh && bash tests/smoke/smoke.sh",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "strip-ansi": "^7.2.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "prettier": "^3.8.3",
    "tsdown": "^0.22.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}

```

**tk** (1277 chars, 320 tokens, 0% savings):

```text
{
  "name": "@company/tk",
  "version": "0.1.0",
  "description": "RTK-style token-saving command proxy.",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "tk": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsdown",
    "test": "vitest --config vitest.config.ts",
    "test:product": "vitest run --config vitest.config.ts",
    "test:migration": "vitest run --config vitest.migration.config.ts",
    "test:smoke": "bash tests/smoke/smoke.sh",
    "test:check-presence": "bash scripts/check-test-presence.sh",
    "test:validate-docs": "bash scripts/validate-docs.sh",
    "test:install": "bash scripts/test-install.sh",
    "check:installation": "bash scripts/check-installation.sh",
    "test:ci": "pnpm test:product && pnpm test:install && pnpm test:migration && bash scripts/check-test-presence.sh && bash scripts/validate-docs.sh && bash tests/smoke/smoke.sh",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "strip-ansi": "^7.2.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "prettier": "^3.8.3",
    "tsdown": "^0.22.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}

```

**rtk** (1277 chars, 320 tokens, 0% savings):

```text
{
  "name": "@company/tk",
  "version": "0.1.0",
  "description": "RTK-style token-saving command proxy.",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "tk": "./dist/cli.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsdown",
    "test": "vitest --config vitest.config.ts",
    "test:product": "vitest run --config vitest.config.ts",
    "test:migration": "vitest run --config vitest.migration.config.ts",
    "test:smoke": "bash tests/smoke/smoke.sh",
    "test:check-presence": "bash scripts/check-test-presence.sh",
    "test:validate-docs": "bash scripts/validate-docs.sh",
    "test:install": "bash scripts/test-install.sh",
    "check:installation": "bash scripts/check-installation.sh",
    "test:ci": "pnpm test:product && pnpm test:install && pnpm test:migration && bash scripts/check-test-presence.sh && bash scripts/validate-docs.sh && bash tests/smoke/smoke.sh",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "strip-ansi": "^7.2.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "prettier": "^3.8.3",
    "tsdown": "^0.22.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}

```

---

### 75. read-like: cat src/cli.ts

- Handler: `read`
- tk: `tk cat src/cli.ts`
- raw: `cat src/cli.ts`
- rtk: `read src/cli.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 3271 | 818 | 0% |
| tk | 3271 | 818 | 0% |
| rtk | 3271 | 818 | 0% |

**raw** (3271 chars, 818 tokens):

```text
#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand } from "./router.js";
import { buildReport } from "./core/report.js";
import { runPipeline } from "./core/pipeline.js";
import { recordHistory } from "./core/history.js";
import { calculateSavings } from "./core/savings.js";
import { maybeSaveRawOutput } from "./core/rawStore.js";
import { formatStats } from "./core/stats.js";
import type { FilteredResult, RawResult, TkOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tk [tk flags] <command...>",
    "",
    "Flags:",
    "  --raw                 print raw stdout/stderr",
    "  --stats               print token savings",
    "  --verbose             print token savings and raw output path",
    "  --max-lines <n>       limit compressed output lines",
    "  --max-chars <n>       limit compressed output chars",
    "  --save-raw            always save raw output",
    "  --no-save-raw         never save raw output",
    "  --report [--json|--csv]",
    "  --help",
    "  --version",
    "",
  ].join("\n");
}

async function recordRawPassthrough(raw: RawResult, options: TkOptions): Promise<void> {
  const output = `${raw.stdout}${raw.stderr}`;
  const savings = calculateSavings(output, output);
  const rawOutputPath = await maybeSaveRawOutput(raw, options);
  const filtered: FilteredResult = {
    handler: "raw",
    output,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath,
    exitCode: raw.exitCode,
    qualityStatus: "passed",
  };
  await recordHistory(raw, filtered, options);
}

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv.slice(2));
  parsed.options.cwd = process.cwd();

  if (parsed.mode === "help") {
    process.stdout.write(help());
    return 0;
  }
  if (parsed.mode === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.mode === "report") {
    process.stdout.write(await buildReport(parsed.options));
    return 0;
  }
  if (!parsed.command) {
    process.stderr.write("tk: missing command\n");
    return 1;
  }

  const handler = routeCommand(parsed.command);
  const raw = await handler.execute(parsed.command, parsed.options);

  if (parsed.options.raw) {
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    await recordRawPassthrough(raw, parsed.options);
    return raw.exitCode;
  }

  const filtered = await runPipeline(
    {
      ...handler,
      async execute() {
        return raw;
      },
    },
    parsed.command,
    parsed.options,
  ).then((result) => result.filtered);

  process.stdout.write(filtered.output);
  if (filtered.output.length > 0 && !filtered.output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  if (parsed.options.stats || parsed.options.verbose) {
    process.stdout.write(`\n${formatStats(filtered)}\n`);
  }
  return raw.exitCode;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

```

**tk** (3271 chars, 818 tokens, 0% savings):

```text
#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand } from "./router.js";
import { buildReport } from "./core/report.js";
import { runPipeline } from "./core/pipeline.js";
import { recordHistory } from "./core/history.js";
import { calculateSavings } from "./core/savings.js";
import { maybeSaveRawOutput } from "./core/rawStore.js";
import { formatStats } from "./core/stats.js";
import type { FilteredResult, RawResult, TkOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tk [tk flags] <command...>",
    "",
    "Flags:",
    "  --raw                 print raw stdout/stderr",
    "  --stats               print token savings",
    "  --verbose             print token savings and raw output path",
    "  --max-lines <n>       limit compressed output lines",
    "  --max-chars <n>       limit compressed output chars",
    "  --save-raw            always save raw output",
    "  --no-save-raw         never save raw output",
    "  --report [--json|--csv]",
    "  --help",
    "  --version",
    "",
  ].join("\n");
}

async function recordRawPassthrough(raw: RawResult, options: TkOptions): Promise<void> {
  const output = `${raw.stdout}${raw.stderr}`;
  const savings = calculateSavings(output, output);
  const rawOutputPath = await maybeSaveRawOutput(raw, options);
  const filtered: FilteredResult = {
    handler: "raw",
    output,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath,
    exitCode: raw.exitCode,
    qualityStatus: "passed",
  };
  await recordHistory(raw, filtered, options);
}

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv.slice(2));
  parsed.options.cwd = process.cwd();

  if (parsed.mode === "help") {
    process.stdout.write(help());
    return 0;
  }
  if (parsed.mode === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.mode === "report") {
    process.stdout.write(await buildReport(parsed.options));
    return 0;
  }
  if (!parsed.command) {
    process.stderr.write("tk: missing command\n");
    return 1;
  }

  const handler = routeCommand(parsed.command);
  const raw = await handler.execute(parsed.command, parsed.options);

  if (parsed.options.raw) {
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    await recordRawPassthrough(raw, parsed.options);
    return raw.exitCode;
  }

  const filtered = await runPipeline(
    {
      ...handler,
      async execute() {
        return raw;
      },
    },
    parsed.command,
    parsed.options,
  ).then((result) => result.filtered);

  process.stdout.write(filtered.output);
  if (filtered.output.length > 0 && !filtered.output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  if (parsed.options.stats || parsed.options.verbose) {
    process.stdout.write(`\n${formatStats(filtered)}\n`);
  }
  return raw.exitCode;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

```

**rtk** (3271 chars, 818 tokens, 0% savings):

```text
#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand } from "./router.js";
import { buildReport } from "./core/report.js";
import { runPipeline } from "./core/pipeline.js";
import { recordHistory } from "./core/history.js";
import { calculateSavings } from "./core/savings.js";
import { maybeSaveRawOutput } from "./core/rawStore.js";
import { formatStats } from "./core/stats.js";
import type { FilteredResult, RawResult, TkOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tk [tk flags] <command...>",
    "",
    "Flags:",
    "  --raw                 print raw stdout/stderr",
    "  --stats               print token savings",
    "  --verbose             print token savings and raw output path",
    "  --max-lines <n>       limit compressed output lines",
    "  --max-chars <n>       limit compressed output chars",
    "  --save-raw            always save raw output",
    "  --no-save-raw         never save raw output",
    "  --report [--json|--csv]",
    "  --help",
    "  --version",
    "",
  ].join("\n");
}

async function recordRawPassthrough(raw: RawResult, options: TkOptions): Promise<void> {
  const output = `${raw.stdout}${raw.stderr}`;
  const savings = calculateSavings(output, output);
  const rawOutputPath = await maybeSaveRawOutput(raw, options);
  const filtered: FilteredResult = {
    handler: "raw",
    output,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath,
    exitCode: raw.exitCode,
    qualityStatus: "passed",
  };
  await recordHistory(raw, filtered, options);
}

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv.slice(2));
  parsed.options.cwd = process.cwd();

  if (parsed.mode === "help") {
    process.stdout.write(help());
    return 0;
  }
  if (parsed.mode === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.mode === "report") {
    process.stdout.write(await buildReport(parsed.options));
    return 0;
  }
  if (!parsed.command) {
    process.stderr.write("tk: missing command\n");
    return 1;
  }

  const handler = routeCommand(parsed.command);
  const raw = await handler.execute(parsed.command, parsed.options);

  if (parsed.options.raw) {
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    await recordRawPassthrough(raw, parsed.options);
    return raw.exitCode;
  }

  const filtered = await runPipeline(
    {
      ...handler,
      async execute() {
        return raw;
      },
    },
    parsed.command,
    parsed.options,
  ).then((result) => result.filtered);

  process.stdout.write(filtered.output);
  if (filtered.output.length > 0 && !filtered.output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  if (parsed.options.stats || parsed.options.verbose) {
    process.stdout.write(`\n${formatStats(filtered)}\n`);
  }
  return raw.exitCode;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

```

---

### 76. wc: wc README.md

- Handler: `wc`
- tk: `tk wc README.md`
- raw: `wc README.md`
- rtk: `wc README.md`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 35 | 9 | 0% |
| tk | 16 | 4 | 55.6% |
| rtk | 16 | 4 | 55.6% |

**raw** (35 chars, 9 tokens):

```text
     123     412    2723 README.md

```

**tk** (16 chars, 4 tokens, 55.6% savings):

```text
123L 412W 2723B

```

**rtk** (16 chars, 4 tokens, 55.6% savings):

```text
123L 412W 2723B

```

---
