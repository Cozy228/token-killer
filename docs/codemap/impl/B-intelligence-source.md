## 需求 B — Intelligence source（静态 / LLM / 混合）

本节落实 DEP MAP 中 B 的承诺：**HYBRID = 确定性静态内核（authoritative，always-on，承载整条 find-code/agent 路径）+ 宿主借用/订阅 CLI 生成层（运行时依赖在运行时可选，host-paid，仅叙事）+ 纯 Node 确定性兜底**。边界画在 **field 粒度**，由 `provenance` 列（`static|llm|template`）承载；检索排序一律 `WHERE provenance='static'`，使 LLM 字段永远无法改变 find-code 结果。绝不内置 API key、绝不花模型 token。上游约束：A 的「一个图库（ONE BACKEND）+ 两份 surface（codemap = agent，codeguide = human）」、C 的物理表（provenance/file:line/staleness 列）、L 的版本闸门 `>=22.5.0 <25.0.0`。

下文每条决策标注它服务哪个 surface（codeguide 人类面 / codemap agent 面 / 两者）。所有被粘贴的代码已用 Read 逐一打开核对，标注「源: <clone路径:行号>」；与 dossier 候选不符处已订正并注明。

---

### B-D1 静态/LLM 边界 = node schema 上的 per-field 契约（serves both surfaces）

**(1) 决策：** 边界不是 per-feature 开关，而是 schema 上的 per-field 契约。STATIC（确定性、authoritative、永远存在）= node 的 `id/type/name/filePath/lineRange/params/exports.isDefault`、`{imports,exports,contains,calls,inherits,implements}` 边、`importCount/exportCount/functionCount/classCount` 指标、非代码节点的 `sections/definitions/endpoints/services/resources`。LLM-GENERATED（可选、provenance 打标、永不进检索排序）= `summary/tags/languageNotes`、`layer.name/description`、`tour[].title/description`、concept 节点、语义边 `{related,similar_to,depends_on-by-intent}`。检索/边遍历一律只读 static 字段——缺失或未校验的 LLM 字段绝不能改变 find-code 结果。

**(2) 要动的文件：**
```
src/codemap/
  intelligence/
    fieldContract.ts        # 新建：STATIC_FIELDS / LLM_FIELDS 白名单 + 断言
    extractStatic.ts        # 新建：buildResult() 的 tk 改写（tree-sitter→静态节点）
  store/
    schema.sql              # C 拥有的 DDL；本节追加 provenance 列约束（见下）
```

**(3) 可抄代码：** 静态集完全可由 tree-sitter 派生、零模型——这是 understand-anything `buildResult()` 已证明的（纯函数、无 I/O）。tk 直接复用其映射结构（已改写为 tk 的 `kind` 枚举命名，但字段语义一一对应）。

```javascript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/extract-structure.mjs:146  （verbatim）
export function buildResult(file, totalLines, nonEmptyLines, analysis, callGraph, batchImportData) {
  const base = {
    path: file.path,
    language: file.language,
    fileCategory: file.fileCategory,
    totalLines,
    nonEmptyLines,
  };
  if (!analysis) {
    base.metrics = {};               // 无 parser 匹配 → 仅基础指标
    return base;
  }
  if (analysis.functions && analysis.functions.length > 0) {
    base.functions = analysis.functions.map(fn => ({
      name: fn.name,
      startLine: fn.lineRange[0],
      endLine: fn.lineRange[1],
      params: fn.params || [],
    }));
  }
  // classes / exports / sections / definitions / services / endpoints / steps / resources 同样确定性派生
  if (callGraph && callGraph.length > 0) { base.callGraph = callGraph; }
  const metrics = {};
  const importPaths = batchImportData?.[file.path];
  if (importPaths && importPaths.length > 0) { metrics.importCount = importPaths.length; }
  else if (analysis.imports) {
    metrics.importCount = analysis.imports.filter(imp => (imp?.source ?? '').startsWith('.')).length;
  }
  if (analysis.exports) metrics.exportCount = analysis.exports.length;
  if (analysis.functions) metrics.functionCount = analysis.functions.length;
  if (analysis.classes) metrics.classCount = analysis.classes.length;
  base.metrics = metrics;
  return base;
}
```

provenance 列契约（C 拥有 DDL，本节定义其约束语义；已改写为 tk 表名）：

```sql
-- 已改写（tk 适配，C5/C6 表上的列契约）。检索路径只查 static。
-- summary / tags / narrative 字段表上：
ALTER TABLE node_summary ADD COLUMN provenance TEXT
  CHECK (provenance IN ('static','llm','template')) NOT NULL DEFAULT 'static';

-- 任何排序 / 边遍历 / FTS 召回都加此过滤：
-- SELECT ... FROM node JOIN node_fts ... WHERE node_summary.provenance = 'static';
```

字段白名单断言（需实现时补；核心是把上面 buildResult 的输出键集合冻结为 STATIC_FIELDS）：

```typescript
// 已改写（tk 新建）。LLM 写入前必须经过此白名单——禁止 LLM 触碰 STATIC_FIELDS。
export const STATIC_FIELDS = new Set([
  'id','type','name','filePath','lineRange','params','exports',
  'imports','contains','calls','inherits','implements',
  'importCount','exportCount','functionCount','classCount',
  'sections','definitions','endpoints','services','resources',
]);
export const LLM_FIELDS = new Set([
  'summary','tags','languageNotes','layerName','layerDescription',
  'tourTitle','tourDescription','concept','related','similar_to',
]);
export function assertNoStaticOverwrite(patch: Record<string, unknown>) {
  for (const k of Object.keys(patch)) {
    if (STATIC_FIELDS.has(k)) throw new Error(`LLM field '${k}' may not overwrite a STATIC field`);
  }
}
```

**(4) 具体数值：** provenance CHECK 取值恰 3 个 `static|llm|template`，DEFAULT `'static'`。检索过滤谓词固定为 `provenance='static'`（0 例外）。

**(5) 有序步骤：**
1. 在 C 的 schema.sql 上为 summary/tags/narrative 表加 provenance 列（独立可发布：纯 DDL，默认 static 不改变现有行为）。
2. 落地 `extractStatic.ts`（移植 buildResult），产出仅 STATIC_FIELDS 的节点。
3. 落地 `fieldContract.ts` 白名单 + `assertNoStaticOverwrite`，接到任何 LLM 写入入口前。

**(6) 测试：**
- 单测：对 tk-repo 一个 fixture 文件跑 extractStatic，断言输出键 ⊆ STATIC_FIELDS，且无 `summary/tags`。
- 单测：`assertNoStaticOverwrite({name:'x'})` 抛错；`({summary:'y'})` 通过。
- A-B harness 字段：检索 arm 跑在 provenance 过滤下，断言结果集与「整库无 provenance 列」时按 file:line 完全一致（LLM 字段不影响召回）。

**(7) 证据回指：** extract-structure.mjs:146-304（已读核对，纯函数无模型）；DEP MAP B drives「C5/C6 carry provenance; FTS over static-only」。

---

### B-D2 生成委派机制 = HOST-FIRST，CLI-SECOND，绝不 API（serves both surfaces）

**(1) 决策：** 主路径 = `SKILL.md`/slash-command（`/tk understand`），由 **宿主 agent**（主：VS Code Copilot/Windows；次：Claude Code/macOS）执行——tk 发出确定性编排计划 + 静态事实，宿主自己的模型填叙事，tk 解析返回的 JSON。次路径（headless/非交互）= caw 式后端 shell out 到用户本地 `claude`/`codex` CLI（OAuth 订阅）。tk **绝不**用 api_key 构造 LLM 客户端。

**(2) 要动的文件：**
```
src/codemap/intelligence/
  delegate/
    hostSkill.ts        # 新建：发编排计划 + 静态事实，解析宿主返回 JSON
    cawBackend.ts       # 新建：caw 式订阅 CLI 后端（presence gate）
    providers.ts        # 新建：provider→CLI 二进制映射 + 工具组
skills/tk-understand/
  SKILL.md              # 新建：宿主 slash-command 编排（phases）
```

**(3) 可抄代码：** caw 后端的 provider 映射 + presence gate 直接复用（已改写为 TS）。源码 verbatim：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:47  （verbatim）
_CAW_PROVIDER_MAP = {
    "claude-code": "claude_code",
    "codex": "codex",
}
_CLI_BINARY = {
    "claude-code": "claude",
    "codex": "codex",
}
```

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:132  （verbatim，presence gate + 超时环境变量）
        cli = _CLI_BINARY[config.provider]
        if shutil.which(cli) is None:
            raise RuntimeError(
                f"Subscription mode requires the '{cli}' CLI on PATH. "
                f"Install it and run '{cli} login', then try again."
            )
        if self._caw_provider == "claude_code":
            os.environ.setdefault("MCP_TOOL_TIMEOUT", "86400000")
            os.environ.setdefault("MCP_TIMEOUT", "60000")
```

tk 改写（TS，按 Windows PATHEXT 解析二进制，复用 tk 既有 resolveProgram）：

```typescript
// 已改写（tk 适配 caw_backend.py:47/132-144）。Windows 用 PATHEXT(.cmd/.exe) 经 tk resolveProgram 解析。
const CLI_BINARY = { 'claude-code': 'claude', 'codex': 'codex' } as const;

export function ensureSubscriptionCli(provider: keyof typeof CLI_BINARY): string {
  const cli = CLI_BINARY[provider];
  const resolved = resolveProgram(cli);              // tk 既有：win 走 PATHEXT
  if (!resolved) {
    throw new Error(
      `Subscription mode requires the '${cli}' CLI on PATH. ` +
      `Install it and run '${cli} login', then try again.`,
    );
  }
  if (provider === 'claude-code') {
    process.env.MCP_TOOL_TIMEOUT ??= '86400000';      // 24h，扛长递归
    process.env.MCP_TIMEOUT ??= '60000';
  }
  return resolved;
}
```

**(4) 具体数值：** `MCP_TOOL_TIMEOUT=86400000`（24h），`MCP_TIMEOUT=60000`（60s）。两条均 `setdefault`/`??=`（保留用户覆盖）。当既无宿主 slash-command 上下文、又无 logged-in CLI → 跳过生成，直接 ship static-only（B-D7）。

**(5) 有序步骤：**
1. 落地 `providers.ts`（映射 + `ensureSubscriptionCli`，纯解析，可独立单测）。
2. 落地 `SKILL.md` + `hostSkill.ts`（主路径：发计划→解析 JSON，无模型调用）。
3. 落地 `cawBackend.ts`（次路径：headless 才走，shell out CLI）。

**(6) 测试：**
- 单测：PATH 无 `claude` 时 `ensureSubscriptionCli('claude-code')` 抛含安装提示的错误；mock 存在时返回路径并设两环境变量。
- 单测：宿主返回带 envelope 的 JSON，`hostSkill.ts` 仍解析成功（与 B-D5 normalizer 串联）。
- 断言：grep 全仓 `new OpenAI|api_key|AsyncOpenAI` 命中 0（CI gate）。

**(7) 证据回指：** caw_backend.py:1-6（OAuth、no API key，已读核对）、:47-55（映射）、:132-144（presence gate + 超时，已读核对）；landscape codegraph-wiki-landscape-20260618.md:51（caw OAuth on-brand）。

---

### B-D3 借用 agent 的工具面 = READ + PARALLEL only，写经 tk 校验工具（serves the codeguide human surface）

**(1) 决策：** 借来的生成 agent 工具组限制为 READER|PARALLEL；禁宿主 Write/Edit/NotebookEdit/Bash，强制所有写经过 tk 自有的 editor 工具，使校验统一在每次写时运行。codex 需额外加 EXEC（否则非交互 `codex exec` 会取消 MCP 工具调用）。

**(2) 要动的文件：**
```
src/codemap/intelligence/delegate/providers.ts   # 工具组映射（接 B-D2）
```

**(3) 可抄代码：** verbatim 源：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:62  （verbatim）
_AGENT_TOOL_GROUP = ToolGroup.READER | ToolGroup.PARALLEL

def _agent_tool_group_for_provider(provider: str) -> ToolGroup:
    if provider == "codex":
        # codex exec 在非交互模式取消 MCP 工具调用；加 EXEC → 映射到
        # --dangerously-bypass-approvals-and-sandbox，是 MCP 工具可靠运行的模式
        return _AGENT_TOOL_GROUP | ToolGroup.EXEC
    return _AGENT_TOOL_GROUP
```

**(4) 具体数值：** 工具组 = `READER|PARALLEL`（claude）/ `READER|PARALLEL|EXEC`（codex）。WRITER/INTERACTION/WEB 全关。

**(5) 有序步骤：**
1. 在 `providers.ts` 暴露 `toolGroupForProvider(provider)`，claude 返 READER|PARALLEL，codex 加 EXEC（独立可测）。

**(6) 测试：** 单测 `toolGroupForProvider('codex')` 含 EXEC，`('claude-code')` 不含 EXEC 且不含 WRITER。

**(7) 证据回指：** caw_backend.py:62-77（已读核对，含 codex EXEC 注释）；caw_toolkit.py:219-221（写时跑 Mermaid 校验，见 B-D6）。

---

### B-D4 Prompt 构造 = 纯静态上下文装配 → 格式化 → 宿主（serves both surfaces）

**(1) 决策：** 一个纯函数遍历静态图（目标的 1-hop 邻居、contains-children、layer），一个 formatter 输出以显式 `## Instructions` 结尾的 markdown prompt。两个函数内部均不调用模型——token 成本恰等于静态事实，无投机检索。

**(2) 要动的文件：**
```
src/codemap/intelligence/
  buildExplainContext.ts   # 新建：纯图遍历
  formatExplainPrompt.ts   # 新建：固定指令块格式化
```

**(3) 可抄代码：** understand-anything `formatExplainPrompt()` verbatim（纯字符串拼接，宿主填其余）：

```typescript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/src/explain-builder.ts:108  （verbatim 摘录）
export function formatExplainPrompt(ctx: ExplainContext): string {
  const { targetNode, childNodes, connectedNodes, relevantEdges, layer } = ctx;
  const lines: string[] = [];
  lines.push(`# Deep Dive: ${targetNode.name}`);
  lines.push(`**Type:** ${targetNode.type} | **Complexity:** ${targetNode.complexity}`);
  if (targetNode.filePath) lines.push(`**File:** \`${targetNode.filePath}\``);
  if (targetNode.lineRange) lines.push(`**Lines:** ${targetNode.lineRange[0]}-${targetNode.lineRange[1]}`);
  lines.push(`**Summary:** ${targetNode.summary}`);
  if (layer) { lines.push(`## Architectural Layer: ${layer.name}`); lines.push(layer.description); }
  if (childNodes.length > 0) {
    lines.push("## Internal Components");
    for (const child of childNodes) lines.push(`- **${child.name}** (${child.type}): ${child.summary}`);
  }
  if (connectedNodes.length > 0) {
    lines.push("## Connected Components");
    for (const node of connectedNodes) lines.push(`- **${node.name}** (${node.type}): ${node.summary}`);
  }
  if (relevantEdges.length > 0) {
    const nodeMap = new Map([...[targetNode], ...childNodes, ...connectedNodes].map(n => [n.id, n]));
    lines.push("## Relationships");
    for (const edge of relevantEdges) {
      if (edge.type === "contains") continue;
      const src = nodeMap.get(edge.source)?.name ?? edge.source;
      const tgt = nodeMap.get(edge.target)?.name ?? edge.target;
      lines.push(`- ${src} --[${edge.type}]--> ${tgt}${edge.description ? ` — ${edge.description}` : ""}`);
    }
  }
  lines.push("## Instructions");
  lines.push("Provide a thorough explanation of this component:");
  lines.push("1. What it does and why it exists in the project");
  lines.push("2. How data flows through it (inputs, processing, outputs)");
  lines.push("3. How it interacts with connected components");
  lines.push("4. Any patterns, idioms, or design decisions worth noting");
  lines.push("5. Potential gotchas or areas of complexity");
  return lines.join("\n");
}
```

`buildExplainContext(graph, path) -> ExplainContext`（target/children/connected/edges/layer 的纯遍历，verbatim 返回结构见 explain-builder.ts:100-103，已读核对）。

**(4) 具体数值：** 邻居跨度 = 1-hop。指令块固定 5 点。`temperature=0.0` 传入但对订阅 CLI 视为 unused（CLI 不暴露 temperature）。

**(5) 有序步骤：**
1. 落地 `buildExplainContext.ts`（纯遍历，可单测，零 token）。
2. 落地 `formatExplainPrompt.ts`（移植上面 verbatim）。

**(6) 测试：** 单测：给定 fixture graph，`formatExplainPrompt` 输出以 `## Instructions` 结尾且含 5 行编号；断言函数内无网络/模型调用（spy）。

**(7) 证据回指：** explain-builder.ts:22-103（纯遍历）、:108-193（固定指令块，已读核对）；caw_backend.py:160（temperature unused 注释）。

---

### B-D5 输出解析 + 确定性归一化（强制，无 LLM 也跑）（serves the codeguide human surface）

**(1) 决策：** 任何生成后跑纯 Node normalizer：解 `{layers:[...]}`/`{steps:[...]}` envelope、改名 legacy 字段（`nodes→nodeIds`、`nodesToInspect→nodeIds`、`whyItMatters→description`）、合成缺失 id（`layer:<kebab>`）、把裸路径转前缀 id、DROP dangling refs。no-LLM 路径用同一份代码（作用在 template stub 上）。

**(2) 要动的文件：**
```
src/codemap/intelligence/normalize.ts   # 新建：envelope/legacy/id/dangling 归一化
```

**(3) 可抄代码：** understand-anything SKILL.md Phase 4/5 规定的有序步骤（verbatim 规格，tk 实现为纯函数）：

```text
源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/SKILL.md:447  （verbatim 步骤，layers）
1. Unwrap envelope: { "layers": [...] } → 内层数组
2. Rename legacy: nodes → nodeIds（若为对象取 .id）
3. Synthesize missing IDs: 缺 id → layer:<kebab-case-name>
4. Convert file paths: 无已知前缀(file:/config:/document:/service:/pipeline:/table:/schema:/resource:/endpoint:)的裸路径 → file:<relative-path>
5. Drop dangling refs: 删除不在 merged node set 中的 nodeIds
```
```text
源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/SKILL.md:525  （verbatim 步骤，tour）
1. Unwrap envelope: { "steps": [...] } → 内层数组
2. Rename legacy: nodesToInspect → nodeIds; whyItMatters → description
3. Convert file paths（同上前缀集）
4. Drop dangling refs
5. Sort by order
```

tk 实现骨架（需实现时补完 kebab/前缀转换；已改写）：

```typescript
// 已改写（tk 实现 SKILL.md:447-454 / 525-531 的有序步骤）。无 LLM 时作用在 template stub 上。
const ID_PREFIXES = ['file:','config:','document:','service:','pipeline:','table:','schema:','resource:','endpoint:'];
export function normalizeLayers(raw: unknown, nodeIdSet: Set<string>): Layer[] {
  let arr = Array.isArray(raw) ? raw : (raw as any)?.layers ?? [];
  return arr.map((l: any) => {
    let nodeIds = l.nodeIds ?? l.nodes ?? [];
    nodeIds = nodeIds.map((n: any) => (typeof n === 'string' ? n : n.id));
    const id = l.id ?? `layer:${kebab(l.name)}`;
    nodeIds = nodeIds.map((n: string) => (ID_PREFIXES.some(p => n.startsWith(p)) ? n : `file:${n}`));
    nodeIds = nodeIds.filter((n: string) => nodeIdSet.has(n));   // drop dangling
    return { ...l, id, nodeIds };
  });
}
```

**(4) 具体数值：** id 前缀集恰 9 个。归一化通过一次后仍失败 → 带 warnings 保存并跳过 dashboard/report 自动启动（不重试第二次）。

**(5) 有序步骤：**
1. 落地 `normalizeLayers` / `normalizeTour`（纯函数，可单测）。
2. 接到 B-D2 宿主返回解析后、B-D6 校验前。

**(6) 测试：** 单测：喂 `{layers:[{name:'Core Engine',nodes:[{id:'file:a.ts'},'b.ts']}]}` + nodeSet `{file:a.ts}`，断言输出 `id='layer:core-engine'`、`nodeIds=['file:a.ts']`（`b.ts→file:b.ts` 因 dangling 被删）。

**(7) 证据回指：** SKILL.md:447-454、525-531（已读核对，「LLMs may still produce an envelope」）。

---

### B-D6 校验默认 = 纯 Node 校验器；LLM reviewer 仅 `--review`（serves both surfaces）

**(1) 决策：** 默认走纯 Node 校验器：节点须有 `id/type/name/summary/tags`、无重复 id、每条边 source/target 可解析、每个 file 级节点恰属一 layer、每个 tour/layer 的 nodeId 存在、orphan 警告。每个 LLM 生成的 mermaid/diagram 语法校验，能修则修否则移除。LLM reviewer 仅在 `--review` 时跑。

**(2) 要动的文件：**
```
src/codemap/intelligence/
  validate.ts          # 新建：纯 Node 校验器 + auto-fix
  mermaidRepair.ts     # 新建：fix-or-remove（移植 repodoc）
```

**(3) 可抄代码：** understand-anything 校验器 stats 形状 verbatim：

```javascript
// 源: /tmp/tk-research/understand-anything/understand-anything-plugin/skills/understand/SKILL.md:650  （verbatim）
const stats = {
  totalNodes: graph.nodes.length,
  totalEdges: graph.edges.length,
  totalLayers: graph.layers.length,
  tourSteps: graph.tour.length,
  nodeTypes: graph.nodes.reduce((a, n) => { a[n.type] = (a[n.type]||0)+1; return a; }, {}),
  edgeTypes: graph.edges.reduce((a, e) => { a[e.type] = (a[e.type]||0)+1; return a; }, {})
};
fs.writeFileSync(outputPath, JSON.stringify({ issues, warnings, stats }, null, 2));
```

auto-fix 规格 verbatim（SKILL.md:707-710）：`empty tags→['untagged']`、`empty summary→'No summary available'`、删 dangling 边、移除 invalid-type 节点。

Mermaid fix-or-remove 移植 repodoc verbatim：

```python
# 源: /tmp/tk-research/repodoc/repodoc/src/utils.py:218  （verbatim 摘录）
def validate_and_fix_links(docs_dir, remove_broken=True, fix_mermaid=True):
    results = {"fixed": [], "skipped": [], "removed": [], "mermaid_fixed": []}
    for md_file in glob.glob(os.path.join(docs_dir, "**/*.md"), recursive=True):
        # ... 删 broken link：[text](broken) → text ...
        if fix_mermaid:
            mermaid_fixed = fix_invalid_mermaid(content)
            if mermaid_fixed != content:
                content = mermaid_fixed
                results["mermaid_fixed"].append(rel_path)
    return results
```

codewiki 在每次 `.md` 写时跑 Mermaid 校验 verbatim：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_toolkit.py:219  （verbatim）
        if command != "view" and path.endswith(".md"):
            mermaid_validation = await validate_mermaid_diagrams(absolute_path, path)
            result = result + "\n---------- Mermaid validation ----------\n" + mermaid_validation
```

**(4) 具体数值：** 校验器输出 `{issues[], warnings[], stats{totalNodes,totalEdges,totalLayers,tourSteps,nodeTypes,edgeTypes}}`。归一化+修复一次后仍有 critical issues → 保存但跳过自动启动。Mermaid：能修则修，否则移除（不留半成品图）。

**(5) 有序步骤：**
1. 落地 `validate.ts`（纯 Node，可单测，无 LLM 也产出 stats）。
2. 落地 `mermaidRepair.ts`（fix-or-remove），接到任何 LLM diagram 写入后。
3. `--review` 旗标下才 dispatch LLM graph-reviewer（次序在纯 Node 之后）。

**(6) 测试：**
- 单测：含一条 dangling 边 + 一个空 tags 节点的 graph → 校验后边被删、tags=`['untagged']`，stats 计数正确。
- 单测：非法 mermaid 文本 → repair 返回的内容要么是合法图、要么图块被移除（断言不含原非法语法）。

**(7) 证据回指：** SKILL.md:597-663（默认纯 Node）、:676-700（`--review` LLM）、:650-660/707-710（stats+auto-fix，已读核对）；utils.py:218-279（已读核对）；caw_toolkit.py:219-221（已读核对）。

---

### B-D7 No-LLM 降级模式 = 一等公民（serves both surfaces）

**(1) 决策：** 无宿主模型且无 logged-in CLI 时，仍 ship：完整静态图 + FTS 索引（**job B 完全可用**）+ TEMPLATE 派生 summary（`provenance='template'`），形如 `function <name>(<params>) at <file>:<lines>, calls {callees}, called by {callers}`。纯叙事字段（layer.description 散文、tour rationale、concept 节点）**省略不编造**。

**(2) 要动的文件：**
```
src/codemap/intelligence/templateSummary.ts   # 新建：纯字符串 format over 静态分析
```

**(3) 可抄代码：** template summary 字段是对静态分析输出（`functions[].name/params`、`callGraph[].caller/callee`）的纯字符串格式化——源数据见 extract-structure.mjs:163-168（functions 映射，B-D1 已粘贴）与 callGraph 透传（:246-248，已读核对）。

```typescript
// 已改写（tk 新建）。源数据 = extract-structure.mjs:163-168 functions / :246-248 callGraph。
export function templateSummary(fn: { name: string; params: string[]; startLine: number; endLine: number },
                                filePath: string, callees: string[], callers: string[]): { text: string; provenance: 'template' } {
  const ps = fn.params.join(', ');
  const callsPart = callees.length ? `, calls {${callees.join(', ')}}` : '';
  const calledPart = callers.length ? `, called by {${callers.join(', ')}}` : '';
  return {
    text: `function ${fn.name}(${ps}) at ${filePath}:${fn.startLine}-${fn.endLine}${callsPart}${calledPart}`,
    provenance: 'template',
  };
}
```

UI/report 渲染时，叙事缺失处显示 affordance：`narrative not generated — run /tk understand with a logged-in agent`，而非假段落。

**(4) 具体数值：** template summary 0 token、0 模型。叙事字段缺失 = 显式 affordance 文本（固定 1 行）。job B 检索面在此模式下 100% 可用。

**(5) 有序步骤：**
1. 落地 `templateSummary.ts`（纯函数，可单测）。
2. 生成入口检测：无宿主上下文且 `resolveProgram('claude'/'codex')` 均空 → 走 template 路径并写 `provenance='template'`。
3. 渲染层对空叙事字段输出 affordance。

**(6) 测试：**
- 单测：给定 fn + callees/callers，`templateSummary` 输出含 `at file:line` 与 `calls {...}`，`provenance='template'`。
- A-B harness：在 PATH 清空 claude/codex 的 arm 下跑 job B 检索任务集，断言召回与有 LLM 的 arm **逐条一致**（job B 不依赖 LLM）。

**(7) 证据回指：** extract-structure.mjs:163-168/246-248（静态源，已读核对）；项目 memory「tk wraps real tools, never fabricates」；DEP MAP「B7 no-LLM mode is the K baseline」。

---

### B-D8 生成成本控制 = 仅在 multi-file ∧ 超 token 阈值 ∧ 在深度预算内才委派子 agent（serves the codeguide human surface）

**(1) 决策：** 逐字借用 codewiki：仅当模块多文件 **且** token 数 ≥ 阈值 **且** 深度 < max_depth 才委派子 agent；否则 inline 写单个 leaf doc。这是系统里唯一的 LLM 花费的省 token 闸门。

**(2) 要动的文件：**
```
src/codemap/intelligence/delegate/canDelegate.ts   # 新建：委派闸门
src/codemap/intelligence/config.ts                 # 新建：MAX_DEPTH/leaf 阈值默认
```

**(3) 可抄代码：** verbatim 闸门：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/be/caw_backend.py:252  （verbatim）
        num_tokens = count_tokens(components_with_code)
        can_delegate = (
            is_complex_module(components, core_component_ids)
            and start_depth < config.max_depth
            and num_tokens >= config.max_token_per_leaf_module
        )
```

默认值 verbatim：

```python
# 源: /tmp/tk-research/codewiki/codewiki/src/config.py:16  （verbatim 摘录）
MAX_DEPTH = 2
DEFAULT_MAX_TOKEN_PER_LEAF_MODULE = 16_000
MAIN_MODEL = os.getenv('MAIN_MODEL', 'claude-sonnet-4')
```

tk 改写（TS）：

```typescript
// 已改写（tk 适配 caw_backend.py:252-257 + config.py:16/20/40）。
export const MAX_DEPTH = 2;
export const MAX_TOKEN_PER_LEAF_MODULE = 16_000;
export function canDelegate(module: ModuleInfo, startDepth: number): boolean {
  return isComplexModule(module)
    && startDepth < MAX_DEPTH
    && countTokens(module.componentsWithCode) >= MAX_TOKEN_PER_LEAF_MODULE;
}
```

**(4) 具体数值：** `MAX_DEPTH=2`、`MAX_TOKEN_PER_LEAF_MODULE=16_000`。三条件全真才委派。MAIN_MODEL 默认 `claude-sonnet-4`（订阅 CLI 透传）。（Open Decision：是否对 tk 自身代码库重新标定阈值，待 Slice-1 measurement harness 出真实项目尺寸。）

**(5) 有序步骤：**
1. 落地 `config.ts`（常量，独立可发布）。
2. 落地 `canDelegate.ts`（纯判定，可单测）。

**(6) 测试：** 单测：`canDelegate(single-file 模块, 0)` = false；`(complex multi-file 18k-token, 0)` = true；`(complex 18k, 2)` = false（深度耗尽）。

**(7) 证据回指：** caw_backend.py:253-257（已读核对）；config.py:16/20/40（已读核对）。

---

### B-D9 拒绝 embeddings 作为默认构建的 intelligence source（serves the codemap agent surface）

**(1) 决策：** 默认构建无向量模型、find-code 路径无语义相似检索。embeddings 会 (a) 需模型/API key 或重本地运行时（违反 strong lean + Windows 可移植），(b) 重新引入「语义匹配上的 false confidence」失败模式。检索 = FTS5（符号/标识符文本）+ 图边遍历（imports/calls/contains）。`similar_to/related` 边仅作 `provenance='llm'` 的人类面提示，agent 排序器永不查（由 B-D1 provenance 过滤强制）。

**(2) 要动的文件：**
```
src/codemap/store/retrieve.ts   # 检索：FTS5 + 边遍历，强制 provenance='static'
（无 embedding 依赖、无向量表——即「不动」的承诺）
```

**(3) 可抄代码：** 无新增代码——这是「不引入」的决策。检索谓词复用 B-D1 的 `WHERE provenance='static'`；similar_to/related 边写入时强制打 `provenance='llm'` 且 retrieve.ts 的排序子句不含这些边类型。被拒模式（repodoc 内置 api_key 客户端）作为反例固定，CI gate 禁止其出现：

```python
# 源: /tmp/tk-research/repodoc/repodoc/src/llm.py:43  （verbatim — tk 必须不 ship 的模式）
    client = OpenAI(
        base_url=config.llm_base_url,
        api_key=config.llm_api_key,
    )
```
> 订正：dossier 候选称此处为 `AsyncOpenAI`；实读 llm.py:38/43 为同步 `from openai import OpenAI` + `OpenAI(base_url, api_key)`。语义（内置 api_key 客户端）不变，反例成立；类名已订正。

**(4) 具体数值：** 默认构建向量表数 = 0、embedding 模型数 = 0。检索 ranker 引用的边类型集合 = `{imports,calls,contains}`（不含 `similar_to/related`）。

**(5) 有序步骤：**
1. retrieve.ts 排序子句白名单边类型 `{imports,calls,contains}`（可单测）。
2. CI gate：grep `openai|AsyncOpenAI|api_key|faiss|embedding` 命中 0。

**(6) 测试：**
- 单测：检索一个同时有 `calls` 边与 `similar_to` 边的目标，断言结果只经 `calls` 召回，`similar_to` 目标不出现在 ranker 输出。
- CI 断言：禁止依赖列表（openai/faiss/向量库）grep = 0。

**(7) 证据回指：** llm.py:43-45（已读核对，反例）；compendium risk #2（false-confidence on semantic match）；DEP MAP「B9 embeddings reserve-only」「J12 rejects DeepWiki RAG」。

---

### 与上下游的绑定与冲突落点（coherence）

- **C（物理存储）：** B-D1 的 provenance 列由 C5/C6 承载；FTS 仅建在 static-only 文本上。DB 落出树（`~/.token-killer/projects/<fp>/index.db` POSIX / `%LOCALAPPDATA%\token-killer\...` Windows，per 冲突 C/L 决议），叙事产物（wiki/pages）才进 `.tk/`。
- **H/I（人类/协作面）：** B-D2 的宿主 slash-command（`/tk understand`）或 caw 订阅 CLI 的输出，经 B-D5 归一化 + B-D6 校验后，渲染为 H 的只读 HTML 与 I 的 `.tk/wiki/pages/*` 可编辑文件（编辑发生在文件，不在 HTML）。
- **J（信任）：** static-tier-authoritative + LLM 重锚到 file:line 是 confident-wrong 的结构性修复（J12 拒 DeepWiki RAG）。
- **K（度量）：** B 的 static/LLM 切分使 Job B（agent）在 Claude Code headless 上确定性度量（B-D7 no-LLM = K baseline）；叙事生成走 Job-A 小 N 协议（K9），不并入 saved_tokens。
- **M（治理）：** B 是 M14（仅订阅 LLM）、M19（不在 LLM 输出上做 eval）、M21（不出幻觉图）的来源。
- **G（产出经济）：** B static-tier-only 检索使产出经济路径 0-token/0-LLM。

### Open Decisions（交用户确认）

✅ **全部闭合（D22 / [ADR 0034](../adr/0034-llm-delegation-host-borrowed-no-byo-key.md)，grilling 2026-06-22 round 4）**：

1. ✅ **默认 provider = 复用宿主 in-session 模型**（Claude Code/macOS 次目标，宿主会话与 logged-in CLI 同时存在时）。caw 订阅子进程仅在真正 headless（无宿主会话可借）时兜底。
2. ✅ **严格禁止显式 BYO-key 逃生口**——永不 ship 构造 LLM 客户端的代码路径，保持 CI gate `grep -E 'openai|AsyncOpenAI|api_key|faiss|embedding'` 命中=0（repodoc `llm.py:43` 反例 + M23 + A4.11 无凭据原则）。无模型可借时 ship static-only（B-D7）诚实降级。
3. ✅ **leaf 阈值 = 沿用 codewiki `16_000` / `depth-2` 作可发布初值**，Slice-1 harness 出真实尺寸后重标定。

---

