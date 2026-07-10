> **[2026-07-04 P28/P29; updated 2026-07-10] SUPERSEDED as build order, LIVE as index** — the #59–#84 slice DAG was excluded as a route input (P26); the build route is now the gate-first **M-plan v2** in the current `CONTEXA-IMPL.md` §8 (the old M1–M5 route is superseded). Everything else stands: this file remains the navigation index into the `impl/` dossier, which is the product's detail layer (P29 reference-not-copy; the legacy read-back map lives in the archived `docs/archive/CONTEXA-IMPL-20260703.md` §12).

# codemap — Implementation Index

> **2026-06-23：本文件已拆分。** 原 13127 行单文件（绑定契约 + A–M 实现 dossier + 附录）拆成下列文件，
> 内容零删除（git 历史保留原文）。本文件现为导航索引 + 各 issue 的回指锚点。

## 入口

- **[产品契约 + 决策日志 D1–D32](DESIGN.md)** — §1–17 绑定契约（Terminology Law、Product Contract、Canonical Data Model、Freshness、Ranking、Agent Surface、codeguide、Evaluation Gates、Implementation Dependency Order、Open Decisions）+ D1–D32 / ADR 0017–0040 逐项摘要。**这是常读的"宪法"，动手前先读它。**

## 实现 dossier（`impl/`，每需求一个文件 = 一个 epic issue）

> 每个文件含该需求的：决策 / 要动的文件 / 可抄代码（verbatim + `源:` 引用）/ 具体数值 / 有序步骤 / 测试 / 证据回指。
> 这些是实现依赖顺序，不是产品阶段；目标仍是 [`DESIGN.md`](DESIGN.md) 定义的完整有界产品。

- [00-sources](impl/00-sources.md) — 源指南索引（可抄性表）+ 官方文档复核清单（动手前逐条核）
- [A — Core method](impl/A-core-method.md) [#59](../../issues/59) — typed property graph、检索管线、PageRank、置信兜底
- [B — Intelligence source](impl/B-intelligence-source.md) [#60](../../issues/60) — static/LLM per-field 契约、宿主借用、no-BYO-key、static-only 降级
- [C — Index base & storage](impl/C-index-storage.md) [#61](../../issues/61) — node:sqlite、版本闸、out-of-tree、schema、迁移、Windows 锁
- [D — Language coverage](impl/D-language-coverage.md) [#62](../../issues/62) — web-tree-sitter WASM、tier-1 语言集、捕获模型、解析器生命周期
- [E — Freshness / incremental](impl/E-freshness-incremental.md) [#63](../../issues/63) — lazy 检查、指纹、AST-diff、失效闭包、git hooks、RECONCILING
- [F — Agent delivery surface](impl/F-agent-surface.md) [#64](../../issues/64) — 双前端单后端、JSON-RPC、4 工具、NO-INDEX、server-instructions
- [G — Output token economy](impl/G-output-economy.md) [#65](../../issues/65) — signature-collapse、Smart Read 三模式、char 档、kill-switch
- [H — codeguide surface](impl/H-codeguide-surface.md) [#66](../../issues/66) — codeguide Web App、live HTML、子图渲染
- [I — Collaboration](impl/I-collaboration.md) [#67](../../issues/67) — solo-first、控制文件 JSONC、写/编辑往返、impact、来源/陈旧
- [J — Correctness / trust](impl/J-correctness-trust.md) [#68](../../issues/68) — file:line 信任原语、边 provenance、置信软因子、诚实兜底
- [K — Proof](impl/K-proof.md) [#69](../../issues/69) — 测量 harness、SWE-bench 端到端、per-language 能力集、消融协议
- [L — Distribution / runtime](impl/L-distribution-runtime.md) [#70](../../issues/70) — Windows primary、版本闸、签名 artifact-gated、SHA256SUMS、npm provenance
- [M — Cross-cutting](impl/M-cross-cutting.md) [#71](../../issues/71) — best-practices adopt-list + anti-pattern blacklist

## 附录（跨需求可抄实现）

- [A1 — PageRank / SCIP / gitnexus 可抄实现](impl/appendix-A1-copyable.md)
- [A2 — gitnexus 全量可抄清单](impl/appendix-A2-gitnexus.md)（全部 `[非分发安全]`，但见 D24：个人永不发布 → license 不相关）
- [A3 — GitNexus / Token-killer-Research 对照补充](impl/appendix-A3-reconciliation.md)（排序 reconciliation、Leiden、Process、可靠性分级）
- [A4 — 语义 / 领域 / 业务逻辑层吸收](impl/appendix-A4-semantic.md)（五层 semantic、无-embedding 检索、QueryPlan、多图模型）

## 状态（2026-06-23）

- **设计 fork 全闭合**：四轮 grilling → D1–D32 / ADR 0017–0040，§17 Open Decisions 全 ✅ 或 measurement-gated。
- **剩余非设计项**：① 单一版本闸 `>=22.5.0 <25.0.0` + vendored Node 24.x 待确认接受；② ~7 项 measurement-gated 参数（char-vs-token cap、~28% inert 复测、sweep 常量、watcher debounce、daemon op-count、bundled-Node 粒度）—— 由 K harness 实测关闭，非 grill。
- **下一步**：按契约 §16 依赖序起手 = `src/codemap/db/schema.sql` + evaluation harness 同期。

## 执行票 — 纵向 tracer-bullet 切片（AFK-ready）

> 上面的 A–M（#59–#71）是**横向能力地图 / spec 索引**（查阅用）。下面是**纵向执行切片**：每个切穿 extract→store→retrieve→工具/surface→harness，独立可演示。依赖序 P0→#73→{#75}→{#77}→…。

| Slice | Issue | Blocked by |
|---|---|---|
| P0 — Node 版本闸 + bootstrap 检查（prefactor） | [#72](../../issues/72) | — |
| 1 — Walking skeleton：TS 词法搜索端到端 + harness 轨道 | [#73](../../issues/73) | #72 |
| 2 — Verbatim read `tk_node` | [#74](../../issues/74) | #73 |
| 3 — 调用图 edges + `tk_callers` | [#75](../../issues/75) | #73 |
| 6 — 多语言 tier-1 + ignore 集 | [#76](../../issues/76) | #73 |
| 4 — Ranked explore `tk_explore`（PageRank + 分级管线 + 预算） | [#77](../../issues/77) | #75 |
| 5 — 增量新鲜度 | [#78](../../issues/78) | #75 |
| 9 — Behavior 层：evidence-backed flows | [#79](../../issues/79) | #75 |
| 10 — Evidence/claim 仲裁 | [#80](../../issues/80) | #75 |
| 7 — codeguide Live 人类面 | [#81](../../issues/81) | #77 |
| 8 — 宿主借用 Domain 叙事 + static-only 兜底 | [#82](../../issues/82) | #77 |
| 12 — Proof：benchmark 架构 + 消融 | [#83](../../issues/83) | #77 |
| 11 — VS Code 适配器 + 分发 | [#84](../../issues/84) | #81 |

关键路径 = **P0 → #73 → #75 → #77**；#76/#78/#79/#80 在 #75 后可并行，#81/#82/#83 在 #77 后可并行。
