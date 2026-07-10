---
status: complete
reviewed: 2026-07-10
scope: Gate-A round-3 verification plus Gate-B adversarial review
gate_a_r3: PASS
gate_b: FAIL
---

# Codex Gate-B Review

结论：**Gate-A-r3 通过 7/7；Gate-B 失败。** 共发现 5 个 BLOCKER、8 个 MAJOR、1 个 MINOR。
指定代码事实 DR-01/06/18/32/19 均经源码核实成立；失败来自登记册自身的 LAW 冲突、过期裁决和不可追踪引用。

## Gate-A round-3 复核

1. **PASS — A1–A6 normativity banner。** Appendix A 优先于 A1–A6/C1–C6，见
   `CONTEXA-IMPL.md:22-28,615-624`。
2. **PASS — staging / R-slice。** 完整 staging、R-slice 非扩张触发器、DR-12、
   DR-27-disclosure、DR-10 bare-cut 禁令均已集成；O-14/dogfooding carve-out 已经 P37 确认，
   见 `CONTEXA-IMPL.md:30-38,458-509,626-633`。
3. **PASS — DR-32。** 已覆盖 use-blocking、pre-gate omit facts、facts-return full envelope、
   manual `ctx push`，见 `CONTEXA-IMPL.md:354-359,498-499,670`。
4. **PASS — batch Q4/Q5。** Q4 已缩为 WoZ-only-until-V1，Q5 已降为 acknowledgement，
   见 `CONTEXA-IMPL.md:608-609`。
5. **PASS — DR-18。** 已加入正确的 coexistence path
   `src/handlers/system/summary.ts:214-225` 和 receipt obligation，
   见 `CONTEXA-IMPL.md:656`。
6. **PASS（仅 revision-3 审计历史）— DR-15。** 已重分类为 ORPHAN/RETIRED；
   P37 后该行只能作为被覆盖的历史记录。
7. **PASS — DR-29。** 正确记录 rename/`--raw` 已落地、`tk` alias
   禁止、剩余 absorption gated，见 `CONTEXA-IMPL.md:667`。

## Gate-B findings

### 1. BLOCKER — P37/M3 retirement 残留仍是 live prose

**Target：** `CONTEXA-DESIGN.md:60,176-179,395-415`；
`CONTEXA-IMPL.md:343-344,460-475,532-554,666-808`。

**Evidence：** LAW §11 与 P37 明确拒绝 retirement，并保留按 O-25 重构的本地按需 surface，
见 `PRODUCT-DESIGN.md:322-331`、`FABLE-DECISION-LOG.md:381-396`。
但正文仍称 guide/kernel retired、CLI 返回 retirement notice，且 normative Appendix A 的
DR-28/M-plan skeleton 继续使用 retirement 理由。

**Exact required change：**

> This minimum claim envelope is the binding base for every consumer. Under P37/O-25,
> retained or reworked M3 projection DTOs are unified with it; historical structs may
> be reused only where the re-scope justifies them.

> `ctx guide` before the O-25 re-scope returns a success-shaped
> "re-scope pending" notice, never a retirement notice.

所有非 DR-14/15/16 审计历史文本统一改为 `RECAST/FROZEN pending O-25`；
Appendix A override banner 必须同时覆盖 DR-28 的 retirement-dependent rationale 和旧
M-plan skeleton；Appendix B/C 的 `SUPERSEDED/RETIRED` disposition 一并改为
`RECAST/FROZEN`。

### 2. BLOCKER — Artifact 1 被无权提前解锁，§8 授权总述也自相矛盾

**Target：** `CONTEXA-DESIGN.md:91-100,270-307`；Appendix A DR-22。

**Evidence：** LAW 规定 ladder 决定 construction；Stage 1 是 zero-code WoZ，失败时杀
Artifacts 1/2/3/5，仅 FP-L 幸存，见 `PRODUCT-DESIGN.md:16-18,245-251,280-285`。
但 §4 无条件写 Artifact 1 "build-out pre-gate-legal"。

**Exact required change：**

> Keep the existing claim-backed proto-Brief only; no Artifact 1 build-out is
> authorized pre-V1. A V1 pass unlocks only the minimum semantics pre-registered
> as necessary for V2; any broader Context Brief construction requires an explicit
> ladder gate.

§8 开头替换为：

> V0 is authorized now; FP-L may proceed early under LAW §9; `ctx guide` may
> proceed only after Gate B and the R-slice under P37; every other item remains
> locked behind its named ladder gate.

Appendix A 的 DR-22 必须同步覆盖，不能以 normative register 反向覆盖 LAW。

### 3. BLOCKER — D32 generation identity tuple 漏掉 repository revision

**Target：** `CONTEXA-DESIGN.md:59`、`CONTEXA-IMPL.md:644`。

**Evidence：** 当前文本用 `source cursor` 代替 repository revision；ADR 0040
定义为 `(repository revision, worktree digest, schema version, analysis policy version)`，
见 `docs/adr/0040-process-model-lease-coordinated-generation-publish.md:18-25`。

**Exact required change：**

> (repository revision, worktree digest, schema version, analysis-policy version)

`source cursor` 只能作为额外的 per-source freshness 输入，不能替代 revision。

### 4. BLOCKER — “LLM output 标成 INFERRED 即可”违反 Citation-or-silence

**Target：** `CONTEXA-DESIGN.md:224-228`。

**Evidence：** LAW art.3 允许 LLM 在 cited claims 上 narrate/rank/explain，但禁止引入 claim，
见 `PRODUCT-DESIGN.md:63-65`。

**Exact required change：**

> Semantic narration may be generated only over cited claims and may not introduce
> a claim; otherwise the surface remains silent. Merely labeling LLM output
> `INFERRED` is insufficient.

### 5. BLOCKER — measurement register 仍执行已被 P37/P38 取代的旧路线

**Target：** `CONTEXA-IMPL.md:423-452`、DR-25、M-plan skeleton、Appendix B
lines 744-746。

**Evidence：** 当前正文仍要求 "finish + commit old R1 verdict" 并称 protocol scripts 未提交；
P38 已批准 measurement v2，实际顺序为 E0 retrieval benchmark → 产品修复 → E1/E2，
见 `FABLE-DECISION-LOG.md:405-429`、
`docs/design/measurement/MEASUREMENT-DESIGN-V2.md:43-59`。

**Exact required change：**

> Authority: `docs/design/measurement/MEASUREMENT-DESIGN-V2.md`
> (P38; supersedes P32 as recorded in its §7). The v1 grids are evidence only
> and authorize no verdict. Run E0 first; fix O-32/O-33; only a passing E0
> unlocks E1/E2.

DR-25、§8 O-14 行和 Appendix B 必须采用同一状态；删除
"protocol scripts uncommitted" 的过期描述。

### 6. MAJOR — P37 的已回答状态未完整传播

**Target：** 两份 register frontmatter line 7；
`CONTEXA-DESIGN.md:61,288-292,347-348`；
`CONTEXA-IMPL.md:590-603`。

**Evidence：** O-31 已关闭，P37/P38 已登记；Q8 已选择 equivalent scheme；M4 已裁定
local-carrier-first；R-slice 在 Gate-B 后开始，见 `OPEN.md:36`、
`FABLE-DECISION-LOG.md:397-419`。

**Exact required change：**

- frontmatter 改为 `O-31 closed; all nine rulings answered in P37`；
- DR-10 改为只要求 equivalent as-of recompute path，不再保留 wire/equivalent 二选一；
- M4 改为 "last, or locally-verifiable git carriers first; GitHub/API later"；
- decision lineage 更新至 P38；
- Appendix A 统一写成
  "batch answered/closed; original questions reproduced below for audit history"。

### 7. MAJOR — R-slice acceptance 漏掉自己声明包含的 DR-27 disclosure

**Target：** `CONTEXA-IMPL.md:466,479-504`。

**Evidence：** R-slice row 包含 DR-27-disclosure，但十条 acceptance criteria 没有对应检查；
work list 与 Appendix A 明确要求 named blind spot，见 `CONTEXA-IMPL.md:545-547`。

**Exact required change：**新增：

> 11. For unresolved symbol mentions, the pre-V1 path suppresses or flags the
> affected relation, renders a named blind spot, and freezes its design and
> fixtures; durable persistence and cross-source re-resolution remain V1-gated
> (DR-27).

同时将 §10 的 DR-32 从 `serve-blocking` 更正为 `use-blocking`。

### 8. MAJOR — absolute “never egress” 与 disclosure 模型不一致

**Target：** `CONTEXA-DESIGN.md:193-199`。

**Evidence：** 同段先称 ctx 永不发送 project context，随后承认只是 no-egress-by-default；
LAW 允许显式 disclosure 下跨边界，见 `PRODUCT-DESIGN.md:125-132`。

**Exact required change：**

> No egress is the default. Local claims may cross the boundary only under
> explicit, enforced disclosure rules; network carriers remain user-credentialed
> and explicitly triggered.

### 9. MAJOR — memory/store 的 as-built 模型写错且泄漏 gated scope

**Target：** `CONTEXA-DESIGN.md:201-204,232-242`。

**Evidence：**

- "never payload copies" 忽略 memory/concepts 的批准例外；SQLite 实际物化
  `gist/detail`，见 `docs/build/MEMORY-DECISIONS.md:11-14`、
  `packages/core/src/store/migrations/001-init.sql:54-64`；
- 代码只实现 mainline + overlay，external snapshots 明确 out of scope until M4，
  见 `packages/core/src/memory/fileStore.ts:1-15,46`。

**Exact required change：**将 index-not-copy 限定为 derived/file-backed sources 和
contentless FTS；明确 memory/concepts 是可从 `.contexa` 文件重建的物化例外。
§7 改为 "two implemented event zones"；third external-snapshot zone 只能在 §8 作为
M4-gated target。

### 10. MAJOR — ranking 与 projection envelope 不符合 as-built 状态

**Target：** `CONTEXA-DESIGN.md:218-222`。

**Evidence：** 实际公式为 PPR×post-multipliers，与 lexical rank 做 RRF 后再乘 heat/authority；
实际 `SelectionEnvelope` 没有 `coverage`、per-section freshness 或
`basis`，见 `packages/core/src/select/engine.ts:69-117`、
`packages/core/src/select/types.ts:67-79`。

**Exact required change：**按当前代码重写公式和字段；如果旧 envelope 字段仍是目标，
必须明确登记为 refit/gated，不能称为 retained/as-built。

### 11. MAJOR — symbol identity 对 arity change 的描述与代码相反

**Target：** `CONTEXA-IMPL.md:185-192`。

**Evidence：** 文档称 arity change 产生新 id；实现仅在 overload collision 时使用 arity
disambiguator，见 `packages/core/src/extract/code/extract.ts:206-258`。

**Exact required change：**

> Rename changes the symbol id. Arity participates only in overload disambiguation;
> for a uniquely named symbol, an arity change preserves the id and is surfaced as
> `signature-changed`.

### 12. MAJOR — “claims/events append-only” 缺少 rebuild exception

**Target：** `CONTEXA-IMPL.md:94-104`。

**Evidence：** `resetMemoryCache()` 会删除 triggers、`memory_events`
和 memory claims，再重建 projection，见 `packages/core/src/store/store.ts:618-640`。

**Exact required change：**

> Committed markdown events are append-only durable sources. SQLite claims/events
> are append-only on normal write paths, but the rebuildable memory projection may
> be deleted and reconstructed wholesale by `resetMemoryCache()`.

"Selection reads links, never claims" 也应收窄为 traversal/ranking；conflict rendering 会解引用 claims。

### 13. MAJOR — traceability/dead-reference contract 未兑现

**Target：** 两份 register 的 code/document anchors 与 `docs/codemap/` index。

**Evidence：**

- `CONTEXA-IMPL.md:94,109,132,150,235,247,256,266,276,280,306,313,320,398,416,427,439`
  使用未落库的 A/C analyst id 作为 `[code:]`；
- `CONTEXA-DESIGN.md:356` 的 `C5-old-registers-claims.md` 与
  `CONTEXA-IMPL.md:590` 的 `DRIFT-REGISTER.md` 均不存在且从未提交；
- DR-29 的 `CONTEXA-IMPL.md:511-523` 错指当前文件；
- `docs/codemap/IMPLEMENTATION.md:1` 仍指向已不存在的当前 §9 M1-M5 和
  §12 read-back map；
- DESIGN 的 selection/ranking 指针应为 IMPL §5，extractors 应为 §3。

**Exact required change：**

- 所有 `[code:]` 只允许真实、完整的 repo-relative `path:line`；
  裁决事实改用 `[DR-NN]`；
- 将 Appendix A 说明为 landed sole copy，或归档原始 Drift Register；
- 将 C5 snapshot 归档，或改成对两份 archive 的直接 section/line mapping；
- DR-29 改指 `docs/archive/CONTEXA-IMPL-20260703.md:513-525`；
- codemap index 改指当前 §8 M-plan v2，并将 legacy read-back map 指向 archive §12
  或真正复制到 Appendix C。

### 14. MINOR — 多个 spot-check anchor/局部事实已漂移

至少修正：

- MCP version：`packages/cli/src/mcp.ts:34` → `:32`；
- push header：`block.ts:32-35` →
  `packages/core/src/push/block.ts:35-39`；
- build verdict：`summary.ts:127` → `:126`，并给 DESIGN DR-18
  补 `summary.ts:214-225`；
- `--raw stdio:inherit`：改引 `src/cli.ts:314-318` +
  `src/executor.ts:637-640`；
- usage columns：`001-init.sql:67-68` → `:62-63`；
- "vendored `.wasm`" 改为 runtime `tree-sitter-wasms` dependency；
- VS Code 不是单纯 Hook>Shim>Injection：应写 shim primary + additive hook。

## 已确认不是 finding

- DR-01、DR-06、DR-18、DR-32、DR-19 的核心代码证据均成立。
- 九个 maintainer batch item 都已在 Appendix A surfaced，且 O-31 已关闭；
  问题是裁决未传播到 operative prose，不是缺少 maintainer 决策。
- DR-14/15/16 行、原 batch 问题和 Gate-A arbitration record 可保留为明确标记的审计历史。

## Verdicts

**Gate-A-r3 = PASS（7/7；失败项：无）**

**Gate-B = FAIL**
