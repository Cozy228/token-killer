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
