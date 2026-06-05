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
- **`tg config init`** — 用户级配置初始化，生成 Token Guard JSONC 配置，不隐式修改项目仓库。
- **Hook system** — pretool / posttool / prompt 三类 hook，在 Copilot 工具调用链中拦截、建议、改写或阻断高成本操作。
- **Skills optimizer** — 扫描用户级 agent skills，识别 token 浪费，生成优化建议或用户级优化 diff。
- **AGENTS.md patcher** — 向用户级 agent 指令文件追加短 token budget 指示，带标记可恢复。
- **Report & history** — 持久化每次执行的原始/压缩 token 数据，提供汇总报告。
- **Inspect** — 扫描 Copilot 会话历史、工具调用和本地证据，找出遗漏的 token 节省机会。
- **Advice generation** — 分析重复浪费模式，生成 CLI、hook 和用户级规则建议。

`tg` 的配置和默认写入只支持用户级作用域。项目仓库默认不被写入配置、rules、hooks 或 filters；history 与 raw output 写入 `~/.token-guard/projects/<fingerprint>/`（按工作目录 fingerprint 分组）。需要对项目文件给出建议时，`tg` 输出可审查的建议或 diff，由用户自行决定是否应用。

### Implementation status

| Capability | Status | Code / notes |
|------------|--------|----------------|
| Command proxy (`tg <command>`) | **shipped** | `src/cli.ts`, `src/handlers/*`, `src/core/pipeline.ts` |
| Report & history | **shipped** | `src/core/history.ts`, `src/core/report.ts`, `src/core/dataDir.ts` |
| `tg config init` | planned | — |
| Hook system | planned | §3；rewrite 规则见 §3.8 |
| Skills optimizer | planned | §4 |
| AGENTS.md patcher | planned | §5 |
| Inspect | planned | §9 |
| Advice generation | planned | §10 |

默认不做：

- 不替换用户已有 Copilot 入口。
- 不覆盖用户已有 agent 或 skill。
- 不承诺托管 Copilot 会话内完全透明切模型。
- 暂不实现 Claude Code subagent 路由或 AI Gateway 真路由。
- 不把旧命令输出、semantic similarity 或本地 cache 当成 fresh evidence。
- 不把 raw evidence telemetry 化；默认只保留本地恢复和聚合指标。

### Compression Plane Overview

Token Guard 的长期架构可以看成一个 compression plane：不同来源的 evidence 先进入 source-specific adapter，再经过 output compressor 或 input cache optimizer，最后由 delivery policy 决定 agent 能看到什么。V1 的强合同仍是 command proxy 和 quality gate；direct tool、prompt cache 和 recovery lineage 是后续层，不改变 V1 默认输出行为。

```text
Shell commands      ───┐
Direct tool events  ───┼─> Source adapters ─> Output compressor ─┐
Prompt / context    ───┘                                         │
                                                                  ├─> Delivery policy ─> Model / agent
Stable inputs ───────────────────────> Input cache optimizer ─────┘

Raw evidence ────────────────────────> Local recovery store
Metrics      ────────────────────────> Inspect / reports / explicit export
```

| Source family | Token Guard surface | Current / future role |
|---------------|---------------------|------------------------|
| Shell commands | `tg <command>` | V1 主路径；RTK-style command-aware filtering |
| Terminal tool events | `tg hook pretool/posttool` | Future Layer 2；rewrite terminal commands or filter terminal output |
| Direct tool events | `tg hook pretool/posttool` | Future Layer 2；policy + tool-level projection, not shell rewrite |
| Prompt / context | `tg hook prompt`、Layer 3 diagnostics | Future Layer 3；diagnose stable prefix and volatile suffix behavior |
| Raw evidence | `rawStore`、history | Recovery and measurement only; not a model-token cache |

Design principles inherited from RTK:

- Command-aware filtering beats generic summarization.
- Deterministic parsing and grouping run before semantic summaries.
- Failure output needs local raw recovery.
- Savings, fallback, parse failure and reopen behavior must be measurable.
- Shell rewrites are useful but incomplete; direct tools and prompt assembly need separate governance.

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
tg --max-lines 200 <command...>  # 待实现
tg --max-chars 12000 <command...> # 待实现
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
                  ├─ history          # 写入用户级 history
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
| Output limit | `src/core/outputLimit.ts` | 待实现；`--max-lines` / `--max-chars` 保留 CLI 接口，实现后由支持该语义的 handler 执行行/字符裁剪 |
| Data dir | `src/core/dataDir.ts` | `~/.token-guard/` 根目录、按 cwd 的 `projectFingerprint`、`history` / `raw` 路径 |
| History | `src/core/history.ts` | JSONL 追加写入 `~/.token-guard/projects/<fingerprint>/history.jsonl` |
| Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `~/.token-guard/projects/<fingerprint>/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
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

只有 **`tg read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）。`cat`、`type`、`less` 以及未指定 level 的 `read` 对大文件也 passthrough 全文。

#### `read --level`（仅 `tg read`）

| Level | 别名 | 行为 |
|-------|------|------|
| `minimal` | — | 输出完整文件内容；quality gate 不因全局 `--max-lines` / `--max-chars` 误判为膨胀 |
| `balanced` | `balance` | 默认；大文件全文 passthrough（与 §1.4 retention-first 一致） |
| `aggressive` | — | 文件 >12K chars 或 >200 行时输出路径、行数与符号列表（`Symbols:`），不输出全文 |

`read --max-lines`、`read --tail-lines`、`read --line-numbers` 只输出真实行切片，无占位行。`cat` 不走 level 逻辑。

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
| Git | `gitExtended`（add、commit、push、pull、fetch、stash、worktree） | 失败保留完整 stderr；成功输出 shortstat / 关键一行摘要 |
| Git | `gh`、`glab` | 解析 PR/issue 列表为紧凑行，保留全部条目 |
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
- 需要完整原文时用户始终可用 `tg --raw`；失败或大输出还可能写入用户级 raw output 存储。

**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：

- `Hidden: … not shown`
- `+N more matches/files/packages/errors/commits/branches`
- `[N more lines]`、`... N more lines (use tg --raw …)`
- 仅展示 sample 却暗示还有更多（如 `Direct sample:` + 截断列表）

这意味着：**能完整给就给；给不全就退回原文**，不在输出里用 metadata 假装 agent 已经看过省略部分。

### 1.7 Delivery policy

Delivery policy 是对外行为，quality gate 是实现机制。V1 的默认 delivery policy：

- 默认返回 `safe` 级输出：结构化、可执行、retention-first。
- 失败命令、测试失败、安全诊断和 parse failure 优先保留可行动细节。
- 不能完整、安全压缩时回退 raw passthrough，而不是输出不完整摘要。
- raw pointer 只作为恢复路径；它不能替代当前输出中必须保留的关键事实。
- `compact` / `lossless-pointer` 只属于后续 opt-in 层，不改变当前 command proxy 默认行为。

Terminal command 改写规则见 [§3.8 Hook Rewrite Engine](#38-hook-rewrite-engine)（planned）。

---

## 2. `tg config init`

用户级配置的初始化入口。

```bash
tg config init
```

`tg config init` 负责：

1. 创建用户级 JSONC 配置文件。
2. 初始化用户级数据目录，用于 history、raw output、cache 和 telemetry export。
3. 写入注释化示例配置，不自动开启 telemetry、hook install 或任何项目写入。
4. 如果配置文件已存在，默认不覆盖，提示用户使用显式覆盖选项。

用户级配置影响该用户所有项目。详见 [Configuration](#configuration)。

---

## 3. Hook System

> **Status: planned** — 本节描述目标行为；实现前以 §1 command proxy 为准。

Hook 是 Token Guard 在 Copilot 工具调用链中的拦截点。它是 `tg <command>` 之外的运行时适配层：命令代理继续覆盖 shell/PowerShell/terminal 命令，hook runtime 则处理 Copilot tool event，包括 VS Code direct tools 和 terminal tools。VS Code transcript 里 direct tools 往往不是补充路径，而是和 `run_in_terminal` 并列的主入口；Layer 2 必须把 `read_file`、`grep_search`、`list_dir`、`file_search`、`fetch_webpage`、GitHub MCP 等作为一等治理对象。

Hook runtime 通过 stdin JSON 与宿主通信，自动识别 Copilot CLI camelCase payload 和 VS Code Copilot Chat snake_case payload。输入首先被归一化为 tool event，再按工具类型分流：

| Tool kind | 示例 | pretool 行为 | posttool 行为 |
|-----------|------|--------------|---------------|
| Terminal command | `powershell`、`run_in_terminal`、`shell` | 提取 command string，安全时 rewrite/suggest 到 `tg <command>` | 未 rewrite 或宿主已执行时，对 raw terminal output 做兜底压缩 |
| Direct read | `read_file`、`view` | 检查路径、大小、目录，阻断依赖目录、构建产物、lockfile 等高成本读取 | 对成功读取结果做 filter，返回 `modifiedResult` |
| Direct search | `grep_search`、`rg`、`grep` | 检查搜索范围，提示限定路径或忽略生成目录 | 压缩匹配结果，保留所有关键匹配 |
| Direct list | `list_dir`、`glob`、`file_search` | 检查路径和深度，阻断依赖目录和构建产物 | 压缩目录/文件列表 |
| Direct web / MCP | `fetch_webpage`、GitHub MCP file/search tools | 检查 URL、repo scope、query 宽度和输出上限 | heading/result grouping + raw recovery；不 telemetry 化 raw content |
| Edit / mutation | `apply_patch`、`edit`、`replace_string_in_file`、`create_file`、mutating shell commands | 通常不 rewrite；可做路径策略、dry-run/confirmation 提示 | 记录输入/输出长度和结果；不对补丁内容做破坏性压缩 |
| Unknown | 未识别工具 | fail-open | fail-open |

Direct tools 不伪装成 shell command，也不走 `tg cat` / `tg rg` rewrite。它们通过 pretool policy 和 posttool result filtering 适配；terminal tools 才进入 command rewrite registry 并复用现有 command proxy pipeline。

Hook 只支持用户级安装。Hook 配置写入用户级 Token Guard 数据目录，影响该用户显式接入的 Copilot surface；项目仓库不保存 hook 配置。

Direct tool projection strategies:

| Tool family | Projection strategy |
|-------------|---------------------|
| Read / view | Range-aware output, outline metadata, binary/large-file policy; critical content retained or raw passthrough |
| Search / grep | Group by file, count matches, retain all critical matches; narrow scope suggestions before truncation |
| List / glob | Directory grouping, filtered generated/dependency paths, full retained path set when possible |
| Web / GitHub MCP | Heading/link/result grouping, query scope hints, raw local recovery; never export raw fetched content by default |
| Diagnostics | Group by file, severity and code; preserve all actionable diagnostics |
| Agent / subagent result | Final result first; routine trace only when host explicitly supports recoverable raw pointer |
| Edit / mutation | Measure tool input/output size and surface safety hints; do not rewrite commands or hide patch content |

### 3.1 Hook 类型

```bash
tg hook init              # 安装用户级 hooks
tg hook status            # 查看用户级 hook 状态

tg hook pretool           # 工具调用前拦截
tg hook posttool          # 工具调用后压缩
tg hook posttool-failure  # 工具调用失败后追加恢复建议
tg hook prompt            # prompt 提交前检查
```

### 3.2 pretool hook

在 Copilot 调用工具之前拦截。输入 stdin JSON 包含 tool name、tool input、工作目录和可选 prompt/session metadata；只有 terminal tools 才必然包含 command string。

核心职责：

- 归一化 Copilot SDK camelCase payload（`toolName`、`toolArgs`）和 VS Code snake_case payload（`tool_name`、`tool_input`）。
- 识别高浪费工具调用模式（raw shell command、全仓搜索、读依赖目录文件、读大文件）。
- 输出四种决策：`allow`（放行）、`warn`（附改写建议）、`deny`（附原因）、`rewrite`（改写后的 command）。
- 对 terminal tools 中的 `rg`、`grep`、`cat`、`git status`、`npm test` 等给出 `tg` wrapper 改写。
- 对 direct read/search/list tools 做 policy 判断，不把它们改写成 shell command。
- 对 web fetch / GitHub MCP 结果做 source-aware projection，按 total output 和 max output 识别高成本来源。
- 对 edit/create/apply_patch 和 mutating shell commands 默认不 rewrite；只做路径策略、dry-run/confirmation 建议和长度记录。
- 对 `docker logs`、`kubectl logs` 按 mode 给出 suggest 或 deny。
- 拒绝读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。

### 3.3 posttool hook

在 Copilot 工具成功执行之后拦截。VS Code `PostToolUse` payload 使用 `tool_response` / `tool_result`，Copilot SDK payload 使用 `toolResult`。Token Guard 在这里压缩工具输出，并在宿主支持时返回 `modifiedResult` 替换原结果。

核心职责：

- 读取 direct tool 或 terminal tool 的原始结果。
- 对 terminal command output 复用现有 handler filter 逻辑压缩输出。
- 对 direct read/search/list 结果使用 tool-level filter 压缩输出，不重新执行工具。
- 记录原始和压缩后的长度到 history。
- 无需修改时返回 `{}` 或空输出，保持宿主原始结果。
- 压缩成功时返回 `modifiedResult`；需要额外提示模型时返回 `additionalContext`。

### 3.4 posttool-failure hook

在工具失败后拦截失败信息。失败场景不会走成功版 `PostToolUse`，因此单独处理：

- 记录失败工具名、输入类别和错误长度，不记录源码或日志原文。
- 对 `read_file` / `view` 的 missing file、权限错误给出路径检查建议。
- 对 terminal command 的 non-zero exit、command not found 给出最短恢复建议。
- 默认不阻断后续流程，只追加 `additionalContext`。

### 3.5 prompt hook

在 Copilot 发送 prompt 之前检查。

核心职责：

- 检查 prompt token 数是否超过 `prompt.warn_tokens` 或 `prompt.block_tokens` 阈值。
- 超阈值时输出 `warn` 或 `block`。
- 识别明显实现型任务意图（generate、implement、write code），按 model governance 策略给出路由建议。

### 3.6 错误策略

Hook 的错误策略必须偏安全：默认 fail-open。

- 输入解析失败 → `allow`（不阻断）。
- 配置文件缺失或解析失败 → `allow`。
- Policy engine 内部异常 → `allow`。
- 只有明确匹配到 deny 策略时才阻断。
- Hook 内部的调试日志写入 stderr，不污染 stdout 的 JSON protocol。

### 3.7 模型名获取

Hook runtime 从 payload 中提取 model metadata。如果 payload 中无法可靠拿到 model name，回退到 L2 行为治理，不猜测当前模型。

### 3.8 Hook Rewrite Engine

Hook rewrite engine 是集中式 command rewrite registry，只处理 terminal tools 中的 command string。设计思想来自 RTK 的 rewrite 模块。

**输入**：`powershell`、`run_in_terminal`、`shell` 等 terminal tool payload 中的原始 shell command。

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

- 识别 Copilot CLI / VS Code Copilot Chat 的 terminal tool call，例如 `powershell`、`run_in_terminal`、`shell`。
- 对 VS Code direct tools（`read_file`、`grep_search`、`list_dir` 等）跳过 rewrite，由 tool policy 和 posttool filter 处理。
- Rewrite engine 通过 stdin JSON 接收 payload，格式与 Copilot hook protocol 兼容。
- 改写结果通过 stdout JSON 返回，包含 `decision` 字段和可选的 `rewritten_command`。

---

## 4. Skills Optimizer

扫描用户级 agent skills，识别 token 浪费风险，生成优化建议和 diff。

项目内 skills 只做只读分析，不由 Token Guard 自动改写。

### 4.1 命令

```bash
tg skill scan                # 扫描用户级 skills（只读）
tg skill optimize --dry-run  # 预览优化 diff（只读）
tg skill optimize --apply    # 应用用户级优化（自动备份 → 写入 → 输出 diff）
tg skill restore             # 从备份恢复
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
- `--apply` 先备份用户级原文件再写入优化版本。
- 生成可审查的 unified diff。
- 不修改 skill 的语义或功能逻辑。
- 不处理非 skill 文件。
- 用户级 skills 的优化需要用户确认，不静默修改全局配置。

---

## 5. AGENTS.md Patcher

向用户级 agent 指令文件追加短 token budget 指示。

项目内 `AGENTS.md`、`CLAUDE.md`、`COPILOT.md` 只做只读分析或输出建议，不由 Token Guard 自动 patch。

### 5.1 命令

```bash
tg agentsmd patch          # 追加用户级 token budget 规则
tg agentsmd restore        # 移除 tg 追加的用户级内容
```

### 5.2 追加内容

使用 HTML comment marker 标记块，保证可识别和可恢复：

```markdown
<!-- tg:start -->
## Token budget guidance

- Prefer selected code, current diff, diagnostics, and failing errors over broad repository scans.
- Use `tg rg`, `tg cat`, and `tg npm test` before raw commands that produce long output; use `tg read --level aggressive` only when you explicitly want a symbol outline of a large file.
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

---

## 6. Built-in Filters

Token Guard 不提供项目级自定义 filter engine。输出压缩只来自内置 command handlers、tool-level filters 和 quality gate。

### 6.1 设计约束

- 不读取项目仓库里的 `.tg/filters.yaml` 或类似规则文件。
- 不让 repo-provided regex 改写工具输出，避免供应链风险。
- 用户需要新增压缩行为时，应通过代码实现 dedicated handler，而不是运行时规则叠加。
- 无法完整、安全压缩时返回 raw passthrough。

### 6.2 Compression levels

Compression levels 是 delivery policy 的概念，不是全局 CLI flag。默认行为等价于 `safe`，并受 [Quality gate](#16-quality-gate) 约束。

| Level | Status | 行为 |
|-------|--------|------|
| `safe` | 默认 | 结构化但 retention-first；不能完整表达就 raw passthrough |
| `compact` | opt-in | 更激进的 tool-level projection；必须有 raw recovery 和 reopen metrics |
| `lossless-pointer` | opt-in | 极短 projection + raw pointer；只用于可恢复场景，不作为当前命令默认输出 |

### 6.3 Algorithm priority

Handler 和 tool-level filter 选择策略时按以下顺序优先考虑。任何策略都必须服从 quality gate；semantic summary 不能绕过 retention-first 合同。

1. Stats extraction：counts、file totals、pass/fail totals。
2. Failure focus：保留 failures，去除可恢复的 success noise。
3. Grouping：按 rule、file、package、error code 分组。
4. Deduplication：重复 log template 合并计数。
5. Structure-only：保留 keys/types/counts，避免大 value。
6. Tree compression：目录和嵌套列表聚合。
7. Progress filtering：去除 progress bar、ANSI、spinner。
8. State machine parsing：解析 test/build lifecycle。
9. NDJSON/event parsing：聚合 streaming events。
10. Code filtering：仅在显式 level 下输出 outline/signature。
11. Semantic summary：只在 deterministic options 不足、且有 raw recovery 时考虑。
12. Byte compression：只用于本地 raw storage，不进入 model context。

---

## 7. Parser — Three-Tier Degradation

源自 RTK 的 parser 模块。所有 tool output 解析遵循三级降级策略，确保不返回假数据。

### 7.1 三级解析

| Tier | 名称 | 行为 | 使用场景 |
|------|------|------|----------|
| Tier 1: Full | 完整解析 | JSON 解析成功，提取所有结构化字段 | 工具支持 `--json` 输出（vitest、eslint、pytest） |
| Tier 2: Degraded | 降级解析 | 部分字段提取成功，带 warning | JSON 格式不完整或有 prefix（pnpm banner、dotenv 消息） |
| Tier 3: Passthrough | 透传 | 解析失败，返回原始输出交给 quality gate | 工具无结构化输出，或解析器无法处理 |

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

### 7.4 完整性策略

Parser 不做全局截断，也不生成 `+N more`、`[N more lines]` 或 passthrough marker。解析失败时返回原始输出；handler 若无法完整表达关键信息，必须 passthrough raw。最终输出仍经过 quality gate：不能完整、安全压缩就退回 raw。

### 7.5 与 handler 的协作

Parser 模块作为 handler filter 的基础设施，handler 可以选择：

- 直接使用 parser 的结构化输出（如 vitest handler 解析 JSON test results）。
- 使用 parser 的 `extractJsonObject` 提取嵌入式 JSON。
- 降级到 passthrough 时，由 handler 的文本压缩逻辑接管。

---

## 8. Reporting & History

### 8.1 History

每次 `tg` 命令执行（hook 拦截 planned）都追加写入：

`~/.token-guard/projects/<project_fingerprint>/history.jsonl`

`project_fingerprint` 为 `repo:` + SHA-256(`realpath(cwd)`) 前 12 位十六进制（避免 macOS `/var` vs `/private/var` 路径别名导致 fingerprint 不一致）。测试可通过环境变量 `TOKEN_GUARD_HOME` 覆盖数据根目录。

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
  "project_fingerprint": "repo:4f8b2c1a9e3d",
  "raw_output_path": "projects/repo:4f8b2c1a9e3d/raw/20260602-103000-git-status.log",
  "quality_status": "passed"
}
```

`raw_output_path` 为相对于 `TOKEN_GUARD_HOME`（默认 `~/.token-guard`）的路径。

不记录：prompt 原文、源码内容、日志原文、文件内容。只记录命令类型、长度统计、策略结果和时间。

Future lineage fields may be added when direct tool projections and recovery store mature:

| Field | 含义 |
|-------|------|
| `source_adapter` | `shell`、`terminal_tool`、`direct_tool`、`prompt_context` |
| `compressor` | 具体 handler 或 tool-level projector 名称 |
| `compression_level` | `safe`、`compact`、`lossless-pointer` |
| `raw_hash` | raw evidence 的本地 hash，不是 raw 内容 |
| `schema_version` | projection/history schema version |
| `raw_reopened` | 用户或 agent 是否通过 raw pointer 重新打开原始证据 |

### 8.2 Report

```bash
tg report              # 当前项目 fingerprint 的报告（文本格式）
tg report --user       # 用户级聚合报告
tg report --json       # JSON 格式（机器可读）
tg report --csv        # CSV 格式
```

报告内容：

- 总命令数 / hook 命中次数。
- 原始 token 总量、输出 token 总量、节省 token 总量、节省百分比。
- 按 handler 分组的节省率。
- 按 `quality_status` 分组的过滤质量计数，例如 `passed`、`inflated`、`empty_output`。
- `--user` 报告按项目 fingerprint 分组，展示每个项目的独立统计。
- `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
- 不记录敏感原文，只记录命令类型、长度、策略结果和时间。

Primary success metrics:

- Output compression ratio.
- Projection fallback rate.
- Parse failure rate.
- Raw reopen rate：如果 agent 经常打开 raw evidence，说明 projection 可能过度压缩或漏掉关键信息。
- Repeated guidance bytes avoided。
- Cacheable prefix ratio 和 prefix churn rate（Future Layer 3 diagnostic，不作为 V1 billing claim）。

### 8.3 Telemetry / export field policy

Telemetry 默认关闭。只有用户显式运行 telemetry export 或启用用户级配置时，才允许输出匿名聚合字段。

Allowed aggregate fields:

- Compressor family counts.
- Average compression ratio by family.
- Fallback counts.
- Parse failure counts.
- Raw reopen rate bucket.
- Input prefix churn bucket.
- Output family distribution.

Disallowed fields:

- Raw commands or command arguments.
- File paths, repository names or session identifiers.
- Raw output snippets.
- Raw prompt content.
- Source code, logs or file content.

---

## 9. Inspect — Copilot Session Scanning

`tg inspect` 扫描 Copilot 会话历史和本地工具调用证据，找出终端命令中可用 `tg <command>` 替代的遗漏机会，以及 direct tool 中读/搜/列目录/web/MCP 操作本应由 hook runtime 治理的高成本模式。

```bash
tg inspect                    # 默认 input type: vscode
tg inspect --input-type vscode
tg inspect --input-type copilot-cli
tg inspect --since 7d         # 仅扫描最近 7 天
tg inspect --session <id>     # 扫描指定 session
tg inspect --json             # JSON 格式输出
tg inspect --repo-context     # 附加只读 repo context
tg inspect --write-advice     # 写入用户级建议文件
tg inspect --telemetry-export # 显式导出匿名聚合 telemetry
```

默认 input type 是 `vscode`。输入类型按用户可理解的 Copilot surface 命名；workspaceStorage、session-state 等只是内部扫描来源。不同 input type 的 tool model 不同，不能混成一个命令入口：

| Input type | Internal sources | Primary execution shape | Inspect handling |
|------------|------------------|-------------------------|------------------|
| `vscode` (default) | Stable VS Code `workspaceStorage` chat sessions and Copilot transcripts | `run_in_terminal` for shell, direct tools for read/search/list/edit/web | Classify terminal and direct tools separately; do not infer a PowerShell layer |
| `copilot-cli` | Copilot CLI session-state/history stores | `powershell` or CLI-specific command-bearing tool events | Extract concrete command families from command-bearing payloads |

扫描为纯只读操作，不修改任何文件，不记录命令参数值、搜索词或文件内容原文。

Inspect reports must rank opportunities by both frequency and output volume. Minimum columns:

| Metric | Why it matters |
|--------|----------------|
| `count` / `share` | Identifies common workflow surfaces |
| `total_output_chars` or estimated tokens | Captures high-cost tools even when frequency is low |
| `avg_output_chars` | Highlights consistently noisy tools |
| `max_output_chars` | Finds outlier blowups that need guardrails |
| `total_input_chars` / `max_input_chars` | Captures large edit/create/apply_patch payloads and prompt-side waste |
| `success_count` / `failure_count` | Separates noisy failures from successful high-output tools |

> **完整 inspect 规范见 [`docs/inspect-v1-design.md`](inspect-v1-design.md)**，包含 evidence model、分类枚举、推荐模型、raw evidence policy、telemetry 传输合约、exit code 表及 VS Code coverage 语义等细节。

---

## 10. Advice Generation — Pattern Detection & Auto-Correction

作为 `tg inspect` 的扩展能力，advice generation 分析 Copilot agent 的重复浪费行为模式，生成 CLI 使用建议、hook 策略建议和用户级规则文件。

### 10.1 命令

```bash
tg inspect --advice                    # 输出浪费模式报告
tg inspect --since 14d --advice        # 分析最近 14 天
tg inspect --write-advice              # 写入用户级 advice 文件
tg inspect --json --advice             # JSON 格式输出
tg inspect --min-confidence 0.7        # 最低置信度阈值
tg inspect --min-occurrences 5         # 最低重复次数阈值
```

### 10.2 检测模式

| 模式 | 检测逻辑 | 建议 |
|------|----------|------|
| Direct tool 读依赖目录 | `read_file` / `view` 路径包含 `node_modules/` | hook pretool deny |
| Direct tool 读大文件 | `read_file` / `view` 输出长度超过阈值 | hook posttool filter，必要时建议 targeted read |
| Direct tool 全仓搜索 | `grep_search` 无 path 或路径为 repo root | hook pretool warn，建议限定 `src/` 或 `tests/` |
| Direct web / MCP 高输出 | `fetch_webpage`、GitHub MCP file/search tool 输出过长或 query 过宽 | heading/result projection，建议收窄 URL、repo、path 或 query |
| 大 tool input payload | `edit`、`apply_patch`、`create_file`、`task` 输入长度超过阈值 | 建议 split patch、引用文件路径或先保存本地 artifact |
| Terminal 搜索依赖目录 | terminal command 中 `rg`/`grep` 路径包含 `node_modules/` | rewrite/suggest 到 `tg rg` 或 deny |
| Terminal 读取 lockfile | terminal command 中 `cat package-lock.json` 等 | warn/deny，建议更窄查询 |
| Terminal 读取构建产物 | terminal command 中 `cat dist/`、`build/`、`target/` | deny 或强烈建议跳过 |
| Terminal 执行全量测试 | `npm test` / `pnpm test` 无过滤参数 | rewrite/suggest 到 `tg npm test` 只看 failures |
| Mutating command safety | `git commit`、`git stash`、`Remove-Item`、文件写删等 mutating operation | 不 rewrite；建议 dry-run、status check、confirmation 或更窄路径 |
| 重复执行相同 workflow | 同一 command family 或 direct tool pattern 在短时间窗口内多次出现 | 建议收窄范围、复用报告或使用 tg；exact command cache 只是辅助建议 |

### 10.3 输出格式

```
Advice Report
Sessions scanned: 8 (last 14 days)
Corrections found: 5

Rule: Prefer tg rg over raw grep in dependency dirs
  Pattern: grep -r <query> node_modules/
  Occurrences: 12
  Confidence: 0.92
  → Use: tg rg <query>

Rule: Prefer tg read --level aggressive for large files
  Pattern: cat <file> where file > 500 lines
  Occurrences: 8
  Confidence: 0.85
  → Use: tg read --level aggressive <file>
```

### 10.4 自动规则写入

`tg inspect --write-advice` 将检测到的规则写入用户级 Token Guard advice 文件：

```markdown
# CLI Corrections (generated by tg inspect)

## Prefer tg rg over raw grep
- **Pattern**: grep -r in dependency directories
- **Correction**: Use `tg rg` which automatically skips node_modules, dist, and build
- **Detected**: 12 occurrences in the last 14 days

## Prefer tg read --level aggressive for large files
- **Pattern**: cat on files > 500 lines
- **Correction**: Use `tg read --level aggressive` for symbol outline; `tg cat` keeps full file content per retention-first policy
- **Detected**: 8 occurrences in the last 14 days
```

### 10.5 与 Skills Optimizer 的关系

Advice generation 和 `tg skill scan` 互补：

- Advice generation：分析 Copilot **运行时行为**（命令执行模式）。
- `tg skill scan`：分析 **静态内容**（skill 文件大小、注入内容、description 宽度）。

两者共同提供"优化建议 → 自动修正"闭环。

---

## 11. Model Governance

Token Guard 不托管模型路由，但通过策略层级提供治理能力。产品范围停在 L1-L3：建议、行为治理、以及可靠模型名下的策略。

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

不做：

- 不提供 session routing 命令。
- 不安装 custom agent。
- 不做 AI Gateway 真路由或跨 session 自适应路由。

---

## 12. Configuration

### 12.1 配置文件

| 位置 | 作用域 | 优先级 |
|------|--------|--------|
| macOS / Linux `~/.token-guard/config.jsonc` | 用户级 | 唯一配置 |
| Windows `~\.token-guard\config.jsonc` | 用户级 | 唯一配置 |

### 12.2 默认配置

```jsonc
{
  "mode": "balanced",
  "prompt": {
    "warnTokens": 4000,
    "blockTokens": 16000
  },
  "tool": {
    "preferSilentRewrite": true,
    "blockGeneratedFiles": true,
    "blockDependencyFolders": true,
    "blockLockfiles": true,
    "rawCommandPolicy": {
      "rg": "suggest",
      "grep": "suggest",
      "cat": "rewrite",
      "npmTest": "suggest",
      "dockerLogs": "block",
      "kubectlLogs": "block"
    }
  },
  "output": {
    "maxChars": 12000,
    "maxLines": 180,
    "keepPatterns": [
      "error",
      "failed",
      "exception",
      "fatal",
      "timeout",
      "denied",
      "stack",
      "warn"
    ]
  },
  "modelPolicy": {
    "escalation": "suggest-first",
    "expensiveModels": ["Claude Opus", "Opus 4.6"]
  },
  "telemetryExport": false
}
```

### 12.3 Mode 语义

| mode | 行为 |
|------|------|
| `passive` | 只建议和记录，不阻断任何操作 |
| `balanced` | 明显浪费时阻断（读依赖目录、超长 prompt），大多数场景建议或改写 |
| `strict` | 企业强控：raw command、超长 prompt、大文件读取、贵模型高成本动作直接阻断 |

### 12.4 配置校验

配置文件存在但无法解析、或包含无效字段时，命令以 exit code 1 退出并输出校验错误信息。不静默回退默认值。

---

## 13. Token Digestion Layers

Layer 1 落在 command filter 质量门上。以下两层补充消化路径。

### 13.0 Cache terminology

`cache` 必须明确指向哪一种机制：

- **Model input cache**：provider 对稳定 prompt prefix 的复用。Token Guard 不能直接控制它，只能通过稳定布局、确定性格式和 volatile suffix isolation 提高命中机会。
- **Local recovery store**：本地 raw evidence、projection lineage 和 metrics。它用于恢复、审计和减少重复运行，不应被算成 model token savings。
- **Semantic similarity**：只能用于提示“这像某类历史问题”或“有可复用规则”，不能替代 fresh tool output。

Allowed:

- “This output matches a known noisy pattern.”
- “A durable context rule may help here.”
- “This command family often benefits from `tg`.”

Not allowed:

- 用旧命令输出替代当前工具结果。
- 把 embedding similarity 当成事实相等。
- 把 local store hit 计入 provider token savings。

### 13.1 Layer 2: 少产生输出

目标是在工具执行前减少高成本输出，并在工具执行后压缩 direct tool / terminal tool 的结果。Layer 2 不替代 `tg <command>`；它把 command proxy 接入 Copilot hook runtime，并新增 tool event 级治理。

实现边界：

- 新增 tool event normalizer，输入 Copilot/VS Code hook payload，输出统一 tool kind、tool input、tool result、cwd、session metadata。
- 新增 rewrite registry，输入 terminal tool 的 raw command，输出 `pass | rewrite | warn | deny`。
- `tg hook pretool` 读取 stdin JSON：terminal tools 做 command rewrite；direct tools 做路径、范围、大小策略判断。
- `tg hook posttool` 在宿主已经执行工具后压缩 tool result：terminal output 复用现有 handler，direct read/search/list 使用 tool-level filter。
- `tg hook posttool-failure` 在工具失败后追加恢复建议，不把失败当成功输出压缩。
- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。

第一批规则只覆盖高价值命令：

- Terminal command：`cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
- Terminal command：`cat node_modules/...`、`cat dist/...` → deny。
- Terminal command：`rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tg rg`。
- Terminal command：`git diff` → rewrite 到 `tg git diff`。
- Terminal command：`npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tg` command。
- Direct read：`read_file` / `view` 读取依赖目录、构建产物、lockfile → warn 或 deny；成功读取的大输出 → posttool filter。
- Direct search/list：`grep_search`、`list_dir`、`glob`、`file_search` 访问 repo root、依赖目录或构建产物 → warn/deny；成功结果 → posttool compact。
- Direct web / MCP：`fetch_webpage`、GitHub MCP file/search tools 输出过长 → posttool projection + raw recovery；pretool 建议收窄 URL、repo、path 或 query。
- Edit / mutation：`apply_patch`、`edit`、`create_file`、`git commit`、`git stash`、删除/覆盖命令 → 默认不 rewrite；只做长度统计、路径策略和 dry-run/confirmation 建议。

### 13.2 Layer 3: 提高 model input cacheability

目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Guard 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用；本地 store 命中只代表恢复或 latency 优化，不代表 provider token savings。

Prompt zones:

| Zone | 内容 | 规则 |
|------|------|------|
| Stable | system instructions、tool schemas、Token Guard policy、稳定 glossary | 固定顺序、固定 heading、固定 JSON key order |
| Semi-stable | repository guidance references、ADR/context references、toolchain summary、durable workflow conventions | 用引用和 hash 表达，避免重复注入长文 |
| Volatile | current user request、tool output、timestamps、run IDs、session-specific errors | 放在 suffix，不进入 stable prefix |

Cache-hit practices:

- Stable content appears before volatile content.
- Use canonical JSON key ordering and stable heading names.
- Prefer context references over repeated long guidance.
- Keep timestamps, random IDs, temporary paths, latest command output and generated telemetry IDs out of stable prefixes.

实现边界：

- 优先实现 input diagnostics：统计 prompt prefix churn、stable/volatile ordering、duplicate guidance bytes、tool input payload size。
- 新增 deterministic project context：`~/.token-guard/projects/<fingerprint>/context.md` 与 `context.json`。
- 默认输出去 volatile：timestamp、duration、临时路径、随机 raw 文件名只在 `--verbose` 出现。
- Content-addressed output cache 是辅助能力，不是 Layer 3 的主 ROI：会话历史显示 exact command 一次性比例高，cache key 由 `cwd`、command family、args shape、git HEAD 和相关文件 fingerprint 构成时才考虑复用。
- 重复命令在 fingerprint 未变时可以返回 cache summary，并在 history 中记录 `cache_hit`、`cache_key`、`cacheable`；不得用 cache summary 替代 fresh evidence。

报告后续增加：

- cacheable commands。
- cache hits。
- repeated output avoided tokens。
- tool input chars by family。
- max tool input chars。
- stable chars / volatile chars。
- raw reuse hits。
- cacheable prefix ratio。
- prefix churn rate。
- volatile-before-stable count。
- unstable formatting findings。
- duplicate guidance bytes。

---

## 14. Operational Risks

| Risk | Failure mode | Mitigation |
|------|--------------|------------|
| Over-compression | Projection 隐藏必要细节，agent 被迫 reopen raw 或 rerun command，反而增加 token | Track raw reopen rate；failure detail 优先；不确定时降级到 `safe` 或 raw passthrough |
| False cache confidence | Semantic similarity 看起来像 cache hit，但事实已变化 | Semantic similarity 只做 recommendation；fresh tool output 仍是事实源 |
| Adapter mismatch | Shell proxy 覆盖不到 direct tool results | 区分 shell、terminal tool、direct tool、prompt context；按 source family 统计覆盖率 |
| Prompt cache churn | Volatile 内容出现在 prompt 前缀，破坏 provider input cache hit | Stable zone first；volatile zone last；canonical formatting；diagnose prefix churn |
| Mutating command rewrite | 把 `git commit`、`git stash`、删除/覆盖命令等错误改写或隐藏输出，可能改变用户状态或掩盖风险 | Mutating operations 默认不 rewrite；只做 dry-run/status/confirmation 建议和路径/长度记录 |

---

## 15. Implementation Constraints

- 不做 session routing、custom agent 安装、AI Gateway 真路由或跨 session 自适应路由。
- 默认不写项目仓库；配置、history、raw output、cache、advice 和 backups 都写入用户级 Token Guard 目录。
- 所有用户级写入必须可恢复（备份或 marker-based restore）。
- 不默认改写用户 skill。
- 纯 TypeScript/Node.js 实现，不依赖 RTK 或 Rust。
- 模型名不可靠时不猜测，回退 L2。
- Report 不记录 prompt、源码、日志原文。
- Telemetry 默认关闭，只能通过显式 CLI flag 或用户级配置 opt-in。
- Hook 错误策略默认 fail-open。

---

## 16. Development

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
│   ├── dataDir.ts      # ~/.token-guard 路径与 project fingerprint
│   ├── fallback.ts     # 异常兜底
│   ├── history.ts      # JSONL 记录读写
│   ├── outputLimit.ts  # 行数/字符数参数占位
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
    ├── base.ts         # 共享工具（rawText、makeFilteredResult、quality gate）
    ├── generic.ts      # 兜底 handler
    ├── common/         # searchLike、readLike、listLike、diff
    ├── git/            # status、diff、log、show、branch、extended、hostingCli、compactDiff
    ├── js/             # test、eslint、tsc、packageList
    ├── python/         # pytest、ruff、mypy、pip
    └── java/           # maven、gradle、javac
```
