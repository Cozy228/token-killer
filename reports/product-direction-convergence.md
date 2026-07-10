---
status: supporting-analysis
authority: ../PRODUCT-DESIGN.md
open_authority_conflicts: 0 (both ruled into LAW 2026-07-10 — stage-1 kill = whole compiled-artifact shape / stage-2 kill = P2 demotion only; Run D relabeled context-loaded non-independent; dead CTX-* paths fixed to CONTEXA-*)
date: 2026-07-10
review_after: 2026-07-31
purpose: summary and convergence of the direction research and independent derivations; not independent product authority
---

# 产品方向阅读总结与现行收敛

## 结论

现行产品方向已经由 maintainer 在 [Product Design Contract](../PRODUCT-DESIGN.md) 中 ratify；本报告只解释证据如何收敛，不另立产品合同。发生冲突时，`PRODUCT-DESIGN.md` 优先。

最终方向是：

> **一个 decision-moment evidence compiler，一套 claim contract，两个 evidence facets。** `ctx` 负责本地 execution/workspace reality，Atlas 负责组织、runtime、policy 与 delivery reality；两者把带来源、时间、新鲜度、权限、推导类别和缺口的 claims 编译到 agent session、PR、incident 或 change record 等现有决策表面。人和既有权威系统继续判断、审批与执行。

这不是 portal、catalog、global truth graph、chatbot 或 autonomy layer。图和索引只是有 TTL、可回到 source receipt 的内部加速器；模型只能解释已有 claims，不能创造事实、抹平冲突、满足控制或把 `unknown` 变成事实。[现行 thesis](../PRODUCT-DESIGN.md#1-thesis) [八条 constitution](../PRODUCT-DESIGN.md#2-constitution--eight-articles-settled-33-sealed-convergence)

现行 comparison 将 Fable、Opus、Codex 记录为三次 sealed、zero-repo-context 推导，跨 Claude 与 GPT 两个模型家族；Fable 与 Opus 同属一个家族，因此它们不是统计意义上的三个独立样本。三次推导从同一报告出发，高度收敛于 evidence compiler，强力支持这种**设计形态**；但它们共享 prompt 和五题全覆盖约束，因此模型共识本身不增加用户、留存、预算或 PMF 证据。设计之所以成为现行权威，是 maintainer 的明确 ratification；是否值得继续建设，仍由预注册 validation ladder 决定。[比较报告的独立性边界](./derivation-comparison-r1.md#independence-caveats) [现行 evidence base](../PRODUCT-DESIGN.md#0-evidence-base)

现行 LAW 内仍有两处自相矛盾的 authority text（Stage 1 kill scope、Run D independence），本报告在下文登记并提出忠实修正，但不替 maintainer 修改或裁决。在 Stage 1 kill scope 被裁决前，不应冻结或执行该实验协议。

## 文档权威与用途

| 文档 | 当前地位 | 本轮应如何使用 |
|---|---|---|
| [`PRODUCT-DESIGN.md`](../PRODUCT-DESIGN.md) | `LAW`，active，最终产品设计权威 | 决定系统边界、claim contract、两个 facets、artifact family、architecture rulings 和 validation ladder |
| [`product-future-direction.md`](./product-future-direction.md) | superseded、frozen | 不再决定“一产品还是两产品”；其中 CTX/Atlas 的实验协议、stop gates、不同 trust boundaries 已被现行合同吸收 |
| [`product-future-direction-research.md`](./product-future-direction-research.md) | primary-source evidence audit | 约束事实强度、竞争边界、需求/买方未知和实验纪律 |
| Fable / Opus / Codex derivations | frozen design evidence | 支持 3/3 constitution、2:1 architecture rulings和独特机制，不作为市场证据 |
| [`derivation-comparison-r1.md`](./derivation-comparison-r1.md) | active arbitration record | 记录三份 sealed designs 的共同项、分歧、2:1 裁决与测试升级链 |

`product-future-direction.md` 原先把 CTX continuity 与 Atlas fact resolution 当作两个独立产品假设；现行合同已明确推翻这个产品拆分，把它解释为资源与验证顺序，而不是最终设计结论。被保留的是两个 facets 的独立价值、不同数据边界，以及“无 field result 不授权 broad construction”的纪律。[现行 R1](../PRODUCT-DESIGN.md#6-architecture-rulings-adopted-with-the-arbitration-record) [prior documents 的处理](../PRODUCT-DESIGN.md#10-relationship-to-prior-documents)

## 输入文档分别说了什么

### 方向研究与旧方向

方向研究确认了持久问题，却没有验证产品类别：程序理解、信息寻找和 AI 后置验证负担值得测试；这些事实不能直接选出 Developer Context Infrastructure、Review Brief、portal、buyer 或统一平台。[报告证据审计](./product-future-direction-research.md#1-what-the-source-report-gets-right-and-where-it-overreaches)

它同时修正了证据强度：原理解研究是 78 名受试者且有公司/语言外推限制；DORA 系数是随报告版本变化的关联，不是永恒常数；五题机会分数是编辑性综合，不是测量。`enterprise-dev.md` 的 `cite...` 标记无法在仓库外解析，因此事实追溯以这份带原始链接的 primary-source audit 为准；三个模型重复同一数字不会形成三份独立证据。

它也排除了三条宽泛 thesis：compression ratio 已有直接竞争和 host absorption；generic task-context retrieval 已由 agent rules、search、Sourcegraph 与 MCP 覆盖；information-centric portal/context lake 是成熟类别。剩余差异化候选是 exact local execution continuity，以及在一个高代价 workflow 中做 typed authority/conflict/freshness/permission resolution。[竞争边界](./product-future-direction-research.md#2-the-current-alternative-set-changes-the-product-boundary)

旧方向据此为 CTX 与 Atlas 写出了可证伪实验。CTX 当前只证明 deterministic filtering 能机械减少部分输出，没有证明任务结果、continuity、外部留存或支付；Atlas 0.2 证明 live resolution、citations、warnings 与 projections 可以实现，没有证明采用或决策改善。[CTX evidence limits](./product-future-direction-research.md#3-current-ctx-evidence-separated-from-product-claims) [旧方向的 current product evidence](./product-future-direction.md#what-the-current-products-establish)

### Fable：Cairn

Fable 将五题归纳为决策时刻的 reconstruction tax，在 Oracle、Brief Compiler 和 Agent Fabric 中选择 Brief Compiler：证据进入现有 workflow，agent 是同一 claim substrate 的一等消费者，中心图退到内部 substrate。[问题重读](./derivation-claude-fable.md#0-reading-the-problem-before-designing) [发散与收敛](./derivation-claude-fable.md#1-divergence-three-product-shapes)

它的独特贡献是具体 Claim schema、visible decay、Dark Map、counter-claim/correction loop、公开准确率，以及 Change Brief、Blast Radius、Routing Card、Verification Ledger、Delivery Passport 的产品触感。[Claim contract](./derivation-claude-fable.md#21-the-core-object-the-claim) [信任机制](./derivation-claude-fable.md#26-how-it-earns-and-keeps-trust)

### Opus：Keystone

Opus 同样选择 decision-moment compiler，但强调 live fan-out、bitemporal as-of Brief 和 observation-only Ledger；它拒绝把 standing graph 当真相，图只是一次查询或有时效的加速器。[形态选择](./derivation-claude-opus-max.md#12-converge--the-choice-and-why-the-losers-lost) [具体设计](./derivation-claude-opus-max.md#13-what-keystone-is--the-chosen-shape-concretely)

它的独特贡献是 as-of recomputation、Terraform-plan resource semantics、conflict display、post-merge falsification 和 confidence calibration。[数据流](./derivation-claude-opus-max.md#14-data-in-and-the-flow-through--an-end-to-end-pr-walkthrough) [信任机制](./derivation-claude-opus-max.md#18-how-it-earns-and-keeps-trust)

### Codex：Change Case Compiler

Codex 选择 case-scoped hybrid：在具体 change/decision 发生时收集 evidence，持久保存 case versions、receipts 和 outcomes，索引只能加速、不能成为 truth。它最明确地区分 `OBSERVED`、`DECLARED`、`INFERRED`、`CONFLICT` 与 `UNKNOWN`，并列出 authority、identity/entitlement、join keys、runtime coverage、write actions 和 retention/scale 等真实未知。[选择的形态](./derivation-codex.md#shape-b-change-bound-evidence-contract) [Change Case object](./derivation-codex.md#the-change-case-object) [UNKNOWN register](./derivation-codex.md#how-it-earns-and-keeps-trust)

它的独特贡献是最便宜的 connector-only Wizard-of-Oz kill test、durable correction 回 owning source、authority-by-claim-type，以及拒绝概率式 AI-authorship detection。[最便宜测试](./derivation-codex.md#cheapest-honest-test)

## 收敛后的系统合同

### 一套 claim contract

现行 canonical semantic unit 是 `claim`，而不是本报告另造的 `DecisionCase` schema。每个 claim 至少包含：subject/predicate/value、scope、source anchors、`observed_at`、derivation class、status、confidence tier、freshness/decay trigger 和 disclosure policy。Cases/artifacts 绑定 immutable state，但其持久化模型仍是实现选择。[统一 claim schema](../PRODUCT-DESIGN.md#3-the-claim-contract-unified-schema)

硬规则：

1. No citation, no factual statement；absence 不是 negative fact，`no known impact` 不等于 `no impact`。
2. `OBSERVED/DECLARED/INFERRED` 与 `resolved/conflicting/stale/unavailable/restricted/unknown` 分开；corroboration confidence 不能把非权威来源变成审批事实。
3. 多源派生结果必须保留 source disclosure constraints，不能通过摘要或关系侧信道泄露受限信息。
4. corrections 可以成为 claims，但 durable correction 必须修复或链接 owning source；local override 过期。
5. LLM 仅可 narrate/rank/explain cited claims；deterministic evidence path 不依赖模型。

### 一个系统，两个 facets

| 维度 | `ctx` local facet | Atlas organization facet |
|---|---|---|
| Reality | command/check、workspace binding、result、raw recovery、valid/stale | policy、availability、approved module、ownership/authority、runtime 与 delivery facts |
| Observation | local command/tool boundary | governed read-only connectors |
| Data boundary | user-owned、local by default、no egress by default | caller identity + source permissions survive aggregation |
| Current assets | contexa filtering/recovery、savings ledger、inspect/optimize | Atlas 0.2 live resolution、citations、warnings、Portal-as-admin |
| Independent value | continuity card / exact execution evidence | decision-time organization facts and evidence artifacts |

两个 facets 使用同一 claim schema 与 compiler semantics，但仍各自有用；local claims 只有在显式 disclosure 下跨边界，organization claims 进入本地 session 时受 caller entitlements 限制。共享 storage、brand、packaging 可以选，也可以不选，不是产品合同。[two facets, one contract](../PRODUCT-DESIGN.md#4-two-evidence-facets-one-contract)

### 五类 decision artifacts

五题收敛为一个 artifact family 的五种输出：Context Brief、Impact Set/Blast Radius、Routing Card、Verification Ledger、Delivery Route/Evidence Bundle。它们不是五个产品，也不意味着同日建设；每一类都受 validation ladder 和 source coverage 约束。[decision artifacts](../PRODUCT-DESIGN.md#5-decision-artifacts--the-five-outputs-and-their-honest-ceilings)

其中 ownership 是 capacity-scoped query：authority questions 只能用 governance owner 指定的 authoritative `OBSERVED/DECLARED` claims；reviewer/expert suggestions 才能使用带 age/reason 的 behavioral `INFERRED` evidence；无合格 claim 就 abstain，并显示冲突。[P3 ruling](../PRODUCT-DESIGN.md#71-p3--ownership-mechanism-layered-authority-via-claim-classification)

统一 failure semantics 应读成两层：系统 outage 时旧流程继续，不能制造新的单点阻塞；但 missing/stale/conflicting/restricted evidence 绝不能产生 confirmed/safe/complete claim、满足控制或打开 fast path。后者来自 constitution 的 citation/unknown/verification/delivery rules，不能被 availability fail-open 覆盖。

## 什么已定，什么仍须实验

| 已由现行合同决定 | 必须由 field evidence 决定 |
|---|---|
| 一个系统、两个 evidence facets、统一 claim contract | 真实 sources 是否有足够 precision/coverage |
| decision-moment compilation，不建 destination | P2 impact substrate 是否可行 |
| graph/index 只是 TTL accelerator | 每种 deployment 可访问哪些 claim types |
| citation-or-silence、conflict/unknown/DARK first-class | 可接受的 precision/recall 数字阈值 |
| capacity-scoped ownership、human judgment retained | CTX continuity 是否改变行为 |
| verification ledger 不是 correctness verdict | Atlas concierge 是否改变正确决策 |
| delivery 只做 evidence layer，不做 bypass | source access、adoption、buyer commitment |
| read-only shadow、reversible、pre-registered kills | shared storage/packaging 的具体实现选择 |

“模型共识不是需求证据”与“产品合同已经 ratify”并不矛盾：前者限制可宣称的用户价值，后者是 maintainer 的设计裁决。合同决定**若建设，必须是什么**；validation ladder 决定**是否以及建到哪里**。

## 现行 LAW 内待 maintainer 裁决

### 1. Stage 1 到底杀整个 compiler，还是只降级 P2

[`PRODUCT-DESIGN.md` §8.1](../PRODUCT-DESIGN.md#81-p2-substrate-viability-the-systems-make-or-break) 规定 Wizard-of-Oz Stage 1 少于 9/12 达标或出现一次 material false reassurance，就 **kill the compiled-artifact shape**。但 [§9](../PRODUCT-DESIGN.md#9-fallback-and-void-conditions-pre-written) 又把 “stage 1 or 2” 都写成只杀 impact substrate、降级 Artifact 2，其他 artifacts 继续。这两个 stop decisions 不能同时成立。

最忠实于输入的建议裁决是：

- **Stage 1** 来自 Codex 的通用 connector-readable decision coverage test，失败杀整个 compiled-artifact shape；
- **Stage 2** 来自 Fable/Opus 的 impact-specific backtest，失败只降级 P2 / Artifact 2。

这只是建议，必须由 maintainer 写回 LAW 后才能成为执行规则。

### 2. Run D 是否 independent

LAW 的 [Evidence base](../PRODUCT-DESIGN.md#0-evidence-base) 写 “four independent derivation rounds”，但 [arbitration record](./derivation-comparison-r1.md#independence-caveats) 明确 Run D 读取 repo、当前产品和历史方向，**not independent**。建议把 LAW 改为 “four rounds: three sealed zero-base derivations plus one context-loaded direction audit”。这不改变设计裁决，只修复证据权重表述。

另有一个文档完整性问题：LAW [§10](../PRODUCT-DESIGN.md#10-relationship-to-prior-documents) 把 `CTX-DESIGN.md` / `CTX-IMPL.md` 称为现行 implementation registers，但当前 workspace 找不到这两个路径。使用该权威链前应恢复正确文件、改为实际路径，或删除这项引用。

## Validation ladder

现行合同把三份 derivation 的 kill tests 和旧方向的 facet experiments 合并为一个由便宜到昂贵的链：[gated empirical questions](../PRODUCT-DESIGN.md#8-gated-empirical-questions--the-validation-ladder)

1. **Wizard-of-Oz shadow，约 12 个真实 PR。** 研究者只使用 first-review cutoff 时 connector-readable 的数据；独立 truth panel 裁定 material questions。LAW §8 当前写少于 9/12 达标或出现任一 material false reassurance即杀 compiled-artifact shape；其与 §9 的冲突须先按上节裁决。
2. **Retrospective backtest，约 100–150 个历史 PR。** 以 PR-open 时点重建 impact/routing artifacts，对 realized breakages/follow-up changes 评分并审计 truth-at-time；这一步校准 precision/recall thresholds。
3. **四周 live shadow。** 只读、non-blocking；不得恶化 review latency，不得出现 stream-fidelity、secret 或 stale-as-valid incident。
4. **Facet pilots。** CTX continuity experiment 验证 local facet；Atlas concierge test 验证 organization facet。旧方向中的预注册 gates 和 stop conditions 被吸收，但不再代表两个独立产品。[test escalation chain](./derivation-comparison-r1.md#test-escalation-chain) [旧 CTX experiment](./product-future-direction.md#days-36-63-test-continuity-not-architecture) [旧 Atlas concierge](./product-future-direction.md#days-22-42-concierge-the-resolution-contract)

Stage 1 kill scope 裁决后，仍需把协议机械化：预注册 question taxonomy、materiality、cutoff、source-backed evidence rule、denominator、truth-panel composition、tie-break、missing/censored cases 和 workflow-specific adjudication window。对 change/impact，至少观察到 deploy 后的预注册窗口；有限窗口只能发现 observed false reassurance，不能证明不存在隐藏遗漏。开跑前应把这些规则发布为单独、冻结版本的 experiment protocol；本 supporting analysis 不是执行记录。

CTX pilot 应继续使用旧方向已吸收的最小样本与 gate：至少 8 名非维护者、30 个 eligible moments、捕获相同而只随机 continuity card delivery、零高严重度 fidelity/evidence/secret incident、不降低 task acceptance、avoidable exact reruns 至少减少 25%、至少 5/8 选择保留。Atlas pilot 则保留真实决策观察、concierge outputs、正确 next action、active time、permission/wrong-fact guardrails、reuse 和 accountable design-partner commitment。[CTX gate](./product-future-direction.md#days-64-90-decide-then-integrate-only-the-winning-path) [Atlas gate](./product-future-direction.md#days-43-90-ship-one-narrow-resolver-only-if-the-gate-passes)

## 诚实上限与 void conditions

- Tacit knowledge 从未记录时无法编译。
- 没有 static/runtime/infra edge 的 semantic coupling 只能是 `POSSIBLE` 或 DARK，不能声称 complete blast radius。
- Verification Ledger 只能压缩 reconstruction tax，不能证明 general correctness 或替代 accountable human。
- Routing Card 不能授予 authority，也不能消除 reorg churn。
- Delivery bundle 不能取消法定审批、组织等待或环境稀缺。
- On-prem 不自动等于安全；entitlement propagation、derived-data leakage、retention 与审计仍须验证。

Stage 2 的 impact-specific backtest 失败时，Artifact 2 降级为 declared edges + DARK；是否能把 Stage 1 失败也如此降级，正是上文未决冲突。local continuity 或 Atlas concierge 失败时，各自 facet 停止扩张或降为 utility；两者都失败，现行合同按其 own death path 被 successor 明确取代，而不是靠继续补 architecture 自救。[fallback and void conditions](../PRODUCT-DESIGN.md#9-fallback-and-void-conditions-pre-written)

## 明确不做

- 新的日常 portal/homepage、generic search、AI chat 或 ask-anything destination；
- standing global truth graph、CMDB replacement、universal CodeGraph/CodeWiki；
- uncited RAG、AI source-authority/correctness verdict、概率式 AI-authorship guessing；
- 新审批数据库、CI/CD engine、workflow engine 或 policy bypass；
- 把 Brief、MCP、REST、Markdown、Portal 或图本身当产品 thesis；
- 因已有代码、branch 完整度、旧 ADR 或模型投票跳过 validation ladder；
- 把五个 artifacts 的设计完整性当成同时建设五条 roadmap 的授权。

## 最终收敛句

**一套系统，以 claim 为事实语义；`ctx` 与 Atlas 是本地和组织两个 evidence facets；五类 artifacts 把同一合同投影到决策时刻；设计已定，建设权逐级由真实 source coverage、准确率、行为改变和 owner commitment 授予。**
