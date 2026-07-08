> **[2026-07-04 P28] PARTIALLY SUPERSEDED** — the ranking stance (staged cascade, anti-RRF, ~lines 22–40) is overridden by `CONTEXA-IMPL.md` §6 (RRF K=60 fusion). Still carried: `EvidenceBackedFlowProjection` (~219–249) as D4 reference.

# 附录 A3：对照 GitNexus 技术细节 / Token-killer-Research 的补充(2026-06-21)

> 本附录把两份新研究文档(`docs/codemap/archive/research/token-killer-research.md`、`docs/codemap/archive/research/gitnexus-technical-details.md`)相对行动计划主体的真实增量，整理成**可直接粘贴的补充内容**(中文叙述 + English code)。每条注明「增补计划哪一节」与「来自新文档哪一节」。算法/可抄代码层(附录 A1 的 PageRank TS、附录 A2 的调用解析引擎、A5 符号抽取正则、impact SQL)已强，本附录不重复。
>
> **诚实说明**：本次 5 份 gap 报告中 topic=`test`、`architecture-3tier` 两份为占位空内容，未提供任何增量，故本附录不含其条目——不凑数。

---

## 0. 排序层 reconciliation(优先级 #1：先修矛盾，再谈补充)

**增补：决策 A9(line 468) + Open Decisions(line 539) + line 8235；来自：Token-killer-Research §1-3 + 计划顶部矩阵 line 20。**

决策 A9 当前文字「PageRank/personalization Unsupported」是 **2026-06-20 拍板前的陈旧表述**，与顶部矩阵 line 20「PageRank Required, default on」、line 8256「Required, default on」、整个附录 A1 直接矛盾。留着会让实现者跳过整个附录 A1。**A9 应整体改写为**：

> **决策 A9 — PageRank Required, default on；FTS+结构 boost 是其廉价快路径/种子打分器，非替代。**
> 排序走分级管线（§1 / D13）：FTS 分 + co-location boost(同文件每多一 query 符号 +30，index.ts:820) + dominant-file boost(一文件边数 ≥3× 次高，index.ts:642) + multi-term 乘性 boost(2 词→2×、3 词→2.5×) 是**廉价快路径**，它**既挑 PageRank 的 personalization 种子、又给最终序当 tie-breaker**；personalized PageRank(附录 A1)对结构邻域做**主排序**。词法不是与 PPR 并列融合的第三通道（那会重复计数），而是 PPR 的上游 + 下游 tie-break——详见 §1 的分级管线。无 `--no-rank` 时即走此路径。

---

## 1. 排序 = 分级管线(staged cascade)，非加权和、非 RRF 融合〔D13 / [ADR 0025](../../adr/0025-staged-ranking-pipeline.md)〕

**增补：附录 A1 §3 末尾 + 重写后的 A9；裁决来源：grilling 2026-06-21 round 3（D13）。** 早稿曾从 Token-killer-Research §3.2 搬一个加权和 `finalScore = 0.60·lexical + 0.20·PPR + 0.10·path + 0.10·session`——**已作废**。两个参考实现都不用加权和：codegraph 排序路径里**零 PageRank**（纯 FTS5 BM25 + 整数 bonus），GitNexus 用 RRF `Σ1/(60+rank)` 且白纸黑字「不做统一归一化、没有 PageRank 作主搜索排序」。加权和的硬伤：① 每路信号（开放分 BM25 / [0,1] PPR / 整数 path）必须先归一化到同一尺度；② 权重无任何实测标定。

**裁决（D13）——分级管线，PPR 为主排序，词法/路径不在末端再融合**：

```
① 词法搜索  : FTS5 BM25 + codegraph name/kind/path/multi-term/test 启发式
              → 产出有界【候选锚点 candidate anchors】
② AST 扩展  : 在锚点周围构建有界【结构邻域 structural neighborhood】
③ 身份解析  : SCIP / 语言类型检查器解析符号身份 + canonical 关系（排序前先做）
④ 种子分布  : 词法相关性 + 显式 symbols/paths + workspace 局部性 + query.purpose
              → 归一化的【personalization 种子分布】(seed mass 分级见 §4.1)
⑤ PPR 排序  : query-local Personalized PageRank 对结构邻域排序
              最终序【主要由 PPR 决定】；用户显式指定的 symbol/path 保留【确定性优先】；
              词法 rank + 路径邻近度只作【稳定 tie-breaker】
```

**为什么不在末端融合（核心理由）**：词法信号**不是**与 PPR 并列的第三打分通道——它是 PPR 种子的**上游**（步骤 ①→④）。在步骤 ⑤ 之后再用权重/RRF 把词法和 PPR 合并 = 对同一份证据**重复计数**。分级管线让词法只出现在上游（选锚点 + 喂种子）与下游（tie-break），PPR 独占结构排序。**RRF 仅保留给真正独立的检索通道**（如 lexical + embedding；embeddings 属 Unsupported，故此路 v1 休眠）。

**与下游绑定**：① = A5 步骤①②③（产出锚点）；④ 的 seed mass 分级 = §4.1（query-hit 100 / stack-trace 80 / changed 70 / edited 60，归一化）；⑤ = 附录 A1 的 `pageRank()`。seed-mass 分级权重为 K harness `recall@k` 的**标定项**，非 magic 常量（[ADR 0025](../../adr/0025-staged-ranking-pipeline.md) Consequences）。

---

## 2. 无 embedding 候选生成的两层上游(verbatim 可抄，计划 A5 漏)

> **最大真实空洞**。计划 A5 只 port 了 `codegraph/src/context/index.ts:44` 的符号抽取正则，漏掉了 codegraph 自己 query 管线入口 `query-utils.ts:156 extractSearchTerms` 内部跑的两层：词干扩展 + 正向路径先验。计划全文仅 1 处 `extractSearchTerms`(line 5411，在需求 J grading，非候选生成)，零处 `getStemVariants`/`scorePathRelevance`。纯 lexical 召回因此显著弱于 codegraph 实测基线。

### 2.1 词干扩展层 getStemVariants

**增补：A5(line 349) 第①步后新增『①.5 词干扩展』子步；来自：研究 §5.2(line 1074-1116)+§11(line 1589-1619)；clone query-utils.ts:85-142,156。**

在符号抽取后、喂 FTS prefix 前，把 query token 的轻量英文形态还原变体并进 token 集(纯字符串规则、无依赖、无 embedding)：

```ts
// getStemVariants — 轻量英文形态还原(源: query-utils.ts:85-142, verbatim 抄)
// -ing→cach/cache、-tion→evict、-ment→manage、-ies→entry、-es/-s 去复数、-ed→handle、-er→build/builde
function getStemVariants(word: string): string[] { /* 抄 clone:85-142 */ }

// extractSearchTerms(query, {stems:true}) 把变体并进 token 集喂 FTS prefix(query-utils.ts:156)
```

**验收**：query `'caching'` 命中 `CacheBuilder`；`'eviction'` 命中 `evictEntries`。
**注**：算 path 相关性时 stem 变体要排除(会灌水路径分)——见 §2.2 用 `{stems:false}`。

### 2.2 正向路径先验 scorePathRelevance

**增补：A9 排序公式增设 path-prior 项；来自：研究 §5.4(line 1161-1185)；clone query-utils.ts:221-275。**

计划 A5/A6/A9 只有 test-file ×0.3 这一条**负向**，缺正向路径加权。codegraph 已给精确权重：

```ts
// scorePathRelevance(源: query-utils.ts:221-275, verbatim 抄)
//   文件名命中  +10
//   目录命中    +5
//   一般路径命中 +3
//   test 文件   -15  (除非 query 含 test/spec)
//   project-name token 丢弃 (避免 <ProjectName>/ 下每个文件靠项目名赢；修了 codegraph #720)
// 关键：算路径分时用 extractSearchTerms(word, {stems:false}) 排除 stem 变体，
//       避免一个 PascalCase 词裂成 4 子 token 把同一路径段灌 4×
```

**验收**：query `'session repository'` 时 `src/session/postgres-session-repository.ts` 路径分高于 `src/util/misc.ts`。
计划「FTS+结构排序足够」的结论仍成立(不引入 PageRank 也能跑)，但「结构排序」须含 path 先验，否则弱于 codegraph 实测基线。

### 2.3 静态动作同义词典 A5b(三处都缺的真空洞，需自造)

**增补：A5 新增决策 A5b + A 的工具 schema 增 identifiers[] 入参；来自：研究 §5.2(line 1116)+§11(line 1589-1619)。**

词干扩展救不了不同词根：用户问 `'invalidate auth state'` 而代码叫 `revokeCredential`/`clearPrincipal`/`deleteLoginTicket`。必须靠同义词典(codegraph 与计划都没有)：

```
query 'invalidate authentication state'
  → expanded_terms = [invalidate, revoke, clear, remove, delete,
                       auth, authentication, credential, session, token]
```

**决策 A5b（D14 / [ADR 0026](../../adr/0026-recall-bridge-agent-identifiers-not-synonym-dict.md)）——Core-owned 分层 Query Vocabulary Bridge；这个 gap 单一方案补不了**：

NL→代码召回**不靠任何单一机制**。两个诱人的单点方案都错：① ≤200 条**平铺静态同义表**——通用词表覆盖不了项目 jargon，且 `clear/revoke/delete/invalidate` 是**上下文相关**非全局同义；② **Agent `identifiers[]` 当主召回路径**——一旦召回依赖 Agent 把 NL 转 symbol，Human codeguide + 不配合的 Agent 就**彻底失去 NL 查询能力**。故主路必须 **Core 自有**，Agent hint 只能**附加**。

**Core-owned 分层桥（让 Human 与 Agent 都保住 NL 召回）**：
1. **L1 词法归一**：stemming（getStemVariants）+ abbreviation + 少量高精度归一化（`auth↔authentication`、`repo↔repository`、`config↔configuration`…）。
2. **L2 action family（上下文门控）**：~十几个**低权重** action family（`get/fetch/load`、`delete/remove/revoke/clear`…）。action **只在与对象词联合命中时**才扩（这些动词上下文相关）；**只进候选生成、绝不发图边**。
3. **L3 带 provenance 的项目词汇表**：从 **docs / tests / API·schema / git rename / Domain Model / 人工确认** 建立，每条带来源（Evidence Graph 事实 + Authority level）——这才是覆盖**项目专属 jargon** 的那一层（通用表做不到）。

**Agent hint（附加，非主路）**：CodeQuery 收 `identifierHints[]`（NL→symbol）+ `conceptHints[]`（NL→domain-concept），权重高但**只附加**于 Core 桥之上。

**本仓共现（可加，但克制）**：可引入，但先用**可解释的 sparse association**（非不透明 RI/embedding），**只产 `RELATED_IN_REPOSITORY` 候选边**——**绝不**发 `SYNONYM_OF`、绝不发可信结构边。故 [A11 embeddings Unsupported](#决策-a11--embeddings-与-lsp-as-core-属-outside-current-product-scope) 保持干净：无预训练向量、无不透明稠密向量相似度。

> 参考核查（round 3，修正）：**无任何参考实现手搓 NL 同义词典**（codegraph/各 clone 的 "alias" 全是 import 路径别名）。**codebase-memory-mcp 不能作"纯本仓 RI 能解决 NL→代码召回"的证据**：它的 0.75 是 TF-IDF+RI+MinHash+API/type signature+AST profile 多信号**融合**阈值（RI 仅占 ~0.25），实现**优先读随包 nomic-embed-code 768 维预训练向量**、词表外才用 sparse RI，且手写了 abbreviation/code-pattern 词表——它证明的是"词汇规则+预训练向量+共现+结构信号→related edges"。早稿 A5b 的 ≤200 条平铺表 + "identifiers[] 当主路"**均作废**，替换为本分层桥。

---

## 3. intent → ranking-profile + 边方向随任务翻转

**增补：A5(line 349) 第④步 BFS direction 参数化 + M10(line 7683) 升级为 profile；来自：研究 §7(line 1313-1383) + CodeQuery.purpose(line 1634-1671)；GitNexus §12 方向注。**

M10 当前把 intent 简化为 `goal?:string` 自由文本；A5 第④步 BFS 固定 `direction:both` 会污染两边。改为：

```ts
type RankingProfile = 'locate' | 'follow-call' | 'impact'
                    | 'architecture' | 'find-tests' | 'debug';

// 各 profile 的 BFS 方向(A5 第④步参数化，源: 研究 §7 + GitNexus §12)
//   查实现 follow-call : entry→callees      direction:out
//   查影响面 impact     : changed→callers     direction:in
//   查架构 architecture : module imports/exports
//   查测试 find-tests   : production→referencing tests
```

`goal?:string` 保留为人读精度提示；另加结构化 `purpose` 枚举驱动方向。PageRank 的 profile 化属于 Outside current product scope，但**边方向随 intent 翻转**在 BFS 扩展里是 Required。

---

## 4. personalization 种子多来源加权 + symbol→file 聚合 + 反向 PPR

### 4.1 种子按信号类型分 mass(非同质量)

**增补：附录 A1 §3 seeds.ts(line 8554) + §4 阈值表(8537-8546)；来自：研究 §2(line 117-145)+§8 git/session signals。**

计划硬编码 `Map(node_id -> 100)` 同质量。错误栈/正在编辑的文件是强信号，应分级：

```
seed mass 分级(源: 研究 §2):
  query 命中符号(FTS)        100
  recent stack-trace file     80
  changed file (git)          70
  currently edited file       60
```

即便 git/session 信号尚未接入（运行时 Optional），也要把 seeds.ts 设计成 `Map<nodeId, mass>` 而非同质量集合，为 §4.3/session 信号留口。

### 4.2 symbol-level rank → file-level 聚合

**增补：附录 A1 §3「喂给 G/H」段(line 8529-8531)；来自：研究 §8(line ~600-615)。**

纯 file-level PageRank 三个坑(超大文件因引用多虚高 / 指不出读哪个函数 / 仍整文件读取)。H 需要文件骨架排序时用聚合式，而非对 file 节点直接跑 PageRank：

```ts
fileScore = max(symbolScores) * 0.6 + sum(top3SymbolScores) * 0.4;
```

支撑计划既有的「每节点带 file:line span」决策(能下钻到函数)。

### 4.3 反向 Personalized PageRank 用于影响面(附录 A1 新增 §3.5)

**增补：附录 A1 §3 新增子节 §3.5；来自：研究 §3.4(line 222-234)+§8 direction note。**

改一个符号时，从该符号出发跑**反向** PPR(沿 callee→caller 反边传播)，优先返回最可能受影响的调用链，而非 dump 几百条 references。零成本复用现有 `pageRank()`：

```ts
// 同一个 pageRank()，传入 reversed Edge[](src/dst 互换)
const reversed = edges.map(e => ({ ...e, src: e.dst, dst: e.src }));
const impact = pageRank(reversed, { personalization: { [changedSymbolId]: 100 } });
// top-N 即影响排序(direct callers / API routes / tests / consumers)
```

直接服务需求 J/impact 叙事。

---

## 5. gitnexus 跨文件类型传播(typeBindings 填充来源)

**增补：附录 A2 调用解析(line 9209-9510) Step 2 之后插入；来自：GitNexus §4(line 268-283)；clone finalize-algorithm.ts:208-245 + imported-return-types.ts:18-32,144-225 [非分发安全]。**

A2(line 9304)只讲解析时**读** `typeBindings`，漏了怎么跨文件**填**；缺它 `u=getUser(); u.save()` 只在同文件可解析。算法：

```
1. 对 File→IMPORTS→File 图跑 Tarjan SCC，得反向拓扑序(leaves first)。
2. 按序遍历每 SCC：SCC 内 bounded fixpoint，迭代上限 = |SCC 内边数|(无进展即停)。
3. 每 importer 在镜像 import binding 前，先 chain-follow 源模块 typeBindings，
   使多跳 alias 一遍塌缩成 app.user → User。
4. cyclic SCC 只达 partial fixpoint。
```

**纪律契约(I3/I6)**：此 pass 在 `finalizeScopeModel` 后、`resolveReferenceSites` 前跑；mutate 非冻结的 `Scope.typeBindings`(故意不 freeze)。
**node:sqlite 落地**：复用 A2 **计划已有的** `findImportCycles`(Tarjan，import-cycles.ts:6-110，见 plan line 10745)拿 SCC，按反向拓扑序内存做 typeBinding 镜像 + chain-follow，类型写 `nodes.return_type`。acyclic 为 Required，cyclic 作为后续实现步骤。
**收敛护栏(研究留白)**：cyclic SCC 的迭代上限 capacity=|SCC 内边数|(finalize-algorithm.ts:227)必须抄，否则深 import 环有挂死风险。

---

## 6. gitnexus Leiden 社区检测(回填 plan:9196/9199/11230)

**增补：附录 A2 新增 community 节；来自：GitNexus §6(line 368-407)；clone community-processor.ts [非分发安全]。**

计划只用 cohesion 当排序信号 + community 属 Outside current product scope，无算法。配方：

```
1. Function/Method/Class/Interface 放进 graphology 图，主要用 CALLS 边(非文件夹)。
2. 跑 vendored Leiden(graphology-communities-leiden，never published npm，vendor/leiden/index.cjs)。
3. 确定性 PRNG：固定 seed mulberry32，LEIDEN_SEED = 0xc0de(community-processor.ts:51)
   —— 对 tk E 增量稳定是硬需求，否则 reindex 社区号乱跳、human diff 全红。
4. symbolCount > 10_000 时过滤低置信+低度数噪音，限迭代 + 60s 超时。
5. 产出 Community 节点 + MEMBER_OF 边；label 启发式(§12 不可当权威)；cohesion = 内部边/总边。
```

**裁决（D15 / [ADR 0027](../../adr/0027-community-optional-flows-evidence-backed.md)）——Community = Optional-at-runtime / default-off，且必须明标 derived architecture projection**：
- **不是承重**：Core 默认已有 **package/module 层次 + import SCC + 连通分量 + callers-count/centrality**，故 **Architecture Intelligence 无 Leiden 也完整**；Community 只在**目录结构失真**的仓库给额外功能簇视图。
- **trust 边界**：Community 是 **derived architecture projection**，**不是 bounded context、不进 Domain truth**（与 A4.8「community≠bounded-context」一致）。
- **许可**：gitnexus Leiden = vendored + 整仓 PolyForm-NC → **不可复制**；真实现从**独立许可安全来源或从零写**（label-propagation/连通分量即够的廉价形态）。若真建，则 deterministic PRNG seed 是硬需求（否则 reindex 社区号乱跳、human diff 全红）。
- **fallback**：community 关时 cohesion 继续走 callers-count（plan:11230 已是）。
- **node:sqlite**：Community 落 `nodes(kind='community')`，MEMBER_OF 落 `edges`；解掉 plan:9199/9196。**修正文档矛盾**：line 12739 旧写「community 属 Outside current product scope」**作废**，统一为本条 Optional-at-runtime。

---

## 7. gitnexus Process 流程提取(回填 plan:9196/plan:11199 Flows:)

**增补：附录 A2 community 节之后；来自：GitNexus §7(line 408-485)；clone process-processor.ts / entry-point-scoring.ts [非分发安全]。**

**诚实定位(§7+§12)**：Process 非运行时 trace，是 CALLS 图启发式路径，label 启发式，只当导航/候选，不可当权威业务逻辑(接进 J)。配方：

```
1. 入口打分 = f(caller数, callee数, exported, 命名, 路径, 框架)；
   高分名 main/bootstrap/handleLogin/onSubmit/...；识别 Next.js/Express/Django。
2. 从入口沿 CALLS BFS，护栏 maxTraceDepth=10 / maxBranching=4 / minSteps=3 / maxProcesses=75，禁重复节点。
3. 两轮去重：删子路径；同 entry→terminal 留最长。
4. 产出 Process{entryPointId, terminalId, stepCount, communities[],
            processType ∈ {intra,cross}_community}；STEP_IN_PROCESS{step:N}；Route/Tool 加 ENTRY_POINT_OF。
```

**裁决（D15 / [ADR 0027](../../adr/0027-community-optional-flows-evidence-backed.md)）——gitnexus 式 `HeuristicCallsBfsProcess` = Outside scope；但出局的是机制、不是 Flow 能力，`Flows:` 仍 Required**：
- **机制出局**：上面这套（命名/export/caller-callee 数猜入口 + CALLS-BFS）**只能证图上可达**，证不了运行顺序 / guard 可达性 / 异步事件序 / 状态迁移；即便加 heuristic 徽章，也会与 Required 的 Behavior IR 形成**两套"流程真相"**、违反 A4.8。故 **不建** gitnexus 式永久 `nodes(kind='process')` + `edges(kind='STEP_IN_PROCESS')`——**C5 kind 枚举删 `process`，移除 STEP_IN_PROCESS 边与其 `step` 字段**（plan:10446 的 step 预留作废）。
- **Flows: 仍 Required，改由 `EvidenceBackedFlowProjection` 提供**：从 entrypoint 出发，组合 **resolved call-site + CFG/CDG + guards + state transitions + events + writes + side-effects**（全来自已 Required 的 Behavior IR，D4），**按需投影**，显式返回 **complete / partial / unknown** 覆盖度——**不物化永久 Process 节点**（flows per-query 计算，与 [ADR 0021](../../adr/0021-materialized-readmodel-dirty-queue-local-ppr.md) 一致）。让 `Flows:` 字段(plan:11199)有**可验证**数据，而非启发式串。
- **entry-point 识别**：仍可用命名/export/框架识别**选 entrypoint 候选**（Route/Tool 的 ENTRY_POINT_OF 标注保留），但**流程内容由 Behavior IR 证据填**，不靠 CALLS-BFS 猜路径。

---

## 8. construct-level 可靠性分级表(GitNexus §12 → 需求 J)

**增补：需求 J(J3 加表、J5 强制 LOW、J12 加徽章)；来自：GitNexus §12(line 608-653)+收尾段(line 697-701)。**

计划 J2-J4(line 5318-5517)把 provenance 钉在**边的来源方法**上，缺按**代码构造**分级的信任先验表。三档常量表放 J3 `synthesizedBy` 旁：

```
相对可靠(confidence 高):
  文件结构 / 显式定义 / 显式 import / 显式继承 / 显式类型 / 构造器类型 /
  直接调用 / 同文件作用域 / 显式路由工具
中等可靠(降级标 heuristic):
  跨文件 alias / 返回类型传播 / 接口实现 / 方法重载 / receiver 类型推断
易误判漏判(低置信或不发边):
  反射 / 动态 import / DI 容器 / monkeypatch / 运行时注册 / 事件总线 /
  字符串调用 / 动态属性 / JS duck typing / 宏展开 / 复杂 C++ template
```

落地：
1. 三档常量表给 `resolvedBy` 标先验信任档(落易误判构造→压到阈值下，J13 keep-but-tag)。
2. J5 命中易误判构造(`obj[methodName]()`、`import(var)`)**强制 LOW**，非靠词频。
3. J12：Process/Community label 启发式，human 视图带 **heuristic projection 徽章**，不当事实。

非新算法，是把 edge-level provenance 升级为 construct→trust 先验。与 codegraph 的 synthesizedBy 词表分工互补：edge-level 抄 codegraph(J2/J3 已是)，construct-level 抄 gitnexus §12。

---

## 9. 索引/存储补充(小项)

### 9.1 BM25 以 symbol 为文档单位，扩 FTS 列

**增补：A4(line 313-343) FTS 列扩展 + 需求 D 捕获模型；来自：研究 §5.3(line 1118-1159)。**

A4 `nodes_fts` 仅 4 列，搜字符串字面量(错误消息)或路由名命不中。扩列：

```sql
-- nodes_fts 增列(源: 研究 §5.3 SymbolSearchDocument)
identifier_tokens,  -- 预拆分子词(喂 stem 前的原词)
literals            -- string literals + route names + test names
```

需与需求 D 捕获模型对齐：这些 token 在 AST extract 阶段填出。

### 9.2 unresolved 调用边的 BFS 策略

**增补：A5(line 349) 第④步；来自：研究 §2(line 892-915)+§3(line 945-998)。**

`CallEdge.confidence ∈ {exact, likely, unresolved}`。A5 第④步 BFS 沿 calls 扩展时，**unresolved 边降权计入(不剪枝)**——SCIP 未装时大量跨文件调用都是 unresolved，剪掉就断链；待 SCIP/TypeChecker(A11)介入再升级。

### 9.3 graph-storage 对照注

**增补：C5/C6(plan:1318/1383) + C 决策汇总(plan:1656)；来自：GitNexus §5(line 305-367)。**

gitnexus 单张 `CodeRelation` 表 + type，边带 `{type, confidence, reason, step?}`——tk edges 已等价。但 LadybugDB/Kuzu 必须显式声明每种 `(起点 kind, 终点 kind)` 组合致 schema 极长；**node:sqlite generic 表无此约束(FK 只认 id)**——这是 committed node:sqlite 相对 graph-DB 的未点出好处，补进 C 决策汇总。另：gitnexus node-kind 含 Route/Tool/Community/Process/Section；**C5 kind 枚举预留 `community`（Optional，D15）但删 `process`**（gitnexus 式 Process 出局，[ADR 0027](../../adr/0027-community-optional-flows-evidence-backed.md)）；Route/Tool/Section 视需求保留。

---

## 10. dangling 溯源补全(小项)

**增补：附录 A1 §2b 注(line 8406) + §3 代码注释(line 8500)；来自：clone _pagerank.py:115-116 vs plan 8500-8506。**

tsa `_pagerank.py` 的 dangling 质量**均匀**撒到所有节点(`base=(1-alpha)/n + dangling_sum`)；计划 TS 版把 dangling 质量乘到 personalization 向量 `p[]`(aider 式 dangling=personalization)。两者都是合法变体但结果不同。§2b 注现只列了(a)边权重(b)personalization 替换 uniform，**漏了第三点(c)dangling 再分配从 uniform 改成偏 p**。在 §2b 注末尾补明：计划走 aider 路线(有种子时质量不漏给无关全局节点)，**选择正确，只是溯源说明不完整**，避免实现者误以为 TS 版是 tsa 直译。

---

## 11. 两份新文档自身的留白(实现前需自补，无现成可抄)

- **静态动作同义词典内容**：研究反复要求却从未给条目/规模/构造法(§5.2/§11)。tk 需自造(建议从 CRUD 动词族 + auth/session/lifecycle 高频动作起，≤~200 条)。
- **NL 概念召回上限无量化**：研究 line 1619 自承「无 embedding 上限会低一些」「没想象中严重」是纯论断，无 recall@k。需求 K 度量针应把『纯 lexical+stem+同义 vs 加 embedding』的 recall 差列为实测项，否则 embeddings 不纳入（Unsupported）这一核心假设缺验证。
- **边权重无 benchmark 来源**：关系权重表(call 1.0/impl 0.9/type 0.7…)是工程直觉，无消融。计划 harness(A9 记 recall@k)本可标定，但没人把 edge-weight 标定列为实验。
- **PPR 性能上界 / 局部子图策略**：两 doc 都没给大 monorepo(10^5~10^6 节点)纯 TS 幂迭代延迟，也没把『PPR 只在种子诱导子图上跑』明确为性能策略；计划 rankService(line 8555)拉全图按 query 指纹缓存，query 一变缓存即失效，可能成热路径瓶颈。配合分层缓存：全局无种子 PageRank(给 H)缓存一次 + 每 query 只跑增量种子偏置。
- **Semantic Slice 切片算法**：研究 §8(line 1413-1453)只列应含/排除什么，没给『哪个 import 相关 / 哪个 field 在目标方法被用』的判定算法；计划 A7 只做 code-block 截断+container outline，未触及 dependency-aware slice。
- **detect_changes / rename 复合工具未映射**：gitnexus 的 `detect_changes`(git diff -U0 行范围→符号→受影响流程)正是 tk E 增量+impact 的天然组合，两文档都漏了映射进 tk 工具面，是现成产品形态。


