## 需求 G — Output token economy（一答既足且省 token，尤其 uncached）

**服务对象总览**：G 全部 16 项子决策直接服务 **codemap agent surface（agent 找代码 = token 优化）**，其中 G12/G13/G14 同时服务 **both surfaces**（诚实交还 + 可引用行号 + verbatim 信任 banner 既省 agent token，又是人/协作信任的共享机制）。

**上游绑定（来自 DEP MAP）**：
- A 已定 `A7 code-block compression + A6 budgets`，G1–G16 是它们的运营化。本节所有产出落在 A 的 **codemap (agent surface)** 的 `buildContext` / `tk_explore` 路径里，不动 codeguide (human surface)。
- B 已定 **static tier 是整个 find-code 路径**（provenance filter `WHERE provenance='static'`），故 G 的所有整形都在 **零 LLM、零 token 花费、零 API key** 的确定性 static 答案上运行（满足 LLM lean）。
- F 冲突解决已绑定：**`tk_explore` 的 `maxOutputChars` 字符档必须 import G1 常量，不得自行重定义**（G 持有数字，F 消费）。
- K 冲突解决：char 档 13000/18000/24000 现在就上，作为可移植代理；token 化只在 K 的 harness 在 VS Code Copilot/Windows 实测真实 inline cap 之后再做（见 §G Open Decisions）。

下面每项决策遵守 §4.2 契约：**决策 / 要动的文件 / 可抄代码 / 具体数值 / 有序步骤 / 测试 / 证据回指**。所有 fenced code 已在开 paste 前用 Read/Bash 对照 clone 确认存在，逐一标注「源:」。

---

### 共同要动的文件与目录结构（G1–G16 的物理落点）

```
src/codemap/economy/                         # 新建：output-economy 层（G 的全部常量与整形函数）
  budget.ts                                    # G1 getExploreOutputBudget + G10 getExploreBudget + G2 不变式
  wholeFile.ts                                 # G3 whole-file 规则
  skeletonize.ts                               # G4/G5/G6 polymorphic-sibling / spine god-file / spare 规则
  cluster.ts                                   # G7 envelope-collapse 聚簇
  lineNumbers.ts                               # G13 numberSourceLines
  markers.ts                                   # G11 截断/skeleton tag + G12 LOW_CONFIDENCE_MARKER + G14 verbatim banner
  noise.ts                                     # G15 diversity/non-prod/generated caps
  defaults.ts                                  # G16 DEFAULT_BUILD_OPTIONS
  flags.ts                                     # kill-switch 读取（双用作 K 的 A/B harness 开关）
src/codemap/mcp/tools.ts                     # F 拥有：tk_explore/tk_search/tk_node 装配，import economy/* 常量
tests/unit/codegraph/economy/                  # 每项决策一个 fixture 测试
```

`economy/*` 是纯字符计数 + 文件切片，**无 native build、无 LLM、Windows 可移植**（满足 Windows-primary 锚 + LLM lean）。环境变量统一前缀改为 `TK_*`（codegraph 原用 `CODEGRAPH_*`），与 tk 现有 `TK_*`/`TOKEN_KILLER_HOME` 体系一致。

---

### G1 — 按仓库规模分档的字符预算（CEILING，非 target）　(serves the codemap agent surface)

**决策**：按已索引 `fileCount` 分 5 档给出输出预算上限。相关性仍决定**包含什么**；预算只决定**最多多大**。单调不变式：更大档的 `maxCharsPerFile` 永不小于更小档。

**要动的文件**：`src/codemap/economy/budget.ts`（新建）。`mcp/tools.ts` 的 `tk_explore` 装配处 import 本档常量（F 绑定）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:160-258，verbatim；仅去掉注释、`CODEGRAPH_`→`TK_` 不涉及本函数；标识符不改 → 直接 verbatim）：

```ts
export interface ExploreOutputBudget {
  maxOutputChars: number;
  defaultMaxFiles: number;
  maxCharsPerFile: number;
  gapThreshold: number;
  maxSymbolsInFileHeader: number;
  maxEdgesPerRelationshipKind: number;
  includeRelationships: boolean;
  includeAdditionalFiles: boolean;
  includeCompletenessSignal: boolean;
  includeBudgetNote: boolean;
  excludeLowValueFiles: boolean;
}

export function getExploreOutputBudget(fileCount: number): ExploreOutputBudget {
  // CEILING, must stay under the host INLINE tool-result cap (~25K chars).
  // Invariant: a larger tier must never get a smaller maxCharsPerFile.
  if (fileCount < 150) {
    return { maxOutputChars: 13000, defaultMaxFiles: 4, maxCharsPerFile: 3800,
      gapThreshold: 7, maxSymbolsInFileHeader: 5, maxEdgesPerRelationshipKind: 4,
      includeRelationships: false, includeAdditionalFiles: false,
      includeCompletenessSignal: false, includeBudgetNote: false, excludeLowValueFiles: true };
  }
  if (fileCount < 500) {
    return { maxOutputChars: 18000, defaultMaxFiles: 5, maxCharsPerFile: 3800,
      gapThreshold: 8, maxSymbolsInFileHeader: 6, maxEdgesPerRelationshipKind: 6,
      includeRelationships: false, includeAdditionalFiles: false,
      includeCompletenessSignal: false, includeBudgetNote: false, excludeLowValueFiles: true };
  }
  if (fileCount < 5000) {
    return { maxOutputChars: 24000, defaultMaxFiles: 8, maxCharsPerFile: 6500,
      gapThreshold: 12, maxSymbolsInFileHeader: 10, maxEdgesPerRelationshipKind: 10,
      includeRelationships: true, includeAdditionalFiles: true,
      includeCompletenessSignal: true, includeBudgetNote: true, excludeLowValueFiles: false };
  }
  if (fileCount < 15000) {
    return { maxOutputChars: 24000, defaultMaxFiles: 8, maxCharsPerFile: 7000,
      gapThreshold: 15, maxSymbolsInFileHeader: 15, maxEdgesPerRelationshipKind: 15,
      includeRelationships: true, includeAdditionalFiles: true,
      includeCompletenessSignal: true, includeBudgetNote: true, excludeLowValueFiles: false };
  }
  return { maxOutputChars: 24000, defaultMaxFiles: 8, maxCharsPerFile: 7000,
    gapThreshold: 15, maxSymbolsInFileHeader: 15, maxEdgesPerRelationshipKind: 15,
    includeRelationships: true, includeAdditionalFiles: true,
    includeCompletenessSignal: true, includeBudgetNote: true, excludeLowValueFiles: false };
}
```

**具体数值**：档界 150/500/5000/15000；`maxOutputChars` 13000/18000/24000/24000/24000；`defaultMaxFiles` 4/5/8/8/8；`maxCharsPerFile` 3800/3800/6500/7000/7000；`gapThreshold` 7/8/12/15/15；`maxSymbolsInFileHeader` 5/6/10/15/15。

**有序步骤**：(1) 落 `budget.ts`，导出 `getExploreOutputBudget` + `ExploreOutputBudget`。(2) `tk_explore` 装配时调用一次，结果传给 G3/G6/G7。

**测试**：`tests/unit/codegraph/economy/budget.test.ts` — 断言每档返回值逐字段相等；断言单调性 `for tiers t1<t2: budget(t1).maxCharsPerFile <= budget(t2).maxCharsPerFile`。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:160-258。

---

### G2 — 全档硬顶 ~24000 字符，刻意低于 host inline cap（~25000）　(serves the codemap agent surface)

**决策**：任何单答 `maxOutputChars ≤ 24000`，明确低于 host inline-tool-result 上限（~25000 字符）。仓库越大给**更多 CALL**（见 G10）而非更大单答。非 explore 工具的硬截断地板 `MAX_OUTPUT_LENGTH = 15000`。

**要动的文件**：`src/codemap/economy/budget.ts`（常量 + 不变式断言）；`mcp/tools.ts` 非 explore 工具的尾部截断。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:54；verbatim）：

```ts
const MAX_OUTPUT_LENGTH = 15000;   // per-tool hard truncate floor for NON-explore tools
```

**不变式（tk 改写，新增断言）**：

```ts
// src/codemap/economy/budget.ts —— ship-time invariant
export const HOST_INLINE_CAP = 25000;          // measured proxy; re-calibrate via K harness
export const MAX_OUTPUT_LENGTH = 15000;
for (const fc of [0, 149, 499, 4999, 14999, 50000]) {
  if (getExploreOutputBudget(fc).maxOutputChars >= HOST_INLINE_CAP) {
    throw new Error('budget tier exceeds host inline cap — would externalize+re-Read');
  }
}
```

**具体数值**：硬顶 24000；host inline cap 代理值 25000；非 explore 地板 15000。

**有序步骤**：(1) 加 `HOST_INLINE_CAP`/不变式自检（模块加载即跑）。(2) 非 explore 工具尾部用 `MAX_OUTPUT_LENGTH` 截断。

**测试**：`budget.test.ts` — 断言所有档 `maxOutputChars < 25000`；断言一个 26K 构造答案被截到 `<= 15000`（非 explore 路径）。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:54, 161-171；decisionRationale 的 n=4 README A/B（35K vscode explore 被 host 外置成文件→re-Read 回归）。

---

### G3 — 可负担即整文件 verbatim；仅 god-file 聚簇　(serves the codemap agent surface)

**决策**：文件 `≤ WHOLE_FILE_MAX_LINES`（外围 220 / 中心 280）且 `≤ WHOLE_FILE_MAX_CHARS` 时，整文件带行号返回，byte-identical to Read；否则落入按方法聚簇。**绝不切半个文件**：放不下的非必要文件直接跳过，必要文件整出。

**要动的文件**：`src/codemap/economy/wholeFile.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2644-2672；verbatim 核心）：

```ts
const isCentralFile = centralFiles.has(filePath);
const WHOLE_FILE_MAX_LINES = isCentralFile ? 280 : 220;
const WHOLE_FILE_MAX_CHARS = isCentralFile
  ? Math.min(Math.max(0, budget.maxOutputChars - totalChars - 200), Math.round(budget.maxCharsPerFile * 1.5))
  : budget.maxCharsPerFile * 3;
if (fileLines.length <= WHOLE_FILE_MAX_LINES && fileContent.length <= WHOLE_FILE_MAX_CHARS) {
  const body = fileContent.replace(/\n+$/, '');
  let wholeSection = exploreLineNumbersEnabled() ? numberSourceLines(body, 1) : body;
  // ... header (G15 names) ...
  if (!fileNecessary && totalChars + wholeSection.length + 200 > budget.maxOutputChars) {
    // Don't slice a whole file mid-method: an incidental file that doesn't fit is skipped.
    anyFileTrimmed = true;
    continue;
  }
  lines.push(wholeHeader, '', '```' + lang, wholeSection, '```', '');
  totalChars += wholeSection.length + 200;
  filesIncluded++;
  continue;
}
```

**具体数值**：中心档行数 280 / 字符 `min(remaining-200, maxCharsPerFile*1.5)`；外围档行数 220 / 字符 `maxCharsPerFile*3`；尾部预留 200 字符。

**有序步骤**：(1) 落 `wholeFile.ts`，输入 `{fileLines, fileContent, isCentralFile, budget, totalChars, fileNecessary}`，输出 `{rendered}|{fallthrough:true}`。(2) explore 聚簇前先调它。

**测试**：`wholeFile.test.ts` — 134 行外围文件 → 整文件输出且 `output === numberSourceLines(content,1)`（byte-identical 断言）；300 行中心文件 → `fallthrough:true`；非必要且超 budget → 跳过（不切半）。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2625-2672。

---

### G4 — Polymorphic-sibling 骨架化（默认 ON，kill-switch `TK_ADAPTIVE_EXPLORE=0`）　(serves the codemap agent surface)

**决策**：将一个**离 spine 的文件**折叠为 per-symbol 骨架，当且仅当：(1) 存在 flow spine；(2) 文件内无 symbol 在 spine 上；(3) 其 class 是 polymorphic sibling（implements/extends 一个被 `≥ MIN_SIBLINGS=3` 实现的 supertype）；(4) 文件未被 spare。骨架内：spine + 唯一命名方法整体，其余 symbol → 单行签名。

**要动的文件**：`src/codemap/economy/skeletonize.ts`（新建）；`flags.ts`（`adaptiveExploreEnabled()`）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2430-2439, 2546-2547；verbatim 核心）：

```ts
const MIN_SIBLINGS = 3;
const isPolymorphicSibling = (nodes: Node[]): boolean =>
  nodes.some(n =>
    cg.getEdgesFrom(n.id)
      .filter(x => x.kind === 'implements' || x.kind === 'extends').length >= MIN_SIBLINGS);

if (adaptiveExploreEnabled() && flow.pathNodeIds.size > 0
    && (onSpineGodFile || (!hasSpineNode && isPolymorphicSibling(group.nodes) && !spared))) {
  // per-symbol skeleton: spine + named full; everything else -> one-line signature
}
```

> 注：clone 中 `isPolymorphicSibling` 实体在 tools.ts:2432-2439（用 `>= MIN_SIBLINGS` 计 implements/extends 计数）。`cg.getEdgesFrom` 是其图查询接口；在 tk 中对应 A/C 的 `edges` 表查询，**已改写**为 tk 的边访问 API（接口名待 C/D 落地后对齐）。

**具体数值**：`MIN_SIBLINGS = 3`；kill-switch `TK_ADAPTIVE_EXPLORE=0`（默认 ON）。

**有序步骤**：(1) 落 `skeletonize.ts` 与 `isPolymorphicSibling`。(2) explore 聚簇判定处接入 `adaptiveExploreEnabled()` 门控。

**测试**：`skeletonize.test.ts` — 构造 3 个 `implements Interceptor` 的兄弟文件 + flow → 离 spine 文件被骨架化；**inert 断言**：无 ≥3-implementer supertype 的 fixture → 输出 byte-identical 到 `TK_ADAPTIVE_EXPLORE=0` 的输出。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2422-2623；measured OkHttp 28.5k→16.6k（~28%），excalidraw/tokio/django/vscode/gin byte-identical（须 K 在 tk harness 复测后才能作为 tk 自报数，见 Open Decisions）。

---

### G5 — SPARE 规则 + family-supertype OVERRIDE　(serves the codemap agent surface)

**决策**：文件被 spare（保整）当且仅当 agent 命名了其中一个（近）唯一可调用项 —— **除非**该文件**定义了 family supertype**（class/interface 有 ≥3 实现且与子类同处一文件），此时仍骨架化。唯一性必需：`as_sql` 有 110 个 override，命名它不得让每个 backend 变体保整。

**要动的文件**：`src/codemap/economy/skeletonize.ts`（与 G4 同文件，`definesPolymorphicSupertype` + spare 计算）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2459-2466, 2526-2528；verbatim）：

```ts
const definesPolymorphicSupertype = (nodes: Node[]): boolean =>
  nodes.some(n =>
    cg.getEdgesTo(n.id)
      .filter(x => x.kind === 'implements' || x.kind === 'extends').length >= MIN_SIBLINGS);

const spareNamed = group.nodes.some(n => flow.uniqueNamedNodeIds.has(n.id));
const fileDefinesSuper = definesPolymorphicSupertype(group.nodes);
const spared = spareNamed && !fileDefinesSuper;
```

> 注：`definesPolymorphicSupertype` 实体在 tools.ts:2459-2466（统计**指向该节点**的 implements/extends 边 ≥ MIN_SIBLINGS）。`cg.getEdgesTo` **已改写**为 tk 边访问 API（同 G4，接口待 C/D 对齐）。`spareNamed/fileDefinesSuper/spared` 三行在 2526-2528 verbatim。

**具体数值**：复用 `MIN_SIBLINGS = 3`。

**有序步骤**：(1) 在 skeletonize 入口先算 `spared`，传入 G4 判定。

**测试**：`skeletonize.test.ts` — 命名一个唯一方法的非 super 文件 → `spared=true` 保整；命名 super 文件（compiler.py 式，≥3 子类同处）→ `spared=false` 仍骨架化。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2448-2528。

---

### G6 — ON-SPINE GOD-FILE per-symbol windowing　(serves the codemap agent surface)

**决策**：flow 穿过文件时，若其 named-body 字符超 `maxCharsPerFile` 且有 off-path named 方法 → spine 保整、off-path named 方法折为签名。优先级贪心填充（`bodyCap = maxCharsPerFile*1.5`）：prio 0=on-spine，1=uniquely-named，2=family-base-named（仅当定义 supertype），99=skip-body。**至少出 1 个 body**。签名上限 `SIG_MAX = max(12, maxSymbolsInFileHeader*2)`，溢出 → `… +N more (signatures elided)`。

**要动的文件**：`src/codemap/economy/skeletonize.ts`。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2543-2547, 2559-2561, 2569, 2574, 2584, 2600, 2605；verbatim 拼装）：

```ts
const onSpineGodFile = hasSpineNode
  && namedBodyChars > budget.maxCharsPerFile
  && group.nodes.some(n => CALLABLE_BODY.has(n.kind)
       && flow.uniqueNamedNodeIds.has(n.id) && !flow.pathNodeIds.has(n.id));

const prio = (n: Node) => !CALLABLE_BODY.has(n.kind) ? 99
  : flow.pathNodeIds.has(n.id) ? 0
  : flow.uniqueNamedNodeIds.has(n.id) ? 1
  : (fileDefinesSuper && flow.namedNodeIds.has(n.id)) ? 2 : 99;

const bodyCap = budget.maxCharsPerFile * 1.5;
// greedy fill: if (bodyChars + sz > bodyCap && bodyIds.size > 0) continue;  // always emit >=1 body
const SIG_MAX = Math.max(12, budget.maxSymbolsInFileHeader * 2);
// per-signature: if (sigCount >= SIG_MAX) { sigDropped++; continue; }
// tail: if (sigDropped > 0) skel.push(`… +${sigDropped} more (signatures elided)`);
```

**具体数值**：`bodyCap = maxCharsPerFile*1.5`；`SIG_MAX = max(12, maxSymbolsInFileHeader*2)`；至少 1 个 body。

**有序步骤**：(1) 算 `onSpineGodFile`。(2) 按 `prio` 排序贪心填 body 至 `bodyCap`。(3) 其余出签名至 `SIG_MAX`，溢出加 elided 标记。

**测试**：`skeletonize.test.ts` — 7 个命名方法 fixture（超 budget）→ spine body 在、off-path 转签名、`bodyIds.size>=1`；签名数 > SIG_MAX → 出 `… +N more (signatures elided)`。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2529-2622。

---

### G7 — CONTAINER-COLLAPSE：聚簇范围剔除 envelope 节点　(serves the codemap agent surface)

**决策**：聚簇时剔除跨度 >50% 文件的 container 节点（class/file/module…），避免它把每个内部方法并成一个 tail-trim 到只剩 container header 的巨簇。内部细粒度 symbol 保 verbatim。

**要动的文件**：`src/codemap/economy/cluster.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2693, 2709-2711；verbatim）：

```ts
const ENVELOPE_KINDS = new Set(['file','module','class','struct','interface','enum','namespace','protocol','trait','component']);
const ranges = [...rangeNodes.values()]
  // Drop whole-file envelope nodes (containers covering >50% of the file).
  .filter(n => !(ENVELOPE_KINDS.has(n.kind) && (n.endLine - n.startLine + 1) > fileLines.length * 0.5))
```

**具体数值**：envelope 阈值 = 文件总行数的 50%。

**有序步骤**：(1) 落 `cluster.ts`，聚簇前先 filter envelope。

**测试**：`cluster.test.ts` — 1400 行 `class Session` + 内部方法 fixture → ranges 不含 Session class 节点、含内部方法。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2693-2710（Alamofire #185）。

---

### G8 — PRECOMPUTE-OVER-COMPRESS：一次结构化 call，body 按需　(serves the codemap agent surface)

**决策**：`tk_search`/`tk_query`/`tk_node`(context)/`tk_impact` 的 `include_content`/`includeCode` 默认 **FALSE** —— 返回 ranked flows、locations、callers/callees、blast-radius depth-groups，**不带 body**；按 name 单独取 body。唯一 always-loaded 的 `tk_explore` 才发 verbatim source（它是一答即足的答案）。

**要动的文件**：`src/codemap/mcp/tools.ts`（各非 explore 工具 schema 的 `include_content` 字段）。

**可抄代码**（源: /tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:169-173；verbatim JSON schema 字段）：

```ts
include_content: {
  type: 'boolean',
  description: 'Include full symbol source code (default: false)',
  default: false,
}
```

**具体数值**：所有非 explore 工具 `include_content` 默认 `false`。

**有序步骤**：(1) 每个非 explore 工具 schema 加此字段。(2) handler 仅当 `include_content===true` 才注入 body；否则只出 location + 边。

**测试**：`tk_search` fixture 不传 `include_content` → 返回含 `file:line` 与 callers，不含源码块；传 `true` → 含源码块。

**证据回指**：/tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:169-172；compendium sec 10「metadata-first retrieval contract」。绑定 B：此路径 `WHERE provenance='static'`，零 LLM。

---

### G9 — PROGRESSIVE-DISCLOSURE：summaryOnly + byDepthCounts + 分页　(serves the codemap agent surface)

**决策**：hub symbol 的 `tk_impact` 支持 `summaryOnly:true` → 仅返回 `target/summary/risk/byDepthCounts/affected_processes/affected_modules`，省略 `byDepth`；agent 用 `limit/offset` 按 depth 钻取（各 depth 独立分页）。截断时带 `partial:true` + `pagination` 对象，使一页被截不被误认为「没有更多」。

**要动的文件**：`src/codemap/mcp/tools.ts`（`tk_impact` schema 加 `summaryOnly`/`limit`/`offset`，handler 输出 `byDepthCounts`/`partial`）。

**可抄代码**（源: /tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:523-526；verbatim schema 字段）：

```ts
summaryOnly: {
  type: 'boolean',
  description: 'When true, returns target, summary, risk, byDepthCounts, affected_processes, and affected_modules — omits byDepth. Use for hub symbols to get actionable signal without output explosion.',
}
```

> 行为契约（源: gitnexus tools.ts:420, 427 描述，verbatim 摘录）：「When partial:true, do NOT treat processes:[] as proof of no participation」；「limit and offset apply independently to each depth level, not to the total result set — use byDepthCounts to see totals per depth」。

**具体数值**：`limit` 默认 100 / depth（`maxLimit` 200）；`summaryOnly` 默认 false。

**有序步骤**：(1) schema 加 `summaryOnly/limit/offset`。(2) handler：`summaryOnly` 时省 `byDepth`、出 `byDepthCounts`；分页截断时置 `partial:true`。

**测试**：hub symbol（>200 depth-1 deps）`summaryOnly:true` → 无 `byDepth`、有 `byDepthCounts`；分页第二页 → `partial:true` 且 `pagination.offset` 正确。

**证据回指**：/tmp/tk-research/gitnexus/gitnexus/src/mcp/tools.ts:420, 427, 511, 523-526。

---

### G10 — CALL-COUNT BUDGET（一答 vs 多轮）　(serves the codemap agent surface)

**决策**：按仓库规模在工具描述里**实时**推荐最大 explore CALL 数：<500→1、<5000→2、<15000→3、<25000→4、≥25000→5。默认一次富结构 call；只在仓库变大时才允许更多轮。

**要动的文件**：`src/codemap/economy/budget.ts`（`getExploreBudget`）；`mcp/tools.ts` 描述注入。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:102-108；verbatim）：

```ts
export function getExploreBudget(fileCount: number): number {
  if (fileCount < 500) return 1;
  if (fileCount < 5000) return 2;
  if (fileCount < 15000) return 3;
  if (fileCount < 25000) return 4;
  return 5;
}
```

**具体数值**：1/2/3/4/5，档界 500/5000/15000/25000。

**有序步骤**：(1) 导出 `getExploreBudget`。(2) `tk_explore` 描述里注入 `Recommended max explore calls for this repo: N`。

**测试**：`budget.test.ts` — 各档返回 1..5；描述字符串含正确 N。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:102-108, 795-803。

---

### G11 — RETENTION-FIRST 升级阶梯：每次省略都回查工具，绝不 Read　(serves the codemap agent surface)

**决策**：骨架体的 tag 说「`tk_explore` a signature by name for its body; **do NOT Read**」；截断块以语言中性 `\n... (truncated) ...`（无 `//`，不是 Python/Ruby 注释）结尾。工具输出**绝不**叫 agent 去 Read 它刚发过的文件。

**要动的文件**：`src/codemap/economy/markers.ts`（新建，tag + 截断标记）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2616-2617 + context/index.ts:1251；verbatim，`codegraph_`→`tk_` 已改写）：

```ts
// skeleton / focused tag (tk-adapted: codegraph_explore -> tk_explore)
const tag = bodyIds.size > 0
  ? 'focused (the methods you named in full, the rest as signatures — tk_explore a signature by name for its body; do NOT Read)'
  : 'skeleton (signatures only — tk_explore a name for its full body; do NOT Read)';

// language-neutral truncation marker (no // comment) —— verbatim from context/index.ts:1251
const truncated = code.length > maxBlockSize
  ? code.slice(0, maxBlockSize) + '\n... (truncated) ...'
  : code;
```

**具体数值**：截断标记字面量 `\n... (truncated) ...`；tag 双态（有 body / 纯签名）。

**有序步骤**：(1) 落 `markers.ts` 导出 `skeletonTag(bodyCount)` 与 `truncateBlock(code, maxBlockSize)`。(2) G6/G4 骨架出口与 G16 block 截断处复用。

**测试**：`markers.test.ts` — 超长 block → 以 `... (truncated) ...` 结尾且不含 `//`；骨架 tag 含 `do NOT Read`、含 `tk_explore`、不含 `Read for more`。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2609-2618；context/index.ts:1247-1252。

---

### G12 — LOW-CONFIDENCE 诚实交还 marker　(serves both surfaces)

**决策**：当多词 prose 查询（≥2 个 len≥3 的词）只命中孤立常用词匹配（无被 ≥2 个不同词印证的 entry point、且无用户命名的判别性标识符）→ 置 `confidence='low'`，追加 `### ⚠️ Low-confidence match`，承认 entry point 可能跑偏，导向 `tk_explore`(精确名)/`tk_search <name>`/`tk_files <dir>`。单关键词与 symbol-name 查询豁免。**这是 agent token-economy（避免 confident-wrong 触发的 Read/Grep 螺旋）与人/协作信任的共享机制**。

**要动的文件**：`src/codemap/economy/markers.ts`（marker 常量 + 文案）；context builder 的 confidence 判定。

**可抄代码**（源: /tmp/tk-research/codegraph/src/context/markers.ts:19 + context/index.ts:297-305, 914-930；verbatim，`codegraph_`→`tk_` 已改写）：

```ts
export const LOW_CONFIDENCE_MARKER = '### ⚠️ Low-confidence match';

// emitted when: confTerms.length >= 2 && filteredResults.length > 0 && !anyStrong -> confidence='low'
function lowConfidenceFooter(dirs: string[]): string {
  const dirLine = dirs.length
    ? `\n- \`tk_files\` a likely area: ${dirs.map(d => `\`${d}\``).join(', ')}` : '';
  return `\n\n${LOW_CONFIDENCE_MARKER}\n\n`
    + 'This query matched mostly on common words, so the entry points above may '
    + 'be off-target — treat them as a starting point, not a complete answer. '
    + 'For a reliable result:\n'
    + '- `tk_explore` with the **exact symbol names** you are after '
    + '(class / function / method names), or\n'
    + '- `tk_search <name>` for one specific symbol'
    + dirLine
    + '\n\nDo not assume the list above is comprehensive.';
}
```

**具体数值**：触发条件 `confTerms.length >= 2 && !anyStrong`；词长阈值 len≥3；单关键词/symbol 查询豁免。

**有序步骤**：(1) 落 `LOW_CONFIDENCE_MARKER` + footer。(2) context builder 算 `confTerms`/`anyStrong`，弱则置 `confidence='low'` 并附 footer。(3) MCP 层检测该 sentinel，抑制矛盾的「this is comprehensive」small-repo footer。

**测试**：`markers.test.ts` — 2 词常用词查询无强匹配 → 含 `### ⚠️ Low-confidence match` 且 `confidence==='low'`；单关键词查询 → 无 marker。

**证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:285-306, 914-931；context/markers.ts:19。

---

### G13 — 每片 source 加行号（cat -n），默认 ON（`TK_EXPLORE_LINENUMS=0` 关）　(serves both surfaces)

**决策**：每片 shipped source 用 `<num>\t<code>` 加行号，使 agent 直接从 payload 引用 `file:line` 而非为找行号再 Read。**省 agent 残余 Read（B）+ 给人/协作精确引用（信任）**。

**要动的文件**：`src/codemap/economy/lineNumbers.ts`（新建）；`flags.ts`（`exploreLineNumbersEnabled()`）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:299-306；verbatim）：

```ts
function numberSourceLines(slice: string, firstLineNumber: number): string {
  const out: string[] = [];
  const split = slice.split('\n');
  for (let i = 0; i < split.length; i++) {
    out.push(`${firstLineNumber + i}\t${split[i]}`);
  }
  return out.join('\n');
}
```

**具体数值**：分隔符 `\t`；起始行号 1-based；kill-switch `TK_EXPLORE_LINENUMS=0`（默认 ON）。

**有序步骤**：(1) 落 `numberSourceLines` + `exploreLineNumbersEnabled()`。(2) G3 whole-file 与聚簇出块处套用。

**测试**：`lineNumbers.test.ts` — `numberSourceLines("a\nb", 5) === "5\ta\n6\tb"`；`TK_EXPLORE_LINENUMS=0` 时块无行号前缀。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:260-306。

---

### G14 — VERBATIM-SOURCE 信任 banner + 每文件 STALENESS banner　(serves both surfaces)

**决策**：Source 段以明确承诺开头：代码是本次重读的当前磁盘源、带行号、与 Read 字节相同 —— 「Treat each block as a Read you have already performed: do not Read a file shown here.」若 watcher 对某引用文件有 pending 事件，告诉 agent 单独 Read **那个**文件，同时声明其余 fresh（诚实地按文件 scope 失效 = lossless-recovery 不变式，绑定 J8/J9）。

**要动的文件**：`src/codemap/economy/markers.ts`（verbatim banner + stale banner）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/mcp/tools.ts:2476；verbatim）：

```ts
lines.push('> The code below is the **verbatim, current on-disk source** of these files — re-read from disk on this call and line-numbered, byte-for-byte identical to what the Read tool returns. It is NOT a summary, outline, or stale cache. Treat each block as a Read you have already performed: do not Read a file shown here.');
```

**具体数值**：banner 为每个 Source 段首固定一行；stale banner 仅在 E 的 lazy mtime-sweep 检出某引用文件 mtime 偏离时按文件追加（绑定 E1 lazy-on-read，非默认 watcher）。

**有序步骤**：(1) 落 `verbatimSourceBanner()` 与 `formatStaleBanner(staleFiles)`。(2) explore Source 段首注入 banner；E 的 lazy 检查回传 stale 列表 → 仅对这些文件出 stale banner。

**测试**：`markers.test.ts` — banner 含 `verbatim, current on-disk source` 与 `do not Read a file shown here`；给定 1 个 stale 文件 → 仅该文件出 stale 行，其余声明 fresh。

**证据回指**：/tmp/tk-research/codegraph/src/mcp/tools.ts:2476, 314-365；DEP MAP E↔J 解决（lazy 驱动 banner）。

---

### G15 — NOISE-SUPPRESSION caps（预算花在答案上）　(serves the codemap agent surface)

**决策**：per-file diversity cap `maxPerFile = max(5, ceil(maxNodes*0.2))`；非生产文件 cap `max(3, ceil(maxNodes*0.15))`（除非查询提到 test/spec）；生成文件（.pb.go/.pulsar.go/mocks）排最后且从 Related Symbols 剔除；imports/exports 不入默认节点 kind、解析到其定义。

**要动的文件**：`src/codemap/economy/noise.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/context/index.ts:1067, 1100；verbatim）：

```ts
const maxPerFile = Math.max(5, Math.ceil(opts.maxNodes * 0.2));
// if (nodeIds.length <= maxPerFile) continue; else drop nodeIds.slice(maxPerFile)
const maxNonProd = Math.max(3, Math.ceil(opts.maxNodes * 0.15));
// if (nonProdIds.length > maxNonProd) drop nonProdIds.slice(maxNonProd)
```

**HIGH_VALUE_NODE_KINDS 排除 import/export**（源: /tmp/tk-research/codegraph/src/context/index.ts:159-173，verbatim 注释「Imports/exports are excluded because they have near-zero information density」+ `nodeKinds: HIGH_VALUE_NODE_KINDS // Filter out imports/exports by default`）。

**具体数值**：`maxPerFile = max(5, ceil(maxNodes*0.2))`；`maxNonProd = max(3, ceil(maxNodes*0.15))`；`maxNodes` 默认 20（见 G16）→ 实际 maxPerFile=5、maxNonProd=3。

**有序步骤**：(1) 落 `noise.ts` 的 per-file/non-prod 截断与 generated 排序。(2) context/explore 节点选择后套用。

**测试**：`noise.test.ts` — 一文件 10 节点（maxNodes=20）→ 留 5；6 个 test Guard 类（查询未提 test）→ 留 3；imports 不入默认结果。

**证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:1062-1115, 159-174。

---

### G16 — 非 explore 路径的默认节点/块预算　(serves the codemap agent surface)

**决策**：always-loaded 的非 explore context 路径用保守默认：`maxNodes 20 / maxCodeBlocks 5 / maxCodeBlockSize 1500 / searchLimit 3 / traversalDepth 1 / minScore 0.3`。explore（G1–G7）才是更富的一答路径。

**要动的文件**：`src/codemap/economy/defaults.ts`（新建）。

**可抄代码**（源: /tmp/tk-research/codegraph/src/context/index.ts:143-152；verbatim）：

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
```

**具体数值**：20 / 5 / 1500 / 3 / 1 / 0.3。

**有序步骤**：(1) 落 `DEFAULT_BUILD_OPTIONS`。(2) `tk_node`(context) handler 以它为基，调用方可覆盖。

**测试**：`defaults.test.ts` — 不传 options 的 `buildContext` 返回 `≤20` 节点、`≤5` 块、每块 `≤1500` 字符。

**证据回指**：/tmp/tk-research/codegraph/src/context/index.ts:143-152。

---

### 整层有序落地（跨决策，每步独立可发布可测）

1. **economy/budget.ts + flags.ts**（G1/G2/G10 + kill-switch 读取）→ 测 `budget.test.ts`（含 inline-cap 不变式 + 单调性 + call-count）。**可独立发布**：仅常量与纯函数。
2. **economy/lineNumbers.ts + markers.ts**（G11/G12/G13/G14）→ 测 `lineNumbers.test.ts`/`markers.test.ts`。**可独立发布**：纯字符串/格式化。
3. **economy/noise.ts + defaults.ts**（G15/G16）→ 测 `noise.test.ts`/`defaults.test.ts`。
4. **economy/wholeFile.ts + cluster.ts**（G3/G7）→ 测 byte-identical / envelope-drop。依赖步 1（budget）+步 2（lineNumbers）。
5. **economy/skeletonize.ts**（G4/G5/G6）→ 测 inert + spare + spine-windowing。依赖步 1–4 + A/C 的边访问 API（`getEdgesFrom/getEdgesTo` 对齐后）。
6. **mcp/tools.ts 装配**（F 绑定：`tk_explore.maxOutputChars` import G1 常量；G8 `include_content`；G9 `summaryOnly`）→ 端到端 fixture 测。
7. **K A/B harness 接线**：`TK_ADAPTIVE_EXPLORE` / `TK_EXPLORE_LINENUMS` 双用作 A/B 开关（empty/0 = WITHOUT 臂），由 K 在 Claude Code headless 实测 uncached delta（绑定 K 冲突解决：measured 臂在 SECONDARY host）。

每步的 kill-switch 默认值与 A/B 语义：`TK_ADAPTIVE_EXPLORE`（默认 ON，`=0` 退回全源 → G4–G6 inert）、`TK_EXPLORE_LINENUMS`（默认 ON，`=0` 去行号）。

---

### Open Decisions（不阻塞 Required capability）

1. **char vs token 单位**：现按 char 档 13000/18000/24000 发（可移植代理）；是否在 K 的 harness 实测 VS Code Copilot/Windows 真实 inline-result cap 后再把天花板改写成 token（~6K 级），由用户在 K Track-1 测完后定。char-now / tokens-after-measurement 已是 DEP MAP 的协调结论。
2. **~28% 与 "provably inert byte-identical" 是 codegraph 自报数**：tk 对外宣称前须在 tk A/B harness 对 VS Code Copilot/Windows 复测（用户原则「tk 用实测不用估算/移植数」）。
3. **`MIN_SIBLINGS=3` 与 `bodyCap=maxCharsPerFile*1.5`** 是 codegraph 调出的常量，在 tk 的 uncached-token 分母下是否最优未验证 → 列为 K 测量 runner 的 sweep 参数。
4. ~~**kill-switch 暴露面**：`TK_ADAPTIVE_EXPLORE`/`TK_EXPLORE_LINENUMS` 是文档化用户 config 还是仅 harness-only env flag。~~ ✅ **闭合（D30③）**：= **文档化用户配置**（非仅 harness env flag）。


---

