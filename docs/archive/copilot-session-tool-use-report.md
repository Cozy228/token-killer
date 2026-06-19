# Session-state 命令执行与 Tool Use 统计报告

* 扫描目录：C:\Users\.copilot\session-state
* 会话目录总数：**173**
* 含 events.jsonl 的会话数：**118**
* 扫描到的 tool 调用总数 (tool.execution_start)：**16248**
* 扫描到的 tool 完成事件 (tool.execution_complete)：**16186**
* 含 command 参数的工具类型：**powershell**

## 统计口径

1. 以每个会话目录中的 events.jsonl 为原始数据源。没有 events.jsonl 的会话不纳入统计。
2. tool.execution_start 用于统计调用频次和输入长度；tool.execution_complete 用于统计输出长度与成功次数。
3. 输入长度 = arguments JSON 序列化后的字符数；输出长度 = result.content 的字符数，若为空则回退到 detailedContent 或整个 result JSON。
4. “命令执行”按工具参数里的 command 字段聚合，因此主要覆盖 powershell 一类可执行命令的工具。
5. 命令展示文本已做基础脱敏；表中的长度统计仍基于原始事件值计算。

## 概览

| 指标 | 值 |
|---|---|
| 会话目录总数 | 173 |
| 含事件流的会话数 | 118 |
| 工具调用总数 | 16248 |
| 工具类型数 | 40 |
| 命令工具类型数 | 1 |
| 唯一命令数 | 1529 |

## Tool 使用频率与占比

| Tool | Count | Share | Completed | Success | Avg Input Len | Avg Output Len | Max Input Len | Max Output Len |
|---|---|---|---|---|---|---|---|---|
| view | 5972 | 36.76% | 5951 | 5870 | 104.3 | 3600.2 | 229 | 24408 |
| report_intent | 1919 | 11.81% | 1917 | 1917 | 37.3 | 13.0 | 71 | 13 |
| powershell | 1754 | 10.80% | 1737 | 1591 | 442.7 | 1259.7 | 22936 | 19971 |
| edit | 1620 | 9.97% | 1609 | 1556 | 1913.8 | 95.7 | 72537 | 167 |
| web_fetch | 738 | 4.54% | 738 | 610 | 99.7 | 6106.3 | 222 | 20304 |
| grep | 672 | 4.14% | 671 | 645 | 172.8 | 1113.4 | 2516 | 17737 |
| rg | 583 | 3.59% | 582 | 556 | 266.8 | 2728.3 | 1092 | 20021 |
| glob | 471 | 2.90% | 470 | 437 | 85.7 | 530.8 | 399 | 18216 |
| sql | 389 | 2.39% | 389 | 389 | 333.5 | 172.3 | 2934 | 14585 |
| ask_user | 361 | 2.22% | 359 | 356 | 613.0 | 98.3 | 3271 | 3107 |
| github-mcp-server-get_file_contents | 295 | 1.82% | 293 | 277 | 83.1 | 4445.6 | 205 | 19217 |
| apply_patch | 290 | 1.78% | 290 | 271 | 4907.0 | 183.9 | 69572 | 2031 |
| create | 223 | 1.37% | 223 | 219 | 4631.7 | 109.4 | 77209 | 179 |
| task | 172 | 1.06% | 168 | 165 | 3021.8 | 2027.3 | 36126 | 19758 |
| read_agent | 151 | 0.93% | 151 | 147 | 57.7 | 2301.2 | 92 | 18308 |
| skill | 135 | 0.83% | 135 | 129 | 28.5 | 90.2 | 45 | 107 |
| github-mcp-server-search_code | 118 | 0.73% | 118 | 113 | 97.4 | 1966.0 | 194 | 19458 |
| read_powershell | 82 | 0.50% | 82 | 69 | 31.5 | 1699.5 | 43 | 13998 |
| github-mcp-server-search_repositories | 71 | 0.44% | 71 | 70 | 79.8 | 1440.3 | 119 | 8719 |
| task_complete | 65 | 0.40% | 65 | 65 | 703.9 | 674.1 | 2714 | 2608 |
| stop_powershell | 33 | 0.20% | 33 | 33 | 18.2 | 30.2 | 29 | 41 |
| ide-get_diagnostics | 30 | 0.18% | 30 | 28 | 67.6 | 92.2 | 106 | 844 |
| write_agent | 19 | 0.12% | 19 | 18 | 795.3 | 95.5 | 1478 | 104 |
| github-mcp-server-search_issues | 17 | 0.10% | 17 | 16 | 103.7 | 1540.1 | 138 | 11140 |
| typescript-check | 2 | 0.01% | 2 | 0 | 0.11% | - | - | Direct TypeScript compiler calls not caught by package-tool classification. |
| github-mcp-server-search_pull_requests | 1 | 0.01% | 1 | 0 | 89.0 | - | 89 | - |

## 含 command 参数的工具汇总

| Tool | Unique Commands | Count | Share |
|---|---|---|---|
| powershell | 1529 | 1754 | 10.80% |

## Powershell 具体命令分析（替代原命令频率明细）

powershell 不是抽象标签；它在事件里记录了真实的 arguments.command 文本，因此这里分析的是 **PowerShell 工具实际执行过的具体命令**。

| 指标 | 值 |
|---|---|
| Powershell 总执行次数 | 1754 |
| 唯一命令数 | 1529 |
| 只出现 1 次的唯一命令数 | 1413 |
| 重复出现的唯一命令数 | 116 |
| 重复命令合计执行次数 | 341 |

### 命令家族分布

| Family | Count | Share in Powershell | Interpretation |
|---|---|---|---|
| git | 610 | 34.78% | Run version-control actions such as status, diff, commit, log, checkout. |
| filesystem-inspection | 384 | 21.89% | Inspect files, paths, caches, generated output, and grep-like lookups. |
| js-package-tooling | 321 | 18.30% | Run pnpm/npm/npx workflows for typecheck, test, lint, dev, install. |
| other | 101 | 5.76% | Mixed orchestration commands such as Start-Process wrappers and custom flows. |
| test-runner | 81 | 4.62% | Execute direct test runners across JS, Python, and Terraform. |
| terraform | 70 | 3.99% | Run terraform init/plan/fmt and related IaC validation commands. |
| python | 64 | 3.65% | Run ad-hoc Python scripts for extraction, patching, and quick analysis. |
| filesystem-mutation | 51 | 2.91% | Create, rename, copy, extract, or delete files and directories. |
| node | 36 | 2.05% | Run ad-hoc Node.js scripts for dependency or source inspection. |
| network-check | 20 | 1.14% | Probe local or remote HTTP endpoints and fetch remote assets. |

### 高频子类（保留模式，不展开全部原始命令）

| Family | Subcategory | Count | Share | Example |
|---|---|---|---|---|
| filesystem-inspection | file search/read | 377 | 21.49% | Get-ChildItem "C:\Users\e631495\AWSF\atlas\portal\node_modules@tabler\icons-react" -File |
| git | git diff | 177 | 10.09% | git --no-pager diff HEAD --name-status |
| git | git commit | 141 | 8.04% | git add portal/vite.config.ts; git commit -m "perf(portal): add optimizeDeps, server.warmup, and resolve.extensions - Add op... |
| git | git status | 128 | 7.30% | git status --short |
| js-package-tooling | other | 104 | 5.93% | pnpm test 2>&1 |
| other | other | 101 | 5.76% | $startTime = Get-Date; $proc = Start-Process -FilePath "node" -ArgumentList "node_modules/.bin/vite", "dev", "--port", "5199"... |
| js-package-tooling | TypeScript typecheck | 86 | 4.90% | npx tsc --noEmit 2>&1 |
| git | git other | 70 | 3.99% | git stash "stashed" |
| python | Python script | 63 | 3.59% | python -c "content = open(r'C:\Users\e631495\AWSF\afp_terraform-aws-api-gateway\variables.tf', 'r').read(); content = conte... |
| git | git log | 58 | 3.31% | git --no-pager log --all -S "S3 bucket name must be 3-63 characters" --oneline |
| filesystem-mutation | file write/delete | 51 | 2.91% | Remove-Item "node_modules.wite" -Recurse -Force -ErrorAction SilentlyContinue; "cache cleared" |
| test-runner | terraform test | 45 | 2.57% | terraform test -filter="unit.tftest.hcl" 2>&1 |

### 解读

1. **powershell** 的主体工作不是写大型 PowerShell 脚本，而是把 **git、pnpm、npx、terraform、python、node** 等具体命令统一放线下一执行通道。
2. Git 与文件检查合计占比最高，说明当前会话历史里，代理行为更偏向“看状态 / 看差异 / 看文件 / 做排查”，而不是持续运行单一业务脚本。
3. 唯一命令数很高、一次性命令很多，说明这些命令绝大多数是围绕具体上下文临时拼接出来的，而不是固定脚本反复复用。
4. JS/TS 工具链、测试、Terraform、Python/Node 临时脚本共同构成第二层工作负载，说明 **powershell** 更像工程编排层，而不是主要业务执行层。

## 事件类型分布（辅助参考）

| Event Type | Count |
|---|---|
| tool.execution_start | 16248 |
| tool.execution_complete | 16186 |
| hook.start | 9803 |
| hook.end | 9803 |
| assistant.message | 8875 |
| assistant.turn_start | 7127 |
| assistant.turn_end | 7043 |
| user.message | 960 |
| system.message | 585 |
| permission.requested | 251 |
| permission.completed | 250 |
| subagent.started | 188 |
| subagent.completed | 176 |
| skill.invoked | 129 |
| session.start | 118 |
| system.notification | 118 |
| abort | 118 |
| session.shutdown | 107 |
| session.mode_changed | 95 |
| session.model_change | 69 |
| session.task_complete | 65 |
| session.info | 49 |

* 最常用工具是 **view**，共 **5972** 次，占全部 tool 调用的 **36.76%**。
* powershell 记录的是实际执行命令，不是抽象分类；当前历史更像统一执行壳，主要承载 Git、文件检查、工程验证和临时脚本。
* 在 powershell 内部，最大命令家族是 **git**，共 **610** 次，占 powershell 执行的 **34.78%**。
* 有 **55** 个会话目录缺少 events.jsonl，因此这些目录未参与频率与长度计算。

# VS Code workspaceStorage 全量 Session 分析

* 扫描目录：C:\Users\AppData\Roaming\Code\User\workspaceStorage
* workspace 目录数：**77**
* chatSessions/*.jsonl 文件数：**162**
* GitHub.copilot-chat/transcripts/*.jsonl 文件数：**40**
* 带 customTitle 的 session 数：**77**

## 统计口径

1. chatSessions/*.jsonl 用来读取会话标题、面板状态和 sessionId。
2. GitHub.copilot-chat/transcripts/*.jsonl 用来统计 agent 工具调用工作流；只有 transcript 里有 tool.execution_start / tool.execution_complete。
3. 因此，“会话总数”和“可分析 agent workflow 的 transcript 数”不是同一个数字。
4. 本节分析的是 **workspaceStorage** 全量，不是单个 workspace hash。

## 概览

| 指标 | 值 |
|---|---|
| workspace 目录数 | 77 |
| chat session 文件数 | 162 |
| transcript 文件数 | 40 |
| transcript 中 tool.execution_start 总数 | 1194 |

## 按 Tool Use 分布

| Tool | Count | Share |
|---|---|---|
| run_in_terminal | 378 | 31.66% |
| read_file | 373 | 31.24% |
| grep_search | 96 | 8.04% |
| list_dir | 91 | 7.62% |
| file_search | 58 | 4.86% |
| manage_todo_list | 47 | 3.94% |
| apply_patch | 35 | 2.93% |
| replace_string_in_file | 32 | 2.68% |
| create_file | 26 | 2.18% |
| fetch_webpage | 13 | 1.09% |
| get_errors | 10 | 0.84% |
| memory | 10 | 0.84% |
| multi_replace_string_in_file | 6 | 0.50% |
| execution_subagent | 5 | 0.42% |
| runSubagent | 3 | 0.25% |

### 关键结论

1. VS Code 这边应投 **tool 本身** 理解工作流：例如 run_in_terminal、read_file、grep_search、list_dir、apply_patch。
2. read_file、grep_search、list_dir、apply_patch、replace_string_in_file、create_file、get_errors 这些都是 **direct-tool**。
3. run_in_terminal 是命令执行入口；git / nodejs / 其他 shell 命令在这批 transcript 里全都通过它执行。
4. 这批 workspaceStorage transcript 中 powershell **tool 计数为 0**，没有观察到先调 powershell tool 再传命令的“主流模式”。

## Transcript 事件类型分布

| Event Type | Count |
|---|---|
| tool.execution_start | 1194 |
| tool.execution_complete | 1194 |
| assistant.turn_start | 952 |
| assistant.turn_end | 942 |
| assistant.message | 929 |
| user.message | 135 |
| session.start | 40 |

## 结论

* 在 VS Code workspaceStorage 全量 transcript 中，tool 调用总数为 **1194**，其中 **816** 次是 direct tool，**378** 次是经 terminal 间接执行。
* 你关心的几类 workflow 里：read-like / list-like / search-like / language-like / edit-like 都以 direct tool 为主；git-related / nodejs-related 以 terminal 转发 raw command 为主。
* 在这批 VS Code transcript 里，**没有观察到通过 powershell tool 再传入命令执行**的流模式；如果要类似 CLI 架构，更接近“专用工具 + terminal fallback”而不是“统一 PowerShell 壳”。
