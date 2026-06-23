## 需求 J — Correctness / trust（永不给出自信的错误答案）

本需求的验收红线：对人（Job A）和对 agent（Job B）都**永不输出一个看似可信、实则错误的答案**。机制单一且结构性——把每一条事实绑定到一个**可打开的物理坐标 file:line**，并给这条事实打上信任等级标签。错误的 file:line 是自证伪的（打开就露馅），错误的散文段落不是。这正是我们拒绝 DeepWiki RAG 形态的原因。

所有层都读同一个 node:sqlite(+FTS5) store（上游 A/C 已锁定），人（HTML）面与 agent（MCP/CLI）面看到**完全相同**的 nodes(file_path,start_line) 行、相同的 provenance/confidence/staleness 标签（J12，呼应冲突解析"一个后端两份食谱两个前端"）。下游 F（MCP 工具）渲染 J6/J7 文案、E（lazy-on-read）驱动 J8/J9 横幅（非常驻 watcher——见 E/F/J/M 冲突解析）、B 的 provenance 字段粒度契约提供 J2 的列。

---

### J1 — 硬锚点：每个节点/答案携带不可空的 file:line:col　（serves both surfaces）

**(1) 决策**：每个 node 行强制携带 `file_path + start_line + end_line + start_column + end_column`（行 1-indexed、列 0-indexed），无锚点不发事实；`idx_nodes_file_line` 让 file:line 查找 O(log n)。node id = `hash(filePath + '::' + qualifiedName)`。

**(2) 要动的文件**：
- `src/codemap/db/schema.sql`（新建，移植 codegraph 的 nodes 表 + 索引）
- `src/codemap/types.ts`（新建，Node 接口）

**(3) 可抄代码**

Node 接口字段全部非可空（源: /tmp/tk-research/codegraph/src/types.ts:11-40，verbatim）：

```ts
export interface Node {
  // ...
  qualifiedName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}
```

nodes 表 DDL（源: /tmp/tk-research/codegraph/src/db/schema.sql:20-43，verbatim，截 file:line 关键列）：

```sql
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    qualified_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    language TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_column INTEGER NOT NULL,
    end_column INTEGER NOT NULL,
    docstring TEXT,
    signature TEXT,
    visibility TEXT,
    is_exported INTEGER DEFAULT 0,
    -- ...
    return_type TEXT,
    updated_at INTEGER NOT NULL
);
```

file:line 复合索引（源: /tmp/tk-research/codegraph/src/db/schema.sql:94，verbatim）：

```sql
CREATE INDEX IF NOT EXISTS idx_nodes_file_line ON nodes(file_path, start_line);
```

**(4) 具体数值**：行号 1-indexed、列号 0-indexed；5 个坐标列全部 `NOT NULL`；id 计算用 `filePath + '::' + qualifiedName` 拼接。

**(5) 有序步骤**：
1. 落 `schema.sql` 的 nodes 表 + `idx_nodes_file_line`，跑一次 `CREATE TABLE` 验证 FTS5 与 NOT NULL 约束生效。
2. 落 `types.ts` 的 Node 接口（字段非可空）。
3. 在 extractor 写入处对每个 Node 断言 5 个坐标存在再 insert。

**(6) 测试**：单测 fixture——插入一个缺 `start_line` 的 Node，断言 `INSERT` 因 `NOT NULL` 失败；正常 Node 插入后 `SELECT ... WHERE file_path=? AND start_line=?` 命中且 `EXPLAIN QUERY PLAN` 显示走 `idx_nodes_file_line`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/types.ts:11-40；/tmp/tk-research/codegraph/src/db/schema.sql:20-94。

---

### J2 — 边级 provenance 闭枚举　（serves both surfaces）

**(1) 决策**：每条边携带 `provenance ∈ {'tree-sitter','scip','heuristic'}`，存为 `provenance TEXT DEFAULT NULL`（NULL = 结构精确/默认），建 `idx_edges_provenance` 让 agent 面按来源过滤/分级。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（edges 表 + 索引）、`src/codemap/types.ts`（Edge.provenance）。

**(3) 可抄代码**

Edge.provenance（源: /tmp/tk-research/codegraph/src/types.ts:203-204，verbatim）：

```ts
  /** How this edge was created */
  provenance?: 'tree-sitter' | 'scip' | 'heuristic';
```

edges 表 DDL（源: /tmp/tk-research/codegraph/src/db/schema.sql:45-56，verbatim）：

```sql
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    metadata TEXT, -- JSON object
    line INTEGER,
    col INTEGER,
    provenance TEXT DEFAULT NULL,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
```

provenance 索引（源: /tmp/tk-research/codegraph/src/db/schema.sql:145，verbatim）：

```sql
CREATE INDEX IF NOT EXISTS idx_edges_provenance ON edges(provenance);
```

> 与 B 的 per-field provenance 契约衔接：B 的字段级 provenance 是 `static|llm|template`（节点/摘要表上），而本边级 provenance 是 `tree-sitter|scip|heuristic`（边表上）——两者**不同列、不同语义**，retrieval 排序时 B 的 `WHERE provenance='static'` 过滤节点/摘要，J 的边 provenance 供 agent 给一条边降权。需实现时在 schema 注释里标清两个 provenance 列各属哪张表，避免混淆。

**(4) 具体数值**：枚举 3 值；默认 `NULL`；1 个索引 `idx_edges_provenance`。

**(5) 有序步骤**：
1. 落 edges 表 + provenance 列 + 索引。
2. extractor 写 tree-sitter 边时不设 provenance（NULL）；resolution synthesizer 写边时设 `'heuristic'`（见 J3）。

**(6) 测试**：fixture 插入 1 条精确边（provenance NULL）+ 1 条 heuristic 边；`SELECT count(*) FROM edges WHERE provenance='heuristic'` = 1；`EXPLAIN QUERY PLAN` 验证按 provenance 过滤走 `idx_edges_provenance`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/types.ts:203-204；/tmp/tk-research/codegraph/src/db/schema.sql:45-56,145。

---

### J3 — heuristic 边的 synthesizedBy 子标签 + registeredAt　（serves both surfaces）

**(1) 决策**：每条 heuristic 边在 `metadata` JSON 里带 `synthesizedBy`（命名具体推理规则）+ `via` + `field` + `registeredAt`（回调被接线的 file:line）。采用 codegraph 的闭词表。

**校正（已核对 clone）**：clone 中实际词表为 **20 个**规则名（非 dossier 写的 18 个）：`callback, closure-collection, cpp-override, event-emitter, expo-cross-platform, fabric-native-impl, flutter-build, gin-middleware-chain, go-grpc-stub-impl, go-implements, interface-impl, jsx-render, kotlin-expect-actual, mybatis-java-xml, pascal-form, react-render, rn-cross-platform, rn-event-channel, sveltekit-load, vue-handler`（dossier 缺 `pascal-form`/`sveltekit-load`，且写有 `vue-handler` 不在其列表——以 clone 为准用 20 名）。Required capability covers the rule set for the implemented-language subset; the remaining enum slots stay reserved.

**(2) 要动的文件**：`src/codemap/resolution/callback-synthesizer.ts`（移植）、`src/codemap/types.ts`（metadata 形状注释）。

**(3) 可抄代码**

每条 synthesized 边都被 heuristic 标记 + 子标签 + 锚点（源: /tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189，verbatim）：

```ts
        edges.push({
          source: disp.node.id, target: fn.id, kind: 'calls', line: disp.node.startLine,
          provenance: 'heuristic',
          metadata: {
            synthesizedBy: 'callback', via: reg.node.name, field: reg.field,
            // Where the callback was wired up (`scene.onUpdate(this.triggerRender)`).
            // This is the #1 thing an agent reads/greps to explain the flow — surface
            // it so node/trace/context can show it without a callers() + Read round-trip.
            registeredAt: `${caller.filePath}:${e.line}`,
          },
        });
```

**(4) 具体数值**：20 个 `synthesizedBy` 规则名；`registeredAt` 格式 `${filePath}:${line}`；metadata 存 edges.metadata TEXT（JSON）。

**(5) 有序步骤**：
1. 移植 callback-synthesizer，确保每条产出边都带 `provenance:'heuristic'` + `synthesizedBy` + `registeredAt`。
2. 在 types.ts 注释固化 metadata JSON 形状 `{ synthesizedBy, via, field, registeredAt }`。

**(6) 测试**：fixture 喂一个 `scene.onUpdate(this.triggerRender)` 接线，断言生成的边 `provenance==='heuristic'`、`metadata.synthesizedBy==='callback'`、`metadata.registeredAt` 匹配 `/.+:\d+/`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189；词表 grep 自 /tmp/tk-research/codegraph/src/。

---

### J4 — 已解析引用的 resolvedBy + 0-1 置信度　（serves the codemap agent surface）

**(1) 决策**：每个 ResolvedRef 记 `resolvedBy ∈ {exact-match,import,qualified-name,framework,fuzzy,instance-method,file-path,function-ref}` + `confidence:number(0-1)`。`exact-match/import/qualified-name` = 高；`fuzzy/framework` = 降级。低于阈值的边**保留**但标记，绝不静默升为 exact。

**(2) 要动的文件**：`src/codemap/resolution/types.ts`（ResolvedRef 接口）。

**(3) 可抄代码**（源: /tmp/tk-research/codegraph/src/resolution/types.ts:34-43，verbatim）：

```ts
export interface ResolvedRef {
  /** Original unresolved reference */
  original: UnresolvedRef;
  /** ID of the target node */
  targetNodeId: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** How it was resolved */
  resolvedBy: 'exact-match' | 'import' | 'qualified-name' | 'framework' | 'fuzzy' | 'instance-method' | 'file-path' | 'function-ref';
}
```

stats.byMethod 按方法计数（源: /tmp/tk-research/codegraph/src/resolution/types.ts:54-61，verbatim）：

```ts
  stats: {
    total: number;
    resolved: number;
    unresolved: number;
    byMethod: Record<string, number>;
  };
```

**(4) 具体数值**：8 个 `resolvedBy` 方法；`confidence` 取值 0–1；高置信集 = {exact-match, import, qualified-name}。

**(5) 有序步骤**：
1. 落 ResolvedRef 接口。
2. resolution 各 resolver 在产出时填 `resolvedBy` + `confidence`。
3. 汇总 `stats.byMethod`，供 K 测量 arm 读取方法分布。

**(6) 测试**：fixture 解析一个 import 引用断言 `resolvedBy==='import' && confidence>=0.8`；一个名字猜测断言 `resolvedBy==='fuzzy' && confidence<0.8`；`stats.byMethod.import===1`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/types.ts:34-61。

---

### J5 — retrieval 二元 confidence 分级（high/low）　（serves both surfaces）

**(1) 决策**：检索答案带 `confidence ∈ {'high','low'}`，查询时计算。LOW 触发条件：查询有 ≥2 个长度≥3 的不同词 且 结果>0 且 无任一结果被佐证（既非用户明确点名的 distinctive identifier，也非在 name+dir-segments 上命中 ≥2 个不同查询词）。单关键词/符号名查询豁免。这是 tk 既有 quality-gate 应用到图检索。

**(2) 要动的文件**：`src/codemap/context/index.ts`（grading 逻辑，移植）。

**(3) 可抄代码**（源: /tmp/tk-research/codegraph/src/context/index.ts:912-931，verbatim）：

```ts
    let confidence: 'high' | 'low' = 'high';
    const confTerms = extractSearchTerms(query, { stems: false }).filter(t => t.length >= 3);
    if (confTerms.length >= 2 && filteredResults.length > 0) {
      const distinctive = new Set(
        symbolsFromQuery.filter(isDistinctiveIdentifier).map(s => s.toLowerCase())
      );
      const anyStrong = filteredResults.some(r => {
        if (distinctive.has(r.node.name.toLowerCase())) return true;
        const nameLower = r.node.name.toLowerCase();
        const dirSegs = path.dirname(r.node.filePath).toLowerCase().split('/');
        let hits = 0;
        for (const t of confTerms) {
          if (nameLower.includes(t) || dirSegs.includes(t)) {
            if (++hits >= 2) return true;
          }
        }
        return false;
      });
      if (!anyStrong) confidence = 'low';
    }
```

**(4) 具体数值**：触发词长 ≥3；触发词数 ≥2；单词命中累计 ≥2 即算 strong；单关键词/符号查询豁免（confTerms<2 时不触发）。

**(5) 有序步骤**：
1. 移植 grading 函数 + `extractSearchTerms`/`isDistinctiveIdentifier` 依赖。
2. 在 Subgraph 结果上挂 `confidence?: 'high'|'low'`。

**(6) 测试**：A-B harness 字段 + 单测——查询 `"how does the user login flow work"` 只命中 common-word 结果断言 `confidence==='low'`；查询 `"AuthService"`（单符号）断言 `confidence==='high'`（豁免不触发）。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:905-931。

> **Open Decisions（回指 K Track-1）**：≥2-词-len≥3 + 佐证阈值是 codegraph（upstream reference）在自己语料上调的；是否在 tk 典型查询上过触发/欠触发，需 Track-1 测量后才锁定。

---

### J6 — LOW 时的诚实交还 footer　（serves both surfaces）

**(1) 决策**：LOW 置信时追加 honest-handoff footer（sentinel `LOW_CONFIDENCE_MARKER`，放在无依赖叶子模块 `markers.ts` 以避开冷启动路径）。footer 承认不确定、路由到精确工具（explore 用精确符号名 / search 单符号 / files 浏览最近的 ≤4 个目录），结尾 `Do not assume the list above is comprehensive.`

**(2) 要动的文件**：`src/codemap/context/markers.ts`（sentinel 常量）、`src/codemap/context/index.ts`（buildLowConfidenceNote）。

**(3) 可抄代码**

sentinel（源: /tmp/tk-research/codegraph/src/context/markers.ts:19，verbatim）：

```ts
export const LOW_CONFIDENCE_MARKER = '### ⚠️ Low-confidence match';
```

handoff footer（源: /tmp/tk-research/codegraph/src/context/index.ts:285-308，verbatim。**已改写**：F 决策的工具名是 `tk_explore/tk_search/tk_files`，替换 `codegraph_*` 前缀）：

```ts
  private buildLowConfidenceNote(entryPoints: Node[]): string {
    const dirs: string[] = [];
    const seen = new Set<string>();
    for (const n of entryPoints) {
      const slash = n.filePath.lastIndexOf('/');
      const dir = slash > 0 ? n.filePath.slice(0, slash) : n.filePath;
      if (!seen.has(dir)) { seen.add(dir); dirs.push(dir); }
      if (dirs.length >= 4) break;
    }
    const dirLine = dirs.length
      ? `\n- \`tk_files\` a likely area: ${dirs.map(d => `\`${d}\``).join(', ')}`   // 已改写: codegraph_files → tk_files
      : '';
    return `\n\n${LOW_CONFIDENCE_MARKER}\n\n`
      + 'This query matched mostly on common words, so the entry points above may '
      + 'be off-target — treat them as a starting point, not a complete answer. '
      + 'For a reliable result:\n'
      + '- `tk_explore` with the **exact symbol names** you are after '             // 已改写
      + '(class / function / method names), or\n'
      + '- `tk_search <name>` for one specific symbol'                              // 已改写
      + dirLine
      + '\n\nDo not assume the list above is comprehensive.';
  }
```

**(4) 具体数值**：交还目录上限 **4**（`dirs.length >= 4` break）；sentinel 文本固定 `### ⚠️ Low-confidence match`。

**(5) 有序步骤**：
1. 落 `markers.ts`（叶子、零依赖），MCP 层从此导入 sentinel，确认不引入冷启动重模块。
2. 移植 `buildLowConfidenceNote`，把工具名替换为 F 锁定的 `tk_explore/tk_search/tk_files`。

**(6) 测试**：单测——LOW 结果的输出包含 `LOW_CONFIDENCE_MARKER`、含 `Do not assume the list above is comprehensive.`、目录数 ≤4；HIGH 结果不含 sentinel。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/context/markers.ts:19；/tmp/tk-research/codegraph/src/context/index.ts:285-308。

---

### J7 — synthesized 边内联标注（绝不裸箭头）　（serves both surfaces）

**(1) 决策**：`provenance==='heuristic'` 的 `calls` 边渲染为 `A →[callback via \`onUpdate\` @App.tsx:3148] B`，按 `synthesizedBy` 类型给人可读标签 + `registeredAt` file:line。call-paths 段与 trace/node 工具用**同一套标签词表**。

**(2) 要动的文件**：`src/codemap/context/index.ts`（call-paths 渲染）、`src/codemap/mcp/tools.ts`（trace/node 渲染）共用 `synthEdgeNote`。

**(3) 可抄代码**

`synthEdgeNote` 在 dossier 中给的是形状描述，clone 中确认了上游数据（J3 的 metadata），但该具体函数我未在 clone 单一位置定位到 verbatim 实现——**需实现时补**：实现一个纯函数 `synthEdgeNote(edge): {label,compact,registeredAt} | null`，输入读 `edge.provenance` 与 `edge.metadata.synthesizedBy/registeredAt`，per-kind 映射标签。gap = 标签映射表需对 20 个 synthesizedBy 各定一行人读文案（Required capability first covers the implemented-language subset；其余回退到通用 `dynamic: ${synthesizedBy} via \`${via}\` @${registeredAt}`）。

可直接复用的数据来源已 verbatim 确认（源: /tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189，见 J3）——`metadata.synthesizedBy / via / registeredAt` 字段就是 `synthEdgeNote` 的输入。

**(4) 具体数值**：标签词表 20 项；compact 形如 `dynamic: callback via \`onUpdate\` @App.tsx:3148`；非 heuristic 边返回 `null`（不标注）。

**(5) 有序步骤**：
1. 实现 `synthEdgeNote`（纯函数，输入 Edge），non-heuristic 返回 null。
2. call-paths 段与 trace/node 工具都调它，确保**同一词表**（不要两处各写一份）。

**(6) 测试**：单测——一条 `provenance:'heuristic', synthesizedBy:'callback', registeredAt:'App.tsx:3148'` 的边渲染含 `via \`onUpdate\`` 与 `@App.tsx:3148`；一条精确边（provenance NULL）`synthEdgeNote` 返回 null（渲染为普通箭头）。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/callback-synthesizer.ts:179-189（数据源已核）；渲染函数 dossier 引 context/index.ts:383-391 + mcp/tools.ts:1487-1538（具体实现需实现时补）。

---

### J8 — per-file 陈旧横幅 + 项目级 footer　（serves both surfaces）

**(1) 决策**：`files` 表按 `content_hash + modified_at + indexed_at` 跟踪；引用到 pending 文件时在响应**顶部**发 ⚠️ banner（`Read THESE directly, the rest is fresh`），非引用的 pending 文件进紧凑 footer（**MAX=5** + `…and N more`）。陈旧信号来源 = E 的 lazy mtime-sweep（非常驻 watcher——见 E/F/J/M 冲突解析；J8 的"debounced watcher"=E11 的 opt-in watcher，默认关）。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（files 表）、`src/codemap/mcp/tools.ts`（formatStaleBanner/formatStaleFooter）。

**(3) 可抄代码**

files 表（源: /tmp/tk-research/codegraph/src/db/schema.sql:59-68，verbatim）：

```sql
CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    size INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL,
    node_count INTEGER DEFAULT 0,
    errors TEXT -- JSON array
);
```

per-file banner（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:314-328，verbatim）：

```ts
export function formatStaleBanner(stale: PendingFile[]): string {
  const now = Date.now();
  const lines = stale.map((p) => {
    const ageMs = Math.max(0, now - p.lastSeenMs);
    const label = p.indexing ? 'indexing in progress' : 'pending sync';
    return `  - ${p.path} (edited ${ageMs}ms ago, ${label})`;
  });
  return (
    '⚠️ Some files referenced below were edited since the last index sync — ' +
    'their codegraph entries may be stale:\n' +
    lines.join('\n') +
    '\nFor accurate content of those specific files, Read them directly. ' +
    'The rest of this response is fresh.'
  );
}
```

项目级 footer，MAX=5（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:335-349，verbatim）：

```ts
export function formatStaleFooter(stale: PendingFile[]): string {
  const MAX = 5;
  const now = Date.now();
  const shown = stale.slice(0, MAX);
  const lines = shown.map((p) => {
    const ageMs = Math.max(0, now - p.lastSeenMs);
    return `  - ${p.path} (edited ${ageMs}ms ago)`;
  });
  const more = stale.length > MAX ? `\n  - …and ${stale.length - MAX} more` : '';
  return (
    `(Note: ${stale.length} file(s) elsewhere in this project are pending index ` +
    `sync but were not referenced above:\n${lines.join('\n')}${more})`
  );
}
```

**(4) 具体数值**：footer MAX=**5**；`files` 三列 `content_hash/modified_at/indexed_at` 全 NOT NULL；banner 置于响应顶部。

**(5) 有序步骤**：
1. 落 files 表（依赖 J1 nodes 已落）。
2. 移植 `formatStaleBanner`/`formatStaleFooter`，标签文案中 `codegraph` 渲染时按 tk 品牌可改（非阻塞）。
3. 接 E 的 lazy mtime-sweep 产 `PendingFile[]`（非常驻 watcher）。

**(6) 测试**：单测——3 个 pending 文件喂 banner 断言含 `Read them directly. The rest of this response is fresh.`；7 个 pending 喂 footer 断言显示 5 行 + `…and 2 more`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/db/schema.sql:59-68；/tmp/tk-research/codegraph/src/mcp/tools.ts:314-349。

---

### J9 — 整索引冻结横幅（独立于 per-file）　（serves both surfaces）

**(1) 决策**：当 live watching 永久停止（watcher 死亡、`getPendingFiles()` 空、per-file 无法触发），发独立横幅承认整索引冻结，开头给 agent-actionable `Read files directly`，附 reason（reason 已含 operator 补救 `codegraph sync` / git hooks）。

**(2) 要动的文件**：`src/codemap/mcp/tools.ts`（formatDegradedBanner）。

**(3) 可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:360-367，verbatim）：

```ts
export function formatDegradedBanner(reason: string | null): string {
  return (
    '⚠️ CodeGraph auto-sync is DISABLED — live file watching stopped, so the index is ' +
    'frozen and any file edited since then is stale here. Read files directly to confirm ' +
    'current content before relying on it.' +
    (reason ? `\n  Reason: ${reason}` : '')
  );
}
```

> 与 E/F/J/M 冲突解析衔接：默认 lazy-on-read、无常驻 watcher（the always-on watcher is a Required capability whose runtime watching dependency is Optional at runtime），所以"watcher 死亡"路径只在 the watcher 被启用且崩溃时触发；默认路径的"冻结"等价物是 J10 的 catch-up gate 失败（best-effort 服务）。

**(4) 具体数值**：横幅文案固定；reason 可为 `null`（则不追加 Reason 行）。

**(5) 有序步骤**：
1. 移植 `formatDegradedBanner`。
2. 在 watcher 生命周期终止处调用，传死亡 reason。

**(6) 测试**：单测——`formatDegradedBanner('watcher crashed')` 含 `auto-sync is DISABLED` + `Read files directly` + `Reason: watcher crashed`；`formatDegradedBanner(null)` 不含 `Reason:`。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:354-367。

---

### J10 — 首次服务前的 catch-up 对账闸（fail-open）　（serves the codemap agent surface）

**(1) 决策**：引擎在 `open()` 后注册一个 post-open 文件系统对账 promise（catchUpSync），`execute()` 在第一次 tool call 时 await 它一次（后续调用零成本）。捕获"无 server 运行期间被删/改"的文件——watcher 喂的 per-file banner 覆盖不到的窗口。handler **吞掉** reconcile 拒绝（log 后 best-effort 服务可能陈旧的数据），sync 失败永不冒成 tool error。

**(2) 要动的文件**：`src/codemap/mcp/tools.ts`（catchUpGate 字段 + setCatchUpGate + execute await）。

**(3) 可抄代码**

catchUpGate 字段 + 注释（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:677-684，verbatim）：

```ts
  // Gate that the MCP engine pokes after `cg.open()` so the first tool call
  // blocks on the post-open filesystem reconcile (catch-up sync). Without
  // this, a tool call that races past `catchUpSync()` serves rows for files
  // that were deleted (or edited) while no MCP server was running — and the
  // per-file staleness banner can't help, because `getPendingFiles()` is
  // populated by the watcher, not by catch-up. Cleared on first await so
  // subsequent calls don't pay any cost.
  private catchUpGate: Promise<void> | null = null;
```

setCatchUpGate（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:696-704，verbatim）：

```ts
  /**
   * Engine-only: register the catch-up sync promise so the next `execute()`
   * call awaits it before serving. The handler swallows rejections (the
   * engine logs them) so a sync failure never propagates as a tool error;
   * we still want to serve a best-effort result over the same potentially-
   * stale data, which is what would have happened without the gate.
   */
  setCatchUpGate(p: Promise<void> | null): void {
    this.catchUpGate = p;
  }
```

`execute()` 中 await 一次后清除——**需实现时补**：在 execute 开头插入
```ts
if (this.catchUpGate) { try { await this.catchUpGate; } catch (e) { /* logged by engine */ } finally { this.catchUpGate = null; } }
```
（dossier 描述了"awaits once then clears + swallows"语义，clone 中字段与 setter 已 verbatim 确认；具体 await 插入点按上述实现。）

**(4) 具体数值**：await **1** 次（首次 execute）；后续调用 0 成本；rejection **吞掉**（不冒错）。

**(5) 有序步骤**：
1. 加 `catchUpGate` 字段 + `setCatchUpGate`。
2. 引擎 `open()` 后 `setCatchUpGate(catchUpSync())`。
3. execute 开头 try/await/finally-clear。

**(6) 测试**：单测——注入一个 reject 的 catchUpGate，断言 `execute()` 不抛、返回 best-effort 结果、`catchUpGate` 被置 null；第二次 execute 不再 await。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:676-704。

---

### J11 — derive→validate→fallback：存在性闸验证锚点　（serves both surfaces）

**(1) 决策**：跨写/读边界的任何锚点，只在路径通过存在/可读检查（`fileExists` / `readFile→null`）后才发出；resolution 在建边前验证目标节点存在。绝不发出捏造路径。`ResolutionContext` 暴露 `fileExists(path)` 与 `readFile(path):string|null` 作为验证原语——这是 tk presence-gate 纪律（仅当真实二进制存在才拦截）在图层的推广。

**(2) 要动的文件**：`src/codemap/resolution/types.ts`（ResolutionContext 原语）；参照 repodoc 的 guard 模式。

**(3) 可抄代码**

ResolutionContext 验证原语（源: /tmp/tk-research/codegraph/src/resolution/types.ts:74-77，verbatim）：

```ts
  /** Check if a file exists */
  fileExists(filePath: string): boolean;
  /** Read file content */
  readFile(filePath: string): string | null;
```

repodoc 的 derive+validate+fallback 范式（源: /tmp/tk-research/repodoc/repodoc/src/tools/file_tools.py:9-19，verbatim。**校正**：clone 中类名是 `FileReaderTool`、tool 名 `file_reader`，非 dossier 写的 `ReadFileTool`）：

```python
    async def execute(self, file_path: str, **kwargs) -> ToolResult:
        try:
            if not os.path.exists(file_path):
                return ToolResult(success=False, error=f"File not found: {file_path}")

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            return ToolResult(success=True, output=content)
        except Exception as e:
            return ToolResult(success=False, error=str(e))
```

**(4) 具体数值**：`readFile` 缺失返回 `null`（= 不发锚点）；`fileExists` 返回 boolean；resolution 建边前必过 node-exists 校验。

**(5) 有序步骤**：
1. ResolutionContext 实现 `fileExists`/`readFile`（readFile 缺失 → null，不抛）。
2. resolution 在每次建边前调 `getNodesByName/...` 确认目标存在，否则不建边、留 unresolved_refs。
3. 任何要发 file:line 的 surface（HTML/MCP）发出前过 `fileExists`。

**(6) 测试**：单测——`readFile('/nonexistent')` 返回 null 且不抛；resolution 对一个无目标节点的引用断言**不**产生边而是写 `unresolved_refs`；surface 对一个不存在路径断言**不**发锚点。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/resolution/types.ts:74-77；/tmp/tk-research/repodoc/repodoc/src/tools/file_tools.py:9-19。

---

### J12 — 人面与 agent 面指向同一证据库　（serves both surfaces）

**(1) 决策**：HTML 人面（tk `src/report/html.ts`）与 MCP/CLI agent 面读**同一个** node:sqlite(+FTS5) store；两面每条事实都解析到同一 `nodes(file_path,start_line)` 行、显示同一 provenance/confidence/staleness。人与 agent 之间**没有**单独的 LLM 生成 wiki 当真相——wiki（若有）由 HOST agent 生成且本身回锚到 file:line（呼应 B：narrative 是 generation-tier，retrieval 走 static-only）。

**(2) 要动的文件**：`src/codemap/db/schema.sql`（project_metadata + nodes_fts，单一 store 的版本/freshness 元数据）；人面 `src/report/html.ts`、agent 面 `src/codemap/mcp/*` 均查此 store。

**(3) 可抄代码**

nodes_fts FTS5（源: /tmp/tk-research/codegraph/src/db/schema.sql:98-105，verbatim）：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id,
    name,
    qualified_name,
    docstring,
    signature,
    content='nodes',
    content_rowid='rowid'
);
```

project_metadata（两面共读以报告同一 freshness，源: /tmp/tk-research/codegraph/src/db/schema.sql:148-152，verbatim）：

```sql
CREATE TABLE IF NOT EXISTS project_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
```

> FTS5 可用性守护（接 A/C/L 冲突解析）：vendored-Node bundle 的 SQLite 已知带 FTS5；仅 npm-shim-on-user-Node 路径需 C7 的 `LIKE`-scan 回退。需实现时在打开 store 时探测 `CREATE VIRTUAL TABLE ... fts5`，失败则降级到 `nodes(lower(name))` 的 LIKE 扫描，两面一致降级。

**(4) 具体数值**：单一 store 5 张核心表（nodes, edges, files, unresolved_refs, project_metadata）+ 1 个 FTS5 虚表；两面查询同 DDL。

**(5) 有序步骤**：
1. 落 nodes_fts + 同步触发器 + project_metadata（依赖 J1 nodes）。
2. 人面 html.ts 与 agent 面 mcp 都从同一 db 路径读（out-of-tree，见 C/L 冲突解析）。
3. 两面读 project_metadata 的 index version/provenance 报告同一 freshness。

**(6) 测试**：集成测试——同一查询经 HTML 渲染与 MCP 工具，断言两者引用的 `(file_path, start_line)` 行一致、provenance/confidence 标签一致。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/db/schema.sql:98-105,148-152。

---

### J13 — 召回保守但框定诚实（keep-but-tag，绝不静默丢）　（serves both surfaces）

**(1) 决策**：低置信/fuzzy/heuristic 结果**保留在答案中**（召回对 B 重要），但**打标 + 降框**。绝不把低置信检索自动扩展成大块看似精确的 context；LOW 等级把框定上限压到"starting point"。LOW 时**渲染入口点但追加 J6 footer 且不加"this covers the surface"总结框定**；heuristic 边渲染但 J7 内联标注。floor 决策只影响框定，永不静默丢。

**(2) 要动的文件**：`src/codemap/context/index.ts`（LOW 分支的框定抑制——复用 J5 的 confidence + J6 的 note）。

**(3) 可抄代码**

J5/J6 的代码已是 J13 的执行体（LOW → `buildLowConfidenceNote` 追加而非省略结果）。证据 verbatim 注释（源: /tmp/tk-research/codegraph/src/context/index.ts:280-285，verbatim）：

```ts
   * mostly common words). Instead of the usual "this covers the surface" framing
   * — which, when wrong, sends the agent off to Read/Grep — it admits the
   * uncertainty and routes the agent to the precise tools (explore with real
   * symbol names, search, or files to browse the closest areas we *did* surface).
```

**(4) 具体数值**：LOW 时丢弃结果数 = **0**（只追加 footer）；heuristic 边渲染数 = 全部（标注，不抑制）。

**(5) 有序步骤**：
1. 在 LOW 分支：渲染 `filteredResults` 全量 + 追加 `buildLowConfidenceNote`，**跳过**"covers the surface"总结段。
2. heuristic 边走 `synthEdgeNote` 标注而非过滤。

**(6) 测试**：A-B harness——LOW 查询断言结果条数 == HIGH 同查询条数（未丢）且输出含 sentinel 且**不**含 "covers the surface" 框定；含 heuristic 边的 trace 断言边被标注未被丢。

**(7) 证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:280-308,905-931。

---

### 本需求 Open Decisions（交用户/Track-1 测量）

- Windows 文件 watcher debounce 窗口：codegraph（upstream reference）用 ~2s；tk 的 AV/CrowdStrike/EBUSY 历史可能需更长 debounce 或 git-hook 回退到 `tk sync`（替代/并行 ReadDirectoryChangesW）——需在慢机安装基上测后定。注：默认 lazy-on-read 无常驻 watcher，此项仅影响 the always-on watcher（Required capability; its runtime watching dependency is Optional at runtime）。
- ~~0-1 `resolvedBy` 置信度对**人 HTML 面**是暴露数字还是收成 high/med/low 徽章。~~ ✅ **闭合（D30②）**：人 HTML 面 = **high/med/low 徽章**（raw 0-1 留 Evidence Drawer）；agent 面仍拿数字。
- J5 置信阈值（≥2-词-len≥3 + 佐证）在 VS Code Copilot/Windows 主目标上是否过/欠触发——需 Track-1 harness 确认后锁（**measurement-gated**）。
- ~~heuristic 边在 token-minimal agent 路径上是否该**抑制**（不止标注）于某置信度下。~~ ✅ **闭合（D26 / [ADR 0036](../../adr/0036-confidence-soft-factor-not-hard-filter.md)）**：**always-keep-but-tag**，confidence 是软排序因子、绝不硬过滤；唯一硬过滤 = 用户显式 evidence-policy（须披露被排除数）。


---

