> **[2026-07-04 P28] SUPERSEDED** — the 4-tool + QueryPlan external surface is replaced by the 3-tool surface (P25②); QueryPlan internals survive inside `context()`'s code section. Rest distilled into `CONTEXA-IMPL.md` §12.

# 附录 A4:语义 / 领域 / 业务逻辑层的吸收(2026-06-21,来自 `Token-killer-Research.md` Part 3–4)

> **为什么补这节**:行动计划主体(及附录 A1–A3)偏"结构图 + 找代码"(强偏 codemap 智能体面);而 `Token-killer-Research.md` 后半 ~2100 行(line 1718–3808)是一整套**语义 / 领域 / 业务逻辑理解层**,服务 **需求 A(人理解上半,codeguide 人类面)、B(智能来源的静态↔LLM 边界,codemap 智能体面)、I(协作:领域词汇/用例追溯/人工确认)、J(信任:四种可信度)**。之前 gap 分析的 `architecture-3tier` agent 失败 + 只扫了前 1200 行,故这块漏吸收。
>
> **关键定位(研究 §八 line 2843)**:这是叠在结构 codemap 之上的**"知识层"(Repository Intelligence / Context Knowledge Layer)**,**不是塞进 tk 的输出压缩内核**。代码可验证语义(实施步骤一,operational semantics)为 Required;domain/business 能力当前在产品范围内但依赖宿主 LLM,且 **LLM 仅借宿主做"命名/解释",绝不发明事实、不读整仓**(契合强倾向 + 需求 B 的 derive-not-generate)。

## A4.0 一句话边界(总纲)

| 层 | 谁来做 | 产出 | 可信度档 |
|---|---|---|---|
| operational semantics(程序做了什么) | 静态:AST / SCIP / CFG / DFG | 条件/状态/读写/异常/副作用(可验证) | **Observed / Derived** |
| business semantics(为什么、叫什么) | **宿主 LLM**(只解释已抽取的 semantic slice) | 业务命名、规则候选 | **Inferred** |
| canonical(权威) | 人工 / Jira / 领域专家 / 文档 | 确认的业务规则 | **Confirmed** |

> 研究 §十(line 3010)的 thesis:**"真正有价值的 semantic layer 不是一个 embedding index,而是一个带类型、来源、证据、版本和置信度的可追溯知识层。"** —— 这正是 embeddings-OUT 决策对"语义检索"也成立的根据:做 **structural semantic retrieval(靠类型化边 + 领域词典),不是 vector semantic search**(研究 §四 line 2486)。

## A4.1 五层 semantic(术语纪律:系统设计中禁止单说 "semantic",必须标明哪一层)

来源:研究 §一(line 1718–1923)。服务 A(定义"intelligence"到底指什么)。

| 层 | 来源 | 回答 | tk 落点 |
|---|---|---|---|
| **Lexical** 词汇语义 | 标识符/路径/注释/错误/API名/DB字段/commit | 用了哪些词、可能对应什么概念 | 需求 A 候选生成 + 附录 A3 §2(词干/同义)+ A4.2 Level 1–2 |
| **Program** 程序语义 | AST/TypeChecker/SCIP/CFG/DFG/调用/读写/异常 | 程序实际如何执行、数据流向 | 需求 A/C/D + 附录 A2(CFG/dataflow)= Behavior facts |
| **Architectural** 架构语义 | 模块/目录/API边界/DB所有权/消息/部署/git-ownership/聚类 | 这段代码在系统里扮演什么角色 | 需求 H(人理解)+ A4.6 Domain Graph;**多信号融合**(文件夹名≠架构) |
| **Domain** 领域语义 | DDD:BoundedContext/UbiquitousLanguage/Entity/ValueObject/Aggregate/Command/Event/Policy | 业务世界的概念与关系 | A4.5 DomainNodeKind;**同名≠同节点**(Sales.Customer ≠ Billing.AccountHolder) |
| **Business** 业务语义(最难) | 规则/不变量/决策表/状态机/公式/权限/工作流/合规/补偿 | 为什么这么做、什么条件允许/禁止/改变结果 | A4.5 BusinessRule + A4.7 还原五步;**非 LLM 不可**(需带置信推断) |

**边界铁律(研究 line 1699/3443)**:调用图能证 `OrderController.confirm → OrderService.confirm → Inventory.reserve → Payment.authorize`,但**证不了**"只有库存预留成功且支付授权通过,订单才能进 Confirmed —— 这是公司交易一致性规则"。后者含业务意图/约束/为什么 → 需代码外证据或带置信推断。**CPG 恢复 operational semantics,LLM/domain 恢复 business semantics**。

## A4.2 无-embedding 结构化语义检索 5 级(serves the codemap agent surface,vector embeddings 列为 Unsupported)

来源:研究 §五(line 2522–2680)。这是"Lexical 找入口 + PageRank 排优先级"在**语义/业务问题**上的展开。

1. **Level 1 领域词典匹配**:`业务术语 → 别名 → 代码术语`(词典来源:人工确认 / 文档提取 / 代码提取 / LLM 建议未确认)。无 embedding 时尤其重要(= 附录 A3 §2.3 的动作同义词典的领域版)。
2. **Level 2 Lexical / BM25**:索引 symbol/qualified/path/signature/comments/error/test/API/event/schema 名;**以 symbol 和 rule-candidate 为文档单位,不要只以文件为单位**(增补需求 A4 的 nodes_fts,见 A3 §11)。
3. **Level 3 Typed Graph Expansion**:沿 `DEFINES/CALLS/READS/WRITES/EMITS/HANDLES/VALIDATES/TRANSITIONS_TO/IMPLEMENTS/TESTED_BY/DOCUMENTED_BY/CHANGED_WITH` 扩展。**"语义"来自边的类型,而非相似度。**
4. **Level 4 Task-specific PageRank**(不同问题不同边权,= 附录 A3 §3 ranking-profile 的语义版):
   - 查业务规则 → guard / validation / state-transition / error / test-assertion
   - 查业务流程 → entrypoint / call / event / persistence / external-side-effect
   - 查领域模型 → type-relationship / ownership / aggregate-containment / event-command
   - 查影响面 → reverse-calls / type-refs / event-consumers / tests / co-change
5. **Level 5 Evidence Projection**:**不给 Agent 整个图**,只给最小证据投影(这是需求 G 输出经济 + J 信任的统一输出格式):

```yaml
# 源: Token-killer-Research.md §五 Level 5 (line 2653-2677), verbatim
concept: Order Cancellation
candidate_rules:
  - statement: Settled orders cannot be cancelled
    status: inferred
    confidence: 0.91
    evidence:
      - src/domain/order.ts#Order.cancel:72-84
      - tests/order-cancel.test.ts:41-67
      - error: SettledOrderCannotBeCancelled
implementation_flow:
  - CancelOrderHandler.execute
  - Order.cancel
  - OrderRepository.save
  - OrderCancelled event
unresolved:
  - whether administrators can override this restriction
next_read:
  symbol: Order.cancel
  mode: edit_window
```

## A4.3 Smart Read 三模式(吸收进需求 G —— 输出经济不止 signature-collapse)

来源:研究 §8(line 1387–1471)。"PageRank 找到该读的符号,AST 决定如何返回最少但足够的源码。"

- **Symbol Read**:`smartRead({path, mode:"symbol", symbol})` → 只返回该方法体。
- **Semantic Slice**:编辑方法时只返回 `相关 imports + class fields + constructor 相关依赖 + 目标方法 + 直接引用的本地 helper + 必要类型声明`;**不返回**无关方法/imports/长注释/其他类/测试 fixture。
- **Edit Window**(联动 J):编辑上下文**源码必须 byte-exact + content_hash**,**编辑窗本身不可概括**:

```yaml
# 源: Token-killer-Research.md §8 Edit Window (line 1459-1469), verbatim
type: edit_window
path: src/session/session-service.ts
range: { start: 34, end: 65 }
symbol: SessionService.create
content_hash: sha256:...
content: |
  ...
```

> **增补需求 G**:G 的 char 预算分层之上,read 工具按 `mode: symbol | slice | edit_window` 三态;`edit_window` 不参与压缩、带 `content_hash`(与 J 的 staleness/`content_hash` 同源)。

## A4.4 内部 QueryPlan（**非**外部统一工具）—— 三正交维度，profile 降为内部 preset〔D17 / [ADR 0029](../../adr/0029-agent-tool-surface-operation-contracts-queryplan.md)〕

来源:研究 §最终组合(line 1633–1667)。**修正（D17）**：早稿把它当成一个**外部统一 `CodeQuery` 工具**（purpose 枚举驱动一切）——**作废**。理由：① codegraph 实测 1-tool 门大亏(−43%→+107%)；② 六 profile **混了不同维度**（locate/understand=任务目标，flow/impact=遍历模式，domain=知识层，verify=信任/投影模式），塞进一个 purpose 枚举是把正交维度压平。

**外部表面**（D17 / F.3）= codegraph 实测的 **4 个操作合同工具** `tk_explore / tk_search / tk_node / tk_callers`（4 种职责，非 6 profile、非 1 万能工具）。**每个工具把窄参数编译成完整 `QueryPlan`，重参数协议绝不丢给 Agent。**

**内部协议 = `QueryPlan`，分三正交维度**（替代旧 `CodeQuery` 单体）：

```ts
// 内部 QueryPlan（不外暴露）；六 profile = 它的命名 preset
interface QueryPlan {
  selection:  { layers: Array<'code'|'behavior'|'domain'|'evidence'>;  // 查哪些知识层
                query?: string; symbols?: string[]; paths?: string[];
                identifierHints?: string[]; conceptHints?: string[] };  // D14 召回桥
  traversal:  { direction: 'callers'|'callees'|'flow'|'impact'|'none';  // 图方向（= A3 §3）
                maxGraphDepth?: number };
  projection: { mode: 'understanding'|'editing'|'verification';         // Smart Read 模式（A4.3）
                shape: Array<'locations'|'outline'|'source'|'evidence'>;
                tokenBudget?: number; maxResults?: number };
}
// profile preset 例：'flow' = {traversal.direction:'callees'+flow, projection.mode:'understanding'}
//                    'verify'= {selection.layers:[...,'evidence'], projection.shape:['evidence',...]}
// 内部执行: 词法候选锚点 → AST 扩展 → SCIP/TypeChecker 解析 → query-local PPR 主排序（D13）→ Smart Read 投影
```

> **增补需求 F（D17）**：六 profile（locate/understand/flow/impact/domain/verify）是 **QueryPlan 的内部 preset**，**不是**外部工具名、**不是**单个 purpose 枚举。Domain/Evidence 先经 `tk_explore.layers` + `tk_node.include` 暴露；**只有 tk 自有 Domain/Evidence harness 证明独立工具显著改善选中率/调用数/质量，才加一个新默认工具**（不预开 tk_domain/tk_verify）。这样既守 4-tool eval 证据，又不让代码导航工具结构框死完整 Repository Intelligence Core。

## A4.5 四种可信度 + 知识数据模型(吸收进需求 J,精化 C)

来源:研究 §七(line 2794–2837)+ §六(line 2681–2790)+ Part4 §4(line 3613–3683)。**"这是整个系统能否真正企业级的关键。"**

- **Observed**:AST/SCIP 可验证的直接事实(`Order.cancel 在 72–84 行抛 SettledOrderCannotBeCancelled`)。
- **Derived**:确定性推导(SCIP/TypeChecker 精确解析的调用)。
- **Inferred**:语义推断(`Order.cancel 可能实现"结算后禁止取消"`)—— **必须标记**。
- **Confirmed**:人工/权威文档确认 —— 才可作 canonical domain knowledge。

> **精化需求 J**:把现有二元 high/low 检索分级升级为 **4-tier(Observed/Derived/Inferred/Confirmed)**;每条结论携 `EvidenceRef[]` + `derivation`。可抄数据模型:

```ts
// 源: Token-killer-Research.md §六 (line 2685-2737), verbatim
type KnowledgeStatus = "observed" | "inferred" | "confirmed" | "conflicted" | "deprecated";
type EvidenceKind = "source-code" | "test" | "api-schema" | "database-schema"
  | "documentation" | "requirement" | "issue" | "commit" | "runtime-trace" | "human";
interface EvidenceRef {
  kind: EvidenceKind; uri: string; symbolId?: string;
  startLine?: number; endLine?: number; revision?: string; hash?: string;
}
interface KnowledgeAssertion {
  id: string; subjectId: string; predicate: string; objectId?: string;
  literalValue?: string | number | boolean;
  status: KnowledgeStatus; confidence: number;
  evidence: EvidenceRef[];
  derivation: "direct" | "ast-rule" | "graph-inference" | "lexical-inference"
            | "llm-proposal" | "human-authored";
  validFromRevision?: string; validToRevision?: string; lastVerifiedAt?: string;
}
```

**BusinessRule 必须结构化(非 NL 串)** —— 反 Understand-Anything 的 `businessRules: ["..."]`:

```ts
// 源: Token-killer-Research.md Part4 §4 (line 3613-3647), verbatim
interface BusinessRule {
  id: string; domainId?: string; useCaseId: string;
  title: string; description?: string;
  ruleType: "precondition" | "invariant" | "authorization" | "state-transition"
          | "calculation" | "temporal" | "consistency" | "compensation";
  condition?: LogicExpression; outcome: BusinessOutcome;
  status: "observed" | "derived" | "inferred" | "confirmed" | "conflicted" | "deprecated";
  confidence: number; evidence: EvidenceRef[];
  introducedAt?: string; lastVerifiedCommit: string;
}
```

> **精化需求 C**:domain 信息 **不写进 AST/SCIP 节点**(研究 §六 line 2683 "保持不同知识层和来源隔离")。在 node:sqlite 的**同一张表**里用 **SEPARATE node kind** 表达:
> `DomainNodeKind = bounded-context | capability | use-case | actor | entity | value-object | aggregate | command | event | policy | business-rule | state | workflow`;
> `TechnicalNodeKind = repository | package | module | file | symbol | endpoint | table | column | queue | config | test`;
> 跨层边:`UseCase IMPLEMENTED_BY Symbol`、`BusinessRule ENFORCED_BY Symbol / VERIFIED_BY Test`、`Entity PERSISTED_IN Table`、`Command HANDLED_BY Symbol`、`Event EMITTED_BY/CONSUMED_BY Symbol`、`Concept ALIAS_OF Concept`、`Symbol BELONGS_TO_CONTEXT BoundedContext`。

## A4.6 多图模型:Code / Behavior / Domain / Evidence(架构精化,与 "ONE BACKEND" 协调)

来源:研究 §八(line 2867–2927)+ Part4 §5(line 3717–3777)。**四张相互关联但不混淆的图**:

| 图 | 内容 | 回答 |
|---|---|---|
| **Code Graph** | symbols / calls / imports / types / references | 代码如何连接 |
| **Behavior Graph** | entrypoints / conditions / branches / state-transitions / reads-writes / events / exceptions / side-effects | 程序实际行为(CFG/dataflow,= 附录 A2) |
| **Domain Graph** | domains / capabilities / use-cases / entities / rules / policies / workflows | 系统在业务上表达什么 |
| **Evidence Graph** | code / tests / docs / requirements / commits / runtime-traces / human-validation | 凭什么相信这个结论 |

连接:`UseCase IMPLEMENTED_BY Symbol`、`Rule ENFORCED_BY Guard`、`Rule VERIFIED_BY Test`、`Flow STARTS_AT Entrypoint`、`Step CAUSES StateTransition`、`Step EMITS Event`、`DomainRule DOCUMENTED_BY Requirement`、`Rule INTRODUCED_BY Commit`。

> **与 "ONE BACKEND, TWO SURFACES (codemap = agent, codeguide = human)" 协调**:仍是**一个 node:sqlite 单文件**,但 4 类 node kind + 跨图边。"四图"是**逻辑分层不是四个库**;别把 domain 揉进 code 节点(否则 staleness/置信度/来源混在一起无法分别失效)。

## A4.7 业务逻辑还原:per use-case 五步(domain/business 能力的落地配方,host-LLM 依赖)

来源:研究 Part4 §3(line 3464–3594)。**可靠方法不是"让 LLM 总结整仓业务",而是以单个业务用例为单位**:

1. **识别入口**:HTTP route / GraphQL resolver / CLI / event consumer / scheduled job / UI action / workflow handler。
2. **恢复执行切片**(AST/SCIP/调用图/类型):**只保留**业务判断/状态变化/持久化/外部调用/事件/异常/补偿;**折叠**日志/mapper/通用工具。
3. **提取行为事实**(CFG/AST/dataflow → 结构化字段,非 NL 段落):`preconditions / guards / stateTransitions / writes / events / errors / sideEffects`。
4. **LLM 语义命名**:**LLM 不发明事实,只把已抽取事实解释成业务语言**;输入**只给相关 semantic slice**,不给整文件/整仓。产出 `rule.title + formalCondition + outcome`。
5. **测试 / 文档交叉验证**:测试佐证 → `status: corroborated`;README 与源码冲突 → `status: conflicted`,**系统不擅自选边**。

## A4.8 反面清单(吸收进需求 M —— 从 Understand-Anything / DeepWiki / Codebase-Memory)

来源:研究 Part4(line 3166/3257/3401/3793–3801)。

- **summary 叠加误差**:文件摘要 → 节点摘要 → 二次 LLM 领域归纳;第一层漏了 guard/异常/状态,domain 分析一路看不到 → **domain 必须重锚源码,不在有损摘要上二次推导**。
- **businessRules 存成无证据 NL 串**(Understand-Anything)→ 必须结构化 `BusinessRule + EvidenceRef`(A4.5)。
- **LLM 决定流程顺序而不校验 call/CFG**。
- **community(技术聚类)≠ bounded-context(业务域)**:共享 utils / 公共鉴权 / 统一日志 / ORM 基础设施在结构图里连很多模块,但通常不是业务域 → community 是确定性聚类、"它是哪个业务域"是 LLM 推断,二者分开标。
- **schema 正确 ≠ 业务内容正确**:只验图结构/schema 而不对每条业务结论重读源码反证 = 假可信。
- **CPG 恢复 operational semantics,别误当 business semantics**(`status==SETTLED 抛异常` ≠ "SETTLED 在企业里意味着资金已结算不可逆")。

## A4.9 构建顺序(4 个实施步骤,reconcile "跨需求实施路线")

来源:研究 §九(line 2931–2969)。

- **实施步骤 1 代码可验证语义(Required 能力)**:symbol/AST index + SCIP/TypeChecker + import/call/type graph + route/event/DB/test 识别 + 条件/异常/状态转换/校验规则抽取;**所有结论留源码范围 + hash**。= Behavior facts,可验证、零/借宿主。
- **实施步骤 2 领域词汇 + 用例**:identifier/comments/schema term mining、glossary/alias、route→service→domain→DB/event 流程、tests→Given/When/Then、business-rule candidates。
- **实施步骤 3 多源知识**:README/ADR/docs、git/PR/issue、Jira/Confluence、DB schema、OpenAPI/AsyncAPI、runtime traces。
- **实施步骤 4 人工确认 + 持续**:确认 bounded-context、确认正式业务规则、冲突检测、版本化 + 失效、commit 增量重算。

> **统一执行模式**(研究 line 2997 / Part4 §5):`结构解析 → 领域词汇抽取 → 用例链路恢复 → 规则候选提取 → 多源证据关联 → 明确置信度 → 人工确认 → 按任务投影最小证据`。**不是**"LLM 读完整仓总结业务"。

## A4.10 借鉴 / 不照搬 Understand-Anything(服务 A/H)

**借鉴**:Tree-sitter 与 LLM 分工;先结构图再语义;`Domain → Flow → Step` 展示模型;以入口点作业务流程线索;增量更新;Knowledge Graph 与 Domain Graph 分离;给业务角色独立视图(persona)。
**不照搬**:从文件摘要二次推导完整业务逻辑;规则存无证据字符串;LLM 定流程顺序不校验控制流;Domain 节点无版本化证据;不区分 observed/inferred/confirmed;不显式建模异常/状态/事务/副作用/补偿;图 schema 正确就认为业务内容正确。

## A4.11 Open Decisions(2026-06-21)+ 残留细化

**已定:domain/business 知识层 = 全 4 个实施步骤 Required(选项 c,覆盖原"倾向 (a)")。** domain/business/evidence 知识层与结构 codemap **同等 Required** —— 实施步骤 1 代码可验证语义 + 实施步骤 2 领域词汇/用例 + 实施步骤 3 多源知识 + 实施步骤 4 人工确认全部 in-scope。这把需求 **A(人理解上半)、I(协作)从依赖步骤提升为一等 Required**。

> ⚠️ **必须正视的张力(实施前细化,不推翻决策)**:选 (c) 含 **实施步骤 3 多源 = Jira / Confluence / runtime-traces**,这些需 **egress / 外部集成**,与"无 server / 零 egress"强倾向冲突。**调和**:本地源(git history / README / ADR / docs / OpenAPI / DB schema)零 egress、Required;**外连源(Jira/Confluence/runtime-traces)的取数必须经宿主或用户自配连接器,tk 自身不持 egress、不内置凭据**(与 M23 明文凭据黑名单一致)。即实施步骤 3"多源"为 Required,但 **tk 只消费"已在本地 / 由宿主取来"的证据,不自己外连**。

**残留细化(非阻塞起建)**:
1. **business semantics 的宿主 LLM 调用 = on-demand,Required capability;其宿主 LLM 运行时依赖为 Optional at runtime**(用户点某 use-case 才生成,不预生成全仓);per-use-case 五步设调用上限,实施时定具体数字。倾向如此。
2. **EvidenceKind 的 `runtime-trace` / `issue` / `requirement`** 等外连来源:若无本地数据,其运行时数据为 **Optional at runtime**(schema 预留),不阻塞实施步骤 1/2。
3. **Domain Graph 的人工确认 UI**(实施步骤 4)走需求 I 的 `.tk/` 文件回写(JSONC 控制文件 + human-fence),复用已定的协作机制,不另起 server。
