# tg vs rtk — Three-Way Comparison (live repo)

Generated: 2026-06-04
Project: `token-guard` (/Users/ziyu/Workspace/token-guard)
Scope: 21 live commands in repo root (handler-aligned)
rtk: rtk 0.42.0

**Method**
- **raw**: underlying command stdout+stderr (`git --no-pager` for git)
- **tg**: `node dist/cli.js <command>` (same argv as handler routing)
- **rtk**: mapped native `rtk` subcommand (see per-case RTK cmd)
- **savingsPct**: token estimate vs raw (`ceil(chars/4)`), same as tg core
- **Sort**: cases ordered by |tg savingsPct − rtk savingsPct| (largest gap first)

## Summary

| # | Case | Handler | raw | tg | rtk | tg savings | rtk savings | Δ |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | git-worktree: git worktree list | git-worktree | 18 | 18 | 16 | 0% | 11.1% | 11.1pp rtk +11.1pp |
| 2 | list-like: ls -la . | list-like | 303 | 48 | 69 | 84.2% | 77.2% | 7.0pp tg +7.0pp |
| 3 | package-list: pnpm list --depth=0 | package-list | 70 | 44 | 41 | 37.1% | 41.4% | 4.3pp rtk +4.3pp |
| 4 | git-status: git status | git-status | 508 | 335 | 344 | 34.1% | 32.3% | 1.8pp tg +1.8pp |
| 5 | git-diff: git diff HEAD~1 | git-diff | 25477 | 7877 | 7966 | 69.1% | 68.7% | 0.4pp tg +0.4pp |
| 6 | list-like: tree . | list-like | 31089 | 3703 | 3672 | 88.1% | 88.2% | 0.1pp rtk +0.1pp |
| 7 | search-like: grep -r import src/ | search-like | 2850 | 2850 | 2914 | 0% | 0% | 0.0pp ≈ |
| 8 | search-like: rg export src/ | search-like | 1151 | 1151 | 1188 | 0% | 0% | 0.0pp ≈ |
| 9 | tsc: type error in temp file | tsc | 41 | 41 | 59 | 0% | 0% | 0.0pp ≈ |
| 10 | diff: diff old.ts new.ts | diff | 8 | 49 | 57 | 0% | 0% | 0.0pp ≈ |
| 11 | gh: gh repo view | gh | 15 | 15 | 23 | 0% | 0% | 0.0pp ≈ |
| 12 | tsc: tsc --noEmit clean project | tsc | 0 | 0 | 7 | 0% | 0% | 0.0pp ≈ |
| 13 | generic: echo hello | generic | 2 | 2 | 2 | 0% | 0% | 0.0pp ≈ |
| 14 | git-branch: git branch | git-branch | 9 | 9 | 9 | 0% | 0% | 0.0pp ≈ |
| 15 | git-log: git log --oneline -10 | git-log | 142 | 142 | 142 | 0% | 0% | 0.0pp ≈ |
| 16 | git-show: git show -1 --stat | git-show | 158 | 158 | 158 | 0% | 0% | 0.0pp ≈ |
| 17 | js-test: vitest run savings test | js-test | 53 | 5 | 5 | 90.6% | 90.6% | 0.0pp ≈ |
| 18 | list-like: find src -name *.ts | list-like | 254 | 135 | 135 | 46.9% | 46.9% | 0.0pp ≈ |
| 19 | read-like: cat docs/DESIGN.md | read-like | 7126 | 7126 | 7126 | 0% | 0% | 0.0pp ≈ |
| 20 | read-like: cat package.json | read-like | 313 | 313 | 313 | 0% | 0% | 0.0pp ≈ |
| 21 | read-like: cat src/cli.ts | read-like | 818 | 818 | 818 | 0% | 0% | 0.0pp ≈ |

**Aggregate (token-weighted across live cases):**
- raw: 70405 tokens
- tg: 24839 tokens (64.7% savings)
- rtk: 25064 tokens (64.4% savings)

---

## Per-case outputs

### 1. git-worktree: git worktree list

- Handler: `git-worktree`
- tg: `tg git worktree list`
- raw: `git --no-pager worktree list`
- rtk: `git worktree list`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 72 | 18 | 0% |
| tg | 72 | 18 | 0% |
| rtk | 61 | 16 | 11.1% |

**raw** (72 chars, 18 tokens):

```text
/Users/ziyu/Workspace/token-guard  e25a4ce [codex/token-guard-node-cli]

```

**tg** (72 chars, 18 tokens, 0% savings):

```text
/Users/ziyu/Workspace/token-guard  e25a4ce [codex/token-guard-node-cli]

```

**rtk** (61 chars, 16 tokens, 11.1% savings):

```text
~/Workspace/token-guard e25a4ce [codex/token-guard-node-cli]

```

---

### 2. list-like: ls -la .

- Handler: `list-like`
- tg: `tg ls -la .`
- raw: `ls -la .`
- rtk: `ls -la .`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1212 | 303 | 0% |
| tg | 190 | 48 | 84.2% |
| rtk | 273 | 69 | 77.2% |

**raw** (1212 chars, 303 tokens):

```text
total 176
drwxr-xr-x  21 ziyu  staff    672 Jun  3 22:19 .
drwxr-xr-x@ 62 ziyu  staff   1984 Jun  2 11:29 ..
drwxr-xr-x  17 ziyu  staff    544 Jun  4 10:36 .git
-rw-r--r--@  1 ziyu  staff     30 Jun  2 18:10 .gitignore
drwxr-xr-x@  5 ziyu  staff    160 Jun  2 13:17 .ruff_cache
drwxr-xr-x@  4 ziyu  staff    128 Jun  2 17:46 .tg
-rw-r--r--@  1 ziyu  staff   1784 Jun  3 16:33 README.md
drwxr-xr-x@  3 ziyu  staff     96 Jun  4 10:38 dist
drwxr-xr-x   7 ziyu  staff    224 Jun  3 22:05 docs
drwxr-xr-x@ 17 ziyu  staff    544 Jun  2 17:06 node_modules
-rw-r--r--@  1 ziyu  staff   1251 Jun  3 08:59 package.json
-rw-r--r--@  1 ziyu  staff  55459 Jun  2 17:26 pnpm-lock.yaml
-rw-r--r--@  1 ziyu  staff     82 Jun  2 17:02 pnpm-workspace.yaml
drwxr-xr-x  36 ziyu  staff   1152 Jun  3 15:08 rtk
drwxr-xr-x@ 10 ziyu  staff    320 Jun  3 22:07 scripts
drwxr-xr-x@  9 ziyu  staff    288 Jun  2 18:11 src
drwxr-xr-x@  7 ziyu  staff    224 Jun  2 18:11 tests
-rw-r--r--@  1 ziyu  staff    370 Jun  2 16:59 tsconfig.json
-rw-r--r--@  1 ziyu  staff    216 Jun  2 17:05 tsdown.config.ts
-rw-r--r--@  1 ziyu  staff    944 Jun  4 09:44 vitest.config.ts
-rw-r--r--@  1 ziyu  staff    792 Jun  3 09:33 vitest.migration.config.ts

```

**tg** (190 chars, 48 tokens, 84.2% savings):

```text
..
.gitignore
.ruff_cache
.tg
README.md
docs
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
rtk
scripts
src
tests
tsconfig.json
tsdown.config.ts
vitest.config.ts
vitest.migration.config.ts

```

**rtk** (273 chars, 69 tokens, 77.2% savings):

```text
.git/
.ruff_cache/
.tg/
dist/
docs/
node_modules/
rtk/
scripts/
src/
tests/
.gitignore  30B
README.md  1.7K
package.json  1.2K
pnpm-lock.yaml  54.2K
pnpm-workspace.yaml  82B
tsconfig.json  370B
tsdown.config.ts  216B
vitest.config.ts  944B
vitest.migration.config.ts  792B

```

---

### 3. package-list: pnpm list --depth=0

- Handler: `package-list`
- tg: `tg pnpm list --depth=0`
- raw: `pnpm list --depth=0`
- rtk: `pnpm list --depth=0`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 278 | 70 | 0% |
| tg | 175 | 44 | 37.1% |
| rtk | 164 | 41 | 41.4% |

**raw** (278 chars, 70 tokens):

```text
Legend: production dependency, optional only, dev only

@company/tg@0.1.0 /Users/ziyu/Workspace/token-guard
│
│   dependencies:
├── strip-ansi@7.2.0
│
│   devDependencies:
├── @types/node@25.9.1
├── tsdown@0.22.1
├── tsx@4.22.4
├── typescript@6.0.3
└── vitest@4.1.8

6 packages

```

**tg** (175 chars, 44 tokens, 37.1% savings):

```text
Node.js (package.json):
  @company/tg @ 0.1.0
  Dependencies (1):
    strip-ansi (^7.2.0)
  Dev Dependencies (5):
    @types/node
    tsdown
    tsx
    typescript
    vitest

```

**rtk** (164 chars, 41 tokens, 41.4% savings):

```text
7 packages (2 prod / 5 dev)
[prod]
  @company/tg 0.1.0
  strip-ansi 7.2.0
[dev]
  tsdown 0.22.1
  @types/node 25.9.1
  typescript 6.0.3
  vitest 4.1.8
  tsx 4.22.4

```

---

### 4. git-status: git status

- Handler: `git-status`
- tg: `tg git status`
- raw: `git --no-pager status`
- rtk: `git status`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 2030 | 508 | 0% |
| tg | 1337 | 335 | 34.1% |
| rtk | 1373 | 344 | 32.3% |

**raw** (2030 chars, 508 tokens):

```text
On branch codex/token-guard-node-cli
Your branch is up to date with 'origin/codex/token-guard-node-cli'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   docs/DESIGN.md
	modified:   src/core/outputLimit.ts
	modified:   src/core/patterns.ts
	modified:   src/handlers/base.ts
	modified:   src/handlers/common/diff.ts
	modified:   src/handlers/common/listLike.ts
	modified:   src/handlers/common/readLike.ts
	modified:   src/handlers/common/searchLike.ts
	modified:   src/handlers/generic.ts
	modified:   src/handlers/git/branch.ts
	modified:   src/handlers/git/diff.ts
	modified:   src/handlers/git/log.ts
	modified:   src/handlers/git/show.ts
	modified:   src/handlers/git/status.ts
	modified:   src/handlers/java/gradle.ts
	modified:   src/handlers/java/javac.ts
	modified:   src/handlers/js/eslint.ts
	modified:   src/handlers/js/packageList.ts
	modified:   src/handlers/js/test.ts
	modified:   src/handlers/js/tsc.ts
	modified:   src/handlers/python/mypy.ts
	modified:   src/handlers/python/pip.ts
	modified:   src/handlers/python/ruff.ts
	modified:   tests/fixtures/common/diff_lcs_insert.txt
	modified:   tests/helpers/assertions.ts
	modified:   tests/helpers/fixtureCases.ts
	modified:   tests/integration/cli.test.ts
	modified:   tests/integration/rtkParity.test.ts
	modified:   tests/smoke/smoke.sh
	modified:   tests/unit/core/qualityGate.test.ts
	modified:   tests/unit/handlers/fixtureContent.test.ts
	modified:   vitest.config.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/three-way-comparison.md
	scripts/generate-three-way-report.ts
	scripts/liveComparisonCases.ts
	src/handlers/git/compactDiff.ts
	tests/fixtures/common/find_src_ts.txt
	tests/fixtures/js/pnpm_list_depth0.txt
	tests/fixtures/js/vitest_passed.txt
	tests/unit/core/tscEmptyOutput.test.ts
	tests/unit/scripts/

no changes added to commit (use "git add" and/or "git commit -a")

```

**tg** (1337 chars, 335 tokens, 34.1% savings):

```text
* codex/token-guard-node-cli
 M docs/DESIGN.md
 M src/core/outputLimit.ts
 M src/core/patterns.ts
 M src/handlers/base.ts
 M src/handlers/common/diff.ts
 M src/handlers/common/listLike.ts
 M src/handlers/common/readLike.ts
 M src/handlers/common/searchLike.ts
 M src/handlers/generic.ts
 M src/handlers/git/branch.ts
 M src/handlers/git/diff.ts
 M src/handlers/git/log.ts
 M src/handlers/git/show.ts
 M src/handlers/git/status.ts
 M src/handlers/java/gradle.ts
 M src/handlers/java/javac.ts
 M src/handlers/js/eslint.ts
 M src/handlers/js/packageList.ts
 M src/handlers/js/test.ts
 M src/handlers/js/tsc.ts
 M src/handlers/python/mypy.ts
 M src/handlers/python/pip.ts
 M src/handlers/python/ruff.ts
 M tests/fixtures/common/diff_lcs_insert.txt
 M tests/helpers/assertions.ts
 M tests/helpers/fixtureCases.ts
 M tests/integration/cli.test.ts
 M tests/integration/rtkParity.test.ts
 M tests/smoke/smoke.sh
 M tests/unit/core/qualityGate.test.ts
 M tests/unit/handlers/fixtureContent.test.ts
 M vitest.config.ts
?? docs/three-way-comparison.md
?? scripts/generate-three-way-report.ts
?? scripts/liveComparisonCases.ts
?? src/handlers/git/compactDiff.ts
?? tests/fixtures/common/find_src_ts.txt
?? tests/fixtures/js/pnpm_list_depth0.txt
?? tests/fixtures/js/vitest_passed.txt
?? tests/unit/core/tscEmptyOutput.test.ts
?? tests/unit/scripts/

```

**rtk** (1373 chars, 344 tokens, 32.3% savings):

```text
* codex/token-guard-node-cli...origin/codex/token-guard-node-cli
 M docs/DESIGN.md
 M src/core/outputLimit.ts
 M src/core/patterns.ts
 M src/handlers/base.ts
 M src/handlers/common/diff.ts
 M src/handlers/common/listLike.ts
 M src/handlers/common/readLike.ts
 M src/handlers/common/searchLike.ts
 M src/handlers/generic.ts
 M src/handlers/git/branch.ts
 M src/handlers/git/diff.ts
 M src/handlers/git/log.ts
 M src/handlers/git/show.ts
 M src/handlers/git/status.ts
 M src/handlers/java/gradle.ts
 M src/handlers/java/javac.ts
 M src/handlers/js/eslint.ts
 M src/handlers/js/packageList.ts
 M src/handlers/js/test.ts
 M src/handlers/js/tsc.ts
 M src/handlers/python/mypy.ts
 M src/handlers/python/pip.ts
 M src/handlers/python/ruff.ts
 M tests/fixtures/common/diff_lcs_insert.txt
 M tests/helpers/assertions.ts
 M tests/helpers/fixtureCases.ts
 M tests/integration/cli.test.ts
 M tests/integration/rtkParity.test.ts
 M tests/smoke/smoke.sh
 M tests/unit/core/qualityGate.test.ts
 M tests/unit/handlers/fixtureContent.test.ts
 M vitest.config.ts
?? docs/three-way-comparison.md
?? scripts/generate-three-way-report.ts
?? scripts/liveComparisonCases.ts
?? src/handlers/git/compactDiff.ts
?? tests/fixtures/common/find_src_ts.txt
?? tests/fixtures/js/pnpm_list_depth0.txt
?? tests/fixtures/js/vitest_passed.txt
?? tests/unit/core/tscEmptyOutput.test.ts
?? tests/unit/scripts/

```

---

### 5. git-diff: git diff HEAD~1

- Handler: `git-diff`
- tg: `tg git diff HEAD~1`
- raw: `git --no-pager diff HEAD~1`
- rtk: `git diff HEAD~1`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 101906 | 25477 | 0% |
| tg | 31505 | 7877 | 69.1% |
| rtk | 31864 | 7966 | 68.7% |

**raw** (101906 chars, 25477 tokens):

````text
diff --git a/README.md b/README.md
index cc7e166..943b917 100644
--- a/README.md
+++ b/README.md
@@ -16,6 +16,7 @@ tg git diff
 tg diff old.txt new.txt
 tg rg "submitOrder" src
 tg cat package.json
+tg read --level balanced src/cli.ts
 tg ls .
 tg npm test
 tg tsc --noEmit
@@ -45,11 +46,12 @@ tg --version
 Implemented:
 
 - read-like: `cat`, `type`, `less`
+- explicit read: `read --level minimal|balance|balanced|aggressive`
 - list-like: `ls`, `dir`, `find`, `tree`
 - search-like: `rg`, `grep`
+- diff: `diff`
 - git status
 - git diff
-- diff: `diff`
 - git log
 - git show
 - git branch
diff --git a/docs/DESIGN.md b/docs/DESIGN.md
index cef16c5..35f0eb2 100644
--- a/docs/DESIGN.md
+++ b/docs/DESIGN.md
@@ -92,7 +92,8 @@ CLI (cli.ts)
               └─ pipeline     # filter → history → stats
                   ├─ handler.filter   # 专用压缩逻辑
                   ├─ fallback         # 异常兜底
-                  ├─ outputLimit      # 全局行数/字符数截断
+                  ├─ quality gate     # 膨胀/空输出/省略内容 → raw passthrough
+                  ├─ outputLimit      # 当前 no-op；保留 flags 接口
                   ├─ history          # 写入 .tg/history.jsonl
                   ├─ rawStore         # 条件保存原始输出
                   └─ stats            # token 节省格式化
@@ -108,7 +109,8 @@ CLI (cli.ts)
 | Executor | `src/executor.ts` | `spawn` 执行命令，捕获 stdout/stderr/exit code/duration |
 | Pipeline | `src/core/pipeline.ts` | 串联 filter → fallback → history |
 | Savings | `src/core/savings.ts` | token 估算（chars ÷ 4）和节省计算 |
-| Output limit | `src/core/outputLimit.ts` | 全局行数截断 + 字符数截断，保留重要行 |
+| Quality gate | `src/handlers/base.ts` | 过滤结果质量门：防膨胀、防空输出误导 |
+| Output limit | `src/core/outputLimit.ts` | 当前为 no-op passthrough；`--max-lines` / `--max-chars` 保留 CLI 接口，实际截断由 handler 或 quality gate 决定 |
 | History | `src/core/history.ts` | JSONL 追加写入和读取 |
 | Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `.tg/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
 | Report | `src/core/report.ts` | 汇总 history 生成 text/json/csv 报告 |
@@ -128,28 +130,36 @@ interface CommandHandler {
 
 Router 按注册顺序匹配，最后一个 `genericHandler` 作为兜底。Handler 注册表位于 `src/handlers/index.ts`。
 
-Handler 分类和压缩策略：
-
-| 分类 | Handler | 压缩策略 |
-|------|---------|----------|
-| Search | `searchLike`（rg、grep） | 按文件分组，每文件限制条数；识别 `file:line:content` 和 `--null` 格式 |
-| Read | `readLike`（cat、type、less） | 内部读取（跳过 shell），大文件（>12K chars）提取 import/export/function/class 符号 + head + tail，二进制直接拒绝 |
-| List | `listLike`（ls、dir、find、tree） | 树形摘要，按顶级目录分组计数，跳过 node_modules/dist/build 等噪音目录 |
-| Git | `gitStatus` | 解析 verbose status 输出，结构化 staged/modified/untracked/conflicts |
-| Git | `gitDiff` | 统计 +added/-removed，保留 hunk headers，大 diff 额外提示用 `--raw` |
-| Git | `gitLog` | 解析 commit/Author/Date，截断到最近 20 条 |
-| Git | `gitShow` | 保留 commit 元信息 + 首段 diff |
-| Git | `gitBranch` | 过滤 current/main/master/codex/*/release/* 邻近分支 |
-| JS | `jsTest`（npm/pnpm/yarn test、vitest、jest） | 保留 failures + Test Files/Tests 摘要 |
-| JS | `eslint` | 保留 error/warning 计数和详情 |
-| JS | `tsc` | 保留 type errors，按文件分组 |
-| JS | `packageList` | 去重、截断 |
-| Python | `pytest` | 保留 FAILED + summary |
-| Python | `ruff` | 保留 violations |
-| Python | `mypy` | 保留 type errors |
-| Python | `pip` | 截断列表 |
-| Java | `maven`、`gradle`、`javac` | 保留 errors，丢弃构建进度 |
-| Generic | `generic` | head 30 行 + tail 30 行 + 匹配 error/failed/fatal 等重要模式的行 |
+#### 实现原则
+
+Handler 只做两类事：
+
+1. **结构化改写** — 把 verbose 输出换成更短、但信息完整的格式（如 `git status` 短状态码、两文件 `diff` 的 LCS `+/-` 行、`tsc` 按错误码分组）。不丢行、不写 `Hidden` / `+N more` / `... N lines hidden`。
+2. **原文 passthrough** — 无法在不省略内容的前提下明显变短时，原样输出 stdout/stderr（如 `rg`、`grep`、`git diff`、未知命令的 `generic`）。
+
+只有 **`read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）；默认 `cat` / `read` 对大文件也 passthrough 全文。
+
+#### Handler 分类与策略
+
+| 分类 | Handler | 策略 |
+|------|---------|------|
+| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
+| Read | `readLike`（cat、type、less、read） | `cat`/`read` 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
+| List | `listLike`（ls、dir、find、tree） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
+| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
+| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
+| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
+| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
+| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
+| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
+| JS | `jsTest` | failures + Test Files/Tests 摘要 |
+| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
+| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
+| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
+| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
+| Python | `pip` | **原文 passthrough** |
+| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
+| Generic | `generic` | **原文 passthrough**（stdout + stderr） |
 
 ### 1.5 FilteredResult
 
@@ -158,9 +168,9 @@ Handler 分类和压缩策略：
 ```typescript
 type FilteredResult = {
   handler: string;         // handler 名称
-  output: string;          // 压缩后输出（已去 ANSI + 全局截断）
+  output: string;          // 最终输出（已去 ANSI；经 quality gate 选定）
   rawChars: number;        // 原始字符数
-  outputChars: number;     // 压缩后字符数
+  outputChars: number;     // 最终输出字符数
   rawTokens: number;       // 估算原始 token
   outputTokens: number;    // 估算输出 token
   savedTokens: number;     // 节省 token
@@ -168,10 +178,43 @@ type FilteredResult = {
   rawOutputPath?: string;  // 原始输出保存路径（如保存）
   exitCode: number;        // 透传原始 exit code
   filterError?: string;    // fallback 时的错误信息
+  qualityStatus:           // 过滤质量状态
+    | "passed"
+    | "inflated"
+    | "empty_output";
 };
 ```
 
-### 1.6 Rewrite engine
+`savingsPct` 与 history 只反映 **quality gate 之后** 的最终 `output`，不把被回退为 raw 的尝试算成有效压缩。
+
+### 1.6 Quality gate
+
+所有 handler 的结果在 `makeFilteredResult()` 里经过统一质量门。目标不是“让每个命令都变短”，而是 **避免为了 token 数字牺牲信息**：
+
+| 条件 | 行为 | `qualityStatus` |
+|------|------|-----------------|
+| raw 非空，filtered 为空或只有空白 | 输出 raw | `empty_output` |
+| raw 非空，filtered 比 raw 长（小输出零容差；大输出允许 ≤5% 或 ≥80 chars 的 metadata 开销） | 输出 raw | `inflated` |
+| filtered 含省略语义（`Hidden`、`+N more`、`[N more lines]`、`... N lines hidden`、`Direct sample:` 等，`outputOmitsContent()` 检测） | 输出 raw | `inflated` |
+| filtered 非空且不膨胀、不省略 | 输出 filtered | `passed` |
+| raw 为空、filtered 非空（如 `0 matches for pattern`） | 输出 filtered | `passed` |
+
+因此：
+
+- 专用 handler 可以 passthrough（savings 为 0），这仍是正确行为。
+- 结构化改写若比 raw 更长或声称省略未展示内容，会自动回退 raw。
+- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入 `.tg/raw/`。
+
+**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：
+
+- `Hidden: … not shown`
+- `+N more matches/files/packages/errors/commits/branches`
+- `[N more lines]`、`... N more lines (use tg --raw …)`
+- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）
+
+这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。
+
+### 1.7 Rewrite engine
 
 在 hook 运行时，rewrite engine 负责将用户输入的 raw command 改写为 `tg` wrapper。这是集中式 command rewrite registry，输入 raw command，输出 `rewrite | suggest | pass | deny`。
 
@@ -560,7 +603,8 @@ Parser 模块作为 handler filter 的基础设施，handler 可以选择：
   "savings_pct": 34.3,
   "exit_code": 0,
   "duration_ms": 120,
-  "raw_output_path": ".tg/raw/20260602-103000-git-status.log"
+  "raw_output_path": ".tg/raw/20260602-103000-git-status.log",
+  "quality_status": "passed"
 }
 ```
 
@@ -581,6 +625,7 @@ tg report --csv        # CSV 格式
 - 总命令数 / hook 命中次数。
 - 原始 token 总量、输出 token 总量、节省 token 总量、节省百分比。
 - 按 handler 分组的节省率。
+- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
 - `--user` 报告按项目分组，展示每个项目的独立统计。
 - `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
 - 不记录敏感原文，只记录命令类型、长度、策略结果和时间。
@@ -886,7 +931,52 @@ model_policy:
 
 ---
 
-## 13. Implementation Constraints
+## 13. Future Token Digestion Layers
+
+Layer 1 已落在 command filter 质量门上。后续两层先保留在设计中，不进入当前实现范围。
+
+### 13.1 Layer 2: 少产生输出
+
+目标是在工具执行前减少高成本输出，而不是等 raw output 生成后再压缩。
+
+实现边界：
+
+- 新增 rewrite registry，输入 raw command，输出 `pass | rewrite | warn | deny`。
+- `tg hook pretool` 读取 stdin JSON，对 `cat` lockfile、读依赖目录、无路径全仓 `rg`、`git diff`、测试命令等给出 rewrite/warn/deny。
+- `tg hook posttool` 在宿主已经执行 raw command 时复用现有 handler 压缩输出，不重新执行命令。
+- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。
+
+第一批规则只覆盖高价值命令：
+
+- `cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
+- `cat node_modules/...`、`cat dist/...` → deny。
+- `rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
+- `git diff` → rewrite 到 `tg git diff`。
+- `npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。
+
+### 13.2 Layer 3: 增加 cache hit
+
+目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用。
+
+实现边界：
+
+- 新增 content-addressed output cache：`.tg/cache/outputs/<hash>.json`。
+- cache key 由 `cwd`、command、args、git HEAD、相关文件 fingerprint 构成。
+- 重复命令在 fingerprint 未变时返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`。
+- 新增 deterministic project context：`.tg/context.md` 和 `.tg/context.json`，按固定顺序输出 repo map、scripts、重要文件摘要和 section hashes。
+- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。
+
+报告后续增加：
+
+- cacheable commands。
+- cache hits。
+- repeated output avoided tokens。
+- stable chars / volatile chars。
+- raw reuse hits。
+
+---
+
+## 14. Implementation Constraints
 
 - L6/L7 暂不考虑，文档和代码必须明确标注。
 - 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
@@ -899,7 +989,7 @@ model_policy:
 
 ---
 
-## 14. Development
+## 15. Development
 
 ```bash
 pnpm install
diff --git a/docs/testing-and-migration-audit.md b/docs/testing-and-migration-audit.md
index de3fc9b..cf4d83e 100644
--- a/docs/testing-and-migration-audit.md
+++ b/docs/testing-and-migration-audit.md
@@ -15,7 +15,7 @@ Last audited: 2026-06-03
 | Question | Answer |
 |----------|--------|
 | Is migration complete? | **No** — ~29 RTK command modules have no tg handler; migration suite is red by design. |
-| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 42 real `fixtureCases`; current red tests expose real gaps. |
+| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 47 real `fixtureCases`; migration red tests expose real gaps. |
 | Do passing tests reflect project reality? | **Partially** — core handlers work on selected real fixtures and narrow integration paths; not production-wide or RTK 1:1. |
 
 **Baseline**
@@ -199,14 +199,14 @@ Every RTK module migration is **done** when tg covers **all applicable rows** fo
 
 | RTK dimension | tg artifact | CI gate | tg today (honest) |
 |---------------|-------------|---------|-------------------|
-| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **42 rows** across registered handlers; still needs deeper per-handler variants |
+| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **47 rows** across registered handlers; still needs deeper per-handler variants |
 | **B Arg parse & routing** | `router.test.ts` + `rtkDomainCaseParity` sample command → handler name | verified / migration gate | **Partial** — routing only, not arg edge cases |
 | **C Format transform** | Unit tests on exported pure functions **or** fixtureCases when output differs | fixtureCases / future parser units | **Still thin** — add real fixture variants or exported-parser units only |
 | **D Passthrough / small output** | `fixtureCases` with small fixture + max size assertion; `contracts` small-output rows | fixtureContent + (future) size caps | **Rare** — few P1 small-output cases |
 | **E Compression & limits** | `fixtureCases` on large fixture + `critical` + optional `expectLargeSavings` | fixtureContent | **Partial** — no savings-only tests count |
 | **F Empty / no-match** | `fixtureCases` or unit: empty input → no throw, sensible message | fixtureContent | **Sparse** |
 | **G Error / stderr** | `fixtureCases` with `exitCode != 0`, stderr in fixture or merged raw | fixtureContent | **Some** (pytest, ruff, tsc, …) |
-| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Gaps now visible** — grep `-c`/`-l` pass; `rg --json` is red because current handler rewrites machine-readable output |
+| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Partial** — grep `-c`/`-l` and `rg --json` are fixture-backed; more RTK variants remain |
 | **I Platform / encoding** | fixtureCases with paths/unicode in fixture file | fixtureContent | **Minimal** |
 | **J Malformed / unknown format** | fixtureCases: non-canonical stdout → not empty, not “0 matches” lie | fixtureContent | **Almost none** |
 | **K Module inventory** | Handler exists + at least one dimension-A row | `rtkDomainCaseParity` | **47 modules tracked; most fail** |
@@ -219,7 +219,7 @@ As of 2026-06-03, tg test cases classified against the same A–K dimensions:
 
 | Dimension | RTK ~count | tg actual | Coverage verdict | Gap |
 |-----------|-----------|-----------|------------------|-----|
-| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 42 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
+| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 47 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
 | **B — Arg parse/routing** | ~230 | ~55 routing / 0 internal parse | ⚠️ Routing ok, parse untested | Handler-internal parse functions (`formatStatus`, `parseMatch`, …) tested only through filter() pipeline, not in isolation |
 | **C — Format transform** | ~161 | ~14 | 🔴 Thin | Only searchLike has 5+ format variants; other handlers test one canonical format only |
 | **D — Passthrough/small output** | ~34 | ~14 | 🟢 Proportional | branch/list/search small-output rows now assert output growth limits |
@@ -231,7 +231,7 @@ As of 2026-06-03, tg test cases classified against the same A–K dimensions:
 | **J — Malformed input** | ~1+ | 4 | 🔴 Honest red | `rg --json`, `git status --short`, `git status --porcelain -b`, and `git diff --stat` expose parser/format gaps |
 | **K — Unit helpers** | ~143 | 0 | N/A | Intentionally not isolated; all helper logic covered through filter() pipeline |
 
-**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed. `rg --json` deliberately stays red.
+**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed, including `rg --json`.
 
 **Naming / traceability:** each tg case should cite RTK source when porting:
 
@@ -268,13 +268,13 @@ Or in unit tests: `// RTK: rtk/src/cmds/system/grep_cmd.rs test_parse_match_line
 
 The product suite (`vitest.config.ts`) intentionally includes current product behavior only: core unit tests, integration, and fixture-backed handler behavior. It does **not** include per-handler synthetic tests under `tests/unit/handlers/**` or migration/debt gates.
 
-The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` was red (**120 pass / 1 fail**) because `rg --json` is now a real fixture-backed bug, and `pnpm test:migration` was red (**97 pass / 39 fail**). Treat failures as debt signals, not regressions to hide.
+The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` is green, and `pnpm test:migration` remains red because missing RTK handlers, scripts, and repo infrastructure are still tracked as debt. Treat failures as debt signals, not regressions to hide.
 
 ### 3.2 Categories of passing tests (quality tiers)
 
 | Tier | Examples | Follows P0/P1 principles? | Reflects real tool output? |
 |------|----------|---------------------------|----------------------------|
-| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (42 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
+| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (47 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
 | **B — tg internals** | `savings`, `parse`, `router`, `pipeline`, `executor`, `ansi` | **Yes** for their scope | **N/A** (not handler filters) |
 | **C — E2E smoke** | `tests/integration/cli.test.ts` (~30 cases) | **Mostly** — real `spawn` of tg in temp dirs | **Partial** — narrow scenarios |
 | **D — Migration/debt only** | Routing parity, fixture wiring, fixture corpus size, script path parity | **No** for product behavior | **No** — existence/routing ≠ correct compression |
@@ -284,7 +284,7 @@ The migration suite (`vitest.migration.config.ts`) intentionally includes RTK mi
 
 1. **Migration CI not green** — migration gates (`rtkDomainCaseParity`, `fixtureRegressionDebt`, `projectConfig`, pending script ports) still fail.
 2. **Synthetic handler tests removed** — 23 inline-stdout handler test files were deleted after porting useful coverage into `fixtureCases` or explicit migration debt.
-3. **One fixture per handler is not enough** — `fixtureCases` covers 42 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
+3. **One fixture per handler is not enough** — `fixtureCases` covers 47 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
 4. **fixtureCases wiring debt cleared** — orphaned on-disk fixtures (`rg_default_format`, `log_standard`, `show_large`, …) and commands (`tree`, `ls`, `pnpm list`, …) are now wired into `fixtureCases`.
 5. **Registered handler fixture coverage complete** — every registered non-generic handler has at least one `fixtureCases` row.
 6. **No synthetic handler contract tests** — global inline contracts were removed; use fixtureCases or explicit regression debt.
@@ -293,7 +293,7 @@ The migration suite (`vitest.migration.config.ts`) intentionally includes RTK mi
 9. **Historical anti-pattern removed from handler tests** — savings-only and hand-built stdout handler tests were deleted; future coverage must use real fixtures or explicit parser-unit contracts.
 10. **RTK scale gap** — e.g. gradlew RTK **56** tests + **6** fixtures vs tg **11** tests + **1** fixture; **986** RTK inline tests vs a thin verified layer.
 11. **Former `contracts.test.ts` empty edge case bug removed** — the no-op `critical: [""]` assertions were deleted with the synthetic contracts file.
-12. **`rg --json` is now intentionally red** — current `search-like` rewrites JSON output into a search summary and drops machine-readable fields.
+12. **Explicit machine-readable search output is covered** — `rg --json` now stays raw enough to preserve JSON fields; more grep/rg format variants still need parity work.
 
 ### 3.4 What passing tests *do* justify
 
@@ -335,7 +335,7 @@ Merged from `docs/test-case-audit.md` (2026-06-03), **reconciled** with `vitest.
 | `tests/unit/executor.test.ts` | ✅ | Real spawn, exit code, 127 (2) | Keep |
 | `tests/unit/core/ansi.test.ts` | ✅ | ANSI strip via generic handler (1) | Keep |
 | `tests/integration/cli.test.ts` | ✅ | E2E tg: ls/cat/git/rg/flags/report (~30) | Keep; primary smoke |
-| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **42 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar; currently red on `rg --json` |
+| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **47 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar |
 
 #### 3.5.2 🗑️ Deleted synthetic handler tests (23 files)
 
@@ -356,7 +356,7 @@ Replacement coverage now lives in:
 | File | Migration | What it tests | Verdict | Action |
 |------|:--:|---------------|---------|--------|
 | `handlers/rtkDomainCaseParity.test.ts` | ✅ | Per RTK module: routing + fixture coverage (47) | **Primary gate** | Keep |
-| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (28) | Redundant subset | **Merge** into domain parity; then remove |
+| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (29) | Redundant subset | **Merge** into domain parity; then remove |
 | `handlers/fixtureRegressionDebt.test.ts` | ✅ | Real fixture-backed regressions not yet implemented | **Debt gate** | Keep until fixed |
 | `handlers/fixtureWiring.test.ts` | ✅ | Known fixtures/commands wired into fixtureCases | **Debt gate** | Keep while fixtures expand |
 | `handlers/syntheticTestDebt.test.ts` | ✅ | Fails if synthetic handler tests return | **Guard** | Keep to prevent regression |
@@ -373,7 +373,7 @@ Replacement coverage now lives in:
 
 | File | Product | Notes | Action |
 |------|:--:|-------|--------|
-| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (3) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |
+| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (4) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |
 
 #### 3.5.7 File tree (CI status)
 
@@ -489,7 +489,7 @@ Every registered handler needs at least one test proving compressed output keeps
 | `gradle` / `maven` / `javac` | Task/failure + location | Task or file:line |
 | `generic` | Error/failure lines | `/error|failed|fatal/i` |
 
-**Verified today:** 42 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Current red:** `rg --json` does not preserve explicit JSON output. **Still missing:** multi-scenario depth per handler and several real-format regressions in `fixtureRegressionDebt`.
+**Verified today:** 47 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Still missing:** multi-scenario depth per handler and remaining migration gaps outside the product suite.
 
 ### 5.3 P0: Unknown format handling
 
@@ -591,7 +591,7 @@ src/cmds/system/format_cmd.rs             ─                                  
 src/cmds/system/pipe_cmd.rs               ─                                  ─
 src/cmds/system/local_llm.rs              ─                                  ─
 src/cmds/git/git.rs                       git/{status,diff,log,branch,show,extended}  fixtureCases + regression debt
-src/cmds/git/diff_cmd.rs                  ─ (no two-file diff handler)       ─
+src/cmds/git/diff_cmd.rs                  diff.ts                            fixtureCases + fixtureContent
 src/cmds/git/gh_cmd.rs                    hostingCli.ts                      fixtureContent.test.ts
 src/cmds/git/glab_cmd.rs                  hostingCli.ts                      fixtureContent.test.ts
 src/cmds/git/gt_cmd.rs                    ─                                  ─
@@ -649,11 +649,12 @@ Full RTK total: **986** `#[test]` in **47** modules. tg `test()` counts below ar
 RTK module              RTK #[test]   tg test()   State
 ────────────────────────────────────────────────────────
 system/ls.rs                 29           11       partial via listLike
+system/read.rs                8            7       partial via readLike
 system/find_cmd.rs           29           11       partial via listLike
 system/grep_cmd.rs           23           20       partial
 system/pipe_cmd.rs           38            0       no handler
 git/git.rs                   75           71       partial
-git/diff_cmd.rs              19            0       no dedicated handler
+git/diff_cmd.rs              19            4       partial via diff
 git/gh_cmd.rs                66           41       partial via hostingCli
 git/glab_cmd.rs              62           41       partial via hostingCli
 jvm/gradlew_cmd.rs           56           11       high gap; RTK gradlew fixtures ported, behavior depth still shallow
@@ -668,7 +669,7 @@ rust/cargo_cmd.rs            48            0       no handler
 |--------------|-------------|
 | Argument parsing (find/grep/git) | ❓ `parse.test.ts` = tg flags only |
 | Grep format flags | ✅ partial in searchLike |
-| Diff compaction / hunk limits | ❓ diff.test partial; diff_cmd 19 tests unmigrated |
+| Diff compaction / hunk limits | ❓ diff handler fixture-backed; most diff_cmd inline tests unmigrated |
 | Git extended subcommands | ✅ handlers; ❓ fixtureCases incomplete |
 | Pipe chaining | ❌ no handler |
 | Gradlew variants + fixtures | ❓ high gap |
@@ -711,25 +712,26 @@ handler fidelity              fixtureContent.test.ts          ✅ product
 | system ls/find/grep/read/tree | ❓ | Partial; not 1:1 with RTK inline tests |
 | system log/json/env/wc/format/pipe/llm | ❌ | No handler |
 | git core + extended | ❓ | Fixture-backed coverage exists; alternate formats still red in regression debt |
-| git diff_cmd, gt | ❌ | No dedicated coverage |
+| git diff_cmd | ❓ | Dedicated two-file handler added; RTK inline depth still unmigrated |
+| git gt | ❌ | No dedicated coverage |
 | gh/glab | ❓ | Fixture-backed coverage exists; RTK depth not fully mapped |
 | js/python/java mapped handlers | ❓ | Core scenarios; not full RTK parity |
 | js prettier/next/playwright/prisma | ❌ | No handler |
 | dotnet/cloud/go/rust/ruby | ❌ | No handler |
 | gradlew fixtures | ✅ | RTK corpus ported |
 | tg-only maven/javac/generic | ✅ | No RTK module |
-| Verified CI green | ❌ | `fixtureContent` has intentional `rg --json` red; migration gates in §4 also red |
+| Verified CI green | ❌ | Migration gates in §4 are still red |
 | Synthetic test debt | ✅ | 23 files deleted; guard remains |
 | benchmark TS + sessions + test-ruby | ❌ | rtkScriptParity |
 | GitHub CI + cli-testing.md | ❌ | projectConfig |
 
-### Unacceptable gaps (29 RTK modules — no handler AND no migration test)
+### Unacceptable gaps (28 RTK modules — no handler AND no migration test)
 
 **Cloud:** aws, curl, psql, wget, docker/kubectl  
 **JS:** prettier, next, playwright, prisma  
 **Languages:** go, golangci-lint, cargo/rust runner, ruby (rake/rspec/rubocop)  
 **.NET:** dotnet_cmd, binlog, trx, format_report  
-**Git:** gt; dedicated `diff_cmd` two-file diff  
+**Git:** gt
 **System:** log, json, env, wc, format, pipe, local_llm  
 
 ### Implemented but severely under-tested
@@ -737,13 +739,13 @@ handler fidelity              fixtureContent.test.ts          ✅ product
 | Area | RTK | tg | Severity |
 |------|-----|-----|----------|
 | gradlew | 56 tests, 6 fixtures | fixture corpus ported, behavior still shallow | **high** |
-| diff_cmd | 19 inline tests | 0 dedicated | **high** |
+| diff_cmd | 19 inline tests | fixture-backed two-file + stdin unified + overflow subset | **high** |
 | git.rs | 75 inline tests | fixture-backed subset + regression debt | medium |
 | readLike / tree | 8 / 6 RTK | fixture-backed subset via listLike/readLike | medium |
 
 ### Relatively complete (product bar only)
 
-- **42 `fixtureCases`** fidelity scenarios
+- **47 `fixtureCases`** fidelity scenarios
 - **Core** unit + **integration/cli** smoke path
 - **Ported** shell scripts (§7 ✅ rows)
 - **tg-owned** fixture files on disk; current known orphaned fixture wiring cleared
diff --git a/scripts/validate-docs.sh b/scripts/validate-docs.sh
index dcdc1c1..20eec74 100755
--- a/scripts/validate-docs.sh
+++ b/scripts/validate-docs.sh
@@ -11,7 +11,7 @@ EXIT_CODE=0
 
 # All program names covered by src/handlers/*.ts
 PROGRAMS=(
-    cat type less           # common/readLike.ts
+    cat type less read      # common/readLike.ts
     ls dir find tree         # common/listLike.ts
     rg grep                  # common/searchLike.ts
     diff                     # common/diff.ts
diff --git a/src/core/outputLimit.ts b/src/core/outputLimit.ts
index dd9ae22..1fe767f 100644
--- a/src/core/outputLimit.ts
+++ b/src/core/outputLimit.ts
@@ -1,31 +1,13 @@
 import type { TgOptions } from "../types.js";
-import { IMPORTANT_PATTERN } from "./patterns.js";
 
-export function limitLines(text: string, maxLines: number): string {
-  const lines = text.split(/\r?\n/);
-  if (lines.length <= maxLines) return text;
-
-  const important = lines.filter((line) => IMPORTANT_PATTERN.test(line));
-  const headCount = Math.max(1, Math.floor(maxLines / 3));
-  const tailCount = Math.max(1, Math.floor(maxLines / 3));
-  const middleBudget = Math.max(0, maxLines - headCount - tailCount - 1);
-  const middle = important.slice(0, middleBudget);
-
-  return [
-    ...lines.slice(0, headCount),
-    ...middle,
-    `... ${lines.length - maxLines} lines hidden ...`,
-    ...lines.slice(-tailCount),
-  ].join("\n");
+export function limitLines(text: string, _maxLines: number): string {
+  return text;
 }
 
-export function limitChars(text: string, maxChars: number): string {
-  if (text.length <= maxChars) return text;
-  const head = text.slice(0, Math.floor(maxChars / 2));
-  const tail = text.slice(text.length - Math.floor(maxChars / 2));
-  return `${head}\n... ${text.length - maxChars} chars hidden ...\n${tail}`;
+export function limitChars(text: string, _maxChars: number): string {
+  return text;
 }
 
-export function limitOutput(text: string, options: TgOptions): string {
-  return limitChars(limitLines(text, options.maxLines), options.maxChars);
+export function limitOutput(text: string, _options: TgOptions): string {
+  return text;
 }
diff --git a/src/core/patterns.ts b/src/core/patterns.ts
index c6f84bc..51bee52 100644
--- a/src/core/patterns.ts
+++ b/src/core/patterns.ts
@@ -1,6 +1,2 @@
 export const IMPORTANT_PATTERN =
   /error|failed|failure|exception|fatal|cannot|undefined|null|timeout|denied|stack|FAIL|ERROR|WARN/i;
-
-export function isNoisyPath(value: string): boolean {
-  return /noise|node_modules|dist|build|target|coverage|\.git/.test(value);
-}
diff --git a/src/handlers/base.ts b/src/handlers/base.ts
index 283cd43..0ae2544 100644
--- a/src/handlers/base.ts
+++ b/src/handlers/base.ts
@@ -8,6 +8,24 @@ export function rawText(raw: RawResult): string {
   return `${raw.stdout}${raw.stderr}`;
 }
 
+export function outputOmitsContent(output: string): boolean {
+  return output.split(/\r?\n/).some((line) => {
+    const trimmed = line.trim();
+    return (
+      /^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/.test(trimmed) ||
+      /^\[\d+ more lines\]$/.test(trimmed) ||
+      /^more (lines|chars) \(use tg.*\)$/.test(trimmed) ||
+      /^repetitive lines collapsed$/.test(trimmed) ||
+      /^.*lines truncated\)$/.test(trimmed) ||
+      /^\.\.\. \(more changes truncated\)$/.test(trimmed) ||
+      /^- \.\.\. \d+ more$/.test(trimmed) ||
+      /^Hidden:$/.test(trimmed) ||
+      /^- \d+ (matches|files|packages|errors|commits|branches|dependencies) not shown$/.test(trimmed) ||
+      /^Direct sample:$/.test(trimmed)
+    );
+  });
+}
+
 export async function makeFilteredResult(
   handler: string,
   raw: RawResult,
@@ -15,14 +33,24 @@ export async function makeFilteredResult(
   options: TgOptions,
   filterError?: string,
 ): Promise<FilteredResult> {
-  const cleanRaw = limitOutput(removeAnsi(rawText(raw)), options);
-  const cleanOutput = limitOutput(removeAnsi(output), options);
+  const unlimitedRaw = removeAnsi(rawText(raw));
+  const unlimitedOutput = removeAnsi(output);
+  const cleanRaw = limitOutput(unlimitedRaw, options);
+  const cleanOutput = limitOutput(unlimitedOutput, options);
   const rawHasContent = cleanRaw.trim().length > 0;
   const outputHasContent = cleanOutput.trim().length > 0;
-  const outputInflatesRaw = rawHasContent && outputHasContent && cleanOutput.length > cleanRaw.length;
+  const inflationBudget =
+    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
+  const outputInflatesRaw =
+    handler !== "git-diff" &&
+    rawHasContent &&
+    outputHasContent &&
+    cleanOutput.length > cleanRaw.length + inflationBudget;
+  const outputTruncatesContent =
+    handler !== "git-diff" && rawHasContent && outputHasContent && outputOmitsContent(cleanOutput);
   const qualityStatus = !outputHasContent && rawHasContent
     ? "empty_output"
-    : outputInflatesRaw
+    : outputInflatesRaw || outputTruncatesContent
     ? "inflated"
     : "passed";
   const limited = qualityStatus === "passed" ? cleanOutput : cleanRaw;
diff --git a/src/handlers/common/diff.ts b/src/handlers/common/diff.ts
index 85d492c..75d1a27 100644
--- a/src/handlers/common/diff.ts
+++ b/src/handlers/common/diff.ts
@@ -58,47 +58,28 @@ function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
   return changes;
 }
 
-function formatTimestamp(date: Date): string {
-  return date.toISOString().replace(".000Z", "Z");
-}
-
-function formatLineNumber(value: number | "-"): string {
-  return String(value).padStart(4, " ");
-}
-
 function formatDiffOutput(
   oldPath: string,
   newPath: string,
-  oldMtime: Date,
-  newMtime: Date,
+  _oldMtime: Date,
+  _newMtime: Date,
   oldText: string,
   newText: string,
 ): string {
   const changes = lcsChanges(splitLines(oldText), splitLines(newText));
   if (changes.length === 0) {
-    return [
-      `Files: ${oldPath} -> ${newPath}`,
-      `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
-      "Summary: +0 -0",
-      "[ok] Files are identical",
-      "",
-    ].join("\n");
+    return `${oldPath} -> ${newPath}\n[ok] Files are identical\n`;
   }
 
   const added = changes.filter((change) => change.kind === "added").length;
   const removed = changes.length - added;
-  const lines = [
-    `Files: ${oldPath} -> ${newPath}`,
-    `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
-    `Summary: +${added} -${removed}`,
-    "",
-  ];
+  const lines = [`${oldPath} -> ${newPath} (+${added} -${removed})`, ""];
 
   for (const change of changes) {
     if (change.kind === "added") {
-      lines.push(`+ ${formatLineNumber("-")}:${formatLineNumber(change.newLine)} | ${change.content}`);
+      lines.push(`+ ${change.content}`);
     } else {
-      lines.push(`- ${formatLineNumber(change.oldLine)}:${formatLineNumber("-")} | ${change.content}`);
+      lines.push(`- ${change.content}`);
     }
   }
 
@@ -119,14 +100,9 @@ function flushUnifiedFile(
   if (!currentFile || (added === 0 && removed === 0)) return;
 
   output.push(`[file] ${currentFile} (+${added} -${removed})`);
-  const visibleChanges = changes.slice(0, 10);
-  for (const change of visibleChanges) {
+  for (const change of changes) {
     output.push(`  ${change}`);
   }
-  const hidden = changes.length - visibleChanges.length;
-  if (hidden > 0) {
-    output.push(`  ... +${hidden} more`);
-  }
 }
 
 function condenseUnifiedDiff(text: string): string {
diff --git a/src/handlers/common/listLike.ts b/src/handlers/common/listLike.ts
index 8143d50..8942a6a 100644
--- a/src/handlers/common/listLike.ts
+++ b/src/handlers/common/listLike.ts
@@ -22,9 +22,6 @@ const SKIP_DIRS = new Set([
 ]);
 
 type TreeSummary = {
-  rootFiles: Set<string>;
-  dirs: Map<string, number>;
-  skipped: Set<string>;
   visiblePaths: string[];
 };
 
@@ -40,128 +37,122 @@ function addPath(summary: TreeSummary, rawPath: string): void {
   if (!cleaned || cleaned === ".") return;
 
   const parts = cleaned.split(/[\\/]+/).filter(Boolean);
-  const skipped = parts.find((part) => SKIP_DIRS.has(part));
-  if (skipped) {
-    summary.skipped.add(`${skipped}/`);
+  if (parts.some((part) => SKIP_DIRS.has(part))) {
     return;
   }
 
   if (parts.length === 1) {
-    summary.rootFiles.add(parts[0]!);
     summary.visiblePaths.push(parts[0]!);
     return;
   }
-
-  const parent = `${parts.slice(0, -1).join("/")}/`;
-  summary.dirs.set(parent, (summary.dirs.get(parent) ?? 0) + 1);
   summary.visiblePaths.push(parts.join("/"));
 }
 
-function summarizeListing(text: string): string {
-  const summary: TreeSummary = {
-    rootFiles: new Set(),
-    dirs: new Map(),
-    skipped: new Set(),
-    visiblePaths: [],
-  };
-
-  for (const line of text.split(/\r?\n/)) {
-    if (!line.trim() || line.startsWith("total ")) continue;
-    const longListingMatch = line.match(/\s([^\s]+)$/);
-    addPath(summary, longListingMatch?.[1] ?? line);
-  }
-
-  if (summary.visiblePaths.length === 0 && summary.skipped.size === 0) return "\n";
-
-  const uniquePaths = [...new Set(summary.visiblePaths)].sort();
-
-  if (summary.skipped.size === 0 && text.length <= 200) {
-    return `${text.trimEnd()}\n`;
-  }
-
-  const dirNames = new Set<string>();
-  for (const file of uniquePaths) {
-    const parts = file.split("/");
-    for (let index = 1; index < parts.length; index += 1) {
-      dirNames.add(`${parts.slice(0, index).join("/")}/`);
-    }
-  }
-
-  const lines = [`${uniquePaths.length}F ${dirNames.size}D:`];
-  if (uniquePaths.length <= 80) {
-    const byParent = new Map<string, string[]>();
-    for (const file of uniquePaths) {
-      const parts = file.split("/");
-      const parent = parts.length === 1 ? "./" : `${parts.slice(0, -1).join("/")}/`;
-      const files = byParent.get(parent) ?? [];
-      files.push(parts.at(-1) ?? file);
-      byParent.set(parent, files);
-    }
-    for (const [parent, files] of [...byParent.entries()].sort()) {
-      lines.push(`${parent} ${files.sort().join(" ")}`.trimEnd());
-    }
-  } else {
-    for (const [dir, count] of [...summary.dirs.entries()].sort()) {
-      lines.push(`${dir} (${count} files)`);
-    }
-    for (const file of [...summary.rootFiles].sort().slice(0, 40)) {
-      lines.push(file);
-    }
-  }
-  if (uniquePaths.length > 80) {
-    lines.push(`... ${uniquePaths.length - 80} more files`);
-  }
-
-  if (summary.skipped.size > 0) {
-    lines.push("", "Skipped:");
-    for (const skipped of [...summary.skipped].sort()) {
-      lines.push(`- ${skipped}`);
-    }
-  }
-
-  return `${lines.join("\n")}\n`;
-}
-
 function treeLineDepth(line: string): number {
   const marker = line.search(/[├└]/);
-  return marker < 0 ? 0 : marker;
+  return marker < 0 ? 0 : Math.floor(marker / 4);
 }
 
 function treeNodeName(line: string): string {
   return line.replace(/^[\s│├└─]+/, "").trim().replace(/\/$/, "");
 }
 
-function filterTreeOutput(text: string): string {
-  if (!text.trim()) return "\n";
-
-  const skipped = new Set<string>();
-  const lines: string[] = [];
+function flattenTreeOutput(text: string): string {
+  const paths: string[] = [];
+  const stack: Array<{ depth: number; name: string }> = [];
   let skipDepth: number | undefined;
 
   for (const line of text.split(/\r?\n/)) {
-    if (/^\s*\d+ directories?, \d+ files?\s*$/.test(line)) continue;
-    if (!line.trim()) continue;
+    if (!line.trim() || /^\d+ directories?, \d+ files?\s*$/.test(line.trim())) continue;
 
     const depth = treeLineDepth(line);
     if (skipDepth !== undefined && depth > skipDepth) continue;
     skipDepth = undefined;
 
-    const nodeName = treeNodeName(line);
-    if (SKIP_DIRS.has(nodeName)) {
-      skipped.add(`${nodeName}/`);
+    const name = treeNodeName(line);
+    if (!name) continue;
+
+    if (SKIP_DIRS.has(name)) {
       skipDepth = depth;
       continue;
     }
 
-    lines.push(line);
+    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
+      stack.pop();
+    }
+
+    const parent = stack.map((entry) => entry.name).join("/");
+    const fullPath = parent ? `${parent}/${name}` : name;
+    stack.push({ depth, name });
+
+    if (name.includes(".")) {
+      paths.push(fullPath);
+    } else {
+      paths.push(`${fullPath}/`);
+    }
   }
 
-  if (skipped.size > 0) {
-    lines.push("", "Skipped:");
-    for (const name of [...skipped].sort()) lines.push(`- ${name}`);
+  return paths.join("\n");
+}
+
+function summarizeListing(text: string): string {
+  const summary: TreeSummary = {
+    visiblePaths: [],
+  };
+
+  for (const line of text.split(/\r?\n/)) {
+    if (!line.trim() || line.startsWith("total ")) continue;
+    const longListingMatch = line.match(/\s([^\s]+)$/);
+    addPath(summary, longListingMatch?.[1] ?? line);
   }
 
-  return `${lines.join("\n").trimEnd()}\n`;
+  if (summary.visiblePaths.length === 0) return "\n";
+
+  const uniquePaths = [...new Set(summary.visiblePaths)].sort();
+  return `${uniquePaths.join("\n")}\n`;
+}
+
+function findRoot(command: ParsedCommand): string {
+  const first = command.args.find((arg) => !arg.startsWith("-"));
+  return first && first !== "." ? cleanPath(first) : "";
+}
+
+function stripFindRoot(pathValue: string, root: string): string {
+  const cleaned = cleanPath(pathValue);
+  if (!root) return cleaned;
+  if (cleaned === root) return "";
+  return cleaned.startsWith(`${root}/`) ? cleaned.slice(root.length + 1) : cleaned;
+}
+
+function summarizeFindOutput(text: string, command: ParsedCommand): string {
+  const root = findRoot(command);
+  const files = [...new Set(
+    text
+      .split(/\r?\n/)
+      .map((line) => stripFindRoot(line, root))
+      .filter((line) => line && !line.split(/[\\/]+/).some((part) => SKIP_DIRS.has(part))),
+  )].sort();
+
+  if (files.length === 0) return "\n";
+
+  const byDir = new Map<string, string[]>();
+  for (const file of files) {
+    const parts = file.split(/[\\/]+/).filter(Boolean);
+    const filename = parts.pop();
+    if (!filename) continue;
+    const dir = parts.length === 0 ? "." : parts.join("/");
+    const entries = byDir.get(dir) ?? [];
+    entries.push(filename);
+    byDir.set(dir, entries);
+  }
+
+  const dirs = [...byDir.keys()].sort();
+  const lines = [`${files.length}F ${dirs.length}D:`, ""];
+  for (const dir of dirs) {
+    const entries = byDir.get(dir) ?? [];
+    lines.push(`${dir}/ ${entries.sort().join(" ")}`);
+  }
+  return `${lines.join("\n")}\n`;
 }
 
 async function executeDirInternally(command: ParsedCommand): Promise<RawResult | undefined> {
@@ -195,7 +186,9 @@ export const listLikeHandler: CommandHandler = {
 
   async filter(raw, command, options) {
     const text = `${raw.stdout}\n${raw.stderr}`;
-    const output = command.program === "tree" ? filterTreeOutput(text) : summarizeListing(text);
+    const output = command.program === "find"
+      ? summarizeFindOutput(text, command)
+      : summarizeListing(command.program === "tree" ? flattenTreeOutput(text) : text);
     return makeFilteredResult(this.name, raw, output, options);
   },
 };
diff --git a/src/handlers/common/readLike.ts b/src/handlers/common/readLike.ts
index 56e2732..e284457 100644
--- a/src/handlers/common/readLike.ts
+++ b/src/handlers/common/readLike.ts
@@ -30,28 +30,17 @@ function extractSymbols(text: string): string[] {
     .slice(0, 40);
 }
 
-function excerpt(lines: string[], count: number): string {
-  const filtered = lines.filter((line) => !/^\s*const noise\d+\s*=/.test(line));
-  return filtered.slice(0, count).join("\n");
-}
-
-function summarizeLargeFile(filePath: string, text: string): string {
-  const lines = text.split(/\r?\n/);
-  const symbols = extractSymbols(text);
-  const head = excerpt(lines, 30);
-  const tail = excerpt(lines.slice(-80), 20);
+function filterOutput(text: string, command: ParsedCommand, readConfig: ReadOptions): string {
+  const { level, files } = readConfig;
+  const fileArg = files[0] ?? command.displayCommand;
+  const lineCount = text.split(/\r?\n/).length;
+  const shouldSummarize = text.length > 12000 || lineCount > 200;
+
+  if (command.program === "read" && shouldSummarize && level === "aggressive") {
+    return summarizeAggressively(fileArg, text);
+  }
 
-  return [
-    `File: ${filePath}`,
-    `Lines: ${lines.length}`,
-    symbols.length > 0 ? "\nSymbols:\n" + symbols.map((line) => `- ${line.trim()}`).join("\n") : "",
-    "\nHead:",
-    head,
-    "\nTail:",
-    tail,
-  ]
-    .filter(Boolean)
-    .join("\n");
+  return text;
 }
 
 function summarizeAggressively(filePath: string, text: string): string {
@@ -67,35 +56,6 @@ function summarizeAggressively(filePath: string, text: string): string {
     .join("\n");
 }
 
-function compactMinimal(text: string): string {
-  const lines = text.split(/\r?\n/);
-  const output: string[] = [];
-  const noiseLine = /^\s*const noise\d+\s*=\s*\d+;\s*$/;
-
-  for (let index = 0; index < lines.length; index += 1) {
-    const line = lines[index] ?? "";
-    if (!noiseLine.test(line)) {
-      output.push(line);
-      continue;
-    }
-
-    const start = index;
-    while (index + 1 < lines.length && noiseLine.test(lines[index + 1] ?? "")) {
-      index += 1;
-    }
-
-    const hidden = index - start + 1;
-    if (hidden < 8) {
-      output.push(...lines.slice(start, index + 1));
-      continue;
-    }
-
-    output.push(`${line.match(/^\s*/)?.[0] ?? ""}... ${hidden} repetitive noise lines hidden ...`);
-  }
-
-  return output.join("\n");
-}
-
 function parseReadLevel(value: string | undefined): ReadLevel | undefined {
   if (value === "balance") return "balanced";
   if (value === "minimal" || value === "balanced" || value === "aggressive") return value;
@@ -198,7 +158,7 @@ async function readInternally(command: ParsedCommand, options: TgOptions): Promi
           continue;
         }
         const buffer = await readFile(absolute);
-        chunks.push(looksBinary(buffer) ? `Binary file not shown: ${fileArg}\n` : buffer.toString("utf8"));
+        chunks.push(looksBinary(buffer) ? `Binary file omitted: ${fileArg}\n` : buffer.toString("utf8"));
       } catch (error) {
         const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
         const message =
@@ -240,12 +200,8 @@ function applyLineWindow(text: string, options: ReadOptions): string {
     if (lines.length <= options.maxLines) {
       return lines.join("\n") + (text.endsWith("\n") ? "\n" : "");
     }
-    if (options.maxLines === 1) {
-      return `[${lines.length} more lines]\n`;
-    }
-    const visible = lines.slice(0, options.maxLines - 1);
-    visible.push(`[${lines.length - visible.length} more lines]`);
-    return visible.join("\n") + "\n";
+    const selected = lines.slice(0, options.maxLines);
+    return selected.join("\n") + (text.endsWith("\n") ? "\n" : "");
   }
 
   return text;
@@ -274,21 +230,12 @@ export const readLikeHandler: CommandHandler = {
   async filter(raw, command, options) {
     const text = `${raw.stdout}${raw.stderr}`;
     const readConfig = readOptions(command);
-    const { level, files } = readConfig;
-    const fileArg = files[0] ?? command.displayCommand;
-    const lineCount = text.split(/\r?\n/).length;
-    const shouldSummarize = text.length > 12000 || lineCount > 200;
-    const filtered = shouldSummarize
-      ? level === "minimal"
-        ? compactMinimal(text)
-        : level === "aggressive"
-          ? summarizeAggressively(fileArg, text)
-          : summarizeLargeFile(fileArg, text)
-      : text;
+    const filtered = filterOutput(text, command, readConfig);
     const windowed = applyLineWindow(filtered, readConfig);
     const output = readConfig.lineNumbers ? addLineNumbers(windowed) : windowed;
+    const lineCount = text.split(/\r?\n/).length;
     const resultOptions =
-      command.program === "read" && level === "minimal"
+      command.program === "read" && readConfig.level === "minimal"
         ? {
             ...options,
             maxLines: Math.max(options.maxLines, lineCount),
diff --git a/src/handlers/common/searchLike.ts b/src/handlers/common/searchLike.ts
index f48b8e1..47bfafa 100644
--- a/src/handlers/common/searchLike.ts
+++ b/src/handlers/common/searchLike.ts
@@ -3,98 +3,11 @@ import type { CommandHandler } from "../../types.js";
 import { makeFilteredResult } from "../base.js";
 
 const SEARCH_PROGRAMS = new Set(["rg", "grep"]);
-const DEFAULT_MAX_TOTAL = 80;
-const DEFAULT_MAX_PER_FILE = 5;
-
-type Match = {
-  file: string;
-  line?: number;
-  content: string;
-};
-
-function hasGrepFormatFlag(args: string[]): boolean {
-  return args.some((arg) => {
-    if (!arg.startsWith("-") || arg === "--") return false;
-    return /[clLo]/.test(arg.replace(/^-+/, ""));
-  });
-}
-
-function hasRgMachineReadableFlag(args: string[]): boolean {
-  return args.includes("--json");
-}
-
-function parseMatch(line: string): Match | undefined {
-  const nulIndex = line.indexOf("\0");
-  if (nulIndex >= 0) {
-    const file = line.slice(0, nulIndex);
-    const rest = line.slice(nulIndex + 1);
-    const match = rest.match(/^(\d+):(.*)$/);
-    if (!match) return undefined;
-    return { file, line: Number(match[1]), content: match[2] ?? "" };
-  }
-
-  const withLine = line.match(/^(.+?):(\d+):(.*)$/);
-  if (withLine) {
-    return { file: withLine[1] ?? "", line: Number(withLine[2]), content: withLine[3] ?? "" };
-  }
-
-  const withoutLine = line.match(/^(.+?):(.*)$/);
-  if (!withoutLine) return undefined;
-  return { file: withoutLine[1] ?? "", content: withoutLine[2] ?? "" };
-}
 
 function searchPattern(args: string[]): string {
   return args.find((arg) => !arg.startsWith("-")) ?? "";
 }
 
-function groupSearchOutput(rawOutput: string, pattern: string): string {
-  const parsed = rawOutput
-    .split(/\r?\n/)
-    .map(parseMatch)
-    .filter((match): match is Match => Boolean(match));
-
-  if (rawOutput.trim() && parsed.length === 0) {
-    return `${rawOutput.trimEnd()}\n`;
-  }
-
-  const byFile = new Map<string, Match[]>();
-  const seen = new Set<string>();
-
-  for (const match of parsed) {
-    const key = `${match.file}:${match.line ?? ""}:${match.content.trim()}`;
-    if (seen.has(key)) continue;
-    seen.add(key);
-    const matches = byFile.get(match.file) ?? [];
-    matches.push(match);
-    byFile.set(match.file, matches);
-  }
-
-  const total = parsed.length;
-  let shown = 0;
-  const lines = [
-    `Search: ${pattern}`,
-    `Matches: ${total} across ${byFile.size} files, showing up to ${DEFAULT_MAX_TOTAL}`,
-    "",
-  ];
-
-  for (const [file, matches] of [...byFile.entries()].sort()) {
-    if (shown >= DEFAULT_MAX_TOTAL) break;
-    const fileShown = Math.min(DEFAULT_MAX_PER_FILE, matches.length, DEFAULT_MAX_TOTAL - shown);
-    lines.push(`${file} (${matches.length} matches, showing ${fileShown})`);
-    for (const match of matches.slice(0, fileShown)) {
-      lines.push(match.line === undefined ? match.content.trim() : `${match.line}| ${match.content.trim()}`);
-      shown += 1;
-    }
-    lines.push("");
-  }
-
-  if (total > shown) {
-    lines.push("Hidden:", `- ${total - shown} matches not shown`);
-  }
-
-  return `${lines.join("\n").trimEnd()}\n`;
-}
-
 export const searchLikeHandler: CommandHandler = {
   name: "search-like",
 
@@ -107,12 +20,8 @@ export const searchLikeHandler: CommandHandler = {
   },
 
   async filter(raw, command, options) {
-    const output = raw.stdout.trim() && command.program === "rg" && hasRgMachineReadableFlag(command.args)
-      ? `${raw.stdout.trimEnd()}\n`
-      : raw.stdout.trim() && command.program === "grep" && hasGrepFormatFlag(command.args)
+    const output = raw.stdout.trim()
       ? `${raw.stdout.trimEnd()}\n`
-      : raw.stdout.trim()
-      ? groupSearchOutput(raw.stdout, searchPattern(command.args))
       : `${raw.stderr || `0 matches for ${searchPattern(command.args)}`}\n`;
     return makeFilteredResult(this.name, raw, output, options);
   },
diff --git a/src/handlers/generic.ts b/src/handlers/generic.ts
index 85dce4e..a0ae1a2 100644
--- a/src/handlers/generic.ts
+++ b/src/handlers/generic.ts
@@ -1,20 +1,7 @@
 import { executeCommand } from "../executor.js";
 import type { CommandHandler } from "../types.js";
-import { IMPORTANT_PATTERN } from "../core/patterns.js";
 import { makeFilteredResult, rawText } from "./base.js";
 
-function genericCompress(text: string): string {
-  if (text.length < 2000) return text;
-
-  const lines = text.split(/\r?\n/);
-  const head = lines.slice(0, 30);
-  const important = lines.filter((line) => IMPORTANT_PATTERN.test(line)).slice(0, 80);
-  const tail = lines.slice(-30);
-  return [...head, ...important, `... ${Math.max(0, lines.length - 60)} lines hidden ...`, ...tail].join(
-    "\n",
-  );
-}
-
 export const genericHandler: CommandHandler = {
   name: "generic",
 
@@ -27,6 +14,6 @@ export const genericHandler: CommandHandler = {
   },
 
   async filter(raw, _command, options) {
-    return makeFilteredResult(this.name, raw, genericCompress(rawText(raw)), options);
+    return makeFilteredResult(this.name, raw, rawText(raw), options);
   },
 };
diff --git a/src/handlers/git/branch.ts b/src/handlers/git/branch.ts
index cd9eb46..4c64601 100644
--- a/src/handlers/git/branch.ts
+++ b/src/handlers/git/branch.ts
@@ -7,21 +7,14 @@ function formatBranch(text: string): string {
     .split(/\r?\n/)
     .map((line) => ({ current: line.trimStart().startsWith("*"), name: line.replace(/^\s*\*?\s*/, "").trim() }))
     .filter((branch) => branch.name);
-  if (branches.length === 0) return "Current: unknown\nBranches: 0, showing 0\n";
+  if (branches.length === 0) return "Current: unknown\nBranches: 0\n";
   if (branches.length <= 2) return text.endsWith("\n") ? text : `${text}\n`;
 
   const current = branches.find((branch) => branch.current)?.name ?? "unknown";
-  const nearby = branches
-    .filter((branch) => branch.current || ["main", "master"].includes(branch.name) || branch.name.startsWith("codex/") || branch.name.startsWith("release/"))
-    .slice(0, 20);
-
-  const lines = [`Current: ${current}`, `Branches: ${branches.length}, showing ${nearby.length}`, ""];
-  for (const branch of nearby) {
+  const lines = [`Current: ${current}`, `Branches: ${branches.length}`, ""];
+  for (const branch of branches) {
     lines.push(`${branch.current ? "*" : "-"} ${branch.name}`);
   }
-  if (branches.length > nearby.length) {
-    lines.push("", "Hidden:", `- ${branches.length - nearby.length} branches not shown`);
-  }
   return `${lines.join("\n")}\n`;
 }
 
diff --git a/src/handlers/git/diff.ts b/src/handlers/git/diff.ts
index a40f0e1..ce63ccb 100644
--- a/src/handlers/git/diff.ts
+++ b/src/handlers/git/diff.ts
@@ -1,72 +1,39 @@
 import { executeCommand } from "../../executor.js";
-import type { CommandHandler } from "../../types.js";
+import type { CommandHandler, ParsedCommand } from "../../types.js";
 import { makeFilteredResult } from "../base.js";
+import { compactUnifiedDiff } from "./compactDiff.js";
 
-type FileSummary = {
-  file: string;
-  added: number;
-  removed: number;
-  hunks: string[];
-  changedLines: string[];
-};
-
-function isStatOutput(text: string): boolean {
-  return /\|\s+\d+/.test(text) && /\d+\s+files? changed/.test(text);
+function wantsStatOnly(command: ParsedCommand): boolean {
+  return command.args.some((arg) => arg === "--stat" || arg === "--numstat" || arg === "--shortstat");
 }
 
 function formatDiff(text: string): string {
-  if (isStatOutput(text)) {
-    return `${text.trimEnd()}\n`;
-  }
-
-  const files: FileSummary[] = [];
-  let current: FileSummary | undefined;
-
-  for (const line of text.split(/\r?\n/)) {
-    if (line.startsWith("diff --git ")) {
-      const match = line.match(/ b\/(.+)$/);
-      current = { file: match?.[1] ?? line.replace("diff --git ", ""), added: 0, removed: 0, hunks: [], changedLines: [] };
-      files.push(current);
-      continue;
-    }
-    if (!current) continue;
-    if (line.startsWith("@@")) {
-      if (current.hunks.length < 8) current.hunks.push(line);
-      continue;
-    }
-    if (line.startsWith("+") && !line.startsWith("+++")) {
-      current.added += 1;
-      if (current.changedLines.length < 10) current.changedLines.push(line);
-    }
-    if (line.startsWith("-") && !line.startsWith("---")) {
-      current.removed += 1;
-      if (current.changedLines.length < 10) current.changedLines.push(line);
-    }
-  }
-
-  const totalAdded = files.reduce((sum, file) => sum + file.added, 0);
-  const totalRemoved = files.reduce((sum, file) => sum + file.removed, 0);
-  const lines = ["Git Diff Summary", `Files changed: ${files.length}, +${totalAdded} -${totalRemoved}`, ""];
-
-  for (const file of files) {
-    lines.push(`${file.file} (+${file.added} -${file.removed})`);
-    for (const hunk of file.hunks) {
-      lines.push(`- hunk: ${hunk}`);
-    }
-    for (const changedLine of file.changedLines) {
-      lines.push(changedLine);
-    }
-    const hidden = file.added + file.removed - file.changedLines.length;
-    if (hidden > 0) lines.push(`... +${hidden} more changed lines`);
-    lines.push("");
+  const trimmed = text.trim();
+  if (!trimmed) return "";
+  if (/^diff --git /m.test(text)) {
+    return `${compactUnifiedDiff(text).trimEnd()}\n`;
   }
+  return `${trimmed}\n`;
+}
 
-  if (text.length > lines.join("\n").length) {
-    lines.push("Large diff hidden.");
-    lines.push("Use tg --raw git diff if full patch is required.");
+async function formatGitDiff(rawText: string, command: ParsedCommand): Promise<string> {
+  if (wantsStatOnly(command)) {
+    return formatDiff(rawText);
   }
 
-  return `${lines.join("\n").trimEnd()}\n`;
+  const statCommand: ParsedCommand = {
+    ...command,
+    args: ["diff", "--stat", ...command.args.slice(1)],
+    original: ["git", "diff", "--stat", ...command.args.slice(1)],
+    displayCommand: `git diff --stat ${command.args.slice(1).join(" ")}`.trim(),
+  };
+  const stat = await executeCommand(statCommand);
+  const statText = `${stat.stdout}${stat.stderr}`.trim();
+  const compacted = formatDiff(rawText).trimEnd();
+
+  if (!statText) return compacted ? `${compacted}\n` : "";
+  if (!compacted) return `${statText}\n`;
+  return `${statText}\n\n--- Changes ---\n${compacted}\n`;
 }
 
 export const gitDiffHandler: CommandHandler = {
@@ -80,7 +47,7 @@ export const gitDiffHandler: CommandHandler = {
     return executeCommand(command);
   },
 
-  async filter(raw, _command, options) {
-    return makeFilteredResult(this.name, raw, formatDiff(raw.stdout || raw.stderr), options);
+  async filter(raw, command, options) {
+    return makeFilteredResult(this.name, raw, await formatGitDiff(raw.stdout || raw.stderr, command), options);
   },
 };
diff --git a/src/handlers/git/log.ts b/src/handlers/git/log.ts
index 2a65b2a..d517a19 100644
--- a/src/handlers/git/log.ts
+++ b/src/handlers/git/log.ts
@@ -48,22 +48,17 @@ function formatLog(text: string): string {
   }
 
   if (commits.length === 0) {
-    const lines = rawLines.slice(0, 20);
-    return lines.length <= 5 ? `${lines.join("\n")}\n` : `Git Log\nCommits: ${lines.length}\n${lines.join("\n")}\n`;
+    return text.endsWith("\n") ? text : `${text}\n`;
   }
 
   if (commits.length <= 1) return text.endsWith("\n") ? text : `${text}\n`;
 
-  const shown = commits.slice(0, 20);
-  const lines = [`Git Log: ${commits.length} commits, showing ${shown.length}`, ""];
-  for (const commit of shown) {
+  const lines = [`Git Log: ${commits.length} commits`, ""];
+  for (const commit of commits) {
     const meta = [commit.author, commit.date].filter(Boolean).join(" | ");
     lines.push(`${shortHash(commit.hash)} ${commit.subject ?? "(no subject)"}`);
     if (meta) lines.push(`  ${meta}`);
   }
-  if (commits.length > shown.length) {
-    lines.push("", `Hidden: ${commits.length - shown.length} commits not shown`);
-  }
   return `${lines.join("\n")}\n`;
 }
 
diff --git a/src/handlers/git/show.ts b/src/handlers/git/show.ts
index e4020af..c8a520d 100644
--- a/src/handlers/git/show.ts
+++ b/src/handlers/git/show.ts
@@ -1,56 +1,61 @@
 import { executeCommand } from "../../executor.js";
-import type { CommandHandler } from "../../types.js";
+import type { CommandHandler, ParsedCommand } from "../../types.js";
 import { makeFilteredResult } from "../base.js";
+import { compactUnifiedDiff, extractDiffStatLines } from "./compactDiff.js";
 
-type FileSummary = {
-  file: string;
-  added: number;
-  removed: number;
-  hunks: string[];
-};
+function wantsStatOnly(command: ParsedCommand, text: string): boolean {
+  if (command.args.includes("--stat") || command.args.includes("--name-only") || command.args.includes("--name-status")) {
+    return true;
+  }
+  return extractDiffStatLines(text).length > 0 && !text.includes("diff --git");
+}
+
+function formatShow(text: string, command: ParsedCommand): string {
+  const trimmed = text.trim();
+  if (!trimmed) return trimmed;
+
+  if (wantsStatOnly(command, text)) {
+    return `${trimmed}\n`;
+  }
 
-function formatShow(text: string): string {
   const lines = text.split(/\r?\n/);
   const commit = lines.find((line) => line.startsWith("commit "))?.replace("commit ", "").trim();
   const author = lines.find((line) => line.startsWith("Author:"))?.replace("Author:", "").trim();
   const date = lines.find((line) => line.startsWith("Date:"))?.replace("Date:", "").trim();
-  const subject = lines.find((line) => line.startsWith("    ") && line.trim())?.trim();
 
-  const files: FileSummary[] = [];
-  let current: FileSummary | undefined;
+  const subjectLines: string[] = [];
+  let inSubject = false;
   for (const line of lines) {
-    if (line.startsWith("diff --git ")) {
-      const match = line.match(/ b\/(.+)$/);
-      current = { file: match?.[1] ?? line.replace("diff --git ", ""), added: 0, removed: 0, hunks: [] };
-      files.push(current);
+    if (line.startsWith("    ") && line.trim()) {
+      inSubject = true;
+      subjectLines.push(line.trim());
       continue;
     }
-    if (!current) continue;
-    if (line.startsWith("@@")) {
-      if (current.hunks.length < 6) current.hunks.push(line);
-      continue;
-    }
-    if (line.startsWith("+") && !line.startsWith("+++")) current.added += 1;
-    if (line.startsWith("-") && !line.startsWith("---")) current.removed += 1;
+    if (inSubject && line.trim() === "") break;
+    if (inSubject && !line.startsWith("    ")) break;
   }
 
-  const out = ["Git Show"];
-  if (commit) out.push(`Commit: ${commit}`);
+  const statLines = extractDiffStatLines(text);
+  const diffStart = lines.findIndex((line) => line.startsWith("diff --git"));
+  const diffText = diffStart >= 0 ? lines.slice(diffStart).join("\n") : "";
+
+  const out: string[] = [];
+  if (commit) out.push(`commit ${commit}`);
   if (author) out.push(`Author: ${author}`);
-  if (date) out.push(`Date: ${date}`);
-  if (subject) out.push(`Subject: ${subject}`);
-  out.push("", `Files changed: ${files.length}`);
-  for (const file of files) {
-    out.push(`${file.file} (+${file.added} -${file.removed})`);
-    for (const hunk of file.hunks) {
-      out.push(`- hunk: ${hunk}`);
-    }
+  if (date) out.push(`Date:   ${date}`);
+  if (subjectLines.length > 0) {
+    out.push("");
+    out.push(...subjectLines);
+  }
+  if (statLines.length > 0) {
+    out.push("");
+    out.push(...statLines);
   }
-  if (text.length > out.join("\n").length) {
-    out.push("", "Large patch hidden.");
-    out.push("Use tg --raw git show if full patch is required.");
+  if (diffText.trim()) {
+    out.push("", "--- Changes ---", compactUnifiedDiff(diffText));
   }
-  return `${out.join("\n")}\n`;
+
+  return out.length > 0 ? `${out.join("\n").trimEnd()}\n` : `${trimmed}\n`;
 }
 
 export const gitShowHandler: CommandHandler = {
@@ -64,7 +69,7 @@ export const gitShowHandler: CommandHandler = {
     return executeCommand(command);
   },
 
-  async filter(raw, _command, options) {
-    return makeFilteredResult(this.name, raw, formatShow(raw.stdout || raw.stderr), options);
+  async filter(raw, command, options) {
+    return makeFilteredResult(this.name, raw, formatShow(raw.stdout || raw.stderr, command), options);
   },
 };
diff --git a/src/handlers/git/status.ts b/src/handlers/git/status.ts
index a0fb2be..495f7c7 100644
--- a/src/handlers/git/status.ts
+++ b/src/handlers/git/status.ts
@@ -84,7 +84,9 @@ function formatStatus(text: string): string {
       !trimmed ||
       trimmed.startsWith("(") ||
       trimmed.startsWith("use ") ||
-      trimmed.startsWith("no changes added")
+      trimmed.startsWith("no changes added") ||
+      trimmed.startsWith("nothing added to commit") ||
+      trimmed.startsWith("nothing to commit")
     ) {
       continue;
     }
diff --git a/src/handlers/java/gradle.ts b/src/handlers/java/gradle.ts
index 420b5be..273dcfd 100644
--- a/src/handlers/java/gradle.ts
+++ b/src/handlers/java/gradle.ts
@@ -10,7 +10,7 @@ function formatGradle(text: string): string {
         line,
       ),
     )
-    .filter((line) => !/compileNoise|Run with --stacktrace|Get more help|INSTRUMENTATION_STATUS|Starting \d+ tests| PASSED|org\.junit\.Assert/.test(line))
+    .filter((line) => !/Run with --stacktrace|Get more help|INSTRUMENTATION_STATUS|Starting \d+ tests| PASSED|org\.junit\.Assert/.test(line))
     .slice(0, 80)
     .map((line) => line.trim());
 
diff --git a/src/handlers/java/javac.ts b/src/handlers/java/javac.ts
index 01ad515..f6a3c0d 100644
--- a/src/handlers/java/javac.ts
+++ b/src/handlers/java/javac.ts
@@ -31,17 +31,12 @@ function formatJavac(text: string): string {
       details,
     });
   }
-  const sorted = issues.sort((a, b) => {
-    const aNoise = /Noise\d+/.test(a.file) ? 1 : 0;
-    const bNoise = /Noise\d+/.test(b.file) ? 1 : 0;
-    return aNoise - bNoise || a.file.localeCompare(b.file);
-  });
+  const sorted = issues.sort((a, b) => a.file.localeCompare(b.file));
   const out = [`Javac: ${issues.length} errors`];
-  for (const issue of sorted.slice(0, 20)) {
+  for (const issue of sorted) {
     out.push(`${issue.file}:${issue.line}: ${issue.message}`);
     for (const detail of issue.details) out.push(`  ${detail}`);
   }
-  if (issues.length > 20) out.push(`Hidden: ${issues.length - 20} errors not shown`);
   return `${out.join("\n")}\n`;
 }
 
diff --git a/src/handlers/js/eslint.ts b/src/handlers/js/eslint.ts
index 61e9d2d..c67212f 100644
--- a/src/handlers/js/eslint.ts
+++ b/src/handlers/js/eslint.ts
@@ -69,16 +69,11 @@ function formatEslint(text: string): string {
   }
   const out = [`ESLint: ${issues.length} problems in ${new Set(issues.map((issue) => issue.file)).size} files`];
   for (const [rule, ruleIssues] of [...byRule.entries()].sort()) {
-    const sortedIssues = [...ruleIssues].sort((a, b) => {
-      const aNoise = /noise|node_modules|dist|build/.test(a.file) ? 1 : 0;
-      const bNoise = /noise|node_modules|dist|build/.test(b.file) ? 1 : 0;
-      return aNoise - bNoise || a.file.localeCompare(b.file);
-    });
+    const sortedIssues = [...ruleIssues].sort((a, b) => a.file.localeCompare(b.file));
     out.push("", `${rule}: ${ruleIssues.length}`);
-    for (const issue of sortedIssues.slice(0, 5)) {
+    for (const issue of sortedIssues) {
       out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.severity} ${issue.message}`);
     }
-    if (ruleIssues.length > 5) out.push(`- ... ${ruleIssues.length - 5} more`);
   }
   return `${out.join("\n")}\n`;
 }
diff --git a/src/handlers/js/packageList.ts b/src/handlers/js/packageList.ts
index b7cea27..f66a8d3 100644
--- a/src/handlers/js/packageList.ts
+++ b/src/handlers/js/packageList.ts
@@ -1,33 +1,114 @@
 import { executeCommand } from "../../executor.js";
-import type { CommandHandler, ParsedCommand } from "../../types.js";
+import { readFileSync } from "node:fs";
+import path from "node:path";
+
+import type { CommandHandler, ParsedCommand, TgOptions } from "../../types.js";
 import { makeFilteredResult } from "../base.js";
 
 function matchesPackageList(command: ParsedCommand): boolean {
   return ["npm", "pnpm", "yarn"].includes(command.program) && command.args.includes("list");
 }
 
-function formatPackageList(text: string): string {
+function isCompactPackageList(text: string): boolean {
   const trimmed = text.trim();
-  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
-    try {
-      const payload = JSON.parse(trimmed);
-      const root = Array.isArray(payload) ? payload[0] ?? {} : payload;
-      const depsObj = { ...(root.dependencies ?? {}), ...(root.devDependencies ?? {}) };
-      const deps = Object.entries(depsObj).map(([name, value]: [string, any]) => `${name}@${value.version ?? value}`);
-      return `Dependencies: ${deps.length}\n\nImportant dependencies:\n${deps.map((dep) => `- ${dep}`).join("\n")}\n`;
-    } catch {
-      // Fall through to text parser.
+  return /^\d+ packages \(/.test(trimmed) || /^\[prod\]/m.test(trimmed) || /^\[dev\]/m.test(trimmed);
+}
+
+type PackageManifest = {
+  dependencies?: Record<string, string>;
+  devDependencies?: Record<string, string>;
+};
+
+function readPackageManifest(cwd: string): PackageManifest {
+  try {
+    return JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as PackageManifest;
+  } catch {
+    return {};
+  }
+}
+
+function parseTreeList(text: string, manifest: PackageManifest): string | undefined {
+  const lines = text.split(/\r?\n/).filter((line) => line.trim());
+  if (lines.length === 0) return undefined;
+
+  const rootMatch = lines.find((line) => /^@?[\w./-]+@[\w.-]+\s+/.test(line))?.match(/^(@?[\w./-]+)@([\w.-]+)/);
+  if (!rootMatch) return undefined;
+
+  const prod: string[] = [];
+  const dev: string[] = [];
+  let section: "prod" | "dev" = "prod";
+
+  for (const line of lines) {
+    if (/devDependencies:/.test(line)) {
+      section = "dev";
+      continue;
     }
+    if (/dependencies:/.test(line)) {
+      section = "prod";
+      continue;
+    }
+    if (/invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i.test(line)) {
+      continue;
+    }
+    const depMatch = line.match(/([@\w./-]+)@([\w.-]+)/);
+    if (!depMatch) continue;
+    if (depMatch[1] === rootMatch[1] && depMatch[2] === rootMatch[2]) continue;
+    const name = depMatch[1] ?? "";
+    const version = depMatch[2] ?? "";
+    const entry = `${name} ${version}`;
+    if (section === "prod") prod.push(entry);
+    else dev.push(entry);
+  }
+
+  if (prod.length === 0 && dev.length === 0) return undefined;
+
+  const out = ["Node.js (package.json):", `  ${rootMatch[1]} @ ${rootMatch[2]}`];
+  if (prod.length > 0) {
+    out.push(
+      `  Dependencies (${prod.length}):`,
+      ...prod.map((entry) => {
+        const [name, version] = entry.split(" ");
+        const spec = (name && manifest.dependencies?.[name]) || version || "*";
+        return `    ${name} (${spec})`;
+      }),
+    );
+  }
+  if (dev.length > 0) {
+    out.push(`  Dev Dependencies (${dev.length}):`, ...dev.map((entry) => `    ${entry.split(" ")[0]}`));
+  }
+  return `${out.join("\n")}\n`;
+}
+
+function formatProblems(lines: string[]): string[] {
+  return lines
+    .filter((line) => /invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i.test(line))
+    .map((line) => line.trim());
+}
+
+function formatPackageList(text: string, options: TgOptions): string {
+  const trimmed = text.trim();
+  if (!trimmed) return "\n";
+  if (isCompactPackageList(trimmed)) {
+    return `${trimmed}\n`;
+  }
+
+  const treeFormatted = parseTreeList(trimmed, readPackageManifest(options.cwd));
+  if (treeFormatted) {
+    const problems = formatProblems(text.split(/\r?\n/));
+    if (problems.length === 0) return treeFormatted;
+    return `${treeFormatted.trimEnd()}\n\nProblems:\n${problems.map((line) => `- ${line}`).join("\n")}\n`;
   }
 
   const lines = text.split(/\r?\n/).filter((line) => line.trim());
-  const deps = lines.filter((line) => /[@\w.-]+@\d|\bCurrent\b.*\bLatest\b|^\S+\s+\d+\.\d+\.\d+\s+\d+\.\d+\.\d+/.test(line));
-  const problems = lines.filter((line) => /invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i.test(line));
-  const out = [`Dependencies: ${deps.length}`];
-  const direct = deps.filter((line) => !/package-\d+@/.test(line)).slice(0, 30);
-  if (direct.length > 0) out.push("", "Important dependencies:", ...direct.map((line) => `- ${line.trim()}`));
-  if (problems.length > 0) out.push("", "Problems:", ...problems.slice(0, 30).map((line) => `- ${line.trim()}`));
-  if (deps.length > direct.length) out.push("", `Hidden: ${deps.length - direct.length} dependencies not shown`);
+  const deps = lines.filter((line) => /[@\w./-]+@[\w.-]+/.test(line));
+  const problems = formatProblems(lines);
+  const out: string[] = [`${deps.length} packages`];
+  for (const dep of deps) {
+    out.push(dep.trim());
+  }
+  if (problems.length > 0) {
+    out.push("", "Problems:", ...problems.map((line) => `- ${line}`));
+  }
   return `${out.join("\n")}\n`;
 }
 
@@ -41,6 +122,6 @@ export const packageListHandler: CommandHandler = {
   },
 
   async filter(raw, _command, options) {
-    return makeFilteredResult(this.name, raw, formatPackageList(`${raw.stdout}\n${raw.stderr}`), options);
+    return makeFilteredResult(this.name, raw, formatPackageList(`${raw.stdout}\n${raw.stderr}`, options), options);
   },
 };
diff --git a/src/handlers/js/test.ts b/src/handlers/js/test.ts
index b5cae58..57b445f 100644
--- a/src/handlers/js/test.ts
+++ b/src/handlers/js/test.ts
@@ -19,6 +19,9 @@ function formatJsTest(text: string, exitCode: number): string {
   if (trimmed.startsWith("{")) {
     try {
       const payload = JSON.parse(trimmed);
+      if ((payload.numFailedTests ?? 0) === 0) {
+        return `PASS (${payload.numPassedTests ?? payload.numTotalTests ?? 0}) FAIL (0)\n`;
+      }
       const out = [exitCode === 0 ? "JS tests passed" : "JS tests failed"];
       out.push(`Summary: ${payload.numFailedTests ?? 0} failed, ${payload.numPassedTests ?? 0} passed`);
       for (const file of payload.testResults ?? []) {
@@ -36,10 +39,17 @@ function formatJsTest(text: string, exitCode: number): string {
   }
 
   const lines = text.split(/\r?\n/);
+  const testsLine = lines.find((line) => /\bTests\s+/.test(line));
+  const passedMatch = testsLine?.match(/(\d+)\s+passed/);
+  const failedMatch = testsLine?.match(/(\d+)\s+failed/);
+  const passed = passedMatch ? Number.parseInt(passedMatch[1] ?? "0", 10) : 0;
+  const failed = failedMatch ? Number.parseInt(failedMatch[1] ?? "0", 10) : 0;
+  if (exitCode === 0 && passed > 0 && failed === 0) {
+    return `PASS (${passed}) FAIL (0)\n`;
+  }
   const summary = lines.filter((line) => /Test Files|Tests\s+|failed|passed/.test(line)).slice(-6);
   const failures = lines
     .filter((line) => /FAIL|AssertionError|expected|\.test\.[tj]sx?:\d+|❯/.test(line))
-    .filter((line) => !/noise-\d+/.test(line))
     .slice(0, 50);
   const out = [exitCode === 0 ? "JS tests passed" : "JS tests failed"];
   if (summary.length > 0) out.push("Summary:", ...summary.map((line) => `- ${line.trim()}`));
diff --git a/src/handlers/js/tsc.ts b/src/handlers/js/tsc.ts
index f32b7f4..0c52738 100644
--- a/src/handlers/js/tsc.ts
+++ b/src/handlers/js/tsc.ts
@@ -44,21 +44,19 @@ function formatTsc(text: string): string {
     list.push(issue);
     byCode.set(issue.code, list);
   }
+  if (issues.length === 0) {
+    const trimmed = text.trim();
+    return trimmed ? `${trimmed}\n` : "";
+  }
   const out = [`TypeScript: ${issues.length} errors in ${new Set(issues.map((issue) => issue.file)).size} files`];
   out.push("By code:", ...[...byCode.entries()].sort().map(([code, list]) => `- ${code}: ${list.length}`));
   for (const [code, codeIssues] of [...byCode.entries()].sort()) {
-    const sortedIssues = [...codeIssues].sort((a, b) => {
-      const aNoise = /noise|node_modules|dist|build/.test(a.file) ? 1 : 0;
-      const bNoise = /noise|node_modules|dist|build/.test(b.file) ? 1 : 0;
-      return aNoise - bNoise || a.file.localeCompare(b.file);
-    });
+    const sortedIssues = [...codeIssues].sort((a, b) => a.file.localeCompare(b.file));
     out.push("", code);
-    const shownIssues = sortedIssues.length > 100 ? sortedIssues.slice(0, 20) : sortedIssues;
-    for (const issue of shownIssues) {
+    for (const issue of sortedIssues) {
       out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.message}`);
       for (const note of issue.notes) out.push(`  ${note}`);
     }
-    if (sortedIssues.length > shownIssues.length) out.push(`- ... ${sortedIssues.length - shownIssues.length} more`);
   }
   return `${out.join("\n")}\n`;
 }
diff --git a/src/handlers/python/mypy.ts b/src/handlers/python/mypy.ts
index 3de922e..792ee56 100644
--- a/src/handlers/python/mypy.ts
+++ b/src/handlers/python/mypy.ts
@@ -44,17 +44,11 @@ function formatMypy(text: string): string {
   const out = [`Mypy: ${issues.length} errors in ${new Set(issues.map((issue) => issue.file)).size} files`];
   for (const [code, codeIssues] of [...byCode.entries()].sort()) {
     out.push("", `${code}: ${codeIssues.length}`);
-    const sortedIssues = [...codeIssues].sort((a, b) => {
-      const aNoise = /noise/.test(a.file) ? 1 : 0;
-      const bNoise = /noise/.test(b.file) ? 1 : 0;
-      return aNoise - bNoise || a.file.localeCompare(b.file);
-    });
-    const shownIssues = sortedIssues.length > 100 ? sortedIssues.slice(0, 20) : sortedIssues;
-    for (const issue of shownIssues) {
+    const sortedIssues = [...codeIssues].sort((a, b) => a.file.localeCompare(b.file));
+    for (const issue of sortedIssues) {
       out.push(`- ${issue.file}:${issue.line} ${issue.message}`);
       for (const note of issue.notes) out.push(`  note: ${note}`);
     }
-    if (sortedIssues.length > shownIssues.length) out.push(`- ... ${sortedIssues.length - shownIssues.length} more`);
   }
   return `${out.join("\n")}\n`;
 }
diff --git a/src/handlers/python/pip.ts b/src/handlers/python/pip.ts
index 2c2ba30..e5e42da 100644
--- a/src/handlers/python/pip.ts
+++ b/src/handlers/python/pip.ts
@@ -13,29 +13,9 @@ function matchesPip(command: ParsedCommand): boolean {
 }
 
 function formatPip(text: string, command: ParsedCommand): string {
-  const lines = text.split(/\r?\n/).filter((line) => line.trim());
-  if (command.args.includes("--outdated") && lines.length === 0) return "No outdated packages\n";
-
-  const packages = lines.filter((line) => {
-    if (/^Package\s+Version/i.test(line) || /^-+$/.test(line.replace(/\s+/g, ""))) return false;
-    return /^[A-Za-z0-9_.-]+(?:==|\s+)\S+/.test(line);
-  });
-  const problems = lines.filter((line) => /invalid|unmet|peer|conflict|missing|WARNING|ERROR|audit|security/i.test(line));
-  const shownPackages = packages.slice(0, 30);
-
-  const out = [`Packages: ${packages.length}`];
-  if (shownPackages.length > 0) {
-    out.push("", "Direct sample:");
-    for (const line of shownPackages) out.push(`- ${line.trim()}`);
-  }
-  if (problems.length > 0) {
-    out.push("", "Problems:");
-    for (const line of problems.slice(0, 20)) out.push(`- ${line.trim()}`);
-  }
-  if (packages.length > shownPackages.length) {
-    out.push("", `Hidden: ${packages.length - shownPackages.length} packages not shown`);
-  }
-  return `${out.join("\n")}\n`;
+  const trimmed = text.trim();
+  if (command.args.includes("--outdated") && trimmed.length === 0) return "No outdated packages\n";
+  return trimmed ? `${trimmed}\n` : "\n";
 }
 
 export const pipHandler: CommandHandler = {
diff --git a/src/handlers/python/ruff.ts b/src/handlers/python/ruff.ts
index 973ee9e..85e12c3 100644
--- a/src/handlers/python/ruff.ts
+++ b/src/handlers/python/ruff.ts
@@ -47,16 +47,11 @@ function formatRuff(text: string, command: ParsedCommand): string {
   const out = [`Ruff: ${issues.length} issues in ${new Set(issues.map((issue) => issue.file)).size} files`];
   if (fixable) out.push(fixable.trim());
   for (const [rule, ruleIssues] of [...byRule.entries()].sort()) {
-    const sortedIssues = [...ruleIssues].sort((a, b) => {
-      const aNoise = /noise|node_modules|dist|build/.test(a.file) ? 1 : 0;
-      const bNoise = /noise|node_modules|dist|build/.test(b.file) ? 1 : 0;
-      return aNoise - bNoise || a.file.localeCompare(b.file);
-    });
+    const sortedIssues = [...ruleIssues].sort((a, b) => a.file.localeCompare(b.file));
     out.push("", `${rule}: ${ruleIssues.length}`);
-    for (const issue of sortedIssues.slice(0, 5)) {
+    for (const issue of sortedIssues) {
       out.push(`- ${issue.file}:${issue.line}:${issue.column} ${issue.message}`);
     }
-    if (ruleIssues.length > 5) out.push(`- ... ${ruleIssues.length - 5} more; use full output for all violations`);
   }
   return `${out.join("\n")}\n`;
 }
diff --git a/tests/fixtures/common/diff_lcs_insert.txt b/tests/fixtures/common/diff_lcs_insert.txt
index c54c022..965e98d 100644
--- a/tests/fixtures/common/diff_lcs_insert.txt
+++ b/tests/fixtures/common/diff_lcs_insert.txt
@@ -1,5 +1,3 @@
-Files: old.ts -> new.ts
-Modified: old.ts @ 2026-06-03T00:00:00Z -> new.ts @ 2026-06-03T00:00:01Z
-Summary: +1 -0
+old.ts -> new.ts (+1 -0)
 
-+    -:   2 |   const timeoutMs = 5000;
++   const timeoutMs = 5000;
diff --git a/tests/helpers/assertions.ts b/tests/helpers/assertions.ts
index 78cc013..e945601 100644
--- a/tests/helpers/assertions.ts
+++ b/tests/helpers/assertions.ts
@@ -3,7 +3,7 @@ import { expect } from "vitest";
 import type { FilteredResult } from "../../src/types.js";
 
 const STRUCTURAL_HEADER =
-  /^(Search:|Matches:|Git Log|Git Diff|Current:|Branches:|Skipped:|Hidden:|\.|\.\.\. \+\d+ more changed lines|Large diff hidden\.|Large patch hidden\.)$/;
+  /^(Git Log|Git Diff|Current:|Branches:|\.|\.\.\. \+\d+ more changed lines|Large diff hidden\.|Large patch hidden\.)$/;
 
 export function stripStructuralHeaders(output: string): string {
   return output
diff --git a/tests/helpers/fixtureCases.ts b/tests/helpers/fixtureCases.ts
index 1cff0c7..cf3cb64 100644
--- a/tests/helpers/fixtureCases.ts
+++ b/tests/helpers/fixtureCases.ts
@@ -66,7 +66,14 @@ export const fixtureCases: FixtureCase[] = [
     name: "list-like keeps useful paths from real project listing",
     fixture: "tests/fixtures/common/ls_large_project.txt",
     command: ["find", "."],
-    critical: ["src/", "tests/", "README.md", "package.json"],
+    critical: ["5F 3D:", "./ README.md package.json", "src/ cli.ts parse.ts", "tests/unit/ parse.test.ts"],
+  },
+  {
+    name: "find groups matches by directory like RTK",
+    fixture: "tests/fixtures/common/find_src_ts.txt",
+    command: ["find", "src", "-name", "*.ts"],
+    critical: ["4F 2D:", "./ cli.ts parse.ts", "core/ history.ts report.ts"],
+    forbidden: [/src\/core\/history\.ts\nsrc\/core\/report\.ts/],
   },
   {
     name: "find small output keeps root files without excessive growth",
@@ -80,13 +87,13 @@ export const fixtureCases: FixtureCase[] = [
     name: "tree keeps useful paths from real project listing",
     fixture: "tests/fixtures/common/ls_large_project.txt",
     command: ["tree", "."],
-    critical: ["./src/cli.ts", "./tests/unit/parse.test.ts", "./README.md", "./package.json"],
+    critical: ["src/cli.ts", "tests/unit/parse.test.ts", "README.md", "package.json"],
   },
   {
     name: "ls keeps useful paths and explicit skip hints from real project listing",
     fixture: "tests/fixtures/common/ls_large_project.txt",
     command: ["ls", "-la"],
-    critical: ["README.md", "package.json", "src/ cli.ts", "Skipped:", "node_modules/"],
+    critical: ["README.md", "package.json", "src/cli.ts"],
   },
   {
     name: "read-like keeps source symbols from large TypeScript fixture",
@@ -154,10 +161,8 @@ export const fixtureCases: FixtureCase[] = [
     fixture: "tests/fixtures/common/diff_lcs_insert.txt",
     command: ["diff", "old.ts", "new.ts"],
     critical: [
-      "Files: old.ts -> new.ts",
-      "Modified: old.ts @",
-      "Summary: +1 -0",
-      "+    -:   2 |   const timeoutMs = 5000;",
+      "old.ts -> new.ts (+1 -0)",
+      "+   const timeoutMs = 5000;",
     ],
     forbidden: [/-  const unchanged/, /\+  const unchanged/],
   },
@@ -174,11 +179,11 @@ export const fixtureCases: FixtureCase[] = [
     forbidden: [/^diff --git/m, /^@@/m],
   },
   {
-    name: "diff stdin reports true overflow count for large unified diff",
+    name: "diff stdin keeps all unified diff changes",
     fixture: "tests/fixtures/common/diff_unified_large.txt",
     command: ["diff", "-"],
-    critical: ["[file] config.yaml (+6 -6)", "  -old_value_0", "  +new_value_3", "  ... +2 more"],
-    forbidden: [/new_value_4/, /new_value_5/, /\+5 more/],
+    critical: ["[file] config.yaml (+6 -6)", "  -old_value_0", "  +new_value_3", "  +new_value_5"],
+    forbidden: [/\+5 more/, /Hidden:/],
   },
   {
     name: "git-log keeps commit subject from real log",
@@ -202,12 +207,12 @@ export const fixtureCases: FixtureCase[] = [
     fixture: "tests/fixtures/git/show_large.txt",
     command: ["git", "show"],
     critical: [
-      "Commit: abc123def4567890",
-      "Subject: retained commit subject",
-      "src/order/submit.ts (+1 -1)",
-      "Large patch hidden.",
-      "Use tg --raw git show if full patch is required.",
+      "commit abc123def4567890",
+      "retained commit subject",
+      "src/order/submit.ts",
+      "-  return api.submit(payload)",
     ],
+    forbidden: [/Files changed: 0/, /Large patch hidden/],
   },
   {
     name: "git-branch keeps current and nearby branch names",
@@ -350,7 +355,7 @@ export const fixtureCases: FixtureCase[] = [
     fixture: "tests/fixtures/js/tsc_many.txt",
     command: ["tsc", "--noEmit"],
     exitCode: 2,
-    critical: ["src/order/submit.ts(42,7)", "TS2322", "TS2339"],
+    critical: ["src/order/submit.ts(42,7): error TS2322", "TS2339"],
   },
   {
     name: "js-test keeps failed test and assertion from Vitest fixture",
@@ -359,6 +364,13 @@ export const fixtureCases: FixtureCase[] = [
     exitCode: 1,
     critical: ["prevents duplicate submit", "AssertionError", "src/order/submit.test.ts:42:15"],
   },
+  {
+    name: "js-test formats passing Vitest output like RTK",
+    fixture: "tests/fixtures/js/vitest_passed.txt",
+    command: ["vitest", "run"],
+    critical: ["PASS (4) FAIL (0)"],
+    forbidden: [/JS tests passed/, /Summary:/],
+  },
   {
     name: "js-test keeps failed Jest test name from fixture",
     fixture: "tests/fixtures/js/jest_failed.txt",
@@ -384,6 +396,21 @@ export const fixtureCases: FixtureCase[] = [
     exitCode: 1,
     critical: ["broken-package@1.0.0", "invalid", "peer-tool@2.0.0", "missing-lib@0.0.0"],
   },
+  {
+    name: "package-list formats pnpm depth zero like RTK deps",
+    fixture: "tests/fixtures/js/pnpm_list_depth0.txt",
+    command: ["pnpm", "list", "--depth=0"],
+    critical: [
+      "Node.js (package.json):",
+      "  @company/tg @ 0.1.0",
+      "  Dependencies (1):",
+      "    strip-ansi (^7.2.0)",
+      "  Dev Dependencies (5):",
+      "    @types/node",
+      "    vitest",
+    ],
+    forbidden: [/Dev Dependencies \(5\):\n    @types\/node @ 25\.9\.1/, /strip-ansi @ 7\.2\.0/],
+  },
   {
     name: "maven keeps failing test and summary from fixture",
     fixture: "tests/fixtures/java/maven_test_failed.txt",
diff --git a/tests/integration/cli.test.ts b/tests/integration/cli.test.ts
index b96f8b3..a830d7b 100644
--- a/tests/integration/cli.test.ts
+++ b/tests/integration/cli.test.ts
@@ -122,13 +122,13 @@ describe("Read / Cat", () => {
     }
   });
 
-  test("tg cat compresses large files", async () => {
+  test("tg cat passes through large files", async () => {
     const dir = await mkdtemp(path.join(tmpdir(), "tg-cat-large-"));
     try {
       const lines = [
         "import { api } from './api';",
         "export function main() {",
-        ...Array.from({ length: 2000 }, (_, i) => `  const noise${i} = ${i};`),
+        ...Array.from({ length: 2000 }, (_, i) => `  const filler${i} = ${i};`),
         "  return true;",
         "}",
       ];
@@ -136,8 +136,8 @@ describe("Read / Cat", () => {
 
       const result = runTg(["cat", "large.ts"], dir);
       expect(result.status).toBe(0);
-      // Large file should be summarized (not full 2000 noise lines)
-      expect(result.stdout).not.toContain("noise1999");
+      expect(result.stdout).toContain("filler1999");
+      expect(result.stdout).toContain("return true;");
     } finally {
       await rm(dir, { recursive: true, force: true });
     }
@@ -153,7 +153,7 @@ describe("Read / Cat", () => {
         "}",
         "export async function submitOrder(payload: OrderPayload) {",
         "  const idempotencyKey = `${payload.id}:submit`;",
-        ...Array.from({ length: 260 }, (_, i) => `  const noise${i} = ${i};`),
+        ...Array.from({ length: 260 }, (_, i) => `  const filler${i} = ${i};`),
         ...Array.from({ length: 80 }, (_, i) => `  const checkpoint${i} = payload.items[${i}]?.id ?? "missing";`),
         "  const result = await api.submit({ ...payload, idempotencyKey });",
         "  return { id: result.id };",
@@ -169,19 +169,14 @@ describe("Read / Cat", () => {
       expect(balanced.status).toBe(0);
       expect(aggressive.status).toBe(0);
       expect(minimal.stdout).toContain("idempotencyKey");
-      expect(minimal.stdout).toContain("checkpoint0");
+      expect(minimal.stdout).toContain("filler259");
       expect(minimal.stdout).toContain("checkpoint79");
       expect(minimal.stdout).toContain("return { id: result.id };");
-      expect(minimal.stdout).toContain("repetitive noise lines hidden");
-      expect(minimal.stdout).not.toContain("noise259");
-      expect(balanced.stdout).toContain("Symbols:");
+      expect(balanced.stdout).toContain("filler259");
       expect(balanced.stdout).toContain("submitOrder");
-      expect(balanced.stdout).not.toContain("noise259");
       expect(aggressive.stdout).toContain("export async function submitOrder");
       expect(aggressive.stdout).not.toContain("idempotencyKey");
-      expect(aggressive.stdout.length).toBeLessThan(balanced.stdout.length);
-      expect(minimal.stdout.length).toBeLessThan(lines.join("\n").length);
-      expect(balanced.stdout.length).toBeLessThan(minimal.stdout.length);
+      expect(aggressive.stdout.length).toBeLessThan(minimal.stdout.length);
     } finally {
       await rm(dir, { recursive: true, force: true });
     }
@@ -206,15 +201,14 @@ describe("Read / Cat", () => {
     try {
       await writeFile(
         path.join(dir, "sample.txt"),
-        ["alpha", ...Array.from({ length: 19 }, (_, index) => `noise-${index}`)].join("\n") + "\n",
+        ["alpha", ...Array.from({ length: 19 }, (_, index) => `line-${index}`)].join("\n") + "\n",
       );
 
       const result = runTg(["read", "--max-lines", "2", "--line-numbers", "sample.txt"], dir);
 
       expect(result.status).toBe(0);
-      expect(result.stdout).toContain("1 | alpha");
-      expect(result.stdout).toContain("2 | [19 more lines]");
-      expect(result.stdout).not.toContain("noise-18");
+      expect(result.stdout).toBe("1 | alpha\n2 | line-0\n");
+      expect(result.stdout).not.toContain("line-18");
     } finally {
       await rm(dir, { recursive: true, force: true });
     }
@@ -307,14 +301,23 @@ describe("Git", () => {
       spawnSync("git", ["init"], { cwd: dir });
       spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
       spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
-      await writeFile(path.join(dir, "f.txt"), "v1");
+      const before = Array.from({ length: 80 }, (_, index) => `line-${index}`).join("\n");
+      const after = Array.from({ length: 80 }, (_, index) =>
+        index % 4 === 0 ? `changed-${index}` : `line-${index}`,
+      ).join("\n");
+      await writeFile(path.join(dir, "f.txt"), before);
       spawnSync("git", ["add", "f.txt"], { cwd: dir });
       spawnSync("git", ["commit", "-m", "init"], { cwd: dir });
-      await writeFile(path.join(dir, "f.txt"), "v2");
+      await writeFile(path.join(dir, "f.txt"), after);
 
       const result = runTg(["git", "diff"], dir);
       expect(result.status).toBe(0);
-      expect(result.stdout).toContain("Git Diff Summary");
+      expect(result.stdout).toContain("f.txt |");
+      expect(result.stdout).toContain("--- Changes ---");
+      expect(result.stdout).toContain("f.txt");
+      expect(result.stdout).toContain("@@");
+      expect(result.stdout).toContain("-line-0");
+      expect(result.stdout).toContain("+changed-0");
     } finally {
       await rm(dir, { recursive: true, force: true });
     }
@@ -343,10 +346,8 @@ describe("Git", () => {
 
       const result = runTg(["diff", "old.ts", "new.ts"], dir);
       expect(result.status).toBe(0);
-      expect(result.stdout).toContain("Files: old.ts -> new.ts");
-      expect(result.stdout).toMatch(/Modified: old\.ts @ .+ -> new\.ts @ .+/);
-      expect(result.stdout).toContain("Summary: +1 -0");
-      expect(result.stdout).toContain("+    -:   2 |   const timeoutMs = 5000;");
+      expect(result.stdout).toContain("old.ts -> new.ts (+1 -0)");
+      expect(result.stdout).toContain("+   const timeoutMs = 5000;");
       expect(result.stdout).not.toContain("-  const unchanged");
       expect(result.stdout).not.toContain("+  const unchanged");
     } finally {
@@ -704,7 +705,7 @@ describe("Language-specific handlers", () => {
       );
 
       const result = runTg(["npm", "list", "--depth=0"], dir);
-      expect(result.stdout).toContain("Dependencies:");
+      expect(result.stdout).toContain("Problems:");
       expect(result.stdout).toContain("kept");
     } finally {
       await rm(dir, { recursive: true, force: true });
diff --git a/tests/integration/rtkParity.test.ts b/tests/integration/rtkParity.test.ts
index 209441c..55ff155 100644
--- a/tests/integration/rtkParity.test.ts
+++ b/tests/integration/rtkParity.test.ts
@@ -80,7 +80,6 @@ describe("RTK-style CLI integration parity", () => {
       const result = runTg(["git", "diff"], dir);
 
       expect(result.status).toBe(0);
-      expect(result.stdout).toContain("Git Diff Summary");
       expect(result.stdout).toContain("-  return api.submit(payload)");
       expect(result.stdout).toContain(
         "+  return api.submit({ ...payload, idempotencyKey })",
diff --git a/tests/smoke/smoke.sh b/tests/smoke/smoke.sh
index 480099e..a898860 100755
--- a/tests/smoke/smoke.sh
+++ b/tests/smoke/smoke.sh
@@ -149,7 +149,8 @@ section "Ls"
 
 assert_ok      "tg ls ."                        $TG ls .
 assert_contains "tg ls shows files"             "package.json" $TG ls .
-assert_contains "tg ls skips node_modules"      "Skipped" $TG ls .
+assert_contains "tg ls skips node_modules"      "package.json" $TG ls .
+assert_not_contains "tg ls skips node_modules"  "node_modules" $TG ls .
 assert_ok      "tg ls src/"                     $TG ls src/
 
 # ── 3. Read / Cat ────────────────────────────────────
@@ -168,11 +169,11 @@ assert_contains "tg read shows symbols"         "Symbols:" $TG read --level aggr
 section "Git"
 
 assert_ok      "tg git status"                  $TG git status
-assert_contains "tg git status branch"          "Branch:" $TG git status
+assert_contains "tg git status branch"          "* " $TG git status
 assert_ok      "tg git log"                     $TG git log
 assert_ok      "tg git log -5"                  $TG git log -- -5
 assert_ok      "tg git diff"                    $TG git diff
-assert_contains "tg git diff summary"           "Git Diff Summary" $TG git diff
+assert_ok      "tg git diff"                    $TG git diff
 assert_ok      "tg git branch"                  $TG git branch
 assert_contains "tg git branch current"         "*" $TG git branch
 
@@ -184,7 +185,7 @@ DIFF_DIR="$(mktemp -d)"
 printf "export const value = 1;\n" > "$DIFF_DIR/old.ts"
 printf "export const value = 1;\nexport const extra = 2;\n" > "$DIFF_DIR/new.ts"
 assert_ok       "tg diff files"                 $TG diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
-assert_contains "tg diff summary"               "Summary: +1 -0" $TG diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
+assert_contains "tg diff summary"               "+1 -0" $TG diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
 assert_contains "tg diff added line"            "export const extra = 2;" $TG diff "$DIFF_DIR/old.ts" "$DIFF_DIR/new.ts"
 rm -rf "$DIFF_DIR"
 
@@ -194,7 +195,7 @@ section "Grep / Search"
 
 assert_ok      "tg rg 'export' src/"            $TG rg "export" src/
 assert_ok      "tg grep -r 'export' src/"       $TG grep -r "export" src/
-assert_contains "tg rg shows Search:"           "Search:" $TG rg "import" src/
+assert_contains "tg rg shows matches"           "src/" $TG rg "import" src/
 assert_ok      "tg rg with path"                $TG rg "handler" src/handlers/
 
 # ── 7. Find ──────────────────────────────────────────
@@ -314,7 +315,7 @@ fi
 section "Npm / Pnpm (conditional)"
 
 assert_ok      "tg npm --version"               $TG npm --version
-assert_contains "tg npm list"                   "$(node -e "console.log(require('./package.json').name)")" $TG npm list --depth=0 2>&1 || true
+assert_contains "tg npm list"                   "packages" $TG npm list --depth=0 2>&1 || true
 assert_ok      "tg pnpm --version"              $TG pnpm --version
 assert_ok      "tg pnpm list"                   $TG pnpm list --depth=0 2>&1 || true
 
@@ -342,18 +343,17 @@ fi
 
 # ── 18. Large output compression ────────────────────
 
-section "Large output compression"
+section "Large output passthrough"
 
-# Generate 200 lines of output and verify tg compresses it
 LARGE_OUT=$($TG node -e "for(let i=0;i<200;i++) console.log('line '+i)" 2>&1)
 LARGE_OUT_LINES="$(printf "%s\n" "$LARGE_OUT" | wc -l | tr -d ' ')"
-if [ "$LARGE_OUT_LINES" -lt 200 ]; then
+if [ "$LARGE_OUT_LINES" -eq 200 ]; then
     PASS=$((PASS + 1))
-    printf "  ${GREEN}PASS${NC}  %s\n" "tg compresses large output"
+    printf "  ${GREEN}PASS${NC}  %s\n" "tg passes through large generic output"
 else
     FAIL=$((FAIL + 1))
-    FAILURES+=("tg compresses large output")
-    printf "  ${RED}FAIL${NC}  %s (expected < 200 lines, got %s)\n" "tg compresses large output" "$LARGE_OUT_LINES"
+    FAILURES+=("tg passes through large generic output")
+    printf "  ${RED}FAIL${NC}  %s (expected 200 lines, got %s)\n" "tg passes through large generic output" "$LARGE_OUT_LINES"
 fi
 
 # ══════════════════════════════════════════════════════
diff --git a/tests/unit/core/qualityGate.test.ts b/tests/unit/core/qualityGate.test.ts
index 6366349..3ed2544 100644
--- a/tests/unit/core/qualityGate.test.ts
+++ b/tests/unit/core/qualityGate.test.ts
@@ -50,6 +50,44 @@ describe("filtered output quality gate", () => {
     expect(result.qualityStatus).toBe("empty_output");
   });
 
+  test("passes raw output through when a filter omits content", async () => {
+    const result = await makeFilteredResult(
+      "custom",
+      raw("line one\nline two\nline three\n"),
+      "line one\n+2 more matches\n",
+      options,
+    );
+
+    expect(result.output).toBe("line one\nline two\nline three\n");
+    expect(result.qualityStatus).toBe("inflated");
+  });
+
+  test("passes raw output through when a filter reports truncated content", async () => {
+    const result = await makeFilteredResult(
+      "custom",
+      raw("diff line one\ndiff line two\n"),
+      "diff line one\n... (more changes truncated)\n",
+      options,
+    );
+
+    expect(result.output).toBe("diff line one\ndiff line two\n");
+    expect(result.qualityStatus).toBe("inflated");
+  });
+
+  test("does not treat omission words inside real content as truncation", async () => {
+    const output = [
+      "diff --git a/src/example.ts b/src/example.ts",
+      '+const message = "not shown is just text";',
+      '+const label = "Hidden: also just text";',
+      "",
+    ].join("\n");
+
+    const result = await makeFilteredResult("custom", raw(output), output, options);
+
+    expect(result.output).toBe(output);
+    expect(result.qualityStatus).toBe("passed");
+  });
+
   test("keeps compact output when it is smaller and non-empty", async () => {
     const result = await makeFilteredResult(
       "custom",
diff --git a/tests/unit/handlers/fixtureContent.test.ts b/tests/unit/handlers/fixtureContent.test.ts
index 76db0a8..8b559a6 100644
--- a/tests/unit/handlers/fixtureContent.test.ts
+++ b/tests/unit/handlers/fixtureContent.test.ts
@@ -9,6 +9,15 @@ import { fixtureCases, toParsedCommand } from "../../helpers/fixtureCases.js";
 import { routeCommand } from "../../../src/router.js";
 import type { RawResult, TgOptions } from "../../../src/types.js";
 
+const LOSSY_OMISSION_PATTERNS = [
+  /\bHidden:/,
+  /\bnot shown\b/,
+  /\btruncated\b/,
+  /\bomitted\b/,
+  /\bmore lines\b/,
+  /\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)/,
+];
+
 const repoRoot = path.resolve(
   path.dirname(fileURLToPath(import.meta.url)),
   "../../..",
@@ -58,6 +67,10 @@ describe("handler fixture content correctness", () => {
       expect(result.output).not.toMatch(pattern);
     }
 
+    for (const pattern of LOSSY_OMISSION_PATTERNS) {
+      expect(result.output).not.toMatch(pattern);
+    }
+
     if (testCase.maxOutputGrowth !== undefined) {
       expect(result.outputChars).toBeLessThanOrEqual(
         result.rawChars + testCase.maxOutputGrowth,
diff --git a/vitest.config.ts b/vitest.config.ts
index 014adbe..042f2b7 100644
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -21,6 +21,7 @@ export default defineConfig({
       "tests/unit/savings.test.ts",
       "tests/unit/executor.test.ts",
       "tests/unit/core/**/*.test.ts",
+      "tests/unit/scripts/**/*.test.ts",
     ],
   },
 });

````

**tg** (31505 chars, 7877 tokens, 69.1% savings):

````text
README.md                                  |   4 +-
 docs/DESIGN.md                             | 150 +++++++++++++++++++-----
 docs/testing-and-migration-audit.md        |  46 ++++----
 scripts/validate-docs.sh                   |   2 +-
 src/core/outputLimit.ts                    |  30 +----
 src/core/patterns.ts                       |   4 -
 src/handlers/base.ts                       |  36 +++++-
 src/handlers/common/diff.ts                |  38 ++-----
 src/handlers/common/listLike.ts            | 177 ++++++++++++++---------------
 src/handlers/common/readLike.ts            |  85 +++-----------
 src/handlers/common/searchLike.ts          |  93 +--------------
 src/handlers/generic.ts                    |  15 +--
 src/handlers/git/branch.ts                 |  13 +--
 src/handlers/git/diff.ts                   |  89 +++++----------
 src/handlers/git/log.ts                    |  11 +-
 src/handlers/git/show.ts                   |  81 ++++++-------
 src/handlers/git/status.ts                 |   4 +-
 src/handlers/java/gradle.ts                |   2 +-
 src/handlers/java/javac.ts                 |   9 +-
 src/handlers/js/eslint.ts                  |   9 +-
 src/handlers/js/packageList.ts             | 119 +++++++++++++++----
 src/handlers/js/test.ts                    |  12 +-
 src/handlers/js/tsc.ts                     |  14 +--
 src/handlers/python/mypy.ts                |  10 +-
 src/handlers/python/pip.ts                 |  26 +----
 src/handlers/python/ruff.ts                |   9 +-
 tests/fixtures/common/diff_lcs_insert.txt  |   6 +-
 tests/helpers/assertions.ts                |   2 +-
 tests/helpers/fixtureCases.ts              |  59 +++++++---
 tests/integration/cli.test.ts              |  51 +++++----
 tests/integration/rtkParity.test.ts        |   1 -
 tests/smoke/smoke.sh                       |  24 ++--
 tests/unit/core/qualityGate.test.ts        |  38 +++++++
 tests/unit/handlers/fixtureContent.test.ts |  13 +++
 vitest.config.ts                           |   1 +
 35 files changed, 641 insertions(+), 642 deletions(-)

--- Changes ---
README.md
  @@ -16,6 +16,7 @@ tg git diff
  +tg read --level balanced src/cli.ts
   tg ls .
   tg npm test
   tg tsc --noEmit
  @@ -45,11 +46,12 @@ tg --version
  +- explicit read: `read --level minimal|balance|balanced|aggressive`
   - list-like: `ls`, `dir`, `find`, `tree`
   - search-like: `rg`, `grep`
  +- diff: `diff`
   - git status
   - git diff
  -- diff: `diff`
   - git log
   - git show
   - git branch
  +3 -1

docs/DESIGN.md
  @@ -92,7 +92,8 @@ CLI (cli.ts)
  -                  ├─ outputLimit      # 全局行数/字符数截断
  +                  ├─ quality gate     # 膨胀/空输出/省略内容 → raw passthrough
  +                  ├─ outputLimit      # 当前 no-op；保留 flags 接口
                     ├─ history          # 写入 .tg/history.jsonl
                     ├─ rawStore         # 条件保存原始输出
                     └─ stats            # token 节省格式化
  @@ -108,7 +109,8 @@ CLI (cli.ts)
  -| Output limit | `src/core/outputLimit.ts` | 全局行数截断 + 字符数截断，保留重要行 |
  +| Quality gate | `src/handlers/base.ts` | 过滤结果质量门：防膨胀、防空输出误导 |
  +| Output limit | `src/core/outputLimit.ts` | 当前为 no-op passthrough；`--max-lines` / `--max-chars` 保留 CLI 接口，实际截断由 handler 或 quality gate 决定 |
   | History | `src/core/history.ts` | JSONL 追加写入和读取 |
   | Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `.tg/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
   | Report | `src/core/report.ts` | 汇总 history 生成 text/json/csv 报告 |
  @@ -128,28 +130,36 @@ interface CommandHandler {
  -Handler 分类和压缩策略：
  -
  -| 分类 | Handler | 压缩策略 |
  -|------|---------|----------|
  -| Search | `searchLike`（rg、grep） | 按文件分组，每文件限制条数；识别 `file:line:content` 和 `--null` 格式 |
  -| Read | `readLike`（cat、type、less） | 内部读取（跳过 shell），大文件（>12K chars）提取 import/export/function/class 符号 + head + tail，二进制直接拒绝 |
  -| List | `listLike`（ls、dir、find、tree） | 树形摘要，按顶级目录分组计数，跳过 node_modules/dist/build 等噪音目录 |
  -| Git | `gitStatus` | 解析 verbose status 输出，结构化 staged/modified/untracked/conflicts |
  -| Git | `gitDiff` | 统计 +added/-removed，保留 hunk headers，大 diff 额外提示用 `--raw` |
  -| Git | `gitLog` | 解析 commit/Author/Date，截断到最近 20 条 |
  -| Git | `gitShow` | 保留 commit 元信息 + 首段 diff |
  -| Git | `gitBranch` | 过滤 current/main/master/codex/*/release/* 邻近分支 |
  -| JS | `jsTest`（npm/pnpm/yarn test、vitest、jest） | 保留 failures + Test Files/Tests 摘要 |
  -| JS | `eslint` | 保留 error/warning 计数和详情 |
  -| JS | `tsc` | 保留 type errors，按文件分组 |
  -| JS | `packageList` | 去重、截断 |
  -| Python | `pytest` | 保留 FAILED + summary |
  -| Python | `ruff` | 保留 violations |
  -| Python | `mypy` | 保留 type errors |
  -| Python | `pip` | 截断列表 |
  -| Java | `maven`、`gradle`、`javac` | 保留 errors，丢弃构建进度 |
  -| Generic | `generic` | head 30 行 + tail 30 行 + 匹配 error/failed/fatal 等重要模式的行 |
  +#### 实现原则
  +
  +Handler 只做两类事：
  +
  +1. **结构化改写** — 把 verbose 输出换成更短、但信息完整的格式（如 `git status` 短状态码、两文件 `diff` 的 LCS `+/-` 行、`tsc` 按错误码分组）。不丢行、不写 `Hidden` / `+N more` / `... N lines hidden`。
  +2. **原文 passthrough** — 无法在不省略内容的前提下明显变短时，原样输出 stdout/stderr（如 `rg`、`grep`、`git diff`、未知命令的 `generic`）。
  +
  +只有 **`read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）；默认 `cat` / `read` 对大文件也 passthrough 全文。
  +
  +#### Handler 分类与策略
  +
  +| 分类 | Handler | 策略 |
  +|------|---------|------|
  +| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
  +| Read | `readLike`（cat、type、less、read） | `cat`/`read` 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
  +| List | `listLike`（ls、dir、find、tree） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
  +| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
  +| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
  +| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
  +| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
  +| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
  +| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
  +| JS | `jsTest` | failures + Test Files/Tests 摘要 |
  +| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
  +| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
  +| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
  +| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
  +| Python | `pip` | **原文 passthrough** |
  +| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
  +| Generic | `generic` | **原文 passthrough**（stdout + stderr） |
   
   ### 1.5 FilteredResult
   
  @@ -158,9 +168,9 @@ Handler 分类和压缩策略：
  -  output: string;          // 压缩后输出（已去 ANSI + 全局截断）
  +  output: string;          // 最终输出（已去 ANSI；经 quality gate 选定）
     rawChars: number;        // 原始字符数
  -  outputChars: number;     // 压缩后字符数
  +  outputChars: number;     // 最终输出字符数
     rawTokens: number;       // 估算原始 token
     outputTokens: number;    // 估算输出 token
     savedTokens: number;     // 节省 token
  @@ -168,10 +178,43 @@ type FilteredResult = {
  +  qualityStatus:           // 过滤质量状态
  +    | "passed"
  +    | "inflated"
  +    | "empty_output";
   };
   ```
   
  -### 1.6 Rewrite engine
  +`savingsPct` 与 history 只反映 **quality gate 之后** 的最终 `output`，不把被回退为 raw 的尝试算成有效压缩。
  +
  +### 1.6 Quality gate
  +
  +所有 handler 的结果在 `makeFilteredResult()` 里经过统一质量门。目标不是“让每个命令都变短”，而是 **避免为了 token 数字牺牲信息**：
  +
  +| 条件 | 行为 | `qualityStatus` |
  +|------|------|-----------------|
  +| raw 非空，filtered 为空或只有空白 | 输出 raw | `empty_output` |
  +| raw 非空，filtered 比 raw 长（小输出零容差；大输出允许 ≤5% 或 ≥80 chars 的 metadata 开销） | 输出 raw | `inflated` |
  +| filtered 含省略语义（`Hidden`、`+N more`、`[N more lines]`、`... N lines hidden`、`Direct sample:` 等，`outputOmitsContent()` 检测） | 输出 raw | `inflated` |
  +| filtered 非空且不膨胀、不省略 | 输出 filtered | `passed` |
  +| raw 为空、filtered 非空（如 `0 matches for pattern`） | 输出 filtered | `passed` |
  +
  +因此：
  +
  +- 专用 handler 可以 passthrough（savings 为 0），这仍是正确行为。
  +- 结构化改写若比 raw 更长或声称省略未展示内容，会自动回退 raw。
  +- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入 `.tg/raw/`。
  +
  +**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：
  +
  +- `Hidden: … not shown`
  +- `+N more matches/files/packages/errors/commits/branches`
  +- `[N more lines]`、`... N more lines (use tg --raw …)`
  +- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）
  +
  +这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。
  +
  +### 1.7 Rewrite engine
   
   在 hook 运行时，rewrite engine 负责将用户输入的 raw command 改写为 `tg` wrapper。这是集中式 command rewrite registry，输入 raw command，输出 `rewrite | suggest | pass | deny`。
   
  @@ -560,7 +603,8 @@ Parser 模块作为 handler filter 的基础设施，handler 可以选择：
  -  "raw_output_path": ".tg/raw/20260602-103000-git-status.log"
  +  "raw_output_path": ".tg/raw/20260602-103000-git-status.log",
  +  "quality_status": "passed"
   }
   ```
   
  @@ -581,6 +625,7 @@ tg report --csv        # CSV 格式
  +- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
   - `--user` 报告按项目分组，展示每个项目的独立统计。
   - `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
   - 不记录敏感原文，只记录命令类型、长度、策略结果和时间。
  @@ -886,7 +931,52 @@ model_policy:
  -## 13. Implementation Constraints
  +## 13. Future Token Digestion Layers
  +
  +Layer 1 已落在 command filter 质量门上。后续两层先保留在设计中，不进入当前实现范围。
  +
  +### 13.1 Layer 2: 少产生输出
  +
  +目标是在工具执行前减少高成本输出，而不是等 raw output 生成后再压缩。
  +
  +实现边界：
  +
  +- 新增 rewrite registry，输入 raw command，输出 `pass | rewrite | warn | deny`。
  +- `tg hook pretool` 读取 stdin JSON，对 `cat` lockfile、读依赖目录、无路径全仓 `rg`、`git diff`、测试命令等给出 rewrite/warn/deny。
  +- `tg hook posttool` 在宿主已经执行 raw command 时复用现有 handler 压缩输出，不重新执行命令。
  +- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。
  +
  +第一批规则只覆盖高价值命令：
  +
  +- `cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
  +- `cat node_modules/...`、`cat dist/...` → deny。
  +- `rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
  +- `git diff` → rewrite 到 `tg git diff`。
  +- `npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。
  +
  +### 13.2 Layer 3: 增加 cache hit
  +
  +目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用。
  +
  +实现边界：
  +
  +- 新增 content-addressed output cache：`.tg/cache/outputs/<hash>.json`。
  +- cache key 由 `cwd`、command、args、git HEAD、相关文件 fingerprint 构成。
  +- 重复命令在 fingerprint 未变时返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`。
  +- 新增 deterministic project context：`.tg/context.md` 和 `.tg/context.json`，按固定顺序输出 repo map、scripts、重要文件摘要和 section hashes。
  +- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。
  +
  +报告后续增加：
  +
  +- cacheable commands。
  +- cache hits。
  +- repeated output avoided tokens。
  +- stable chars / volatile chars。
  +- raw reuse hits。
  +
  +---
  +
  +## 14. Implementation Constraints
   
   - L6/L7 暂不考虑，文档和代码必须明确标注。
   - 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
  @@ -899,7 +989,7 @@ model_policy:
  -## 14. Development
  +## 15. Development
   
   ```bash
   pnpm install
  +120 -30

docs/testing-and-migration-audit.md
  @@ -15,7 +15,7 @@ Last audited: 2026-06-03
  -| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 42 real `fixtureCases`; current red tests expose real gaps. |
  +| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 47 real `fixtureCases`; migration red tests expose real gaps. |
   | Do passing tests reflect project reality? | **Partially** — core handlers work on selected real fixtures and narrow integration paths; not production-wide or RTK 1:1. |
   
   **Baseline**
  @@ -199,14 +199,14 @@ Every RTK module migration is **done** when tg covers **all applicable rows** fo
  -| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **42 rows** across registered handlers; still needs deeper per-handler variants |
  +| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **47 rows** across registered handlers; still needs deeper per-handler variants |
   | **B Arg parse & routing** | `router.test.ts` + `rtkDomainCaseParity` sample command → handler name | verified / migration gate | **Partial** — routing only, not arg edge cases |
   | **C Format transform** | Unit tests on exported pure functions **or** fixtureCases when output differs | fixtureCases / future parser units | **Still thin** — add real fixture variants or exported-parser units only |
   | **D Passthrough / small output** | `fixtureCases` with small fixture + max size assertion; `contracts` small-output rows | fixtureContent + (future) size caps | **Rare** — few P1 small-output cases |
   | **E Compression & limits** | `fixtureCases` on large fixture + `critical` + optional `expectLargeSavings` | fixtureContent | **Partial** — no savings-only tests count |
   | **F Empty / no-match** | `fixtureCases` or unit: empty input → no throw, sensible message | fixtureContent | **Sparse** |
   | **G Error / stderr** | `fixtureCases` with `exitCode != 0`, stderr in fixture or merged raw | fixtureContent | **Some** (pytest, ruff, tsc, …) |
  -| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Gaps now visible** — grep `-c`/`-l` pass; `rg --json` is red because current handler rewrites machine-readable output |
  +| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Partial** — grep `-c`/`-l` and `rg --json` are fixture-backed; more RTK variants remain |
   | **I Platform / encoding** | fixtureCases with paths/unicode in fixture file | fixtureContent | **Minimal** |
   | **J Malformed / unknown format** | fixtureCases: non-canonical stdout → not empty, not “0 matches” lie | fixtureContent | **Almost none** |
   | **K Module inventory** | Handler exists + at least one dimension-A row | `rtkDomainCaseParity` | **47 modules tracked; most fail** |
  @@ -219,7 +219,7 @@ As of 2026-06-03, tg test cases classified against the same A–K dimensions:
  -| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 42 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
  +| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 47 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
   | **B — Arg parse/routing** | ~230 | ~55 routing / 0 internal parse | ⚠️ Routing ok, parse untested | Handler-internal parse functions (`formatStatus`, `parseMatch`, …) tested only through filter() pipeline, not in isolation |
   | **C — Format transform** | ~161 | ~14 | 🔴 Thin | Only searchLike has 5+ format variants; other handlers test one canonical format only |
   | **D — Passthrough/small output** | ~34 | ~14 | 🟢 Proportional | branch/list/search small-output rows now assert output growth limits |
  @@ -231,7 +231,7 @@ As of 2026-06-03, tg test cases classified against the same A–K dimensions:
  -**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed. `rg --json` deliberately stays red.
  +**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed, including `rg --json`.
   
   **Naming / traceability:** each tg case should cite RTK source when porting:
   
  @@ -268,13 +268,13 @@ Or in unit tests: `// RTK: rtk/src/cmds/system/grep_cmd.rs test_parse_match_line
  -The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` was red (**120 pass / 1 fail**) because `rg --json` is now a real fixture-backed bug, and `pnpm test:migration` was red (**97 pass / 39 fail**). Treat failures as debt signals, not regressions to hide.
  +The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` is green, and `pnpm test:migration` remains red because missing RTK handlers, scripts, and repo infrastructure are still tracked as debt. Treat failures as debt signals, not regressions to hide.
   
   ### 3.2 Categories of passing tests (quality tiers)
   
   | Tier | Examples | Follows P0/P1 principles? | Reflects real tool output? |
   |------|----------|---------------------------|----------------------------|
  -| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (42 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
  +| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (47 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
   | **B — tg internals** | `savings`, `parse`, `router`, `pipeline`, `executor`, `ansi` | **Yes** for their scope | **N/A** (not handler filters) |
   | **C — E2E smoke** | `tests/integration/cli.test.ts` (~30 cases) | **Mostly** — real `spawn` of tg in temp dirs | **Partial** — narrow scenarios |
   | **D — Migration/debt only** | Routing parity, fixture wiring, fixture corpus size, script path parity | **No** for product behavior | **No** — existence/routing ≠ correct compression |
  @@ -284,7 +284,7 @@ The migration suite (`vitest.migration.config.ts`) intentionally includes RTK mi
  -3. **One fixture per handler is not enough** — `fixtureCases` covers 42 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
  +3. **One fixture per handler is not enough** — `fixtureCases` covers 47 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
   4. **fixtureCases wiring debt cleared** — orphaned on-disk fixtures (`rg_default_format`, `log_standard`, `show_large`, …) and commands (`tree`, `ls`, `pnpm list`, …) are now wired into `fixtureCases`.
   5. **Registered handler fixture coverage complete** — every registered non-generic handler has at least one `fixtureCases` row.
   6. **No synthetic handler contract tests** — global inline contracts were removed; use fixtureCases or explicit regression debt.
  @@ -293,7 +293,7 @@ The migration suite (`vitest.migration.config.ts`) intentionally includes RTK mi
  -12. **`rg --json` is now intentionally red** — current `search-like` rewrites JSON output into a search summary and drops machine-readable fields.
  +12. **Explicit machine-readable search output is covered** — `rg --json` now stays raw enough to preserve JSON fields; more grep/rg format variants still need parity work.
   
   ### 3.4 What passing tests *do* justify
   
  @@ -335,7 +335,7 @@ Merged from `docs/test-case-audit.md` (2026-06-03), **reconciled** with `vitest.
  -| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **42 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar; currently red on `rg --json` |
  +| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **47 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar |
   
   #### 3.5.2 🗑️ Deleted synthetic handler tests (23 files)
   
  @@ -356,7 +356,7 @@ Replacement coverage now lives in:
  -| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (28) | Redundant subset | **Merge** into domain parity; then remove |
  +| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (29) | Redundant subset | **Merge** into domain parity; then remove |
   | `handlers/fixtureRegressionDebt.test.ts` | ✅ | Real fixture-backed regressions not yet implemented | **Debt gate** | Keep until fixed |
   | `handlers/fixtureWiring.test.ts` | ✅ | Known fixtures/commands wired into fixtureCases | **Debt gate** | Keep while fixtures expand |
   | `handlers/syntheticTestDebt.test.ts` | ✅ | Fails if synthetic handler tests return | **Guard** | Keep to prevent regression |
  @@ -373,7 +373,7 @@ Replacement coverage now lives in:
  -| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (3) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |
  +| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (4) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |
   
   #### 3.5.7 File tree (CI status)
   
  @@ -489,7 +489,7 @@ Every registered handler needs at least one test proving compressed output keeps
  -**Verified today:** 42 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Current red:** `rg --json` does not preserve explicit JSON output. **Still missing:** multi-scenario depth per handler and several real-format regressions in `fixtureRegressionDebt`.
  +**Verified today:** 47 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Still missing:** multi-scenario depth per handler and remaining migration gaps outside the product suite.
   
   ### 5.3 P0: Unknown format handling
   
  @@ -591,7 +591,7 @@ src/cmds/system/format_cmd.rs             ─                                  
  -src/cmds/git/diff_cmd.rs                  ─ (no two-file diff handler)       ─
  +src/cmds/git/diff_cmd.rs                  diff.ts                            fixtureCases + fixtureContent
   src/cmds/git/gh_cmd.rs                    hostingCli.ts                      fixtureContent.test.ts
   src/cmds/git/glab_cmd.rs                  hostingCli.ts                      fixtureContent.test.ts
   src/cmds/git/gt_cmd.rs                    ─                                  ─
  @@ -649,11 +649,12 @@ Full RTK total: **986** `#[test]` in **47** modules. tg `test()` counts below ar
  +system/read.rs                8            7       partial via readLike
   system/find_cmd.rs           29           11       partial via listLike
   system/grep_cmd.rs           23           20       partial
   system/pipe_cmd.rs           38            0       no handler
   git/git.rs                   75           71       partial
  -git/diff_cmd.rs              19            0       no dedicated handler
  +git/diff_cmd.rs              19            4       partial via diff
   git/gh_cmd.rs                66           41       partial via hostingCli
   git/glab_cmd.rs              62           41       partial via hostingCli
   jvm/gradlew_cmd.rs           56           11       high gap; RTK gradlew fixtures ported, behavior depth still shallow
  @@ -668,7 +669,7 @@ rust/cargo_cmd.rs            48            0       no handler
  -| Diff compaction / hunk limits | ❓ diff.test partial; diff_cmd 19 tests unmigrated |
  +| Diff compaction / hunk limits | ❓ diff handler fixture-backed; most diff_cmd inline tests unmigrated |
   | Git extended subcommands | ✅ handlers; ❓ fixtureCases incomplete |
   | Pipe chaining | ❌ no handler |
   | Gradlew variants + fixtures | ❓ high gap |
  @@ -711,25 +712,26 @@ handler fidelity              fixtureContent.test.ts          ✅ product
  -| git diff_cmd, gt | ❌ | No dedicated coverage |
  +| git diff_cmd | ❓ | Dedicated two-file handler added; RTK inline depth still unmigrated |
  +| git gt | ❌ | No dedicated coverage |
   | gh/glab | ❓ | Fixture-backed coverage exists; RTK depth not fully mapped |
   | js/python/java mapped handlers | ❓ | Core scenarios; not full RTK parity |
   | js prettier/next/playwright/prisma | ❌ | No handler |
   | dotnet/cloud/go/rust/ruby | ❌ | No handler |
   | gradlew fixtures | ✅ | RTK corpus ported |
   | tg-only maven/javac/generic | ✅ | No RTK module |
  -| Verified CI green | ❌ | `fixtureContent` has intentional `rg --json` red; migration gates in §4 also red |
  +| Verified CI green | ❌ | Migration gates in §4 are still red |
   | Synthetic test debt | ✅ | 23 files deleted; guard remains |
   | benchmark TS + sessions + test-ruby | ❌ | rtkScriptParity |
   | GitHub CI + cli-testing.md | ❌ | projectConfig |
   
  -### Unacceptable gaps (29 RTK modules — no handler AND no migration test)
  +### Unacceptable gaps (28 RTK modules — no handler AND no migration test)
   
   **Cloud:** aws, curl, psql, wget, docker/kubectl  
   **JS:** prettier, next, playwright, prisma  
   **Languages:** go, golangci-lint, cargo/rust runner, ruby (rake/rspec/rubocop)  
   **.NET:** dotnet_cmd, binlog, trx, format_report  
  -**Git:** gt; dedicated `diff_cmd` two-file diff  
  +**Git:** gt
   **System:** log, json, env, wc, format, pipe, local_llm  
   
   ### Implemented but severely under-tested
  @@ -737,13 +739,13 @@ handler fidelity              fixtureContent.test.ts          ✅ product
  -| diff_cmd | 19 inline tests | 0 dedicated | **high** |
  +| diff_cmd | 19 inline tests | fixture-backed two-file + stdin unified + overflow subset | **high** |
   | git.rs | 75 inline tests | fixture-backed subset + regression debt | medium |
   | readLike / tree | 8 / 6 RTK | fixture-backed subset via listLike/readLike | medium |
   
   ### Relatively complete (product bar only)
   
  -- **42 `fixtureCases`** fidelity scenarios
  +- **47 `fixtureCases`** fidelity scenarios
   - **Core** unit + **integration/cli** smoke path
   - **Ported** shell scripts (§7 ✅ rows)
   - **tg-owned** fixture files on disk; current known orphaned fixture wiring cleared
  +24 -22

scripts/validate-docs.sh
  @@ -11,7 +11,7 @@ EXIT_CODE=0
  -    cat type less           # common/readLike.ts
  +    cat type less read      # common/readLike.ts
       ls dir find tree         # common/listLike.ts
       rg grep                  # common/searchLike.ts
       diff                     # common/diff.ts
  +1 -1

src/core/outputLimit.ts
  @@ -1,31 +1,13 @@
  -import { IMPORTANT_PATTERN } from "./patterns.js";
   
  -export function limitLines(text: string, maxLines: number): string {
  -  const lines = text.split(/\r?\n/);
  -  if (lines.length <= maxLines) return text;
  -
  -  const important = lines.filter((line) => IMPORTANT_PATTERN.test(line));
  -  const headCount = Math.max(1, Math.floor(maxLines / 3));
  -  const tailCount = Math.max(1, Math.floor(maxLines / 3));
  -  const middleBudget = Math.max(0, maxLines - headCount - tailCount - 1);
  -  const middle = important.slice(0, middleBudget);
  -
  -  return [
  -    ...lines.slice(0, headCount),
  -    ...middle,
  -    `... ${lines.length - maxLines} lines hidden ...`,
  -    ...lines.slice(-tailCount),
  -  ].join("\n");
  +export function limitLines(text: string, _maxLines: number): string {
  +  return text;
   }
   
  -export function limitChars(text: string, maxChars: number): string {
  -  if (text.length <= maxChars) return text;
  -  const head = text.slice(0, Math.floor(maxChars / 2));
  -  const tail = text.slice(text.length - Math.floor(maxChars / 2));
  -  return `${head}\n... ${text.length - maxChars} chars hidden ...\n${tail}`;
  +export function limitChars(text: string, _maxChars: number): string {
  +  return text;
   }
   
  -export function limitOutput(text: string, options: TgOptions): string {
  -  return limitChars(limitLines(text, options.maxLines), options.maxChars);
  +export function limitOutput(text: string, _options: TgOptions): string {
  +  return text;
   }
  +6 -24

src/core/patterns.ts
  @@ -1,6 +1,2 @@
  -
  -export function isNoisyPath(value: string): boolean {
  -  return /noise|node_modules|dist|build|target|coverage|\.git/.test(value);
  -}
  +0 -4

src/handlers/base.ts
  @@ -8,6 +8,24 @@ export function rawText(raw: RawResult): string {
  +export function outputOmitsContent(output: string): boolean {
  +  return output.split(/\r?\n/).some((line) => {
  +    const trimmed = line.trim();
  +    return (
  +      /^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/.test(trimmed) ||
  +      /^\[\d+ more lines\]$/.test(trimmed) ||
  +      /^more (lines|chars) \(use tg.*\)$/.test(trimmed) ||
  +      /^repetitive lines collapsed$/.test(trimmed) ||
  +      /^.*lines truncated\)$/.test(trimmed) ||
  +      /^\.\.\. \(more changes truncated\)$/.test(trimmed) ||
  +      /^- \.\.\. \d+ more$/.test(trimmed) ||
  +      /^Hidden:$/.test(trimmed) ||
  +      /^- \d+ (matches|files|packages|errors|commits|branches|dependencies) not shown$/.test(trimmed) ||
  +      /^Direct sample:$/.test(trimmed)
  +    );
  +  });
  +}
  +
   export async function makeFilteredResult(
     handler: string,
     raw: RawResult,
  @@ -15,14 +33,24 @@ export async function makeFilteredResult(
  -  const cleanRaw = limitOutput(removeAnsi(rawText(raw)), options);
  -  const cleanOutput = limitOutput(removeAnsi(output), options);
  +  const unlimitedRaw = removeAnsi(rawText(raw));
  +  const unlimitedOutput = removeAnsi(output);
  +  const cleanRaw = limitOutput(unlimitedRaw, options);
  +  const cleanOutput = limitOutput(unlimitedOutput, options);
     const rawHasContent = cleanRaw.trim().length > 0;
     const outputHasContent = cleanOutput.trim().length > 0;
  -  const outputInflatesRaw = rawHasContent && outputHasContent && cleanOutput.length > cleanRaw.length;
  +  const inflationBudget =
  +    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
  +  const outputInflatesRaw =
  +    handler !== "git-diff" &&
  +    rawHasContent &&
  +    outputHasContent &&
  +    cleanOutput.length > cleanRaw.length + inflationBudget;
  +  const outputTruncatesContent =
  +    handler !== "git-diff" && rawHasContent && outputHasContent && outputOmitsContent(cleanOutput);
     const qualityStatus = !outputHasContent && rawHasContent
       ? "empty_output"
  -    : outputInflatesRaw
  +    : outputInflatesRaw || outputTruncatesContent
       ? "inflated"
       : "passed";
     const limited = qualityStatus === "passed" ? cleanOutput : cleanRaw;
  +32 -4

src/handlers/common/diff.ts
  @@ -58,47 +58,28 @@ function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
  -function formatTimestamp(date: Date): string {
  -  return date.toISOString().replace(".000Z", "Z");
  -}
  -
  -function formatLineNumber(value: number | "-"): string {
  -  return String(value).padStart(4, " ");
  -}
  -
   function formatDiffOutput(
     oldPath: string,
     newPath: string,
  -  oldMtime: Date,
  -  newMtime: Date,
  +  _oldMtime: Date,
  +  _newMtime: Date,
     oldText: string,
     newText: string,
   ): string {
     const changes = lcsChanges(splitLines(oldText), splitLines(newText));
     if (changes.length === 0) {
  -    return [
  -      `Files: ${oldPath} -> ${newPath}`,
  -      `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
  -      "Summary: +0 -0",
  -      "[ok] Files are identical",
  -      "",
  -    ].join("\n");
  +    return `${oldPath} -> ${newPath}\n[ok] Files are identical\n`;
     }

... (more changes truncated)
  +3 -17
[full diff: tg --raw git diff]

````

**rtk** (31864 chars, 7966 tokens, 68.7% savings):

````text
README.md                                  |   4 +-
 docs/DESIGN.md                             | 150 +++++++++++++++++++-----
 docs/testing-and-migration-audit.md        |  46 ++++----
 scripts/validate-docs.sh                   |   2 +-
 src/core/outputLimit.ts                    |  30 +----
 src/core/patterns.ts                       |   4 -
 src/handlers/base.ts                       |  36 +++++-
 src/handlers/common/diff.ts                |  38 ++-----
 src/handlers/common/listLike.ts            | 177 ++++++++++++++---------------
 src/handlers/common/readLike.ts            |  85 +++-----------
 src/handlers/common/searchLike.ts          |  93 +--------------
 src/handlers/generic.ts                    |  15 +--
 src/handlers/git/branch.ts                 |  13 +--
 src/handlers/git/diff.ts                   |  89 +++++----------
 src/handlers/git/log.ts                    |  11 +-
 src/handlers/git/show.ts                   |  81 ++++++-------
 src/handlers/git/status.ts                 |   4 +-
 src/handlers/java/gradle.ts                |   2 +-
 src/handlers/java/javac.ts                 |   9 +-
 src/handlers/js/eslint.ts                  |   9 +-
 src/handlers/js/packageList.ts             | 119 +++++++++++++++----
 src/handlers/js/test.ts                    |  12 +-
 src/handlers/js/tsc.ts                     |  14 +--
 src/handlers/python/mypy.ts                |  10 +-
 src/handlers/python/pip.ts                 |  26 +----
 src/handlers/python/ruff.ts                |   9 +-
 tests/fixtures/common/diff_lcs_insert.txt  |   6 +-
 tests/helpers/assertions.ts                |   2 +-
 tests/helpers/fixtureCases.ts              |  59 +++++++---
 tests/integration/cli.test.ts              |  51 +++++----
 tests/integration/rtkParity.test.ts        |   1 -
 tests/smoke/smoke.sh                       |  24 ++--
 tests/unit/core/qualityGate.test.ts        |  38 +++++++
 tests/unit/handlers/fixtureContent.test.ts |  13 +++
 vitest.config.ts                           |   1 +
 35 files changed, 641 insertions(+), 642 deletions(-)

--- Changes ---

README.md
  @@ -16,6 +16,7 @@ tg git diff
  +tg read --level balanced src/cli.ts
   tg ls .
   tg npm test
   tg tsc --noEmit
  @@ -45,11 +46,12 @@ tg --version
  +- explicit read: `read --level minimal|balance|balanced|aggressive`
   - list-like: `ls`, `dir`, `find`, `tree`
   - search-like: `rg`, `grep`
  +- diff: `diff`
   - git status
   - git diff
  -- diff: `diff`
   - git log
   - git show
   - git branch
  +3 -1

docs/DESIGN.md
  @@ -92,7 +92,8 @@ CLI (cli.ts)
  -                  ├─ outputLimit      # 全局行数/字符数截断
  +                  ├─ quality gate     # 膨胀/空输出/省略内容 → raw passthrough
  +                  ├─ outputLimit      # 当前 no-op；保留 flags 接口
                     ├─ history          # 写入 .tg/history.jsonl
                     ├─ rawStore         # 条件保存原始输出
                     └─ stats            # token 节省格式化
  @@ -108,7 +109,8 @@ CLI (cli.ts)
  -| Output limit | `src/core/outputLimit.ts` | 全局行数截断 + 字符数截断，保留重要行 |
  +| Quality gate | `src/handlers/base.ts` | 过滤结果质量门：防膨胀、防空输出误导 |
  +| Output limit | `src/core/outputLimit.ts` | 当前为 no-op passthrough；`--max-lines` / `--max-chars` 保留 CLI 接口，实际截断由 handler 或 quality gate 决定 |
   | History | `src/core/history.ts` | JSONL 追加写入和读取 |
   | Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `.tg/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
   | Report | `src/core/report.ts` | 汇总 history 生成 text/json/csv 报告 |
  @@ -128,28 +130,36 @@ interface CommandHandler {
  -Handler 分类和压缩策略：
  -
  -| 分类 | Handler | 压缩策略 |
  -|------|---------|----------|
  -| Search | `searchLike`（rg、grep） | 按文件分组，每文件限制条数；识别 `file:line:content` 和 `--null` 格式 |
  -| Read | `readLike`（cat、type、less） | 内部读取（跳过 shell），大文件（>12K chars）提取 import/export/function/class 符号 + head + tail，二进制直接拒绝 |
  -| List | `listLike`（ls、dir、find、tree） | 树形摘要，按顶级目录分组计数，跳过 node_modules/dist/build 等噪音目录 |
  -| Git | `gitStatus` | 解析 verbose status 输出，结构化 staged/modified/untracked/conflicts |
  -| Git | `gitDiff` | 统计 +added/-removed，保留 hunk headers，大 diff 额外提示用 `--raw` |
  -| Git | `gitLog` | 解析 commit/Author/Date，截断到最近 20 条 |
  -| Git | `gitShow` | 保留 commit 元信息 + 首段 diff |
  -| Git | `gitBranch` | 过滤 current/main/master/codex/*/release/* 邻近分支 |
  -| JS | `jsTest`（npm/pnpm/yarn test、vitest、jest） | 保留 failures + Test Files/Tests 摘要 |
  -| JS | `eslint` | 保留 error/warning 计数和详情 |
  -| JS | `tsc` | 保留 type errors，按文件分组 |
  -| JS | `packageList` | 去重、截断 |
  -| Python | `pytest` | 保留 FAILED + summary |
  -| Python | `ruff` | 保留 violations |
  -| Python | `mypy` | 保留 type errors |
  -| Python | `pip` | 截断列表 |
  -| Java | `maven`、`gradle`、`javac` | 保留 errors，丢弃构建进度 |
  -| Generic | `generic` | head 30 行 + tail 30 行 + 匹配 error/failed/fatal 等重要模式的行 |
  +#### 实现原则
  +
  +Handler 只做两类事：
  +
  +1. **结构化改写** — 把 verbose 输出换成更短、但信息完整的格式（如 `git status` 短状态码、两文件 `diff` 的 LCS `+/-` 行、`tsc` 按错误码分组）。不丢行、不写 `Hidden` / `+N more` / `... N lines hidden`。
  +2. **原文 passthrough** — 无法在不省略内容的前提下明显变短时，原样输出 stdout/stderr（如 `rg`、`grep`、`git diff`、未知命令的 `generic`）。
  +
  +只有 **`read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）；默认 `cat` / `read` 对大文件也 passthrough 全文。
  +
  +#### Handler 分类与策略
  +
  +| 分类 | Handler | 策略 |
  +|------|---------|------|
  +| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
  +| Read | `readLike`（cat、type、less、read） | `cat`/`read` 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
  +| List | `listLike`（ls、dir、find、tree） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
  +| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
  +| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
  +| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
  +| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
  +| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
  +| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
  +| JS | `jsTest` | failures + Test Files/Tests 摘要 |
  +| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
  +| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
  +| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
  +| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
  +| Python | `pip` | **原文 passthrough** |
  +| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
  +| Generic | `generic` | **原文 passthrough**（stdout + stderr） |
   
   ### 1.5 FilteredResult
   
  @@ -158,9 +168,9 @@ Handler 分类和压缩策略：
  -  output: string;          // 压缩后输出（已去 ANSI + 全局截断）
  +  output: string;          // 最终输出（已去 ANSI；经 quality gate 选定）
     rawChars: number;        // 原始字符数
  -  outputChars: number;     // 压缩后字符数
  +  outputChars: number;     // 最终输出字符数
     rawTokens: number;       // 估算原始 token
     outputTokens: number;    // 估算输出 token
     savedTokens: number;     // 节省 token
  @@ -168,10 +178,43 @@ type FilteredResult = {
  +  qualityStatus:           // 过滤质量状态
  +    | "passed"
  +    | "inflated"
  +    | "empty_output";
   };
   ```
   
  -### 1.6 Rewrite engine
  +`savingsPct` 与 history 只反映 **quality gate 之后** 的最终 `output`，不把被回退为 raw 的尝试算成有效压缩。
  +
  +### 1.6 Quality gate
  +
  +所有 handler 的结果在 `makeFilteredResult()` 里经过统一质量门。目标不是“让每个命令都变短”，而是 **避免为了 token 数字牺牲信息**：
  +
  +| 条件 | 行为 | `qualityStatus` |
  +|------|------|-----------------|
  +| raw 非空，filtered 为空或只有空白 | 输出 raw | `empty_output` |
  +| raw 非空，filtered 比 raw 长（小输出零容差；大输出允许 ≤5% 或 ≥80 chars 的 metadata 开销） | 输出 raw | `inflated` |
  +| filtered 含省略语义（`Hidden`、`+N more`、`[N more lines]`、`... N lines hidden`、`Direct sample:` 等，`outputOmitsContent()` 检测） | 输出 raw | `inflated` |
  +| filtered 非空且不膨胀、不省略 | 输出 filtered | `passed` |
  +| raw 为空、filtered 非空（如 `0 matches for pattern`） | 输出 filtered | `passed` |
  +
  +因此：
  +
  +- 专用 handler 可以 passthrough（savings 为 0），这仍是正确行为。
  +- 结构化改写若比 raw 更长或声称省略未展示内容，会自动回退 raw。
  +- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入 `.tg/raw/`。
  +
  +**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：
  +
  +- `Hidden: … not shown`
  +- `+N more matches/files/packages/errors/commits/branches`
  +- `[N more lines]`、`... N more lines (use tg --raw …)`
  +- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）
  +
  +这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。
  +
  +### 1.7 Rewrite engine
   
   在 hook 运行时，rewrite engine 负责将用户输入的 raw command 改写为 `tg` wrapper。这是集中式 command rewrite registry，输入 raw command，输出 `rewrite | suggest | pass | deny`。
   
  @@ -560,7 +603,8 @@ Parser 模块作为 handler filter 的基础设施，handler 可以选择：
  -  "raw_output_path": ".tg/raw/20260602-103000-git-status.log"
  +  "raw_output_path": ".tg/raw/20260602-103000-git-status.log",
  +  "quality_status": "passed"
   }
   ```
   
  @@ -581,6 +625,7 @@ tg report --csv        # CSV 格式
  +- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
   - `--user` 报告按项目分组，展示每个项目的独立统计。
   - `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
   - 不记录敏感原文，只记录命令类型、长度、策略结果和时间。
  @@ -886,7 +931,52 @@ model_policy:
  -## 13. Implementation Constraints
  +## 13. Future Token Digestion Layers
  +
  +Layer 1 已落在 command filter 质量门上。后续两层先保留在设计中，不进入当前实现范围。
  +
  +### 13.1 Layer 2: 少产生输出
  +
  +目标是在工具执行前减少高成本输出，而不是等 raw output 生成后再压缩。
  +
  +实现边界：
  +
  +- 新增 rewrite registry，输入 raw command，输出 `pass | rewrite | warn | deny`。
  +- `tg hook pretool` 读取 stdin JSON，对 `cat` lockfile、读依赖目录、无路径全仓 `rg`、`git diff`、测试命令等给出 rewrite/warn/deny。
  +- `tg hook posttool` 在宿主已经执行 raw command 时复用现有 handler 压缩输出，不重新执行命令。
  +- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。
  +
  +第一批规则只覆盖高价值命令：
  +
  +- `cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
  +- `cat node_modules/...`、`cat dist/...` → deny。
  +- `rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
  +- `git diff` → rewrite 到 `tg git diff`。
  +- `npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。
  +
  +### 13.2 Layer 3: 增加 cache hit
  +
  +目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用。
  +
  +实现边界：
  +
  +- 新增 content-addressed output cache：`.tg/cache/outputs/<hash>.json`。
  +- cache key 由 `cwd`、command、args、git HEAD、相关文件 fingerprint 构成。
  +- 重复命令在 fingerprint 未变时返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`。
  +- 新增 deterministic project context：`.tg/context.md` 和 `.tg/context.json`，按固定顺序输出 repo map、scripts、重要文件摘要和 section hashes。
  +- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。
  +
  +报告后续增加：
  +
  +- cacheable commands。
  +- cache hits。
  +- repeated output avoided tokens。
  +- stable chars / volatile chars。
  +- raw reuse hits。
  +
  +---
  +
  +## 14. Implementation Constraints
   
   - L6/L7 暂不考虑，文档和代码必须明确标注。
   - 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
  @@ -899,7 +989,7 @@ model_policy:
  -## 14. Development
  +## 15. Development
   
   ```bash
   pnpm install
  +120 -30

docs/testing-and-migration-audit.md
  @@ -15,7 +15,7 @@ Last audited: 2026-06-03
  -| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 42 real `fixtureCases`; current red tests expose real gaps. |
  +| Do passing tests all follow testing principles? | **Mostly for product tests** — product handler coverage now runs through 47 real `fixtureCases`; migration red tests expose real gaps. |
   | Do passing tests reflect project reality? | **Partially** — core handlers work on selected real fixtures and narrow integration paths; not production-wide or RTK 1:1. |
   
   **Baseline**
  @@ -199,14 +199,14 @@ Every RTK module migration is **done** when tg covers **all applicable rows** fo
  -| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **42 rows** across registered handlers; still needs deeper per-handler variants |
  +| **A Filter output (large / failure)** | `fixtureCases` row: `fixture` + `command` + `critical[]` + optional `forbidden[]` | `fixtureContent.test.ts` | **47 rows** across registered handlers; still needs deeper per-handler variants |
   | **B Arg parse & routing** | `router.test.ts` + `rtkDomainCaseParity` sample command → handler name | verified / migration gate | **Partial** — routing only, not arg edge cases |
   | **C Format transform** | Unit tests on exported pure functions **or** fixtureCases when output differs | fixtureCases / future parser units | **Still thin** — add real fixture variants or exported-parser units only |
   | **D Passthrough / small output** | `fixtureCases` with small fixture + max size assertion; `contracts` small-output rows | fixtureContent + (future) size caps | **Rare** — few P1 small-output cases |
   | **E Compression & limits** | `fixtureCases` on large fixture + `critical` + optional `expectLargeSavings` | fixtureContent | **Partial** — no savings-only tests count |
   | **F Empty / no-match** | `fixtureCases` or unit: empty input → no throw, sensible message | fixtureContent | **Sparse** |
   | **G Error / stderr** | `fixtureCases` with `exitCode != 0`, stderr in fixture or merged raw | fixtureContent | **Some** (pytest, ruff, tsc, …) |
  -| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Gaps now visible** — grep `-c`/`-l` pass; `rg --json` is red because current handler rewrites machine-readable output |
  +| **H CLI flags** | One fixtureCases row **per output format** (RTK: separate `test_format_flag_*`) | fixtureContent | **Partial** — grep `-c`/`-l` and `rg --json` are fixture-backed; more RTK variants remain |
   | **I Platform / encoding** | fixtureCases with paths/unicode in fixture file | fixtureContent | **Minimal** |
   | **J Malformed / unknown format** | fixtureCases: non-canonical stdout → not empty, not “0 matches” lie | fixtureContent | **Almost none** |
   | **K Module inventory** | Handler exists + at least one dimension-A row | `rtkDomainCaseParity` | **47 modules tracked; most fail** |
  @@ -219,7 +219,7 @@ As of 2026-06-03, tg test cases classified against the same A–K dimensions:
  -| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 42 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
  +| **A — Filter output** | ~315 | ~75+ | ⚠️ Thin | 47 fixtureCases rows are high quality, but per-handler depth is still shallow vs RTK |
   | **B — Arg parse/routing** | ~230 | ~55 routing / 0 internal parse | ⚠️ Routing ok, parse untested | Handler-internal parse functions (`formatStatus`, `parseMatch`, …) tested only through filter() pipeline, not in isolation |
   | **C — Format transform** | ~161 | ~14 | 🔴 Thin | Only searchLike has 5+ format variants; other handlers test one canonical format only |
   | **D — Passthrough/small output** | ~34 | ~14 | 🟢 Proportional | branch/list/search small-output rows now assert output growth limits |
  @@ -231,7 +231,7 @@ As of 2026-06-03, tg test cases classified against the same A–K dimensions:
  -**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed. `rg --json` deliberately stays red.
  +**Note on H:** The previous audit claimed grep -c/-l were covered by synthetic tests. Those tests were deleted; current coverage is real fixture-backed, including `rg --json`.
   
   **Naming / traceability:** each tg case should cite RTK source when porting:
   
  @@ -268,13 +268,13 @@ Or in unit tests: `// RTK: rtk/src/cmds/system/grep_cmd.rs test_parse_match_line
  -The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` was red (**120 pass / 1 fail**) because `rg --json` is now a real fixture-backed bug, and `pnpm test:migration` was red (**97 pass / 39 fail**). Treat failures as debt signals, not regressions to hide.
  +The migration suite (`vitest.migration.config.ts`) intentionally includes RTK migration, fixture wiring, regression debt, synthetic debt, and infrastructure parity gates. At audit time, `pnpm test:product` is green, and `pnpm test:migration` remains red because missing RTK handlers, scripts, and repo infrastructure are still tracked as debt. Treat failures as debt signals, not regressions to hide.
   
   ### 3.2 Categories of passing tests (quality tiers)
   
   | Tier | Examples | Follows P0/P1 principles? | Reflects real tool output? |
   |------|----------|---------------------------|----------------------------|
  -| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (42 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
  +| **A — Fidelity bar** | `fixtureContent.test.ts` → `fixtureCases` (47 scenarios) | **Yes** — `critical` / `forbidden` + `expectMeaningfulBody` | **Partial** — one or more real fixture paths per major handler |
   | **B — tg internals** | `savings`, `parse`, `router`, `pipeline`, `executor`, `ansi` | **Yes** for their scope | **N/A** (not handler filters) |
   | **C — E2E smoke** | `tests/integration/cli.test.ts` (~30 cases) | **Mostly** — real `spawn` of tg in temp dirs | **Partial** — narrow scenarios |
   | **D — Migration/debt only** | Routing parity, fixture wiring, fixture corpus size, script path parity | **No** for product behavior | **No** — existence/routing ≠ correct compression |
  @@ -284,7 +284,7 @@ The migration suite (`vitest.migration.config.ts`) intentionally includes RTK mi
  -3. **One fixture per handler is not enough** — `fixtureCases` covers 42 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
  +3. **One fixture per handler is not enough** — `fixtureCases` covers 47 rows, but many handlers still lack full RTK depth for format variants, stderr-only, and empty-output coverage.
   4. **fixtureCases wiring debt cleared** — orphaned on-disk fixtures (`rg_default_format`, `log_standard`, `show_large`, …) and commands (`tree`, `ls`, `pnpm list`, …) are now wired into `fixtureCases`.
   5. **Registered handler fixture coverage complete** — every registered non-generic handler has at least one `fixtureCases` row.
   6. **No synthetic handler contract tests** — global inline contracts were removed; use fixtureCases or explicit regression debt.
  @@ -293,7 +293,7 @@ The migration suite (`vitest.migration.config.ts`) intentionally includes RTK mi
  -12. **`rg --json` is now intentionally red** — current `search-like` rewrites JSON output into a search summary and drops machine-readable fields.
  +12. **Explicit machine-readable search output is covered** — `rg --json` now stays raw enough to preserve JSON fields; more grep/rg format variants still need parity work.
   
   ### 3.4 What passing tests *do* justify
   
  @@ -335,7 +335,7 @@ Merged from `docs/test-case-audit.md` (2026-06-03), **reconciled** with `vitest.
  -| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **42 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar; currently red on `rg --json` |
  +| `tests/unit/handlers/fixtureContent.test.ts` | ✅ | **47 `fixtureCases`** on real fixtures | Keep; expand rows — this is the handler behavior bar |
   
   #### 3.5.2 🗑️ Deleted synthetic handler tests (23 files)
   
  @@ -356,7 +356,7 @@ Replacement coverage now lives in:
  -| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (28) | Redundant subset | **Merge** into domain parity; then remove |
  +| `handlers/registeredHandlerCoverage.test.ts` | ✅ | Every handler has fixtureCases (29) | Redundant subset | **Merge** into domain parity; then remove |
   | `handlers/fixtureRegressionDebt.test.ts` | ✅ | Real fixture-backed regressions not yet implemented | **Debt gate** | Keep until fixed |
   | `handlers/fixtureWiring.test.ts` | ✅ | Known fixtures/commands wired into fixtureCases | **Debt gate** | Keep while fixtures expand |
   | `handlers/syntheticTestDebt.test.ts` | ✅ | Fails if synthetic handler tests return | **Guard** | Keep to prevent regression |
  @@ -373,7 +373,7 @@ Replacement coverage now lives in:
  -| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (3) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |
  +| `tests/integration/rtkParity.test.ts` | ✅ | grep/diff/cat stdin regressions (4) | **Keep** or merge into `cli.test.ts`; not a substitute for fixtureCases |
   
   #### 3.5.7 File tree (CI status)
   
  @@ -489,7 +489,7 @@ Every registered handler needs at least one test proving compressed output keeps
  -**Verified today:** 42 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Current red:** `rg --json` does not preserve explicit JSON output. **Still missing:** multi-scenario depth per handler and several real-format regressions in `fixtureRegressionDebt`.
  +**Verified today:** 47 rows in `tests/helpers/fixtureCases.ts` exercised by `fixtureContent.test.ts`. **Still missing:** multi-scenario depth per handler and remaining migration gaps outside the product suite.
   
   ### 5.3 P0: Unknown format handling
   
  @@ -591,7 +591,7 @@ src/cmds/system/format_cmd.rs             ─                                  
  -src/cmds/git/diff_cmd.rs                  ─ (no two-file diff handler)       ─
  +src/cmds/git/diff_cmd.rs                  diff.ts                            fixtureCases + fixtureContent
   src/cmds/git/gh_cmd.rs                    hostingCli.ts                      fixtureContent.test.ts
   src/cmds/git/glab_cmd.rs                  hostingCli.ts                      fixtureContent.test.ts
   src/cmds/git/gt_cmd.rs                    ─                                  ─
  @@ -649,11 +649,12 @@ Full RTK total: **986** `#[test]` in **47** modules. tg `test()` counts below ar
  +system/read.rs                8            7       partial via readLike
   system/find_cmd.rs           29           11       partial via listLike
   system/grep_cmd.rs           23           20       partial
   system/pipe_cmd.rs           38            0       no handler
   git/git.rs                   75           71       partial
  -git/diff_cmd.rs              19            0       no dedicated handler
  +git/diff_cmd.rs              19            4       partial via diff
   git/gh_cmd.rs                66           41       partial via hostingCli
   git/glab_cmd.rs              62           41       partial via hostingCli
   jvm/gradlew_cmd.rs           56           11       high gap; RTK gradlew fixtures ported, behavior depth still shallow
  @@ -668,7 +669,7 @@ rust/cargo_cmd.rs            48            0       no handler
  -| Diff compaction / hunk limits | ❓ diff.test partial; diff_cmd 19 tests unmigrated |
  +| Diff compaction / hunk limits | ❓ diff handler fixture-backed; most diff_cmd inline tests unmigrated |
   | Git extended subcommands | ✅ handlers; ❓ fixtureCases incomplete |
   | Pipe chaining | ❌ no handler |
   | Gradlew variants + fixtures | ❓ high gap |
  @@ -711,25 +712,26 @@ handler fidelity              fixtureContent.test.ts          ✅ product
  -| git diff_cmd, gt | ❌ | No dedicated coverage |
  +| git diff_cmd | ❓ | Dedicated two-file handler added; RTK inline depth still unmigrated |
  +| git gt | ❌ | No dedicated coverage |
   | gh/glab | ❓ | Fixture-backed coverage exists; RTK depth not fully mapped |
   | js/python/java mapped handlers | ❓ | Core scenarios; not full RTK parity |
   | js prettier/next/playwright/prisma | ❌ | No handler |
   | dotnet/cloud/go/rust/ruby | ❌ | No handler |
   | gradlew fixtures | ✅ | RTK corpus ported |
   | tg-only maven/javac/generic | ✅ | No RTK module |
  -| Verified CI green | ❌ | `fixtureContent` has intentional `rg --json` red; migration gates in §4 also red |
  +| Verified CI green | ❌ | Migration gates in §4 are still red |
   | Synthetic test debt | ✅ | 23 files deleted; guard remains |
   | benchmark TS + sessions + test-ruby | ❌ | rtkScriptParity |
   | GitHub CI + cli-testing.md | ❌ | projectConfig |
   
  -### Unacceptable gaps (29 RTK modules — no handler AND no migration test)
  +### Unacceptable gaps (28 RTK modules — no handler AND no migration test)
   
   **Cloud:** aws, curl, psql, wget, docker/kubectl  
   **JS:** prettier, next, playwright, prisma  
   **Languages:** go, golangci-lint, cargo/rust runner, ruby (rake/rspec/rubocop)  
   **.NET:** dotnet_cmd, binlog, trx, format_report  
  -**Git:** gt; dedicated `diff_cmd` two-file diff  
  +**Git:** gt
   **System:** log, json, env, wc, format, pipe, local_llm  
   
   ### Implemented but severely under-tested
  @@ -737,13 +739,13 @@ handler fidelity              fixtureContent.test.ts          ✅ product
  -| diff_cmd | 19 inline tests | 0 dedicated | **high** |
  +| diff_cmd | 19 inline tests | fixture-backed two-file + stdin unified + overflow subset | **high** |
   | git.rs | 75 inline tests | fixture-backed subset + regression debt | medium |
   | readLike / tree | 8 / 6 RTK | fixture-backed subset via listLike/readLike | medium |
   
   ### Relatively complete (product bar only)
   
  -- **42 `fixtureCases`** fidelity scenarios
  +- **47 `fixtureCases`** fidelity scenarios
   - **Core** unit + **integration/cli** smoke path
   - **Ported** shell scripts (§7 ✅ rows)
   - **tg-owned** fixture files on disk; current known orphaned fixture wiring cleared
  +24 -22

scripts/validate-docs.sh
  @@ -11,7 +11,7 @@ EXIT_CODE=0
  -    cat type less           # common/readLike.ts
  +    cat type less read      # common/readLike.ts
       ls dir find tree         # common/listLike.ts
       rg grep                  # common/searchLike.ts
       diff                     # common/diff.ts
  +1 -1

src/core/outputLimit.ts
  @@ -1,31 +1,13 @@
  -import { IMPORTANT_PATTERN } from "./patterns.js";
   
  -export function limitLines(text: string, maxLines: number): string {
  -  const lines = text.split(/\r?\n/);
  -  if (lines.length <= maxLines) return text;
  -
  -  const important = lines.filter((line) => IMPORTANT_PATTERN.test(line));
  -  const headCount = Math.max(1, Math.floor(maxLines / 3));
  -  const tailCount = Math.max(1, Math.floor(maxLines / 3));
  -  const middleBudget = Math.max(0, maxLines - headCount - tailCount - 1);
  -  const middle = important.slice(0, middleBudget);
  -
  -  return [
  -    ...lines.slice(0, headCount),
  -    ...middle,
  -    `... ${lines.length - maxLines} lines hidden ...`,
  -    ...lines.slice(-tailCount),
  -  ].join("\n");
  +export function limitLines(text: string, _maxLines: number): string {
  +  return text;
   }
   
  -export function limitChars(text: string, maxChars: number): string {
  -  if (text.length <= maxChars) return text;
  -  const head = text.slice(0, Math.floor(maxChars / 2));
  -  const tail = text.slice(text.length - Math.floor(maxChars / 2));
  -  return `${head}\n... ${text.length - maxChars} chars hidden ...\n${tail}`;
  +export function limitChars(text: string, _maxChars: number): string {
  +  return text;
   }
   
  -export function limitOutput(text: string, options: TgOptions): string {
  -  return limitChars(limitLines(text, options.maxLines), options.maxChars);
  +export function limitOutput(text: string, _options: TgOptions): string {
  +  return text;
   }
  +6 -24

src/core/patterns.ts
  @@ -1,6 +1,2 @@
  -
  -export function isNoisyPath(value: string): boolean {
  -  return /noise|node_modules|dist|build|target|coverage|\.git/.test(value);
  -}
  +0 -4

src/handlers/base.ts
  @@ -8,6 +8,24 @@ export function rawText(raw: RawResult): string {
  +export function outputOmitsContent(output: string): boolean {
  +  return output.split(/\r?\n/).some((line) => {
  +    const trimmed = line.trim();
  +    return (
  +      /^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/.test(trimmed) ||
  +      /^\[\d+ more lines\]$/.test(trimmed) ||
  +      /^more (lines|chars) \(use tg.*\)$/.test(trimmed) ||
  +      /^repetitive lines collapsed$/.test(trimmed) ||
  +      /^.*lines truncated\)$/.test(trimmed) ||
  +      /^\.\.\. \(more changes truncated\)$/.test(trimmed) ||
  +      /^- \.\.\. \d+ more$/.test(trimmed) ||
  +      /^Hidden:$/.test(trimmed) ||
  +      /^- \d+ (matches|files|packages|errors|commits|branches|dependencies) not shown$/.test(trimmed) ||
  +      /^Direct sample:$/.test(trimmed)
  +    );
  +  });
  +}
  +
   export async function makeFilteredResult(
     handler: string,
     raw: RawResult,
  @@ -15,14 +33,24 @@ export async function makeFilteredResult(
  -  const cleanRaw = limitOutput(removeAnsi(rawText(raw)), options);
  -  const cleanOutput = limitOutput(removeAnsi(output), options);
  +  const unlimitedRaw = removeAnsi(rawText(raw));
  +  const unlimitedOutput = removeAnsi(output);
  +  const cleanRaw = limitOutput(unlimitedRaw, options);
  +  const cleanOutput = limitOutput(unlimitedOutput, options);
     const rawHasContent = cleanRaw.trim().length > 0;
     const outputHasContent = cleanOutput.trim().length > 0;
  -  const outputInflatesRaw = rawHasContent && outputHasContent && cleanOutput.length > cleanRaw.length;
  +  const inflationBudget =
  +    cleanRaw.length <= 200 ? 0 : Math.max(80, Math.floor(cleanRaw.length * 0.05));
  +  const outputInflatesRaw =
  +    handler !== "git-diff" &&
  +    rawHasContent &&
  +    outputHasContent &&
  +    cleanOutput.length > cleanRaw.length + inflationBudget;
  +  const outputTruncatesContent =
  +    handler !== "git-diff" && rawHasContent && outputHasContent && outputOmitsContent(cleanOutput);
     const qualityStatus = !outputHasContent && rawHasContent
       ? "empty_output"
  -    : outputInflatesRaw
  +    : outputInflatesRaw || outputTruncatesContent
       ? "inflated"
       : "passed";
     const limited = qualityStatus === "passed" ? cleanOutput : cleanRaw;
  +32 -4

src/handlers/common/diff.ts
  @@ -58,47 +58,28 @@ function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
  -function formatTimestamp(date: Date): string {
  -  return date.toISOString().replace(".000Z", "Z");
  -}
  -
  -function formatLineNumber(value: number | "-"): string {
  -  return String(value).padStart(4, " ");
  -}
  -
   function formatDiffOutput(
     oldPath: string,
     newPath: string,
  -  oldMtime: Date,
  -  newMtime: Date,
  +  _oldMtime: Date,
  +  _newMtime: Date,
     oldText: string,
     newText: string,
   ): string {
     const changes = lcsChanges(splitLines(oldText), splitLines(newText));
     if (changes.length === 0) {
  -    return [
  -      `Files: ${oldPath} -> ${newPath}`,
  -      `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
  -      "Summary: +0 -0",
  -      "[ok] Files are identical",
  -      "",
  -    ].join("\n");
  +    return `${oldPath} -> ${newPath}\n[ok] Files are identical\n`;
     }
   
     const added = changes.filter((change) => change.kind === "added").length;
     const removed = changes.length - added;
  -  const lines = [
  -    `Files: ${oldPath} -> ${newPath}`,
  -    `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
  -    `Summary: +${added} -${removed}`,
  -    "",

... (more changes truncated)
  +3 -22
[full diff: rtk git diff --no-compact]

````

---

### 6. list-like: tree .

- Handler: `list-like`
- tg: `tg tree .`
- raw: `tree .`
- rtk: `tree .`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 124355 | 31089 | 0% |
| tg | 14811 | 3703 | 88.1% |
| rtk | 14685 | 3672 | 88.2% |

**raw** (124355 chars, 31089 tokens):

```text
.
├── README.md
├── dist
│   └── cli.js
├── docs
│   ├── DESIGN.md
│   ├── REPORT.md
│   ├── migration-goal-prompt.md
│   ├── testing-and-migration-audit.md
│   └── three-way-comparison.md
├── node_modules
│   ├── @types
│   │   └── node -> ../.pnpm/@types+node@25.9.1/node_modules/@types/node
│   ├── argparse
│   │   ├── CHANGELOG.md
│   │   ├── LICENSE
│   │   ├── README.md
│   │   ├── argparse.js
│   │   ├── lib
│   │   │   ├── sub.js
│   │   │   └── textwrap.js
│   │   └── package.json
│   ├── strip-ansi -> .pnpm/strip-ansi@7.2.0/node_modules/strip-ansi
│   ├── tsdown -> .pnpm/tsdown@0.22.1_tsx@4.22.4_typescript@6.0.3/node_modules/tsdown
│   ├── tsx -> .pnpm/tsx@4.22.4/node_modules/tsx
│   ├── typescript -> .pnpm/typescript@6.0.3/node_modules/typescript
│   └── vitest -> .pnpm/vitest@4.1.8_@types+node@25.9.1_vite@6.4.2_@types+node@25.9.1_tsx@4.22.4_/node_modules/vitest
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── rtk
│   ├── CHANGELOG.md
│   ├── CLAUDE.md
│   ├── CONTRIBUTING.md
│   ├── Cargo.lock
│   ├── Cargo.toml
│   ├── DISCLAIMER.md
│   ├── Formula
│   │   └── rtk.rb
│   ├── INSTALL.md
│   ├── LICENSE
│   ├── README.md
│   ├── README_es.md
│   ├── README_fr.md
│   ├── README_ja.md
│   ├── README_ko.md
│   ├── README_pt.md
│   ├── README_zh.md
│   ├── SECURITY.md
│   ├── build.rs
│   ├── docs
│   │   ├── TELEMETRY.md
│   │   ├── contributing
│   │   │   ├── ARCHITECTURE.md
│   │   │   ├── CODING_PRACTICES.md
│   │   │   └── TECHNICAL.md
│   │   ├── guide
│   │   │   ├── analytics
│   │   │   │   ├── discover.md
│   │   │   │   └── gain.md
│   │   │   ├── getting-started
│   │   │   │   ├── configuration.md
│   │   │   │   ├── installation.md
│   │   │   │   ├── quick-start.md
│   │   │   │   └── supported-agents.md
│   │   │   ├── index.md
│   │   │   └── resources
│   │   │       ├── telemetry.md
│   │   │       ├── troubleshooting.md
│   │   │       └── what-rtk-covers.md
│   │   ├── maintainers
│   │   │   └── MAINTAINERS_APPLY.md
│   │   └── usage
│   │       ├── AUDIT_GUIDE.md
│   │       ├── FEATURES.md
│   │       └── TRACKING.md
│   ├── hooks
│   │   ├── README.md
│   │   ├── antigravity
│   │   │   ├── README.md
│   │   │   └── rules.md
│   │   ├── claude
│   │   │   ├── README.md
│   │   │   ├── rtk-awareness.md
│   │   │   ├── rtk-rewrite.sh
│   │   │   └── test-rtk-rewrite.sh
│   │   ├── cline
│   │   │   ├── README.md
│   │   │   └── rules.md
│   │   ├── codex
│   │   │   ├── README.md
│   │   │   └── rtk-awareness.md
│   │   ├── copilot
│   │   │   ├── README.md
│   │   │   ├── rtk-awareness.md
│   │   │   └── test-rtk-rewrite.sh
│   │   ├── cursor
│   │   │   ├── README.md
│   │   │   └── rtk-rewrite.sh
│   │   ├── hermes
│   │   │   ├── README.md
│   │   │   ├── rtk-rewrite
│   │   │   │   ├── __init__.py
│   │   │   │   └── plugin.yaml
│   │   │   └── tests
│   │   │       ├── __init__.py
│   │   │       └── test_rtk_rewrite_plugin.py
│   │   ├── kilocode
│   │   │   ├── README.md
│   │   │   └── rules.md
│   │   ├── opencode
│   │   │   ├── README.md
│   │   │   └── rtk.ts
│   │   ├── pi
│   │   │   ├── README.md
│   │   │   └── rtk.ts
│   │   └── windsurf
│   │       ├── README.md
│   │       └── rules.md
│   ├── install.sh
│   ├── openclaw
│   │   ├── README.md
│   │   ├── index.ts
│   │   ├── openclaw.plugin.json
│   │   └── package.json
│   ├── release-please-config.json
│   ├── scripts
│   │   ├── benchmark
│   │   │   ├── cleanup.ts
│   │   │   ├── cloud-init.yaml
│   │   │   ├── lib
│   │   │   │   ├── report.ts
│   │   │   │   ├── test.ts
│   │   │   │   └── vm.ts
│   │   │   ├── rebuild.ts
│   │   │   └── run.ts
│   │   ├── benchmark-sessions
│   │   │   └── lib
│   │   │       └── runner.py
│   │   ├── benchmark.sh
│   │   ├── check-installation.sh
│   │   ├── check-test-presence.sh
│   │   ├── install-local.sh
│   │   ├── rtk-economics.sh
│   │   ├── test-all.sh
│   │   ├── test-aristote.sh
│   │   ├── test-install.sh
│   │   ├── test-ruby.sh
│   │   ├── test-tracking.sh
│   │   ├── update-readme-metrics.sh
│   │   └── validate-docs.sh
│   ├── src
│   │   ├── analytics
│   │   │   ├── README.md
│   │   │   ├── cc_economics.rs
│   │   │   ├── ccusage.rs
│   │   │   ├── gain.rs
│   │   │   ├── mod.rs
│   │   │   └── session_cmd.rs
│   │   ├── cmds
│   │   │   ├── README.md
│   │   │   ├── cloud
│   │   │   │   ├── README.md
│   │   │   │   ├── aws_cmd.rs
│   │   │   │   ├── container.rs
│   │   │   │   ├── curl_cmd.rs
│   │   │   │   ├── mod.rs
│   │   │   │   ├── psql_cmd.rs
│   │   │   │   └── wget_cmd.rs
│   │   │   ├── dotnet
│   │   │   │   ├── README.md
│   │   │   │   ├── binlog.rs
│   │   │   │   ├── dotnet_cmd.rs
│   │   │   │   ├── dotnet_format_report.rs
│   │   │   │   ├── dotnet_trx.rs
│   │   │   │   └── mod.rs
│   │   │   ├── git
│   │   │   │   ├── README.md
│   │   │   │   ├── diff_cmd.rs
│   │   │   │   ├── gh_cmd.rs
│   │   │   │   ├── git.rs
│   │   │   │   ├── glab_cmd.rs
│   │   │   │   ├── gt_cmd.rs
│   │   │   │   └── mod.rs
│   │   │   ├── go
│   │   │   │   ├── README.md
│   │   │   │   ├── go_cmd.rs
│   │   │   │   ├── golangci_cmd.rs
│   │   │   │   └── mod.rs
│   │   │   ├── js
│   │   │   │   ├── README.md
│   │   │   │   ├── lint_cmd.rs
│   │   │   │   ├── mod.rs
│   │   │   │   ├── next_cmd.rs
│   │   │   │   ├── npm_cmd.rs
│   │   │   │   ├── playwright_cmd.rs
│   │   │   │   ├── pnpm_cmd.rs
│   │   │   │   ├── prettier_cmd.rs
│   │   │   │   ├── prisma_cmd.rs
│   │   │   │   ├── tsc_cmd.rs
│   │   │   │   └── vitest_cmd.rs
│   │   │   ├── jvm
│   │   │   │   ├── gradlew_cmd.rs
│   │   │   │   └── mod.rs
│   │   │   ├── mod.rs
│   │   │   ├── python
│   │   │   │   ├── README.md
│   │   │   │   ├── mod.rs
│   │   │   │   ├── mypy_cmd.rs
│   │   │   │   ├── pip_cmd.rs
│   │   │   │   ├── pytest_cmd.rs
│   │   │   │   └── ruff_cmd.rs
│   │   │   ├── ruby
│   │   │   │   ├── README.md
│   │   │   │   ├── mod.rs
│   │   │   │   ├── rake_cmd.rs
│   │   │   │   ├── rspec_cmd.rs
│   │   │   │   └── rubocop_cmd.rs
│   │   │   ├── rust
│   │   │   │   ├── README.md
│   │   │   │   ├── cargo_cmd.rs
│   │   │   │   ├── mod.rs
│   │   │   │   └── runner.rs
│   │   │   └── system
│   │   │       ├── README.md
│   │   │       ├── constants.rs
│   │   │       ├── deps.rs
│   │   │       ├── env_cmd.rs
│   │   │       ├── find_cmd.rs
│   │   │       ├── format_cmd.rs
│   │   │       ├── grep_cmd.rs
│   │   │       ├── json_cmd.rs
│   │   │       ├── local_llm.rs
│   │   │       ├── log_cmd.rs
│   │   │       ├── ls.rs
│   │   │       ├── mod.rs
│   │   │       ├── pipe_cmd.rs
│   │   │       ├── read.rs
│   │   │       ├── summary.rs
│   │   │       ├── tree.rs
│   │   │       └── wc_cmd.rs
│   │   ├── core
│   │   │   ├── README.md
│   │   │   ├── args_utils.rs
│   │   │   ├── config.rs
│   │   │   ├── constants.rs
│   │   │   ├── display_helpers.rs
│   │   │   ├── filter.rs
│   │   │   ├── mod.rs
│   │   │   ├── runner.rs
│   │   │   ├── stream.rs
│   │   │   ├── tee.rs
│   │   │   ├── telemetry.rs
│   │   │   ├── telemetry_cmd.rs
│   │   │   ├── toml_filter.rs
│   │   │   ├── tracking.rs
│   │   │   ├── truncate.rs
│   │   │   └── utils.rs
│   │   ├── discover
│   │   │   ├── README.md
│   │   │   ├── lexer.rs
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs
│   │   │   ├── registry.rs
│   │   │   ├── report.rs
│   │   │   └── rules.rs
│   │   ├── filters
│   │   │   ├── README.md
│   │   │   ├── ansible-playbook.toml
│   │   │   ├── basedpyright.toml
│   │   │   ├── biome.toml
│   │   │   ├── brew-install.toml
│   │   │   ├── bundle-install.toml
│   │   │   ├── composer-install.toml
│   │   │   ├── df.toml
│   │   │   ├── dotnet-build.toml
│   │   │   ├── du.toml
│   │   │   ├── fail2ban-client.toml
│   │   │   ├── gcc.toml
│   │   │   ├── gcloud.toml
│   │   │   ├── gradle.toml
│   │   │   ├── hadolint.toml
│   │   │   ├── helm.toml
│   │   │   ├── iptables.toml
│   │   │   ├── jira.toml
│   │   │   ├── jj.toml
│   │   │   ├── jq.toml
│   │   │   ├── just.toml
│   │   │   ├── liquibase.toml
│   │   │   ├── make.toml
│   │   │   ├── markdownlint.toml
│   │   │   ├── mise.toml
│   │   │   ├── mix-compile.toml
│   │   │   ├── mix-format.toml
│   │   │   ├── mvn-build.toml
│   │   │   ├── nx.toml
│   │   │   ├── ollama.toml
│   │   │   ├── oxlint.toml
│   │   │   ├── ping.toml
│   │   │   ├── pio-run.toml
│   │   │   ├── poetry-install.toml
│   │   │   ├── pre-commit.toml
│   │   │   ├── ps.toml
│   │   │   ├── quarto-render.toml
│   │   │   ├── rsync.toml
│   │   │   ├── shellcheck.toml
│   │   │   ├── shopify-theme.toml
│   │   │   ├── skopeo.toml
│   │   │   ├── sops.toml
│   │   │   ├── spring-boot.toml
│   │   │   ├── ssh.toml
│   │   │   ├── stat.toml
│   │   │   ├── swift-build.toml
│   │   │   ├── systemctl-status.toml
│   │   │   ├── task.toml
│   │   │   ├── terraform-plan.toml
│   │   │   ├── tofu-fmt.toml
│   │   │   ├── tofu-init.toml
│   │   │   ├── tofu-plan.toml
│   │   │   ├── tofu-validate.toml
│   │   │   ├── trunk-build.toml
│   │   │   ├── turbo.toml
│   │   │   ├── ty.toml
│   │   │   ├── uv-sync.toml
│   │   │   ├── xcodebuild.toml
│   │   │   ├── yadm.toml
│   │   │   └── yamllint.toml
│   │   ├── hooks
│   │   │   ├── README.md
│   │   │   ├── constants.rs
│   │   │   ├── hook_audit_cmd.rs
│   │   │   ├── hook_check.rs
│   │   │   ├── hook_cmd.rs
│   │   │   ├── init.rs
│   │   │   ├── integrity.rs
│   │   │   ├── mod.rs
│   │   │   ├── permissions.rs
│   │   │   ├── rewrite_cmd.rs
│   │   │   ├── trust.rs
│   │   │   └── verify_cmd.rs
│   │   ├── learn
│   │   │   ├── README.md
│   │   │   ├── detector.rs
│   │   │   ├── mod.rs
│   │   │   └── report.rs
│   │   ├── main.rs
│   │   └── parser
│   │       ├── README.md
│   │       ├── formatter.rs
│   │       ├── mod.rs
│   │       └── types.rs
│   ├── target
│   │   ├── CACHEDIR.TAG
│   │   └── debug
│   │       ├── build
│   │       │   ├── ahash-22f49f9c5d662551
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-22f49f9c5d662551
│   │       │   │   └── build_script_build-22f49f9c5d662551.d
│   │       │   ├── ahash-982fbc426783444a
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── anyhow-0c9e8ad8c677d785
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-0c9e8ad8c677d785
│   │       │   │   └── build_script_build-0c9e8ad8c677d785.d
│   │       │   ├── anyhow-e987a1f7f6b09748
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── crc32fast-7c34a2189793b3bc
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── crc32fast-f59db741d9e64744
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-f59db741d9e64744
│   │       │   │   └── build_script_build-f59db741d9e64744.d
│   │       │   ├── crossbeam-utils-334d97f03ccc4b28
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-334d97f03ccc4b28
│   │       │   │   └── build_script_build-334d97f03ccc4b28.d
│   │       │   ├── crossbeam-utils-d658ab1340af2681
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── generic-array-6de08afde610f112
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-6de08afde610f112
│   │       │   │   └── build_script_build-6de08afde610f112.d
│   │       │   ├── generic-array-7534a23a150ae5e7
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── getrandom-68ae75a5aeb9b78f
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── getrandom-c978a6625a7ed05e
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-c978a6625a7ed05e
│   │       │   │   └── build_script_build-c978a6625a7ed05e.d
│   │       │   ├── icu_normalizer_data-9314daa3c0186b5e
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-9314daa3c0186b5e
│   │       │   │   └── build_script_build-9314daa3c0186b5e.d
│   │       │   ├── icu_normalizer_data-e3b5b25a23699df6
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── icu_properties_data-72fa264adfc1147d
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-72fa264adfc1147d
│   │       │   │   └── build_script_build-72fa264adfc1147d.d
│   │       │   ├── icu_properties_data-d9670f4806633f40
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── libc-19e50dba4050165a
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-19e50dba4050165a
│   │       │   │   └── build_script_build-19e50dba4050165a.d
│   │       │   ├── libc-41cd9a45e95485f4
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── libsqlite3-sys-97c456a35467867d
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-97c456a35467867d
│   │       │   │   └── build_script_build-97c456a35467867d.d
│   │       │   ├── libsqlite3-sys-c84dde3b937a9595
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   ├── bindgen.rs
│   │       │   │   │   ├── c877a2978823c39d-sqlite3.o
│   │       │   │   │   └── libsqlite3.a
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── num-traits-1b6ede2045f08b33
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── num-traits-1faef01599a3b7df
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-1faef01599a3b7df
│   │       │   │   └── build_script_build-1faef01599a3b7df.d
│   │       │   ├── proc-macro2-3750783767f65383
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-3750783767f65383
│   │       │   │   └── build_script_build-3750783767f65383.d
│   │       │   ├── proc-macro2-70ee98e01332a24c
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── quote-1c38ce90abdf5756
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-1c38ce90abdf5756
│   │       │   │   └── build_script_build-1c38ce90abdf5756.d
│   │       │   ├── quote-669c9c9fd1e1ccfb
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── ring-3179722d39684c7a
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   ├── 00c879ee3285a50d-montgomery.o
│   │       │   │   │   ├── 00c879ee3285a50d-montgomery_inv.o
│   │       │   │   │   ├── 0bbbd18bda93c05b-aes_nohw.o
│   │       │   │   │   ├── 25ac62e5b3c53843-curve25519.o
│   │       │   │   │   ├── a0330e891e733f4e-ecp_nistz.o
│   │       │   │   │   ├── a0330e891e733f4e-gfp_p256.o
│   │       │   │   │   ├── a0330e891e733f4e-gfp_p384.o
│   │       │   │   │   ├── a0330e891e733f4e-p256-nistz.o
│   │       │   │   │   ├── a0330e891e733f4e-p256.o
│   │       │   │   │   ├── a4019cc0736b0423-constant_time_test.o
│   │       │   │   │   ├── a4019cc0736b0423-mem.o
│   │       │   │   │   ├── aaa1ba3e455ee2e1-limbs.o
│   │       │   │   │   ├── c322a0bcc369f531-aesv8-armx-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-aesv8-gcm-armv8-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-armv8-mont-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-chacha-armv8-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-chacha20_poly1305_armv8-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-ghash-neon-armv8-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-ghashv8-armx-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-p256-armv8-asm-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-sha256-armv8-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-sha512-armv8-ios64.o
│   │       │   │   │   ├── c322a0bcc369f531-vpaes-armv8-ios64.o
│   │       │   │   │   ├── d5a9841f3dc6e253-poly1305.o
│   │       │   │   │   ├── libring_core_0_17_14_.a
│   │       │   │   │   └── libring_core_0_17_14__test.a
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── ring-6dbb2faf5d85058b
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-6dbb2faf5d85058b
│   │       │   │   └── build_script_build-6dbb2faf5d85058b.d
│   │       │   ├── rtk-28bca11757e9cb48
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-28bca11757e9cb48
│   │       │   │   └── build_script_build-28bca11757e9cb48.d
│   │       │   ├── rtk-b7fe0f8399a12f70
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   └── builtin_filters.toml
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── rustix-3fcbfca0f10b6c4b
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   └── rustix_test_can_compile
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── rustix-a336b2ce4ed63b35
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-a336b2ce4ed63b35
│   │       │   │   └── build_script_build-a336b2ce4ed63b35.d
│   │       │   ├── rustls-2abafdcce2d88aff
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-2abafdcce2d88aff
│   │       │   │   └── build_script_build-2abafdcce2d88aff.d
│   │       │   ├── rustls-7422fe02c5cf3d83
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── serde-27c2a1703f1af29a
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-27c2a1703f1af29a
│   │       │   │   └── build_script_build-27c2a1703f1af29a.d
│   │       │   ├── serde-3420c22ce357126d
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   └── private.rs
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── serde-38f8b19ce6b3bd83
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   └── private.rs
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── serde-daf26e5a57eca020
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-daf26e5a57eca020
│   │       │   │   └── build_script_build-daf26e5a57eca020.d
│   │       │   ├── serde_core-1934350fa34bab97
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   └── private.rs
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── serde_core-abeda580b07e193e
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-abeda580b07e193e
│   │       │   │   └── build_script_build-abeda580b07e193e.d
│   │       │   ├── serde_json-3982ee6bc29fb231
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-3982ee6bc29fb231
│   │       │   │   └── build_script_build-3982ee6bc29fb231.d
│   │       │   ├── serde_json-f4abe1d99afe2e41
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── typenum-32f0a859c85d86e0
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-32f0a859c85d86e0
│   │       │   │   └── build_script_build-32f0a859c85d86e0.d
│   │       │   ├── typenum-75ecf81369af7a8e
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   │   └── tests.rs
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── zerocopy-7ad58633fdcd276d
│   │       │   │   ├── build-script-build
│   │       │   │   ├── build_script_build-7ad58633fdcd276d
│   │       │   │   └── build_script_build-7ad58633fdcd276d.d
│   │       │   ├── zerocopy-fffd28aa939228d1
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   ├── zmij-18f804663394d5f0
│   │       │   │   ├── invoked.timestamp
│   │       │   │   ├── out
│   │       │   │   ├── output
│   │       │   │   ├── root-output
│   │       │   │   └── stderr
│   │       │   └── zmij-c04899bf3c0c2cb7
│   │       │       ├── build-script-build
│   │       │       ├── build_script_build-c04899bf3c0c2cb7
│   │       │       └── build_script_build-c04899bf3c0c2cb7.d
│   │       ├── deps
│   │       │   ├── adler2-64c835095168a10a.adler2.6aa53bb15819262-cgu.0.rcgu.o
│   │       │   ├── adler2-64c835095168a10a.d
│   │       │   ├── ahash-95354e48c66eec48.ahash.f2fdd67678289610-cgu.0.rcgu.o
│   │       │   ├── ahash-95354e48c66eec48.d
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.00.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.01.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.02.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.03.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.04.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.05.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.06.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.07.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.08.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.09.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.10.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.11.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.12.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.13.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.14.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.aho_corasick.4acbddf002e404fc-cgu.15.rcgu.o
│   │       │   ├── aho_corasick-cdf3c83e237959ef.d
│   │       │   ├── anstream-3831b1bd7aff54a0.anstream.760c5306cc4bcf7d-cgu.0.rcgu.o
│   │       │   ├── anstream-3831b1bd7aff54a0.anstream.760c5306cc4bcf7d-cgu.1.rcgu.o
│   │       │   ├── anstream-3831b1bd7aff54a0.d
│   │       │   ├── anstyle-b4fe550f34f36587.anstyle.482bd3785ceb58a6-cgu.0.rcgu.o
│   │       │   ├── anstyle-b4fe550f34f36587.d
│   │       │   ├── anstyle_parse-10bdeacd127c8e60.anstyle_parse.cac170d4480dfa3e-cgu.0.rcgu.o
│   │       │   ├── anstyle_parse-10bdeacd127c8e60.d
│   │       │   ├── anstyle_query-6d4120d3c1838155.anstyle_query.2e38704731db4fd3-cgu.0.rcgu.o
│   │       │   ├── anstyle_query-6d4120d3c1838155.d
│   │       │   ├── anyhow-e649a8b70a42d407.anyhow.55f2be7027da77b9-cgu.0.rcgu.o
│   │       │   ├── anyhow-e649a8b70a42d407.anyhow.55f2be7027da77b9-cgu.1.rcgu.o
│   │       │   ├── anyhow-e649a8b70a42d407.anyhow.55f2be7027da77b9-cgu.2.rcgu.o
│   │       │   ├── anyhow-e649a8b70a42d407.anyhow.55f2be7027da77b9-cgu.3.rcgu.o
│   │       │   ├── anyhow-e649a8b70a42d407.d
│   │       │   ├── autocfg-eb1adbf7d7f824ab.d
│   │       │   ├── automod-bcaa5d2fa3016978.d
│   │       │   ├── base64-5d57c3489a1b1f3f.base64.cb1807c008d85ae4-cgu.0.rcgu.o
│   │       │   ├── base64-5d57c3489a1b1f3f.d
│   │       │   ├── bitflags-0c88e1196654bdcc.bitflags.f8903b99f70764df-cgu.0.rcgu.o
│   │       │   ├── bitflags-0c88e1196654bdcc.d
│   │       │   ├── block_buffer-2263fb0aee01d4f1.block_buffer.6b131bb1a52d9d9-cgu.0.rcgu.o
│   │       │   ├── block_buffer-2263fb0aee01d4f1.d
│   │       │   ├── bstr-612d18e6bd6a31e8.bstr.92df3d478716b322-cgu.0.rcgu.o
│   │       │   ├── bstr-612d18e6bd6a31e8.bstr.92df3d478716b322-cgu.1.rcgu.o
│   │       │   ├── bstr-612d18e6bd6a31e8.d
│   │       │   ├── cc-9269b75a0fee70de.d
│   │       │   ├── cfg_if-2a7f818c77537d26.cfg_if.9728ab782cceec53-cgu.0.rcgu.o
│   │       │   ├── cfg_if-2a7f818c77537d26.d
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.00.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.01.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.02.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.03.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.04.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.05.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.06.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.07.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.08.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.09.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.10.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.11.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.12.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.13.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.14.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.chrono.eeded41dd8b1c993-cgu.15.rcgu.o
│   │       │   ├── chrono-0e0a140b22507986.d
│   │       │   ├── clap-ec47e798bb4b8590.clap.e659e8aaff484cff-cgu.0.rcgu.o
│   │       │   ├── clap-ec47e798bb4b8590.d
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.00.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.01.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.02.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.03.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.04.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.05.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.06.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.07.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.08.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.09.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.10.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.11.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.12.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.13.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.14.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.clap_builder.6e4ec1ebf0328db1-cgu.15.rcgu.o
│   │       │   ├── clap_builder-c226e7192a2d3278.d
│   │       │   ├── clap_derive-427371ee06c8a011.d
│   │       │   ├── clap_lex-614f43ed0505261c.clap_lex.5d6b4de4d1e18d17-cgu.0.rcgu.o
│   │       │   ├── clap_lex-614f43ed0505261c.d
│   │       │   ├── colorchoice-8ac4dd61e23bf519.colorchoice.9ab011b71593f1df-cgu.0.rcgu.o
│   │       │   ├── colorchoice-8ac4dd61e23bf519.d
│   │       │   ├── colored-a921a20faa4c7260.colored.f911381ee957f601-cgu.0.rcgu.o
│   │       │   ├── colored-a921a20faa4c7260.colored.f911381ee957f601-cgu.1.rcgu.o
│   │       │   ├── colored-a921a20faa4c7260.colored.f911381ee957f601-cgu.2.rcgu.o
│   │       │   ├── colored-a921a20faa4c7260.colored.f911381ee957f601-cgu.3.rcgu.o
│   │       │   ├── colored-a921a20faa4c7260.d
│   │       │   ├── core_foundation_sys-16810fe41fbf79a0.core_foundation_sys.6fbc3d7bed20340a-cgu.0.rcgu.o
│   │       │   ├── core_foundation_sys-16810fe41fbf79a0.d
│   │       │   ├── cpufeatures-adf7e34e409cd6ad.cpufeatures.71e0e85840a85e6b-cgu.0.rcgu.o
│   │       │   ├── cpufeatures-adf7e34e409cd6ad.d
│   │       │   ├── crc32fast-41950b6ca134946b.crc32fast.ec6af94bbbdb2863-cgu.0.rcgu.o
│   │       │   ├── crc32fast-41950b6ca134946b.d
│   │       │   ├── crossbeam_deque-ddc584d68f876e34.crossbeam_deque.b75db9fcf15ebb5c-cgu.0.rcgu.o
│   │       │   ├── crossbeam_deque-ddc584d68f876e34.d
│   │       │   ├── crossbeam_epoch-beb2586008e799db.crossbeam_epoch.19f1dfcc69896345-cgu.0.rcgu.o
│   │       │   ├── crossbeam_epoch-beb2586008e799db.d
│   │       │   ├── crossbeam_utils-4cd81ffa4e139484.crossbeam_utils.ab918dcb3eb18d0-cgu.0.rcgu.o
│   │       │   ├── crossbeam_utils-4cd81ffa4e139484.crossbeam_utils.ab918dcb3eb18d0-cgu.1.rcgu.o
│   │       │   ├── crossbeam_utils-4cd81ffa4e139484.d
│   │       │   ├── crypto_common-b486ceeb637804db.crypto_common.e5c2b229c6ab1880-cgu.0.rcgu.o
│   │       │   ├── crypto_common-b486ceeb637804db.d
│   │       │   ├── digest-455bb59883af92f9.d
│   │       │   ├── digest-455bb59883af92f9.digest.27551a92387b9a90-cgu.0.rcgu.o
│   │       │   ├── dirs-cb150edb464320e3.d
│   │       │   ├── dirs-cb150edb464320e3.dirs.ef6174da077d4650-cgu.0.rcgu.o
│   │       │   ├── dirs_sys-4e975ee80b0b412b.d
│   │       │   ├── dirs_sys-4e975ee80b0b412b.dirs_sys.e8307daf8deb117e-cgu.0.rcgu.o
│   │       │   ├── displaydoc-70e7bb630b7bcf6b.d
│   │       │   ├── env_home-47b39302e9dbb5ec.d
│   │       │   ├── env_home-47b39302e9dbb5ec.env_home.182489c627b431c8-cgu.0.rcgu.o
│   │       │   ├── equivalent-2cd6c5132e24fbbe.d
│   │       │   ├── equivalent-2cd6c5132e24fbbe.equivalent.8e8bea339bf10f21-cgu.0.rcgu.o
│   │       │   ├── errno-82413ebdaeb7d667.d
│   │       │   ├── errno-82413ebdaeb7d667.errno.c24712204ce8b4e8-cgu.0.rcgu.o
│   │       │   ├── fallible_iterator-3ec84098d7b7e34e.d
│   │       │   ├── fallible_iterator-3ec84098d7b7e34e.fallible_iterator.9a52f44af4f2921f-cgu.0.rcgu.o
│   │       │   ├── fallible_streaming_iterator-3a65923376336c98.d
│   │       │   ├── fallible_streaming_iterator-3a65923376336c98.fallible_streaming_iterator.62bc2c35c80191dd-cgu.0.rcgu.o
│   │       │   ├── fastrand-c5aefa511ba4b8ea.d
│   │       │   ├── fastrand-c5aefa511ba4b8ea.fastrand.bd2bff863f9655e8-cgu.0.rcgu.o
│   │       │   ├── find_msvc_tools-c437da8910f0873f.d
│   │       │   ├── flate2-5867f6bd0d3c50a9.d
│   │       │   ├── flate2-5867f6bd0d3c50a9.flate2.6fe1082a3d085717-cgu.0.rcgu.o
│   │       │   ├── form_urlencoded-d7bfb57e7f4e36ec.d
│   │       │   ├── form_urlencoded-d7bfb57e7f4e36ec.form_urlencoded.fe3ccdb2b6713260-cgu.0.rcgu.o
│   │       │   ├── generic_array-2b8d0c2782f98235.d
│   │       │   ├── generic_array-2b8d0c2782f98235.generic_array.79763fa281bc4d46-cgu.0.rcgu.o
│   │       │   ├── getrandom-509d8d30f45603e7.d
│   │       │   ├── getrandom-509d8d30f45603e7.getrandom.884fae88f9d2bcf4-cgu.0.rcgu.o
│   │       │   ├── getrandom-b260368392ca10fe.d
│   │       │   ├── getrandom-b260368392ca10fe.getrandom.ec6c5710a78ef5a-cgu.0.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.d
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.0.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.1.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.2.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.3.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.4.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.5.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.6.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.7.rcgu.o
│   │       │   ├── globset-5a286f7f598a85c4.globset.b9d4b62a7c445481-cgu.8.rcgu.o
│   │       │   ├── hashbrown-910e0c2865be2a4c.d
│   │       │   ├── hashbrown-910e0c2865be2a4c.hashbrown.e8e08c53a2eaf34-cgu.0.rcgu.o
│   │       │   ├── hashbrown-bf26d8d38f9ea95f.d
│   │       │   ├── hashbrown-bf26d8d38f9ea95f.hashbrown.51d8fcdb2beb2e2c-cgu.0.rcgu.o
│   │       │   ├── hashlink-36b2c54c3e5692a4.d
│   │       │   ├── hashlink-36b2c54c3e5692a4.hashlink.3b02c808609518a6-cgu.0.rcgu.o
│   │       │   ├── heck-bec7a1aa60f01201.d
│   │       │   ├── iana_time_zone-9dfffa45fb0eac22.d
│   │       │   ├── iana_time_zone-9dfffa45fb0eac22.iana_time_zone.bccfdb67eee3c005-cgu.0.rcgu.o
│   │       │   ├── icu_collections-9aa0a6a24213fa8a.d
│   │       │   ├── icu_collections-9aa0a6a24213fa8a.icu_collections.f6c7e5595d535a57-cgu.0.rcgu.o
│   │       │   ├── icu_collections-9aa0a6a24213fa8a.icu_collections.f6c7e5595d535a57-cgu.1.rcgu.o
│   │       │   ├── icu_collections-9aa0a6a24213fa8a.icu_collections.f6c7e5595d535a57-cgu.2.rcgu.o
│   │       │   ├── icu_collections-9aa0a6a24213fa8a.icu_collections.f6c7e5595d535a57-cgu.3.rcgu.o
│   │       │   ├── icu_locale_core-5b8029ac219d75ce.d
│   │       │   ├── icu_locale_core-5b8029ac219d75ce.icu_locale_core.a90dcccccf4a159b-cgu.0.rcgu.o
│   │       │   ├── icu_locale_core-5b8029ac219d75ce.icu_locale_core.a90dcccccf4a159b-cgu.1.rcgu.o
│   │       │   ├── icu_locale_core-5b8029ac219d75ce.icu_locale_core.a90dcccccf4a159b-cgu.2.rcgu.o
│   │       │   ├── icu_locale_core-5b8029ac219d75ce.icu_locale_core.a90dcccccf4a159b-cgu.3.rcgu.o
│   │       │   ├── icu_locale_core-5b8029ac219d75ce.icu_locale_core.a90dcccccf4a159b-cgu.4.rcgu.o
│   │       │   ├── icu_normalizer-bb57c38ce0f11e0d.d
│   │       │   ├── icu_normalizer-bb57c38ce0f11e0d.icu_normalizer.82783f450a4b2fc0-cgu.0.rcgu.o
│   │       │   ├── icu_normalizer-bb57c38ce0f11e0d.icu_normalizer.82783f450a4b2fc0-cgu.1.rcgu.o
│   │       │   ├── icu_normalizer-bb57c38ce0f11e0d.icu_normalizer.82783f450a4b2fc0-cgu.2.rcgu.o
│   │       │   ├── icu_normalizer-bb57c38ce0f11e0d.icu_normalizer.82783f450a4b2fc0-cgu.3.rcgu.o
│   │       │   ├── icu_normalizer-bb57c38ce0f11e0d.icu_normalizer.82783f450a4b2fc0-cgu.4.rcgu.o
│   │       │   ├── icu_normalizer_data-b2485254ea7ba4b3.d
│   │       │   ├── icu_normalizer_data-b2485254ea7ba4b3.icu_normalizer_data.cabd08a49def67e7-cgu.0.rcgu.o
│   │       │   ├── icu_properties-4cd821f8a5619b5a.d
│   │       │   ├── icu_properties-4cd821f8a5619b5a.icu_properties.6a1c26d0a61e902-cgu.0.rcgu.o
│   │       │   ├── icu_properties-4cd821f8a5619b5a.icu_properties.6a1c26d0a61e902-cgu.1.rcgu.o
│   │       │   ├── icu_properties-4cd821f8a5619b5a.icu_properties.6a1c26d0a61e902-cgu.2.rcgu.o
│   │       │   ├── icu_properties_data-c2ec432d2e8702dc.d
│   │       │   ├── icu_properties_data-c2ec432d2e8702dc.icu_properties_data.1a762e1177232a70-cgu.0.rcgu.o
│   │       │   ├── icu_provider-85973c57412ba6ba.d
│   │       │   ├── icu_provider-85973c57412ba6ba.icu_provider.1a49f18997e49c95-cgu.0.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.d
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.00.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.01.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.02.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.03.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.04.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.05.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.06.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.07.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.08.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.09.rcgu.o
│   │       │   ├── idna-8dd58a3f9b808910.idna.4816a9833800ecc2-cgu.10.rcgu.o
│   │       │   ├── idna_adapter-135431a5759e58d4.d
│   │       │   ├── idna_adapter-135431a5759e58d4.idna_adapter.bd79cd93161b78f0-cgu.0.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.d
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.00.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.01.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.02.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.03.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.04.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.05.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.06.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.07.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.08.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.09.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.10.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.11.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.12.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.13.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.14.rcgu.o
│   │       │   ├── ignore-e6158659c39701c5.ignore.61c1c3081b527405-cgu.15.rcgu.o
│   │       │   ├── indexmap-3f3ed6dbdd0b6f3a.d
│   │       │   ├── indexmap-3f3ed6dbdd0b6f3a.indexmap.14f0575ff42695f9-cgu.0.rcgu.o
│   │       │   ├── is_terminal_polyfill-9d4ab5a5f4e981bc.d
│   │       │   ├── is_terminal_polyfill-9d4ab5a5f4e981bc.is_terminal_polyfill.22c0830d95a38067-cgu.0.rcgu.o
│   │       │   ├── itoa-b7073a423bb55763.d
│   │       │   ├── itoa-b7073a423bb55763.itoa.f42212ec78e929c4-cgu.0.rcgu.o
│   │       │   ├── lazy_static-4cfba7580baa962b.d
│   │       │   ├── lazy_static-4cfba7580baa962b.lazy_static.32bea30e37513487-cgu.0.rcgu.o
│   │       │   ├── libadler2-64c835095168a10a.rlib
│   │       │   ├── libadler2-64c835095168a10a.rmeta
│   │       │   ├── libahash-95354e48c66eec48.rlib
│   │       │   ├── libahash-95354e48c66eec48.rmeta
│   │       │   ├── libaho_corasick-cdf3c83e237959ef.rlib
│   │       │   ├── libaho_corasick-cdf3c83e237959ef.rmeta
│   │       │   ├── libanstream-3831b1bd7aff54a0.rlib
│   │       │   ├── libanstream-3831b1bd7aff54a0.rmeta
│   │       │   ├── libanstyle-b4fe550f34f36587.rlib
│   │       │   ├── libanstyle-b4fe550f34f36587.rmeta
│   │       │   ├── libanstyle_parse-10bdeacd127c8e60.rlib
│   │       │   ├── libanstyle_parse-10bdeacd127c8e60.rmeta
│   │       │   ├── libanstyle_query-6d4120d3c1838155.rlib
│   │       │   ├── libanstyle_query-6d4120d3c1838155.rmeta
│   │       │   ├── libanyhow-e649a8b70a42d407.rlib
│   │       │   ├── libanyhow-e649a8b70a42d407.rmeta
│   │       │   ├── libautocfg-eb1adbf7d7f824ab.rlib
│   │       │   ├── libautocfg-eb1adbf7d7f824ab.rmeta
│   │       │   ├── libautomod-bcaa5d2fa3016978.dylib
│   │       │   ├── libbase64-5d57c3489a1b1f3f.rlib
│   │       │   ├── libbase64-5d57c3489a1b1f3f.rmeta
│   │       │   ├── libbitflags-0c88e1196654bdcc.rlib
│   │       │   ├── libbitflags-0c88e1196654bdcc.rmeta
│   │       │   ├── libblock_buffer-2263fb0aee01d4f1.rlib
│   │       │   ├── libblock_buffer-2263fb0aee01d4f1.rmeta
│   │       │   ├── libbstr-612d18e6bd6a31e8.rlib
│   │       │   ├── libbstr-612d18e6bd6a31e8.rmeta
│   │       │   ├── libc-a3a0d74343bc2d00.d
│   │       │   ├── libc-a3a0d74343bc2d00.libc.e443d092203980d1-cgu.0.rcgu.o
│   │       │   ├── libcc-9269b75a0fee70de.rlib
│   │       │   ├── libcc-9269b75a0fee70de.rmeta
│   │       │   ├── libcfg_if-2a7f818c77537d26.rlib
│   │       │   ├── libcfg_if-2a7f818c77537d26.rmeta
│   │       │   ├── libchrono-0e0a140b22507986.rlib
│   │       │   ├── libchrono-0e0a140b22507986.rmeta
│   │       │   ├── libclap-ec47e798bb4b8590.rlib
│   │       │   ├── libclap-ec47e798bb4b8590.rmeta
│   │       │   ├── libclap_builder-c226e7192a2d3278.rlib
│   │       │   ├── libclap_builder-c226e7192a2d3278.rmeta
│   │       │   ├── libclap_derive-427371ee06c8a011.dylib
│   │       │   ├── libclap_lex-614f43ed0505261c.rlib
│   │       │   ├── libclap_lex-614f43ed0505261c.rmeta
│   │       │   ├── libcolorchoice-8ac4dd61e23bf519.rlib
│   │       │   ├── libcolorchoice-8ac4dd61e23bf519.rmeta
│   │       │   ├── libcolored-a921a20faa4c7260.rlib
│   │       │   ├── libcolored-a921a20faa4c7260.rmeta
│   │       │   ├── libcore_foundation_sys-16810fe41fbf79a0.rlib
│   │       │   ├── libcore_foundation_sys-16810fe41fbf79a0.rmeta
│   │       │   ├── libcpufeatures-adf7e34e409cd6ad.rlib
│   │       │   ├── libcpufeatures-adf7e34e409cd6ad.rmeta
│   │       │   ├── libcrc32fast-41950b6ca134946b.rlib
│   │       │   ├── libcrc32fast-41950b6ca134946b.rmeta
│   │       │   ├── libcrossbeam_deque-ddc584d68f876e34.rlib
│   │       │   ├── libcrossbeam_deque-ddc584d68f876e34.rmeta
│   │       │   ├── libcrossbeam_epoch-beb2586008e799db.rlib
│   │       │   ├── libcrossbeam_epoch-beb2586008e799db.rmeta
│   │       │   ├── libcrossbeam_utils-4cd81ffa4e139484.rlib
│   │       │   ├── libcrossbeam_utils-4cd81ffa4e139484.rmeta
│   │       │   ├── libcrypto_common-b486ceeb637804db.rlib
│   │       │   ├── libcrypto_common-b486ceeb637804db.rmeta
│   │       │   ├── libdigest-455bb59883af92f9.rlib
│   │       │   ├── libdigest-455bb59883af92f9.rmeta
│   │       │   ├── libdirs-cb150edb464320e3.rlib
│   │       │   ├── libdirs-cb150edb464320e3.rmeta
│   │       │   ├── libdirs_sys-4e975ee80b0b412b.rlib
│   │       │   ├── libdirs_sys-4e975ee80b0b412b.rmeta
│   │       │   ├── libdisplaydoc-70e7bb630b7bcf6b.dylib
│   │       │   ├── libenv_home-47b39302e9dbb5ec.rlib
│   │       │   ├── libenv_home-47b39302e9dbb5ec.rmeta
│   │       │   ├── libequivalent-2cd6c5132e24fbbe.rlib
│   │       │   ├── libequivalent-2cd6c5132e24fbbe.rmeta
│   │       │   ├── liberrno-82413ebdaeb7d667.rlib
│   │       │   ├── liberrno-82413ebdaeb7d667.rmeta
│   │       │   ├── libfallible_iterator-3ec84098d7b7e34e.rlib
│   │       │   ├── libfallible_iterator-3ec84098d7b7e34e.rmeta
│   │       │   ├── libfallible_streaming_iterator-3a65923376336c98.rlib
│   │       │   ├── libfallible_streaming_iterator-3a65923376336c98.rmeta
│   │       │   ├── libfastrand-c5aefa511ba4b8ea.rlib
│   │       │   ├── libfastrand-c5aefa511ba4b8ea.rmeta
│   │       │   ├── libfind_msvc_tools-c437da8910f0873f.rlib
│   │       │   ├── libfind_msvc_tools-c437da8910f0873f.rmeta
│   │       │   ├── libflate2-5867f6bd0d3c50a9.rlib
│   │       │   ├── libflate2-5867f6bd0d3c50a9.rmeta
│   │       │   ├── libform_urlencoded-d7bfb57e7f4e36ec.rlib
│   │       │   ├── libform_urlencoded-d7bfb57e7f4e36ec.rmeta
│   │       │   ├── libgeneric_array-2b8d0c2782f98235.rlib
│   │       │   ├── libgeneric_array-2b8d0c2782f98235.rmeta
│   │       │   ├── libgetrandom-509d8d30f45603e7.rlib
│   │       │   ├── libgetrandom-509d8d30f45603e7.rmeta
│   │       │   ├── libgetrandom-b260368392ca10fe.rlib
│   │       │   ├── libgetrandom-b260368392ca10fe.rmeta
│   │       │   ├── libglobset-5a286f7f598a85c4.rlib
│   │       │   ├── libglobset-5a286f7f598a85c4.rmeta
│   │       │   ├── libhashbrown-910e0c2865be2a4c.rlib
│   │       │   ├── libhashbrown-910e0c2865be2a4c.rmeta
│   │       │   ├── libhashbrown-bf26d8d38f9ea95f.rlib
│   │       │   ├── libhashbrown-bf26d8d38f9ea95f.rmeta
│   │       │   ├── libhashlink-36b2c54c3e5692a4.rlib
│   │       │   ├── libhashlink-36b2c54c3e5692a4.rmeta
│   │       │   ├── libheck-bec7a1aa60f01201.rlib
│   │       │   ├── libheck-bec7a1aa60f01201.rmeta
│   │       │   ├── libiana_time_zone-9dfffa45fb0eac22.rlib
│   │       │   ├── libiana_time_zone-9dfffa45fb0eac22.rmeta
│   │       │   ├── libicu_collections-9aa0a6a24213fa8a.rlib
│   │       │   ├── libicu_collections-9aa0a6a24213fa8a.rmeta
│   │       │   ├── libicu_locale_core-5b8029ac219d75ce.rlib
│   │       │   ├── libicu_locale_core-5b8029ac219d75ce.rmeta
│   │       │   ├── libicu_normalizer-bb57c38ce0f11e0d.rlib
│   │       │   ├── libicu_normalizer-bb57c38ce0f11e0d.rmeta
│   │       │   ├── libicu_normalizer_data-b2485254ea7ba4b3.rlib
│   │       │   ├── libicu_normalizer_data-b2485254ea7ba4b3.rmeta
│   │       │   ├── libicu_properties-4cd821f8a5619b5a.rlib
│   │       │   ├── libicu_properties-4cd821f8a5619b5a.rmeta
│   │       │   ├── libicu_properties_data-c2ec432d2e8702dc.rlib
│   │       │   ├── libicu_properties_data-c2ec432d2e8702dc.rmeta
│   │       │   ├── libicu_provider-85973c57412ba6ba.rlib
│   │       │   ├── libicu_provider-85973c57412ba6ba.rmeta
│   │       │   ├── libidna-8dd58a3f9b808910.rlib
│   │       │   ├── libidna-8dd58a3f9b808910.rmeta
│   │       │   ├── libidna_adapter-135431a5759e58d4.rlib
│   │       │   ├── libidna_adapter-135431a5759e58d4.rmeta
│   │       │   ├── libignore-e6158659c39701c5.rlib
│   │       │   ├── libignore-e6158659c39701c5.rmeta
│   │       │   ├── libindexmap-3f3ed6dbdd0b6f3a.rlib
│   │       │   ├── libindexmap-3f3ed6dbdd0b6f3a.rmeta
│   │       │   ├── libis_terminal_polyfill-9d4ab5a5f4e981bc.rlib
│   │       │   ├── libis_terminal_polyfill-9d4ab5a5f4e981bc.rmeta
│   │       │   ├── libitoa-b7073a423bb55763.rlib
│   │       │   ├── libitoa-b7073a423bb55763.rmeta
│   │       │   ├── liblazy_static-4cfba7580baa962b.rlib
│   │       │   ├── liblazy_static-4cfba7580baa962b.rmeta
│   │       │   ├── liblibc-a3a0d74343bc2d00.rlib
│   │       │   ├── liblibc-a3a0d74343bc2d00.rmeta
│   │       │   ├── liblibsqlite3_sys-994b2dbc8cfa61aa.rlib
│   │       │   ├── liblibsqlite3_sys-994b2dbc8cfa61aa.rmeta
│   │       │   ├── liblitemap-b94f5ff2c438a28a.rlib
│   │       │   ├── liblitemap-b94f5ff2c438a28a.rmeta
│   │       │   ├── liblog-953a24ffe592df75.rlib
│   │       │   ├── liblog-953a24ffe592df75.rmeta
│   │       │   ├── libmemchr-01535517e9777383.rlib
│   │       │   ├── libmemchr-01535517e9777383.rmeta
│   │       │   ├── libminiz_oxide-7e13cf2da95cc7c7.rlib
│   │       │   ├── libminiz_oxide-7e13cf2da95cc7c7.rmeta
│   │       │   ├── libnum_traits-3b4acb55b099b45f.rlib
│   │       │   ├── libnum_traits-3b4acb55b099b45f.rmeta
│   │       │   ├── libonce_cell-50f041e3c271b2a5.rlib
│   │       │   ├── libonce_cell-50f041e3c271b2a5.rmeta
│   │       │   ├── liboption_ext-97d4bf1338b842f3.rlib
│   │       │   ├── liboption_ext-97d4bf1338b842f3.rmeta
│   │       │   ├── libpercent_encoding-acc324cd35fb0ef7.rlib
│   │       │   ├── libpercent_encoding-acc324cd35fb0ef7.rmeta
│   │       │   ├── libpkg_config-6e94e5d1a8aeb5a2.rlib
│   │       │   ├── libpkg_config-6e94e5d1a8aeb5a2.rmeta
│   │       │   ├── libpotential_utf-33bbae53167d3fed.rlib
│   │       │   ├── libpotential_utf-33bbae53167d3fed.rmeta
│   │       │   ├── libproc_macro2-ebae5084726c18f9.rlib
│   │       │   ├── libproc_macro2-ebae5084726c18f9.rmeta
│   │       │   ├── libquick_xml-d110f9f7fc884583.rlib
│   │       │   ├── libquick_xml-d110f9f7fc884583.rmeta
│   │       │   ├── libquote-9425c3b27d2cbe95.rlib
│   │       │   ├── libquote-9425c3b27d2cbe95.rmeta
│   │       │   ├── libregex-7fc052b65a33dce0.rlib
│   │       │   ├── libregex-7fc052b65a33dce0.rmeta
│   │       │   ├── libregex_automata-6be0acdcc380d0e6.rlib
│   │       │   ├── libregex_automata-6be0acdcc380d0e6.rmeta
│   │       │   ├── libregex_syntax-265e37a1535a8152.rlib
│   │       │   ├── libregex_syntax-265e37a1535a8152.rmeta
│   │       │   ├── libring-f947df43693ca0df.rlib
│   │       │   ├── libring-f947df43693ca0df.rmeta
│   │       │   ├── librusqlite-69890142cb417ca2.rlib
│   │       │   ├── librusqlite-69890142cb417ca2.rmeta
│   │       │   ├── librustix-0141696396229331.rlib
│   │       │   ├── librustix-0141696396229331.rmeta
│   │       │   ├── librustls-dbe2bb7fe0bd24de.rlib
│   │       │   ├── librustls-dbe2bb7fe0bd24de.rmeta
│   │       │   ├── librustls_pki_types-69033c6b3d4c0502.rlib
│   │       │   ├── librustls_pki_types-69033c6b3d4c0502.rmeta
│   │       │   ├── libsame_file-385d8d7838b20841.rlib
│   │       │   ├── libsame_file-385d8d7838b20841.rmeta
│   │       │   ├── libserde-02040be0a9c705b0.rlib
│   │       │   ├── libserde-02040be0a9c705b0.rmeta
│   │       │   ├── libserde-a53ea91e83b2fb3b.rlib
│   │       │   ├── libserde-a53ea91e83b2fb3b.rmeta
│   │       │   ├── libserde_core-99f6d1bf1e213b1f.rlib
│   │       │   ├── libserde_core-99f6d1bf1e213b1f.rmeta
│   │       │   ├── libserde_derive-1e04f8a94167e775.dylib
│   │       │   ├── libserde_json-60254bae73babdf9.rlib
│   │       │   ├── libserde_json-60254bae73babdf9.rmeta
│   │       │   ├── libserde_spanned-2f9d6bf8e767a857.rlib
│   │       │   ├── libserde_spanned-2f9d6bf8e767a857.rmeta
│   │       │   ├── libserde_spanned-acae31d695f3eefb.rlib
│   │       │   ├── libserde_spanned-acae31d695f3eefb.rmeta
│   │       │   ├── libsha2-c79e523aa9247cfe.rlib
│   │       │   ├── libsha2-c79e523aa9247cfe.rmeta
│   │       │   ├── libshlex-4e4d2ed3449c4a89.rlib
│   │       │   ├── libshlex-4e4d2ed3449c4a89.rmeta
│   │       │   ├── libsimd_adler32-b55184072ed93004.rlib
│   │       │   ├── libsimd_adler32-b55184072ed93004.rmeta
│   │       │   ├── libsmallvec-966617ed4101d6ba.rlib
│   │       │   ├── libsmallvec-966617ed4101d6ba.rmeta
│   │       │   ├── libsqlite3_sys-994b2dbc8cfa61aa.d
│   │       │   ├── libsqlite3_sys-994b2dbc8cfa61aa.libsqlite3_sys.89015e12f07ff4b6-cgu.0.rcgu.o
│   │       │   ├── libstable_deref_trait-109e7c4905ab6911.rlib
│   │       │   ├── libstable_deref_trait-109e7c4905ab6911.rmeta
│   │       │   ├── libstrsim-a076c49d32a61f1e.rlib
│   │       │   ├── libstrsim-a076c49d32a61f1e.rmeta
│   │       │   ├── libsubtle-928382021cefef33.rlib
│   │       │   ├── libsubtle-928382021cefef33.rmeta
│   │       │   ├── libsyn-bb20ed08ac236735.rlib
│   │       │   ├── libsyn-bb20ed08ac236735.rmeta
│   │       │   ├── libsynstructure-29eb75bed1f7385e.rlib
│   │       │   ├── libsynstructure-29eb75bed1f7385e.rmeta
│   │       │   ├── libtempfile-6992a15e9dac32c1.rlib
│   │       │   ├── libtempfile-6992a15e9dac32c1.rmeta
│   │       │   ├── libtinystr-6cf2611e9f981ded.rlib
│   │       │   ├── libtinystr-6cf2611e9f981ded.rmeta
│   │       │   ├── libtoml-4089104368006fa6.rlib
│   │       │   ├── libtoml-4089104368006fa6.rmeta
│   │       │   ├── libtoml-895fb67bb3dabb31.rlib
│   │       │   ├── libtoml-895fb67bb3dabb31.rmeta
│   │       │   ├── libtoml_datetime-6ad5655818fef83a.rlib
│   │       │   ├── libtoml_datetime-6ad5655818fef83a.rmeta
│   │       │   ├── libtoml_datetime-eee6fbf66f10d096.rlib
│   │       │   ├── libtoml_datetime-eee6fbf66f10d096.rmeta
│   │       │   ├── libtoml_edit-47c1b79707b201e6.rlib
│   │       │   ├── libtoml_edit-47c1b79707b201e6.rmeta
│   │       │   ├── libtoml_edit-ad2e732f1992fb37.rlib
│   │       │   ├── libtoml_edit-ad2e732f1992fb37.rmeta
│   │       │   ├── libtoml_write-19fa778102acde31.rlib
│   │       │   ├── libtoml_write-19fa778102acde31.rmeta
│   │       │   ├── libtypenum-62272f6b656edf9f.rlib
│   │       │   ├── libtypenum-62272f6b656edf9f.rmeta
│   │       │   ├── libunicode_ident-d40ac0487c7d67b5.rlib
│   │       │   ├── libunicode_ident-d40ac0487c7d67b5.rmeta
│   │       │   ├── libuntrusted-6b0354ff3edb18c4.rlib
│   │       │   ├── libuntrusted-6b0354ff3edb18c4.rmeta
│   │       │   ├── libureq-c4ba7c29c3b4b21f.rlib
│   │       │   ├── libureq-c4ba7c29c3b4b21f.rmeta
│   │       │   ├── liburl-1cc9ae4fe6d8f8d1.rlib
│   │       │   ├── liburl-1cc9ae4fe6d8f8d1.rmeta
│   │       │   ├── libutf8_iter-61ca497e0d5f4ddc.rlib
│   │       │   ├── libutf8_iter-61ca497e0d5f4ddc.rmeta
│   │       │   ├── libutf8parse-e3564df468e33e85.rlib
│   │       │   ├── libutf8parse-e3564df468e33e85.rmeta
│   │       │   ├── libvcpkg-5b5bc19a0f0a322c.rlib
│   │       │   ├── libvcpkg-5b5bc19a0f0a322c.rmeta
│   │       │   ├── libversion_check-a38ac275d10c0882.rlib
│   │       │   ├── libversion_check-a38ac275d10c0882.rmeta
│   │       │   ├── libwalkdir-038025453432a2d1.rlib
│   │       │   ├── libwalkdir-038025453432a2d1.rmeta
│   │       │   ├── libwebpki-33cc1d8f828c7ee6.rlib
│   │       │   ├── libwebpki-33cc1d8f828c7ee6.rmeta
│   │       │   ├── libwebpki_roots-a5df9ba994be669d.rlib
│   │       │   ├── libwebpki_roots-a5df9ba994be669d.rmeta
│   │       │   ├── libwebpki_roots-e130b21c96a6e47e.rlib
│   │       │   ├── libwebpki_roots-e130b21c96a6e47e.rmeta
│   │       │   ├── libwhich-abb972d9ffb59647.rlib
│   │       │   ├── libwhich-abb972d9ffb59647.rmeta
│   │       │   ├── libwinnow-65964a6026f0d24c.rlib
│   │       │   ├── libwinnow-65964a6026f0d24c.rmeta
│   │       │   ├── libwriteable-0240f565982d0564.rlib
│   │       │   ├── libwriteable-0240f565982d0564.rmeta
│   │       │   ├── libyoke-7e03d2bda2464900.rlib
│   │       │   ├── libyoke-7e03d2bda2464900.rmeta
│   │       │   ├── libyoke_derive-4c556ad352559d7b.dylib
│   │       │   ├── libzerocopy-bd378c85de2f1b46.rlib
│   │       │   ├── libzerocopy-bd378c85de2f1b46.rmeta
│   │       │   ├── libzerofrom-45a13ce8792f9340.rlib
│   │       │   ├── libzerofrom-45a13ce8792f9340.rmeta
│   │       │   ├── libzerofrom_derive-520620fc2ade43f6.dylib
│   │       │   ├── libzeroize-0cbf3f5bda8cfbcf.rlib
│   │       │   ├── libzeroize-0cbf3f5bda8cfbcf.rmeta
│   │       │   ├── libzerotrie-b33568c0a418e80e.rlib
│   │       │   ├── libzerotrie-b33568c0a418e80e.rmeta
│   │       │   ├── libzerovec-ba9e9bcfa02e28fe.rlib
│   │       │   ├── libzerovec-ba9e9bcfa02e28fe.rmeta
│   │       │   ├── libzerovec_derive-653a87cffa56edf8.dylib
│   │       │   ├── libzmij-f6e9544cf6ca7196.rlib
│   │       │   ├── libzmij-f6e9544cf6ca7196.rmeta
│   │       │   ├── litemap-b94f5ff2c438a28a.d
│   │       │   ├── litemap-b94f5ff2c438a28a.litemap.6ad15137853399bd-cgu.0.rcgu.o
│   │       │   ├── log-953a24ffe592df75.d
│   │       │   ├── log-953a24ffe592df75.log.a455e1d0fc98a937-cgu.0.rcgu.o
│   │       │   ├── memchr-01535517e9777383.d
│   │       │   ├── memchr-01535517e9777383.memchr.2f62b5148064a582-cgu.0.rcgu.o
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.d
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.miniz_oxide.ea0989364e219fa7-cgu.0.rcgu.o
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.miniz_oxide.ea0989364e219fa7-cgu.1.rcgu.o
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.miniz_oxide.ea0989364e219fa7-cgu.2.rcgu.o
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.miniz_oxide.ea0989364e219fa7-cgu.3.rcgu.o
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.miniz_oxide.ea0989364e219fa7-cgu.4.rcgu.o
│   │       │   ├── miniz_oxide-7e13cf2da95cc7c7.miniz_oxide.ea0989364e219fa7-cgu.5.rcgu.o
│   │       │   ├── num_traits-3b4acb55b099b45f.d
│   │       │   ├── num_traits-3b4acb55b099b45f.num_traits.f643fe7bbb62b28e-cgu.0.rcgu.o
│   │       │   ├── once_cell-50f041e3c271b2a5.d
│   │       │   ├── once_cell-50f041e3c271b2a5.once_cell.84c436b31b05c2c5-cgu.0.rcgu.o
│   │       │   ├── option_ext-97d4bf1338b842f3.d
│   │       │   ├── option_ext-97d4bf1338b842f3.option_ext.176858a331112868-cgu.0.rcgu.o
│   │       │   ├── percent_encoding-acc324cd35fb0ef7.d
│   │       │   ├── percent_encoding-acc324cd35fb0ef7.percent_encoding.9f60ca17f1b3f117-cgu.0.rcgu.o
│   │       │   ├── pkg_config-6e94e5d1a8aeb5a2.d
│   │       │   ├── potential_utf-33bbae53167d3fed.d
│   │       │   ├── potential_utf-33bbae53167d3fed.potential_utf.ce0fa77b019506d9-cgu.0.rcgu.o
│   │       │   ├── proc_macro2-ebae5084726c18f9.d
│   │       │   ├── quick_xml-d110f9f7fc884583.d
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.0.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.1.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.2.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.3.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.4.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.5.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.6.rcgu.o
│   │       │   ├── quick_xml-d110f9f7fc884583.quick_xml.2a9ec30b9954b39a-cgu.7.rcgu.o
│   │       │   ├── quote-9425c3b27d2cbe95.d
│   │       │   ├── regex-7fc052b65a33dce0.d
│   │       │   ├── regex-7fc052b65a33dce0.regex.678271b17897d55b-cgu.0.rcgu.o
│   │       │   ├── regex-7fc052b65a33dce0.regex.678271b17897d55b-cgu.1.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.d
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.00.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.01.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.02.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.03.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.04.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.05.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.06.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.07.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.08.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.09.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.10.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.11.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.12.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.13.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.14.rcgu.o
│   │       │   ├── regex_automata-6be0acdcc380d0e6.regex_automata.9d5d07024e7814c9-cgu.15.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.d
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.00.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.01.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.02.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.03.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.04.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.05.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.06.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.07.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.08.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.09.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.10.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.11.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.12.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.13.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.14.rcgu.o
│   │       │   ├── regex_syntax-265e37a1535a8152.regex_syntax.65d99b2b5e5f0210-cgu.15.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.d
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.00.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.01.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.02.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.03.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.04.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.05.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.06.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.07.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.08.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.09.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.10.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.11.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.12.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.13.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.14.rcgu.o
│   │       │   ├── ring-f947df43693ca0df.ring.3bddc57cb4a5ede4-cgu.15.rcgu.o
│   │       │   ├── rtk-97b3d85127455379
│   │       │   ├── rtk-97b3d85127455379.01ihfj5w3mthi7fhkunjag7of.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0539eo5iayg7h3kej9jjpgql9.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.05sx6znlcxb26qhzyaaaqr94v.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0b0s0ddlrpr4lnvt4b6757ggz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0cj21quca5k4ekf1hm9nepi4v.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0de8g5gruy3ov66kljbq8ecps.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0f6knfygpqfacr5q9ln4552qv.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0fzl8sfa2e8mtmnm90gvmje6o.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0jmbh4uwq2bk86gehrxk26it7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0l1vwffig4tx1xoi0shkb8y4j.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0mc0myqeojru7fzvrxvoinoyy.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0mx3n75d13r2do83c5mnad793.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0p49wpcsyehf5wxx0tqczof16.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0poe4yr9mprdsj7jla6bq2829.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0psd1fbaxs8lbca5pre66rmbb.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0t0bzwiodhl0gmgl09rr70pik.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0uop1aeu1a8mcrpdktvm2f7uc.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0upnnwxfz62eunrb2gxq5hjco.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0vf9f4n11qt47p0v5y11jtr80.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.0zan2457dysoq1nkx10mec0md.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.12e7723jum7z5nuu479zrgxmg.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.12zhpiesh8ax8u6aq6euqg8vb.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.132buxzy5ryq6utjgstpu0uqz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.13sjfhsuxldikgxlz7yenp1j1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.14fgrn68admdkuqtl8pz4of95.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.15nstvw4epnzbrr1cp5aa4cnp.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.15wwp7ct4v2n8o1kfwk67xfaz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.16zi832wai1jcn1ukm6x04gau.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1aloreub9bjfnq3ohykymlyap.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1dqdinz9kzco4gbytxwaxjrxr.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1iddhkpz2t83a3fhlvcnnrfny.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1nr4t80szrob4qabk2ow0o3x5.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1pqb6elmmg83xmml0p55azocm.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1w7ekghesi6k75u1mnqav9efl.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1x83nhyenvshf37sq6jefzxsv.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1xfdkmfa68rhzohsuklf65ywa.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.1xldllcigl954yp9jmpydbbqd.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.20p9bt67w5o8y6q4g98wnozyw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.21hpsnoiknlqgqytjxwewwngl.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.28y1gc937se65fbnyw7x3wd0q.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2aanj8522fi9tjh74co1ydl7l.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2bfuc67dxmydogulcwwljfln3.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2euynd2agjovly08pxs7wjdjm.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2gakbplsjr4x88k9de9oo9rmw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2mag904huem0vdzrpwqlgu5xu.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2mykdac5ns38xapfnn3tijjzx.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2qj5ynvxeqhquhx6c4ixnnoa1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2vbnmnoice28ifbu3i6qbt2c0.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2vmchg91n9jp1ky4gk5u9um5e.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2xuchsmpplbm2eit5dr2hvm8a.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.2zu6andu550rwz5h8dilrjjba.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.38m8gapt78g8mydsxfv30mvad.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.38tim7k5llsphk61cyn6mlkrn.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.38u8pz1dadvhqubk79m14ee2r.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3b932erryosw3l6p3q3cpe04c.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3behccbtujsif52ddmmxg2ovg.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3bhtg4l8hk1i6m5mpp73z79aa.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3d1k7nk4myfb8l1nb9bhokycw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3gipaqifrrbf3ireh5i0d1yjy.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3h3abigbfgz519h4mjsi02d9i.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3jelj4h6vw721s114sdok1eph.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3jf3u2doieuflf1h7ztvwv2gg.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3o677eht5362e8pdymj68qepc.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3pvho605cb7y518ml1fc4h4ya.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3sjoglwcpw0znqev0prwzbid1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3uo05l05wh77pr6ddihjg7zv8.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.3y2x5bqp7tevn690re79khhqa.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.42eo0tvp2zl9sr599yrm0oc36.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.44y45yp6lv7oz2mrfxhd3nigw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.45icpnd42ai5kldtebb0w0s68.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.479f25fcey5gnkmjfqfvxtv1n.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.49as4434yfsc3uoqywk2snpaz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4a3ia9a8asxw1tgwt72ttby6r.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4arslkv1acs0crpy6041j265b.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4b2idqvvzqzekyk25z4rcypyw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4e2w7atsao71az29rfdtsvhuh.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4j9akunau71fumt6s8bbw7qm6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4jmahi7dqcn0jxsuiv2rox8di.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4kji8yal3a1et70ekoslcm9yf.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4l2cbas8111angekvkuqhv9u2.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4q60de49t3ta4zbl5xyf2xyz7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4qf9dsq984l53uxs59svrkr7s.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4qytldmnvqak6bx75tmj2k8b3.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4r3gx6yug5k2v7zostl0f4uak.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4t31zn4u44i91sbcuxaypfuon.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4uz38sz7dp0v81uy3i3u2lo3x.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4vjmw38488mrqcgmj8i44n96i.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.4wmz14q5wb57p97nhthtv83d1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.505xa3ijfebpjyvrmmnbjplzi.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.56gomxfv9rvke1ol0ev1yl28l.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.56x8rbw96p4oijnf9ygp00nvf.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5b2js9f3iofmeli30m527c9k1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5fopold4otu29025oitcgwoiu.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5hl112425hwu9j9h15g2dz2e6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5l79ku8svp2bnzskvdahmtzbn.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5lq0zbbaq2bkyd1gvvttj2m9p.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5mmvimaxprpfcemu5cwx7fadm.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5uz8phhki5ivyvktga9l7mnef.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.5wyctlxii3v6h5212syp1wvzu.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.614nl5dwuru3s6fcj3ai4n31k.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.62ozjns9efzh586zly4abth3r.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.63fybgiyspqxbuqn9xwevptpp.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.65xmaw8myeqgg3p42m4o2k2gn.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.66b5bm1woeq7b5o84e4xmi9v7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.677p5svcr935051o5z7cpf1qa.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.67e2c53alnz24tk7b9yeyzvb4.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.68k4bulhhjn5mxg82rf657uw3.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.69ws2f2tonhomq1zg9nvm9gdt.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6ci9065e7lidajoxxbbu00x2a.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6g58399ku330sn8mv70zhrblq.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6hwrqj45x4ymirp9alzfueack.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6kta7xg1r8rt4cx5qhrnv2vl8.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6mb2flttxhqcdzrf19zsqo3xp.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6ml5n1tteage64trbwkyq2lit.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6opvnu2mywnjl5a6c3cz21os4.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6otaos5iyhchr5xlp5ljqu6m9.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6p5ldnc7yve16l26sltfi8jfo.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6sgat83r5ie8fcdkxe67jjve2.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6v4um8lki9u3q5zmu6axq4s25.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6va9gwuwop9r11ip2e495ul7c.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6wzd8cqz0iay6s0zxsl6p614v.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.6zh64clx45qlvgmsgoru1dk2d.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.70me1ucno3fa96a3ep7nwl9qz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.71g6elsp39lhgqu4xx2e2pbdo.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.71swt1hcss95vlqowahqxz6yo.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.74gl7iw8n4rr27uyig5t79oog.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.74hqx43l8rpsfsl7oxlhjzzc7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.75aqomkam9jwljaxnpmjlj9vz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.75pm39vothqzdpe3a2ily90e6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.773yvc34pjzxt3kl046gzzhya.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7986bvjwh043vec754by1r7uy.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7ado2veekoat02ekp40nf8uui.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7fj4bwwwfcjz70gox40bvljy6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7fym3oloaxyqwii1z34l52n3f.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7mxgft4qni0yv53ut2ticfs1g.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7p56sufj2nsm54gnajgatenqa.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7pxobcl3us1jgebzjyrnva56n.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7sj3nkfdxn0bu4ep7tkfr8xqc.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7smvx3lmft8570xgljl8s7r45.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7t33tjb348c9rhmuqb5h8lkcq.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7vg60mfg2e1b19fjnrpcm3m65.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.7yo938qxpvcryfrplp332haw7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8094n3uxmltggagj0we838zvj.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.82jl4bbygp29ddnoxj1qoavtf.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8689ebgyjltljkiccc48tq434.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8bolzrv4lhh24ahy136va0bu7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8dsiorvoadi5x4vf9lyzh4dy9.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8gl84wsbblz4d3g5uwsspfrsn.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8iv4pk2xfwgonrrr1jkyvqzjp.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8lcbm7mi51wjnsp2iljtwrjvv.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8n4e3j9qldle1jae9h645d5eq.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8pdebrgm65cjwu3ewqrai6h1z.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8rvwcomzyejm9nlz6zzd8kr7g.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8s4oihizbnxir8dyp4teqmacz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8vbdmppqqyl1zgq49tdwss836.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8w6bxcw0522l6g7kuuhcsf7wd.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8zag3jyakfvuqxxwq7sn3z1x4.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.8zq747ha1d3sqrsimt20jjbt8.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.93c3nij7w9mv5gypjze6ft61o.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.93jsfclojbjvluh136j4xlc34.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.94nqq73ewj1v75xte5qav1v5q.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.95wvtcidw20mb3ory82t7xbml.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9b72iej7hwduc6tlzgmygi2ak.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9ch3eqo3xk4lcj0q62hjr9y7i.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9dnfvivuqcib9zymgjg8q6769.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9dt44261vqzld705iub5jvyxd.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9ey01szt1kkooglbm4f7jdljw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9fhm5fy3om3ga9rxj5b6ztc03.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9iw8ch089ais2sn0oxfx0eksv.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9l3xjavbeal5miba8lofnawu6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9qfh90qimd1osglla8ssc7wu6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9qrgl2vf39ss6n6n36l7nzaxe.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9qt599pjebkyp5adkssktpjz0.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9xn8taegpb11z2gbl9we4fv70.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.9xshjxbuuqxm0xi565mi4k078.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.a41s9wt1drn78ihbyqr78m07j.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.a4atihshy71ko15z0twtn52xg.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.a6bqv3y89xo6l26st4zxuzelx.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.a7e02clz3d3oc61b0c5vgb88z.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.a8eda77f8qtfdfg7usmv252ss.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.acgulycy85ncljx77ix4z7xvx.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.aeovk6gy4e1izf79vxa9sbhcw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.aicxh4z1yoqp6uj447tykr8ho.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ak6qgvtosb3ys0tkyd4nlv0ld.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.anbetrc26q0po0yadm0w3qvet.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.apof03wfbc4jv3zza80liw8ye.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.av952l3cxxyxr29nltq68v9zv.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.b07aialufhonqgvt1k11a9mt1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.b10di410gauugf00dfhvpl7ab.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.b81tchjli6rxmapf3k8kakx6e.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.be9x7srqb1i0o8egwlq2383ft.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.beqqcz9v0ym6uo7eb926m162x.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bfgk1gyy74dc8wvdurcg6w4lr.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bj9d47q0qe6rvick0kjhtcvfi.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bo129ed3nj5xvlxc91xnbdz4m.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bo7bq0v0cgd5wxfb836b1s8s5.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bpdqgrzfjpzxreo3302mjithu.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bpzx6mks6uul0xxd021h2lnlk.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bs66l5s7uy8he7vdn8l69krc2.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bsxqzawjs5can9coacd79gjvo.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.bvyyugam2p2t86v0a50iavuio.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.c3tac8z6o44v1cbhbukkzal5j.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.c67b5cpn7bjb4fqsgx00ouoo8.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.c6aeeprm8snywhtoa28g1jik1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.c6pmy6pd9b0dwj4abvptdbx7d.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.c8pgyoqcxm47gwegpugmpazo5.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cbd2fymwajivknffh3eblkd7i.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cdxqtqu60p3qc5kv668v7yl5b.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cfpqqg5tqn4x6lze65dbji3om.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cgbousat1312nx7qrw5kxg9yh.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cgi3052wijtehd0mcu78qffkq.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ci037rn1jaym8yewwkm906jm7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cl8nivbca86ncmb217ifox29b.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cmza765wc0itmu5hvmhajfjdm.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.crig4hj6qj39x80v2v30a24kz.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ctbuwgvll5uuzo6np9co6b5l6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ctsym85mkl11f8e4ln9nkkkao.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cvfylckg7kujnmb42lkvuti5a.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cxbc66wvmqa3g981yil2g6e06.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.cyxbu4yzlzmpokk7c9ix64bfq.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.d
│   │       │   ├── rtk-97b3d85127455379.d194r9av7ghhluk2aubp0fo00.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.d1kz85x2rx6bd4zmoiktuzd27.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.d4a3pu7ei5vs14gepb90qh885.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.d4lst9f9t4la86dcuj0djpg52.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dcj48psmdkj11okxoua05cway.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ddwle930m4zw2vg9to1ztdjne.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dh60tahmm3xq53r1pkjy312xe.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dhsasq8vij0hry4ludoemxtvs.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dkbmsawbm8bky78aqyzevxen5.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dmabowhjdlj8j0jqgfb3n2rdh.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dmzy3kjhtzk48a2vzhvxxn3yc.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dn3s3zewhq677xm39qevx7jpl.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dnw1vh8jibo13zea4bmgnv0me.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.drecby7qbt0lmfd2hkol9724l.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.dtzn4w46hj7xjzepadyamx3ai.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.e668264lblqlc7h5zfqpn7yb6.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.e6ysso5a9mgktg4i6wn0ih903.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.e94plguj75xkml5ejhdm848u7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ebtii4un7usxsb662ot55upt4.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ec3zcwh5xylwgifbhl6co0r7v.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.eh2ny9ss8u3mthkwv10kwxike.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ekzrwzg8yxn298srk0ehin8s1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.emjl05rlc4j0m5vm6wy1bjbfb.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.emls8ut1yw1766mfv8lv4tg0r.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.epfahsc495qaelh06e1mo4pi5.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.erl6jtdw1ptxj99ajlvg0teq8.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.euf5t790ppdb1wdukrrhrdjt7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ev2kgok52kbcg4vc7c86vmkaw.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.evte0buknn1z515tnjvnbgln1.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ewfdyefowewgxad68fp81lbmp.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ewy8tqvwxf14al0wkxose21t0.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.eyk709rzwpvqt5h7uhz6c18z7.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.ezfkrr9t33mxqhx33u7eu7gv2.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.f1k5v1ygsjtkwx7oka6ywbtv0.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.f1so6lo42udh643kbbo5hyek8.1avlila.rcgu.o
│   │       │   ├── rtk-97b3d85127455379.f38ar40b1zuleeq2v2co34s81.1avlila.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.d
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.0.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.1.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.2.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.3.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.4.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.5.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.6.rcgu.o
│   │       │   ├── rusqlite-69890142cb417ca2.rusqlite.b7a4b7aad2354218-cgu.7.rcgu.o
│   │       │   ├── rustix-0141696396229331.d
│   │       │   ├── rustix-0141696396229331.rustix.c3c734986d8c2d7a-cgu.0.rcgu.o
│   │       │   ├── rustix-0141696396229331.rustix.c3c734986d8c2d7a-cgu.1.rcgu.o
│   │       │   ├── rustix-0141696396229331.rustix.c3c734986d8c2d7a-cgu.2.rcgu.o
│   │       │   ├── rustix-0141696396229331.rustix.c3c734986d8c2d7a-cgu.3.rcgu.o
│   │       │   ├── rustix-0141696396229331.rustix.c3c734986d8c2d7a-cgu.4.rcgu.o
│   │       │   ├── rustix-0141696396229331.rustix.c3c734986d8c2d7a-cgu.5.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.d
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.00.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.01.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.02.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.03.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.04.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.05.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.06.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.07.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.08.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.09.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.10.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.11.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.12.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.13.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.14.rcgu.o
│   │       │   ├── rustls-dbe2bb7fe0bd24de.rustls.74202a161406b5a9-cgu.15.rcgu.o
│   │       │   ├── rustls_pki_types-69033c6b3d4c0502.d
│   │       │   ├── rustls_pki_types-69033c6b3d4c0502.rustls_pki_types.256506f150f18015-cgu.0.rcgu.o
│   │       │   ├── rustls_pki_types-69033c6b3d4c0502.rustls_pki_types.256506f150f18015-cgu.1.rcgu.o
│   │       │   ├── rustls_pki_types-69033c6b3d4c0502.rustls_pki_types.256506f150f18015-cgu.2.rcgu.o
│   │       │   ├── same_file-385d8d7838b20841.d
│   │       │   ├── same_file-385d8d7838b20841.same_file.6ddd498e2c17db26-cgu.0.rcgu.o
│   │       │   ├── serde-02040be0a9c705b0.d
│   │       │   ├── serde-a53ea91e83b2fb3b.d
│   │       │   ├── serde-a53ea91e83b2fb3b.serde.7104ab9b7a849a98-cgu.0.rcgu.o
│   │       │   ├── serde_core-99f6d1bf1e213b1f.d
│   │       │   ├── serde_core-99f6d1bf1e213b1f.serde_core.31975626b5924ad-cgu.0.rcgu.o
│   │       │   ├── serde_derive-1e04f8a94167e775.d
│   │       │   ├── serde_json-60254bae73babdf9.d
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.0.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.1.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.2.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.3.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.4.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.5.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.6.rcgu.o
│   │       │   ├── serde_json-60254bae73babdf9.serde_json.5e46f5a7cd0040e4-cgu.7.rcgu.o
│   │       │   ├── serde_spanned-2f9d6bf8e767a857.d
│   │       │   ├── serde_spanned-2f9d6bf8e767a857.serde_spanned.3de1865df036019e-cgu.0.rcgu.o
│   │       │   ├── serde_spanned-acae31d695f3eefb.d
│   │       │   ├── serde_spanned-acae31d695f3eefb.serde_spanned.ddb4d150d2607c76-cgu.0.rcgu.o
│   │       │   ├── sha2-c79e523aa9247cfe.d
│   │       │   ├── sha2-c79e523aa9247cfe.sha2.44e871c5653eb72d-cgu.0.rcgu.o
│   │       │   ├── shlex-4e4d2ed3449c4a89.d
│   │       │   ├── simd_adler32-b55184072ed93004.d
│   │       │   ├── simd_adler32-b55184072ed93004.simd_adler32.970e051d03b5a071-cgu.0.rcgu.o
│   │       │   ├── smallvec-966617ed4101d6ba.d
│   │       │   ├── smallvec-966617ed4101d6ba.smallvec.aedef8a2a2c032f6-cgu.0.rcgu.o
│   │       │   ├── stable_deref_trait-109e7c4905ab6911.d
│   │       │   ├── stable_deref_trait-109e7c4905ab6911.stable_deref_trait.1d63bce5e174ea0e-cgu.0.rcgu.o
│   │       │   ├── strsim-a076c49d32a61f1e.d
│   │       │   ├── strsim-a076c49d32a61f1e.strsim.f7600f6754a8aa75-cgu.0.rcgu.o
│   │       │   ├── strsim-a076c49d32a61f1e.strsim.f7600f6754a8aa75-cgu.1.rcgu.o
│   │       │   ├── strsim-a076c49d32a61f1e.strsim.f7600f6754a8aa75-cgu.2.rcgu.o
│   │       │   ├── strsim-a076c49d32a61f1e.strsim.f7600f6754a8aa75-cgu.3.rcgu.o
│   │       │   ├── strsim-a076c49d32a61f1e.strsim.f7600f6754a8aa75-cgu.4.rcgu.o
│   │       │   ├── subtle-928382021cefef33.d
│   │       │   ├── subtle-928382021cefef33.subtle.d29f3da0be5c22a4-cgu.0.rcgu.o
│   │       │   ├── syn-bb20ed08ac236735.d
│   │       │   ├── synstructure-29eb75bed1f7385e.d
│   │       │   ├── tempfile-6992a15e9dac32c1.d
│   │       │   ├── tempfile-6992a15e9dac32c1.tempfile.e23f54537f73e26e-cgu.0.rcgu.o
│   │       │   ├── tempfile-6992a15e9dac32c1.tempfile.e23f54537f73e26e-cgu.1.rcgu.o
│   │       │   ├── tempfile-6992a15e9dac32c1.tempfile.e23f54537f73e26e-cgu.2.rcgu.o
│   │       │   ├── tempfile-6992a15e9dac32c1.tempfile.e23f54537f73e26e-cgu.3.rcgu.o
│   │       │   ├── tinystr-6cf2611e9f981ded.d
│   │       │   ├── tinystr-6cf2611e9f981ded.tinystr.4abbab10dd597b8e-cgu.0.rcgu.o
│   │       │   ├── toml-4089104368006fa6.d
│   │       │   ├── toml-4089104368006fa6.toml.e9a312480543694f-cgu.0.rcgu.o
│   │       │   ├── toml-4089104368006fa6.toml.e9a312480543694f-cgu.1.rcgu.o
│   │       │   ├── toml-4089104368006fa6.toml.e9a312480543694f-cgu.2.rcgu.o
│   │       │   ├── toml-4089104368006fa6.toml.e9a312480543694f-cgu.3.rcgu.o
│   │       │   ├── toml-4089104368006fa6.toml.e9a312480543694f-cgu.4.rcgu.o
│   │       │   ├── toml-895fb67bb3dabb31.d
│   │       │   ├── toml-895fb67bb3dabb31.toml.41ef4a6ce72f1ec2-cgu.0.rcgu.o
│   │       │   ├── toml-895fb67bb3dabb31.toml.41ef4a6ce72f1ec2-cgu.1.rcgu.o
│   │       │   ├── toml-895fb67bb3dabb31.toml.41ef4a6ce72f1ec2-cgu.2.rcgu.o
│   │       │   ├── toml-895fb67bb3dabb31.toml.41ef4a6ce72f1ec2-cgu.3.rcgu.o
│   │       │   ├── toml-895fb67bb3dabb31.toml.41ef4a6ce72f1ec2-cgu.4.rcgu.o
│   │       │   ├── toml_datetime-6ad5655818fef83a.d
│   │       │   ├── toml_datetime-6ad5655818fef83a.toml_datetime.e7345146c8ab128b-cgu.0.rcgu.o
│   │       │   ├── toml_datetime-6ad5655818fef83a.toml_datetime.e7345146c8ab128b-cgu.1.rcgu.o
│   │       │   ├── toml_datetime-eee6fbf66f10d096.d
│   │       │   ├── toml_datetime-eee6fbf66f10d096.toml_datetime.bf349c9372d815b5-cgu.0.rcgu.o
│   │       │   ├── toml_datetime-eee6fbf66f10d096.toml_datetime.bf349c9372d815b5-cgu.1.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.d
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.00.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.01.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.02.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.03.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.04.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.05.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.06.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.07.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.08.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.09.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.10.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.11.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.12.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.13.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.14.rcgu.o
│   │       │   ├── toml_edit-47c1b79707b201e6.toml_edit.1b42b0ad7756e53a-cgu.15.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.d
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.00.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.01.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.02.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.03.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.04.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.05.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.06.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.07.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.08.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.09.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.10.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.11.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.12.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.13.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.14.rcgu.o
│   │       │   ├── toml_edit-ad2e732f1992fb37.toml_edit.2ffe75307a67ef13-cgu.15.rcgu.o
│   │       │   ├── toml_write-19fa778102acde31.d
│   │       │   ├── toml_write-19fa778102acde31.toml_write.fa04beb71f80a86b-cgu.0.rcgu.o
│   │       │   ├── typenum-62272f6b656edf9f.d
│   │       │   ├── typenum-62272f6b656edf9f.typenum.5654ee7a35710969-cgu.0.rcgu.o
│   │       │   ├── unicode_ident-d40ac0487c7d67b5.d
│   │       │   ├── untrusted-6b0354ff3edb18c4.d
│   │       │   ├── untrusted-6b0354ff3edb18c4.untrusted.d234f541a62fb66-cgu.0.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.d
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.00.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.01.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.02.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.03.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.04.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.05.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.06.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.07.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.08.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.09.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.10.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.11.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.12.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.13.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.14.rcgu.o
│   │       │   ├── ureq-c4ba7c29c3b4b21f.ureq.602f7396538374fe-cgu.15.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.d
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.0.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.1.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.2.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.3.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.4.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.5.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.6.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.7.rcgu.o
│   │       │   ├── url-1cc9ae4fe6d8f8d1.url.77e2fe5dd3a0f006-cgu.8.rcgu.o
│   │       │   ├── utf8_iter-61ca497e0d5f4ddc.d
│   │       │   ├── utf8_iter-61ca497e0d5f4ddc.utf8_iter.445a863c8211c5da-cgu.0.rcgu.o
│   │       │   ├── utf8parse-e3564df468e33e85.d
│   │       │   ├── utf8parse-e3564df468e33e85.utf8parse.c75780493d4fded9-cgu.0.rcgu.o
│   │       │   ├── vcpkg-5b5bc19a0f0a322c.d
│   │       │   ├── version_check-a38ac275d10c0882.d
│   │       │   ├── walkdir-038025453432a2d1.d
│   │       │   ├── walkdir-038025453432a2d1.walkdir.dc7419292f5b9155-cgu.0.rcgu.o
│   │       │   ├── walkdir-038025453432a2d1.walkdir.dc7419292f5b9155-cgu.1.rcgu.o
│   │       │   ├── walkdir-038025453432a2d1.walkdir.dc7419292f5b9155-cgu.2.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.d
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.0.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.1.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.2.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.3.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.4.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.5.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.6.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.7.rcgu.o
│   │       │   ├── webpki-33cc1d8f828c7ee6.webpki.78d6b73ea76d13b5-cgu.8.rcgu.o
│   │       │   ├── webpki_roots-a5df9ba994be669d.d
│   │       │   ├── webpki_roots-a5df9ba994be669d.webpki_roots.9435f849462c49d8-cgu.0.rcgu.o
│   │       │   ├── webpki_roots-e130b21c96a6e47e.d
│   │       │   ├── webpki_roots-e130b21c96a6e47e.webpki_roots.d2ebdfca1f291a70-cgu.0.rcgu.o
│   │       │   ├── which-abb972d9ffb59647.d
│   │       │   ├── which-abb972d9ffb59647.which.374ff22dcbac9e6c-cgu.0.rcgu.o
│   │       │   ├── winnow-65964a6026f0d24c.d
│   │       │   ├── winnow-65964a6026f0d24c.winnow.77d1252c3eb7b7a5-cgu.0.rcgu.o
│   │       │   ├── winnow-65964a6026f0d24c.winnow.77d1252c3eb7b7a5-cgu.1.rcgu.o
│   │       │   ├── winnow-65964a6026f0d24c.winnow.77d1252c3eb7b7a5-cgu.2.rcgu.o
│   │       │   ├── writeable-0240f565982d0564.d
│   │       │   ├── writeable-0240f565982d0564.writeable.8db2ea38c2a2052c-cgu.0.rcgu.o
│   │       │   ├── yoke-7e03d2bda2464900.d
│   │       │   ├── yoke-7e03d2bda2464900.yoke.b39d72496cc08383-cgu.0.rcgu.o
│   │       │   ├── yoke_derive-4c556ad352559d7b.d
│   │       │   ├── zerocopy-bd378c85de2f1b46.d
│   │       │   ├── zerocopy-bd378c85de2f1b46.zerocopy.f02f426095fde25e-cgu.0.rcgu.o
│   │       │   ├── zerofrom-45a13ce8792f9340.d
│   │       │   ├── zerofrom-45a13ce8792f9340.zerofrom.a14df6b854553072-cgu.0.rcgu.o
│   │       │   ├── zerofrom_derive-520620fc2ade43f6.d
│   │       │   ├── zeroize-0cbf3f5bda8cfbcf.d
│   │       │   ├── zeroize-0cbf3f5bda8cfbcf.zeroize.72a214bf77ee97c2-cgu.0.rcgu.o
│   │       │   ├── zerotrie-b33568c0a418e80e.d
│   │       │   ├── zerotrie-b33568c0a418e80e.zerotrie.a827fcdec7678a4e-cgu.0.rcgu.o
│   │       │   ├── zerovec-ba9e9bcfa02e28fe.d
│   │       │   ├── zerovec-ba9e9bcfa02e28fe.zerovec.fe9d1035a161659b-cgu.0.rcgu.o
│   │       │   ├── zerovec_derive-653a87cffa56edf8.d
│   │       │   ├── zmij-f6e9544cf6ca7196.d
│   │       │   └── zmij-f6e9544cf6ca7196.zmij.308fd62706c19d3c-cgu.0.rcgu.o
│   │       ├── examples
│   │       ├── incremental
│   │       │   ├── build_script_build-1k7d3pg45obrv
│   │       │   │   ├── s-hj4gv0gwbi-00jcm29-4d1l9c5xfd5ya21y9iz5d6jbr
│   │       │   │   │   ├── 01ho5yxxckxppf5jbeikeqc2q.o
│   │       │   │   │   ├── 0ggnz2nvreijwvewnur0g8mzp.o
│   │       │   │   │   ├── 10thk2jncuywhynwzzx2vaxss.o
│   │       │   │   │   ├── 121g836q0sr90zy4z9lr7cbty.o
│   │       │   │   │   ├── 13m6ga850t5uvqwgob2j4u9u0.o
│   │       │   │   │   ├── 1db0m5bqo3fwregho22usbscn.o
│   │       │   │   │   ├── 1mned8q8n7x8rte5fx4m0nkjb.o
│   │       │   │   │   ├── 26ay74jk8ca87jtkof082ng18.o
│   │       │   │   │   ├── 28w38qffparnlped14lfy4q67.o
│   │       │   │   │   ├── 29rydutyn8xi4t4ddg056pc0s.o
│   │       │   │   │   ├── 2oswqavqr1qni14crx3q1u7rr.o
│   │       │   │   │   ├── 35ednfu06aoxmwfkglzj54nta.o
│   │       │   │   │   ├── 3e187856pxgvml4ym2r994vs5.o
│   │       │   │   │   ├── 3oqo0aqgagwm579uow34oskuh.o
│   │       │   │   │   ├── 3scbp2xp5z2azh56mikrauicg.o
│   │       │   │   │   ├── 3twx6d6x2c4omc22z4a54swsl.o
│   │       │   │   │   ├── 3v4for2a8lmf9ppblkl269jf3.o
│   │       │   │   │   ├── 3wo613v4691l8nhkwjhp70xjx.o
│   │       │   │   │   ├── 43j3fnurn0gy2fax3h1fi67yw.o
│   │       │   │   │   ├── 449weiq3q3lbckf0u4ibm1bpn.o
│   │       │   │   │   ├── 4f50vx3rk2x3ytv7bzwbfx2p8.o
│   │       │   │   │   ├── 5107sirexwdv0nna093vef9sb.o
│   │       │   │   │   ├── 58jazfxsjzq1tjktzw1fnuute.o
│   │       │   │   │   ├── 5up24mnp2nvafogonk0p5riek.o
│   │       │   │   │   ├── 5v1er9mj0h1xsy2c6etqe4sbb.o
│   │       │   │   │   ├── 604t819nlnr5x7wvfi11hgnz0.o
│   │       │   │   │   ├── 606ibvei521fttn7ulqzr93g8.o
│   │       │   │   │   ├── 60kf08mcnvtqn6dl1apj6njgr.o
│   │       │   │   │   ├── 6hlzjd5xzeab4qounzfy9ftmc.o
│   │       │   │   │   ├── 6of7ztgdi6haoq13nfby9p9bz.o
│   │       │   │   │   ├── 6u4rbq9ol5at0q0ctaa8ewc0u.o
│   │       │   │   │   ├── 77qhrzse1cfv0j91rqh29afvo.o
│   │       │   │   │   ├── 7nkb06ywhrxduuj7irdzzr849.o
│   │       │   │   │   ├── 7s6gd4yrttvvo2jajtbcfxh9x.o
│   │       │   │   │   ├── 7w80x4plvvtpm1ylepq1nfa7e.o
│   │       │   │   │   ├── 7xckf9hvdqi5hwd9n85jsrfel.o
│   │       │   │   │   ├── 80hmqv6sx57kxa8om6vdkw1fy.o
│   │       │   │   │   ├── 8bfza2u5gtdh0nhmrs9mala5h.o
│   │       │   │   │   ├── 8u8gfhsb5isyxfey1ugnhtq4u.o
│   │       │   │   │   ├── 8zzbskzs9pi51apcs9zcpt4kp.o
│   │       │   │   │   ├── 94d74u4ao6tqls20vz2exzcw9.o
│   │       │   │   │   ├── 95c9hr2ihghblmr1nm5ojs8lc.o
│   │       │   │   │   ├── 9awk9om1p8c4v7bb4myds9ykb.o
│   │       │   │   │   ├── 9cdjd5kb9umk6lnjlhnwbcyok.o
│   │       │   │   │   ├── 9wulm9yq2197ykh8ir5i6gxlg.o
│   │       │   │   │   ├── 9xhqecu9yl2tjhldvvkts252n.o
│   │       │   │   │   ├── a689vh6m362fdgmxx841nz3wv.o
│   │       │   │   │   ├── aaamh4vjr45z90ob3o51helyr.o
│   │       │   │   │   ├── avhn1vm25hmgh983hu963w1e4.o
│   │       │   │   │   ├── b1c6ogj9mars7ekbqlucl6rwa.o
│   │       │   │   │   ├── bpa24jki9rpmr83oy16nn7rd3.o
│   │       │   │   │   ├── chjdvvnhji7ecsmze7ialdsxr.o
│   │       │   │   │   ├── cyx82cuo62cn9t71n7etk7523.o
│   │       │   │   │   ├── dbgp98lnu1qixvgrk2gy62znt.o
│   │       │   │   │   ├── dchcyg16oxngg73m3pfnd6yxx.o
│   │       │   │   │   ├── dep-graph.bin
│   │       │   │   │   ├── dep5uoryq5xpj02oyvyr6sck9.o
│   │       │   │   │   ├── dfl0egjxdzrbzceeww0q5qoy0.o
│   │       │   │   │   ├── dfx3gm2hnbhhylbqkpkejv1ll.o
│   │       │   │   │   ├── dgls4ypyyd2v3jjflfxjwt9la.o
│   │       │   │   │   ├── dhrp2ohpju9z36uxwv543g99j.o
│   │       │   │   │   ├── dolzmz461fdy0hrd4tf2e00r4.o
│   │       │   │   │   ├── dyxep5blr7278qymlenw0ckkd.o
│   │       │   │   │   ├── e2d418odpkff4c1ibdkfhz0su.o
│   │       │   │   │   ├── e6aaqie2tqe6yg1o3g3ikmyy6.o
│   │       │   │   │   ├── eamnm6yivuexhdc4rgbf84cpz.o
│   │       │   │   │   ├── elg02yqegkar8oljigtl9mldv.o
│   │       │   │   │   ├── epnlt5sp8isgx1h7i7kngpi54.o
│   │       │   │   │   ├── f0a8cg2jk89669r8oecdb2tgg.o
│   │       │   │   │   ├── f0qsbhpb773gsi0uyjznjbia9.o
│   │       │   │   │   ├── query-cache.bin
│   │       │   │   │   └── work-products.bin
│   │       │   │   └── s-hj4gv0gwbi-00jcm29.lock
│   │       │   └── rtk-3j1ljvufw8s1y
│   │       │       ├── s-hj4gv5ki97-03phbuk-47w1k0qn6cugs9c5qqxdw70jw
│   │       │       │   ├── 01ihfj5w3mthi7fhkunjag7of.o
│   │       │       │   ├── 0539eo5iayg7h3kej9jjpgql9.o
│   │       │       │   ├── 05sx6znlcxb26qhzyaaaqr94v.o
│   │       │       │   ├── 0b0s0ddlrpr4lnvt4b6757ggz.o
│   │       │       │   ├── 0cj21quca5k4ekf1hm9nepi4v.o
│   │       │       │   ├── 0de8g5gruy3ov66kljbq8ecps.o
│   │       │       │   ├── 0f6knfygpqfacr5q9ln4552qv.o
│   │       │       │   ├── 0fzl8sfa2e8mtmnm90gvmje6o.o
│   │       │       │   ├── 0jmbh4uwq2bk86gehrxk26it7.o
│   │       │       │   ├── 0l1vwffig4tx1xoi0shkb8y4j.o
│   │       │       │   ├── 0mc0myqeojru7fzvrxvoinoyy.o
│   │       │       │   ├── 0mx3n75d13r2do83c5mnad793.o
│   │       │       │   ├── 0p49wpcsyehf5wxx0tqczof16.o
│   │       │       │   ├── 0poe4yr9mprdsj7jla6bq2829.o
│   │       │       │   ├── 0psd1fbaxs8lbca5pre66rmbb.o
│   │       │       │   ├── 0t0bzwiodhl0gmgl09rr70pik.o
│   │       │       │   ├── 0uop1aeu1a8mcrpdktvm2f7uc.o
│   │       │       │   ├── 0upnnwxfz62eunrb2gxq5hjco.o
│   │       │       │   ├── 0vf9f4n11qt47p0v5y11jtr80.o
│   │       │       │   ├── 0zan2457dysoq1nkx10mec0md.o
│   │       │       │   ├── 12e7723jum7z5nuu479zrgxmg.o
│   │       │       │   ├── 12zhpiesh8ax8u6aq6euqg8vb.o
│   │       │       │   ├── 132buxzy5ryq6utjgstpu0uqz.o
│   │       │       │   ├── 13sjfhsuxldikgxlz7yenp1j1.o
│   │       │       │   ├── 14fgrn68admdkuqtl8pz4of95.o
│   │       │       │   ├── 15nstvw4epnzbrr1cp5aa4cnp.o
│   │       │       │   ├── 15wwp7ct4v2n8o1kfwk67xfaz.o
│   │       │       │   ├── 16zi832wai1jcn1ukm6x04gau.o
│   │       │       │   ├── 1aloreub9bjfnq3ohykymlyap.o
│   │       │       │   ├── 1dqdinz9kzco4gbytxwaxjrxr.o
│   │       │       │   ├── 1iddhkpz2t83a3fhlvcnnrfny.o
│   │       │       │   ├── 1nr4t80szrob4qabk2ow0o3x5.o
│   │       │       │   ├── 1pqb6elmmg83xmml0p55azocm.o
│   │       │       │   ├── 1w7ekghesi6k75u1mnqav9efl.o
│   │       │       │   ├── 1x83nhyenvshf37sq6jefzxsv.o
│   │       │       │   ├── 1xfdkmfa68rhzohsuklf65ywa.o
│   │       │       │   ├── 1xldllcigl954yp9jmpydbbqd.o
│   │       │       │   ├── 20p9bt67w5o8y6q4g98wnozyw.o
│   │       │       │   ├── 21hpsnoiknlqgqytjxwewwngl.o
│   │       │       │   ├── 28y1gc937se65fbnyw7x3wd0q.o
│   │       │       │   ├── 2aanj8522fi9tjh74co1ydl7l.o
│   │       │       │   ├── 2bfuc67dxmydogulcwwljfln3.o
│   │       │       │   ├── 2euynd2agjovly08pxs7wjdjm.o
│   │       │       │   ├── 2gakbplsjr4x88k9de9oo9rmw.o
│   │       │       │   ├── 2mag904huem0vdzrpwqlgu5xu.o
│   │       │       │   ├── 2mykdac5ns38xapfnn3tijjzx.o
│   │       │       │   ├── 2qj5ynvxeqhquhx6c4ixnnoa1.o
│   │       │       │   ├── 2vbnmnoice28ifbu3i6qbt2c0.o
│   │       │       │   ├── 2vmchg91n9jp1ky4gk5u9um5e.o
│   │       │       │   ├── 2xuchsmpplbm2eit5dr2hvm8a.o
│   │       │       │   ├── 2zu6andu550rwz5h8dilrjjba.o
│   │       │       │   ├── 38m8gapt78g8mydsxfv30mvad.o
│   │       │       │   ├── 38tim7k5llsphk61cyn6mlkrn.o
│   │       │       │   ├── 38u8pz1dadvhqubk79m14ee2r.o
│   │       │       │   ├── 3b932erryosw3l6p3q3cpe04c.o
│   │       │       │   ├── 3behccbtujsif52ddmmxg2ovg.o
│   │       │       │   ├── 3bhtg4l8hk1i6m5mpp73z79aa.o
│   │       │       │   ├── 3d1k7nk4myfb8l1nb9bhokycw.o
│   │       │       │   ├── 3gipaqifrrbf3ireh5i0d1yjy.o
│   │       │       │   ├── 3h3abigbfgz519h4mjsi02d9i.o
│   │       │       │   ├── 3jelj4h6vw721s114sdok1eph.o
│   │       │       │   ├── 3jf3u2doieuflf1h7ztvwv2gg.o
│   │       │       │   ├── 3o677eht5362e8pdymj68qepc.o
│   │       │       │   ├── 3pvho605cb7y518ml1fc4h4ya.o
│   │       │       │   ├── 3sjoglwcpw0znqev0prwzbid1.o
│   │       │       │   ├── 3uo05l05wh77pr6ddihjg7zv8.o
│   │       │       │   ├── 3y2x5bqp7tevn690re79khhqa.o
│   │       │       │   ├── 42eo0tvp2zl9sr599yrm0oc36.o
│   │       │       │   ├── 44y45yp6lv7oz2mrfxhd3nigw.o
│   │       │       │   ├── 45icpnd42ai5kldtebb0w0s68.o
│   │       │       │   ├── 479f25fcey5gnkmjfqfvxtv1n.o
│   │       │       │   ├── 49as4434yfsc3uoqywk2snpaz.o
│   │       │       │   ├── 4a3ia9a8asxw1tgwt72ttby6r.o
│   │       │       │   ├── 4arslkv1acs0crpy6041j265b.o
│   │       │       │   ├── 4b2idqvvzqzekyk25z4rcypyw.o
│   │       │       │   ├── 4e2w7atsao71az29rfdtsvhuh.o
│   │       │       │   ├── 4j9akunau71fumt6s8bbw7qm6.o
│   │       │       │   ├── 4jmahi7dqcn0jxsuiv2rox8di.o
│   │       │       │   ├── 4kji8yal3a1et70ekoslcm9yf.o
│   │       │       │   ├── 4l2cbas8111angekvkuqhv9u2.o
│   │       │       │   ├── 4q60de49t3ta4zbl5xyf2xyz7.o
│   │       │       │   ├── 4qf9dsq984l53uxs59svrkr7s.o
│   │       │       │   ├── 4qytldmnvqak6bx75tmj2k8b3.o
│   │       │       │   ├── 4r3gx6yug5k2v7zostl0f4uak.o
│   │       │       │   ├── 4t31zn4u44i91sbcuxaypfuon.o
│   │       │       │   ├── 4uz38sz7dp0v81uy3i3u2lo3x.o
│   │       │       │   ├── 4vjmw38488mrqcgmj8i44n96i.o
│   │       │       │   ├── 4wmz14q5wb57p97nhthtv83d1.o
│   │       │       │   ├── 505xa3ijfebpjyvrmmnbjplzi.o
│   │       │       │   ├── 56gomxfv9rvke1ol0ev1yl28l.o
│   │       │       │   ├── 56x8rbw96p4oijnf9ygp00nvf.o
│   │       │       │   ├── 5b2js9f3iofmeli30m527c9k1.o
│   │       │       │   ├── 5fopold4otu29025oitcgwoiu.o
│   │       │       │   ├── 5hl112425hwu9j9h15g2dz2e6.o
│   │       │       │   ├── 5l79ku8svp2bnzskvdahmtzbn.o
│   │       │       │   ├── 5lq0zbbaq2bkyd1gvvttj2m9p.o
│   │       │       │   ├── 5mmvimaxprpfcemu5cwx7fadm.o
│   │       │       │   ├── 5uz8phhki5ivyvktga9l7mnef.o
│   │       │       │   ├── 5wyctlxii3v6h5212syp1wvzu.o
│   │       │       │   ├── 614nl5dwuru3s6fcj3ai4n31k.o
│   │       │       │   ├── 62ozjns9efzh586zly4abth3r.o
│   │       │       │   ├── 63fybgiyspqxbuqn9xwevptpp.o
│   │       │       │   ├── 65xmaw8myeqgg3p42m4o2k2gn.o
│   │       │       │   ├── 66b5bm1woeq7b5o84e4xmi9v7.o
│   │       │       │   ├── 677p5svcr935051o5z7cpf1qa.o
│   │       │       │   ├── 67e2c53alnz24tk7b9yeyzvb4.o
│   │       │       │   ├── 68k4bulhhjn5mxg82rf657uw3.o
│   │       │       │   ├── 69ws2f2tonhomq1zg9nvm9gdt.o
│   │       │       │   ├── 6ci9065e7lidajoxxbbu00x2a.o
│   │       │       │   ├── 6g58399ku330sn8mv70zhrblq.o
│   │       │       │   ├── 6hwrqj45x4ymirp9alzfueack.o
│   │       │       │   ├── 6kta7xg1r8rt4cx5qhrnv2vl8.o
│   │       │       │   ├── 6mb2flttxhqcdzrf19zsqo3xp.o
│   │       │       │   ├── 6ml5n1tteage64trbwkyq2lit.o
│   │       │       │   ├── 6opvnu2mywnjl5a6c3cz21os4.o
│   │       │       │   ├── 6otaos5iyhchr5xlp5ljqu6m9.o
│   │       │       │   ├── 6p5ldnc7yve16l26sltfi8jfo.o
│   │       │       │   ├── 6sgat83r5ie8fcdkxe67jjve2.o
│   │       │       │   ├── 6v4um8lki9u3q5zmu6axq4s25.o
│   │       │       │   ├── 6va9gwuwop9r11ip2e495ul7c.o
│   │       │       │   ├── 6wzd8cqz0iay6s0zxsl6p614v.o
│   │       │       │   ├── 6zh64clx45qlvgmsgoru1dk2d.o
│   │       │       │   ├── 70me1ucno3fa96a3ep7nwl9qz.o
│   │       │       │   ├── 71g6elsp39lhgqu4xx2e2pbdo.o
│   │       │       │   ├── 71swt1hcss95vlqowahqxz6yo.o
│   │       │       │   ├── 74gl7iw8n4rr27uyig5t79oog.o
│   │       │       │   ├── 74hqx43l8rpsfsl7oxlhjzzc7.o
│   │       │       │   ├── 75aqomkam9jwljaxnpmjlj9vz.o
│   │       │       │   ├── 75pm39vothqzdpe3a2ily90e6.o
│   │       │       │   ├── 773yvc34pjzxt3kl046gzzhya.o
│   │       │       │   ├── 7986bvjwh043vec754by1r7uy.o
│   │       │       │   ├── 7ado2veekoat02ekp40nf8uui.o
│   │       │       │   ├── 7fj4bwwwfcjz70gox40bvljy6.o
│   │       │       │   ├── 7fym3oloaxyqwii1z34l52n3f.o
│   │       │       │   ├── 7mxgft4qni0yv53ut2ticfs1g.o
│   │       │       │   ├── 7p56sufj2nsm54gnajgatenqa.o
│   │       │       │   ├── 7pxobcl3us1jgebzjyrnva56n.o
│   │       │       │   ├── 7sj3nkfdxn0bu4ep7tkfr8xqc.o
│   │       │       │   ├── 7smvx3lmft8570xgljl8s7r45.o
│   │       │       │   ├── 7t33tjb348c9rhmuqb5h8lkcq.o
│   │       │       │   ├── 7vg60mfg2e1b19fjnrpcm3m65.o
│   │       │       │   ├── 7yo938qxpvcryfrplp332haw7.o
│   │       │       │   ├── 8094n3uxmltggagj0we838zvj.o
│   │       │       │   ├── 82jl4bbygp29ddnoxj1qoavtf.o
│   │       │       │   ├── 8689ebgyjltljkiccc48tq434.o
│   │       │       │   ├── 8bolzrv4lhh24ahy136va0bu7.o
│   │       │       │   ├── 8dsiorvoadi5x4vf9lyzh4dy9.o
│   │       │       │   ├── 8gl84wsbblz4d3g5uwsspfrsn.o
│   │       │       │   ├── 8iv4pk2xfwgonrrr1jkyvqzjp.o
│   │       │       │   ├── 8lcbm7mi51wjnsp2iljtwrjvv.o
│   │       │       │   ├── 8n4e3j9qldle1jae9h645d5eq.o
│   │       │       │   ├── 8pdebrgm65cjwu3ewqrai6h1z.o
│   │       │       │   ├── 8rvwcomzyejm9nlz6zzd8kr7g.o
│   │       │       │   ├── 8s4oihizbnxir8dyp4teqmacz.o
│   │       │       │   ├── 8vbdmppqqyl1zgq49tdwss836.o
│   │       │       │   ├── 8w6bxcw0522l6g7kuuhcsf7wd.o
│   │       │       │   ├── 8zag3jyakfvuqxxwq7sn3z1x4.o
│   │       │       │   ├── 8zq747ha1d3sqrsimt20jjbt8.o
│   │       │       │   ├── 93c3nij7w9mv5gypjze6ft61o.o
│   │       │       │   ├── 93jsfclojbjvluh136j4xlc34.o
│   │       │       │   ├── 94nqq73ewj1v75xte5qav1v5q.o
│   │       │       │   ├── 95wvtcidw20mb3ory82t7xbml.o
│   │       │       │   ├── 9b72iej7hwduc6tlzgmygi2ak.o
│   │       │       │   ├── 9ch3eqo3xk4lcj0q62hjr9y7i.o
│   │       │       │   ├── 9dnfvivuqcib9zymgjg8q6769.o
│   │       │       │   ├── 9dt44261vqzld705iub5jvyxd.o
│   │       │       │   ├── 9ey01szt1kkooglbm4f7jdljw.o
│   │       │       │   ├── 9fhm5fy3om3ga9rxj5b6ztc03.o
│   │       │       │   ├── 9iw8ch089ais2sn0oxfx0eksv.o
│   │       │       │   ├── 9l3xjavbeal5miba8lofnawu6.o
│   │       │       │   ├── 9qfh90qimd1osglla8ssc7wu6.o
│   │       │       │   ├── 9qrgl2vf39ss6n6n36l7nzaxe.o
│   │       │       │   ├── 9qt599pjebkyp5adkssktpjz0.o
│   │       │       │   ├── 9xn8taegpb11z2gbl9we4fv70.o
│   │       │       │   ├── 9xshjxbuuqxm0xi565mi4k078.o
│   │       │       │   ├── a41s9wt1drn78ihbyqr78m07j.o
│   │       │       │   ├── a4atihshy71ko15z0twtn52xg.o
│   │       │       │   ├── a6bqv3y89xo6l26st4zxuzelx.o
│   │       │       │   ├── a7e02clz3d3oc61b0c5vgb88z.o
│   │       │       │   ├── a8eda77f8qtfdfg7usmv252ss.o
│   │       │       │   ├── acgulycy85ncljx77ix4z7xvx.o
│   │       │       │   ├── aeovk6gy4e1izf79vxa9sbhcw.o
│   │       │       │   ├── aicxh4z1yoqp6uj447tykr8ho.o
│   │       │       │   ├── ak6qgvtosb3ys0tkyd4nlv0ld.o
│   │       │       │   ├── anbetrc26q0po0yadm0w3qvet.o
│   │       │       │   ├── apof03wfbc4jv3zza80liw8ye.o
│   │       │       │   ├── av952l3cxxyxr29nltq68v9zv.o
│   │       │       │   ├── b07aialufhonqgvt1k11a9mt1.o
│   │       │       │   ├── b10di410gauugf00dfhvpl7ab.o
│   │       │       │   ├── b81tchjli6rxmapf3k8kakx6e.o
│   │       │       │   ├── be9x7srqb1i0o8egwlq2383ft.o
│   │       │       │   ├── beqqcz9v0ym6uo7eb926m162x.o
│   │       │       │   ├── bfgk1gyy74dc8wvdurcg6w4lr.o
│   │       │       │   ├── bj9d47q0qe6rvick0kjhtcvfi.o
│   │       │       │   ├── bo129ed3nj5xvlxc91xnbdz4m.o
│   │       │       │   ├── bo7bq0v0cgd5wxfb836b1s8s5.o
│   │       │       │   ├── bpdqgrzfjpzxreo3302mjithu.o
│   │       │       │   ├── bpzx6mks6uul0xxd021h2lnlk.o
│   │       │       │   ├── bs66l5s7uy8he7vdn8l69krc2.o
│   │       │       │   ├── bsxqzawjs5can9coacd79gjvo.o
│   │       │       │   ├── bvyyugam2p2t86v0a50iavuio.o
│   │       │       │   ├── c3tac8z6o44v1cbhbukkzal5j.o
│   │       │       │   ├── c67b5cpn7bjb4fqsgx00ouoo8.o
│   │       │       │   ├── c6aeeprm8snywhtoa28g1jik1.o
│   │       │       │   ├── c6pmy6pd9b0dwj4abvptdbx7d.o
│   │       │       │   ├── c8pgyoqcxm47gwegpugmpazo5.o
│   │       │       │   ├── cbd2fymwajivknffh3eblkd7i.o
│   │       │       │   ├── cdxqtqu60p3qc5kv668v7yl5b.o
│   │       │       │   ├── cfpqqg5tqn4x6lze65dbji3om.o
│   │       │       │   ├── cgbousat1312nx7qrw5kxg9yh.o
│   │       │       │   ├── cgi3052wijtehd0mcu78qffkq.o
│   │       │       │   ├── ci037rn1jaym8yewwkm906jm7.o
│   │       │       │   ├── cl8nivbca86ncmb217ifox29b.o
│   │       │       │   ├── cmza765wc0itmu5hvmhajfjdm.o
│   │       │       │   ├── crig4hj6qj39x80v2v30a24kz.o
│   │       │       │   ├── ctbuwgvll5uuzo6np9co6b5l6.o
│   │       │       │   ├── ctsym85mkl11f8e4ln9nkkkao.o
│   │       │       │   ├── cvfylckg7kujnmb42lkvuti5a.o
│   │       │       │   ├── cxbc66wvmqa3g981yil2g6e06.o
│   │       │       │   ├── cyxbu4yzlzmpokk7c9ix64bfq.o
│   │       │       │   ├── d194r9av7ghhluk2aubp0fo00.o
│   │       │       │   ├── d1kz85x2rx6bd4zmoiktuzd27.o
│   │       │       │   ├── d4a3pu7ei5vs14gepb90qh885.o
│   │       │       │   ├── d4lst9f9t4la86dcuj0djpg52.o
│   │       │       │   ├── dcj48psmdkj11okxoua05cway.o
│   │       │       │   ├── ddwle930m4zw2vg9to1ztdjne.o
│   │       │       │   ├── dep-graph.bin
│   │       │       │   ├── dh60tahmm3xq53r1pkjy312xe.o
│   │       │       │   ├── dhsasq8vij0hry4ludoemxtvs.o
│   │       │       │   ├── dkbmsawbm8bky78aqyzevxen5.o
│   │       │       │   ├── dmabowhjdlj8j0jqgfb3n2rdh.o
│   │       │       │   ├── dmzy3kjhtzk48a2vzhvxxn3yc.o
│   │       │       │   ├── dn3s3zewhq677xm39qevx7jpl.o
│   │       │       │   ├── dnw1vh8jibo13zea4bmgnv0me.o
│   │       │       │   ├── drecby7qbt0lmfd2hkol9724l.o
│   │       │       │   ├── dtzn4w46hj7xjzepadyamx3ai.o
│   │       │       │   ├── e668264lblqlc7h5zfqpn7yb6.o
│   │       │       │   ├── e6ysso5a9mgktg4i6wn0ih903.o
│   │       │       │   ├── e94plguj75xkml5ejhdm848u7.o
│   │       │       │   ├── ebtii4un7usxsb662ot55upt4.o
│   │       │       │   ├── ec3zcwh5xylwgifbhl6co0r7v.o
│   │       │       │   ├── eh2ny9ss8u3mthkwv10kwxike.o
│   │       │       │   ├── ekzrwzg8yxn298srk0ehin8s1.o
│   │       │       │   ├── emjl05rlc4j0m5vm6wy1bjbfb.o
│   │       │       │   ├── emls8ut1yw1766mfv8lv4tg0r.o
│   │       │       │   ├── epfahsc495qaelh06e1mo4pi5.o
│   │       │       │   ├── erl6jtdw1ptxj99ajlvg0teq8.o
│   │       │       │   ├── euf5t790ppdb1wdukrrhrdjt7.o
│   │       │       │   ├── ev2kgok52kbcg4vc7c86vmkaw.o
│   │       │       │   ├── evte0buknn1z515tnjvnbgln1.o
│   │       │       │   ├── ewfdyefowewgxad68fp81lbmp.o
│   │       │       │   ├── ewy8tqvwxf14al0wkxose21t0.o
│   │       │       │   ├── eyk709rzwpvqt5h7uhz6c18z7.o
│   │       │       │   ├── ezfkrr9t33mxqhx33u7eu7gv2.o
│   │       │       │   ├── f1k5v1ygsjtkwx7oka6ywbtv0.o
│   │       │       │   ├── f1so6lo42udh643kbbo5hyek8.o
│   │       │       │   ├── f38ar40b1zuleeq2v2co34s81.o
│   │       │       │   ├── query-cache.bin
│   │       │       │   └── work-products.bin
│   │       │       └── s-hj4gv5ki97-03phbuk.lock
│   │       ├── rtk
│   │       └── rtk.d
│   └── tests
│       └── fixtures
│           ├── dotnet
│           │   ├── build_failed.txt
│           │   ├── format_changes.json
│           │   ├── format_empty.json
│           │   ├── format_success.json
│           │   └── test_failed.txt
│           ├── glab_ci_trace_raw.txt
│           ├── glab_issue_list_raw.json
│           ├── glab_mr_list_raw.json
│           ├── glab_release_list_raw.txt
│           ├── glab_release_view_raw.txt
│           ├── golangci_v2_json.txt
│           ├── gradlew_build_failed_raw.txt
│           ├── gradlew_build_raw.txt
│           ├── gradlew_connected_raw.txt
│           ├── gradlew_lint_raw.txt
│           ├── gradlew_test_failed_raw.txt
│           └── gradlew_test_raw.txt
├── scripts
│   ├── benchmark.sh
│   ├── check-installation.sh
│   ├── check-test-presence.sh
│   ├── generate-three-way-report.ts
│   ├── liveComparisonCases.ts
│   ├── test-install.sh
│   ├── update-readme-metrics.sh
│   └── validate-docs.sh
├── src
│   ├── cli.ts
│   ├── core
│   │   ├── ansi.ts
│   │   ├── fallback.ts
│   │   ├── history.ts
│   │   ├── outputLimit.ts
│   │   ├── path.ts
│   │   ├── patterns.ts
│   │   ├── pipeline.ts
│   │   ├── rawStore.ts
│   │   ├── report.ts
│   │   ├── savings.ts
│   │   ├── stats.ts
│   │   └── text.ts
│   ├── executor.ts
│   ├── handlers
│   │   ├── base.ts
│   │   ├── common
│   │   │   ├── diff.ts
│   │   │   ├── listLike.ts
│   │   │   ├── readLike.ts
│   │   │   └── searchLike.ts
│   │   ├── generic.ts
│   │   ├── git
│   │   │   ├── branch.ts
│   │   │   ├── compactDiff.ts
│   │   │   ├── diff.ts
│   │   │   ├── extended.ts
│   │   │   ├── hostingCli.ts
│   │   │   ├── log.ts
│   │   │   ├── show.ts
│   │   │   └── status.ts
│   │   ├── index.ts
│   │   ├── java
│   │   │   ├── gradle.ts
│   │   │   ├── javac.ts
│   │   │   └── maven.ts
│   │   ├── js
│   │   │   ├── eslint.ts
│   │   │   ├── packageList.ts
│   │   │   ├── test.ts
│   │   │   └── tsc.ts
│   │   └── python
│   │       ├── mypy.ts
│   │       ├── pip.ts
│   │       ├── pytest.ts
│   │       └── ruff.ts
│   ├── parse.ts
│   ├── router.ts
│   └── types.ts
├── tests
│   ├── fixtures
│   │   ├── common
│   │   │   ├── cat_large_ts.txt
│   │   │   ├── cat_multi_file.txt
│   │   │   ├── diff_lcs_insert.txt
│   │   │   ├── diff_unified_large.txt
│   │   │   ├── diff_unified_stdin.txt
│   │   │   ├── find_small_root_files.txt
│   │   │   ├── find_src_ts.txt
│   │   │   ├── grep_count_imports.txt
│   │   │   ├── grep_file_list_imports.txt
│   │   │   ├── grep_no_line_numbers.txt
│   │   │   ├── ls_large_project.txt
│   │   │   ├── rg_default_format.txt
│   │   │   ├── rg_json_imports.txt
│   │   │   └── rg_many_matches.txt
│   │   ├── git
│   │   │   ├── add_missing_path.txt
│   │   │   ├── branch_many.txt
│   │   │   ├── branch_small_current.txt
│   │   │   ├── commit_dry_run_dirty.txt
│   │   │   ├── diff_large.txt
│   │   │   ├── diff_stat_current.txt
│   │   │   ├── fetch_missing_remote.txt
│   │   │   ├── gh_repo_view.json
│   │   │   ├── glab_ci_trace_raw.txt
│   │   │   ├── glab_issue_list_raw.json
│   │   │   ├── glab_mr_list_raw.json
│   │   │   ├── glab_release_list_raw.txt
│   │   │   ├── glab_release_view_raw.txt
│   │   │   ├── log_many.txt
│   │   │   ├── log_standard.txt
│   │   │   ├── pull_unstaged_changes.txt
│   │   │   ├── push_dry_run_local.txt
│   │   │   ├── show_large.txt
│   │   │   ├── stash_invalid_ref.txt
│   │   │   ├── status_dirty.txt
│   │   │   ├── status_dirty_extended.txt
│   │   │   ├── status_porcelain_branch_current.txt
│   │   │   ├── status_short_current.txt
│   │   │   └── worktree_list.txt
│   │   ├── go
│   │   │   └── golangci_v2_json.txt
│   │   ├── java
│   │   │   ├── gradle_test_failed.txt
│   │   │   ├── gradlew_build_failed_raw.txt
│   │   │   ├── gradlew_build_raw.txt
│   │   │   ├── gradlew_connected_raw.txt
│   │   │   ├── gradlew_lint_raw.txt
│   │   │   ├── gradlew_test_failed_raw.txt
│   │   │   ├── gradlew_test_raw.txt
│   │   │   ├── javac_errors.txt
│   │   │   └── maven_test_failed.txt
│   │   ├── js
│   │   │   ├── eslint_many.txt
│   │   │   ├── jest_failed.txt
│   │   │   ├── npm_list_large.txt
│   │   │   ├── pnpm_list_depth0.txt
│   │   │   ├── tsc_many.txt
│   │   │   ├── vitest_failed.txt
│   │   │   └── vitest_passed.txt
│   │   └── python
│   │       ├── mypy_many.txt
│   │       ├── pip_list_large.txt
│   │       ├── pytest_failed.txt
│   │       ├── pytest_passed.txt
│   │       └── ruff_many.txt
│   ├── helpers
│   │   ├── assertions.ts
│   │   ├── fixtureCases.ts
│   │   └── rtkParityManifest.ts
│   ├── integration
│   │   ├── cli.test.ts
│   │   └── rtkParity.test.ts
│   ├── smoke
│   │   └── smoke.sh
│   └── unit
│       ├── core
│       │   ├── ansi.test.ts
│       │   ├── qualityGate.test.ts
│       │   ├── reportQuality.test.ts
│       │   └── tscEmptyOutput.test.ts
│       ├── executor.test.ts
│       ├── fixtures.test.ts
│       ├── handlers
│       │   ├── common
│       │   ├── fixtureContent.test.ts
│       │   ├── fixtureRegressionDebt.test.ts
│       │   ├── fixtureWiring.test.ts
│       │   ├── git
│       │   ├── java
│       │   ├── js
│       │   ├── python
│       │   ├── registeredHandlerCoverage.test.ts
│       │   ├── rtkDomainCaseParity.test.ts
│       │   └── syntheticTestDebt.test.ts
│       ├── parse.test.ts
│       ├── pipeline.test.ts
│       ├── projectConfig.test.ts
│       ├── router.test.ts
│       ├── rtkScriptParity.test.ts
│       ├── savings.test.ts
│       └── scripts
│           └── threeWayReport.test.ts
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
└── vitest.migration.config.ts

176 directories, 2055 files

```

**tg** (14811 chars, 3703 tokens, 88.1% savings):

```text
README.md
docs
docs/DESIGN.md
docs/REPORT.md
docs/migration-goal-prompt.md
docs/testing-and-migration-audit.md
docs/three-way-comparison.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
rtk
rtk/CHANGELOG.md
rtk/CLAUDE.md
rtk/CONTRIBUTING.md
rtk/Cargo.lock
rtk/Cargo.toml
rtk/DISCLAIMER.md
rtk/Formula
rtk/Formula/rtk.rb
rtk/INSTALL.md
rtk/LICENSE
rtk/README.md
rtk/README_es.md
rtk/README_fr.md
rtk/README_ja.md
rtk/README_ko.md
rtk/README_pt.md
rtk/README_zh.md
rtk/SECURITY.md
rtk/build.rs
rtk/docs
rtk/docs/TELEMETRY.md
rtk/docs/contributing
rtk/docs/contributing/ARCHITECTURE.md
rtk/docs/contributing/CODING_PRACTICES.md
rtk/docs/contributing/TECHNICAL.md
rtk/docs/guide
rtk/docs/guide/analytics
rtk/docs/guide/analytics/discover.md
rtk/docs/guide/analytics/gain.md
rtk/docs/guide/getting-started
rtk/docs/guide/getting-started/configuration.md
rtk/docs/guide/getting-started/installation.md
rtk/docs/guide/getting-started/quick-start.md
rtk/docs/guide/getting-started/supported-agents.md
rtk/docs/guide/index.md
rtk/docs/guide/resources
rtk/docs/guide/resources/telemetry.md
rtk/docs/guide/resources/troubleshooting.md
rtk/docs/guide/resources/what-rtk-covers.md
rtk/docs/maintainers
rtk/docs/maintainers/MAINTAINERS_APPLY.md
rtk/docs/usage
rtk/docs/usage/AUDIT_GUIDE.md
rtk/docs/usage/FEATURES.md
rtk/docs/usage/TRACKING.md
rtk/hooks
rtk/hooks/README.md
rtk/hooks/antigravity
rtk/hooks/antigravity/README.md
rtk/hooks/antigravity/rules.md
rtk/hooks/claude
rtk/hooks/claude/README.md
rtk/hooks/claude/rtk-awareness.md
rtk/hooks/claude/rtk-rewrite.sh
rtk/hooks/claude/test-rtk-rewrite.sh
rtk/hooks/cline
rtk/hooks/cline/README.md
rtk/hooks/cline/rules.md
rtk/hooks/codex
rtk/hooks/codex/README.md
rtk/hooks/codex/rtk-awareness.md
rtk/hooks/copilot
rtk/hooks/copilot/README.md
rtk/hooks/copilot/rtk-awareness.md
rtk/hooks/copilot/test-rtk-rewrite.sh
rtk/hooks/cursor
rtk/hooks/cursor/README.md
rtk/hooks/cursor/rtk-rewrite.sh
rtk/hooks/hermes
rtk/hooks/hermes/README.md
rtk/hooks/hermes/rtk-rewrite
rtk/hooks/hermes/rtk-rewrite/__init__.py
rtk/hooks/hermes/rtk-rewrite/plugin.yaml
rtk/hooks/hermes/tests
rtk/hooks/hermes/tests/__init__.py
rtk/hooks/hermes/tests/test_rtk_rewrite_plugin.py
rtk/hooks/kilocode
rtk/hooks/kilocode/README.md
rtk/hooks/kilocode/rules.md
rtk/hooks/opencode
rtk/hooks/opencode/README.md
rtk/hooks/opencode/rtk.ts
rtk/hooks/pi
rtk/hooks/pi/README.md
rtk/hooks/pi/rtk.ts
rtk/hooks/windsurf
rtk/hooks/windsurf/README.md
rtk/hooks/windsurf/rules.md
rtk/install.sh
rtk/openclaw
rtk/openclaw/README.md
rtk/openclaw/index.ts
rtk/openclaw/openclaw.plugin.json
rtk/openclaw/package.json
rtk/release-please-config.json
rtk/scripts
rtk/scripts/benchmark
rtk/scripts/benchmark-sessions
rtk/scripts/benchmark-sessions/lib
rtk/scripts/benchmark-sessions/lib/runner.py
rtk/scripts/benchmark.sh
rtk/scripts/benchmark/cleanup.ts
rtk/scripts/benchmark/cloud-init.yaml
rtk/scripts/benchmark/lib
rtk/scripts/benchmark/lib/report.ts
rtk/scripts/benchmark/lib/test.ts
rtk/scripts/benchmark/lib/vm.ts
rtk/scripts/benchmark/rebuild.ts
rtk/scripts/benchmark/run.ts
rtk/scripts/check-installation.sh
rtk/scripts/check-test-presence.sh
rtk/scripts/install-local.sh
rtk/scripts/rtk-economics.sh
rtk/scripts/test-all.sh
rtk/scripts/test-aristote.sh
rtk/scripts/test-install.sh
rtk/scripts/test-ruby.sh
rtk/scripts/test-tracking.sh
rtk/scripts/update-readme-metrics.sh
rtk/scripts/validate-docs.sh
rtk/src
rtk/src/analytics
rtk/src/analytics/README.md
rtk/src/analytics/cc_economics.rs
rtk/src/analytics/ccusage.rs
rtk/src/analytics/gain.rs
rtk/src/analytics/mod.rs
rtk/src/analytics/session_cmd.rs
rtk/src/cmds
rtk/src/cmds/README.md
rtk/src/cmds/cloud
rtk/src/cmds/cloud/README.md
rtk/src/cmds/cloud/aws_cmd.rs
rtk/src/cmds/cloud/container.rs
rtk/src/cmds/cloud/curl_cmd.rs
rtk/src/cmds/cloud/mod.rs
rtk/src/cmds/cloud/psql_cmd.rs
rtk/src/cmds/cloud/wget_cmd.rs
rtk/src/cmds/dotnet
rtk/src/cmds/dotnet/README.md
rtk/src/cmds/dotnet/binlog.rs
rtk/src/cmds/dotnet/dotnet_cmd.rs
rtk/src/cmds/dotnet/dotnet_format_report.rs
rtk/src/cmds/dotnet/dotnet_trx.rs
rtk/src/cmds/dotnet/mod.rs
rtk/src/cmds/git
rtk/src/cmds/git/README.md
rtk/src/cmds/git/diff_cmd.rs
rtk/src/cmds/git/gh_cmd.rs
rtk/src/cmds/git/git.rs
rtk/src/cmds/git/glab_cmd.rs
rtk/src/cmds/git/gt_cmd.rs
rtk/src/cmds/git/mod.rs
rtk/src/cmds/go
rtk/src/cmds/go/README.md
rtk/src/cmds/go/go_cmd.rs
rtk/src/cmds/go/golangci_cmd.rs
rtk/src/cmds/go/mod.rs
rtk/src/cmds/js
rtk/src/cmds/js/README.md
rtk/src/cmds/js/lint_cmd.rs
rtk/src/cmds/js/mod.rs
rtk/src/cmds/js/next_cmd.rs
rtk/src/cmds/js/npm_cmd.rs
rtk/src/cmds/js/playwright_cmd.rs
rtk/src/cmds/js/pnpm_cmd.rs
rtk/src/cmds/js/prettier_cmd.rs
rtk/src/cmds/js/prisma_cmd.rs
rtk/src/cmds/js/tsc_cmd.rs
rtk/src/cmds/js/vitest_cmd.rs
rtk/src/cmds/jvm
rtk/src/cmds/jvm/gradlew_cmd.rs
rtk/src/cmds/jvm/mod.rs
rtk/src/cmds/mod.rs
rtk/src/cmds/python
rtk/src/cmds/python/README.md
rtk/src/cmds/python/mod.rs
rtk/src/cmds/python/mypy_cmd.rs
rtk/src/cmds/python/pip_cmd.rs
rtk/src/cmds/python/pytest_cmd.rs
rtk/src/cmds/python/ruff_cmd.rs
rtk/src/cmds/ruby
rtk/src/cmds/ruby/README.md
rtk/src/cmds/ruby/mod.rs
rtk/src/cmds/ruby/rake_cmd.rs
rtk/src/cmds/ruby/rspec_cmd.rs
rtk/src/cmds/ruby/rubocop_cmd.rs
rtk/src/cmds/rust
rtk/src/cmds/rust/README.md
rtk/src/cmds/rust/cargo_cmd.rs
rtk/src/cmds/rust/mod.rs
rtk/src/cmds/rust/runner.rs
rtk/src/cmds/system
rtk/src/cmds/system/README.md
rtk/src/cmds/system/constants.rs
rtk/src/cmds/system/deps.rs
rtk/src/cmds/system/env_cmd.rs
rtk/src/cmds/system/find_cmd.rs
rtk/src/cmds/system/format_cmd.rs
rtk/src/cmds/system/grep_cmd.rs
rtk/src/cmds/system/json_cmd.rs
rtk/src/cmds/system/local_llm.rs
rtk/src/cmds/system/log_cmd.rs
rtk/src/cmds/system/ls.rs
rtk/src/cmds/system/mod.rs
rtk/src/cmds/system/pipe_cmd.rs
rtk/src/cmds/system/read.rs
rtk/src/cmds/system/summary.rs
rtk/src/cmds/system/tree.rs
rtk/src/cmds/system/wc_cmd.rs
rtk/src/core
rtk/src/core/README.md
rtk/src/core/args_utils.rs
rtk/src/core/config.rs
rtk/src/core/constants.rs
rtk/src/core/display_helpers.rs
rtk/src/core/filter.rs
rtk/src/core/mod.rs
rtk/src/core/runner.rs
rtk/src/core/stream.rs
rtk/src/core/tee.rs
rtk/src/core/telemetry.rs
rtk/src/core/telemetry_cmd.rs
rtk/src/core/toml_filter.rs
rtk/src/core/tracking.rs
rtk/src/core/truncate.rs
rtk/src/core/utils.rs
rtk/src/discover
rtk/src/discover/README.md
rtk/src/discover/lexer.rs
rtk/src/discover/mod.rs
rtk/src/discover/provider.rs
rtk/src/discover/registry.rs
rtk/src/discover/report.rs
rtk/src/discover/rules.rs
rtk/src/filters
rtk/src/filters/README.md
rtk/src/filters/ansible-playbook.toml
rtk/src/filters/basedpyright.toml
rtk/src/filters/biome.toml
rtk/src/filters/brew-install.toml
rtk/src/filters/bundle-install.toml
rtk/src/filters/composer-install.toml
rtk/src/filters/df.toml
rtk/src/filters/dotnet-build.toml
rtk/src/filters/du.toml
rtk/src/filters/fail2ban-client.toml
rtk/src/filters/gcc.toml
rtk/src/filters/gcloud.toml
rtk/src/filters/gradle.toml
rtk/src/filters/hadolint.toml
rtk/src/filters/helm.toml
rtk/src/filters/iptables.toml
rtk/src/filters/jira.toml
rtk/src/filters/jj.toml
rtk/src/filters/jq.toml
rtk/src/filters/just.toml
rtk/src/filters/liquibase.toml
rtk/src/filters/make.toml
rtk/src/filters/markdownlint.toml
rtk/src/filters/mise.toml
rtk/src/filters/mix-compile.toml
rtk/src/filters/mix-format.toml
rtk/src/filters/mvn-build.toml
rtk/src/filters/nx.toml
rtk/src/filters/ollama.toml
rtk/src/filters/oxlint.toml
rtk/src/filters/ping.toml
rtk/src/filters/pio-run.toml
rtk/src/filters/poetry-install.toml
rtk/src/filters/pre-commit.toml
rtk/src/filters/ps.toml
rtk/src/filters/quarto-render.toml
rtk/src/filters/rsync.toml
rtk/src/filters/shellcheck.toml
rtk/src/filters/shopify-theme.toml
rtk/src/filters/skopeo.toml
rtk/src/filters/sops.toml
rtk/src/filters/spring-boot.toml
rtk/src/filters/ssh.toml
rtk/src/filters/stat.toml
rtk/src/filters/swift-build.toml
rtk/src/filters/systemctl-status.toml
rtk/src/filters/task.toml
rtk/src/filters/terraform-plan.toml
rtk/src/filters/tofu-fmt.toml
rtk/src/filters/tofu-init.toml
rtk/src/filters/tofu-plan.toml
rtk/src/filters/tofu-validate.toml
rtk/src/filters/trunk-build.toml
rtk/src/filters/turbo.toml
rtk/src/filters/ty.toml
rtk/src/filters/uv-sync.toml
rtk/src/filters/xcodebuild.toml
rtk/src/filters/yadm.toml
rtk/src/filters/yamllint.toml
rtk/src/hooks
rtk/src/hooks/README.md
rtk/src/hooks/constants.rs
rtk/src/hooks/hook_audit_cmd.rs
rtk/src/hooks/hook_check.rs
rtk/src/hooks/hook_cmd.rs
rtk/src/hooks/init.rs
rtk/src/hooks/integrity.rs
rtk/src/hooks/mod.rs
rtk/src/hooks/permissions.rs
rtk/src/hooks/rewrite_cmd.rs
rtk/src/hooks/trust.rs
rtk/src/hooks/verify_cmd.rs
rtk/src/learn
rtk/src/learn/README.md
rtk/src/learn/detector.rs
rtk/src/learn/mod.rs
rtk/src/learn/report.rs
rtk/src/main.rs
rtk/src/parser
rtk/src/parser/README.md
rtk/src/parser/formatter.rs
rtk/src/parser/mod.rs
rtk/src/parser/types.rs
rtk/tests
rtk/tests/fixtures
rtk/tests/fixtures/dotnet
rtk/tests/fixtures/dotnet/build_failed.txt
rtk/tests/fixtures/dotnet/format_changes.json
rtk/tests/fixtures/dotnet/format_empty.json
rtk/tests/fixtures/dotnet/format_success.json
rtk/tests/fixtures/dotnet/test_failed.txt
rtk/tests/fixtures/glab_ci_trace_raw.txt
rtk/tests/fixtures/glab_issue_list_raw.json
rtk/tests/fixtures/glab_mr_list_raw.json
rtk/tests/fixtures/glab_release_list_raw.txt
rtk/tests/fixtures/glab_release_view_raw.txt
rtk/tests/fixtures/golangci_v2_json.txt
rtk/tests/fixtures/gradlew_build_failed_raw.txt
rtk/tests/fixtures/gradlew_build_raw.txt
rtk/tests/fixtures/gradlew_connected_raw.txt
rtk/tests/fixtures/gradlew_lint_raw.txt
rtk/tests/fixtures/gradlew_test_failed_raw.txt
rtk/tests/fixtures/gradlew_test_raw.txt
scripts
scripts/benchmark.sh
scripts/check-installation.sh
scripts/check-test-presence.sh
scripts/generate-three-way-report.ts
scripts/liveComparisonCases.ts
scripts/test-install.sh
scripts/update-readme-metrics.sh
scripts/validate-docs.sh
src
src/cli.ts
src/core
src/core/ansi.ts
src/core/fallback.ts
src/core/history.ts
src/core/outputLimit.ts
src/core/path.ts
src/core/patterns.ts
src/core/pipeline.ts
src/core/rawStore.ts
src/core/report.ts
src/core/savings.ts
src/core/stats.ts
src/core/text.ts
src/executor.ts
src/handlers
src/handlers/base.ts
src/handlers/common
src/handlers/common/diff.ts
src/handlers/common/listLike.ts
src/handlers/common/readLike.ts
src/handlers/common/searchLike.ts
src/handlers/generic.ts
src/handlers/git
src/handlers/git/branch.ts
src/handlers/git/compactDiff.ts
src/handlers/git/diff.ts
src/handlers/git/extended.ts
src/handlers/git/hostingCli.ts
src/handlers/git/log.ts
src/handlers/git/show.ts
src/handlers/git/status.ts
src/handlers/index.ts
src/handlers/java
src/handlers/java/gradle.ts
src/handlers/java/javac.ts
src/handlers/java/maven.ts
src/handlers/js
src/handlers/js/eslint.ts
src/handlers/js/packageList.ts
src/handlers/js/test.ts
src/handlers/js/tsc.ts
src/handlers/python
src/handlers/python/mypy.ts
src/handlers/python/pip.ts
src/handlers/python/pytest.ts
src/handlers/python/ruff.ts
src/parse.ts
src/router.ts
src/types.ts
tests
tests/fixtures
tests/fixtures/common
tests/fixtures/common/cat_large_ts.txt
tests/fixtures/common/cat_multi_file.txt
tests/fixtures/common/diff_lcs_insert.txt
tests/fixtures/common/diff_unified_large.txt
tests/fixtures/common/diff_unified_stdin.txt
tests/fixtures/common/find_small_root_files.txt
tests/fixtures/common/find_src_ts.txt
tests/fixtures/common/grep_count_imports.txt
tests/fixtures/common/grep_file_list_imports.txt
tests/fixtures/common/grep_no_line_numbers.txt
tests/fixtures/common/ls_large_project.txt
tests/fixtures/common/rg_default_format.txt
tests/fixtures/common/rg_json_imports.txt
tests/fixtures/common/rg_many_matches.txt
tests/fixtures/git
tests/fixtures/git/add_missing_path.txt
tests/fixtures/git/branch_many.txt
tests/fixtures/git/branch_small_current.txt
tests/fixtures/git/commit_dry_run_dirty.txt
tests/fixtures/git/diff_large.txt
tests/fixtures/git/diff_stat_current.txt
tests/fixtures/git/fetch_missing_remote.txt
tests/fixtures/git/gh_repo_view.json
tests/fixtures/git/glab_ci_trace_raw.txt
tests/fixtures/git/glab_issue_list_raw.json
tests/fixtures/git/glab_mr_list_raw.json
tests/fixtures/git/glab_release_list_raw.txt
tests/fixtures/git/glab_release_view_raw.txt
tests/fixtures/git/log_many.txt
tests/fixtures/git/log_standard.txt
tests/fixtures/git/pull_unstaged_changes.txt
tests/fixtures/git/push_dry_run_local.txt
tests/fixtures/git/show_large.txt
tests/fixtures/git/stash_invalid_ref.txt
tests/fixtures/git/status_dirty.txt
tests/fixtures/git/status_dirty_extended.txt
tests/fixtures/git/status_porcelain_branch_current.txt
tests/fixtures/git/status_short_current.txt
tests/fixtures/git/worktree_list.txt
tests/fixtures/go
tests/fixtures/go/golangci_v2_json.txt
tests/fixtures/java
tests/fixtures/java/gradle_test_failed.txt
tests/fixtures/java/gradlew_build_failed_raw.txt
tests/fixtures/java/gradlew_build_raw.txt
tests/fixtures/java/gradlew_connected_raw.txt
tests/fixtures/java/gradlew_lint_raw.txt
tests/fixtures/java/gradlew_test_failed_raw.txt
tests/fixtures/java/gradlew_test_raw.txt
tests/fixtures/java/javac_errors.txt
tests/fixtures/java/maven_test_failed.txt
tests/fixtures/js
tests/fixtures/js/eslint_many.txt
tests/fixtures/js/jest_failed.txt
tests/fixtures/js/npm_list_large.txt
tests/fixtures/js/pnpm_list_depth0.txt
tests/fixtures/js/tsc_many.txt
tests/fixtures/js/vitest_failed.txt
tests/fixtures/js/vitest_passed.txt
tests/fixtures/python
tests/fixtures/python/mypy_many.txt
tests/fixtures/python/pip_list_large.txt
tests/fixtures/python/pytest_failed.txt
tests/fixtures/python/pytest_passed.txt
tests/fixtures/python/ruff_many.txt
tests/helpers
tests/helpers/assertions.ts
tests/helpers/fixtureCases.ts
tests/helpers/rtkParityManifest.ts
tests/integration
tests/integration/cli.test.ts
tests/integration/rtkParity.test.ts
tests/smoke
tests/smoke/smoke.sh
tests/unit
tests/unit/core
tests/unit/core/ansi.test.ts
tests/unit/core/qualityGate.test.ts
tests/unit/core/reportQuality.test.ts
tests/unit/core/tscEmptyOutput.test.ts
tests/unit/executor.test.ts
tests/unit/fixtures.test.ts
tests/unit/handlers
tests/unit/handlers/common
tests/unit/handlers/fixtureContent.test.ts
tests/unit/handlers/fixtureRegressionDebt.test.ts
tests/unit/handlers/fixtureWiring.test.ts
tests/unit/handlers/git
tests/unit/handlers/java
tests/unit/handlers/js
tests/unit/handlers/python
tests/unit/handlers/registeredHandlerCoverage.test.ts
tests/unit/handlers/rtkDomainCaseParity.test.ts
tests/unit/handlers/syntheticTestDebt.test.ts
tests/unit/parse.test.ts
tests/unit/pipeline.test.ts
tests/unit/projectConfig.test.ts
tests/unit/router.test.ts
tests/unit/rtkScriptParity.test.ts
tests/unit/savings.test.ts
tests/unit/scripts
tests/unit/scripts/threeWayReport.test.ts
tsconfig.json
tsdown.config.ts
vitest.config.ts
vitest.migration.config.ts

```

**rtk** (14685 chars, 3672 tokens, 88.2% savings):

```text
.
├── README.md
├── docs
│   ├── DESIGN.md
│   ├── REPORT.md
│   ├── migration-goal-prompt.md
│   ├── testing-and-migration-audit.md
│   └── three-way-comparison.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── rtk
│   ├── CHANGELOG.md
│   ├── CLAUDE.md
│   ├── CONTRIBUTING.md
│   ├── Cargo.lock
│   ├── Cargo.toml
│   ├── DISCLAIMER.md
│   ├── Formula
│   │   └── rtk.rb
│   ├── INSTALL.md
│   ├── LICENSE
│   ├── README.md
│   ├── README_es.md
│   ├── README_fr.md
│   ├── README_ja.md
│   ├── README_ko.md
│   ├── README_pt.md
│   ├── README_zh.md
│   ├── SECURITY.md
│   ├── build.rs
│   ├── docs
│   │   ├── TELEMETRY.md
│   │   ├── contributing
│   │   │   ├── ARCHITECTURE.md
│   │   │   ├── CODING_PRACTICES.md
│   │   │   └── TECHNICAL.md
│   │   ├── guide
│   │   │   ├── analytics
│   │   │   │   ├── discover.md
│   │   │   │   └── gain.md
│   │   │   ├── getting-started
│   │   │   │   ├── configuration.md
│   │   │   │   ├── installation.md
│   │   │   │   ├── quick-start.md
│   │   │   │   └── supported-agents.md
│   │   │   ├── index.md
│   │   │   └── resources
│   │   │       ├── telemetry.md
│   │   │       ├── troubleshooting.md
│   │   │       └── what-rtk-covers.md
│   │   ├── maintainers
│   │   │   └── MAINTAINERS_APPLY.md
│   │   └── usage
│   │       ├── AUDIT_GUIDE.md
│   │       ├── FEATURES.md
│   │       └── TRACKING.md
│   ├── hooks
│   │   ├── README.md
│   │   ├── antigravity
│   │   │   ├── README.md
│   │   │   └── rules.md
│   │   ├── claude
│   │   │   ├── README.md
│   │   │   ├── rtk-awareness.md
│   │   │   ├── rtk-rewrite.sh
│   │   │   └── test-rtk-rewrite.sh
│   │   ├── cline
│   │   │   ├── README.md
│   │   │   └── rules.md
│   │   ├── codex
│   │   │   ├── README.md
│   │   │   └── rtk-awareness.md
│   │   ├── copilot
│   │   │   ├── README.md
│   │   │   ├── rtk-awareness.md
│   │   │   └── test-rtk-rewrite.sh
│   │   ├── cursor
│   │   │   ├── README.md
│   │   │   └── rtk-rewrite.sh
│   │   ├── hermes
│   │   │   ├── README.md
│   │   │   ├── rtk-rewrite
│   │   │   │   ├── __init__.py
│   │   │   │   └── plugin.yaml
│   │   │   └── tests
│   │   │       ├── __init__.py
│   │   │       └── test_rtk_rewrite_plugin.py
│   │   ├── kilocode
│   │   │   ├── README.md
│   │   │   └── rules.md
│   │   ├── opencode
│   │   │   ├── README.md
│   │   │   └── rtk.ts
│   │   ├── pi
│   │   │   ├── README.md
│   │   │   └── rtk.ts
│   │   └── windsurf
│   │       ├── README.md
│   │       └── rules.md
│   ├── install.sh
│   ├── openclaw
│   │   ├── README.md
│   │   ├── index.ts
│   │   ├── openclaw.plugin.json
│   │   └── package.json
│   ├── release-please-config.json
│   ├── scripts
│   │   ├── benchmark
│   │   │   ├── cleanup.ts
│   │   │   ├── cloud-init.yaml
│   │   │   ├── lib
│   │   │   │   ├── report.ts
│   │   │   │   ├── test.ts
│   │   │   │   └── vm.ts
│   │   │   ├── rebuild.ts
│   │   │   └── run.ts
│   │   ├── benchmark-sessions
│   │   │   └── lib
│   │   │       └── runner.py
│   │   ├── benchmark.sh
│   │   ├── check-installation.sh
│   │   ├── check-test-presence.sh
│   │   ├── install-local.sh
│   │   ├── rtk-economics.sh
│   │   ├── test-all.sh
│   │   ├── test-aristote.sh
│   │   ├── test-install.sh
│   │   ├── test-ruby.sh
│   │   ├── test-tracking.sh
│   │   ├── update-readme-metrics.sh
│   │   └── validate-docs.sh
│   ├── src
│   │   ├── analytics
│   │   │   ├── README.md
│   │   │   ├── cc_economics.rs
│   │   │   ├── ccusage.rs
│   │   │   ├── gain.rs
│   │   │   ├── mod.rs
│   │   │   └── session_cmd.rs
│   │   ├── cmds
│   │   │   ├── README.md
│   │   │   ├── cloud
│   │   │   │   ├── README.md
│   │   │   │   ├── aws_cmd.rs
│   │   │   │   ├── container.rs
│   │   │   │   ├── curl_cmd.rs
│   │   │   │   ├── mod.rs
│   │   │   │   ├── psql_cmd.rs
│   │   │   │   └── wget_cmd.rs
│   │   │   ├── dotnet
│   │   │   │   ├── README.md
│   │   │   │   ├── binlog.rs
│   │   │   │   ├── dotnet_cmd.rs
│   │   │   │   ├── dotnet_format_report.rs
│   │   │   │   ├── dotnet_trx.rs
│   │   │   │   └── mod.rs
│   │   │   ├── git
│   │   │   │   ├── README.md
│   │   │   │   ├── diff_cmd.rs
│   │   │   │   ├── gh_cmd.rs
│   │   │   │   ├── git.rs
│   │   │   │   ├── glab_cmd.rs
│   │   │   │   ├── gt_cmd.rs
│   │   │   │   └── mod.rs
│   │   │   ├── go
│   │   │   │   ├── README.md
│   │   │   │   ├── go_cmd.rs
│   │   │   │   ├── golangci_cmd.rs
│   │   │   │   └── mod.rs
│   │   │   ├── js
│   │   │   │   ├── README.md
│   │   │   │   ├── lint_cmd.rs
│   │   │   │   ├── mod.rs
│   │   │   │   ├── next_cmd.rs
│   │   │   │   ├── npm_cmd.rs
│   │   │   │   ├── playwright_cmd.rs
│   │   │   │   ├── pnpm_cmd.rs
│   │   │   │   ├── prettier_cmd.rs
│   │   │   │   ├── prisma_cmd.rs
│   │   │   │   ├── tsc_cmd.rs
│   │   │   │   └── vitest_cmd.rs
│   │   │   ├── jvm
│   │   │   │   ├── gradlew_cmd.rs
│   │   │   │   └── mod.rs
│   │   │   ├── mod.rs
│   │   │   ├── python
│   │   │   │   ├── README.md
│   │   │   │   ├── mod.rs
│   │   │   │   ├── mypy_cmd.rs
│   │   │   │   ├── pip_cmd.rs
│   │   │   │   ├── pytest_cmd.rs
│   │   │   │   └── ruff_cmd.rs
│   │   │   ├── ruby
│   │   │   │   ├── README.md
│   │   │   │   ├── mod.rs
│   │   │   │   ├── rake_cmd.rs
│   │   │   │   ├── rspec_cmd.rs
│   │   │   │   └── rubocop_cmd.rs
│   │   │   ├── rust
│   │   │   │   ├── README.md
│   │   │   │   ├── cargo_cmd.rs
│   │   │   │   ├── mod.rs
│   │   │   │   └── runner.rs
│   │   │   └── system
│   │   │       ├── README.md
│   │   │       ├── constants.rs
│   │   │       ├── deps.rs
│   │   │       ├── env_cmd.rs
│   │   │       ├── find_cmd.rs
│   │   │       ├── format_cmd.rs
│   │   │       ├── grep_cmd.rs
│   │   │       ├── json_cmd.rs
│   │   │       ├── local_llm.rs
│   │   │       ├── log_cmd.rs
│   │   │       ├── ls.rs
│   │   │       ├── mod.rs
│   │   │       ├── pipe_cmd.rs
│   │   │       ├── read.rs
│   │   │       ├── summary.rs
│   │   │       ├── tree.rs
│   │   │       └── wc_cmd.rs
│   │   ├── core
│   │   │   ├── README.md
│   │   │   ├── args_utils.rs
│   │   │   ├── config.rs
│   │   │   ├── constants.rs
│   │   │   ├── display_helpers.rs
│   │   │   ├── filter.rs
│   │   │   ├── mod.rs
│   │   │   ├── runner.rs
│   │   │   ├── stream.rs
│   │   │   ├── tee.rs
│   │   │   ├── telemetry.rs
│   │   │   ├── telemetry_cmd.rs
│   │   │   ├── toml_filter.rs
│   │   │   ├── tracking.rs
│   │   │   ├── truncate.rs
│   │   │   └── utils.rs
│   │   ├── discover
│   │   │   ├── README.md
│   │   │   ├── lexer.rs
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs
│   │   │   ├── registry.rs
│   │   │   ├── report.rs
│   │   │   └── rules.rs
│   │   ├── filters
│   │   │   ├── README.md
│   │   │   ├── ansible-playbook.toml
│   │   │   ├── basedpyright.toml
│   │   │   ├── biome.toml
│   │   │   ├── brew-install.toml
│   │   │   ├── bundle-install.toml
│   │   │   ├── composer-install.toml
│   │   │   ├── df.toml
│   │   │   ├── dotnet-build.toml
│   │   │   ├── du.toml
│   │   │   ├── fail2ban-client.toml
│   │   │   ├── gcc.toml
│   │   │   ├── gcloud.toml
│   │   │   ├── gradle.toml
│   │   │   ├── hadolint.toml
│   │   │   ├── helm.toml
│   │   │   ├── iptables.toml
│   │   │   ├── jira.toml
│   │   │   ├── jj.toml
│   │   │   ├── jq.toml
│   │   │   ├── just.toml
│   │   │   ├── liquibase.toml
│   │   │   ├── make.toml
│   │   │   ├── markdownlint.toml
│   │   │   ├── mise.toml
│   │   │   ├── mix-compile.toml
│   │   │   ├── mix-format.toml
│   │   │   ├── mvn-build.toml
│   │   │   ├── nx.toml
│   │   │   ├── ollama.toml
│   │   │   ├── oxlint.toml
│   │   │   ├── ping.toml
│   │   │   ├── pio-run.toml
│   │   │   ├── poetry-install.toml
│   │   │   ├── pre-commit.toml
│   │   │   ├── ps.toml
│   │   │   ├── quarto-render.toml
│   │   │   ├── rsync.toml
│   │   │   ├── shellcheck.toml
│   │   │   ├── shopify-theme.toml
│   │   │   ├── skopeo.toml
│   │   │   ├── sops.toml
│   │   │   ├── spring-boot.toml
│   │   │   ├── ssh.toml
│   │   │   ├── stat.toml
│   │   │   ├── swift-build.toml
│   │   │   ├── systemctl-status.toml
│   │   │   ├── task.toml
│   │   │   ├── terraform-plan.toml
│   │   │   ├── tofu-fmt.toml
│   │   │   ├── tofu-init.toml
│   │   │   ├── tofu-plan.toml
│   │   │   ├── tofu-validate.toml
│   │   │   ├── trunk-build.toml
│   │   │   ├── turbo.toml
│   │   │   ├── ty.toml
│   │   │   ├── uv-sync.toml
│   │   │   ├── xcodebuild.toml
│   │   │   ├── yadm.toml
│   │   │   └── yamllint.toml
│   │   ├── hooks
│   │   │   ├── README.md
│   │   │   ├── constants.rs
│   │   │   ├── hook_audit_cmd.rs
│   │   │   ├── hook_check.rs
│   │   │   ├── hook_cmd.rs
│   │   │   ├── init.rs
│   │   │   ├── integrity.rs
│   │   │   ├── mod.rs
│   │   │   ├── permissions.rs
│   │   │   ├── rewrite_cmd.rs
│   │   │   ├── trust.rs
│   │   │   └── verify_cmd.rs
│   │   ├── learn
│   │   │   ├── README.md
│   │   │   ├── detector.rs
│   │   │   ├── mod.rs
│   │   │   └── report.rs
│   │   ├── main.rs
│   │   └── parser
│   │       ├── README.md
│   │       ├── formatter.rs
│   │       ├── mod.rs
│   │       └── types.rs
│   └── tests
│       └── fixtures
│           ├── dotnet
│           │   ├── build_failed.txt
│           │   ├── format_changes.json
│           │   ├── format_empty.json
│           │   ├── format_success.json
│           │   └── test_failed.txt
│           ├── glab_ci_trace_raw.txt
│           ├── glab_issue_list_raw.json
│           ├── glab_mr_list_raw.json
│           ├── glab_release_list_raw.txt
│           ├── glab_release_view_raw.txt
│           ├── golangci_v2_json.txt
│           ├── gradlew_build_failed_raw.txt
│           ├── gradlew_build_raw.txt
│           ├── gradlew_connected_raw.txt
│           ├── gradlew_lint_raw.txt
│           ├── gradlew_test_failed_raw.txt
│           └── gradlew_test_raw.txt
├── scripts
│   ├── benchmark.sh
│   ├── check-installation.sh
│   ├── check-test-presence.sh
│   ├── generate-three-way-report.ts
│   ├── liveComparisonCases.ts
│   ├── test-install.sh
│   ├── update-readme-metrics.sh
│   └── validate-docs.sh
├── src
│   ├── cli.ts
│   ├── core
│   │   ├── ansi.ts
│   │   ├── fallback.ts
│   │   ├── history.ts
│   │   ├── outputLimit.ts
│   │   ├── path.ts
│   │   ├── patterns.ts
│   │   ├── pipeline.ts
│   │   ├── rawStore.ts
│   │   ├── report.ts
│   │   ├── savings.ts
│   │   ├── stats.ts
│   │   └── text.ts
│   ├── executor.ts
│   ├── handlers
│   │   ├── base.ts
│   │   ├── common
│   │   │   ├── diff.ts
│   │   │   ├── listLike.ts
│   │   │   ├── readLike.ts
│   │   │   └── searchLike.ts
│   │   ├── generic.ts
│   │   ├── git
│   │   │   ├── branch.ts
│   │   │   ├── compactDiff.ts
│   │   │   ├── diff.ts
│   │   │   ├── extended.ts
│   │   │   ├── hostingCli.ts
│   │   │   ├── log.ts
│   │   │   ├── show.ts
│   │   │   └── status.ts
│   │   ├── index.ts
│   │   ├── java
│   │   │   ├── gradle.ts
│   │   │   ├── javac.ts
│   │   │   └── maven.ts
│   │   ├── js
│   │   │   ├── eslint.ts
│   │   │   ├── packageList.ts
│   │   │   ├── test.ts
│   │   │   └── tsc.ts
│   │   └── python
│   │       ├── mypy.ts
│   │       ├── pip.ts
│   │       ├── pytest.ts
│   │       └── ruff.ts
│   ├── parse.ts
│   ├── router.ts
│   └── types.ts
├── tests
│   ├── fixtures
│   │   ├── common
│   │   │   ├── cat_large_ts.txt
│   │   │   ├── cat_multi_file.txt
│   │   │   ├── diff_lcs_insert.txt
│   │   │   ├── diff_unified_large.txt
│   │   │   ├── diff_unified_stdin.txt
│   │   │   ├── find_small_root_files.txt
│   │   │   ├── find_src_ts.txt
│   │   │   ├── grep_count_imports.txt
│   │   │   ├── grep_file_list_imports.txt
│   │   │   ├── grep_no_line_numbers.txt
│   │   │   ├── ls_large_project.txt
│   │   │   ├── rg_default_format.txt
│   │   │   ├── rg_json_imports.txt
│   │   │   └── rg_many_matches.txt
│   │   ├── git
│   │   │   ├── add_missing_path.txt
│   │   │   ├── branch_many.txt
│   │   │   ├── branch_small_current.txt
│   │   │   ├── commit_dry_run_dirty.txt
│   │   │   ├── diff_large.txt
│   │   │   ├── diff_stat_current.txt
│   │   │   ├── fetch_missing_remote.txt
│   │   │   ├── gh_repo_view.json
│   │   │   ├── glab_ci_trace_raw.txt
│   │   │   ├── glab_issue_list_raw.json
│   │   │   ├── glab_mr_list_raw.json
│   │   │   ├── glab_release_list_raw.txt
│   │   │   ├── glab_release_view_raw.txt
│   │   │   ├── log_many.txt
│   │   │   ├── log_standard.txt
│   │   │   ├── pull_unstaged_changes.txt
│   │   │   ├── push_dry_run_local.txt
│   │   │   ├── show_large.txt
│   │   │   ├── stash_invalid_ref.txt
│   │   │   ├── status_dirty.txt
│   │   │   ├── status_dirty_extended.txt
│   │   │   ├── status_porcelain_branch_current.txt
│   │   │   ├── status_short_current.txt
│   │   │   └── worktree_list.txt
│   │   ├── go
│   │   │   └── golangci_v2_json.txt
│   │   ├── java
│   │   │   ├── gradle_test_failed.txt
│   │   │   ├── gradlew_build_failed_raw.txt
│   │   │   ├── gradlew_build_raw.txt
│   │   │   ├── gradlew_connected_raw.txt
│   │   │   ├── gradlew_lint_raw.txt
│   │   │   ├── gradlew_test_failed_raw.txt
│   │   │   ├── gradlew_test_raw.txt
│   │   │   ├── javac_errors.txt
│   │   │   └── maven_test_failed.txt
│   │   ├── js
│   │   │   ├── eslint_many.txt
│   │   │   ├── jest_failed.txt
│   │   │   ├── npm_list_large.txt
│   │   │   ├── pnpm_list_depth0.txt
│   │   │   ├── tsc_many.txt
│   │   │   ├── vitest_failed.txt
│   │   │   └── vitest_passed.txt
│   │   └── python
│   │       ├── mypy_many.txt
│   │       ├── pip_list_large.txt
│   │       ├── pytest_failed.txt
│   │       ├── pytest_passed.txt
│   │       └── ruff_many.txt
│   ├── helpers
│   │   ├── assertions.ts
│   │   ├── fixtureCases.ts
│   │   └── rtkParityManifest.ts
│   ├── integration
│   │   ├── cli.test.ts
│   │   └── rtkParity.test.ts
│   ├── smoke
│   │   └── smoke.sh
│   └── unit
│       ├── core
│       │   ├── ansi.test.ts
│       │   ├── qualityGate.test.ts
│       │   ├── reportQuality.test.ts
│       │   └── tscEmptyOutput.test.ts
│       ├── executor.test.ts
│       ├── fixtures.test.ts
│       ├── handlers
│       │   ├── common
│       │   ├── fixtureContent.test.ts
│       │   ├── fixtureRegressionDebt.test.ts
│       │   ├── fixtureWiring.test.ts
│       │   ├── git
│       │   ├── java
│       │   ├── js
│       │   ├── python
│       │   ├── registeredHandlerCoverage.test.ts
│       │   ├── rtkDomainCaseParity.test.ts
│       │   └── syntheticTestDebt.test.ts
│       ├── parse.test.ts
│       ├── pipeline.test.ts
│       ├── projectConfig.test.ts
│       ├── router.test.ts
│       ├── rtkScriptParity.test.ts
│       ├── savings.test.ts
│       └── scripts
│           └── threeWayReport.test.ts
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
└── vitest.migration.config.ts

```

---

### 7. search-like: grep -r import src/

- Handler: `search-like`
- tg: `tg grep -r import src/`
- raw: `grep -r import src/`
- rtk: `grep import src/`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 11400 | 2850 | 0% |
| tg | 11400 | 2850 | 0% |
| rtk | 11655 | 2914 | 0% |

**raw** (11400 chars, 2850 tokens):

```text
src/executor.ts:import { spawn } from "node:child_process";
src/executor.ts:import type { ParsedCommand, RawResult } from "./types.js";
src/core/history.ts:import { mkdir, readFile, writeFile } from "node:fs/promises";
src/core/history.ts:import path from "node:path";
src/core/history.ts:import type { FilteredResult, RawResult, TgOptions } from "../types.js";
src/core/rawStore.ts:import { mkdir, writeFile } from "node:fs/promises";
src/core/rawStore.ts:import path from "node:path";
src/core/rawStore.ts:import type { RawResult, TgOptions } from "../types.js";
src/core/rawStore.ts:import { safePathPart } from "./path.js";
src/core/report.ts:import type { TgOptions } from "../types.js";
src/core/report.ts:import { readHistory } from "./history.js";
src/core/fallback.ts:import { routeCommand } from "../router.js";
src/core/fallback.ts:import type { FilteredResult, ParsedCommand, RawResult, TgOptions } from "../types.js";
src/core/ansi.ts:import stripAnsi from "strip-ansi";
src/core/pipeline.ts:import { recordHistory } from "./history.js";
src/core/pipeline.ts:import { filterWithGenericFallback } from "./fallback.js";
src/core/pipeline.ts:import type { CommandHandler, FilteredResult, ParsedCommand, RawResult, TgOptions } from "../types.js";
src/core/outputLimit.ts:import type { TgOptions } from "../types.js";
src/parse.ts:import type { ParsedArgv, ParsedCommand, TgOptions } from "./types.js";
src/router.ts:import type { CommandHandler, ParsedCommand } from "./types.js";
src/router.ts:import { handlers } from "./handlers/index.js";
src/cli.ts:import { parseArgv } from "./parse.js";
src/cli.ts:import { routeCommand } from "./router.js";
src/cli.ts:import { buildReport } from "./core/report.js";
src/cli.ts:import { runPipeline } from "./core/pipeline.js";
src/cli.ts:import { recordHistory } from "./core/history.js";
src/cli.ts:import { calculateSavings } from "./core/savings.js";
src/cli.ts:import { maybeSaveRawOutput } from "./core/rawStore.js";
src/cli.ts:import { formatStats } from "./core/stats.js";
src/cli.ts:import type { FilteredResult, RawResult, TgOptions } from "./types.js";
src/handlers/base.ts:import type { FilteredResult, RawResult, TgOptions } from "../types.js";
src/handlers/base.ts:import { calculateSavings } from "../core/savings.js";
src/handlers/base.ts:import { maybeSaveRawOutput } from "../core/rawStore.js";
src/handlers/base.ts:import { limitOutput } from "../core/outputLimit.js";
src/handlers/base.ts:import { removeAnsi } from "../core/ansi.js";
src/handlers/python/pip.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/pip.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/pip.ts:import { makeFilteredResult } from "../base.js";
src/handlers/python/ruff.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/ruff.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/ruff.ts:import { makeFilteredResult } from "../base.js";
src/handlers/python/pytest.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/pytest.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/pytest.ts:import { makeFilteredResult } from "../base.js";
src/handlers/python/pytest.ts:  const important = lines
src/handlers/python/pytest.ts:  if (failed.length > 0 || important.length > 0) {
src/handlers/python/pytest.ts:    for (const line of [...failed, ...important]) {
src/handlers/python/mypy.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/mypy.ts:import type { CommandHandler } from "../../types.js";
src/handlers/python/mypy.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/packageList.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/packageList.ts:import { readFileSync } from "node:fs";
src/handlers/js/packageList.ts:import path from "node:path";
src/handlers/js/packageList.ts:import type { CommandHandler, ParsedCommand, TgOptions } from "../../types.js";
src/handlers/js/packageList.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/tsc.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/tsc.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/tsc.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/test.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/test.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/test.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/eslint.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/eslint.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/eslint.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/maven.ts:import { executeCommand } from "../../executor.js";
src/handlers/java/maven.ts:import type { CommandHandler } from "../../types.js";
src/handlers/java/maven.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/maven.ts:  const important = lines
src/handlers/java/maven.ts:  out.push(...important.map((line) => line.trim()));
src/handlers/java/javac.ts:import { executeCommand } from "../../executor.js";
src/handlers/java/javac.ts:import type { CommandHandler } from "../../types.js";
src/handlers/java/javac.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/gradle.ts:import { executeCommand } from "../../executor.js";
src/handlers/java/gradle.ts:import type { CommandHandler } from "../../types.js";
src/handlers/java/gradle.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/gradle.ts:  const important = text
src/handlers/java/gradle.ts:  return `${[heading, ...important].join("\n")}\n`;
src/handlers/common/searchLike.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/searchLike.ts:import type { CommandHandler } from "../../types.js";
src/handlers/common/searchLike.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/diff.ts:import { readFile, stat } from "node:fs/promises";
src/handlers/common/diff.ts:import path from "node:path";
src/handlers/common/diff.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/diff.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/common/diff.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/listLike.ts:import { readdir } from "node:fs/promises";
src/handlers/common/listLike.ts:import path from "node:path";
src/handlers/common/listLike.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/listLike.ts:import type { CommandHandler, ParsedCommand, RawResult } from "../../types.js";
src/handlers/common/listLike.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/readLike.ts:import { readFile, stat } from "node:fs/promises";
src/handlers/common/readLike.ts:import path from "node:path";
src/handlers/common/readLike.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/readLike.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/common/readLike.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/readLike.ts:      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
src/handlers/generic.ts:import { executeCommand } from "../executor.js";
src/handlers/generic.ts:import type { CommandHandler } from "../types.js";
src/handlers/generic.ts:import { makeFilteredResult, rawText } from "./base.js";
src/handlers/index.ts:import type { CommandHandler } from "../types.js";
src/handlers/index.ts:import { readLikeHandler } from "./common/readLike.js";
src/handlers/index.ts:import { listLikeHandler } from "./common/listLike.js";
src/handlers/index.ts:import { searchLikeHandler } from "./common/searchLike.js";
src/handlers/index.ts:import { diffHandler } from "./common/diff.js";
src/handlers/index.ts:import { gitStatusHandler } from "./git/status.js";
src/handlers/index.ts:import { gitDiffHandler } from "./git/diff.js";
src/handlers/index.ts:import { gitLogHandler } from "./git/log.js";
src/handlers/index.ts:import { gitShowHandler } from "./git/show.js";
src/handlers/index.ts:import { gitBranchHandler } from "./git/branch.js";
src/handlers/index.ts:import { gitExtendedHandlers } from "./git/extended.js";
src/handlers/index.ts:import { ghHandler, glabHandler } from "./git/hostingCli.js";
src/handlers/index.ts:import { pytestHandler } from "./python/pytest.js";
src/handlers/index.ts:import { ruffHandler } from "./python/ruff.js";
src/handlers/index.ts:import { mypyHandler } from "./python/mypy.js";
src/handlers/index.ts:import { pipHandler } from "./python/pip.js";
src/handlers/index.ts:import { jsTestHandler } from "./js/test.js";
src/handlers/index.ts:import { eslintHandler } from "./js/eslint.js";
src/handlers/index.ts:import { tscHandler } from "./js/tsc.js";
src/handlers/index.ts:import { packageListHandler } from "./js/packageList.js";
src/handlers/index.ts:import { mavenHandler } from "./java/maven.js";
src/handlers/index.ts:import { gradleHandler } from "./java/gradle.js";
src/handlers/index.ts:import { javacHandler } from "./java/javac.js";
src/handlers/index.ts:import { genericHandler } from "./generic.js";
src/handlers/git/status.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/status.ts:import type { CommandHandler } from "../../types.js";
src/handlers/git/status.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/diff.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/diff.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/git/diff.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/diff.ts:import { compactUnifiedDiff } from "./compactDiff.js";
src/handlers/git/branch.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/branch.ts:import type { CommandHandler } from "../../types.js";
src/handlers/git/branch.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/hostingCli.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/hostingCli.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/git/hostingCli.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/extended.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/extended.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/git/extended.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/log.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/log.ts:import type { CommandHandler } from "../../types.js";
src/handlers/git/log.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/show.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/show.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/git/show.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/show.ts:import { compactUnifiedDiff, extractDiffStatLines } from "./compactDiff.js";

```

**tg** (11400 chars, 2850 tokens, 0% savings):

```text
src/executor.ts:import { spawn } from "node:child_process";
src/executor.ts:import type { ParsedCommand, RawResult } from "./types.js";
src/core/history.ts:import { mkdir, readFile, writeFile } from "node:fs/promises";
src/core/history.ts:import path from "node:path";
src/core/history.ts:import type { FilteredResult, RawResult, TgOptions } from "../types.js";
src/core/rawStore.ts:import { mkdir, writeFile } from "node:fs/promises";
src/core/rawStore.ts:import path from "node:path";
src/core/rawStore.ts:import type { RawResult, TgOptions } from "../types.js";
src/core/rawStore.ts:import { safePathPart } from "./path.js";
src/core/report.ts:import type { TgOptions } from "../types.js";
src/core/report.ts:import { readHistory } from "./history.js";
src/core/fallback.ts:import { routeCommand } from "../router.js";
src/core/fallback.ts:import type { FilteredResult, ParsedCommand, RawResult, TgOptions } from "../types.js";
src/core/ansi.ts:import stripAnsi from "strip-ansi";
src/core/pipeline.ts:import { recordHistory } from "./history.js";
src/core/pipeline.ts:import { filterWithGenericFallback } from "./fallback.js";
src/core/pipeline.ts:import type { CommandHandler, FilteredResult, ParsedCommand, RawResult, TgOptions } from "../types.js";
src/core/outputLimit.ts:import type { TgOptions } from "../types.js";
src/parse.ts:import type { ParsedArgv, ParsedCommand, TgOptions } from "./types.js";
src/router.ts:import type { CommandHandler, ParsedCommand } from "./types.js";
src/router.ts:import { handlers } from "./handlers/index.js";
src/cli.ts:import { parseArgv } from "./parse.js";
src/cli.ts:import { routeCommand } from "./router.js";
src/cli.ts:import { buildReport } from "./core/report.js";
src/cli.ts:import { runPipeline } from "./core/pipeline.js";
src/cli.ts:import { recordHistory } from "./core/history.js";
src/cli.ts:import { calculateSavings } from "./core/savings.js";
src/cli.ts:import { maybeSaveRawOutput } from "./core/rawStore.js";
src/cli.ts:import { formatStats } from "./core/stats.js";
src/cli.ts:import type { FilteredResult, RawResult, TgOptions } from "./types.js";
src/handlers/base.ts:import type { FilteredResult, RawResult, TgOptions } from "../types.js";
src/handlers/base.ts:import { calculateSavings } from "../core/savings.js";
src/handlers/base.ts:import { maybeSaveRawOutput } from "../core/rawStore.js";
src/handlers/base.ts:import { limitOutput } from "../core/outputLimit.js";
src/handlers/base.ts:import { removeAnsi } from "../core/ansi.js";
src/handlers/python/pip.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/pip.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/pip.ts:import { makeFilteredResult } from "../base.js";
src/handlers/python/ruff.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/ruff.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/ruff.ts:import { makeFilteredResult } from "../base.js";
src/handlers/python/pytest.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/pytest.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/pytest.ts:import { makeFilteredResult } from "../base.js";
src/handlers/python/pytest.ts:  const important = lines
src/handlers/python/pytest.ts:  if (failed.length > 0 || important.length > 0) {
src/handlers/python/pytest.ts:    for (const line of [...failed, ...important]) {
src/handlers/python/mypy.ts:import { executeCommand } from "../../executor.js";
src/handlers/python/mypy.ts:import type { CommandHandler } from "../../types.js";
src/handlers/python/mypy.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/packageList.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/packageList.ts:import { readFileSync } from "node:fs";
src/handlers/js/packageList.ts:import path from "node:path";
src/handlers/js/packageList.ts:import type { CommandHandler, ParsedCommand, TgOptions } from "../../types.js";
src/handlers/js/packageList.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/tsc.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/tsc.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/tsc.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/test.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/test.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/test.ts:import { makeFilteredResult } from "../base.js";
src/handlers/js/eslint.ts:import { executeCommand } from "../../executor.js";
src/handlers/js/eslint.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/eslint.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/maven.ts:import { executeCommand } from "../../executor.js";
src/handlers/java/maven.ts:import type { CommandHandler } from "../../types.js";
src/handlers/java/maven.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/maven.ts:  const important = lines
src/handlers/java/maven.ts:  out.push(...important.map((line) => line.trim()));
src/handlers/java/javac.ts:import { executeCommand } from "../../executor.js";
src/handlers/java/javac.ts:import type { CommandHandler } from "../../types.js";
src/handlers/java/javac.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/gradle.ts:import { executeCommand } from "../../executor.js";
src/handlers/java/gradle.ts:import type { CommandHandler } from "../../types.js";
src/handlers/java/gradle.ts:import { makeFilteredResult } from "../base.js";
src/handlers/java/gradle.ts:  const important = text
src/handlers/java/gradle.ts:  return `${[heading, ...important].join("\n")}\n`;
src/handlers/common/searchLike.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/searchLike.ts:import type { CommandHandler } from "../../types.js";
src/handlers/common/searchLike.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/diff.ts:import { readFile, stat } from "node:fs/promises";
src/handlers/common/diff.ts:import path from "node:path";
src/handlers/common/diff.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/diff.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/common/diff.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/listLike.ts:import { readdir } from "node:fs/promises";
src/handlers/common/listLike.ts:import path from "node:path";
src/handlers/common/listLike.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/listLike.ts:import type { CommandHandler, ParsedCommand, RawResult } from "../../types.js";
src/handlers/common/listLike.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/readLike.ts:import { readFile, stat } from "node:fs/promises";
src/handlers/common/readLike.ts:import path from "node:path";
src/handlers/common/readLike.ts:import { executeCommand } from "../../executor.js";
src/handlers/common/readLike.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/common/readLike.ts:import { makeFilteredResult } from "../base.js";
src/handlers/common/readLike.ts:      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
src/handlers/generic.ts:import { executeCommand } from "../executor.js";
src/handlers/generic.ts:import type { CommandHandler } from "../types.js";
src/handlers/generic.ts:import { makeFilteredResult, rawText } from "./base.js";
src/handlers/index.ts:import type { CommandHandler } from "../types.js";
src/handlers/index.ts:import { readLikeHandler } from "./common/readLike.js";
src/handlers/index.ts:import { listLikeHandler } from "./common/listLike.js";
src/handlers/index.ts:import { searchLikeHandler } from "./common/searchLike.js";
src/handlers/index.ts:import { diffHandler } from "./common/diff.js";
src/handlers/index.ts:import { gitStatusHandler } from "./git/status.js";
src/handlers/index.ts:import { gitDiffHandler } from "./git/diff.js";
src/handlers/index.ts:import { gitLogHandler } from "./git/log.js";
src/handlers/index.ts:import { gitShowHandler } from "./git/show.js";
src/handlers/index.ts:import { gitBranchHandler } from "./git/branch.js";
src/handlers/index.ts:import { gitExtendedHandlers } from "./git/extended.js";
src/handlers/index.ts:import { ghHandler, glabHandler } from "./git/hostingCli.js";
src/handlers/index.ts:import { pytestHandler } from "./python/pytest.js";
src/handlers/index.ts:import { ruffHandler } from "./python/ruff.js";
src/handlers/index.ts:import { mypyHandler } from "./python/mypy.js";
src/handlers/index.ts:import { pipHandler } from "./python/pip.js";
src/handlers/index.ts:import { jsTestHandler } from "./js/test.js";
src/handlers/index.ts:import { eslintHandler } from "./js/eslint.js";
src/handlers/index.ts:import { tscHandler } from "./js/tsc.js";
src/handlers/index.ts:import { packageListHandler } from "./js/packageList.js";
src/handlers/index.ts:import { mavenHandler } from "./java/maven.js";
src/handlers/index.ts:import { gradleHandler } from "./java/gradle.js";
src/handlers/index.ts:import { javacHandler } from "./java/javac.js";
src/handlers/index.ts:import { genericHandler } from "./generic.js";
src/handlers/git/status.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/status.ts:import type { CommandHandler } from "../../types.js";
src/handlers/git/status.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/diff.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/diff.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/git/diff.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/diff.ts:import { compactUnifiedDiff } from "./compactDiff.js";
src/handlers/git/branch.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/branch.ts:import type { CommandHandler } from "../../types.js";
src/handlers/git/branch.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/hostingCli.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/hostingCli.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/git/hostingCli.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/extended.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/extended.ts:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
src/handlers/git/extended.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/log.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/log.ts:import type { CommandHandler } from "../../types.js";
src/handlers/git/log.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/show.ts:import { executeCommand } from "../../executor.js";
src/handlers/git/show.ts:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/git/show.ts:import { makeFilteredResult } from "../base.js";
src/handlers/git/show.ts:import { compactUnifiedDiff, extractDiffStatLines } from "./compactDiff.js";

```

**rtk** (11655 chars, 2914 tokens, 0% savings):

```text
146 matches in 36 files:

src/cli.ts:2:import { parseArgv } from "./parse.js";
src/cli.ts:3:import { routeCommand } from "./router.js";
src/cli.ts:4:import { buildReport } from "./core/report.js";
src/cli.ts:5:import { runPipeline } from "./core/pipeline.js";
src/cli.ts:6:import { recordHistory } from "./core/history.js";
src/cli.ts:7:import { calculateSavings } from "./core/savings.js";
src/cli.ts:8:import { maybeSaveRawOutput } from "./core/rawStore.js";
src/cli.ts:9:import { formatStats } from "./core/stats.js";
src/cli.ts:10:import type { FilteredResult, RawResult, TgOptions } from "./types.js";
src/core/ansi.ts:1:import stripAnsi from "strip-ansi";
src/core/fallback.ts:1:import { routeCommand } from "../router.js";
src/core/fallback.ts:2:import type { FilteredResult, ParsedCommand, RawResult, TgOptions } from "../typ...
src/core/history.ts:1:import { mkdir, readFile, writeFile } from "node:fs/promises";
src/core/history.ts:2:import path from "node:path";
src/core/history.ts:4:import type { FilteredResult, RawResult, TgOptions } from "../types.js";
src/core/outputLimit.ts:1:import type { TgOptions } from "../types.js";
src/core/pipeline.ts:1:import { recordHistory } from "./history.js";
src/core/pipeline.ts:2:import { filterWithGenericFallback } from "./fallback.js";
src/core/pipeline.ts:3:import type { CommandHandler, FilteredResult, ParsedCommand, RawResult, TgOption...
src/core/rawStore.ts:1:import { mkdir, writeFile } from "node:fs/promises";
src/core/rawStore.ts:2:import path from "node:path";
src/core/rawStore.ts:4:import type { RawResult, TgOptions } from "../types.js";
src/core/rawStore.ts:5:import { safePathPart } from "./path.js";
src/core/report.ts:1:import type { TgOptions } from "../types.js";
src/core/report.ts:2:import { readHistory } from "./history.js";
src/executor.ts:1:import { spawn } from "node:child_process";
src/executor.ts:3:import type { ParsedCommand, RawResult } from "./types.js";
src/handlers/base.ts:1:import type { FilteredResult, RawResult, TgOptions } from "../types.js";
src/handlers/base.ts:2:import { calculateSavings } from "../core/savings.js";
src/handlers/base.ts:3:import { maybeSaveRawOutput } from "../core/rawStore.js";
src/handlers/base.ts:4:import { limitOutput } from "../core/outputLimit.js";
src/handlers/base.ts:5:import { removeAnsi } from "../core/ansi.js";
src/handlers/common/diff.ts:1:import { readFile, stat } from "node:fs/promises";
src/handlers/common/diff.ts:2:import path from "node:path";
src/handlers/common/diff.ts:4:import { executeCommand } from "../../executor.js";
src/handlers/common/diff.ts:5:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../...
src/handlers/common/diff.ts:6:import { makeFilteredResult } from "../base.js";
src/handlers/common/listLike.ts:1:import { readdir } from "node:fs/promises";
src/handlers/common/listLike.ts:2:import path from "node:path";
src/handlers/common/listLike.ts:4:import { executeCommand } from "../../executor.js";
src/handlers/common/listLike.ts:5:import type { CommandHandler, ParsedCommand, RawResult } from "../../types.js";
src/handlers/common/listLike.ts:6:import { makeFilteredResult } from "../base.js";
src/handlers/common/readLike.ts:1:import { readFile, stat } from "node:fs/promises";
src/handlers/common/readLike.ts:2:import path from "node:path";
src/handlers/common/readLike.ts:4:import { executeCommand } from "../../executor.js";
src/handlers/common/readLike.ts:5:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../...
src/handlers/common/readLike.ts:6:import { makeFilteredResult } from "../base.js";
src/handlers/common/readLike.ts:26:/^(import |from |export |function |const \w+\s*=|class |interface |type |def |pa...
src/handlers/common/searchLike.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/common/searchLike.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/common/searchLike.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/generic.ts:1:import { executeCommand } from "../executor.js";
src/handlers/generic.ts:2:import type { CommandHandler } from "../types.js";
src/handlers/generic.ts:3:import { makeFilteredResult, rawText } from "./base.js";
src/handlers/git/branch.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/branch.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/git/branch.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/git/diff.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/diff.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/git/diff.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/git/diff.ts:4:import { compactUnifiedDiff } from "./compactDiff.js";
src/handlers/git/extended.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/extended.ts:2:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../...
src/handlers/git/extended.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/git/hostingCli.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/hostingCli.ts:2:import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../...
src/handlers/git/hostingCli.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/git/log.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/log.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/git/log.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/git/show.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/show.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/git/show.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/git/show.ts:4:import { compactUnifiedDiff, extractDiffStatLines } from "./compactDiff.js";
src/handlers/git/status.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/git/status.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/git/status.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/index.ts:1:import type { CommandHandler } from "../types.js";
src/handlers/index.ts:2:import { readLikeHandler } from "./common/readLike.js";
src/handlers/index.ts:3:import { listLikeHandler } from "./common/listLike.js";
src/handlers/index.ts:4:import { searchLikeHandler } from "./common/searchLike.js";
src/handlers/index.ts:5:import { diffHandler } from "./common/diff.js";
src/handlers/index.ts:6:import { gitStatusHandler } from "./git/status.js";
src/handlers/index.ts:7:import { gitDiffHandler } from "./git/diff.js";
src/handlers/index.ts:8:import { gitLogHandler } from "./git/log.js";
src/handlers/index.ts:9:import { gitShowHandler } from "./git/show.js";
src/handlers/index.ts:10:import { gitBranchHandler } from "./git/branch.js";
src/handlers/index.ts:11:import { gitExtendedHandlers } from "./git/extended.js";
src/handlers/index.ts:12:import { ghHandler, glabHandler } from "./git/hostingCli.js";
src/handlers/index.ts:13:import { pytestHandler } from "./python/pytest.js";
src/handlers/index.ts:14:import { ruffHandler } from "./python/ruff.js";
src/handlers/index.ts:15:import { mypyHandler } from "./python/mypy.js";
src/handlers/index.ts:16:import { pipHandler } from "./python/pip.js";
src/handlers/index.ts:17:import { jsTestHandler } from "./js/test.js";
src/handlers/index.ts:18:import { eslintHandler } from "./js/eslint.js";
src/handlers/index.ts:19:import { tscHandler } from "./js/tsc.js";
src/handlers/index.ts:20:import { packageListHandler } from "./js/packageList.js";
src/handlers/index.ts:21:import { mavenHandler } from "./java/maven.js";
src/handlers/index.ts:22:import { gradleHandler } from "./java/gradle.js";
src/handlers/index.ts:23:import { javacHandler } from "./java/javac.js";
src/handlers/index.ts:24:import { genericHandler } from "./generic.js";
src/handlers/java/gradle.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/java/gradle.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/java/gradle.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/java/gradle.ts:6:const important = text
src/handlers/java/gradle.ts:18:return `${[heading, ...important].join("\n")}\n`;
src/handlers/java/javac.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/java/javac.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/java/javac.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/java/maven.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/java/maven.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/java/maven.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/java/maven.ts:7:const important = lines
src/handlers/java/maven.ts:14:out.push(...important.map((line) => line.trim()));
src/handlers/js/eslint.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/js/eslint.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/eslint.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/js/packageList.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/js/packageList.ts:2:import { readFileSync } from "node:fs";
src/handlers/js/packageList.ts:3:import path from "node:path";
src/handlers/js/packageList.ts:5:import type { CommandHandler, ParsedCommand, TgOptions } from "../../types.js";
src/handlers/js/packageList.ts:6:import { makeFilteredResult } from "../base.js";
src/handlers/js/test.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/js/test.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/test.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/js/tsc.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/js/tsc.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/js/tsc.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/python/mypy.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/python/mypy.ts:2:import type { CommandHandler } from "../../types.js";
src/handlers/python/mypy.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/python/pip.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/python/pip.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/pip.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/python/pytest.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/python/pytest.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/pytest.ts:3:import { makeFilteredResult } from "../base.js";
src/handlers/python/pytest.ts:18:const important = lines
src/handlers/python/pytest.ts:24:if (failed.length > 0 || important.length > 0) {
src/handlers/python/pytest.ts:26:for (const line of [...failed, ...important]) {
src/handlers/python/ruff.ts:1:import { executeCommand } from "../../executor.js";
src/handlers/python/ruff.ts:2:import type { CommandHandler, ParsedCommand } from "../../types.js";
src/handlers/python/ruff.ts:3:import { makeFilteredResult } from "../base.js";
src/parse.ts:1:import type { ParsedArgv, ParsedCommand, TgOptions } from "./types.js";
src/router.ts:1:import type { CommandHandler, ParsedCommand } from "./types.js";
src/router.ts:2:import { handlers } from "./handlers/index.js";

```

---

### 8. search-like: rg export src/

- Handler: `search-like`
- tg: `tg rg export src/`
- raw: `rg export src/`
- rtk: `grep export src/`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 4603 | 1151 | 0% |
| tg | 4603 | 1151 | 0% |
| rtk | 4751 | 1188 | 0% |

**raw** (4603 chars, 1151 tokens):

```text
src/handlers/git/show.ts:export const gitShowHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/extended.ts:export const gitExtendedHandlers: CommandHandler[] = [...EXTENDED_GIT_HANDLERS.entries()].map(([subcommand, name]) =>
src/handlers/git/hostingCli.ts:export const ghHandler = makeHostingHandler("gh", formatGh);
src/handlers/git/hostingCli.ts:export const glabHandler = makeHostingHandler("glab", formatGlab);
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/compactDiff.ts:export function compactUnifiedDiff(diff: string, maxLines = 500): string {
src/handlers/git/compactDiff.ts:export function extractDiffStatLines(text: string): string[] {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/common/readLike.ts:      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/handlers/common/diff.ts:export const diffHandler: CommandHandler = {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/java/gradle.ts:export const gradleHandler: CommandHandler = {
src/handlers/java/javac.ts:export const javacHandler: CommandHandler = {
src/handlers/java/maven.ts:export const mavenHandler: CommandHandler = {
src/handlers/js/eslint.ts:export const eslintHandler: CommandHandler = {
src/handlers/js/test.ts:export const jsTestHandler: CommandHandler = {
src/handlers/js/tsc.ts:export const tscHandler: CommandHandler = {
src/handlers/js/packageList.ts:export const packageListHandler: CommandHandler = {
src/handlers/python/mypy.ts:export const mypyHandler: CommandHandler = {
src/handlers/python/pytest.ts:export const pytestHandler: CommandHandler = {
src/handlers/python/ruff.ts:export const ruffHandler: CommandHandler = {
src/handlers/python/pip.ts:export const pipHandler: CommandHandler = {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/base.ts:export function outputOmitsContent(output: string): boolean {
src/handlers/base.ts:export async function makeFilteredResult(
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TgOptions = {
src/types.ts:export type ParseMode = "command" | "report" | "help" | "version";
src/types.ts:export type ParsedArgv = {
src/types.ts:export interface CommandHandler {
src/router.ts:export function routeCommand(command: ParsedCommand): CommandHandler {
src/parse.ts:export function parseArgv(argv: string[]): ParsedArgv {
src/core/outputLimit.ts:export function limitLines(text: string, _maxLines: number): string {
src/core/outputLimit.ts:export function limitChars(text: string, _maxChars: number): string {
src/core/outputLimit.ts:export function limitOutput(text: string, _options: TgOptions): string {
src/core/patterns.ts:export const IMPORTANT_PATTERN =
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/pipeline.ts:export async function filterWithFallback(
src/core/stats.ts:export function formatStats(result: {
src/core/text.ts:export function uniqueLines(lines: string[]): string[] {
src/core/text.ts:export function ensureTrailingNewline(text: string): string {
src/core/ansi.ts:export function removeAnsi(text: string): string {
src/core/fallback.ts:export async function filterWithGenericFallback(
src/core/path.ts:export function safePathPart(value: string): string {
src/core/report.ts:export async function buildReport(options: TgOptions): Promise<string> {
src/core/rawStore.ts:export async function maybeSaveRawOutput(
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/executor.ts:export function executeCommand(command: ParsedCommand): Promise<RawResult> {

```

**tg** (4603 chars, 1151 tokens, 0% savings):

```text
src/handlers/git/show.ts:export const gitShowHandler: CommandHandler = {
src/handlers/git/log.ts:export const gitLogHandler: CommandHandler = {
src/handlers/git/extended.ts:export const gitExtendedHandlers: CommandHandler[] = [...EXTENDED_GIT_HANDLERS.entries()].map(([subcommand, name]) =>
src/handlers/git/hostingCli.ts:export const ghHandler = makeHostingHandler("gh", formatGh);
src/handlers/git/hostingCli.ts:export const glabHandler = makeHostingHandler("glab", formatGlab);
src/handlers/git/branch.ts:export const gitBranchHandler: CommandHandler = {
src/handlers/git/diff.ts:export const gitDiffHandler: CommandHandler = {
src/handlers/git/compactDiff.ts:export function compactUnifiedDiff(diff: string, maxLines = 500): string {
src/handlers/git/compactDiff.ts:export function extractDiffStatLines(text: string): string[] {
src/handlers/git/status.ts:export const gitStatusHandler: CommandHandler = {
src/handlers/index.ts:export const handlers: CommandHandler[] = [
src/handlers/generic.ts:export const genericHandler: CommandHandler = {
src/handlers/common/readLike.ts:      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
src/handlers/common/readLike.ts:export const readLikeHandler: CommandHandler = {
src/handlers/common/listLike.ts:export const listLikeHandler: CommandHandler = {
src/handlers/common/diff.ts:export const diffHandler: CommandHandler = {
src/handlers/common/searchLike.ts:export const searchLikeHandler: CommandHandler = {
src/handlers/java/gradle.ts:export const gradleHandler: CommandHandler = {
src/handlers/java/javac.ts:export const javacHandler: CommandHandler = {
src/handlers/java/maven.ts:export const mavenHandler: CommandHandler = {
src/handlers/js/eslint.ts:export const eslintHandler: CommandHandler = {
src/handlers/js/test.ts:export const jsTestHandler: CommandHandler = {
src/handlers/js/tsc.ts:export const tscHandler: CommandHandler = {
src/handlers/js/packageList.ts:export const packageListHandler: CommandHandler = {
src/handlers/python/mypy.ts:export const mypyHandler: CommandHandler = {
src/handlers/python/pytest.ts:export const pytestHandler: CommandHandler = {
src/handlers/python/ruff.ts:export const ruffHandler: CommandHandler = {
src/handlers/python/pip.ts:export const pipHandler: CommandHandler = {
src/handlers/base.ts:export function rawText(raw: RawResult): string {
src/handlers/base.ts:export function outputOmitsContent(output: string): boolean {
src/handlers/base.ts:export async function makeFilteredResult(
src/types.ts:export type ParsedCommand = {
src/types.ts:export type RawResult = {
src/types.ts:export type FilteredResult = {
src/types.ts:export type TgOptions = {
src/types.ts:export type ParseMode = "command" | "report" | "help" | "version";
src/types.ts:export type ParsedArgv = {
src/types.ts:export interface CommandHandler {
src/router.ts:export function routeCommand(command: ParsedCommand): CommandHandler {
src/parse.ts:export function parseArgv(argv: string[]): ParsedArgv {
src/core/outputLimit.ts:export function limitLines(text: string, _maxLines: number): string {
src/core/outputLimit.ts:export function limitChars(text: string, _maxChars: number): string {
src/core/outputLimit.ts:export function limitOutput(text: string, _options: TgOptions): string {
src/core/patterns.ts:export const IMPORTANT_PATTERN =
src/core/savings.ts:export type Savings = {
src/core/savings.ts:export function estimateTokens(text: string): number {
src/core/savings.ts:export function calculateSavings(raw: string, output: string): Savings {
src/core/pipeline.ts:export type PipelineResult = {
src/core/pipeline.ts:export async function runPipeline(
src/core/pipeline.ts:export async function filterWithFallback(
src/core/stats.ts:export function formatStats(result: {
src/core/text.ts:export function uniqueLines(lines: string[]): string[] {
src/core/text.ts:export function ensureTrailingNewline(text: string): string {
src/core/ansi.ts:export function removeAnsi(text: string): string {
src/core/fallback.ts:export async function filterWithGenericFallback(
src/core/path.ts:export function safePathPart(value: string): string {
src/core/report.ts:export async function buildReport(options: TgOptions): Promise<string> {
src/core/rawStore.ts:export async function maybeSaveRawOutput(
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
src/core/history.ts:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/executor.ts:export function executeCommand(command: ParsedCommand): Promise<RawResult> {

```

**rtk** (4751 chars, 1188 tokens, 0% savings):

```text
62 matches in 42 files:

src/core/ansi.ts:3:export function removeAnsi(text: string): string {
src/core/fallback.ts:4:export async function filterWithGenericFallback(
src/core/history.ts:6:export type HistoryRecord = {
src/core/history.ts:26:export async function recordHistory(
src/core/history.ts:53:export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
src/core/outputLimit.ts:3:export function limitLines(text: string, _maxLines: number): string {
src/core/outputLimit.ts:7:export function limitChars(text: string, _maxChars: number): string {
src/core/outputLimit.ts:11:export function limitOutput(text: string, _options: TgOptions): string {
src/core/path.ts:1:export function safePathPart(value: string): string {
src/core/patterns.ts:1:export const IMPORTANT_PATTERN =
src/core/pipeline.ts:5:export type PipelineResult = {
src/core/pipeline.ts:10:export async function runPipeline(
src/core/pipeline.ts:21:export async function filterWithFallback(
src/core/rawStore.ts:14:export async function maybeSaveRawOutput(
src/core/report.ts:4:export async function buildReport(options: TgOptions): Promise<string> {
src/core/savings.ts:1:export type Savings = {
src/core/savings.ts:10:export function estimateTokens(text: string): number {
src/core/savings.ts:14:export function calculateSavings(raw: string, output: string): Savings {
src/core/stats.ts:1:export function formatStats(result: {
src/core/text.ts:1:export function uniqueLines(lines: string[]): string[] {
src/core/text.ts:5:export function ensureTrailingNewline(text: string): string {
src/executor.ts:5:export function executeCommand(command: ParsedCommand): Promise<RawResult> {
src/handlers/base.ts:7:export function rawText(raw: RawResult): string {
src/handlers/base.ts:11:export function outputOmitsContent(output: string): boolean {
src/handlers/base.ts:29:export async function makeFilteredResult(
src/handlers/common/diff.ts:188:export const diffHandler: CommandHandler = {
src/handlers/common/listLike.ts:176:export const listLikeHandler: CommandHandler = {
src/handlers/common/readLike.ts:26:/^(import |from |export |function |const \w+\s*=|class |interface |type |def |pa...
src/handlers/common/readLike.ts:219:export const readLikeHandler: CommandHandler = {
src/handlers/common/searchLike.ts:11:export const searchLikeHandler: CommandHandler = {
src/handlers/generic.ts:5:export const genericHandler: CommandHandler = {
src/handlers/git/branch.ts:21:export const gitBranchHandler: CommandHandler = {
src/handlers/git/compactDiff.ts:1:export function compactUnifiedDiff(diff: string, maxLines = 500): string {
src/handlers/git/compactDiff.ts:93:export function extractDiffStatLines(text: string): string[] {
src/handlers/git/diff.ts:39:export const gitDiffHandler: CommandHandler = {
src/handlers/git/extended.ts:106:export const gitExtendedHandlers: CommandHandler[] = [...EXTENDED_GIT_HANDLERS.e...
src/handlers/git/hostingCli.ts:101:export const ghHandler = makeHostingHandler("gh", formatGh);
src/handlers/git/hostingCli.ts:102:export const glabHandler = makeHostingHandler("glab", formatGlab);
src/handlers/git/log.ts:65:export const gitLogHandler: CommandHandler = {
src/handlers/git/show.ts:61:export const gitShowHandler: CommandHandler = {
src/handlers/git/status.ts:112:export const gitStatusHandler: CommandHandler = {
src/handlers/index.ts:26:export const handlers: CommandHandler[] = [
src/handlers/java/gradle.ts:21:export const gradleHandler: CommandHandler = {
src/handlers/java/javac.ts:43:export const javacHandler: CommandHandler = {
src/handlers/java/maven.ts:18:export const mavenHandler: CommandHandler = {
src/handlers/js/eslint.ts:81:export const eslintHandler: CommandHandler = {
src/handlers/js/packageList.ts:115:export const packageListHandler: CommandHandler = {
src/handlers/js/test.ts:60:export const jsTestHandler: CommandHandler = {
src/handlers/js/tsc.ts:64:export const tscHandler: CommandHandler = {
src/handlers/python/mypy.ts:56:export const mypyHandler: CommandHandler = {
src/handlers/python/pip.ts:21:export const pipHandler: CommandHandler = {
src/handlers/python/pytest.ts:33:export const pytestHandler: CommandHandler = {
src/handlers/python/ruff.ts:59:export const ruffHandler: CommandHandler = {
src/parse.ts:44:export function parseArgv(argv: string[]): ParsedArgv {
src/router.ts:4:export function routeCommand(command: ParsedCommand): CommandHandler {
src/types.ts:1:export type ParsedCommand = {
src/types.ts:8:export type RawResult = {
src/types.ts:16:export type FilteredResult = {
src/types.ts:31:export type TgOptions = {
src/types.ts:42:export type ParseMode = "command" | "report" | "help" | "version";
src/types.ts:44:export type ParsedArgv = {
src/types.ts:50:export interface CommandHandler {

```

---

### 9. tsc: type error in temp file

- Handler: `tsc`
- tg: `tg pnpm exec tsc --noEmit --ignoreConfig /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-tsc-E8k4mq/broken.ts`
- raw: `pnpm exec tsc --noEmit --ignoreConfig /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-tsc-E8k4mq/broken.ts`
- rtk: `tsc --noEmit --ignoreConfig /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-tsc-E8k4mq/broken.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 162 | 41 | 0% |
| tg | 162 | 41 | 0% |
| rtk | 234 | 59 | 0% |

**raw** (162 chars, 41 tokens):

```text
../../../../var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-tsc-E8k4mq/broken.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.

```

**tg** (162 chars, 41 tokens, 0% savings):

```text
../../../../var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-tsc-E8k4mq/broken.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.

```

**rtk** (234 chars, 59 tokens, 0% savings):

```text
../../../../var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-tsc-E8k4mq/broken.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.
═══════════════════════════════════════
TypeScript: 1 errors in 1 files

```

---

### 10. diff: diff old.ts new.ts

- Handler: `diff`
- tg: `tg diff /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/old.ts /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/new.ts`
- raw: `diff /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/old.ts /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/new.ts`
- rtk: `diff /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/old.ts /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/new.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 30 | 8 | 0% |
| tg | 196 | 49 | 0% |
| rtk | 228 | 57 | 0% |

**raw** (30 chars, 8 tokens):

```text
1a2
> export const extra = 2;

```

**tg** (196 chars, 49 tokens, 0% savings):

```text
/var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/old.ts -> /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/new.ts (+1 -0)

+ export const extra = 2;

```

**rtk** (228 chars, 57 tokens, 0% savings):

```text
/var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/old.ts → /var/folders/q8/fmjf6hvs17j47yqnnpfqtg5h0000gn/T/tg-compare-diff-uoZd2z/new.ts
   +1 added, -0 removed, ~0 modified

+   2 export const extra = 2;

```

---

### 11. gh: gh repo view

- Handler: `gh`
- tg: `tg gh repo view`
- raw: `gh repo view`
- rtk: `gh repo view`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 58 | 15 | 0% |
| tg | 57 | 15 | 0% |
| rtk | 92 | 23 | 0% |

**raw** (58 chars, 15 tokens):

```text
name:	Cozy228/token-guard
description:	
--
# token-guard


```

**tg** (57 chars, 15 tokens, 0% savings):

```text
name:	Cozy228/token-guard
description:	
--
# token-guard

```

**rtk** (92 chars, 23 tokens, 0% savings):

```text
Cozy228/token-guard
  [public]
  0 stars | 0 forks
  https://github.com/Cozy228/token-guard

```

---

### 12. tsc: tsc --noEmit clean project

- Handler: `tsc`
- tg: `tg tsc --noEmit`
- raw: `pnpm exec tsc --noEmit`
- rtk: `tsc --noEmit`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 0 | 0 | 0% |
| tg | 0 | 0 | 0% |
| rtk | 28 | 7 | 0% |

**raw** (0 chars, 0 tokens):

```text

```

**tg** (0 chars, 0 tokens, 0% savings):

```text

```

**rtk** (28 chars, 7 tokens, 0% savings):

```text
TypeScript: No errors found

```

---

### 13. generic: echo hello

- Handler: `generic`
- tg: `tg echo hello`
- raw: `echo hello`
- rtk: `echo hello`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 6 | 2 | 0% |
| tg | 6 | 2 | 0% |
| rtk | 6 | 2 | 0% |

**raw** (6 chars, 2 tokens):

```text
hello

```

**tg** (6 chars, 2 tokens, 0% savings):

```text
hello

```

**rtk** (6 chars, 2 tokens, 0% savings):

```text
hello

```

---

### 14. git-branch: git branch

- Handler: `git-branch`
- tg: `tg git branch`
- raw: `git --no-pager branch`
- rtk: `git branch`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 36 | 9 | 0% |
| tg | 36 | 9 | 0% |
| rtk | 36 | 9 | 0% |

**raw** (36 chars, 9 tokens):

```text
* codex/token-guard-node-cli
  main

```

**tg** (36 chars, 9 tokens, 0% savings):

```text
* codex/token-guard-node-cli
  main

```

**rtk** (36 chars, 9 tokens, 0% savings):

```text
* codex/token-guard-node-cli
  main

```

---

### 15. git-log: git log --oneline -10

- Handler: `git-log`
- tg: `tg git log --oneline -10`
- raw: `git --no-pager log --oneline -10`
- rtk: `git log --oneline -10`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 565 | 142 | 0% |
| tg | 565 | 142 | 0% |
| rtk | 565 | 142 | 0% |

**raw** (565 chars, 142 tokens):

```text
e25a4ce docs: document read levels, diff handler, and quality gate
5adbbdb test(cli): cover read levels, multi-file cat, and diff stdin
d6c0854 test(fixture-cases): align parity expectations with compact output
afb7ee4 test(fixtures): add common cat and diff fixture inputs
5ca7fa4 feat(handlers/read): add RTK read levels and line windows
3667b04 feat: add compact diff handler
d58fe9f feat: compact list and status output
3e2f9df feat: add filter quality gate reporting
4d8953e Revert "feat: add rtk diff handler parity"
4c367e5 feat: add rtk diff handler parity

```

**tg** (565 chars, 142 tokens, 0% savings):

```text
e25a4ce docs: document read levels, diff handler, and quality gate
5adbbdb test(cli): cover read levels, multi-file cat, and diff stdin
d6c0854 test(fixture-cases): align parity expectations with compact output
afb7ee4 test(fixtures): add common cat and diff fixture inputs
5ca7fa4 feat(handlers/read): add RTK read levels and line windows
3667b04 feat: add compact diff handler
d58fe9f feat: compact list and status output
3e2f9df feat: add filter quality gate reporting
4d8953e Revert "feat: add rtk diff handler parity"
4c367e5 feat: add rtk diff handler parity

```

**rtk** (565 chars, 142 tokens, 0% savings):

```text
e25a4ce docs: document read levels, diff handler, and quality gate
5adbbdb test(cli): cover read levels, multi-file cat, and diff stdin
d6c0854 test(fixture-cases): align parity expectations with compact output
afb7ee4 test(fixtures): add common cat and diff fixture inputs
5ca7fa4 feat(handlers/read): add RTK read levels and line windows
3667b04 feat: add compact diff handler
d58fe9f feat: compact list and status output
3e2f9df feat: add filter quality gate reporting
4d8953e Revert "feat: add rtk diff handler parity"
4c367e5 feat: add rtk diff handler parity

```

---

### 16. git-show: git show -1 --stat

- Handler: `git-show`
- tg: `tg git show -1 --stat`
- raw: `git --no-pager show -1 --stat`
- rtk: `git show -1 --stat`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 630 | 158 | 0% |
| tg | 630 | 158 | 0% |
| rtk | 630 | 158 | 0% |

**raw** (630 chars, 158 tokens):

```text
commit e25a4ce1ddc3b219748723b8640efab0faf9271a
Author: Cozy <cozy228@outlook.com>
Date:   Wed Jun 3 22:04:31 2026 +0800

    docs: document read levels, diff handler, and quality gate
    
    Refresh DESIGN and migration audit for compact status/diff/list output,
    document explicit read levels in README, and fix docs validation paths.

 README.md                           |  4 +-
 docs/DESIGN.md                      | 80 +++++++++++++++++++++++++++++++++----
 docs/testing-and-migration-audit.md | 46 +++++++++++----------
 scripts/validate-docs.sh            |  2 +-
 4 files changed, 100 insertions(+), 32 deletions(-)

```

**tg** (630 chars, 158 tokens, 0% savings):

```text
commit e25a4ce1ddc3b219748723b8640efab0faf9271a
Author: Cozy <cozy228@outlook.com>
Date:   Wed Jun 3 22:04:31 2026 +0800

    docs: document read levels, diff handler, and quality gate
    
    Refresh DESIGN and migration audit for compact status/diff/list output,
    document explicit read levels in README, and fix docs validation paths.

 README.md                           |  4 +-
 docs/DESIGN.md                      | 80 +++++++++++++++++++++++++++++++++----
 docs/testing-and-migration-audit.md | 46 +++++++++++----------
 scripts/validate-docs.sh            |  2 +-
 4 files changed, 100 insertions(+), 32 deletions(-)

```

**rtk** (630 chars, 158 tokens, 0% savings):

```text
commit e25a4ce1ddc3b219748723b8640efab0faf9271a
Author: Cozy <cozy228@outlook.com>
Date:   Wed Jun 3 22:04:31 2026 +0800

    docs: document read levels, diff handler, and quality gate
    
    Refresh DESIGN and migration audit for compact status/diff/list output,
    document explicit read levels in README, and fix docs validation paths.

 README.md                           |  4 +-
 docs/DESIGN.md                      | 80 +++++++++++++++++++++++++++++++++----
 docs/testing-and-migration-audit.md | 46 +++++++++++----------
 scripts/validate-docs.sh            |  2 +-
 4 files changed, 100 insertions(+), 32 deletions(-)

```

---

### 17. js-test: vitest run savings test

- Handler: `js-test`
- tg: `tg pnpm exec vitest run tests/unit/savings.test.ts`
- raw: `pnpm exec vitest run tests/unit/savings.test.ts`
- rtk: `vitest run tests/unit/savings.test.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 212 | 53 | 0% |
| tg | 18 | 5 | 90.6% |
| rtk | 18 | 5 | 90.6% |

**raw** (212 chars, 53 tokens):

```text

 RUN  v4.1.8 /Users/ziyu/Workspace/token-guard


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  10:38:34
   Duration  73ms (transform 13ms, setup 0ms, import 18ms, tests 2ms, environment 0ms)


```

**tg** (18 chars, 5 tokens, 90.6% savings):

```text
PASS (4) FAIL (0)

```

**rtk** (18 chars, 5 tokens, 90.6% savings):

```text
PASS (4) FAIL (0)

```

---

### 18. list-like: find src -name *.ts

- Handler: `list-like`
- tg: `tg find src -name *.ts`
- raw: `find src -name *.ts`
- rtk: `find src -name *.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1015 | 254 | 0% |
| tg | 538 | 135 | 46.9% |
| rtk | 538 | 135 | 46.9% |

**raw** (1015 chars, 254 tokens):

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
src/handlers/js/packageList.ts
src/handlers/js/tsc.ts
src/handlers/js/test.ts
src/handlers/js/eslint.ts
src/handlers/java/maven.ts
src/handlers/java/javac.ts
src/handlers/java/gradle.ts
src/handlers/common/searchLike.ts
src/handlers/common/diff.ts
src/handlers/common/listLike.ts
src/handlers/common/readLike.ts
src/handlers/generic.ts
src/handlers/index.ts
src/handlers/git/status.ts
src/handlers/git/compactDiff.ts
src/handlers/git/diff.ts
src/handlers/git/branch.ts
src/handlers/git/hostingCli.ts
src/handlers/git/extended.ts
src/handlers/git/log.ts
src/handlers/git/show.ts

```

**tg** (538 chars, 135 tokens, 46.9% savings):

```text
43F 8D:

./ cli.ts executor.ts parse.ts router.ts types.ts
core/ ansi.ts fallback.ts history.ts outputLimit.ts path.ts patterns.ts pipeline.ts rawStore.ts report.ts savings.ts stats.ts text.ts
handlers/ base.ts generic.ts index.ts
handlers/common/ diff.ts listLike.ts readLike.ts searchLike.ts
handlers/git/ branch.ts compactDiff.ts diff.ts extended.ts hostingCli.ts log.ts show.ts status.ts
handlers/java/ gradle.ts javac.ts maven.ts
handlers/js/ eslint.ts packageList.ts test.ts tsc.ts
handlers/python/ mypy.ts pip.ts pytest.ts ruff.ts

```

**rtk** (538 chars, 135 tokens, 46.9% savings):

```text
43F 8D:

./ cli.ts executor.ts parse.ts router.ts types.ts
core/ ansi.ts fallback.ts history.ts outputLimit.ts path.ts patterns.ts pipeline.ts rawStore.ts report.ts savings.ts stats.ts text.ts
handlers/ base.ts generic.ts index.ts
handlers/common/ diff.ts listLike.ts readLike.ts searchLike.ts
handlers/git/ branch.ts compactDiff.ts diff.ts extended.ts hostingCli.ts log.ts show.ts status.ts
handlers/java/ gradle.ts javac.ts maven.ts
handlers/js/ eslint.ts packageList.ts test.ts tsc.ts
handlers/python/ mypy.ts pip.ts pytest.ts ruff.ts

```

---

### 19. read-like: cat docs/DESIGN.md

- Handler: `read-like`
- tg: `tg cat docs/DESIGN.md`
- raw: `cat docs/DESIGN.md`
- rtk: `read docs/DESIGN.md`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 28501 | 7126 | 0% |
| tg | 28501 | 7126 | 0% |
| rtk | 28501 | 7126 | 0% |

**raw** (28501 chars, 7126 tokens):

````text
# Token Guard Design

> 面向实现 Token Guard 的工程师和 AI Agent。记录产品边界、模块设计和模型治理策略。实现时优先保持简单、可恢复、低侵入，不要把实验能力写成默认承诺。

## Background

GitHub 宣布 Copilot 从 2026 年 6 月 1 日开始转向 usage-based billing，GitHub AI Credits 会按 token usage 消耗，包括 input、output 和 cached tokens。参见：[GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)。

企业 agent 工作流不能再默认"多给上下文、多跑命令、多输出文本"。Token Guard 要解决无意识 token 膨胀：

- 反复读取大文件、lockfile、`node_modules`、构建产物。
- `rg`、`cat`、`npm test`、日志等命令输出过长。
- skills 和 instructions 长期常驻注入。
- 长会话没有及时 compact。
- 贵模型被用于大段代码生成、测试生成和噪音工具输出。
- 缺少可审计的压缩效果、阻断记录和节省报告。

## Product stance

Token Guard 是 Copilot cost-control companion，不是 Copilot wrapper。用户主路径保持不变：

```text
VS Code Copilot Chat / Agent
GitHub Copilot CLI
GitHub Copilot cloud agent
```

`tg` 围绕八个核心能力设计：

- **Command proxy** — 低输出命令 wrappers，RTK 风格改写与压缩。用户通过 `tg <command>` 前缀使用，是产品的主入口。
- **`tg init`** — 项目初始化，生成 `.tg/config.yaml`，可选安装 hooks、追加 AGENTS.md 规则、运行 skill 审计。
- **Hook system** — pretool / posttool / prompt 三类 hook，在 Copilot 工具调用链中拦截、建议、改写或阻断高成本操作。
- **Skills optimizer** — 扫描 agent skills，识别 token 浪费，生成优化 diff。
- **AGENTS.md patcher** — 向项目指令文件追加短 token budget 指示，带标记可恢复。
- **Report & history** — 持久化每次执行的原始/压缩 token 数据，提供汇总报告。
- **Discover** — 扫描 Copilot 会话历史，找出遗漏的 token 节省机会。
- **Learn** — 分析重复浪费模式，生成自动修正规则。

`tg` 所有核心能力均支持项目级和用户级两个作用域。项目级配置影响单个 repo，用户级配置（`~/.tg/`、`~/.agents/`）作为全局基线影响该用户所有项目。两级可以共存：用户级提供默认策略，项目级可在此基础上收紧或放宽。

默认不做：

- 不替换用户已有 Copilot 入口。
- 不覆盖用户已有 agent 或 skill。
- 不承诺托管 Copilot 会话内完全透明切模型。
- 暂不实现 Claude Code subagent 路由或 AI Gateway 真路由。

---

## 1. Command Proxy

Command proxy 是 Token Guard 的核心产品能力，用户通过 `tg <command>` 前缀使用。设计思想来自 RTK：拦截高浪费命令，用专门的 handler 压缩输出。

### 1.1 使用模型

```bash
tg <original command> [...args]
```

`tg` 执行原始命令，捕获 stdout/stderr/exit code，通过 handler 压缩输出，记录 token 节省量，并以原始 exit code 退出。

```bash
tg git status
tg git diff
tg rg "submitOrder" src
tg cat package.json
tg npm test
```

### 1.2 Flags

```bash
tg --raw <command...>        # 打印原始输出
tg --stats <command...>      # 打印 token 节省统计
tg --verbose <command...>    # 打印统计和 raw output 路径
tg --max-lines 200 <command...>
tg --max-chars 12000 <command...>
tg --save-raw <command...>   # 强制保存原始输出
tg --no-save-raw <command...>
tg --report [--json|--csv]   # 查看节省报告
tg --help
tg --version
```

### 1.3 架构

```text
CLI (cli.ts)
 └─ parse (parse.ts)          # 解析 flags 和命令
     └─ route (router.ts)     # 按优先级匹配 handler
         └─ handler.execute   # spawn 执行原始命令
              └─ pipeline     # filter → history → stats
                  ├─ handler.filter   # 专用压缩逻辑
                  ├─ fallback         # 异常兜底
                  ├─ quality gate     # 膨胀/空输出/省略内容 → raw passthrough
                  ├─ outputLimit      # 当前 no-op；保留 flags 接口
                  ├─ history          # 写入 .tg/history.jsonl
                  ├─ rawStore         # 条件保存原始输出
                  └─ stats            # token 节省格式化
```

核心模块：

| 模块 | 文件 | 职责 |
|------|------|------|
| CLI entry | `src/cli.ts` | 主入口，协调 parse → route → pipeline |
| Parser | `src/parse.ts` | 解析 flags 和命令参数，支持 `--` 分隔 |
| Router | `src/router.ts` | 按注册顺序匹配 handler，generic 兜底 |
| Executor | `src/executor.ts` | `spawn` 执行命令，捕获 stdout/stderr/exit code/duration |
| Pipeline | `src/core/pipeline.ts` | 串联 filter → fallback → history |
| Savings | `src/core/savings.ts` | token 估算（chars ÷ 4）和节省计算 |
| Quality gate | `src/handlers/base.ts` | 过滤结果质量门：防膨胀、防空输出误导 |
| Output limit | `src/core/outputLimit.ts` | 当前为 no-op passthrough；`--max-lines` / `--max-chars` 保留 CLI 接口，实际截断由 handler 或 quality gate 决定 |
| History | `src/core/history.ts` | JSONL 追加写入和读取 |
| Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `.tg/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
| Report | `src/core/report.ts` | 汇总 history 生成 text/json/csv 报告 |

### 1.4 Handler 设计

每个 handler 实现 `CommandHandler` 接口：

```typescript
interface CommandHandler {
  name: string;
  matches(command: ParsedCommand): boolean;
  execute(command, options): Promise<RawResult>;
  filter(raw, command, options): Promise<FilteredResult>;
}
```

Router 按注册顺序匹配，最后一个 `genericHandler` 作为兜底。Handler 注册表位于 `src/handlers/index.ts`。

#### 实现原则

Handler 只做两类事：

1. **结构化改写** — 把 verbose 输出换成更短、但信息完整的格式（如 `git status` 短状态码、两文件 `diff` 的 LCS `+/-` 行、`tsc` 按错误码分组）。不丢行、不写 `Hidden` / `+N more` / `... N lines hidden`。
2. **原文 passthrough** — 无法在不省略内容的前提下明显变短时，原样输出 stdout/stderr（如 `rg`、`grep`、`git diff`、未知命令的 `generic`）。

只有 **`read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）；默认 `cat` / `read` 对大文件也 passthrough 全文。

#### Handler 分类与策略

| 分类 | Handler | 策略 |
|------|---------|------|
| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
| Read | `readLike`（cat、type、less、read） | `cat`/`read` 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
| List | `listLike`（ls、dir、find、tree） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
| JS | `jsTest` | failures + Test Files/Tests 摘要 |
| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
| Python | `pip` | **原文 passthrough** |
| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
| Generic | `generic` | **原文 passthrough**（stdout + stderr） |

### 1.5 FilteredResult

每个 handler 的 `filter()` 返回统一结构，由 pipeline 消费：

```typescript
type FilteredResult = {
  handler: string;         // handler 名称
  output: string;          // 最终输出（已去 ANSI；经 quality gate 选定）
  rawChars: number;        // 原始字符数
  outputChars: number;     // 最终输出字符数
  rawTokens: number;       // 估算原始 token
  outputTokens: number;    // 估算输出 token
  savedTokens: number;     // 节省 token
  savingsPct: number;      // 节省百分比
  rawOutputPath?: string;  // 原始输出保存路径（如保存）
  exitCode: number;        // 透传原始 exit code
  filterError?: string;    // fallback 时的错误信息
  qualityStatus:           // 过滤质量状态
    | "passed"
    | "inflated"
    | "empty_output";
};
```

`savingsPct` 与 history 只反映 **quality gate 之后** 的最终 `output`，不把被回退为 raw 的尝试算成有效压缩。

### 1.6 Quality gate

所有 handler 的结果在 `makeFilteredResult()` 里经过统一质量门。目标不是“让每个命令都变短”，而是 **避免为了 token 数字牺牲信息**：

| 条件 | 行为 | `qualityStatus` |
|------|------|-----------------|
| raw 非空，filtered 为空或只有空白 | 输出 raw | `empty_output` |
| raw 非空，filtered 比 raw 长（小输出零容差；大输出允许 ≤5% 或 ≥80 chars 的 metadata 开销） | 输出 raw | `inflated` |
| filtered 含省略语义（`Hidden`、`+N more`、`[N more lines]`、`... N lines hidden`、`Direct sample:` 等，`outputOmitsContent()` 检测） | 输出 raw | `inflated` |
| filtered 非空且不膨胀、不省略 | 输出 filtered | `passed` |
| raw 为空、filtered 非空（如 `0 matches for pattern`） | 输出 filtered | `passed` |

因此：

- 专用 handler 可以 passthrough（savings 为 0），这仍是正确行为。
- 结构化改写若比 raw 更长或声称省略未展示内容，会自动回退 raw。
- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入 `.tg/raw/`。

**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：

- `Hidden: … not shown`
- `+N more matches/files/packages/errors/commits/branches`
- `[N more lines]`、`... N more lines (use tg --raw …)`
- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）

这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。

### 1.7 Rewrite engine

在 hook 运行时，rewrite engine 负责将用户输入的 raw command 改写为 `tg` wrapper。这是集中式 command rewrite registry，输入 raw command，输出 `rewrite | suggest | pass | deny`。

改写规则：

- 已经是 `tg` 命令 → pass（不嵌套改写）。
- heredoc、redirect write（`>`、`>>`）、多文件 head/tail 等语义不等价场景 → pass。
- `rg` → `tg rg`、`grep` → `tg rg` 或 `tg grep`
- `cat <file>` → `tg cat <file>`
- `git status` → `tg git status`
- `git diff` → `tg git diff`
- `npm test` / `pnpm test` / `yarn test` → `tg npm test`
- `docker logs`、`kubectl logs` → suggest 或 deny

命令链处理：

- `&&`、`||`、`;`：分别改写左右两侧命令。
- `|`：默认只改写左侧命令，右侧保持原样（避免破坏管道语义）。
- `find ... | xargs ...`：默认不改写。

---

## 2. `tg init`

项目初始化和用户配置的统一入口。

```bash
tg init --mode balanced       # 项目级初始化
tg init --mode balanced --user  # 用户级初始化
tg init --all                 # 同时初始化两级
```

`tg init` 负责：

1. 创建配置文件：项目级写入 `.tg/config.yaml`，用户级写入 `~/.tg/config.yaml`。
2. 初始化目录结构（`history.jsonl`、`raw/`、`filters.yaml`）。
3. 可选：调用 `tg hook init` 安装 Copilot hooks。
4. 可选：调用 `tg agentsmd patch` 追加 token budget 指示。
5. 可选：调用 `tg skill scan` 进行首次 skill 审计。

所有写入操作可逆，`tg init` 的每一步都有对应的 undo 路径。

用户级配置影响该用户所有项目，项目级配置优先级更高。详见 [Configuration](#configuration)。

---

## 3. Hook System

Hook 是 Token Guard 在 Copilot 工具调用链中的拦截点。不依赖 Copilot 特定 API，通过 stdin JSON 与宿主通信，自动识别 Copilot CLI 和 VS Code Copilot Chat 的 payload 格式。

Hook 支持两个安装层级：

- **项目级**：hook 配置写入项目内，只在该项目中生效。
- **用户级**：hook 配置写入 `~/.tg/hooks/`，影响该用户所有项目的 Copilot 行为。

两级 hook 可以共存：用户级提供全局策略基线，项目级可在此基础上叠加更严格的规则。

### 3.1 Hook 类型

```bash
tg hook init              # 安装项目级 hooks
tg hook init --user       # 安装用户级 hooks
tg hook init --all        # 安装两级
tg hook status            # 查看 hook 安装状态
tg hook status --user     # 查看用户级 hook 状态

tg hook pretool           # 工具调用前拦截
tg hook posttool          # 工具调用后压缩
tg hook prompt            # prompt 提交前检查
```

### 3.2 pretool hook

在 Copilot 调用工具之前拦截。输入 stdin JSON 包含 tool name、command string、prompt 上下文。

核心职责：

- 识别高浪费工具调用模式（raw shell command、全仓搜索、读依赖目录文件、读大文件）。
- 输出四种决策：`allow`（放行）、`warn`（附改写建议）、`deny`（附原因）、`rewrite`（改写后的 command）。
- 对 `rg`、`grep`、`cat`、`git status`、`npm test` 等给出 `tg` wrapper 改写。
- 对 `docker logs`、`kubectl logs` 按 mode 给出 suggest 或 deny。
- 拒绝读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。

### 3.3 posttool hook

在 Copilot 获取工具输出之后拦截。

核心职责：

- 读取工具原始输出。
- 调用对应 handler 的 filter 逻辑压缩输出。
- 记录原始和压缩后的长度到 history。
- 将压缩后的输出返回给 Copilot。

### 3.4 prompt hook

在 Copilot 发送 prompt 之前检查。

核心职责：

- 检查 prompt token 数是否超过 `prompt.warn_tokens` 或 `prompt.block_tokens` 阈值。
- 超阈值时输出 `warn` 或 `block`。
- 识别明显实现型任务意图（generate、implement、write code），按 model governance 策略给出路由建议。

### 3.5 错误策略

Hook 的错误策略必须偏安全：默认 fail-open。

- 输入解析失败 → `allow`（不阻断）。
- 配置文件缺失或解析失败 → `allow`。
- Policy engine 内部异常 → `allow`。
- 只有明确匹配到 deny 策略时才阻断。
- Hook 内部的调试日志写入 stderr，不污染 stdout 的 JSON protocol。

### 3.6 模型名获取

Hook runtime 从 payload 中提取 model metadata。如果 payload 中无法可靠拿到 model name，回退到 L2 行为治理，不猜测当前模型。

### 3.7 Hook Rewrite Engine

Hook rewrite engine 是集中式 command rewrite registry，在 pretool hook 中自动将 Copilot 即将执行的原始命令改写为 `tg` wrapper。设计思想来自 RTK 的 rewrite 模块。

**输入**：Copilot tool call payload 中的原始 shell command。

**输出**：四种决策：

- `rewrite` — 改写后的 `tg` 命令字符串
- `suggest` — 不改写，附建议文本
- `pass` — 放行（已经是 tg 命令、或语义不等价场景）
- `deny` — 阻断并附原因

**改写规则**：

| 原始命令 | 改写 |
|---------|------|
| `rg <pattern> <path>` | `tg rg <pattern> <path>` |
| `grep -r <pattern> <path>` | `tg grep -r <pattern> <path>` |
| `cat <file>` | `tg cat <file>` |
| `git status` | `tg git status` |
| `git diff` | `tg git diff` |
| `git log` | `tg git log` |
| `git branch` | `tg git branch` |
| `npm test` / `pnpm test` | `tg npm test` |
| `tsc --noEmit` | `tg tsc --noEmit` |
| `eslint <path>` | `tg eslint <path>` |
| `find <path> -name <pattern>` | `tg find <path> -name <pattern>` |
| `ls <path>` | `tg ls <path>` |
| `mvn test` | `tg mvn test` |
| `gradle test` | `tg gradle test` |

**不改写场景**：

- 已经是 `tg` 命令 → pass（不嵌套改写）。
- heredoc（`<<EOF`）→ pass。
- redirect write（`>`、`>>`）→ pass。
- 管道右侧命令（`| grep`、`| head`）→ pass。
- `find ... | xargs ...` → pass（避免破坏管道语义）。

**命令链处理**：

- `&&`、`||`、`;`：分别改写左右两侧命令。
- `|`：默认只改写左侧命令，右侧保持原样。

**Copilot 适配**：

- 识别 Copilot CLI 的 `gh copilot suggest` 和 VS Code Copilot Chat 的 `run_in_terminal` tool call。
- Rewrite engine 通过 stdin JSON 接收 payload，格式与 Copilot hook protocol 兼容。
- 改写结果通过 stdout JSON 返回，包含 `decision` 字段和可选的 `rewritten_command`。

---

## 4. Skills Optimizer

扫描 agent skills，识别 token 浪费风险，生成优化建议和 diff。覆盖两个层级：

- **项目级**：项目内的 `SKILL.md`、`.claude/skills/*`、`.github/agents/*` 等。
- **用户级**：`~/.agents/skills/*` 等全局 agent skills。

默认扫描项目级。`--user` 切换到用户级。`--all` 同时扫描两级。

### 4.1 命令

```bash
tg skill scan                # 扫描项目级 skills（只读）
tg skill scan --user         # 扫描用户级 skills（只读）
tg skill scan --all          # 扫描两级（只读）
tg skill optimize --dry-run  # 预览优化 diff（只读）
tg skill optimize --apply    # 应用优化（自动备份 → 写入 → 输出 diff）
tg skill restore             # 从备份恢复
tg skill restore --user      # 恢复用户级备份
```

### 4.2 扫描规则

| 风险项 | 检测逻辑 | 优化策略 |
|--------|----------|----------|
| Skill 文件过长 | 字符数/行数超过阈值 | 建议拆分到 references/examples/scripts |
| Examples 常驻注入 | 入口文件包含大段示例代码 | 提取到 `examples/` 目录，入口引用即可 |
| Description 过宽 | description 匹配范围过大 | 建议收缩为具体触发条件 |
| 缺少 `disable-model-invocation` | agent 可被模型自动调用 | 建议添加 `disable-model-invocation: true` |
| 缺少 `user-invocable` | 用户无法显式调用 | 建议添加 `user-invocable: true` |
| 可拆分内容未拆分 | 大段 reference/script/examples 在入口文件 | 建议提取为独立文件 |
| 重复注入 | 多个 skill 包含相同大段内容 | 建议提取为共享 reference |

### 4.3 安全策略

- `scan` 和 `--dry-run` 为只读操作，不做任何文件修改。
- `--apply` 先备份原文件再写入优化版本：项目级备份到 `.tg/backups/`，用户级备份到 `~/.tg/backups/`。
- 生成可审查的 unified diff。
- 不修改 skill 的语义或功能逻辑。
- 不处理非 skill 文件。
- 用户级 skills 的优化同样需要用户确认，不静默修改全局配置。

---

## 5. AGENTS.md Patcher

向 agent 指令文件追加短 token budget 指示。覆盖两个层级：

- **项目级**：项目根目录的 `AGENTS.md`、`CLAUDE.md`、`COPILOT.md` 等。
- **用户级**：`~/.agents/AGENTS.md`，影响该用户所有项目的 agent 行为。

默认操作项目级。`--user` 操作用户级。`--all` 同时操作两级。

### 5.1 命令

```bash
tg agentsmd patch          # 追加项目级 token budget 规则
tg agentsmd patch --user   # 追加用户级 token budget 规则
tg agentsmd patch --all    # 追加两级
tg agentsmd restore        # 移除 tg 追加的项目级内容
tg agentsmd restore --user # 移除 tg 追加的用户级内容
tg agentsmd restore --all  # 移除两级
```

### 5.2 追加内容

使用 HTML comment marker 标记块，保证可识别和可恢复：

```markdown
<!-- tg:start -->
## Token budget guidance

- Prefer selected code, current diff, diagnostics, and failing errors over broad repository scans.
- Use `tg rg`, `tg cat`, `tg test`, and `tg logs` before raw commands that produce long output.
- Ask before reading more than 3 additional files.
- Avoid dependency folders, generated files, build outputs, and lockfiles unless explicitly requested.
- Keep plans and explanations short; use patches for implementation.
<!-- tg:end -->
```

### 5.3 设计约束

- 追加内容严格控制在 15 行以内。
- 使用 marker block，不覆盖用户原有内容（marker 外内容原样保留）。
- 不把完整模型策略、命令表或公司规范塞进 agent 指令文件。
- `restore` 只移除 `<!-- tg:start -->` 到 `<!-- tg:end -->` 之间的内容，marker 外的修改不受影响。
- 如文件不存在则跳过或提示后创建。
- 用户级 patch 使用 `<!-- tg:user:start -->` / `<!-- tg:user:end -->` marker，与项目级区分，restore 时互不干扰。

---

## 6. Filter Engine

声明式自定义压缩规则，用 YAML 定义，支持项目级和用户级。

### 6.1 Filter 定义

```yaml
# .tg/filters.yaml
schema_version: 1
filters:
  my-build:
    match_command: "^my-build\\s+run"
    strip_ansi: true
    strip_lines_matching:
      - "^Downloading"
      - "^Installing"
    max_lines: 40
    on_empty: "my-build: ok"
```

每个 filter 包含：

| 字段 | 说明 |
|------|------|
| `match_command` | 正则匹配命令字符串 |
| `strip_ansi` | 是否移除 ANSI escape codes |
| `strip_lines_matching` | 删除匹配正则的行 |
| `max_lines` | 输出行数上限 |
| `max_chars` | 输出字符数上限 |
| `on_empty` | 输出完全为空时的替换文本 |

### 6.2 查找和优先级

1. `.tg/filters.yaml`（项目本地）
2. 用户级 filters（`%APPDATA%/TokenGuard/filters.yaml` 或 `~/.config/tg/filters.yaml`）
3. 内置 filters（handler 默认压缩逻辑）
4. passthrough（不做任何处理）

项目级优先级高于用户级。内置 handler filter 始终执行，filter engine 作为额外的规则层叠加。

### 6.3 Trust 机制

项目本地 filters 由 repo 提供，存在供应链风险（恶意 repo 通过 regex 过滤关键信息或注入内容）。设计上：

- 首次使用项目 filters 时提示用户确认。
- 在 `.tg/trust` 中记录已信任的 filter 文件哈希。
- filter 哈希变化时重新提示用户确认。

---

## 7. Parser — Three-Tier Degradation

源自 RTK 的 parser 模块。所有 tool output 解析遵循三级降级策略，确保不返回假数据。

### 7.1 三级解析

| Tier | 名称 | 行为 | 使用场景 |
|------|------|------|----------|
| Tier 1: Full | 完整解析 | JSON 解析成功，提取所有结构化字段 | 工具支持 `--json` 输出（vitest、eslint、pytest） |
| Tier 2: Degraded | 降级解析 | 部分字段提取成功，带 warning | JSON 格式不完整或有 prefix（pnpm banner、dotenv 消息） |
| Tier 3: Passthrough | 透传 | 解析失败，截断原始输出并标记 `[tg:PASSTHROUGH]` | 工具无结构化输出，或解析器无法处理 |

### 7.2 核心类型

```typescript
type ParseResult<T> =
  | { tier: 1; data: T }                              // Full
  | { tier: 2; data: T; warnings: string[] }           // Degraded
  | { tier: 3; raw: string }                           // Passthrough

interface OutputParser<T> {
  parse(raw: string): ParseResult<T>;
}
```

### 7.3 JSON 提取

对于带有 prefix 的 JSON 输出（如 pnpm 的 workspace 横幅、dotenv 的环境变量加载消息），parser 使用 brace-balancing 算法从混合输出中提取完整的 JSON 对象：

```typescript
function extractJsonObject(input: string): string | undefined {
  // 1. 查找 vitest 特有 marker `"numTotalTests"` 或首个 `{`
  // 2. Brace-balance 前向扫描找到匹配的 `}`
  // 3. 处理字符串内的 `{`、`}` 和转义
  // 4. 返回完整 JSON 字符串，或 undefined
}
```

### 7.4 截断策略

Passthrough 模式下使用配置的截断上限（默认 `max_chars: 12000`），超限时追加 `[tg:PASSTHROUGH] 截断标记`：

```
原始输出（前 12000 chars）
[tg:PASSTHROUGH] Output truncated (25000 chars → 12000 chars)
```

### 7.5 与 handler 的协作

Parser 模块作为 handler filter 的基础设施，handler 可以选择：

- 直接使用 parser 的结构化输出（如 vitest handler 解析 JSON test results）。
- 使用 parser 的 `extractJsonObject` 提取嵌入式 JSON。
- 降级到 passthrough 时，由 handler 的文本压缩逻辑接管。

---

## 8. Reporting & History

### 8.1 History

每次 `tg` 命令执行和 hook 拦截都写入 `.tg/history.jsonl`（JSONL 格式，追加写入）：

```json
{
  "timestamp": "2026-06-02T10:30:00.000Z",
  "command": "git status",
  "handler": "git-status",
  "raw_chars": 535,
  "output_chars": 351,
  "raw_tokens": 134,
  "output_tokens": 88,
  "saved_tokens": 46,
  "savings_pct": 34.3,
  "exit_code": 0,
  "duration_ms": 120,
  "raw_output_path": ".tg/raw/20260602-103000-git-status.log",
  "quality_status": "passed"
}
```

不记录：prompt 原文、源码内容、日志原文、文件内容。只记录命令类型、长度统计、策略结果和时间。

### 8.2 Report

```bash
tg report              # 项目级报告（文本格式）
tg report --user       # 用户级报告（聚合所有项目）
tg report --all        # 两级汇总
tg report --json       # JSON 格式（机器可读）
tg report --csv        # CSV 格式
```

报告内容：

- 总命令数 / hook 命中次数。
- 原始 token 总量、输出 token 总量、节省 token 总量、节省百分比。
- 按 handler 分组的节省率。
- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
- `--user` 报告按项目分组，展示每个项目的独立统计。
- `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
- 不记录敏感原文，只记录命令类型、长度、策略结果和时间。

---

## 9. Discover — Copilot Session Scanning

源自 RTK 的 discover 模块。扫描 GitHub Copilot 会话历史，找出已执行的原始命令中哪些可以用 `tg` wrapper 替代，计算遗漏的 token 节省量。

### 9.1 命令

```bash
tg discover                    # 扫描当前项目的 Copilot 会话
tg discover --all              # 扫描所有项目
tg discover --since 7          # 仅扫描最近 7 天
tg discover --json             # JSON 格式输出
```

### 9.2 扫描源

Copilot 会话数据来源（与 RTK 扫描 Claude Code sessions 不同，tg 扫描 Copilot 数据源）：

| 数据源 | 路径 | 内容 |
|--------|------|------|
| Copilot Chat 历史 | VS Code `globalState` / `workspaceState` 中的 Copilot 数据 | Chat 对话中的 tool call 记录 |
| Copilot CLI 历史 | `~/.github-copilot/` | CLI session 中的命令执行记录 |
| GitHub Copilot 云端 | Copilot API audit log（如有权限） | Cloud agent 的 tool call 历史 |

> **当前实现阶段**：优先支持 Copilot CLI 历史解析。VS Code Copilot Chat 历史解析标记为实验能力，依赖 VS Code extension API。

### 9.3 分类逻辑

扫描每个 session 中的命令，按 registry 分类：

| 分类 | 含义 | 示例 |
|------|------|------|
| `supported` | 已有 tg handler 覆盖 | `git status` → `tg git status` |
| `supported_but_disabled` | handler 存在但用户通过 `TG_DISABLED=1` 跳过 | `TG_DISABLED=1 git status` |
| `unsupported` | 无对应 handler | `docker compose up` |
| `already_tg` | 已使用 tg wrapper | `tg git diff` |
| `ignored` | 非工具调用（如 echo、cd） | `cd src/` |

### 9.4 报告输出

```
Discover Report
Sessions scanned: 12 (last 7 days)
Total commands: 847

Supported (missed savings):
  git status         142x  → tg git status       est. 45% savings
  rg search          203x  → tg rg               est. 80% savings
  npm test            67x  → tg npm test          est. 75% savings
  cat <file>          89x  → tg cat               est. 60% savings

Unsupported (top 5):
  docker compose up   23x
  kubectl get pods    15x
  ...

Already using tg: 31 commands
Parse errors: 2 sessions skipped
```

### 9.5 设计约束

- 不记录命令的具体参数值（如搜索词、文件路径），只记录命令类型和分类结果。
- 报告中的 estimated savings 使用 handler 的历史平均节省率，不是本次扫描的精确值。
- 扫描为纯只读操作，不修改任何文件。
- Copilot Chat 历史解析需要 VS Code extension API，初期可能只支持 Copilot CLI。

---

## 10. Learn — Pattern Detection & Auto-Correction

源自 RTK 的 learn 模块。分析 Copilot agent 的重复浪费行为模式，生成 CLI 使用建议并写入 AGENTS.md 规则文件。

### 10.1 命令

```bash
tg learn                       # 分析最近的 Copilot 会话，输出浪费模式报告
tg learn --since 14            # 分析最近 14 天
tg learn --write-rules         # 生成并写入 .claude/rules/cli-corrections.md
tg learn --json                # JSON 格式输出
tg learn --min-confidence 0.7  # 最低置信度阈值
tg learn --min-occurrences 5   # 最低重复次数阈值
```

### 10.2 检测模式

| 模式 | 检测逻辑 | 建议 |
|------|----------|------|
| 在 `node_modules` 中搜索 | `rg`/`grep` 路径包含 `node_modules/` | 使用 `tg rg` 自动跳过依赖目录 |
| 全仓搜索无路径限定 | `rg <pattern>` 无 path 参数 | 添加 `src/` 或 `lib/` 限定范围 |
| 读取大文件 | `cat` 超过 500 行的文件 | 使用 `tg cat` 自动摘要 |
| 读取 lockfile | `cat package-lock.json` 等 | 建议用 `jq` 或 `tg deps` |
| 读取构建产物 | `cat dist/`、`build/`、`target/` | 阻断或强烈建议跳过 |
| 执行全量测试 | `npm test` 无过滤参数 | 建议先用 `tg npm test` 只看 failures |
| 重复执行相同命令 | 同一命令在短时间窗口内出现多次 | 建议缓存结果或使用 tg 减少输出 |

### 10.3 输出格式

```
Learn Report
Sessions scanned: 8 (last 14 days)
Corrections found: 5

Rule: Prefer tg rg over raw grep in dependency dirs
  Pattern: grep -r <query> node_modules/
  Occurrences: 12
  Confidence: 0.92
  → Use: tg rg <query>

Rule: Prefer tg cat for large files
  Pattern: cat <file> where file > 500 lines
  Occurrences: 8
  Confidence: 0.85
  → Use: tg cat <file>
```

### 10.4 自动规则写入

`tg learn --write-rules` 将检测到的规则写入 `.claude/rules/cli-corrections.md`：

```markdown
# CLI Corrections (generated by tg learn)

## Prefer tg rg over raw grep
- **Pattern**: grep -r in dependency directories
- **Correction**: Use `tg rg` which automatically skips node_modules, dist, and build
- **Detected**: 12 occurrences in the last 14 days

## Prefer tg cat for large files
- **Pattern**: cat on files > 500 lines
- **Correction**: Use `tg cat` which summarizes large files with symbol extraction
- **Detected**: 8 occurrences in the last 14 days
```

### 10.5 与 Skills Optimizer 的关系

`tg learn` 和 `tg skill scan` 互补：

- `tg learn`：分析 Copilot **运行时行为**（命令执行模式）。
- `tg skill scan`：分析 **静态内容**（skill 文件大小、注入内容、description 宽度）。

两者共同提供"优化建议 → 自动修正"闭环。

---

## 11. Model Governance

Token Guard 不托管模型路由，但通过策略层级提供治理能力。从 L1（建议）到 L5（自定义 agent）逐级增强控制力。

### L1: Suggest routing

默认启用的最低层级。根据任务特征和行为给出简短模型选择建议：

- **贵模型适合**：架构计划、root cause 分析、代码审查、安全分析。
- **便宜模型适合**：boilerplate 生成、测试生成、简单 patch、日志摘要。
- **高风险组合**：贵模型 + 长输出、贵模型 + raw shell、贵模型 + 大段代码生成。

实现位置：
- `tg agentsmd patch`：在 agent 指令文件中追加短规则。
- `tg hook prompt`：对长 prompt 或明显实现型任务追加 `/model` 建议。
- `tg report`：按行为类型展示风险分布。

### L2: Behavior-based deny

不依赖模型名，只基于行为模式判断。只要行为明显浪费 token，就 warn 或 deny：

- 读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。
- `cat` 大文件（超过阈值）。
- 无路径限定的全仓搜索（`rg pattern` 无 file path）。
- 日志、测试、构建命令产生超长输出（超过 `output.max_chars`）。
- prompt 超过 `prompt.warn_tokens` 或 `prompt.block_tokens`。

实现位置：
- `tg hook pretool`：阻断或建议改写。
- `tg hook posttool`：压缩输出并记录。
- `tg hook prompt`：warn 或 block。

### L3: Model-aware deny

当 hook payload、session metadata 或 host environment 能可靠拿到模型名时启用。

```yaml
model_policy:
  expensive_models:
    - Claude Opus
    - Opus 4.6
  expensive_model_rules:
    allow:
      - plan
      - review
      - root_cause
    discourage:
      - implementation
      - test_generation
      - long_code_output
      - raw_shell
```

**关键约束**：如果无法可靠获取模型名，必须回退到 L2 行为治理，不得猜测当前模型。

### L4: Explicit session routing（实验）

用户主动选择 session 类型，Token Guard 路由到对应模型：

```bash
tg plan     # 短计划、低输出、偏贵模型
tg impl     # 代码实现、测试生成、偏便宜模型
tg review   # 代码审查，按企业策略选择模型
```

这些命令可以启动 Copilot CLI 的特定模型会话、生成 `/model` 指引，或调用可配置的 provider。

### L5: Custom Agent routing（实验）

Token Guard 生成可选 custom agent 定义：

```yaml
---
name: tg-planner
description: Creates short implementation plans and cost-aware routing decisions.
model: claude-opus
tools: ["read", "search"]
user-invocable: true
disable-model-invocation: true
---
```

安装策略：
- 默认不安装（`tg agent suggest` 只输出建议）。
- `tg agent install --optional` 才写入 `.github/agents/*`。
- 不修改用户已有 agent。

### L6/L7

L6（AI Gateway 真路由）和 L7（跨 session 自适应路由）暂不在设计范围内，文档和代码都必须明确标注。

---

## 12. Configuration

### 12.1 配置文件层级

| 位置 | 作用域 | 优先级 |
|------|--------|--------|
| `.tg/config.yaml` | 项目级 | 高（覆盖用户配置） |
| `%APPDATA%/TokenGuard/config.yaml`（Windows）或 `~/.config/tg/config.yaml` | 用户级 | 低 |

### 12.2 默认配置

```yaml
mode: balanced

prompt:
  warn_tokens: 4000
  block_tokens: 16000

tool:
  prefer_silent_rewrite: true
  block_generated_files: true
  block_dependency_folders: true
  block_lockfiles: true
  raw_command_policy:
    rg: suggest
    grep: suggest
    cat: rewrite
    npm_test: suggest
    docker_logs: block
    kubectl_logs: block

output:
  max_chars: 12000
  max_lines: 180
  keep_patterns:
    - error
    - failed
    - exception
    - fatal
    - timeout
    - denied
    - stack
    - warn

model_policy:
  escalation: suggest-first
  route: experimental
  expensive_models:
    - Claude Opus
    - Opus 4.6
```

### 12.3 Mode 语义

| mode | 行为 |
|------|------|
| `passive` | 只建议和记录，不阻断任何操作 |
| `balanced` | 明显浪费时阻断（读依赖目录、超长 prompt），大多数场景建议或改写 |
| `strict` | 企业强控：raw command、超长 prompt、大文件读取、贵模型高成本动作直接阻断 |

---

## 13. Future Token Digestion Layers

Layer 1 已落在 command filter 质量门上。后续两层先保留在设计中，不进入当前实现范围。

### 13.1 Layer 2: 少产生输出

目标是在工具执行前减少高成本输出，而不是等 raw output 生成后再压缩。

实现边界：

- 新增 rewrite registry，输入 raw command，输出 `pass | rewrite | warn | deny`。
- `tg hook pretool` 读取 stdin JSON，对 `cat` lockfile、读依赖目录、无路径全仓 `rg`、`git diff`、测试命令等给出 rewrite/warn/deny。
- `tg hook posttool` 在宿主已经执行 raw command 时复用现有 handler 压缩输出，不重新执行命令。
- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。

第一批规则只覆盖高价值命令：

- `cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
- `cat node_modules/...`、`cat dist/...` → deny。
- `rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
- `git diff` → rewrite 到 `tg git diff`。
- `npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。

### 13.2 Layer 3: 增加 cache hit

目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用。

实现边界：

- 新增 content-addressed output cache：`.tg/cache/outputs/<hash>.json`。
- cache key 由 `cwd`、command、args、git HEAD、相关文件 fingerprint 构成。
- 重复命令在 fingerprint 未变时返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`。
- 新增 deterministic project context：`.tg/context.md` 和 `.tg/context.json`，按固定顺序输出 repo map、scripts、重要文件摘要和 section hashes。
- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。

报告后续增加：

- cacheable commands。
- cache hits。
- repeated output avoided tokens。
- stable chars / volatile chars。
- raw reuse hits。

---

## 14. Implementation Constraints

- L6/L7 暂不考虑，文档和代码必须明确标注。
- 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
- 不默认安装 custom agents。
- 不默认改写用户 skill。
- 纯 TypeScript/Node.js 实现，不依赖 RTK 或 Rust。
- 模型名不可靠时不猜测，回退 L2。
- Report 不记录 prompt、源码、日志原文。
- Hook 错误策略默认 fail-open。

---

## 15. Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

构建输出 `dist/cli.js`，保留 shebang，通过 npm bin 暴露。

项目结构：

```
src/
├── cli.ts              # CLI 入口
├── parse.ts            # 参数解析
├── router.ts           # handler 路由
├── executor.ts         # 命令执行
├── types.ts            # 类型定义
├── core/
│   ├── ansi.ts         # ANSI 移除
│   ├── fallback.ts     # 异常兜底
│   ├── history.ts      # JSONL 记录读写
│   ├── outputLimit.ts  # 全局行数/字符数截断
│   ├── path.ts         # 路径安全处理
│   ├── patterns.ts     # 重要性正则匹配
│   ├── pipeline.ts     # filter → history 管线
│   ├── rawStore.ts     # 原始输出持久化
│   ├── report.ts       # 报告汇总生成
│   ├── savings.ts      # token 估算和节省计算
│   ├── stats.ts        # 统计格式化输出
│   └── text.ts         # 文本工具
└── handlers/
    ├── index.ts        # handler 注册表
    ├── base.ts         # 共享工具（rawText、makeFilteredResult）
    ├── generic.ts      # 兜底 handler
    ├── common/         # searchLike、readLike、listLike
    ├── git/            # status、diff、log、show、branch
    ├── js/             # test、eslint、tsc、packageList
    ├── python/         # pytest、ruff、mypy、pip
    └── java/           # maven、gradle、javac
```

````

**tg** (28501 chars, 7126 tokens, 0% savings):

````text
# Token Guard Design

> 面向实现 Token Guard 的工程师和 AI Agent。记录产品边界、模块设计和模型治理策略。实现时优先保持简单、可恢复、低侵入，不要把实验能力写成默认承诺。

## Background

GitHub 宣布 Copilot 从 2026 年 6 月 1 日开始转向 usage-based billing，GitHub AI Credits 会按 token usage 消耗，包括 input、output 和 cached tokens。参见：[GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)。

企业 agent 工作流不能再默认"多给上下文、多跑命令、多输出文本"。Token Guard 要解决无意识 token 膨胀：

- 反复读取大文件、lockfile、`node_modules`、构建产物。
- `rg`、`cat`、`npm test`、日志等命令输出过长。
- skills 和 instructions 长期常驻注入。
- 长会话没有及时 compact。
- 贵模型被用于大段代码生成、测试生成和噪音工具输出。
- 缺少可审计的压缩效果、阻断记录和节省报告。

## Product stance

Token Guard 是 Copilot cost-control companion，不是 Copilot wrapper。用户主路径保持不变：

```text
VS Code Copilot Chat / Agent
GitHub Copilot CLI
GitHub Copilot cloud agent
```

`tg` 围绕八个核心能力设计：

- **Command proxy** — 低输出命令 wrappers，RTK 风格改写与压缩。用户通过 `tg <command>` 前缀使用，是产品的主入口。
- **`tg init`** — 项目初始化，生成 `.tg/config.yaml`，可选安装 hooks、追加 AGENTS.md 规则、运行 skill 审计。
- **Hook system** — pretool / posttool / prompt 三类 hook，在 Copilot 工具调用链中拦截、建议、改写或阻断高成本操作。
- **Skills optimizer** — 扫描 agent skills，识别 token 浪费，生成优化 diff。
- **AGENTS.md patcher** — 向项目指令文件追加短 token budget 指示，带标记可恢复。
- **Report & history** — 持久化每次执行的原始/压缩 token 数据，提供汇总报告。
- **Discover** — 扫描 Copilot 会话历史，找出遗漏的 token 节省机会。
- **Learn** — 分析重复浪费模式，生成自动修正规则。

`tg` 所有核心能力均支持项目级和用户级两个作用域。项目级配置影响单个 repo，用户级配置（`~/.tg/`、`~/.agents/`）作为全局基线影响该用户所有项目。两级可以共存：用户级提供默认策略，项目级可在此基础上收紧或放宽。

默认不做：

- 不替换用户已有 Copilot 入口。
- 不覆盖用户已有 agent 或 skill。
- 不承诺托管 Copilot 会话内完全透明切模型。
- 暂不实现 Claude Code subagent 路由或 AI Gateway 真路由。

---

## 1. Command Proxy

Command proxy 是 Token Guard 的核心产品能力，用户通过 `tg <command>` 前缀使用。设计思想来自 RTK：拦截高浪费命令，用专门的 handler 压缩输出。

### 1.1 使用模型

```bash
tg <original command> [...args]
```

`tg` 执行原始命令，捕获 stdout/stderr/exit code，通过 handler 压缩输出，记录 token 节省量，并以原始 exit code 退出。

```bash
tg git status
tg git diff
tg rg "submitOrder" src
tg cat package.json
tg npm test
```

### 1.2 Flags

```bash
tg --raw <command...>        # 打印原始输出
tg --stats <command...>      # 打印 token 节省统计
tg --verbose <command...>    # 打印统计和 raw output 路径
tg --max-lines 200 <command...>
tg --max-chars 12000 <command...>
tg --save-raw <command...>   # 强制保存原始输出
tg --no-save-raw <command...>
tg --report [--json|--csv]   # 查看节省报告
tg --help
tg --version
```

### 1.3 架构

```text
CLI (cli.ts)
 └─ parse (parse.ts)          # 解析 flags 和命令
     └─ route (router.ts)     # 按优先级匹配 handler
         └─ handler.execute   # spawn 执行原始命令
              └─ pipeline     # filter → history → stats
                  ├─ handler.filter   # 专用压缩逻辑
                  ├─ fallback         # 异常兜底
                  ├─ quality gate     # 膨胀/空输出/省略内容 → raw passthrough
                  ├─ outputLimit      # 当前 no-op；保留 flags 接口
                  ├─ history          # 写入 .tg/history.jsonl
                  ├─ rawStore         # 条件保存原始输出
                  └─ stats            # token 节省格式化
```

核心模块：

| 模块 | 文件 | 职责 |
|------|------|------|
| CLI entry | `src/cli.ts` | 主入口，协调 parse → route → pipeline |
| Parser | `src/parse.ts` | 解析 flags 和命令参数，支持 `--` 分隔 |
| Router | `src/router.ts` | 按注册顺序匹配 handler，generic 兜底 |
| Executor | `src/executor.ts` | `spawn` 执行命令，捕获 stdout/stderr/exit code/duration |
| Pipeline | `src/core/pipeline.ts` | 串联 filter → fallback → history |
| Savings | `src/core/savings.ts` | token 估算（chars ÷ 4）和节省计算 |
| Quality gate | `src/handlers/base.ts` | 过滤结果质量门：防膨胀、防空输出误导 |
| Output limit | `src/core/outputLimit.ts` | 当前为 no-op passthrough；`--max-lines` / `--max-chars` 保留 CLI 接口，实际截断由 handler 或 quality gate 决定 |
| History | `src/core/history.ts` | JSONL 追加写入和读取 |
| Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `.tg/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
| Report | `src/core/report.ts` | 汇总 history 生成 text/json/csv 报告 |

### 1.4 Handler 设计

每个 handler 实现 `CommandHandler` 接口：

```typescript
interface CommandHandler {
  name: string;
  matches(command: ParsedCommand): boolean;
  execute(command, options): Promise<RawResult>;
  filter(raw, command, options): Promise<FilteredResult>;
}
```

Router 按注册顺序匹配，最后一个 `genericHandler` 作为兜底。Handler 注册表位于 `src/handlers/index.ts`。

#### 实现原则

Handler 只做两类事：

1. **结构化改写** — 把 verbose 输出换成更短、但信息完整的格式（如 `git status` 短状态码、两文件 `diff` 的 LCS `+/-` 行、`tsc` 按错误码分组）。不丢行、不写 `Hidden` / `+N more` / `... N lines hidden`。
2. **原文 passthrough** — 无法在不省略内容的前提下明显变短时，原样输出 stdout/stderr（如 `rg`、`grep`、`git diff`、未知命令的 `generic`）。

只有 **`read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）；默认 `cat` / `read` 对大文件也 passthrough 全文。

#### Handler 分类与策略

| 分类 | Handler | 策略 |
|------|---------|------|
| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
| Read | `readLike`（cat、type、less、read） | `cat`/`read` 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
| List | `listLike`（ls、dir、find、tree） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
| JS | `jsTest` | failures + Test Files/Tests 摘要 |
| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
| Python | `pip` | **原文 passthrough** |
| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
| Generic | `generic` | **原文 passthrough**（stdout + stderr） |

### 1.5 FilteredResult

每个 handler 的 `filter()` 返回统一结构，由 pipeline 消费：

```typescript
type FilteredResult = {
  handler: string;         // handler 名称
  output: string;          // 最终输出（已去 ANSI；经 quality gate 选定）
  rawChars: number;        // 原始字符数
  outputChars: number;     // 最终输出字符数
  rawTokens: number;       // 估算原始 token
  outputTokens: number;    // 估算输出 token
  savedTokens: number;     // 节省 token
  savingsPct: number;      // 节省百分比
  rawOutputPath?: string;  // 原始输出保存路径（如保存）
  exitCode: number;        // 透传原始 exit code
  filterError?: string;    // fallback 时的错误信息
  qualityStatus:           // 过滤质量状态
    | "passed"
    | "inflated"
    | "empty_output";
};
```

`savingsPct` 与 history 只反映 **quality gate 之后** 的最终 `output`，不把被回退为 raw 的尝试算成有效压缩。

### 1.6 Quality gate

所有 handler 的结果在 `makeFilteredResult()` 里经过统一质量门。目标不是“让每个命令都变短”，而是 **避免为了 token 数字牺牲信息**：

| 条件 | 行为 | `qualityStatus` |
|------|------|-----------------|
| raw 非空，filtered 为空或只有空白 | 输出 raw | `empty_output` |
| raw 非空，filtered 比 raw 长（小输出零容差；大输出允许 ≤5% 或 ≥80 chars 的 metadata 开销） | 输出 raw | `inflated` |
| filtered 含省略语义（`Hidden`、`+N more`、`[N more lines]`、`... N lines hidden`、`Direct sample:` 等，`outputOmitsContent()` 检测） | 输出 raw | `inflated` |
| filtered 非空且不膨胀、不省略 | 输出 filtered | `passed` |
| raw 为空、filtered 非空（如 `0 matches for pattern`） | 输出 filtered | `passed` |

因此：

- 专用 handler 可以 passthrough（savings 为 0），这仍是正确行为。
- 结构化改写若比 raw 更长或声称省略未展示内容，会自动回退 raw。
- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入 `.tg/raw/`。

**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：

- `Hidden: … not shown`
- `+N more matches/files/packages/errors/commits/branches`
- `[N more lines]`、`... N more lines (use tg --raw …)`
- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）

这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。

### 1.7 Rewrite engine

在 hook 运行时，rewrite engine 负责将用户输入的 raw command 改写为 `tg` wrapper。这是集中式 command rewrite registry，输入 raw command，输出 `rewrite | suggest | pass | deny`。

改写规则：

- 已经是 `tg` 命令 → pass（不嵌套改写）。
- heredoc、redirect write（`>`、`>>`）、多文件 head/tail 等语义不等价场景 → pass。
- `rg` → `tg rg`、`grep` → `tg rg` 或 `tg grep`
- `cat <file>` → `tg cat <file>`
- `git status` → `tg git status`
- `git diff` → `tg git diff`
- `npm test` / `pnpm test` / `yarn test` → `tg npm test`
- `docker logs`、`kubectl logs` → suggest 或 deny

命令链处理：

- `&&`、`||`、`;`：分别改写左右两侧命令。
- `|`：默认只改写左侧命令，右侧保持原样（避免破坏管道语义）。
- `find ... | xargs ...`：默认不改写。

---

## 2. `tg init`

项目初始化和用户配置的统一入口。

```bash
tg init --mode balanced       # 项目级初始化
tg init --mode balanced --user  # 用户级初始化
tg init --all                 # 同时初始化两级
```

`tg init` 负责：

1. 创建配置文件：项目级写入 `.tg/config.yaml`，用户级写入 `~/.tg/config.yaml`。
2. 初始化目录结构（`history.jsonl`、`raw/`、`filters.yaml`）。
3. 可选：调用 `tg hook init` 安装 Copilot hooks。
4. 可选：调用 `tg agentsmd patch` 追加 token budget 指示。
5. 可选：调用 `tg skill scan` 进行首次 skill 审计。

所有写入操作可逆，`tg init` 的每一步都有对应的 undo 路径。

用户级配置影响该用户所有项目，项目级配置优先级更高。详见 [Configuration](#configuration)。

---

## 3. Hook System

Hook 是 Token Guard 在 Copilot 工具调用链中的拦截点。不依赖 Copilot 特定 API，通过 stdin JSON 与宿主通信，自动识别 Copilot CLI 和 VS Code Copilot Chat 的 payload 格式。

Hook 支持两个安装层级：

- **项目级**：hook 配置写入项目内，只在该项目中生效。
- **用户级**：hook 配置写入 `~/.tg/hooks/`，影响该用户所有项目的 Copilot 行为。

两级 hook 可以共存：用户级提供全局策略基线，项目级可在此基础上叠加更严格的规则。

### 3.1 Hook 类型

```bash
tg hook init              # 安装项目级 hooks
tg hook init --user       # 安装用户级 hooks
tg hook init --all        # 安装两级
tg hook status            # 查看 hook 安装状态
tg hook status --user     # 查看用户级 hook 状态

tg hook pretool           # 工具调用前拦截
tg hook posttool          # 工具调用后压缩
tg hook prompt            # prompt 提交前检查
```

### 3.2 pretool hook

在 Copilot 调用工具之前拦截。输入 stdin JSON 包含 tool name、command string、prompt 上下文。

核心职责：

- 识别高浪费工具调用模式（raw shell command、全仓搜索、读依赖目录文件、读大文件）。
- 输出四种决策：`allow`（放行）、`warn`（附改写建议）、`deny`（附原因）、`rewrite`（改写后的 command）。
- 对 `rg`、`grep`、`cat`、`git status`、`npm test` 等给出 `tg` wrapper 改写。
- 对 `docker logs`、`kubectl logs` 按 mode 给出 suggest 或 deny。
- 拒绝读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。

### 3.3 posttool hook

在 Copilot 获取工具输出之后拦截。

核心职责：

- 读取工具原始输出。
- 调用对应 handler 的 filter 逻辑压缩输出。
- 记录原始和压缩后的长度到 history。
- 将压缩后的输出返回给 Copilot。

### 3.4 prompt hook

在 Copilot 发送 prompt 之前检查。

核心职责：

- 检查 prompt token 数是否超过 `prompt.warn_tokens` 或 `prompt.block_tokens` 阈值。
- 超阈值时输出 `warn` 或 `block`。
- 识别明显实现型任务意图（generate、implement、write code），按 model governance 策略给出路由建议。

### 3.5 错误策略

Hook 的错误策略必须偏安全：默认 fail-open。

- 输入解析失败 → `allow`（不阻断）。
- 配置文件缺失或解析失败 → `allow`。
- Policy engine 内部异常 → `allow`。
- 只有明确匹配到 deny 策略时才阻断。
- Hook 内部的调试日志写入 stderr，不污染 stdout 的 JSON protocol。

### 3.6 模型名获取

Hook runtime 从 payload 中提取 model metadata。如果 payload 中无法可靠拿到 model name，回退到 L2 行为治理，不猜测当前模型。

### 3.7 Hook Rewrite Engine

Hook rewrite engine 是集中式 command rewrite registry，在 pretool hook 中自动将 Copilot 即将执行的原始命令改写为 `tg` wrapper。设计思想来自 RTK 的 rewrite 模块。

**输入**：Copilot tool call payload 中的原始 shell command。

**输出**：四种决策：

- `rewrite` — 改写后的 `tg` 命令字符串
- `suggest` — 不改写，附建议文本
- `pass` — 放行（已经是 tg 命令、或语义不等价场景）
- `deny` — 阻断并附原因

**改写规则**：

| 原始命令 | 改写 |
|---------|------|
| `rg <pattern> <path>` | `tg rg <pattern> <path>` |
| `grep -r <pattern> <path>` | `tg grep -r <pattern> <path>` |
| `cat <file>` | `tg cat <file>` |
| `git status` | `tg git status` |
| `git diff` | `tg git diff` |
| `git log` | `tg git log` |
| `git branch` | `tg git branch` |
| `npm test` / `pnpm test` | `tg npm test` |
| `tsc --noEmit` | `tg tsc --noEmit` |
| `eslint <path>` | `tg eslint <path>` |
| `find <path> -name <pattern>` | `tg find <path> -name <pattern>` |
| `ls <path>` | `tg ls <path>` |
| `mvn test` | `tg mvn test` |
| `gradle test` | `tg gradle test` |

**不改写场景**：

- 已经是 `tg` 命令 → pass（不嵌套改写）。
- heredoc（`<<EOF`）→ pass。
- redirect write（`>`、`>>`）→ pass。
- 管道右侧命令（`| grep`、`| head`）→ pass。
- `find ... | xargs ...` → pass（避免破坏管道语义）。

**命令链处理**：

- `&&`、`||`、`;`：分别改写左右两侧命令。
- `|`：默认只改写左侧命令，右侧保持原样。

**Copilot 适配**：

- 识别 Copilot CLI 的 `gh copilot suggest` 和 VS Code Copilot Chat 的 `run_in_terminal` tool call。
- Rewrite engine 通过 stdin JSON 接收 payload，格式与 Copilot hook protocol 兼容。
- 改写结果通过 stdout JSON 返回，包含 `decision` 字段和可选的 `rewritten_command`。

---

## 4. Skills Optimizer

扫描 agent skills，识别 token 浪费风险，生成优化建议和 diff。覆盖两个层级：

- **项目级**：项目内的 `SKILL.md`、`.claude/skills/*`、`.github/agents/*` 等。
- **用户级**：`~/.agents/skills/*` 等全局 agent skills。

默认扫描项目级。`--user` 切换到用户级。`--all` 同时扫描两级。

### 4.1 命令

```bash
tg skill scan                # 扫描项目级 skills（只读）
tg skill scan --user         # 扫描用户级 skills（只读）
tg skill scan --all          # 扫描两级（只读）
tg skill optimize --dry-run  # 预览优化 diff（只读）
tg skill optimize --apply    # 应用优化（自动备份 → 写入 → 输出 diff）
tg skill restore             # 从备份恢复
tg skill restore --user      # 恢复用户级备份
```

### 4.2 扫描规则

| 风险项 | 检测逻辑 | 优化策略 |
|--------|----------|----------|
| Skill 文件过长 | 字符数/行数超过阈值 | 建议拆分到 references/examples/scripts |
| Examples 常驻注入 | 入口文件包含大段示例代码 | 提取到 `examples/` 目录，入口引用即可 |
| Description 过宽 | description 匹配范围过大 | 建议收缩为具体触发条件 |
| 缺少 `disable-model-invocation` | agent 可被模型自动调用 | 建议添加 `disable-model-invocation: true` |
| 缺少 `user-invocable` | 用户无法显式调用 | 建议添加 `user-invocable: true` |
| 可拆分内容未拆分 | 大段 reference/script/examples 在入口文件 | 建议提取为独立文件 |
| 重复注入 | 多个 skill 包含相同大段内容 | 建议提取为共享 reference |

### 4.3 安全策略

- `scan` 和 `--dry-run` 为只读操作，不做任何文件修改。
- `--apply` 先备份原文件再写入优化版本：项目级备份到 `.tg/backups/`，用户级备份到 `~/.tg/backups/`。
- 生成可审查的 unified diff。
- 不修改 skill 的语义或功能逻辑。
- 不处理非 skill 文件。
- 用户级 skills 的优化同样需要用户确认，不静默修改全局配置。

---

## 5. AGENTS.md Patcher

向 agent 指令文件追加短 token budget 指示。覆盖两个层级：

- **项目级**：项目根目录的 `AGENTS.md`、`CLAUDE.md`、`COPILOT.md` 等。
- **用户级**：`~/.agents/AGENTS.md`，影响该用户所有项目的 agent 行为。

默认操作项目级。`--user` 操作用户级。`--all` 同时操作两级。

### 5.1 命令

```bash
tg agentsmd patch          # 追加项目级 token budget 规则
tg agentsmd patch --user   # 追加用户级 token budget 规则
tg agentsmd patch --all    # 追加两级
tg agentsmd restore        # 移除 tg 追加的项目级内容
tg agentsmd restore --user # 移除 tg 追加的用户级内容
tg agentsmd restore --all  # 移除两级
```

### 5.2 追加内容

使用 HTML comment marker 标记块，保证可识别和可恢复：

```markdown
<!-- tg:start -->
## Token budget guidance

- Prefer selected code, current diff, diagnostics, and failing errors over broad repository scans.
- Use `tg rg`, `tg cat`, `tg test`, and `tg logs` before raw commands that produce long output.
- Ask before reading more than 3 additional files.
- Avoid dependency folders, generated files, build outputs, and lockfiles unless explicitly requested.
- Keep plans and explanations short; use patches for implementation.
<!-- tg:end -->
```

### 5.3 设计约束

- 追加内容严格控制在 15 行以内。
- 使用 marker block，不覆盖用户原有内容（marker 外内容原样保留）。
- 不把完整模型策略、命令表或公司规范塞进 agent 指令文件。
- `restore` 只移除 `<!-- tg:start -->` 到 `<!-- tg:end -->` 之间的内容，marker 外的修改不受影响。
- 如文件不存在则跳过或提示后创建。
- 用户级 patch 使用 `<!-- tg:user:start -->` / `<!-- tg:user:end -->` marker，与项目级区分，restore 时互不干扰。

---

## 6. Filter Engine

声明式自定义压缩规则，用 YAML 定义，支持项目级和用户级。

### 6.1 Filter 定义

```yaml
# .tg/filters.yaml
schema_version: 1
filters:
  my-build:
    match_command: "^my-build\\s+run"
    strip_ansi: true
    strip_lines_matching:
      - "^Downloading"
      - "^Installing"
    max_lines: 40
    on_empty: "my-build: ok"
```

每个 filter 包含：

| 字段 | 说明 |
|------|------|
| `match_command` | 正则匹配命令字符串 |
| `strip_ansi` | 是否移除 ANSI escape codes |
| `strip_lines_matching` | 删除匹配正则的行 |
| `max_lines` | 输出行数上限 |
| `max_chars` | 输出字符数上限 |
| `on_empty` | 输出完全为空时的替换文本 |

### 6.2 查找和优先级

1. `.tg/filters.yaml`（项目本地）
2. 用户级 filters（`%APPDATA%/TokenGuard/filters.yaml` 或 `~/.config/tg/filters.yaml`）
3. 内置 filters（handler 默认压缩逻辑）
4. passthrough（不做任何处理）

项目级优先级高于用户级。内置 handler filter 始终执行，filter engine 作为额外的规则层叠加。

### 6.3 Trust 机制

项目本地 filters 由 repo 提供，存在供应链风险（恶意 repo 通过 regex 过滤关键信息或注入内容）。设计上：

- 首次使用项目 filters 时提示用户确认。
- 在 `.tg/trust` 中记录已信任的 filter 文件哈希。
- filter 哈希变化时重新提示用户确认。

---

## 7. Parser — Three-Tier Degradation

源自 RTK 的 parser 模块。所有 tool output 解析遵循三级降级策略，确保不返回假数据。

### 7.1 三级解析

| Tier | 名称 | 行为 | 使用场景 |
|------|------|------|----------|
| Tier 1: Full | 完整解析 | JSON 解析成功，提取所有结构化字段 | 工具支持 `--json` 输出（vitest、eslint、pytest） |
| Tier 2: Degraded | 降级解析 | 部分字段提取成功，带 warning | JSON 格式不完整或有 prefix（pnpm banner、dotenv 消息） |
| Tier 3: Passthrough | 透传 | 解析失败，截断原始输出并标记 `[tg:PASSTHROUGH]` | 工具无结构化输出，或解析器无法处理 |

### 7.2 核心类型

```typescript
type ParseResult<T> =
  | { tier: 1; data: T }                              // Full
  | { tier: 2; data: T; warnings: string[] }           // Degraded
  | { tier: 3; raw: string }                           // Passthrough

interface OutputParser<T> {
  parse(raw: string): ParseResult<T>;
}
```

### 7.3 JSON 提取

对于带有 prefix 的 JSON 输出（如 pnpm 的 workspace 横幅、dotenv 的环境变量加载消息），parser 使用 brace-balancing 算法从混合输出中提取完整的 JSON 对象：

```typescript
function extractJsonObject(input: string): string | undefined {
  // 1. 查找 vitest 特有 marker `"numTotalTests"` 或首个 `{`
  // 2. Brace-balance 前向扫描找到匹配的 `}`
  // 3. 处理字符串内的 `{`、`}` 和转义
  // 4. 返回完整 JSON 字符串，或 undefined
}
```

### 7.4 截断策略

Passthrough 模式下使用配置的截断上限（默认 `max_chars: 12000`），超限时追加 `[tg:PASSTHROUGH] 截断标记`：

```
原始输出（前 12000 chars）
[tg:PASSTHROUGH] Output truncated (25000 chars → 12000 chars)
```

### 7.5 与 handler 的协作

Parser 模块作为 handler filter 的基础设施，handler 可以选择：

- 直接使用 parser 的结构化输出（如 vitest handler 解析 JSON test results）。
- 使用 parser 的 `extractJsonObject` 提取嵌入式 JSON。
- 降级到 passthrough 时，由 handler 的文本压缩逻辑接管。

---

## 8. Reporting & History

### 8.1 History

每次 `tg` 命令执行和 hook 拦截都写入 `.tg/history.jsonl`（JSONL 格式，追加写入）：

```json
{
  "timestamp": "2026-06-02T10:30:00.000Z",
  "command": "git status",
  "handler": "git-status",
  "raw_chars": 535,
  "output_chars": 351,
  "raw_tokens": 134,
  "output_tokens": 88,
  "saved_tokens": 46,
  "savings_pct": 34.3,
  "exit_code": 0,
  "duration_ms": 120,
  "raw_output_path": ".tg/raw/20260602-103000-git-status.log",
  "quality_status": "passed"
}
```

不记录：prompt 原文、源码内容、日志原文、文件内容。只记录命令类型、长度统计、策略结果和时间。

### 8.2 Report

```bash
tg report              # 项目级报告（文本格式）
tg report --user       # 用户级报告（聚合所有项目）
tg report --all        # 两级汇总
tg report --json       # JSON 格式（机器可读）
tg report --csv        # CSV 格式
```

报告内容：

- 总命令数 / hook 命中次数。
- 原始 token 总量、输出 token 总量、节省 token 总量、节省百分比。
- 按 handler 分组的节省率。
- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
- `--user` 报告按项目分组，展示每个项目的独立统计。
- `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
- 不记录敏感原文，只记录命令类型、长度、策略结果和时间。

---

## 9. Discover — Copilot Session Scanning

源自 RTK 的 discover 模块。扫描 GitHub Copilot 会话历史，找出已执行的原始命令中哪些可以用 `tg` wrapper 替代，计算遗漏的 token 节省量。

### 9.1 命令

```bash
tg discover                    # 扫描当前项目的 Copilot 会话
tg discover --all              # 扫描所有项目
tg discover --since 7          # 仅扫描最近 7 天
tg discover --json             # JSON 格式输出
```

### 9.2 扫描源

Copilot 会话数据来源（与 RTK 扫描 Claude Code sessions 不同，tg 扫描 Copilot 数据源）：

| 数据源 | 路径 | 内容 |
|--------|------|------|
| Copilot Chat 历史 | VS Code `globalState` / `workspaceState` 中的 Copilot 数据 | Chat 对话中的 tool call 记录 |
| Copilot CLI 历史 | `~/.github-copilot/` | CLI session 中的命令执行记录 |
| GitHub Copilot 云端 | Copilot API audit log（如有权限） | Cloud agent 的 tool call 历史 |

> **当前实现阶段**：优先支持 Copilot CLI 历史解析。VS Code Copilot Chat 历史解析标记为实验能力，依赖 VS Code extension API。

### 9.3 分类逻辑

扫描每个 session 中的命令，按 registry 分类：

| 分类 | 含义 | 示例 |
|------|------|------|
| `supported` | 已有 tg handler 覆盖 | `git status` → `tg git status` |
| `supported_but_disabled` | handler 存在但用户通过 `TG_DISABLED=1` 跳过 | `TG_DISABLED=1 git status` |
| `unsupported` | 无对应 handler | `docker compose up` |
| `already_tg` | 已使用 tg wrapper | `tg git diff` |
| `ignored` | 非工具调用（如 echo、cd） | `cd src/` |

### 9.4 报告输出

```
Discover Report
Sessions scanned: 12 (last 7 days)
Total commands: 847

Supported (missed savings):
  git status         142x  → tg git status       est. 45% savings
  rg search          203x  → tg rg               est. 80% savings
  npm test            67x  → tg npm test          est. 75% savings
  cat <file>          89x  → tg cat               est. 60% savings

Unsupported (top 5):
  docker compose up   23x
  kubectl get pods    15x
  ...

Already using tg: 31 commands
Parse errors: 2 sessions skipped
```

### 9.5 设计约束

- 不记录命令的具体参数值（如搜索词、文件路径），只记录命令类型和分类结果。
- 报告中的 estimated savings 使用 handler 的历史平均节省率，不是本次扫描的精确值。
- 扫描为纯只读操作，不修改任何文件。
- Copilot Chat 历史解析需要 VS Code extension API，初期可能只支持 Copilot CLI。

---

## 10. Learn — Pattern Detection & Auto-Correction

源自 RTK 的 learn 模块。分析 Copilot agent 的重复浪费行为模式，生成 CLI 使用建议并写入 AGENTS.md 规则文件。

### 10.1 命令

```bash
tg learn                       # 分析最近的 Copilot 会话，输出浪费模式报告
tg learn --since 14            # 分析最近 14 天
tg learn --write-rules         # 生成并写入 .claude/rules/cli-corrections.md
tg learn --json                # JSON 格式输出
tg learn --min-confidence 0.7  # 最低置信度阈值
tg learn --min-occurrences 5   # 最低重复次数阈值
```

### 10.2 检测模式

| 模式 | 检测逻辑 | 建议 |
|------|----------|------|
| 在 `node_modules` 中搜索 | `rg`/`grep` 路径包含 `node_modules/` | 使用 `tg rg` 自动跳过依赖目录 |
| 全仓搜索无路径限定 | `rg <pattern>` 无 path 参数 | 添加 `src/` 或 `lib/` 限定范围 |
| 读取大文件 | `cat` 超过 500 行的文件 | 使用 `tg cat` 自动摘要 |
| 读取 lockfile | `cat package-lock.json` 等 | 建议用 `jq` 或 `tg deps` |
| 读取构建产物 | `cat dist/`、`build/`、`target/` | 阻断或强烈建议跳过 |
| 执行全量测试 | `npm test` 无过滤参数 | 建议先用 `tg npm test` 只看 failures |
| 重复执行相同命令 | 同一命令在短时间窗口内出现多次 | 建议缓存结果或使用 tg 减少输出 |

### 10.3 输出格式

```
Learn Report
Sessions scanned: 8 (last 14 days)
Corrections found: 5

Rule: Prefer tg rg over raw grep in dependency dirs
  Pattern: grep -r <query> node_modules/
  Occurrences: 12
  Confidence: 0.92
  → Use: tg rg <query>

Rule: Prefer tg cat for large files
  Pattern: cat <file> where file > 500 lines
  Occurrences: 8
  Confidence: 0.85
  → Use: tg cat <file>
```

### 10.4 自动规则写入

`tg learn --write-rules` 将检测到的规则写入 `.claude/rules/cli-corrections.md`：

```markdown
# CLI Corrections (generated by tg learn)

## Prefer tg rg over raw grep
- **Pattern**: grep -r in dependency directories
- **Correction**: Use `tg rg` which automatically skips node_modules, dist, and build
- **Detected**: 12 occurrences in the last 14 days

## Prefer tg cat for large files
- **Pattern**: cat on files > 500 lines
- **Correction**: Use `tg cat` which summarizes large files with symbol extraction
- **Detected**: 8 occurrences in the last 14 days
```

### 10.5 与 Skills Optimizer 的关系

`tg learn` 和 `tg skill scan` 互补：

- `tg learn`：分析 Copilot **运行时行为**（命令执行模式）。
- `tg skill scan`：分析 **静态内容**（skill 文件大小、注入内容、description 宽度）。

两者共同提供"优化建议 → 自动修正"闭环。

---

## 11. Model Governance

Token Guard 不托管模型路由，但通过策略层级提供治理能力。从 L1（建议）到 L5（自定义 agent）逐级增强控制力。

### L1: Suggest routing

默认启用的最低层级。根据任务特征和行为给出简短模型选择建议：

- **贵模型适合**：架构计划、root cause 分析、代码审查、安全分析。
- **便宜模型适合**：boilerplate 生成、测试生成、简单 patch、日志摘要。
- **高风险组合**：贵模型 + 长输出、贵模型 + raw shell、贵模型 + 大段代码生成。

实现位置：
- `tg agentsmd patch`：在 agent 指令文件中追加短规则。
- `tg hook prompt`：对长 prompt 或明显实现型任务追加 `/model` 建议。
- `tg report`：按行为类型展示风险分布。

### L2: Behavior-based deny

不依赖模型名，只基于行为模式判断。只要行为明显浪费 token，就 warn 或 deny：

- 读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。
- `cat` 大文件（超过阈值）。
- 无路径限定的全仓搜索（`rg pattern` 无 file path）。
- 日志、测试、构建命令产生超长输出（超过 `output.max_chars`）。
- prompt 超过 `prompt.warn_tokens` 或 `prompt.block_tokens`。

实现位置：
- `tg hook pretool`：阻断或建议改写。
- `tg hook posttool`：压缩输出并记录。
- `tg hook prompt`：warn 或 block。

### L3: Model-aware deny

当 hook payload、session metadata 或 host environment 能可靠拿到模型名时启用。

```yaml
model_policy:
  expensive_models:
    - Claude Opus
    - Opus 4.6
  expensive_model_rules:
    allow:
      - plan
      - review
      - root_cause
    discourage:
      - implementation
      - test_generation
      - long_code_output
      - raw_shell
```

**关键约束**：如果无法可靠获取模型名，必须回退到 L2 行为治理，不得猜测当前模型。

### L4: Explicit session routing（实验）

用户主动选择 session 类型，Token Guard 路由到对应模型：

```bash
tg plan     # 短计划、低输出、偏贵模型
tg impl     # 代码实现、测试生成、偏便宜模型
tg review   # 代码审查，按企业策略选择模型
```

这些命令可以启动 Copilot CLI 的特定模型会话、生成 `/model` 指引，或调用可配置的 provider。

### L5: Custom Agent routing（实验）

Token Guard 生成可选 custom agent 定义：

```yaml
---
name: tg-planner
description: Creates short implementation plans and cost-aware routing decisions.
model: claude-opus
tools: ["read", "search"]
user-invocable: true
disable-model-invocation: true
---
```

安装策略：
- 默认不安装（`tg agent suggest` 只输出建议）。
- `tg agent install --optional` 才写入 `.github/agents/*`。
- 不修改用户已有 agent。

### L6/L7

L6（AI Gateway 真路由）和 L7（跨 session 自适应路由）暂不在设计范围内，文档和代码都必须明确标注。

---

## 12. Configuration

### 12.1 配置文件层级

| 位置 | 作用域 | 优先级 |
|------|--------|--------|
| `.tg/config.yaml` | 项目级 | 高（覆盖用户配置） |
| `%APPDATA%/TokenGuard/config.yaml`（Windows）或 `~/.config/tg/config.yaml` | 用户级 | 低 |

### 12.2 默认配置

```yaml
mode: balanced

prompt:
  warn_tokens: 4000
  block_tokens: 16000

tool:
  prefer_silent_rewrite: true
  block_generated_files: true
  block_dependency_folders: true
  block_lockfiles: true
  raw_command_policy:
    rg: suggest
    grep: suggest
    cat: rewrite
    npm_test: suggest
    docker_logs: block
    kubectl_logs: block

output:
  max_chars: 12000
  max_lines: 180
  keep_patterns:
    - error
    - failed
    - exception
    - fatal
    - timeout
    - denied
    - stack
    - warn

model_policy:
  escalation: suggest-first
  route: experimental
  expensive_models:
    - Claude Opus
    - Opus 4.6
```

### 12.3 Mode 语义

| mode | 行为 |
|------|------|
| `passive` | 只建议和记录，不阻断任何操作 |
| `balanced` | 明显浪费时阻断（读依赖目录、超长 prompt），大多数场景建议或改写 |
| `strict` | 企业强控：raw command、超长 prompt、大文件读取、贵模型高成本动作直接阻断 |

---

## 13. Future Token Digestion Layers

Layer 1 已落在 command filter 质量门上。后续两层先保留在设计中，不进入当前实现范围。

### 13.1 Layer 2: 少产生输出

目标是在工具执行前减少高成本输出，而不是等 raw output 生成后再压缩。

实现边界：

- 新增 rewrite registry，输入 raw command，输出 `pass | rewrite | warn | deny`。
- `tg hook pretool` 读取 stdin JSON，对 `cat` lockfile、读依赖目录、无路径全仓 `rg`、`git diff`、测试命令等给出 rewrite/warn/deny。
- `tg hook posttool` 在宿主已经执行 raw command 时复用现有 handler 压缩输出，不重新执行命令。
- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。

第一批规则只覆盖高价值命令：

- `cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
- `cat node_modules/...`、`cat dist/...` → deny。
- `rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
- `git diff` → rewrite 到 `tg git diff`。
- `npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。

### 13.2 Layer 3: 增加 cache hit

目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用。

实现边界：

- 新增 content-addressed output cache：`.tg/cache/outputs/<hash>.json`。
- cache key 由 `cwd`、command、args、git HEAD、相关文件 fingerprint 构成。
- 重复命令在 fingerprint 未变时返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`。
- 新增 deterministic project context：`.tg/context.md` 和 `.tg/context.json`，按固定顺序输出 repo map、scripts、重要文件摘要和 section hashes。
- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。

报告后续增加：

- cacheable commands。
- cache hits。
- repeated output avoided tokens。
- stable chars / volatile chars。
- raw reuse hits。

---

## 14. Implementation Constraints

- L6/L7 暂不考虑，文档和代码必须明确标注。
- 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
- 不默认安装 custom agents。
- 不默认改写用户 skill。
- 纯 TypeScript/Node.js 实现，不依赖 RTK 或 Rust。
- 模型名不可靠时不猜测，回退 L2。
- Report 不记录 prompt、源码、日志原文。
- Hook 错误策略默认 fail-open。

---

## 15. Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

构建输出 `dist/cli.js`，保留 shebang，通过 npm bin 暴露。

项目结构：

```
src/
├── cli.ts              # CLI 入口
├── parse.ts            # 参数解析
├── router.ts           # handler 路由
├── executor.ts         # 命令执行
├── types.ts            # 类型定义
├── core/
│   ├── ansi.ts         # ANSI 移除
│   ├── fallback.ts     # 异常兜底
│   ├── history.ts      # JSONL 记录读写
│   ├── outputLimit.ts  # 全局行数/字符数截断
│   ├── path.ts         # 路径安全处理
│   ├── patterns.ts     # 重要性正则匹配
│   ├── pipeline.ts     # filter → history 管线
│   ├── rawStore.ts     # 原始输出持久化
│   ├── report.ts       # 报告汇总生成
│   ├── savings.ts      # token 估算和节省计算
│   ├── stats.ts        # 统计格式化输出
│   └── text.ts         # 文本工具
└── handlers/
    ├── index.ts        # handler 注册表
    ├── base.ts         # 共享工具（rawText、makeFilteredResult）
    ├── generic.ts      # 兜底 handler
    ├── common/         # searchLike、readLike、listLike
    ├── git/            # status、diff、log、show、branch
    ├── js/             # test、eslint、tsc、packageList
    ├── python/         # pytest、ruff、mypy、pip
    └── java/           # maven、gradle、javac
```

````

**rtk** (28501 chars, 7126 tokens, 0% savings):

````text
# Token Guard Design

> 面向实现 Token Guard 的工程师和 AI Agent。记录产品边界、模块设计和模型治理策略。实现时优先保持简单、可恢复、低侵入，不要把实验能力写成默认承诺。

## Background

GitHub 宣布 Copilot 从 2026 年 6 月 1 日开始转向 usage-based billing，GitHub AI Credits 会按 token usage 消耗，包括 input、output 和 cached tokens。参见：[GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)。

企业 agent 工作流不能再默认"多给上下文、多跑命令、多输出文本"。Token Guard 要解决无意识 token 膨胀：

- 反复读取大文件、lockfile、`node_modules`、构建产物。
- `rg`、`cat`、`npm test`、日志等命令输出过长。
- skills 和 instructions 长期常驻注入。
- 长会话没有及时 compact。
- 贵模型被用于大段代码生成、测试生成和噪音工具输出。
- 缺少可审计的压缩效果、阻断记录和节省报告。

## Product stance

Token Guard 是 Copilot cost-control companion，不是 Copilot wrapper。用户主路径保持不变：

```text
VS Code Copilot Chat / Agent
GitHub Copilot CLI
GitHub Copilot cloud agent
```

`tg` 围绕八个核心能力设计：

- **Command proxy** — 低输出命令 wrappers，RTK 风格改写与压缩。用户通过 `tg <command>` 前缀使用，是产品的主入口。
- **`tg init`** — 项目初始化，生成 `.tg/config.yaml`，可选安装 hooks、追加 AGENTS.md 规则、运行 skill 审计。
- **Hook system** — pretool / posttool / prompt 三类 hook，在 Copilot 工具调用链中拦截、建议、改写或阻断高成本操作。
- **Skills optimizer** — 扫描 agent skills，识别 token 浪费，生成优化 diff。
- **AGENTS.md patcher** — 向项目指令文件追加短 token budget 指示，带标记可恢复。
- **Report & history** — 持久化每次执行的原始/压缩 token 数据，提供汇总报告。
- **Discover** — 扫描 Copilot 会话历史，找出遗漏的 token 节省机会。
- **Learn** — 分析重复浪费模式，生成自动修正规则。

`tg` 所有核心能力均支持项目级和用户级两个作用域。项目级配置影响单个 repo，用户级配置（`~/.tg/`、`~/.agents/`）作为全局基线影响该用户所有项目。两级可以共存：用户级提供默认策略，项目级可在此基础上收紧或放宽。

默认不做：

- 不替换用户已有 Copilot 入口。
- 不覆盖用户已有 agent 或 skill。
- 不承诺托管 Copilot 会话内完全透明切模型。
- 暂不实现 Claude Code subagent 路由或 AI Gateway 真路由。

---

## 1. Command Proxy

Command proxy 是 Token Guard 的核心产品能力，用户通过 `tg <command>` 前缀使用。设计思想来自 RTK：拦截高浪费命令，用专门的 handler 压缩输出。

### 1.1 使用模型

```bash
tg <original command> [...args]
```

`tg` 执行原始命令，捕获 stdout/stderr/exit code，通过 handler 压缩输出，记录 token 节省量，并以原始 exit code 退出。

```bash
tg git status
tg git diff
tg rg "submitOrder" src
tg cat package.json
tg npm test
```

### 1.2 Flags

```bash
tg --raw <command...>        # 打印原始输出
tg --stats <command...>      # 打印 token 节省统计
tg --verbose <command...>    # 打印统计和 raw output 路径
tg --max-lines 200 <command...>
tg --max-chars 12000 <command...>
tg --save-raw <command...>   # 强制保存原始输出
tg --no-save-raw <command...>
tg --report [--json|--csv]   # 查看节省报告
tg --help
tg --version
```

### 1.3 架构

```text
CLI (cli.ts)
 └─ parse (parse.ts)          # 解析 flags 和命令
     └─ route (router.ts)     # 按优先级匹配 handler
         └─ handler.execute   # spawn 执行原始命令
              └─ pipeline     # filter → history → stats
                  ├─ handler.filter   # 专用压缩逻辑
                  ├─ fallback         # 异常兜底
                  ├─ quality gate     # 膨胀/空输出/省略内容 → raw passthrough
                  ├─ outputLimit      # 当前 no-op；保留 flags 接口
                  ├─ history          # 写入 .tg/history.jsonl
                  ├─ rawStore         # 条件保存原始输出
                  └─ stats            # token 节省格式化
```

核心模块：

| 模块 | 文件 | 职责 |
|------|------|------|
| CLI entry | `src/cli.ts` | 主入口，协调 parse → route → pipeline |
| Parser | `src/parse.ts` | 解析 flags 和命令参数，支持 `--` 分隔 |
| Router | `src/router.ts` | 按注册顺序匹配 handler，generic 兜底 |
| Executor | `src/executor.ts` | `spawn` 执行命令，捕获 stdout/stderr/exit code/duration |
| Pipeline | `src/core/pipeline.ts` | 串联 filter → fallback → history |
| Savings | `src/core/savings.ts` | token 估算（chars ÷ 4）和节省计算 |
| Quality gate | `src/handlers/base.ts` | 过滤结果质量门：防膨胀、防空输出误导 |
| Output limit | `src/core/outputLimit.ts` | 当前为 no-op passthrough；`--max-lines` / `--max-chars` 保留 CLI 接口，实际截断由 handler 或 quality gate 决定 |
| History | `src/core/history.ts` | JSONL 追加写入和读取 |
| Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `.tg/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
| Report | `src/core/report.ts` | 汇总 history 生成 text/json/csv 报告 |

### 1.4 Handler 设计

每个 handler 实现 `CommandHandler` 接口：

```typescript
interface CommandHandler {
  name: string;
  matches(command: ParsedCommand): boolean;
  execute(command, options): Promise<RawResult>;
  filter(raw, command, options): Promise<FilteredResult>;
}
```

Router 按注册顺序匹配，最后一个 `genericHandler` 作为兜底。Handler 注册表位于 `src/handlers/index.ts`。

#### 实现原则

Handler 只做两类事：

1. **结构化改写** — 把 verbose 输出换成更短、但信息完整的格式（如 `git status` 短状态码、两文件 `diff` 的 LCS `+/-` 行、`tsc` 按错误码分组）。不丢行、不写 `Hidden` / `+N more` / `... N lines hidden`。
2. **原文 passthrough** — 无法在不省略内容的前提下明显变短时，原样输出 stdout/stderr（如 `rg`、`grep`、`git diff`、未知命令的 `generic`）。

只有 **`read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）；默认 `cat` / `read` 对大文件也 passthrough 全文。

#### Handler 分类与策略

| 分类 | Handler | 策略 |
|------|---------|------|
| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
| Read | `readLike`（cat、type、less、read） | `cat`/`read` 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
| List | `listLike`（ls、dir、find、tree） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
| JS | `jsTest` | failures + Test Files/Tests 摘要 |
| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
| Python | `pip` | **原文 passthrough** |
| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
| Generic | `generic` | **原文 passthrough**（stdout + stderr） |

### 1.5 FilteredResult

每个 handler 的 `filter()` 返回统一结构，由 pipeline 消费：

```typescript
type FilteredResult = {
  handler: string;         // handler 名称
  output: string;          // 最终输出（已去 ANSI；经 quality gate 选定）
  rawChars: number;        // 原始字符数
  outputChars: number;     // 最终输出字符数
  rawTokens: number;       // 估算原始 token
  outputTokens: number;    // 估算输出 token
  savedTokens: number;     // 节省 token
  savingsPct: number;      // 节省百分比
  rawOutputPath?: string;  // 原始输出保存路径（如保存）
  exitCode: number;        // 透传原始 exit code
  filterError?: string;    // fallback 时的错误信息
  qualityStatus:           // 过滤质量状态
    | "passed"
    | "inflated"
    | "empty_output";
};
```

`savingsPct` 与 history 只反映 **quality gate 之后** 的最终 `output`，不把被回退为 raw 的尝试算成有效压缩。

### 1.6 Quality gate

所有 handler 的结果在 `makeFilteredResult()` 里经过统一质量门。目标不是“让每个命令都变短”，而是 **避免为了 token 数字牺牲信息**：

| 条件 | 行为 | `qualityStatus` |
|------|------|-----------------|
| raw 非空，filtered 为空或只有空白 | 输出 raw | `empty_output` |
| raw 非空，filtered 比 raw 长（小输出零容差；大输出允许 ≤5% 或 ≥80 chars 的 metadata 开销） | 输出 raw | `inflated` |
| filtered 含省略语义（`Hidden`、`+N more`、`[N more lines]`、`... N lines hidden`、`Direct sample:` 等，`outputOmitsContent()` 检测） | 输出 raw | `inflated` |
| filtered 非空且不膨胀、不省略 | 输出 filtered | `passed` |
| raw 为空、filtered 非空（如 `0 matches for pattern`） | 输出 filtered | `passed` |

因此：

- 专用 handler 可以 passthrough（savings 为 0），这仍是正确行为。
- 结构化改写若比 raw 更长或声称省略未展示内容，会自动回退 raw。
- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入 `.tg/raw/`。

**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：

- `Hidden: … not shown`
- `+N more matches/files/packages/errors/commits/branches`
- `[N more lines]`、`... N more lines (use tg --raw …)`
- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）

这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。

### 1.7 Rewrite engine

在 hook 运行时，rewrite engine 负责将用户输入的 raw command 改写为 `tg` wrapper。这是集中式 command rewrite registry，输入 raw command，输出 `rewrite | suggest | pass | deny`。

改写规则：

- 已经是 `tg` 命令 → pass（不嵌套改写）。
- heredoc、redirect write（`>`、`>>`）、多文件 head/tail 等语义不等价场景 → pass。
- `rg` → `tg rg`、`grep` → `tg rg` 或 `tg grep`
- `cat <file>` → `tg cat <file>`
- `git status` → `tg git status`
- `git diff` → `tg git diff`
- `npm test` / `pnpm test` / `yarn test` → `tg npm test`
- `docker logs`、`kubectl logs` → suggest 或 deny

命令链处理：

- `&&`、`||`、`;`：分别改写左右两侧命令。
- `|`：默认只改写左侧命令，右侧保持原样（避免破坏管道语义）。
- `find ... | xargs ...`：默认不改写。

---

## 2. `tg init`

项目初始化和用户配置的统一入口。

```bash
tg init --mode balanced       # 项目级初始化
tg init --mode balanced --user  # 用户级初始化
tg init --all                 # 同时初始化两级
```

`tg init` 负责：

1. 创建配置文件：项目级写入 `.tg/config.yaml`，用户级写入 `~/.tg/config.yaml`。
2. 初始化目录结构（`history.jsonl`、`raw/`、`filters.yaml`）。
3. 可选：调用 `tg hook init` 安装 Copilot hooks。
4. 可选：调用 `tg agentsmd patch` 追加 token budget 指示。
5. 可选：调用 `tg skill scan` 进行首次 skill 审计。

所有写入操作可逆，`tg init` 的每一步都有对应的 undo 路径。

用户级配置影响该用户所有项目，项目级配置优先级更高。详见 [Configuration](#configuration)。

---

## 3. Hook System

Hook 是 Token Guard 在 Copilot 工具调用链中的拦截点。不依赖 Copilot 特定 API，通过 stdin JSON 与宿主通信，自动识别 Copilot CLI 和 VS Code Copilot Chat 的 payload 格式。

Hook 支持两个安装层级：

- **项目级**：hook 配置写入项目内，只在该项目中生效。
- **用户级**：hook 配置写入 `~/.tg/hooks/`，影响该用户所有项目的 Copilot 行为。

两级 hook 可以共存：用户级提供全局策略基线，项目级可在此基础上叠加更严格的规则。

### 3.1 Hook 类型

```bash
tg hook init              # 安装项目级 hooks
tg hook init --user       # 安装用户级 hooks
tg hook init --all        # 安装两级
tg hook status            # 查看 hook 安装状态
tg hook status --user     # 查看用户级 hook 状态

tg hook pretool           # 工具调用前拦截
tg hook posttool          # 工具调用后压缩
tg hook prompt            # prompt 提交前检查
```

### 3.2 pretool hook

在 Copilot 调用工具之前拦截。输入 stdin JSON 包含 tool name、command string、prompt 上下文。

核心职责：

- 识别高浪费工具调用模式（raw shell command、全仓搜索、读依赖目录文件、读大文件）。
- 输出四种决策：`allow`（放行）、`warn`（附改写建议）、`deny`（附原因）、`rewrite`（改写后的 command）。
- 对 `rg`、`grep`、`cat`、`git status`、`npm test` 等给出 `tg` wrapper 改写。
- 对 `docker logs`、`kubectl logs` 按 mode 给出 suggest 或 deny。
- 拒绝读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。

### 3.3 posttool hook

在 Copilot 获取工具输出之后拦截。

核心职责：

- 读取工具原始输出。
- 调用对应 handler 的 filter 逻辑压缩输出。
- 记录原始和压缩后的长度到 history。
- 将压缩后的输出返回给 Copilot。

### 3.4 prompt hook

在 Copilot 发送 prompt 之前检查。

核心职责：

- 检查 prompt token 数是否超过 `prompt.warn_tokens` 或 `prompt.block_tokens` 阈值。
- 超阈值时输出 `warn` 或 `block`。
- 识别明显实现型任务意图（generate、implement、write code），按 model governance 策略给出路由建议。

### 3.5 错误策略

Hook 的错误策略必须偏安全：默认 fail-open。

- 输入解析失败 → `allow`（不阻断）。
- 配置文件缺失或解析失败 → `allow`。
- Policy engine 内部异常 → `allow`。
- 只有明确匹配到 deny 策略时才阻断。
- Hook 内部的调试日志写入 stderr，不污染 stdout 的 JSON protocol。

### 3.6 模型名获取

Hook runtime 从 payload 中提取 model metadata。如果 payload 中无法可靠拿到 model name，回退到 L2 行为治理，不猜测当前模型。

### 3.7 Hook Rewrite Engine

Hook rewrite engine 是集中式 command rewrite registry，在 pretool hook 中自动将 Copilot 即将执行的原始命令改写为 `tg` wrapper。设计思想来自 RTK 的 rewrite 模块。

**输入**：Copilot tool call payload 中的原始 shell command。

**输出**：四种决策：

- `rewrite` — 改写后的 `tg` 命令字符串
- `suggest` — 不改写，附建议文本
- `pass` — 放行（已经是 tg 命令、或语义不等价场景）
- `deny` — 阻断并附原因

**改写规则**：

| 原始命令 | 改写 |
|---------|------|
| `rg <pattern> <path>` | `tg rg <pattern> <path>` |
| `grep -r <pattern> <path>` | `tg grep -r <pattern> <path>` |
| `cat <file>` | `tg cat <file>` |
| `git status` | `tg git status` |
| `git diff` | `tg git diff` |
| `git log` | `tg git log` |
| `git branch` | `tg git branch` |
| `npm test` / `pnpm test` | `tg npm test` |
| `tsc --noEmit` | `tg tsc --noEmit` |
| `eslint <path>` | `tg eslint <path>` |
| `find <path> -name <pattern>` | `tg find <path> -name <pattern>` |
| `ls <path>` | `tg ls <path>` |
| `mvn test` | `tg mvn test` |
| `gradle test` | `tg gradle test` |

**不改写场景**：

- 已经是 `tg` 命令 → pass（不嵌套改写）。
- heredoc（`<<EOF`）→ pass。
- redirect write（`>`、`>>`）→ pass。
- 管道右侧命令（`| grep`、`| head`）→ pass。
- `find ... | xargs ...` → pass（避免破坏管道语义）。

**命令链处理**：

- `&&`、`||`、`;`：分别改写左右两侧命令。
- `|`：默认只改写左侧命令，右侧保持原样。

**Copilot 适配**：

- 识别 Copilot CLI 的 `gh copilot suggest` 和 VS Code Copilot Chat 的 `run_in_terminal` tool call。
- Rewrite engine 通过 stdin JSON 接收 payload，格式与 Copilot hook protocol 兼容。
- 改写结果通过 stdout JSON 返回，包含 `decision` 字段和可选的 `rewritten_command`。

---

## 4. Skills Optimizer

扫描 agent skills，识别 token 浪费风险，生成优化建议和 diff。覆盖两个层级：

- **项目级**：项目内的 `SKILL.md`、`.claude/skills/*`、`.github/agents/*` 等。
- **用户级**：`~/.agents/skills/*` 等全局 agent skills。

默认扫描项目级。`--user` 切换到用户级。`--all` 同时扫描两级。

### 4.1 命令

```bash
tg skill scan                # 扫描项目级 skills（只读）
tg skill scan --user         # 扫描用户级 skills（只读）
tg skill scan --all          # 扫描两级（只读）
tg skill optimize --dry-run  # 预览优化 diff（只读）
tg skill optimize --apply    # 应用优化（自动备份 → 写入 → 输出 diff）
tg skill restore             # 从备份恢复
tg skill restore --user      # 恢复用户级备份
```

### 4.2 扫描规则

| 风险项 | 检测逻辑 | 优化策略 |
|--------|----------|----------|
| Skill 文件过长 | 字符数/行数超过阈值 | 建议拆分到 references/examples/scripts |
| Examples 常驻注入 | 入口文件包含大段示例代码 | 提取到 `examples/` 目录，入口引用即可 |
| Description 过宽 | description 匹配范围过大 | 建议收缩为具体触发条件 |
| 缺少 `disable-model-invocation` | agent 可被模型自动调用 | 建议添加 `disable-model-invocation: true` |
| 缺少 `user-invocable` | 用户无法显式调用 | 建议添加 `user-invocable: true` |
| 可拆分内容未拆分 | 大段 reference/script/examples 在入口文件 | 建议提取为独立文件 |
| 重复注入 | 多个 skill 包含相同大段内容 | 建议提取为共享 reference |

### 4.3 安全策略

- `scan` 和 `--dry-run` 为只读操作，不做任何文件修改。
- `--apply` 先备份原文件再写入优化版本：项目级备份到 `.tg/backups/`，用户级备份到 `~/.tg/backups/`。
- 生成可审查的 unified diff。
- 不修改 skill 的语义或功能逻辑。
- 不处理非 skill 文件。
- 用户级 skills 的优化同样需要用户确认，不静默修改全局配置。

---

## 5. AGENTS.md Patcher

向 agent 指令文件追加短 token budget 指示。覆盖两个层级：

- **项目级**：项目根目录的 `AGENTS.md`、`CLAUDE.md`、`COPILOT.md` 等。
- **用户级**：`~/.agents/AGENTS.md`，影响该用户所有项目的 agent 行为。

默认操作项目级。`--user` 操作用户级。`--all` 同时操作两级。

### 5.1 命令

```bash
tg agentsmd patch          # 追加项目级 token budget 规则
tg agentsmd patch --user   # 追加用户级 token budget 规则
tg agentsmd patch --all    # 追加两级
tg agentsmd restore        # 移除 tg 追加的项目级内容
tg agentsmd restore --user # 移除 tg 追加的用户级内容
tg agentsmd restore --all  # 移除两级
```

### 5.2 追加内容

使用 HTML comment marker 标记块，保证可识别和可恢复：

```markdown
<!-- tg:start -->
## Token budget guidance

- Prefer selected code, current diff, diagnostics, and failing errors over broad repository scans.
- Use `tg rg`, `tg cat`, `tg test`, and `tg logs` before raw commands that produce long output.
- Ask before reading more than 3 additional files.
- Avoid dependency folders, generated files, build outputs, and lockfiles unless explicitly requested.
- Keep plans and explanations short; use patches for implementation.
<!-- tg:end -->
```

### 5.3 设计约束

- 追加内容严格控制在 15 行以内。
- 使用 marker block，不覆盖用户原有内容（marker 外内容原样保留）。
- 不把完整模型策略、命令表或公司规范塞进 agent 指令文件。
- `restore` 只移除 `<!-- tg:start -->` 到 `<!-- tg:end -->` 之间的内容，marker 外的修改不受影响。
- 如文件不存在则跳过或提示后创建。
- 用户级 patch 使用 `<!-- tg:user:start -->` / `<!-- tg:user:end -->` marker，与项目级区分，restore 时互不干扰。

---

## 6. Filter Engine

声明式自定义压缩规则，用 YAML 定义，支持项目级和用户级。

### 6.1 Filter 定义

```yaml
# .tg/filters.yaml
schema_version: 1
filters:
  my-build:
    match_command: "^my-build\\s+run"
    strip_ansi: true
    strip_lines_matching:
      - "^Downloading"
      - "^Installing"
    max_lines: 40
    on_empty: "my-build: ok"
```

每个 filter 包含：

| 字段 | 说明 |
|------|------|
| `match_command` | 正则匹配命令字符串 |
| `strip_ansi` | 是否移除 ANSI escape codes |
| `strip_lines_matching` | 删除匹配正则的行 |
| `max_lines` | 输出行数上限 |
| `max_chars` | 输出字符数上限 |
| `on_empty` | 输出完全为空时的替换文本 |

### 6.2 查找和优先级

1. `.tg/filters.yaml`（项目本地）
2. 用户级 filters（`%APPDATA%/TokenGuard/filters.yaml` 或 `~/.config/tg/filters.yaml`）
3. 内置 filters（handler 默认压缩逻辑）
4. passthrough（不做任何处理）

项目级优先级高于用户级。内置 handler filter 始终执行，filter engine 作为额外的规则层叠加。

### 6.3 Trust 机制

项目本地 filters 由 repo 提供，存在供应链风险（恶意 repo 通过 regex 过滤关键信息或注入内容）。设计上：

- 首次使用项目 filters 时提示用户确认。
- 在 `.tg/trust` 中记录已信任的 filter 文件哈希。
- filter 哈希变化时重新提示用户确认。

---

## 7. Parser — Three-Tier Degradation

源自 RTK 的 parser 模块。所有 tool output 解析遵循三级降级策略，确保不返回假数据。

### 7.1 三级解析

| Tier | 名称 | 行为 | 使用场景 |
|------|------|------|----------|
| Tier 1: Full | 完整解析 | JSON 解析成功，提取所有结构化字段 | 工具支持 `--json` 输出（vitest、eslint、pytest） |
| Tier 2: Degraded | 降级解析 | 部分字段提取成功，带 warning | JSON 格式不完整或有 prefix（pnpm banner、dotenv 消息） |
| Tier 3: Passthrough | 透传 | 解析失败，截断原始输出并标记 `[tg:PASSTHROUGH]` | 工具无结构化输出，或解析器无法处理 |

### 7.2 核心类型

```typescript
type ParseResult<T> =
  | { tier: 1; data: T }                              // Full
  | { tier: 2; data: T; warnings: string[] }           // Degraded
  | { tier: 3; raw: string }                           // Passthrough

interface OutputParser<T> {
  parse(raw: string): ParseResult<T>;
}
```

### 7.3 JSON 提取

对于带有 prefix 的 JSON 输出（如 pnpm 的 workspace 横幅、dotenv 的环境变量加载消息），parser 使用 brace-balancing 算法从混合输出中提取完整的 JSON 对象：

```typescript
function extractJsonObject(input: string): string | undefined {
  // 1. 查找 vitest 特有 marker `"numTotalTests"` 或首个 `{`
  // 2. Brace-balance 前向扫描找到匹配的 `}`
  // 3. 处理字符串内的 `{`、`}` 和转义
  // 4. 返回完整 JSON 字符串，或 undefined
}
```

### 7.4 截断策略

Passthrough 模式下使用配置的截断上限（默认 `max_chars: 12000`），超限时追加 `[tg:PASSTHROUGH] 截断标记`：

```
原始输出（前 12000 chars）
[tg:PASSTHROUGH] Output truncated (25000 chars → 12000 chars)
```

### 7.5 与 handler 的协作

Parser 模块作为 handler filter 的基础设施，handler 可以选择：

- 直接使用 parser 的结构化输出（如 vitest handler 解析 JSON test results）。
- 使用 parser 的 `extractJsonObject` 提取嵌入式 JSON。
- 降级到 passthrough 时，由 handler 的文本压缩逻辑接管。

---

## 8. Reporting & History

### 8.1 History

每次 `tg` 命令执行和 hook 拦截都写入 `.tg/history.jsonl`（JSONL 格式，追加写入）：

```json
{
  "timestamp": "2026-06-02T10:30:00.000Z",
  "command": "git status",
  "handler": "git-status",
  "raw_chars": 535,
  "output_chars": 351,
  "raw_tokens": 134,
  "output_tokens": 88,
  "saved_tokens": 46,
  "savings_pct": 34.3,
  "exit_code": 0,
  "duration_ms": 120,
  "raw_output_path": ".tg/raw/20260602-103000-git-status.log",
  "quality_status": "passed"
}
```

不记录：prompt 原文、源码内容、日志原文、文件内容。只记录命令类型、长度统计、策略结果和时间。

### 8.2 Report

```bash
tg report              # 项目级报告（文本格式）
tg report --user       # 用户级报告（聚合所有项目）
tg report --all        # 两级汇总
tg report --json       # JSON 格式（机器可读）
tg report --csv        # CSV 格式
```

报告内容：

- 总命令数 / hook 命中次数。
- 原始 token 总量、输出 token 总量、节省 token 总量、节省百分比。
- 按 handler 分组的节省率。
- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
- `--user` 报告按项目分组，展示每个项目的独立统计。
- `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
- 不记录敏感原文，只记录命令类型、长度、策略结果和时间。

---

## 9. Discover — Copilot Session Scanning

源自 RTK 的 discover 模块。扫描 GitHub Copilot 会话历史，找出已执行的原始命令中哪些可以用 `tg` wrapper 替代，计算遗漏的 token 节省量。

### 9.1 命令

```bash
tg discover                    # 扫描当前项目的 Copilot 会话
tg discover --all              # 扫描所有项目
tg discover --since 7          # 仅扫描最近 7 天
tg discover --json             # JSON 格式输出
```

### 9.2 扫描源

Copilot 会话数据来源（与 RTK 扫描 Claude Code sessions 不同，tg 扫描 Copilot 数据源）：

| 数据源 | 路径 | 内容 |
|--------|------|------|
| Copilot Chat 历史 | VS Code `globalState` / `workspaceState` 中的 Copilot 数据 | Chat 对话中的 tool call 记录 |
| Copilot CLI 历史 | `~/.github-copilot/` | CLI session 中的命令执行记录 |
| GitHub Copilot 云端 | Copilot API audit log（如有权限） | Cloud agent 的 tool call 历史 |

> **当前实现阶段**：优先支持 Copilot CLI 历史解析。VS Code Copilot Chat 历史解析标记为实验能力，依赖 VS Code extension API。

### 9.3 分类逻辑

扫描每个 session 中的命令，按 registry 分类：

| 分类 | 含义 | 示例 |
|------|------|------|
| `supported` | 已有 tg handler 覆盖 | `git status` → `tg git status` |
| `supported_but_disabled` | handler 存在但用户通过 `TG_DISABLED=1` 跳过 | `TG_DISABLED=1 git status` |
| `unsupported` | 无对应 handler | `docker compose up` |
| `already_tg` | 已使用 tg wrapper | `tg git diff` |
| `ignored` | 非工具调用（如 echo、cd） | `cd src/` |

### 9.4 报告输出

```
Discover Report
Sessions scanned: 12 (last 7 days)
Total commands: 847

Supported (missed savings):
  git status         142x  → tg git status       est. 45% savings
  rg search          203x  → tg rg               est. 80% savings
  npm test            67x  → tg npm test          est. 75% savings
  cat <file>          89x  → tg cat               est. 60% savings

Unsupported (top 5):
  docker compose up   23x
  kubectl get pods    15x
  ...

Already using tg: 31 commands
Parse errors: 2 sessions skipped
```

### 9.5 设计约束

- 不记录命令的具体参数值（如搜索词、文件路径），只记录命令类型和分类结果。
- 报告中的 estimated savings 使用 handler 的历史平均节省率，不是本次扫描的精确值。
- 扫描为纯只读操作，不修改任何文件。
- Copilot Chat 历史解析需要 VS Code extension API，初期可能只支持 Copilot CLI。

---

## 10. Learn — Pattern Detection & Auto-Correction

源自 RTK 的 learn 模块。分析 Copilot agent 的重复浪费行为模式，生成 CLI 使用建议并写入 AGENTS.md 规则文件。

### 10.1 命令

```bash
tg learn                       # 分析最近的 Copilot 会话，输出浪费模式报告
tg learn --since 14            # 分析最近 14 天
tg learn --write-rules         # 生成并写入 .claude/rules/cli-corrections.md
tg learn --json                # JSON 格式输出
tg learn --min-confidence 0.7  # 最低置信度阈值
tg learn --min-occurrences 5   # 最低重复次数阈值
```

### 10.2 检测模式

| 模式 | 检测逻辑 | 建议 |
|------|----------|------|
| 在 `node_modules` 中搜索 | `rg`/`grep` 路径包含 `node_modules/` | 使用 `tg rg` 自动跳过依赖目录 |
| 全仓搜索无路径限定 | `rg <pattern>` 无 path 参数 | 添加 `src/` 或 `lib/` 限定范围 |
| 读取大文件 | `cat` 超过 500 行的文件 | 使用 `tg cat` 自动摘要 |
| 读取 lockfile | `cat package-lock.json` 等 | 建议用 `jq` 或 `tg deps` |
| 读取构建产物 | `cat dist/`、`build/`、`target/` | 阻断或强烈建议跳过 |
| 执行全量测试 | `npm test` 无过滤参数 | 建议先用 `tg npm test` 只看 failures |
| 重复执行相同命令 | 同一命令在短时间窗口内出现多次 | 建议缓存结果或使用 tg 减少输出 |

### 10.3 输出格式

```
Learn Report
Sessions scanned: 8 (last 14 days)
Corrections found: 5

Rule: Prefer tg rg over raw grep in dependency dirs
  Pattern: grep -r <query> node_modules/
  Occurrences: 12
  Confidence: 0.92
  → Use: tg rg <query>

Rule: Prefer tg cat for large files
  Pattern: cat <file> where file > 500 lines
  Occurrences: 8
  Confidence: 0.85
  → Use: tg cat <file>
```

### 10.4 自动规则写入

`tg learn --write-rules` 将检测到的规则写入 `.claude/rules/cli-corrections.md`：

```markdown
# CLI Corrections (generated by tg learn)

## Prefer tg rg over raw grep
- **Pattern**: grep -r in dependency directories
- **Correction**: Use `tg rg` which automatically skips node_modules, dist, and build
- **Detected**: 12 occurrences in the last 14 days

## Prefer tg cat for large files
- **Pattern**: cat on files > 500 lines
- **Correction**: Use `tg cat` which summarizes large files with symbol extraction
- **Detected**: 8 occurrences in the last 14 days
```

### 10.5 与 Skills Optimizer 的关系

`tg learn` 和 `tg skill scan` 互补：

- `tg learn`：分析 Copilot **运行时行为**（命令执行模式）。
- `tg skill scan`：分析 **静态内容**（skill 文件大小、注入内容、description 宽度）。

两者共同提供"优化建议 → 自动修正"闭环。

---

## 11. Model Governance

Token Guard 不托管模型路由，但通过策略层级提供治理能力。从 L1（建议）到 L5（自定义 agent）逐级增强控制力。

### L1: Suggest routing

默认启用的最低层级。根据任务特征和行为给出简短模型选择建议：

- **贵模型适合**：架构计划、root cause 分析、代码审查、安全分析。
- **便宜模型适合**：boilerplate 生成、测试生成、简单 patch、日志摘要。
- **高风险组合**：贵模型 + 长输出、贵模型 + raw shell、贵模型 + 大段代码生成。

实现位置：
- `tg agentsmd patch`：在 agent 指令文件中追加短规则。
- `tg hook prompt`：对长 prompt 或明显实现型任务追加 `/model` 建议。
- `tg report`：按行为类型展示风险分布。

### L2: Behavior-based deny

不依赖模型名，只基于行为模式判断。只要行为明显浪费 token，就 warn 或 deny：

- 读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。
- `cat` 大文件（超过阈值）。
- 无路径限定的全仓搜索（`rg pattern` 无 file path）。
- 日志、测试、构建命令产生超长输出（超过 `output.max_chars`）。
- prompt 超过 `prompt.warn_tokens` 或 `prompt.block_tokens`。

实现位置：
- `tg hook pretool`：阻断或建议改写。
- `tg hook posttool`：压缩输出并记录。
- `tg hook prompt`：warn 或 block。

### L3: Model-aware deny

当 hook payload、session metadata 或 host environment 能可靠拿到模型名时启用。

```yaml
model_policy:
  expensive_models:
    - Claude Opus
    - Opus 4.6
  expensive_model_rules:
    allow:
      - plan
      - review
      - root_cause
    discourage:
      - implementation
      - test_generation
      - long_code_output
      - raw_shell
```

**关键约束**：如果无法可靠获取模型名，必须回退到 L2 行为治理，不得猜测当前模型。

### L4: Explicit session routing（实验）

用户主动选择 session 类型，Token Guard 路由到对应模型：

```bash
tg plan     # 短计划、低输出、偏贵模型
tg impl     # 代码实现、测试生成、偏便宜模型
tg review   # 代码审查，按企业策略选择模型
```

这些命令可以启动 Copilot CLI 的特定模型会话、生成 `/model` 指引，或调用可配置的 provider。

### L5: Custom Agent routing（实验）

Token Guard 生成可选 custom agent 定义：

```yaml
---
name: tg-planner
description: Creates short implementation plans and cost-aware routing decisions.
model: claude-opus
tools: ["read", "search"]
user-invocable: true
disable-model-invocation: true
---
```

安装策略：
- 默认不安装（`tg agent suggest` 只输出建议）。
- `tg agent install --optional` 才写入 `.github/agents/*`。
- 不修改用户已有 agent。

### L6/L7

L6（AI Gateway 真路由）和 L7（跨 session 自适应路由）暂不在设计范围内，文档和代码都必须明确标注。

---

## 12. Configuration

### 12.1 配置文件层级

| 位置 | 作用域 | 优先级 |
|------|--------|--------|
| `.tg/config.yaml` | 项目级 | 高（覆盖用户配置） |
| `%APPDATA%/TokenGuard/config.yaml`（Windows）或 `~/.config/tg/config.yaml` | 用户级 | 低 |

### 12.2 默认配置

```yaml
mode: balanced

prompt:
  warn_tokens: 4000
  block_tokens: 16000

tool:
  prefer_silent_rewrite: true
  block_generated_files: true
  block_dependency_folders: true
  block_lockfiles: true
  raw_command_policy:
    rg: suggest
    grep: suggest
    cat: rewrite
    npm_test: suggest
    docker_logs: block
    kubectl_logs: block

output:
  max_chars: 12000
  max_lines: 180
  keep_patterns:
    - error
    - failed
    - exception
    - fatal
    - timeout
    - denied
    - stack
    - warn

model_policy:
  escalation: suggest-first
  route: experimental
  expensive_models:
    - Claude Opus
    - Opus 4.6
```

### 12.3 Mode 语义

| mode | 行为 |
|------|------|
| `passive` | 只建议和记录，不阻断任何操作 |
| `balanced` | 明显浪费时阻断（读依赖目录、超长 prompt），大多数场景建议或改写 |
| `strict` | 企业强控：raw command、超长 prompt、大文件读取、贵模型高成本动作直接阻断 |

---

## 13. Future Token Digestion Layers

Layer 1 已落在 command filter 质量门上。后续两层先保留在设计中，不进入当前实现范围。

### 13.1 Layer 2: 少产生输出

目标是在工具执行前减少高成本输出，而不是等 raw output 生成后再压缩。

实现边界：

- 新增 rewrite registry，输入 raw command，输出 `pass | rewrite | warn | deny`。
- `tg hook pretool` 读取 stdin JSON，对 `cat` lockfile、读依赖目录、无路径全仓 `rg`、`git diff`、测试命令等给出 rewrite/warn/deny。
- `tg hook posttool` 在宿主已经执行 raw command 时复用现有 handler 压缩输出，不重新执行命令。
- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。

第一批规则只覆盖高价值命令：

- `cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
- `cat node_modules/...`、`cat dist/...` → deny。
- `rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
- `git diff` → rewrite 到 `tg git diff`。
- `npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。

### 13.2 Layer 3: 增加 cache hit

目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用。

实现边界：

- 新增 content-addressed output cache：`.tg/cache/outputs/<hash>.json`。
- cache key 由 `cwd`、command、args、git HEAD、相关文件 fingerprint 构成。
- 重复命令在 fingerprint 未变时返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`。
- 新增 deterministic project context：`.tg/context.md` 和 `.tg/context.json`，按固定顺序输出 repo map、scripts、重要文件摘要和 section hashes。
- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。

报告后续增加：

- cacheable commands。
- cache hits。
- repeated output avoided tokens。
- stable chars / volatile chars。
- raw reuse hits。

---

## 14. Implementation Constraints

- L6/L7 暂不考虑，文档和代码必须明确标注。
- 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
- 不默认安装 custom agents。
- 不默认改写用户 skill。
- 纯 TypeScript/Node.js 实现，不依赖 RTK 或 Rust。
- 模型名不可靠时不猜测，回退 L2。
- Report 不记录 prompt、源码、日志原文。
- Hook 错误策略默认 fail-open。

---

## 15. Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

构建输出 `dist/cli.js`，保留 shebang，通过 npm bin 暴露。

项目结构：

```
src/
├── cli.ts              # CLI 入口
├── parse.ts            # 参数解析
├── router.ts           # handler 路由
├── executor.ts         # 命令执行
├── types.ts            # 类型定义
├── core/
│   ├── ansi.ts         # ANSI 移除
│   ├── fallback.ts     # 异常兜底
│   ├── history.ts      # JSONL 记录读写
│   ├── outputLimit.ts  # 全局行数/字符数截断
│   ├── path.ts         # 路径安全处理
│   ├── patterns.ts     # 重要性正则匹配
│   ├── pipeline.ts     # filter → history 管线
│   ├── rawStore.ts     # 原始输出持久化
│   ├── report.ts       # 报告汇总生成
│   ├── savings.ts      # token 估算和节省计算
│   ├── stats.ts        # 统计格式化输出
│   └── text.ts         # 文本工具
└── handlers/
    ├── index.ts        # handler 注册表
    ├── base.ts         # 共享工具（rawText、makeFilteredResult）
    ├── generic.ts      # 兜底 handler
    ├── common/         # searchLike、readLike、listLike
    ├── git/            # status、diff、log、show、branch
    ├── js/             # test、eslint、tsc、packageList
    ├── python/         # pytest、ruff、mypy、pip
    └── java/           # maven、gradle、javac
```

````

---

### 20. read-like: cat package.json

- Handler: `read-like`
- tg: `tg cat package.json`
- raw: `cat package.json`
- rtk: `read package.json`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 1251 | 313 | 0% |
| tg | 1251 | 313 | 0% |
| rtk | 1251 | 313 | 0% |

**raw** (1251 chars, 313 tokens):

```text
{
  "name": "@company/tg",
  "version": "0.1.0",
  "description": "RTK-style token-saving command proxy.",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "tg": "./dist/cli.js"
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
    "tsdown": "^0.22.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}

```

**tg** (1251 chars, 313 tokens, 0% savings):

```text
{
  "name": "@company/tg",
  "version": "0.1.0",
  "description": "RTK-style token-saving command proxy.",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "tg": "./dist/cli.js"
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
    "tsdown": "^0.22.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}

```

**rtk** (1251 chars, 313 tokens, 0% savings):

```text
{
  "name": "@company/tg",
  "version": "0.1.0",
  "description": "RTK-style token-saving command proxy.",
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "tg": "./dist/cli.js"
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
    "tsdown": "^0.22.1",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}

```

---

### 21. read-like: cat src/cli.ts

- Handler: `read-like`
- tg: `tg cat src/cli.ts`
- raw: `cat src/cli.ts`
- rtk: `read src/cli.ts`

| channel | chars | tokens | savingsPct |
|---|---:|---:|---:|
| raw | 3271 | 818 | 0% |
| tg | 3271 | 818 | 0% |
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
import type { FilteredResult, RawResult, TgOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tg [tg flags] <command...>",
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

async function recordRawPassthrough(raw: RawResult, options: TgOptions): Promise<void> {
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
    process.stderr.write("tg: missing command\n");
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

**tg** (3271 chars, 818 tokens, 0% savings):

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
import type { FilteredResult, RawResult, TgOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tg [tg flags] <command...>",
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

async function recordRawPassthrough(raw: RawResult, options: TgOptions): Promise<void> {
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
    process.stderr.write("tg: missing command\n");
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
import type { FilteredResult, RawResult, TgOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tg [tg flags] <command...>",
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

async function recordRawPassthrough(raw: RawResult, options: TgOptions): Promise<void> {
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
    process.stderr.write("tg: missing command\n");
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
