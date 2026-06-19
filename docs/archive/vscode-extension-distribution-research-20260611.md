# VS Code 扩展分发能力调研 + 官方原生压缩器对 tk 的影响

> 日期：2026-06-11 · 方法：逐页通读官方 VS Code 扩展 API 文档 + microsoft/vscode issue 原文 + ztk 源仓库，每条结论附官方出处。
> 触发问题：如果 tk 以「VS Code 扩展」方式分发，能解锁哪些当前做不到的能力？

---

## 0. TL;DR（先看这段）

1. **扩展无法压缩内置工具输出。** VS Code 官方只承认 4 种 AI 扩展点（Language Model Tools / MCP / Chat Participant / Language Model API），全是「往里加能力」，**没有任何一个能拦截、改写、压缩内置工具（终端、读文件、搜索）发给模型的输出**。
2. **但 VS Code 自己做了这件事——进程内、第一方。** `IToolResultCompressor` 服务已落地（#315376），#315881 正照着 `codejunkie99/ztk` 的设计补齐 parity（argv 解析、复合命令、session dedup）。设置 `chat.tools.compressOutput.enabled` 默认关。
3. **这个原生压缩器不对扩展开放。** 它是 workbench 内部 service，#315881 明确把「per-user filter lists」「standalone proxy/binary」列为 out of scope。tk 的 filter 注入不进去。
4. **install 时不能静默替换内置工具，但能默认开原生压缩。** 没有「默认 agent / 默认工具选择」的贡献点；但 `contributes.configurationDefaults` 可覆盖任意核心设置默认值，可在安装时默认开启 `chat.tools.compressOutput.enabled`（用的是 VS Code 的 filter，不是 tk 的）。
5. **战略结论**：VS Code 原生正面吃掉 tk 在 VS Code 上最想做的「终端输出压缩」，且 in-process 比 shim 更干净。tk 剩余差异化 = 更全的 filter（注入不进去）+ 跨 host 一致 + native 明确不做的 LLM 摘要/inspect/gain/治理。

---

## 1. 扩展能解锁的能力（逐条带出处）

VS Code 官方「AI extensibility overview」逐项列出 4 种机制后，全篇**没有**任何 intercept / wrap / post-process / compress tool output / 修改 context window 的入口。
来源：<https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview>

### 1.1 Language Model Tools —— 让 agent 自动调 tk 的工具 ✅（最有价值）
- `package.json` 声明 `contributes.languageModelTools` + 激活时 `vscode.lm.registerTool()`。
- agent 模式**自动调用**：*"agents in VS Code can automatically invoke these tools… as part of the conversation"*。
- 返回 `LanguageModelToolResult`（`LanguageModelTextPart` / `LanguageModelPromptTsxPart`），内容进入模型上下文。
- 首次弹确认，用户可「Always Allow」后免确认。
- 工具结果可用 `@vscode/prompt-tsx` 按 token 预算裁剪：*"Priority-based pruning… to fit within the model's context window"*，`flexGrow/flexReserve/flexBasis`。
- **限制**：文档全程只讲「新增工具」，**没有**任何「同名 shadow / override 内置工具」的机制 → 只有 agent 选择调你的工具时才有压缩收益。

来源：<https://code.visualstudio.com/api/extension-guides/ai/tools> · <https://code.visualstudio.com/api/extension-guides/ai/prompt-tsx>

### 1.2 Language Model API —— 自己调模型做 LLM 摘要 ✅
- `vscode.lm.selectChatModels({...})` 选 Copilot 模型，`model.sendRequest([...])` 发文本拿回摘要 = **用 LLM 做有损压缩**（区别于 filter 的确定性删行）。
- 可用模型文档举例 `gpt-4o / gpt-4o-mini / o1 / o1-mini / claude-3.5-sonnet`。
- **三道限制**：① 需用户授权 *"require consent… authentication dialog"*；② *"should be called as part of a user-initiated action, such as a command"*（不适合 agent 自动循环）；③ 有 rate limiting。
- → 适合做成「点按钮，摘要这段日志」的命令式功能，不适合接管 agent 工具循环。

来源：<https://code.visualstudio.com/api/extension-guides/ai/language-model>

### 1.3 Chat Participant（@tk）—— 自己掌控编排循环 ✅，但仅 ask 模式手动触发 ⚠️
- 优势：*"Control the end-to-end interaction flow"*——handler 里手动调工具、自己决定塞什么进 prompt，**这里可以压缩工具输出**。
- 致命限制：**只有 @-mention 才触发**，不在 agent 模式自动跑；官方明确区分于「agent 自动编排的 language model tools」。

来源：<https://code.visualstudio.com/api/extension-guides/ai/chat>

### 1.4 MCP Server Provider ✅（但不需扩展也行）
- `contributes.mcpServerDefinitionProviders` 或运行时 `vscode.lm.registerMcpServerDefinitionProvider`；支持 `stdio / http / sse(legacy)`。
- MCP 工具输出同样「自产自销」，拦不了别人的；文档未提对 MCP 输出做转换或截断。

来源：<https://code.visualstudio.com/api/extension-guides/ai/mcp>

### 1.5 Terminal Shell Integration API —— 只读，不能改流 ⚠️
- v1.93 起稳定：*"listen to commands run in terminals, read their raw output, exit code, and command lines"*。
- 全是**被动监听**（listen/read），无「拦截或修改输出流」能力 → 改不了 agent 终端工具喂给模型的内容。tk 现有 PATH shim 反而更有效（真改字节）。

来源：<https://code.visualstudio.com/updates/v1_93>

### 1.6 Custom Agents（旧称 chat modes，`.agent.md`）✅
- `.chatmode.md` 已更名 `.agent.md`；frontmatter `tools` 是 **allowlist**（*"A list of tool or tool set names that are available for this custom agent"*，未列即排除），可指定 `model` + 正文 instructions；**可由扩展贡献**。
- 但**无「设为默认/自动选中」机制**，用户仍需手动选该 agent。

来源：<https://code.visualstudio.com/docs/copilot/customization/custom-chat-modes>

### 1.7 工具开关 / 128 上限 / tool sets
- 用户在 Configure Tools 勾选；单请求**最多 128 工具**，超出可用 `github.copilot.chat.virtualTools.threshold`；tool sets 用 `.jsonc` 分组。开关是 **per-request**，无全局禁用某内置工具的设置。

来源：<https://code.visualstudio.com/docs/copilot/agents/agent-tools>

---

## 2. 关键发现：VS Code 官方原生压缩器（#315376 / #315881）

我上一轮结论「没有 API 能压缩内置工具输出」——**对扩展仍成立**，但 VS Code 自己在 workbench 内部做了。

### 2.1 #315376（已落地）—— 初始 `IToolResultCompressor`
- 新设置 `chat.tools.compressOutput.enabled`，**默认关**，`experiment: { mode: 'auto' }`。
- 新服务 `src/vs/workbench/contrib/chat/common/tools/toolResultCompressor.ts`，per-tool filter 注册表，*"filters are pure functions over text parts"*，跳过 <80 字节、filter 抛错则丢弃（即 ztk 的 "never make it worse"）。
- 遥测 `toolResultCompressed { toolName, filters, beforeBytes, afterBytes }`。
- 3 个初始 `run_in_terminal` filter：`git diff`/`git show`、`ls -l`/`ls -la`、`npm/yarn/pnpm install`。

来源：<https://github.com/microsoft/vscode/issues/315376>

### 2.2 #315881（进行中）—— 追 ztk parity
目标原文：*"bringing our compression closer to parity with `codejunkie99/ztk`… while keeping everything in-process so we don't need a sidecar binary or hook adapter"*。要补：
- **argv tokenizer** `{program, subcommands, flags, positionals}`，按 `(program, subcommand)` 注册 filter（修 `git difftool` 误命中 `git diff`）。
- **复合命令**：pipeline、`&&`/`||`/`;`、`FOO=bar` 前缀、`sudo`/`time`/`xargs` wrapper 逐段压缩。
- **session memory / dedup**，TTL 表与 ztk 一致：fast 30s（git status/ls）、medium 2m（test runner）、slow 5m（git log/find/tree）；mutation 命令失效相关缓存；遥测加 `cacheHit`。
- **硬性 do-not-touch**：stderr / 非零退出 / exit code / 顶层 JSON·YAML·TOML 不动。

**out of scope（关键）**：① 非终端工具压缩；② LLM 有损摘要（*"Filters stay deterministic and cheap"*）；③ **per-user 可配置 filter 列表**；④ **standalone proxy/binary**。

来源：<https://github.com/microsoft/vscode/issues/315881>

> **边界结论**：`IToolResultCompressor` 是 workbench 内部 service，不是扩展 API，且 per-user filter 列表明确 out of scope → **扩展无法注册自己的 filter**，tk 接不进去。

### 2.3 ztk 是什么 / VS Code 怎么「结合」
ztk（`codejunkie99/ztk`）= tk/RTK 同类：*"Stop wasting tokens on raw command output"*，CLI proxy + 各家 PreToolUse/BeforeTool hook（Claude Code / Cursor / Gemini），`ztk init -g` 安装，78%+ 压缩，"never make it worse"，mmap 缓存 30s/2m/5m。
来源：<https://github.com/codejunkie99/ztk>

**「结合」= 照设计重写，不是集成**：VS Code 没用 ztk 的二进制/hook，而是把它的设计（filter 表、TTL 缓存、never-make-it-worse、80 字节阈值、遥测字段）搬进进程内。

---

## 3. 三方对比（tk shim vs ztk hooks vs VS Code native）

| 维度 | tk（本项目） | ztk | VS Code 原生 IToolResultCompressor |
|---|---|---|---|
| 机制 | PATH shim（改字节，确定性） | CLI proxy + 各家 hook | 进程内 service，无 shim/hook |
| 触发 | 终端 PATH 拦截，始终在 | hook 改写命令 | `chat.tools.compressOutput.enabled`（默认关） |
| 压缩内置 `run_in_terminal` 输出 | ✅（shell 层） | ✅（hook 改写） | ✅（官方，最干净，不依赖 PATH/hook） |
| 压缩 read_file/grep 等非终端工具 | ❌ | ❌ | ❌（明确 out of scope） |
| filter 覆盖面 | 几十个 handler | 几十个 + 25 regex | 当前 **3 个**，#315881 在扩 |
| session dedup | ✅ | ✅ 30s/2m/5m | 🚧 #315881 在做（同款 TTL） |
| LLM 摘要 | 可做（§1.2，受限） | ❌ | ❌（明确排除） |
| 跨 host 一致 | ✅ | ✅ | ❌ 仅 VS Code |
| 扩展能否注入 filter | — | — | ❌ 不开放 |
| 分析层（inspect/gain/治理） | ✅ | ❌ | ❌ |

---

## 4. 回答两个落地问题

### Q1：install 时能不能锁成 tk tool，不让用户手动去掉内置 tool？
**直接替换/禁用内置工具——不行**：
- 没有「默认 agent / 默认工具选择」贡献点（官方 35 个贡献点里没有）。
- tool picker 是 per-request 手动勾选，无全局禁用某内置工具的设置。
- custom agent 的 `tools` 是 allowlist，但无「设为默认/自动选中」机制，用户仍需手动选该 agent。

**更对的杠杆**：`contributes.configurationDefaults` 能覆盖任意核心设置默认值（官方例子就是核心设置 `files.autoSave`）：
```jsonc
"contributes": {
  "configurationDefaults": { "chat.tools.compressOutput.enabled": true }
}
```
→ 装上即默认开启 **VS Code 原生终端输出压缩**，用户零操作（仍可覆盖）。代价：压的是 **VS Code 自己的 3 个 filter，不是 tk 的**。
来源：<https://code.visualstudio.com/api/references/contribution-points>

### Q2：「自己调模型做 LLM 摘要」是什么意思？
见 §1.2。一句话：扩展用 Language Model API 把长输出发给 Copilot 模型拿回摘要 = LLM 有损压缩；受「授权 + user-initiated + 限流」三道限制，适合命令式按钮，不适合 agent 自动循环。这恰是 VS Code 原生明确不做的（理论差异点，但实用性受限）。

---

## 5. 战略含义与可选动作（for tk）

- **正面冲击**：VS Code 原生吃掉了 tk 在 VS Code 上最想做、却只能靠 shim 凑的「终端输出压缩」，in-process 比 shim 更干净（不依赖 PATH / `terminal.integrated.env`）。随 #315881 推进，shim 在 VS Code 的边际价值下降。
- **剩余差异化**：① filter 覆盖面（VS Code 才 3 个，tk 几十个）——但注入不进去；② **跨 host 一致**（Claude / Codex / Copilot CLI / VS Code 一套）；③ native 明确不做的 **LLM 摘要 + inspect/gain 分析 + 治理**。
- **候选动作**：
  1. **盯紧 #315881**，把 tk 在 VS Code 的定位从「shim 抢拦截」转向「native 未覆盖的层」（分析、跨 host、治理）。
  2. 评估**给 microsoft/vscode 贡献 filter**（开源路径）——这是把 tk 几十个 handler 价值送进 VS Code 的唯一合法通道，因为 per-user filter 列表 out of scope。
  3. VS Code 扩展若要做，价值在**①默认开 `chat.tools.compressOutput.enabled` + ②把 tk 压缩能力包成 Language Model Tools（agent 自动调）+ ③分发/引导**，而非试图替换内置工具或注入 filter。

---

## 附：出处清单
- AI extensibility overview — code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview
- Language Model Tool API — /api/extension-guides/ai/tools
- Language Model API — /api/extension-guides/ai/language-model
- Chat Participant API — /api/extension-guides/ai/chat
- MCP server provider — /api/extension-guides/ai/mcp
- Prompt TSX — /api/extension-guides/ai/prompt-tsx
- Custom agents / chat modes — /docs/copilot/customization/custom-chat-modes
- Use tools in chat — /docs/copilot/agents/agent-tools
- Terminal shell integration（v1.93）— /updates/v1_93
- Contribution points — /api/references/contribution-points
- microsoft/vscode#315376（IToolResultCompressor 落地）
- microsoft/vscode#315881（追 ztk parity，本次触发线索）
- codejunkie99/ztk（被借鉴的 proxy）
