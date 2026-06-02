# Token Guard Design

本文档面向实现 Token Guard 的工程师和 AI Agent。它记录当前产品边界、模块设计和模型治理策略。实现时优先保持简单、可恢复、低侵入，不要把实验能力写成默认承诺。

## Background and problem

GitHub 宣布 Copilot 从 2026 年 6 月 1 日开始转向 usage-based billing，GitHub AI Credits 会按 token usage 消耗，包括 input、output 和 cached tokens。官方公告见：[GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)。

这意味着企业 agent 工作流不能再默认“多给上下文、多跑命令、多输出文本”。Token Guard 要解决的是无意识 token 膨胀：

- 反复读取大文件、lockfile、`node_modules`、构建产物。
- `rg`、`cat`、`npm test`、日志命令输出过长。
- skills 和 instructions 长期常驻注入。
- 长会话没有及时 compact。
- 贵模型被用于大段代码生成、测试生成和噪音工具输出。
- 缺少可审计的压缩效果、阻断记录和节省报告。

README 只面向用户讲 what、why、how 和命令用法；本设计文档承载产品细节、边界、模型治理和 RTK 能力移植方案。

## Product stance

Token Guard 是 Copilot cost-control companion，不是 Copilot wrapper。

用户主路径保持不变：

```text
VS Code Copilot Chat / Agent
GitHub Copilot CLI
GitHub Copilot cloud agent
```

`tg` 负责：

- 初始化 hooks 和项目配置。
- 给 AGENTS.md 追加短 token budget 指示。
- 扫描并优化 skills。
- 在 hook 中阻断、建议或改写高成本工具调用。
- 提供低输出命令 wrappers。
- 记录压缩效果、风险动作和建议采纳率。

默认不做：

- 不替换用户已有 Copilot 入口。
- 不覆盖用户已有 agent 或 skill。
- 不承诺托管 Copilot 会话内完全透明切模型。
- 暂不实现 Claude Code subagent 路由或 AI Gateway 真路由。

## Model governance

当前只做 L1-L5。

### L1: Suggest routing

默认启用。Token Guard 根据任务和行为给出简短建议：

- 贵模型适合：架构计划、root cause、代码审查、安全分析。
- 便宜模型适合：boilerplate、测试生成、简单 patch、日志摘要。
- 高风险组合：贵模型 + 长输出、贵模型 + raw shell、贵模型 + 大段代码生成。

实现位置：

- `tg agentsmd patch` 追加短规则。
- `tg hook prompt` 对长 prompt 或明显实现型任务追加建议。
- `tg report` 展示模型/行为风险。

### L2: Behavior-based deny

不依赖模型名。只要行为明显浪费，就 warn 或 deny：

- 读取 `node_modules`、`dist`、`build`、`.git`、lockfile。
- `cat` 大文件。
- 无路径限定的全仓搜索。
- 日志、测试、构建命令产生超长输出。
- prompt 超过阈值。

实现位置：

- `tg hook pretool`：阻断或建议改用 `tg` wrapper。
- `tg hook posttool`：压缩输出并记录原始/压缩长度。
- `tg hook prompt`：对超长 prompt 做 warn 或 block。

### L3: Model-aware deny

只有当 hook payload、session metadata 或 host environment 能可靠拿到模型名时启用。

规则示例：

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

如果拿不到模型名，必须回退到 L2 行为治理，不能猜测当前模型。

### L4: Explicit session routing

实验能力。用户主动选择 `tg` 高级命令：

```powershell
tg plan
tg impl
tg review
```

设计口径：

- `tg plan`：短计划、低输出、偏贵模型。
- `tg impl`：代码实现、测试生成、偏便宜模型。
- `tg review`：代码审查，可按企业策略选择模型。

这些命令可以启动 Copilot CLI 的特定模型会话、生成 `/model` 指引，或调用可配置的 provider。默认 README 中必须标为 experimental。

### L5: Custom Agent routing

实验能力。Token Guard 可以生成可选 custom agents，例如：

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

- 默认不安装。
- `tg agent suggest` 只输出建议。
- `tg agent install --optional` 才写入 `.github/agents/*`。
- 不修改用户已有 agent。

## Architecture

### CLI core

Node.js CLI，Windows 通过 npm shim 暴露 `tg.cmd`。

核心命令：

```text
tg init
tg hook init
tg hook status
tg config show
tg config set
tg report
```

配置文件：

```text
.tg/config.yaml
```

用户级配置可放在：

```text
%APPDATA%\TokenGuard\config.yaml
```

项目配置优先级高于用户配置。

### Hook runtime

运行时命令：

```text
tg hook pretool
tg hook posttool
tg hook prompt
```

Hook runtime 负责：

- 读取 stdin JSON。
- 自动识别 Copilot CLI 和 VS Code Copilot Chat payload。
- 提取 tool name、command、prompt、model metadata。
- 调用 policy engine。
- 按 host 支持的格式输出 allow、warn、deny 或 updated input。

错误策略：

- 解析失败默认 fail-open。
- 配置缺失默认 fail-open。
- 明确 policy deny 才阻断。
- 不把 hook 内部调试噪音写到 stdout，避免破坏 JSON protocol。

### Rewrite engine

移植 RTK 的核心思想：集中式 command rewrite registry。

输入：

```text
raw command
```

输出：

```text
rewrite | suggest | pass | deny
```

规则：

- 已经是 `tg` 命令时 pass。
- heredoc、redirect write、多文件 head/tail 等危险或语义不等价场景 pass。
- `rg` -> `tg rg`
- `grep` -> `tg rg` 或 `tg grep`
- `cat file` -> `tg cat file`
- `git status` -> `tg git status`
- `git diff` -> `tg diff`
- `npm test` -> `tg test "npm test"`
- `docker logs`、`kubectl logs` -> suggest 或 deny，取决于 mode。

必须支持命令链：

- `&&`、`||`、`;`：分别改写左右命令。
- `|`：默认只改写左侧，右侧保持原样。
- `find ... | xargs ...`：默认不改写，避免破坏管道语义。

### Low-output wrappers

稳定 wrappers：

```text
tg rg
tg cat
tg test
tg diff
tg logs
tg compact
```

优先实现企业日常高浪费场景：

- search：限制结果数量、按文件分组、跳过 ignored paths。
- read：限制行数、支持 head/tail/around、拒绝大文件。
- test：保留 failures、errors、summary，去掉通过用例和进度。
- diff：保留 changed files、hunks summary、关键改动行。
- logs：去重重复行、保留 errors/warnings/timeouts。
- compact：从 stdin 或文件压缩任意输出。

### Filter engine

移植 RTK 的 declarative filter 思路，但用 YAML：

```yaml
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

查找顺序：

1. `.tg/filters.yaml`
2. 用户级 filters
3. 内置 filters
4. passthrough

项目本地 filters 必须有 trust 机制，避免恶意 repo 用 regex/filter 配置影响用户命令行为。

### Skills optimizer

命令：

```text
tg skill scan
tg skill optimize --dry-run
tg skill optimize --apply
tg skill restore
```

扫描项：

- `SKILL.md` 过长。
- examples 常驻注入。
- description 过宽导致自动加载。
- 缺少 `disable-model-invocation`。
- 缺少 `user-invocable`。
- 可拆成 references/examples/scripts 的内容仍写在入口文件。

默认只输出建议。`--apply` 必须先备份，再生成可审查 diff。

### AGENTS patcher

命令：

```text
tg agentsmd patch
tg agentsmd restore
```

追加内容必须短，并使用 marker：

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

不要把完整模型策略、完整命令表或公司开发规范塞进 AGENTS.md。

### Reporting

`tg report` 展示：

- hook 命中次数。
- rewrite 次数。
- deny 次数。
- 原始输出长度和压缩后长度。
- 高风险 prompt 次数。
- skills 可优化数量。
- 用户采纳建议的比例。

报告不记录敏感原文。只记录命令类型、长度、策略结果和时间。

## Configuration

默认配置：

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

模式语义：

- `passive`：只建议和记录。
- `balanced`：明显浪费时阻断，大多数场景建议或改写。
- `strict`：企业强控，raw command、超长 prompt、大文件和贵模型高成本动作直接阻断。

## Implementation constraints

- 文档和实现都必须明确 L6/L7 暂不考虑。
- 所有 repo 写入必须可恢复。
- 不要默认安装 custom agents。
- 不要默认改写用户 skill。
- 不要依赖 RTK 或 Rust。
- 不要把模型名不可见的情况写成可控。
- 不要记录 prompt、源码、日志原文。

## Acceptance criteria

第一版实现完成时应满足：

- `tg init --mode balanced` 可以在 Windows 企业环境初始化项目。
- Copilot hook 能对 raw shell command 给出 rewrite 或 deny-with-suggestion。
- `tg rg`、`tg cat`、`tg test`、`tg diff`、`tg logs` 能显著减少输出。
- `tg skill scan` 能指出高 token skill 风险。
- `tg agentsmd patch` 能追加短规则并 restore。
- `tg report` 能展示非敏感统计。
- README 和 DESIGN 对模型治理口径一致：L1-L5 可做，L6/L7 暂不考虑。
