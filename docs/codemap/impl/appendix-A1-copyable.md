# 附录 A1：PageRank / SCIP / gitnexus 可抄实现(2026-06-20 追加)

> 因用户拍板 PageRank+SCIP 为 Required 能力、且 license 自用放宽,本附录补齐需求 A/D 的 copyable 代码,并给出 gitnexus 可抄清单(全部标 `[非分发安全]`,供将来若分发时重写)。

### 需求 A — 个性化 PageRank 排序（Personalized PageRank over the codemap）

**决策回指**：需求 A（ranking，Required, default on）。在 `nodes`/`edges` 属性图上跑一次纯 TS 的幂迭代 PageRank（无 networkx、无 Python 运行时），用 query 命中的 FTS 符号/文件构造 personalization 向量，把"最中心 + 与当前查询最相关"的代码节点排在前面，同时喂给 G（agent 的 buildContext 字符预算排序）和 H（human 的 repo-map / overview）。

---

#### 1. 算法平实解释

PageRank 把图看成"随机游走的访问概率"：一个 surfer 沿出边随机跳转，落在某节点的稳态概率就是它的排名。在代码图里，被很多地方引用/调用的定义（被指向多）会积累高分，于是"中心代码"自然浮到前面。

三个关键改造让它服务 tk：

1. **个性化（personalization / teleport 偏置）**：标准 PageRank 在 surfer "瞬移"时均匀落到所有节点（概率 `1/N`）。个性化把瞬移质量偏向一组种子节点——这里是 query 经 FTS5 命中的符号/文件。效果是排名不再是"全局最重要"，而是"对当前问题最重要"。这正是 aider 用 chat 文件 + 被提及标识符做种子、tk 用 FTS 命中做种子的核心。
2. **边的方向 = 引用者 → 定义者**（aider 的约定）：边从"用到符号的文件"指向"定义符号的文件"，于是 rank 流向定义，定义越被依赖分越高。tk 的 `edges` 表里 `calls`/`references` 天然就是 caller→callee / referencer→definer 方向，直接对应。
3. **rank 分发技巧（aider 独有）**：节点拿到分后，aider 不直接用节点分，而是把每个源节点的 rank 按出边权重比例**分发到各条出边**，累加到 `(定义文件, 标识符)` 上，从而得到**定义级**（而非文件级）排名。tk 因为图节点本身就是符号级（function/class 节点都带 `file_path/start_line`），可以直接用节点分，但在"文件含多个符号、想按某符号定向"时仍可借用分发思路（见 §3 tk 适配）。

阻尼系数 `damping=0.85`：surfer 有 85% 概率沿边走、15% 概率瞬移（瞬移按 personalization 分布）。`dangling` 节点（无出边的定义，如叶子函数）的质量也按 personalization 重新分配，避免概率泄漏。

---

#### 2. 可抄代码（verbatim，permissive 源，常规署名）

##### 2a. aider `get_ranked_tags` 核心（Apache-2.0，常规署名）

> Attribution: Aider (Aider-AI/aider), licensed under Apache License 2.0. © Paul Gauthier and aider contributors. 源经 WebFetch 于 https://raw.githubusercontent.com/Aider-AI/aider/main/aider/repomap.py 确认（main 分支，2026-06-20）。以下为 `RepoMap.get_ranked_tags` 节选，VERBATIM。

**个性化向量构造（teleport 偏置）** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        # Default personalization for unspecified files is 1/num_nodes
        # https://networkx.org/documentation/stable/_modules/networkx/algorithms/link_analysis/pagerank_alg.html#pagerank
        personalize = 100 / len(fnames)
        ...
            rel_fname = self.get_rel_fname(fname)
            current_pers = 0.0  # Start with 0 personalization score

            if fname in chat_fnames:
                current_pers += personalize
                chat_rel_fnames.add(rel_fname)

            if rel_fname in mentioned_fnames:
                # Use max to avoid double counting if in chat_fnames and mentioned_fnames
                current_pers = max(current_pers, personalize)

            # Check path components against mentioned_idents
            path_obj = Path(rel_fname)
            path_components = set(path_obj.parts)
            basename_with_ext = path_obj.name
            basename_without_ext, _ = os.path.splitext(basename_with_ext)
            components_to_check = path_components.union({basename_with_ext, basename_without_ext})

            matched_idents = components_to_check.intersection(mentioned_idents)
            if matched_idents:
                # Add personalization *once* if any path component matches a mentioned ident
                current_pers += personalize

            if current_pers > 0:
                personalization[rel_fname] = current_pers  # Assign the final calculated value
```

**边构造（referencer → definer，含权重 mul）** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        for ident in idents:
            definers = defines[ident]
            mul = 1.0

            is_snake = ("_" in ident) and any(c.isalpha() for c in ident)
            is_kebab = ("-" in ident) and any(c.isalpha() for c in ident)
            is_camel = any(c.isupper() for c in ident) and any(c.islower() for c in ident)
            if ident in mentioned_idents:
                mul *= 10
            if (is_snake or is_kebab or is_camel) and len(ident) >= 8:
                mul *= 10
            if ident.startswith("_"):
                mul *= 0.1
            if len(defines[ident]) > 5:
                mul *= 0.1

            for referencer, num_refs in Counter(references[ident]).items():
                for definer in definers:
                    use_mul = mul
                    if referencer in chat_rel_fnames:
                        use_mul *= 50
                    # scale down so high freq (low value) mentions don't dominate
                    num_refs = math.sqrt(num_refs)
                    G.add_edge(referencer, definer, weight=use_mul * num_refs, ident=ident)
```

**pagerank 调用 + dangling 用同一个 personalization** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        if personalization:
            pers_args = dict(personalization=personalization, dangling=personalization)
        else:
            pers_args = dict()

        try:
            ranked = nx.pagerank(G, weight="weight", **pers_args)
        except ZeroDivisionError:
            try:
                ranked = nx.pagerank(G, weight="weight")
            except ZeroDivisionError:
                return []
```

**rank 分发技巧（按出边权重比例把节点分摊到定义）** 源: `aider/repomap.py` `get_ranked_tags`：

```python
        # distribute the rank from each source node, across all of its out edges
        ranked_definitions = defaultdict(float)
        for src in G.nodes:
            src_rank = ranked[src]
            total_weight = sum(data["weight"] for _src, _dst, data in G.out_edges(src, data=True))
            for _src, dst, data in G.out_edges(src, data=True):
                data["rank"] = src_rank * data["weight"] / total_weight
                ident = data["ident"]
                ranked_definitions[(dst, ident)] += data["rank"]
```

##### 2b. tree-sitter-analyzer 纯 Python 幂迭代（MIT，常规署名）

> Attribution: tree-sitter-analyzer (aisheng.yu), MIT License © 2024-2025. 源: `/tmp/tk-research/tree-sitter-analyzer/tree_sitter_analyzer/mcp/utils/project_index/_pagerank.py`（本地 clone，已确认存在）。这是无外部依赖的幂迭代参考，tk 的 TS 版直接对照它。VERBATIM 节选：

源: `_pagerank.py:72-123` `_pagerank_iterate` + `_pagerank_step`：

```python
def _pagerank_iterate(out_edges, node_list, alpha, max_iter):
    n = len(node_list)
    scores = dict.fromkeys(node_list, 1.0 / n)
    dangling = {nd for nd in node_list if nd not in out_edges}
    for _ in range(max_iter):
        new_scores = _pagerank_step(scores, node_list, out_edges, dangling, alpha, n)
        err = sum(abs(new_scores[nd] - scores[nd]) for nd in node_list)
        scores = new_scores
        if err < 1.0e-6 * n:
            break
    return scores

def _pagerank_step(scores, node_list, out_edges, dangling, alpha, n):
    new_scores = {}
    dangling_sum = alpha * sum(scores[nd] for nd in dangling) / n
    base = (1.0 - alpha) / n + dangling_sum
    for nd in node_list:
        new_scores[nd] = base
    for src, dsts in out_edges.items():
        contrib = alpha * scores[src] / len(dsts)
        for dst in dsts:
            new_scores[dst] = new_scores.get(dst, 0.0) + contrib
    return new_scores
```

> 注意：此参考是 **unweighted + uniform teleport**（`base = (1-alpha)/n`）。tk 版本在它基础上加两点：(a) 边权重（aider 的 mul/sqrt 思路）；(b) personalization 替换 uniform `1/n`。repomaster 的 `importance_analyzer.py`（MIT，源: `/tmp/tk-research/repomaster/src/core/importance_analyzer.py:203-208`）展示了 personalization 的另一种写法 `personalization={n: 2.0 if n == module_id else 1.0 ...}`（单节点偏置 + amplify ×10），tk 不直接抄它（它依赖 networkx 且把 PageRank 只当综合分的一项），仅作"personalization 也可单点偏置"的旁证。

---

#### 3. tk 适配：纯 TS、读 node:sqlite 的 `edges` 表

**插入点**：`需求 A` 排序服务。输出 `Map<nodeId, number>`（rank），供 (G) `buildContext` 的自适应字符预算排序（高 rank 节点优先占预算）和 (H) repo-map/overview（取 top-N 作为骨架）。query 来时先用 FTS5 命中得到种子集，构造 personalization，再跑一次幂迭代。

**SQL：拉边（kinds = calls / references / contains）** —— 把 `edges` 折叠成带权稀疏图。`contains` 给低权（结构边，避免父子关系压过真实调用）：

```sql
-- edges 表: (kind TEXT, src INTEGER, dst INTEGER, ...)
-- 取参与排序的三类边，按 (src,dst) 聚合出权重
SELECT src, dst,
       SUM(CASE kind
             WHEN 'calls'      THEN 1.0
             WHEN 'references' THEN 1.0
             WHEN 'contains'   THEN 0.25
           END) AS w
FROM edges
WHERE kind IN ('calls','references','contains')
GROUP BY src, dst;
```

**SQL：FTS5 命中 → 种子节点（personalization 的来源）** —— 假设 `nodes_fts` 是对 `nodes(name, file_path)` 建的 FTS5 虚表：

```sql
-- :q 是用户 query 经 tokenize 后的 FTS MATCH 串
SELECT n.id AS node_id
FROM nodes_fts f
JOIN nodes n ON n.rowid = f.rowid
WHERE nodes_fts MATCH :q
ORDER BY bm25(nodes_fts)
LIMIT 50;
```

**TS 幂迭代（pure TS over rows，对照 §2b，加权重 + personalization + dangling）** —— 已改写自 tree-sitter-analyzer `_pagerank_iterate`/`_pagerank_step`（MIT），并入 aider 的加权与个性化思路（Apache-2.0）：

```ts
// src/graph/pagerank.ts — zero-dependency, pure TS over edge rows.
// 已改写自 tree-sitter-analyzer _pagerank.py (MIT) + aider repomap.py 个性化/加权 (Apache-2.0)
export interface Edge { src: number; dst: number; w: number; }

export interface PageRankOpts {
  damping?: number;   // 0.85
  tol?: number;       // 1e-4 (L1, 不缩放 n)
  maxIter?: number;   // 100
  personalization?: Map<number, number>; // 种子 -> 偏置质量(未归一也可)
}

export function pageRank(
  nodeIds: number[],
  edges: Edge[],
  opts: PageRankOpts = {},
): Map<number, number> {
  const damping = opts.damping ?? 0.85;
  const tol = opts.tol ?? 1e-4;
  const maxIter = opts.maxIter ?? 100;
  const N = nodeIds.length;
  if (N === 0) return new Map();

  // index 化，O(1) 查找
  const idx = new Map<number, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));

  // 出边邻接 + 每节点出权重和（加权 dangling 判定）
  const outDst: number[][] = Array.from({ length: N }, () => []);
  const outW: number[][] = Array.from({ length: N }, () => []);
  const outSum = new Float64Array(N);
  for (const e of edges) {
    const s = idx.get(e.src), d = idx.get(e.dst);
    if (s === undefined || d === undefined || e.w <= 0) continue;
    outDst[s].push(d);
    outW[s].push(e.w);
    outSum[s] += e.w;
  }

  // personalization 向量 p[]（归一到和为 1）；无种子 -> 均匀 1/N
  const p = new Float64Array(N);
  let pMass = 0;
  if (opts.personalization && opts.personalization.size > 0) {
    for (const [id, mass] of opts.personalization) {
      const i = idx.get(id);
      if (i !== undefined && mass > 0) { p[i] += mass; pMass += mass; }
    }
  }
  if (pMass > 0) { for (let i = 0; i < N; i++) p[i] /= pMass; }
  else { for (let i = 0; i < N; i++) p[i] = 1 / N; pMass = 1; }

  // 初始分布 = personalization（aider 同款：起点即偏置）
  let r = Float64Array.from(p);
  const next = new Float64Array(N);

  for (let it = 0; it < maxIter; it++) {
    // dangling 质量（无出边节点）按 personalization 再分配 —— aider dangling=personalization
    let danglingMass = 0;
    for (let i = 0; i < N; i++) if (outSum[i] === 0) danglingMass += r[i];

    // base = teleport(1-d) 偏 p + dangling 偏 p
    const teleport = (1 - damping) + damping * danglingMass; // 乘到 p[i]
    for (let i = 0; i < N; i++) next[i] = teleport * p[i];

    // 沿加权出边推送
    for (let s = 0; s < N; s++) {
      const sum = outSum[s];
      if (sum === 0) continue;
      const share = damping * r[s] / sum;
      const dsts = outDst[s], ws = outW[s];
      for (let k = 0; k < dsts.length; k++) next[dsts[k]] += share * ws[k];
    }

    // L1 收敛
    let err = 0;
    for (let i = 0; i < N; i++) { err += Math.abs(next[i] - r[i]); r[i] = next[i]; }
    if (err < tol) break;
  }

  const out = new Map<number, number>();
  nodeIds.forEach((id, i) => out.set(id, r[i]));
  return out;
}
```

**喂给 G / H**：
- **G（buildContext）**：候选节点集（FTS 命中 + 其 n-hop 邻居）按 `rank` 降序填字符预算，预算用完即停——高中心度定义先进上下文。
- **H（repo-map/overview）**：全局跑一次（无 query 时 personalization 为空 → 退化成均匀 teleport 的标准 PageRank），取 top-N 节点的 `file_path:start_line` 作为仓库骨架。

---

#### 4. 具体数值（阈值）

| 参数 | 值 | 来源/依据 |
|---|---|---|
| `damping` (alpha) | **0.85** | aider/tsa/repomaster 三源一致 |
| `tol` (L1) | **1e-4** | 任务指定；比 tsa 的 `1e-6*n` 宽松，提前收敛省迭代 |
| `maxIter` | **100** | tsa `_pagerank.py:23` 默认 |
| personalization 单种子质量 | `100 / |seeds|`（归一前），实现里再统一归一到和=1 | aider `personalize = 100/len(fnames)` |
| `calls`/`references` 边权 | **1.0** | 真实数据流边 |
| `contains` 边权 | **0.25** | 结构边降权，避免父子压过调用 |
| `num_refs` 缩放 | `sqrt(num_refs)`（如在 src→dst 聚合时累计引用次数）| aider「high freq mentions 不主导」|
| FTS 种子 LIMIT | **50** | 控 personalization 规模 |

---

#### 5. 有序步骤

1. `src/graph/pagerank.ts`：实现 §3 的 `pageRank()`（纯 TS，零依赖）。
2. `src/graph/rankEdges.ts`：执行 §3 的 edges SQL（`node:sqlite` prepared statement），返回 `Edge[]`；`contains` 折 0.25 权。
3. `src/graph/seeds.ts`：执行 FTS5 MATCH SQL，得到种子 `node_id[]`，构造 `personalization: Map(node_id -> 100)`（同质量，交给 pageRank 内部归一）。无 query 时返回空 Map（→ 全局 PageRank for H）。
4. `src/graph/rankService.ts`：拉全部 `nodeIds`（`SELECT id FROM nodes`）+ edges + seeds，调 `pageRank`，缓存结果（key = graph 版本 + query 指纹）。
5. G 侧 buildContext 接 `rank` 做预算排序；H 侧 overview 接 top-N。
6. 默认 ON：无 `--no-rank` 时即走此路径（需求 A 约定）。

---

#### 6. 单元测试（已知排名的小图）

构造一个"中心节点 D 被三处引用"的图，断言 D 排名最高；再加 personalization 偏向 A，断言 A 跃升。

```ts
// tests/graph/pagerank.test.ts
import { describe, it, expect } from "vitest";
import { pageRank, type Edge } from "../../src/graph/pagerank";

describe("pageRank", () => {
  // 图: A->D, B->D, C->D, A->B  (D 被 3 个引用 => 最中心)
  const nodes = [1, 2, 3, 4]; // A=1 B=2 C=3 D=4
  const edges: Edge[] = [
    { src: 1, dst: 4, w: 1 },
    { src: 2, dst: 4, w: 1 },
    { src: 3, dst: 4, w: 1 },
    { src: 1, dst: 2, w: 1 },
  ];

  it("ranks the most-referenced node (D) highest", () => {
    const r = pageRank(nodes, edges, { damping: 0.85, tol: 1e-4, maxIter: 100 });
    const top = [...r.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe(4); // D
    // 和应 ~= 1 (概率分布)
    const sum = [...r.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("personalization toward A lifts A's rank vs uniform", () => {
    const base = pageRank(nodes, edges, {});
    const pers = pageRank(nodes, edges, {
      personalization: new Map([[1, 100]]), // 种子 = A
    });
    expect(pers.get(1)!).toBeGreaterThan(base.get(1)!);
  });

  it("handles dangling nodes without leaking mass", () => {
    // D 无出边(dangling); 质量经 dangling 再分配, 总和仍 ~=1
    const r = pageRank(nodes, edges, {});
    const sum = [...r.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("empty graph returns empty map", () => {
    expect(pageRank([], []).size).toBe(0);
  });
});
```

**测试要点**：(1) 收敛后概率和 ≈ 1（dangling 再分配正确，无质量泄漏）；(2) 个性化确实抬升种子排名；(3) 加权 + 空图边界。手算交叉验证：3-入边的 D 在 damping=0.85 下 rank 应约 0.35–0.40，远高于其余节点（可加 `toBeGreaterThan(0.3)` 收紧）。

---

### D.SCIP — 可选的编译器级精度路线(检测则用,缺失则静默回退 tree-sitter)

**决策回指**:用户 2026-06-20 承诺 SCIP 为 Required 能力（其运行时依赖 SCIP 索引器为 Optional at runtime）——探测 PATH 上的 per-language SCIP 索引器,有则跑、消费 `index.scip`、产出 `provenance='scip'` 的高置信调用边并在冲突时压过 tree-sitter 启发式边(接 J trust enum);无则静默回退 tree-sitter,绝不强装,保 Windows 零安装。服务 need D(调用图)+ need J(provenance/可信度排序)。

---

#### 1. 跨平台索引器检测(REUSE tk 自带的 PATHEXT-aware which)

tk 已有一个零依赖、Windows PATHEXT-aware、永不抛错的 `defaultWhich`,直接复用——它正是"hook/tool 实际解析二进制"的同一套走法。**VERBATIM 引用**:

```ts
// 源: /Users/ziyu/Workspace/token-killer/src/shim/preflight.ts:156-180 (VERBATIM, tk 自有代码 = 许可permissive)
function defaultWhich(
  program: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = fsExistsSync,
): string | null {
  try {
    const pathValue = env.PATH ?? env.Path ?? "";
    if (!pathValue) return null;
    const dirs = pathValue.split(delimiter).filter((d) => d.length > 0);
    const exts =
      platform === "win32"
        ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((e) => e.length > 0)
        : [""];
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = join(dir, `${program}${ext}`);
        if (exists(candidate)) return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

在其上建一个 per-language 索引器登记表 + 探测。`scip-typescript`/`scip-python` 是 npm 全局包(在 Windows 上落地为 `scip-typescript.cmd`,所以必须走 PATHEXT);`scip-go`/`scip-clang`/`rust-analyzer` 是原生 exe。**需实现时补**(tk 自有新代码,无逐字来源,但 `defaultWhich` 是真实复用):

```ts
// 需实现时补 (tk 新代码;复用上面 VERBATIM 的 defaultWhich,逻辑直接 = preflight.ts 已验证的 PATHEXT 走法)
interface ScipIndexer {
  lang: string;            // tree-sitter 语言名,用于只在该语言文件上覆盖
  bin: string;            // PATH 上探测的命令名(无扩展名,PATHEXT 由 defaultWhich 补)
  indexArgs: string[];    // 默认产出 ./index.scip 的调用参数
  // rust-analyzer 需显式 --output;其它默认写 cwd/index.scip
}

const SCIP_INDEXERS: ScipIndexer[] = [
  { lang: "typescript", bin: "scip-typescript", indexArgs: ["index"] },
  { lang: "javascript", bin: "scip-typescript", indexArgs: ["index"] },
  { lang: "python",     bin: "scip-python",     indexArgs: ["index"] },
  { lang: "java",       bin: "scip-java",       indexArgs: ["index"] },
  { lang: "go",         bin: "scip-go",         indexArgs: [] },        // 默认写 index.scip
  { lang: "c",          bin: "scip-clang",      indexArgs: [] },
  { lang: "cpp",        bin: "scip-clang",      indexArgs: [] },
  { lang: "rust",       bin: "rust-analyzer",   indexArgs: ["scip", "."] }, // 写 index.scip
];

// 探测:对一个仓库里实际出现过的语言集合,挑出 PATH 上存在的索引器。永不抛错。
function detectScipIndexers(presentLangs: Set<string>): ScipIndexer[] {
  return SCIP_INDEXERS.filter(
    (ix) => presentLangs.has(ix.lang) && defaultWhich(ix.bin) !== null,
  );
}
```

> CLI 事实(已核对):`npm install -g @sourcegraph/scip-typescript` 后命令为 **`scip-typescript index`**(源: https://github.com/sourcegraph/scip-typescript README, VERBATIM 引用上方 WebFetch);`rust-analyzer scip .` 产出 SCIP(源: rust-analyzer 文档,需实现时补确认 flag);默认产物文件名 `index.scip` 为 SCIP CLI 约定(源: sourcegraph/scip 约定 + graphify 测试 fixture)。各 `scip-go`/`scip-clang` 的精确默认参数 **需实现时补**(以各仓 README 为准)。

#### 2. 调用索引器(spawn + 超时 + 定位 index.scip)

复用 tk 已验证的 spawn+timeout 形态(`runPreflightCommandAsync` 源: preflight.ts:97-136 是同一模式:`shell: win32`、计时器 kill、永不 reject)。索引运行重,超时给 **120000ms**:

```ts
// 需实现时补 (tk 新代码;spawn+timeout 形态 已改写自 preflight.ts:97-136 runPreflightCommandAsync)
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

const SCIP_RUN_TIMEOUT_MS = 120000; // 索引器跑全仓,重
// (探测 which 不 spawn → 不需要 2000ms 探测超时;若改用 `--version` 探测则用 PROBE_TIMEOUT=2000ms)

async function runScipIndexer(ix: ScipIndexer, cwd: string): Promise<string | null> {
  const ran = await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const child = spawn(ix.bin, ix.indexArgs, {
        cwd,
        shell: process.platform === "win32", // PATHEXT 解析 .cmd —— 同 preflight.ts:108
      });
      const timer = setTimeout(() => { try { child.kill(); } catch {} done(false); },
        SCIP_RUN_TIMEOUT_MS);
      child.on("error", () => { clearTimeout(timer); done(false); });
      child.on("close", (code) => { clearTimeout(timer); done(code === 0); });
    } catch { done(false); }
  });
  if (!ran) return null;
  const out = join(cwd, "index.scip");      // SCIP CLI 默认产物
  return existsSync(out) ? out : null;       // 定位失败 → null → 静默回退
}
```

#### 3. 消费 index.scip(protobuf 解码 + 映射为 tk 边)

**官方 SCIP schema(已核对,源: https://github.com/sourcegraph/scip/blob/main/scip.proto, VERBATIM 引用上方 WebFetch)**:

```protobuf
message Index    { Metadata metadata = 1; repeated Document documents = 2;
                   repeated SymbolInformation external_symbols = 3; }
message Document { string relative_path = 1; repeated Occurrence occurrences = 2;
                   repeated SymbolInformation symbols = 3; string language = 4; }
message Occurrence { repeated int32 range = 1; string symbol = 2; int32 symbol_roles = 3; ... }
message SymbolInformation { string symbol = 1; repeated string documentation = 3;
                            repeated Relationship relationships = 4; Kind kind = 5; }
message Relationship { string symbol = 1; bool is_reference = 2; bool is_implementation = 3;
                       bool is_type_definition = 4; bool is_definition = 5; }
enum SymbolRole { Definition = 0x1; Import = 0x2; WriteAccess = 0x4; ReadAccess = 0x8;
                  Generated = 0x10; Test = 0x20; ForwardDefinition = 0x40; }
```

> **关键事实**:与 graphify 简化版不同,**官方 occurrences 挂在 Document 上,不挂在每个 symbol 上**(源: graphify/scip_ingest.py:27-30 自己点明这个分歧)。`symbol_roles` 是**位掩码**,按 `role & 0x1` 判 Definition——**绝不**用枚举相等判定。
> **range 消费修正(D16）**:当前协议已**优先 typed `single_line_range` / `multi_line_range`**，旧的 packed 3 元 `[startLine,startChar,endChar]` / 4 元 `[startLine,startChar,endLine,endChar]`（0-based）**已 deprecated**。consumer 必须 **typed-first、packed fallback**，并保留每个 Document 的 **position encoding（UTF-8 / UTF-16 / UTF-32）**（char offset 的码元口径随之不同，落库前须按 Document 编码归一）。

**解码方案（D16 / [ADR 0028](../adr/0028-scip-streaming-consumer-official-binding.md)）——官方 TS binding + 薄顶层 streaming importer；pbjs 平行 binding 与手写嵌套解码器均 Rejected**：

官方 SCIP 现已提供 **Apache-2.0 的 TS binding `@scip-code/scip`**（由 `protoc-gen-es` 生成；已核对 v0.8.1 / Apache-2.0 / 依赖 `@bufbuild/protobuf ^2.11.0`，后者 Apache-2.0 AND BSD-3-Clause）。标准消费 = `fromBinary(IndexSchema, bytes)`。故：
- **不再** pbjs/pbts 自生成平行 binding（旧 A，**Rejected**）；**不**手写完整嵌套 protobuf 解码器（旧 C，**Rejected**）；运行时 `protobufjs` 反射（旧 B）本就否决。
- `@scip-code/scip` + `@bufbuild/protobuf` 作**精确锁版的构建依赖**，由 **tsdown** 打进**独立、lazy-loaded 的 SCIP chunk**；安装后仍 **无 npm runtime dependency、无 native addon**，**仅探测到 `index.scip` 时才加载**。
- **内存（生产路径不整文件 decode）**：官方 schema 明确警告完整 `Index` 可能占用大量内存，故**不**执行 `fromBinary(IndexSchema, wholeFile)`。tk **只手写顶层 Index framing**：读 field tag + length-delimited payload，再分别用官方 `MetadataSchema` / `DocumentSchema` / `SymbolInformationSchema` 解码；每个 Document 解码后**立即写入 SQLite staging 并释放**。结构等价于官方 Go `ParseStreaming`，但**没有手写任何嵌套 SCIP 消息的 wire decoder**（只手写最外层 framing）。
- **失败处置**：解码或导入失败必须**整代（generation）rollback**，并透明回退 tree-sitter / TypeScript checker（接 E 的 index_generation + J 的 fail-open）。
- **capability state**：`ScipIndexer` = **Optional-at-runtime**；`ScipConsumer` + `StreamingScipImporter` = **Required**；`WholeIndexDecode` = 仅 tests / small fixtures。

解码后的**映射逻辑**(把 Document/Occurrence/SymbolInformation 映成 tk 边),仍**可改写自 graphify 的两遍法**(源: graphify/scip_ingest.py:74-129, 251-273,PolyForm-NC **[非分发安全]**,若分发需重写)——核心是"pass1 建 symbol→node 索引,pass2 发边,目标解析优先同文档、唯一跨文档兜底"（注：下面 `ScipIndex/ScipDocument` 形已由官方 Document decode 产出，**不再来自旧方案 A 的 `Index.decode`**；range 读取须 typed-first 见上）：

```ts
// 需实现时补 (解码 glue);映射逻辑 已改写自 graphify/scip_ingest.py 两遍法 [非分发安全]
// 源: /tmp/tk-research/graphify/graphify/scip_ingest.py:74-129 (两遍索引结构) + :251-273 (解析顺序)
//     :291-297 (relationship→relation tag)  —— PolyForm-NC,分发前需重写
type ScipIndex = { documents: ScipDocument[] };           // 由方案A的 Index.decode 产出
type ScipDocument = { relativePath: string; occurrences: ScipOcc[]; symbols: ScipSym[] };
type ScipOcc = { range: number[]; symbol: string; symbolRoles: number };
type ScipSym = { symbol: string; relationships?: ScipRel[] };
type ScipRel = { symbol: string; isReference?: boolean; isImplementation?: boolean;
                 isTypeDefinition?: boolean; isDefinition?: boolean };

const SCIP_DEFINITION = 0x1; // 源: scip.proto SymbolRole.Definition

// pass1:在每个 Document 上,把 "Definition occurrence" 的 symbol 绑到 (file, startLine) →
//        与 tree-sitter 已有节点用 file_path + range 对账(reconcile)。
// pass2:对每个 Occurrence 解析其 symbol 的定义点;Definition occ = 节点锚,
//        非-Definition occ = 一条引用边 (provenance='scip').
function scipToEdges(idx: ScipIndex, lookupTsNode: (file: string, line: number) => string | null) {
  // 局部符号判定:SCIP 符号串以 "local " 开头即文档内局部 (源: scip 符号串语法,WebFetch 已核对)
  const isLocal = (s: string) => s.startsWith("local ");
  // 定义索引:symbol → { file, line } (取该 symbol 的 Definition occurrence)
  const defOf = new Map<string, { file: string; line: number }>();
  for (const doc of idx.documents) {
    for (const occ of doc.occurrences) {
      if ((occ.symbolRoles & SCIP_DEFINITION) !== 0 && occ.range.length >= 1) {
        defOf.set(occ.symbol, { file: doc.relativePath, line: occ.range[0] }); // 0-based
      }
    }
  }
  const edges: Array<{ kind: "calls" | "references"; src: string; dst: string; provenance: "scip" }> = [];
  for (const doc of idx.documents) {
    for (const occ of doc.occurrences) {
      if ((occ.symbolRoles & SCIP_DEFINITION) !== 0) continue;     // 定义点不是引用边
      if (occ.range.length < 1) continue;
      const refLine = occ.range[0];
      const srcNode = lookupTsNode(doc.relativePath, refLine);     // 谁发起的(reconcile by file+range)
      const def = defOf.get(occ.symbol);                            // 指向谁的定义
      if (!srcNode || !def) continue;                              // 跨包/外部符号:无本地定义 → 跳过(或建 stub,见 graphify:209-228)
      const dstNode = lookupTsNode(def.file, def.line);
      if (!dstNode || srcNode === dstNode) continue;
      // calls vs references:SCIP occurrence 本身不分"调用/读取";用 SymbolInformation.relationships
      // 或符号串的 Method 描述符 `().` 判调用,其余记 references。判定细节 需实现时补。
      edges.push({ kind: occ.symbol.endsWith(").") ? "calls" : "references",
                   src: srcNode, dst: dstNode, provenance: "scip" });
    }
  }
  return edges;
}
```

**tk 适配**:落库进 tk 的 `edges(kind, src, dst, provenance, file_path, start_line)` 表,`provenance='scip'`。`lookupTsNode(file, line)` 走 tk 已有的 `nodes` 表 `WHERE file_path=? AND start_line<=? AND end_line>=?`(包含式 range 对账,把 SCIP 0-based 行 +1 对齐 tk 若为 1-based —— **具体行基 需实现时补**,验 fixture 时锁定)。`interface↔impl` 的歧义正是 `Relationship.is_implementation` 解决的:tree-sitter 看不出 `impl.foo()` 调到哪个具体类,SCIP 的 `is_implementation` 边给出确定目标。

#### 4. 优先级规则(接 J provenance enum)

provenance 可信度排序 **scip > tree-sitter > heuristic**。落库时若同一 `(kind, src, dst)` 已有 tree-sitter 边,scip 边覆盖之;反向不覆盖:

```ts
// 需实现时补 (tk 新代码;precedence = need J 决策)
const PROVENANCE_RANK = { scip: 3, "tree-sitter": 2, heuristic: 1 } as const;
// UPSERT 语义:仅当新边 rank >= 旧边 rank 时写入 provenance/confidence。
// SQL: INSERT ... ON CONFLICT(src,dst,kind) DO UPDATE SET provenance=excluded.provenance
//      WHERE PROVENANCE_RANK(excluded.provenance) > PROVENANCE_RANK(edges.provenance)
//      —— SQLite 无内建 rank 函数,用 CASE 或在写入前于 TS 比较。
```

#### 5. 具体数值

| 项 | 值 | 出处 |
|---|---|---|
| 探测超时(若用 `--version` 探测) | 2000ms | 任务规定;tk `PREFLIGHT_COMMAND_TIMEOUT_MS` 同量级 |
| 索引器运行超时 | 120000ms | 任务规定(全仓索引重) |
| provenance 优先级 | scip(3) > tree-sitter(2) > heuristic(1) | need J |
| SymbolRole.Definition 位 | `0x1` | scip.proto VERBATIM |
| range 元素数 | 3(单行)或 4(跨行),0-based | scip.proto VERBATIM |
| 局部符号前缀 | `"local "` | SCIP 符号串语法 |
| 默认产物 | `<cwd>/index.scip` | SCIP CLI 约定 |

#### 6. 有序步骤

1. 扫仓得到实际出现的语言集合 `presentLangs`(tree-sitter 解析步骤的副产物)。
2. `detectScipIndexers(presentLangs)`——纯 `defaultWhich`,不 spawn,零成本;空集 → **静默回退 tree-sitter,结束**。
3. 对每个命中的索引器 `runScipIndexer`(spawn,120s 超时);失败/无 `index.scip` → 该语言静默回退,不阻断其它语言。
4. 方案 A 解码 `index.scip` → `Index`。
5. `scipToEdges` 映射,`lookupTsNode` 用 tk `nodes` 表按 file+range 对账。
6. UPSERT 入 `edges`,provenance='scip',按 §4 优先级覆盖 tree-sitter 边。
7. 全程 best-effort:任何异常吞掉并回退,绝不让 SCIP 路线使索引失败(保零安装体验)。

#### 7. 测试(fixture:interface+impl,tree-sitter 歧义而 SCIP 确定)

- **Fixture**:`Animal` 接口 + `Dog`/`Cat` 两实现 + `feed(a: Animal){ a.speak() }`。tree-sitter 只能产 `feed→Animal.speak`(或两条歧义边);SCIP 的 `Relationship.is_implementation` 让 `Dog.speak`/`Cat.speak` 与 `Animal.speak` 关联。
- **断言 1(检测)**:PATH 无 `scip-typescript` 时 `detectScipIndexers` 返回 `[]`,索引仍成功,边全为 `provenance='tree-sitter'`(零安装回退)。
- **断言 2(消费)**:喂一个**预生成的 `index.scip` fixture**(签入测试资产,不在 CI 装索引器),`scipToEdges` 产出 `feed→Animal.speak` 的 `provenance='scip'` 边。可借鉴 graphify 的 fixture 风格(源: graphify/tests/test_scip_ingest.py:44-78 单符号/无关系/range→line 用例 [非分发安全])。
- **断言 3(优先级)**:先插一条 tree-sitter `feed→Animal.speak`,再 UPSERT scip 同边,查库 provenance 变 `scip`;反向(先 scip 后 tree-sitter)不被覆盖。
- **断言 4(位掩码)**:`(role & 0x1)` 区分 Definition occ(成锚点)与 reference occ(成边),用一个 Definition+一个 Reference 的最小 `index.scip` 验证只产 1 条边。
- **断言 5(超时/损坏)**:喂截断的 `index.scip` → 解码抛错被吞 → 静默回退,索引整体仍 green。

---

### 从 gitnexus 抄进 tk 的可复用核心（impact / 增量子图 / 预算图查询 / 确定序）

**决策回指**：tk 用 `node:sqlite` 上 `nodes(kind, file_path, start_line)` + `edges(kind, src, dst, provenance, confidence)` 的属性图；gitnexus 的图层用 Kuzu/Cypher（`PolyForm-Noncommercial-1.0.0`，已在 `package.json:"license"` 确认），所以**每段逐字代码都标 `[非分发安全]`**——个人用可直接抄，若将来分发必须重写。本节只挖材料服务 tk 的 A(人理解)/B(agent 找码省 token)/G(预算优于压缩)/E(增量) 的 4 类核心，Web-UI 专属代码全部跳过。

最值钱的一条是 **impact 的「一次调用顶十次 grep」**：gitnexus 把 BFS blast-radius 做成单工具 `impact({target, direction, maxDepth})`，按深度分带（d=1 WILL BREAK / d=2 / d=3）并算出 LOW/MEDIUM/HIGH/CRITICAL 风险——这正是 tk 的 G(预算优于压缩) 杠杆：agent 不再逐个 grep 调用点，一个工具调用拿到全量受影响集 + 风险分级。

---

#### 1. impact 的 BFS blast-radius 核心 → tk_impact 工具（服务 B + A + G）

**(a) 它做什么**：从目标符号出发，沿入边(upstream=谁依赖我)或出边(downstream=我依赖谁)做**逐深度 BFS**，每层一条批量查询（把整层 frontier 一次查完，不是逐节点），结果按 depth 分带 + 带 confidence。

确切阈值（全部逐字来自源）：
- 关系白名单 `['CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES','HAS_METHOD','HAS_PROPERTY','METHOD_OVERRIDES','OVERRIDES','METHOD_IMPLEMENTS','ACCESSES']`
- 每类边的 confidence 下限：CALLS/IMPORTS=0.9，EXTENDS/IMPLEMENTS/METHOD_*=0.85，HAS_METHOD/HAS_PROPERTY/CONTAINS=0.95，ACCESSES=0.8，未知=0.5
- `maxDepth` 默认 3，硬上限 32（`validateGroupImpactParams`）
- 风险分级：`directCount>=30 || processCount>=5 || moduleCount>=5 || impacted.length>=200 → CRITICAL`；`>=15 / >=3 / >=3 / >=100 → HIGH`；`directCount>=5 || impacted.length>=30 → MEDIUM`；否则 LOW
- 防爆护栏（trace 路径同源）：`PER_NODE_FANOUT_CAP=200`、`ABS_ROW_CAP=5000`、`MAX_VISITED=50000`

BFS 主循环逐字（Cypher 版，已逐行确认存在）：

```ts
// 源: gitnexus/src/mcp/local/local-backend.ts:4636-4776 [非分发安全]
const impacted: any[] = [];
const visited = new Set<string>([symId]);
let frontier = [symId];
let traversalComplete = true;

for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
  const nextFrontier: string[] = [];
  // Batch frontier nodes into a single Cypher query per depth level.
  const query =
    direction === 'upstream'
      ? `MATCH (caller)-[r:CodeRelation]->(n) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, caller.id AS id, caller.name AS name, labels(caller)[0] AS type, caller.filePath AS filePath, r.type AS relType, r.confidence AS confidence`
      : `MATCH (n)-[r:CodeRelation]->(callee) WHERE n.id IN $frontierIds AND r.type IN $relTypes${confidenceFilter} RETURN n.id AS sourceId, callee.id AS id, callee.name AS name, labels(callee)[0] AS type, callee.filePath AS filePath, r.type AS relType, r.confidence AS confidence`;
  const related = await executeParameterized(repo.lbugPath, query, {
    frontierIds: frontier, relTypes: relationTypes,
    ...(safeMinConfidence > 0 ? { minConfidence: safeMinConfidence } : {}),
  });
  for (const rel of related) {
    const relId = rel.id || rel[1];
    const filePath = rel.filePath || rel[4] || '';
    if (!includeTests && isTestFilePath(filePath)) continue;
    if (!visited.has(relId)) {
      visited.add(relId);
      nextFrontier.push(relId);
      const storedConfidence = rel.confidence ?? rel[6];
      const relationType = rel.relType || rel[5];
      const effectiveConfidence =
        typeof storedConfidence === 'number' && storedConfidence > 0
          ? storedConfidence : confidenceForRelType(relationType);
      impacted.push({ depth, id: relId, name: rel.name || rel[2],
        type: rel.type || rel[3], filePath, relationType, confidence: effectiveConfidence });
    }
  }
  frontier = nextFrontier;
}
const grouped: Record<number, any[]> = {};
for (const item of impacted) { (grouped[item.depth] ??= []).push(item); }
```

风险分级逐字：

```ts
// 源: gitnexus/src/mcp/local/local-backend.ts:5050-5065 [非分发安全]
const processCount = affectedProcesses.length;
const moduleCount = affectedModules.length;
let risk = 'LOW';
if (directCount >= 30 || processCount >= 5 || moduleCount >= 5 || impacted.length >= 200) {
  risk = 'CRITICAL';
} else if (directCount >= 15 || processCount >= 3 || moduleCount >= 3 || impacted.length >= 100) {
  risk = 'HIGH';
} else if (directCount >= 5 || impacted.length >= 30) {
  risk = 'MEDIUM';
}
```

confidence 下限表逐字：

```ts
// 源: gitnexus/src/mcp/local/local-backend.ts:220-238 [非分发安全]
export const IMPACT_RELATION_CONFIDENCE: Readonly<Record<string, number>> = {
  CALLS: 0.9, IMPORTS: 0.9, EXTENDS: 0.85, IMPLEMENTS: 0.85,
  METHOD_OVERRIDES: 0.85, METHOD_IMPLEMENTS: 0.85,
  HAS_METHOD: 0.95, HAS_PROPERTY: 0.95, ACCESSES: 0.8, CONTAINS: 0.95,
};
const confidenceForRelType = (relType: string | undefined): number =>
  IMPACT_RELATION_CONFIDENCE[relType ?? ''] ?? 0.5;
```

**(b) 服务谁**：`tk_impact` MCP 工具，服务 **B**（agent「改 X 会破坏谁」一次问清，省掉 N 次 grep 调用点）+ **A**（人提交前看 blast radius + 风险分级）+ **G**（precompute-over-compress：BFS 在索引上跑，回给 agent 的是结构化分带集而非整堆源码）。UX 契约直接抄 `skills/gitnexus-impact-analysis.md`：d=1=WILL BREAK / d=2=LIKELY AFFECTED / d=3=MAY NEED TESTING。

**(c) tk 适配（Cypher→node:sqlite 递归 CTE）**：把「逐层批量查询 + JS 侧 visited/grouped」整体下沉成一条 `WITH RECURSIVE`，在 `edges(src,dst,kind,confidence)` 上跑。upstream（谁指向我）= 沿 `dst=cur` 反向走：

```sql
-- tk: src/graph/impact.sql （已改写 from gitnexus Cypher BFS 源:local-backend.ts:4716）
WITH RECURSIVE
  params(target_id, max_depth, min_conf) AS (VALUES (:target, :maxDepth, :minConf)),
  walk(node_id, depth, rel_kind, conf, path) AS (
    SELECT :target, 0, NULL, 1.0, ',' || :target || ','
    UNION ALL
    SELECT e.src,                       -- upstream: edge points INTO current node
           w.depth + 1,
           e.kind,
           COALESCE(e.confidence,
             CASE e.kind WHEN 'CALLS' THEN 0.9 WHEN 'IMPORTS' THEN 0.9
                         WHEN 'EXTENDS' THEN 0.85 WHEN 'IMPLEMENTS' THEN 0.85
                         WHEN 'HAS_METHOD' THEN 0.95 WHEN 'HAS_PROPERTY' THEN 0.95
                         WHEN 'ACCESSES' THEN 0.8 ELSE 0.5 END),
           w.path || e.src || ','
    FROM walk w
    JOIN edges e ON e.dst = w.node_id    -- upstream; for downstream swap to e.src = w.node_id and SELECT e.dst
    WHERE w.depth < (SELECT max_depth FROM params)
      AND e.kind IN ('CALLS','IMPORTS','EXTENDS','IMPLEMENTS','USES',
                     'HAS_METHOD','HAS_PROPERTY','METHOD_OVERRIDES','OVERRIDES',
                     'METHOD_IMPLEMENTS','ACCESSES')
      AND COALESCE(e.confidence, 1.0) >= (SELECT min_conf FROM params)
      AND instr(w.path, ',' || e.src || ',') = 0   -- visited-set: cycle guard
  )
SELECT w.node_id AS id, MIN(w.depth) AS depth, w.rel_kind AS relation_type,
       w.conf AS confidence, n.name, n.file_path, n.kind, n.start_line
FROM walk w JOIN nodes n ON n.id = w.node_id
WHERE w.depth >= 1
GROUP BY w.node_id           -- MIN(depth) == gitnexus 的 `if (!visited.has) → 首达深度`
ORDER BY depth, n.file_path
LIMIT 5000;                  -- == ABS_ROW_CAP
```

要点对应：JS 的 `visited` 集 ⇒ SQL 里 `instr(path, ...)=0`（路径串去环，且 `GROUP BY ... MIN(depth)` 复现「首次到达深度即定带」语义）；`ABS_ROW_CAP=5000` ⇒ `LIMIT 5000`；confidence 回退表内联进 `CASE`。`directCount = COUNT(depth=1)`，`impacted.length = 总行数`，喂进 (b) 的风险公式即可。tk 无 Process/Community 概念，把 `processCount/moduleCount` 项从风险公式删掉，只保留 `directCount` 与 `impacted.length` 两档（仍 LOW/MEDIUM/HIGH/CRITICAL）。

**有序步骤**：① 建 `edges(src,dst,kind,confidence)` 上 `(dst,kind)` 与 `(src,kind)` 双索引（CTE 两个方向各吃一个）② 把上面 CTE 包成 `impactUpstream/impactDownstream(targetId, maxDepth=3, minConf=0)` ③ JS 侧 `groupBy(depth)` + 套风险公式 ④ 包成 `tk_impact` MCP 工具，输出抄 skill 的 d=1/d=2/d=3 文案。

**测试**：构造 A→B→C 链（CALLS），`impactUpstream(C, depth=3)` 必得 `{B:d1, A:d2}`；插一条 A→C→A 环，断言不死循环且每节点只出现一次（MIN depth）；confidence 缺失的边断言回退到 0.9（CALLS）；`directCount=5` 断言 risk 升到 MEDIUM。

---

#### 2. graph-queries 的预算化查询族 → G(precompute-over-compress)

**(a) 它做什么**：把高频问题各封一条 Cypher（带 `LIMIT`），一次查完整层，而非让 agent 反复 grep：导出符号表、跨文件调用边、模块内/跨模块调用边（各 `LIMIT 30`）、文件清单。关键是 **inter-module 边带 `LIMIT 30` 预算**，模块概览边在 JS 侧按 `count` 聚合排序。

```ts
// 源: gitnexus/src/core/wiki/graph-queries.ts:124-141 [非分发安全]
// Get inter-file call edges (calls between different files).
export async function getInterFileCallEdges(): Promise<CallEdge[]> {
  const rows = await executeQuery(REPO_ID, `
    MATCH (a)-[:CodeRelation {type: 'CALLS'}]->(b)
    WHERE a.filePath <> b.filePath
    RETURN DISTINCT a.filePath AS fromFile, a.name AS fromName,
           b.filePath AS toFile, b.name AS toName
  `);
  return rows.map((r) => ({ fromFile: r.fromFile || r[0], fromName: r.fromName || r[1],
    toFile: r.toFile || r[2], toName: r.toName || r[3] }));
}
```

```ts
// 源: gitnexus/src/core/wiki/graph-queries.ts:325-353 [非分发安全] (已改写: 仅取聚合逻辑)
const fileToModule = new Map<string, string>();
for (const [mod, files] of Object.entries(moduleFiles)) for (const f of files) fileToModule.set(f, mod);
const allEdges = await getInterFileCallEdges();
const moduleEdgeCounts = new Map<string, number>();
for (const edge of allEdges) {
  const fromMod = fileToModule.get(edge.fromFile);
  const toMod = fileToModule.get(edge.toFile);
  if (fromMod && toMod && fromMod !== toMod) {
    const key = `${fromMod}|||${toMod}`;
    moduleEdgeCounts.set(key, (moduleEdgeCounts.get(key) || 0) + 1);
  }
}
```

**(b) 服务谁**：**G**——这些是「预算优于压缩」的样板：每条查询自带 `LIMIT`，回的是结构化边/符号集而非源码，token 远低于 agent 自己 grep+读文件再聚合。也喂 **A**（人看架构图/模块依赖）。

**(c) tk 适配**：`getInterFileCallEdges` 直接是 SQL join：

```sql
-- tk: 跨文件调用边（已改写 from 源:graph-queries.ts:124）
SELECT DISTINCT a.file_path AS from_file, a.name AS from_name,
       b.file_path AS to_file, b.name AS to_name
FROM edges e
JOIN nodes a ON a.id = e.src
JOIN nodes b ON b.id = e.dst
WHERE e.kind = 'CALLS' AND a.file_path <> b.file_path;
```

inter-module 用 SQL 直接聚合（替掉 JS 侧 Map）：

```sql
-- tk: 跨模块调用计数（已改写：把 JS Map 聚合下沉到 SQL，源:graph-queries.ts:325）
SELECT fm.module AS from_mod, tm.module AS to_mod, COUNT(*) AS cnt
FROM edges e
JOIN nodes a ON a.id = e.src   JOIN file_module fm ON fm.file_path = a.file_path
JOIN nodes b ON b.id = e.dst   JOIN file_module tm ON tm.file_path = b.file_path
WHERE e.kind = 'CALLS' AND fm.module <> tm.module
GROUP BY fm.module, tm.module
ORDER BY cnt DESC LIMIT 30;     -- == gitnexus inter-module LIMIT 30
```

**具体数值**：inter/intra-module 边 `LIMIT 30`，进程概览 `LIMIT 5`/`20`——tk 沿用 `LIMIT 30` 作为预算化默认。**测试**：3 文件 2 模块，断言跨模块计数=实际跨界 CALLS 数；同模块边不出现在 inter-module 结果。

---

#### 3. subgraph-extract + computeEffectiveWriteSet → E(增量)

**(a) 它做什么**：增量 reindex 时，给定「被改文件集」，只重建受影响子图。两个纯函数零依赖：`extractChangedSubgraph`（保留 filePath∈写集的节点 + 至少一端在写集的边）+ `computeEffectiveWriteSet`（沿跨写集边界的边 1-hop 扩展写集，解决 barrel re-export 那类「A 内容没变但 A→B 边重解析成 A→D」的陈旧边问题）。

```ts
// 源: gitnexus/src/core/incremental/subgraph-extract.ts:121-137 [非分发安全]
export const computeEffectiveWriteSet = (
  fullGraph: KnowledgeGraph,
  toWriteSet: ReadonlySet<string>,
): Set<string> => {
  const nodeFilePaths = indexNodeFilePaths(fullGraph);
  const expanded = new Set<string>(toWriteSet);
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    const sourcePath = nodeFilePaths.get(r.sourceId);
    const targetPath = nodeFilePaths.get(r.targetId);
    if (!sourcePath || !targetPath) return; // skip edges to graph-wide nodes
    const sourceWritable = toWriteSet.has(sourcePath);
    const targetWritable = toWriteSet.has(targetPath);
    if (sourceWritable && !targetWritable) expanded.add(targetPath);
    else if (targetWritable && !sourceWritable) expanded.add(sourcePath);
  });
  return expanded;
};
```

```ts
// 源: gitnexus/src/core/incremental/subgraph-extract.ts:80-107 [非分发安全]
export const extractChangedSubgraph = (fullGraph, toWriteSet): KnowledgeGraph => {
  const sub = createKnowledgeGraph();
  const writableNodeIds = new Set<string>();
  fullGraph.forEachNode((n: GraphNode) => {
    const filePath = n.properties?.filePath as string | undefined;
    const include = (filePath && toWriteSet.has(filePath)) || isGraphWide(n.label);
    if (include) { sub.addNode(n); writableNodeIds.add(n.id); }
  });
  fullGraph.forEachRelationship((r: GraphRelationship) => {
    if (writableNodeIds.has(r.sourceId) || writableNodeIds.has(r.targetId) || isGraphWideRelType(r.type))
      sub.addRelationship(r);
  });
  return sub;
};
```

**(b) 服务谁**：**E**——文件改动后只重建 1-hop 邻域，不全量 reindex。`computeEffectiveWriteSet` 那条「1-hop 扩展写集」是关键正确性洞见：必须用同一个扩展后的集合去做删除和写入，否则陈旧边残留 / PK 冲突。

**(c) tk 适配**：tk 不需要把图搬进内存——node:sqlite 里直接：

① 算有效写集（1-hop 边界扩展）：

```sql
-- tk: 1-hop 边界扩展（已改写 from computeEffectiveWriteSet 源:subgraph-extract.ts:121）
-- :changed = 被改文件集（临时表 changed_files(file_path)）
SELECT DISTINCT other.file_path FROM (
  SELECT b.file_path FROM edges e
    JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst
    WHERE a.file_path IN (SELECT file_path FROM changed_files)
      AND b.file_path NOT IN (SELECT file_path FROM changed_files)
  UNION
  SELECT a.file_path FROM edges e
    JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst
    WHERE b.file_path IN (SELECT file_path FROM changed_files)
      AND a.file_path NOT IN (SELECT file_path FROM changed_files)
) AS other;   -- 把这些并入 changed_files 得到 effective write set
```

② 删除：`DELETE FROM nodes WHERE file_path IN (effective set)` + `DELETE FROM edges WHERE src/dst 任一节点属于这些文件`（DETACH 语义）。③ 重解析这些文件，重新 INSERT 节点 + 至少一端落在写集的边。**关键纪律**（直接抄 gitnexus 的 Finding 1）：删除集 == 写入集，必须是同一个 effective set，否则陈旧边残留或 PK 冲突。

**具体数值**：扩展深度恒为 **1-hop**（gitnexus 的 importer-BFS 多跳那半留给「停止 import」的反向 case，tk 不做（Outside current product scope））。**测试**：barrel 场景——A→B 改成 A→D（A 文件内容不变），断言 effective set 含 B 和 D，重建后旧 A→B 边消失、新 A→D 边存在。

---

#### 4. graph-sort 拓扑分层 → 确定序（服务 E + 索引可复现）

**(a) 它做什么**：Kahn 算法跑在**反向** import 图上，把文件分成拓扑层（同层无相互依赖、可并行），环里的文件追加为最后一层。**leaves-first**：上游导出必须先于下游 importer 解析。纯函数零依赖、零 Cypher，直接可抄。

```ts
// 源: gitnexus/src/core/ingestion/utils/graph-sort.ts:57-108 [非分发安全]
export function topologicalLevelSort(importMap: ReadonlyMap<string, ReadonlySet<string>>): {
  levels: readonly IndependentFileGroup[]; cycleCount: number;
} {
  const pendingImportsPerFile = new Map<string, number>();
  const reverseDeps = new Map<string, string[]>();
  for (const [file, deps] of importMap) {
    if (!pendingImportsPerFile.has(file)) pendingImportsPerFile.set(file, 0);
    for (const dep of deps) {
      if (!pendingImportsPerFile.has(dep)) pendingImportsPerFile.set(dep, 0);
      pendingImportsPerFile.set(file, (pendingImportsPerFile.get(file) ?? 0) + 1);
      let rev = reverseDeps.get(dep);
      if (!rev) { rev = []; reverseDeps.set(dep, rev); }
      rev.push(file);
    }
  }
  const levels: string[][] = [];
  let currentLevel = [...pendingImportsPerFile.entries()].filter(([, d]) => d === 0).map(([f]) => f);
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: string[] = [];
    for (const file of currentLevel)
      for (const dependent of reverseDeps.get(file) ?? []) {
        const newPending = (pendingImportsPerFile.get(dependent) ?? 1) - 1;
        pendingImportsPerFile.set(dependent, newPending);
        if (newPending === 0) nextLevel.push(dependent);
      }
    currentLevel = nextLevel;
  }
  const cycleFiles = [...pendingImportsPerFile.entries()].filter(([, d]) => d > 0).map(([f]) => f);
  if (cycleFiles.length > 0) levels.push(cycleFiles);
  return { levels, cycleCount: cycleFiles.length };
}
```

**(b) 服务谁**：**E** + 索引**确定序**——跨文件绑定/符号解析按 leaves-first 处理，上游导出先解析；同层可并行。tk 重建子图（#3）后用它定重解析顺序，保证结果可复现（不依赖文件系统枚举顺序）。

**(c) tk 适配**：**整段 TS 直接搬进 `src/graph/topo-sort.ts`，零改动**（纯 Map/Set，无 Kuzu）。喂它的 `importMap` 从 tk 的 IMPORTS 边一次查出：`SELECT a.file_path, b.file_path FROM edges e JOIN nodes a ON a.id=e.src JOIN nodes b ON b.id=e.dst WHERE e.kind='IMPORTS'`，JS 侧 groupBy 成 `Map<importer, Set<dep>>`。

**注意纪律**（抄 JSDoc 警告）：计数器叫 `pendingImportsPerFile` 不是 `inDegree`，跑在反向图上，**别改成正向 in-degree**——否则从 leaves-first 翻成 roots-first，静默破坏跨文件绑定传播。**测试**：A imports B imports C，断言 `levels=[[C],[B],[A]]`；A↔B 互导，断言两者落在最后的 cycle 层且 `cycleCount=2`。

---

#### 抄进来清单

| gitnexus 源文件 | tk 目标文件 | 服务 need | 许可 |
| --- | --- | --- | --- |
| `src/mcp/local/local-backend.ts:4636-4776` (impact BFS) | `src/graph/impact.ts` + `impact.sql` (WITH RECURSIVE) | B + A + G | PolyForm-NC → [非分发安全] |
| `src/mcp/local/local-backend.ts:5050-5065` (risk 分级) | `src/graph/impact.ts` (risk 函数) | A + B | PolyForm-NC → [非分发安全] |
| `src/mcp/local/local-backend.ts:220-238` (confidence 表) | `src/graph/edge-confidence.ts` | B + G | PolyForm-NC → [非分发安全] |
| `skills/gitnexus-impact-analysis.md` (d=1/2/3 UX 契约) | `tk_impact` 工具描述 + 输出模板 | A + B | PolyForm-NC → [非分发安全] |
| `src/core/wiki/graph-queries.ts:124-353` (预算化查询族) | `src/graph/precomputed-queries.ts` (SQL 版) | G + A | PolyForm-NC → [非分发安全] |
| `src/core/incremental/subgraph-extract.ts:80-137` | `src/graph/incremental.ts` (SQL 删除+1-hop) | E | PolyForm-NC → [非分发安全] |
| `src/core/ingestion/utils/graph-sort.ts:57-108` | `src/graph/topo-sort.ts` (TS 整段直搬) | E + 确定序 | PolyForm-NC → [非分发安全] |
| `src/core/graph/graph.ts:11-182` (内存图模型) | **跳过**（tk 用 node:sqlite，不进内存图）；仅借鉴 reverse-adjacency/file-index 思路 | — | PolyForm-NC → [非分发安全] |

跳过的 Web-UI 专属：`getProcessesForFiles`/`getAllProcesses`/`getInterModuleEdgesForOverview` 的 Process/Community 部分（tk 无社区检测）、cross-impact 的 Phase-2 bridge/跨 repo fan-out（tk 是 project-local 单仓，只需 Phase-1 本地 BFS = 上面 #1）。

## 本附录诚实缺口(需实现时补)

- **need-A-personalized-pagerank**: aider repomap.py 通过 WebFetch 读取（main 分支 2026-06-20），未本地 clone；行号未在 raw 文件中标注，引用以方法名 get_ranked_tags 定位而非精确行号。如需分发，建议 clone 后用 commit SHA 锁定。
- **need-A-personalized-pagerank**: tk 的 nodes/edges 实际 schema（列名、是否已有 nodes_fts 虚表、edges 是否存 num_refs/provenance）未在本任务中核对——SQL 按 CONTEXT 描述的 nodes(kind)/edges(kind,src,dst,provenance) 假设书写；num_refs 的 sqrt 缩放需在 edge 聚合阶段真有引用计数列才能落地，否则退化为按出现次数 SUM。标记为：需实现时补 edges 是否含引用计数。
- **need-A-personalized-pagerank**: FTS5 MATCH 串 :q 的 tokenize/转义（防 query 注入 FTS 语法、camelCase 切分）未实现，需在 seeds.ts 补 query → MATCH 串的规范化。
- **need-A-personalized-pagerank**: rank 缓存 key 的 graph 版本指纹机制（增量更新后失效策略）未设计，需配合需求里的 incremental 索引部分。
- **need-A-personalized-pagerank**: G 的 n-hop 邻居扩展与字符预算具体算法属需求 G，本节只给排序输入接口，未给预算填充实现。
- **need-A-personalized-pagerank**: 单元测试中 D rank 的精确数值(0.35–0.40)为估算，建议落地后用一次实跑结果固化为快照断言。
- **need-D-scip-optin**: protobuf 解码 glue(buffer→Index)无逐字 TS 来源:推荐方案 A(构建期 pbjs/pbts 预生成静态解码器,保运行时零依赖),Index.decode 本身需实现时补
- **need-D-scip-optin**: scip-go / scip-clang 的精确默认 CLI 参数与产物路径未逐字核对(以各仓 README 为准)
- **need-D-scip-optin**: rust-analyzer 产 SCIP 的精确 flag(scip . 是否写 index.scip / 是否需 --output)需实现时补确认
- **need-D-scip-optin**: calls vs references 的判定:用符号串 Method 描述符 `().` 还是 SymbolInformation.relationships,需实现时锁定;当前用 endsWith('().') 占位
- **need-D-scip-optin**: SCIP range 为 0-based,tk nodes 表行基(0/1-based)未确认,reconcile 的 +1 对齐需在 fixture 测试时锁定
- **need-D-scip-optin**: 跨包/外部符号(无本地定义 occurrence)目前直接跳过;是否建 scip_external stub 节点(graphify 做法)留待 need D 整体决定
- **need-D-scip-optin**: graphify 的两遍映射逻辑 + 其 test fixture 为 PolyForm-NC / no-license,已标 [非分发安全],若 tk 分发需重写
- **need-D-scip-optin**: 默认产物文件名 index.scip 来自 SCIP CLI 约定 + graphify fixture,未从 scip-typescript README 逐字确认(README 未明示输出路径)
- **gitnexus 挖矿清单**: impact 风险公式里 processCount/moduleCount 两项依赖 gitnexus 的 Process/Community 节点，tk 无此概念 → 需实现时补：要么删掉这两项只留 directCount/impacted.length 两档，要么 tk 自建一个轻量社区/进程概念（建议删掉，Outside current product scope，留 TODO）
- **gitnexus 挖矿清单**: cross-impact.ts 的 Phase-2 跨 repo bridge fan-out（CY_NEIGHBORS_UPSTREAM/DOWNSTREAM + safeNeighborImpact 超时竞速 + mergeRisk）整体跳过，因为 tk 是单仓 project-local；若将来要跨 repo impact 需实现时补这套 bridge 协议
- **gitnexus 挖矿清单**: WITH RECURSIVE 的 upstream/downstream 我给的是两条结构对称的 SQL（一条 JOIN e.dst=cur 取 e.src，一条 JOIN e.src=cur 取 e.dst）；Class/Interface 节点的 Constructor/File 种子展开（local-backend.ts:4647-4714，针对 JVM CALLS→Constructor、IMPORTS→File 的间接性）未折进 CTE → tk 若支持 Java/Kotlin 需实现时补这段 frontier 预热，否则 Class 的入边会漏
- **gitnexus 挖矿清单**: graph-queries 的 SQL 改写依赖一张 file_module(file_path,module) 映射表（模块划分），tk 当前 schema 未定义模块概念 → 需实现时补模块划分来源（目录前缀？社区检测？）
- **gitnexus 挖矿清单**: PER_NODE_FANOUT_CAP=200 的每节点扇出截断在 CTE 里没复现（只复现了 ABS_ROW_CAP=5000 的总 LIMIT）；SQL 递归 CTE 难表达「每层每节点限 200 邻居」→ 需实现时补：要么靠总 LIMIT 5000 兜底，要么 JS 侧分页查询逐层限流
- **gitnexus 挖矿清单**: computeEffectiveWriteSet 只做 1-hop 正向边界扩展；gitnexus 文档明确这漏掉「文件 X 停止 import 已改文件 C」的反向 case（靠 importer-BFS 读 pre-pipeline DB 覆盖）→ tk 当前同样会漏 stop-import case，需实现时补一个读旧 IMPORTS 边的反向 BFS
- **gitnexus 挖矿清单**: impact 的 confidenceFilter 在 minConfidence<=0 时故意不加 confidence 子句（避免排除 NULL-confidence 边）；我的 CTE 用了 COALESCE(confidence,1.0)>=minConf，当 minConf=0 时行为等价，但若 tk 想精确复现「NULL 边在有 floor 时也保留」语义需实现时补 CASE 区分


