# 附录 A2:gitnexus 全量可抄清单(2026-06-20 追加,全部 `[非分发安全]`)

> gitnexus = PolyForm-NC,自用放宽下可抄;每段已标 `[非分发安全]`,供将来若分发时重写。按子系统组织,各自标明喂哪个 tk 需求 + node:sqlite 适配。

### gitnexus · call-graph resolution engine（调用图解析引擎）

**服务 tk 需求：A（人理解+协作：调用关系是"谁调用我/我调用谁"的底座）、D（agent find-code/省 token：从 caller 一跳到 callee 定义，免去全文 grep）。**

这是整套引擎里最难的部分。一个关键事实先摆出来：**老的"call-resolution DAG"（per-file 类型推断→receiver 推断→dispatch→MRO walk）已在 RING4-1（#942）整体删除**，`call-processor.ts` 现在只剩框架路由（Laravel/Next.js）的边发射，**不再是调用解析主路径**（源：`call-processor.ts:1-16` [非分发安全]）。真正的调用解析已统一进 `scope-resolution/` 的 registry-primary 流水线。tk 要抄的是后者。

---

#### 1. 解析总骨架（一次调用如何落成一条边）

数据流（源：`scope-resolution/pipeline/run.ts:1-24` [非分发安全]）：

```
ParsedFile[]  →(finalizeScopeModel)→  ScopeResolutionIndexes
              →(resolveReferenceSites)→  ReferenceIndex
              →(emit, 顺序 load-bearing)→  KnowledgeGraph edges
```

发射顺序是**契约不变量 I1**，错了语义就变（源：`run.ts:701-755`）：

1. `emitReceiverBoundCalls`（**先** —— 方法调用经类型路由，最精确）
2. `emitFreeCallFallback`（**再** —— 自由函数调用、跨文件 import）
3. `emitReferencesViaLookup`（**最后** —— 通用兜底，用前两步填好的 `handledSites` 跳过已处理点位）
4. `emitImportEdges`

每个 reference site 走"挑 registry → `lookup` → 取 top-ranked → 折成一条边"。核心 100% 在 `resolveReferenceSites`（源：`resolve-references.ts:90-161` [非分发安全]）：

```ts
for (const site of scopes.referenceSites) {
  const resolutions = lookupForSite(site, classRegistry, methodRegistry, fieldRegistry, macroRegistry);
  if (resolutions.length === 0) { unresolved++; continue; }
  const top = resolutions[0]!;          // RFC §4.3 "one-shot answer"：只取最优 1 个，不 fan-out
  const ref = buildReference(site, top); // 携带 confidence + evidence
  // bin by source scope ...
}
```

site.kind → registry 的分派表（源：`resolve-references.ts:190-238` [非分发安全]）：

| site.kind | 主 registry | 兜底 |
|---|---|---|
| `call` | MethodRegistry（带 arity + explicitReceiver） | — |
| `inherits` / `type-reference` | ClassRegistry | — |
| `read` / `write` | FieldRegistry | → Method → Class（`cb = save` 这种裸名也能解析） |
| `import-use` | Class → Method → Field 逐级试 | 第一个非空胜出 |
| `macro` | MacroRegistry（macro 与 function 是不相交命名空间，防假 CALLS 边） | — |

`buildReference` 把 site + top resolution 折成 `Reference{fromScope, toDef, atRange, kind, confidence, evidence}`（源：`resolve-references.ts:241-250`）。

---

#### 2. 解析算法核心 —— `lookupCore` 的 7 步（最值得抄的一段）

所有 registry（Class/Method/Field）都 dispatch 进同一个纯函数 `lookupCore`，差别只在传入的 `LookupParams`，**不是每种 kind 一套算法**。这正是 tk 想要的"一套解析器服务所有边类型"。

7 步算法（源：`gitnexus-shared/src/scope-resolution/registries/lookup-core.ts:101-146` [非分发安全]）：

```ts
export function lookupCore(name, startScope, params, ctx): readonly Resolution[] {
  const acceptedKinds = new Set<NodeLabel>(params.acceptedKinds);
  const perCandidate = new Map<DefId, CandidateState>();

  // Step 1: 词法作用域链向上走（hard shadow：本层一旦命中就停，不看外层）
  const lexicalShadowed = walkLexicalChain(name, startScope, acceptedKinds, ctx, perCandidate);

  // Step 2: 类型绑定 / MRO walk（方法/字段调用的主证据路径）
  if (params.useReceiverTypeBinding && ctx.methodDispatch !== undefined) {
    walkReceiverTypeBinding(name, startScope, acceptedKinds, params, ctx, perCandidate);
  }

  // Step 3: owner-scoped contributor（直接声明在 receiver 上的成员）
  if (params.ownerScopedContributor !== null) {
    seedFromOwnerScopedContributor(name, params.ownerScopedContributor, acceptedKinds, perCandidate);
  }

  // Step 4: kind-match 证据（在 composeEvidence 里加，weight 0，仅供调试）

  // Step 5: arity 过滤（有 compatible 就 drop incompatible；全 incompatible 则清空 = 拒绝假边）
  if (params.callsite !== undefined) applyArityFilter(params.callsite, perCandidate, ctx);

  // Step 6: 全局兜底（仅当 Step1-3 全空 且 name 含 '.'）→ lookupQualified
  if (perCandidate.size === 0 && !lexicalShadowed && name.includes('.')) {
    const globals = lookupQualified(name, { acceptedKinds: params.acceptedKinds }, ctx);
    if (globals.length > 0) return globals;
  }
  if (perCandidate.size === 0) return EMPTY;

  // Step 7: 组证据 + 算 confidence + tie-break 排序
  return rankCandidates(perCandidate);
}
```

**Step 1 词法链 + hard shadow**（源：`lookup-core.ts:195-227` [非分发安全]）：从 startScope 沿 `scope.parent` 向上，每层查 `scope.bindings.get(name)`；只要本层有任意 binding（即便 kind 不匹配）就 `return true` 停止 —— 名字在此被词法绑定，外层不再看。带 `visited` 防环。这是 tk 解析"同名遮蔽"的关键：局部变量遮蔽同名全局函数。

**Step 2 receiver 类型绑定 → MRO walk**（这是"method-call routing through types"的核心，源：`lookup-core.ts:249-332` [非分发安全]）：
- `resolveReceiverOwner`：显式 receiver（`user.save()` 里的 `user`）查 callsite scope 的 `typeBindings`；隐式 receiver 试 `self` / `this`（`IMPLICIT_RECEIVERS = ['self','this']`）。
- `lookupReceiverType`：沿 scope chain 找 `typeBindings.get(receiverName)` → 拿 `typeRef.rawName` → `qualifiedNames.get(rawName)`；**只有恰好 1 个候选才认**（≥2 歧义或 0 缺失都返回 undefined，不做朴素同名 fallback —— 宁缺毋滥）。
- 拿到 ownerDefId 后：`walk = [ownerDefId, ...methodDispatch.mroFor(ownerDefId)]`，逐层 `ownedMembersByOwner(owner, name)` 取成员，记 `mroDepth`（深度越浅证据越强）。

**Step 5 arity 过滤**（源：`lookup-core.ts:397-444` [非分发安全]）：`anyCompatible` 则 drop 全部 incompatible；**全 incompatible 且无 unknown** 则清空所有候选（`f(int $req, ...$rest)` 用 0 参调用 = 真 arity-broken，发边就是假阳性）；有 unknown 则保留靠权重排。

**Step 6 全局限定名兜底**（源：`lookup-qualified.ts:37-69` [非分发安全]）：直接查 `qualifiedNames.get(qualifiedName)`，按 kind 过滤，每个候选给同一 base confidence（`globalQualified`），再 tie-break。无 receiver 解析、无 scope walk。

---

#### 3. 置信度模型（confidence —— tk edges.provenance/confidence 的直接来源）

证据**加性**组合，sum 在 `[0,1]` clamp（源：`evidence.ts:145-151` [非分发安全]）。权威权重表（源：`gitnexus-shared/src/scope-resolution/evidence-weights.ts:18-83` [非分发安全]）：

```ts
export const EvidenceWeights = {
  // where-found（可见性 origin）
  local: 0.55, import: 0.45, reexport: 0.4, namespace: 0.4, wildcard: 0.3,
  // scope-chain 每跳扣分
  scopeChainPerDepth: -0.02,
  // receiver 类型绑定，按 MRO 深度衰减（直接类 idx0，1 跳父类 idx1 ...，超表取末值）
  typeBindingByMroDepth: [0.5, 0.42, 0.36, 0.32, 0.3] as const,
  // 佐证
  ownerMatch: 0.2, kindMatch: 0.0,
  // arity
  arityMatchCompatible: 0.1, arityMatchUnknown: 0.0, arityMatchIncompatible: -0.15,
  // 全局兜底
  globalQualified: 0.35, globalName: 0.1,
  // 降级信号
  dynamicImportUnresolved: 0.02,
  // 未解析 import 的乘性 cap（只压 import/wildcard/reexport/namespace 那一条证据）
  unlinkedImportMultiplier: 0.5,
} as const;
```

直觉读法：**本地定义命中 0.55 起，跨 import 0.45，wildcard import 0.3；方法经类型绑定命中直接类 0.5（每往父类走一层衰减）；owner 精确匹配 +0.2；arity 对得上 +0.1，对不上 −0.15。** 一个典型"局部方法调用经类型解析 + owner 匹配 + arity 对"的边 ≈ `0.5+0.2+0.1 = 0.8`，clamp 后封顶 1.0。

`composeEvidence` 把 raw signals 翻成证据列表（源：`evidence.ts:62-139` [非分发安全]）；`getOriginWeight` 做 origin→weight 映射（源：`evidence.ts:155-177`）。

歧义时的 tie-break 级联（源：`tie-breaks.ts:46-70` + `origin-priority.ts` [非分发安全]）：

```
1. confidence DESC（|Δ| < CONFIDENCE_EPSILON=0.001 视为相等）
2. scope depth ASC（更近的词法作用域胜）
3. MRO depth ASC（继承链更近的类胜）
4. ORIGIN_PRIORITY ASC（local=0 > import=1 > reexport=2 > namespace=3 > wildcard=4 > global-qualified=5 > global-name=6）
5. DefId.localeCompare（最终确定性兜底）
```

---

#### 4. 边发射 + provenance/confidence 写入（tk 最关心的落点）

`Reference.kind` → 边类型映射（源：`graph-bridge/edges.ts:29-52` [非分发安全]）：

```ts
case 'call'           → 'CALLS'
case 'read'/'write'   → 'ACCESSES'
case 'inherits'       → 'EXTENDS'
case 'type-reference' → 'USES'
case 'macro'          → 'USES'   // macro 解析到 Macro 节点，不进 CALLS 键空间
case 'import-use'     → undefined // 不发边，provenance 在 IMPORTS 边上
```

通用发射循环（源：`references-to-edges.ts:37-99` [非分发安全]）—— 注意 dedup key 与 reason 格式正是 tk `edges.provenance` 该存的东西：

```ts
const dedupKey = `${edgeType}:${callerGraphId}->${targetGraphId}:${ref.atRange.startLine}:${ref.atRange.startCol}`;
if (seen.has(dedupKey)) continue;
seen.add(dedupKey);
graph.addRelationship({
  id: `rel:${dedupKey}`,
  sourceId: callerGraphId, targetId: targetGraphId, type: edgeType,
  confidence: ref.confidence,                      // ← 直接来自 lookupCore 的 7 步证据和
  reason: `scope-resolution: ${ref.kind}`,         // ← provenance 文本
});
```

`tryEmitEdge` 的关键约定（源：`edges.ts:63-108` [非分发安全]）：默认 `confidence = 0.85`；CALLS 边可在 provider opt-in 时 collapse 到 `(caller,target)` 粒度（一对 caller/callee 只一条边），而 read/write ACCESSES 保持 per-site（同字段不同行的多次写 = 多条边）。

**结论：tk 的 `edges` 表每条边写 3 个字段即可完整复刻 gitnexus 语义：`kind`（CALLS/ACCESSES/EXTENDS/USES）、`provenance`（= reason，如 `scope-resolution: call` 或 `laravel-route`）、`confidence`（= 7 步证据和，0..1）。**

---

#### 5. tk 把每条解析后的调用映射进 edges 的 node:sqlite 适配

tk schema：`nodes(kind, file_path, start_line, ...)` + `edges(kind, src, dst, provenance, confidence)`。gitnexus 用 Kuzu/Cypher 做 MRO walk 和 caller/callee 链查；tk 用 `node:sqlite` 的 WITH RECURSIVE CTE。

**(a) 写一条解析后的 CALLS 边**（对应 `addRelationship`）：

```sql
INSERT OR IGNORE INTO edges(kind, src, dst, provenance, confidence)
VALUES ('calls', :caller_node_id, :callee_node_id,
        'scope-resolution: call', :confidence);
-- dedup：在 edges 上建唯一索引复刻 gitnexus dedupKey
CREATE UNIQUE INDEX IF NOT EXISTS ux_edges_site
  ON edges(kind, src, dst, /* site 行列编入 provenance 或单列 */ provenance);
```

**(b) MRO walk —— Step 2 的"沿继承链找成员定义"，CTE over EXTENDS 边**（复刻 `methodDispatch.mroFor` + `ownedMembersByOwner`）：

```sql
-- 给定 receiver 类型节点 :owner_id，按 MRO 深度展开祖先链，
-- 在每层找名为 :member 的方法/字段定义，深度越浅 confidence 越高。
WITH RECURSIVE mro(owner, depth) AS (
  SELECT :owner_id, 0
  UNION
  SELECT e.dst, m.depth + 1
  FROM mro m
  JOIN edges e ON e.src = m.owner AND e.kind = 'extends'
  WHERE m.depth < 16                      -- 深度上限，防环/防超深继承
)
SELECT n.id AS target_def, mro.depth,
       -- 复刻 typeBindingByMroDepth=[0.5,0.42,0.36,0.32,0.3]，超表取 0.3
       CASE mro.depth WHEN 0 THEN 0.5 WHEN 1 THEN 0.42 WHEN 2 THEN 0.36
                      WHEN 3 THEN 0.32 ELSE 0.3 END AS type_binding_weight
FROM mro
JOIN edges own ON own.src = mro.owner AND own.kind = 'owns'  -- 类→成员的 owns 边
JOIN nodes n   ON n.id = own.dst
WHERE n.name = :member AND n.kind IN ('method','function','field')
ORDER BY mro.depth ASC      -- tie-break：MRO depth ASC
LIMIT 1;                    -- one-shot answer：只取最浅
```

**(c) 词法链 hard shadow —— Step 1**（tk 在索引期已把 binding 物化进 `nodes`/scope 表，则裸名解析可纯 SQL）：

```sql
-- 沿 scope 链向上找第一个绑定了 :name 的作用域（hard shadow：第一个命中即停）
WITH RECURSIVE chain(scope_id, depth) AS (
  SELECT :start_scope, 0
  UNION ALL
  SELECT s.parent_id, c.depth + 1
  FROM chain c JOIN scopes s ON s.id = c.scope_id
  WHERE s.parent_id IS NOT NULL AND c.depth < 64
)
SELECT b.def_node_id, c.depth,
       (0.55 + (-0.02) * c.depth) AS local_confidence   -- local 0.55，每跳 scopeChainPerDepth -0.02
FROM chain c
JOIN bindings b ON b.scope_id = c.scope_id AND b.name = :name
ORDER BY c.depth ASC
LIMIT 1;     -- 最浅作用域命中即 hard shadow
```

**(d) caller→callee 一跳查（D 需求：agent 找定义免 grep）**：

```sql
SELECT n.file_path, n.start_line, e.confidence, e.provenance
FROM edges e JOIN nodes n ON n.id = e.dst
WHERE e.src = :caller_id AND e.kind = 'calls'
ORDER BY e.confidence DESC;
```

**(e) 全局限定名兜底 —— Step 6**（复刻 `lookupQualified`）：

```sql
SELECT id FROM nodes
WHERE qualified_name = :qname AND kind IN (/* acceptedKinds */)
-- 命中给 globalQualified=0.35；多个则按 (origin=global-qualified 优先级5, id) tie-break
ORDER BY id LIMIT 1;
```

---

#### 6. tk 落点（每个核心变成 tk 的哪个文件 / MCP-tool）

| gitnexus 文件:行 | tk target | 关键函数 / 内容 |
|---|---|---|
| `lookup-core.ts:101-146` | `src/codemap/resolve/lookup-core.ts` | `lookupCore` 7 步骨架（纯函数，整体可抄） |
| `lookup-core.ts:195-227` | 同上 | `walkLexicalChain` + hard shadow（Step 1） |
| `lookup-core.ts:249-332` | 同上 | `walkReceiverTypeBinding`/`lookupReceiverType`（Step 2 类型路由，method-call 核心） |
| `lookup-core.ts:397-444` | 同上 | `applyArityFilter`（Step 5，全 incompatible 清空 = 拒假边） |
| `evidence-weights.ts:18-95` | `src/codemap/resolve/weights.ts` | `EvidenceWeights` 常量 + `typeBindingWeightAtDepth`（整段抄，校准值勿改） |
| `evidence.ts:62-177` | `src/codemap/resolve/evidence.ts` | `composeEvidence`/`confidenceFromEvidence`/`getOriginWeight` → 写 edges.confidence |
| `tie-breaks.ts:46-77` + `origin-priority.ts` | `src/codemap/resolve/tie-breaks.ts` | `compareByConfidenceWithTiebreaks` + `ORIGIN_PRIORITY` + `CONFIDENCE_EPSILON=0.001` |
| `lookup-qualified.ts:37-69` | `src/codemap/resolve/lookup-qualified.ts` | `lookupQualified`（Step 6 全局兜底） |
| `resolve-references.ts:90-238` | `src/codemap/resolve/resolve-references.ts` | `resolveReferenceSites` + `lookupForSite` 分派表（site.kind→registry） |
| `graph-bridge/edges.ts:29-108` | `src/codemap/emit/edges.ts` | `mapReferenceKindToEdgeType` + `tryEmitEdge`（写 edges.kind/provenance/confidence，含 dedup key） |
| `references-to-edges.ts:37-99` | `src/codemap/emit/references-to-edges.ts` | `emitReferencesViaLookup`（通用发射循环 + dedup） |
| `passes/mro.ts:39-110` | `src/codemap/resolve/mro.ts` | `buildMro` + `defaultLinearize`（BFS first-seen；tk 单继承用 SQL CTE 替代，多继承再抄此 C3 兜底） |
| `passes/receiver-bound-calls.ts:1-38` | `src/codemap/emit/receiver-bound-calls.ts` | 7-case dispatcher 的**契约文档 I4/I5**（case 顺序 load-bearing，先 super→compound→namespace→class-name→dotted→chain→simple→value-receiver） |
| `pipeline/run.ts:701-755` | `src/codemap/build/run.ts` | 发射顺序 I1（receiver-bound → free-call → references → imports） |
| `call-routing.ts:66-137` | `src/codemap/extract/call-routing.ts`（仅 Ruby/动态语言时） | `routeRubyCall`：import/properties/skip/call 分类（含 1024 长度 cap + 控制字符拒绝） |

---

#### 7. gitnexus 用到的具体数值（caps / depths / 阈值）

- **confidence epsilon**：`CONFIDENCE_EPSILON = 0.001`（`tie-breaks.ts:26`）—— Δ 小于此视为平手走 tie-break。
- **MRO 深度衰减表**：`[0.5, 0.42, 0.36, 0.32, 0.3]`，超 5 层取末值 0.3（`evidence-weights.ts`）。
- **scope-chain 每跳扣分**：`-0.02`。
- **未解析 import 乘性 cap**：`0.5×`（只压 import 那条证据，owner-match/arity/type-binding 不压）。
- **dynamic-unresolved 降级**：`0.02`。
- **框架路由边 confidence**：`ROUTE_EDGE_CONFIDENCE = 0.5`；猜测方法兜底 `×0.8 = 0.4`（`call-processor.ts:82,226`）。下游 gate：`MIN_TRACE_CONFIDENCE` / `MIN_CONFIDENCE_LARGE` 均 `0.5`，0.5 恰好通过，0.4 被排除。
- **Next.js FETCHES 边 confidence**：`0.9`（`call-processor.ts:441`）。
- **tryEmitEdge 默认 confidence**：`0.85`（`edges.ts:75`）。
- **inherits/structural-implements 边 confidence**：`0.85`（`run.ts:114,243`）。
- **Ruby import path cap**：`length > 1024` 或含控制字符 `[\x00-\x1f]` → skip（`call-routing.ts:76`）。
- **MAX_EXPORTS_PER_FILE = 500**，**MAX_TYPE_NAME_LENGTH = 256**（`call-processor.ts:27-28`）。
- **typeAsReceiverHeuristic**：JVM/C# 才开 —— receiver 首字母大写且无 TypeEnv 绑定时当类型名（`Type.method()` / `User::getName`，`call-types.ts:30-34,79`）。

---

#### 8. tk 简化建议（不要照搬全部）

gitnexus 7-case receiver dispatcher（compound chain、namespace prefix、value-receiver bridge）和 overload-narrowing（526 行 C++ 模板约束/转换排名）是为多语言+C++ 重型场景准备的，**tk 当前产品范围内必需的解析能力只取 Step 1（词法 hard shadow）+ Step 2（简单 typeBinding → MRO walk via SQL CTE）+ Step 6（限定名）+ 加性 confidence + tie-break**，即可覆盖 TS/JS/Python 绝大多数 caller/callee。compound-receiver / overload-narrowing / ADL 等在当前产品范围外。

---

### gitnexus · control-flow + dataflow（CFG / reaching-defs / post-dom / control-dependence）

#### 服务 tk 的需求

- **A（人理解+协作）**：CFG（`seq/cond-true/loop-back/break/throw/...`）+ CDG（控制依赖，`T/F` 分支语义）让 tk 能回答"这个块为什么执行""哪个条件决定了它"，是函数内部结构的人类可读骨架。
- **G（agent 找代码 / 精确爆炸半径）**：REACHING_DEF（到达定义，def→use）把"改了变量 X 会影响哪些读取点"从文件级粗粒度收紧到**语句级、函数内精确**——这是 tk 现有 `edges(kind,src,dst)` 图最缺的精度层。它本质就是一张 def→use 边表，直接落进 tk 的 `edges`。
- **J（taint-ish / 安全味查询）**：gitnexus 的 `SiteRecord`（call/new/member-read + sanitizer interposition）+ reaching-defs 是 taint 引擎的底座。tk 可只抄 reaching-defs 这层（不抄完整 taint），就能支撑"用户输入是否未经清洗到达某 sink"的近似查询。

> **诚实定位（Required capability; its runtime dependency is Optional at runtime）**：这是 gitnexus 里**最重的子系统**。它要求 (1) 每函数先建 CFG（基本块切分 + 边）、(2) 每语句采集 def/use/site facts、(3) 跑 post-dominator + dominance-frontier + 到达定义定点/SSA。代价是 per-function 的 CPU/堆尖峰（O(defs×uses) facts，2000 行函数可达 10 万+ fact 对象）。**tk 应把整个 dataflow 层做成 `--pdg`/`tk index --dataflow` 显式开关**，默认只建 codemap 已有的 symbol/call/import 边；dataflow 边作为可选 `provenance='dataflow'` 增量层。gitnexus 自己也是这么做的：`默认 --pdg off 的 run 与 pre-#2081 字节一致`（emit.ts 模块头）。

---

#### 1) CFG 构建（accumulator 模式）

核心思路：一个**语言无关的累加器** `CfgBuilder` + 一个**每语言的 `CfgVisitor`**。Visitor 走 AST、建块、连边；Builder 拥有合成 ENTRY(0)/EXIT、去重边、限深。tk 用 tree-sitter 已能拿到 AST，照搬这个分层即可。

可抄代码（边去重 + 合成 ENTRY/EXIT + 深度护栏）。源: `src/core/ingestion/cfg/cfg-builder.ts:73-189` [非分发安全]

```ts
export const MAX_CFG_NESTING_DEPTH = 500; // 实际词法上限 ~250（block 体经 visitBody+visitSeq 两次入栈）

export class CfgBuilder {
  private readonly blocks: MutableBlock[] = [];
  private readonly edges: CfgEdgeData[] = [];
  private readonly edgeKeys = new Set<string>();
  private nesting = 0;
  readonly entryIndex: number;
  readonly exitIndex: number;

  constructor(filePath, functionStartLine, functionEndLine, functionStartColumn = 0) {
    this.entryIndex = this.newBlock(functionStartLine, functionStartLine, '', 'entry');
    this.exitIndex = this.newBlock(functionEndLine, functionEndLine, '', 'exit');
  }

  /** Add a single edge (idempotent on from+to+kind). */
  edge(from: number, to: number, kind: CfgEdgeKind): void {
    const key = `${from}->${to}:${kind}`;
    if (this.edgeKeys.has(key)) return;     // 去重：重复 connect 幂等
    this.edgeKeys.add(key);
    this.edges.push({ from, to, kind });
  }

  /** Wire a set of dangling exits to a single target block with one kind. */
  connect(exits: readonly number[], to: number, kind: CfgEdgeKind = 'seq'): void {
    for (const from of exits) this.edge(from, to, kind);
  }

  withNesting<T>(fn: () => T): T {            // 唯一限深 choke point
    this.enterNesting();
    try { return fn(); } finally { this.exitNesting(); }
  }
  enterNesting(): void {
    if (++this.nesting > MAX_CFG_NESTING_DEPTH) throw new CfgNestingDepthError(MAX_CFG_NESTING_DEPTH);
  }
}
```

CFG 边的 13 种 kind（这就是 tk CFG 边的 `reason`/子类型枚举）。源: `src/core/ingestion/cfg/types.ts:190-203` [非分发安全]

```ts
export type CfgEdgeKind =
  | 'seq' | 'cond-true' | 'cond-false' | 'loop-back'
  | 'break' | 'continue' | 'return' | 'throw'
  | 'switch-case' | 'fallthrough'
  | 'finally-return' | 'finally-break' | 'finally-continue';
```

**`collectFunctionCfgs` 的护栏（tk 直接照搬这两个 cap）**。源: `src/core/ingestion/cfg/collect.ts:26,86-127` [非分发安全]

```ts
export const DEFAULT_PDG_MAX_FUNCTION_LINES = 2000;  // 超此行数的函数（多为压缩/生成代码）直接跳过、计数
// 每函数 build 用 try/catch 隔离：一个函数抛 CfgNestingDepthError/任意错误，只计 skipped，不连累全文件
```

**tk 落点**：`src/codemap/cfg/builder.ts`（`CfgBuilder`）+ `src/codemap/cfg/visitor-ts.ts`（tree-sitter TS/JS visitor，gitnexus 在 `cfg/visitors/typescript.ts`，755 行，本次未细读 → 需实现时补）。CFG 块落 `nodes(kind='basic_block', file_path, start_line, end_line)`，CFG 边落 `edges(kind='cfg', src, dst, provenance=<edgeKind>)`。

---

#### 2) 到达定义（reaching definitions）= def→use 边（G/J 的核心）

这是**最值得抄进 tk 的算法**：把"变量在哪定义、在哪被读"精确连起来。gitnexus 把它拆成可替换的几段：harvest（采 GEN）→ adjacency（前驱/后继，throw-aware）→ IN-set 求解器（dense 定点 / SSA-sparse，二选一）→ sweep（物化 def→use facts）。tk 的 Required 基线**只需 dense 定点 + sweep**（SSA 是性能优化，Outside current product scope）。

**(a) per-block GEN 采集**（MUST def 杀、MAY def 只加）。源: `src/core/ingestion/cfg/reaching-defs.ts:347-384` [非分发安全]

```ts
function harvestStatementFacts(blocks, n): Harvest {
  const gen: (Map<number, GenEntry> | null)[] = new Array(n).fill(null);
  const allDefsGen: (Lattice | null)[] = new Array(n).fill(null);
  const defLine = new Map<number, number>();
  let defCount = 0, useCount = 0;
  for (const b of blocks) {
    const stmts = b.statements; if (!stmts || stmts.length === 0) continue;
    let g = null, all = null;
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      useCount += s.uses.length;
      const key = defKey(b.index, i);
      const record = (d, kills) => {
        defCount += 1; defLine.set(key, s.line);
        if (!g) g = new Map();
        const entry = g.get(d);
        if (kills || !entry) g.set(d, { set: new Set([key]), kills: kills || (entry?.kills ?? false) });
        else entry.set.add(key);          // may-def 累加，绝不清空
        if (!all) all = new Map();
        const allSet = all.get(d); if (allSet) allSet.add(key); else all.set(d, new Set([key]));
      };
      if (s.mayDefs) for (const d of s.mayDefs) record(d, false);  // 条件求值的 def（a && (x=v)、三元臂）→ 只加不杀
      for (const d of s.defs) record(d, true);
    }
    gen[b.index] = g; allDefsGen[b.index] = all;
  }
  return { gen, allDefsGen, defLine, defCount, useCount };
}
```

**(b) dense GEN/KILL worklist 求解器**（tk 用这个作为 Required 基线；RPO 迭代、单前驱别名零分配）。源: `src/core/ingestion/cfg/reaching-defs.ts:434-504` [非分发安全]

```ts
function computeInSetsDense(cfg, n, h, adj, limits): InSetsResult {
  const { gen, allDefsGen } = h;
  const { preds, succs, throwSuccs } = adj;
  const { order } = reversePostOrder(cfg.entryIndex, succs, n);
  const inSets: Lattice[] = new Array(n).fill(EMPTY_LATTICE);
  const outSets: Lattice[] = new Array(n).fill(EMPTY_LATTICE);
  const inWorklist = new Array(n).fill(true);
  let pending = n;
  const maxBlockVisits = limits?.maxBlockVisits && limits.maxBlockVisits > 0 ? limits.maxBlockVisits : Infinity;
  let blockVisits = 0;
  while (pending > 0) {
    for (const b of order) {
      if (!inWorklist[b]) continue;
      inWorklist[b] = false; pending -= 1;
      if (++blockVisits > maxBlockVisits) return { converged: false };  // 深嵌套定点不收敛 → sound empty
      const p = preds[b];
      const inB: Lattice = p.length === 0 ? EMPTY_LATTICE
        : p.length === 1 && !p[0].viaThrow ? outSets[p[0].from]        // 直线链零分配别名
          : mergePreds(p, inSets, outSets, allDefsGen);
      const inChanged = !latticeEquals(inSets[b], inB);
      inSets[b] = inB;
      const g = gen[b];
      let outB: Lattice;
      if (!g) outB = inB;                  // 无 gen → OUT 别名 IN
      else {
        outB = new Map(inB);               // 复制引用，绝不复制 set 内容
        for (const [bindingIdx, entry] of g) {
          if (entry.kills) outB.set(bindingIdx, entry.set);            // MUST def 整杀
          else { const incoming = inB.get(bindingIdx); outB.set(bindingIdx, incoming ? unionSets(incoming, entry.set) : entry.set); }
        }
      }
      const requeue = (s) => { if (!inWorklist[s]) { inWorklist[s] = true; pending += 1; } };
      if (!latticeEquals(outSets[b], outB)) { outSets[b] = outB; for (const s of succs[b]) requeue(s); }
      if (inChanged) for (const s of throwSuccs[b]) requeue(s);        // throw 边即使 OUT 不变也要 requeue handler
    }
  }
  return { converged: true, reachingAt: (blockIndex, binding) => inSets[blockIndex]?.get(binding) };
}
```

**(c) sweepFacts — 物化 def→use（这就是 tk 要持久化的 dataflow 边）**。源: `src/core/ingestion/cfg/reaching-defs.ts:842-937` [非分发安全]（核心循环）

```ts
function sweepFacts(blocks, reachingAt, defLine, maxFacts): { facts: DefUseFact[]; truncated: boolean } {
  const facts: DefUseFact[] = []; let truncated = false;
  const useKeys: number[] = [];
  outer: for (const b of blocks) {
    const stmts = b.statements; if (!stmts || stmts.length === 0) continue;
    const overlay = new Map<number, DefSet>();        // 块内已重定义的 binding（稀疏 overlay，不物化整块 lattice）
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      const hasSelfDefs = s.defs.length > 0 || (s.mayDefs?.length ?? 0) > 0;
      for (const u of s.uses) {
        const reaching = overlay.get(u) ?? reachingAt(b.index, u);
        const selfKey = hasSelfDefs && (s.defs.includes(u) || (s.mayDefs?.includes(u) ?? false)) ? defKey(b.index, i) : undefined;
        if (!reaching && selfKey === undefined) continue;
        useKeys.length = 0;
        if (reaching) for (const k of reaching) useKeys.push(k);
        if (selfKey !== undefined && !reaching?.has(selfKey)) useKeys.push(selfKey);
        useKeys.sort((a, b) => a - b);                // KTD6：截断前按 defKey 排序，保证两求解器截断子集字节一致
        for (const key of useKeys) {
          if (facts.length >= maxFacts) { truncated = true; break outer; }
          const defBlock = Math.floor(key / STMT_STRIDE), defStmt = key % STMT_STRIDE;
          facts.push({ bindingIdx: u,
            def: { blockIndex: defBlock, stmtIndex: defStmt, line: defLine.get(key) ?? s.line },
            use: { blockIndex: b.index, stmtIndex: i, line: s.line } });
        }
      }
      if (s.mayDefs?.length) { const key = defKey(b.index, i);
        for (const d of s.mayDefs) { const prior = overlay.get(d) ?? reachingAt(b.index, d);
          overlay.set(d, prior ? unionSets(prior, new Set([key])) : new Set([key])); } }
      if (s.defs.length > 0) for (const d of s.defs) overlay.set(d, new Set([defKey(b.index, i)])); // kill+gen
    }
  }
  facts.sort(/* def块,def语句,use块,use语句,binding */);
  return { facts, truncated };
}
```

**def-site key 打包技巧**（tk 直接抄；2^21 语句/块 × 块数 ≤ 2^32，留在 Number 2^53 内）。源: `src/core/ingestion/cfg/reaching-defs.ts:163-165` [非分发安全]

```ts
const STMT_STRIDE = 1 << 21;
const defKey = (blockIndex, stmtIndex) => blockIndex * STMT_STRIDE + stmtIndex;
```

**tk 落点**：`src/codemap/cfg/reaching-defs.ts`。每条 fact → 一条 `edges(kind='reaching_def', src=<defBlock 或 def 语句 node>, dst=<useBlock>, provenance='dataflow')`，`reason` 存 binding 名。gitnexus emit 在持久化前**去重到 (defBlock, useBlock, binding)**（语句级精度只活在内存，taint 按需重算）——tk 应同样只持久化块级去重边，避免 4000 条/函数的爆炸。源: `src/core/ingestion/cfg/emit.ts:414-483` [非分发安全]

---

#### 3) post-dominators（CHK over reverse CFG）+ control dependence（Ferrante / reverse-DF）

CDG 回答"哪个分支条件决定了这个块是否执行"——A 需求的高价值结构。前置是后支配树（=reverse CFG 上的支配树，CHK 算法）。

**post-dominators（CHK 定点，over reversed edges）**。源: `src/core/ingestion/cfg/post-dominators.ts:56-142` [非分发安全]（关键 intersect + 定点，已节选）

```ts
export const NO_IPDOM = -1;
export function computePostDominators(cfg): PostDomTree {
  // ... 建 cfgPreds/cfgSuccs，对 EXIT 做 reverse-CFG postorder，得 postNum/rpo ...
  const ipdom = new Array(n).fill(NO_IPDOM); ipdom[exit] = exit;
  const intersect = (a, b) => { let f1 = a, f2 = b;
    while (f1 !== f2) { while (postNum[f1] < postNum[f2]) f1 = ipdom[f1]; while (postNum[f2] < postNum[f1]) f2 = ipdom[f2]; }
    return f1; };
  let changed = true;
  while (changed) { changed = false;
    for (const b of rpo) { if (b === exit) continue;
      let newIpdom = NO_IPDOM;
      for (const s of cfgSuccs[b]) if (ipdom[s] !== NO_IPDOM) newIpdom = newIpdom === NO_IPDOM ? s : intersect(s, newIpdom);
      if (newIpdom !== NO_IPDOM && ipdom[b] !== newIpdom) { ipdom[b] = newIpdom; changed = true; } } }
  ipdom[exit] = NO_IPDOM; return { ipdom };
}
```

**control dependence（reverse-CFG dominance-frontier 形式，O(N+E+output)）**。源: `src/core/ingestion/cfg/control-dependence.ts:180-204` [非分发安全]（PDF 核心；LLVM/Joern/WALA 同款）

```ts
for (const x of order) {                 // post-dom 树 post-order
  for (const { from: a, kind } of inEdges[x])           // PDF_local：X 的 CFG 前驱 A，X 不（立即）后支配 A
    if (a !== x && ipdom[a] !== x) add(x, a, labelFor(kind, armSenses[a]));
  for (const z of children[x])                           // PDF_up：继承 post-dom 子节点的 frontier
    for (const [a, labels] of pdf[z]) if (ipdom[a] !== x) for (const l of labels) add(x, a, l);
}
// 输出 (controllerBlock, dependentBlock, label) — label='T'|'F'，loop header 合法地控制依赖自身
```

> **soundness gate（tk 必须照抄）**：CDG 仅在 "EXIT 从每个 entry-可达块都可达" 时才正确。gitnexus 用 `isExitReachableFromAllBlocks(cfg)`（post-dominators.ts:182-218，正反两次 reach）做前置检查，不满足就**跳过该函数的 CDG**（CFG/REACHING_DEF 不受影响），并先跑 `synthetic-escape.ts` 的 `augmentForPostDom` 给无限循环补一条 `header→loopExit` 分析专用边（331 行，本次只读了头部契约 → 实现时补）。源: `src/core/ingestion/cfg/post-dominators.ts:182` + `emit.ts:553-568` [非分发安全]

**tk 落点**：`src/codemap/cfg/post-dominators.ts` + `control-dependence.ts`。CDG 边 → `edges(kind='cdg', src=controllerBlock, dst=dependentBlock, provenance='dataflow', reason='T'|'F')`。POST_DOMINATE 边仅 debug env 下发（`GITNEXUS_PDG_EMIT_POST_DOMINATE`），tk 可不抄。

---

#### 4) node:sqlite 适配（tk 直接可用的 SQL / CTE）

gitnexus 用 Kuzu/Cypher；tk 用 `node:sqlite` 的 `edges(kind, src, dst, provenance, reason)`。dataflow 三类边（`reaching_def` / `cfg` / `cdg`）解锁的查询：

**(Q1) 精确爆炸半径（改某 def → 所有传递受影响的读取点）= 在 reaching_def 边上做递归闭包**：

```sql
-- 输入 :start_node = 被改的 def 块/语句节点 id
WITH RECURSIVE blast(node, depth) AS (
  SELECT :start_node, 0
  UNION
  SELECT e.dst, b.depth + 1
  FROM edges e JOIN blast b ON e.src = b.node
  WHERE e.kind = 'reaching_def'
    AND b.depth < 64           -- 深度护栏，对应 gitnexus per-function cap 思路
)
SELECT DISTINCT n.file_path, n.start_line, n.kind
FROM blast b JOIN nodes n ON n.id = b.node
WHERE b.depth > 0;
```

> 注：reaching_def 是函数内的 def→use。跨函数爆炸半径要把 def→use 闭包**接到 tk 已有的 call 边**（被影响的 use 若是实参 → 沿 call 边进入被调函数的 param binding，再续 reaching_def）。这正是 gitnexus 把 `SiteRecord.args`/`receiver` 接到 taint 的接缝（§5 J 需求）。

**(Q2) 某块为何执行（控制依赖链，A 需求）**：

```sql
WITH RECURSIVE controllers(node, label, depth) AS (
  SELECT e.src, e.reason, 1 FROM edges e
  WHERE e.kind = 'cdg' AND e.dst = :block_id
  UNION
  SELECT e.src, e.reason, c.depth + 1
  FROM edges e JOIN controllers c ON e.dst = c.node
  WHERE e.kind = 'cdg' AND c.depth < 100
)
SELECT n.start_line, c.label  -- label='T'/'F'：走真/假臂才执行
FROM controllers c JOIN nodes n ON n.id = c.node ORDER BY c.depth;
```

**(Q3) taint-ish：用户输入 source 是否未经 sanitizer 到达 sink（J，近似）**：reaching_def 闭包 + 在 path 上排除经过 sanitizer 节点。最简形式是 Q1 的闭包，外加 `WHERE NOT EXISTS (... 经过被标 sanitizer 的 node ...)`；完整 sanitizer interposition（区分 `exec(escape(x))` kill vs `exec(x)` finding）需 `SiteArgOccurrence` via-tag 语义 → 需实现时补。

---

#### 5) 具体数值（gitnexus 的 caps / depths，tk 照抄起点）

| 常量 | 值 | 含义（源） |
|---|---|---|
| `MAX_CFG_NESTING_DEPTH` | 500（有效词法 ~250） | CFG 递归下降限深，超则 skip（cfg-builder.ts:58）|
| `DEFAULT_PDG_MAX_FUNCTION_LINES` | 2000 | 超此行的函数不建 CFG（collect.ts:26）|
| `DEFAULT_MAX_CFG_EDGES_PER_FUNCTION` | 5000 | 每函数 CFG 边上限（emit.ts:40）|
| `DEFAULT_PDG_MAX_REACHING_DEF_EDGES_PER_FUNCTION` | 4000 | 每函数去重 def→use 边上限（mirror Joern；emit.ts:49）|
| `REACHING_DEF_FACTS_PER_EDGE_CAP` | 4 | maxFacts = edgeCap×4（物化护栏；emit.ts:92）|
| `DEFAULT_PDG_MAX_REACHING_DEF_BLOCK_REVISITS` | 64 | maxBlockVisits = 块数×64（dense 定点不收敛护栏；emit.ts:122）|
| `DEFAULT_PDG_MAX_CDG_EDGES_PER_FUNCTION` | 5000 | 每函数 CDG 边上限（emit.ts:59）|
| `STMT_STRIDE` | 1<<21 | def-key 打包步长（reaching-defs.ts:163）|
| `SSA_MIN_BLOCKS` | 16 | ≥16 块且有可达 loop 才走 SSA-sparse，否则 dense（reaching-defs.ts:786,821）|
| `DEFAULT_MAX_SSA_VALUE_GRAPH_NODES` | 1_000_000 | SSA value-graph 节点上限，超则回退 dense（reaching-defs.ts:801）|

**tk 简化建议**：Required 基线只抄 dense 求解器（SSA-sparse 是大函数性能优化，多出 dominators→Cytron DF→Tarjan SCC 三段约 320 行 reaching-defs-graph.ts，Outside current product scope）。dense 在 `<16 块` 或无循环函数上本就更快，覆盖绝大多数真实函数。

---

#### 6) 抄进来清单

| gitnexus file | tk target | 关键函数 / 数值 |
|---|---|---|
| `cfg/cfg-builder.ts` | `src/codemap/cfg/builder.ts` | `CfgBuilder.edge/connect/withNesting`、`MAX_CFG_NESTING_DEPTH=500`、合成 ENTRY/EXIT |
| `cfg/types.ts` | `src/codemap/cfg/types.ts` | `CfgEdgeKind`(13)、`StatementFacts{defs,uses,mayDefs,sites}`、`BindingEntry`、`SiteRecord` |
| `cfg/collect.ts` | `src/codemap/cfg/collect.ts` | `collectFunctionCfgs`(per-fn try/catch 隔离)、`DEFAULT_PDG_MAX_FUNCTION_LINES=2000` |
| `cfg/reaching-defs.ts` | `src/codemap/cfg/reaching-defs.ts` | `harvestStatementFacts`、`computeInSetsDense`、`sweepFacts`、`mergePreds`、`buildAdjacency`、`defKey/STMT_STRIDE` |
| `cfg/reaching-defs-graph.ts` | `src/codemap/cfg/rd-graph.ts`（可选） | `reversePostOrder`、`unionSets`、`latticeEquals`（dense 也用）；`buildDominators/buildDominanceFrontiers/tarjanScc/condenseReachingSets`（仅 SSA，Outside current product scope）|
| `cfg/post-dominators.ts` | `src/codemap/cfg/post-dominators.ts` | `computePostDominators`(CHK)、`postDominates`、`isExitReachableFromAllBlocks`(soundness gate)、`NO_IPDOM=-1` |
| `cfg/control-dependence.ts` | `src/codemap/cfg/control-dependence.ts` | `computeControlDependence`(reverse-DF)、`buildArmSenses`/`labelFor`(T/F 语义) |
| `cfg/emit.ts` | `src/codemap/cfg/emit.ts`（改写成写 sqlite edges） | 三个 emit 的 cap/去重/onWarn 逻辑 + 全部 `DEFAULT_*` 数值；持久化前去重到 (defBlock,useBlock,binding) |
| `cfg/visitors/typescript.ts`(755行,未读) | `src/codemap/cfg/visitor-ts.ts` | tree-sitter TS/JS → 块切分 + 边连接 + facts 采集 → **需实现时补** |
| `cfg/synthetic-escape.ts`(331行,只读头) | `src/codemap/cfg/synthetic-escape.ts`（可选） | `augmentForPostDom`(给无限循环补分析边) → **需实现时补** |

**tk MCP / CLI 落点**：dataflow 层挂 `tk index --dataflow`（默认 off）。新增/增强 MCP 工具：`blast_radius(symbol)`（Q1，沿 reaching_def + call 闭包）、`why_executed(line)`（Q2，CDG 链）、`flows_to(source, sink)`（Q3，taint-ish 近似）。所有 dataflow 边带 `provenance='dataflow'`，与 codemap 已有 symbol/call/import 边隔离，可单独失效/重建。

---

### gitnexus · Agent Delivery (MCP 工具递送面)

服务 tk 需求 **F**(agent 找代码 / token 优化的对外工具契约)。这一节把 gitnexus 暴露给外部 agent(Claude Code / VS Code Copilot / Cursor)的 **17 个 MCP 工具**全量拆开:工具清单、每个工具的 input schema 与返回、注册方式、以及 gitnexus 用来"自驱动 agent"的 next-step steering。然后映射到 tk 已承诺的 **4 工具面**(`tk_explore` / `tk_node` / `tk_search` / `tk_callers`)+ `impact`,并明确哪些 gitnexus 工具折叠、哪些直接丢弃(tk 要 **少工具**)。

---

#### 1. 全量工具清单(17 个)

源: `src/mcp/tools.ts:80`(`GITNEXUS_TOOLS` 数组)[非分发安全] — 已逐项 Read 确认。下表是全 17 项;`required` 列是 schema 里真正强制的参数。

| # | tool | required 参数 | 返回(摘要) | 注解(annotations) | tk 去向 |
|---|------|------|------|------|------|
| 1 | `list_repos` | —(limit/offset 可选) | 分页 repo 列表 + `pagination{total,limit,offset,returned,hasMore,nextOffset}` | readOnly | **丢**(tk 单 repo / project-local) |
| 2 | `query` | `search_query` | 按 process 分组的执行流 + symbols + 文件位置;BM25+向量 RRF 混排 | readOnly, openWorld | 折叠进 **tk_search**(降级为图+FTS,无向量) |
| 3 | `cypher` | `statement` | `{markdown, row_count}`(Markdown 表) | readOnly | **丢**(tk 无 Cypher;原始 SQL 不暴露给 agent) |
| 4 | `context` | —(name/uid 二选一) | 单 symbol 360°:分类的进/出引用、process 参与、文件位置 | readOnly | 折叠进 **tk_node** |
| 5 | `detect_changes` | — | git diff hunk → 受影响 symbols/processes + 风险摘要 | readOnly | 折叠进 **impact**(`scope` 参数)或单列 |
| 6 | `check` | — | File-IMPORTS 环检测,确定性环路径 + cycleCount | readOnly | **丢 / cycles 检测不在当前产品范围内** |
| 7 | `rename` | `new_name` | 多文件协调重命名,逐条带 confidence(graph/text_search) | **destructive** | **丢**(tk 是 navigation-only,编辑窗不在当前产品范围内) |
| 8 | `impact` | `target`,`direction` | byDepth(d=1/2/3)+ risk + affected_processes + affected_modules | readOnly | 保留 **impact**(核心,见 §4) |
| 9 | `explain` | —(taint 枚举/锚定) | 持久化 taint findings(source→sink) | readOnly | **丢**(需 `--pdg`,tk 无数据流层) |
| 10 | `pdg_query` | `mode`,`target` | CDG 控制依赖 / REACHING_DEF 数据依赖(basic-block 粒度) | readOnly | **丢**(同上,无 PDG 层) |
| 11 | `route_map` | — | API route → handler/middleware/consumer | readOnly | **丢**(框架专用,需 Route 节点) |
| 12 | `tool_map` | — | MCP/RPC tool 定义 → handler 文件 | readOnly | **丢** |
| 13 | `shape_check` | — | route 响应 shape vs consumer 字段访问 mismatch | readOnly | **丢** |
| 14 | `api_impact` | —(route/file) | route_map+shape_check+impact 合并的改前报告 | readOnly | **丢** |
| 15 | `group_list` | — | repo group 配置 | readOnly | **丢**(多 repo group,tk 不需要) |
| 16 | `group_sync` | `name` | 重建跨 repo 契约注册表 | **destructive** | **丢** |
| 17 | `trace` | —(from/to 二选一) | 两 symbol 间最短有向路径(CALLS+HAS_METHOD),逐 hop file:line + edge type/confidence | readOnly | 折叠进 **tk_explore**(或单列为高价值"A 怎么到 B") |

**结论:tk 只取 4–5 个**:`query→tk_search`、`context→tk_node`、`impact`(保留名)、`trace→tk_explore`,callers 是 impact upstream/context 的一个投影 → `tk_callers`。其余 12 个(cypher/rename/check/explain/pdg_query/route_map/tool_map/shape_check/api_impact/group_*/list_repos/detect_changes)对 personal-use、单 repo、navigation-only、无 PDG/向量 的 tk **全部丢弃或排除出当前产品范围**。

---

#### 2. 工具定义的数据结构(verbatim,直接抄)

源: `src/mcp/tools.ts:10`[非分发安全]

```ts
export interface ToolDefinition {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        default?: unknown;
        items?: { type: string };
        enum?: string[];
        minimum?: number;
        maximum?: number;
        minLength?: number;
      }
    >;
    required: string[];
  };
}

const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
```

tk 落点:`src/codemap/mcp/tools.ts`(新建),原样采用这套 `ToolDefinition` + readOnly 注解常量。tk 所有 4 个工具都是 readOnly(navigation-only),无需 destructive 那套。

---

#### 3. 要保留的 3 个工具的完整 schema(verbatim)

**(a) `context` → tk_node** 源: `src/mcp/tools.ts:277`[非分发安全]

```ts
inputSchema: {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Symbol name (e.g., "validateUser", "AuthService")' },
    uid: {
      type: 'string',
      description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)',
    },
    file_path: { type: 'string', description: 'File path to disambiguate common names' },
    kind: {
      type: 'string',
      description:
        "Kind filter to disambiguate common names (e.g. 'Function', 'Class', 'Method', 'Interface', 'Constructor')",
    },
    include_content: {
      type: 'boolean',
      description: 'Include full symbol source code (default: false)',
      default: false,
    },
    // repo / service 省略 —— tk 单 repo 不需要
  },
  required: [],
}
```

**关键设计要抄进 tk**:`name | uid | (file_path + kind)` 的**消歧三元**。`uid` 是零歧义直查(上一次工具结果回填),`name` 同名时返回 ranked candidates 让 agent 自己挑,`file_path`/`kind` 是收窄 hint。tk 的 `nodes` 表已有 `kind`/`file_path`/`start_line`,uid 可用 `rowid` 或 `kind:file_path:name:start_line` 复合键。`include_content: false` 默认是关键 token 杠杆 —— 默认只给位置不给源码,要源码才 `true`。

**(b) `impact`** 源: `src/mcp/tools.ts:440`[非分发安全](节选 tk 需要的字段)

```ts
properties: {
  target: { type: 'string', description: 'Name of function, class, or file to analyze' },
  target_uid: {
    type: 'string',
    description:
      'Direct symbol UID from prior tool results (zero-ambiguity lookup, skips target resolution)',
  },
  direction: {
    type: 'string',
    description: 'upstream (what depends on this) or downstream (what this depends on)',
  },
  file_path: { type: 'string', description: 'File path hint to disambiguate common names' },
  kind: { type: 'string', description: "Kind filter to disambiguate common names ..." },
  maxDepth: {
    type: 'number',
    description: 'Max relationship depth (default: 3, server clamps to 1–32)',
    default: 3, minimum: 1, maximum: 32,
  },
  relationTypes: {
    type: 'array', items: { type: 'string' },
    description:
      'Filter: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, METHOD_OVERRIDES, METHOD_IMPLEMENTS, ACCESSES (default: usage-based, ACCESSES excluded by default)',
  },
  includeTests: { type: 'boolean', description: 'Include test files (default: false)' },
  minConfidence: {
    type: 'number',
    description: 'Minimum edge confidence 0–1 (default: 0 when omitted; server clamps to 0–1)',
    default: 0, minimum: 0, maximum: 1,
  },
  limit: {
    type: 'integer',
    description:
      'Max symbols returned in byDepth per depth level (default: 100). Use small values for hub symbols to avoid output truncation.',
    default: 100, minimum: 1, maximum: 10000,
  },
  offset: { type: 'integer', description: 'Skip this many symbols per depth level ...', default: 0, minimum: 0 },
  summaryOnly: {
    type: 'boolean',
    description:
      'When true, returns target, summary, risk, byDepthCounts, affected_processes ... — omits byDepth. Use for hub symbols to get actionable signal without output explosion.',
    default: false,
  },
},
required: ['target', 'direction'],
```

返回 shape 源: `src/mcp/local/local-backend.ts:5185`[非分发安全]:

```ts
return {
  ...base,
  ...(perSymbolEnrichmentCapped && { partial: true }),
  ...(anyTruncated && {
    pagination: { ...(Number.isFinite(paginationLimit) && { limit: paginationLimit }), offset: paginationOffset, truncated: true },
  }),
  byDepth: paginatedGrouped,
};
```

`base` 含 `byDepthCounts`(每深度总数,源:`local-backend.ts:5068-5095`)、`risk`、`affected_processes`。

**tk 必抄的三个 token 阀门**(对 F 需求至关重要,否则 hub symbol 会撑爆 LLM 上下文):
1. `summaryOnly` —— hub 节点(基类/共享 util)先只看 risk+每深度计数,再 drill;
2. `limit/offset` **逐深度独立分页**(不是对总结果集),`byDepthCounts` 给每深度总数让 agent 决定要不要翻页;
3. `maxDepth` 默认 **3** 且语义化分层:d=1 WILL BREAK / d=2 LIKELY / d=3 MAY NEED TESTING(源:`skills/gitnexus-impact-analysis.md:41`)。

**(c) `trace` → tk_explore** 源: `src/mcp/tools.ts:773`[非分发安全]

```ts
properties: {
  from: { type: 'string', description: 'Source symbol name' },
  from_uid: { type: 'string', description: 'Source symbol UID (zero-ambiguity)' },
  from_file: { type: 'string', description: 'Source file path hint for disambiguation' },
  to: { type: 'string', description: 'Target symbol name' },
  to_uid: { type: 'string', description: 'Target symbol UID (zero-ambiguity)' },
  to_file: { type: 'string', description: 'Target file path hint for disambiguation' },
  maxDepth: {
    type: 'number',
    description: 'Maximum path length in hops (default: 10)',
    default: 10, minimum: 1, maximum: 30,
  },
  includeTests: { type: 'boolean', description: 'Include test-file symbols in traversal (default: false)' },
},
required: [],
```

trace 的卖点(描述里写明):"answers in one call what would take 3-8 manual context/impact hops"。无路径时返回**最远可达节点** + `truncated:true`(命中遍历 cap)。tk_explore 抄这个"A→B 最短路 + 断点反馈"。

---

#### 4. node:sqlite 适配(impact / trace / callers 的 CTE)

gitnexus 用 Kuzu/Cypher 做这些遍历;tk 用 `node:sqlite` 的 `edges(src, dst, kind, confidence, provenance)` + `nodes(rowid, kind, name, file_path, start_line)`。下面是直接可用的 SQL/CTE。

**(a) `tk_callers`(= impact upstream d=1,最高频)** —— 直接 callers:

```sql
-- callers of target node :tid (one hop, upstream over CALLS)
SELECT n.rowid AS uid, n.name, n.file_path, n.start_line, e.confidence
FROM edges e
JOIN nodes n ON n.rowid = e.src
WHERE e.dst = :tid AND e.kind = 'CALLS' AND e.confidence >= :minConf
ORDER BY e.confidence DESC
LIMIT :limit OFFSET :offset;
```

**(b) `impact` upstream byDepth(BFS 分层,WITH RECURSIVE)** —— 对应 gitnexus 的 maxDepth=3 默认:

```sql
WITH RECURSIVE blast(uid, depth, conf) AS (
  -- depth 0: the target itself
  SELECT :tid, 0, 1.0
  UNION
  -- climb upstream: who points AT a node already in blast
  SELECT e.src, b.depth + 1, e.confidence
  FROM edges e
  JOIN blast b ON e.dst = b.uid
  WHERE b.depth < :maxDepth                          -- default 3, clamp 1..32
    AND e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS')  -- relationTypes filter
    AND e.confidence >= :minConf
)
SELECT b.depth, n.rowid AS uid, n.name, n.file_path, n.start_line
FROM blast b
JOIN nodes n ON n.rowid = b.uid
WHERE b.depth > 0
ORDER BY b.depth, n.file_path, n.start_line;
-- 应用层按 depth 分桶 => byDepth{1:[...],2:[...],3:[...]}，
-- byDepthCounts = 每桶 length，summaryOnly 时只回 counts+risk 不回数组。
```

downstream(this depends on)只需把递归边方向反过来:`SELECT e.dst ... JOIN blast b ON e.src = b.uid`。
**注意**:SQLite `WITH RECURSIVE` 的 `UNION`(非 ALL)天然做环路去重,等价 gitnexus 的 visited-set,避免 IMPORTS 环导致无限递归。

**(c) `trace`(A→B 最短路,call+member 边)** —— SQLite 无内建最短路,用带路径累积的 BFS,取第一个到达 :to 的:

```sql
WITH RECURSIVE walk(uid, hops, path) AS (
  SELECT :from, 0, ',' || :from || ','
  UNION
  SELECT e.dst, w.hops + 1, w.path || e.dst || ','
  FROM edges e
  JOIN walk w ON e.src = w.uid
  WHERE w.hops < :maxDepth                            -- default 10, clamp 1..30
    AND e.kind IN ('CALLS','HAS_METHOD')               -- trace 的两类边
    AND instr(w.path, ',' || e.dst || ',') = 0         -- 防环：dst 不在已走路径里
)
SELECT uid, hops, path FROM walk
WHERE uid = :to
ORDER BY hops ASC
LIMIT 1;
-- 无结果 => 回 furthest reachable（取 walk 里 hops 最大那条）+ truncated:true（若 hops 触到 maxDepth）
```

每 hop 的 edge type/confidence:拿 `path` 里相邻 uid 对回查 `edges` 即可对齐 gitnexus 的 `edges[]` 输出。

---

#### 5. 注册方式 + next-step steering(tk 必抄)

**注册**(源:`src/mcp/server.ts:156`[非分发安全]):`ListToolsRequestSchema` 直接 map `GITNEXUS_TOOLS`,`CallToolRequestSchema` 调 `backend.callTool(name,args)` 并把结果 stringify。tk 落点 `src/codemap/mcp/server.ts`,同构即可(node:sqlite backend 替代 LadybugDB)。

**最有价值的可抄件 = next-step hint**(源:`src/mcp/server.ts:40` `getNextStepHint`)[非分发安全]:

```ts
// 在每次 tool 返回文本后追加，引导 agent 自驱动下一步（无需 hook）
switch (toolName) {
  case 'query':
    return `\n\n---\n**Next:** To understand a specific symbol in depth, use context({name: "<symbol_name>"${repoParam}}) ...`;
  case 'context':
    return `\n\n---\n**Next:** If planning changes, use impact({target: "${args?.name || '<name>'}", direction: "upstream"${repoParam}}) ...`;
  case 'impact':
    return `\n\n---\n**Next:** Review d=1 items first (WILL BREAK). ...`;
}
```

设计意图(原注释):*"Agents often stop after one tool call. These hints guide them to the logical next action, creating a self-guiding workflow without hooks."* —— tk 4 工具串成 `tk_search → tk_node → impact` 的 next-step 链,这是用工具描述本身做 steering、省掉 skill/hook 的低成本手段,**直接服务 F**(让 agent 用更少往返找到代码)。

**反提示工程小技巧**(源:`tools.ts:138-143` 注释)[非分发安全]:gitnexus 故意**不在 schema 里命名 `query` 字段**(用 `search_query`),因为 LLM 看到属性名叫 `query` 会去发 `query`,而 Claude Code 恰好会丢掉名为 `query` 的参数。tk 命名工具参数时避开 `query`,用 `search_query`/`statement` 这类无歧义名。

**工具描述模板**(每个 description 的固定结构,抄进 tk):`WHEN TO USE:` + `AFTER THIS:` + 输出字段说明 + `TIP:`(token 阀门提示)。这是 gitnexus 引导 agent 正确选工具/控 token 的核心文案骨架。

**skill 钩子**(源:`skills/gitnexus-impact-analysis.md`):tk 若做 Claude Code skill,抄它的 Workflow 编号步骤 + 风险表(d=1/2/3 → WILL BREAK/LIKELY/MAY TEST,symbol 数 → LOW/MEDIUM/HIGH/CRITICAL)。

---

#### 6. 抄进来清单

| gitnexus file:line | tk target | 关键函数 / 物 |
|---|---|---|
| `src/mcp/tools.ts:10` | `src/codemap/mcp/tools.ts` | `ToolDefinition` 接口 + `READ_ONLY_TOOL_ANNOTATIONS` |
| `src/mcp/tools.ts:277`(context schema) | tk_node 定义 | `name\|uid\|(file_path+kind)` 消歧三元、`include_content` 默认 false |
| `src/mcp/tools.ts:440`(impact schema) | impact 定义 | `summaryOnly` / `limit+offset` 逐深度分页 / `byDepthCounts` / `relationTypes` / `maxDepth=3` |
| `src/mcp/tools.ts:773`(trace schema) | tk_explore 定义 | `from/to` + uid/file hints、`maxDepth=10`、furthest-reachable 反馈 |
| `src/mcp/server.ts:40` `getNextStepHint` | `src/codemap/mcp/server.ts` | 每工具返回追加 next-step,自驱动工作流 |
| `src/mcp/server.ts:156` 注册块 | 同上 | `ListTools`/`CallTool` handler 同构(换 sqlite backend) |
| `src/mcp/local/local-backend.ts:5185` impact 返回 | impact handler | `byDepth`/`byDepthCounts`/`partial`/`pagination.truncated` 返回 shape |
| `tools.ts:138` 反提示注释 | tk 工具参数命名约定 | 避开 `query` 字段名(用 `search_query`) |
| `skills/gitnexus-impact-analysis.md` | tk skill(可选) | 风险表 + Workflow 编号 |

**具体数值汇总**(gitnexus 实际用的 cap/默认):impact `maxDepth` 默认 3、clamp 1–32;`limit` 默认 100、max 10000(逐深度);`crossDepth` 1。trace `maxDepth` 默认 10、max 30。query `limit` 默认 5、max 100;`max_symbols` 默认 10、max 200。分页类(list_repos/explain/pdg_query)默认 50、max 200。impact Phase-1 `timeoutMs` 默认 30000。这些是 tk 直接可用的初始阈值。


---

### gitnexus · HUMAN 面（serve + 大图渲染）

**服务 tk 需求（标 H）**：H = 人类理解面，tk 的落点是「自包含、inline-JSON 的单文件 HTML 图谱查看器」，复用 `src/report/html.ts` 的 `embed()` 注入 + 离线 file:// 渲染。gitnexus 是「1 后端 N 前端」的在线架构（Express + Sigma/graphology），但其**大图可读性决策（load-decision 阈值）、节点尺寸/质量随密度缩放、按深度/标签过滤、边的两遍分层绘制**这几块算法核心，和 tk 的离线 HTML 查看器需求高度一致，可直接抄。tk **不抄** Sigma/graphology/ForceAtlas2/React/Express 这套在线运行时（与 zero-runtime-dep + 离线 file:// 冲突），只抄**纯决策/纯数据整形**的部分。

---

#### 1. 大图加载决策（load-decision 阈值）— tk 最该抄的一块

gitnexus 发现「浏览器在超大图上会卡死」，于是在**下载图之前**用节点数 **或** 边数任一超阈值就降级为「只聊天/不画图」（issue #2178）。tk 的 HTML 查看器同理：把整张图 inline 进 HTML 会让浏览器 force-layout 卡死，所以要在**生成 HTML 时**就按同样阈值决定「全量内联 vs 降级（只给可点击的列表/摘要，画布留 escape-hatch 按钮）」。

可抄代码（纯函数，零依赖，可直接落进 tk）：

源: `gitnexus-web/src/lib/graph-load-decision.ts:28-84` [非分发安全]
```ts
const isOver = (count: number | null | undefined, threshold: number | undefined): boolean =>
  typeof threshold === 'number' &&
  typeof count === 'number' &&
  Number.isFinite(count) &&
  count > threshold;

/**
 * Decide whether to skip the graph download.
 * - An explicit boolean choice always wins (override in both directions).
 * - Otherwise auto-detect: skip when EITHER the node count OR the edge count is
 *   known and strictly greater than its threshold. Edges matter because the
 *   browser force-layout cliff is edge-driven ...
 * - Missing/unknown counts fail open to a full download (we never skip purely
 *   because we couldn't read the size).
 */
export function decideSkipGraph({
  explicit, nodeCount, threshold, edgeCount, edgeThreshold,
}: SkipGraphDecisionInput): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return isOver(nodeCount, threshold) || isOver(edgeCount, edgeThreshold);
}

/**
 * Whether to prompt before loading the full graph from the chat-only escape
 * hatch. Confirm whenever the node count is large OR unknown — never silently
 * re-load a graph we cannot size.
 */
export function shouldConfirmGraphLoad(
  nodeCount: number | null | undefined, threshold: number,
): boolean {
  if (typeof nodeCount !== 'number' || !Number.isFinite(nodeCount)) return true;
  return nodeCount > threshold;
}
```

**gitnexus 用的具体数值**（源: `gitnexus-web/src/config/ui-constants.ts:20,29` [非分发安全]，含其注释里的实测依据）：
- `DEFAULT_LARGE_GRAPH_NODE_THRESHOLD = 25_000`
- `DEFAULT_LARGE_GRAPH_EDGE_THRESHOLD = 50_000`
- 注释依据：sigma.js/graphology 实测 `~10K` 节点流畅渲染、复杂样式渲染在 `~5K` 之后吃力、force-layout 在 `~50K 边` 之后退化；gitnexus 图「边比节点多 ~1.7×」，所以边的悬崖在 `~25–30K 节点` 时被跨过 → 节点阈值压到 25K，并**额外加边阈值**兜底「边多但节点少」的仓库。

**node:sqlite 适配**：tk 不需要后端调用——在生成 HTML 前用一条 SQL 取计数即可：
```sql
-- node/edge 计数（喂给 decideSkipGraph）
SELECT (SELECT COUNT(*) FROM nodes) AS node_count,
       (SELECT COUNT(*) FROM edges) AS edge_count;
```
**tk 落点**：新建 `src/codemap/viewer/load-decision.ts`（verbatim 抄这两个纯函数）；在 HTML 生成器里调用：`node_count` 或 `edge_count` 超阈值 → 不内联全图，改内联「降级载荷」（节点/边的轻量列表 + 「Load full graph anyway」按钮，对应 gitnexus 的 chatOnly escape-hatch，`GraphCanvas.tsx:368-390`）。tk 单文件 HTML 场景里没有 `window.confirm` 异步交互，可把 `shouldConfirmGraphLoad` 用在「按钮点开前的内联 warning 文案」上。

---

#### 2. 节点尺寸/质量随图密度缩放（大图仍保持层级可读）

大图里如果节点都一样大就糊成一团；gitnexus 按总节点数分档缩小节点、并保留最小值以维持层级差异。这对 tk 的 SVG/Canvas 渲染同样直接可用（纯计算，无 Sigma 依赖）。

源: `gitnexus-web/src/lib/graph-adapter.ts:47-55` [非分发安全]
```ts
const getScaledNodeSize = (baseSize: number, nodeCount: number): number => {
  if (nodeCount > 50000) return Math.max(1, baseSize * 0.4);
  if (nodeCount > 20000) return Math.max(1.5, baseSize * 0.5);
  if (nodeCount > 5000) return Math.max(2, baseSize * 0.65);
  if (nodeCount > 1000) return Math.max(2.5, baseSize * 0.8);
  return baseSize;
};
```
边宽也同档收窄（源: `graph-adapter.ts:291` [非分发安全]）：
```ts
const edgeBaseSize = nodeCount > 20000 ? 0.4 : nodeCount > 5000 ? 0.6 : 1.0;
```
`getNodeMass`（源: `graph-adapter.ts:61-85` [非分发安全]）是 ForceAtlas2 专用的「斥力质量」（Project 50 / Package 30 / Module 20 / Folder 15 / File 3 / Class·Interface 5 / Function·Method 2，并在 >1000/>5000 节点时乘 1.5/2）——**tk 若不做 force-layout 则跳过 mass**；但若 tk 想做最简单的「按类型分层」静态布局，这套相对权重可作为「类型重要性排序」直接复用。

**tk 落点**：`src/codemap/viewer/scale.ts`，HTML 内联脚本渲染节点半径/边宽时调用；`nodeCount` 来自第 1 节的 SQL 计数。

---

#### 3. 按深度/标签过滤（聚焦一个节点的 N 跳邻域）— 大图可读性的核心交互

大图全量画没法读，gitnexus 提供「选中一个节点 → 只显示 N 跳内 + 指定类型」的过滤。BFS 部分纯算法，tk 内联脚本可直接抄；但 tk 更应该把它**下沉到 SQL**，让 HTML 只内联「当前聚焦子图」而非全图（从根上规避大图卡死）。

源: `gitnexus-web/src/lib/graph-adapter.ts:528-580` [非分发安全]
```ts
/** Get all nodes within N hops of a starting node */
export const getNodesWithinHops = (
  graph, startNodeId: string, maxHops: number,
): Set<string> => {
  const visited = new Set<string>();
  const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNodeId, depth: 0 }];
  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    if (depth < maxHops) {
      graph.forEachNeighbor(nodeId, (neighborId) => {
        if (!visited.has(neighborId)) queue.push({ nodeId: neighborId, depth: depth + 1 });
      });
    }
  }
  return visited;
};

/** Filter nodes by depth from selected node (sets hidden=true outside range/labels) */
export const filterGraphByDepth = (graph, selectedNodeId, maxHops, visibleLabels): void => {
  if (maxHops === null) { filterGraphByLabels(graph, visibleLabels); return; }
  if (selectedNodeId === null || !graph.hasNode(selectedNodeId)) {
    filterGraphByLabels(graph, visibleLabels); return;
  }
  const nodesInRange = getNodesWithinHops(graph, selectedNodeId, maxHops);
  graph.forEachNode((nodeId, attributes) => {
    const isLabelVisible = visibleLabels.includes(attributes.nodeType);
    const isInRange = nodesInRange.has(nodeId);
    graph.setNodeAttribute(nodeId, 'hidden', !isLabelVisible || !isInRange);
  });
};
```
注意：gitnexus 这里用的是**无向邻居**（`forEachNeighbor`，不分 src/dst 方向），即「围绕焦点的连通邻域」。

**node:sqlite 适配**（WITH RECURSIVE CTE，把 N 跳邻域下沉到 SQL，只把子图内联进 HTML）：
```sql
-- N-hop 无向邻域（双向遍历 edges，对应 forEachNeighbor）
WITH RECURSIVE hood(id, depth) AS (
  SELECT :startId, 0
  UNION
  SELECT CASE WHEN e.src = h.id THEN e.dst ELSE e.src END, h.depth + 1
  FROM hood h
  JOIN edges e ON (e.src = h.id OR e.dst = h.id)
  WHERE h.depth < :maxHops
)
SELECT DISTINCT n.* FROM nodes n
JOIN hood ON hood.id = n.id
WHERE n.kind IN (/* visibleLabels */);   -- 标签过滤等价 filterGraphByLabels
```
对应的子图边（两端都在邻域内）：
```sql
SELECT e.* FROM edges e
WHERE e.src IN (SELECT id FROM hood) AND e.dst IN (SELECT id FROM hood);
```
**tk 落点**：`src/codemap/viewer/subgraph.ts`（SQL 取焦点子图）+ HTML 内联脚本里保留 BFS 版 `getNodesWithinHops` 做「客户端二次收窄」（用户在已内联子图上再调 depth 滑块，无需回后端）。这就是 tk 把「焦点子图 SQL 下沉 + 客户端再过滤」结合的关键：**HTML 永远只内联一个可控大小的子图**，从源头规避第 1 节的大图卡死。

---

#### 4. 边的两遍分层绘制 + 每类型独立配色（视觉可读性）

层级边（CONTAINS/DEFINES）画在底层、跨边（CALLS/IMPORTS/EXTENDS）画在顶层，且每种关系一个颜色 → 大图里关系类型一眼可分。这是纯渲染顺序约定，tk HTML 内联脚本可直接照搬。

源: `gitnexus-web/src/lib/graph-adapter.ts:295-343` [非分发安全]
```ts
const EDGE_STYLES: Record<string, { color: string; sizeMultiplier: number }> = {
  CONTAINS:   { color: '#2d5a3d', sizeMultiplier: 0.4 },  // 层级 绿
  DEFINES:    { color: '#0e7490', sizeMultiplier: 0.5 },  // 定义 青
  IMPORTS:    { color: '#1d4ed8', sizeMultiplier: 0.6 },  // 依赖 蓝
  CALLS:      { color: '#7c3aed', sizeMultiplier: 0.8 },  // 调用 紫
  EXTENDS:    { color: '#c2410c', sizeMultiplier: 1.0 },  // 继承 橙
  IMPLEMENTS: { color: '#be185d', sizeMultiplier: 0.9 },  // 实现 粉
  HAS_METHOD:   { color: EDGE_INFO.DEFINES.color,  sizeMultiplier: 0.4 },
  HAS_PROPERTY: { color: EDGE_INFO.CONTAINS.color, sizeMultiplier: 0.35 },
};
// 背景边类型（先画，沉底）
const BACKGROUND_EDGE_TYPES = new Set(['CONTAINS', 'DEFINES', 'HAS_METHOD', 'HAS_PROPERTY']);
// Pass 1: background (hierarchy) edges — rendered behind
knowledgeGraph.relationships.forEach((rel) => { if (BACKGROUND_EDGE_TYPES.has(rel.type)) addEdge(rel); });
// Pass 2: foreground (cross) edges — rendered on top
knowledgeGraph.relationships.forEach((rel) => { if (!BACKGROUND_EDGE_TYPES.has(rel.type)) addEdge(rel); });
```
**tk 落点**：`src/codemap/viewer/edge-style.ts`（配色表 + 两遍绘制顺序常量），与 tk 的 `edges.kind` 取值对齐后内联进 HTML 脚本。tk 的 `edges.kind` 命名需映射到这张表（`CONTAINS/DEFINES/IMPORTS/CALLS/EXTENDS/IMPLEMENTS`）。

---

#### 5. 后端供图协议（tk 只需理解、不照抄）

gitnexus 的 `/api/graph`（源: `gitnexus/src/server/api.ts:1087-1161` [非分发安全]）有两个值得 tk 记住的点：

1. **全量 vs 流式**：`?stream=true` 时用 NDJSON 逐行吐节点/关系（`Content-Type: application/x-ndjson`），避免一次性把巨图序列化进内存。源: `streamGraphNdjson` `api.ts:421-455` [非分发安全]：先逐表 stream 所有节点，再 stream 所有关系。
2. **数据形状**：图 = `{ nodes: GraphNode[], relationships: GraphRelationship[] }`；关系行的投影（源: `api.ts:338-340` GRAPH_RELATIONSHIP_QUERY [非分发安全]）= `sourceId, targetId, type, confidence, reason, step` —— 即「带 provenance 的 typed edge」，和 tk 的 `edges(kind, src, dst, provenance)` 一一对应。

**node:sqlite 适配 / tk 落点**：tk 是离线单文件，**不需要 HTTP/stream**——直接 SQL 取整图（或第 3 节的焦点子图）后用 `embed()` 内联：
```sql
-- nodes 载荷
SELECT id, kind, file_path, start_line, end_line, name FROM nodes;
-- edges 载荷（带 provenance，对应 gitnexus 的 confidence/reason/step）
SELECT kind, src, dst, provenance FROM edges;
```
内联走 tk 已有的 `src/report/html.ts:24-30` `embed()`（`</script>` 断逃 + U+2028/2029 转义）+ `renderReportHtml` 的 `window.__TK_REPORT__ = ${embed(doc)}` 模式（源: `src/report/html.ts:762`）。tk 的 HTML 查看器 = 在同一个 `embed` 注入框架里新增一个 `ReportKind: "graph"`，data 就是上面两条 SQL 的结果（或降级载荷）。

---

#### 抄进来清单

| gitnexus 文件 | tk 目标 | 关键函数/常量 |
|---|---|---|
| `gitnexus-web/src/lib/graph-load-decision.ts` | `src/codemap/viewer/load-decision.ts` | `decideSkipGraph` / `shouldConfirmGraphLoad`（verbatim） |
| `gitnexus-web/src/config/ui-constants.ts` | 同上常量 | 节点阈值 `25_000`、边阈值 `50_000` |
| `gitnexus-web/src/lib/graph-adapter.ts:47-55,291` | `src/codemap/viewer/scale.ts` | `getScaledNodeSize` + `edgeBaseSize` 分档 |
| `gitnexus-web/src/lib/graph-adapter.ts:528-580` | `src/codemap/viewer/subgraph.ts` + 内联脚本 | `getNodesWithinHops` / `filterGraphByDepth`（→ 改写为 SQL CTE + 客户端二次过滤） |
| `gitnexus-web/src/lib/graph-adapter.ts:295-343` | `src/codemap/viewer/edge-style.ts` | `EDGE_STYLES` 配色 + `BACKGROUND_EDGE_TYPES` 两遍绘制 |
| `gitnexus/src/server/api.ts:338-340,421-455,1087-1161` | 仅参考（不照抄 HTTP/stream） | 图数据形状 `{nodes, relationships}`、关系投影含 provenance |
| (复用) `src/report/html.ts:24-30,762` | `src/codemap/viewer/html.ts` | `embed()` XSS-safe 注入 + `window.__TK_REPORT__` 内联模式 |

**与 tk H 决策的对齐总结**：tk 取 gitnexus「在线 N 前端」里**唯一与离线单文件相容的内核**——load-decision 阈值（25K/50K）、密度缩放、焦点子图过滤、边分层配色——其余 Sigma/graphology/ForceAtlas2/Express/React 全部**不抄**。tk 的大图可读性策略 = 「**SQL 下沉焦点子图（永不内联全图）+ load-decision 阈值兜底 + 客户端 depth 滑块二次收窄**」，三者叠加从源头规避浏览器卡死，而 HTML 仍是离线 file:// 自包含（复用现成 `embed()`）。

---

### gitnexus · storage（schema / node-edge 模型 / 查询 seam → tk node:sqlite）

#### 服务 tk 需求

- **C（agent 找代码 / token 优化的底座）** —— 本子系统是整个 typed property graph 的存储与查询 seam。gitnexus 的 schema 设计（hybrid 节点表 + 单一 `CodeRelation` 边表 with `type`/`confidence`/`reason`）几乎可以 1:1 映射到 tk 的 `nodes(kind, file_path, start_line, ...)` / `edges(kind, src, dst, provenance)`，是 tk 这两张表的"设计依据"。
- **C** 同时覆盖：图的内存索引模型（双向邻接 + per-type bucket + per-file bucket，用于增量删除）、查询的发布方式（prepared-statement seam + 行归一化）、增量回写键（per-file SHA-256 diff）、以及"为什么 tk 不抄 Kuzu/lbug 原生绑定"的论证。
- 顺带服务两者（codemap agent surface + codeguide human surface）：navigation 查询（callers / callees / inter-file edges / impact）的 Cypher 范式，给出 node:sqlite CTE 等价。

---

#### 1. Schema / node-edge 模型（最核心可抄项）

gitnexus 用 **hybrid schema**：每种代码元素一张节点表，但**所有关系塞进单一 `CodeRelation` 边表**，靠 `type` 列区分。这正是 tk `edges(kind, ...)` 的设计原型。

边表定义（节选自 RELATION_SCHEMA，确认存在于 schema.ts:246-456）：

```ts
// 源: src/core/lbug/schema.ts:452-456 [非分发安全]
  type STRING,
  confidence DOUBLE,
  reason STRING,
  step INT32
)`;
```

节点表的公共列形（确认存在，CODE_ELEMENT_BASE）：

```ts
// 源: src/core/lbug/schema.ts:146-156 [非分发安全]
const CODE_ELEMENT_BASE = (name: string) => `
CREATE NODE TABLE \`${name}\` (
  id STRING,
  name STRING,
  filePath STRING,
  startLine INT64,
  endLine INT64,
  content STRING,
  description STRING,
  PRIMARY KEY (id)
)`;
```

节点 label 与边类型的**单一真相源**（确认存在 schema-constants.ts:11-86）—— tk 的 `nodes.kind` / `edges.kind` 枚举可直接借用这两份清单：

```ts
// 源: gitnexus-shared/src/lbug/schema-constants.ts:11-45 [非分发安全]
export const NODE_TABLES = [
  'File','Folder','Function','Class','Interface','Method','CodeElement',
  'Community','Process','Section','Struct','Enum','Macro','Typedef','Union',
  'Namespace','Trait','Impl','TypeAlias','Const','Static','Variable','Property',
  'Record','Delegate','Annotation','Constructor','Template','Module','Route',
  'Tool','BasicBlock',
] as const;

// 源: gitnexus-shared/src/lbug/schema-constants.ts:49-86 [非分发安全]
export const REL_TABLE_NAME = 'CodeRelation';
export const REL_TYPES = [
  'CONTAINS','DEFINES','IMPORTS','CALLS','EXTENDS','IMPLEMENTS',
  'HAS_METHOD','HAS_PROPERTY','ACCESSES','METHOD_OVERRIDES','OVERRIDES',
  'METHOD_IMPLEMENTS','MEMBER_OF','STEP_IN_PROCESS','HANDLES_ROUTE','FETCHES',
  'HANDLES_TOOL','ENTRY_POINT_OF','WRAPS','QUERIES',
  // PDG/taint substrate（保留，尚未发射）：
  'CFG','REACHING_DEF','TAINTED','SANITIZES','TAINT_PATH','CDG','POST_DOMINATE',
] as const;
// ⚠️ 抄用警示（D15 / ADR 0027）：tk **不**采纳 `STEP_IN_PROCESS`（gitnexus 式 Process 机制 Outside scope）。
//    edges 表不设该 kind、GraphRelationship 不设 `step?` 字段；Flows 由 EvidenceBackedFlowProjection 按需算。
```

边的运行期对象形（确认存在 graph/types.ts:182-206），决定 tk `edges` 表该有哪些列：

```ts
// 源: gitnexus-shared/src/graph/types.ts:182-206 [非分发安全]
export interface GraphRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  confidence: number;     // → tk edges.confidence (REAL)
  reason: string;         // → tk edges.provenance / reason
  step?: number;          // → 仅 STEP_IN_PROCESS 用，可省
  evidence?: readonly { kind: string; weight: number; note?: string }[]; // → JSON 列
}
```

**关键设计取舍（直接抄 idea）**：

1. **边类型重载在一个 `type`/`kind` 列**，不为每种关系建表 —— tk 已采纳（`edges(kind,...)`）。
2. **`confidence DOUBLE` + `reason STRING` 是边的一等列**，不是 properties bag。resolution pipeline 给每条边打置信度与"为什么连这条边"。tk 的 `edges.provenance` 应同时承载 reason，并加 `confidence REAL`。
3. **`reason` 列被复用为多义载荷**（schema.ts:224-239, 80-85 注释确认）：`ACCESSES` 边用 `reason='read'|'write'`；`REACHING_DEF` 把变量名放进 `reason`；`CDG` 把分支 sense `'T'|'F'` 放进 `reason`。因为 LadybugDB **对边属性没有二级索引**（schema.ts:227-230 明说），专设列也无收益。→ tk 在 SQLite 里**有 FTS5**，所以 tk 可以反过来：把这些语义放进结构化列或 provenance JSON，并用 FTS5 索引，这是 tk 相对 gitnexus 的存储优势。
4. **`isExported BOOLEAN` 列**（FUNCTION/CLASS/METHOD schema 有，CODE_ELEMENT_BASE 无）—— 导出符号是 export-surface 查询的高频过滤（见 graph-queries.ts:77-84），tk `nodes` 应保留 `is_exported INTEGER`。
5. **`content STRING` 直接存在节点上** —— gitnexus 把符号源码塞进节点表 `content` 列，read-lane 可不回文件直接取。tk 可选：`nodes.content` 或仅存 `start_line/end_line` 让 read-lane 回切。gitnexus 还为 embedding **单独建表**（schema.ts:458-491 注释：避免 copy-on-write 开销）—— tk 若上向量同理应分表。

#### node:sqlite 适配（schema DDL）

```sql
-- tk 落点：src/codemap/schema.ts —— 节点表（单表 + kind 列，不学 gitnexus 的 per-kind 表，
-- 因为 SQLite 无 label 概念、单表 + kind 列 + 索引更简单，且 FTS5 只能挂一张表）
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,          -- 'Function:src/a.ts:doThing' 形（见 §2）
  kind        TEXT NOT NULL,             -- ← NODE_TABLES 枚举
  name        TEXT,
  file_path   TEXT,
  start_line  INTEGER,
  end_line    INTEGER,
  is_exported INTEGER DEFAULT 0,
  content     TEXT,
  description TEXT
);
CREATE INDEX nodes_by_file ON nodes(file_path);   -- ← 对应 graph.ts 的 nodeIdsByFile
CREATE INDEX nodes_by_kind_name ON nodes(kind, name);

-- 单一边表，kind 重载（直抄 CodeRelation idea）
CREATE TABLE edges (
  id         TEXT PRIMARY KEY,
  src        TEXT NOT NULL,             -- sourceId
  dst        TEXT NOT NULL,             -- targetId
  kind       TEXT NOT NULL,            -- ← REL_TYPES 枚举
  confidence REAL DEFAULT 1.0,
  provenance TEXT,                     -- reason + evidence JSON
  FOREIGN KEY (src) REFERENCES nodes(id),
  FOREIGN KEY (dst) REFERENCES nodes(id)
);
-- 双向邻接索引（对应 graph.ts 的 edgeIdsByNode 正/反向；CTE 遍历必须两向都索引）
CREATE INDEX edges_by_src  ON edges(src, kind);
CREATE INDEX edges_by_dst  ON edges(dst, kind);
CREATE INDEX edges_by_kind ON edges(kind);

-- FTS5（tk 独有，gitnexus 没有）：name+content 全文，支撑 grep-lite / 符号搜索
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, content, content='nodes', content_rowid='rowid');
```

---

#### 2. node-id 格式（必须抄，决定 CTE 能否 join）

gitnexus 的 node id **不是随机的**：前缀即 label，靠 `:` 分段。这让"从 id 反推表名"零成本，也让边表 join 稳定。

```ts
// 源: src/core/lbug/rel-pair-routing.ts:42-46 [非分发安全]
export const getNodeLabel = (nodeId: string): string => {
  if (nodeId.startsWith('comm_')) return 'Community';
  if (nodeId.startsWith('proc_')) return 'Process';
  return nodeId.split(':')[0];          // 'Function:src/a.ts:doThing' → 'Function'
};
```

→ tk 落点 `src/codemap/node-id.ts`：采用 `<Kind>:<filePath>:<name>`（或 `<Kind>:<filePath>:<startLine>`）格式，使 `nodes.id` 全局唯一且自带 kind。**注意**：tk 用 SQLite，可以不靠前缀反推 kind（直接 `nodes.kind` 列），但 id 仍应是**确定性可重算**的（同一符号每次 analyze 得同一 id），这是增量回写（§5）能 delete-by-file 再 insert 的前提。

---

#### 3. 查询发布 seam（prepared statement + 行归一化）

gitnexus 把所有写入/查询收口到 `executePrepared`（防注入），读取统一走 `readQueryRows`。tk 用 `node:sqlite` 的 `db.prepare().all()` 即等价物。

```ts
// 源: src/core/lbug/lbug-adapter.ts:1530-1544 [非分发安全]
export const executePrepared = async (
  cypher: string,
  params: Record<string, any>,
): Promise<any[]> => {
  if (!conn) throw new Error('LadybugDB not initialized. Call initLbug first.');
  const stmt = await conn.prepare(cypher);
  if (!stmt.isSuccess()) {
    const errMsg = await stmt.getErrorMessage();
    throw new Error(`Prepare failed: ${errMsg}`);
  }
  const queryResult = await conn.execute(stmt, params);
  return await readQueryRows(queryResult);
};
```

参数白名单校验（防止把复杂宿主对象绑进 prepared statement，确认存在 query-params.ts:16-24）—— tk 可直接抄这条 `isBindableScalar` 守卫：

```ts
// 源: src/core/lbug/query-params.ts:16-17 [非分发安全]
const isBindableScalar = (value: unknown): value is string | number | boolean | null =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);
```

**批量写入分子批**（schema.ts 之外的写入路径，确认存在 lbug-adapter.ts:1546-1576）—— `SUB_BATCH_SIZE = 4`，重用同一 prepared statement 跑多组参数。tk 用 SQLite 应改为**单事务 + 重用 stmt**（SQLite 事务比 4-行子批高效得多）：

```ts
// 源: src/core/lbug/lbug-adapter.ts:1555 [非分发安全]
const SUB_BATCH_SIZE = 4;   // gitnexus 的子批大小 —— tk 用 BEGIN/COMMIT 包裹整批替代
```

#### node:sqlite 适配（seam）

```ts
// tk 落点：src/codemap/store.ts —— 用 node:sqlite 提供与 gitnexus 同形的 seam
import { DatabaseSync } from 'node:sqlite';

export class CodeGraphStore {
  private db: DatabaseSync;
  // 等价 executePrepared：参数化 + 行数组归一化
  query<T = Record<string, unknown>>(sql: string, params: Record<string, unknown> = {}): T[] {
    return this.db.prepare(sql).all(params) as T[];
  }
  // 等价 executeWithReusedStatement：单事务批量写（替代 gitnexus 的 4-行子批）
  writeBatch(sql: string, rows: Array<Record<string, unknown>>): void {
    const stmt = this.db.prepare(sql);
    this.db.exec('BEGIN');
    try { for (const r of rows) stmt.run(r); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
```

---

#### 4. 内存图索引模型（graph.ts —— tk 构建期/增量期可抄）

`createKnowledgeGraph` 是纯内存图，维护**三套衍生索引**让删除从 O(全部边) 降到 O(touching)。tk 在 **analyze 构建期**（边还没落 SQLite 前）做增量删改时，这套结构直接可用。

确认存在 graph.ts:18-27 的三索引：

```ts
// 源: src/core/graph/graph.ts:18-27 [非分发安全]
const relationshipsByType = new Map<RelationshipType, Map<string, GraphRelationship>>();
// 反向邻接：nodeId → Set<relId>（src 或 dst 命中本节点的所有边）
const edgeIdsByNode = new Map<string, Set<string>>();
// 文件索引：filePath → Set<nodeId>
const nodeIdsByFile = new Map<string, Set<string>>();
```

按文件删节点（增量回写的内存侧，确认存在 graph.ts:135-142）—— 这正是 §5 selective writeback 的内存对应：

```ts
// 源: src/core/graph/graph.ts:135-142 [非分发安全]
const removeNodesByFile = (filePath: string): number => {
  const nodeIds = nodeIdsByFile.get(filePath);
  if (nodeIds === undefined) return 0;
  const snapshot = [...nodeIds];           // 快照：removeNode 会改 nodeIdsByFile
  for (const nodeId of snapshot) removeNode(nodeId);
  return snapshot.length;
};
```

→ tk 落点 `src/codemap/build/graph.ts`（构建期内存图）。在 SQLite 侧，这三索引被上面的 `nodes_by_file` / `edges_by_src` / `edges_by_dst` 索引替代，删除直接 `DELETE FROM nodes WHERE file_path=?` + 级联删边（§5）。

---

#### 5. 增量回写键（file-hash.ts —— C 必抄）

整库 wipe-and-reload 慢（gitnexus 注释：25K-node repo ~50s CSV COPY，file-hash.ts:14）。改为 per-file SHA-256 diff，只重写 changed/added/deleted 的行。

```ts
// 源: src/storage/file-hash.ts:29-36 [非分发安全]
export const computeFileHash = async (absPath: string): Promise<string | null> => {
  try {
    const buf = await fs.readFile(absPath);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;     // 读不到 → 视为 changed
  }
};

// 源: src/storage/file-hash.ts:79-104 [非分发安全]
export const diffFileHashes = (
  current: ReadonlyMap<string, string>,
  stored: Readonly<Record<string, string>> | undefined,
): FileHashDiff => {
  const storedMap = new Map<string, string>(stored ? Object.entries(stored) : []);
  const changed: string[] = []; const added: string[] = [];
  for (const [p, h] of current) {
    const prev = storedMap.get(p);
    if (prev === undefined) added.push(p);
    else if (prev !== h) changed.push(p);
  }
  const deleted: string[] = [];
  for (const p of storedMap.keys()) if (!current.has(p)) deleted.push(p);
  changed.sort(); added.sort(); deleted.sort();
  return { changed, added, deleted, toWrite: [...changed, ...added].sort() };
};
```

具体数值：`BATCH = 100`（并行哈希批，file-hash.ts:47）。

#### node:sqlite 适配（selective writeback）

tk 把 hash map 存进一张 meta 表，回写时按 `file_path` 删旧行再插新行：

```sql
-- tk 落点：src/codemap/incremental.ts
CREATE TABLE file_hashes (file_path TEXT PRIMARY KEY, sha256 TEXT NOT NULL);

-- 对 diff.toWrite ∪ diff.deleted 的每个文件，事务内删旧行（边随节点级联）：
BEGIN;
DELETE FROM edges WHERE src IN (SELECT id FROM nodes WHERE file_path = :fp)
                     OR dst IN (SELECT id FROM nodes WHERE file_path = :fp);
DELETE FROM nodes WHERE file_path = :fp;
-- 然后 re-insert changed/added 文件的 nodes/edges
COMMIT;
```

> 注：因为 node-id 是确定性的（§2），同一符号重算得同一 id，`DELETE by file_path` + `INSERT` 不会留孤儿边（跨文件入边的 dst 不变）。tk 应在 edges 上加 `ON DELETE` 触发器或显式删跨文件入边（见上 SQL 第一条 `OR dst IN ...`）。

---

#### 6. Navigation 查询 → node:sqlite CTE 等价（serves both surfaces — codemap agent + codeguide human）

gitnexus 的图查询都是 Cypher 单跳或定深。给出 tk 直接可用的 SQL/CTE。

**(a) inter-file CALLS 边**（确认存在 graph-queries.ts:124-141）：

```ts
// 源: src/core/wiki/graph-queries.ts:128-132 [非分发安全]
MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
WHERE a.filePath <> b.filePath
RETURN DISTINCT a.filePath AS fromFile, a.name AS fromName,
       b.filePath AS toFile, b.name AS toName
```

node:sqlite 等价：

```sql
SELECT DISTINCT s.file_path AS fromFile, s.name AS fromName,
                d.file_path AS toFile,   d.name AS toName
FROM edges e
JOIN nodes s ON s.id = e.src
JOIN nodes d ON d.id = e.dst
WHERE e.kind = 'CALLS' AND s.file_path <> d.file_path;
```

**(b) export-surface（文件→导出符号，含类成员）**（确认存在 graph-queries.ts:73-87，UNION + 二跳 HAS_METHOD/HAS_PROPERTY）：

```sql
-- 顶层导出
SELECT f.file_path, n.name, n.kind
FROM edges e JOIN nodes f ON f.id=e.src JOIN nodes n ON n.id=e.dst
WHERE e.kind='DEFINES' AND f.kind='File' AND n.is_exported=1
UNION
-- 导出的类成员（File→DEFINES→Class→HAS_METHOD/HAS_PROPERTY→member）
SELECT f.file_path, m.name, m.kind
FROM edges e1 JOIN nodes f ON f.id=e1.src
     JOIN nodes c ON c.id=e1.dst
     JOIN edges e2 ON e2.src=c.id
     JOIN nodes m ON m.id=e2.dst
WHERE e1.kind='DEFINES' AND f.kind='File'
  AND e2.kind IN ('HAS_METHOD','HAS_PROPERTY') AND m.is_exported=1
ORDER BY 1;
```

**(c) 多跳 callers / callees / impact（递归 CTE — tk 落点 MCP 工具 `who_calls` / `impact_of`）**：gitnexus 走 Kuzu 变长路径（`[:CDG*]` 等），tk 用 WITH RECURSIVE。**必须设深度上限**（gitnexus 在 local-backend.ts:267 用 `depth < 5`；MCP 分页 default 50 / max 200，见 §7）：

```sql
-- 谁（传递地）调用了目标符号 :target —— 反向 CALLS 闭包，封顶 5 跳
WITH RECURSIVE callers(id, depth) AS (
  SELECT :target, 0
  UNION
  SELECT e.src, c.depth + 1
  FROM edges e JOIN callers c ON e.dst = c.id
  WHERE e.kind = 'CALLS' AND c.depth < 5         -- ← gitnexus 的 depth<5 上限
)
SELECT DISTINCT n.id, n.name, n.file_path, n.start_line
FROM callers c JOIN nodes n ON n.id = c.id
WHERE c.id <> :target
LIMIT 200;                                        -- ← gitnexus 的 max-limit
```

```sql
-- impact：目标符号被改动后受影响的传递依赖（正向闭包，跨 CALLS+REFERENCES）
WITH RECURSIVE impacted(id, depth) AS (
  SELECT :target, 0
  UNION
  SELECT e.dst, i.depth + 1
  FROM edges e JOIN impacted i ON e.src = i.id
  WHERE e.kind IN ('CALLS','ACCESSES','EXTENDS','IMPLEMENTS') AND i.depth < 5
)
SELECT DISTINCT n.* FROM impacted i JOIN nodes n ON n.id=i.id WHERE i.id<>:target LIMIT 200;
```

> CTE 用 `UNION`（非 `UNION ALL`）天然去重，等价 gitnexus 内存 BFS 里的 `visited` 集合（import-cycles.ts:26 `parents.has(next)` 守卫）。

**(d) import-cycle 检测**：gitnexus 不用图 DB，而是**取出 File→IMPORTS→File 边后在内存跑 Tarjan SCC**（import-cycles.ts，确认存在）。tk 同理：用上面 (a) 式 SQL 取 `kind='IMPORTS'` 的 file 对，再喂给可直接抄的 `findImportCycles(edges)`（纯函数，无 lbug 依赖，import-cycles.ts:39-110）。

| 抄进来 | 源 |
| --- | --- |
| `findImportCycles` / `findCyclePath`（Tarjan SCC + BFS cycle 还原，纯函数） | src/core/graph/import-cycles.ts:6-110 [非分发安全] |

---

#### 7. 分页 / 上限常量（直接照搬数值，防 token 爆）

gitnexus 的 MCP 工具对每个查询都强制分页上限（确认存在 mcp/tools.ts:62-78）—— tk 的 MCP 工具应照抄这组数：

```ts
// 源: src/mcp/tools.ts:62-78 [非分发安全]
export const LIST_REPOS_DEFAULT_LIMIT = 50;
export const LIST_REPOS_MAX_LIMIT = 200;     // 超过 max 是「拒绝」不是「截断」
export const EXPLAIN_DEFAULT_LIMIT = 50;
export const EXPLAIN_MAX_LIMIT = 200;
export const PDG_QUERY_DEFAULT_LIMIT = 50;   // PDG 边表无二级索引 → 每页必须 anchor+LIMIT
export const PDG_QUERY_MAX_LIMIT = 200;
```

其他散落数值：inter-module call edges `LIMIT 30`（graph-queries.ts:186,197）；processes `limit = 5`（graph-queries.ts:221）/ overview `limit = 20`（graph-queries.ts:276）；scope LRU `maxResidentShards = 64`（scope-index-store.ts:137）；ancestor 链 / community 上溯 `depth < 5`（local-backend.ts:267）。

→ tk 落点 `src/codemap/mcp/limits.ts`：每个 navigation MCP 工具 default 50 / max 200 / 超限拒绝；递归 CTE 深度上限 5。

---

#### 8. 为什么 tk 不抄 Kuzu/lbug 原生绑定（明确论证）

`native-check.ts`（确认存在）本身就是反面教材 —— 它存在的唯一原因是**原生二进制经常装不上**，整个文件是为各种安装失败写的诊断与修复指引：

```ts
// 源: src/core/lbug/native-check.ts:33-44 [非分发安全]
  const binaryPath = path.join(pkgDir, 'lbugjs.node');
  if (!fs.existsSync(binaryPath)) {
    return { ok: false, binaryPath, message: [
      'LadybugDB native binary (lbugjs.node) is missing.',
      'This usually happens when the install lifecycle script was skipped.',
      ...
```

失败面（native-check.ts 列举）：`pnpm dlx`/`pnpx` 默认跳过 build script、`npm 11 bare npx` 会在 gitnexus 跑之前崩、bun 需要 `trustedDependencies`、`.npmrc ignore-scripts`、**ABI mismatch / 跨平台二进制 / 文件截断**（native-check.ts:71-72）。每一条都是 tk 主战场 **VS Code Copilot / Windows** 上的高发安装故障。

**tk 的取舍**：
- tk 是 **zero-runtime-dep TS/Node**，主目标 **Windows**。原生 `.node` 绑定意味着 prebuild 矩阵（win32-x64 / win32-arm64 / darwin…）+ 安装期编译回退（node-gyp + MSVC）—— 与 tk「装上即用、AV 不拦、冷启动快」的分发约束（见 MEMORY: fixes-prioritize-distributed-field / windows-startup-perf-plan）直接冲突。
- **`node:sqlite` 是 Node ≥ 22.5 内置**，零原生编译、零额外依赖、跨平台同一 ABI（随 Node 走），还自带 **FTS5**（gitnexus 没有，靠 `reason` 列硬塞语义且无二级索引）。tk 因此**不损失能力反而多一层全文索引**。
- 代价：放弃 Cypher 变长路径语法糖。tk 用 §6 的 WITH RECURSIVE CTE 补齐 callers/callees/impact，深度封顶 5、行封顶 200 —— 对 navigation/read lane 足够。

> tk 唯一需要确认的同款前置：`node:sqlite` 要求 **Node ≥ 22.5**（与既有 MEMORY: code-graph-design 的 "node:sqlite + Node≥22.5 CONTINGENT on install-base check" 一致）—— 这是 tk 该 gate 的安装基线检查，已在记忆里挂账。

---

#### 抄进来清单

| gitnexus file | tk target | 关键函数 / 常量 |
| --- | --- | --- |
| src/core/lbug/schema.ts:146-491 [非分发安全] | src/codemap/schema.ts（DDL） | `CODE_ELEMENT_BASE`、`RELATION_SCHEMA`（type/confidence/reason/step）、embedding 分表 idea |
| gitnexus-shared/src/lbug/schema-constants.ts:11-90 [非分发安全] | src/codemap/schema.ts（枚举） | `NODE_TABLES`、`REL_TYPES`、`REL_TABLE_NAME` |
| gitnexus-shared/src/graph/types.ts:176-206 [非分发安全] | src/codemap/types.ts | `GraphNode` / `GraphRelationship`（confidence/reason/evidence） |
| src/core/lbug/rel-pair-routing.ts:42-46 [非分发安全] | src/codemap/node-id.ts | `getNodeLabel`（id 前缀=kind 约定） |
| src/core/lbug/lbug-adapter.ts:1530-1576 [非分发安全] | src/codemap/store.ts | `executePrepared`、`executeWithReusedStatement`（→ 单事务批写） |
| src/core/lbug/query-params.ts:16-24 [非分发安全] | src/codemap/store.ts | `isBindableScalar` / `isValidQueryParams` 守卫 |
| src/core/graph/graph.ts:11-182 [非分发安全] | src/codemap/build/graph.ts | 三索引（byType/edgeIdsByNode/nodeIdsByFile）、`removeNodesByFile` |
| src/storage/file-hash.ts:29-104 [非分发安全] | src/codemap/incremental.ts | `computeFileHash`、`diffFileHashes`（BATCH=100） |
| src/core/graph/import-cycles.ts:6-110 [非分发安全] | src/codemap/queries/cycles.ts | `findImportCycles`（纯函数，无 lbug 依赖） |
| src/core/wiki/graph-queries.ts:73-215 [非分发安全] | src/codemap/mcp/*（→ CTE） | inter-file CALLS、export-surface 的 Cypher 范式 |
| src/mcp/tools.ts:62-78 [非分发安全] | src/codemap/mcp/limits.ts | DEFAULT 50 / MAX 200 / 拒绝超限；CTE 深度 5 |
| src/storage/scope-index-store.ts:127-207 [非分发安全]（仅 idea） | （可选）src/codemap/scope-store.ts | LRU shard（maxResidentShards=64）—— 仅超大 repo 需要 |

> 注：scope-index-store 的 disk-backed LRU 是为 **Linux-kernel 级别（17-20 GB scope binding）** 设计的 out-of-core 方案（scope-index-store.ts:11-27）；tk 目标 project-local 中小仓，**默认不需要**，列为可选 idea 而非必抄。

---

### gitnexus · 增量更新与陈旧检测（incremental + staleness）

#### 服务 tk 需求

- **E（按需 lazy 重建，无 daemon）**：gitnexus 的整套增量回写不靠 daemon，而是每次 `analyze` 运行时在内存里 hash-diff → 只 delete-and-rewrite 变化文件的子图。这正是 tk 的 E 决策模型：一次 `tk graph build`（或读时触发）跑全量解析，但只把"变化文件 + 其受影响邻域"写回 SQLite，其余行原封不动保留。核心可直接搬：`computeFileHashes` / `diffFileHashes`（变更检测）、importer-BFS 扩展、`computeEffectiveWriteSet`（边界 1-hop）、`extractChangedSubgraph`（子图抽取）、`deleteNodesForFile`（失效邻域）。
- **J（陈旧横幅 staleness banner）**：`git-staleness.ts` 的 `checkStaleness` 用 `git rev-list --count <lastCommit>..HEAD` 算"索引落后 HEAD 几个 commit"，>0 即给出 `⚠️ Index is N commits behind HEAD. Run analyze...` 文案。tk 的 J 横幅可以 1:1 照搬这个数值口径 + sibling-clone 漂移检测（`checkCwdMatch`）。

> 重要前提（gitnexus 设计写死的）：**pipeline 仍然解析每一个文件**（跨文件解析需要全量数据，这是正确性不变量）；增量只省"DB 写回"那一段。tk 若想做"只解析变化文件"是 gitnexus **没有**做的，属 tk 自有创新，需自己承担跨文件解析失真风险（见 gaps）。

---

#### 可抄代码 1 — 变更检测（SHA-256 per-file + diff）

源: `src/storage/file-hash.ts:29-110` [非分发安全]

```ts
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const computeFileHash = async (absPath: string): Promise<string | null> => {
  try {
    const buf = await fs.readFile(absPath);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null; // 读不到 → 无签名，caller 视作 changed
  }
};

export const computeFileHashes = async (
  repoPath: string,
  relPaths: readonly string[],
): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const BATCH = 100;                              // 数值: 每批 100 文件并行
  for (let i = 0; i < relPaths.length; i += BATCH) {
    const batch = relPaths.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (rel) => {
        const h = await computeFileHash(path.join(repoPath, rel));
        return h ? ([rel, h] as const) : null;
      }),
    );
    for (const r of results) if (r) out.set(r[0], r[1]);
  }
  return out;
};

export interface FileHashDiff {
  changed: string[];   // 内容 hash 变了
  added: string[];     // 当前扫到、stored 里没有
  deleted: string[];   // stored 里有、当前没扫到
  toWrite: string[];   // changed ∪ added（要重写行的）
}

export const diffFileHashes = (
  current: ReadonlyMap<string, string>,
  stored: Readonly<Record<string, string>> | undefined,
): FileHashDiff => {
  const storedMap = new Map<string, string>(stored ? Object.entries(stored) : []);
  const changed: string[] = [];
  const added: string[] = [];
  for (const [p, h] of current) {
    const prev = storedMap.get(p);
    if (prev === undefined) added.push(p);
    else if (prev !== h) changed.push(p);
  }
  const deleted: string[] = [];
  for (const p of storedMap.keys()) {
    if (!current.has(p)) deleted.push(p);
  }
  changed.sort(); added.sort(); deleted.sort();   // 排序 → 两次同样改动产出相同数组（稳定 log/等价比对）
  return { changed, added, deleted, toWrite: [...changed, ...added].sort() };
};
```

#### 可抄代码 2 — 子图抽取 + 边界 1-hop 扩展（核心算法）

源: `src/core/incremental/subgraph-extract.ts:55-137` [非分发安全]

```ts
const isGraphWide = (label: string): boolean => label === 'Community' || label === 'Process';
// 整图属性边: 验证有效性不取决于端点所在文件 (TAINT_PATH 可被第三文件的中间函数改变而失效)
const isGraphWideRelType = (type: string): boolean => type === 'TAINT_PATH';

const indexNodeFilePaths = (fullGraph: KnowledgeGraph): Map<string, string> => {
  const idx = new Map<string, string>();
  fullGraph.forEachNode((n: GraphNode) => {
    const fp = n.properties?.filePath as string | undefined;
    if (fp) idx.set(n.id, fp);
  });
  return idx;
};

export const extractChangedSubgraph = (
  fullGraph: KnowledgeGraph,
  toWriteSet: ReadonlySet<string>,
): KnowledgeGraph => {
  const sub = createKnowledgeGraph();
  const writableNodeIds = new Set<string>();
  fullGraph.forEachNode((n: GraphNode) => {
    const filePath = n.properties?.filePath as string | undefined;
    const include = (filePath && toWriteSet.has(filePath)) || isGraphWide(n.label);
    if (include) { sub.addNode(n); writableNodeIds.add(n.id); }
  });
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    // 至少一个端点在可写集 → 收进子图; 两端都是未变文件的边跳过(DB里还在,重插会PK冲突)
    if (writableNodeIds.has(r.sourceId) || writableNodeIds.has(r.targetId) || isGraphWideRelType(r.type)) {
      sub.addRelationship(r);
    }
  });
  return sub;
};

// 边界 1-hop: toWriteSet 沿"跨可写边界的边"扩一跳, 把未变那侧文件也拉进来
// (barrel re-export 改了 → A→B 旧边留在DB, A→D 新边因两端都不可写被跳过 → 两边都失真)
export const computeEffectiveWriteSet = (
  fullGraph: KnowledgeGraph,
  toWriteSet: ReadonlySet<string>,
): Set<string> => {
  const nodeFilePaths = indexNodeFilePaths(fullGraph);
  const expanded = new Set<string>(toWriteSet);
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    const sourcePath = nodeFilePaths.get(r.sourceId);
    const targetPath = nodeFilePaths.get(r.targetId);
    if (!sourcePath || !targetPath) return;       // 跳过到整图节点的边
    const sourceWritable = toWriteSet.has(sourcePath);
    const targetWritable = toWriteSet.has(targetPath);
    if (sourceWritable && !targetWritable) expanded.add(targetPath);
    else if (targetWritable && !sourceWritable) expanded.add(sourcePath);
  });
  return expanded;
};
```

> 关键不变量（gitnexus 注释明文，tk 必须照做）：`extractChangedSubgraph` **故意不自己扩集合**；扩集合是 orchestrator 的事，这样**同一个 `effectiveWriteSet` 同时喂给 delete 和 extract** —— delete 集和 write 集不对称会静默损坏 DB（留下陈旧行 或 COPY 时 PK 冲突）。

#### 可抄代码 3 — orchestrator 编排（importer-BFS + 删除 + 抽取）

源: `src/core/run-analyze.ts:1019-1130` [非分发安全]（关键节选，已读确认）

```ts
const MAX_IMPORTER_BFS_DEPTH = 4;                 // 数值: BFS 深度上限 4
const writableFiles = new Set<string>(hashDiff.toWrite);
const directlyChangedCount = writableFiles.size;

// shadow-seed: ADDED 文件的 queryImporters 返回 0(新文件还没 IMPORTS 行),
// 但旧文件可能有"被新文件抢走解析归属"的 import → 把候选种进 BFS frontier
const priorFileSet = new Set<string>(
  existingMeta?.fileHashes ? Object.keys(existingMeta.fileHashes) : [],
);
const shadowSeed: string[] = [];
for (const added of hashDiff.added) {
  for (const cand of shadowCandidatesFor(added)) {
    if (priorFileSet.has(cand) && !writableFiles.has(cand)) shadowSeed.push(cand);
  }
}

// importer-BFS: 把变化/删除文件的传递 importer 拉进可写集 (读 pre-pipeline DB 的 IMPORTS)
let frontier: string[] = [...hashDiff.toWrite, ...hashDiff.deleted, ...shadowSeed];
for (let depth = 0; depth < MAX_IMPORTER_BFS_DEPTH && frontier.length > 0; depth++) {
  const nextFrontier: string[] = [];
  for (const f of frontier) {
    try {
      const importers = await queryImporters(f);
      for (const i of importers) {
        if (!writableFiles.has(i)) { writableFiles.add(i); nextFrontier.push(i); }
      }
    } catch { /* 单文件查询失败 → 跳过; 该分支正确性降级但 DB 仍可写 */ }
  }
  frontier = nextFrontier;
}

// 1. 边界 1-hop 再扩一层 → effectiveWriteSet
const effectiveWriteSet = computeEffectiveWriteSet(pipelineResult.graph, writableFiles);
// 2. 删除: effectiveWriteSet ∪ deleted (去重, 避免对同一文件删两次)
const filesToDelete = [...new Set([...effectiveWriteSet, ...hashDiff.deleted])];
for (const f of filesToDelete) {
  try { await deleteNodesForFile(f); } catch { /* 该文件可能没有行(无法解析的文件) — 正常 */ }
}
// 2b. 整图节点全删重建 (Community/Process; pdg 开时还有 TAINT_PATH)
await deleteAllCommunitiesAndProcesses();
// 3. 抽取变化子图 → 只写它; 未变文件的行在 DB 里原样不动
const subgraph = extractChangedSubgraph(pipelineResult.graph, effectiveWriteSet);
await loadGraphToLbug(subgraph, ...);
```

#### 可抄代码 4 — shadow-candidate（新增文件抢解析归属）

源: `src/core/incremental/shadow-candidates.ts:38-76` [非分发安全]

```ts
const SHADOW_EXTS = ['.d.ts', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

export const shadowCandidatesFor = (added: string): string[] => {
  const ext = SHADOW_EXTS.find((e) => added.endsWith(e));
  if (!ext) return [];
  const noExt = added.slice(0, -ext.length);
  const out = new Set<string>();
  // (a) 同 basename 不同扩展名: foo/bar.ts 遮蔽 foo/bar.{tsx,js,...}
  for (const alt of SHADOW_EXTS) if (alt !== ext) out.add(noExt + alt);
  // (b) 裸文件优先于目录 index: foo/bar.ts 遮蔽 foo/bar/index.{...}
  for (const idx of SHADOW_EXTS) { out.add(`${noExt}/index${idx}`); out.add(`${noExt}\\index${idx}`); }
  // (c) 新 foo/index.ext 遮蔽旧 foo.ext
  let dir: string | null = null;
  if (noExt.endsWith('/index')) dir = noExt.slice(0, -'/index'.length);
  else if (noExt.endsWith('\\index')) dir = noExt.slice(0, -'\\index'.length);
  if (dir !== null) for (const alt of SHADOW_EXTS) out.add(dir + alt);
  return [...out];
};
```

#### 可抄代码 5 — staleness 横幅（J）

源: `src/core/git-staleness.ts:23-46` [非分发安全]

```ts
export function checkStaleness(repoPath: string, lastCommit: string): StalenessInfo {
  try {
    const result = execFileSync('git', ['rev-list', '--count', `${lastCommit}..HEAD`], {
      cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    }).trim();
    const commitsBehind = parseInt(result, 10) || 0;
    if (commitsBehind > 0) {
      return {
        isStale: true, commitsBehind,
        hint: `⚠️ Index is ${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind HEAD. Run analyze tool to update.`,
      };
    }
    return { isStale: false, commitsBehind: 0 };
  } catch { return { isStale: false, commitsBehind: 0 }; }
}
```
源: `src/storage/git.ts:22-39` [非分发安全]（记录 lastCommit 用，`windowsHide: true` + `stdio: ['ignore','pipe','ignore']` 抑制 stderr 泄漏，对 tk Windows 主战场重要）

```ts
export const getCurrentCommit = (repoPath: string): string => {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: repoPath, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).toString().trim();
  } catch { return ''; }
};
```

---

#### node:sqlite 适配（typed property graph: nodes / edges）

tk 表结构假定：`nodes(id, kind, file_path, start_line, ...)`、`edges(kind, src, dst, provenance)`，`src/dst` 是 `nodes.id`。

**1. queryImporters → IMPORTS 边反查**（gitnexus Cypher `MATCH (a)-[IMPORTS]->(b) WHERE b.filePath=? RETURN a.filePath`）。tk 的 edges 端点是 node id，需 join 两侧 nodes 取 file_path：

```sql
-- 谁 import 了 :target_file (读 pre-rebuild 的旧 DB 状态)
SELECT DISTINCT ns.file_path AS importer
FROM edges e
JOIN nodes ns ON ns.id = e.src
JOIN nodes nd ON nd.id = e.dst
WHERE e.kind = 'IMPORTS' AND nd.file_path = :target_file
  AND ns.file_path IS NOT NULL AND ns.file_path <> :target_file;
```

**2. importer-BFS（深度 ≤ 4）→ WITH RECURSIVE CTE**，一条 SQL 直接算出可写集，省掉 JS 里的逐层循环：

```sql
WITH RECURSIVE
  seed(file_path) AS (
    -- changed ∪ added ∪ deleted ∪ shadow-seed 一次性灌入(应用层 bind 多行 VALUES)
    SELECT value FROM json_each(:seed_files_json)
  ),
  importers(file_path, depth) AS (
    SELECT file_path, 0 FROM seed
    UNION                                  -- UNION 去重 = 天然 visited 集
    SELECT ns.file_path, imp.depth + 1
    FROM importers imp
    JOIN nodes nd ON nd.file_path = imp.file_path
    JOIN edges e  ON e.dst = nd.id AND e.kind = 'IMPORTS'
    JOIN nodes ns ON ns.id = e.src
    WHERE imp.depth < 4                    -- MAX_IMPORTER_BFS_DEPTH = 4
      AND ns.file_path IS NOT NULL
  )
SELECT DISTINCT file_path FROM importers;  -- = writableFiles
```

**3. computeEffectiveWriteSet（边界 1-hop）→ 纯 SQL**，对新图的边求"一端可写、一端未变"的未变侧：

```sql
-- :writable_json = 上一步 writableFiles 的 JSON 数组
WITH w(fp) AS (SELECT value FROM json_each(:writable_json))
SELECT DISTINCT
  CASE WHEN ns.file_path IN (SELECT fp FROM w) THEN nd.file_path
       ELSE ns.file_path END AS pull_in
FROM edges e
JOIN nodes ns ON ns.id = e.src
JOIN nodes nd ON nd.id = e.dst
WHERE ns.file_path IS NOT NULL AND nd.file_path IS NOT NULL
  AND ( (ns.file_path IN (SELECT fp FROM w)) <> (nd.file_path IN (SELECT fp FROM w)) ); -- XOR: 恰好一端可写
-- effectiveWriteSet = writableFiles ∪ 本查询结果
```

**4. deleteNodesForFile → 失效邻域删除**（gitnexus 用 `DETACH DELETE`，SQLite 用外键 cascade 或显式两步）：

```sql
-- 先删该文件所有节点的边(两侧任一端属于该文件的边)
DELETE FROM edges
WHERE src IN (SELECT id FROM nodes WHERE file_path = :file)
   OR dst IN (SELECT id FROM nodes WHERE file_path = :file);
-- 再删节点
DELETE FROM nodes WHERE file_path = :file;
-- 若 nodes 有 FTS5 影子表, 同步删: DELETE FROM nodes_fts WHERE rowid IN (...);
```
> 注：gitnexus `DETACH DELETE` 只删"挂在被删节点上的边"。tk 的边表两端都引用要删的节点，所以删边条件用 `src IN ... OR dst IN ...` 覆盖入边出边。**强烈建议** `edges(src)`、`edges(dst)`、`edges(kind)`、`nodes(file_path)` 都建索引，否则 BFS / boundary 查询全表扫。

**5. 整图节点全删重建**（Community/Process/TAINT_PATH 等整图属性）：

```sql
DELETE FROM edges WHERE kind = 'TAINT_PATH';                 -- 仅 pdg 开时
DELETE FROM nodes WHERE kind IN ('Community', 'Process');    -- 每次增量都重建
```

**6. staleness 横幅（J）**：纯 git CLI，无 SQL；从 `meta` 表（或 `~/.token-killer/<repo>/meta.json`）读 `last_commit`，跑 `git rev-list --count <last_commit>..HEAD`，>0 即渲染横幅。tk 可把 `last_commit` 存 SQLite 单行 meta 表：`SELECT last_commit FROM repo_meta LIMIT 1;`

---

#### tk 落点

| gitnexus 来源 | tk 目标文件 / MCP-tool | 关键函数 |
| --- | --- | --- |
| `src/storage/file-hash.ts` | `src/graph/incremental/file-hash.ts` | `computeFileHash` / `computeFileHashes` (BATCH=100) / `diffFileHashes` |
| `src/core/incremental/subgraph-extract.ts` | `src/graph/incremental/subgraph.ts` | `extractChangedSubgraph` / `computeEffectiveWriteSet` / `indexNodeFilePaths` |
| `src/core/incremental/shadow-candidates.ts` | `src/graph/incremental/shadow.ts` | `shadowCandidatesFor` (SHADOW_EXTS) |
| `run-analyze.ts:1019-1130` 编排 | `src/graph/build.ts`（lazy-on-read 入口，无 daemon） | importer-BFS（改用 §node:sqlite-2 递归 CTE）+ delete + extract 编排 |
| `lbug-adapter.ts:1957` queryImporters | 被 §node:sqlite-1/2 的 SQL 取代（不需要 Cypher） | — |
| `lbug-adapter.ts:1872` deleteNodesForFile | §node:sqlite-4 SQL | — |
| `src/core/git-staleness.ts:23` | `src/graph/staleness.ts` → MCP-tool `graph_status` / 读时横幅 | `checkStaleness` / `checkStalenessAsync` / `checkCwdMatch`（sibling-clone 漂移） |
| `src/storage/git.ts:22` getCurrentCommit | `src/graph/git.ts` | `getCurrentCommit`（保留 windowsHide + stderr 抑制） |

#### 具体数值（gitnexus 实测口径）

- `BATCH = 100`：每批并行 hash 100 个文件。
- `MAX_IMPORTER_BFS_DEPTH = 4`：importer-BFS 深度上限（够覆盖嵌套 barrel 链 `index.ts → sub/index.ts → sub/impl.ts`，又不至于在深 re-export 金字塔的 monorepo 上退化成近全量重建；超过此深度时"增量 ≡ 全量"是 best-effort，`--force` 是逃生口）。
- `INCREMENTAL_SCHEMA_VERSION = 1`（`repo-manager.ts:216`）：增量不变量变更时 bump，mismatch 强制全量重建。
- 收益口径：25K 节点 repo 全量 CSV COPY 约 **~50s**，增量只删改变化文件行。
- staleness 阈值：`commitsBehind > 0` 即 stale。
- 增量**资格门槛**（`run-analyze.ts:917`，tk 须照抄成自己的 gate）：`!force && existingMeta 存在 && schemaVersion 匹配 && fileHashes 非空 && repoHasGit && allFilePaths>0`，否则走全量。

#### 崩溃恢复（dirty flag，对 tk lazy-on-read 同样关键）

源: `run-analyze.ts:939-947` + `repo-manager.ts:100-105` [非分发安全] —— 任何破坏性 DB 改动**之前**先写 `incrementalInProgress: { startedAt, toWriteCount }` 进 meta；成功时清除。若中途崩溃，下次运行看到该 flag 就**强制全量重建**（避免半写的 DB 被下次"clean-tree 快路径"误认为有效）。tk 的 SQLite 方案应放进事务（gitnexus 用 dirty-flag 是因为 Kuzu COPY 非事务；tk 用 node:sqlite 可直接 `BEGIN/COMMIT` 包住 delete+insert，崩溃自动回滚 —— 见 gaps）。

---

### gitnexus · token-economy 杠杆（precompute-over-compress · grep 增强 · impact）

服务 tk 需求：**G**（buildContext / 省 token 的上下文装配）+ **B**（agent 找代码、少跑 grep）。核心思路就一句话：**把 agent 一次 grep 命中的符号，预编译好的 callers/callees/process 关系直接贴回去**——一次图查询替代 agent 后续 5～10 次 grep；以及 **一个 `tk_impact` 工具替代「改这个函数前先 grep 谁调它」的整轮反复**。所有 gitnexus 代码用 Kuzu/Cypher，下方每条都给了 node:sqlite 的 `edges(src,dst,kind)` 等价 SQL/CTE。

---

#### 1. grep-result 增强引擎（native_augment）——服务 B/G

gitnexus 的 `augment(pattern, cwd)` 就是「agent 跑 grep/glob/read 时，PreToolUse hook 注入一段图上下文」的快路径。设计约束直接抄进 tk 的 buildContext：**只用 BM25/FTS（不碰 embedding）求快、cluster 只内部排序绝不输出、输出纯关系、任何错误 → 返回空串（绝不破坏原工具）**。性能目标 cold <500ms / warm <200ms。

可抄代码（输出装配 + graceful failure 结构）：

源: src/core/augmentation/engine.ts:86-101, 296-322 [非分发安全]
```ts
export async function augment(pattern: string, cwd?: string): Promise<string> {
  if (!pattern || pattern.length < 3) return '';

  const patternFirstWord = pattern.trim().replace(/'/g, "''").split(/\s+/)[0];
  if (!patternFirstWord || patternFirstWord.length < 2) return '';
  // ... (BM25 → symbolMatches → batch callers/callees/processes/cohesion) ...

    if (enriched.length === 0) return '';

    // Step 4: Rank by cohesion (internal signal) and format
    enriched.sort((a, b) => b.cohesion - a.cohesion);

    const lines: string[] = [`[GitNexus] ${enriched.length} related symbols found:`, ''];
    for (const item of enriched) {
      lines.push(`${item.name} (${item.filePath})`);
      if (item.callers.length > 0) lines.push(`  Called by: ${item.callers.join(', ')}`);
      if (item.callees.length > 0) lines.push(`  Calls: ${item.callees.join(', ')}`);
      if (item.processes.length > 0) lines.push(`  Flows: ${item.processes.join(', ')}`);
      lines.push('');
    }
    return lines.join('\n').trim();
  } catch {
    // Graceful failure — never break the original tool
    return '';
  }
}
```

关键数值（gitnexus 实测的 cap，直接照搬到 tk 以控 token）：BM25 取 **top 10**，只对前 **5** 个文件结果映射符号，每文件 **LIMIT 3** 符号；去重后只 enrich **前 5** 个符号；callers/callees 各批量 **LIMIT 15**，每符号输出只留 **前 3** 个 caller / **前 3** 个 callee（`.slice(0,3)`）；pattern 短于 3 字符 / 首词短于 2 字符直接 return ''。

**关键设计点**：所有关系是 **batch 一次性取**（`WHERE n.id IN [...]` + 一条 Map 聚合），而不是 per-symbol 逐个查——这是 token/延迟双优化，tk 必须照做。

node:sqlite 适配（batch callers/callees，对应 engine.ts:185-228 的两条 Cypher）：
```sql
-- callers of a set of symbol ids (upstream)，对应 (caller)-[:CALLS]->(n)
SELECT e.dst AS targetId, c.name AS name
FROM edges e JOIN nodes c ON c.id = e.src
WHERE e.kind = 'CALLS' AND e.dst IN (/* idList */)
LIMIT 15;

-- callees (downstream)，对应 (n)-[:CALLS]->(callee)
SELECT e.src AS sourceId, c.name AS name
FROM edges e JOIN nodes c ON c.id = e.dst
WHERE e.kind = 'CALLS' AND e.src IN (/* idList */)
LIMIT 15;
```
BM25 那步在 tk 用 FTS5：`SELECT rowid, file_path, bm25(nodes_fts) AS score FROM nodes_fts WHERE nodes_fts MATCH ? LIMIT 10;`，再 `nodes.name LIKE '%'||?||'%'` 映射到符号（对应 engine.ts FTS 不可用时的 `name CONTAINS` 回退）。

tk 落点：成为 `src/codemap/augment.ts`，由 buildContext（需求 G）调用，并挂到 VS Code Copilot 的 PreToolUse hook（tk 已有 hook 基建 `src/hook/`）——agent 跑 grep 时把这段关系块追加进 tool 结果。cohesion 排序里的 community/cohesion tk 可先不做（标 gap），改用「callers 数」当排序信号。

---

#### 2. 预编译图查询（precompute-over-compress）——服务 G/B

`graph-queries.ts` 是「与其压缩 agent 反复跑的查询，不如把常用查询预编译成函数」的范本。对 tk 最值钱的三条：导出符号清单、跨文件调用边、经过某组文件的执行流。

可抄代码（跨文件调用边——「谁跨文件调谁」一次出全图）：

源: src/core/wiki/graph-queries.ts:124-141 [非分发安全]
```ts
export async function getInterFileCallEdges(): Promise<CallEdge[]> {
  const rows = await executeQuery(
    REPO_ID,
    `
    MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
    WHERE a.filePath <> b.filePath
    RETURN DISTINCT a.filePath AS fromFile, a.name AS fromName,
           b.filePath AS toFile, b.name AS toName
  `,
  );
  return rows.map((r) => ({ fromFile: r[0], fromName: r[1], toFile: r[2], toName: r[3] }));
}
```

可抄代码（导出符号清单——含顶层导出 + 导出类成员的 UNION）：

源: src/core/wiki/graph-queries.ts:73-104 [非分发安全]
```ts
export async function getFilesWithExports(): Promise<FileWithExports[]> {
  const rows = await executeQuery(REPO_ID, `
    MATCH (f:File)-[:CodeRelation {type: 'DEFINES'}]->(n)
    WHERE n.isExported = true
    RETURN f.filePath AS filePath, n.name AS name, labels(n)[0] AS type
    UNION
    MATCH (f:File)-[:CodeRelation {type: 'DEFINES'}]->(c)-[mr:CodeRelation]->(n)
    WHERE mr.type IN ['HAS_METHOD', 'HAS_PROPERTY'] AND n.isExported = true
    RETURN f.filePath AS filePath, n.name AS name, labels(n)[0] AS type
    ORDER BY filePath
  `);
  // ... group rows into Map<filePath, {symbols:[{name,type}]}> ...
}
```

关键数值：inter-module 边查询 outgoing/incoming 各 `LIMIT 30`（graph-queries.ts:187,198）；processes-for-files 默认 `limit=5`、all-processes 默认 `limit=20`，均 `ORDER BY stepCount DESC`（只取最重的几条流，控 token）。

node:sqlite 适配（inter-file call edges）：
```sql
SELECT DISTINCT sf.file_path AS fromFile, s.name AS fromName,
                df.file_path AS toFile, d.name AS toName
FROM edges e
JOIN nodes s ON s.id = e.src
JOIN nodes d ON d.id = e.dst
WHERE e.kind = 'CALLS' AND s.file_path <> d.file_path;
```
导出清单（UNION 顶层导出 + 类成员，tk schema 里 `kind='DEFINES'`/`'HAS_METHOD'`/`'HAS_PROPERTY'`，`is_exported` 列）：
```sql
SELECT f.file_path, n.name, n.kind FROM edges d
  JOIN nodes f ON f.id = d.src JOIN nodes n ON n.id = d.dst
  WHERE d.kind='DEFINES' AND n.is_exported=1
UNION
SELECT f.file_path, n.name, n.kind FROM edges d
  JOIN nodes f ON f.id=d.src JOIN nodes c ON c.id=d.dst
  JOIN edges m ON m.src=c.id JOIN nodes n ON n.id=m.dst
  WHERE d.kind='DEFINES' AND m.kind IN ('HAS_METHOD','HAS_PROPERTY') AND n.is_exported=1
ORDER BY 1;
```

tk 落点：这些是 `src/codemap/queries.ts` 里的命名预编译查询，被 buildContext（G）和 repo-map 生成消费。「DB 连接长驻」机制（`pinWikiDb()`/`touchWikiDb()` 防 LLM 长调用期间 DB 被 LRU 回收）对 tk 的「per-session MCP server」直接对应：tk 的 node:sqlite 句柄在一个 MCP session 内 pin 住，别每次工具调用都重开（标 §11 measurement 时这是冷启动税的来源）。

---

#### 3. blast-radius BFS（`tk_impact` 工具的核心）——服务 B/G

「改这个函数会炸到谁」——gitnexus 的本地单仓 impact 是分层 BFS over CALLS/IMPORTS/EXTENDS/... 边，**一次工具调用替代 agent 改前手动 grep 10 次**。这是 token-economy 最大的单点杠杆。注意区分：`cross-impact.ts`（你点名读的）是**跨仓 group 级**的 Phase-2 fan-out（contract bridge DB），对 tk 单仓**用不上**；真正可抄的本地 BFS 在 `local-backend.ts` 的 `_runImpactBFS`。

可抄代码（分层 BFS 主循环 + 方向切换 + 去重 frontier）：

源: src/mcp/local/local-backend.ts:4716-4770 [非分发安全]
```ts
for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
  const nextFrontier: string[] = [];
  const query =
    direction === 'upstream'
      ? `MATCH (caller)-[r:CodeRelation]->(n) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, caller.id AS id, caller.name AS name, labels(caller)[0] AS type, caller.filePath AS filePath, r.type AS relType, r.confidence AS confidence`
      : `MATCH (n)-[r:CodeRelation]->(callee) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, callee.id AS id, callee.name AS name, labels(callee)[0] AS type, callee.filePath AS filePath, r.type AS relType, r.confidence AS confidence`;
  try {
    const related = await executeParameterized(repo.lbugPath, query, {
      frontierIds: frontier, relTypes: relationTypes,
      ...(safeMinConfidence > 0 ? { minConfidence: safeMinConfidence } : {}),
    });
    for (const rel of related) {
      const relId = rel.id || rel[1];
      const filePath = rel.filePath || rel[4] || '';
      if (!includeTests && isTestFilePath(filePath)) continue;
      if (!visited.has(relId)) {
        visited.add(relId);
        nextFrontier.push(relId);
        const storedConfidence = rel.confidence ?? rel[6];
        const relationType = rel.relType || rel[5];
        const effectiveConfidence =
          typeof storedConfidence === 'number' && storedConfidence > 0
            ? storedConfidence : confidenceForRelType(relationType);
        impacted.push({ depth, id: relId, name: rel.name || rel[2],
          type: rel.type || rel[3], filePath, relationType, confidence: effectiveConfidence });
      }
    }
  } catch (e) {
    logQueryError('impact:depth-traversal', e);
    traversalComplete = false;  // partial results, don't swallow (#321)
    break;
  }
  frontier = nextFrontier;
}
```

可抄代码（risk 评分阈值 —— tk 直接照搬，这是把 impactedCount 翻译成 agent 能用的 LOW/MEDIUM/HIGH/CRITICAL）：

源: src/mcp/local/local-backend.ts:5050-5065 [非分发安全]
```ts
const processCount = affectedProcesses.length;
const moduleCount = affectedModules.length;
let risk = 'LOW';
if (directCount >= 30 || processCount >= 5 || moduleCount >= 5 || impacted.length >= 200) {
  risk = 'CRITICAL';
} else if (directCount >= 15 || processCount >= 3 || moduleCount >= 3 || impacted.length >= 100) {
  risk = 'HIGH';
} else if (directCount >= 5 || impacted.length >= 30) {
  risk = 'MEDIUM';
}
```

可抄代码（每种关系的 confidence 下限表 + 回退 0.5 —— tk 排序/过滤直接用）：

源: src/mcp/local/local-backend.ts:220-238 [非分发安全]
```ts
export const IMPACT_RELATION_CONFIDENCE: Readonly<Record<string, number>> = {
  CALLS: 0.9, IMPORTS: 0.9, EXTENDS: 0.85, IMPLEMENTS: 0.85,
  METHOD_OVERRIDES: 0.85, METHOD_IMPLEMENTS: 0.85,
  HAS_METHOD: 0.95, HAS_PROPERTY: 0.95, ACCESSES: 0.8, CONTAINS: 0.95,
};
const confidenceForRelType = (relType: string | undefined): number =>
  IMPACT_RELATION_CONFIDENCE[relType ?? ''] ?? 0.5;
```

关键数值（全部照搬控成本）：`maxDepth` 默认 **3**、上限 **32**（`Math.min(requestedDepth, 32)`，local-backend.ts:4071/4153）；默认 relation 集 = `['CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES','METHOD_OVERRIDES','OVERRIDES','METHOD_IMPLEMENTS']`（4250-4259）；enrichment chunk `CHUNK_SIZE=100`、`MAX_CHUNKS=10`（env `IMPACT_MAX_CHUNKS`）⇒ 最多 enrich **1000** 个符号（4795-4798）；pagination limit clamp 到 `[1,10000]`（4602）；name 撞名歧义时每候选只跑 summary-only BFS，最多 **6** 个候选（`AMBIGUOUS_MAX_CANDIDATES=6`，4312）；local impact wall-clock 默认 **30s**、clamp `[100ms, 5min]`（cross-impact.ts:36,109-115）。`minConfidence<=0` 时**不加** confidence 子句（保留 NULL-confidence 边），别无脑加 `>= 0`（4614-4615）。

**关键正确性点（必抄）**：BFS 失败时设 `partial:true` 返回已收集的部分结果，**绝不静默吞**（#321）；name 撞多个符号时**绝不报 `impactedCount:0`**——那是最危险的假阴性，要 per-候选探测取 max risk（#2129，4302-4311 注释）。tk 的 measurement honesty（§12）需要这两条。

node:sqlite 适配（blast-radius 用递归 CTE 一次出全层，替代逐层 N 次查询；upstream=反向边）：
```sql
-- upstream impact: 谁（递归）依赖 target，CALLS/IMPORTS/... 边，限深 maxDepth
WITH RECURSIVE impact(id, depth) AS (
  SELECT :targetId, 0
  UNION
  SELECT e.src, i.depth + 1
  FROM edges e JOIN impact i ON e.dst = i.id
  WHERE e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES',
                   'METHOD_OVERRIDES','OVERRIDES','METHOD_IMPLEMENTS')
    AND i.depth < :maxDepth
    AND (:minConfidence <= 0 OR e.confidence >= :minConfidence)
)
SELECT n.id, n.name, n.kind, n.file_path, MIN(i.depth) AS depth
FROM impact i JOIN nodes n ON n.id = i.id
WHERE i.id <> :targetId
GROUP BY n.id           -- 等价 visited-set 去重 + 取最浅 depth
ORDER BY depth, n.file_path;
-- downstream（target 调谁）：把 e.dst=i.id 改成 e.src=i.id、SELECT e.dst
```
SQLite 的递归 CTE 用 `UNION`（非 `UNION ALL`）天然去重，等价 gitnexus 的 `visited` set；`MIN(depth)` 等价「首次访问即记深度」。`directCount`（risk 评分要）= `SELECT COUNT(*) FROM (...) WHERE depth=1`。test 文件过滤在外层加 `AND n.file_path NOT LIKE '%test%'`（对应 `isTestFilePath`，tk 需补真实判定）。

tk 落点：成为 **MCP 工具 `tk_impact`**（`src/codemap/impact.ts`），入参 `{target, direction:'upstream'|'downstream', maxDepth=3, relationTypes?, minConfidence=0, includeTests=false}`，出参 `{target, direction, impactedCount, risk, byDepth, partial?}`。这是需求 B「agent 改前评估爆炸半径」的主工具，也给 buildContext（G）当「这个符号有多重要」的信号。

---

#### 4. 拓扑分层排序（graph-sort）——服务 B/G（确定性 + 增量）

`topologicalLevelSort` 用 Kahn 算法在**反向** import 图上分层：同层文件无相互依赖、可并行处理；环里的文件兜底追加到最后一层。tk 两个用途：（a）增量重分析时按「叶子优先」顺序处理文件（上游导出先解析、下游再 re-resolve）；（b）repo-map / wiki 生成时给文件一个**确定性**层序（同层内顺序稳定 → 输出可缓存、A/B 可复现，直接服务 §11 measurement）。

可抄代码（整函数无外部依赖，纯 Map，可整段 copy）：

源: src/core/ingestion/utils/graph-sort.ts:57-109 [非分发安全]
```ts
export function topologicalLevelSort(importMap: ReadonlyMap<string, ReadonlySet<string>>): {
  levels: readonly IndependentFileGroup[];
  cycleCount: number;
} {
  const pendingImportsPerFile = new Map<string, number>();
  const reverseDeps = new Map<string, string[]>();

  for (const [file, deps] of importMap) {
    if (!pendingImportsPerFile.has(file)) pendingImportsPerFile.set(file, 0);
    for (const dep of deps) {
      if (!pendingImportsPerFile.has(dep)) pendingImportsPerFile.set(dep, 0);
      pendingImportsPerFile.set(file, (pendingImportsPerFile.get(file) ?? 0) + 1);
      let rev = reverseDeps.get(dep);
      if (!rev) { rev = []; reverseDeps.set(dep, rev); }
      rev.push(file);
    }
  }

  const levels: string[][] = [];
  let currentLevel = [...pendingImportsPerFile.entries()]
    .filter(([, d]) => d === 0).map(([f]) => f);

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: string[] = [];
    for (const file of currentLevel) {
      for (const dependent of reverseDeps.get(file) ?? []) {
        const newPending = (pendingImportsPerFile.get(dependent) ?? 1) - 1;
        pendingImportsPerFile.set(dependent, newPending);
        if (newPending === 0) nextLevel.push(dependent);
      }
    }
    currentLevel = nextLevel;
  }

  const cycleFiles = [...pendingImportsPerFile.entries()].filter(([, d]) => d > 0).map(([f]) => f);
  if (cycleFiles.length > 0) levels.push(cycleFiles);

  return { levels, cycleCount: cycleFiles.length };
}
```

**关键陷阱（注释里反复警告，tk 别踩）**：计数器名是 `pendingImportsPerFile` **不是** `inDegree`——是在**反向**图上跑 Kahn 才能拿到「叶子优先」。改成正向 in-degree 会翻转成「根优先」，静默破坏跨文件绑定传播。整段连注释一起抄。

node:sqlite 适配：`importMap` 从 `edges` 拉一次即可，排序逻辑留在 TS（纯内存，无需 SQL）：
```sql
-- 构造 importer -> imported 的文件级 import 图喂给 topologicalLevelSort
SELECT s.file_path AS importer, d.file_path AS imported
FROM edges e JOIN nodes s ON s.id=e.src JOIN nodes d ON d.id=e.dst
WHERE e.kind='IMPORTS' AND s.file_path <> d.file_path;
```

tk 落点：整文件搬到 `src/codemap/graph-sort.ts`，被增量索引器（按层调度 re-resolve）和 repo-map 生成器（确定性输出）共用。这是 §11 measurement 想要的「确定性序」基础设施。

---

#### 抄进来清单

| gitnexus 文件 | tk 落点 | 关键函数 / 数值 |
|---|---|---|
| `src/core/augmentation/engine.ts` | `src/codemap/augment.ts`（buildContext + PreToolUse hook） | `augment()`；BM25 top10 / 前5文件 / 每文件3符号 / enrich前5 / callers·callees各LIMIT15·输出.slice(0,3)；错误→'' |
| `src/core/wiki/graph-queries.ts` | `src/codemap/queries.ts`（预编译命名查询） | `getInterFileCallEdges` / `getFilesWithExports` / `getProcessesForFiles(limit=5)`；inter-module LIMIT30；`pinWikiDb`/`touchWikiDb`（session DB 长驻） |
| `src/mcp/local/local-backend.ts` `_runImpactBFS` | `src/codemap/impact.ts`（MCP 工具 `tk_impact`） | 分层BFS主循环（4716-4770）；risk阈值（5050-5065）；`IMPACT_RELATION_CONFIDENCE`+0.5回退（220-238）；maxDepth默认3·上限32；CHUNK_SIZE=100·MAX_CHUNKS=10；歧义6候选；partial不吞、name撞名不报0 |
| `src/core/ingestion/utils/graph-sort.ts` | `src/codemap/graph-sort.ts`（增量调度 + 确定性序） | `topologicalLevelSort()`（整段+注释，反向Kahn、勿改名 inDegree） |
| `src/core/group/cross-impact.ts` | （单仓 tk **不抄**主体；仅借 timeout clamp 模式） | `clampTimeout` `[100ms,5min]`、`DEFAULT_LOCAL_IMPACT_TIMEOUT_MS=30s`、`safeNeighborImpact` 的 AbortController+race（若 tk 给 impact 加超时则借这个壳） |

---

### gitnexus · wiki generation (human narrative)

**总览**: gitnexus 的 wiki 子系统把"类型化属性图"转成人类可读的多页 Markdown wiki + 一个自包含 `index.html`。它是一条确定性的 **graph → prompt → host-LLM → grounded markdown** 流水线。核心洞察(对 tk 极其重要):**图查询、文件分组的树形结构、增量更新策略、provenance 注入全部是 gitnexus 自己写的确定性代码;只有"把图事实写成散文"这一步才调用 LLM**。而且 gitnexus 的 LLM 调用**优先路由到用户本机已认证的 host CLI**(`claude` / `codex` / `opencode` / `cursor`),而非内嵌 API key——这正是 tk 的 H/I 决策"借宿主 LLM,不自带"的现成实现。

---

#### 服务 tk 的需求

- **H(人类叙事 wiki)**: 这是整章的主线。gitnexus 给出完整的"控制文件模型 + 自底向上生成 + 自包含 HTML viewer"。tk 的 `.tk/wiki.json` 控制文件可直接对应 gitnexus 的 `meta.json` + `module_tree.json` 双文件模型。
- **A(人类理解+协作)**: module tree(把扁平文件聚类成 5–15 个语义模块)、overview 页(10 秒看懂架构)、parent/leaf 分层叙事,都是"让人快速理解仓库"的产物。
- **I(host-borrowed LLM,derive+validate not hallucinate)**: `local-cli-client.ts` 是把叙事步骤路由给宿主 CLI 的标准做法。prompt 里反复强调"reference actual function names — do NOT invent APIs",并把 call-graph/process 作为 grounding 事实注入——这是 tk"派生+校验,不幻觉"的 prompt 契约范本。

---

#### 流水线四阶段(generator.ts)

源: `src/core/wiki/generator.ts:1-11`(文件头注释,已读)描述四阶段:

- **Stage 0 Gather**: `getFilesWithExports()` + `getAllFiles()`,用 `shouldIgnorePath` 过滤非源码,把 exports 合并进 enriched file list。
- **Stage 1 Build module tree**: 1 次 LLM 调用,把文件分组成模块;超 token 预算的模块按子目录拆分成 children。产物落 `first_module_tree.json`(不可变快照,可断点续跑)+ `module_tree.json`(可被用户手改)。
- **Stage 2 Generate pages(自底向上)**: 叶子模块并行(读源码+图事实→1 次 LLM/模块),父模块串行(只综合 children 文档,不重读源码)。
- **Stage 3 Overview**: 读各模块 overview 段 + inter-module edges + top processes → 顶层 architecture 页。

**关键: provenance 注入** —— 每个叶子页的 prompt 同时喂入"源码 + intra/outgoing/incoming call edges + execution flows(processes)",并在 system prompt 里明令"Use the call graph and execution flow data for accuracy"且"do NOT invent APIs"。这就是 gitnexus 让 LLM 输出"扎根于图"的机制:**事实由图提供,LLM 只负责措辞**。

可抄代码(叶子页生成,展示事实注入契约):

```ts
// 源: src/core/wiki/generator.ts:843-881 [非分发安全]
private async generateLeafPage(node: ModuleTreeNode): Promise<void> {
  const filePaths = node.files;
  const sourceCode = await this.readSourceFiles(filePaths);
  const totalTokens = estimateTokens(sourceCode);
  let finalSourceCode = sourceCode;
  if (totalTokens > this.maxTokensPerModule) {
    finalSourceCode = this.truncateSource(sourceCode, this.maxTokensPerModule);
  }
  const [intraCalls, interCalls, processes] = await Promise.all([
    getIntraModuleCallEdges(filePaths),
    getInterModuleCallEdges(filePaths),
    getProcessesForFiles(filePaths, 5),
  ]);
  const prompt = fillTemplate(MODULE_USER_PROMPT, {
    MODULE_NAME: node.name,
    SOURCE_CODE: finalSourceCode,
    INTRA_CALLS: formatCallEdges(intraCalls),
    OUTGOING_CALLS: formatCallEdges(interCalls.outgoing),
    INCOMING_CALLS: formatCallEdges(interCalls.incoming),
    PROCESSES: formatProcesses(processes),
  });
  const response = await this.invokeLLM(
    prompt, this.buildSystemPrompt(MODULE_SYSTEM_PROMPT), this.streamOpts(node.name),
  );
  // H1 uses the English module name (stable slug source); body is LLM-translated.
  const pageContent = sanitizeMermaidMarkdown(`# ${node.name}\n\n${response.content}`);
  await fs.writeFile(path.join(this.wikiDir, `${node.slug}.md`), pageContent, 'utf-8');
}
```

---

#### 控制文件模型(对应 tk 的 `.tk/wiki.json`)

gitnexus 用**三件套**而非单一控制文件:

- `meta.json` ↔ `WikiMeta`:记录 `fromCommit`、`generatedAt`、`model`、`lang`、`moduleFiles`(module→files 映射,增量更新用)、`moduleTree`。
- `module_tree.json`:**人可手改**的模块树(支持 `--review` 工作流——先停在树这步让用户编辑,再生成正文)。
- `first_module_tree.json`:不可变快照,断点续跑/`--force` 重分组时删除。

可抄代码(WikiMeta + ModuleTreeNode 类型,tk 的 `wiki.json` schema 蓝本):

```ts
// 源: src/core/wiki/generator.ts:80-103 [非分发安全]
export interface WikiMeta {
  fromCommit: string;
  generatedAt: string;
  model: string;
  lang: string;
  moduleFiles: Record<string, string[]>;
  moduleTree: ModuleTreeNode[];
}
export interface ModuleTreeNode {
  name: string;
  slug: string;
  files: string[];
  children?: ModuleTreeNode[];
}
export interface WikiRunResult {
  pagesGenerated: number;
  mode: 'full' | 'incremental' | 'up-to-date';
  failedModules: string[];
  moduleTree?: ModuleTreeNode[];
}
```

**tk 落点**: 合并成单一 `.tk/wiki.json`,内含 `{ fromCommit, generatedAt, model, lang, moduleTree, moduleFiles }`;页面正文写 `.tk/wiki/<slug>.md`;`first_module_tree.json` 可降级为 `.tk/wiki.json` 里的 `pinnedTree` 字段(避免多文件)。

---

#### LLM 在哪里(诚实标注 + tk 必须改造的点)

gitnexus 在**四个**地方调 LLM,全部经 `invokeLLM()` 路由:
1. **分组**(GROUPING):文件→模块,JSON 输出。
2. **叶子页**(MODULE):源码+图→散文。
3. **父页**(PARENT):children 文档→综合散文。
4. **Overview**(OVERVIEW):模块摘要+边→顶层散文。

**对 tk 的诚实结论**:
- 分组(1)严格来说**不需要 LLM**——gitnexus 自己就有 `fallbackGrouping()`(按顶级目录分组)和 `splitBySubdirectory()`。tk 可以**先用确定性目录分组,LLM 仅做可选 refine**,从而让 wiki 在无 host LLM 时仍可生成(degrade gracefully)。
- 叙事(2/3/4)**必须**有 LLM。tk 的 I 决策正确:把这步**路由给宿主**,绝不内嵌 key。`local-cli-client.ts` 是直接可抄的 host-borrow 实现。

可抄代码(provider 路由——tk 的"借宿主 LLM"骨架):

```ts
// 源: src/core/wiki/generator.ts:216-249 [非分发安全]
private async invokeLLM(
  prompt: string, systemPrompt: string, options?: CallLLMOptions,
): Promise<LLMResponse> {
  if (this.llmConfig.provider === 'cursor') {
    const cursorConfig = resolveCursorConfig({ model: this.llmConfig.model, workingDirectory: this.repoPath });
    return callCursorLLM(prompt, cursorConfig, systemPrompt, options);
  }
  if (this.llmConfig.provider === 'claude' || this.llmConfig.provider === 'codex' || this.llmConfig.provider === 'opencode') {
    const localConfig = resolveLocalCLIConfig({
      model: this.llmConfig.model, workingDirectory: this.repoPath, requestTimeoutMs: this.llmConfig.requestTimeoutMs,
    });
    if (this.llmConfig.provider === 'claude') return callClaudeLLM(prompt, localConfig, systemPrompt, options);
    if (this.llmConfig.provider === 'codex') return callCodexLLM(prompt, localConfig, systemPrompt, options);
    if (this.llmConfig.provider === 'opencode') return callOpenCodeLLM(prompt, localConfig, systemPrompt, options);
  }
  return callLLM(prompt, this.llmConfig, systemPrompt, options); // OpenAI-compatible HTTP
}
```

可抄代码(把 prompt 喂给宿主 `claude` CLI——tk 主要目标 Claude Code 的现成命令行):

```ts
// 源: src/core/wiki/local-cli-client.ts:95-117 [非分发安全]
export async function callClaudeLLM(
  prompt: string, config: LocalCLIConfig, systemPrompt?: string, options?: CallLLMOptions,
): Promise<LLMResponse> {
  const commandInfo = getDetectedCommand('claude');
  if (!commandInfo) {
    throw new Error('Claude CLI not found. Install Claude Code and ensure `claude` is on PATH.');
  }
  const args = ['-p', '--output-format', 'text', '--no-session-persistence'];
  if (config.model) { args.push('--model', config.model); }
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
  const response = await runLocalCLI('claude', commandInfo, args, config, fullPrompt, options);
  if (!response.content) { throw new Error('claude CLI returned empty output'); }
  return response;
}
```

**Windows 主目标特别注意**: gitnexus 的 `resolveLocalCommand()`(`local-cli-client.ts:390-429`)专门处理 Windows 上 `claude.cmd` 解析——先 `where.exe` 找 npm bin,再直指 `node_modules/@anthropic-ai/claude-code/bin/claude.exe`,最后回退 `cmd.exe /d /s /c`。**prompt 永远走 stdin**(`child.stdin.end(stdinText)`),不放命令行(`maskPromptArgs` 也佐证),避免 Windows 命令行长度/转义/泄露问题。这正是 tk Windows 记忆里反复踩的坑的现成解法。

可抄代码(Windows 命令解析 + stdin 投喂 + 超时杀进程树):

```ts
// 源: src/core/wiki/local-cli-client.ts:390-429 [非分发安全]
function resolveLocalCommand(provider: LocalAgentProvider): LocalCommand {
  const displayName = COMMANDS[provider];
  if (process.platform !== 'win32') {
    return { displayName, command: displayName, argsPrefix: [] };
  }
  const npmBin = findWindowsCommand(`${displayName}.cmd`) || findWindowsCommand(displayName);
  if (npmBin) {
    const binDir = path.dirname(npmBin);
    if (provider === 'claude') {
      const exePath = path.join(binDir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
      if (existsSync(exePath)) { return { displayName, command: exePath, argsPrefix: [] }; }
    }
    if (provider === 'codex') {
      const scriptPath = path.join(binDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (existsSync(scriptPath)) { return { displayName, command: process.execPath, argsPrefix: [scriptPath] }; }
    }
  }
  return { displayName, command: process.env.ComSpec || 'cmd.exe', argsPrefix: ['/d', '/s', '/c', displayName] };
}
```

```ts
// 源: src/core/wiki/local-cli-client.ts:38-51 [非分发安全]
function killChildTree(child: import('child_process').ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true });
      return;
    } catch { /* already exited */ }
  }
  child.kill();
}
```

---

#### grounding / 反幻觉的 prompt 契约(prompts.ts)

这是 tk 的 I 决策"derive+validate not hallucinate"的**直接可抄的散文契约**。gitnexus 把 grounding 完全写进 system prompt + 把图事实作为 `## Reference Data (for accuracy — do not reproduce verbatim)` 注入。

可抄代码(叶子模块 system/user prompt + 反幻觉规则):

```ts
// 源: src/core/wiki/prompts.ts:37-63 [非分发安全]
export const MODULE_SYSTEM_PROMPT = `You are a technical documentation writer. Write clear, developer-focused documentation for a code module.

Rules:
- Output ONLY the documentation content — no meta-commentary like "I've written...", "Here's the documentation...", "The documentation covers...", or similar
- Start directly with the module heading and content
- Reference actual function names, class names, and code patterns — do NOT invent APIs
- Use the call graph and execution flow data for accuracy, but do NOT mechanically list every edge
- Include Mermaid diagrams only when they genuinely help understanding. Keep them small (5-10 nodes max)
- Structure the document however makes sense for this module — there is no mandatory format
- Write for a developer who needs to understand and contribute to this code`;

export const MODULE_USER_PROMPT = `Write documentation for the **{{MODULE_NAME}}** module.

## Source Code

{{SOURCE_CODE}}

## Call Graph & Execution Flows (reference for accuracy)

Internal calls: {{INTRA_CALLS}}
Outgoing calls: {{OUTGOING_CALLS}}
Incoming calls: {{INCOMING_CALLS}}
Execution flows: {{PROCESSES}}

---

Write comprehensive documentation for this module. Cover its purpose, how it works, its key components, and how it connects to the rest of the codebase. Use whatever structure best fits this module — you decide the sections and headings. Include a Mermaid diagram only if it genuinely clarifies the architecture.`;
```

可抄代码(图事实→可读文本的格式化器,确定性、可单测、与 LLM 无关——tk 直接复用):

```ts
// 源: src/core/wiki/prompts.ts:176-214 [非分发安全]
export function formatCallEdges(
  edges: Array<{ fromFile: string; fromName: string; toFile: string; toName: string }>,
): string {
  if (edges.length === 0) return 'None';
  return edges
    .slice(0, 30)  // cap: 最多 30 条边喂给 prompt
    .map((e) => `${e.fromName} (${shortPath(e.fromFile)}) → ${e.toName} (${shortPath(e.toFile)})`)
    .join('\n');
}
export function formatProcesses(
  processes: Array<{ label: string; type: string; steps: Array<{ step: number; name: string; filePath: string }> }>,
): string {
  if (processes.length === 0) return 'No execution flows detected for this module.';
  return processes.map((p) => {
    const stepsText = p.steps.map((s) => `  ${s.step}. ${s.name} (${shortPath(s.filePath)})`).join('\n');
    return `**${p.label}** (${p.type}):\n${stepsText}`;
  }).join('\n\n');
}
function shortPath(fp: string): string {
  const parts = fp.replace(/\\/g, '/').split('/');
  return parts.length > 3 ? parts.slice(-3).join('/') : fp;
}
```

**tk 落点**: 这些 formatter 进 `src/codemap/wiki/prompts.ts`,call edges 由 tk 自己的 `edges` 表查出来(见下 node:sqlite 适配),完全无需移植 gitnexus 的 Kuzu 查询。

---

#### 模块分组 + 自底向上分层(无 LLM 也能跑)

可抄代码(确定性回退分组 + 超大模块按子目录拆分 + 叶/父分层——tk 可在无 host LLM 时仍生成 wiki 骨架):

```ts
// 源: src/core/wiki/generator.ts:791-804 [非分发安全]
private fallbackGrouping(files: FileWithExports[]): Record<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.filePath.replace(/\\/g, '/').split('/');
    const topDir = parts.length > 1 ? parts[0] : 'Root';
    let group = groups.get(topDir);
    if (!group) { group = []; groups.set(topDir, group); }
    group.push(f.filePath);
  }
  return Object.fromEntries(groups);
}
```

```ts
// 源: src/core/wiki/generator.ts:1276-1295 [非分发安全]
private flattenModuleTree(tree: ModuleTreeNode[]): { leaves: ModuleTreeNode[]; parents: ModuleTreeNode[] } {
  const leaves: ModuleTreeNode[] = [];
  const parents: ModuleTreeNode[] = [];
  for (const node of tree) {
    if (node.children && node.children.length > 0) {
      for (const child of node.children) { leaves.push(child); }
      parents.push(node);
    } else { leaves.push(node); }
  }
  return { leaves, parents };
}
```

父页**只综合 children 文档、不重读源码**(省 token + 防漂移):源: `src/core/wiki/prompts.ts:67`(已读)PARENT_SYSTEM_PROMPT 明确 "Synthesize the children's documentation — do not re-read source code"。父页提取 child 的 overview 段用的是字符串切片:`content.indexOf('### Architecture')`,取到该标题前或前 800 字符(源: `generator.ts:896-898`,已读)。

---

#### 增量更新(git diff 驱动,对应 tk 的需求 C)

可抄代码(git diff → 受影响模块 → 仅重生这些页;新文件 >5 触发全量重分组):

```ts
// 源: src/core/wiki/generator.ts:1148-1166 [非分发安全]
private getChangedFiles(fromCommit: string, toCommit: string): string[] | null {
  if (!this.isCommitReachable(fromCommit, toCommit)) {
    return null; // divergent branches → caller falls back to full generation
  }
  try {
    const output = execFileSync('git', ['diff', `${fromCommit}..${toCommit}`, '--name-only'], {
      cwd: this.repoPath, windowsHide: true,
    }).toString().trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return null; // git errors → full regen
  }
}
```

增量决策树(源: `generator.ts:981-1051`,已读):①`isCommitReachable` 用 `git merge-base --is-ancestor` 判断分支是否分叉,分叉→全量;②无改动文件但 commit 变(merge commit)→只更 meta;③遍历 `moduleFiles` 反查每个改动文件归属哪个模块,凑成 `affectedModules`;④`newFiles.length > 5` → 删快照全量重分组;⑤否则把受影响模块页删掉重生 + 重生 overview。**tk 落点**:tk 已有 RepoDoc 风格的 AST-ChangeType 增量(见 MEMORY),此处的"commit-reachable 判断 + moduleFiles 反查"可作为 wiki 层的增量门控,直接套 tk 的 `edges`/`nodes` 已建索引。

---

#### 自包含 HTML viewer(对应 CodeWiki self-contained index.html 这一层)

`generateHTMLViewer()`(源: `html-viewer.ts:22-53`,已读)把 `module_tree.json` + `meta.json` + 所有 `*.md` 读进一个 `{slug: content}` map,作为 JSON 内联进单个 `index.html`,前端用 CDN 的 `marked@11` + `mermaid@11` 渲染。**安全细节**:内联前用 `escScript = s => s.replace(/<\//g, '<\\/')` 防止 `</script>` 提前闭合(源: `html-viewer.ts:73`,已读)。**tk 落点**:tk 已规划 CodeWiki 风格 self-contained `index.html`;此处可直接复用"md map 内联 + escScript"做法,但 CDN 依赖需替换(tk 零运行时依赖且 Windows 离线场景多——见 gaps)。

**Mermaid 反崩溃**:`sanitizeMermaidMarkdown()`(源: `mermaid-sanitizer.ts:13-41`,已读)对 LLM 产出的 mermaid 做别名化(把非法 node id 映射成 `[A-Za-z0-9_-]`)、引用不安全 edge label、处理字面 `\n`。**这是"LLM 输出落盘前的确定性校验层"**,正契合 tk 的 validate-not-trust 原则——LLM 可能产出语法错的图,gitnexus 不信任、强制清洗。tk 应照抄这层(它与图后端无关,纯字符串处理)。

---

#### node:sqlite 适配(替换 gitnexus 的 Kuzu/Cypher 图查询)

gitnexus 的 `graph-queries.ts` 用 Kuzu/Cypher;本章只需它的**输出形状**(`getIntraModuleCallEdges` / `getInterModuleCallEdges` / `getProcessesForFiles`),tk 用 `nodes`/`edges` 表的纯 SQL 即可产出同形数据喂给上面的 formatter。

**module 内部调用边**(intra-module:src 与 dst 都在本模块文件集内):

```sql
-- getIntraModuleCallEdges 等价:fromFile/fromName/toFile/toName
-- :files 为本模块文件列表(用 json_each 绑定 IN 集合)
SELECT s.name AS fromName, s.file_path AS fromFile,
       d.name AS toName,   d.file_path AS toFile
FROM edges e
JOIN nodes s ON s.rowid = e.src
JOIN nodes d ON d.rowid = e.dst
WHERE e.kind = 'calls'
  AND s.file_path IN (SELECT value FROM json_each(:files))
  AND d.file_path IN (SELECT value FROM json_each(:files))
LIMIT 30;  -- 对齐 formatCallEdges 的 .slice(0,30)
```

**outgoing / incoming**(inter-module:一端在模块内、另一端在模块外):

```sql
-- outgoing: 本模块 → 外部
SELECT s.name AS fromName, s.file_path AS fromFile, d.name AS toName, d.file_path AS toFile
FROM edges e
JOIN nodes s ON s.rowid = e.src
JOIN nodes d ON d.rowid = e.dst
WHERE e.kind = 'calls'
  AND s.file_path IN (SELECT value FROM json_each(:files))
  AND d.file_path NOT IN (SELECT value FROM json_each(:files))
LIMIT 30;
-- incoming: 调换 src/dst 的 IN / NOT IN 即可
```

**inter-module edges for overview**(模块→模块的聚合计数,对应 `getInterModuleEdgesForOverview` 输出 `{from,to,count}`)。用一个 `file→module` 映射表(可从 `wiki.json.moduleFiles` 物化成临时表 `fmod(file_path, module)`):

```sql
WITH fmod(file_path, module) AS (
  -- 物化 moduleFiles: 由 tk 用 INSERT 填,或 VALUES 内联
  SELECT value ->> 'file', value ->> 'module' FROM json_each(:moduleFilesJson)
)
SELECT mf.module AS "from", mt.module AS "to", COUNT(*) AS count
FROM edges e
JOIN nodes s  ON s.rowid = e.src
JOIN nodes d  ON d.rowid = e.dst
JOIN fmod mf  ON mf.file_path = s.file_path
JOIN fmod mt  ON mt.file_path = d.file_path
WHERE e.kind = 'calls' AND mf.module <> mt.module
GROUP BY mf.module, mt.module
ORDER BY count DESC;
```

**processes / execution flows**(`getProcessesForFiles(files, N)`):gitnexus 的 process 是预计算的执行链(label/type/steps)。tk 若无独立 process 表,可用 `edges(kind='calls')` 上的 **WITH RECURSIVE 有界 BFS** 从模块内的入口符号(无入边或 export 的 node)出发,产出 top-N 条链(深度上限对齐下文 caps):

```sql
WITH RECURSIVE flow(start_id, cur_id, depth, path) AS (
  -- seeds: 模块内的导出/入口符号
  SELECT n.rowid, n.rowid, 0, n.name
  FROM nodes n
  WHERE n.file_path IN (SELECT value FROM json_each(:files))
    AND n.kind IN ('function','method')
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.dst = n.rowid AND e.kind='calls')
  UNION ALL
  SELECT f.start_id, e.dst, f.depth + 1, f.path || ' → ' || d.name
  FROM flow f
  JOIN edges e ON e.src = f.cur_id AND e.kind = 'calls'
  JOIN nodes d ON d.rowid = e.dst
  WHERE f.depth < 6                       -- 深度上限,见 caps
    AND instr(f.path, d.name) = 0         -- 防环
)
SELECT * FROM flow WHERE depth > 0
ORDER BY depth DESC
LIMIT 5;  -- 对齐 getProcessesForFiles(.,5)
```

`getFilesWithExports` / `getAllFiles` 也是平凡 SQL:`SELECT DISTINCT file_path FROM nodes`,以及 `SELECT file_path, name, kind FROM nodes WHERE is_export=1`(tk 的 nodes 表需有 export 标记字段;无则用 `kind` 近似)。

---

#### 具体数值(gitnexus 用的 caps / budgets / timeouts)

源: `src/core/wiki/generator.ts:107-109`(已读):
- `DEFAULT_MAX_TOKENS_PER_MODULE = 30_000`(单模块源码 token 上限,超则截断或拆子目录)
- `GROUPING_TOKEN_BUDGET = 100_000`(分组 prompt token 预算,超则分批)
- `concurrency = 3`(叶子页并行度,默认值,源: `generator.ts:140`)
- token 估算 = `Math.ceil(text.length / 4)`(~4 char/token,源: `llm-client.ts:103-105`)
- module tree 目标 **5–15 个模块**(源: `prompts.ts:16` GROUPING rule)
- mermaid 节点上限:模块图 **5–10 nodes**,overview 图 **max 10 nodes**(源: `prompts.ts:44, 97`)
- call edges 喂 prompt **最多 30 条**(`formatCallEdges` `.slice(0,30)`)
- directory tree 喂 prompt **最多 50 条目录**(`formatDirectoryTree` `.slice(0,50)`)
- 拆模块阈值:`totalTokens > 30000 && modulePaths.length > 3` 才按子目录拆(源: `generator.ts:517`)
- 增量"大改"阈值:`newFiles.length > 5` → 全量重分组(源: `generator.ts:1030`)
- DB idle 保活:长 LLM 调用中每 **60s** `touchWikiDb()`(源: `generator.ts:183`)
- 429 限流自适应:命中即 `activeConcurrency--`,`setTimeout(next, 5000)` 重排(源: `generator.ts:1326-1335`)
- 父/overview overview 段提取切片:child 取 **800** 字符、overview 取 **600** 字符(源: `generator.ts:898, 938`)
- slug:`toLowerCase` → 非字母数字转 `-` → 截 **60** 字符(源: `generator.ts:1366-1372`)
- Codex CLI 沙箱参数:`--sandbox read-only -c approval_policy="never"`(源: `local-cli-client.ts:136-145`)—— tk 借宿主时应同样强制只读沙箱。

---

#### 抄进来清单

| gitnexus file | tk target | 关键函数 / 抄什么 |
|---|---|---|
| `wiki/generator.ts:80-103` | `src/codemap/wiki/types.ts` | `WikiMeta`/`ModuleTreeNode`/`WikiRunResult` → `.tk/wiki.json` schema |
| `wiki/generator.ts:340-451` | `src/codemap/wiki/generator.ts` | 四阶段 `fullGeneration` 编排(改图查询为 SQL) |
| `wiki/generator.ts:843-925` | 同上 | `generateLeafPage`/`generateParentPage`(事实注入契约) |
| `wiki/generator.ts:1276-1295`,`791-836` | 同上 | `flattenModuleTree`/`fallbackGrouping`/`splitBySubdirectory`(无-LLM 骨架) |
| `wiki/generator.ts:1148-1166`,`1135-1146` | 同上 | `getChangedFiles`/`isCommitReachable`(增量门控) |
| `wiki/generator.ts:1301-1353` | 同上 | `runParallel`(并发+429 自适应) |
| `wiki/prompts.ts` 全文 | `src/codemap/wiki/prompts.ts` | 5 组 system/user prompt + `formatCallEdges`/`formatProcesses`/`fillTemplate`(反幻觉契约,**直接抄**) |
| `wiki/local-cli-client.ts:95-117,262-429` | `src/codemap/wiki/host-llm.ts` | `callClaudeLLM`/`runLocalCLI`/`resolveLocalCommand`/`killChildTree`(host-borrow + Windows 解析) |
| `wiki/mermaid-sanitizer.ts:13-41` | `src/codemap/wiki/mermaid-sanitizer.ts` | `sanitizeMermaidMarkdown`(LLM 输出落盘前校验,**直接抄,无依赖**) |
| `wiki/html-viewer.ts:22-53,73` | `src/codemap/wiki/html-viewer.ts` | md-map 内联 + `escScript`(CDN 依赖需替换) |
| `wiki/llm-client.ts:103-105` | `src/codemap/wiki/tokens.ts` | `estimateTokens`(~4 char/token) |

**MCP tool 落点**: 暴露 `tk_wiki_generate`(全量/增量,参数 `force`/`lang`/`reviewOnly`)、`tk_wiki_page(slug)`(返回单页 md,供 agent 按需读)。叙事步骤通过 host-llm.ts 路由给宿主 `claude` CLI;tk 自身不持 API key。


---

### gitnexus · SWE-bench EVAL harness（服务 K）

#### 服务 tk 需求

**K（measurement / 诚实度量）。** tk 的 1.0.0 度量策略（见 MEMORY measurement-harness-design）已定：**主 track = codemap agent-eval（Track-1 在 Claude Code headless 上跑、唯一干净 token runner）**，再加一条 **SWE-bench cross-check arm** 做对外可比的硬指标。gitnexus 这套 `eval/` 正是 tk cross-check arm 要照抄的**协议骨架**：它把"代码图情报是否真的帮到 agent 解 issue"做成了一个 **A/B 对照实验**——`baseline`（纯 bash 工具，无图）vs `native_augment`（图工具 + grep 富化），跑同一批 SWE-bench 实例，输出 **resolve rate / cost / api_calls / tool-usage** 四类指标，并用官方 `swebench.harness.run_evaluation` 验证 patch 是否真过测试。

这正是 tk 需要的：把"装了 tk 的 agent"和"裸 agent"丢进同一批真实 GitHub issue，看 **resolve rate 不掉 + token/cost/轮数下降**。注意（任务已点明）：**这是 Python harness（基于 mini-swe-agent + litellm + datasets + swebench）。tk 复用的是它的协议/度量口径/A-B 切分，而不是把 Python 端口成 TS。** tk 真正要"抄进 TS"的只有 **eval-server**（让工具调用 ~100ms 而非冷启 5–10s）这一段，其余是把 tk 的 CLI/MCP 接进同样的 docker + agent + analysis 流水线。

---

#### 1. 三臂对照设计（baseline / native / native_augment）

gitnexus 把"图情报有没有用"拆成三种 agent 能力档位，每档一个 mode YAML + 一对 jinja 模板：

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:35-39` [非分发安全]
```python
class GitNexusMode(str, Enum):
    """Evaluation modes for GitNexus integration."""
    BASELINE = "baseline"               # No GitNexus — pure mini-swe-agent
    NATIVE = "native"                   # GitNexus tools via eval-server
    NATIVE_AUGMENT = "native_augment"   # Native tools + grep enrichment (recommended)
```

**对 tk 的映射**（K 的 cross-check arm 应跑两臂，第三臂可选）：

| gitnexus mode | agent 拿到什么 | tk 对应臂 |
|---|---|---|
| `baseline` | 纯 grep/find/cat/sed（control） | **tk-off**：裸 agent，无 codemap 工具、无 grep 富化 |
| `native` | baseline + 显式图工具（eval-server，~100ms） | **tk-tools**：agent 可调 tk 的 codemap MCP 工具（query/context/impact） |
| `native_augment`（推荐） | native + grep 结果自动追加 `[GitNexus]` callers/callees/flows | **tk-augment**：tk 拦截 grep/rg，自动富化（对应 tk 的 hook/shim 富化路径） |

`native_augment` 是 gitnexus 自己的"recommended"主臂，因为它最贴近 Claude Code/Cursor 的真实集成形态（agent 既能显式调工具，也被动收到富化的搜索结果）。**tk 的 cross-check 至少跑 `baseline` vs `tk-augment` 这条关键对照**（README 也是这么推荐的：`--modes baseline --modes native_augment`）。

两个 mode YAML 的对照（注意 **step_limit / cost_limit 两臂必须一致**，否则不是干净 A/B）：

源: `/tmp/tk-research/gitnexus/eval/configs/modes/native_augment.yaml:10-25` 与 `baseline.yaml:2-10` [非分发安全]
```yaml
# native_augment.yaml
agent:
  gitnexus_mode: 'native_augment'
  step_limit: 30
  cost_limit: 3.0
  augment_timeout: 5.0
  augment_min_pattern_length: 3
  track_gitnexus_usage: true
environment:
  enable_gitnexus: true
  skip_embeddings: true       # 评测不开 embedding，只测图情报
  gitnexus_timeout: 120
  eval_server_port: 4848
# baseline.yaml —— 同样 step_limit:30 / cost_limit:3.0，environment_class: 'docker'（裸）
```

---

#### 2. eval-server —— tk 唯一需要"抄进 TS"的部分（~100ms 热查询）

**这是这个 subsystem 里 tk 最该直接拿走的代码。** 问题：mini-swe-agent 每条命令都用 `subprocess.run` 在全新子 shell 里跑（不 source `.bashrc`、env 不继承），所以工具不能是 shell 函数，必须是 `$PATH` 里的独立可执行 + 一个**常驻进程**保住热 DB。gitnexus 的解法：起一个 HTTP daemon 把图 DB 常驻内存，`/usr/local/bin/` 装一批 bash 包装脚本（curl 走 fast path，失败 fallback 到冷 CLI）。

源: `/tmp/tk-research/gitnexus/gitnexus/src/cli/eval-server.ts:457-509`（HTTP 路由核心）[非分发安全]
```ts
const server = http.createServer(async (req, res) => {
  resetIdleTimer();
  try {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', repos: repos.map((r) => r.name) }));
      return;
    }
    // Shutdown
    if (req.method === 'POST' && req.url === '/shutdown') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'shutting_down' }));
      setTimeout(async () => { await backend.disconnect(); server.close(); process.exit(0); }, 100);
      return;
    }
    // Tool calls: POST /tool/:name
    const toolMatch = req.url?.match(/^\/tool\/(\w+)$/);
    if (req.method === 'POST' && toolMatch) {
      const toolName = toolMatch[1];
      const body = await readBody(req);
      let args: Record<string, any> = {};
      if (body.trim()) {
        try { args = JSON.parse(body); }
        catch { res.writeHead(400); res.end('Error: Invalid JSON body'); return; }
      }
      const result = await backend.callTool(toolName, args);
      const formatted = formatToolResult(toolName, result);   // ← 关键：文本而非 JSON
      const hint = getNextStepHint(toolName);                 // ← 关键：链式下一步提示
      res.setHeader('Content-Type', 'text/plain');
      res.writeHead(200);
      res.end(formatted + hint);
      return;
    }
    res.writeHead(404);
    res.end('Not found. Use POST /tool/:name or GET /health');
  } catch (err: any) {
    res.writeHead(500);
    res.end(`Error: ${err.message || 'Internal error'}`);
  }
});
```

**两个对 tk-K「token 诚实度量」直接有价值的设计点（README 也明确点了）**：

1. **返回 LLM-friendly 文本，不返回原始 JSON**（"Raw JSON wastes tokens and is hard for models to parse"，eval-server.ts:6-11）。每个工具有一个 `format*Result` 把结构化结果压成紧凑文本，并对列表做硬截断（见 §3 具体数值）。这正是 tk 的 token 卖点在评测里能体现的前提——如果评测时把图结果当 JSON 灌给模型，省 token 的效果就被噪声淹没了。

2. **next-step hint 引导工具链**（`query → context → impact → fix`）：

源: `/tmp/tk-research/gitnexus/gitnexus/src/cli/eval-server.ts:379-402` [非分发安全]
```ts
function getNextStepHint(toolName: string): string {
  switch (toolName) {
    case 'query':
      return '\n---\nNext: Pick a symbol above and run gitnexus-context "<name>" to see all its callers, callees, and execution flows.';
    case 'context':
      return '\n---\nNext: To check what breaks if you change this, run gitnexus-impact "<name>" upstream';
    case 'impact':
      return '\n---\nNext: Review d=1 items first (WILL BREAK). Read the source with cat to understand the code, then make your fix.';
    case 'cypher':
      return '\n---\nNext: To explore a result symbol in depth, run gitnexus-context "<name>"';
    case 'detect_changes':
      return '\n---\nNext: Run gitnexus-context "<symbol>" on high-risk changed symbols to check their callers.';
    case 'list_repos':
      return '\n---\nNext: READ ... re-run list_repos with offset set to pagination.nextOffset ...';
    default: return '';
  }
}
```

**READY 信号 + body 上限**（直接抄进 tk 的 eval-server）：
- READY 行：`GITNEXUS_EVAL_SERVER_READY:<host>:<port>`（IPv6 加方括号），harness 端解析时**取最后一个冒号段** `split(':').pop()`，不要 `split(':')[1]`（IPv4 非 loopback / IPv6 会断）。源: eval-server.ts:613, README:199。
- `export const MAX_BODY_SIZE = 1024 * 1024; // 1MB`，源: eval-server.ts:632-648 [非分发安全]，`readBody` 超限 `req.destroy`。

**tk 落点**：tk 已规划"per-session MCP server"（MEMORY code-graph-design）。tk 的 eval-server **不需要新写**——可以让 tk 的 MCP server 多挂一个 `/tool/:name` HTTP shim（或评测专用 `tk eval-server` 子命令），内部转调同一套 codemap 查询函数。复用 tk 已有的 node:sqlite + FTS5 backend（对应 gitnexus 的 `backend.callTool`）。**关键是把 §3 的文本压缩 + hint 也照抄**，否则 token 指标不可信。

---

#### 3. 文本格式化器 —— 每种工具的 token cap（直接抄数值）

eval-server 把图查询结果压成紧凑文本时用了一组**硬截断**，这些数字 tk 的 format 层应原样沿用（它们是 gitnexus 实跑校准过的 token/可读性折中）：

| 工具 | 截断规则 | 源 (eval-server.ts) |
|---|---|---|
| `query` | 每个 process 最多列 **6** 个 symbol，余者 `... and N more`；standalone defs 最多 **8** | :88, :100-103 |
| `context` | incoming/outgoing 每种 relType 各最多 **10** 条 ref | :140, :156 |
| `impact` | 每个 depth(d=1/2/3) 最多 **12** 项；depth label = `WILL BREAK / LIKELY AFFECTED / MAY NEED TESTING` | :281-282, :255-259 |
| `cypher` | 最多 **30** 行，余者 `... N more rows` | :307-311 |

源: `/tmp/tk-research/gitnexus/gitnexus/src/cli/eval-server.ts:82-104`（query 截断示例）[非分发安全]
```ts
lines.push(`Found ${processes.length} execution flow(s):\n`);
for (let i = 0; i < processes.length; i++) {
  const p = processes[i];
  lines.push(`${i + 1}. ${p.summary} (${p.step_count} steps, ${p.symbol_count} symbols)`);
  const procSymbols = symbols.filter((s: any) => s.process_id === p.id);
  for (const s of procSymbols.slice(0, 6)) {           // ← cap 6
    const loc = s.startLine ? `:${s.startLine}` : '';
    lines.push(`   ${s.type} ${s.name} → ${s.filePath}${loc}`);
  }
  if (procSymbols.length > 6) lines.push(`   ... and ${procSymbols.length - 6} more`);
  lines.push('');
}
if (defs.length > 0) {
  lines.push(`Standalone definitions:`);
  for (const d of defs.slice(0, 8)) {                  // ← cap 8
    lines.push(`  ${d.type || 'Symbol'} ${d.name} → ${d.filePath || '?'}`);
  }
  if (defs.length > 8) lines.push(`  ... and ${defs.length - 8} more`);
}
```

**node:sqlite 适配。** gitnexus 的 `backend.callTool` 底层走 Kuzu/Cypher；tk 走 node:sqlite + FTS5。impact 的 byDepth 截断对应一个有界深度 CTE（tk 抄 §impact 的 d=1/2/3 三档 + 每档 cap 12）。tk 的 `impact` 查询（upstream blast radius）等价 SQL：
```sql
-- tk: blast radius，depth-bounded recursive CTE over edges(src,dst,kind)
WITH RECURSIVE blast(node_id, depth) AS (
  SELECT :target_id, 0
  UNION
  SELECT e.src, b.depth + 1            -- upstream: 谁依赖 target（调用/导入/继承指向 target）
  FROM edges e JOIN blast b ON e.dst = b.node_id
  WHERE b.depth < 3                    -- gitnexus 也只展示 d=1..3
    AND e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS')
)
SELECT b.depth,
       n.kind, n.name, n.file_path
FROM blast b JOIN nodes n ON n.id = b.node_id
WHERE b.depth > 0
ORDER BY b.depth,
         CASE WHEN b.depth=1 THEN 'WILL BREAK'
              WHEN b.depth=2 THEN 'LIKELY AFFECTED'
              ELSE 'MAY NEED TESTING' END
LIMIT 100;  -- 然后在 format 层每个 depth 各 slice(0,12)
```
（downstream 把 `e.dst=b.node_id`→`e.src=b.node_id`、取 `e.dst` 翻转方向即可。）
context 的 incoming/outgoing 等价两条单跳查询：
```sql
-- incoming: 谁引用 :sym（按 relType 分组，每组 LIMIT 10）
SELECT e.kind AS rel, n.kind, n.name, n.file_path
FROM edges e JOIN nodes n ON n.id = e.src
WHERE e.dst = :sym_id;
-- outgoing: :sym 引用了谁 —— 对称，e.src=:sym_id 取 e.dst
```

---

#### 4. agent 层：grep 富化 + 指标采集（A/B 的"处理变量"）

`native_augment` 臂的核心是：拦截 agent 的 grep/rg/ag，抽出 pattern，调 `gitnexus-augment` 拿图上下文，把 `[GitNexus]` 注解追加到搜索结果后。**这正是 tk 的 hook/shim 富化在评测里的体现** —— tk 已有等价能力（MEMORY 里的 grep 富化 hook），评测时只要把它接进同一个拦截点。

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:97-131`（富化决策）[非分发安全]
```python
def _maybe_augment(self, action: dict, output: dict) -> dict | None:
    command = action.get("command", "")
    if not command:
        return None
    pattern = self._extract_search_pattern(command)
    if not pattern or len(pattern) < self.config.augment_min_pattern_length:  # min 3
        return None
    start = time.time()
    try:
        augment_result = self.env.execute({
            "command": f'gitnexus-augment "{pattern}" 2>&1 || true',
            "timeout": self.config.augment_timeout,                            # 5.0s
        })
        elapsed = time.time() - start
        self.gitnexus_metrics.augmentation_calls += 1
        self.gitnexus_metrics.augmentation_time += elapsed
        augment_text = augment_result.get("output", "").strip()
        if augment_text and "[GitNexus]" in augment_text:                      # 只在真有命中时计 hit
            original_output = output.get("output", "")
            output = dict(output)
            output["output"] = f"{original_output}\n\n{augment_text}"
            self.gitnexus_metrics.augmentation_hits += 1
            return output
    except Exception as e:
        self.gitnexus_metrics.augmentation_errors += 1
    return None
```

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:133-151`（从命令里抽 grep pattern，tk 富化拦截点可复用同款正则）[非分发安全]
```python
@staticmethod
def _extract_search_pattern(command: str) -> str | None:
    patterns = [
        r'(?:grep|rg|ag)\s+(?:-[a-zA-Z]*\s+)*["\']([^"\']+)["\']',
        r'(?:grep|rg|ag)\s+(?:-[a-zA-Z]*\s+)*(\S+)',
    ]
    for pat in patterns:
        match = re.search(pat, command)
        if match:
            result = match.group(1)
            if result.startswith("/") or result.startswith("."):  # 跳过路径
                continue
            if result.startswith("-"):                             # 跳过 flag
                continue
            return result
    return None
```

**指标对象**（tk 的 cross-check 应采同款，serialize 进每个实例的 traj）：

源: `/tmp/tk-research/gitnexus/eval/agents/gitnexus_agent.py:175-199` [非分发安全]
```python
class GitNexusMetrics:
    def __init__(self):
        self.tool_calls: dict[str, int] = {key: 0 for key in TOOL_METRIC_KEYS}
        self.augmentation_calls = 0
        self.augmentation_hits = 0
        self.augmentation_errors = 0
        self.augmentation_time = 0.0
        self.index_time = 0.0
    @property
    def total_tool_calls(self) -> int:
        return sum(self.tool_calls.values())
    def to_dict(self) -> dict:
        return {
            "tool_calls": dict(self.tool_calls),
            "total_tool_calls": self.total_tool_calls,
            "augmentation_calls": self.augmentation_calls,
            "augmentation_hits": self.augmentation_hits,
            "augmentation_errors": self.augmentation_errors,
            "augmentation_time_seconds": round(self.augmentation_time, 2),
            "index_time_seconds": round(self.index_time, 2),
        }
```
**tk-K 含义**：`augment_hit_rate = hits / calls` 是 tk 的核心"机会真实命中率"指标——它回答"agent 的搜索里有多少真的被 codemap 富化到了有用的东西"，这正是 tk online-opportunity track（MEMORY measurement-harness-design 的 Track-2）想量的东西。tk 应原样保留这套口径。

---

#### 5. 度量口径 & A/B delta（analysis 层，tk cross-check 报表照抄）

`compute_metrics` 定义了每个 run 的口径；`compare_modes` 做 baseline→enhanced 的 **delta（负=更省 = 绿）**。这套口径就是 tk cross-check 报表要产出的。

源: `/tmp/tk-research/gitnexus/eval/analysis/analyze_results.py:142-155`（口径）[非分发安全]
```python
return {
    "n_instances": n_instances,
    "n_with_patch": n_with_patch,
    "patch_rate": n_with_patch / max(n_instances, 1),
    "total_cost": total_cost,
    "avg_cost": total_cost / max(n_instances, 1),
    "total_api_calls": total_calls,
    "avg_api_calls": total_calls / max(n_instances, 1),
    "total_gn_tool_calls": sum(gn_tool_calls),
    "avg_gn_tool_calls": ... ,
    "total_augment_hits": sum(gn_augment_hits),
    "total_augment_calls": sum(gn_augment_calls),
    "augment_hit_rate": sum(gn_augment_hits) / max(sum(gn_augment_calls), 1) if gn_augment_calls else 0,
}
```

源: `/tmp/tk-research/gitnexus/eval/analysis/analyze_results.py:319-340`（vs baseline 的 delta，负为优）[非分发安全]
```python
if "baseline" in metrics:
    baseline_cost = metrics["baseline"]["avg_cost"]
    baseline_calls = metrics["baseline"]["avg_api_calls"]
    for mode in mode_order:
        if mode == "baseline": continue
        cost_delta  = ((metrics[mode]["avg_cost"]      - baseline_cost)  / max(baseline_cost, 0.001)) * 100
        calls_delta = ((metrics[mode]["avg_api_calls"] - baseline_calls) / max(baseline_calls, 1))     * 100
        # Color-code: negative is good (cheaper/fewer calls)
        cost_color  = "green" if cost_delta  < 0 else "red"
        calls_color = "green" if calls_delta < 0 else "red"
```

**resolve rate（硬指标）—— 调官方 swebench harness**，源: `analysis/analyze_results.py:158-199` 与 `:234-238` [非分发安全]：
```python
cmd = [sys.executable, "-m", "swebench.harness.run_evaluation",
       "--dataset_name", dataset_mapping.get(subset, subset),
       "--predictions_path", str(preds_path),
       "--max_workers", "4", "--run_id", run_id, "--output_dir", str(eval_output)]
result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
# 解析 eval_output/run_id/results.json → eval_result["resolved"]
# resolve_rate = resolved / n_instances
```
`preds.json` 的格式（SWE-bench 官方要的 `model_patch`，从容器 `git diff` 抓），源: `run_eval.py:179, :271-275`：
```python
patch_output = env.execute({"command": "cd /testbed && git diff"})  # patch = stdout
data[instance_id] = {"model_name_or_path": model_name,
                     "instance_id": instance_id,
                     "model_patch": result.get("submission", "")}
```

**tk-K 决定**：resolve rate **必须用官方 swebench harness 判（patch 真过测试），不能自评**——这是 K「诚实度量」的底线。tk cross-check 的产物就是这张 `baseline vs tk` 表：`patch_rate / resolve_rate / total_cost / avg_cost / total_api_calls / avg_api_calls / augment_hit_rate` + delta。

---

#### 6. 索引缓存（per-(repo,commit)）—— SWE-bench 重复实例的提速

SWE-bench 同一 repo 几百个实例只是 commit 不同（Django 200+），重复 index 是浪费。gitnexus 用 `sha256(repo:commit)[:16]` 做 cache key，命中就 `docker cp` 还原 tar。

源: `/tmp/tk-research/gitnexus/eval/environments/gitnexus_docker.py:287-291` [非分发安全]
```python
@staticmethod
def _make_cache_key(repo_info: dict) -> str:
    content = f"{repo_info['repo']}:{repo_info['commit']}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]
```
**tk 适配**：tk 的图存在 node:sqlite 单文件 → 缓存更简单：cache key 同样 `sha256(repo:commit)[:16]`，命中就把 `.tk/codegraph.sqlite`（+FTS5 索引）整文件 cp 进容器，不必 tar。这是 tk 相对 gitnexus（Kuzu 目录）的天然优势。

---

#### 7. eval-server 启动/健康探测（环境编排，tk harness 照搬）

源: `/tmp/tk-research/gitnexus/eval/environments/gitnexus_docker.py:169-211` 与 `constants.py:3-15` [非分发安全]，关键数值：
- 启动：`nohup npx gitnexus eval-server --port 4848 --host 127.0.0.1 --idle-timeout 600 > /tmp/...log 2>&1 &`（idle 600s 自动关）。
- 健康探测：`curl -sf http://127.0.0.1:4848/health`，**30 次 × 0.5s = 最多 15s** 等 DB warm（`EVAL_SERVER_HEALTH_RETRIES=30`, `INTERVAL=0.5`, `TIMEOUT=3`），就绪判据 = 输出含 `"ok"` 且不含 `NOT_READY`。
- 工具脚本装进 `/usr/local/bin/`（heredoc 引号定界，curl fast-path + CLI fallback），原因：mini-swe-agent 每命令 `subprocess.run` 全新子 shell（gitnexus_docker.py:11-13, 243-273）。
- 其他 timeout：`gitnexus_timeout=120`（analyze），`augment_timeout=5.0`，node install 60s。

**tk 适配**：把 `npx gitnexus` 全部换成 `npx token-killer`（或 `tk`）。tk 的 eval-server 起 node:sqlite 比 Kuzu 冷启更快，健康探测的 15s 窗口对 tk 绰绰有余。Windows 不是评测目标平台（SWE-bench 容器是 linux），所以 tk-K 的 cross-check arm 在 linux 容器里跑、不受 tk 主战场 Windows 的影响——这点对 tk 是减负。

---

#### 抄进来清单

| gitnexus 文件 | tk 落点 | 关键函数 / 数值 |
|---|---|---|
| `src/cli/eval-server.ts:457-509` | `tk eval-server`（或 tk MCP server 挂 HTTP shim）src/cli/ | http 路由 `/health` `/tool/:name` `/shutdown`；body→`backend.callTool`→format+hint |
| `src/cli/eval-server.ts:68-351` | tk 的 codemap 文本格式化层（query/context/impact/cypher） | `format*Result`；cap 6/8/10/12/30；depth label `WILL BREAK/LIKELY AFFECTED/MAY NEED TESTING` |
| `src/cli/eval-server.ts:379-402` | 同上（hint 模块） | `getNextStepHint` 工具链 query→context→impact→fix |
| `eval/agents/gitnexus_agent.py:97-151` | tk eval harness 的 agent 富化拦截（复用 tk grep-富化 hook） | `_maybe_augment` / `_extract_search_pattern`；min_len 3、timeout 5s、`[GitNexus]` 命中判据 |
| `eval/agents/gitnexus_agent.py:175-199` | tk metrics schema（serialize 进 traj） | `GitNexusMetrics.to_dict`；`augment_hit_rate` 口径 |
| `eval/analysis/analyze_results.py:99-199` | tk cross-check 报表生成器 | `compute_metrics` 口径 + `run_swebench_evaluation`（调官方 harness 判 resolve）|
| `eval/analysis/analyze_results.py:319-340` | tk A/B delta 渲染 | baseline→enhanced cost/calls delta（负=绿） |
| `eval/environments/gitnexus_docker.py:169-291` | tk eval docker env 编排 | 启 eval-server + 30×0.5s 健康探测 + `sha256(repo:commit)[:16]` 索引缓存 |
| `eval/configs/modes/*.yaml` + `run_eval.py:96-109,279-344` | tk eval 的 mode/model YAML + run 驱动 | step_limit 30 / cost_limit 3.0 两臂一致；`single/matrix/debug` 命令骨架 |
| `eval/tool_registry.py:17-79` | tk 工具脚本注册表 | `TOOL_SPECS`（endpoint/payload/fallback）；`TOOL_METRIC_KEYS=(query,context,impact,cypher,overview)` |
| `eval/constants.py:3-15` | tk eval 常量 | 健康探测/超时全套数值 |

## 本附录诚实缺口(需实现时补)

- **gitnexus · call-graph resolution engine（调用图解析）**: receiver-bound-calls.ts 的 7-case dispatcher 全文 1465 行只读了头 170 行（case 顺序契约 I4/I5 + 模板类绑定解析），Case 0-5 各自的具体实现（compound chain resolveCompoundReceiverClass、namespace targets、value-receiver bridge Case 5）未逐行确认 —— tk 抄简化版可先不要，需完整多语言时补读 passes/receiver-bound-calls.ts:170-1465 + passes/compound-receiver.ts(568)
- **gitnexus · call-graph resolution engine（调用图解析）**: free-call-fallback.ts 只读头 120 行（签名 + 全局 callable/class 索引构建）；其 emit 主体、ADL 候选解析、constructor-form class fallback、overload 收窄调用未读 —— 需实现时补读 free-call-fallback.ts:120-858
- **gitnexus · call-graph resolution engine（调用图解析）**: overload-narrowing.ts(526 行) 完全未读：narrowOverloadCandidates / conversionRank / constraintCompatibility 的 C++ 模板约束与转换排名算法 —— tk 若不做 C++/重载可跳过，做则需实现时补
- **gitnexus · call-graph resolution engine（调用图解析）**: scope-extractor.ts(45107 字节) 与 tree-sitter-queries.ts(73537 字节) 未读：referenceSites / typeBindings / scope.bindings 这些 lookupCore 的【输入】是怎么从 AST 提取并物化的，是抄进 tk 索引期的前置 —— 本任务聚焦解析（输入已给定），提取管线需另立子任务补
- **gitnexus · call-graph resolution engine（调用图解析）**: ownedMembersByOwner / methodDispatch.mroFor / qualifiedNames / scope.typeBindings 这些 RegistryContext 索引的【物化结构与填充时机】未深读（finalize-orchestrator.ts / model/*），tk 的 node:sqlite 适配里我假设了 owns 边 + bindings 表 + scopes(parent_id) 表，实际表结构需在 tk schema 设计时对齐确认
- **gitnexus · call-graph resolution engine（调用图解析）**: arityCompatibility provider 是 per-language hook，本任务未读任一语言实现（languages/*/）；tk 若要 arity 过滤需补该 hook 的 TS/Python 具体判定逻辑
- **gitnexus · call-graph resolution engine（调用图解析）**: import 解析（import-target-adapter.ts / import-resolvers/ 13 个文件）只在分派表里提及未深读 —— 服务需求 D 的'跨文件 import 一跳'核心在此，emitImportEdges + resolveImportTarget(tsconfig path alias 等) 需另行补读
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: cfg/visitors/typescript.ts (755 行) 未读 — tree-sitter TS/JS 如何切基本块、连 break/continue/return/throw/finally 边、采集每语句 def/use/mayDefs/sites facts，是落地 tk 的最大缺口，需实现时补
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: cfg/synthetic-escape.ts (331 行) 只读了模块头契约 — augmentForPostDom 给无限循环/goto-cycle 补 header→loopExit 分析专用边的具体实现未读
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: SSA-sparse 求解器 computeInSetsSparse (reaching-defs.ts:538-786) 主体未细读 — φ 放置、stack renaming、value-graph 构造、SCC 缩并的串接细节；tk 用 dense 即可绕开，但大函数性能优化需补
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: reaching-defs-graph.ts 的 buildDominators/buildDominanceFrontiers/tarjanScc/condenseReachingSets 已读全文，但它们如何被 sparse 求解器串成 def-use graph 查询（computeInSetsSparse 内部）未读
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: taint 层 (SiteRecord → source/sink/sanitizer 匹配、SiteArgOccurrence via-tag 的 exec(escape(x)) kill 语义) 不在本子系统目录内 (taint/emit.ts 等) — J 需求的完整 taint 仅做了底座 reaching-defs，sanitizer interposition 的判定逻辑需另挖 taint/ 目录
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: 跨函数爆炸半径：reaching_def 是函数内边，接到 tk call 边做跨函数闭包的具体 join（use 实参 → 被调 param binding）gitnexus 在 taint 引擎内做，未在本子系统体现，需实现时补
- **gitnexus · control-flow + dataflow (CFG / 到达定义 / 后支配 / 控制依赖)**: node:sqlite 在超大闭包上的递归 CTE 性能未实测 — 4000 边/函数 × 多函数闭包可能需要 depth cap + 物化中间表，tk 实测时补
- **gitnexus · Agent Delivery (MCP tool surface)**: impact 的 risk 等级具体阈值(LOW/MEDIUM/HIGH/CRITICAL 的 symbol 数/process 数边界)skill 里给了表(<5/5-15/>15),但 local-backend 里真正的判定函数未读 —— 需实现时补 risk 计算逻辑(grep `risk:` 附近 ~line 4335 的 summary 计算)
- **gitnexus · Agent Delivery (MCP tool surface)**: affected_processes / affected_modules 依赖 gitnexus 的 Process / Community(Leiden)节点,tk 当前 schema 无 process/community 层 —— tk 的 impact 若要这两个字段需先实现进程/社区抽取,否则只回 byDepth+risk,这是与 gitnexus 的一个真实 divergence
- **gitnexus · Agent Delivery (MCP tool surface)**: ranked candidates 消歧的打分函数(同名 symbol 的 relevance score)未读 —— context/impact/trace 都靠它,需实现时补(在 local-backend 的 resolve 路径)
- **gitnexus · Agent Delivery (MCP tool surface)**: trace 的逐 hop edge type/confidence 对齐:本节给了 path 回查思路,但 gitnexus 实际 `edges[]` 的构造代码未读,需实现时确认对齐方式
- **gitnexus · Agent Delivery (MCP tool surface)**: node:sqlite 是否支持 `WITH RECURSIVE` + `instr()` 防环在 tk 目标 Node 版本(≥22.5 node:sqlite)上的性能未实测 —— 大图 BFS 可能需要应用层 visited-set 替代纯 SQL 递归,需实现时基准测试
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: 布局算法未抄：gitnexus 的可读静态布局靠 tree-layout.ts(19.6KB)/circles-layout.ts(10KB) + Sigma ForceAtlas2，tk 离线 HTML 无 Sigma，需实现时补一个零依赖的纯函数布局器（tree/radial），或评估是否内联一个轻量 force-layout JS。本次未读这两个 layout 文件的内部算法。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: community/Leiden 聚类着色（graph-adapter.ts 里的 communityMemberships/clusterCenters/getCommunityColor）依赖 gitnexus 的 Leiden 社区检测产出，tk 若要按社区着色需先有等价的社区检测（属另一 subsystem），本节未覆盖。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: gitnexus 用节点/边计数来自 repoInfo.stats（meta.stats，analyze 时写入）；tk 用实时 COUNT(*) SQL 替代，但大图上 COUNT 是否够快、是否需要在索引时持久化 stats，需实现时补 benchmark。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: HTML 查看器的实际交互（点击节点→打开代码、hover tooltip、focus/zoom）在 GraphCanvas.tsx 里全部绑定到 Sigma 的事件与 useSigma hook；tk 离线 HTML 需用原生 DOM/Canvas 重写这些交互，本节只抄了数据/决策层，交互层需实现时补。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: 降级载荷（chatOnly 模式）的具体内容：gitnexus 降级后图为空、只留 escape-hatch 按钮（聊天走后端 API）。tk 没有后端聊天，降级时应内联什么（可点击的节点列表？文件树？摘要？）是 tk 专属设计，需实现时补。
- **gitnexus · HUMAN surface (1-backend-N-frontends: serve + render large graphs)**: NDJSON 流式仅后端在线场景需要；tk 离线单文件用不上，但若未来 tk 提供可选本地 server 模式，stream 协议（api.ts:300-310 backpressure/waitForDrain、client-disconnect abort）可再抄，本节未深读 backpressure 实现。
- **gitnexus · storage**: edges 的级联删除：tk 用 node:sqlite 时 FOREIGN KEY ON DELETE CASCADE 默认关闭（需 PRAGMA foreign_keys=ON，且只删 dst 入边不够 —— 跨文件入边需显式删）。§5 给的 DELETE SQL 是手动级联；是否改用触发器待实现时定 —— 需实现时补。
- **gitnexus · storage**: node-id 确定性：gitnexus 的 'Function:filePath:name' 在同名重载 / 同文件多个匿名函数时是否唯一，未在所读文件中确认其去重后缀策略（如何处理两个同名 local function）—— 需实现时补（建议 fallback 用 startLine 入 id）。
- **gitnexus · storage**: embedding/向量：gitnexus 用 Kuzu HNSW 向量索引（schema.ts:497-499 CREATE_VECTOR_INDEX cosine, 384 dims）。node:sqlite 无内置 ANN；tk 若要语义搜索需 sqlite-vec 扩展或纯 JS 余弦 —— 但这是分发原生扩展，与 zero-dep 冲突，embeddings 属 Outside current product scope（不做，见 MEMORY: code-graph-design）。记录为 gap 但当前不做。
- **gitnexus · storage**: writeBatch 事务粒度：gitnexus 用 SUB_BATCH_SIZE=4 是因为 LadybugDB prepared-statement 限制；tk 改单事务后，超大批（百万边）单事务是否需要分块 COMMIT 以控内存/WAL，未实测 —— 需实现时补。
- **gitnexus · storage**: FTS5 同步：tk 给 nodes 挂了 external-content FTS5 表，但 gitnexus 无此物，故没有现成的增量 rebuild/INSERT-trigger 范式可抄；FTS5 与 §5 selective writeback 的同步（delete/insert 时维护 nodes_fts）需 tk 自行设计 —— 需实现时补。
- **gitnexus · storage**: pool-adapter / WAL-checkpoint / sidecar-recovery（lbug/ 下 pool-adapter.ts 34KB、wal-checkpoint-driver.ts、sidecar-recovery.ts）未深读：这些是 Kuzu 连接池 + WAL 检查点 + 崩溃恢复，强绑原生 DB 生命周期，tk 用 node:sqlite 的 WAL 模式（PRAGMA journal_mode=WAL）即原生覆盖，故判定为 tk 不需要、未逐行确认其恢复逻辑是否有可借鉴的 corruption-handling idea —— 需实现时补（若 tk 遇到 SQLite 损坏恢复需求再回看 sidecar-recovery.ts）。
- **gitnexus · incremental + staleness**: 事务边界：gitnexus 靠 incrementalInProgress dirty-flag + 全量重建做崩溃恢复（因为 Kuzu COPY 非事务）。tk 用 node:sqlite 可把整个 delete+insert 包进单个 BEGIN/COMMIT 事务，崩溃自动回滚——这是 tk 比 gitnexus 更优的点，但需实现时补：确认 node:sqlite 在长事务下的 WAL/锁行为，以及 FTS5 影子表是否在同一事务内一致更新。
- **gitnexus · incremental + staleness**: FTS5 同步删除：deleteNodesForFile 的 SQLite 版要同步删 nodes_fts 影子表的对应 rowid，gitnexus 无 FTS5 对应物（它删的是 EMBEDDING_TABLE）。具体 trigger/手动删的写法需实现时补，取决于 tk 的 FTS5 是 external-content 还是 contentless。
- **gitnexus · incremental + staleness**: tk 若想『只解析变化文件』（而非 gitnexus 的『解析全部、只回写变化』）：gitnexus 明确没做，因为跨文件解析需全量数据。tk 要做这个优化必须自己补一套增量解析 + 跨文件符号缓存，否则 barrel/re-export/shadow 场景的边会失真。这是 tk 自有风险区，需实现时补。
- **gitnexus · incremental + staleness**: queryImporters 依赖 IMPORTS 边已在 DB（pre-rebuild 旧状态）。tk lazy-on-read 若是『首次构建』则无旧 DB，importer-BFS 无可查——需实现时补 cold-start 分支（首次即全量）。
- **gitnexus · incremental + staleness**: computeEffectiveWriteSet 与 importer-BFS 的 JSON 数组 bind（json_each(:seed_files_json)）在超大变更集下的参数大小/性能未验证；gitnexus 在 JS 里做循环。需实现时补：评估是用临时表 INSERT 还是 json_each，及对应索引命中。
- **gitnexus · incremental + staleness**: deleteAllInterprocTaintPaths / TAINT_PATH 只在 pdg 开时存在；tk 当前 schema 是否有等价的『整图属性边』（如全局 dataflow/taint）未知，若无则该步可省，需实现时补对照 tk 边 kind 清单。
- **gitnexus · incremental + staleness**: sibling-clone 漂移检测（checkCwdMatch）依赖一个全局 registry（readRegistry）+ remoteUrl 指纹。tk 是否维护跨 clone 的全局 registry 未定；若 tk 只做 project-local 单仓，可只保留 checkStaleness 的 commitsBehind 横幅，省掉 sibling 逻辑。需实现时补 tk 的 registry 决策。
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: cohesion / community / cluster 排序信号：augment 用 `c.cohesion`（Community 节点 MEMBER_OF 边）做内部排序，tk schema 暂无 community 检测——需实现时补，先用「callers 数」当排序代理
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: Process / 执行流（STEP_IN_PROCESS 边、Process 节点、heuristicLabel、stepCount、entryPointId）：**已裁（D15 / [ADR 0027](../adr/0027-community-optional-flows-evidence-backed.md)）——gitnexus 式启发式 Process 检测 Outside scope，不建 Process 节点/STEP_IN_PROCESS 边**。`Flows:` 改由 `EvidenceBackedFlowProjection`（Behavior IR 证据，按需）提供；impact 的 risk 评分不依赖 processCount（走 directCount/total 阈值 + 反向 PPR 影响面，附录 A1 §3.5）。
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: epistemic boundary 探测（computeEpistemicBoundary，#1858 interface/indirection 下界标记 exact/lower-bound）：未读其实现，只见调用点（local-backend.ts:4628-4633, 4554-4556）——tk 若要 measurement-honesty 的「这是下界不是精确值」标记，需实现时补读该函数
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: BM25/FTS 映射符号那步依赖 gitnexus 的 searchFTSFromLbug（src/core/search/bm25-index.js，未读）；tk 用 FTS5 自己实现，bm25() 排序权重与 name-CONTAINS 回退阈值需实现时补
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: isTestFilePath 的真实判定逻辑未读（local-backend.ts 引用）；node:sqlite 适配里我用了占位 `NOT LIKE '%test%'`，tk 需补真实 test-path 规则（__tests__/*.test.*/*.spec.* 等）
- **gitnexus · token-economy levers (precompute / grep-augment / impact)**: affected_modules 聚合（directModuleNameSet、module hits 那段，5040-5048 之前的部分）只读到尾部，模块切分依据（按目录?按 community?）未确认——impact risk 的 moduleCount 维度需实现时补
- **gitnexus · wiki generation (human narrative)**: graph-queries.ts 本章未读(归他人覆盖),故 getFilesWithExports/getAllFiles/getProcessesForFiles 的 Kuzu 实现细节未确认 —— 上文 node:sqlite 等价是按调用点输出形状反推的,tk 实现时需对照实际 nodes/edges schema 校准列名(is_export 字段是否存在、processes 是否独立表)。需实现时补。
- **gitnexus · wiki generation (human narrative)**: cursor-client.ts 未逐行读,callCursorLLM/resolveCursorConfig 的参数细节未确认;tk 若不支持 cursor 可忽略该 provider。需实现时补。
- **gitnexus · wiki generation (human narrative)**: llm-client.ts 的 OpenAI-compatible HTTP 路径(callLLM 主体、resilientFetch/429 重试)只读了头部 + estimateTokens;tk 走 host-borrow 为主,HTTP 路径是否需要保留(作为无宿主 CLI 时的兜底)是 tk 的设计决策。需实现时补。
- **gitnexus · wiki generation (human narrative)**: html-viewer.ts 只读前 90 行(head + buildHTML 开头);CSS/前端导航/搜索逻辑(剩余 ~250 行)未读。tk 的 self-contained viewer 若要零运行时依赖,必须用本地内联的 marked/mermaid 替换 CDN(Windows 离线场景),这部分需自行实现。需实现时补。
- **gitnexus · wiki generation (human narrative)**: gitnexus 的 process/execution-flow 是预计算产物;tk 是否预计算 process 表、还是 wiki 生成时用递归 CTE 现算,影响性能与 schema。上文给了 CTE 兜底,但 seed 选取(入口符号判定)需结合 tk 实际 node kind 枚举校准。需实现时补。
- **gitnexus · wiki generation (human narrative)**: reviewOnly(--review 工作流:停在 module_tree.json 让人手改再续)在 tk 的 MCP/CLI 形态下如何呈现(agent 改 vs 人改)未定。需实现时补。
- **gitnexus · SWE-bench EVAL harness (serves K)**: resolve-rate 的官方判定依赖 SWE-bench 官方 docker images + `pip install swebench`（harness 调 `python -m swebench.harness.run_evaluation`）。tk 复用这条 Python 路径还是另起 TS 判定器 = 需 tk-K 决策时补；建议直接复用官方 Python harness，tk 只产 preds.json。
- **gitnexus · SWE-bench EVAL harness (serves K)**: tk 没有 mini-swe-agent 等价的 agent loop。gitnexus 直接继承 `DefaultAgent`（litellm 驱动）。tk 的 cross-check 要么直接复用 mini-swe-agent（tk 工具以 /usr/local/bin 脚本接入，零改 agent，最省力），要么用 Claude Code headless 当 agent（与 Track-1 一致）——二选一 = 需实现时补。
- **gitnexus · SWE-bench EVAL harness (serves K)**: gitnexus 的 `backend.callTool(toolName, args)`（LocalBackend，Kuzu 后端）本 subsystem 未读其实现；tk 要把 query/context/impact/cypher 四个工具映到 node:sqlite 的具体 SQL，context/impact 我已给 CTE，但 `query`（execution-flow 搜索，依赖 gitnexus 的 process/flow 概念）tk 是否有等价物未知 = 需实现时补（tk 可能只支持 context/impact 两个工具，去掉 process-flow 的 query）。
- **gitnexus · SWE-bench EVAL harness (serves K)**: `gitnexus-augment` 脚本本体（tool_registry 里只有 fallback `npx gitnexus augment`，eval-server 无 /tool/augment endpoint，走纯 CLI）——augment 的实际富化逻辑在 gitnexus 别处，本 subsystem 没覆盖；tk 的 grep 富化已有自己的实现，但要确认输出里带可被 `[GitNexus]`-style sentinel 检测的 marker，否则 augment_hit 永远为 0 = 需实现时补。
- **gitnexus · SWE-bench EVAL harness (serves K)**: 成本统计（`model_stats.instance_cost` / `api_calls`）来自 mini-swe-agent + litellm 的 cost DB。tk 若用 Claude Code headless 当 agent，cost/token 口径要换成 Claude Code 的 usage（与 MEMORY host-token-visibility 一致：Claude Code headless 是唯一干净 token runner）= 需实现时补对接。
- **gitnexus · SWE-bench EVAL harness (serves K)**: native_augment 是 gitnexus 推荐主臂，但 tk 主 track 是 codemap agent-eval（非 SWE-bench）。本 subsystem 只给了 SWE-bench cross-check 的协议；cross-check 与主 track 的结果如何交叉验证/取舍（哪个为准、不一致怎么办）= 属 tk-K 决策，需补。


