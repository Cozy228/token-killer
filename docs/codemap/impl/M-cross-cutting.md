## 需求 M — Cross-cutting best-practices adopt-list + anti-pattern blacklist

本需求是治理层（governance overlay），不新建子系统，而是把 A–L 的实现钉死在一组**可执行的采纳清单**与**可执行的黑名单**上。所有数值与代码都已对照 clone 验证。核心不变量沿用上游：`node:sqlite + FTS5`（C/D/L）、`file:line` on every node（A2/J1）、`provenance` 单列服务三职（B1/J2）、static 层权威 + LLM 仅 host/subscription 付费（B/M14）、lazy-on-read 默认无 daemon（E/M18）。

---

### M1 — 三上下文类压缩边界（治理大法）  (serves both surfaces)

**决策**: 每一处投影输出必须声明类别 `ContextClass = 'understanding' | 'editing' | 'verification'`；**只有 `understanding` 允许有损**（签名/大纲/切片）；`editing` 必须逐字源码 + 稳定行锚 + content hash，**永不丢 body**；`verification` 只回 diff/hunk/失败行。这是「安全减 token」与「静默任务失败」之间唯一的那条线。

**要动的文件**:
- 新建 `src/codemap/context/class.ts`（类型 + 守卫）
- 改 `src/codemap/render/agentDiet.ts`、`render/humanDiet.ts`：每个投影函数返回 `{ class, payload }`
- 改 `src/codemap/mcp/tools.ts`（F）：每个工具的 result 带 `contextClass` 字段

**可抄代码**（tk-adapted，新写）:
```ts
// src/codemap/context/class.ts
export type ContextClass = 'understanding' | 'editing' | 'verification';

/** Only 'understanding' outputs may be lossy. editing/verification MUST be byte-exact. */
export function assertLossyAllowed(cls: ContextClass): void {
  if (cls !== 'understanding') {
    throw new Error(
      `lossy projection refused for context class '${cls}': ` +
      `editing requires verbatim source + line anchors + content hash, ` +
      `verification requires diff/hunk/failure-only`,
    );
  }
}

export interface Projected<T> {
  readonly contextClass: ContextClass;
  readonly payload: T;
  /** present iff contextClass === 'editing' — proves no body was dropped */
  readonly contentHash?: string;
}
```

**具体数值**: `editing` 类输出有损率必须为 **0%**（任意 body-drop 即测试失败）；`understanding` 类才进入 M9 的 ~70% 签名折叠。

**有序步骤**:
1. 落 `class.ts` 类型 + `assertLossyAllowed`（独立可测）。
2. 给 agentDiet/humanDiet 每个投影函数挂 `contextClass`，调用 `assertLossyAllowed` 守卫有损分支。
3. MCP 工具 result 透出 `contextClass`，供 K 的回放谐振器（M16）按类区分。

**测试**: 单测 — 对 `editing` payload 调任意签名折叠路径，断言抛错；对 `understanding` 不抛。fixture：一段已知函数体，`editing` 读回逐字 + hash 等于源文件 SHA-256。

**证据回指**: compendium §9.0 + §12.1（Serena/codesearch/FastContext/Repomix 反复区分；Repomix body-drop 标记 experimental）。

---

### M2 — 诚实低置信交还  (serves both surfaces)

**决策**: 检索结果带 `confidence?: 'high' | 'low'`。`'low'` = 查询只命中孤立常见词（无入口点被 2+ 个不同查询词交叉佐证）；此时工具回一句诚实交接（「建议 explore/trace，结果不完整」）而**不**把结果当完整呈现。纯图遍历时 `undefined`。

**要动的文件**: `src/codemap/types.ts`（检索结果接口加字段）；`src/codemap/render/agentDiet.ts`（low 时追加 handoff 文案）。

**可抄代码**（源: `/tmp/tk-research/codegraph/src/types.ts:335`，逐字，许可不限）:
```ts
  /**
   * Retrieval confidence for context-style queries. `'low'` means the query
   * resolved only to isolated common-word matches (no entry point corroborated
   * by 2+ distinct query terms) — callers should surface an honest handoff to
   * explore/trace rather than present the results as comprehensive. Undefined
   * for graph traversals that don't run the search-ranking path.
   */
  confidence?: 'high' | 'low';
```

**具体数值**: `'high'` 阈值 = **≥2** 个不同查询词佐证同一入口点；否则 `'low'`。

**有序步骤**: 1) types 加字段；2) 排序路径计算佐证词数并赋值；3) agentDiet 在 `low` 时拼 handoff 行。

**测试**: 单测 — 单常见词查询（如 `data`）断言 `confidence==='low'` 且输出含 handoff；双词佐证断言 `'high'`。

**证据回指**: codegraph (upstream reference) types.ts:342（已验证 :335 起）；compendium §12.2 false-confidence（让 Cody 退出 embeddings 的正是这个假阳）。

---

### M3 — 边的来源标记（解析 vs 推断）  (serves both surfaces)

**决策**: 每条图边带 `provenance?: 'tree-sitter' | 'scip' | 'heuristic'`。启发式/推断边对 agent 与人类均**可见区分**于解析精确边。

**要动的文件**: `src/codemap/types.ts`（Edge 接口，与 C 的 edges 表 `provenance` 列同源）。

**可抄代码**（源: `/tmp/tk-research/codegraph/src/types.ts:203`，逐字）:
```ts
  /** How this edge was created */
  provenance?: 'tree-sitter' | 'scip' | 'heuristic';
```

**具体数值**: 边来源仅 `'tree-sitter'` 与 `'heuristic'` 两值实际写入（SCIP 是 M18 补充层，emit/consume only）。检索排序与 J 的信任契约只信 `'tree-sitter'`，`'heuristic'` 边在人类/agent 视图中加 `~` 前缀标注。

**有序步骤**: 1) Edge 加字段并落到 C 的 edges 表列；2) 抽取器（D）填值；3) 渲染层对 heuristic 边加可见标注。

**测试**: 单测 — 已知动态 require 推断边断言 `provenance==='heuristic'` 且渲染带标注；直接 import 断言 `'tree-sitter'`。

**证据回指**: codegraph (upstream reference) types.ts:204（已验证 :203 起）；compendium §12.4 跨语言/框架间接盲点。

---

### M4 — per-file 陈旧横幅 + 增量键 (path, mtime, size)  (serves both surfaces)

**决策**: 索引按 `(path, mtimeMs, size)` 记 contentHash；任何 index 之后被改的文件挂横幅，指示 agent **去 Read 实时文件**。tk 已有这把 mtime 缓存（inspect scan cache），**直接复用**。

**要动的文件**: 复用 `src/inspect/extractCache.ts` 的 CacheKey 机制；新建 `src/codemap/freshness/staleBanner.ts`（与 E 的 lazy mtime-sweep、J8/J9 横幅同源）。

**可抄代码**（源: `/tmp/tk-research/`tk repo `src/inspect/extractCache.ts:12,39`，逐字 — tk 自有）:
```ts
//  • Keyed strictly on (path, mtimeMs, size, SCHEMA_VERSION). Any mismatch is a miss.
export type CacheKey = { mtimeMs: number; size: number };
```
```ts
// src/codemap/freshness/staleBanner.ts （新写，复用上面的键语义）
export function staleBannerFor(
  file: string,
  indexed: { mtimeMs: number; size: number; contentHash: string },
  live: { mtimeMs: number; size: number },
): string | undefined {
  if (live.mtimeMs === indexed.mtimeMs && live.size === indexed.size) return undefined;
  return `⚠ ${file} edited since index — Read the live file (indexed mtime ${indexed.mtimeMs}).`;
}
```

**具体数值**: 命中判定 = `mtimeMs` 与 `size` 全等才算新鲜；任一不等即挂横幅。复用缓存 30 天 prune 窗口（extractCache 既有）。

**有序步骤**: 1) codemap 索引写入时复用 CacheKey 语义存 `(mtimeMs,size,contentHash)`；2) lazy 读路径（E）调 `staleBannerFor`；3) J8 per-file / J9 frozen-index 横幅消费它。

**测试**: 单测 — touch 文件改 mtime 后断言返回横幅；未改返回 `undefined`。

**证据回指**: compendium §9 incremental 行 + §12.3 stale-index；tk MEMORY `inspect-scan-cache-shipped`（mtime 键已落地）。

---

### M5 — AST 级变更分类（丢 comment/docstring-only）  (serves both surfaces)

**决策**: 增量重建用 **AST ChangeType**，不是 text-diff。`COMMENT_ONLY` 与 `DOCSTRING_CHANGED` 从受影响集合**剔除**（零重算/零 host-LLM 调用）；只有 signature/body/new/removed 向下游传播（喂 E 的 BFS-downstream）。

**要动的文件**: 新建 `src/codemap/incremental/changeType.ts`。

**可抄代码**（源: `/tmp/tk-research/repodoc/repodoc/src/analysis/diff_analysis.py:67,93`，已改写为 TS — RepoDoc 无 license 文件，**按读到的模式重写，不直接拷贝**）:
```ts
// src/codemap/incremental/changeType.ts （已改写：RepoDoc 无 license，重实现）
export enum ChangeType {
  API_SIGNATURE_CHANGED = 'api_signature_changed',
  NEW_COMPONENT = 'new_component',
  REMOVED_COMPONENT = 'removed_component',
  DOCSTRING_CHANGED = 'docstring_changed',
  CODE_BODY_CHANGED = 'code_body_changed',
  COMMENT_ONLY = 'comment_only',
  NO_CHANGE = 'no_change',
}

const COSMETIC = new Set([ChangeType.COMMENT_ONLY, ChangeType.DOCSTRING_CHANGED]);

/** affected set excludes cosmetic-only changes → zero regen / zero host-LLM call */
export function affectedComponents(
  changes: ReadonlyArray<{ name: string; changeType: ChangeType }>,
): string[] {
  return changes.filter((c) => !COSMETIC.has(c.changeType)).map((c) => c.name);
}
```
> 对照原文（源: diff_analysis.py:93）：`return [c.name for c in self.changes if c.change_type != ChangeType.COMMENT_ONLY]`。RepoDoc 原版只剔 `COMMENT_ONLY`；tk 版**额外剔 `DOCSTRING_CHANGED`**，因为本项目叙事由 host/subscription LLM 生成、docstring 改动不动结构图（M14 口径）。

**具体数值**: 剔除集合 = `{COMMENT_ONLY, DOCSTRING_CHANGED}` → 这两类触发 **0** 次下游重算。

**有序步骤**: 1) 落 enum + `affectedComponents`；2) D 的抽取器对比新旧 AST 产出 ChangeType；3) E 用 affected 集合做 BFS-downstream。

**测试**: 单测 — 仅改注释的 fixture 断言 `affectedComponents()===[]`；改函数签名断言包含该组件。

**证据回指**: RepoDoc diff_analysis.py:67-98（已验证 ChangeType 枚举 + get_affected_components 逐字存在）；landscape verdict matrix「soundest incremental」。

---

### M6 — 引用者 set-diff 精确失效（who_reference_me）  (serves both surfaces)

**决策**: 每节点带 `who_reference_me`（caller id 列表）。重建时按 path 对齐节点，再从 (a) `code_content` 不等 **或** (b) `who_reference_me` 集差 标脏 — 干净地分开「我代码变了」与「我的调用者变了」。`new ⊆ old`（caller 被删）vs 非子集（caller 新增）是廉价精确信号。

**要动的文件**: `src/codemap/types.ts`（节点加 `whoReferenceMe: string[]`）；`src/codemap/incremental/invalidate.ts`（新建）。

**可抄代码**（源: `/tmp/tk-research/repoagent/repo_agent/doc_meta_info.py:128`，逐字字段名取自此处，逻辑改写为 TS）:
```python
    reference_who: List[DocItem] = field(default_factory=list)  # 他引用了谁
    who_reference_me: List[DocItem] = field(default_factory=list)  # 谁引用了他
```
```ts
// src/codemap/incremental/invalidate.ts （已改写：套用 RepoAgent who_reference_me 语义）
export function dirtyReason(
  old: { codeContent: string; whoReferenceMe: Set<string> },
  fresh: { codeContent: string; whoReferenceMe: Set<string> },
): 'code_changed' | 'callers_changed' | null {
  if (old.codeContent !== fresh.codeContent) return 'code_changed';
  const sameCallers =
    old.whoReferenceMe.size === fresh.whoReferenceMe.size &&
    [...fresh.whoReferenceMe].every((c) => old.whoReferenceMe.has(c));
  if (!sameCallers) return 'callers_changed'; // caller added/removed
  return null;
}
```

**具体数值**: 集差判定 O(n) 单次扫描；无需重算全部下游（对比 path-prefix 的 M20 黑名单：只重算真实 caller 集变化的节点）。

**有序步骤**: 1) 节点存 `whoReferenceMe`（由 C 的 edges 反向聚合）；2) 落 `dirtyReason`；3) E 仅对 `dirtyReason!==null` 的节点重建。

**测试**: 单测 — 改 body 断言 `'code_changed'`；新增一个 caller 断言 `'callers_changed'`；caller 与 body 都不变断言 `null`。

**证据回指**: RepoAgent doc_meta_info.py:128-129（已验证逐字）；landscape「best invalidation」。

---

### M7 — 有界广搜上限 + 自适应预算  (serves both surfaces)

**决策**: 广搜硬上限作默认：matches/file、files/set、chars/snippet，外加按仓库规模分级的输出预算。搜索是**有界选择阶段**，回分组候选 + 指针，绝不裸 dump 行/文件。复用 tk 既有 `tree --filelimit` / `rg` cap 纪律。

**要动的文件**: `src/codemap/search/caps.ts`（新建，复用 `src/handlers/common/level.ts` 的 CompressionLevel dial）。

**可抄代码**（tk-adapted，新写；数值与 M8/F 对齐）:
```ts
// src/codemap/search/caps.ts
export const SEARCH_CAPS = {
  maxMatchesPerFile: 5,
  maxFilesPerSet: 20,
  maxCharsPerSnippet: 400,
} as const;

/** adaptive output budget tiered by repo node-count (chars, matches G1 tiers) */
export function outputBudgetChars(nodeCount: number): 13000 | 18000 | 24000 {
  if (nodeCount < 2000) return 13000;   // small repo — don't bloat
  if (nodeCount < 20000) return 18000;
  return 24000;                          // large repo — still bounded
}
```

**具体数值**: matches/file = **5**；files/set = **20**；chars/snippet = **400**；输出预算 **13000 / 18000 / 24000** chars（与 G1、F8 `maxOutputChars` **逐字一致**，G 拥有这些常量，F/M 仅引用）。

**有序步骤**: 1) 落 caps 常量；2) 搜索阶段强制截断并标注「+N more」；3) 输出层按 `outputBudgetChars` 选 tier。

**测试**: A-B harness 字段 — `search_result_usefulness` + 断言任意单查询输出 chars ≤ 对应 tier。

**证据回指**: compendium §10 bounded-search + adaptive-budget（Probe `--max-tokens`、codesearch、codegraph (upstream reference)）。冲突解决：char tier 是可移植代理，token 化待 K 在主目标测得真实 Copilot inline cap 后再表达。

---

### M8 — metadata-first / 按需取  (serves the codemap agent surface)

**决策**: 搜索默认回紧凑指针（path + 行范围 + 签名），全量代码**仅在显式 expand 调用**时取。对标 FastContext（只回 path + 行范围，从不回探索 trace）。

**要动的文件**: `src/codemap/mcp/tools.ts`（`tk_search` 默认 metadata-only；`tk_node`/expand 才回 body）。

**可抄代码**（tk-adapted，新写）:
```ts
// search result default shape — pointers only, no body
export interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  signature: string;        // collapsed (M9), never the body
  // body is NOT here — fetched via tk_node(id) expand call
}
```

**具体数值**: 默认 payload 每命中**仅** path + 2 行号 + 1 签名（~1 行）；body 取用单独一次 expand 调用，受 M7 caps 约束。

**有序步骤**: 1) `tk_search` 回 `SearchHit[]`；2) `tk_node` 接 id 回 body；3) server-instructions 说明 ladder（M12）。

**测试**: A-B harness — `duplicate_reads` 键 `(normalized_path, selector_type, selector_value, file_hash)`；断言搜索 arm 不含 body 字节。FastContext 量级 ~76% 读 token（SWE-Pruner）。

**证据回指**: compendium §10 metadata-first + on-demand；FastContext（research §8.2，SWE-QA 最高 60.3% token 削减）。

---

### M9 — 签名折叠投影（~70%，M1 门控）  (serves both surfaces)

**决策**: 容器 → 大纲、丢 body，作为 `understanding` 类代码读默认，复用 tk 既有 `read --level aggressive`。~70% token 削减且保结构。**永不**用于 `editing` 类（见 M1）。

**要动的文件**: 复用 `src/handlers/common/level.ts`（已验证 `aggressive` 层存在）；`src/codemap/render/agentDiet.ts` 调用前先过 M1 守卫。

**可抄代码**（源: tk repo `src/handlers/common/level.ts:11-21`，逐字 — tk 自有）:
```ts
//   aggressive  layer 3 max (counts/sample only)
export type CompressionLevel = "none" | "minimal" | "balanced" | "aggressive";
```

**具体数值**: `understanding` 默认 level = `aggressive`（目标 ~**70%** 削减）；`editing` 强制 `none`（M1 守卫拦截任何升级）。

**有序步骤**: 1) agentDiet 默认 `aggressive`；2) 调用前 `assertLossyAllowed`；3) editing 路径硬绑 `none`。

**测试**: 单测 — 同一容器，`understanding` 输出无 body 且 char 数 ≤ 原 ~30%；`editing` 输出逐字等于源。

**证据回指**: compendium §10 signature-collapse（Repomix/codegraph (upstream reference)/Continue ~70%）；tk `read --level aggressive` 已有。

---

### M10 — goal-hint + 迭代再查询  (serves the codemap agent surface)

**决策**: 每个 search/context 工具接可选 `task`/`goal` 查询参数，agent 陈述信息需求以提精度；配合迭代再查询（拿生成结果做下一次查询，因图再查询廉价）。

**要动的文件**: `src/codemap/mcp/tools.ts`（工具 schema 加 `goal?: string`）。

**可抄代码**（MCP 工具 schema 片段，新写）:
```json
{
  "name": "tk_search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "goal":  { "type": "string", "description": "optional: state your information need to raise retrieval precision" }
    },
    "required": ["query"]
  }
}
```

**具体数值**: `goal` 可选、不传则退化为纯 query；图再查询单次 < **1ms**（FTS/graph，非 LLM）。

**有序步骤**: 1) schema 加 `goal`；2) 排序时用 goal 词加权；3) 文档示范迭代再查询。

**测试**: A-B harness — 同任务带/不带 goal，对比 `search_result_usefulness` 与 token；目标量级 SWE-Pruner 39% token / 26.8% cost，<1% quality loss。

**证据回指**: research §8.1-8.2（SWE-Pruner goal-hints；RepoCoder iterative >10%）。

---

### M11 — log→code 投影  (serves the codemap agent surface)

**决策**: 解析 compiler/test 输出到引用的 file:line 范围并回这些，不回裸 log。这是 tk 高价值 noisy-output 桶（Probe failure-first）。

**要动的文件**: `src/codemap/projection/logToCode.ts`（新建，复用 tk surface-10 命令输出角色）。

**可抄代码**（tk-adapted，新写；需实现时补具体 PowerShell/tsc 解析正则）:
```ts
// src/codemap/projection/logToCode.ts
const REF = /(?<path>[\w./\\-]+\.\w+):(?<line>\d+)(?::(?<col>\d+))?/g;

export function logToCodeRefs(rawLog: string): Array<{ path: string; line: number; col?: number }> {
  const out: Array<{ path: string; line: number; col?: number }> = [];
  for (const m of rawLog.matchAll(REF)) {
    out.push({ path: m.groups!.path, line: Number(m.groups!.line),
               col: m.groups!.col ? Number(m.groups!.col) : undefined });
  }
  return out;
}
// 需实现时补：Windows PowerShell 输出 drift（CRLF / GBK）下的 file:line 提取健壮性，
// 参见 tk MEMORY cozyultra GBK encoding。
```

**具体数值**: 失败优先 — 先回失败行 file:line，成功噪声丢弃；snippet 受 M7 的 400 chars 约束。

**有序步骤**: 1) 落 `logToCodeRefs`；2) 接 tsc/vitest 输出；3) Windows 编码健壮性补丁。

**测试**: 单测 — 已知 tsc 错误日志 fixture 断言提取出正确 file:line 集；纯成功日志断言空集。

**证据回指**: compendium §10 log→code（Probe）。注意 Windows PS 输出 drift 风险（tradeoff matrix 已标）。

---

### M12 — cheap-outline-first MCP ladder（≤4 工具，hand-rolled stdio）  (serves both surfaces)

**决策**: `read_structure`（廉价大纲）→ `read_contents`（需要时才全量）→ ask/expand。经 MCP 交付，**≤4 工具** + 一段 server-instructions；手写 JSON-RPC stdio，**无 SDK 依赖**（合 tk no-native-dep 不变量）。

**要动的文件**: `src/codemap/mcp/server.ts`（手写 stdio JSON-RPC）；`src/codemap/mcp/tools.ts`。

**可抄代码**（tk-adapted，新写；4 工具清单与 F 对齐）:
```ts
// ≤4 tools, mirrors F's tk_explore/tk_search/tk_node/tk_callers
export const TOOLS = ['tk_explore', 'tk_search', 'tk_node', 'tk_callers'] as const;

export const SERVER_INSTRUCTIONS =
  `Outline-first ladder: call tk_explore/tk_search for compact pointers; ` +
  `only call tk_node to expand a specific node's body; tk_callers for who-calls-me. ` +
  `Results marked confidence:'low' are incomplete — explore/trace, do not treat as final.`;
```

**具体数值**: 工具数 = **4**（硬上限，"fewer tools steer better"）；传输 = stdio（无 daemon，合 F3/M18）；零 npm MCP SDK 依赖。

**有序步骤**: 1) 手写 stdio JSON-RPC framing；2) 注册 4 工具 + server-instructions；3) `TK_MCP_TOOLS` env 可空（K 的 WITHOUT arm，F10）。

**测试**: 单测 — 启动 server，列工具断言恰 4 个且含 server-instructions；空 `TK_MCP_TOOLS` 断言工具表为空（K baseline）。

**证据回指**: landscape（DeepWiki 3-tool ladder 是其成为默认的分发杠杆）；codegraph (upstream reference) hand-rolled stdio。

---

### M13 — 声明式 repo-checked 控制文件 + 硬上限  (serves the codeguide human surface)

**决策**: 人类面页面控制用声明式仓库内控制文件（DeepWiki `.devin/wiki.json` 风格），页面权威（「不多不少」），硬上限：30/80 页、100 notes、10k chars/note，让 host-LLM 成本**可预测有界**。

**要动的文件**: `.tk/wiki.json`（仓库内、人类共享工件，I 的 round-trip 源）；`src/codemap/wiki/control.ts`（解析 + cap 校验）。冲突解决：DB 出树，**仅** wiki.json/wiki/pages 等人类工件进 `.tk/`。

**可抄代码**（tk-adapted，新写；caps 取自 DeepWiki，格式取 JSONC 因 tk 已解析 JSONC）:
```ts
// src/codemap/wiki/control.ts
export const WIKI_CAPS = {
  maxPagesSoft: 30,
  maxPagesHard: 80,
  maxNotes: 100,
  maxCharsPerNote: 10_000,
} as const;

export interface WikiControl {
  pages: Array<{ id: string; title: string; sources: string[] }>; // authoritative: no more, no less
  notes?: Array<{ id: string; text: string }>;
}

export function validateCaps(c: WikiControl): string[] {
  const errs: string[] = [];
  if (c.pages.length > WIKI_CAPS.maxPagesHard) errs.push(`>${WIKI_CAPS.maxPagesHard} pages`);
  if ((c.notes?.length ?? 0) > WIKI_CAPS.maxNotes) errs.push(`>${WIKI_CAPS.maxNotes} notes`);
  for (const n of c.notes ?? []) if (n.text.length > WIKI_CAPS.maxCharsPerNote) errs.push(`note ${n.id} >10k chars`);
  return errs;
}
```

**具体数值**: 页 soft **30** / hard **80**；notes **100**；chars/note **10000**。（Open Decision：DeepWiki 是 SaaS 口径，用户需确认这些上限适配 project-local 规模。）

**有序步骤**: 1) 落 caps + `validateCaps`；2) 生成前校验、超限拒绝；3) I 的 round-trip 以此为权威页面集。

**测试**: 单测 — 81 页断言报错；80 页通过；10001-char note 报错。

**证据回指**: landscape（DeepWiki `.devin/wiki.json`）。控制文件格式 = JSONC（Open Decision，coherent pick）。

---

### M14 — 仅订阅/host LLM，零 API key/egress  (serves both surfaces)

**决策**: 凡需 LLM，**仅**走订阅模式（CodeWiki caw 经本地 claude/codex OAuth）或 host re-prompt（slash-command）；**永不**内置 API key、零 model egress。一切需 LLM 处一律框架为「喂 host agent 生成」或「让用户订阅付费」。这是 B 的生成层契约，也是固定 strong-lean。

**要动的文件**: `src/codemap/wiki/generate.ts`（只暴露 host slash-command 入口 `/tk understand` + 可选 caw CLI 调用，**无任何 apiKey 参数/env 读取**）。

**可抄代码**（tk-adapted，新写 — 守卫式，禁止任何 egress）:
```ts
// src/codemap/wiki/generate.ts
export type LlmTier = 'host-reprompt' | 'subscription-cli';

/** HARD GUARD: never read an API key, never open a network socket to a model endpoint. */
export function assertNoEgress(env: NodeJS.ProcessEnv): void {
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
    if (env[k]) {
      // we do not USE it — we refuse to, to prove zero tool-embedded egress
      throw new Error(`refusing to use ${k}: tk codegraph spends zero model tokens; ` +
        `narrative generation runs via host re-prompt or your subscription CLI only`);
    }
  }
}
```

**具体数值**: tool-embedded model 调用 = **0**；API token 花费 = **0**。生成只在 `host-reprompt` 或 `subscription-cli` 两 tier。

**有序步骤**: 1) 落 `assertNoEgress` 守卫；2) wiki 生成仅经 slash-command/caw；3) B 的 provenance 列把生成结果标 `llm`，检索 `WHERE provenance='static'` 过滤之。

**测试**: 单测 — 设 `ANTHROPIC_API_KEY` 后调生成入口断言抛错（证明拒用）；K 的 Job-B 测量 arm 断言无 LLM 调用。

**证据回指**: landscape（CodeWiki caw backend）+ 固定 strong-lean。

---

### M15 — 内建 per-operation token 测量（uncached-input 为主指标）  (serves both surfaces)

**决策**: 每操作记日志（RepoDoc log_operation → metadata.json），给 full-gen vs incremental 现成 A/B 分母。主指标 = **uncached_input_tokens**，不是 total（cache-read >97% 测的是 replay 不是浪费）。遥测集: `raw_bytes, estimated_raw/filtered_tokens, uncached_input_tokens, tool_calls, duplicate_reads(键 normalized_path+selector_type+selector_value+file_hash), search_result_usefulness, success_rate, omission_bug_rate, fallback_rate`。

**要动的文件**: `src/codemap/telemetry/logOperation.ts`（复用 tk 既有 measured-not-estimate ledger，never-sum 物理排除规则）。

**可抄代码**（tk-adapted，新写；遥测字段集逐字落实）:
```ts
// src/codemap/telemetry/logOperation.ts
export interface OpRecord {
  op: string;
  raw_bytes: number;
  estimated_raw_tokens: number;
  estimated_filtered_tokens: number;
  uncached_input_tokens: number;        // PRIMARY metric
  tool_calls: number;
  duplicate_reads: number;              // keyed (normalized_path, selector_type, selector_value, file_hash)
  search_result_usefulness: number;
  success_rate: number;
  omission_bug_rate: number;            // from M16 fallback-replay
  fallback_rate: number;
}
```

**具体数值**: 主指标 = `uncached_input_tokens`；cache-read 占比 >**97%** 时 total-token 口径判定为「测 replay」无效。duplicate_reads 去重键四元组固定。

**有序步骤**: 1) 落 OpRecord + append-only ledger；2) MCP 工具每调用记一条；3) K 用其作 A/B 分母（never-sum 入 saved_tokens）。

**测试**: 单测 — 两次相同 selector 读断言 `duplicate_reads===1`；断言 ledger 永不把 Track-2 opportunity 加入 saved_tokens。

**证据回指**: compendium §11 telemetry set + §12.10「优化错的数字」；tk measured-ledger。

---

### M16 — fallback-replay 遗漏 bug 谐振器  (serves both surfaces)

**决策**: 投影开启跑任务；若失败或重试才成功，从同一 checkpoint 重跑、仅把投影证据升级为 raw/exact；若 失败→成功，记一个 context-omission bug。报中位数 + 离散度（run-to-run 方差高）。这是证明压缩**安全**（不只是小）的验收门。

**要动的文件**: `scripts/codegraph-fallback-replay.ts`（A/B 谐振器，K 的 SUT 入口）。

**可抄代码**（tk-adapted，新写；K 的 Job-B arm）:
```ts
// scripts/codegraph-fallback-replay.ts
export async function fallbackReplay(task: Task, runs = 5): Promise<{ omissionBugs: number; medianTokens: number }> {
  let omissionBugs = 0; const tokens: number[] = [];
  for (let i = 0; i < runs; i++) {
    const projected = await runWithProjection(task);     // M8/M9 on
    if (!projected.ok) {
      const exact = await runFromCheckpoint(task, { evidence: 'raw-exact' }); // escalate same evidence
      if (exact.ok) omissionBugs++;                      // failure→success = omission bug
    }
    tokens.push(projected.uncachedInputTokens);
  }
  tokens.sort((a, b) => a - b);
  return { omissionBugs, medianTokens: tokens[Math.floor(tokens.length / 2)] };
}
```

**具体数值**: runs 默认 **5**；报中位数 + spread；omission-bug 计数 = failure→success 翻转次数（验收门：codemap 检索压缩 omission_bug_rate 必须 0 才算安全）。

**有序步骤**: 1) 落谐振器；2) 接 K 的任务 oracle；3) CI 跑并断言 omission_bug_rate。

**测试**: A-B harness — 故意丢一处关键证据的 fixture 断言 omission_bug ≥1；完整投影断言 0。

**证据回指**: compendium §11（最干净文档化方法）+ SWE-ContextBench（坏上下文伤成功率）。

---

### M17 — repo-local 政策文件 + 答案充分性  (serves the codemap agent surface)

**决策**: 仓库内 agent 政策/标记文件（tk 已写）steer agent，但**因纯指令 steering 弱**，必须配 tool-contract + answer-sufficiency（工具须回够多，让 agent 不退回裸 grep）。不靠政策文件单打。

**要动的文件**: 复用 tk 既有 marker 写入；`src/codemap/mcp/tools.ts`（保证每工具 result 自足，含 file:line + 签名 + handoff）。

**可抄代码**（tk-adapted，新写 — 充分性断言）:
```ts
// answer-sufficiency: a search hit MUST carry enough to avoid a raw-grep fallback
export function isSufficient(hit: SearchHit): boolean {
  return Boolean(hit.path && hit.startLine && hit.signature); // pointer + anchor + shape
}
```

**具体数值**: 每命中至少含 path + startLine + signature 三要素方算充分；不足则降级为 M2 的 `confidence:'low'` handoff。

**有序步骤**: 1) marker 文件写 codemap 用法指引；2) 工具 result 过 `isSufficient`；3) 不足触发 handoff 而非静默。

**测试**: 单测 — 缺 signature 的 hit 断言 `isSufficient===false` 且触发 handoff。

**证据回指**: compendium §10 policy-file + §12.7（codegraph (upstream reference) 维护者：instruction-only 弱 vs tool-contract+sufficiency）。

---

### M18 — 过度工程线（dependency-gated / REFUSE）  (serves both surfaces)

**决策**:
- **REFUSE 作默认**: embeddings/vector-ANN、RL-trained explorer（需 model/key/egress/训练，与不变量冲突）。
- **CONDITIONAL 分支**: daemon + native file watcher（重：lockfile/socket/Windows named pipe，见 tk EBUSY/Windows 史）— 仅当 op-count 证明 cold-start 不可接受才进条件分支。
- **COMPLEMENT 非 core**: LSP/SCIP（SCIP-as-interchange = emit/consume only）。
- **OPTIONAL**: PageRank（排序升级，Outside current product scope）。

**要动的文件**: 文档锚 `docs/codemap/codegraph-impl-mining-goal.md`（记录这条线）；代码层无新增（即「Unsupported」）。

**具体数值**: Required = single-process-per-session stdio，daemon = **0**（冲突解决 E/F/J/M：lazy-on-read 默认）。daemon 翻转阈值 = K 的 op-count/cold-start 测量（**Open Decision，用户设延迟预算或确认 daemon 永不**）。

**有序步骤**: 1) 文档钉死 REFUSE/CONDITIONAL/COMPLEMENT/OPTIONAL 四档；2) 不实现任何一项；3) daemon 分支留 K 测量后再议。

**测试**: 治理断言 — 代码库 grep 确认无 embeddings/vector dep、无 daemon socket、无 PageRank 入默认路径。

**证据回指**: compendium §9-10 compatibility 列（🔴 embeddings/RL，🟡 daemon/LSP）+ tk Windows EBUSY/cold-start/AV memories。**Overrule**: 推翻旧 ADR-0013/0016 把 daemon+watcher 当 core 的框架 — 这里基于 tk 自身 Windows 史正面降级为 CONDITIONAL 条件分支。

---

### M19 — 黑名单: eval()/动态执行 LLM 输出  (serves both surfaces)

**决策**: **禁** `eval()`/`exec()`（或任何动态执行）于 LLM 输出。LLM 响应用严格 schemaed parser（`JSON.parse` + try/catch + 形状校验）解析，**永不执行**。脆弱 tag-splitting（`response.split('<TAG>')[1]`）作**唯一** parser 也禁 — 抽取后必须有 typed schema 校验步。

**反例代码**（源: `/tmp/tk-research/codewiki/codewiki/src/be/cluster_modules.py:124`，逐字 — **这是 NOT to do**）:
```python
        response_content = response.split("<GROUPED_COMPONENTS>")[1].split("</GROUPED_COMPONENTS>")[0]
        module_tree = eval(response_content)        # ← RCE: 任意 LLM/投毒响应即执行
        if not isinstance(module_tree, dict):       # ← 校验在 eval 之后，已晚
            logger.error(...)
```

**正解代码**（tk-adapted，新写）:
```ts
// safe replacement: parse, never execute; schema-validate AFTER extraction
export function parseModuleTree(response: string): Record<string, unknown> {
  const m = /<GROUPED_COMPONENTS>([\s\S]*?)<\/GROUPED_COMPONENTS>/.exec(response);
  if (!m) throw new Error('missing GROUPED_COMPONENTS block');
  let parsed: unknown;
  try { parsed = JSON.parse(m[1]); } catch { throw new Error('GROUPED_COMPONENTS not valid JSON'); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('expected object'); // typed shape validation BEFORE use
  return parsed as Record<string, unknown>;
}
```

**具体数值**: LLM 输出 `eval`/`exec` 调用数 = **0**；解析后必有 ≥1 步 shape 校验。

**有序步骤**: 1) 全库 grep 禁 `eval(`/`new Function(` 于解析路径；2) 用 `parseModuleTree` 式 JSON.parse + 校验；3) lint 规则固化。

**测试**: 单测 — 投毒响应（含 JS 代码）断言不执行、抛解析错；合法 JSON 块断言返回对象。

**证据回指**: codewiki cluster_modules.py:124（已验证逐字 `eval(response_content)`）。

---

### M20 — 黑名单: path-substring/祖先-only 增量失效  (serves both surfaces)

**决策**: **禁** `path.startswith(prefix)` 或 module-tree 祖先成员资格单独做失效 — 它忽略真实 call-graph 依赖者。用 M5（AST ChangeType）+ M6（who_reference_me set-diff）替代。

**反例代码**（源: `/tmp/tk-research/codewiki/codewiki/cli/commands/generate.py:124`，逐字 — **NOT to do**）:
```python
            prefix = subpath_prefix + "/"
            for path in changed:
                if path.startswith(prefix):          # ← 粗糙：漏掉跨模块真实 caller
                    filtered.append(path[len(prefix):])
```

**正解**: 用 M6 的 `dirtyReason`（who_reference_me set-diff），见上。

**具体数值**: 失效判定**禁**用任何纯 path-prefix；必须经 call-graph 依赖者集（M6）。

**有序步骤**: 1) lint/review 禁 path-prefix 作失效唯一依据；2) 走 M5+M6。

**测试**: 单测 — 跨模块 caller（路径不共享前缀）改动断言被正确标脏（path-prefix 法会漏，set-diff 法命中）。

**证据回指**: codewiki generate.py:124（已验证逐字 `path.startswith(prefix)`）；landscape「Avoid CodeWiki's incremental」。

---

### M21 — 黑名单: LLM 幻觉图/结构  (serves the codeguide human surface)

**决策**: **禁** LLM 自由生成的 mermaid/graph/diagram。每张给人类渲染的图必须**从解析图派生**，LLM 只可 label/narrate 解析器产出的节点，**绝不发明边**。

**要动的文件**: `src/codemap/wiki/diagram.ts`（图只接受 parsed nodes/edges 输入，拒绝 free-text）。

**可抄代码**（tk-adapted，新写 — 结构来自图，非 LLM）:
```ts
// mermaid is DERIVED from the parsed graph; LLM may only supply labels
export function mermaidFromGraph(
  nodes: Array<{ id: string; label: string }>,
  edges: Array<{ from: string; to: string; provenance: string }>, // from C's edges table
): string {
  const lines = ['graph TD'];
  for (const e of edges) lines.push(`  ${e.from} --> ${e.to}`); // edges are parser-ground-truth only
  return lines.join('\n');
}
```

**具体数值**: 渲染图中 LLM-发明边 = **0**；所有边来自 C 的 edges 表（`provenance` 已知）。

**有序步骤**: 1) 图渲染只接 graph 输入；2) LLM 仅供节点文案；3) review 禁 LLM 直出 mermaid。

**测试**: 单测 — 给定 nodes/edges 断言 mermaid 边集 === 输入边集；无额外边。

**证据回指**: landscape（deepwiki-open mermaid 幻觉、~2280-LOC 巨组件 inline 生成+prompt，「clearest what-not-to-copy」）。

---

### M22 — 黑名单: 无图整仓裸 dump  (serves both surfaces)

**决策**: **禁** 无图整仓裸 dump（Davia 1000-file / 130k-token，重读一切、无增量）。base 必须是真解析图 + 有界检索（M7/M8）；裸 dump 文件正是 token 目标的反面。

**要动的文件**: 无新增 — 即「base 永远是图，不提供 whole-repo dump 工具」。

**具体数值**: 单次检索默认输出 ≤ M7 tier 上限（13000/18000/24000 chars），**永不** 130k 量级裸 dump。

**有序步骤**: 1) 不暴露 whole-repo dump MCP 工具；2) 所有读经 M8 metadata-first + M7 caps。

**测试**: 治理断言 — 无任何工具输出超 24000 chars 上限（除显式多次 expand）。

**证据回指**: landscape（Davia 130k 裸 dump，无图无增量）。

---

### M23 — 黑名单: 种子默认 admin + 明文凭据 + LIKE '%q%' 搜索  (serves both surfaces)

**决策**: **禁** 源码/配置明文凭据；**禁** init 时种子默认 admin 用户/密码；搜索必须用 **FTS5/BM25**，不用 SQL substring `LIKE`。

**反例代码**（源: `/tmp/tk-research/opendeepwiki/src/OpenDeepWiki/Infrastructure/DbInitializer.cs:126`，逐字 — **NOT to do**）:
```csharp
    private static async Task InitializeAdminUserAsync(IContext context)
    {
        const string adminEmail = "admin@routin.ai";    // ← 出厂默认管理员
        const string adminPassword = "Admin@123";       // ← 明文出厂口令
```

**正解**: 无种子账户；搜索走 C 的 `nodes_fts`（FTS5 + BM25），见 C 的 DDL。仅当 npm-shim-on-user-Node 路径检测到 SQLite 无 FTS5 时，C7 守卫降级为 LIKE-scan（且仅那条退路）。

**具体数值**: 种子账户数 = **0**；明文凭据数 = **0**；搜索主路径 = FTS5/BM25，`LIKE '%q%'` 仅作无-FTS5 退路（冲突解决：vendored-Node bundle 的 SQLite 已知带 FTS5，故主路径不触发退路）。

**有序步骤**: 1) init 不建任何账户；2) 搜索绑 FTS5；3) FTS5 缺失探测 → LIKE 退路 + 警示。

**测试**: 治理断言 — grep 无明文 password 常量；搜索单测断言走 FTS5 path（除 no-FTS5 fixture）。

**证据回指**: opendeepwiki DbInitializer.cs:126-127（已验证逐字 `admin@routin.ai` / `Admin@123`）；landscape（SearchDoc LIKE）。

---

### M24 — 黑名单: 每查询 12k-token LLM 摘要作搜索路径  (serves the codemap agent surface)

**决策**: **禁** 把每查询的 LLM 摘要（OpenDeepWiki 12k-token/query）当搜索路径。搜索必须廉价（FTS/graph，亚毫秒），不是每查询一次 LLM 往返 — 那反转 token 目标且加延迟。

**要动的文件**: `src/codemap/search/`（搜索零 LLM 调用，确定性）。

**具体数值**: 每搜索 LLM 调用 = **0**；搜索延迟目标 < **1ms**（FTS/graph）；对比反例 12000 tokens/query。

**有序步骤**: 1) 搜索路径纯 static（B1 provenance 过滤）；2) review 禁搜索内调 LLM。

**测试**: A-B harness — Job-B 测量 arm 断言搜索 0 LLM 调用、确定性（K 在 secondary host 干净测量）。

**证据回指**: landscape（OpenDeepWiki SearchDoc = 12k-token LLM 摘要/query）。

---

### M25 — license 边界（用户 2026-06-22 重申：个人项目、永不发布 → license 完全不相关）  (serves both surfaces)

**决策（D24，2026-06-22 强化 2026-06-20 的放宽）**: 本工具为**个人自用、永不向外分发/发布**。版权法管的是再分发而非私下自用 → **license 拷贝边界完全消失**：任何源（含 **gitnexus** PolyForm-NC、**codewiki / repodoc** 无 license 文件）的代码都**可逐字直接抄用，无需重写、无需署名、无任何处理**。
- **`[非分发安全]` 标记 = 失效（vestigial）**: 全文散落的 `[非分发安全]` 注记是 2026-06-20 "分发前重写" 假设的遗留书签；既已确定**永不发布**，这些标记**无约束力、可忽略**，不必逐一清除（清除是无谓 churn）。可抄性表（✅/🟡/❌）一律视作 ✅。
- license 不再作为任何设计决策的否决理由：凡历史上"因 license 不可复制"而被否的选项（如 **D15** gitnexus Leiden 社区检测的 PolyForm-NC 顾虑），其 license 理由消失——但**其它理由（native Kuzu 绑定/Windows native-build、能力本就 Optional 等）若仍成立则决策不翻**，需逐项看 license 是否曾是*决定性*因素。

**许可实况（2026-06-20 实地核对 LICENSE 文件）**: codegraph (upstream reference) = **MIT**；understand-anything / davia / deepwiki-open / opendeepwiki = MIT；repoagent / repograph = **Apache-2.0**；gitnexus (upstream reference) = **PolyForm Noncommercial**；codewiki / repodoc = **无 LICENSE 文件（默认全保留）**。

**具体数值**: 自用前提下拷贝行数无上限；`[非分发安全]` 标记覆盖 = gitnexus + codewiki + repodoc 的全部逐字片段。

**有序步骤**: 1) 抄自非 permissive 源的片段加 `[非分发安全]` 书签；2) 若项目状态从"自用"转为"分发"，按书签清单把这些片段重写为 clean-room 实现；3) 否则不阻塞实现。

**测试**: 书签断言 —— gitnexus/codewiki/repodoc 来源的 `源:` 注均带 `[非分发安全]`（仅在切换到分发模式时触发重写 gate；自用模式此 gate 关闭）。

**证据回指**: landscape license 列 + 本节实地核对（gitnexus (upstream reference) PolyForm-NC；codewiki/repodoc 无 license；codegraph (upstream reference) MIT）。

> **注**: 原 M25"硬边界 / GitNexus (upstream reference) 0 行"前提是 tk 要分发；用户确认自用后该前提解除（与 Q9 代码签名同理 —— 前提变，结论随之放宽）。本人非律师，依据为 license 基本常识：MIT/Apache=宽松可抄、PolyForm-NC=禁商用、无 license=默认全保留（约束的是再分发）。

---

### 跨需求一致性绑定（M 作为治理层）

- **M1 类边界**门控 M9 签名折叠（仅 understanding 有损）、K 的 M16 谐振器按类区分、F 工具透出 `contextClass`。
- **M2/M3** 的 `confidence`/`provenance` 字段是 J 信任契约的实现原语，且 `provenance='static'` 过滤（B1）让 M24/M14 的搜索零 LLM。
- **M4** 复用 tk `extractCache` 的 `(path,mtimeMs,size)` 键，喂 E 的 lazy-sweep 与 J8/J9 横幅（无 daemon，合 M18）。
- **M5+M6** 是 E 增量的唯一合法失效路径，直接否决 M20 的 path-prefix。
- **M7 char tier (13000/18000/24000)** 与 G1/F8 **逐字一致**，G 拥有常量、F/M 仅引用；token 化待 K 测量。
- **M14 零 egress 守卫** + **M15 uncached-input 主指标** + **M16 omission-bug 门**三者共同保证 K 能在 secondary host 确定性测 Job-B、在 small-N 协议测 Job-A。
- **M18** 把 daemon/embeddings/PageRank 钉在产品范围外，守住 Windows-primary 安全链。

### Open Decisions

1. **M18 daemon 阈值**: op-count 触发条件分支的具体冷启动延迟预算（或确认 daemon 永不）。
2. **M13 caps**: 30/80 页、100 notes、10k chars/note 沿用 DeepWiki SaaS 口径，需确认是否适配 project-local 规模或设 tk 专属上限。
3. **M18 SCIP**: emit/consume 是否纳入当前产品范围，还是严格作为 interop 互操作能力 — 取决于语言覆盖野心。


---

## 被推翻的旧决定

以下旧决策被本计划正面推翻，每条附理由：

**ADR 0013–0016 / 旧"graph-center synthesis, search/read lane only, navigation-only" 框架**
- 推翻"仅导航 / 人类编辑窗 Outside current product scope"（A/I）：锚点 2 使人类协作同等，GitNexus (upstream reference)/Understand-Anything/RepoDoc 证明图底座产出人类视图近乎零额外构建成本（同一 store 第二个 formatter），Outside current product scope 是无谓损失。可编辑往返（proposed↔pages + human-fence + 300ms 回写）Required 即交付。
- 推翻旧"协作＝只读 codeguide"框架（I）：只读只是默认档，可编辑沉淀（控制文件 + 人类 fence 往返）是一等档——人写不回的知识在会话间蒸发。

**PageRank / 排序**
- 推翻把 PageRank 放进底座的隐含倾向（A）：参考实现以"纯结构、无 PageRank、无 embeddings"达到 47%/58% benchmark，PageRank 承诺 Outside current product scope（可选排序杠杆）。

**打包（Repomix/aider）作为竞争底座**
- 推翻把 Family B 打包当 BASE 候选（A）：打包回答不了任何关系查询，降级为 Agent 食谱内的压缩函数（签名折叠），是步骤不是 store。

**Embeddings / 语义检索作为核心或召回升级**
- 推翻把 embeddings 留作"可考虑的召回升级"（A/B/J/C）：在无 key/无出网 + Windows 可移植 + 已记录的假自信失败三轴上全 🔴 且不可验证，整体 Unsupported（是拒绝的能力，非待办积压）；similar_to/related 边仅作 LLM 撰写的人类面提示，绝不进 Agent ranker；任何向量命中须重锚到真实 nodes(file_path,start_line) 行并分级才能呈现。

**存储底座**
- ADR-0014「node:sqlite + Node≥22.5 CONTINGENT on install-base」UPGRADE 为 Required（C/L）：node:sqlite 是唯一同时满足全部锚点的引擎（零原生编译对 Windows 主目标强制；gitnexus (upstream reference) 的 native lbugjs.node 证明替代在 Windows 破）；install-base 风险由 vendored Node 24 bundle 中和，contingency 消解。
- ADR-0015「node:sqlite vs graph-DB，WASM 可移植替代 open」RESOLVED favor node:sqlite（C）：gitnexus (upstream reference) WASM 路径仅浏览器；其 CLI/MCP 路径（我们的真实目标）需 native lbugjs.node 二进制，并不避免原生编译，且 PolyForm-NC 许可。Cypher graph-DB 作默认被拒。
- 推翻"typed/per-type 表更丰富"倾向（C）：选通用单 nodes(kind)/edges(kind)，使代码+文档+概念异构同进一个 FTS 索引、加 kind 是取值不是 DDL 迁移；per-type 表（Ladybug）Outside current product scope（仅作视图选项）。

**better-sqlite3 / 外部 graph-DB**
- 推翻旧"better-sqlite3 / 外部 graph-DB"倾向（A）：底座是单文件 node:sqlite + FTS5，非 KuzuDB/Neo4j/FalkorDB。

**Node 版本闸门不一致**
- 推翻裸"node:sqlite + Node≥22.5 contingent"（D/L）：与 WASM OOM 约束 reconcile 为单一 Required 闸门 `>=22.5.0 <25.0.0` + `--liftoff-only`；任一约束单独都给不出可运行底。L 的 L5/L7 Open Decisions 由 A+D 确认"WASM 已发布"而 CLOSED。
- 推翻 tk 现有 `engines:'>=20'` 地板（L）：升至 22.5 bootstrap 硬阻断；'>=20' 会让 node:sqlite 调用在运行时抛混乱错误。
- 推翻 cpus()-sized parser worker pool 假设（D）：承诺单一可回收 worker——N 个 isolate 倍增 WASM 堆压 + Windows AV spawn tax。

**LSP/SCIP 作核心**
- 推翻把 LSP/SCIP 当候选核心（A/D）：每语言运行时/indexer 安装正是 Windows friction 主锚点禁止的，降为可选 complement（Outside current product scope）。

**新鲜度模型 / daemon**
- 推翻"tk 成为 per-session MCP server"作为新鲜度模型（E/F）：新鲜度不由常驻 server/daemon 携带，索引持久落盘 + 惰性 on-read 刷新；per-session server 可前置查询但默认不拥有 watcher/daemon——Windows 安全（WSL2 /mnt + EBUSY/pipe/AV 史）正面压过常驻假设。
- 推翻 codegraph (upstream reference) daemon+native-watcher 作默认同步（E）：降为显式 Required capability，其运行时依赖在运行时 Optional；codegraph (upstream reference) 自身在主平台面（WSL2 Windows-drive 挂载）硬禁 watcher。
- 推翻 CodeWiki (upstream reference) 子串路径 + 模块树祖先失效（E/M20）：被点名"粗糙且不可靠"，改用 RepoDoc 下游 BFS + RepoAgent referencer set-diff。
- 推翻 DeepWiki 定时重生（小时-天延迟）（E）：对交互式会话内编辑目标不适用，改 opt-in git hook 提交级精确。
- 推翻把新鲜度当 Outside-scope/Agent-only（E）：人类新鲜度徽章与 Agent banner 同期交付。

**Agent 交付面**
- 推翻"MCP 是主目标交付路径"隐含假设（F）：企业 VS Code Copilot 上 MCP-in-Copilot 默认管理员禁用，VS Code 扩展（LM Tool API）必须主、MCP 次。
- 推翻"PATH shim 是 VS Code Copilot 上稳健默认交付"倾向（F）：shim 是较弱的赌注，只达 run_in_terminal（宿主已用 compressOutput 吃掉），PATH 企业可管；shim 仅保留作终端命令输出（surface 8），非 B 检索通道。
- 推翻 @modelcontextprotocol/sdk 作 MCP 底座（F）：改手写零依赖 transport（gitnexus (upstream reference) 需 stdout-compat shim 包 SDK，codegraph (upstream reference) 无 SDK 发布）。
- 推翻全能多工具面（gitnexus (upstream reference) 17 件）（F）：承诺 4 工具默认（小库 3），其余 TK_MCP_TOOLS 门控。

**输出经济**
- 推翻单一固定输出帽 / 一个全局 char 预算（G）：被 G1 仓库规模分级 + G2 内联帽不变量覆盖——平帽要么撑大小库要么外溢大库（已测 re-Read 回归）。
- 推翻"压缩率即成功"框架（G/K）：指标是 uncached_input_token 下降 + 任务成功，非省字节%；35K 外溢答案压缩好但输 uncached token。
- 推翻"bodies 总随 structure 发"假设（G/G8）：非 explore 工具 include_content/includeCode 默认 FALSE（locations-first），按需取体。

**人类面集成路径**
- 推翻 Simple Browser 作集成路径（H）。

**协作底座**
- 推翻自建 server/telemetry 式分享后端（I）：团队分享＝git-commit `.tk/` 产物，无 tk 自有 server/auth/权限层——违反无 server/无 egress 强倾向且重复 git 既有权限模型。
- DeepWiki 企业 80 页帽下调至 60（I team 档）：tk 针对单项目本地库非企业 wiki farm，60 控住订阅生成成本。

**信任 / provenance**
- 推翻把 provenance/置信当 Outside-scope "nice-to-have"（J）：file:line 锚 + provenance enum + 低置信交还是 Required 验收线，否则工具就是自信错答生成器。
- 正面拒 DeepWiki/opendeepwiki LLM-wiki-as-truth（J）：未字节绑定源码的 LLM wiki 就是 J 禁止的幻觉形态；wiki 若有则宿主生成且重锚。
- 推翻"best-effort 把结果当全面呈现"（J）：低置信默认诚实交还，召回绝不兑现为误导确定性。

**证明 / 度量**
- 推翻 codegraph (upstream reference) 头条 token 指标（K）：其 README 报"含缓存 total tokens、47% fewer"，SWE-ContextBench 显示 cache-read >97%，含缓存 delta ~97% 在量缓存重放；改 uncached_input_tokens delta 为主，total 仅次级审计列。
- 推翻"主目标上能证 token 节省"假设（K）：2026-06-20 host-token sweep 证 VS Code Copilot + Copilot CLI 暴露零 token；measured 臂必须跑次目标 Claude Code，主机宿主靠机会事实 + 迁移假设。
- 推翻 tk within-call ledger 的单轨"measure saved_tokens"框架（K）：该 diff 对图/MCP 查询无对应物，W2 loop-avoidance 只能作整轨 A/B delta 证明，两轨强制非可选。
- 降级"Job A 与 Job B 共享度量"假设（K）：Job A 无现成 token benchmark，单独小 N 任务协议，明标指示性，采 Serena 拒编造立场。

**分发**
- 推翻 ADR-0014 contingent（L）：install-base 风险由 vendoring Node 解决（非检查用户 Node），bundle 路径上 node:sqlite 无条件可用，contingency 溶解。
- 推翻单一分发通道倾向（L）：npm-only 在 cnpm/企业镜像静默破（issue #303），bundle-only 绕开 npm 肌肉记忆，双通道 + 自愈严格更安全。
- 降级"无 daemon"作分发关切（L）：本需求仅 install/runtime-launch，daemon vs per-command-spawn 是独立 perf 决策，不改打包配方。

## Open Decisions

> **Round 3 收口（2026-06-21，D13–D21 / ADR 0025–0033）**：所有 reference-groundable 设计 fork + 真 ops fork 已闭合（#4 daemon→D21、#7 交付→D19、#9 签名→D20，+ §17 #2 工具→D17、#3 schema→D18、#4 SCIP→D16，+ 附录 A3/A4 检索/语义全 gap）。**下列 #1/#2/#3/#5/#8 + 次级 B-provider 经参考+既有决策核验为 reference-consistent，round-3 ratified 锁定**（其答案见各项 ✅ 行）；仅 **#6 eval rigor** 与 **#5 的 char→token 重表达** 保留为 **measurement-gated**（K harness 实测后再定，非设计开放）。

以下是确需用户拍板的真实开放项（已闭合项不再列）：

1. **Node 版本闸门确认**：Node 25/--liftoff-only 已由 D+A 闭合（WASM 已发布 → 排除 25、强制 --liftoff-only）。请确认接受 `>=22.5.0 <25.0.0` + vendored Node 24.x 作为唯一跨需求版本锚点（原在 A/C/D/L 各自独立开放）。✅ **round-3 ratified**：接受为唯一跨需求版本锚点（上限 `<25` 是"未测保守"，非已证 OOM；实测后可放宽）。

2. **协作往返的编辑器表面**（I Open Decision #1）：~~round-3 ratified 仅文件路线~~ ⚠️ **被 D28 推翻（2026-06-22 / [ADR 0038](../adr/0038-codeguide-web-app-two-data-adapters.md)）**：**编辑整体 defer**——codeguide 暂**只读**（Web 编辑不做、file-native 编辑往返 I-4/I-5 也 defer），`.tk/` 文件人类用自有编辑器手编。人类面改为**单一 Web App + 两数据适配器**（`tk codeguide serve` loopback Live / `tk codeguide export` Snapshot 单文件），非 VS-Code-native 文件编辑、非 Tiptap。

3. **控制文件格式**（I）：JSONC 是连贯选择（tk 已解析 JSONC、可手编、VS Code 内可 schema 补全）。请确认选 JSONC 而非 YAML。✅ **round-3 ratified**：JSONC（非 YAML）。

4. ~~**Daemon/共享索引分支**（M18 / F #2 / E）：条件 daemon 分支门控于 K 的 op-count/cold-start 测量。~~ ✅ **闭合（D21 / [ADR 0033](../adr/0033-daemon-decomposed-three-capabilities.md)）**：旧"daemon"把三事捆一起，**三拆**——① **CrossSessionRepositoryDaemon = Outside scope**（tk on-disk node:sqlite + per-session MCP 已是暖路径；重开闸=hydration p95>250ms + 频繁重开 + 原型砍≥50% first-query）；② **IndexWatcher = Optional-at-runtime 默认关**（E11）；③ **CommandProxyResident = 独立 Required/Optional-at-runtime**（命令代理 shim 连常驻 proxy，是 D20 AV 税的唯一真解，属命令代理子系统）。修正：codegraph **有** daemon（非"no-daemon"），tk 刻意背离。

5. **输出经济单位**（G/K）：现以 char 分级（13000/18000/24000）作可移植代理，仅在 K 的 harness 测出 VS Code Copilot Windows 真实内联帽后再以 token 重新表达。请确认"现在用 char / 测量后用 token"，因主机宿主无法直接测 token。✅ **round-3 ratified**：现用 char 分级；**token 重表达 = measurement-gated**（K 测出真实内联帽后），非设计开放。

6. **Job-B 任务 oracle + Job-A 评分者**（K Open Decision）：手写 tk-repo 题集/gold patch vs SWE-bench 切片；宿主 Agent 评分 vs 人工评审理解答案——严谨度对工作量的取舍，只能由你定。⏳ **measurement-gated（非设计开放）**：总基调已定（D11/[ADR 0023](../adr/0023-benchmark-architecture.md)：复用 SWE-bench + Codebase-Memory 两 harness，Job-A 小 N 盲测，round-2 lesson = 保持 LEAN）；具体 oracle/评分者在 K harness 起立时按实测定，**不在 round 3 设计阶段拍**。

7. ~~**目标组织 MCP 策略现实**（F #3）："扩展为主"承诺假设企业 MCP-in-Copilot 默认锁。~~ ✅ **闭合（D19 / [ADR 0031](../adr/0031-asymmetric-dual-adapter-delivery.md)）**：旧前提**错**（`chat.mcp.access` 默认 `all`、扩展 LM Tool 有独立治理、扩展不接管 built-in）。改为 **Core 唯一实现 + 两不对等适配器**（`tk mcp` host-neutral 参考 / VS Code 扩展 Copilot managed），**入口由组织 policy 决定** + 优雅降级到 CLI/Human；非固定"扩展为主"。policy 键（`chat.mcp.access`/`chat.extensionTools.enabled`/`extensions.allowed`）默认值待官方复核。

8. **Embeddings/SCIP/PageRank 范围确认**：三者均承诺 Outside current product scope（A11/B9/C reserve-only/D14/M18），仅在实测召回不足（A9 aider 个性化）或互操作决策时重开。请确认当前范围都不需要。✅ **round-3 ratified（D13/D14/D16 已实证锚定，注意 SCIP/PageRank 非 Outside-scope）**：**embeddings = Unsupported**（D14 重申，本仓共现仅 `RELATED_IN_REPOSITORY` 候选实验臂，无预训练向量）；**SCIP = Required**（D16 官方 binding 流式消费，indexer 为 Optional-at-runtime）；**PageRank = Required**（D13 分级管线**主排序**）。即 embeddings 确认 out，但 SCIP/PageRank 早已是 Required（旧"三者皆 Outside"措辞作废）。

9. ~~**代码签名 + AV 冷启动税**（L Open Decision）：现在签 Windows Authenticode/macOS notarize vs 不签接受首跑摩擦。~~ ✅ **闭合（D20 / [ADR 0032](../adr/0032-artifact-gated-signing-av-tax-is-perf.md)）**：**修错误前提**——现在**无 tk 自有未签 PE 可签**(npm JS 包跑用户 Node；bundle 内 node.exe 是官方已签)。**artifact-gated signing**:现 SHA256+provenance+attestation 不买证书；tk 首发自有 Windows PE(SEA/daemon-EXE/MSI/MSIX)时 Authenticode 成硬发布门，macOS 同理。**AV 冷启动税 = 性能问题非签名**→ daemon/减 spawn/缓存 exec/减热路径 I/O（接 Open #4 daemon）。

附次级、可后置但建议一并确认的项（来自各需求 Open Decisions，非阻塞产品起建）。**Round-3 ratified（批量）**：下列各项**按其所述 lean 锁定**为 reference-consistent 默认，均非设计 fork，逐字 impl 细节在实现期照各需求节落地：
- **B 生成 provider 默认** ✅ **已正式裁定 → D22 / [ADR 0034](../adr/0034-llm-delegation-host-borrowed-no-byo-key.md)**（宿主借用、零 api_key、BYO-key 显式拒绝、无模型可借→static-only 降级；完整理由 + CI 不变量见该 ADR，此处不复述）。
- **C content_hash 算法** ✅ **闭合（D30 / E4）**：**sha256**（零依赖、node:crypto），不 vendor blake3。
- **E 首查大跳变行为** ✅ **闭合（D25 / [ADR 0035](../adr/0035-reconciling-freshness-latency-budget-per-layer.md)）**：用户自拟第三方案——**RECONCILING 状态 + 廉价同步失效闭包 + 延迟预算门控（<1s inline / 1–2s 服务未受影响 / >2s session 内续算）+ per-layer `resultFreshness`/`completeness`**；受影响依赖结果标 PARTIAL/UNKNOWN/SYNC_REQUIRED，绝不 banner-掩盖旧 edges。否决静默阻塞与 freeze-banner。**mtime 粒度**已由 E3（mtime_ns+size 仅作 pre-filter）+ E4（sha256 确认）+ E14（git diff）解决=从不单信 mtime（Windows 现场仍需核实，属验证非设计）。**COSMETIC 徽章**被 per-layer freshness 吸收（每层各自标新鲜度/完整度）。
- **D 框架/标记提取器** ✅ **闭合（D23）**：仅 Razor 破例（抄 codegraph razor-extractor），Vue/Svelte 不做（web 只用 React=JSX/TSX 原生），vendored-wasm 仅 C#。SCIP 仅 CONSUME 不 EMIT。
- **G kill-switch 暴露** ✅ **闭合（D30）**：**文档化用户配置**（非仅 harness env flag）——用户可见可关。
- **I `tk wiki impact --comment` / team 层** ✅ **闭合（D27 / [ADR 0037](../adr/0037-solo-first-collaboration-no-github-write-no-team-layer.md)）**：`--comment` **永久 Unsupported**（不建 GitHub 写适配器、保零-egress）；**删 `tier:team`** → 统一 `CAP_PAGES=30`；需求 I = solo-first，无 team/权限/写入层。（人类面交付机制 + 编辑范围 = D28 另案。）
- **J 置信 suppression** ✅ **闭合（D26 / [ADR 0036](../adr/0036-confidence-soft-factor-not-hard-filter.md)）**：confidence = **软排序因子绝非硬过滤**；canonical edge 一律参与计算，预算只截**展示**（`presentationTruncated`≠不完整，须 omitted-count + by-kind/confidence 汇总 + 展开句柄）；唯一硬过滤 = 用户显式 evidence-policy（compiler-backed-only，须披露排除数 + 不保证动态路径完整）。✅ **J(a) 残留闭合（D30）**：人类 HTML 折成 **high/med/low 徽章**，raw 0-1 留 **Evidence Drawer**。
- **L 细节** ✅ **闭合（D30）**：vendored Node **pin 一个具体 24.x LTS + CVE 刷新节奏**；**不发 Scoop**（个人项目无分发，D24）。
- **M 缺省** ✅ **闭合（D30 + D27）**：M18 daemon op-count 阈值 = **measurement-gated**（按 D21 reopen 闸，不预设数字）；M13 控制文件帽 = **统一 `CAP_PAGES=30`**（D27 删 tier:team；100 notes / 10k 字/note 保留）。

