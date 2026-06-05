# Green 测试 RTK Parity 审计（2026-06-05）

> 一次性审计快照：评估 token-guard 当前 **green** 的 RTK→tg 迁移测试，能否作为
> tg 正确性与压缩率达到 RTK 标准的**硬门禁（hard gate）**。
> 迁移待办（"还要写哪些测试"）见 [`missing-tests-rtk.md`](./missing-tests-rtk.md)；本文件是
> "现有绿测试质量判定"，两者职责互补、互相引用。
>
> RTK 为唯一 oracle。审计原则：绿色只有在它同时 gate **RTK 关键留存 + RTK 压缩** 时才算硬门；
> 仅证明 handler 存在 / 非空输出 / 关键字出现 / 文件存在，不算 parity 门。

## 复现命令

```bash
pnpm typecheck       # pass
pnpm test:product    # 14 files / 154 tests pass（经 pnpm 脚本运行；裸跑 hooked vitest 时
                     #   cli.test.ts 的 tsc spawn 可能因 PATH 差异报 "tsc: command not found"）
# migration 经 RTK hook 跑会干扰 vitest 收集、计数偏低且波动；用未过滤口径：
rtk proxy pnpm exec vitest run --config vitest.migration.config.ts
#   → Test Files  20 passed | 40 failed (60)
#   → Tests       87 passed | 44 failed (131)   ← 权威口径，连续运行 ±1 轻微 flaky
# 本审计未修改任何 src 文件（改动仅限 docs/）。
# 注意：仓库 src/** 另有未提交改动（非本审计产生，疑由并发的实现/修复进程造成），
# 因此 `git diff --name-only -- src` 会列出若干文件，而非空。
```

> ⚠️ 直接跑 `pnpm test:migration`（RTK hook 改写 `vitest`）首测报 16 passed / 44 failed 文件、
> 69 passed / 48 failed 测试，且多次运行不稳；本审计的所有绿/红判定以未过滤（`rtk proxy`）口径为准。
> 此偏差本身也是一条值得跟进的工具链问题，但与本审计结论无关——下列 findings 针对的具体绿测试在两种口径下都绿。
> 另注：审计期间 `src/**` 正被并发的实现/修复进程修改，故上述计数是**时点快照**；随着 handler 陆续实现，
> 绿测试数会上升，但本审计的质量判定（绿是否 gate 压缩）不随计数变化——参见各 finding 对具体测试的分析。

RTK 计数口径：`grep -c "#\[test\]" rtk/src/cmds/<file>`（`src/cmds` 合计 **956** 个 `#[test]`）。

---

## 总体结论（Verdict）

**否。当前 green 迁移测试不能作为 tg 达到 RTK 正确性 + 压缩标准的硬门禁。**

它们能 gate 一部分 **留存 / 格式 / passthrough** 正确性，但**几乎不 gate 压缩**：当前绿的 migration 测试（未过滤口径约 87 条）中，没有任何一条对压缩率设硬门，且每命令普遍只有 1 条 happy-path，对照 RTK 956 个 `#[test]` 覆盖率极低。

少数命令（vitest / pnpm / jest / tsc 的分组与反截断 invariant）provenance 可靠、用 `exact` 锁定 RTK 格式，是真正接近硬门的；但 gradle / curl / grep / git push / diff / find / pytest 的绿测试要么是 passthrough、要么压缩上限失真、要么只覆盖单一 happy-path。

---

## 致命结构性缺陷（影响全局，优先于任何单命令）

### S1 — 全库零 savings-ratio 断言，且 `maxOutputChars` 多数不证压缩

- `tests/helpers/rtkCommandHarness.ts:133` 的 `minSavingsRatio` 字段**在整个行为测试套件中使用 0 次**——是死代码。
- 改用绝对上限 `maxOutputChars` 的地方，量化后发现**上限往往 ≥ 原始输入**，不构成压缩门：

  | 测试 | `maxOutputChars` | 原始 fixture | 结论 |
  |---|---|---|---|
  | `rtkTscBehavior` "groups errors" | `1235` | `tsc_many.txt` = **1235 B** | 上限 == 原始，只禁增长，零压缩保证 |
  | `rtkGradleBehavior` | `240` | `gradle_build_warnings.txt` = **198 B** | 上限 > 原始，**允许输出膨胀**仍绿 |
  | `rtkGitStatusBehavior` (2) | `rawOutput.length` | — | 只禁增长 |

- 对照 RTK：`gradlew_cmd.rs:1347 test_build_token_savings` 断言 `token_savings >= 70.0`（百分比、对真实规模 build log）；另有 `aws / curl / golangci / pipe / psql` 等数十个 `*_token_savings` 测试。**tg 一个都没迁。**

### S2 — 产品 fixture 套件结构上无法 gate 压缩

- `tests/unit/handlers/fixtureContent.test.ts` 用 `LOSSY_OMISSION_PATTERNS` **全局 forbid** 了 `+N more` / `truncated` / `omitted` / `Hidden:`——而这些正是 RTK 在规模输入下产生的压缩标记（find `+N more`、pnpm `… +N more`、grep overflow、curl 截断、ruff/pytest caps）。
- 51 条 `fixtureCases` 中 `maxOutputGrowth` 只用了 `0` 和 `10`（永远允许增长），无任何比率/负向约束。
- 结论：产品 fixture 被刻意选在 RTK cap 阈值**之下**，只能 gate "小输入留存"，**结构上测不到 RTK 的 cap / overflow / truncation 压缩行为**。

### S3 — 覆盖密度与 RTK 严重不成比例

RTK `src/cmds` 共 **956** 个 `#[test]`。多数命令的 green 行为测试是 **1 条**：gradle 1（RTK 56）、diff 1（RTK 19）、curl 1（RTK 11）、find 1（RTK 29）、git push 1（RTK git.rs 75）。一条 happy-path 不等于命令完成。

---

## Findings（按严重度排序）

每条含：文件/测试 · 问题 · RTK 源码/测试参照 · 必需的测试变更（**不弱化断言**）。

### F1 — `rtkGradleBehavior` 的"压缩上限"形同虚设 【严重】
- `tests/unit/handlers/rtkGradleBehavior.test.ts`
- 问题：`maxOutputChars: 240` > 原始 fixture 198 B，允许输出膨胀仍绿；无 savings 比率。
- RTK：`rtk/src/cmds/jvm/gradlew_cmd.rs:1347 test_build_token_savings`（≥70%）、`:955/:969/:1012/:1022` 四个 fixture savings 测试。
- 必需变更：改用真实规模 build-log fixture，断言压缩比达 RTK 同级（≥70%）或对齐 RTK 精确压缩 shape；保留 task-progress 剥离断言。

### F2 — `rtkTscBehavior` 分组测试的压缩上限 == 原始大小 【严重】
- `tests/unit/handlers/rtkTscBehavior.test.ts`（"groups TypeScript errors by file"）
- 问题：`maxOutputChars: 1235` == `tsc_many.txt` 字节数，只禁增长不证压缩。
- RTK：`js/tsc_cmd.rs:222 test_filter_tsc_output`（去 `Found N errors` + 分组）。注：同文件 `every_error_message_shown` / `no_file_limit` 是 RTK 的**反截断 invariant**，tg 已覆盖且**应保留**（合法 retention 门）。
- 必需变更：把分组用例上限校准到压缩后真实体积（替换 raw summary + 分组本就有压缩），让上限真正卡在 < raw 的压缩比。

### F3 — `rtkCurlBehavior` 只测 JSON 透传，漏掉 RTK 截断压缩路径 【严重】
- `tests/unit/handlers/rtkCurlBehavior.test.ts`
- 问题：断言 `exact: rawOutput`（完整透传）+ `forbidden:[/\.\.\./]`（禁截断），并被 `rtkCommandHarness.ts:81 allowsRtkPassthrough` 白名单豁免反作弊。**非 wrong-green**——RTK 确实对 JSON 透传（`cloud/curl_cmd.rs:127 test_filter_curl_json_small_no_tee_hint`）；但它是零压缩路径。
- RTK：`curl_cmd.rs:141 test_filter_curl_long_output_truncated`（非 JSON + TTY + ≥`MAX_RESPONSE_SIZE=500`B → `...(N bytes total)` + tee hint）、`test_filter_curl_non_json`、`test_filter_curl_multibyte_boundary`、`test_filter_curl_exact_500_bytes`、pipe(2)。
- 必需变更：新增非 JSON 长输出截断用例（断言 500B 截断 + `bytes total` + tee-hint + UTF-8 边界）；保留 JSON-passthrough 用例作为 retention 门。

### F4 — grep green 全是 passthrough，压缩主路径无 green 行为门 【严重】
- `tests/unit/handlers/rtkGrepBehavior.test.ts`（3 条 `-L`/`-o`/`-Z`，全 `exact: rawOutput`，全白名单豁免）
- 问题：只 gate "尊重显式格式 flag = 透传"（合法 retention，对应 RTK `format_flag_ignores_normal_flags`）；grep 默认压缩路径（分组 / overflow）无 green 行为门，产品侧 `rg_many_matches` / `rg_default` 只断言关键字留存。
- RTK：`system/grep_cmd.rs`（23 tests）含 `:332 test_grep_overflow_uses_uncapped_total`、`parse_match_line_*`(6)、`clean_line_*`(3)、BRE `\|` 翻译、`-r` 剥离。
- 必需变更：新增默认 grep 大量匹配的分组 + overflow 压缩用例（overflow 计数用未截断总数）；6 个 parser / 3 个 clean-line invariant 落 unit test。

### F5 — `rtkGitPushBehavior` 只覆盖 happy-path，漏 RTK 5 维含 savings 【高】
- `tests/unit/handlers/rtkGitPushBehavior.test.ts`（exact "ok master"，provenance 已核 `git/git.rs:951/953`）
- RTK：`git.rs:2689 push_filter_drops_progress_phases`、`:2715 up_to_date_summary`、`:2723 passes_remote_messages_through`、`:2737 no_summary_on_failure`、`:2754 first_ref_wins_for_summary`、`:2765 **token_savings_on_verbose_output**`。
- 必需变更：补 up-to-date、失败不汇总、首 ref 取胜、远端消息透传、verbose savings 五个用例。

### F6 — `rtkDiffBehavior` 漏掉 overflow / 无截断 / 多文件压缩 invariant 【高】
- `tests/unit/handlers/rtkDiffBehavior.test.ts`（exact 单文件，provenance `git/diff_cmd.rs:173`）
- RTK：`diff_cmd.rs`（19 tests）含 `:370 condense_unified_diff_overflow_count_accuracy`、`:388 no_false_overflow`、`:400 no_truncation_large_diff`、`:330 condense_unified_diff_multiple_files`、`:442 long_lines_not_truncated`、`compute_diff_*`(6)、`similarity_*`(5)。
- 必需变更：补多文件、大 diff 不截断、overflow 计数准确性用例；`similarity` / `compute_diff` 纯函数落 unit test。

### F7 — `rtkFindBehavior` 只测 4 文件无溢出，漏 29 维含 cap 与 parser 【高】
- `tests/unit/handlers/rtkFindBehavior.test.ts`（exact "4F 3D:"，provenance `system/find_cmd.rs:314`）
- 问题：未触发 RTK cap / overflow。`find_cmd.rs` 实有 **29 个 `#[test]`**（测试函数名不以 `test_` 开头，易被漏数），大量是 parser/glob 不变量：`glob_match_*`、`parse_native_find_*`、`parse_rtk_syntax_*`，外加行为门 `find_respects_max`（cap）、`find_no_matches`、`find_gitignored_excluded`、`find_dotfile_pattern_includes_hidden`。tg 一个都没覆盖。
- 必需变更：补超过 `--max` 的溢出 `+N more`（源码 `find_cmd.rs:349`）、空结果、maxdepth、hidden/gitignore 用例；glob / parse 纯函数落 unit test。

### F8 — `rtkPytestBehavior` 漏 caps + tee-hint 【高】
- `tests/unit/handlers/rtkPytestBehavior.test.ts`（inline，`maxOutputChars: 320`）
- RTK：`python/pytest_cmd.rs`（9 tests）含 `:422 filter_pytest_xfail_caps_and_tee_hint`、`xfail_xpass`、`quiet_mode_failures`、`only_skipped`、`no_tests`、`all_pass`、`parse_summary_line`。
- 必需变更：补 xfail 截断 + tee hint、全过、无测试、仅跳过用例；用真实 `pytest_failed.txt` / `pytest_passed.txt` fixture 替换 inline。

### F9 — `rtkGitStatusBehavior` 的"压缩"只是剥掉 tg 自己的摘要头 【中】
- `tests/unit/handlers/rtkGitStatusBehavior.test.ts`（2 条，`maxOutputChars = rawOutput.length`）
- 问题：`forbidden:[/^Branch:/,/^Modified:/]` 禁的是 tg 自创摘要格式，本质是 porcelain 透传 retention，无压缩；对照 `git.rs` 75 tests 覆盖极薄。这两条仍是有效的 unicode / rename / conflict **留存门**，但不是压缩门。

### F10 — `rtkGitBranchBehavior` dedup 行为需核对 RTK provenance 【中】
- `tests/unit/handlers/rtkGitBranchBehavior.test.ts`（exact，去 `remotes/origin/` 前缀并去重，保留 `release/v2`）
- 问题：去重 + 前缀剥离的具体规则未在本审计中对照 RTK 源码确认。
- 必需变更：在用例上加 `// RTK: git.rs::<test>` 并核对去重 / 前缀规则一致。

### F11 — `fixtures.test.ts` / `rtkScriptParity` green 是 presence-only，非 parity 门 【信息】
- "fixture X exists" / "corpus ≥N samples" / "script 有 tg counterpart" / "暴露在 package.json" —— 纯存在性。按审计原则**不计为 parity 证据**。未过滤口径下 `fixtures.test.ts` 28 绿 + `rtkScriptParity` 13 绿 = 41 条，占 ~87 绿的近半，**稀释了 migration 绿信号**，易被误读为"已迁很多"。

### F12 — `fixtureRegressionDebt` 3 绿是合法 retention 回归门，但非压缩门 【信息】
- `tests/unit/handlers/fixtureRegressionDebt.test.ts`：留存路径 / 计数、禁 `0 modified...`——有效回归门，归类 Partial，不能当压缩 parity。

---

## Command / Domain 矩阵

| 命令/域 | green | 分级 | 理由 |
|---|---|---|---|
| vitest | 5 | **Hard** | exact compact + dumps→counts，provenance 全对 |
| pnpm | 5 | **Hard** | exact + cap-20 `… +N more` 真压缩门 |
| jest | 1 | **Hard** | exact compact block |
| tsc | 5 | **Hard(retention) / Partial(压缩)** | 分组 + 反截断 invariant 强；压缩上限 == raw（F2） |
| rustc runner | 1 | **Hard（域微小）** | RTK runner.rs 仅 1 test，passthrough，全覆盖 |
| eslint | 1 | Partial | JSON→摘要，cap 240 偏弱、无比率 |
| gradle | 1 | **Weak** | cap > raw，允许膨胀（F1） |
| curl | 1 | **Partial/Weak** | 仅 JSON 透传，漏截断（F3） |
| grep | 3 | **Partial/Weak** | 全 passthrough，漏默认压缩路径（F4） |
| find | 1 | Partial | 无溢出 cap，漏 parser（F7） |
| diff | 1 | Partial | 无多文件/大 diff/overflow（F6） |
| git push | 1 | Partial | 漏 5 维含 savings（F5） |
| git status | 2 | Partial | 透传 retention，无压缩（F9） |
| git branch | 1 | Partial（待核 provenance） | 单 case（F10） |
| fixtureRegressionDebt | 3 | Partial（retention 回归） | 无压缩（F12） |
| fixtures.test.ts | ~28 | **Weak/非门** | presence-only（F11） |
| rtkScriptParity | 13 | **Weak/非门** | presence-only（F11） |
| 其余 ~40 命令（aws/dotnet/cargo/gh/glab/rspec/ruff/mypy/…） | 0 green | **Missing** | 走 generic → 红，未迁 |

---

## 实施前必须修的最小阻断清单（Blocking fix list）

1. **复活压缩门**：在 RTK 有 `*_token_savings` 的命令上，按 RTK 同级比率启用 `minSavingsRatio`，或把 `maxOutputChars` 校准到压缩后体积。**先修 F1（gradle cap > raw）、F2（tsc cap == raw）**——"绿但零压缩证明"的两条铁证。
2. **迁移 RTK 明确的 cap / truncation / overflow 测试**：curl 截断（F3）、grep overflow（F4）、find `+N more`（F7）、pytest xfail caps + tee hint（F8）、diff no-truncation/overflow（F6）。
3. **git push 补 5 维含 verbose savings（F5）**；git status / branch 标 provenance 并核对（F9/F10）。
4. **把 presence-only 测试移出 migration parity 绿信号**（或报表明确不计为 parity），避免绿信号被稀释误读（F11）。
5. **provenance 收口**：所有仍用 inline 的 `rtk*Behavior` 补 `// RTK: …::<test>` 并优先改 fixture-backed。

---

## 未来 `pnpm test:migration` 全绿是否 = RTK 正确性 + 压缩？

**当前判据下：不能。** 即使今天全绿，也只证明：(a) 每命令 1 条 happy-path 的留存/格式；(b) 少数 `exact` 块的格式一致；(c) presence-only 文件存在。它**不会**证明 RTK 的压缩率、cap/overflow/truncation、savings，以及每命令数十个 `#[test]` 维度。

要让"migration 全绿 = parity"成立，先改判据：

1. 每个 RTK `*_token_savings` / cap / truncation / overflow `#[test]` 都有 tg 对应断言（比率或精确压缩 shape），而非绝对上限占位。
2. 把 `maxOutputChars` 占位（尤其 ≥ raw 的）替换为真实压缩约束。
3. presence-only / fixture-existence / scriptParity 移出 parity 门。
4. 每命令从 1 条扩到覆盖 RTK `#[test]` 行为维度（command behavior + parser/helper unit 分层），覆盖率可量化对账（RTK 956 维 vs tg 已覆盖维）。

---

## 修复进度（2026-06-05，blocking fix list 推进）

下列 finding 的"绿但零压缩 / 仅 happy-path"问题已修复——压缩门改为真实约束（token-savings 比率、cap < raw、cap/overflow/truncation 行为），并补齐 RTK `#[test]` 行为/纯函数维度。harness 新增 `minTokenSavingsRatio`（空白分词，精确镜像 RTK `count_tokens`），不再使用 ≥raw 的占位上限。

| Finding | 命令 | 修复 | 关键压缩门 |
|---|---|---|---|
| F1 | gradle | build-success/failure/warnings 三态；RTK `test_build_success_strips_task_lines` 等 | `minTokenSavingsRatio: 0.7`（RTK ≥70% 同级）+ warnings cap 185 < raw 197 |
| F2 | tsc | 分组用例 cap `1235`(==raw)→`1210`(<raw 1234) + 路径去重压缩断言 | cap < raw + 单文件路径仅出现一次 |
| F3 | curl | 新增 handler；JSON 透传 + 非 JSON 500B 截断 + UTF-8 边界 + exact-500 + tee hint | `... (N bytes total)` 截断 + recovery hint |
| F4 | grep | 默认分组 + overflow（未截断总数）+ parser/clean_line/compact_path/format-flag 单测 | `[+42 more]`（67-25）+ `minSavingsRatio 0.5` |
| F6 | diff | 多文件 + overflow 计数准确性(`+190 more`) + no-false-overflow + 不截断 + LCS 长行单测 | `... +{total-10} more` 用未截断总数 |
| F7 | find | cap 50 budget 截断 + `+N more`(未截断总数) + 空结果 `0 for '<pat>'` | `+18 more`(68-50) + `minSavingsRatio 0.5` |
| F5 | git push | up-to-date / 失败不汇总 / 首 ref 取胜 / 远端消息透传 / verbose savings 五维（RTK `run_push_filter` 测试）；git-push 入 `STRUCTURAL_HANDLERS` 修复 inflation 门吞掉 `ok` 摘要 | verbose `minTokenSavingsRatio: 0.6`（RTK ≥60%） |
| F8 | pytest | 重写为 RTK `build_pytest_summary`（产品对齐 RTK，见 format-conflicts 决策）；xfail caps + tee hint + 全过/无测试/quiet/parse_summary 维 | `Pytest: N passed[, M failed…]` + `… +5 more` cap + `minSavingsRatio 0.4` |

架构分歧（如实记录，非伪造 parity）：
- **grep**：RTK 用 `-0` NUL 分隔自行调用 rg，tg 过滤真实命令已产出的冒号分隔输出 → tg 用冒号 parser；NUL 专属边界（Windows 盘符、`:digits:` 文件名）不适用。无行号输入解析失败回退透传。
- **find**：RTK 自行遍历文件系统（glob_match/parse_native_find），tg 过滤真实 find 输出 → 这些 FS-walker 内部不在 tg，未移植为死代码；tg 覆盖输出压缩维（分组/cap/overflow/空消息）。
- **curl/pytest tee**：RTK `force_tee_hint` 写 tee 文件，tg recovery 通道为 `tg --raw`。

未做：
- **F9/F10 git status/branch**：未在本批次（provenance 标注 + dedup 规则核对）。
- 注：F5 git push 的实现修复在 `base.ts`（我方文件，新增 git-push 入 `STRUCTURAL_HANDLERS`）；测试纯增于 `rtkGitPushBehavior.test.ts`，未触碰本会话被并发编辑的 `src/handlers/git/extended.ts`（A2 git 子命令 + graphite）。

验证：`pnpm typecheck` 通过；`pnpm test:product` 14 files / 155 tests 全绿；上述 7 域 migration 46 tests 全绿。完整 migration 未过滤口径 161 passed / 43 failed（基线 87/44）——剩余红为未迁移域（aws/cargo/dotnet/wget/… + scriptParity），属真实 RTK gap，非回归。

在此之前，绿色只代表"当前实现能跑通自己写的 happy-path"，**不代表 RTK parity**。本结论与 [`missing-tests-rtk.md`](./missing-tests-rtk.md) 的完成判据方向一致——该 backlog 方向正确，但当前 green 集合远未达到它自己设定的标准。

---

## Codex 复审决策（2026-06-05，第二轮 P1）

Codex stop-time 复审提出两条 P1，均落在 `/goal` 的"遇 RTK 与 tg product intent 冲突 / 架构需大改时停下来问"决策区。已与用户确认处置：

### D1 — curl 失败路径双流保留是 tg 刻意分歧，移出 parity 套件
- **事实**：RTK `cloud/curl_cmd.rs:35-42` 失败时 `msg = stderr if non-empty else stdout`——stderr 非空即丢 stdout body。tg 故意两路都留（HTTP error body 常是 LLM 最需的诊断）。该分歧由 Codex 前两轮 review（#1 截断、#2 丢 body）推动产生。
- **问题**：原 `rtkCurlBehavior.test.ts` 的 dual-stream 用例断言的是 RTK **不会**输出的语义，却挂在 RTK parity 套件里——green 在此证明了一个非 RTK 行为。
- **决策（用户确认：保留分歧 + 移出 parity）**：`curl.ts` 实现不回退（继续两路保留）；该用例迁至新文件 `tests/unit/handlers/curlProductBehavior.test.ts`（登记进 `vitest.config.ts` 产品 include），明确标注为"tg product behavior, diverges from RTK"。`rtkCurlBehavior.test.ts` 仅保留 RTK 忠实用例（含单流失败用例——RTK 此时 `msg = stdout`，是忠实的）。parity 套件因此只证 RTK-faithful 语义。

### D2 — find 的 glob_match / parse_native_find 维度在 tg 正式 out-of-scope
- **事实**：RTK `system/find_cmd.rs:398+` 的 `glob_match_*` / `parse_native_find_*` 测的是 RTK **自行遍历文件系统**的 FS-walker。tg 架构是**过滤真实 `find` 命令的输出**——glob 匹配由 GNU find 完成，tg 自身没有这段逻辑。
- **问题**：`/goal` scope 点名了 "find … parser/glob invariants"，而我此前仅用一段测试注释把它判为 out-of-scope，属单方面缩小点名范围。两条出路中"映射成 tg CLI/integration 测试"不成立——那等于在测 GNU find 而非 tg。
- **决策（用户确认：正式 out-of-scope）**：glob/parser 维度在 tg 架构下不存在，正式记为 out-of-scope（本条即该决策的权威记录，从测试注释升格）。tg 对 find 的 parity 责任限于**输出压缩维**：分组、cap、`+N more`（未截断总数）、空消息——均已覆盖（F7）。`rtkFindBehavior.test.ts` 底部的架构注释保留并指向本决策。
