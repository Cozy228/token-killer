# M1 Reality Check — 存了什么 / 输入输出 / 相对 research 是否达到或超过

> 生成于 2026-07-04，针对 `feat/1.0.0` 分支的 M1 快照。所有 I/O 均在沙箱
> `CONTEXA_HOME` 下对**本仓库自身**（living acceptance fixture）实跑得到；所有对比结论由 6 个
> 子代理分别读 `packages/core/src/` 与 `.research/<project>/` 两侧真实代码产出，附 `file:line`。
>
> **本文与设计文档冲突时，以实测代码为准**——过程中证伪了设计文档 2 处「差异化」自我宣称，见 §4。

---

## 1. `sync` 到底存了什么（真实 DB，非总结）

`ctx sync` 对本仓库摄取后，`~/.contexa/projects/<shard>/store.sqlite`：

```
entities 4131   claims 5388   links 4229   conflicts 137   handles 615   memory 1

entities by kind          claims by predicate
├ doc_section 2164         ├ touches      2679   commit→file
├ file       1029          ├ co-changed   1186   file↔file 同改
├ concept     614          ├ defines       663   glossary/概念定义
├ commit      281          ├ references    376   doc→path 提及
├ decision     42          ├ renamed-to    140   文件改名链
└ memory        1          ├ stale-reason  137   失效引用
                           ├ mentions      137
                           ├ classified-as  42   ADR/decision 分类规则(带 provenance)
                           ├ frontmatter:*  14
                           └ issue-key/closes/amends …
```

**关键实证——存的是地址不是正文（index-not-copy, P25①）：**

```
doc_section.locator = {"t":"file","path":"docs/.../code-graph-design.md","span":[18,38]}
commit.locator      = {"t":"git","oid":"ab651c5c95cc540a22fa07d60235e1cd64179447"}
content_hash        = <blake2b>      # 仅存哈希做失效判断；entities 表没有 content 列
```

`links` 表结构证明每条关系都挂 provenance 回指：
```
src=commit:ecb6618f4d1a  dst=file:README.md  predicate=touches
method=structural  confidence=1.0  claim_id=1  verified_at=…  stale=0
```

所以 `sync` 存的是 **实体 + 事实(claims, append-only) + 关系(links) + 冲突 + 记忆 + 回读地址**，正文永远留在
git/文件里，serve 时才回读并按 `content_hash` 校验漂移。

### 命名
`sync` 这个动词偏弱——它做的是「摄取 + 抽取 + 增量保鲜」，不是双向同步。设计里对应的能力叫
**Refresh 保鲜**（每源增量 + 持续捕获新上下文）。建议改名 `ctx refresh` 或 `ctx ingest`。

### 后续会加的 source（M1 只落了 3 个 carrier）
设计是 **6 类内容 × 多 carrier**（carrier 缺失只降级「已披露覆盖度」，不动内容类的存在性）：

| 内容类 | M1 已做 | 后续 carrier |
|---|---|---|
| 代码结构 | ✗（**M2 最大缺口**） | tree-sitter tier-1 · SCIP `index.scip` |
| 变更历史 | ✓ 本地 git | GitHub PR/issue（凭证）|
| 决策 | ✓ ADR/design + commit msg | PR 讨论 · Jira · 会议纪要 import |
| 需求/故事 | ✗ | 本地需求文档 · Jira story |
| 领域/文档知识 | ✓ 本地 docs | Confluence import · 会议纪要 |
| 记忆/经验 | ✓ remember() | host-memory 导入（Claude/Codex/Copilot）· 人工笔记 |

网络 carrier 是**只入不出、需显式 `ctx import <carrier>` 触发、存为带日期快照**——硬不变量。

---

## 2. 每个功能的输入 → 输出（原样）

### `ctx sync`
```
输入: ctx sync
输出: ctx sync: fresh
        git: complete (behind 281, gen 1)
        docs: complete (behind 161, gen 1)
        memory: clean (behind 0, gen 0)
```

### `ctx doctor`（退出码 = 1，因未 install）
```
[PASS] node: Node 22.22.2 (require ≥22.16.0)
[PASS] sqlite: SQLite 3.51.2 (require ≥3.43.0)
[PASS] store: … schema_version 1 (current 1)
[FAIL] mcp: no .mcp.json — fix: Run `ctx install`
[FAIL] push: push block absent in: AGENTS.md, CLAUDE.md — fix: Run `ctx install`
[PASS] egress-guard: armed: no model API key in env … (若设了 ANTHROPIC/OPENAI key，ctx mcp 拒启)
```

### MCP `context` — task 模式（旗舰）
```
输入(JSON-RPC): {"method":"tools/call","params":{"name":"context",
                 "arguments":{"task":"why was the product renamed to ctx"}}}
输出: 一个 markdown 信封，分节 code / decisions / history / memory / conflicts / omitted，
     每条 "文件:行 [handle]"；预算截断，尾部 `truncated`。节选：

  # ctx · 2. Source Model (P22): Content Types × Carriers — fresh
  **`decisions`**
  Decisions FABLE-DECISION-LOG.md:11-293 [d02756]
    **P9 — Real audience = internal company adoption.** `[2026-07-02]` …
  **`history`**
  2026-07-04 @Cozy "test(core,cli): flip 1d git acceptance …" [cfcf3a]
  **`conflicts`**
  stale-suspect: CONTEXT.md — mentions GEMINI.md ↔ stale-reason never-resolved [fd3f94]
  **`omitted`**
  code 373: … (+367 more) · decisions 21 · history 94 · conflicts 104
  `truncated`: budget-capped subset — drill any [handle] for the rest
```

### MCP `context` — handle 模式（drill-down，真回读非二次摘要）
```
输入: {"name":"context","arguments":{"handle":"d02756"}}
输出: # ctx · Decisions — fresh
      Decisions FABLE-DECISION-LOG.md:11-293 [d02756]
        **P9 — Real audience = internal company adoption.** `[2026-07-02]` Target = promotion/adoption
```
`budget:"wide"` 时会带**编号源码行**摊开 ADR 正文（如 `238⇥ ## 10. Forks — RESOLVED`），
证明预算分档 + read-through 工作正常。

### MCP `search`
```
输入: {"name":"search","arguments":{"query":"RRF reciprocal rank fusion"}}
输出: # ctx · search: RRF reciprocal rank fusion — fresh
  **`matches`**
  6. Selection Engine (`core/src/select/`) CONTEXA-IMPL.md:312-358 [d281f3]
  Staged ranking pipeline (lexical→anchors→expand→resolve→PPR), not … RRF fusion
      docs/adr/0025-staged-ranking-pipeline.md:1-48 [a0adc2]
  …
  **`omitted`** 92: … `truncated`: ranked past the render cap — drill any [handle]
```

### `ctx remember`（正常 / 超长）
```
输入: ctx remember "context() is the single entry point; drill via handle" --anchor file:CONTEXA-IMPL.md
输出: remembered [m2c69a] — context() is the single entry point; drill via handle
        anchors: file:CONTEXA-IMPL.md

输入: ctx remember <300 字>
输出: The note is 300 chars; a memory gist is capped at 240. Split it: keep a ≤240-char
      summary as the note and move the rest into `detail`.     ← 不抛异常、不落盘（A2）
```
> MCP 侧参数名是 `note`（传 `gist` → `error: note is required`，工具用错误信息自证契约）。

### `ctx memory` / `ctx recall`
```
ctx memory  → [m2c69a] active · confirmed · context() is the single entry point; drill via handle
ctx recall m2c69a → context() is the single entry point; drill via handle     ← handle 往返
```

### `ctx push --dry-run`
```
输出:
  <!-- ctx:managed:begin -->
  This project has a ctx context base (code, decisions, history, memory — with provenance).
  Start tasks with the `context` MCP tool; drill down by passing back any [handle].
  Gotchas:
  ⚠ context() is the single entry point; drill via handle [m2c69a]
  <!-- ctx:managed:end -->
    would write AGENTS.md (updated, 2733 bytes) / CLAUDE.md (updated, 322 bytes)
  block: 301 bytes, 1 gotcha(s)          ← ≤1KB，dry-run 不落盘
```

---

## 3. 关键实现（真实代码，非描述）

### push：预算按构造收敛 + openwiki no-op 守卫 + veto 优先
`packages/core/src/push/block.ts:85` `renderPushBlock()` —— 逐条试算，超预算**在写入前停**，
所以 ≤1KB 对任意记忆集合「by construction」成立：
```ts
for (const g of capped) {
  const trial = assemble(HEADER_LINES, [...bodyLines, gotchaLine(g)]);
  if (byteLen(trial) > PUSH_MAX_BYTES) { truncated = true; break; } // 预算赢，其余丢弃
  bodyLines.push(gotchaLine(g)); rendered.push(g);
}
```
`packages/core/src/push/push.ts:104` `runPush()` —— digest 级 no-op（git hook 用）：
```ts
const sha = blake2bHex(block.text);
if (opts.ifChanged && store.getMeta(PUSH_SHA_META) === sha)
  return { skipped: true, ... };            // 摘要未变 → 连文件都不碰（openwiki 快照模式）
```
`packages/core/src/push/rank.ts:53` `rankGotchas()` —— **复用 selection 的排序原语**
（`authorityBoost × timeDecay`），veto 先解析、pin 若也被 veto 则跳过（**veto 赢**），
保证 push 和 pull 排的是同一个「值得注意」。

其余各功能的关键函数（供审阅定位）：
- 选择管线 5 段：`select/engine.ts` `select()`/`search()` → seeds `select/seeds.ts` → 子图
  `select/subgraph.ts` → PPR `select/ppr.ts`（α=0.25, 25 iter, 移植 codegraph 常量）→ 分节/预算
  `select/sections.ts`（边际效用借用）→ 投影 `select/project.ts`。
- 服务面：`serve/serve.ts` `serveContext` → `serve/render.ts`（固定 `SECTION_ORDER`，空节省略，
  24K 硬顶 `MAX_RESPONSE_CHARS`，unknown-ref 等走 success-shaped guidance 非 `isError`）。
- git 摄取：`ingest/git/adapter.ts`（commit-as-entity + touches/renamed-to/trailer）、
  `ingest/git/cochange.ts`（500 提交窗口, support≥3）、`ingest/refresh.ts`（cheapest-first + 3s
  catch-up gate + 单写者 lease）。
- docs 抽取：`extract/markdown.ts`（heading 树/frontmatter/glossary/mention，纯函数无 I/O）+
  `ingest/docs.ts`（`classifyDoc` 4 级分类带 provenance，`git ls-files` 尊重 .gitignore）。
- store：`store/store.ts`（generations 原子发布 / 30s CAS lease / handle collision-bump）、
  `ingest/readthrough.ts`（read-through + realpath 防符号链接逃逸）。

---

## 4. 相对 research 项目：达到 / 超过？（6 路对比，逐维带证据）

> 立场（沿用 Absorption Register）：所有参考代码是 reference 不是 gold standard。下表每格由
> 子代理读两侧真实代码判定。**MEETS**=打平，**EXCEEDS**=更强，**BELOW**=更弱，**UNIQUE**=参考侧完全没有。

### 总览计分卡

| 功能 | 净判定 | 一句话 |
|---|---|---|
| **docs/decisions 抽取** | **EXCEEDS / 多项 UNIQUE** | 最强项。frontmatter/ADR 分类/glossary/stale 检测参考侧全无；结构抽取打平唯一的确定性同类 gitnexus，交叉引用更强 |
| **git 摄取 + co-change** | **EXCEEDS（差异点成立）** | commit-as-entity / co-change / rename-chain 三个参考项目全无；借用的机制（rev-list、256MiB buffer、3s gate）打平或更稳 |
| **store（generations/lease/handles）** | **EXCEEDS / UNIQUE** | 原子发布、CAS+TTL lease、collision-bump handle 四参考全无；path-safety 在 UA 基础上加了 realpath 更硬 |
| **push + memory** | **EXCEEDS 成熟度，但类别非独有** | ⚠ 见下方证伪 |
| **selection/服务机制** | **MEETS/EXCEEDS**（机制）/ **BELOW**（代码理解） | PPR 核心逐常量移植；分节契约+边际效用借用更干净；但 M1 无代码符号，`code` 段=整文件读盘 |
| **search 检索** | **MEETS/EXCEEDS 局部 / BELOW（bm25 加权）** | force-include 更强、跨源索引 UNIQUE；但 FTS 用默认等权 bm25，弱于两个参考的 name 列加权 |

### ⚠ 证伪：设计文档 2 处「validation-by-absence」宣称不成立
子代理读真代码发现，设计文档把下面两条列为「参考项目全无的差异点」，**实际都有粗糙版**：

1. **「没有参考项目往 agent 配置注入上下文块」→ 假。**
   `.research/codegraph` 的 installer 今天就往 `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` 注入
   `<!-- CODEGRAPH_START -->…<!-- CODEGRAPH_END -->` 标记块（`targets/shared.ts`
   `upsertInstructionsEntry`/`replaceOrAppendMarkedSection`，4 个 target 都调用），同样有 byte-equal
   幂等 no-op。**区别**：codegraph 注入的是**静态样板**；ctx 是**排序+预算+pin/veto 的动态摘要**。
   （`davia` 也有更粗的整文件覆盖版。）
2. **「没有参考项目有可 supersede 的持久记忆」→ 假。**
   `.research/tree-sitter-analyzer/decision_journal.py` 就是 SQLite 持久 + `supersede(old,new)`
   （旧行保留只改 `superseded_by`）。**区别**：ctx 的 anchors 落成图里的 claim/link，且有三态
   生命周期（active/retired/needs-review）；对方是扁平字符串字段 + 仅 supersede、无独立生命周期。

**结论应改措辞**：不是「别人没有」，而是「**别人有粗糙版，ctx 是更成熟版**」。这更诚实也更稳。

### 逐功能要点

**docs/decisions 抽取（最强）** — 唯一的确定性同类是 gitnexus（`markdown-processor.ts` 只有
heading 树 + markdown 链接 → 结构抽取 MEETS、交叉引用 EXCEEDS）。5 个 wiki 生成器
（deepwiki-open/opendeepwiki/codewiki/repodoc/repoagent）**全是 LLM 生成 prose，无任何结构抽取**。
frontmatter / ADR 分类带 provenance / P20·P27 glossary / reason 分类的 stale-suspect —— 参考全集缺席。

**git 摄取** — 三个参考只把 git 当**变更检测**（gitnexus/codegraph 的 `rev-list --count`、fs-hash
reconcile）或 **hook 触发器**（codegraph 装 post-commit 后台 resync）；**没有一个把 commit 历史当
被摄取内容**（"co-change"/"cochange" 在三个仓库零命中）。ctx 借用的都带出处注释且更稳：history-rewrite
坏 revision 会**从根重走**，而 gitnexus 把所有错误吞成 `{isStale:false}`。

**store** — generations 原子发布、CAS+TTL 可偷 lease、collision-bump handle 四参考全无。
反面教材：codegraph 的 node id **把行号编进身份**（`sha256(filePath:kind:name:line)`），上方插一空行就给
下面每个符号换 id——正是设计说的「graph 工具把身份搞错」的实证；graphify 的 `dedup.py` 遇 id 冲突
**静默丢第二个节点**（真数据丢失）。ctx 的 path-safety 是 UA `readSourceFile` 的超集（多了 realpath 符号链接逃逸检查）。

**push + memory** — 成熟度维度全面 EXCEEDS（预算 by-construction、图锚定 provenance、三态生命周期），
但**类别本身**已存在于参考（见证伪）。openwiki 的 no-op 是**整目录 SHA 只守元数据写**，ctx 多了一层更便宜的
预写 digest 比对。

**selection/服务** — PPR 核心（α=0.25/25 迭代/dangling 保质量）**逐常量**移植自 codegraph 且单测锁定
确定性；分节契约（固定 `SECTION_ORDER`、空节省略、每个省略项都有 drill handle）比 codegraph 的
文件聚类、repomaster 的线性加权更结构化。**弱点**：codegraph 的**逐文件**新鲜度（带 ms 级 edit age）比
ctx 的**源级**粗标签（`fresh`/`reconciling`）细；codegraph 预算随 repo 规模自适应（13K→24K），ctx 是固定
lean/wide 档。

**search** — tokenization/stemming/stopword/named-seed 近乎逐行对齐 codegraph `query-utils.ts`；
RRF 公式（含 K=60）忠实复刻 gitnexus。**两个真实短板**：
- `search()` 入口的合成分是**乘法式**（lexical × post-multipliers × heat），**不是** RRF——RRF 只在
  `select()` 里用；
- 全库 `grep "bm25("` **零命中**，FTS 用默认等权 bm25，而 codegraph `bm25(…,0,20,5,1,2)`、
  tree-sitter-analyzer `bm25(…,10,0.5,0.5,0.1)` 都把 name 列压到 body 的 10–20 倍。**这维 BELOW，且可修。**

**独有优势（跨源）**：ctx 用**一张 contentless FTS 表**索引全部实体类
（code/commit/decision/doc_section/memory…），一次 `search()` 跨代码+git 历史+文档+记忆；
gitnexus/codegraph/tree-sitter-analyzer 都**只索引代码符号**。这是 ctx 对三者真正的结构性领先。

---

## 5. 第三点：当前可判断的粗糙处（全部附实测证据）

均来自真实运行/真实代码，供你判断是否要在 M1 内修：

**① 「why 类」问题 seed 被代码淹没。** `context(task:"why was the product renamed to ctx")` 返回分节
计数 `code 373 · decisions 21 · history 94`，`code` 排在 `decisions` 前、lead 是一个 doc_section 而非任何
决策。根因：**意图分类（why→decisions 优先）没接进 seed 选择**，seeds 被 "ctx"/"renamed" 的代码 FTS 命中带偏。
（ADR 0025 说词法本应只做 seed 入口、不与 PPR 并列——架构对，但「why 意图下调纯词法代码命中」这层没加。）

**② 代码片段预览 = 文件首行，信息量≈0。** 同一输出里 `code` 段几乎每条预览都是 `/**`（TS 文件首行=注释起始符）。
**根因已定位**：M1 无代码符号摄取（§4 selection：grep 证实无 adapter 产出 `symbol`/`module`），
`code` 段=整文件读盘、skeleton=文件首个非空行。所以①②其实同源——都指向 M2 的代码符号缺口。

**③ ref 短 oid 覆盖有边界。** `context(ref:"commit:12dc674")` 未命中，回退候选引导（行为正确、G-3 达标），
但 ref 解析没覆盖 commit 短哈希（只认全 id / handle / task）。

**④ search 词法层无 name 加权**（§4 search，BELOW，可修）：加一个 `bm25(fts, name_w, text_w, …)` 即可
让 name 命中显著高于 body 命中，无需动架构。

**⑤ 新鲜度粒度粗**（§4 selection）：源级 `fresh`/`reconciling` vs codegraph 逐文件 ms 级 age——是否要在
M1 补，取决于产品要不要向用户暴露「哪个文件正在重建」。

> ①②建议合并成一个 M2 前置项：代码符号摄取一旦落地，`code` 段质量、skeleton、以及 why 类意图的
> seed 平衡会同时改善。③④是 M1 内低成本可修的独立小项。
