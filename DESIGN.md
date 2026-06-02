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

`tg` 围绕六个核心能力设计：

- **Command proxy** — 低输出命令 wrappers，RTK 风格改写与压缩。用户通过 `tg <command>` 前缀使用，是产品的主入口。
- **`tg init`** — 项目初始化，生成 `.tg/config.yaml`，可选安装 hooks、追加 AGENTS.md 规则、运行 skill 审计。
- **Hook system** — pretool / posttool / prompt 三类 hook，在 Copilot 工具调用链中拦截、建议、改写或阻断高成本操作。
- **Skills optimizer** — 扫描 agent skills，识别 token 浪费，生成优化 diff。
- **AGENTS.md patcher** — 向项目指令文件追加短 token budget 指示，带标记可恢复。
- **Report & history** — 持久化每次执行的原始/压缩 token 数据，提供汇总报告。

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
                  ├─ outputLimit      # 全局行数/字符数截断
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
| Output limit | `src/core/outputLimit.ts` | 全局行数截断 + 字符数截断，保留重要行 |
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

Handler 分类和压缩策略：

| 分类 | Handler | 压缩策略 |
|------|---------|----------|
| Search | `searchLike`（rg、grep） | 按文件分组，每文件限制条数；识别 `file:line:content` 和 `--null` 格式 |
| Read | `readLike`（cat、type、less） | 内部读取（跳过 shell），大文件（>12K chars）提取 import/export/function/class 符号 + head + tail，二进制直接拒绝 |
| List | `listLike`（ls、dir、find、tree） | 树形摘要，按顶级目录分组计数，跳过 node_modules/dist/build 等噪音目录 |
| Git | `gitStatus` | 解析 verbose status 输出，结构化 staged/modified/untracked/conflicts |
| Git | `gitDiff` | 统计 +added/-removed，保留 hunk headers，大 diff 额外提示用 `--raw` |
| Git | `gitLog` | 解析 commit/Author/Date，截断到最近 20 条 |
| Git | `gitShow` | 保留 commit 元信息 + 首段 diff |
| Git | `gitBranch` | 过滤 current/main/master/codex/\*/release/\* 邻近分支 |
| JS | `jsTest`（npm/pnpm/yarn test、vitest、jest） | 保留 failures + Test Files/Tests 摘要 |
| JS | `eslint` | 保留 error/warning 计数和详情 |
| JS | `tsc` | 保留 type errors，按文件分组 |
| JS | `packageList` | 去重、截断 |
| Python | `pytest` | 保留 FAILED + summary |
| Python | `ruff` | 保留 violations |
| Python | `mypy` | 保留 type errors |
| Python | `pip` | 截断列表 |
| Java | `maven`、`gradle`、`javac` | 保留 errors，丢弃构建进度 |
| Generic | `generic` | head 30 行 + tail 30 行 + 匹配 error/failed/fatal 等重要模式的行 |

### 1.5 FilteredResult

每个 handler 的 `filter()` 返回统一结构，由 pipeline 消费：

```typescript
type FilteredResult = {
  handler: string;         // handler 名称
  output: string;          // 压缩后输出（已去 ANSI + 全局截断）
  rawChars: number;        // 原始字符数
  outputChars: number;     // 压缩后字符数
  rawTokens: number;       // 估算原始 token
  outputTokens: number;    // 估算输出 token
  savedTokens: number;     // 节省 token
  savingsPct: number;      // 节省百分比
  rawOutputPath?: string;  // 原始输出保存路径（如保存）
  exitCode: number;        // 透传原始 exit code
  filterError?: string;    // fallback 时的错误信息
};
```

### 1.6 Rewrite engine

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

## 7. Reporting & History

### 7.1 History

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
  "raw_output_path": ".tg/raw/20260602-103000-git-status.log"
}
```

不记录：prompt 原文、源码内容、日志原文、文件内容。只记录命令类型、长度统计、策略结果和时间。

### 7.2 Report

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
- `--user` 报告按项目分组，展示每个项目的独立统计。
- `--user` 报告额外展示按 model 的风险分布（如可获取模型名）。
- 不记录敏感原文，只记录命令类型、长度、策略结果和时间。

---

## 8. Model Governance

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

## 9. Configuration

### 9.1 配置文件层级

| 位置 | 作用域 | 优先级 |
|------|--------|--------|
| `.tg/config.yaml` | 项目级 | 高（覆盖用户配置） |
| `%APPDATA%/TokenGuard/config.yaml`（Windows）或 `~/.config/tg/config.yaml` | 用户级 | 低 |

### 9.2 默认配置

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

### 9.3 Mode 语义

| mode | 行为 |
|------|------|
| `passive` | 只建议和记录，不阻断任何操作 |
| `balanced` | 明显浪费时阻断（读依赖目录、超长 prompt），大多数场景建议或改写 |
| `strict` | 企业强控：raw command、超长 prompt、大文件读取、贵模型高成本动作直接阻断 |

---

## 10. Implementation Constraints

- L6/L7 暂不考虑，文档和代码必须明确标注。
- 所有 repo 写入（`.tg/`、`AGENTS.md`、skills）必须可恢复（备份或 marker-based restore）。
- 不默认安装 custom agents。
- 不默认改写用户 skill。
- 纯 TypeScript/Node.js 实现，不依赖 RTK 或 Rust。
- 模型名不可靠时不猜测，回退 L2。
- Report 不记录 prompt、源码、日志原文。
- Hook 错误策略默认 fail-open。

---

## 11. Development

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
