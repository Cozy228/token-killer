# Direction Analysis

> Produced 2026-07-02 by Fable, per `FABLE-DIRECTION-ANALYSIS-PROMPT.md`. Grounding:
> `PROJECT-CONTEXT-PACK.md` (cited as §n), `feat/1.0.0:docs/codemap/codemap-contract.md`
> (cited as Dn / contract §n), `codemap-action-plan-20260620.md` (slices #72–#84).
> Every claim is tagged 【事实】(from the pack/contract), 【推断】(my inference), or
> 【建议】(recommendation). P1 (one product, invariant = context engineering) and
> P3 (endgame = hook + extension/MCP, shim removed) are treated as firm.

---

## 1. Current Project Reading

**产品当前是什么。**【事实 §0/§1/§7-A】一个仓库承载两条产品线:已出货的 `feat/0.3.2`
——命令输出压缩器 + inspect/optimize + telemetry + doctor,零运行时依赖的 Node CLI;
和 `feat/1.0.0` 上**设计完备但零代码**的 codemap/codeguide——四层知识图(Code/Behavior/
Domain/Evidence)+ claims/仲裁 + 4 工具 Agent 面 + 只读人类面。P1 把两者钉为一个产品:
让 agent 的开发者本地上下文更精确、更高效。

**解决什么问题。**【事实 §1】agent 为终端输出的每个字节付 input token,且重复执行重复
计费(压缩器一侧);agent 找不到/读不懂代码时用低效探索浪费上下文(codemap 一侧)。

**当前系统形态提供了什么。**【事实 §2/§3】热路径命令代理(route → spawn 一次 → 压缩管线
→ emit-before-accounting)、hook 改写循环(PreToolUse `updatedInput` 把命令重路由进 tk)、
`~/.token-killer` 下 jsonl 四账本、只读转录扫描器(inspect)+ 安全补丁引擎(optimize)、
交付分层 Hook > Shim > Injection。

**当前实现可能在偏置什么。**【推断】
- **每次调用 = 新进程**的形态(§5 Windows/EDR 档案;memory keystone:只有 MCP 持有的
  per-session 管道能避开 per-call spawn)把"压缩器"锁死在 CLI-proxy 心智模型里,而 P3 的
  endgame(hook + extension/MCP)其实指向 session 常驻形态——契约 D21③ CommandProxyResident
  已经承认了这一点。
- **jsonl 账本 + `raw − delivered` 单次差值**把"价值"的定义偏向 per-call 字节差;P4 已宣布
  这是子指标,但数据基座还在按它塑形。
- **handler 注册表**把覆盖问题框成"哪些命令有 handler"(ADR 0007 测得 94% 管道字节是
  无-handler 尾部【事实 §5,measured】),而不是"agent 的上下文里什么占大头"。
- **两套存储基座**:0.3.x 用 jsonl,codemap 契约用 node:sqlite——"一个产品"目前是叙事上的,
  不是架构上的(详见 §2-T4)。

---

## 2. Key Tensions

**T1 — 两个价值引擎、两套证明体系。**【事实 §7-C/O1/O2;未决】压缩器价值 = 单次
`raw − delivered`(measured);codemap 价值 = whole-task uncached A/B(契约 §15)。诚实护城河
禁止相加,O1(贯通指标)与 O2(联合叙事)未决。这是当前最大的产品级张力:一个产品,
两种互不相通的"值多少"。

**T2 — 拦截式 vs 供给式。**【推断】压缩器是**被动减法**(agent 已经要了,tk 把它变小);
codemap 是**主动改道**(改变 agent 要什么)。同为"context engineering",力学相反:前者天花板
= 命令输出在上下文中的占比,后者天花板 = 探索/读码在上下文中的占比。**两个占比今天都没有
测过**(见 §7 缺失信息)——而 inspect 扫描器已有能力测它。

**T3 — endgame 交付在主平台上的不对称。**【事实 §3/§5/§7-B + 推断】P3 移除 shim 后,
压缩器在主平台(VS Code Copilot on Windows)只剩 hook 改写 → 重新 spawn tk → 在 EDR 机上
每次多付 400–1100ms(measured latency,归因 EDR 是 inferred,§5)。而 codemap 的交付
(extension/MCP,per-session 进程)天然免此税。即:**endgame 恰好把压缩器推向它形态上最吃亏
的路径,把 codemap 推向最占优的路径**。契约 D21③ 已裁定 CommandProxyResident 是"AV spawn 税
唯一真解",但 D32 又把它与 Core 进程隔离——两个 per-session 常驻体是否该是一个,未有明确答案。

**T4 — 一个产品、两个数据基座。**【事实 §3/§7-A + 推断】压缩历史/dedup/账本住 jsonl,
codemap 住 node:sqlite(契约 §5/D18)。P6(Node ≥22)一旦落地,`node:sqlite` 对 tk-core 也可用,
"两个基座"就从必然变成选择。P1 的"一个产品"要成为架构事实,单一本地存储是最便宜的落点之一。

**T5 — 受众三重矛盾。**【事实,§1/§7-D/契约 D24/P8;未决】README 是 OSS 姿态,PROPOSAL.md
是企业端点叙事,契约 D24 记录"个人项目、永不发布"(并据此废除 license 顾虑、砍掉分发项),
§7-D 又列着 npm publication。P8 说公开姿态 ≠ 内部现实,但没有说**哪个才是真受众**。这直接
决定 L 切片(签名/分发)、server/、telemetry、以及 P5"公司内 A/B"的份量。

**T6 — 证明货币铸在测不到的平台上。**【事实 §7-C/契约 §15】主平台(VS Code Copilot)
暴露不了 token,唯一干净的 uncached runner 是次平台(Claude Code headless)。P5 说"公司内
A/B 数据是根本",但公司内的目标宿主结构性不可测——内部叙事(O2)只能由 proxy 数字 +
opportunity facts 组成。ADR 0022 已守住声明边界,但"这样的证据对内部受众是否足够有说服力"
是未检验的假设。

**T7 — 设计完备度与实现体量的落差。**【事实 §7-A + 推断】25 个 ADR、33 项决策、13 个执行
切片,零行 src/。Terminology Law 要求"完整有界产品、不许半成品发布",四层 Required + 双面
Required 对一个(以 agent 为杠杆的)单人维护者是重资产承诺。契约的自我缓解是 D2(源同化
codegraph),其"能显著缩短路径"的程度是 Inferred,未验证。

**T8 — P4 的引力方向。**【推断】若 save-token 降为 facet,唯一已出货、已验证的那半个产品
(0.3.x)就变成次要资产。维护精力怎么分、README/对外叙事何时改写,悬而未决。

---

## 3. Assumptions To Challenge

**A1 — "压缩器在 endgame 保持独立交付形态(hook 改写 → spawn tk)"。**
- 证据:§3 hook 循环、§5 spawn 税、契约 D21③(resident 是唯一真解)。
- 为什么要重开:T3 —— endgame 主平台上这是形态最差的路径;而 per-session 常驻体 codemap
  一侧反正要建(D32)。
- 何以确证/证伪:确认 EDR 是 925ms 主因(§7-B 明言 INFERRED 未确证);实测 hook 改写在
  当前 Copilot 版本的可靠性(§6 两份现场报告相反)。

**A2 — "save-token 一侧值得与 codemap 同等的持续工程投入"。**
- 证据:ADR 0007(管道尾部安全回收 <1%,measured)、ADR 0010(会话口径 ~27%,measured,
  unique-content 基数)。
- 为什么要重开:压缩器的天花板受限于命令输出占上下文的份额,该份额从未被测量;P4 已经
  在方向上降权。
- 何以确证:用现有 inspect 扫描真实转录,测**上下文构成拆分**(命令输出 vs 文件读取 vs
  搜索/探索 vs 其他)。这是 §7-C Track-2 的现成子集,成本以天计。

**A3 — "codeguide 与 Agent Surface 同等 Required"。**
- 证据:契约 D1(双面 Required);D24(个人自用、永不发布)。
- 为什么要重开:人类面(H 切片 + D28–D31:Web App、React Flow、ELK、双数据适配器)是重投入,
  受众在 D24 语境下 N≈1。D1 是 grilling 拍的,但拍板时的受众假设与 D24 是否一致值得核对。
- 何以确证:回答"人类面的真实消费者是谁、多久用一次"(§7 缺失信息)。

**A4 — "存在只能跑 Node 20 的真实机器"(D33 的 engines 留 20 依据)。**
- 证据:契约 D33 明言;P6 倾向 ≥22。
- 为什么要重开:若该机器已不存在/不再重要,D33 的能力闸 + 动态 import 脚手架(版本守卫后
  `await import()`、Node 20 优雅降级)是不必建的死重;且单存储(T4)也被它卡住。
- 何以确证:一个事实问题——那台机器还在吗、还需要 tk 吗。

**A5 — "Claude Code proxy 的 A/B 结果对内部叙事(O2)有足够说服力"。**
- 证据:契约 §15/ADR 0022 的声明边界;P5、P8。
- 为什么要重开:见 T6。若内部受众要求目标宿主上的数字,现有证据形态(proxy + opportunity)
  可能不够;O2 的设计需要先知道"给谁看、什么算数"。
- 何以确证:受众问题(T5)先落定。

**A6 — "两套数据基座各自演化"。**
- 证据:§3 数据流 vs 契约 §5/D18。
- 为什么要重开:P6 落地后 node:sqlite 全线可用;账本进同一 store 让 O1/O2 的联合报表、
  以及"一个产品"的架构事实都变便宜。
- 何以确证:P6 落地决策 + 账本迁移成本评估(mid-level,见 §6)。

**A7 — "hook『must be solid』"目前没有可测的验收定义。**
- 证据:P3 原文;§6 Windows 路由两份相反的现场报告。
- 为什么要重开:P3 是 firm 方向,但"solid"无操作化标准,shim 移除就没有触发条件。
- 何以确证:定义验收指标(路由命中率/失败回退率/版本矩阵),用 Track-2 事实持续测。

---

## 4. Candidate Paths Forward

> 路径 4 与其余三条不互斥(它便宜到可以作为任何路径的前置);1–3 互斥于"下一个大动作"。

### Path 1 — 按契约直行(Contract-first execution)
- **核心思路**:按 §16 依赖序执行关键路径 P0 → #73 → #75 → #77,harness 与 schema 同期
  (切片 1 自带 harness 轨道);0.3.x 压缩器纯维护,不动。
- **优化目标**:最快兑现 codemap 价值;尊重已闭合的 33 项决策,零重开成本。
- **放弃**:近期的架构统一——"一个产品"继续停留在叙事层;压缩器留在旧基座与旧交付形态上。
- **产品含义**:产品重心事实上转向 codemap;save-token 按 P4 自然降权。
- **系统含义**:两基座、两进程模型并存;T3/T4 原样携带。
- **实现含义**:起手 = `src/codemap/db/schema.sql` + harness(action plan"下一步"原文)。
- **风险/未知**:T7 的体量风险全额承担;若 A2 证伪方向相反(命令输出占比其实很大),
  投入错位。
- **成立条件**:契约的假设(D2 同化可行、四层可达)基本成立;压缩器现状足够好,可以晾一年。

### Path 2 — 基座先统一(Substrate unification first)
- **核心思路**:先把"一个产品"做成架构事实,再在其上建 codemap:P6 落地(engines ≥22,
  拆除 D33 能力闸与 compile-cache DEFERRED 层)→ node:sqlite 成为唯一本地存储(账本/历史/
  dedup 迁入)→ per-session 常驻体成为唯一进程模型(hook 变薄客户端连 resident,即把 D21③
  与 D32 的适配器进程合一)。
- **优化目标**:P1 架构化;顺手结构性解决 Windows spawn 税(P7 的"以后再说"变成副产品);
  O1/O2 的联合报表拿到单一数据源。
- **放弃**:codemap 价值延迟一个基座周期;动已出货、在用的代码(迁移风险);重开 D32 的
  进程隔离决策。
- **产品含义**:压缩器与 codemap 共享交付脊柱,P2(交付是层)从口号变成接口。
- **系统含义**:单 store、单 resident、单 hook 薄客户端;shim 移除路径清晰化。
- **实现含义**:账本 schema 迁移 + hook↔resident 协议(命名管道在 Falcon 下的容忍度未知,
  §7-B 明言 daemon 是 conditional)+ 回归面大。
- **风险/未知**:EDR 归因未确证就动进程模型 = 在 inferred 病因上做手术;D32 被重开需要
  "明显更优 + 量化证据"(契约 §2 强倾向推翻标准)。
- **成立条件**:A4 证伪(Node 20 机器不再重要)、EDR 归因确证、hook 可靠性达标。

### Path 3 — 投影引擎为核(Projection engine as the product core)
- **核心思路**:把产品重述为 **agent 的上下文 I/O 端口**:一切进入上下文的内容(命令输出、
  代码检索结果、符号理解、影响面)都经同一个**预算化投影引擎**(G 切片的
  marginal-utility-per-char + hard ceiling 泛化为全产品的输出层);压缩器 handler 与 codemap
  四层都降格为"上下文生产者",投影引擎统一决定"什么值得进上下文、以什么密度"。
- **优化目标**:最深的抽象与最长的杠杆;O1 天然收敛为单一指标(每任务上下文效率);
  外部研究(context-compress/01–04 的 agentic self-managed context)有了落点。
- **放弃**:最大的重设计;与 DESIGN.md 既有非目标冲突(direct-tool result projection 曾明确
  不做,§5);VS Code 无法强制文件读取经过 tk——供给侧覆盖不完整,"端口"名不副实的风险。
- **产品含义**:save-token 与 codemap 彻底同构(都是"生产者 + 投影");产品故事最统一。
- **系统含义**:投影引擎成为唯一输出合同;evidence classes 与 coverage/completeness 两套
  诚实词汇必须合并。
- **实现含义**:等价于重写压缩器输出层 + 提前泛化 G 切片——在 codemap 尚无第一行代码时
  做第二层抽象。
- **风险/未知**:经典的过早抽象;"上下文构成拆分"没数据前,不知道这层抽象覆盖多少真实浪费。
- **成立条件**:harness 已有数据表明多源上下文浪费显著、且单一投影层能同时服务两侧而
  不失手感。**当前证据不足以启动此路径**【推断】。

### Path 4 — 机会测量先行(Opportunity-measurement first)
- **核心思路**:任何大动作前,先用现有 inspect 扫描器对真实转录跑一次**上下文构成拆分**
  (命令输出 / 文件读 / 搜索探索 / 其他,per-session 占比);同时把 O1 候选指标操作化:
  whole-task uncached delta,消融臂扩展为 {baseline, +compressor, +codemap, +both}——即把
  压缩器纳入契约 §15 已设计好的同一 harness,而不是另建一套。
- **优化目标**:P5(数据为证明货币)自洽——先用数据选方向,而不是为已选方向找数据;
  O1/O2 一步到位有了候选答案。
- **放弃**:数周的"没有新功能"期;codemap 起手推迟(但 harness 本来就是切片 1 的一半)。
- **产品含义**:A2(压缩器投入)与 T2(两个天花板)第一次有测量答案。
- **系统含义**:无——纯读路径 + 测量协议。
- **实现含义**:inspect 加一个构成分析 pass(读侧,风险低);harness 轨道提前于 schema。
- **风险/未知**:任务 oracle 来源仍未决(§6 memory:for grill, not decided);样本 = 维护者
  自己的转录,外推性有限。
- **成立条件**:几乎无条件——它是决策输入,不是方向本身。

---

## 5. High-Level Design Questions

1. **真受众是谁**:D24(个人、永不发布)/ P8(公司内部启用)/ OSS 姿态三者中,谁获得
   设计权重?这决定 L 切片、server/、telemetry、O2 的形态。(T5)
2. **压缩器的 endgame 交付形态**:shim 移除后,在 VS Code+Windows 上是 hook→spawn、
   hook→resident 薄客户端、还是引导 agent 走 MCP 工具?CommandProxyResident(D21③)与
   D32 的 per-session 适配器进程是一个还是两个?(T3/A1)
3. **单一本地存储**:P6 落地后,tk-core 的账本/历史/dedup 是否迁入 node:sqlite,与 codemap
   同库或同目录约定?(T4/A6)
4. **一套诚实词汇**:压缩器的 evidence classes/四账本与 codemap 的 authority tiers/confidence/
   coverage/completeness 是两套平行的"诚实"体系——一个产品要不要一套词汇、一个报表?
5. **codeguide 的优先级**:在真实精力预算下,人类面是否维持与 Agent 面同等的 Required
   地位?(A3——注意这是挑战 D1,需要"明显更优 + 量化证据"级别的理由才动)
6. **"hook must be solid"的验收定义**:什么指标、什么阈值、在哪些 Copilot 版本矩阵上,
   触发 shim 移除?(A7)

## 6. Mid-Level Design Questions

- **O1 操作化**:whole-task uncached delta 作为贯通指标时,消融臂矩阵(压缩器是否入臂)、
  任务 oracle 来源(SWE-bench 之外要不要自然任务集)、run 预算、中位数协议——契约
  ADR 0022–0024 已定 codemap 侧,压缩器侧如何并入同一协议?
- **账本迁移**:jsonl 四账本 → sqlite 的 schema;`~/.token-killer` 与 codemap out-of-tree store
  的目录/分片约定是否合并;迁移的原子性与回滚。
- **进程与协议**:hook 薄客户端 ↔ resident 的 IPC 选型(命名管道 vs loopback socket)、
  Falcon 对常驻进程 + 管道的容忍度(§7-B 未测)、与 D32 lease/generation 发布模型的关系。
- **投影合同共享**:压缩器输出要不要过 G 切片的预算引擎(hard ceiling + marginal utility
  + omitted counts + expansion handles),还是保留 handler filter 模型?两者的"绝不静默截断"
  语义如何对齐?
- **Node ≥22 落地序**:engines bump → 删 compile-cache DEFERRED 层(cli.ts:13-15)→ 拆
  D33 动态 import 守卫 → README/INSTALL 更新。
- **遥测归并**:codemap 的查询/命中/新鲜度事件进不进四账本模型?还是新增账本类
  (第五账本 = 检索质量)?"永不相加"如何跨账本执行?
- **文档真相清扫**(顺路修,不单列项目):§6-1 dedup 默认值 README 与代码相反;§6-2
  CONTEXT.md"项目仓库永不写入"与 ADR 0006 冲突;README"60–90%"口径按 P4 重述。
- **输出合同**:MCP 工具(4 工具,D17)与压缩器 CLI 输出各自的 stale/partial/coverage 标注
  是否共用同一 envelope 格式。

## 7. Missing Information

**缺产品事实**
- 真受众/部署现实的裁定(D24 vs P8 vs npm publication,三处记录互斥)。
- codeguide 人类面的真实消费者与使用频率预期。

**缺技术事实**
- EDR 是否确为 ~925ms 主因(§7-B:INFERRED not confirmed)。
- hook 改写在当前 Copilot 版本上的可靠性(§6 两份现场报告相反,版本不同)。
- Falcon 对常驻进程 + 命名管道的容忍度(daemon/resident 的前置条件)。
- 那台"只能跑 Node 20"的机器是否仍存在/仍需要 tk(D33 依据)。
- server/ 是否有活的部署(§6 未确认)。

**缺用户/工作流事实**
- **上下文构成拆分**(命令输出 vs 读码 vs 探索占比)——决定 T2 两个天花板的实测值,
  现有 inspect 即可测,是本分析中性价比最高的缺口。
- 真实会话中 dedup 命中率、重复读取率的近期数值(~28% inert 待复测,契约 measurement-gated 项)。

**缺历史/约束事实**
- "shim authoritative on VS Code"反映的是仍然成立的宿主限制,还是旧版 Copilot 行为
  (§6 divergent field reports 未收敛)。

## 8. Recommended Discussion Agenda

1. **受众裁定(15 分钟,纯决策)**——D24/P8/OSS 三选一为主受众;它给 5 个后续问题定权重。
2. **批准 Path 4 的两个测量动作**(不等方向定):① inspect 上下文构成拆分;② O1 候选
   指标 + 压缩器入消融臂。产出物 = 两个数字与一份协议,喂给 3/4。
3. **压缩器 endgame 交付**(高层问题 2):三个形态选一,或裁定"等 EDR 归因 + hook 可靠性
   数据再选"——但要给出触发条件。
4. **P6/单存储裁定**(高层问题 3):Node ≥22 是否落地、账本是否迁 sqlite;若 A4 证伪,
   顺带决定拆除 D33 守卫脚手架。
5. **选路径**:在 1(直行)/ 2(基座先行)之间拍板,3(投影引擎)明确记为"north star,
   非本轮 build 目标"。
6. **记录**:把以上决策 append 进 pack §9(P9…)或新开 decision log,供 design step 引用。

## 9. Your Current Best Read

**最有希望的组合【建议】:Path 1 主干 + Path 4 前置 + 从 Path 2 借两个"现在便宜、以后贵"
的决策。** 即:

- 立即跑 Path 4 的两个测量(天级成本,读路径,零风险);
- 按契约直行关键路径 P0 → #73 → #75 → #77(设计已闭合,重开成本高、收益无证据);
- 但在起手前锁定两件基座事:**P6 落地 + "sqlite 为唯一本地存储"的方向裁定**(不必立刻
  迁移账本,但 codemap schema/目录约定要按"未来同库"设计,避免第二次迁移);以及
  **O1 = whole-task uncached delta、压缩器入消融臂**作为工作假设写进 harness。

**为什么**:codemap 侧 33 项决策是四轮 grilling 的产物,证据链完整,重开任何一项都要
"明显更优 + 量化证据"(契约 §2),而我手上没有;真正未决且便宜的杠杆全在缝合处
(指标、存储、词汇),那正是 Path 1 顺路能带走的。Path 2 的全量(进程模型合一)建立在
两个未确证事实上(EDR 归因、Falcon 容忍度),现在动是拿 inferred 病因做手术。Path 3
是最好的十年叙事、最差的本月计划。

**什么会改变我的判断**:
- 构成拆分显示命令输出仍占上下文大头(>40% 量级)→ 压缩器不该降权,A1/T3 的交付问题
  升为最高优先,Path 2 的 resident 合一提前。
- hook 改写在现役 Copilot 上被证不可靠 → P3 的"must be solid"闸门失守,交付层设计
  (而非 codemap)成为第一工程问题。
- A/B 显示压缩器对 whole-task uncached 贡献 <5% 量级(类比 ADR 0007 的 <1% 先例)→
  save-token 转纯维护,README/对外叙事改写提上日程。

**现在不该做的决定**:降级 codeguide(A3 只是问题,证据不足以推翻 D1);启动任何
resident/daemon 实现(前置事实未测);Path 3 的任何代码;shim 的实际移除(验收定义
尚不存在)。
