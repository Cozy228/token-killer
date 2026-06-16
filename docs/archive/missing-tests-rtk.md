> **进度更新（2026-06-05，命令批次迁移）** — 以下命令域已从 RTK 源忠实迁移，migration 行为测试与 product fixtureCase 双绿，handler 已注册并按 align-to-RTK 对齐格式：
> - **git 子命令**：`add`/`commit`/`pull`/`fetch`/`stash`/`worktree`（含 `filter_stash_list`、`filter_worktree_list` home 压缩、commit `ok <hash>`、pull/fetch 摘要）。失败回退路径由 product fixtureCase 守门（migration harness 不测 raw 透传）。
> - **git 平台**：`gh`（pr list / repo view + CAP_LIST 截断）、`glab`（mr list + cap）、`gt`（log 保留图节点去 email + cap、submit/sync/restack/create exact）。gh/glab 已改喂 JSON 并对齐 RTK `format_pr_list`/`format_mr_list`/`format_repo_view`；product `gh repo view`/`glab mr list` fixture 与断言同步对齐 RTK。
> - **system 核心**：`ls`（compact_ls 长列表解析）、`tree`（去 summary 留层级）、`read`（行窗 + 语言过滤，`read` 入 STRUCTURAL_HANDLERS）、`wc`、`json`、`env`（mask）、`log`、`pipe`、`format`。
> - **cloud/容器**：`aws`（CFN/EC2/S3/STS/Lambda/ECS 子集）、`psql`（table/expanded + overflow + token-savings ≥40%/≥60%）、`wget`、`docker`/`kubectl`（container.rs）。
> - **js**：`npm`、`prettier`、`next`、`playwright`、`prisma`（`eslint`/`tsc`/`vitest`/`pnpm` 早前已迁）。
>
> **每命令已覆盖的 RTK `#[test]` 维度与剩余 gap** 见各 `tests/unit/handlers/rtk*Behavior.test.ts` 顶部 `// RTK:` 注释。主要剩余 gap（均为真实 RTK 维度，非 setup 错误）：
> - `aws`：仅迁移 ~7 个 service formatter，余 RDS/Logs/DynamoDB/IAM/Secrets/EKS/SQS 等及 invalid-JSON edge 走 raw。
> - `pipe`：仅 grep/find 本地 wrapper + auto-detect；委派给其它命令模块的 filter 分支（cargo/pytest/go/tsc/...）未覆盖。
> - `gh`/`glab`：仅 list+repo view；pr view/checks/status、issue、run、ci trace、release 未迁。
> - `ls`/`json`/`env`：device-file/locale/schema/extension-reject 等纯函数维度部分未单测（passthrough/empty 经 harness 无法断言，由 product 守门）。
> - 失败/passthrough 维度：RTK 透传零压缩路径无法经 migration harness 断言，统一由 product fixtureCase 守留存。
>
> **仍红（migration）= 明确 out-of-scope 域**：cargo(rust)、go/golangci(go)、rake/rspec/rubocop(ruby)、dotnet*、ruff、npx/smart/summary/test/deps/err（其它非批次命令）、rtkScriptParity。
>
> ---

> **绿测试质量门（green ≠ 压缩门）** — 详见 [`green-test-parity-audit.md`](./green-test-parity-audit.md)（2026-06-05 审计）。
> 一条绿测试只有在同时 gate **RTK 关键留存 + RTK 压缩** 时才算 parity 硬门。
> 关键铁证：`maxOutputChars` 占位多数不证压缩——`rtkTscBehavior` cap `1235` == `tsc_many.txt` 字节数（只禁增长），
> `rtkGradleBehavior` cap `240` > fixture `198`（允许膨胀）；全套行为测试 `minSavingsRatio` 使用 0 次（死字段）。
> 下表 ✅ 仅表示"有对应 case"，**不等于压缩 parity**；标 `⚠️` 的行只有 happy-path，尤其需要补压缩/截断/边界。

## A. 测试面（全量 RTK 测试迁移缺口）

目标不是“够实现开工”，而是把 RTK 的命令行为、parser/helper、内部纯函数、路径检测、mask util、fallback、script/smoke 等测试维度全量迁到 tk。迁移时按 tk 的测试层级落位：

- **Command behavior**：用户可见 stdout/stderr/input → tk 输出的正确率、压缩率、格式、passthrough 语义。
- **Parser/helper unit**：mask、path compact、format detection、JSON fallback、match-line parsing、schema extraction 等内部正确性。
- **CLI/script/smoke**：真实 CLI 参数、脚本入口、安装/运行 smoke。

如果 tk 实现结构不同，不要求保留 RTK helper 名称；但 RTK `#[test]` 覆盖的行为或 invariant 必须有 tk 对应测试。

### A1. Provenance / fixture 可信

以下命令的合成 stdout 已对照 RTK 源码 inline test 验证一致性（2026-06-05 审查）：

| 命令 | RTK inline test | 验证点 |
|------|----------------|--------|
| pytest | `test_filter_pytest_with_failures` | failure+summary 输出片段一致 |
| vitest | `test_vitest_parser_json` | JSON 结构匹配 `VitestJsonOutput` struct |
| pip | `test_filter_pip_list` | `[{name, version}]` JSON 格式一致 |
| aws | `test_filter_cfn_describe_stacks` | `{Stacks: [{StackName, StackStatus}]}` 结构一致 |
| eslint | `lint_cmd.rs` `EslintResult` struct | `[{filePath, messages: [{ruleId, severity}]}]` 匹配 |
| vitest exact | `TestResult::format_compact()` | 逐行匹配 `PASS (12) FAIL (1)\n\n1. ...` |

- [ ] 所有仍用 `filterRtkOutput` 内联的 `rtk*Behavior`，在 case 上补 `// RTK: rtk/src/cmds/...::test_...`
- [ ] **优先改成 fixture-backed case**：
  - `rtkTscBehavior` ↔ 已有 `tests/fixtures/js/tsc_many.txt`
  - `rtkPytestBehavior` ↔ `pytest_failed.txt` / `pytest_passed.txt`
  - `rtkEslintBehavior` ↔ `eslint_many.txt`
  - `rtkJestBehavior` ↔ `jest_failed.txt`
- [ ] 已校过的 pip / prettier / kubectl / git push：补一行 provenance 即可

### A2. Migration 缺文件、product 有的 git 子命令

只在 `fixtureCases`，没有 `rtk*Behavior`（若只盯当前 migration glob 会漏）：

- [ ] `rtkGitAddBehavior` — fixture `add_missing_path.txt`（fixtureCases L232-238）
- [ ] `rtkGitCommitBehavior` — fixture `commit_dry_run_dirty.txt`（fixtureCases L240-249）
- [ ] `rtkGitPullBehavior` — fixture `pull_unstaged_changes.txt`（fixtureCases L258-265）
- [ ] `rtkGitFetchBehavior` — fixture `fetch_missing_remote.txt`（fixtureCases L268-275）
- [ ] `rtkGitStashBehavior` — fixture `stash_invalid_ref.txt`（fixtureCases L278-284）
- [ ] `rtkGitWorktreeBehavior` — fixture `worktree_list.txt`（fixtureCases L287-291）

每条至少 1 个 RTK 形态断言（`exact` 或 `critical`+`forbidden`），与 product case 同 fixture。

RTK 源文件：git 相关 inline test 主要在 `rtk/src/cmds/git/git.rs`（75+ tests）、`gh_cmd.rs`（66）、`glab_cmd.rs`（62）、`gt_cmd.rs`（26）、`diff_cmd.rs`（19）。

### A3. Product ↔ migration 标准不一致

| 命令 | Product 现在 | Migration 目标 | 建议 |
|------|--------------|----------------|------|
| vitest | 文本 fixture；passed 要 `PASS (4) FAIL (0)` | JSON + `exact` 多行 | migration 补 regex fallback / passthrough / pnpm prefix case |
| tsc | 保留原始 `file(line,col): error` | 分组 + 去 `Found N errors` | migration 改用 `tsc_many.txt` fixture |
| jest | `JS tests failed` / Summary 风格 | 核对 `rtkJestBehavior` exact | 确认两轨是否故意不同 |
| pnpm list | `fixtureCases` deps 段落格式 | `rtkPnpmBehavior` `exact` 块 | 以 migration `exact` 为准 |

---

### A4. 逐命令 RTK→tk 测试缺口（目标：每个 RTK `#[test]` 维度有 tk 对应测试）

> 以下 ✅ = 当前 tk 测试已覆盖该维度，⬜ = 需新增。
> RTK 计数来自 `grep -c '#\[test\]' rtk/src/cmds/...`。
> 迁移目标是全量覆盖 RTK `#[test]` 维度；parser/helper/internal utility 测试应落到 unit test，不必强行塞进 command behavior test。

#### system utilities

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `ls.rs` | 29 | 1 case | ⬜ symlink、device files、空格路径、noise dirs、小输出 passthrough 等 29 个维度 |
| `find_cmd.rs` | 29 | 1 case ⚠️ | ⬜ 仅 4 文件无溢出 happy-path；缺 `find_respects_max`(+N more)、`find_no_matches`、`find_gitignored_excluded`、hidden/dotfile、`glob_match_*`/`parse_native_find_*` parser 维 |
| `tree.rs` | 6 | 1 fixture | ⬜ empty、trailing lines、summary variations、noise_dirs_constant |
| `read.rs` | 8 | 1 case | ⬜ stdin、tail window、multi-file、binary skip、locale chars |
| `grep_cmd.rs` | 23 | 3 behavior + 6 fixture | ⬜ BRE `\|` 翻译、`-r` 剥离、overflow uncapped total、`parse_match_line_*`(6 条)、`rg_no_ignore_vcs`、`format_flag_ignores_normal_flags`、`clean_line_*`(3 条) |
| `log_cmd.rs` | 3 | 1 case | ⬜ 需对照 RTK 验证合成 stdout 后补足 3 个维度 |
| `json_cmd.rs` | 10 | 1 case | ⬜ `toml_file_rejected`、`cargo_toml_suggests_deps`、`yaml_file_rejected`、`json_file_accepted`、`unknown_extension_accepted`、`no_extension_accepted`、`extract_schema_*`(2)、`compact_truncates_*`(2) |
| `env_cmd.rs` | 12 | 1 case | ⬜ `mask_value_*`(4)、`is_lang_var_*`(2)、`is_cloud_var_*`(2)、`is_tool_var`、`is_interesting_var_*`(2)、`sensitive_patterns` |
| `wc_cmd.rs` | 15 | 1 fixture | ⬜ `lines_only`、`words_only`、`stdin_*`(2)、`multi_file_*`(2)、`detect_mode_*`(4)、`common_prefix`、`no_common_prefix`、`deep_common_prefix`、`empty` |
| `format_cmd.rs` | 7 | 1 case | ⬜ 当前只测 prettier。需补 ruff format、cargo fmt 等 dispatcher 路径 |
| `pipe_cmd.rs` | 38 | 1 case | ⬜ 全部 38 个维度 |
| `local_llm.rs` | 3 | 1 case | ⬜ 全部 3 个维度（manifest 声称 2，实际 3） |

#### cloud

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `aws_cmd.rs` | 82 | 1 case | ⬜ STS(4)、EC2(7)、S3(6)、ECS(3)、RDS(1)、Lambda(6)、IAM(4)、DynamoDB(10)、Logs(6)、EKS(1)、SQS(1)、Secrets(2)、snapshots(5)、empty edge(7)、invalid JSON(7) |
| `container.rs` | 17 | 1 case | ⬜ compose logs、compose build、kubectl pods、kubectl services、output flag、compact_ports、empty cases |
| `curl_cmd.rs` | 11 | 1 case ⚠️ | ⬜ 仅测 JSON 透传（零压缩路径）；缺 `non_json`、`long_output_truncated`(500B+tee hint)、`multibyte_boundary`、`exact_500_bytes`、`large_json_*`(3)、`pipe_*`(2) |
| `psql_cmd.rs` | 18 | 1 case | ⬜ expanded 格式、format 检测(4)、overflow(2)、row count 剥离(2)、token savings(2)、passthrough |
| `wget_cmd.rs` | 17 | 1 case | ⬜ URL compact(3)、size 格式化(4)、error 解析(4)、行截断(3)、文件名提取(2) |

#### js ecosystem

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `npm_cmd.rs` | 3 | 1 case | ⬜ 全部 3 个维度 |
| `pnpm_cmd.rs` | 8 | 1 case | ⬜ `outdated_parser_json`、`passthrough_accepts_args`、`cap_shows_hint_with_offset`、`no_cap_when_prod_only`、`no_cap_when_dev_only`、`extract_list_text` |
| `lint_cmd.rs` | 15 | 1 case | ⬜ `pylint_*`(2)、`compact_path`、`strip_pm_prefix_*`(5)、`detect_linter_*`(5)、`is_python_linter` |
| `tsc_cmd.rs` | 8 | 1 case | ⬜ `every_error_message_shown`、`continuation_lines_preserved`、`no_file_limit`、`filter_no_errors`、`tsc_stream_*`(3) |
| `vitest_cmd.rs` | 7 | 1 case | ⬜ `regex_fallback`、`passthrough`、`with_pnpm_prefix`、`with_dotenv_prefix`、`with_nested_json` |
| `prettier_cmd.rs` | 5 | 1 case | ⬜ `all_formatted`、`many_files`、`empty_output`、`whitespace_only_output` |
| `next_cmd.rs` | 2 | 1 case | ⬜ `extract_time` |
| `playwright_cmd.rs` | 5 | 1 case | ⬜ `json_float_duration`、`regex_fallback`、`passthrough` |
| `prisma_cmd.rs` | 3 | 1 case | ⬜ `filter_generate`、`filter_migrate_dev`、`extract_number` |

#### python

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `pytest_cmd.rs` | 9 | 1 behavior + 2 fixture | ⬜ `xfail_caps_and_tee_hint`、`xfail_xpass`、`quiet_mode_failures`、`only_skipped`、`no_tests`、`all_pass`、`parse_summary_line` |
| `ruff_cmd.rs` | 6 | 1 case | ⬜ `check_no_issues`、`format_all_formatted`、`format_needs_formatting`、`caps_violations_and_emits_hint`、`compact_path` |
| `mypy_cmd.rs` | 9 | 1 case | ⬜ `with_column_numbers`、`top_codes_summary`、`single_code_no_summary`、`every_error_shown`、`note_continuation`、`fileless_errors`、`no_errors`、`no_file_limit` |
| `pip_cmd.rs` | 4 | 1 case | ⬜ `list_empty`、`outdated_none`、`outdated_some` |

#### jvm

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `gradlew_cmd.rs` | 56 | 1 case ⚠️ | ⬜ `maxOutputChars:240` > fixture 198B（cap 失真，允许膨胀）；缺 `test_build_token_savings`(≥70%) 等 5 个 savings 测试；corpus 已有 `gradlew_test_*`/`build_*`/`lint_*`/`connected_*` fixture，需逐条 behavior case |

#### dotnet

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `dotnet_cmd.rs` | 66 | 1 case | ⬜ 全部 66 个维度 |
| `binlog.rs` | 28 | 1 case | ⬜ 全部 28 个维度 |
| `dotnet_trx.rs` | 11 | 1 case | ⬜ 全部 11 个维度 |
| `dotnet_format_report.rs` | 3 | 1 case | ⬜ 全部 3 个维度 |

#### git

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `gh_cmd.rs` | 66 | 1 case | ⬜ pr list/view/checks、issue list/view、release、ci、workflow 等 66 个维度 |
| `glab_cmd.rs` | 62 | 1 case | ⬜ 全部 62 个维度（fixtures 已 port） |
| `gt_cmd.rs` | 26 | 1 case | ⬜ 全部 26 个维度 |
| `diff_cmd.rs` | 19 | 1 case ⚠️ | ⬜ 仅单文件无溢出；缺 `condense_unified_diff_multiple_files`、`overflow_count_accuracy`、`no_false_overflow`、`no_truncation_large_diff`、`long_lines_not_truncated`、`similarity_*`(5)、`compute_diff_*`(6) |
| `git.rs` | 75+ | 部分 fixture-backed | ⬜ add/commit/pull/fetch/stash/worktree 缺 behavior 文件（见 A2）。已有 behavior 的（status/log/branch/push）需对照 RTK `#[test]` 补足 |
| `git status` (repo) | — | 2 cases ✅ | ⬜ `fixtureRegressionDebt` 的 3 条 + `--short --branch` vs `--porcelain -b` 统一 |

#### go / rust / ruby

| 文件 | RTK | 现状 | 需补的 RTK `#[test]` 维度 |
|------|-----|------|---------------------------|
| `go_cmd.rs` | 25 | 1 case | ⬜ 全部 25 个维度 |
| `golangci_cmd.rs` | 23 | 1 case | ⬜ 全部 23 个维度（fixture 已 port） |
| `cargo_cmd.rs` | 48 | 1 case | ⬜ 全部 48 个维度 |
| `runner.rs` | 1 | 1 case ✅ | 全覆盖 |
| `rake_cmd.rs` | 19 | 1 case | ⬜ 全部 19 个维度 |
| `rspec_cmd.rs` | 28 | 1 case | ⬜ 全部 28 个维度 |
| `rubocop_cmd.rs` | 18 | 1 case | ⬜ 全部 18 个维度 |

> ⚠️ `local_llm.rs`：`rtkParityManifest.ts` 声称 2 tests，实际 3——偏差 1。

### A5. Script parity（`rtkScriptParity` 仍红）

- [ ] `scripts/benchmark/run.ts`
- [ ] `scripts/benchmark/rebuild.ts`
- [ ] `scripts/benchmark/cleanup.ts`
- [ ] `scripts/benchmark-sessions/lib/runner.py`
- [ ] `scripts/test-ruby.sh`

---

## B. 实现面

### B1. 新 handler（无专用路由，现走 generic → `assertNotUnfilteredPassthrough` 报红）

- [ ] system：`log`, `json`, `env`, `wc`, `format`, `pipe`, `smart`/local-llm
- [ ] cloud：`aws`, `curl`, `psql`, `wget`, `docker`, `kubectl`
- [ ] js：`prettier`, `next`, `playwright`, `prisma`
- [ ] go：`go`, `golangci-lint`
- [ ] rust：`cargo`, `rustc`/runner
- [ ] ruby：`rake`, `rspec`, `rubocop`
- [ ] dotnet：`dotnet`, `binlog`, `trx`, `format`
- [ ] git：`gt`
- [ ] 其它：`rtkTestBehavior`, `rtkSummaryBehavior`, `rtkErrBehavior`, `rtkDepsBehavior`, `rtkNpxBehavior`

### B2. 已有 handler，migration 要求更贴近 RTK

- [ ] **tsc** — 分组摘要、去 `Found N errors`
- [ ] **vitest JSON** — `PASS (n) FAIL (m)` + 编号失败块；兼容 product 文本路径
- [ ] **wc / wget / log / json / env / tree** — 现多 passthrough 或未压缩
- [ ] **package-list / pnpm / npm** — migration `exact` 与 product deps 格式统一
- [ ] **git push** — migration `exact` 与 handler 对齐
- [ ] **gradle** — 已用真实 fixture，核对是否已绿

### B3. `fixtureRegressionDebt`（3 条）

- [ ] `git status --short` — 保留路径，不要 `0 modified...`
- [ ] `git status --porcelain -b` — 保留分支名 + 路径，不要 `Branch: unknown`
- [ ] `git diff --stat` — 保留文件数/insertions，不要 `Files changed: 0`

---

## C. 不作为完成条件

- [ ] ~~`docs/phase-2-gap-report.md`~~
- [ ] ~~`rtkDomainCaseParity` / `registeredHandlerCoverage` 放回 migration gate~~
- [ ] ~~无来源的全库统一 `minSavingsRatio` 门槛~~；但 RTK 明确验证压缩/截断/上限的 case 必须迁移
- [ ] ~~`projectConfig` / validate-docs 当迁移完成条件~~

---

## 建议执行顺序

1. **A2** — 补 git 的 6 个 `rtkGit*Behavior`（fixture 已有，写 behavior 断言即可）
2. **A1** — provenance 标注 + fixture 绑定，后续新增 case 同步标 RTK 来源
3. **A4** — 全量迁移 RTK `#[test]` 维度：command behavior + parser/helper unit 分层落位
4. **B3** — regression debt（小，已实现域）
5. **B2** — tsc / vitest / pnpm / git push（高频 + 双轨冲突）
6. **B1** — 按 domain 批量新 handler（每个 migration behavior 文件当 spec）
7. **A5** — 脚本迁移

**测试迁移完成判据：** RTK `#[test]` 维度都有 tk 对应测试；新增红测均代表真实 RTK 正确率、压缩率、格式、fallback、passthrough 或 script parity gap。

**整体迁移完成判据：** `pnpm test:product` + `pnpm test:migration` 全绿，红绿代表 RTK 压缩率和正确率差距。
