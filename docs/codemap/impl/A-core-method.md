## 需求 A — Core method（这份"智能"是什么形态）

**总纲（与 DEP MAP coherence 一致）：ONE BACKEND, TWO SURFACES (codemap = agent, codeguide = human)。** 唯一存储 = node:sqlite + FTS5 单文件里的一张 typed property graph（nodes + edges + nodes_fts），每个 node 携带可解析的 `file:line` span。两套渲染 surface 共享同一张子图：codemap (agent surface)（(serves the codemap agent surface)，确定性混合检索）与 codeguide (human surface)（(serves the codeguide human surface)，ASCII/HTML 树）。embeddings 与 LSP-as-core 属 Outside current product scope;**PageRank Required, default on**（决策 #8 / 附录 A1）、SCIP 为 Required capability; its runtime dependency is Optional at runtime。packing（signature-collapse）不是底座，是 codemap (agent surface) 内部的压缩函数。下游 C 是这张图的物理落地、D 是填图的 WASM tree-sitter 抽取器、F 是把 codemap (agent surface) 暴露成 MCP 工具、H 渲染 codeguide (human surface)、G/J 塑形与背书输出。

> 跨需求依赖闸（A 此前为 Open Decision，现由 D+A 关闭）：因 A 承诺 tree-sitter **WASM** 作抽取器（D1），L 的"是否 ship WASM"被定性回答=是 → 单一闸 `engines.node ">=22.5.0 <25.0.0"`，vendored Node 钉 24.x LTS，解析进程强制 `--liftoff-only`。FTS5 由 vendored-Node bundle 保证存在；仅 npm-shim-on-user-Node 路径需 C7 的 `LIKE`-scan 兜底。DB 路径走 out-of-tree（per-project fingerprint 目录于 user store），`.tk/` 树只放 human 工件（codeguide）+ gitignored staging——**修正 A1 旧串 `.tk/codegraph.db` → out-of-tree 路径**。

---

### 决策 A1 — BASE = typed property graph（非 flat ranked repo-map、非 AST-chunk index）   (serves both surfaces)

(1) **决策**：底座是 node/edge typed property graph，单一真相源；ranked-map 与 chunk view 是按需投影、绝不二次落库。embeddings 属 Outside current product scope;PageRank Required;LSP-as-core 属 Outside current product scope。

(2) **要动的文件**（tk repo）：
```
src/codemap/
  db/schema.sql          # 新建：node/edge/fts DDL（决策 A2/A3/A4）
  db/open.ts             # 新建：node:sqlite 打开 + applySchema()，DB 路径由 C 提供（out-of-tree）
  context/build.ts       # 新建：Agent diet 管线（A5/A6/A7/A10）
  context/format.ts      # 新建：formatSubgraphTree（A8 human diet 数据源）
  context/markers.ts     # 新建：LOW_CONFIDENCE_MARKER 叶子常量（A10）
src/report/html.ts       # 已存在(791 行)：接入 Human diet 渲染（A8）
```
DB 物理位置归 C（`~/.token-killer/projects/<fp>/index.db` POSIX / `%LOCALAPPDATA%\token-killer\...` Windows），A 只要求"同一子图喂两套 surface"。

(3) **可抄代码**（已确认存在）：见 A2/A3/A4 的 DDL 与 A6 的 budgets 常量。

(5) **有序步骤**：① 落 schema.sql（A2/A3/A4，可独立测）→ ② db/open.ts 打开+建表 → ③ build.ts 管线（A5）→ ④ format.ts + markers.ts（A8/A10）→ ⑤ 接 html.ts（A8）。

(6) **测试**：建空库后 `SELECT name FROM sqlite_master` 必含 `nodes/edges/nodes_fts` + 3 触发器；A-B harness 记录 `tool_calls`、`uncached_delta_tokens`（vs grep 基线）。

(7) **证据回指**：`/tmp/tk-research/codegraph/src/db/schema.sql`；research §10.2（structural-graph 唯一全绿行）。

---

### 决策 A2 — Node 模型（每个 node 带可解析 file:line span）   (serves both surfaces)

(1) **决策**：node 表字段如下；`file:line` span 让图同时充当 Read 后端（返回字节一致源码），`return_type` 保留用于 method-call 的 receiver-type 推断。

(4) **具体数值**：kind 枚举 ~21 种；FTS 覆盖 4 字段（name/qualified_name/docstring/signature）；布尔列 INTEGER 0/1。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:20`，verbatim，license MIT 无限制）：
```sql
-- Nodes: Code symbols (functions, classes, variables, etc.)
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
    is_async INTEGER DEFAULT 0,
    is_static INTEGER DEFAULT 0,
    is_abstract INTEGER DEFAULT 0,
    decorators TEXT, -- JSON array
    type_parameters TEXT, -- JSON array
    return_type TEXT, -- normalized return/result type name (receiver-type inference)
    updated_at INTEGER NOT NULL
);
-- Node indexes (源: schema.sql:89)
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_qualified_name ON nodes(qualified_name);
CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_language ON nodes(language);
CREATE INDEX IF NOT EXISTS idx_nodes_file_line ON nodes(file_path, start_line);
CREATE INDEX IF NOT EXISTS idx_nodes_lower_name ON nodes(lower(name));
```

(6) **测试**：插入一个 fixture node，按 `(file_path, start_line)` 查回 → `read --max-lines` 同区间字节一致（Read 后端等价断言）。

(7) **证据回指**：schema.sql:20 / :89。下游 J1（file:line 是唯一信任原语）、C5。

---

### 决策 A3 — Edge 模型（provenance 标记 heuristic 边，FK ON DELETE CASCADE）   (serves both surfaces)

(1) **决策**：edge 11 种 kind；启发式/合成边必须 `provenance='heuristic'` + metadata.synthesizedBy；FK CASCADE 保增量重建一致。

(4) **具体数值**：3 个复合索引 `idx_edges_kind / (source,kind) / (target,kind)` + `idx_edges_provenance`；narrow source-only/target-only 索引故意省略（左前缀扫描覆盖）。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:45` 与 :126，verbatim）：
```sql
-- Edges: Relationships between nodes
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
-- idx_edges_source / idx_edges_target intentionally omitted —
-- (source, kind) and (target, kind) composites cover source-only/target-only
-- lookups via SQLite left-prefix scan; narrow indexes are dead weight on writes.
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_source_kind ON edges(source, kind);
CREATE INDEX IF NOT EXISTS idx_edges_target_kind ON edges(target, kind);
CREATE INDEX IF NOT EXISTS idx_edges_provenance ON edges(provenance);  -- 源: schema.sql:145
```
> 注：打开连接后须 `PRAGMA foreign_keys=ON`（node:sqlite 默认关闭），否则 CASCADE 不生效——**需实现时在 db/open.ts 补一行 PRAGMA**（schema.sql 仅声明 FK 约束，未含 PRAGMA）。

(6) **测试**：插入 node+若干 edge → `DELETE FROM nodes WHERE id=?` 后该 node 的边数=0（CASCADE 断言）；插一条 `provenance='heuristic'` 边，按 `idx_edges_provenance` 过滤可命中。

(7) **证据回指**：schema.sql:45 / :126 / :145。下游 B1（provenance 列）、J2（边诚实）、F（tk_callers/tk_node）。

---

### 决策 A4 — 词法索引 = FTS5 over nodes(name,qualified_name,docstring,signature)，触发器同步   (serves the codemap agent surface)

(1) **决策**：唯一搜索通道用 content-table FTS5，与图共处一文件；无独立 BM25 引擎、无 vector store。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/db/schema.sql:98`，verbatim）：
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    id, name, qualified_name, docstring, signature,
    content='nodes', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, id, name, qualified_name, docstring, signature)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.qualified_name, NEW.docstring, NEW.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, qualified_name, docstring, signature)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.qualified_name, OLD.docstring, OLD.signature);
END;
CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, id, name, qualified_name, docstring, signature)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.name, OLD.qualified_name, OLD.docstring, OLD.signature);
    INSERT INTO nodes_fts(rowid, id, name, qualified_name, docstring, signature)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.qualified_name, NEW.docstring, NEW.signature);
END;
```

(4) **具体数值**：FTS 覆盖 4 列；触发器 3 个。

(6) **测试**：插 node → `SELECT id FROM nodes_fts WHERE nodes_fts MATCH ?` 命中；`UPDATE nodes SET name=...` → 旧名查不到、新名查到（触发器同步断言）。FTS5 缺失时 C7 `LIKE`-scan 兜底（仅 npm-shim-on-user-Node 路径）。

(7) **证据回指**：schema.sql:98。下游 B（FTS over static-only）、C6。

---

### 决策 A5 — codemap (agent surface) 检索管线（6 步确定性混合检索）   (serves the codemap agent surface)

(1) **决策**：固定为 ① query 符号抽取（CamelCase/snake/SCREAMING/acronym/dotted/lowercase 正则 − ~130 词 stoplist）→ ② 3 通道（exact-name +co-location、definition-prefix +brevity、FTS multi-term）按 **MAX** 合并 → ③ re-rank（multi-term 共现、test-file ×0.3、dominant-file boost）**产出有界候选锚点**（非最终序）→ ④ BFS expansion over contains/calls 构建结构邻域（BFS 方向随 query.purpose 翻转，见 §3；direction 默认 both 仅在 purpose 缺省时）→ ⑤ **query-local PPR 对邻域做主排序**（锚点的 ③-分作 personalization 种子 + tie-breaker，见 §1 / D13 / [ADR 0025](../adr/0025-staged-ranking-pipeline.md)）→ ⑥ 自适应 code-block 抽取 → ⑦ 低置信诚实兜底。**注**：①–③ 是分级管线的「词法选锚点」段，⑤ 是「PPR 主排序」段；词法分**不在 ⑤ 之后与 PPR 加权融合**（重复计数）。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:44`，符号抽取正则，verbatim）：
```ts
// extractSymbolsFromQuery (index.ts:44)
const camelCasePattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]*)*|[a-z]+(?:[A-Z][a-z]*)+)\b/g;
const snakeCasePattern  = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/gi;        // len>=3 (index.ts:59)
const screamingPattern  = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
```
test-file 惩罚（源: `index.ts:623`，verbatim）：`result.score *= 0.3;`
dominant-file boost 触发（源: `index.ts:642`，verbatim）：`if (dominant && dominant.edgeCount >= 3 * dominant.nextEdgeCount) { ... }`

(4) **具体数值**：snake/screaming 最短 3 字符；test-file ×0.3；dominant-file 阈 ≥3×。

(6) **测试**：fixture query `"refresh AuthToken in user_service"` → 抽出 `['AuthToken','user_service']`；含 test 文件的命中分降至 0.3×。

(7) **证据回指**：index.ts:44/:59/:623/:642。下游 F（tk_explore/tk_search 暴露此管线）、K（被测系统）。

---

### 决策 A6 — 默认检索预算（token 效率刻度盘）   (serves the codemap agent surface)

(1) **决策**：maxNodes=20、maxCodeBlocks=5、maxCodeBlockSize=1500 chars、searchLimit=3、traversalDepth=1、minScore=0.3；BFS per-entry-point 上限 = ceil(maxNodes/entryPointCount)。import/export 排除出 HIGH_VALUE_NODE_KINDS。

(4) **具体数值**：见上（全部定值）。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:143`，verbatim）：
```ts
const DEFAULT_BUILD_OPTIONS: Required<BuildContextOptions> = {
  maxNodes: 20,           // Reduced from 50 - most tasks don't need 50 symbols
  maxCodeBlocks: 5,       // Reduced from 10 - only show most relevant code
  maxCodeBlockSize: 1500, // Reduced from 2000
  includeCode: true,
  format: 'markdown',
  searchLimit: 3,         // Reduced from 5 - fewer entry points
  traversalDepth: 1,      // Reduced from 2 - shallower graph expansion
  minScore: 0.3,
};
const HIGH_VALUE_NODE_KINDS: NodeKind[] = [
  'function', 'method', 'class', 'interface', 'type_alias', 'struct', 'trait',
  'component', 'route', 'variable', 'constant', 'enum', 'module', 'namespace',
];  // imports/exports excluded: near-zero information density
```

(6) **测试**：单次 explore 调用产出 node 数 ≤20、code block ≤5；A-B harness 字段 `nodes_returned`、`code_blocks` 上界断言。

(7) **证据回指**：index.ts:143。下游 G1（char 层级 13000/18000/24000 操作化这些预算）、F8（maxOutputChars 须 import G1 常量，不重定义）。

---

### 决策 A7 — code-block 压缩函数（复用 packing，非独立库）   (serves the codemap agent surface)

(1) **决策**：container（class/module）折叠为 signature outline；leaf function/method 出 verbatim 源码；超预算在 maxCodeBlockSize 截断并加语言中立标记 `\n... (truncated) ...`（不用 `//`，Python/Ruby 非注释）。优先级 entry-points → functions/methods → classes。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:1250`，verbatim）：
```ts
const truncated = code.length > maxBlockSize
  ? code.slice(0, maxBlockSize) + '\n... (truncated) ...'
  : code;
```
> container→outline 与 tk 现有 `read --level aggressive` 是同一招（已改写：tk 侧复用 html.ts 折叠区段）。

(4) **具体数值**：截断阈 = maxCodeBlockSize=1500 chars。

(6) **测试**：>1500 字符的函数体被截断且尾含 `... (truncated) ...`；class node 仅出 signature 行不出 body。

(7) **证据回指**：index.ts:1250。下游 G（输出经济层）。

---

### 决策 A8 — codeguide (human surface) 渲染器（同一子图，第二 formatter）   (serves the codeguide human surface)

(1) **决策**：codeguide (human surface) 消费与 codemap (agent surface) **同一个 TaskContext/subgraph**，渲染为 entry-point 列表 + related-symbols-by-file + 可折叠 code block + depth-bounded 树（Understand-Anything 式 lazy-expand）。每 kind >3 时收口为 `… and N more`；related-symbols 上限 10；生成文件（.pb.go/mocks）排末。这是"one base two surfaces"的字面验收——codeguide (human surface) **Required，与 agent 共生，不是 Outside current product scope 的 afterthought**（覆盖旧 ADR 0013-0016）。

(2) **要动的文件**：`src/codemap/context/format.ts`（formatSubgraphTree）→ 喂 `src/report/html.ts`（791 行，已存在）的可折叠区段。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/formatter.ts:124` 与 :206，verbatim）：
```ts
export function formatSubgraphTree(subgraph: Subgraph, entryPoints: Node[]): string {
  const lines: string[] = [];
  const printed = new Set<string>();
  const outgoing = new Map<string, Edge[]>();
  for (const edge of subgraph.edges) {
    const existing = outgoing.get(edge.source) ?? [];
    existing.push(edge); outgoing.set(edge.source, existing);
  }
  for (const entry of entryPoints) {
    formatNodeTree(entry, subgraph, outgoing, printed, lines, 0, '');
    lines.push('');
  }
  const remaining: Node[] = [];
  for (const node of subgraph.nodes.values())
    if (!printed.has(node.id)) remaining.push(node);
  if (remaining.length > 0 && remaining.length <= 10) {
    lines.push('Other relevant symbols:');
    for (const node of remaining) {
      const location = node.startLine ? `:${node.startLine}` : '';
      lines.push(`  ${node.kind}: ${node.name} (${node.filePath}${location})`);
    }
  } else if (remaining.length > 10) {
    lines.push(`... and ${remaining.length} more related symbols`);
  }
  return lines.join('\n').trim();
}
// per-kind 收口 (formatter.ts:206, verbatim):
//   if (kindEdges.length > 3) {
//     ...lines.push(`${newPrefix}├── ${kind}: ${names} and ${kindEdges.length - 3} more`);
//   }
// depth 界 (formatter.ts:224, verbatim): if (depth < 1) { for (const edge of significantEdges.slice(0, 3)) ... }
```

(4) **具体数值**：related-symbols ≤10；per-kind >3 收口；递归 depth<1；每节点最多展 3 条 significant edge。

(6) **测试**：同一 subgraph 喂两 formatter → agent Markdown 与 human 树引用同一组 node id（"one base"断言）；>10 个剩余 symbol 时出 `... and N more`。

(7) **证据回指**：formatter.ts:124/:206/:224。DEP：H（HTML viewer 渲染此 surface，read-only）、conflict(I,H) 决议=Required 文件态 round-trip 不在 HTML 内编辑。

---

### 决策 A9 — PageRank Required, default on（FTS+结构 boost 是其廉价快路径/种子打分器,非替代）   (serves the codemap agent surface)

> ⚠️ **已按 2026-06-20 拍板(决策 #8)更新**:PageRank **Required, default on**;原"Unsupported"措辞作废。实现见 **附录 A1**(PageRank 纯 TS)+ **附录 A3 §0/§1**(与 FTS boost 的 `finalScore` 融合)。

(1) **决策**：排序 = **分级管线**（见附录 A3 §1 / D13 / [ADR 0025](../adr/0025-staged-ranking-pipeline.md)），非加权和：(a) **FTS 分 + exact-name co-location boost（同文件每多一个 query 符号 +30）+ dominant-file boost（一文件边数 ≥3× 次高）+ multi-term 乘性 boost（2 词→2×，3 词→2.5×）** —— 廉价快路径，**职责是为 PageRank 选 personalization 种子 + 给最终序当 tie-breaker**，不是与 PPR 并列融合的打分通道（并列会重复计数）；(b) **personalized PageRank(附录 A1)Required, default on** —— 对结构邻域做**主排序**，最终序主要由 PPR 决定；用户显式 symbol/path 保留确定性优先。无 `--no-rank` 时即走此路径。

(4) **具体数值**：co-location +20/extra symbol；dominant 阈 ≥3×；multi-term ×2 / ×2.5。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/index.ts:820`，co-location boost，verbatim）：
```ts
info.result.score = info.result.score * (1 + info.termCount) + (info.termCount - 1) * 30;  // index.ts:820
```
> 注：dossier 文字写"+20/extra symbol"，但 clone 实测此行系数为 `* 30`（已改写说明：以 clone 源为准，+30/extra term）。dominant-file 阈 `>= 3 * nextEdgeCount` 见 index.ts:642（A5 已贴）。aider 替代方案（Outside current product scope，源: repograph/construct_graph.py:416）：`personalization[rel_fname]=10/len(fnames)`，仅在 under-recall 时引入。

(6) **测试**：双词 query 命中分 ≈ 单词 ×2；同文件多符号命中排名上升；harness 记录 recall@k，<阈值才重开 PageRank。

(7) **证据回指**：index.ts:820/:642；repograph/construct_graph.py:416。

---

### 决策 A10 — 低置信诚实兜底（两 surface 强制）   (serves both surfaces)

(1) **决策**：当 entry point 仅解析到孤立 common-word 命中，发哨兵 `### ⚠️ Low-confidence match`，让 agent/human 改用精确符号或直接 Read——绝不给自信的错答。常量放 dependency-free 叶子模块，MCP detector 直接 import，不拖 context 依赖上冷启动。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/context/markers.ts:19`，verbatim）：
```ts
export const LOW_CONFIDENCE_MARKER = '### ⚠️ Low-confidence match';
```

(2) **要动的文件**：`src/codemap/context/markers.ts`（叶子）；`build.ts` 发射、F 的 MCP 层 import 检测。

(6) **测试**：query 仅命中常用词 → 输出含哨兵且抑制"comprehensive"页脚；emitter 与 detector 共享常量（字符串相等断言）。

(7) **证据回指**：markers.ts:19。下游 J（信任契约）、M19。

---

### 决策 A11 — embeddings 与 LSP-as-core 属 Outside current product scope   (serves both surfaces)

(1) **决策**：embeddings（Family D）与 LSP-as-core（Family E）属 Outside current product scope，不进底座。LSP/SCIP 可作已配置项目的可选补充；SCIP 是可后续 emit/consume 的可移植交换格式。

(2) **要动的文件**：无新代码——记录于 design doc 的"排除"段；C 保留列、D14、M18 引用此决策。

(3) **可抄代码**："需实现时补"——本决策为排除性裁定，无可抄代码。理由锚点：embeddings 需 model（~100MB–1GB 本地 OR API key + code egress）+ vector store，违反 LLM anchor 与 no-native-build，且不可验证（Sourcegraph Cody 规模化后撤离 embeddings）；LSP 需 per-language runtime（下载+预热），太重且被 Windows install-base 历史否决。

(4) **具体数值**：research §9 兼容矩阵——embeddings/RL-explorer = 🔴；LSP-as-core = 🟡（仅补充）；SCIP = 🟡（可移植 emit/consume）。

(6) **测试**：依赖审计——`package.json` 不含任何 embedding/vector/LSP runtime 依赖；冷启动无 model 下载。

(7) **证据回指**：research §9；§7.3（Cody 撤离）。下游 B9、C（reserve-only）、D14、M18。

---

### 决策 A12 — 无索引即不激活（VS Code 上仅在 .tk DB 存在且新鲜时广告工具）   (serves the codemap agent surface)

(1) **决策**：无 index 则表征不注册/不服务任何东西；索引保持用户显式选择。VS Code 上 MCP 工具仅当索引 DB 存在且 fresh 时才 advertise——空/缺图绝不污染工具列表或误导。

(3) **可抄代码**（源: `/tmp/tk-research/codegraph/src/mcp/session.ts:209`，verbatim）：
```ts
instructions: indexed ? SERVER_INSTRUCTIONS : SERVER_INSTRUCTIONS_UNINDEXED,
```
（source-instructions 双串源: server-instructions.ts，import 见 session.ts:19）

(4) **具体数值**：indexed 布尔由 DB 文件存在 + 新鲜度（E 的 lazy mtime check + index_generation 比对）决定。

(6) **测试**：删 DB 后启动 MCP → 工具列表不含 tk_explore/tk_search（仅 UNINDEXED 指引）；建 DB 后重启 → 工具出现。

(7) **证据回指**：session.ts:209 / :19。下游 F（工具门控）、E（新鲜度判定）。

---

### Open Decisions（A 相关，需你拍板）
- **版本闸**：D+A 已关闭 Node 25 / `--liftoff-only`——请确认接受 `>=22.5.0 <25.0.0` + vendored Node 24.x 作单一跨需求版本锚。
- **A9 personalization**:**Required, default on**(已拍板决策 #8;原"Unsupported"作废)。personalization 种子 = query 命中符号(FTS)+ 当前编辑文件 + 错误栈节点,按信号分 mass(FTS 100 / stack-trace 80 / git-changed 70 / edited 60,见附录 A3 §4.1)。这是"任务相关"而非"全局重要"排序——避免 logger/config/utils 这类全局高分但任务无关的符号霸榜(研究 §2)。
- **embeddings/SCIP/PageRank**:已拍板(决策 #8)——**embeddings 仍 Unsupported**;**PageRank Required, default on**;**SCIP Required capability; its runtime dependency is Optional at runtime**(探测到 indexer 才用,否则回退 tree-sitter)。
- **codeguide (human surface) 形态**（A8/H）：Required，默认 live HTML（html.ts 按需打开）；是否同时出 CodeWiki 式 self-contained `index.html` 静态工件归 H 决策，A 只要求同一子图喂它。


---

