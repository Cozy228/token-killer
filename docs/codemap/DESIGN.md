> **[2026-07-04 P28] AMENDED OVERLAY — read together with repo-root `CONTEXA-DESIGN.md` §9 (Contract Amendments Register).** D3 restructured (content types × carriers), D17 amended (3 tools: context/search/remember), D21③ outside scope, D33 amended (Node ≥22.5 flat, CLI = installer/bootstrap/fallback, P10/P28), the four-inspector codeguide composition superseded by CONTEXA-DESIGN §6's page set, and the slice-DAG build order replaced by `CONTEXA-IMPL.md` §9 M1–M5. Carried D-items remain authoritative HERE **permanently** — per P29 (reference-not-copy doc strategy) they are never restated into the Contexa docs, only referenced; read-back map: `CONTEXA-IMPL.md` §12.

# codemap — Product Contract & Capability Specification

> **权威说明（Authority）.** 本文件顶部到 `## Decision Log` 为止，是 **codemap 的绑定产品契约**，由 2026-06-21 grilling 的 D1–D9 与 Terminology Law 综合而成。它**取代**本文件下半部（`# 源指南索引` 起的 `各需求 A–M 明细`、`附录 A1–A4`）以及 `docs/adr/0013–0016` 的*框架与口径*。
>
> 推导与证据已拆到 [`IMPLEMENTATION.md`](IMPLEMENTATION.md) 和 [`impl/`](impl/)。
> 只把它们当 source-cited 实现证据读，绑定口径以本契约为准。凡冲突，**契约 > 证据**。

---

## 1. Product Definition

**codemap 是一个完整、有界的产品（one complete, bounded product），不按版本切割。** 它是 tk 的项目本地代码智能：在统一的 canonical backend 上，为两类受众同时提供 Required 产品面——

- **Agent Surface** — 帮 Agent 高效定位/理解代码并节省 token（Required）。
- **codeguide** — 帮人理解项目结构、行为、领域与证据（Required，只读、有界）。

二者**同等、同属一个产品**，不是"先做一个、后补另一个"。

**固定锚点（Fixed anchors）.**
1. **目标平台**：主 = VS Code Copilot on Windows；次 = Claude Code on macOS。
2. **目标**：项目本地智能，两件同等重要的工作——(A) 帮人理解项目；(B) 帮 Agent 高效找代码/省 token。

## 2. Product Principles（含 Terminology Law）

**强倾向（推翻需"明显更优 + 量化证据"）.**
- **Storage = node:sqlite (+ FTS5)**；零原生编译、零 native 绑定。
- **LLM = host-borrowed / subscription-CLI only**：绝不内置 API key，无模型出网，无 API token 花费。任何需要 LLM 的能力都设计成"喂宿主 Agent 去生成 / 让用户订阅买单"。

### 2.1 Terminology Law（术语法，全文强制）

**不按产品版本切割语义闭环，不用"以后再补"掩盖架构债务。** 删除并禁止：`v1 / v2 / MVP / first release / later release / future phase / thin slice / vertical slice / 留槽 / 以后填 / 推迟到下一版本 / Phase 1·2（指产品阶段时）/ roadmap phase`。

所有能力**只能**用下列状态之一描述：

| 状态 | 含义 |
|---|---|
| **Required** | 产品契约必要组成，必须真正 operational，**不允许只有 schema 槽位或空 interface**。 |
| **Optional at runtime** | 产品完整支持，但运行时依赖可能不在场（如 SCIP index、host LLM model）。 |
| **On-demand** | 属于产品，但只在显式工具 / profile / 用户动作触发时执行。 |
| **Profile-specific** | 仅对特定 query / projection profile 生效。 |
| **Capability-bounded** | 能力已完成，但语义范围**明确封闭**，不暗示未来必须无限扩展。 |
| **Unsupported** | 当前契约明确不支持，调用时**诚实**返回 unsupported / coverage 状态。 |
| **Outside current product scope** | 不属于当前产品定义，**也不是承诺的"下一版本功能"**；未来纳入须重新做产品+架构决策，不因旧文写过而自动成待办债务。 |
| **Implementation dependency** | 仅描述代码实现的依赖顺序，**不代表多个产品版本**。 |

**Authority Levels 不是开发阶段**：`Observed / Derived / Inferred / Confirmed` 是**事实权威等级**，在同一个完整产品中同时存在。
- tree-sitter 直接源事实 = **Observed**；CFG / 聚类 / 计算结果 = **Derived**；host-LLM 提案 = **Inferred**；权威文档或人工确认 = **Confirmed**。

**总原则**：> Build the complete bounded product, not a sequence of incomplete releases.

## 3. Product Contract（绑定的"必须 operational"）

**Required surfaces**：Agent Surface（§10）、codeguide（§11）。

**Required operational layers**（四层知识，统一 canonical backend，皆 Capability-bounded；每层必须有真实 producer + canonical schema + provenance/evidence + query path + Agent projection + codeguide display + correctness tests；**禁止空表/nullable 字段宣称"以后支持"**）：

| 层 | Required 内容（capability-bounded，详见 §4） |
|---|---|
| **Code Graph** | tree-sitter 结构、calls、imports、inheritance、override/implements、符号级 reads/writes/returns，精确 source span。 |
| **Behavior Graph** | Structural Execution（全语言）+ Intraprocedural CFG / scalar def-use（Behavior 语言集）+ Dispatch/Effect（封闭 framework catalog）。 |
| **Domain Graph** | Deterministic Domain Core（无 LLM 即 operational）+ On-demand Semantic Promotion（host-LLM，Inferred，非承重）。 |
| **Evidence Graph** | FactClaim + Arbitration Layer：每条事实带 source/revision/producer/authority/confidence/freshness 与 typed support/conflict 关系。 |

**统一 backend 原则（D2/D3）**：tk 直接建立**统一的 canonical store / identity / extraction pipeline / query engine**，把 SCIP、PageRank、Behavior、Domain、Evidence、confidence、freshness、token-budgeted projection 做进**同一个后端**，而非在某个外部 DB 上叠 overlay。

## 4. Capability Boundaries

### 4.1 Behavior（capability-bounded contract）

封闭构造集（**不**以"22 语言 + 所有框架"定义完整性，以封闭 Behavior IR + 显式 producer coverage 定义）：

1. **Structural Execution（全 supported 语言）**：entrypoint、call chain、test-to-code、override/implementation dispatch（直接组合 Code Graph）。
2. **Intraprocedural CFG**：BasicBlock + 固定边类型（seq / true-false branch / loop / fallthrough / break / continue / return / throw / exception / finally）。**Behavior 语言集 = TS/JS/TSX/JSX、Python、Java、C#、Go**。Rust / C / C++ 只有 Structural Execution，**不承诺 CFG**。
3. **Intraprocedural scalar def-use**：仅参数与局部 binding；语义 = flow-sensitive may-reaching-definitions。**Unsupported**：property/field、heap、alias、closure capture、global、interprocedural、taint。
4. **Dispatch & Effect**：核心通用构造 Trigger / Registration / Handler / Emission / Schedule / Effect；**封闭 framework profile catalog**（Express / Hono / NestJS / FastAPI / Spring MVC / ASP.NET Core / Gin / EventEmitter / Kafka listener / BullMQ / Celery / Spring Scheduled / Hangfire …）映射到统一 IR；**catalog 外记 `coverage=unspecified`，保留 generic call graph，不声称无 flow**。已解析 call site 的 DB/cache/filesystem/network/message/process effect 可直接分类；status/state 字段直接写入在严格条件下记录。**不是 taint-lite，不是完整 PDG。**

每个 Behavior fact 必带：source span、producer/version、derivation、Observed/Derived/Inferred、confidence、`coverage ∈ {complete, partial, truncated, unsupported, unspecified}`。**超预算（函数行数/block 数/事实数/分析时间）必须诚实标 `truncated`，不返回貌似完整的子集。**

### 4.2 Domain（Deterministic Domain Core + Optional Semantic Promotion）

**host-LLM 对 Domain 的运行不承重，对高阶业务语义承重。** 无 LLM 时 Domain 仍完整 operational。

- **Deterministic Domain Core（Required，无 LLM）**：DB/ORM entities·fields·relations·constraints；OpenAPI/AsyncAPI resources·operations·messages；docs/ADR glossary·definitions·decisions·constraints；naming、git change-coupling、tests，以及 Behavior 提供的 concept candidate / context candidate / use-case skeleton / rule candidate。皆带稳定 ID、source/evidence、revision、confidence、query path、fixtures。
- **"静态只产出能证明的"**：naming/cluster → `ContextCandidate`（非 `BoundedContext`）；route→service→DB/event 链 → `UseCaseSkeleton`（无 doc/LLM 只用技术名）；guard + outcome → `RuleCandidate`（不擅自升业务政策）。
- **Semantic Promotion（On-demand，host-LLM，Inferred）**：concept 归一、alias / bounded-context 提案、use-case 业务命名与叙事、business-rule 表述、concept↔code/behavior/docs/tests 关系提案。**所有输出 `status=inferred`**；不能创建 Observed/Confirmed，不能改 call/CFG 顺序，不能无证据写 canonical graph。仅用户对某 candidate/skeleton 主动触发；输入 = token-capped typed semantic slice（**非整仓**）；输出过 schema/ID/evidence-scope/authority/conflict/revision 校验；无证据提案拒绝/隔离。
- **分离存储**：static facts / derived candidates / inferred proposals 分开存；proposal 记 model/prompt-version/input-revision-hash，支撑变化即标 stale。LLM 不可用 → 静态结果逐条不变，返回 `semanticPromotion=unavailable, narrative=null`，**不生成模板假叙事**。

## 5. Canonical Data Model

**物化读模型（D8）**：以下物化——FactClaims、identity bindings、ArbitrationDecisions、canonical edges、函数局部 CFG/def-use/effect。
**不物化（按查询从有效图遍历）**：跨函数 route/event/job flow、impact path、Context Packet、query-local PPR。

逻辑实体：`FactClaim`（不可变，producer 提交）、`CanonicalSymbol`（稳定 opaque ID）、`SourceDefinition`/`SourceOccurrence`、`ArbitrationDecision`（物化的 canonical edge，引用 supporting/conflictingClaims）、dependency index（claim→decision→canonical edge→local derived fact）、canonical generations（canonicalGeneration / behaviorGeneration / rankEpoch）。

> 物理 schema（D18 / [ADR 0030](../adr/0030-physical-schema-claims-serving-tiers.md)）= **两层 + tk 独有仲裁账本**：① raw 事实层 `fact_claims`（append-only，借 Kythe `Entry`/Wikibase Statement）；② 物化 serving 层 = C5/C6 `nodes`/`edges`（借 Kythe serving table + codegraph 热路径；edges = 已接受 ArbitrationDecision 带 decision_id + claim refs，ranking/behavior/projection **只读此层**）；③ 中间 tk 独有 `arbitration_decisions` + `decision_claims`（Kythe/Wikibase 都缺的独立 decision ledger）。另加 `identity_bindings`、`dependency_index`（claim→decision→edge 反向索引，增量失效用）、generations 计数。FTS5 列见 C7 + §9.1（加 identifier_tokens/literals）。无参考有 claim+arbitration（皆单层图），故此层为 tk 自研。

## 6. Producers and Authority Levels

Producers：**tree-sitter**（heuristic，Observed 语法事实）、**SCIP**（编译级 identity，Observed；index 在场 = Optional at runtime）、**framework profile**（route/event/job 注册语义）、**host-LLM**（Inferred，On-demand）。

**权威是逐谓词（predicate-specific）的，不是全局 SCIP>tree-sitter 序**：
- tree-sitter 权威于语法事实（source span / branch / assignment）。
- fresh 且 full-coverage 的 SCIP 权威于 definition / reference / call-target identity。
- framework profile 权威于 route/event/job registration 语义（SCIP 只负责其中 handler identity）。
- **host-LLM 永不参与 executable symbol / call-edge 的 canonical 仲裁。**

## 7. Identity and Arbitration

**Identity-merge 与 edge-arbitration 分离。** tree-sitter → SourceDefinition/SourceOccurrence/provisional symbol；SCIP → external semantic symbol key/defs/refs。内部 `CanonicalSymbol` 用稳定 opaque ID，**SCIP symbol 只作 external identity，不替换内部 ID**。仅在**同文件 + 同 revision + definition span 唯一匹配 + kind/name/descriptor 兼容**时自动绑定；**禁止**按同名/qualified-name 相似直接 merge；1:N / N:1 / overload 保留多个 SourceDefinition→同一 CanonicalSymbol；无法唯一确认记 `sameAsCandidate`，**不做破坏性合并**。

**Arbitration**：producer 提交不可变 FactClaim；独立仲裁层按 **predicate-specific policy** 生成**可重建的 canonical view**。每谓词声明 cardinality + merge policy（`definitionOf/contains = single`；`implements/references = set`；dynamic dispatch `resolvesTo = possible-set`）。分歧被**分类**：`contradiction / supplement / alternative / out-of-coverage / stale`——**不一律 conflictsWith**。canonical edge = 物化 ArbitrationDecision，引用 supportingClaims + conflictingClaims，**原始 claim 不融合、不覆盖**。

**Dual-resolution 规则**：SCIP current+exact 解析 callsite→A 而 tree-sitter heuristic→B：canonical `resolvesTo=A`，tree-sitter claim 作 conflicting evidence 保留、不进 executable canonical graph；SCIP 对该文件无 coverage/无 occurrence → **不算冲突**，tree-sitter edge 保留标 partial/possible；SCIP 多个合法 dynamic target → canonical = accepted possible-set，不强选其一。

## 8. Freshness and Incremental Computation

**无常驻 daemon，惰性 on-read。** "无 daemon ≠ 把 daemon 的全部工作塞进第一条查询。"

文件变化 → 重抽该文件 claims + 语义 diff（old/new claims、definition anchors、external identities、export surface）：
- **body-only** 变化 → 只重建该函数 claims + 局部 Behavior。
- **identity / signature / export surface** 变化 → 经 **referencer set-diff** 扩展到直接引用者。
- dirty scope 走**显式 dependency index** 传播，**无无条件全图 BFS**。

dirty closure 在 query refresh budget 内完成 → staging 重做 identity resolution / fact arbitration / 局部 Behavior rebuild → **原子发布新 canonical generation**。超预算 → **不发半更新**，保留上一致 snapshot + 为当前查询建 **repair overlay**：

> `effective graph = last complete snapshot − invalidated fact keys + freshly arbitrated overlay edges`

当前查询只修复 lexical seeds + 目标 symbol + 所需调用邻域；未完成 dirty keys 持久化（**dirty queue 跨查询续算**），overlay closure 完整后再提交为新 generation。

**PageRank 拆分**：**query-local bounded PPR = Required**（跑当前有效子图 ≤~2000 nodes / 10000 edges，PARTIAL 变化得 locally-fresh 排序，无需全局重算）；**global structural prior = Optional materialized cache**（带 canonicalGeneration，可轻度陈旧，可在 FULL 状态禁用）。PARTIAL → 同步完成局部仲裁 + local PPR；ARCHITECTURE/FULL → **不阻塞普通查询**做全仓 PageRank，普通 locate/understand 只修复查询 closure 并降权/禁用 global prior，仅 architecture/repo-map 查询或显式 `tk sync` 才尝试全局 catch-up。

每查询报 `canonicalGeneration / behaviorGeneration / rankEpoch / rankFreshness`；**仅当未修复区与答案相交、impact/architecture 可能缺边、或 refresh budget 被截断**才显眼 stale/partial banner。

## 9. Ranking and Projection

**Selection Graph 与 Projection Graph 分离。** 四层都参与候选检索 / Personalized PageRank / 消歧 / 质量降权（Selection），但**只有当前 projection profile 需要的事实才序列化进 Agent context**（Projection）。**无独立 intent classifier**——Agent 经显式工具/参数声明 profile，tk 不猜意图。

Profiles：`locate / understand / flow / impact / domain / verify`。
- **locate（默认最瘦）**：3–8 code anchors、path/span/signature、少量 arbitration-cleaned canonical relations + compact trust envelope（freshness/coverage/certainty/active-conflict-count）。Behavior/Domain 仅进 ranking 不展开。实际常 3k–6k 字符。
- **understand**：Code 主体 + 有界 Behavior slice（entrypoint→subject→effect，≤12 behavior nodes）+ 1–3 高价值 Domain labels/candidates。
- **flow / impact / domain / verify**：分别把 Behavior / Domain / Evidence 提升为主体。
- **Evidence = always-on metadata，非 always-expanded content**；仅当 active conflict 改变答案 / coverage partial / 低置信 / 高影响 / 显式 verify 才展开 claims + rationale。

**预算 = hard ceiling，非填充配额**（13000 / 18000 / 24000 char 分档，**低于宿主内联帽**）。每 profile 用 layer caps + cardinality caps，未用预算动态借给高价值层。优先序：answer-required facts → source anchors → canonical relations → task-required Behavior → disambiguating Domain → conflict/coverage warning → 补充描述（最后）。每个新增 fact 按 **marginal utility per serialized char** 竞争预算；到顶返回 omitted counts + expansion handles，**绝不静默截断**。

## 10. Agent Surface

**单后端、双前端。** 主 = **VS Code 扩展**（Language Model Tool API 注册工具 + 编程式 MCP，因企业 raw-MCP 常默认锁）；次 = **手写零依赖 newline-delimited JSON-RPC stdio MCP**（`tk mcp`，吃 Claude Code/Mac）。

工具按 §9 profiles 暴露：`find_code` / `understand_symbol` / `trace_flow` / `analyze_impact` / `domain_context` / `explain_evidence`。NO-INDEX → 空 tools/list + success-shaped NotIndexed 指引（非 isError）。≤9KB steering playbook。

> 工具集与 VS Code LM Tool API 贡献点的精确映射、`TK_MCP_TOOLS` 消融臂、small-repo 降工具 = 见 §17 Open Decisions。

## 11. codeguide

**codeguide = 统一 canonical backend 上的有界、只读理解面。** 它为 Code/Behavior/Domain/Evidence 提供适合人类的导航与 read models，但**不拥有独立事实、索引、仲裁、内容创作生命周期、任意图探索或协作工作流**。

与 Agent **共享**：canonical identity、FactClaims + ArbitrationDecisions、canonical graph、freshness/coverage/confidence/generation、四层 query 原语、ranking/trust/evidence 契约。但**不共享同一个最终 Context Packet**（Agent = 行动导向、稀疏；Human = 理解导向，允许持久导航、聚合概览、source preview、progressive disclosure、bounded diagrams、深度下钻）。

### 11.1 Delivery Shape (D28 / ADR 0038)

codeguide 是 **单一 Web App + 单一 Core + 两个数据适配器**（[ADR 0038](../adr/0038-codeguide-web-app-two-data-adapters.md)），不是第二套图系统，也不是 `src/report/html.ts` 上加一个 `wiki` report kind。

- **Core**：`RepositoryQueryService` 是唯一查询入口；ranking、graph traversal、freshness、coverage、confidence、arbitration 都在 Core 内完成。
- **Live adapter**：`tk codeguide serve` 启动前台 loopback server（仅 `127.0.0.1` / `::1`，无 LAN），薄 HTTP adapter 调同一 Core。进程关即停，**不是 daemon**。
- **Snapshot adapter**：`tk codeguide export` 把同一 Web App 的 JS/CSS 和有限 `CodeguideSnapshot` 内联成单文件 HTML。它复用同一组件，只把 `LiveDataSource` 换成 `SnapshotDataSource`，**不是第二个 formatter**。
- **Viewer host**：系统浏览器是 canonical host；VS Code 只提供启动/deep-link 命令，不承载第二套 Webview UI。

Live App 是日常主视图；Snapshot 是离线、审计、分享工件。Snapshot 必记录 commit、generation identity、生成时间、included scope、omitted count、completeness，并显式标出未捕获动态查询不支持。

### 11.2 Information Architecture

**封闭组成**：

| View | Purpose | Boundary |
|---|---|---|
| Repository Overview | 展示仓库模块、入口点、主要依赖、热点区域、当前 generation/freshness 状态。 | 只显示 bounded overview；不画全仓 hairball。 |
| Symbol Inspector | 展示一个 symbol/file/module 的定义、引用、调用者、被调、所属模块、source preview、测试关系。 | 所有事实必须有 `file:line` / evidence；不能生成无锚点解释。 |
| Flow Inspector | 展示 route/job/event/test 到 handler/effect 的 bounded DAG。 | 不是完整 CFG/PDG；coverage 可为 complete/partial/truncated/unsupported/unspecified。 |
| Domain Inspector | 展示 entities/resources/concepts/use-case skeleton/rule candidates。 | Observed / Derived / Inferred / Confirmed 分区展示；host-LLM 只产生 Inferred proposal。 |
| Evidence Drawer | 对当前选中 fact 展示 claims、policy、rationale、producer、freshness、coverage、decision。 | 仅按需展开当前 fact；不做全局 evidence 浏览器。 |

一句话：**四层都可见，但不是四套产品；可深度下钻，但能力边界封闭。**

### 11.3 Projection Contract

Core 向 codeguide 输出 `GraphProjection`，而不是让前端重新计算图语义：

- `nodes` / `edges` / `containers` / `aggregatedEdges`
- `sourceSpans` and source preview handles
- `freshness`, `coverage`, `confidence`, `authority`
- `omissions`, `completeness`, `expansionHandles`
- `generationIdentity`

Frontend 只能负责布局、选择、折叠、展开和展示。它不得维护第二个 authoritative graph model，不得在浏览器里重新做 ranking、arbitration、community detection、PageRank、freshness repair 或 coverage 推断。

### 11.4 UI and Interaction

codeguide 的默认交互是 **overview → bounded local graph → inspector → evidence drawer → source anchor**：

1. Overview 先给人可扫的结构地图，不要求先输入精确 symbol。
2. 点击模块、文件、symbol、flow 或 domain candidate 后，进入 bounded neighborhood。
3. Inspector 展示摘要、source preview、relations、coverage/freshness/trust 状态。
4. Evidence Drawer 只在用户需要解释时展开，不把 claim ledger 放在主视图里。
5. 每个事实都能回到 `file:line`；如果不能回到源码或证据，必须显示为 proposal / unsupported / unknown。

Graph view 只画有界局部邻域（典型 5-100 nodes），并通过 omissions/completeness/expansion handles 表达预算截断。被截断的图不能被展示成完整图。

### 11.5 Frontend Stack (D31 / ADR 0039)

codeguide Web App 使用 **React 19 + Vite + TypeScript + React Flow + ELK.js**（[ADR 0039](../adr/0039-codeguide-stack-react-flow-elk-no-graphology.md)）：

- React/Vite/TS：页面、Tree、Inspector、Evidence Drawer。
- React Flow：节点/边渲染、zoom、pan、select、click 交互。
- ELK.js：几何布局、层级、edge crossing 优化、orthogonal routing。
- tk Core：节点、边、分组、聚合、排序、confidence、completeness、expansion。

明确不使用：

- **graphology**：前端不运行图算法，也不维护第二份 graph model。
- **sigma / d3-force**：不做全仓 force-directed hairball。
- **mermaid**：不输出可被 LLM/模板臆造的结构图。

### 11.6 Launch, Lifecycle, and Security (D29 / D32)

- `tk codeguide serve` 使用随机端口 + session token，stdout 以 `--startup-format json` 返回完整 URL。
- VS Code extension 调 CLI 启动/复用 workspace server，然后用 `vscode.env.openExternal` 打开系统浏览器。
- server 绑定 loopback，禁止 `0.0.0.0` / LAN 模式。
- server 生命周期归 workspace/extension/foreground command 持有；不是 detached daemon，也不引入 cross-session repository daemon。
- codeguide 与 MCP 是独立薄适配器进程（[ADR 0040](../adr/0040-process-model-lease-coordinated-generation-publish.md)）；两者都把 Core 当进程内 TS 库，通过同一 out-of-tree SQLite WAL 共享持久态。
- 查询在短读事务内读单一 published generation；reconcile 由 DB-backed lease 协调 staging + atomic publish，不能跨请求长期持读事务。

### 11.7 Editing and Collaboration Boundary

codeguide 当前是 **read-only**。Web 编辑、Tiptap、inline confirmation、双向 editor sync、human-fence writeback、GitHub comment 写入、team 权限层都不属于当前 codeguide surface。

人类协作路径是：本地只读理解、Snapshot export、git 共享、人工复制到 PR/文档。`.tk/` 控制文件可以由人用自己的编辑器手写，但 codeguide 不提供编辑 UI，也不拥有内容生命周期。

重开 Webview / editing 的条件必须是：双向编辑器同步、内嵌确认、或高频并排工作流被证明是核心需求；否则保持系统浏览器 + read-only。

## 12. Runtime-Optional Capabilities

- **SCIP**：ingestion + identity integration = Required；**SCIP index 在场 = Optional at runtime**（无 indexer → 回退 tree-sitter heuristic，保住 Windows 零安装）。
- **Host-LLM**：attachment 支持；**model 在场 = Optional at runtime**；Domain Semantic Promotion = On-demand。
- **Global structural PageRank prior**：Optional materialized cache（§8）。
- **git hooks / native watcher**：opt-in，默认 OFF，WSL2 /mnt 硬禁。

## 13. Unsupported Capabilities

调用须诚实返回 unsupported / coverage。明确不支持：interprocedural dataflow、taint、alias analysis、post-dominator/CDG、symbolic execution、动态 trace、unknown-framework dispatch 自动推断、**embeddings（作为默认 intelligence source）**、whole-program sound 精确分析。

## 14. Outside Current Product Scope

**不属于当前产品定义，也不是承诺的待办债务**（未来纳入须重新做产品+架构决策）：Wiki authoring、narrative page lifecycle、comments / review / publishing / writeback、human confirmation workflow、guided tours、persona-adaptive UI、chat、团队协作与状态、人工保存的 graph layout、autonomous daemon operation、任意图查询语言 / 全仓 pan-zoom explorer。

## 15. Evaluation and Acceptance Gates

> **Q10 已拍（grilling 2026-06-21 D10–D12，收敛为 3 项）**：① **测量与声明边界**（[ADR 0022](../adr/0022-measurement-and-claim-boundaries.md)）——Claude Code=token proxy、Copilot=observational facts、human=portable metrics，一 host 数字绝不冒充另一 host；默认配置由 correctness 硬闸 + portable utility 决定，proxy token 仅成本约束/tie-breaker，配置在 Copilot 周期复核（无运行时自动反证/状态机）。② **Benchmark 架构**（[ADR 0023](../adr/0023-benchmark-architecture.md)）——GitNexus 式 SWE-bench 端到端 + Codebase-Memory 式 per-language 能力集，tk 自有 repo=regression only，Human Inspector 用自动回归 + 小规模盲测。③ **消融协议**（[ADR 0024](../adr/0024-ablation-protocol.md)）——K13 测技术、D7 graph 臂内测投影，不跑全矩阵，final config 对 baseline 确认一次。**✅ Q10 完成。** 以下为当前承诺的不变量。

- **PRIMARY 指标 = `uncached_input_tokens` 增量（input − cache_read）**，推翻含缓存 total。统一口径 = **whole-task uncached**（全任务轨迹，非单次响应；total-incl-cached 仅审计列，永不进 budget-earning 判定）。
- **离线 A/B 跑器 = Claude Code headless**（唯一干净 uncached runner，proxy host），MCP on/off，4 跑/臂取中位数 + min/max。target host（VS Code Copilot/Windows）token 不可测，只产 Track-2。
- **消融协议**（[ADR 0024](../adr/0024-ablation-protocol.md)）：K13 测检索技术（baseline/+compression/+smart-read/+graph/+symbol，全 cell 锁同一 projection control）；D7 在 graph 臂内测投影（Code-only vs 四层，per profile）。**不跑全矩阵**：K13/D7 winner 各自选出后对 baseline 做一次组合确认。**默认配置闸**（[ADR 0022](../adr/0022-measurement-and-claim-boundaries.md)）：correctness 非回归(硬闸) + portable utility(Copilot/人类可观测)决定默认；proxy whole-task uncached 仅成本约束/tie-breaker，绝不单独定默认；配置在 Copilot 周期复核，不足则维持保守静态。
- **安全** = fallback-replay → `omission_bug_rate`；**检索质量** = localization F1（与任务质量分开报）；**任务正确性** = FAIL_TO_PASS / PASS_TO_PASS。
- **Track-2（目标宿主 VS Code Copilot）= opportunity facts**（call_count / payload_bytes / avoided_raw_reads / dedup，`estimate_kind:"opportunity"`，**永不汇入 measured saved_tokens**）。
- **诚实不变量**：measured 与 opportunity 两类行永不相加；Arbitration 也被度量（producer agreement / arbitration precision / identity false-merge / conflict-disclosure 成本）。

## 16. Implementation Dependency Order

> **构建顺序，不是发布阶段。** 仅表示代码实现的依赖先后。

**Backend 建立方式 = source assimilation of codegraph（MIT）**：继承其成熟实现（tree-sitter/WASM extraction、语言/框架 resolution、SQLite、incremental sync、文件发现、Windows/WSL 处理、回归测试）；**不继承**其产品边界、canonical schema、MCP、daemon、installer、telemetry、Claude-向 ContextBuilder。源码进入即由 tk 完全拥有与重塑，**不维护可合并 downstream fork**；upstream 仅作 bug-fix/设计来源经 agent 辅助选择性移植。

依赖链：

```
Canonical schema
  → producers (tree-sitter / SCIP / framework profile / host-LLM)
  → identity + arbitration
  → canonical view (materialized)
  → ranking + projection (selection / projection, PPR)
  → Agent Surface
  → codeguide
（Evaluation harness 与 schema 同期立起，作为后续每条声明的度量针）
```

## 17. Open Decisions

仍待拍板（不含已由 D1–D9 闭合的项）：

1. **Evaluation acceptance-gate（Q10）✅ 完成（D10–D12 / [ADR 0022](../adr/0022-measurement-and-claim-boundaries.md)–[0024](../adr/0024-ablation-protocol.md)）**，收敛为 3 项：① **测量与声明边界**（ADR 0022）——host→可证之物 + 默认配置闸 + 两类结论边界；② **Benchmark 架构**（ADR 0023）——GitNexus 式 SWE-bench 端到端 + Codebase-Memory 式 per-language 能力集 + tk 自有 repo regression-only + Human Inspector 盲测；③ **消融协议**（ADR 0024）——K13 测技术/D7 graph 臂内测投影/不跑全矩阵/一次组合确认。其余（token 口径计算、run 预算、premiumRequests 丢弃、Job-A 评分方式、SWE-bench 语言披露）降为评估协议细节。本项不再 Open。
2. ~~**Agent Surface 工具映射**：6 profiles ↔ VS Code LM Tool API 贡献点的精确形态、small-repo 降工具策略、`TK_MCP_TOOLS` 消融臂。~~ ✅ **组织原则闭合（D17 / [ADR 0029](../adr/0029-agent-tool-surface-operation-contracts-queryplan.md)）**：表面 = 4 操作合同工具(tk_explore/search/node/callers，tiny-repo 降 3，TK_MCP_TOOLS 消融臂保留 = F.3/F.7)；6 profile 降内部 QueryPlan preset(selection/traversal/projection 三维)；Domain/Evidence 经工具 param 暴露、harness 证明才加新工具。（剩余实现细节：LM Tool API package.json 贡献点的逐字 JSON 形态 = 实现期照 F.6 真实 schema 落地，非 Open。）
3. ~~**物理 schema / 迁移**：claims + 物化 canonical + decisions + identity-bindings + dependency-index + generations 的具体表切分、FTS5 列、节点/边落表。~~ ✅ **闭合（D18 / [ADR 0030](../adr/0030-physical-schema-claims-serving-tiers.md)）**：两层 + tk 独有仲裁账本——`fact_claims`(Kythe/Wikibase)+物化 `nodes`/`edges`(Kythe serving+codegraph 热路径)+`arbitration_decisions`/`decision_claims`+`identity_bindings`+`dependency_index`+generations；FTS5 列 = C7 + §9.1。（剩余:逐字 DDL/迁移脚本 = 实现期照 C7-C9 + ADR 0030 落地，非 Open。）
4. ~~**SCIP 摄入依赖**：`index.scip` protobuf 消费（新依赖 vs 手写解析）。~~ ✅ **闭合（D16 / [ADR 0028](../adr/0028-scip-streaming-consumer-official-binding.md)）**：官方 TS binding `@scip-code/scip` + 薄 streaming importer，锁版构建依赖打成 lazy chunk（装后无 runtime dep），逐 Document 流式解码，否决 pbjs 平行 binding 与手写嵌套解码器。
5. **Distribution / Runtime** ✅ **闭合（D30 L + measurement-gated）**：declare-only Node gate `>=22.5.0 <25.0.0`（D30 确认 + pin 一个 24.x LTS、CVE 节奏、不发 Scoop）、FTS5 缺失 LIKE 兜底（实现期 C7）、npm provenance；**bundled-Node 分发粒度**（依赖用户 Node vs 总 vendored ~50MB）= measurement-gated（需 Windows 安装基 Node 版本实测）。无剩余设计 fork。

---

## Decision Log（grilling 2026-06-21 + 2026-06-22 round 4，D1–D32）

> 与上文契约一致；此处为可追溯的逐项摘要。每项均已**用 Terminology Law 重述**（无版本语言）。

| # | 决策 | 摘要 |
|---|---|---|
| **D1** | 两面皆 Required | Agent Surface 与 codeguide 同属一个完整有界产品；协作/wiki 等列 **Outside current product scope**（非"推迟"）。 |
| **D2** | Source-assimilate codegraph | 继承成熟实现、终止其架构约束，tk 完全拥有统一 backend；非从零重打、非 npm 依赖、非可合并 fork。 |
| **D3** | 四层皆 Required + bounded | Code/Behavior/Domain/Evidence 全 operational，每层真 producer+schema+query+projection+inspector+tests，禁空表；capability-bounded。 |
| **D4** | Behavior 封闭 IR | Structural Execution(全语言) + CFG/scalar def-use(5 语言族) + Dispatch/Effect(封闭 framework catalog) + coverage 枚举 + truncated 诚实。 |
| **D5** | Domain core + promotion | Deterministic Domain Core(无 LLM 即 operational) + On-demand host-LLM Semantic Promotion(Inferred，非承重)；分离存储。 |
| **D6** | Evidence = claim + arbitration | 不可变 FactClaim + 独立仲裁层 + 可重建 canonical view；predicate-specific 权威与 cardinality；identity-merge 与 edge-arbitration 分离。 |
| **D7** | Selection vs Projection | 四层都进 selection/ranking，只有 profile 需要的才进 projection；预算 hard ceiling + marginal-utility；4 路消融。 |
| **D8** | 物化读模型 + 增量 | 物化 canonical + dirty queue + repair overlay + query-local PPR(Required)/global prior(optional cache)；无 daemon 惰性。 |
| **D9** | codeguide 有界只读 | 共享 backend、不共享 Context Packet；封闭组成；on-demand 下钻；明确排除协作/编辑/任意图探索。 |
| **D10** | 测量与声明边界 | Q10。Claude Code=token proxy(whole-task uncached，footer 声明非 Copilot 数)、Copilot=observational facts、human=portable metrics，一 host 数字绝不冒充另一 host。默认配置 = correctness 硬闸 + portable utility(Copilot/人类可观测)决定，proxy token 仅成本约束/tie-breaker，配置在 Copilot 周期复核(无运行时自动反证/状态机)。对外只两类结论。[ADR 0022](../adr/0022-measurement-and-claim-boundaries.md)。 |
| **D11** | Benchmark 架构 | Q10（K 主体）。复用两参考 harness 各做一个可证伪声称:**GitNexus 式 SWE-bench 端到端**(3 臂 baseline/tk-native/tk-projection，官方 F2P/P2P + whole-task uncached/cost/calls；Python 偏向须披露、不得声明 TS/JS 端到端)；**Codebase-Memory 式 per-language 能力集**(TS/TSX/JS/Py/Go，PASS/PARTIAL/FAIL)。tk 自有 repo=regression only。Human Inspector=自动回归 + 小规模盲测(评审≠作者、不知分组，永报 N/repos/tasks，无 comprehension %)。[ADR 0023](../adr/0023-benchmark-architecture.md)。 |
| **D12** | 消融协议 | Q10。K13 与 D7 非笛卡尔——D7 活在 K13 `+graph` 臂内。K13 测检索技术(全 cell 锁同一 projection control，隔离技术 vs 投影)；D7 在 graph 臂内测投影(Code-only vs 四层，per profile)。不跑全矩阵：K13/D7 winner 各自选出，对 baseline 做一次组合确认。ablation 嵌入两 harness。[ADR 0024](../adr/0024-ablation-protocol.md)。 |
| **D13** | 排序 = 分级管线 | round 3。检索排序是**分级 cascade**非加权和/RRF：词法(FTS5 BM25+codegraph 启发式)产出**候选锚点** → AST 扩展出**结构邻域** → SCIP/类型检查器解析身份 → 词法+显式 symbols/paths+局部性+purpose 归一化成 **PPR 种子** → query-local PPR **主排序**。词法是 PPR 的上游(选锚点)+下游(tie-break)，**不在末端与 PPR 加权融合**(同一证据重复计数)；用户显式 symbol/path 确定性优先；RRF 仅留给真正独立通道(lexical+embedding，embeddings Unsupported 故休眠)。作废早稿加权和 `0.60/0.20/0.10/0.10`。[ADR 0025](../adr/0025-staged-ranking-pipeline.md)。 |
| **D14** | NL→代码召回 = Core 自有分层桥 | round 3。gap **单一方案补不了**：平铺静态同义表(覆盖不了 jargon、动词上下文相关) ✗，Agent identifiers 当主路(Human+不配合 Agent 失 NL 能力) ✗。**Core-owned 分层 Query Vocabulary Bridge**：L1 词法归一(stem+缩写+高精度归一化)；L2 ~十几个低权重 action family，action **须与对象词联合命中**、只进候选不发图边；L3 **带 provenance 的项目词汇**(docs/tests/API·schema/git-rename/Domain Model/人工确认，Evidence Graph 事实)。Agent `identifierHints[]`+`conceptHints[]` 高权重但**只附加**、非主路。本仓共现可加但只产 `RELATED_IN_REPOSITORY` 候选、**不发 SYNONYM_OF/可信边** → **A11 embeddings Unsupported 保持干净**。(codebase-memory 0.75 是多信号融合+预训练向量，**非**纯 RI 证据。)[ADR 0026](../adr/0026-recall-bridge-agent-identifiers-not-synonym-dict.md)。 |
| **D15** | 图增强:Community Optional / Process 出局 / Flows 证据化 | round 3。两能力信任风险不同、分开裁。**Community**=Optional-at-runtime/default-off 的 **derived architecture projection**(非 bounded context、不进 Domain truth)；Core 已有 module 层次+import SCC+连通分量+callers-count 故无 Leiden 也完整；gitnexus Leiden=vendored+PolyForm-NC 不可复制，从零/独立许可写，关时 cohesion 走 callers-count。**gitnexus 式 `HeuristicCallsBfsProcess`=Outside scope**(只证图可达，证不了运行序/guard/事件序/状态迁移，加徽章也违 A4.8 双流程真相)→ **C5 删 `process` kind、移除 STEP_IN_PROCESS 边**。但出局的是机制非能力:**`Flows:` 仍 Required，由 `EvidenceBackedFlowProjection` 提供**(entrypoint + resolved call-site + CFG/CDG + guards + state + events + writes + effects，按需投影，显式 complete/partial/unknown，不物化 Process 节点)。修文档矛盾(community 旧标 Outside-scope 作废)。[ADR 0027](../adr/0027-community-optional-flows-evidence-backed.md)。 |
| **D16** | SCIP 消费 = 官方 binding + streaming importer | round 3（§17 Open #4 闭合）。`index.scip` 用**官方 Apache-2.0 TS binding `@scip-code/scip`**(protoc-gen-es 生成，v0.8.1，依赖 `@bufbuild/protobuf`)消费，**否决** pbjs 平行 binding 与手写嵌套解码器。binding+protobuf 作**锁版构建依赖**，tsdown 打成**独立 lazy chunk**，装后**无 runtime dep/无 native addon**，仅探测到 `index.scip` 才加载。**不整文件 decode**(官方警告 Index 占内存大)：只手写顶层 Index framing(field tag+length-delimited)，逐 Document 用官方 `DocumentSchema` 等解码→写 SQLite staging→释放(等价 Go `ParseStreaming`，零手写嵌套 wire decoder)。range **typed-first**(packed 3/4-int 已 deprecated 作 fallback)+保 Document position encoding(UTF-8/16/32)；symbol_roles 按 bitmask。失败**整代 rollback**+透明回退 tree-sitter/TS checker。state:ScipIndexer=Optional-at-runtime，ScipConsumer+StreamingScipImporter=Required，WholeIndexDecode=仅 fixtures。[ADR 0028](../adr/0028-scip-streaming-consumer-official-binding.md)。 |
| **D17** | Agent 工具面 = 4 操作合同 + 内部 QueryPlan | round 3（§17 Open #2 闭合，修三方矛盾）。表面 = codegraph 实测的 **4 操作合同工具** `tk_explore/tk_search/tk_node/tk_callers`(4 职责，非 6 profile 非 1 万能工具；tiny-repo<500 降 3)。**六 profile 混维度**(locate/understand=任务目标、flow/impact=遍历模式、domain=知识层、verify=信任/投影模式)→ 降为**内部 QueryPlan preset**，**不当工具名、不塞单 purpose 枚举**。**CodeQuery 单体分解为 `QueryPlan{selection,traversal,projection}` 三正交维度**；每工具把窄参编译成 QueryPlan，不外暴露重参协议。Domain/Evidence 先经 `tk_explore.layers`+`tk_node.include`，**harness 证明独立工具显著改善选中率/调用数/质量才加一个新默认工具**(不预开 tk_domain/tk_verify)。守住 4-tool eval 证据(1-tool 门 −43%→+107%、impact 零 eval)。[ADR 0029](../adr/0029-agent-tool-surface-operation-contracts-queryplan.md)。 |
| **D18** | 物理 schema = 两层 + tk 独有仲裁账本 | round 3（§17 Open #3 闭合）。无参考有 claim+arbitration(CodeGraph/GitNexus/codebase-memory/RepoDoc 皆**单层图**:抽取器直写 nodes/edges+单 provenance tag=ADR 0019 拒的模式)。tk **组合三系统**:① raw 层 `fact_claims`(append-only，借 **Kythe** `Entry`/**Wikibase** Statement);② 物化 serving 层 = C5/C6 `nodes`/`edges`(借 Kythe serving table + codegraph 热路径，edges=已接受 decision 带 decision_id+claim refs，ranking/behavior/projection **只读此层**);③ 中间 tk 独有 `arbitration_decisions`+`decision_claims`(Kythe 默认接受 entries/Wikibase 选择存 rank 上，**两者都缺独立 decision ledger + dependency 失效**)。+`identity_bindings`+`dependency_index`(claim→decision→edge 反向索引)+generations。Wikibase truthy-dump vs full-dump = canonical projection vs 全 claims 物理化。[ADR 0030](../adr/0030-physical-schema-claims-serving-tiers.md)。 |
| **D19** | 交付 = 一 Core + 两不对等适配器，入口由 policy 决定 | round 3（global Open #7 闭合，**修 F.1 错误前提**）。F.1 旧称"enterprise MCP 默认锁、LM-Tool 是唯一触达 built-in 通道"**错**:`chat.mcp.access` 默认 **`all`** 非锁；扩展 LM Tool 有独立治理(`chat.extensionTools.enabled`+`extensions.allowed`)非绕过通道;VS Code 把 built-in/extension/MCP 列为**三种并列工具类型**，扩展不接管 built-in read/search。改为:**Repository Intelligence Core 唯一实现**(一套 QueryPlan+result contract)+ **`tk mcp`=host-neutral 参考适配器** + **VS Code 扩展=Copilot 专用 managed 适配器**(值=VS Code API+安装+编辑器集成)。**入口由组织 policy 决定**:扩展允→推荐扩展/仅MCP→tk mcp/MCP禁+扩展允→扩展唯一 Agent 通道/皆禁→只剩 CLI+codeguide;Claude Code·Codex→直接 MCP。非"扩展全局 PRIMARY"非"两面同等实现"。policy 键默认值入官方复核清单。[ADR 0031](../adr/0031-asymmetric-dual-adapter-delivery.md)。 |
| **D20** | 代码签名 = artifact-gated；AV 税是性能问题 | round 3（global Open #9 / §17 #5 闭合，**修 #9 错误前提**）。现在**无 tk 自有未签 PE 可签**(tk=npm JS 包 `tk→dist/cli.js` 跑用户 Node；bundle 内 node.exe 是**官方已签** Node 重打包)。Authenticode 现在签不到东西、也无证据消 CrowdStrike spawn 税。**artifact-gated**:现用 SHA256SUMS+npm provenance+release attestation **不买证书**；tk 首发**自有 Windows PE**(SEA/daemon-EXE/MSI/MSIX；install.ps1 是脚本不算)时 Authenticode **成硬发布门**，macOS notarize 同理(.app/.pkg/.dmg/native 才启)；现可**预留 CI signing stage+验证合同**不接真证书。**CrowdStrike 400-1100ms = 性能/架构问题非签名**(EDR 拦 process-creation+file-access，tk 多 spawn 一次 Node 多付一次扫描)→ 真解 = D21 的 CommandProxyResident。[ADR 0032](../adr/0032-artifact-gated-signing-av-tax-is-perf.md)。 |
| **D21** | daemon 三拆；codemap 不需跨-session daemon | round 3（global Open #4 闭合）。**重要修正**:codegraph **有** daemon(detached+proxy，跨调用复用内存图，#277/#411 生命周期 bug)，gitnexus 有持久 HTTP server——tk no-daemon 是刻意背离。旧 E11 把三事捆 "daemon"，拆为:① **CrossSessionRepositoryDaemon = Outside scope**(tk on-disk node:sqlite + per-session MCP 已是正式暖路径:每 session 开一次 DB 复用 connection/prepared-stmt/bounded-cache；codegraph daemon 解的是"多独立调用共享内存后端"另一形态，带 election/socket/orphan/idle/crash，对 tk 只省一次 open 不值；**重开闸=实测 hydration p95>250ms + 频繁重开 + 原型砍≥50% first-query**)；② **IndexWatcher = Optional-at-runtime 默认关**(原 E11 代码即此)；③ **CommandProxyResident = 独立 Required capability/Optional-at-runtime**(D20 的 AV spawn 税唯一真解=shim 不再 spawn Node 改连常驻 proxy；缓存 exec 路径/异步 I/O 消不掉 spawn；属命令代理子系统非 codemap)。E11 重写为仅 IndexWatcher。[ADR 0033](../adr/0033-daemon-decomposed-three-capabilities.md)。 |
| **D22** | B LLM 委派 = 宿主借用，零 key 零凭据 | round 4（需求 B Open Decisions 全闭合）。叙事/Domain 生成委派给 tk **不拥有、不付费**的模型：主路径宿主 slash-command；次目标 Claude Code/macOS 在宿主会话与 logged-in CLI **同时**可用时**默认复用 in-session 宿主模型**（省进程），caw 订阅子进程仅真 headless 兜底；**永不构造 api_key LLM 客户端**，**显式 BYO-key 逃生口严格拒绝**（即便 opt-in）——保 CI gate `openai/api_key/faiss/embedding` 命中=0（repodoc `llm.py:43` 反例 + M23 + A4.11 无凭据/无 egress）；无模型可借→ship static-only（B-D7）诚实降级。leaf 阈值沿用 codewiki `16_000`/`depth-2` 作初值，harness 后重标定。[ADR 0034](../adr/0034-llm-delegation-host-borrowed-no-byo-key.md)。 |
| **D23** | 语言集收紧 = tier-1 + 仅 Razor + 仅 C# wasm | round 4（需求 D 框架/wasm Open Decisions 闭合）。**框架/markup 提取器仅 Razor 破例**（抄 codegraph `razor-extractor.ts` 280 LOC，dotnet 家族 regex 抽 `@code{}/@{}` 内嵌 C#，class/type 级优雅降级；服务企业 .NET/Blazor）；**Vue/Svelte 不做**（web 只用 React）；**React=JSX/TSX 已是 tier-1 原生语法、零额外提取器**。**vendored-wasm 仅 C#**（~5.1MB，tier-1 必需）；lua/luau/pascal/scala/r 不 vendor→file-level。语言集 = tier-1 (TS/TSX/JS/JSX/Py/Go/Rust/Java/C/C++/C#) + Razor，舍长尾。**SCIP 仅 CONSUME 不 EMIT**（D16 读已有 index.scip；不导出 tk 索引——无参考 EMIT、个人项目无消费方=YAGNI）。**PHP/Ruby/Swift/Kotlin**（包内零体积）保留 best-effort/test-light 但**非目标覆盖**（不进 CI、无承诺）；**目标覆盖 = tier-1 + Razor**。无 ADR（可逆 scope 决策）。 |
| **D24** | 个人项目永不发布 → license 完全不相关 | round 4。用户重申：tk 个人自用、**永不发布**。M25 强化——任何源（gitnexus PolyForm-NC / codewiki / repodoc 无 license）代码**可逐字抄、无需重写/署名**；全文 `[非分发安全]` 标记**失效可忽略**（不清除以免 churn），可抄性表一律视 ✅。license 不再作任何决策否决理由；历史上因 license 被否的选项（如 D15 Leiden）license 顾虑消失，但**其它理由若仍成立则不翻**（逐项看 license 是否曾*决定性*）。无 ADR（约束放宽，非架构决策）。 |
| **D25** | 大跳变新鲜度 = RECONCILING + 延迟预算 + 分层 freshness | round 4（需求 E 首查大跳变 Open Decision；用户自拟第三方案，否决静默阻塞与 freeze-banner）。**E9 FULL_UPDATE 只决定重算哪些层、不决定是否阻塞查询**（解耦）。大跳变后首查先跑**廉价同步 reconciliation**（算 changed files + 反向 calls/imports 失效闭包，标受影响 canonical facts 为 pending/不可见，**不重解析**→无多秒冻结）；再按预计 p95 成本**延迟预算门控**：<1s inline、1–2s 且查询不依赖受影响区→立即服务未受影响结果、>2s 不阻塞由 per-session MCP 在 session 内续算；`tk sync` 留作显式预热/恢复但非唯一路径。**安全约束**：绝不像 banner 方案那样返回受影响的旧 canonical edges——未受影响事实完整返回、变更文件 live-read/file-local parse、依赖待重建边的 callers/flow/impact 标 PARTIAL/UNKNOWN 或返回 SYNC_REQUIRED。**新状态 RECONCILING**（≠ FROZEN，FROZEN 仅留给 sync 失败）；freshness 从 `stale:boolean` 升级为 **per-result/per-layer `resultFreshness` + `completeness`**。[ADR 0035](../adr/0035-reconciling-freshness-latency-budget-per-layer.md)。 |
| **D26** | 置信 = 软排序因子，绝非硬过滤；截断是展示层 | round 4（需求 J suppression Open Decision；用户精化第三规格）。**三阶段分离**：① 所有 raw heuristic claims 保留（ADR 0019）；② Arbitration 决定哪些 claim 物化为 canonical edge；③ 一旦成 publishable canonical edge，**必须**参与 retrieval/flow/impact/callers 计算——confidence 可降 rank、**不得**排除出**计算**。**预算只约束最终投影**：紧时少展示 heuristic 边，但必返 omitted-count + 按 kind/confidence 汇总 + 稳定展开句柄，并区分 **`presentationTruncated`**（全参与计算、只展示子集→仍 `COMPLETE`）与**遍历因预算中止**（→`PARTIAL`/`UNKNOWN`）。**confidence 是软排序因子，`confidence<threshold→remove` 禁止**（否则 callback/event/framework-lifecycle/dynamic-dispatch 系统性消失，agent 把"弱证据存在"误读成"关系不存在"）。**唯一允许硬过滤**：用户显式 evidence-policy（如 compiler-backed-only）——须披露被排除数 + 明确不保证动态运行时路径完整。精化 D25（completeness 加正交 `presentationTruncated` 标）+ 落实 D7/D6。[ADR 0036](../adr/0036-confidence-soft-factor-not-hard-filter.md)。 |
| **D27** | 协作 solo-first：本地 impact、无 GitHub 写、无 team 层 | round 4（需求 I human-human Open Decisions；结合 D24 个人项目）。需求 I 定位为 **solo-first Human Knowledge Workflow**（agent proposal + 人类编辑接受 + git 共享/review + 本地只读 impact），天然兼容未来多人 via git，但 tk **不建 team 产品层/权限层/GitHub 写入层**。① `tk wiki impact <ref>` 保留只读零-egress markdown（粘进 PR 描述）；② **`--comment` 永久 Unsupported**——远端写适配器带 gh-auth/PR-发现/权限/重复评论/更新语义/网络失败/GHE/凭据边界，为省一次复制粘贴不值得破零-egress 合同（要自动化用户自己 CI/脚本组合）；③ **删 `tier:team`**——无 team 身份/权限/语义、仅 honor-system 抬帽 30→60；统一 `CAP_PAGES=30`（技术安全限、与人数无关，不足按数据直接调帽不重引 tier）。[ADR 0037](../adr/0037-solo-first-collaboration-no-github-write-no-team-layer.md)。（人类面**交付机制**与**编辑范围** = 另案 D28，见下。） |
| **D28** | codeguide = 一 Web App + 一 Core + 两数据适配器（Live serve / Snapshot export） | round 4（用户重开 H/I 人类面交付）。人类面 = **单一 Web App**（Vite/React /ASTRO 7? 组件）+ **单一 Core `RepositoryQueryService`** + 两数据适配器，**非两套实现、非"自包含单文件 HTML 为唯一形态"**。① **`tk codeguide serve`（LiveDataSource）**=日常富模式：前台按需、**仅绑 loopback（127.0.0.1/::1，无 0.0.0.0/--lan）**、关即停（**非 daemon**）、薄 HTTP adapter 调同一 `RepositoryQueryService`（search/node 钻取/callers·impact·flow/局部图懒载），**不拥有第二套 ranking/graph 逻辑**。② **`tk codeguide export`（SnapshotDataSource）**=可携带快照：把**同一** Vite/React app 的 JS/CSS + 有限 `CodeguideSnapshot` 内联进单文件 HTML，**复用完全相同组件**只换 `LiveDataSource→SnapshotDataSource`（**非第二个 formatter**）；snapshot 必记 commit/generation/生成时间/included scope/omitted count/completeness，明确不支持未捕获动态查询。**替换**"wiki 塞 `src/report/html.ts`"方案（该 renderer 留给 gain/inspect，正式 Codeguide 独立 Web App）。**无 LAN**（human-human 走 snapshot + git）；**Web 编辑仍 defer**——**推翻 round-3「editor=file-only writeback Required」**，codeguide 暂只读，`.tk/` 文件人类自有编辑器手编。定位：**Live App=日常主视图、Snapshot=离线/审计/分享**。镜像 D19「一 Core + 适配器」于人类面，精化 D9 codeguide（单文件 HTML→Web App 双数据源）。[ADR 0038](../adr/0038-codeguide-web-app-two-data-adapters.md)。 |
| **D29** | codeguide viewer host = 系统浏览器；VS Code = 启动入口非第二 UI 宿主 | round 4（D28 涟漪）。**canonical viewer host = 系统浏览器**；VS Code 是主要**启动入口**非第二 UI 宿主。`tk codeguide serve` 起 loopback server + 浏览器开 Live App；Snapshot 也浏览器开。VS Code 扩展只给**薄命令**（`TK: Open Codeguide`/`Open Current File in Codeguide`/`Show Impact`）经 **URL deep-link** 进同一 Web App。**启动安全+生命周期**：扩展用**随机端口 + session token** 起 server，从 `--startup-format json` stdout envelope 读完整 URL 再 `vscode.env.openExternal`；进程由 **workspace/extension 生命周期持有**（非 detached、非 daemon），重复打开复用同一 workspace server。**不做 Webview**（需全 HTML+CSP+resource URI+消息桥+面板恢复+remote port mapping，只读 codeguide 无 webview 独占需求=无收益）→ **VS Code Webview Host = Outside current product scope**（仅当双向编辑器同步/内嵌确认/高频并排被证核心才重开）。[ADR 0038](../adr/0038-codeguide-web-app-two-data-adapters.md#viewer-host-and-launch-d29)。 |
| **D30** | 次要 leans 批量锁定（用户接受推荐） | round 4。用户接受未细抠的次要项按推荐锁定：① **控制文件 = JSONC**（非 YAML；tk 已解析、可注释、VS Code schema-complete）；② **J(a) 人类 HTML = high/med/low 徽章**（raw 0-1 留 Evidence Drawer）；③ **G kill-switch = 文档化用户配置**（非仅 harness env flag）；④ **L：vendored Node pin 具体 24.x LTS + CVE 刷新节奏；不发 Scoop**（个人项目无分发）；⑤ **C content_hash = sha256**（E4 已定、零依赖 node:crypto）；⑥ round-3 ratified 再确认：**Node gate `>=22.5.0 <25.0.0`** + vendored 24.x、**char 档 13000/18000/24000 现用**（token 重表达 = measurement-gated）、**embeddings=Unsupported / SCIP+PageRank=Required**；⑦ **M18 daemon op-count 阈值 = measurement-gated**（按 D21 reopen 闸）。无 ADR（均确认既有 leans）。 |
| **D31** | codeguide Web App 技术栈锁定（React Flow + ELK，无 graphology/sigma/mermaid） | round 4（D28 stack，用户调研后锁定）。**React 19 + Vite + TS**（pages/Tree/Inspector/Evidence Drawer）；**React Flow**（node/edge 渲染 + zoom/pan/select/click）；**ELK.js**（几何布局：分层/交叉优化/正交边路由）；**图语义全在 tk Core**（节点/边/分组/聚合/排序/置信/完整性）。**显式 NO**：**无 graphology**（后端是图唯一权威、社区在后端 D15 算，客户端无图算法；graphology 只为 sigma/客户端算法存在；UA 仅用它跑 Louvain，渲染仍是 React Flow+ELK）；**无 sigma/d3-force**（不做全仓 hairball——~25K 力导悬崖 + M21 观感风险，React Flow 只画 5–100 节点有界邻域、守 H1）；**无 mermaid**（M21 禁臆造图）。数据流 **Core → `GraphProjection`{nodes,edges,containers,aggregated-edges,**omissions,completeness,expansion-handles**} → ELK(仅几何) → React Flow(仅渲染+交互)**；GraphProjection 的 omissions/completeness/expansion-handles 实例化 D26（presentationTruncated/completeness）于图视图。[ADR 0039](../adr/0039-codeguide-stack-react-flow-elk-no-graphology.md)。 |
| **D32** | 进程模型 = 独立适配器 + lease 协调 reconcile + generation publish | round 4（D28/D21/D19 进程模型；用户精化）。**MCP 与 Codeguide = 独立薄适配器进程**，各把 Core 当**进程内 TS 库**加载；经同一 on-disk **SQLite WAL** 共享持久态，**不共享 Core 进程/socket/内存图**。**WAL 非 reconcile 协调者**——reconcile 由查询触发、经 **DB-backed lease** 协调：仅 **lease owner** 做分析 + staging 写，余者服务安全结果 / 在延迟预算内等 / 返回 `RECONCILING`（partial/unknown，接 D25）。**generation 原子发布**：每查询在**短读事务**内读**单一 published generation**；新 generation 作**未发布 staging** 建、仅经**原子 publish 事务**可见。**generation identity = (repo revision + worktree digest + schema version + analysis policy version) 元组、非整数**（精化 E2：整数降为 published-generation 指针，identity 是元组）。Codeguide 可进程内长开**连接**但**不得跨请求持读事务**。CommandProxyResident 仍独立子系统、不挂 Core；cross-session daemon 仍 Outside scope（D21 闸）。[ADR 0040](../adr/0040-process-model-lease-coordinated-generation-publish.md)。 |
| **D33** | 交付 = 单产品 / 单 repo / CLI 中枢 + 能力闸（codemap 在 22.5、tk-core 留 20） | round 5（用户裁定，修订 D10 硬闸、澄清 D19）。**不拆新 repo、不拆分发 package**：所有触点（shim/compress + codemap 索引 + MCP server + codeguide + VS Code extension）同住现有 `token-killer` repo、构成**一个产品、装一次**。**入口 = `tk` CLI 中枢**：`tk`(压缩/shim)、`tk mcp`(MCP server)、`tk codeguide serve|export`(web app)、`tk extension install`(把同仓 build 的 vsix 装进 VS Code)。**hub 必须是 CLI 不是 extension**——extension 仅活在 VS Code，Claude Code/Codex 走 MCP，CLI 是唯一普适入口、extension 是它带进来的一等消费者。**`engines.node` 留 `>=20`**（真实存在只能跑 Node 20 的机器，不得 assume 可升级）：tk-core 压缩/shim 在 20 上完整可用；**codemap 子系统 = 运行时能力闸在 `Node >=22.5 <25`**。**承重约束**：`node:sqlite` + web-tree-sitter 等 codemap 模块**只在版本守卫通过后 `await import()` 动态加载、绝不顶层 import**——否则 Node 20 启动即崩；`tk` 热路径对 codemap **import-clean**（冷启动不退化）。Node 20 上 `tk mcp`/`tk codeguide` 优雅降级（打印"codemap 需 Node ≥22.5；tk 压缩在此机可用"、干净 exit 非 crash）。**vsix / codeguide Vite app = 同仓 build target**（各自 package.json 仅因 VS Code/Vite 工具链要求，非用户 juggle 的分发 package）。统一产品 + 惰性子系统 = 既满足"触点放一起"又不付拆包税、不污染 shim 热路径。修订 D10（统一硬闸 → 能力软闸 + engines 留 20）、澄清 D19（非"拆出 tk"、是"CLI 把所有触点带进来"）。无新 ADR（待落地时补 ADR 0041 记此交付形态）。 |
