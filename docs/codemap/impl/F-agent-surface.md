## 需求 F — Agent delivery surface（agent 如何触达工具 / 工具形态与引导）

本需求服务 **B（agent find-code / token 优化）**，但其交付载体（VS Code 扩展）同时是 H（人类 HTML viewer）和 I（协作 round-trip）的宿主 —— 即 DEP MAP 的「ONE BACKEND, TWO SURFACES (codemap = agent, codeguide = human), TWO FRONT-ENDS」收敛点。所有工具仅暴露 A 的 retrieval 面（B1 静态层），LLM 生成层（B 叙事 tier）不进入任何被列出的工具。

锚点绑定：
- **传输 = stdio**（DEP MAP `E/F/J/M` 冲突已裁定：单进程 per-session，无 daemon；per-session MCP 即正式暖路径。cross-session daemon = **Outside current product scope**（D21 / [ADR 0033](../adr/0033-daemon-decomposed-three-capabilities.md)，重开闸 hydration p95>250ms 等），非泛"M18 测量门控条件分支"）。
- **输出预算单位 = char**，数值 `13000/18000/24000` 由 G1 拥有，F **import** 不重定义（DEP MAP `G/F` 冲突裁定；G1 为事实归属层级，非阶段）。
- **DB 路径 = 库外** `~/.token-killer/projects/<fp>/index.db`（POSIX）/ `%LOCALAPPDATA%\token-killer\...`（Win）；`.tk/` 仅放人类工件（DEP MAP `C/L` 冲突裁定）。本需求所有「indexed?」探测以「能否解析到该库外 fingerprint dir」为准，不依赖 `.codegraph/`（upstream reference）。
- **Node gate** `>=22.5.0 <25.0.0`（跨需求统一）。

---

### F.1 决策：双前端 / 单后端交付形态（serves the codemap agent surface）

**(1) 决策（D19 / [ADR 0031](../adr/0031-asymmetric-dual-adapter-delivery.md)，修正旧 "extension-为主" 前提）**：一个 **Repository Intelligence Core 唯一实现**（一套 QueryPlan + result contract，绝不两套 retrieval），其上两个**不对等适配器**：`tk mcp` = **host-neutral 参考适配器**；VS Code 扩展 = **Copilot 专用 managed 适配器**（价值 = 能调 VS Code API + 更好的安装/编辑器集成）。两适配器共享同一 QueryPlan + result contract。**入口由组织 policy 决定**（非固定 PRIMARY）：扩展工具获批→文档推荐扩展；只允许 MCP→`tk mcp`；MCP 禁但扩展工具允→扩展是唯一 Agent 通道；两者皆禁→只剩 CLI/codeguide(Human) 面；Claude Code/Codex CLI 等终端→直接 MCP。

> ⚠️ **作废旧前提**：F.1 旧文称 "enterprise MCP 默认锁闭、LM-Tool API 是唯一触达 built-in read/search 的通道"——**错**。事实（per user，已入官方复核清单）：`chat.mcp.access` 默认 **`all`**（非锁闭）；扩展 LM Tool 有**独立**治理（`chat.extensionTools.enabled` 可中央关、安装受 `extensions.allowed` allowlist 限），**不是绕过 MCP 治理的 robust 通道**；VS Code 把 built-in/extension/MCP 定义为**三种并列工具类型**，扩展**不接管** built-in read/search。故无哪个通道是"保证 robust 的全局 PRIMARY"——改为 Core + 两不对等适配器 + policy 决定入口 + 优雅降级到 CLI/Human。

**(2) 要动的文件**（tk repo，新建为主）：
```
src/mcp/                      # 新建：F 的后端核心（port 自 codegraph/src/mcp，去 daemon）
  transport.ts               # LineBasedJsonRpcTransport + StdioTransport（hand-rolled，零依赖）
  session.ts                 # MCPSession：initialize / tools/list / tools/call / roots/list
  tools.ts                   # ToolDefinition[] + ToolHandler + DEFAULT_MCP_TOOLS + 预算函数
  server-instructions.ts     # SERVER_INSTRUCTIONS（full）+ _UNINDEXED（short）
  serverInfo.ts              # SERVER_INFO + PROTOCOL_VERSION
  index.ts                   # MCPServer（direct/stdio-only），被 `tk mcp` 调用
src/cli.ts                   # 改：注册 `tk mcp`（别名 `tk serve --mcp`）子命令 → MCPServer.start()
src/budget.ts                # 新建：G1 的 char tier 常量 + getExploreBudget（F8 import 此处，单一真相源）
extension/                   # 新建：VS Code 扩展（独立打包，PRIMARY 前端）
  package.json               # languageModelTools contribution + activationEvents
  src/extension.ts           # activate()：registerTool ×N + registerMcpServerDefinitionProvider
  src/tools/lmTools.ts       # 每个 LM tool 的 invoke() → 调 src/mcp 的 ToolHandler（in-proc 或 spawn `tk mcp`）
package.json                 # 改：engines.node ">=22.5.0 <25.0.0"
```
后端（`src/mcp` + `src/budget`）随主 tarball 发布；扩展 `extension/` 经 L 渠道单独发布（vsix），运行时 in-process 调用或 spawn `tk mcp` 作为 codemap backend（DEP MAP `F/H/I/L` 冲突裁定）。

**(3) 可抄代码** —— `tk mcp` 子命令的 direct-stdio 启动骨架，源 codegraph（upstream reference）的 direct 路径（已改写：删 daemon/proxy 分支，强制 stdio-only，因当前无 daemon）：

源: /tmp/tk-research/codegraph/src/mcp/index.ts:332-343（已改写为 stdio-only）
```ts
// src/mcp/index.ts  —— v1 = single-process-per-session stdio, NO daemon (M18/E1)
import { StdioTransport } from './transport';
import { MCPEngine } from './engine';        // tk: 内含 graph store + diets（need A/C）
import { MCPSession } from './session';

export class MCPServer {
  private engine!: MCPEngine;
  private session!: MCPSession;
  constructor(private projectPath: string | null = null) {}

  async start(): Promise<void> {
    this.engine = new MCPEngine();
    const transport = new StdioTransport();              // exitOnClose 默认 true（per-session）
    this.session = new MCPSession(transport, this.engine, {
      explicitProjectPath: this.projectPath,
    });
    if (this.projectPath) {
      void this.engine.ensureInitialized(this.projectPath);  // 后台 init，保持 initialize 快(#172)
    }
    this.session.start();
  }
}
```

VS Code 扩展的 LM-Tool contribution（源: dossier F1 concrete，**需实现时补** —— codegraph 无扩展实现；以下为 tk 改写的 `package.json` 片段，依据官方 LM Tool API）：
```jsonc
// extension/package.json
{
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "languageModelTools": [
      {
        "name": "tk_explore",
        "toolReferenceName": "tkExplore",
        "displayName": "tk explore",
        "modelDescription": "PRIMARY TOOL — call FIRST for almost any question OR before an edit. Returns verbatim source grouped by file in ONE capped call (Read-equivalent), plus the call path. Use INSTEAD of reading files.",
        "canBeReferencedInPrompt": true,
        "inputSchema": { "type": "object", "properties": {
          "query": { "type": "string" }, "maxFiles": { "type": "number", "default": 12 }
        }, "required": ["query"] }
      }
      // tk_node / tk_search / tk_callers 同形（schema 见 F.6）
    ]
  }
}
```

**(4) 具体数值**：扩展默认列出 4 个 LM tool（tiny-repo 3 个，见 F.4/F.5）；`activationEvents=["onStartupFinished"]`；后端注册 MCP 用 `registerMcpServerDefinitionProvider`（GA）。SECONDARY 命令字面 `tk mcp`（别名 `tk serve --mcp`）。

**(5) 有序步骤**（每步独立可发、可测）：
1. `src/budget.ts`：落 G1 char tier 常量 + `getExploreBudget`（无依赖）。
2. `src/mcp/transport.ts`：port hand-rolled transport（依赖无）。
3. `src/mcp/{serverInfo,server-instructions,tools,session}.ts`：后端（依赖 A/C 的 graph store + step 1/2）。
4. `src/mcp/index.ts` + `src/cli.ts`：接 `tk mcp`（依赖 step 3）。SECONDARY 此步即可发版、Claude Code 可用。
5. `extension/`：LM tools + 程序化 MCP，invoke 调 step 3 后端（依赖 step 4）。PRIMARY 此步发版。

**(6) 测试**：
- step 4：`echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | tk mcp` 单测断言返回含 `serverInfo.name="tk"` + `instructions` 字段；`tools/list` 在已索引仓返回 4 条、未索引返回 `[]`。
- step 5：扩展集成测试断言 `vscode.lm.tools` 含 `tk_explore`；A/B harness 在 Claude Code headless 跑 `tk mcp` 量 Job-B（K Track-1）。

**(7) 证据回指**：token-optimization-landscape-20260618 §C3（MCP 默认锁闭）/§C8（LM-Tool 是唯一触达 read/search 面的通道）；codegraph `src/mcp/index.ts:332-343`。

---

### F.2 决策：传输 = 手写 newline-delimited JSON-RPC 2.0，非 SDK（serves the codemap agent surface）

**(1) 决策**：MCP 传输 = 手写 `LineBasedJsonRpcTransport`（port codegraph `transport.ts`，~420 LOC 零依赖），**不**用 `@modelcontextprotocol/sdk`。实现 `initialize / tools/list / tools/call / ping / resources/list（空）/ resources/templates/list（空）/ prompts/list（空）` + server-initiated `roots/list`。错误码 `-32700/-32600/-32601/-32602/-32603`。理由：tk 的零原生依赖 + Windows 冷启动/AV 税 + 自包含 tarball 约束下，SDK 对一个 ~7 方法的协议是纯负担 —— gitnexus（upstream reference）为对抗 SDK 的 stdout 处理被迫加 `CompatibleStdioServerTransport` shim（已核实 `gitnexus/src/mcp/server.ts:15-16,339`），codegraph（upstream reference）无此 shim。对 `resources/prompts/templates` 回空而非 `-32601`，避开部分客户端日志里的吓人报错（#621）。

**(2) 要动的文件**：`src/mcp/transport.ts`（新建）。

**(3) 可抄代码** —— 接口、错误码、handleLine、server-initiated request：

源: /tmp/tk-research/codegraph/src/mcp/transport.ts:59-82（verbatim）
```ts
// Standard JSON-RPC error codes
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export interface JsonRpcTransport {
  start(handler: MessageHandler): void;
  stop(): void;
  send(response: JsonRpcResponse): void;
  notify(method: string, params?: unknown): void;
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
  sendResult(id: string | number, result: unknown): void;
  sendError(id: string | number | null, code: number, message: string, data?: unknown): void;
}
```

源: /tmp/tk-research/codegraph/src/mcp/transport.ts:114-128（verbatim，server-initiated request：5000ms 超时 + timer.unref）
```ts
request(method: string, params?: unknown, timeoutMs = 5000): Promise<unknown> {
  const id = `${this.idPrefix()}-${this.nextRequestId++}`;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      this.pending.delete(id);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${method}" response`));
    }, timeoutMs);
    timer.unref?.();   // 不让 pending 请求在 shutdown 时吊住进程
    this.pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    this.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}
```

源: /tmp/tk-research/codegraph/src/mcp/transport.ts:162-208（verbatim，handleLine：JSON.parse 失败 → sendError(null,-32700)）
```ts
protected async handleLine(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    this.sendError(null, ErrorCodes.ParseError, 'Parse error: invalid JSON');
    return;
  }
  const obj = parsed as Record<string, unknown>;
  // server-initiated 请求的响应（有 id + result/error、无 method）→ 路由回 awaiting requester
  if (obj?.jsonrpc === '2.0' && typeof obj.method !== 'string' &&
      'id' in obj && ('result' in obj || 'error' in obj)) {
    this.handleResponse(obj);
    return;
  }
  if (!this.isValidMessage(parsed)) {
    this.sendError(null, ErrorCodes.InvalidRequest, 'Invalid Request: not a valid JSON-RPC 2.0 message');
    return;
  }
  if (this.messageHandler) {
    try {
      await this.messageHandler(parsed as JsonRpcRequest | JsonRpcNotification);
    } catch (err) {
      const message = parsed as JsonRpcRequest;
      if ('id' in message) {
        this.sendError(message.id, ErrorCodes.InternalError,
          `Internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
```

StdioTransport 的 write / idPrefix（源: /tmp/tk-research/codegraph/src/mcp/transport.ts:319-325，verbatim，仅 idPrefix 改 `tk-srv`）：
```ts
protected write(line: string): void {
  process.stdout.write(line + '\n');
}
protected idPrefix(): string {
  return 'tk-srv';   // codegraph 原为 'cg-srv'，tk 改前缀
}
```

**(4) 具体数值**：server-initiated `roots/list` 超时 `5000ms`；server-initiated id 格式 `tk-srv-${n}`；newline-delimited（每条 JSON 后 `\n`）；零运行时依赖。

**(5) 有序步骤**：单步 —— 落 `transport.ts`（含 `LineBasedJsonRpcTransport` 抽象基类 + `StdioTransport` 子类）。Socket 子类无需提供（无 daemon，属当前产品范围之外）。

**(6) 测试**：单测 4 条 —— (a) 喂非法 JSON 行断言收到 `{"error":{"code":-32700}}`；(b) 喂缺 method 的请求断言 `-32600`；(c) 喂未知 method 断言 `-32601`（在 session 层）；(d) `request()` 在无响应时 5000ms 后 reject。

**(7) 证据回指**：codegraph `transport.ts:59-82,114-128,162-208,319-325`；对照 gitnexus `server.ts:15-16,339`（SDK + CompatibleStdioServerTransport shim，已核实）。

---

### F.3 决策：默认 4 工具 + tiny-repo 3 工具 + `TK_MCP_TOOLS` ablation（serves the codemap agent surface）

**(1) 决策**：默认工具面 = 4 个 `tk_` 前缀工具 —— `tk_explore`(PRIMARY) / `tk_node` / `tk_search` / `tk_callers`。`callees/impact/files/status` 的 handler 保留但默认不列出；环境变量 `TK_MCP_TOOLS`（逗号分隔短名）重新启用任意工具，被 ablate 的工具从 `tools/list` 真正缺席（非 call 时拒绝）—— 这同时是 A/B harness 的基线臂（F.7）。**500 索引文件以下**降到 3 工具三件套（`tk_explore/tk_search/tk_node`，丢 `tk_callers`）。理由（codegraph（upstream reference）实测）：1-tool 门 express 从 -43%WIN→+107%LOSS；`impact` 在零 eval 出现（blast-radius 已内联在 explore 和 node）；`callees` 冗余（body 即 callee list）。gitnexus（upstream reference）无条件列 17（已核实 `tools.ts` 26 个 `name:` 含别名/重载）= 文档化的「navigation-tool ceiling」反模式。

> **组织原则（D17 / [ADR 0029](../adr/0029-agent-tool-surface-operation-contracts-queryplan.md)）**：这 4 个是**操作合同**（4 种职责：主探索 / 廉价搜索 / 精确节点读 / 反向调用），**不是** 6 个 profile 工具、**不是** 1 个 purpose 万能工具。六 profile 降为**内部 QueryPlan preset**（见 A4.4，QueryPlan = selection/traversal/projection 三正交维度）；每个工具把窄参编译成 QueryPlan，不外暴露重参协议。Domain/Evidence 先经 `tk_explore.layers` + `tk_node.include` 暴露，**harness 证明前不加** tk_domain/tk_verify。

**(2) 要动的文件**：`src/mcp/tools.ts`（`DEFAULT_MCP_TOOLS` + `getStaticTools` + `ToolHandler.getTools` + tiny-repo 门 + `toolAllowlist/isToolAllowed`）。

**(3) 可抄代码**：

源: /tmp/tk-research/codegraph/src/mcp/tools.ts:656,625-632（verbatim，前缀 codegraph_→tk_，env 名改 `TK_MCP_TOOLS`）：
```ts
const DEFAULT_MCP_TOOLS = new Set(['explore', 'node', 'search', 'callers']);

// 无 engine 时的静态工具面（proxy/初始化前 tools/list 用）
export function getStaticTools(): ToolDefinition[] {
  const raw = process.env.TK_MCP_TOOLS;
  if (!raw || !raw.trim()) {
    return tools.filter(t => DEFAULT_MCP_TOOLS.has(t.name.replace(/^tk_/, '')));
  }
  const allow = new Set(raw.split(',').map(s => s.trim().replace(/^tk_/, '')).filter(Boolean));
  return allow.size ? tools.filter(t => allow.has(t.name.replace(/^tk_/, ''))) : tools;
}
```

源: /tmp/tk-research/codegraph/src/mcp/tools.ts:728-740（verbatim，env+前缀已改写）：
```ts
private toolAllowlist(): Set<string> | null {
  const raw = process.env.TK_MCP_TOOLS;
  if (!raw || !raw.trim()) return null;
  const short = (s: string) => s.trim().replace(/^tk_/, '');
  const set = new Set(raw.split(',').map(short).filter(Boolean));
  return set.size ? set : null;
}
/** 工具名是否通过 TK_MCP_TOOLS allowlist */
private isToolAllowed(name: string): boolean {
  const allow = this.toolAllowlist();
  return !allow || allow.has(name.replace(/^tk_/, ''));
}
```

tiny-repo 门 + 动态预算描述，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:748-799（verbatim，前缀已改写）：
```ts
getTools(): ToolDefinition[] {
  const allow = this.toolAllowlist();
  let visible = allow
    ? tools.filter(t => allow.has(t.name.replace(/^tk_/, '')))
    : tools.filter(t => DEFAULT_MCP_TOOLS.has(t.name.replace(/^tk_/, '')));
  if (!this.cg) return visible;

  const stats = this.cg.getStats();
  const budget = getExploreBudget(stats.fileCount);

  // tiny-repo 门：<500 文件只暴露三件套（callers 在此规模也退化为一次 grep）
  const TINY_REPO_FILE_THRESHOLD = 500;
  const TINY_REPO_CORE_TOOLS = new Set(['tk_explore', 'tk_search', 'tk_node']);
  if (stats.fileCount < TINY_REPO_FILE_THRESHOLD) {
    visible = visible.filter(t => TINY_REPO_CORE_TOOLS.has(t.name));
  }

  return visible.map(tool => {
    if (tool.name === 'tk_explore') {
      return { ...tool,
        description: `${tool.description} Budget: make at most ${budget} calls for this project (${stats.fileCount.toLocaleString()} files indexed).` };
    }
    return tool;
  });
}
```

execute() 内的防御性拒绝（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:1117-1119，verbatim，env 改写）：
```ts
if (!this.isToolAllowed(toolName)) {
  return this.errorResult(`Tool ${toolName} is disabled via TK_MCP_TOOLS`);
}
```

**(4) 具体数值**：`DEFAULT_MCP_TOOLS`=4；`TINY_REPO_FILE_THRESHOLD`=**500**；tiny-repo 核心=3；`TK_MCP_TOOLS` 空/未设→默认 4 套，sentinel 空集→零工具（基线臂，F.7）。

**(5) 有序步骤**：1) 定义 `DEFAULT_MCP_TOOLS` + `getStaticTools`；2) `toolAllowlist/isToolAllowed`；3) `getTools` 接 tiny-repo 门 + 动态预算描述；4) execute 入口加 `isToolAllowed` 拒绝。各步可独立单测。

**(6) 测试**：(a) 未设 env，`getTools()` 在 600 文件仓返回 4 名、在 400 文件仓返回 3 名（无 `tk_callers`）；(b) `TK_MCP_TOOLS=impact,node` → `getTools()` 仅 2 名且含 `tk_impact`；(c) `TK_MCP_TOOLS=` 空字符串 → 默认 4（非零）；(d) ablate 后 execute(`tk_callers`) 返回 isError + "disabled via TK_MCP_TOOLS"。

**(7) 证据回指**：codegraph `tools.ts:656,625-632,728-740,748-799,1117-1119`；对照 gitnexus 17-tool 无条件列出（`tools.ts:80`）。

---

### F.4 决策：NO-INDEX → 空 tools/list + success-shaped NotIndexed（serves the codemap agent surface）

**(1) 决策**：无 tk 索引 → `tools/list` 返回**空数组**，`initialize.instructions` 用 short「inactive this session」变体。运行中途命中 NotIndexed → 返回 **success-shaped** 结果（guidance text，`isError` 缺省 = false），绝不 `isError:true`。仅安全拒绝（`PathRefusalError`）保持 `isError:true`（= 让 agent 停止重试）。理由（codegraph（upstream reference）docstring 实测）：早期 `isError:true` 教会 agent「工具坏了」从而整个 session 弃用 codegraph（upstream reference）（observed repeatedly）；空 list 是 agent 唯一不会误读的信号。

**(2) 要动的文件**：`src/mcp/session.ts`（`handleToolsList` 空门 + initialize 变体选择）、`src/mcp/tools.ts`（`NotIndexedError`/`PathRefusalError` 类 + dispatch catch + `textResult`/`errorResult`）。

**(3) 可抄代码**：

错误类语义，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:44,50（verbatim）：
```ts
/** 可恢复的「索引缺失」等条件 → dispatch catch 转 success-shaped（无 isError）。 */
export class NotIndexedError extends Error {}
/** 安全拒绝（敏感系统路径）→ 保持 isError:true、不给重试引导。 */
export class PathRefusalError extends Error {}
```

dispatch catch，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:1171-1187（verbatim）：
```ts
} catch (err) {
  // 预期条件、非故障：以 SUCCESS 应答，使 agent 对「确已索引」的项目继续信任工具集。
  if (err instanceof NotIndexedError) {
    return this.textResult(err.message);
  }
  // 安全拒绝：干净的 error，无重试鼓励。
  if (err instanceof PathRefusalError) {
    return this.errorResult(err.message);
  }
  return this.errorResult(
    `Tool execution failed: ${err instanceof Error ? err.message : String(err)}. ` +
    'This is an internal tk error — retry the call once; if it persists, ' +
    'continue without tk for this task.'
  );
}
```

result shape，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:3903-3914（verbatim）：
```ts
private textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };          // 无 isError → success-shaped
}
private errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}
```

空 tools/list 门，源: /tmp/tk-research/codegraph/src/mcp/session.ts:229-231（verbatim）：
```ts
this.transport.sendResult(request.id, {
  tools: this.engine.hasDefaultCodeGraph() ? this.engine.getToolHandler().getTools() : [],
});
```

**(4) 具体数值**：未索引 `tools/list`=`[]`；NotIndexed result `isError` 字段=缺省（false）；PathRefusal `isError`=true；内部故障文案含「retry the call once」。

**(5) 有序步骤**：1) 定义两个 error 类 + `textResult/errorResult`；2) dispatch catch 三分支；3) `handleToolsList` 空门（依赖 step 1）。

**(6) 测试**：(a) 在未索引目录 `tools/list` 断言返回 `tools:[]`；(b) handler 抛 `NotIndexedError` → 结果 `content[0].text` 含 guidance 且 `isError` 不为 true；(c) 抛 `PathRefusalError` → `isError:true`。

**(7) 证据回指**：codegraph `tools.ts:33-44,1171-1187,3903-3914`；`session.ts:220-231`。

---

### F.5 决策：≤9KB server-instructions playbook（full + short 两变体）（serves the codemap agent surface）

**(1) 决策**：在 `initialize.instructions` 发一份 tight markdown playbook（full 变体 codegraph（upstream reference）实测 9296 bytes，tk 目标 ≤~9KB），含「## Use tk instead of reading files」「## Tool selection by intent」「## Common chains」「## Anti-patterns」「## Limitations」。变体由 `findNearestRoot(explicitPath??cwd)!==null` 同步选择（existsSync 走查，不开 DB，保持 initialize 快）。理由：MCP 客户端把此文本自动放进 agent 系统提示 —— 这是 ADDITIVE 问题的主引导杆（VS Code Copilot built-in read/search 无法拦截，只能靠 description+instructions 把 agent 引向 `tk_*`）。

**(2) 要动的文件**：`src/mcp/server-instructions.ts`（导出 `SERVER_INSTRUCTIONS` + `SERVER_INSTRUCTIONS_UNINDEXED`）；`src/mcp/session.ts`（变体选择 + initialize 应答）。

**(3) 可抄代码**：

变体选择 + initialize 应答（success-fast，#172），源: /tmp/tk-research/codegraph/src/mcp/session.ts:202-210（verbatim，标识符 codegraph→tk）：
```ts
// 用 workspace 索引态选 instructions 变体 —— 同步走查（仅 existsSync 循环、不开 DB）
const indexed = findNearestTkRoot(explicitPath ?? process.cwd()) !== null;

// 在任何重 init 之前先回握手（#172）
this.transport.sendResult(request.id, {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { tools: {} },
  serverInfo: SERVER_INFO,
  instructions: indexed ? SERVER_INSTRUCTIONS : SERVER_INSTRUCTIONS_UNINDEXED,
});
```

short 变体全文，源: /tmp/tk-research/codegraph/src/mcp/server-instructions.ts:89-98（verbatim，codegraph→tk、`.codegraph/`→tk 索引、`codegraph init`→`tk init`）：
```ts
export const SERVER_INSTRUCTIONS_UNINDEXED = `# tk — inactive (workspace not indexed)

This workspace has no tk index, so no tk tools are available this session.
Work with your built-in tools as usual.

Indexing is the user's decision — do not run it yourself. If the user asks
about tk, they can enable it by running \`tk init\` in the project root and
starting a new session.
`;
```

full 变体的**锚点小节**（源: /tmp/tk-research/codegraph/src/mcp/server-instructions.ts:62-76 的 Anti-patterns/Limitations，verbatim 关键反模式，codegraph→tk）：
```md
## Anti-patterns
- **Trust tk's results — don't re-verify them with grep.** They come from a full
  AST parse; re-checking with grep is slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name — tk_search is faster.
- **Don't chain tk_search + tk_node** to understand an area — ONE tk_explore
  returns the relevant symbols' source together in a single round-trip.
- **Don't reach for the Read tool on an indexed source file** — tk_node with a
  `file` reads it (same `<n>\t<line>` source, offset/limit like Read, faster,
  with its blast radius). Read only what tk doesn't index (configs, docs).
```
（full 变体其余小节 Tool-selection-by-intent / Common-chains 直接 port codegraph（upstream reference）`server-instructions.ts:45-60`，标识符替换 `codegraph_*`→`tk_*`，剩余文案需在实现时逐字替换。）

**(4) 具体数值**：full 变体目标 **≤~9KB**（codegraph 基线 9296 bytes）；变体选择 = `findNearestTkRoot()!==null` 同步 existsSync 走查、不开 DB；5 个固定小节标题。

**(5) 有序步骤**：1) 写 short 变体（独立可发）；2) port full 变体并把所有 `codegraph_*`→`tk_*`、`.codegraph/`→tk 索引语义；3) session 接变体选择。

**(6) 测试**：(a) 已索引仓 initialize 返回 `instructions` 长度 >2KB 且含「## Anti-patterns」；(b) 未索引仓返回 short 变体且含「inactive」；(c) 断言 full 变体字节数 ≤9216（9KB）防膨胀回归。

**(7) 证据回指**：codegraph `server-instructions.ts:1-98`（9296 bytes）；`session.ts:192-210`。

---

### F.6 决策：cheap-outline-first ladder 折进工具设计 + 真实 JSON schema（serves the codemap agent surface）

**(1) 决策**：把 DeepWiki（upstream reference）的 cheap-outline-first ladder 折进**工具设计**而非多开工具 —— `tk_explore` 是单一 PRIMARY 入口（NL 问题或 symbol bag → 一次调用返回 capped verbatim source + call path）；`tk_search` 只给 locations；`tk_node` 的 `symbolsOnly:true` 给结构 outline。agent 被告知先调 explore、并在 size-scaled 调用预算后停止。预算函数把「outline-first」内化为预算阶梯 + ≤24KB cap（贴住宿主 ~25K inline tool-result cap，结果不外溢成需 Read 回来的文件）。F8 的 `maxOutputChars` tier **import G1 常量**（`src/budget.ts`），不重定义。

**(2) 要动的文件**：`src/budget.ts`（`getExploreBudget` + G1 char tier 常量，单一真相源）；`src/mcp/tools.ts`（`tools: ToolDefinition[]` schema 数组 + `projectPathProperty` + MAX 常量，从 `src/budget` import 预算）。

**(3) 可抄代码**：

预算函数，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:102-108（verbatim）→ 落 `src/budget.ts`：
```ts
// src/budget.ts —— 单一真相源（F8/G1 共用；F import，绝不重定义）
export function getExploreBudget(fileCount: number): number {
  if (fileCount < 500) return 1;
  if (fileCount < 5000) return 2;
  if (fileCount < 15000) return 3;
  if (fileCount < 25000) return 4;
  return 5;
}
```

char tier（G1 拥有的 maxOutputChars，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:172-257 的 tier 数值，verbatim 关键字段；其余 budget 字段属 G/A，此处仅取 F 引用的 maxOutputChars）：
```ts
// src/budget.ts —— G1 拥有；13000/18000/24000，对应 getExploreBudget 同一 tier 断点
export function exploreMaxOutputChars(fileCount: number): number {
  if (fileCount < 150)   return 13000;   // 源 tools.ts:179
  if (fileCount < 500)   return 18000;   // 源 tools.ts:195
  return 24000;                          // 源 tools.ts:213/232/246（≥500 全部 24000，贴 ~25K inline cap）
}
export const MAX_OUTPUT_LENGTH = 15000;  // 源 tools.ts:54，非 explore 工具的输出 cap
```

输入护栏常量，源: /tmp/tk-research/codegraph/src/mcp/tools.ts:54,63,70（verbatim）：
```ts
const MAX_OUTPUT_LENGTH = 15000;   // 非 explore 工具输出 cap
const MAX_INPUT_LENGTH  = 10_000;  // query/symbol 自由文本上限（防 FTS5 全扫/OOM）
const MAX_PATH_LENGTH   = 4_096;   // projectPath/path/pattern 路径上限
```

工具 JSON schema（真实可抄），源: /tmp/tk-research/codegraph/src/mcp/tools.ts:401-572（verbatim 结构，前缀 codegraph_→tk_、`.codegraph/`→tk 索引）：
```ts
const projectPathProperty: PropertySchema = {
  type: 'string',
  description: 'Path to a different project with tk initialized. If omitted, uses current project. Use this to query other codebases.',
};

export const tools: ToolDefinition[] = [
  { name: 'tk_search',
    description: 'Quick symbol search by name. Returns locations only (no code). Use tk_explore instead to get the actual source / understand an area in one call.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Symbol name or partial name (e.g., "auth", "signIn", "UserService")' },
      kind:  { type: 'string', description: 'Filter by node kind',
               enum: ['function','method','class','interface','type','variable','route','component'] },
      limit: { type: 'number', description: 'Maximum results (default: 10)', default: 10 },
      projectPath: projectPathProperty,
    }, required: ['query'] } },

  { name: 'tk_callers',
    description: 'List functions that call <symbol>. For the full flow, use tk_explore.',
    inputSchema: { type: 'object', properties: {
      symbol: { type: 'string', description: 'Name of the function, method, or class to find callers for' },
      file:   { type: 'string', description: 'Narrow to the definition in this file (path or suffix) when several same-named symbols exist' },
      limit:  { type: 'number', description: 'Maximum number of callers to return (default: 20)', default: 20 },
      projectPath: projectPathProperty,
    }, required: ['symbol'] } },

  { name: 'tk_node',
    description: 'Two modes. (1) READ A FILE — use INSTEAD of the Read tool: pass `file` alone (no `symbol`) → that file\'s current on-disk source with line numbers (`<n>\\t<line>`, safe to Edit from), narrowable with `offset`/`limit` like Read, PLUS which files depend on it. (2) ONE SYMBOL you can name — its location, signature, verbatim source (includeCode=true) and caller/callee trail in one call.',
    inputSchema: { type: 'object', properties: {
      symbol:      { type: 'string' },
      includeCode: { type: 'boolean', default: false },
      file:        { type: 'string' },
      offset:      { type: 'number' },
      limit:       { type: 'number' },
      symbolsOnly: { type: 'boolean', default: false },
      line:        { type: 'number' },
      projectPath: projectPathProperty,
    }, required: [] } },        // required:[] —— file-alone 与 symbol-alone 都合法

  { name: 'tk_explore',
    description: 'PRIMARY TOOL — call FIRST for almost any question OR before an edit. Returns the verbatim source of the relevant symbols grouped by file in ONE capped call (Read-equivalent — treat as already Read; do NOT re-open those files), plus the call path among them. Query = NL question OR a bag of symbol/file names.',
    inputSchema: { type: 'object', properties: {
      query:       { type: 'string', description: 'Symbol names, file names, or short code terms (e.g. "AuthService loginUser session-manager"). A natural-language question works too.' },
      maxFiles:    { type: 'number', description: 'Maximum number of files to include source from (default: 12)', default: 12 },
      projectPath: projectPathProperty,
    }, required: ['query'] } },
];
```

**(4) 具体数值**：`getExploreBudget` 阶梯 **1/2/3/4/5**（断点 <500/<5000/<15000/<25000/else）；`tk_explore.maxOutputChars` **13000/18000/24000**（断点 <150/<500/≥500，G1 拥有）；非 explore 工具 `MAX_OUTPUT_LENGTH=15000`；`MAX_INPUT_LENGTH=10000`（query/symbol）；`MAX_PATH_LENGTH=4096`（projectPath/path/pattern）；`tk_search.limit` 默认 **10**，`tk_callers.limit` 默认 **20**，`tk_explore.maxFiles` 默认 **12**；`tk_node.required=[]`。

**(5) 有序步骤**：1) `src/budget.ts` 落 `getExploreBudget` + `exploreMaxOutputChars` + MAX 常量（无依赖，G/F 共用）；2) `tools.ts` 落 schema 数组 + `projectPathProperty`，从 `src/budget` import 预算；3) explore handler 在生成输出时 import `exploreMaxOutputChars(fileCount)` 作 cap（依赖 step 1）。

**(6) 测试**：(a) `getExploreBudget(400)=1`、`(4999)=2`、`(20000)=4`、`(30000)=5`；(b) `exploreMaxOutputChars(100)=13000`、`(300)=18000`、`(800)=24000`；(c) `tools` 数组断言 4 条且 `tk_node.inputSchema.required` 为 `[]`、`tk_search.required=['query']`；(d) A-B harness 字段记录每次 explore 实际输出字节 ≤ 对应 tier cap。

**(7) 证据回指**：codegraph `tools.ts:102-108,54/63/70,172-257,401-572`；DeepWiki 3-tool ladder（docs/codemap/codegraph-wiki-landscape-20260618.md:44）；G1 char tier 绑定（DEP MAP G/F 冲突裁定）。

---

### F.7 决策：`TK_MCP_TOOLS` 空 sentinel = A/B 基线臂（serves the codemap agent surface / 度量使能）

**(1) 决策**：A/B harness 通过**单一** env `TK_MCP_TOOLS` ablate 整个工具面 —— sentinel（在 K harness 里设为暴露**零工具**的特殊值）= without 臂；逗号子集 ablate 单个工具。被 ablate 的工具从 `tools/list` 真正缺席（非 call 时拒绝）；`execute()` 也防御性拒绝（若客户端缓存了）。这给 measured A/B（项目诚实模型）一个干净 baseline。K 在 SECONDARY（Claude Code headless，唯一干净 uncached-token runner）跑 measured 臂；PRIMARY 走 Track-2 opportunity facts，绝不计入 saved_tokens（DEP MAP K/B/F 冲突裁定）。

**(2) 要动的文件**：`src/mcp/tools.ts`（`toolAllowlist/isToolAllowed`，已在 F.3 落）；K harness 脚本（`scripts/`，本需求只暴露 env 接口，harness 实现属 K）。

**(3) 可抄代码** —— 同 F.3 的 `toolAllowlist/isToolAllowed`（源: codegraph `tools.ts:728-740`，已 verbatim 给出）。基线臂的调用约定（已改写为 tk 语义）：
```bash
# K Track-1：without 臂 —— 零工具（tools/list 返回 []，agent 退回 built-in）
# 实现方式：harness 把 TK_MCP_TOOLS 设为一个不匹配任何工具的 sentinel 短名，
# 使 toolAllowlist() 返回非空 set 但 getTools() 过滤后为空。
TK_MCP_TOOLS='__none__' tk mcp     # without 臂（zero tools listed）
# with 臂 —— 默认 4 套
tk mcp                              # with 臂
# 单工具 ablation —— 量 tk_explore 的边际贡献
TK_MCP_TOOLS='node,search,callers' tk mcp   # 去掉 explore
```
注：dossier 称「unset/empty→DEFAULT」，故纯空字符串**不是** without 臂（会回默认 4 套）；without 臂须用「非空但不匹配任何工具」的 sentinel。实现备注：在 `getStaticTools/getTools` 已有的 `allow.has(...)` 过滤下，sentinel `__none__` 天然过滤为空集 —— 无需额外代码，harness 侧约定即可。

**(4) 具体数值**：without 臂 = `TK_MCP_TOOLS='__none__'`（不匹配任何短名 → 空 list）；with 臂 = env 未设（默认 4）；单工具 ablation = 逗号子集。

**(5) 有序步骤**：1) 复用 F.3 的 allowlist 逻辑（无新增）；2) K harness 脚本以三组 env 跑 with/without/ablation（属 K，本需求只验证 env 行为）。

**(6) 测试**：(a) `TK_MCP_TOOLS='__none__'` → `tools/list` 返回 `[]`；(b) env 未设 → 返回 4 名；(c) `TK_MCP_TOOLS='node'` → 返回 1 名 `tk_node`，且 execute(`tk_explore`) 被拒（"disabled via TK_MCP_TOOLS"）。

**(7) 证据回指**：codegraph `tools.ts:721-740`（「Lets an operator (or an A/B harness) trim the tool surface… ablated tool is truly absent from ListTools rather than merely denied on call」）；K/B/F 冲突裁定。

---

### F.8 决策：workspace-root 解析顺序（含 Windows file:// 处理）（serves the codemap agent surface）

**(1) 决策**：root 解析顺序 = (1) `initialize.rootUri` / `workspaceFolders[0].uri`（最强）；(2) `--path` CLI flag；(3) server-initiated `roots/list`（一次性、5s、仅当客户端 advertise `capabilities.roots`）；(4) `process.cwd()` 兜底（**延后**，让 roots/list 答案能胜出）。`fileUriToPath` 处理 Windows 盘符 `file://`（`/C:/...`→`C:/...`）—— Windows 可移植性硬要求。无 root 时 NotIndexedError 告诉 agent 传 `projectPath` 或加 `--path`，若确未索引则本 session 停止调 tk。

**(2) 要动的文件**：`src/mcp/session.ts`（`fileUriToPath` + `handleInitialize` 顺序 + `initFromRoots`）。

**(3) 可抄代码**：

源: /tmp/tk-research/codegraph/src/mcp/session.ts:42,48-59（verbatim，Windows 盘符处理）：
```ts
const ROOTS_LIST_TIMEOUT_MS = 5000;

/** file:// URI → 文件系统路径。处理 URL 编码 + Windows 盘符。 */
function fileUriToPath(uri: string): string {
  try {
    const url = new URL(uri);
    let filePath = decodeURIComponent(url.pathname);
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
      filePath = filePath.slice(1);          // /C:/foo → C:/foo
    }
    return path.resolve(filePath);
  } catch {
    return uri.replace(/^file:\/\/\/?/, '');
  }
}
```

解析顺序（强信号优先、cwd 延后），源: /tmp/tk-research/codegraph/src/mcp/session.ts:183-190（verbatim）：
```ts
// 强信号优先：client rootUri / workspaceFolders，再 --path。cwd 不在此处 ——
// 延后它，使 roots/list 答案能胜出（issue #196）。
let explicitPath: string | null = null;
if (params?.rootUri) {
  explicitPath = fileUriToPath(params.rootUri);
} else if (params?.workspaceFolders?.[0]?.uri) {
  explicitPath = fileUriToPath(params.workspaceFolders[0].uri);
} else if (this.explicitProjectPath) {
  explicitPath = this.explicitProjectPath;
}
```

server-initiated roots/list 兜底，源: /tmp/tk-research/codegraph/src/mcp/session.ts:304-319（verbatim）：
```ts
private async initFromRoots(): Promise<void> {
  let target = process.cwd();
  try {
    const result = await this.transport.request('roots/list', undefined, ROOTS_LIST_TIMEOUT_MS);
    const rootPath = firstRootPath(result);
    if (rootPath) target = rootPath;
    else process.stderr.write('[tk MCP] Client returned no workspace roots; falling back to process cwd.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[tk MCP] roots/list request failed (${msg}); falling back to process cwd.\n`);
  }
  await this.engine.ensureInitialized(target);
}
```

**(4) 具体数值**：`ROOTS_LIST_TIMEOUT_MS=5000`；roots/list **一次性**（`rootsAttempted` latch）；仅 `clientSupportsRoots`（`!!params?.capabilities?.roots`）时发；Windows `/^\/[a-zA-Z]:/` 去前导斜杠。

**(5) 有序步骤**：1) `fileUriToPath` + `firstRootPath`（含 win32 分支，可独立单测）；2) `handleInitialize` 四级顺序；3) `initFromRoots` + `retryInitIfNeeded` 兜底链（依赖 step 1）。

**(6) 测试**：(a) `fileUriToPath('file:///C:/proj')` 在 win32 返回 `C:\proj`、在 posix 返回 `/C:/proj` 不剥；(b) initialize 带 `rootUri` 时不发 roots/list；(c) initialize 无 root 且 `capabilities.roots` → 触发一次 roots/list，5s 超时后落 cwd。

**(7) 证据回指**：codegraph `session.ts:42,48-59,183-190,304-319`；issue #196。

---

### F.9 决策：对 built-in grep 的引导是 ADDITIVE/概率性，终端 shim 仅管命令输出（serves the codemap agent surface）

**(1) 决策**：直面硬事实 —— tk **不**拦截/重写 VS Code Copilot 的 built-in `read_file`/`search`（不可能，宿主拥有输出）。在 PRIMARY 上以 ADDITIVE/概率性方式竞争：(a) 强工具 description（"use INSTEAD of Read"）；(b) server-instructions 反模式；(c) 扩展 `modelDescription`。在**终端宿主**保留既有 interceptive PATH shim（`tk <cmd>`）管命令输出（surface 8），**绝不**把终端命令重包成 additive MCP 工具。MCP 工具与 shell 命令无重叠。

**(2) 要动的文件**：无新增后端文件（引导文案已在 F.5/F.6 的 description 与 instructions 内）；`src/shim/`（既有，**不动** —— 仅声明边界：shim 不进入 MCP 工具）；扩展 `extension/src/tools/lmTools.ts` 的 `modelDescription` 复用 F.6 的 description 文案。

**(3) 可抄代码** —— 引导文案即 F.6 的 `tk_explore`/`tk_node` description（"use INSTEAD of the Read tool" / "do NOT re-open those files"）+ F.5 的 Anti-patterns 小节，已逐字给出。边界为架构约束，无独立代码块：实现时仍需补齐的 gap = 扩展侧 LM tool 的 `invoke()` 桥接（调 `src/mcp` 的 `ToolHandler.execute`），codegraph（upstream reference）无扩展实现可抄。

**(4) 具体数值**：引导面 = 3 处（tool description + server-instructions + 扩展 modelDescription）；MCP 工具数 ∩ shell 命令数 = 0（零重叠）；shim 触达面仅 `run_in_terminal`。

**(5) 有序步骤**：1) 确认 F.6 description 与 F.5 instructions 含「INSTEAD of Read/grep」措辞；2) 扩展 `modelDescription` 复用同文案；3) 文档化 shim/MCP 边界（shim 不出现在 `tools` 数组）。

**(6) 测试**：(a) 静态断言 `tools` 数组中无任何工具名对应 shell 命令（无 `tk_run`/`tk_bash`）；(b) 断言 `tk_node.description` 含子串 "INSTEAD of the Read tool"；(c) 人工/harness 记录 agent 选 `tk_explore` vs built-in read 的占比（Track-2 opportunity fact，不计 saved_tokens）。

**(7) 证据回指**：token-optimization-landscape TL;DR（「shim interceptive (terminal only); MCP/extension tools additive… do not re-wrap [terminal commands] as additive tools」）；§Conclusion（shim 是 weaker bet，触达面收缩）。

---

### F 小结：committed 决策一览（全部 serves the codemap agent surface）

| # | 决策 | 关键数值 | 源 |
|---|---|---|---|
| F.1 | 扩展(PRIMARY) + `tk mcp`(SECONDARY) 双前端单后端 | 默认 4 LM tool；`onStartupFinished` | landscape §C3/C8；codegraph index.ts:332 |
| F.2 | 手写 JSON-RPC stdio，非 SDK | ~420 LOC 零依赖；roots/list 5000ms | codegraph transport.ts |
| F.3 | 默认 4 工具 / tiny-repo 3 / `TK_MCP_TOOLS` ablation | 阈值 **500** | codegraph tools.ts:656,785 |
| F.4 | NO-INDEX→空 list + success-shaped NotIndexed | 未索引 `tools:[]`；NotIndexed `isError`=false | codegraph tools.ts:44,1171；session.ts:229 |
| F.5 | ≤9KB instructions playbook（full+short） | full ≤9KB（基线 9296B） | codegraph server-instructions.ts |
| F.6 | outline-ladder 折进设计 + 真实 schema | budget 1-5；explore cap 13000/18000/24000；MAX_INPUT 10000/MAX_PATH 4096 | codegraph tools.ts:102,172,401 |
| F.7 | `TK_MCP_TOOLS` sentinel = A/B 基线臂 | without=`__none__`；with=未设 | codegraph tools.ts:721 |
| F.8 | root 解析顺序 + Windows file:// | roots/list 5000ms 一次性；win32 盘符剥斜杠 | codegraph session.ts:42,183,304 |
| F.9 | 引导 = additive/概率性；shim 仅管命令输出 | 引导面 3 处；MCP∩shell=0 | landscape TL;DR/§Conclusion |

**跨需求绑定备忘**：F8 的 `maxOutputChars` **import** G1（`src/budget.ts`）不重定义；传输 = stdio（无 daemon，per-session MCP 即暖路径；cross-session daemon = Outside-scope，D21/[ADR 0033](../adr/0033-daemon-decomposed-three-capabilities.md)）；DB 库外、`.tk/` 仅人类工件；扩展是 H(viewer)/I(round-trip) 的宿主，经 L 渠道发布；measured A/B 跑在 Claude Code headless（SECONDARY），PRIMARY 走 Track-2 opportunity facts。


---

