# RTK 在 VS Code、Copilot CLI 与 Windows 上的实现研究

> 日期：2026-06-15  
> 目标：判断 RTK 当前是否真的能在 Windows + VS Code + Copilot CLI 上透明 rewrite，并给出 Token Killer 的追平与优化路线。  
> RTK 源码基线：工作区 `rtk/`，`develop`，commit `d8c550eefba41e112bd174d58844a803db6e432f`，tag `dev-0.43.0-rc.276`。本报告涉及的四个核心文件与稳定版 `v0.42.4` 内容一致。  
> Copilot CLI：本机安装 `1.0.59`；截至 2026-06-15，Homebrew 最新稳定版是 `1.0.62`，发布时间为 2026-06-13。

## 1. 结论

RTK 的 command rewrite 能力是真实存在的，但 README 把三件事混在了一起：

1. `rtk-rewrite.sh` 是旧的 shell adapter，不是当前 Copilot 集成的执行入口。
2. 当前 rewrite 逻辑在 Rust 的 `rtk rewrite`、`registry::rewrite_command()` 和 `rtk hook copilot` 中。
3. 当前 RTK 虽然会安装 Copilot hook，但在 TK 的主要目标环境里并没有形成完整可用链路。

当前 RTK 的实际结果如下：

| 场景 | 当前 RTK develop 的实际结果 | 是否透明 rewrite |
|---|---|---:|
| VS Code 当前终端工具 `run_in_terminal` | handler 不识别，stdout 为空 | 否 |
| VS Code 旧名 `runTerminalCommand` | 输出 `updatedInput`，但只保留 `command` | 有条件，可能因 schema 不完整被拒绝 |
| Copilot CLI，Unix `bash`，字符串型 `toolArgs` | 输出完整 `modifiedArgs` | 是 |
| Copilot CLI，Windows `powershell` | handler 不识别，stdout 为空 | 否 |
| Copilot CLI，对象型 `toolArgs` | handler 只接受 JSON string，stdout 为空 | 否 |
| Prompt/instructions 注入 | 会写入 Copilot instructions | 依赖模型遵循，不是确定性 rewrite |

因此，RTK 在 Windows + VS Code + Copilot CLI 这个组合上，当前源码不能作为 TK 的完成态标杆。TK 已经在 Windows 交付、工具名识别、二进制 presence gate、绝对 hook 路径和 shim fallback 上领先；真正需要立即修的是 TK 自己的 VS Code `updatedInput` 协议错误，然后再利用 Copilot CLI 的 `postToolUse.modifiedResult` 扩展到 direct tools。

## 2. 证据分级

本报告按以下优先级判断事实：

1. 当前工作区 RTK/TK 源码与测试。
2. 直接运行 `rtk hook copilot` 的输入输出探针。
3. VS Code 现场 hook 日志与 schema validation 日志。
4. GitHub、VS Code 官方 hook 文档和 Copilot CLI changelog。
5. TK 在 2026-06-10 至 2026-06-11 的 Windows 实机报告。

本次无法重新连接 Windows 测试机，SSH 到 `cozyultra` 超时。因此 Windows 结论中，协议和代码事实是当前的，GUI/ConPTY 性能数据沿用 2026-06-10 至 2026-06-11 的已记录实测，并在文中单独标识。

## 3. 两类 Copilot host 不是同一个协议

### 3.1 VS Code local agent

VS Code hook 当前仍是 Preview，且可能被企业策略关闭。它会从 workspace `.github/hooks/*.json` 和 user hook 目录加载配置。`PreToolUse` 输入使用 snake_case：

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "run_in_terminal",
  "tool_input": {
    "command": "git status",
    "explanation": "Check repository status",
    "goal": "Inspect working tree",
    "mode": "sync"
  }
}
```

透明改写依赖：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "tk git status",
      "explanation": "Check repository status",
      "goal": "Inspect working tree",
      "mode": "sync"
    }
  }
}
```

关键约束是 `updatedInput` 必须满足原工具的完整 input schema。官方文档明确说明，不匹配 schema 时改写会被忽略。VS Code 的 `PostToolUse` 目前只能注入 `additionalContext`，不能替换工具结果，所以不能靠它压缩 `read_file`、`grep_search` 等 direct tool 的已有输出。

### 3.2 Copilot CLI

Copilot CLI 支持两套 event spelling：

| 配置 event key | 输入形状 | 典型输出 |
|---|---|---|
| `preToolUse` | camelCase，`toolName` + `toolArgs` | flat `modifiedArgs` |
| `PreToolUse` | VS Code 兼容，snake_case，`tool_name` + `tool_input` | `updatedInput` 兼容路径 |

官方类型把 `toolArgs` 定义为 `unknown`，实现不应只接受 JSON string。Windows shell tool 的正式名字是 `powershell`，Unix 是 `bash`。

Copilot CLI 从 `1.0.24` 开始明确支持 `modifiedArgs/updatedInput`。当前官方 reference 还支持 `postToolUse.modifiedResult`，command/HTTP config-file hooks 都能替换成功工具结果。这是 TK 在 Copilot CLI 上覆盖 direct tools 的正式协议入口。

Windows 还要求 PowerShell 7 及以上在 PATH。Copilot CLI `preToolUse` command hook 对 crash、非零退出和 timeout 是 fail-closed，所以 hook runtime 不能把普通解析异常变成非零退出。

## 4. `rtk-rewrite.sh` 到底做什么

文件：[`rtk/hooks/claude/rtk-rewrite.sh`](../../rtk/hooks/claude/rtk-rewrite.sh)

它只有约 100 行，是一个薄 adapter：

1. 检查 `jq` 和 `rtk`。
2. 从 `.tool_input.command` 取命令。
3. 调用 `rtk rewrite "$CMD"`。
4. 根据退出码决定 passthrough、deny/defer、ask 或 allow。
5. 用 jq 把 rewritten command 写回原始 `.tool_input`。

退出码协议来自 [`src/hooks/rewrite_cmd.rs`](../../rtk/src/hooks/rewrite_cmd.rs)：

| Exit | 含义 |
|---:|---|
| 0 | rewrite，permission allow |
| 1 | 没有 RTK equivalent，passthrough |
| 2 | deny rule 命中，交给 host 原生权限逻辑 |
| 3 | rewrite，但保留用户确认 |

这个 shell adapter 有一个比当前 native handler 更正确的细节：它先修改 `.tool_input.command`，再返回完整 `.tool_input`，所以 `explanation`、`goal`、`mode`、`timeout` 等字段不会丢。

但它已经是 legacy 路径。当前 Claude 安装常量是 `rtk hook claude`，`init.rs` 会删除旧 `rtk-rewrite.sh`、清理旧 settings entry，并迁移到 native Rust handler。Copilot 安装从一开始就是 `rtk hook copilot`，不经过这个脚本。

所以 README 里“Windows hook 依赖 `rtk-rewrite.sh`，native Windows 只能 injection”的描述已经过时。当前真正的 Windows 阻塞点是 protocol/tool name、hook command PATH、PowerShell command 语义和实际 underlying binary，不是缺少 bash。

## 5. RTK 当前 rewrite 核心

### 5.1 单一 rewrite 源

[`src/hooks/rewrite_cmd.rs`](../../rtk/src/hooks/rewrite_cmd.rs) 和 [`src/hooks/hook_cmd.rs`](../../rtk/src/hooks/hook_cmd.rs) 最终都调用 [`src/discover/registry.rs`](../../rtk/src/discover/registry.rs) 的 `rewrite_command()`。

registry 已覆盖：

- `&&`、`||`、`;`、pipe 等 compound command。
- env prefix、`sudo`、shell builtin prefix。
- backslash line continuation。
- heredoc、command substitution、危险 redirect 的 conservative passthrough。
- `[hooks].exclude_commands`。
- `[hooks].transparent_prefixes`，比如 `shadowenv exec -- git status`。
- permission allow/ask/deny 的组合。
- already-RTK、unsupported command 和安全 redirect。

这部分的测试量和配置能力比 TK 当前 rewrite parser 更成熟。

### 5.2 不应照抄的行为

RTK 会把 pipe producer 改写，比如：

```text
git log -10 | grep feat
```

变成：

```text
rtk git log -10 | grep feat
```

如果 RTK 的过滤改变 producer bytes，下游 `grep`、`wc`、解析器得到的就不是原始结果。TK 当前对 pipe producer 保持 passthrough，能避免 `git diff | grep -c '^+'` 这一类语义错误。这里不需要追平 RTK。

## 6. RTK 的 Copilot 注入与 hook 安装

RTK 在 [`src/hooks/init.rs`](../../rtk/src/hooks/init.rs) 中写一个 dedicated `rtk-rewrite.json`：

```json
{
  "version": 1,
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "rtk hook copilot",
        "cwd": ".",
        "timeout": 5
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "bash": "rtk hook copilot",
        "powershell": "rtk hook copilot",
        "cwd": ".",
        "timeoutSec": 5
      }
    ]
  }
}
```

安装位置：

| Scope | Hook | Instructions |
|---|---|---|
| project | `.github/hooks/rtk-rewrite.json` | `.github/copilot-instructions.md` |
| user | `$COPILOT_HOME/hooks/rtk-rewrite.json` 或 `~/.copilot/hooks/rtk-rewrite.json` | `$COPILOT_HOME/copilot-instructions.md` 或 `~/.copilot/copilot-instructions.md` |

RTK 同时安装 hook 和 instructions。instructions 通过 marker block 合并，保留用户内容；uninstall 只删除 RTK 文件或 RTK block。

这套安装结构值得 TK 追平的部分是：

- 顶层 `version: 1`。
- 同一文件同时覆盖 `PreToolUse` 和 `preToolUse`。
- 支持 `COPILOT_HOME`。
- project/user 两种 scope。

RTK 不值得复制的部分是 bare `rtk hook copilot`。它依赖 hook 子进程 PATH，Windows 上更脆弱。TK 当前把绝对 `node` 和绝对 `cli.js` 写进 hook command，这一点更可靠。

## 7. RTK handler 源码与运行探针

当前 `detect_format()` 只接受：

- snake_case：`runTerminalCommand`、`Bash`、`bash`。
- camelCase：`toolName === "bash"`，且 `toolArgs` 必须是 JSON string。

它不接受：

- VS Code 当前的 `run_in_terminal`。
- Windows Copilot CLI 的 `powershell`。
- 对象型 `toolArgs`。

本报告直接运行工作区构建产物 `target/debug/rtk hook copilot`，结果如下：

| Probe | exit | stdout |
|---|---:|---|
| `tool_name=run_in_terminal` | 0 | empty |
| `tool_name=runTerminalCommand` | 0 | `updatedInput.command=rtk git status` |
| `toolName=bash`, string `toolArgs` | 0 | full `modifiedArgs` |
| `toolName=powershell`, string `toolArgs` | 0 | empty |
| `toolName=bash`, object `toolArgs` | 0 | empty |

`hook_cmd` 测试为 76 passed。测试通过只证明当前实现与当前测试一致，没有覆盖目标 host 的真实协议。

### 7.1 VS Code 字段丢失

RTK native handler 的 VS Code 输出固定为：

```rust
"updatedInput": { "command": rewritten }
```

它没有像 legacy `rtk-rewrite.sh` 那样 clone 原始 `tool_input`。即使补上 `run_in_terminal`，也可能被 VS Code 的完整 schema 拒绝。

开放 PR [rtk-ai/rtk#1800](https://github.com/rtk-ai/rtk/pull/1800) 已同时加入 `run_in_terminal` 和 full `tool_input` preservation，但截至 2026-06-15 仍是 OPEN、MERGEABLE、未合并。当前 develop 不包含该修复。

### 7.2 文档与实现漂移

当前 RTK 文档互相冲突：

- README 说 Copilot CLI 是 deny-with-suggestion。
- supported-agents 说 Copilot CLI 用 `modifiedArgs` 透明改写。
- `hooks/copilot/README.md` 仍说 CLI 不支持 updatedInput。
- 代码实际已经输出 `modifiedArgs`。
- README 说 native Windows 没有 auto-rewrite hook，但 Copilot 安装已经是 native Rust command。

这类漂移说明 TK 不能只看 RTK README 判断能力，必须有 protocol acceptance tests 和 live host probes。

## 8. RTK 在 Windows 上的真实短板

### 8.1 安装写了 `powershell`，runtime 却不识别 `powershell`

RTK config 为 Copilot CLI 写了 `powershell: "rtk hook copilot"`，但收到 `toolName: "powershell"` 后 `detect_format()` 直接 passthrough。这是“hook 被调用，但 rewrite 永远不发生”的静默失败。

### 8.2 bare PATH

hook command 使用 bare `rtk`。如果 Copilot CLI/VS Code 的 hook subprocess 没继承用户安装路径，配置文件存在、hook 也可能显示已加载，但命令启动失败。

### 8.3 PowerShell alias 不是 executable

stock Windows 的 `ls`、`cat`、`wc`、`env` 常是 alias/cmdlet，不是可由 RTK child process 启动的 binary。RTK 的 Windows issue [#1248](https://github.com/rtk-ai/rtk/issues/1248) 仍然开放。

TK 已有 Windows-only presence gate：hook 只 rewrite PATH 上存在的真实 binary，shim 也只为真实 binary 写 wrapper。这一策略比 RTK 更适合目标环境，不应退回“模拟 coreutils”或无条件 rewrite。

### 8.4 PowerShell parser 语义

RTK 和 TK 的 command rewrite 都主要按 POSIX shell 构造理解字符串。PowerShell 的 backtick escape、变量、script block、重定向、native argument passing 与 bash 不完全相同。

TK 当前遇到 backtick 会 conservative passthrough，这不会破坏命令，但会降低 Windows rewrite coverage。下一步应补 PowerShell corpus，不应直接扩大 rewrite 范围。

## 9. TK 当前状态对照

| 维度 | RTK current develop | TK current | 判断 |
|---|---|---|---|
| `run_in_terminal` 识别 | 不支持 | 支持 | TK 领先 |
| `powershell` 识别 | 不支持 | 支持 | TK 领先 |
| object/string tool args | 只支持 CLI JSON string | 两者都能 normalize | TK 领先 |
| CLI metadata preservation | 支持 full `modifiedArgs` | 支持 full `modifiedArgs` | 持平 |
| VS Code metadata preservation | 丢失 | 丢失 | 两边都有 P0 bug |
| Hook config schema | dual event + `version: 1` | 只有 `PreToolUse`，无 `version` | RTK 领先 |
| Hook command | bare `rtk` | absolute node + cli path | TK 领先 |
| `COPILOT_HOME` | 支持 | 当前固定 `~/.copilot` | RTK 领先 |
| Windows binary presence | 无完整 gate | hook + shim 共享 presence gate | TK 领先 |
| VS Code delivery fallback | instruction | shim + env.windows + injection | TK 领先 |
| ConPTY TTY compression | 无专门方案 | `TK_COMPRESS_TTY=1` | TK 领先 |
| Rewrite registry配置 | excludes + transparent prefixes | 无对应用户配置 | RTK 领先 |
| Pipe correctness | rewrite producer | producer passthrough | TK 更安全 |
| CLI direct result compression | 未实现 | 未实现 | TK 的主要机会 |
| 状态/诊断 | 基础 init/show | status、debug、probe、history | TK 领先 |

### 9.1 TK 的已确认 VS Code P0

当前 [`src/hook/copilot.ts`](../../src/hook/copilot.ts) 对 CLI 已正确保留 `ev.toolInput`：

```ts
out.modifiedArgs = { ...ev.toolInput, command: f.command };
```

但 VS Code 分支仍是：

```ts
hook.updatedInput = { command: f.command };
```

2026-06-07 的真实 VS Code 日志已经给出决定性证据：

```text
Tool run_in_terminal updatedInput from preToolUse hook failed schema validation:
Missing property "explanation"; Missing property "goal"; Missing property "mode".
```

修复应是保留整个原始 input，只覆盖 command：

```ts
hook.updatedInput = { ...ev.toolInput, command: f.command };
```

测试必须用带 `explanation`、`goal`、`mode`、`timeout` 的真实形状，不能继续只测 `{ command }`。

### 9.2 TK 当前没有把 VS Code 当 hook-capable host

[`src/shim/hostAdapter.ts`](../../src/shim/hostAdapter.ts) 中：

- Copilot CLI：`hook > shim > injection`。
- VS Code：`shim > injection`，没有 `installHook`。

这与当前官方能力和本机日志不一致。VS Code hook 的确会 fire，只是可能被企业策略禁用，且当前 output schema 写错了。

对目标环境更合适的是 additive hybrid：

1. 安装 user Copilot hook，负责 PreToolUse rewrite、direct-tool governance、session metadata。
2. 同时安装 VS Code shim，负责企业策略禁用 hook 时的 fallback，以及 terminal output 的确定性 compression。
3. instructions 只做 usage guidance，不承担命中保证。

hook 把 `git status` 改成 `tk git status` 后，shim 不会再次拦截 `tk`，所以不会双重包装。

## 10. TK 应做什么

### P0：目标链路正确性

#### P0-1 保留 VS Code 完整 `tool_input` — [#19](https://github.com/Cozy228/token-killer/issues/19)（PR #3）

成功标准：

- `run_in_terminal` 的 required fields 全部保留。
- 现场日志不再出现 schema validation failure。
- rewritten command 实际执行，而不是只看到 hook success。

#### P0-2 把 Copilot hook config 升级成明确的 dual schema — [#20](https://github.com/Cozy228/token-killer/issues/20)（PR #3）

建议写入：

- `version: 1`。
- `PreToolUse`，VS Code-compatible path。
- `preToolUse`，Copilot CLI native path，包含 `bash` 和 `powershell`。
- 两条路径都使用 absolute node + cli command。
- user scope 尊重 `COPILOT_HOME`。

这不是为了复制 RTK，而是让每个 host 走自己的正式协议，避免一条兼容路径承担全部行为。

#### P0-3 建立真实 protocol matrix — [#21](https://github.com/Cozy228/token-killer/issues/21)（PR #3）

至少覆盖：

| Host | Tool | Input | Expected output |
|---|---|---|---|
| VS Code | `run_in_terminal` | object `tool_input` | full `updatedInput` |
| Copilot CLI Windows | `powershell` | string `toolArgs` | full `modifiedArgs` |
| Copilot CLI Windows | `powershell` | object `toolArgs` | full `modifiedArgs` |
| Copilot CLI Unix | `bash` | string/object | full `modifiedArgs` |
| Both | one/two leading UTF-8 BOM | valid payload | normal decision |
| Copilot CLI | malformed, timeout, crash | any | process exit 0, fail-open output policy |

本机 Copilot CLI 应升级到 `1.0.62` 后再做 acceptance test，避免拿 `1.0.59` 的行为定义目标。

#### P0-4 VS Code 采用 hook + shim，而不是单选 tier — [#22](https://github.com/Cozy228/token-killer/issues/22)（milestone `current`）

当前 `Hook > Shim > Injection` 适合“互斥 delivery tier”，不适合 VS Code 这个 host：hook 可能被策略关闭，shim 又有独立的 terminal compression 价值。

成功标准：

- `tk install --host vscode` 同时报告 hook wiring 和 shim probe。
- `tk status` 分别显示 hook config、hook policy/实际 fire、shim PATH、ConPTY opt-in。
- hook 不可用时，shim 仍然工作。

#### P0-5 Windows preflight — [#23](https://github.com/Cozy228/token-killer/issues/23)（milestone `current`）

`tk status` 增加：

- Copilot CLI 版本。
- `pwsh --version`，要求 7+。
- hook command absolute path 是否可执行。
- `~/.copilot/hooks` 或 `COPILOT_HOME/hooks` 是否加载。
- Windows shell tool name 是 `powershell`，不是只探测 `bash`。

### P1：扩大 Copilot CLI 的节省面

#### P1-1 实现 CLI-only `postToolUse.modifiedResult` — [#24](https://github.com/Cozy228/token-killer/issues/24)（milestone `later`）

TK 当前明确写着“No `modifiedResult`, ever”，这个约束已经被最新官方协议推翻。Copilot CLI 能在 `postToolUse` 替换 result，VS Code 不能。

本地 session 数据显示：

- Copilot CLI 历史中 `view` 5972 次，占 36.76%。
- `powershell` 1754 次，占 10.80%；其中 git 610 次，占 powershell 34.78%。
- VS Code transcript 共 1194 次 tool call，direct tools 816 次，terminal 378 次。

因此只优化 terminal 会漏掉大量 direct-tool token。建议：

- 只在 `dialect === "cli"` 启用 result replacement。
- 先支持 `view`、`grep`、`glob` 等已有确定性 handler 能处理的文本结果。
- terminal output 仍走 pre-rewrite/shim，避免 postToolUse 二次压缩。
- fail-open，无法识别 result shape 时返回空输出。
- 保存 raw recovery 指针，沿用 TK 的可恢复设计。

#### P1-2 PowerShell rewrite corpus — [#25](https://github.com/Cozy228/token-killer/issues/25)（milestone `current`）

先建立测试语料，再扩 parser：

- `;`、pipeline、`2>&1`、`*>`。
- backtick continuation/escape。
- `$()`、`${}`、script block。
- quoted native arguments。
- `cmd /c`、`pwsh -Command` 嵌套。
- PowerShell alias 和真实 executable 的区别。

目标是扩大“可证明等价”的 rewrite，而不是提高 rewrite 百分比。

#### P1-3 delivery 状态持久化 — [#26](https://github.com/Cozy228/token-killer/issues/26)（milestone `current`）

当前 auto-detect 会因 `TERM_PROGRAM` 和残留 `~/.copilot` 改变 primary host。对于 VS Code + Copilot CLI 共存环境，状态应是 capability matrix，不应只有一个 active tier。

建议记录并显示：

- VS Code hook installed/fired/blocked-by-policy。
- Copilot CLI hook installed/fired。
- shim installed/probe/TTY opt-in。
- instructions installed。
- last verified timestamp 和 host version。

#### P1-4 测量 hook/shim cold start — 未单开 issue（并入 `docs/runtime-startup-perf-*`）

当前 macOS VS Code hook 日志约 44 ms。Windows 企业机历史数据中，Node cold start 可到 300 ms，完整 `tk git status` 可到 1300 ms。不要因为 RTK 是 Rust 就直接启动 native rewrite；公司没有 Rust/Go toolchain，这条路线不符合组织约束。

先做：

- Node compile cache。
- hot-path lazy imports。
- wrapper 已解析 real binary 的复用。
- hook 与 shim 分开测 p50/p95。

只有长期 Node startup floor 经测量仍不可接受，再讨论 persistent Node process 或 daemon。

### P2：选择性追平 RTK — [#27](https://github.com/Cozy228/token-killer/issues/27)（milestone `later`）

可以追平：

- `exclude_commands`。
- `transparent_prefixes`。
- safe fd duplication，例如允许 `2>&1`，继续拒绝写文件 redirect。
- line continuation、prefix nesting、permission precedence 的更多回归测试。
- `COPILOT_HOME` 和 top-level `version: 1`。

不应追平：

- pipe producer rewrite。
- bare `tk` hook command。
- 无 presence gate 的 Windows alias 包装。
- 把 injection 描述成确定性交付。
- 为追求 startup 直接复制 Rust 实现。

Windows shim 还应保留一个独立 hardening item：`.cmd` wrapper 使用 `%*`，受 `cmd.exe` 约 8191 字符 command-line limit 约束。长命令需要单独回归，必要时改用 response file、临时 payload 或不经 `.cmd` 的启动方式。

## 11. 推荐目标架构

### Windows + VS Code local agent

```text
PreToolUse hook
  -> preserve full tool_input
  -> rewrite run_in_terminal command to absolute tk invocation or tk command
  -> direct-tool governance

VS Code terminal env
  -> shim PATH
  -> TK_COMPRESS_TTY=1
  -> deterministic terminal compression when hook is disabled or bypassed

Instructions
  -> usage guidance only
```

### Windows + Copilot CLI

```text
preToolUse
  -> recognize powershell
  -> preserve full toolArgs
  -> modifiedArgs rewrite

postToolUse
  -> direct-tool result compression via modifiedResult
  -> no second compression for terminal tools

status
  -> verify pwsh 7+, CLI version, hook source, hook fire, absolute command
```

这两条路径共用 normalizer、rewrite eligibility、handler registry、raw recovery 和 ledger，但 wire protocol 与 result capability 必须按 host 分开。

## 12. 建议实施顺序

1. 修复 VS Code full `updatedInput` preservation，并用真实 schema 回归。
2. dual hook config + `version: 1` + `COPILOT_HOME` + `powershell` acceptance test。
3. VS Code 改成 additive hook + shim，status 拆成 capability matrix。
4. 在 Windows + Copilot CLI 1.0.62 做端到端 rewrite 验证。
5. 实现 CLI-only direct-tool `postToolUse.modifiedResult` 最小切片。
6. 补 PowerShell corpus、safe redirect、long command 和性能基线。
7. 最后再加 RTK 的 excludes/transparent prefixes 等配置能力。

前四项完成前，不建议继续扩更多 formatter/handler。当前最大的风险不在压缩算法，而在“配置看起来安装成功，host 实际没有执行 rewritten input”。

## 13. 相关 RTK issue 与 PR

- [`run_in_terminal` 未识别 #1425](https://github.com/rtk-ai/rtk/issues/1425)，OPEN。
- [Copilot CLI `modifiedArgs` #1839](https://github.com/rtk-ai/rtk/issues/1839)，OPEN。
- [global Copilot install #1774](https://github.com/rtk-ai/rtk/issues/1774)，OPEN。
- [Windows and GitHub Copilot #2424](https://github.com/rtk-ai/rtk/issues/2424)，OPEN。
- [Windows PowerShell compatibility #1248](https://github.com/rtk-ai/rtk/issues/1248)，OPEN。
- [legacy `rtk-rewrite.sh` missing #1962](https://github.com/rtk-ai/rtk/issues/1962)，OPEN。
- [`run_in_terminal` + full input preservation PR #1800](https://github.com/rtk-ai/rtk/pull/1800)，OPEN、MERGEABLE、未合并。

## 14. 官方资料

- [VS Code Agent hooks](https://code.visualstudio.com/docs/agent-customization/hooks)
- [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [Using hooks with GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [Copilot CLI changelog](https://github.com/github/copilot-cli/blob/main/changelog.md)
- [Microsoft: Cmd.exe command-line string limitation](https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/command-line-string-limitation)
- [RTK source repository](https://github.com/rtk-ai/rtk)

## 15. 本仓库证据

- [`src/hook/copilot.ts`](../../src/hook/copilot.ts)
- [`src/hook/normalize.ts`](../../src/hook/normalize.ts)
- [`src/hook/install.ts`](../../src/hook/install.ts)
- [`src/hook/rewrite.ts`](../../src/hook/rewrite.ts)
- [`src/shim/hostAdapter.ts`](../../src/shim/hostAdapter.ts)
- [`src/shim/hostConfig.ts`](../../src/shim/hostConfig.ts)
- [`src/shim/install.ts`](../../src/shim/install.ts)
- [`windows-d2-distribution-verification-20260610.md`](windows-d2-distribution-verification-20260610.md)
- [`windows-lifecycle-rerun-cozyultra-936-20260610.md`](windows-lifecycle-rerun-cozyultra-936-20260610.md)
- [`vscode-dogfood-issues-20260611.md`](vscode-dogfood-issues-20260611.md)
- [`copilot-session-tool-use-report.md`](copilot-session-tool-use-report.md)

## 16. Issue 跟踪与去向

> 2026-06-15 建立。修复项随 PR [#3](https://github.com/Cozy228/token-killer/pull/3)（分支 `token-killer-node-cli`）合入；feature 按 `current`/`later` milestone 排期。每个 issue 附 Claude Opus 4.8 的实现方案评论。

| 报告项 | Issue | 类型 | 去向 |
|---|---|---|---|
| P0-1 VS Code 完整 `tool_input` | [#19](https://github.com/Cozy228/token-killer/issues/19) | 优化 / fix | PR #3（Closes） |
| P0-2 hook config dual schema | [#20](https://github.com/Cozy228/token-killer/issues/20) | 优化 / fix | PR #3（Closes） |
| P0-3 protocol acceptance matrix | [#21](https://github.com/Cozy228/token-killer/issues/21) | 优化 / test | PR #3（Closes） |
| P0-4 VS Code hook + shim 叠加 | [#22](https://github.com/Cozy228/token-killer/issues/22) | feature | milestone `current`（需 ADR；依赖 #19） |
| P0-5 Windows preflight | [#23](https://github.com/Cozy228/token-killer/issues/23) | feature（低风险，可早做） | milestone `current` |
| P1-1 CLI-only `postToolUse.modifiedResult` | [#24](https://github.com/Cozy228/token-killer/issues/24) | feature | milestone `later`（需 ADR） |
| P1-2 PowerShell corpus + parser | [#25](https://github.com/Cozy228/token-killer/issues/25) | feature（语料先做） | milestone `current` |
| P1-3 capability matrix | [#26](https://github.com/Cozy228/token-killer/issues/26) | feature | milestone `current` |
| P1-4 hook/shim 冷启动测量 | — | 优化 / perf | 并入 `docs/runtime-startup-perf-*` 计划，未单开 |
| P2 `exclude_commands` / `transparent_prefixes` | [#27](https://github.com/Cozy228/token-killer/issues/27) | feature | milestone `later` |
| P2 safe `2>&1` | [#18](https://github.com/Cozy228/token-killer/issues/18) | 优化 | 并入 #18（rewrite 门控） |
| P2 `.cmd` `%*` 8191 限制 | [#8](https://github.com/Cozy228/token-killer/issues/8) | 优化 | 并入 #8（.cmd %-展开） |
