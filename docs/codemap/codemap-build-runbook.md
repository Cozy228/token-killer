# codemap — build runbook（切片执行手册）

> 来源：契约 [`codemap-contract.md`](codemap-contract.md)（D1–D33）、执行票 #72–#84（纵向切片）、能力地图 #59–#71（横向 epic，查阅）。
> 用法：每条 paste-command 是粘进 Claude Code 让我跑 ultracode workflow 的 prompt；前一条报绿了再粘下一条。

---

## 1. 优先级（每个切片的尺子）

**质量硬序：① 正确性 > ② 完整性 > ③ 可验证性 > ④ token 效率。**
- token 排最后 = **绝不为省 token 牺牲前三者**；verbatim 可抄码（schema DDL / FTS5 触发器 / 生命周期常量）全文给、绝不压缩。
- understand 阶段只加载本切片相关决策（省 token 在"不读无关需求"，不在"压缩相关决策"）。

**构建顺序优先级：先钉地基。**
- **Slice 1 的 schema 形状 + harness 的指标诚实度**最优先——下游全部骑在它们上面，schema/指标错了会污染所有后续切片。
- 临界路径 **P0 #72 → S1 #73 → S3 #75 → S4 #77** 严格串行、逐条等绿；其余在扇出层并行。

---

## 2. 一次性 workflow 规约（先粘这条）

```
约定：之后每条「ultracode 实现 #N」都用同一 workflow 形状——
understand（并行读该 issue References 指向的 impl/ 文件，抽出本切片相关决策的 verbatim 原文 + 决策↔acceptance 映射，末尾 completeness critic 查漏）
→ implement（单 agent，worktree 隔离，写代码 + 测试；片内串行，不 fan-out）
→ verify（每条 acceptance criterion 派一个独立对抗 skeptic：测试真断言了吗 / harness 量的是 uncached delta 不是 total 吗 / file:line 字节相等吗）
→ gate（return {acceptanceMet, findings}）。
硬优先级：正确性 > 完整性 > 可验证性 > token。verbatim 可抄码全文给、绝不压缩。只喂 issue + ref 指针，绝不内联 action plan 全文。每片绿了就停、报 acceptance 勾选情况，等我确认再继续。
```

---

## 3. 运行序（按依赖序，前一条绿了再粘下一条）

```
# 0. 先手动做 #72（不上 workflow——1 文件 prefactor 套三阶段是纯仪式）
请直接实现 #72：统一-CLI 骨架 + 能力闸——engines.node 留 >=20，codemap 模块只在 Node>=22.5<25 守卫后 await import()，tk 热路径 import-clean，node:sqlite 冒烟，Node 20 上 codemap 命令优雅降级、tk 核心全绿。

# 1. 临界路径（严格串行，每条等绿）
ultracode 实现 #73   （S1 walking skeleton：TS 词法搜索端到端 + harness 轨道）
ultracode 实现 #75   （S3 调用图 edges + tk_callers）
ultracode 实现 #77   （S4 ranked explore：PageRank + 分级管线 + 预算）

# 2. 扇出层 A（#75 绿后；并行 worktree + 末尾串行 integration 调和 schema）
ultracode 并行实现 #74 #76 #78 #79 #80（S2/S6/S5/S9/S10），各自 worktree，最后加一个串行 integration agent：rebase + 调和各片 schema migration + 跑全量 suite，冲突按 contract §16 依赖序裁决。

# 3. 扇出层 B（#77 绿后；并行 worktree + 串行 integration）
ultracode 并行实现 #81 #82 #83（S7/S8/S12），各自 worktree + 串行 integration。

# 4. 收尾（#81 绿后）
ultracode 实现 #84   （S11 VS Code 适配器 + 分发）
```

DAG / 关键路径：
```
P0 #72 → S1 #73 ─┬─ S2 #74
                 ├─ S3 #75 ─┬─ S4 #77 ─┬─ S7 #81 ─ S11 #84
                 │          │           ├─ S8 #82
                 │          │           └─ S12 #83
                 │          ├─ S5 #78
                 │          ├─ S9 #79
                 │          └─ S10 #80
                 └─ S6 #76
关键路径 = #72→#73→#75→#77；#76/#78/#79/#80 在 #75 后并行，#81/#82/#83 在 #77 后并行。
```

---

## 4. 实现要点（跨切片不变量——错了就破坏正确性，必须在 verify 盯死）

**运行时 / 打包**
- **能力闸（D33，承重）**：`node:sqlite` + codemap 模块**只在 `Node>=22.5<25` 守卫通过后 `await import()`**、绝不顶层 import；`tk` 热路径对 codemap import-clean。否则 Node-20 机器启动即崩。
- **FK PRAGMA**：开连接后必须 `PRAGMA foreign_keys=ON`（node:sqlite 默认 OFF），否则 edge CASCADE 不生效。
- **PRAGMA 顺序**：`busy_timeout` 必须最先（C4）。
- **无 daemon（E1/D21）**：lazy on-read；per-session MCP 开一次 DB 复用 connection/prepared-stmt/bounded-cache；cross-session daemon = Outside scope；IndexWatcher Optional 默认关。

**信任 / 诚实（这个产品的命门）**
- **file:line = 信任原语（J1）**：每个 node 非空 `file:line:col`；`tk_node` 返回**字节一致**源码，测试断言字节相等。
- **边 provenance（J2/A3）**：heuristic/synthesized 边标 `provenance='heuristic'` + `synthesizedBy`，绝不裸箭头。
- **B 字段级 provenance**：检索排序一律 `WHERE provenance='static'`——LLM 字段永不改变 find-code 结果。
- **置信 = 软排序因子，绝不硬过滤（D26）**：confidence 只降 rank、不剔出**计算**；唯一硬过滤 = 用户显式 evidence-policy（须披露被排除数）。`presentationTruncated`（全算/只展示子集→仍 COMPLETE）≠ 遍历中止（PARTIAL/UNKNOWN）。
- **无 BYO-key（D22/M14）**：永不构造 api_key LLM 客户端；只宿主借用；CI gate `grep openai|api_key|faiss|embedding` = 0；static-only 降级是一等公民。

**度量（K，可证伪性的根）**
- **PRIMARY 指标 = `uncached_input_tokens` 增量，不是 total**（cache>97% → total 量的是缓存重放）。
- **Claude Code headless = 唯一干净 runner**；footer 披露 host（token=proxy 非 Copilot 数）；基线 = grep。

**检索 / 排序**
- **排序 = 分级 cascade，非加权和/RRF（D13）**：FTS 锚点 → AST 邻域 → 解析身份 → PPR 种子 → query-local PPR 主排序；词法是 PPR 上游种子，**不在末端再融合**（重复计数）；用户显式 symbol/path 确定性优先。
- **PageRank Required 默认开**，personalized 种子（FTS 100 / stack 80 / git-changed 70 / edited 60）。
- **预算 = 硬顶**，截断必带 omitted-count + 稳定展开句柄，绝不静默。
- **FTS5 同步** 3 触发器（ai/ad/au）；FTS5 缺失 → LIKE-scan 兜底（仅 npm-shim-on-user-Node 路径）。

**增量（E）**
- `(mtime_ns,size)` 预过滤 → sha256 content-hash 快路（identical→跳 parse）→ AST 结构指纹 diff（COSMETIC vs STRUCTURAL）→ 反向 calls/imports BFS 闭包；无 parser 的文件任何 hash 变更**保守判 STRUCTURAL**。

**进程模型（D32）**
- MCP + codeguide = 独立适配器、各把 Core 当进程内 TS 库；共享 on-disk SQLite WAL；reconcile 由 **DB-backed lease** 协调（仅 owner 写 staging）；generation 原子发布；**generation identity = 元组**（repo revision + worktree digest + schema version + policy version），非整数。

**codeguide（D28/D29/D31）**
- React 19 + Vite + React Flow + ELK 单 Web App；`serve` **仅 loopback、非 daemon、关即停**；viewer = 系统浏览器；VS Code = deep-link 启动器（随机端口 + token）、**无 Webview**；只读（编辑 defer）；**无 graphology/sigma/mermaid**。
