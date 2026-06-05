# Token Killer Design

> 面向实现 Token Killer 的工程师和 AI Agent。记录产品边界、模块设计和模型治理策略。实现时优先保持简单、可恢复、低侵入，不要把实验能力写成默认承诺。

## Background

GitHub 宣布 Copilot 从 2026 年 6 月 1 日开始转向 usage-based billing，GitHub AI Credits 会按 token usage 消耗，包括 input、output 和 cached tokens。参见：[GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)。

企业 agent 工作流不能再默认"多给上下文、多跑命令、多输出文本"。Token Killer 要解决无意识 token 膨胀：

- 反复读取大文件、lockfile、`node_modules`、构建产物。
- `rg`、`cat`、`npm test`、日志等命令输出过长。
- skills 和 instructions 长期常驻注入。
- 长会话没有及时 compact。
- 贵模型被用于大段代码生成、测试生成和噪音工具输出。
- 缺少可审计的压缩效果、阻断记录和节省报告。

## Product stance

Token Killer 是 Copilot cost-control companion，不是 Copilot wrapper。用户主路径保持不变：

```text
VS Code Copilot Chat / Agent
GitHub Copilot CLI
GitHub Copilot cloud agent
```

`tk` 围绕八个核心能力设计：

- **Command proxy** — 低输出命令 wrappers，RTK 风格改写与压缩。用户通过 `tk <command>` 前缀使用，是产品的主入口。
- **`tk config init`** — 用户级配置初始化，生成 Token Killer JSONC 配置，不隐式修改项目仓库。
- **Hook system** — pretool / posttool / prompt 三类 hook，在 Copilot 工具调用链中拦截、建议、改写或阻断高成本操作。
- **Copilot context optimizer** — 先 inspect GitHub Copilot instructions、prompts、agents、AGENTS.md/CLAUDE.md 和 skills 的 token 风险，再 optimize 可安全自动化的子集。
- **Managed token budget block** — 向用户级 agent 指令文件追加短 token budget 指示，带标记可恢复。
- **Report & history** — 持久化每次执行的原始/压缩 token 数据，提供汇总报告。
- **Inspect** — 扫描 Copilot 会话历史、工具调用和本地证据，找出遗漏的 token 节省机会。
- **Advice generation** — 分析重复浪费模式，生成 CLI、hook 和用户级规则建议。

`tk` 的配置和默认写入只支持用户级作用域。项目仓库默认不被写入配置、rules、hooks 或 filters；history 与 raw output 写入 `~/.token-killer/projects/<fingerprint>/`（按工作目录 fingerprint 分组）。需要对项目文件给出建议时，`tk` 输出可审查的建议或 diff，由用户自行决定是否应用。

### Implementation status

| Capability | Status | Code / notes |
|------------|--------|----------------|
| Command proxy (`tk <command>`) | **shipped** | `src/cli.ts`, `src/handlers/*`, `src/core/pipeline.ts`；覆盖 common / git / js / python / java / cloud / system 七大类（handler 表见 §1.4） |
| Report & history | **shipped** | `src/core/history.ts`, `src/core/report.ts`, `src/core/dataDir.ts` |
| `tk config init` | planned | — |
| Delivery tiers (shim / `tk init`) | planned | **命令压缩主交付层**；PATH shim 覆盖 VS Code 等全宿主；统一 `tk init` 安装；见 [ADR 0002](adr/0002-shim-delivery-tier-and-passthrough.md)、`docs/shim-delivery-goal.md` |
| Hook system | shipped (Copilot-CLI-only, command-rewrite, no `modifiedResult`) | §3；**仅 Copilot CLI**，RTK 式命令改写（无 `modifiedResult`）；rewrite 规则见 §3.8；落地计划见 `docs/layer2-hooks-inspect-goal.md`。Slice 0 normalizer：`src/hook/normalize.ts`（双 dialect、canonical `category`、fail-open）。Slice 1 `tk hook copilot` 处理器：`src/hook/copilot.ts` 分流、`src/hook/rewrite.ts` 命令改写注册表（只加 `tk` 前缀）、`src/hook/govern.ts` direct-tool 治理（deny 依赖目录/lockfile、warn 全仓搜索）、`tk hook check` dry-run（`src/hook/cli.ts`）。Slice 2 prompt/error 事件：`src/hook/prompt.ts`、`src/hook/error.ts`、`history.recordHookFailure` + `source_adapter` 字段。Slice 3 安装：`tk init --host copilot-cli` 调用 `src/hook/install.ts` 写用户级 `~/.copilot/hooks/tk-rewrite.json`（指向 `tk hook copilot`，marker 可恢复，repo 仅 `--project`），并支持 `--dry-run`/`--uninstall`/`--show`；测试 `tests/unit/hook/*`、`tests/unit/shim/initCli.test.ts`、`tests/integration/hook.test.ts` |
| Copilot context optimizer | shipped | §4；静态 context 作为 `source = static_context` 分析器并入唯一的 `tk inspect`（§9，默认全跑），`tk optimize context` 为下游消费者（读 `inspect/latest.json`，无则触发 inspect）；scope-aware（[ADR 0003](adr/0003-inspect-default-full-static-context.md)：user 默认、`--project` opt-in）；非独立 `--copilot-context` 扫描命令。代码：`src/context/`（`analyzer.ts`、`discover.ts`、`parseMarkdown.ts`、`metrics.ts`、`report.ts`、`patchPlan.ts`、`advice.ts`、`optimizeCli.ts`、`rules/*` 全 §4.3 taxonomy）、`src/inspect/{staticContext,unified}.ts`；测试 `tests/unit/context/*`、`tests/integration/{inspectContext,optimize}.test.ts`；`docs/context-optimizer-implementation-goal.md` |
| Managed token budget block | shipped | §5；marker block 幂等 insert/remove + 用户级 backup + 项目级拒写 + 用户级 frontmatter/settings direct-apply（需显式 `--surface` / `--vscode-settings`）：`src/context/applySafe.ts`（`tk optimize context --token-budget-block --apply-safe`、`tk optimize context --vscode-settings --apply-safe`）、`src/context/agentsmd.ts`（`tk agentsmd patch\|restore`）；测试 `tests/unit/context/applySafe.test.ts`、`tests/integration/optimize.test.ts` |
| Inspect | shipped | §9；`docs/inspect-v1-design.md`、`docs/layer2-hooks-inspect-goal.md`。Slice 4 只读扫描器：`src/inspect/sources.ts`（VS Code workspaceStorage / copilot-cli 发现，缺失=not-found）、`src/inspect/scan.ts`（复用 hook normalizer，按 output volume 排名 opportunity，sanitized label 不存原文，session inventory≠transcript coverage，--since/--session 过滤）、`src/inspect/report.ts`（Markdown 默认 + `--json`，列 count/share/total+max output+tokens/input/success/failure）、`src/inspect/repoContext.ts`（`--repo-context` 仅 presence）、`src/inspect/cli.ts`（exit 0/1/2/3/4）；测试 `tests/unit/inspect/*`、`tests/integration/inspect.test.ts`。runtime + `source = static_context` 静态 context 分析器经 `src/inspect/{staticContext,unified}.ts` 合入统一 `Finding` 报告（§9.0），scope-aware（ADR 0003） |
| Advice generation | shipped | §10；Slice 5：`src/inspect/advice.ts`（delivery 建议领先：vscode→shim/`tk init`、copilot-cli→`tk init --host copilot-cli`；shell-noise rewrite、tool-noise 治理、long-output hotspot；min-confidence/min-occurrences 阈值）、`src/inspect/telemetry.ts`（仅 allow-list 聚合字段）、`src/inspect/persist.ts`（`~/.token-killer/advice/` 稳定文件名）；flags `--advice`/`--write-advice`/`--telemetry-export`/`--no-telemetry-export` |

> Command proxy 仍有 RTK parity 缺口（.NET、通用 wrapper、npx 路由等），收尾计划见 `docs/parity-completion-goal.md`。Go / Rust / Ruby 生态已判定 out-of-scope。

默认不做：

- 不替换用户已有 Copilot 入口。
- 不覆盖用户已有 agent 或 skill。
- 不承诺托管 Copilot 会话内完全透明切模型。
- 暂不实现 Claude Code subagent 路由或 AI Gateway 真路由。
- 不把旧命令输出、semantic similarity 或本地 cache 当成 fresh evidence。
- 不把 raw evidence telemetry 化；默认只保留本地恢复和聚合指标。

### Compression Plane Overview

Token Killer 的长期架构可以看成一个 compression plane：不同来源的 evidence 先进入 source-specific adapter，再经过 output compressor 或 input cache optimizer，最后由 delivery policy 决定 agent 能看到什么。V1 的强合同仍是 command proxy 和 quality gate；direct tool、prompt cache 和 recovery lineage 是后续层，不改变 V1 默认输出行为。

```text
Shell commands      ───┐
Direct tool events  ───┼─> Source adapters ─> Output compressor ─┐
Prompt / context    ───┘                                         │
                                                                  ├─> Delivery policy ─> Model / agent
Stable inputs ───────────────────────> Input cache optimizer ─────┘

Raw evidence ────────────────────────> Local recovery store
Metrics      ────────────────────────> Inspect / reports / explicit export
```

| Source family | Token Killer surface | Current / future role |
|---------------|---------------------|------------------------|
| Shell commands | `tk <command>` | V1 主路径；RTK-style command-aware filtering |
| Terminal tool events | `tk hook copilot` (preToolUse) | Future Layer 2；rewrite terminal commands to `tk <cmd>` (Copilot-CLI-only; VS Code uses the shim) |
| Direct tool events | `tk hook copilot` (preToolUse) | Future Layer 2；policy/governance only, not shell rewrite; result projection deferred |
| Prompt / context | `tk hook copilot` (userPromptSubmitted)、Layer 3 diagnostics | Future Layer 3；diagnose stable prefix and volatile suffix behavior |
| Raw evidence | `rawStore`、history | Recovery and measurement only; not a model-token cache |

Design principles inherited from RTK:

- Command-aware filtering beats generic summarization.
- Deterministic parsing and grouping run before semantic summaries.
- Failure output needs local raw recovery.
- Savings, fallback, parse failure and reopen behavior must be measurable.
- Shell rewrites are useful but incomplete; direct tools and prompt assembly need separate governance.

---

## 1. Command Proxy

Command proxy 是 Token Killer 的核心产品能力，用户通过 `tk <command>` 前缀使用。设计思想来自 RTK：拦截高浪费命令，用专门的 handler 压缩输出。

### 1.1 使用模型

```bash
tk <original command> [...args]
```

`tk` 执行原始命令，捕获 stdout/stderr/exit code，通过 handler 压缩输出，记录 token 节省量，并以原始 exit code 退出。

```bash
tk git status
tk git diff
tk rg "submitOrder" src
tk cat package.json
tk npm test
```

### 1.2 Flags

```bash
tk --raw <command...>        # 打印原始输出
tk --stats <command...>      # 打印 token 节省统计
tk --verbose <command...>    # 打印统计和 raw output 路径
tk --max-lines 200 <command...>  # 待实现
tk --max-chars 12000 <command...> # 待实现
tk --save-raw <command...>   # 强制保存原始输出
tk --no-save-raw <command...>
tk --report [--json|--csv]   # 查看节省报告
tk --help
tk --version
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
| Data dir | `src/core/dataDir.ts` | `~/.token-killer/` 根目录、按 cwd 的 `projectFingerprint`、`history` / `raw` 路径 |
| History | `src/core/history.ts` | JSONL 追加写入 `~/.token-killer/projects/<fingerprint>/history.jsonl` |
| Raw store | `src/core/rawStore.ts` | 条件保存原始输出到 `~/.token-killer/projects/<fingerprint>/raw/`（exit code ≠ 0 或 >20K chars 自动保存） |
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

只有 **`tk read --level aggressive`** 属于显式 opt-in 的激进摘要（符号列表）。`cat`、`type`、`less` 以及未指定 level 的 `read` 对大文件也 passthrough 全文。

#### `read --level`（仅 `tk read`）

| Level | 别名 | 行为 |
|-------|------|------|
| `minimal` | — | 输出完整文件内容；quality gate 不因全局 `--max-lines` / `--max-chars` 误判为膨胀 |
| `balanced` | `balance` | 默认；大文件全文 passthrough（与 §1.4 retention-first 一致） |
| `aggressive` | — | 文件 >12K chars 或 >200 行时输出路径、行数与符号列表（`Symbols:`），不输出全文 |

`read --max-lines`、`read --tail-lines`、`read --line-numbers` 只输出真实行切片，无占位行。`cat` 不走 level 逻辑。

#### Handler 分类与策略

> 注册表与匹配优先级见 `src/handlers/index.ts`。专用 System handler（`ls`、`tree`、`cat`/read）注册在 common `listLike` / `readLike` **之前**，因此对应程序优先走专用 handler；common handler 只接管未被专用 handler 命中的程序（如 `find`、`dir`、`type`、`less`）。`genericHandler` 始终兜底。

| 分类 | Handler | 策略 |
|------|---------|------|
| Search | `searchLike`（rg、grep） | **原文 passthrough**；无匹配时输出 `0 matches for <pattern>` |
| Read | `readLike`（type、less、read） | 默认全文；内部读文件（多文件、`read -` stdin）；`read --max-lines` / `--tail-lines` 只输出真实行切片（无占位行）；`read --level aggressive` 且大文件时仅符号摘要；二进制文件跳过内容 |
| List | `listLike`（find、dir） | 小输出：过滤 `node_modules` 等目录后的路径列表；大输出：`NF ND:` + 按目录分组或 `(N files)` 汇总，**列出全部路径/目录，不截断** |
| Diff | `diff`（两文件或 stdin unified） | 两文件：LCS 差异，输出 `old -> new (+N -M)` 与全部 `+/-` 行；stdin unified：按文件汇总并输出全部 change 行 |
| System | `ls`（专用） | 解析 `ls -la` 长格式为紧凑列表：目录在前（name + `/`），文件 name + human size，过滤 NOISE_DIRS（除非 `-a`），`-l` 时带 octal 权限 |
| System | `tree`（专用） | 透传原生 `tree` 层级，剥离尾部 `N directories, M files` 汇总；执行时用 `-I <noise>` 排除重目录降本 |
| System | `read`（专用，匹配 `cat`） | shell 到 `cat`,只透传 file operands；filter 按用户原始 args 重建 level / 行窗口，默认全文 |
| System | `wc` | 去冗余路径与对齐填充：`wc file` → `30L 96W 978B`；多文件去公共前缀 + `Σ` 合计 |
| System | `env` | 按类别分组环境变量,屏蔽 secret,`PATH` 折叠为条目数 + 预览;未命中类别的变量丢弃 |
| System | `json` | 默认 compact:排序 object key + 值,长字符串截断,数组汇总；`--schema`/`--keys-only` 另行处理 |
| System | `log` | 去重重复日志为 `Log Summary` + error/warn/info 计数,按频次列唯一 error/warning 并标 `[×N]`；归一化剥时间戳/易变 id |
| System | `format` | dispatcher:检测 formatter（prettier/ruff/black/biome）并路由到对应过滤器（区别于 `prettier` handler） |
| System | `pipe` | `pipe <cmd> <args...>`:对任意管道输出运行命名或自动检测的过滤器 |
| Git | `gitStatus` | 解析 verbose / porcelain；输出 `* branch` + ` M` / `??` 短行；过滤 `nothing added to commit` 等 hint |
| Git | `gitDiff` | **原文 passthrough**（完整 unified diff） |
| Git | `gitLog` | `--oneline` 少量提交 passthrough；多 commit 解析为 `Git Log: N commits` + **全部** subject 行 |
| Git | `gitShow` | `--stat` / name-only passthrough；完整 show：commit 元信息 + stat + **完整** patch（`--- Changes ---`） |
| Git | `gitBranch` | ≤2 分支 passthrough；更多分支列出 **全部** 分支名 |
| Git | `gitExtended`（add、commit、push、pull、fetch、stash、worktree） | 失败保留完整 stderr；成功输出 shortstat / 关键一行摘要 |
| Git | `gh`、`glab` | 解析 PR/issue/MR 列表为紧凑行，保留全部条目 |
| Git | `gt`（Graphite 栈式 CLI） | 解析 stack/log 图,保留完整栈结构,仅剥离 author email 等噪音 |
| JS | `jsTest` | failures + Test Files/Tests 摘要 |
| JS | `eslint` | 按 rule 分组，输出 **全部** violation |
| JS | `tsc` | 按 TS 错误码分组，输出 **全部** diagnostic；无 parse 结果时 passthrough raw |
| JS | `next` | `next build` 路由/bundle 摘要:按状态符号计数路由,提取 bundle size、warn/error 计数与构建耗时 |
| JS | `npm` | 剥离 lifecycle banner、`npm WARN`/`notice`、进度与空行；空结果折叠为 `ok` |
| JS | `packageList` | 已是 RTK compact 格式则 passthrough；否则解析为 `[prod]`/`[dev]` 列表 + Problems，**不截断** |
| JS | `prisma` | 剥离 Prisma ASCII art 与冗余装饰,汇总 generate / migrate dev/deploy/status / db push |
| JS | `prettier` | 仅列出需要格式化的文件 |
| JS | `playwright` | JSON reporter（Tier1）/ 文本（Tier2）/ passthrough（Tier3）,只展示 failures |
| Python | `pytest`、`ruff`、`mypy` | 保留 failures / violations / errors，分组展示 **全部** 条目 |
| Python | `pip` | **原文 passthrough** |
| Java | `maven`、`gradle`、`javac` | 保留 errors 与关键 failure 行，过滤构建进度噪音 |
| Cloud | `curl` | 始终 `-s`；非 JSON body 超 `MAX_RESPONSE_SIZE` 截断,完整 body 经 `tk --raw` 恢复 |
| Cloud | `wget` | 剥离进度条,成功 `{url} ok | {file} | {size}`,失败 `{url} FAILED: {error}` |
| Cloud | `aws` | 解析 AWS CLI 冗余 JSON,按 service 输出 compact、LLM 友好的摘要 |
| Cloud | `psql` | 检测 table / expanded 显示,剥边框/填充/`(N rows)`,输出紧凑 TSV 或 `[N] key=value`；其他输出 passthrough |
| Cloud | `docker`、`kubectl` | `ps`/`images`/`services`/pod issues 等列表压缩,保留关键状态字段 |
| IaC | `terraform`（`tofu`） | tk-only（RTK 无对应）:`plan` 剥离 state lock/refresh/data-source read 进度、符号 legend 与 `-out` note,保留完整 resource action body 与 `Plan:` 摘要；`test` 剥离 per-run 进度与 box 边框,保留 failed run、error 诊断与 `Success!/Failure!` 摘要；其他子命令 passthrough |
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
- 需要完整原文时用户始终可用 `tk --raw`；失败或大输出还可能写入用户级 raw output 存储。

**禁止模式**（handler 不应生成；若生成会被 quality gate 打回 raw）：

- `Hidden: … not shown`
- `+N more matches/files/packages/errors/commits/branches`
- `[N more lines]`、`... N more lines (use tk --raw …)`
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

## 2. `tk config init`

用户级配置的初始化入口。

```bash
tk config init
```

`tk config init` 负责：

1. 创建用户级 JSONC 配置文件。
2. 初始化用户级数据目录，用于 history、raw output、cache 和 telemetry export。
3. 写入注释化示例配置，不自动开启 telemetry、hook install 或任何项目写入。
4. 如果配置文件已存在，默认不覆盖，提示用户使用显式覆盖选项。

用户级配置影响该用户所有项目。详见 [Configuration](#configuration)。

---

## 3. Hook System

> **Status: shipped（Copilot-CLI-only，命令改写，无 `modifiedResult`）** — pretool 改写 + direct-tool 治理 + prompt/error 事件 + `tk init --host copilot-cli` 安装均已落地（`src/hook/*`）。posttool 成功路径结果压缩（`modifiedResult`）仍 deferred。

> **交付模型（已锁定，见 [ADR 0002](adr/0002-shim-delivery-tier-and-passthrough.md)、CONTEXT.md《Delivery》、`docs/layer2-hook-protocol-spike.md`）：** 命令压缩的**主交付层是 PATH shim**（host-agnostic，覆盖 VS Code 等所有宿主），不是 hook。GitHub Copilot hook 在用户的 VS Code 企业环境里不触发，因此**本节的 hook 只面向 Copilot CLI**，并走 **RTK 式**：pretool 把终端命令改写成 `tk <command>` 前缀，压缩由 `tk` proxy 完成，**hook 不做 posttool `modifiedResult` 结果替换**。direct tool 的结果压缩（需 `modifiedResult`）目前 **deferred**；hook 对 direct tool 只做治理（deny 依赖目录/lockfile 读取），不压缩。安装统一走 `tk init`（默认 `vscode`→shim，`tk init --host copilot-cli` 装 Copilot CLI hook），**不再有独立的 `tk hook install`/`tk hook init` 子命令**。

Hook 是 Token Killer 在 Copilot CLI 工具调用链中的拦截点。它是 `tk <command>` 之外的运行时适配层：命令代理继续覆盖 shell/terminal 命令，hook runtime 把 Copilot CLI 的 terminal tool event 改写成 `tk <command>` 前缀。direct tools（`read_file`、`grep_search`、`list_dir`、`file_search`、`fetch_webpage`、GitHub MCP 等）作为一等**治理**对象（deny/warn），但结果压缩 deferred；VS Code 下这些工作交给 shim 与 inspect，不由 hook 处理。

Hook runtime 通过 stdin JSON 与宿主通信，自动识别 Copilot CLI camelCase payload（hook 运行时实际消费）和 VS Code Copilot Chat snake_case payload（normalizer 与 inspect 共用）。输入首先被归一化为 tool event，再按工具类型分流：

| Tool kind | 示例 | pretool 行为 | posttool 行为 |
|-----------|------|--------------|---------------|
| Terminal command | `powershell`、`run_in_terminal`、`shell` | 提取 command string，安全时 rewrite/suggest 到 `tk <command>` | 未 rewrite 或宿主已执行时，对 raw terminal output 做兜底压缩 |
| Direct read | `read_file`、`view` | 检查路径、大小、目录，阻断依赖目录、构建产物、lockfile 等高成本读取 | 对成功读取结果做 filter，返回 `modifiedResult` |
| Direct search | `grep_search`、`rg`、`grep` | 检查搜索范围，提示限定路径或忽略生成目录 | 压缩匹配结果，保留所有关键匹配 |
| Direct list | `list_dir`、`glob`、`file_search` | 检查路径和深度，阻断依赖目录和构建产物 | 压缩目录/文件列表 |
| Direct web / MCP | `fetch_webpage`、GitHub MCP file/search tools | 检查 URL、repo scope、query 宽度和输出上限 | heading/result grouping + raw recovery；不 telemetry 化 raw content |
| Edit / mutation | `apply_patch`、`edit`、`replace_string_in_file`、`create_file`、mutating shell commands | 通常不 rewrite；可做路径策略、dry-run/confirmation 提示 | 记录输入/输出长度和结果；不对补丁内容做破坏性压缩 |
| Unknown | 未识别工具 | fail-open | fail-open |

Direct tools 不伪装成 shell command，也不走 `tk cat` / `tk rg` rewrite。它们通过 pretool policy 适配（治理）；terminal tools 进入 command rewrite registry 并复用现有 command proxy pipeline（pretool 改写为 `tk <command>` 前缀）。**当前 goal 范围只实现 pretool（terminal 改写 + direct tool 治理）；上表 posttool 列描述的 `modifiedResult` 结果压缩整体 deferred，是 Copilot CLI 专属的未来能力。**

Hook 只支持用户级安装。Hook 配置写入用户级 Token Killer 数据目录，影响该用户显式接入的 Copilot surface；项目仓库不保存 hook 配置。

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

### 3.1 Hook 入口与安装

仿 RTK 的两层拆分（`rtk init` 装、`rtk hook claude` 跑）：

**配置进宿主的命令是 `tk hook copilot`**（仿 `rtk hook copilot`）——单一 host 命名的处理器，从 stdin 读 Copilot hook payload，按 event 分流：`preToolUse` 把终端命令改写成 `tk <command>` 前缀（direct tool 只治理）、`userPromptSubmitted` 做 prompt 检查、`errorOccurred` 追加恢复建议。它**只加前缀、不替换结果**，压缩交给 `tk` proxy。

```bash
tk hook copilot     # 写进 ~/.copilot/hooks/ 的事件处理器（RTK 式命令改写，仅 Copilot CLI）
tk hook check <cmd> # dry-run：查看某条命令会被如何改写（仿 rtk hook check）
```

**安装/卸载统一走 `tk init`**（仿 `rtk init`），它把上面的命令 patch 进宿主 hook 配置——`tk hook copilot` 本身不是安装器，而是 `tk init` 指向的运行时处理器：

```bash
tk init                     # 默认 host=vscode → 装 shim（命令压缩主交付层）
tk init --host copilot-cli  # 把 tk hook copilot 写进 ~/.copilot/hooks/（仿 rtk init --copilot）
tk init --show              # 查看当前 tier / 安装状态
tk init --dry-run           # 预览改动，不写盘
tk init --uninstall         # 移除
```

**没有独立的 `tk hook install`/`tk hook init`/`tk hook status` 子命令**：安装是 `tk init` 的职责，运行时处理是 `tk hook copilot` 的职责。`tk hook posttool`（成功路径 `modifiedResult` 结果压缩）整体 deferred。

**Hook 配置产物**（格式实测自 `rtk init --copilot` 生成的 `.github/hooks/rtk-rewrite.json`）：

```jsonc
{
  "hooks": {
    "PreToolUse": [
      { "type": "command", "command": "tk hook copilot", "cwd": ".", "timeout": 5 }
    ]
  }
}
```

写入位置（**tk 与 RTK 的分歧**：RTK 默认写进项目仓库 `.github/`，tk 默认用户级）：

- **Copilot CLI（默认）→ 用户级 `~/.copilot/hooks/tk-rewrite.json`**，符合「默认不写项目仓库」（§15）。
- 仓库级 `.github/hooks/tk-rewrite.json` 仅 `tk init --project` 显式 opt-in。
- 兜底注入 `.github/copilot-instructions.md`（仿 RTK，告诉模型给命令加 `tk` 前缀）：默认用户级，`--project` 才写仓库。

`timeout` 配合 Copilot CLI preToolUse 的 **fail-closed** 语义，要求处理器必须快且内部 fail-open（异常一律输出 `allow`），否则超时/崩溃会阻断工具调用（§3.6）。

### 3.2 pretool hook

在 Copilot 调用工具之前拦截。输入 stdin JSON 包含 tool name、tool input、工作目录和可选 prompt/session metadata；只有 terminal tools 才必然包含 command string。

核心职责：

- 归一化 Copilot SDK camelCase payload（`toolName`、`toolArgs`）和 VS Code snake_case payload（`tool_name`、`tool_input`）。
- 识别高浪费工具调用模式（raw shell command、全仓搜索、读依赖目录文件、读大文件）。
- 输出四种决策：`allow`（放行）、`warn`（附改写建议）、`deny`（附原因）、`rewrite`（改写后的 command）。
- 对 terminal tools 中的 `rg`、`grep`、`cat`、`git status`、`npm test` 等给出 `tk` wrapper 改写。
- 对 direct read/search/list tools 做 policy 判断，不把它们改写成 shell command。
- 对 web fetch / GitHub MCP 结果做 source-aware projection，按 total output 和 max output 识别高成本来源。
- 对 edit/create/apply_patch 和 mutating shell commands 默认不 rewrite；只做路径策略、dry-run/confirmation 建议和长度记录。
- 对 `docker logs`、`kubectl logs` 按 mode 给出 suggest 或 deny。
- 拒绝读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。

### 3.3 posttool hook

> **Status: deferred** — 成功路径的结果压缩依赖 `modifiedResult`（Copilot CLI 专属能力），当前 goal 不实现。RTK 式 hook 的压缩由 pretool 改写后的 `tk` proxy 完成，无需 posttool 替换结果；本节描述未来形态。

在 Copilot 工具成功执行之后拦截。VS Code `PostToolUse` payload 使用 `tool_response` / `tool_result`，Copilot SDK payload 使用 `toolResult`。Token Killer 在这里压缩工具输出，并在宿主支持时返回 `modifiedResult` 替换原结果。

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

- `rewrite` — 改写后的 `tk` 命令字符串
- `suggest` — 不改写，附建议文本
- `pass` — 放行（已经是 tk 命令、或语义不等价场景）
- `deny` — 阻断并附原因

**改写规则**：

| 原始命令 | 改写 |
|---------|------|
| `rg <pattern> <path>` | `tk rg <pattern> <path>` |
| `grep -r <pattern> <path>` | `tk grep -r <pattern> <path>` |
| `cat <file>` | `tk cat <file>` |
| `git status` | `tk git status` |
| `git diff` | `tk git diff` |
| `git log` | `tk git log` |
| `git branch` | `tk git branch` |
| `npm test` / `pnpm test` | `tk npm test` |
| `tsc --noEmit` | `tk tsc --noEmit` |
| `eslint <path>` | `tk eslint <path>` |
| `find <path> -name <pattern>` | `tk find <path> -name <pattern>` |
| `ls <path>` | `tk ls <path>` |
| `mvn test` | `tk mvn test` |
| `gradle test` | `tk gradle test` |

**不改写场景**：

- 已经是 `tk` 命令 → pass（不嵌套改写）。
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

## 4. Copilot Context Optimizer

Copilot context optimizer 不是 runtime compressor。它优化 GitHub Copilot 会自动或半自动带入模型的上下文表面：instructions、prompt files、custom agents、AGENTS.md/CLAUDE.md、skills 和稳定 prompt prefix。

**只有一个 `tk inspect`。** 静态 context 分析不是一个独立的扫描命令，而是 `tk inspect`（§9）的一组分析器，和 prompt/session/tool/input/output/cache/skill 等运行时分析器并列，**默认全跑**，产出统一的 finding 报告。context optimizer 不是平行的第二个 inspect，而是 inspect 的**下游消费者**：

1. **Inspect**（§9，唯一的只读分析入口）：跑全部分析器，给出 evidence、finding type、severity、surface、`fix_class`。静态 context finding 是其中 `source = static_context` 的子集。
2. **Optimize**（`tk optimize context`）：读 inspect 的 finding 数据，只处理安全子集；其余输出 suggested diff 或 advice artifact，由用户决定。它先检查是否有持久化 inspect 报告（`~/.token-killer/projects/<fingerprint>/inspect/latest.json`），有则读、没有则触发一次 inspect 现算。

很多 context 优化不是脚本能直接完成的代码改写，而是团队 workflow 决策：哪些规则应该 repo-wide，哪些应该 path-specific，哪些 task workflow 应沉淀为 prompt file，哪些 custom agent 需要显式选择。Token Killer 必须把这些列为 advisory，不默认重写项目仓库。

实施计划见 [`docs/context-optimizer-implementation-goal.md`](context-optimizer-implementation-goal.md)。

### 4.1 命令

静态 context 分析由唯一的 `tk inspect`（§9）默认承担，不再有独立的 `--copilot-context` 扫描命令。可选的窄化 flag 只缩小分析器范围与作用域，不改变"一个 inspect"的事实。静态 context **按作用域区分**（ADR 0003）：裸 `tk inspect` 默认跑**用户级**全局 context（token 杠杆最大、可在任何地方跑），`--project` 选当前仓库；runtime 与作用域正交、始终跑：

```bash
tk inspect                              # 默认：用户级静态 context + runtime
tk inspect --project                    # 项目静态 context + runtime
tk inspect --project --user             # 两级 + runtime
tk inspect --copilot-context            # 只跑静态 context 分析器（关 runtime，默认用户级）
tk inspect --surface skills             # 进一步窄化到某个 context surface
tk inspect --json                       # 统一 finding 报告（JSON）

tk optimize context                     # TTY 下进入交互式 optimize；非 TTY 要求显式模式
tk optimize context --dry-run           # 读 inspect finding，生成可审查 diff，不写盘
tk optimize context --apply-safe        # 只应用低风险机械修复
tk optimize context --yes               # 非交互接受全部 direct_restorable；不应用 advice/suggested diff
tk optimize context --restore           # 恢复 Token Killer direct modifications
tk optimize context --vscode-settings --apply-safe # 仅应用可恢复的用户级 VS Code settings 修复
tk optimize context --write-advice      # 写入用户级 advice artifact
```

兼容短命令可以保留，但语义必须映射到"inspect 分析 → optimize 动作"模型：

```bash
tk skill scan                # alias: tk inspect --surface skills
tk skill optimize --dry-run  # alias: tk optimize context --surface skills --dry-run
tk agentsmd patch            # alias: tk optimize context --apply-safe --token-budget-block
tk agentsmd restore          # restore Token Killer managed marker block
```

### 4.2 Context surfaces

| Surface | 作用 | Inspect 重点 | Optimize 策略 |
|---------|------|--------------|---------------|
| `.github/copilot-instructions.md` | repo-wide Copilot guidance | always-on bloat、任务流程误放、与 AGENTS.md 重复或冲突 | 默认 suggested diff；不自动重写项目文件 |
| `.github/instructions/*.instructions.md` | path-specific guidance | `applyTo` 过宽、路径规则重叠、repo-wide 规则重复 | suggested diff；可提示收窄 glob |
| `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` | agent routing 和 tool-specific guidance | 重复长规则、把完整文档当索引、跨 agent 冲突 | 用户级 marker block 可自动；项目内只建议 |
| `.github/prompts/*.prompt.md` | on-demand task workflow | 高频任务流程仍写在 always-on instruction | advice：建议抽成 prompt file |
| `.github/agents/*.agent.md` | explicit Copilot custom agent | persona 过泛、tools/model 过宽、和 instructions 重复 | advice 或 suggested diff，不默认 apply |
| User skills | tool/agent workflow extensions | invocation policy、description 宽度、入口文件过长、examples 常驻注入 | 用户级 skills 可 dry-run/apply；项目内只建议 |
| VS Code Copilot settings | Copilot Chat / Agent behavior toggles | terminal output compression、instruction auto-include、nested AGENTS、MCP discovery、extra read folders、agent request budget | 部分 user settings 可 safe apply；其余 advice |
| Stable prompt prefix | cacheability layer | volatile 内容混入 stable prefix、重复 guidance bytes、heading/key order 不稳定 | diagnostics/advice；不声称 provider token savings |

### 4.3 Finding taxonomy

| Finding | 检测逻辑 | 默认处理 |
|---------|----------|----------|
| `always_on_bloat` | always-on instruction 超过阈值，或包含长 workflow/examples | suggested diff / advice |
| `conditional_rule_in_always_on` | 语言、路径、框架专用规则写在 repo-wide instruction | 建议迁移到 `.instructions.md` |
| `task_prompt_in_instruction` | review、generate tests、migration plan 等任务模板写进 always-on | 建议迁移到 `.github/prompts/*.prompt.md` |
| `instruction_duplicate` | AGENTS.md、CLAUDE.md、copilot-instructions 或 skills 重复大段规则 | suggested diff / advice |
| `instruction_conflict` | 多层 instructions 对命令、风格、路径或验证策略冲突 | advisory only |
| `copilot_review_truncation` | Copilot review 关键规则落在 4000 字符后 | suggested diff：前置关键规则 |
| `agent_overbreadth` | custom agent persona、tools 或 model policy 过宽 | advisory only |
| `skill_invocation_policy` | skill 缺 invocation metadata，或副作用/重型 skill 可自动触发 | 用户级可 suggested diff；是否 apply 需确认 |
| `skill_entrypoint_bloat` | SKILL.md 常驻入口过长，内联 examples/references/scripts | 建议 progressive disclosure |
| `vscode_terminal_compression_disabled` | `chat.tools.compressOutput.enabled` 未开启 | 用户级 settings 可 direct apply |
| `vscode_context_surface_risk` | nested AGENTS、parent customizations、referenced instructions、extra read folders、MCP discovery、codesearch 等扩大上下文面 | advisory only |
| `vscode_agent_budget_risk` | `chat.agent.maxRequests` 明显偏高，或 auto-fix/auto-discovery 可能触发额外循环 | advisory only |
| `cacheability_churn` | timestamp、run id、临时路径、最新日志混入 stable prefix | diagnostics/advice |

### 4.4 Optimize classes

Optimize 分两层，不能混在一个“自动优化”概念里：

| Layer | 例子 | 写入策略 |
|-------|------|----------|
| **Direct modify / restorable** | 写入 AGENTS / copilot-instructions managed block，要求 agent 主动使用 `tk <command>`（仿 RTK instruction injection）；写入 Token Budget block；给用户级 skill 加高置信 invocation frontmatter；把用户级 VS Code `chat.tools.compressOutput.enabled` 设为 `true` | `--apply-safe` 可写；必须 backup 或 marker-based restore |
| **Detect and advise** | 拆 always-on instruction、前置 review 规则、收窄 `applyTo`、抽 prompt file、custom agent 工具/模型收窄、nested AGENTS / parent customizations / extra read folders / MCP discovery / codesearch 等 VS Code 设置风险 | inspect finding + `--dry-run` suggested diff 或 `--write-advice`；默认不写 |
| **Non-goal** | 自动重写团队工作流、删除项目规则、跨 surface 自作主张合并语义、把 Claude-only field 当成 Copilot 设置 | never apply |

Direct modify 不是“语义重写”。它只允许可逆的、低风险的、Token Killer 可解释的机械操作：

- **Instruction injection**：在用户级 AGENTS / copilot-instructions 目标内插入 marker block，要求高输出 shell 命令优先使用 `tk <command>`；项目级只在显式 `--project` 时写，且同样 marker 可恢复。
- **Token budget block**：插入 §5 的短规则块，保持 ≤ 15 行、无 volatile 内容。
- **Skill invocation frontmatter**：仅用户级 skill、仅高置信副作用/重型 workflow，写入前备份，restore 回滚。
- **VS Code settings**：仅用户级 settings，设置 `chat.tools.compressOutput.enabled: true`；其他 Copilot setting 默认 advisory。

默认 `tk optimize context` 在 TTY 中可以是交互式流程：按 `Direct and restorable`、`Suggested diffs`、`Advice only` 分组展示 finding，让用户逐项查看 diff、应用、跳过或写 advice。非 TTY 中 bare command 必须失败并要求选择 `--dry-run`、`--apply-safe`、`--write-advice`、`--restore` 或 `--yes`，不能暗中写盘或等待输入。

### 4.5 Safety policy

- `inspect` 永远只读，不修改 instructions、prompts、agents、skills 或项目仓库。
- `optimize --apply-safe` 默认只写用户级文件；项目内文件只有显式 `--project` 且属于 Token Killer managed marker block 时才允许写。
- 所有写操作先备份，输出 unified diff，并必须有 restore path。
- VS Code settings 写入必须记录原值；restore 恢复原值，原本不存在则删除该 key。
- 不把本地 store 命中、instruction dedupe 或 prompt prefix 稳定性计入 provider token savings；只能表述为 cost heuristic 或 likely token pressure reduction。
- Copilot、Claude、Gemini 和 Codex 的 instruction/skill 字段不完全兼容；adapter 必须标明 target surface，不把 Claude-only frontmatter 当成通用规则。

---

## 5. Managed Token Budget Block

向用户级 agent 指令文件追加短 token budget 指示和 `tk <command>` 使用指令。这是 Copilot context optimizer 中可安全自动化的最小子集，而不是完整 context 优化。

项目内 `AGENTS.md`、`CLAUDE.md`、`COPILOT.md` 只做只读分析或输出建议，不由 Token Killer 自动 patch。

### 5.1 命令

```bash
tk agentsmd patch          # 追加用户级 token budget 规则
tk agentsmd restore        # 移除 tk 追加的用户级内容
```

### 5.2 追加内容

使用 HTML comment marker 标记块，保证可识别和可恢复：

```markdown
<!-- token-killer:start -->
## Token Budget
- Treat context as a limited budget; gather only what is needed to act safely.
- Search before reading: use `rg` / `rg --files`, then open focused files or line ranges.
- Prefer diffs, diagnostics, symbol hits, and targeted snippets over whole-file or full-log reads.
- Avoid generated files, dependency folders, build outputs, lockfiles, and ignored paths unless required.
- Cap command output and expand only when a specific missing detail is needed.
- Do not reread unchanged files; cite the earlier read instead.
- Stop exploring once there is enough context to implement or answer safely.
- When running terminal commands for the agent, use `tk <original command>` when a `tk` handler exists; use raw commands only when exact output or interactivity is required.
<!-- token-killer:end -->
```

The block is deliberately short, stable, and generic enough for always-on injection. It
combines RTK-style command-prefix guidance with context-budget behavior, stays ≤ 15 lines,
and contains no volatile content so it remains cacheable (`cacheability_churn`-clean).

### 5.3 设计约束

- 追加内容严格控制在 15 行以内。
- 使用 marker block，不覆盖用户原有内容（marker 外内容原样保留）。
- 不把完整模型策略、命令表或公司规范塞进 agent 指令文件。
- `restore` 只移除 `<!-- token-killer:start -->` 到 `<!-- token-killer:end -->` 之间的内容，marker 外的修改不受影响。
- 如文件不存在则跳过或提示后创建。

---

## 6. Built-in Filters

Token Killer 不提供项目级自定义 filter engine。输出压缩只来自内置 command handlers、tool-level filters 和 quality gate。

### 6.1 设计约束

- 不读取项目仓库里的 `.tk/filters.yaml` 或类似规则文件。
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

每次 `tk` 命令执行（hook 拦截 planned）都追加写入：

`~/.token-killer/projects/<project_fingerprint>/history.jsonl`

`project_fingerprint` 为 `repo:` + SHA-256(`realpath(cwd)`) 前 12 位十六进制（避免 macOS `/var` vs `/private/var` 路径别名导致 fingerprint 不一致）。测试可通过环境变量 `TOKEN_KILLER_HOME` 覆盖数据根目录。

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

`raw_output_path` 为相对于 `TOKEN_KILLER_HOME`（默认 `~/.token-killer`）的路径。

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
tk report              # 当前项目 fingerprint 的报告（文本格式）
tk report --user       # 用户级聚合报告
tk report --json       # JSON 格式（机器可读）
tk report --csv        # CSV 格式
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

- `device_hash` — `sha256(deviceSalt)`, a per-install **anonymous** id (ADR 0004).
  Allowed **only** for opt-in (`telemetry: true`) enterprise upload, where stable
  cross-run correlation is intended. It is NOT a user, account, repo or session id;
  `tk telemetry purge` deletes the salt and resets it. Absent from the local export
  unless telemetry is opted in.

Disallowed fields:

- Raw commands or command arguments.
- File paths, repository names or session identifiers.
- Raw output snippets.
- Raw prompt content.
- Source code, logs or file content.

> The shipped payload (schema "2", ADR 0004 §5) is a **subset** of the list above —
> `handler` already names the compressor family, so `compressor_family_counts` /
> `avg_compression_ratio_by_family` are dropped. The allow-list is enforced **in
> code**: the builder physically constructs only allowed fields. See
> [TELEMETRY.md](./TELEMETRY.md) for the exact field-by-field contract.

---

## 9. Inspect — 统一只读分析入口

`tk inspect` 是 Token Killer **唯一的只读分析入口**，**默认跑全部分析器**，产出一份统一的 finding 报告。它同时覆盖两类证据：

- **Runtime（会话证据）**：扫描 Copilot 会话历史和本地工具调用，找出终端命令中可用 `tk <command>` 替代的遗漏机会，以及 direct tool 中读/搜/列目录/web/MCP 操作本应由 hook runtime 治理的高成本模式；并分析 prompt / session / tool / input / output 维度。
- **Static context（静态上下文）**：扫描 instructions / prompt files / custom agents / AGENTS.md/CLAUDE.md / skills / stable prefix 这些 Copilot 自动带入模型的上下文表面（finding 分类见 §4.3）。这是 inspect 的一组分析器，**不是**独立的 `--copilot-context` 扫描命令。按**作用域**区分（ADR 0003）：默认跑**用户级**全局 context（每个会话都加载、token 杠杆最大），`--project` 选当前仓库；runtime 与作用域正交、始终跑。

`tk optimize context`（§4）是 inspect 的下游消费者，读 inspect 的 `source = static_context` finding 做针对性修改。

```bash
tk inspect                    # 默认：用户级静态 context + runtime（作用域见 ADR 0003）
tk inspect --project          # 项目静态 context + runtime
tk inspect --user             # 仅用户级（与默认同；可与 --project 组合表示两级）
tk inspect --input-type vscode
tk inspect --input-type copilot-cli
tk inspect --copilot-context  # 窄化：只跑静态 context 分析器（关 runtime）
tk inspect --surface <name>   # 窄化到某个 context surface（instructions/prompts/agents/skills）
tk inspect --since 7d         # 仅扫描最近 7 天（只作用于带可靠时间戳的 runtime 记录）
tk inspect --session <id>     # 扫描指定 session
tk inspect --json             # JSON 格式输出（统一 finding 报告）
tk inspect --repo-context     # 附加只读 repo context
tk inspect --write-advice     # 写入用户级建议文件
tk inspect --telemetry-export # 显式导出匿名聚合 telemetry
tk inspect --fail-on <sev>    # opt-in：存在 ≥该 severity 的 finding 时 exit 4（info|warn|error）
```

`--copilot-context`（只跑静态）与 runtime-only flag（`--since`/`--session`/`--input-type`）互斥，同时传为
invalid-argument（exit 1），不是静默 no-op；scope flag（`--project`/`--user`）与两个轴自由组合。Exit code：
`0` 报告生成（含 warning）· `1` 用户输入/配置错误 · `2` runtime 与 static context 均为空 · `3` 内部错误 ·
`4` 仅当传 `--fail-on` 且存在达到该 severity 的 finding（不复用 `2`；finding 本身从不改变 exit code）。
代码落地：`src/inspect/cli.ts` 解析 scope/analyzer/`--fail-on` 轴并经 `src/inspect/staticContext.ts` 调用
`src/context/analyzer.ts`，统一 `Finding` 由 `src/inspect/unified.ts` 合并并按 scope 分桶持久化
（`src/inspect/persist.ts`：`user-context/inspect/latest.json` 与 `projects/<fingerprint>/inspect/latest.json`）。

### 9.0 统一 finding 模型

runtime 与 static context 分析归一到一套 finding。每条 finding 带 `source` 区分两类；runtime finding 携带聚合 metrics（见下表），static context finding 携带 `surface` / `file` / 行号（见 §4.3）。

```typescript
type FindingSource = "runtime" | "static_context";
type FixClass = "direct_restorable" | "suggested_diff" | "advisory" | "delivery" | "non_goal";
// "delivery" = runtime finding，动作是"装 shim/hook（tk init）"，不改任何文件

interface Finding {
  id: string;
  source: FindingSource;
  type: string;            // runtime: long_output_hotspot | tool_noise | prompt_bloat | repeated_workflow …
                           // static_context: §4.3 taxonomy（always_on_bloat、instruction_conflict …）
  severity: "info" | "warn" | "error";
  confidence: number;
  evidence: string;        // 已脱敏的摘要/片段；绝不含 raw evidence
  recommendation: string;
  fix_class: FixClass;
  // static_context 定位
  surface?: ContextSurface;
  file?: string; start_line?: number; end_line?: number;
  adapter?: "copilot" | "vscode" | "claude" | "gemini" | "codex" | "generic";
  // runtime 聚合 metrics
  category?: ToolCategory;
  metrics?: {
    count: number; share: number;
    total_output_chars: number; total_output_tokens: number;
    avg_output_chars: number; max_output_chars: number;
    total_input_chars: number; max_input_chars: number;
    success_count: number; failure_count: number;
  };
}
```

报告默认按**作用域分桶**持久化（ADR 0003）：用户级到 `~/.token-killer/user-context/inspect/latest.json`，项目级到 `~/.token-killer/projects/<fingerprint>/inspect/latest.json`（`tk optimize context` 按作用域优先读对应桶）。每条 finding 带 `scope`（user/project）；runtime finding 与作用域正交。

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

作为 `tk inspect` 的扩展能力，advice generation 分析 Copilot agent 的重复浪费行为模式，生成 CLI 使用建议、hook 策略建议和用户级规则文件。

### 10.1 命令

```bash
tk inspect --advice                    # 输出浪费模式报告
tk inspect --since 14d --advice        # 分析最近 14 天
tk inspect --write-advice              # 写入用户级 advice 文件
tk inspect --json --advice             # JSON 格式输出
tk inspect --min-confidence 0.7        # 最低置信度阈值
tk inspect --min-occurrences 5         # 最低重复次数阈值
```

### 10.2 检测模式

| 模式 | 检测逻辑 | 建议 |
|------|----------|------|
| Direct tool 读依赖目录 | `read_file` / `view` 路径包含 `node_modules/` | hook pretool deny |
| Direct tool 读大文件 | `read_file` / `view` 输出长度超过阈值 | hook posttool filter，必要时建议 targeted read |
| Direct tool 全仓搜索 | `grep_search` 无 path 或路径为 repo root | hook pretool warn，建议限定 `src/` 或 `tests/` |
| Direct web / MCP 高输出 | `fetch_webpage`、GitHub MCP file/search tool 输出过长或 query 过宽 | heading/result projection，建议收窄 URL、repo、path 或 query |
| 大 tool input payload | `edit`、`apply_patch`、`create_file`、`task` 输入长度超过阈值 | 建议 split patch、引用文件路径或先保存本地 artifact |
| Terminal 搜索依赖目录 | terminal command 中 `rg`/`grep` 路径包含 `node_modules/` | rewrite/suggest 到 `tk rg` 或 deny |
| Terminal 读取 lockfile | terminal command 中 `cat package-lock.json` 等 | warn/deny，建议更窄查询 |
| Terminal 读取构建产物 | terminal command 中 `cat dist/`、`build/`、`target/` | deny 或强烈建议跳过 |
| Terminal 执行全量测试 | `npm test` / `pnpm test` 无过滤参数 | rewrite/suggest 到 `tk npm test` 只看 failures |
| Mutating command safety | `git commit`、`git stash`、`Remove-Item`、文件写删等 mutating operation | 不 rewrite；建议 dry-run、status check、confirmation 或更窄路径 |
| 重复执行相同 workflow | 同一 command family 或 direct tool pattern 在短时间窗口内多次出现 | 建议收窄范围、复用报告或使用 tk；exact command cache 只是辅助建议 |

### 10.3 输出格式

```
Advice Report
Sessions scanned: 8 (last 14 days)
Corrections found: 5

Rule: Prefer tk rg over raw grep in dependency dirs
  Pattern: grep -r <query> node_modules/
  Occurrences: 12
  Confidence: 0.92
  → Use: tk rg <query>

Rule: Prefer tk read --level aggressive for large files
  Pattern: cat <file> where file > 500 lines
  Occurrences: 8
  Confidence: 0.85
  → Use: tk read --level aggressive <file>
```

### 10.4 自动规则写入

`tk inspect --write-advice` 将检测到的规则写入用户级 Token Killer advice 文件：

```markdown
# CLI Corrections (generated by tk inspect)

## Prefer tk rg over raw grep
- **Pattern**: grep -r in dependency directories
- **Correction**: Use `tk rg` which automatically skips node_modules, dist, and build
- **Detected**: 12 occurrences in the last 14 days

## Prefer tk read --level aggressive for large files
- **Pattern**: cat on files > 500 lines
- **Correction**: Use `tk read --level aggressive` for symbol outline; `tk cat` keeps full file content per retention-first policy
- **Detected**: 8 occurrences in the last 14 days
```

### 10.5 与 Context Optimizer 的关系

运行时分析与静态 context 分析**同属一个 `tk inspect`**（§9 默认全跑），不是两个互相独立的扫描命令：

- **Runtime 分析器**：分析 Copilot **运行时行为**（命令执行模式、重复 workflow、长 tool input/output）→ `source = runtime` 的 finding。
- **Static context 分析器**：分析 Copilot **静态上下文表面**（instructions、prompt files、agents、AGENTS.md/CLAUDE.md、skills、stable prefix）→ `source = static_context` 的 finding（§4.3）。

`tk optimize context` 是 inspect 的**下游消费者**，构成"inspect → optimize"闭环：

1. optimize 先查持久化报告（项目级 `~/.token-killer/projects/<fingerprint>/inspect/latest.json`，用户级 `~/.token-killer/user-context/inspect/latest.json`）；有则读，没有则触发一次对应作用域的全量 inspect（`tk inspect --project` 或 `--user`）现算。
2. 它只取 `source = static_context` 的 finding：`fix_class = direct_restorable` 的允许 `--apply-safe` 自动写入并可 restore；`suggested_diff` 默认输出 diff；`advisory` 输出 advice。
3. `source = runtime` 的 finding 由 inspect 自身转成投递建议（`fix_class = delivery`：装 shim/hook，即 `tk init`），不进 optimize 的写盘路径。

运行时 finding 解释实际浪费模式，静态 context finding 判断这些模式是否应沉淀为 durable guidance、prompt file、custom agent 或 skill policy——两者在同一份 inspect 报告里联合呈现。

---

## 11. Model Governance

Token Killer 不托管模型路由，但通过策略层级提供治理能力。产品范围停在 L1-L3：建议、行为治理、以及可靠模型名下的策略。

### L1: Suggest routing

默认启用的最低层级。根据任务特征和行为给出简短模型选择建议：

- **贵模型适合**：架构计划、root cause 分析、代码审查、安全分析。
- **便宜模型适合**：boilerplate 生成、测试生成、简单 patch、日志摘要。
- **高风险组合**：贵模型 + 长输出、贵模型 + raw shell、贵模型 + 大段代码生成。

实现位置：
- `tk agentsmd patch`：在 agent 指令文件中追加短规则。
- `tk hook copilot`（`userPromptSubmitted` 事件，仅 Copilot CLI）：对长 prompt 或明显实现型任务追加 `/model` 建议。
- `tk report`：按行为类型展示风险分布。

### L2: Behavior-based deny

不依赖模型名，只基于行为模式判断。只要行为明显浪费 token，就 warn 或 deny：

- 读取 `node_modules`、`dist`、`build`、`target`、`coverage`、`.git` 内文件、lockfile。
- `cat` 大文件（超过阈值）。
- 无路径限定的全仓搜索（`rg pattern` 无 file path）。
- 日志、测试、构建命令产生超长输出（超过 `output.max_chars`）。
- prompt 超过 `prompt.warn_tokens` 或 `prompt.block_tokens`。

实现位置（hook 仅 Copilot CLI，统一入口 `tk hook copilot` 按事件分流）：
- `preToolUse`：terminal 命令改写为 `tk` 前缀（由 proxy 压缩）；direct tool 阻断/建议（治理）。
- `userPromptSubmitted`：warn 或 block。
- posttool 结果压缩（`modifiedResult`）**deferred**。

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
| macOS / Linux `~/.token-killer/config.jsonc` | 用户级 | 唯一配置 |
| Windows `~\.token-killer\config.jsonc` | 用户级 | 唯一配置 |

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

- **Model input cache**：provider 对稳定 prompt prefix 的复用。Token Killer 不能直接控制它，只能通过稳定布局、确定性格式和 volatile suffix isolation 提高命中机会。
- **Local recovery store**：本地 raw evidence、projection lineage 和 metrics。它用于恢复、审计和减少重复运行，不应被算成 model token savings。
- **Semantic similarity**：只能用于提示“这像某类历史问题”或“有可复用规则”，不能替代 fresh tool output。

Allowed:

- “This output matches a known noisy pattern.”
- “A durable context rule may help here.”
- “This command family often benefits from `tk`.”

Not allowed:

- 用旧命令输出替代当前工具结果。
- 把 embedding similarity 当成事实相等。
- 把 local store hit 计入 provider token savings。

### 13.1 Layer 2: 少产生输出

目标是在工具执行前减少高成本输出。Layer 2 不替代 `tk <command>`；它把 command proxy **交付**进 Copilot 工具调用链。**主交付层是 shim（host-agnostic，覆盖 VS Code 等全宿主）；hook 是 Copilot-CLI-only 的 RTK 式命令改写**（详见 §3 交付模型与 ADR 0002）。

实现边界：

- 新增 tool event normalizer，输入 Copilot CLI / VS Code hook payload，输出统一 tool kind、tool input、tool result、cwd、session metadata（hook 运行时只消费 Copilot CLI 方言，VS Code 方言供 inspect 复用）。
- 新增 rewrite registry，输入 terminal tool 的 raw command，输出 `pass | rewrite | warn | deny`；`rewrite` 只把命令前缀改成 `tk <command>`，压缩由 `tk` proxy 完成。
- `tk hook copilot`（仅 Copilot CLI，配置进 `~/.copilot/hooks/` 的命令）读取 stdin JSON，按事件分流：`preToolUse` 把 terminal command 改写成 `tk` 前缀（由 proxy 压缩）；direct tools 做路径、范围、大小**治理**（deny/warn），不改写、不压缩。
- posttool 成功路径结果压缩（`modifiedResult`）**deferred**：RTK 式改写后 `tk` 已自压缩，无需 posttool 替换结果。
- `tk hook copilot` 的 `errorOccurred` 事件在工具失败后追加恢复建议（`additionalContext`），不替换结果，不把失败当成功输出压缩。
- 命令链、redirect、heredoc、pipe 等语义不等价场景默认 pass。

第一批规则只覆盖高价值命令：

- Terminal command：`cat package-lock.json`、`cat pnpm-lock.yaml` → warn 或 deny。
- Terminal command：`cat node_modules/...`、`cat dist/...` → deny。
- Terminal command：`rg pattern .` → suggest 加路径和 ignore globs，或 rewrite 到 `tk rg`。
- Terminal command：`git diff` → rewrite 到 `tk git diff`。
- Terminal command：`npm test`、`pnpm test`、`yarn test` → rewrite 到对应 `tk` command。
- Direct read：`read_file` / `view` 读取依赖目录、构建产物、lockfile → warn 或 deny（治理）；成功读取的大输出 posttool filter **deferred**。
- Direct search/list：`grep_search`、`list_dir`、`glob`、`file_search` 访问 repo root、依赖目录或构建产物 → warn/deny（治理）；成功结果 posttool compact **deferred**。
- Direct web / MCP：`fetch_webpage`、GitHub MCP file/search tools → pretool 建议收窄 URL、repo、path 或 query（治理）；posttool projection **deferred**。
- Edit / mutation：`apply_patch`、`edit`、`create_file`、`git commit`、`git stash`、删除/覆盖命令 → 默认不 rewrite；只做长度统计、路径策略和 dry-run/confirmation 建议。

### 13.2 Layer 3: 提高 model input cacheability

目标是提高稳定上下文比例、减少重复 raw input 和 cache write。Token Killer 不能直接控制 Copilot 底层 cache，只能让输入更稳定、更可复用；本地 store 命中只代表恢复或 latency 优化，不代表 provider token savings。

Prompt zones:

| Zone | 内容 | 规则 |
|------|------|------|
| Stable | system instructions、tool schemas、Token Killer policy、稳定 glossary | 固定顺序、固定 heading、固定 JSON key order |
| Semi-stable | repository guidance references、ADR/context references、toolchain summary、durable workflow conventions | 用引用和 hash 表达，避免重复注入长文 |
| Volatile | current user request、tool output、timestamps、run IDs、session-specific errors | 放在 suffix，不进入 stable prefix |

Cache-hit practices:

- Stable content appears before volatile content.
- Use canonical JSON key ordering and stable heading names.
- Prefer context references over repeated long guidance.
- Keep timestamps, random IDs, temporary paths, latest command output and generated telemetry IDs out of stable prefixes.

实现边界：

- 优先实现 input diagnostics：统计 prompt prefix churn、stable/volatile ordering、duplicate guidance bytes、tool input payload size。
- 新增 deterministic project context：`~/.token-killer/projects/<fingerprint>/context.md` 与 `context.json`。
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
- 默认不写项目仓库；配置、history、raw output、cache、advice 和 backups 都写入用户级 Token Killer 目录。
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
│   ├── dataDir.ts      # ~/.token-killer 路径与 project fingerprint
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
    ├── index.ts        # handler 注册表（匹配优先级 = 数组顺序，generic 兜底）
    ├── base.ts         # 共享工具（rawText、makeFilteredResult、quality gate）
    ├── generic.ts      # 兜底 handler
    ├── common/         # searchLike、readLike、listLike、diff、grepFilter
    ├── git/            # status、diff、log、show、branch、extended、hostingCli(gh/glab)、graphite(gt)、compactDiff
    ├── js/             # test、eslint、tsc、next、npm、packageList、prisma、prettier、playwright
    ├── python/         # pytest、ruff、mypy、pip
    ├── java/           # maven、gradle、javac
    ├── cloud/          # curl、wget、aws、psql、container(docker/kubectl)
    └── system/         # ls、tree、read(cat)、wc、env、json、log、format、pipe
```
