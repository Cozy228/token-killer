# Fable 的设计主张:tk = Context Port(投影 · 找回 · 供给)

> **WITHDRAWN 2026-07-03.** 本设计建立在对产品重心的误读上(把 context engineering 读成
> token 效率工程;真实定义见 pack §9-P15:给人和 agent 提供本地、有效、正确的项目上下文,
> 广度与正确性为重心)。§3 对 Domain/Evidence 层的削减被 P15 明确反转——非代码上下文
> (决策、历史、记忆)恰恰是产品中心。保留本文件仅作存档;勿据此设计或实施。

> 2026-07-02。这是 Fable 的自主设计提案——挑战现有契约与产品方向,给出替代设计。
> 固定约束仍然遵守:P1(一个产品,不变量=context engineering)、P3(endgame = hook +
> extension/MCP)、P9–P11/P13/P14。Terminology Law 全文遵守——本设计的缩界走的是
> "Outside current product scope + 记录复活触发条件"的合法通道,不是"以后再补"。
> 事实标注:【事实】= pack/契约可查;【判断】= 我的立场。

---

## 0. 我对现状的四个挑战

### 挑战一:codemap 契约是为赢下 grilling 而建的大教堂,不是为交付价值而建的产品【判断】

契约的承重价值假设只有一句话:**"agent 用图检索 + 预算投影,以更少 token 找到并理解代码。"**
验证这句话需要:tree-sitter 抽取、代码图、FTS5 + 分级排序、预算投影、4 工具、新鲜度。
**不需要**:CFG/def-use、dispatch/effect catalog、Deterministic Domain Core、Semantic
Promotion、FactClaim/ArbitrationDecision 双层账本、SCIP 消费。

契约自己留下了证词【事实】:
- D17:Domain/Evidence 不给独立工具,"harness 证明才加"——**工具面已经按证据门控,
  底层生产机器却全部 Required**,这是不对称的;
- D15:Process 因"证不了运行序"出局——同样的怀疑精神没有施加给 Behavior 层其余部分;
- 仲裁层的真实存在理由是**多 producer 身份冲突**(SCIP × tree-sitter,契约 §7),而
  SCIP index 在场本身只是 Optional at runtime——为一个运行时可能不在场的依赖,预先
  Required 了一整个仲裁子系统。

四轮 grilling 正确地禁止了假增量(Terminology Law),但反应过度:**不是选择一个更小的
完整产品,而是承诺了一个巨大的完整产品**。对单人维护者,这是把交付概率押给了设计纯度。

### 挑战二:压缩器与 codemap 机制同构,实现却分裂【判断,事实基础可查】

两者做的是同一件事:**"某个内容源产出太多字节;tk 把它投影成预算内、证据优先、可恢复
的形态。"**
- 压缩器的实现:handler(逐命令格式化)+ ladder(lossless → summary+pointer)+ 四账本;
- codemap 的设计:projection profile + hard ceiling + marginal-utility + omitted/handles。

一个机制,两套预算引擎、两套诚实词汇、两套恢复语义【事实:pack §4 vs 契约 §9】。
"一个产品"要在机制层成立,这两套必须是同一个引擎。

### 挑战三:纯压缩的价值会被宿主吃掉;可防御的阵地是"找回"与"供给"【判断】

宿主在快速改进 compaction、缓存、上下文管理(brief §3A 收集的外部研究就是证据)。
"把命令输出变小"是宿主明天就能内置的能力。tk 手里真正没人占的两块阵地:
1. **恢复合同**——tk 已经持有原件(rawStore + ADR 0001 recovery contract【事实】),
   但从未把"敢删,因为能找回"作为对宿主/agent 公开的产品承诺;
2. **任务供给**——PROPOSAL.md:240 你自己写的 arc:"one curated context base projected
   per task"【事实,pack §7-E】,至今没有设计承接它。

### 挑战四:codeguide 的 co-equal Required 失去支撑【判断】

四个 Inspector(Flow/Domain/Evidence/Symbol)是为四层服务的;上层砍掉后,人类面自然
缩小。内部推广的"楔子"价值真实存在,但一个 Repository Overview + Symbol Inspector
的薄 codeguide 就能兑现它,不需要 D28–D31 的全量。

---

## 1. 我的产品主张:三个动作

**tk 是 agent 的 context port**:所有重量级上下文获取经过一个引擎,该引擎做三件事——

| 动作 | 含义 | 现有胚胎【事实】 |
|---|---|---|
| **Project 投影** | 任何大内容 → 预算内、证据优先、带句柄的投影 | handlers + ladder;契约 §9 投影设计 |
| **Recall 找回** | 每个投影背后有原件;句柄是稳定的恢复合同 | rawStore、dedup、ADR 0001 |
| **Provision 供给** | 任务开始/按需,从代码图+项目知识组装预算化 context packet | 契约 §9 QueryPlan;PROPOSAL §7-E arc |

save-token 不再是产品动作,是这三个动作的**可测副作用**(P4 的彻底版)。

## 2. 架构

```
                    ┌─ Surfaces ────────────────────────────────┐
                    │ hook(P11) │ tk mcp │ VS Code ext │ CLI hub │ codeguide(thin)
                    └───────┬───────────────────────────────────┘
                            │  统一工具面: explore/search/node/callers
                            │            + read + recall + packet
                    ┌───────▼───────┐
                    │ ContextEngine │  Budgeter(hard ceiling + marginal utility)
                    │               │  Envelope(coverage/omitted/handles/basis/freshness)
                    │               │  Store(originals + handles + ledgers, sqlite)
                    └───┬───┬───┬───┘
              ┌─────────┘   │   └─────────┐
        CommandProducer  CodeGraphProducer  FileProducer / SearchProducer
        (现有 handlers    (缩界代码图:      (smart-read 泛化到任意大文件;
         降为 shaper,     tree-sitter +      rg/glob 结果分组去重)
         预算/信封归引擎)  FTS5 + 分级排序
                           + query-local PPR)
```

- **ContextEngine 是唯一的预算与诚实层**:hard ceiling、marginal-utility-per-char、
  omitted counts、expansion handles、measured/opportunity 分账——压缩器与代码图共用,
  "绝不静默截断"与"永不相加"在这一层强制执行一次,而不是两处各写一遍。
- **handlers 降为 shapers**:保留其命令知识(什么是 evidence、什么可丢),交出预算与
  信封决定权。这是"一个产品"在代码层的具体形状。
- **存储**:per P10,一个 shard 根;`ledgers.sqlite`(热路径账本)+ `graph.sqlite`
  (代码图,WAL),隔离锁竞争。
- **交付**:P3/P11/D19/D33 全部不变——hook 管命令,MCP/extension 管工具面,CLI 是 hub。

## 3. 代码图缩界(我对契约的 re-scope)

| 保留(Required) | 砍掉(Outside current product scope) | 复活触发条件(记录在案) |
|---|---|---|
| tree-sitter tier-1 抽取(D23 语言集) | **Behavior 层**(CFG/def-use/dispatch/effect) | harness 证明 flow/impact 工具被 agent 高频选用且答案质量受限于结构可达性 |
| symbols/defs/refs/calls/imports + 精确 span | **Domain 层**(deterministic core + semantic promotion) | packet 供给撞上领域词汇天花板(NL 召回持续失败于 jargon) |
| FTS5 + 分级 cascade 排序(D13)+ query-local PPR | **Evidence 子系统**(FactClaim/仲裁账本/decision ledger) | **SCIP 消费落地之日**——多 producer 身份冲突出现,仲裁才有真实工作 |
| 新鲜度:指纹 + dirty queue + RECONCILING(E/D25) | SCIP 消费(D16 整体推迟) | 同上,与仲裁一起进 |
| 投影 profile = QueryPlan(D17,4 工具) | codeguide 的 Flow/Domain/Evidence Inspector | 对应层复活时 |
| **provenance/confidence 作为边上的列**(producer、span、confidence、freshness) | | |

关键立场:**provenance 列是 Evidence 层里"成本 5%、价值 20%"的那部分,留下;
仲裁机器是"成本 60%"的那部分,等它的真实工作(多 producer)出现再建。**
D25/D26 的诚实语义(completeness/presentationTruncated/软置信)全部保留——它们在
Envelope 里是廉价字段,不依赖仲裁账本。

codeguide:降为 **On-demand 薄面** = Repository Overview + Symbol Inspector
(D28 的 Live serve 机制保留,React Flow/ELK 栈不变,只是页面集缩小)。

## 4. 供给:Task Context Packet(新增,Required)

- **工具**:`tk_packet(task, budget?)`——MCP/extension 工具,agent 或用户在任务开始时
  调用;Claude Code 侧可加 hook 注入(session 起点),Copilot 侧经 instructions 文件
  指引 agent 主动调用(注入通道差异如实披露,不假装对称)。
- **内容**(全部经 Envelope,预算硬顶):
  1. 任务种子检索:task 描述 → 词法 + hints → 分级排序 → 3–8 个代码锚点(即 locate
     profile 的 packet 化);
  2. 项目常识块:约定、关键决策、禁区——来自人类拥有的 JSONC 控制文件(D30 已定
     JSONC;人类手编,tk 只投影,不生成不臆造);
  3. 恢复句柄:packet 里每项都带 handle,agent 可下钻。
- **诚实边界**:packet 是投影不是断言;无索引 → NotIndexed 指引(D17 语义沿用);
  常识块缺失 → 该节直接不出现,不生成模板文字(D5 的"无假叙事"精神)。

## 5. 找回:恢复合同产品化(新增,Required)

- `tk_recall(handle)` 工具 + `tk recall <handle>` CLI:任何 Envelope 句柄可解引用到
  原件切片(不是整个原件——按需分页,自身也走预算)。
- **对宿主/agent 的公开承诺**:凡经 tk 投影的内容,激进压缩/丢弃是安全的。
- 直接收益:session dedup 可以更激进——HIT 响应附带 handle,"可疑就找回"取代
  "TTL 保守主义"(现行 30/120/300s TTL 类可放宽,measurement-gated)。
- rawStore 从内部实现升级为产品面:保留策略(TTL/容量帽)成为文档化配置,披露先行。

## 6. 现有实现的优化清单(0.3.x 代码,与方向无关也该做)

1. `--raw` → `stdio:"inherit"`(已知缺陷,最重 passthrough 路径【事实,pack §7-B】);
2. handlers → shapers 重构(§2):预算/信封逻辑从 `makeFilteredResult` 系抽入引擎;
3. jsonl 账本 → `ledgers.sqlite`(P10 既定方向);
4. inspect 增加构成拆分 pass(命令输出/文件读/搜索/MCP/其他 per-session 占比)——
   它现在是**产品功能**(观测台)而不是测量前置步骤;
5. token 估算器校准(`scripts/calibrate-tokens.ts` NNLS 已有,烘进估算)【事实,pack §7-D】;
6. 文档真相清扫:dedup 默认值、"项目仓库永不写入"、60–90% 口径(pack §6 三项)。

## 7. 度量(沿用已定协议,两处扩展)

- O1 = whole-task uncached delta,runner = Claude Code headless,oracle = P14
  (SWE-bench + 内部仓任务集)——不变;
- 消融臂:`{baseline, +compressor, +graph-tools, +packet, +all}`——packet 是独立臂,
  因为它是本设计新增的价值主张,必须单独证明;
- 恢复合同的安全性沿用 fallback-replay → `omission_bug_rate`(契约 §15)扩展到 recall
  路径:凡被投影丢弃的内容,replay 时必须可经 handle 完整找回。

## 8. 我可能错的地方(如实记录)

1. **仲裁账本是契约相对所有参考项目最独特的部分**;砍掉它,tk 与 codegraph 原版的
   距离显著缩小。我的赌注是:差异化应来自 port + recall + packet 的组合,而不是
   底层数据模型的精巧。如果你的目标里"数据模型独创性"本身有份量,这一刀就砍错了。
2. **如果 flow/impact 是杀手工具**(GitNexus 的 SWE-bench 证据方向),Behavior 层
   的砍除就是错的——复活条款为此而设,但复活有重建成本。
3. **packet 的注入/采用率未验证**:agent 不调用 `tk_packet`,供给就是空转。需要先
   做一个 steering spike(≤9KB playbook 已是契约资产,D17)。
4. **观测台(构成拆分)可能显示命令输出占比很高**——那样挑战三就弱了,压缩器应
   得到比本设计更多的投入。数据会裁决。
