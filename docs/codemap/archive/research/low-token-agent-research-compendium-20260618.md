# Low-Token Coding-Agent Context Retrieval — research compendium (2026-06-18, merged)

> **Scope.** A research-only survey of the techniques, projects, and papers that let a local coding agent
> spend **fewer input tokens** on the two largest sinks — **searching code** and **reading files** — plus
> the adjacent sinks (logs, diffs, repeated context). Compiled to inform a future token-killer (tk)
> capability.
> **Method.** Cloned + read in full: codegraph, cocoindex-code. Read source / docs of: aider repo-map,
> Repomix, Probe, codesearch, CocoIndex, Continue, Roo Code, claude-context, Serena, SCIP, Sourcegraph
> Cody (historical). Surveyed the token-economics / retrieval papers below (live arXiv fetch this pass).
> **Merge note.** This document **supersedes and unifies** two earlier reports —
> [`code-graph-research-20260618.md`](./code-graph-research-20260618.md) (the five-family evidence base)
> and [`deep-research-report-low-token.md`](./deep-research-report-low-token.md) (the token-cost-model +
> SmartRead material). The *design* content of the latter has been moved to
> [`code-graph-design-20260618.md`](../legacy/code-graph-design-20260618.md); this report keeps **evidence and
> extracted technique only — no recommendation, no design, no ranking.** Companion:
> [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
> **Verification.** Paper figures are as-extracted this pass; treat magnitudes as directional (see §12).

---

## 0. Table of contents

1. The "why" — where an agent's tokens actually go
2. The token cost model — eight buckets, most-reducible vs risky
3. Taxonomy — five families of code-context retrieval
4. Family A — Structural code graphs
5. Family B — Repo-map & context packing
6. Family C — Hybrid structural + lexical search
7. Family D — Embeddings / semantic retrieval
8. Family E — LSP & precomputed-index protocols
9. Research papers — methods, numbers, evaluation
10. Cross-cutting technique toolbox + compatibility with tk's invariants
11. Measurement & evaluation methodology
12. Documented risks & failure modes
13. Comparison matrices · Verification notes · References

---

## 1. The "why" — where an agent's tokens actually go

The motivating evidence, strongest first. These are the numbers that justify building anything here at all.

| Finding | Source | Number |
|---|---|---|
| **Read/file-fetch operations dominate agent token spend** | SWE-Pruner (arXiv 2601.16746) | **76.1% of tokens go to read operations** |
| **Repository *exploration* dominates tool-use turns** | FastContext (arXiv 2606.14066) | **56.2% of tool-use turns are repo exploration** |
| Agentic coding vs chat token multiplier; input tokens dominate | "How Do AI Agents Spend Your Money?" (arXiv 2604.22750) | **~1000× more tokens** than chat; **input-bound**; same task varies **up to 30×** |
| Orientation share of total tokens (qualitative) | landscape report / aider repomap post | **60–80% of tokens go to orientation, not the task** |
| Accuracy is non-monotonic in spend | arXiv 2604.22750 | accuracy peaks at *intermediate* spend, then degrades — more reading ≠ better |

**Interpretation.** The two named targets — *code search* and *code reading* — are precisely the two
biggest documented sinks: ~56% of **turns** are exploration, and ~76% of **tokens** are reads. A capability
that lets the agent (a) locate the right code without a grep/glob/read loop and (b) receive the *relevant*
code (and only that) instead of whole files attacks the exact place the money is. Multiple independent
systems confirm the savings are realizable (later sections): codegraph **47% fewer tokens / 58% fewer tool
calls**; Codebase-Memory **10× fewer tokens**; FastContext **14–60% fewer tokens**.

A caution the same evidence carries: **context quality beats context volume** (SWE-ContextBench: a good
*summary* outperforms a full trajectory; bad context gives "limited or negative benefit"). So the
documented win is not "return more code faster" — it is "return the *right, ranked, minimal* code, honestly."

**The history multiplier.** Because agentic spend is *input-bound* (arXiv 2604.22750), every byte of
exploratory output is paid for more than once: it enters context now, and is re-sent as accumulated prompt
on later turns. Reducing one broad search or read therefore saves tokens twice — at emit time and on every
subsequent turn that would otherwise re-feed it. FastContext's design responds to this directly by moving
exploration into a separate component so the solver never accumulates irrelevant scans in its own history.

---

## 2. The token cost model — eight buckets, most-reducible vs risky

**Eight buckets.** Across the trajectory analyses, token spend in a local coding agent decomposes into:
(1) fixed system + tool instructions; (2) the user prompt; (3) conversation history; (4) search output;
(5) file reads; (6) repeated reads / repeated search output; (7) command, test, and build logs; (8)
git-oriented context (`diff`, `status`, `log`). The most expensive buckets are the exploratory ones (4–7),
because they are large *and* re-sent in later turns as accumulated prompt.

**Most reducible (documented).** The safest and largest reductions sit in **noisy tool outputs**, not in
code about to be edited. Build/test logs compress heavily — repeated stack frames, progress bars, dependency
noise, successful-test output, duplicated warnings. Broad grep output is the other prime target; FastContext,
CodeGraph, and Codebase-Memory all exist because file-by-file exploration burns tokens quickly. Aider's repo
map, Probe's `--max-tokens`, codesearch's metadata-first search, and FastContext's compact file-line
citations converge on one principle: **summarize search first, read later, cap context at the search stage.**

**Risky to compress (documented).** Exact edit context is risky: an agent about to modify code needs literal
source, stable line anchors, and enough exact surrounding code to preserve syntax and invariants. Serena's
symbol-replace tools and codesearch's separate `get_chunk` step both embody the distinction — navigation can
be abstract, editing cannot. The same holds for debugging when a single flag, regex, literal path, env var,
or schema field matters: lossy summarization is dangerous if it drops the exact triggering value. Repomix's
own compression guide marks structural compression suitable for "understanding code patterns and signatures"
but **experimental** and unfit as a universal replacement for literal code reads.

**The three context classes** (a recurring distinction across Serena, codesearch, FastContext, Repomix):

- **Understanding context** can often be compressed or projected (signatures, outlines, slices).
- **Editing context** must be exact (verbatim source, stable anchors, content hash).
- **Verification context** can often be diff-only, hunk-only, or failure-only.

This boundary is the line the literature draws between *safe* token reduction and *silent task failure*.

---

## 3. Taxonomy — five families

Every tool surveyed falls into one of five families by *how it finds and returns code*:

| Family | One-line | Examples | Needs model/API? | Local-only feasible? |
|---|---|---|---|:--:|
| **A. Structural graph** | tree-sitter → symbol/call/import graph → graph traversal + FTS | **codegraph**, Codebase-Memory, GitNexus, CodeGraphContext | No | ✅ |
| **B. Repo-map / packing** | rank or compress the whole repo into a compact map/blob | **aider repo-map**, Repomix, code2prompt | No | ✅ |
| **C. Hybrid search** | ripgrep/AST candidate-gen → BM25 (+ optional vectors) ranking | **Probe**, codesearch | optional (vectors) | ✅ (lexical-only) |
| **D. Embeddings / semantic** | AST-chunk → embed → vector ANN (often + BM25) | cocoindex-code, Continue, Roo Code, claude-context | **yes** (embed model) | ⚠️ only with local model + vector DB |
| **E. LSP / index protocol** | wrap real language servers / emit a precomputed semantic index | **Serena**, SCIP, Cody (historical) | No (runtime/index instead) | ✅ but heavy per-language |

The families are not mutually exclusive (codegraph = A+FTS; Probe = C+LSP; claude-context = D+BM25). §§4–8
take each in turn; §10 extracts the reusable techniques across all of them.

---

## 4. Family A — Structural code graphs

> Parse once with tree-sitter, store symbols + edges (calls/imports/extends) in a DB, answer
> "how does X work / who calls Y / what breaks if I change Z" by graph traversal returning verbatim source.
> **The 2026 "winning local-first pattern"** (per the rywalker comparison synthesis).

### 4.1 codegraph (colbymchenry) — **MIT**, the reference implementation (cloned + read in full)

**Headline benchmark (Opus 4.8, 7 repos, median of 4):** 16% cheaper · 47% fewer tokens · 22% faster ·
**58% fewer tool calls**; on VS Code (~10k files) **64% fewer tokens, 81% fewer tool calls, 0 file reads**.

- **Data model (`src/db/schema.sql`):** SQLite (`node:sqlite`, WAL, **FTS5**). Tables: `nodes` (21 kinds:
  file/class/function/method/property/enum/route/component/…; fields incl. qualified_name, file_path,
  start/end_line, signature, is_exported/async/static, decorators, return_type), `edges` (11 kinds:
  contains/calls/imports/exports/extends/implements/references/overrides/…; with `metadata`, `line`,
  `provenance`), `files` (content_hash, mtime, node_count), `unresolved_refs`, `project_metadata`. FTS5
  virtual table over `nodes(name, qualified_name, docstring, signature)` synced by triggers.
- **Extraction (`src/extraction/`):** `web-tree-sitter` (WASM) + `tree-sitter-wasms`; grammars **lazy-loaded
  per language present**. Per-file `extract → {nodes, edges, unresolvedRefs, errors}`. **Worker-thread pool**
  (`parse-worker.ts`): parser **reset every 5000 files** (WASM heap never shrinks), worker recycled every
  250, per-file 10 s parse timeout, crash-on-OOM. Batched file I/O (10 concurrent). Per-language extractors
  define node/edge capture types + hooks (resolveName, getSignature, isExported…). SFC langs (Svelte/Vue/
  Astro) delegate `<script>` to the TS extractor.
- **Resolution (`src/resolution/`):** post-pass turns name refs into cross-file edges. `import-resolver`
  (tsconfig path aliases, workspace packages, go.mod, JVM classpath), `name-matcher` (exact → case-insens →
  qualified-prefix; family-aware: jvm/apple/web/c/dotnet), multi-pass for chained `.method()` calls.
  `callback-synthesizer` (3 phases: field-backed observers; EventEmitter `.on/.emit`; framework-specific) +
  24 framework resolvers (React re-render, Django/Express/NestJS routes, **RN/ObjC bridging**). **Every
  synthesized edge tagged `provenance:'heuristic'` + `synthesizedBy:`** so the agent can see how a hop got in.
  Purely structural — **no PageRank, no embeddings.**
- **Explore = `buildContext` (`src/context/index.ts`, the crown jewel ~400 lines):** ① regex-extract
  candidate symbols from the NL query (CamelCase/snake/SCREAMING/dotted/lowercase) minus a ~60-word stoplist;
  ② **hybrid search, merge by max score across 3 channels** — exact-name (co-location boost: +20/extra symbol
  in same file), definition-prefix (stem variants, brevity bonus), FTS text (multi-term boost); ③ re-rank
  (multi-term co-occurrence, test-file ×0.3, dominant-file +25); ④ **BFS traversal depth 1** over
  contains/calls edges → subgraph; ⑤ **code-block extraction with adaptive budget**: containers collapse to
  **signature outline**, leaf functions show **verbatim source**, per-file char caps scale by repo size
  (4 tiers: <150 / <500 / <5k / 5k+ files), **polymorphic siblings** (≥3 implementers) skeletonize to
  signatures + one full exemplar (~28% payload cut); ⑥ **call-path surfacing**: DFS over calls edges, keep
  chains ≥3 nodes anchored to ≥2 query roots, label synthesized hops inline; ⑦ **low-confidence honest
  hand-back**: when entry points are isolated common-word matches, emit a marker telling the agent to use
  exact symbols or `Read` directly — *never a confident wrong answer*.
- **Delivery:** hand-rolled **JSON-RPC-over-stdio MCP** (`src/mcp/transport.ts`, **no SDK dep**). **4 default
  tools** (measured: fewer tools steer better): `codegraph_explore` (primary), `codegraph_node` (symbol body
  + callers, or read-a-file like Read), `codegraph_search`, `codegraph_callers`; 4 more
  (callees/impact/files/status) functional-but-unlisted (env `CODEGRAPH_MCP_TOOLS`). Server-instructions sent
  on `initialize`. **Inactive (registers no tools) when no index** — indexing stays the user's choice.
- **Sync:** detached **daemon** per project (Unix socket / named pipe), ref-counted, idles 300 s; native
  **file watcher** (FSEvents/inotify/ReadDirectoryChangesW, debounced 2 s); **per-file staleness banner**
  (⚠️ tells agent to Read a file edited since index); connect-time `(size,mtime)`+hash catch-up.
- **Distribution:** **self-contained bundle** (vendored Node 24 → `node:sqlite`, no native build) for 6
  platforms via curl/PowerShell installer; or npm shim + per-platform optionalDependencies. **No VS Code /
  Copilot target** (reaches Cursor/Claude/Codex/etc. via MCP).
- **Zero-config:** excludes node_modules/dist/vendor/.gitignore'd, files >1 MB.

### 4.2 Codebase-Memory (arXiv 2603.27277) — the academic match

Three-stage **Parse (tree-sitter, 66 languages) → Build (parallel workers: call graph + impact + community
detection into SQLite, deferred indexing) → Serve (single stateless C-binary MCP server, 14 typed query
tools).** **Numbers:** query latency Cypher-like relationship traversal **<<1 ms**, BFS call-path depth-5
**~0.3 ms**, name search <10 ms; index Django (49k nodes) ~6 s, **Linux kernel (2.1M nodes) ~3 min**,
incremental re-index ~1.2 s; **10× fewer tokens, 2.1× fewer tool calls** vs file exploration; **83% answer
quality vs 92% baseline** (the honest efficiency/quality trade). Confirms the structural-graph thesis at
research rigor; its **14 typed tools** (indexing 4 / query 4 / analysis 3 / code 3) and **community detection**
(clustering) are a step beyond codegraph's 4 tools.

### 4.3 GitNexus — **PolyForm Noncommercial (ideas only, no code reuse)**

tree-sitter + **KuzuDB (WASM)** graph; runs **entirely in-browser** (Tree-sitter WASM + KuzuDB WASM +
in-browser embeddings) *and* as CLI/MCP. Multi-phase pipeline: Structure → Parsing → Resolution →
**Clustering (functional communities)** → **Processes (trace execution flows from entry points)** → hybrid
search. 12 languages. Claims 74% token savings / 88% fewer tool calls. **Instructive ideas:** community
clustering + flow tracing (codegraph lacks both); zero-server WASM execution.

### 4.4 CodeGraphContext (Python) — pluggable backends

22 languages; **pluggable graph store (FalkorDB / KuzuDB / Neo4j)**; MCP + CLI. Shows the same structural
approach with a heavier, swappable graph-DB backend (the opposite of codegraph's single embedded SQLite file).

**Family-A takeaway:** the pattern converges hard — tree-sitter extract → symbol/call/import graph →
embedded store + FTS → MCP, **100% local, no embeddings, no API key**. Differences are storage (SQLite vs
Kuzu vs Neo4j), resolution depth (codegraph's framework/bridge resolvers are the moat), and extras
(clustering/flow tracing in GitNexus & Codebase-Memory). Every node resolves to a real `file:line`;
heuristic edges are provenance-tagged — the most *verifiable* family.

---

## 5. Family B — Repo-map & context packing

### 5.1 aider repo-map — the canonical ranked map (`aider/repomap.py`)

- **Tags:** tree-sitter `.scm` queries extract **definitions** (`@name.definition.*`) and **references**
  (`@name.reference.*`); Pygments fallback for langs lacking ref queries.
- **Graph + PageRank:** a **NetworkX MultiDiGraph** (nodes = files, edges = symbol references) ranked by
  **PageRank with a personalization vector**. Personalization is the key idea: seed weight on `chat_fnames`
  (files in chat), `mentioned_fnames`, and `mentioned_idents` (symbols named in the conversation) → the map
  *adapts to what the user is talking about*.
- **Edge-weight multipliers (composable):** named identifier (snake/camel ≥8 chars) ×10; mentioned-in-chat
  ×10; private (leading `_`) ×0.1; very-common def (>5 occurrences) ×0.1; reference count damped by
  `sqrt(num_refs)`; references from chat files ×50.
- **Token budget:** **binary search** over ranked tags to fit `--map-tokens` (default 1024; ×8 when no chat
  files), accepting 15% error. Disk-cached (`diskcache`/SQLite) keyed by mtime.

### 5.2 Repomix (TS, 26k★) — tree-sitter "code compression"

Whole-repo → one structured blob (XML/markdown), CLI + MCP, fully local. **Compression mode**
(`src/core/treeSitter/parseFile.ts`): `web-tree-sitter` (WASM) + per-language **parse strategies** keep
**signatures, drop bodies**, joined by a `⋮----` marker; `filterDuplicatedChunks` (keep longest per row) +
`mergeAdjacentChunks` (O(k) accumulation). **~70% token reduction claimed.** No persistent index — recomputes
per scan. *This is essentially tk's `read --level aggressive`, scaled to a repo* — but it has **no graph**, so
no callers/impact. Its own guide marks the compression **experimental** and unfit for exact edit/debug reads.

### 5.3 code2prompt (Rust) — template-based packaging; simplest packing; stable but slowing.

**Family-B takeaway:** packing is the cheapest possible MVP and is fully local, but it **cannot answer
relational queries** (callers/callees/impact). aider's two transferable jewels: **personalization-seeded
ranking** (adapt the map to the conversation) and **binary-search-to-token-budget**. Repomix's jewel:
**signature-collapse compression** via per-language tree-sitter strategies (same trick codegraph uses for
container nodes).

---

## 6. Family C — Hybrid structural + lexical search

### 6.1 Probe (probelabs, Rust) — ripgrep + tree-sitter + BM25

Two-stage: **ripgrep** finds candidate lines in parallel → **tree-sitter** extracts the *complete enclosing
block* (no mid-function chunks). Ranking: **BM25** (Porter stemming, precomputed IDF) + **SIMD cosine**
(simsimd/memchr) + optional **ms-marco-tinybert reranker**. **Elastic query syntax** (AND/OR/NOT/phrase/
`kind:function`). Per-workspace SQLite cache; LSP daemon integration. `--max-tokens` budgeting + session dedup.
Can parse compiler/test output into extracts (log → code). Rust binary; **MCP primary** + npm SDK. **Zero
setup, fully local.**

### 6.2 codesearch (flupkede, Rust) — hybrid vector + BM25 with RRF

Multi-repo. **Reciprocal Rank Fusion (RRF, k=60)** of **arroy ANN** (vectors in **heed/LMDB**) + **Tantivy
BM25**. Tree-sitter **semantic chunking** (function/class/Markdown-section boundaries). **fastembed** (CPU-only,
no runtime model download). Symbol nav (`find` → defs/usages/imports/dependents; C# via scip-csharp).
MCP-primary; `compact=true` returns metadata, agent fetches full code via `get_chunk` **on demand**.

**Family-C takeaway:** **ripgrep→tree-sitter two-stage** (Probe) is a zero-setup, fully-deterministic way to
return *whole blocks not line fragments* — strongly aligned with "read the symbol, not the file." **RRF
fusion** (codesearch) combines lexical + semantic without a learned ranker. **On-demand full-code fetch**
(both) is a direct token-saver: return compact metadata first, expand only on request.

---

## 7. Family D — Embeddings / semantic retrieval

> AST-chunk → embed → vector ANN (often fused with BM25). Highest semantic recall; **requires an embedding
> model** (local ~100 MB–1 GB, or cloud API key + **code egress**) and a **vector store**.

| Tool | Chunking | Embedding | Vector store | Incremental | Token claim | Local/no-key? |
|---|---|---|---|---|---|:--:|
| **cocoindex-code** (Apache-2.0) | tree-sitter ~1000-char chunks | sentence-transformers (`[full]`, ~1 GB torch) or LiteLLM cloud | **sqlite-vec** | via CocoIndex engine | **~70%** | local model OR key |
| **CocoIndex** (engine) | RecursiveSplitter (tree-sitter, 30+ langs) | user-supplied fn | pgvector/LanceDB/Milvus/Neo4j | **memoization `hash(input)+hash(code)`, row-level provenance, ~80–90% cache, <1 s Δ, 10× cost cut at scale** | — | depends |
| **Continue** | `codeChunker` (tree-sitter, collapse children to `{…}`) + line-based for prose | multi-provider (OpenAI/Ollama/Gemini/Bedrock…) | **LanceDB** (local) + SQLite FTS5 | git-diff change detection + remote chunk cache; batch 200 files | — | only with Ollama |
| **Roo Code** | tree-sitter captures; SHA256 dedup per block | multi-provider (Ollama nomic-embed-code…) | **Qdrant** (local Docker / cloud) | file-watch + hash invalidation | — | only with Ollama+Qdrant |
| **claude-context** (zilliztech) | AST-aware | multi-provider (Voyage code-3…) | **Milvus / Zilliz Cloud** | **Merkle-tree incremental** | **~40%** | cloud by default |

**Family-D takeaway.** Semantic recall is real (find "rate limiting" without the literal token) and the
**incremental-indexing machinery is the most transferable idea** regardless of family: CocoIndex's
**memoization by `hash(code)`** (rewrite the chunker → only affected chunks recompute), claude-context's
**Merkle-tree** invalidation, Continue's git-diff + cache-by-(file-hash, model-config). **But the embedding
dependency is a hard cost:** a local model is ~100 MB–1 GB of torch, a cloud model means **API key +
per-token cost + code leaving the machine**, and a vector store (Qdrant/Milvus) is often an external service.
Notably **Sourcegraph Cody and others retreated *away* from embeddings** at scale (§8.3). Embeddings are the
*opposite* of "verifiable `file:line`" — a semantic match can return plausibly-related-but-wrong code.

---

## 8. Family E — LSP & precomputed-index protocols

### 8.1 Serena — LSP-over-MCP, compiler-grade precision

Wraps **real language servers** (Pyright, rust-analyzer, clangd, gopls, JDK, .NET…) and exposes symbolic MCP
tools: `find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, `find_implementations`,
`type_hierarchy`, `rename_symbol`, `replace_symbol_body`, `insert_before/after_symbol`, `search_for_pattern`,
`safe_delete`. **Token mechanism = read the symbol, not the file** (reported **~4k vs ~38k tokens** for a
rename task — ~10×). **Persistent memory** (`.serena/memories/` markdown + global) survives session resets.
40+ languages. **Cost:** per-language LSP **runtime** must be installed + started (download + warm-up
latency); doesn't scale much past ~500k LOC; setup friction high.

### 8.2 SCIP — precomputed code-intelligence index format (Sourcegraph, successor to LSIF)

A **language-agnostic protobuf index** (`Index → Document → {Occurrence, SymbolInformation}`); symbols are
**human-readable IDs** (`"python numpy@1.26.0 numpy ndarray __init__"`) with **monikers** for cross-repo
linkage; `symbol_roles` bitset (Definition/Reference/Read/Write/Generated/Test), `syntax_kind`; **occurrence
ranges packed as `repeated int32`** (3–4 ints) → **~4–8× smaller than LSIF**. **Fully offline static files**;
indexers exist for 12+ languages (scip-typescript/python/java/clang/dotnet/ruby…); `scip` CLI to query.
**Instructive as an interchange format:** index once (e.g., in CI) → many agents query the static index
with no server, version-aware via `package@version`.

### 8.3 Sourcegraph Cody — historical (OSS repo private since Aug 2024; Free/Pro discontinued 2025)

Hybrid: local tree-sitter on open buffers + remote BM25 + (initially) **ada-002 embeddings**. **Pivoted away
from embeddings** toward sparse/keyword search at 100k-repo scale (privacy + scaling). Its papers/posts
describe context retrieval as a two-stage **retrieve-then-rank** engine fed by complementary sources
(keyword, semantic, natural-language, code-graph), with retrieval evaluated separately from end-to-end task
quality. Cloud-only; historical architectural lesson: **embeddings are expensive and fragile at scale;
hybrid keyword-first + complementary-source ranking won out.**

**Family-E takeaway.** Serena's **"read-symbol-not-file"** is the cleanest articulation of the read-token
win, and is **compiler-accurate / deterministic** (no ranking, no false positives) — but the **per-language
LSP runtime** is heavy (disqualifies it as a *core* for a lightweight CLI; ideal as a *complement* on
already-set-up projects). **SCIP** is the strongest idea here for portability: a precomputed, offline,
version-aware index format a graph could **emit/consume** to interop with the wider ecosystem. **Cody** adds
the retrieve-then-rank + complementary-sources design pattern.

---

## 9. Research papers — methods, numbers, evaluation

### 9.1 Token economics & pruning (the "why" + "how much")

- **"How Do AI Agents Spend Your Money?" (arXiv 2604.22750).** Measured 8 frontier models on SWE-Bench
  Verified. **~1000× tokens vs chat; input-token-bound; same task varies up to 30×; models can't predict
  their own spend (corr ≤0.39, systematically underestimate); accuracy non-monotonic in spend.** →
  establishes input/read is the lever and "more reading" can *hurt*.
- **SWE-Pruner (arXiv 2601.16746).** A **0.6B "skimmer"** (Qwen3-Reranker backbone, CRF line-level labeling,
  task "goal hints") as **middleware between agent and file reads**. **76.1% of agent tokens = read ops**
  (the key baseline). Results: **39% token / 26.8% cost reduction, <1% quality loss** (Sonnet 4.5);
  **14.84× compression** single-turn; **18–26% fewer rounds**; **87.3% AST validity** (vs 0.29% naive
  token-level). → proves read-token pruning is both safe and large; **goal-hint = task-aware retrieval** is
  the precision lever. *(Note: an earlier secondary framing cited a "23–54%" task-token band; the
  load-bearing primary figures here are 39% token / 26.8% cost — see §12.)*
- **SWE-ContextBench (arXiv 2602.08316).** 300 experience tasks + 99 derivatives; 5 settings (no-exp / free /
  oracle × trajectory / summary). **Oracle Summary Reuse: 34.34% vs 26.26% baseline** (+30.8%), with the
  **lowest runtime *and* token count**. Free (agent-selected) ≪ Oracle → **retrieval *precision* is the
  bottleneck**; **good summary > full trajectory** → **representation (conciseness+precision) > raw volume**.
  Corollary: incorrect or unfiltered context can have limited or negative benefit — session memory must be
  selective and typed, not a raw transcript dump.

### 9.2 Retrieval & knowledge-graph methods

- **FastContext (Microsoft, arXiv 2606.14066).** **Repo exploration = 56.2% of tool-use turns.** A dedicated
  **4B–30B exploration subagent** (SFT on Sonnet trajectories + **RL with patch-derived location rewards**,
  file/line F1) separated from the solver, returns **only file paths + line ranges**, never the exploratory
  trace. **+5.5% solve-rate & 14.1% token cut (SWE-bench Pro); up to 60.3% token cut (SWE-QA); explorer
  overhead ~2.1%.** → **separating exploration from solving recovers tokens**; task-aware RL beats general
  embeddings for *localization*.
- **Codebase-Memory (arXiv 2603.27277).** See §4.2 — tree-sitter KG over MCP, **10× fewer tokens, sub-ms
  queries, 83% quality**, 66 langs, 14 typed tools, community detection.
- **RepoCoder (arXiv 2303.12570, EMNLP'23).** **Iterative retrieval-generation**: retrieve → generate partial
  → **use the generation as the next query** → re-retrieve → re-generate. **>10% over in-file baseline in all
  RepoEval settings** (line / API / function granularity). → **iterative beats single-shot**; cheap re-query
  matters (graphs re-query cheaply; embeddings pay dense-search per round).
- **CodeSearchNet Challenge (arXiv 1909.09436).** 6 languages, 6M functions, 2M (code, doc) pairs, 99 expert
  NL queries w/ relevance grades; **rank-aware metric (NDCG)**. → the eval baseline for NL→code search;
  there is real vocabulary mismatch between code and natural language, so keep semantic search in the
  architecture — literal search alone misses concept-level queries; ranking quality, not binary recall, is
  what to measure.

### 9.3 What the papers collectively establish

1. **Where the tokens go:** input-bound; **~56% of turns = exploration**, **~76% of tokens = reads** — the
   exact two targets.
2. **How much is recoverable:** independent systems land at **~14–60% token reduction with neutral-to-positive
   quality** (SWE-Pruner 39%, FastContext 14–60%, Codebase-Memory 10×) — *if retrieval is precise*.
3. **How to evaluate:** measure **success-rate AND tokens together** (Pareto frontier); use **rank-aware
   metrics** (NDCG/MRR, CodeSearchNet) and an **oracle ceiling** (SWE-ContextBench: "% of oracle benefit
   captured"); test on **multi-turn SWE-Bench-style** tasks, not single-shot QA; report tool-call count and
   rounds (FastContext/codegraph), not just tokens; benchmark with **multiple runs and medians** given the
   up-to-30× run-to-run variance.

---

## 10. Cross-cutting technique toolbox

Techniques worth extracting, each tagged for compatibility with tk's documented invariants
(**100% local · no API key · no code egress · no native compilation · "never fabricate, lossless
recovery"**). This is a *catalogue*, not a design.

| Technique | Source(s) | What it does | tk-invariant compatible? |
|---|---|---|:--:|
| tree-sitter **WASM** extraction (`web-tree-sitter`+`tree-sitter-wasms`) | codegraph, Repomix, GitNexus | parse 20+ langs, **no native build** | ✅ (the enabling choice) |
| `node:sqlite` + **FTS5** embedded store | codegraph, Codebase-Memory | graph store + full-text symbol search, **zero external dep** (Node ≥22.5) | ✅ |
| Symbol/call/import **graph + BFS traversal** | codegraph, Codebase-Memory | relational answers (callers/callees/impact) | ✅ |
| **PageRank w/ personalization** | aider | rank symbols, seeded by what the conversation mentions | ✅ (optional ranking upgrade) |
| **Signature-collapse** (container → outline, body dropped) | Repomix, codegraph, Continue | ~70% fewer tokens, keep structure | ✅ (mirrors `read --level aggressive`) |
| **BM25 / FTS** lexical search | Probe, codesearch, codegraph | exact-name & keyword find | ✅ |
| **RRF fusion** of rankers | codesearch | combine lexical + semantic w/o learned model | ✅ (lexical side only, no embeddings) |
| **ripgrep→tree-sitter two-stage** | Probe | fast candidate-gen → whole-block extract | ✅ |
| **On-demand full-code fetch** (compact metadata first) | Probe, codesearch | return pointers, expand on request | ✅ (strong read-token saver) |
| **Metadata-first retrieval contract** (`compact=true` default) | codesearch | search is a bounded selection stage, not a file-dump stage | ✅ |
| **Bounded broad search** (caps: matches/file, files/set, chars/snippet) | Probe `--max-tokens`, codesearch | project raw grep into grouped candidates, not raw lines | ✅ |
| **Incremental indexing**: `(path,mtime,size)` / Merkle / `hash(code)` memoization | codegraph, claude-context, CocoIndex | re-index only changed files | ✅ (tk already has the mtime cache) |
| **Provenance tagging** of heuristic edges | codegraph | agent can tell parsed from inferred | ✅ (matches tk quality-gate) |
| **Low-confidence honest hand-back** | codegraph | never a confident wrong answer | ✅ (is tk's quality-gate, applied to graphs) |
| **Per-file staleness banner** | codegraph | flag edited-since-index files, tell agent to Read | ✅ |
| **Adaptive output budget** (tier by repo size) | codegraph | scale per-file caps so small repos aren't bloated | ✅ |
| **Log → code extraction** (failure-first structured log) | Probe | parse compiler/test output to referenced ranges, not raw log | ✅ (high-value, noisy-output bucket) |
| **Diff-only / delta verification** | git-aware tools, FastContext | post-edit, return hunks not whole-file rereads | ✅ |
| **Read-symbol-not-file** symbolic nav | Serena | compiler-accurate def/ref/impl | 🟡 needs LSP runtime (complement, not core) |
| **SCIP** precomputed-index interchange | SCIP | offline, version-aware, ecosystem-interop index | 🟡 portable idea (emit/consume) |
| **Retrieve-then-rank + complementary sources** | Cody | fuse lexical/semantic/graph, rank under budget | ✅ (lexical+graph side) |
| **MCP delivery + ≤4 tools + server-instructions** | codegraph, Codebase-Memory, Serena, most | reach the agent's tool loop directly; fewer tools steer better | ✅ |
| **Hand-rolled JSON-RPC stdio** (no SDK) | codegraph | MCP without a dependency | ✅ |
| **Goal-hint / task-aware retrieval** | SWE-Pruner, FastContext | agent states the information need → precision | ✅ (query param) |
| **Iterative re-query** (generation → next query) | RepoCoder | multi-round retrieval beats single-shot | ✅ (cheap on a graph) |
| **Repository-local agent policy file** | Continue, Roo Code | rules shape agent behavior; tools alone don't prevent waste | ✅ (tk already writes a marker) |
| **Embeddings / vector ANN** | Family D | semantic recall beyond exact names | 🔴 needs model/key/egress + vector store + native-ish; conflicts with tk invariants |
| **Daemon + native file watcher** | codegraph | always-fresh, amortized warm index | 🟡 powerful but heavy (lockfiles, sockets, Windows pipes) |
| **Community detection / flow tracing** | GitNexus, Codebase-Memory | architectural clustering, entry-point flows | ✅ (advanced, optional) |
| **RL-trained compact explorer** | FastContext, SWE-Pruner | a small model does localization/pruning | 🔴 needs a model + training pipeline |

**Compatibility summary.** Families **A (structural graph), B (packing), C-lexical (BM25/ripgrep)** and the
**incremental/provenance/honest-handback/MCP/log-projection/policy** machinery are fully compatible with tk's
invariants. Family **D (embeddings)** and the **RL-model** techniques are the ones that conflict
(model/key/egress/training). Family **E** splits: SCIP-as-interchange is a portable idea; LSP-as-core is too
heavy but viable as a complement.

---

## 11. Measurement & evaluation methodology

**Telemetry set (sufficient to evaluate both savings and safety).**

| Metric | Definition | Why it matters |
|---|---|---|
| `raw_bytes` | Raw tool-output bytes before projection | Baseline size |
| `estimated_raw_tokens` | Model-specific token estimate before projection | True savings denominator |
| `filtered_bytes` | Bytes after projection | Compression ratio |
| `estimated_filtered_tokens` | Model-specific token estimate after projection | Main optimization target |
| `input_tokens` | Actual provider-reported prompt tokens when available | Ground truth cost |
| `output_tokens` | Provider-reported completion tokens | Usually secondary cost |
| `cached_input_tokens` | Provider-reported cached prompt tokens | Distinguish cheap replay from real waste |
| `uncached_input_tokens` | Input minus cached input | Best measure of avoidable cost |
| `tool_calls` | Number of external tool invocations | Proxy for exploration churn |
| `file_reads` | Count of read-like operations | Core waste source |
| `duplicate_reads` | Reads whose effective file hash and selector were already seen in-session | Direct waste signal |
| `search_calls` | Count of search-like operations | Search discipline |
| `search_result_usefulness` | Whether a search result led to a follow-up read/edit/verification within the next few steps | Quality of retrieval, not just quantity |
| `distinct_files_touched` | Unique files surfaced to the agent | Context sprawl |
| `repeated_file_reads` / `repeated_range_reads` / `repeated_symbol_reads` | Same file/range/symbol read multiple times | Dedup / range / symbol cache value |
| `success_rate` | Task completion correctness rate | Do not trade away task quality |
| `task_latency` | End-to-end wall-clock time | Compression that slows work too much is not useful |
| `fallback_rate` | Share of projections escalated to full or exact reads | Safety-pressure indicator |
| `omission_bug_rate` | Failures caused by missing facts in projected context | Core safety metric |

**Operational definitions (documented by the source systems).** `search_result_usefulness` is defined
mechanically: a search is useful if one of its top candidates is subsequently read, edited, appears in the
final diff, or is named in the final answer within the next `k` tool actions. `duplicate_reads` is keyed by
`(normalized_path, selector_type, selector_value, file_hash)`, distinguishing "same path after change" from
"same path unchanged." Byte count alone is unreliable for fine-grained budgeting; token estimators should be
**model-aware** and calibrated against provider telemetry.

**Benchmark task categories (used across the surveyed evaluations).** locate implementation · understand
module architecture · follow call chain · modify function · add test · fix failing test · debug build error ·
inspect git diff · update config · understand component state flow · trace API route → service → database.

**System variants to compare.** baseline agent · baseline + output compression only · baseline + smart read ·
baseline + repo map · baseline + symbol index · baseline + semantic search · baseline + full gateway.

**Per-run metrics.** total / input / output / cached / uncached tokens · tool calls · search calls · file
reads · repeated reads · distinct files touched · success rate · edit correctness · latency · human
intervention count · false-negative rate · context-omission-bug rate.

**Safety via fallback replay (the cleanest documented method).** (1) Run the task with the projection layer
enabled. (2) If the run fails — or succeeds with suspicious retries — identify the projected evidence the
layer introduced. (3) Re-run from the same checkpoint with only those outputs escalated to raw/larger-exact
form. (4) If the task flips failure→success or the answer fixes a factual omission, count a **context
omission bug**. This is essential because (SWE-ContextBench) incorrect or unfiltered context can harm
performance, and (arXiv 2604.22750) token spend alone does not predict performance.

**Evaluation principle.** Separate **retrieval quality** from **end-to-end task quality** (Cody's
methodology); report medians and spread across multiple runs (high run-to-run variance); high compression
ratios that do **not** reduce uncached input tokens or improve task success are not real wins.

---

## 12. Documented risks & failure modes

A record of the failure modes the surveyed systems and papers explicitly flag (neutral catalogue, not
ranked):

1. **Over-compression of actionable code** — the projector removes a literal or branch needed to edit/debug
   (Repomix marks body-dropping experimental; SWE-ContextBench shows bad context hurts).
2. **False confidence on semantic matches** — a candidate looks plausible but is the wrong implementation
   (Family-D failure mode; the reason Cody retreated from embeddings).
3. **Stale indexes** — the agent trusts cached maps/symbols after edits (codegraph mitigates with a per-file
   staleness banner).
4. **Cross-language blind spots** — JS↔TS↔native bridges, generated code, framework indirection break local
   graphs (codegraph's framework/bridge resolvers exist precisely here).
5. **Broken edit windows** — an exact slice too small to contain an invariant outside the window.
6. **Parser gaps** — tree-sitter/regex heuristics fail on uncommon syntax, codegen output, macro-heavy
   languages.
7. **Agent non-compliance** — the host keeps calling raw read/grep despite better tools (CodeGraph's
   maintainers note instruction-only steering is weak vs the tool contract + answer sufficiency).
8. **Reader-writer mismatch** — understanding views are good but the write path still forces whole-file
   rereads.
9. **Platform friction** — file watching, path normalization, shell quoting, and PowerShell output drift from
   Unix assumptions (relevant to tk's Windows install base).
10. **Optimizing the wrong number** — high compression ratios that don't reduce uncached input tokens or
    improve task success are fake wins.

---

## 13. Comparison matrices · Verification · References

### 13.1 Master comparison (all surveyed tools)

| Tool | Family | Extract | Store | Local/no-key/no-egress | Native build | Delivery | License | Token claim |
|---|---|---|---|:--:|:--:|---|---|---|
| **codegraph** | A | TS-WASM | node:sqlite+FTS5 | ✅ | ❌ | MCP+CLI | **MIT** | 47% tok / 58% calls |
| Codebase-Memory | A | TS | SQLite | ✅ | (C binary) | MCP | paper | 10× tok |
| GitNexus | A | TS-WASM | KuzuDB-WASM | ✅ | ❌ | MCP+CLI+web | **PolyForm-NC** | 74% tok |
| CodeGraphContext | A | TS | Falkor/Kuzu/Neo4j | ✅ | varies | MCP+CLI | OSS | — |
| aider repo-map | B | TS tags | diskcache | ✅ | ❌ | built-in | Apache-2.0 | budget-bounded |
| Repomix | B | TS-WASM | none | ✅ | ❌ | CLI+MCP | MIT | ~70% |
| Probe | C | ripgrep+TS | per-ws SQLite | ✅ | (Rust bin) | MCP+CLI | OSS | `--max-tokens` |
| codesearch | C+D | TS | LMDB+Tantivy | ✅ (fastembed CPU) | (Rust bin) | MCP+HTTP | OSS | metadata-first |
| cocoindex-code | D | TS ~1k-char | sqlite-vec | ⚠️ model | (Rust core) | MCP+Skill | Apache-2.0 | ~70% |
| Continue | D | TS+line | LanceDB+SQLite | ⚠️ Ollama | (LanceDB bin) | extension/npm | Apache-2.0 | — |
| Roo Code | D | TS | Qdrant | ⚠️ Ollama+Qdrant | (Qdrant) | extension/npm | OSS | — |
| claude-context | D | AST | Milvus/Zilliz | 🔴 cloud default | (Milvus) | MCP | OSS | ~40% |
| Serena | E | LSP | language server | ✅ | per-lang LSP | MCP | OSS | ~10× (rename) |
| SCIP | E | indexers | protobuf files | ✅ | per-lang indexer | static index | Apache-2.0 | — |
| Cody (hist.) | D/E | TS+BM25+embed | cloud | 🔴 | — | SaaS | private | — |

### 13.2 Approach trade-off (for the stated goal: cut search + read tokens, under tk's invariants)

| Dimension | Structural graph (A) | Packing (B) | Lexical/hybrid search (C) | Embeddings (D) | LSP (E) |
|---|:--:|:--:|:--:|:--:|:--:|
| Cuts **search** tokens | ✅ (one explore call) | 🟡 (one big blob) | ✅ | ✅ | ✅ |
| Cuts **read** tokens | ✅ (verbatim relevant src) | ✅ (signatures) | ✅ (whole blocks) | ✅ | ✅ (symbol body) |
| Relational queries (callers/impact) | ✅ | ❌ | 🟡 (limited) | ❌ | ✅ |
| Semantic recall (no exact name) | 🟡 (FTS only) | ❌ | 🟡 (BM25) / ✅ (vectors) | ✅ | ❌ |
| 100% local / no key / no egress | ✅ | ✅ | ✅ (lexical) | ⚠️/🔴 | ✅ |
| No native build | ✅ (WASM) | ✅ | (Rust bins) | ⚠️ | per-lang runtime |
| Verifiable `file:line` (quality-gate fit) | ✅✅ | ✅ | ✅ | 🔴 | ✅✅ |
| Setup friction | low (one index) | none | none/low | high | high |
| Scales to large monorepo | ✅ | 🔴 | ✅ | ✅ | 🟡 |

### 13.3 Adjacent projects worth monitoring (clearly separate from the surveyed set)

`code-review-graph` — a newer structural-map system for review workflows; claims substantial token reductions
on its own published evaluations (project-published, not peer-reviewed). `codebase-memory-mcp` — the
implementation line adjacent to the Codebase-Memory paper; emphasizes persistent local knowledge-graph
queries over file-by-file reading. Directional signals; treat their benchmarks more cautiously than the
paper-backed findings above.

### 13.4 Verification notes

- Tool facts: codegraph and cocoindex-code were **cloned and read in full**; aider/Repomix/Probe/codesearch/
  Continue/Roo Code/Serena/SCIP/Cody via source + docs + web this pass.
- **Paper figures are as-extracted on 2026-06-18** via arXiv HTML/abstract. The 2026-dated IDs
  (2601/2602/2603/2604/2606.*) were fetched this pass; **treat specific percentages as directional**, and
  re-confirm against the primary PDF before quoting externally. The two load-bearing numbers (read-ops ≈ 76%,
  exploration ≈ 56% of turns) are mutually corroborating and consistent with the qualitative "60–80%
  orientation" figure.
- **Reconciliation:** the merged sources carried two framings of SWE-Pruner's savings — a precise
  "39% token / 26.8% cost / 14.84× / 87.3% AST validity" set (from the arXiv 2601.16746 fetch) and a
  secondary "23–54% task-token" band. This report treats the precise arXiv-fetched set as canonical and
  flags the band as unreconciled pending a primary-PDF check.
- Star counts and "winning pattern" framing are from secondary syntheses (rywalker, MarkTechPost) and drift;
  not load-bearing here.

### 13.5 References

**Projects** — codegraph https://github.com/colbymchenry/codegraph (MIT) · cocoindex-code
https://github.com/cocoindex-io/cocoindex-code · CocoIndex https://github.com/cocoindex-io/cocoindex ·
Serena https://github.com/oraios/serena + https://oraios.github.io/serena/ · aider
https://github.com/Aider-AI/aider + https://aider.chat/docs/repomap.html +
https://aider.chat/2023/10/22/repomap.html · codesearch https://github.com/flupkede/codesearch · Probe
https://github.com/probelabs/probe · Repomix https://github.com/yamadashy/repomix +
https://repomix.com/guide/code-compress · Continue https://github.com/continuedev/continue +
https://docs.continue.dev/guides/codebase-documentation-awareness · Roo Code
https://github.com/RooCodeInc/Roo-Code · Sourcegraph Cody https://sourcegraph.com/cody (+ archived
cody-public-snapshot) · SCIP https://github.com/sourcegraph/scip · claude-context
https://github.com/zilliztech/claude-context · GitNexus https://github.com/abhigyanpatwari/GitNexus
(PolyForm-NC) · CodeGraphContext (OSS, Python).

**Papers** — FastContext (Microsoft) https://arxiv.org/abs/2606.14066 + https://github.com/microsoft/fastcontext ·
Codebase-Memory https://arxiv.org/abs/2603.27277 · "How Do AI Agents Spend Your Money?"
https://arxiv.org/abs/2604.22750 · SWE-Pruner https://arxiv.org/abs/2601.16746 · SWE-ContextBench
https://arxiv.org/abs/2602.08316 · CodeSearchNet Challenge https://arxiv.org/abs/1909.09436 · RepoCoder
https://arxiv.org/abs/2303.12570.

**Companions** — [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md) ·
design: [`code-graph-design-20260618.md`](../legacy/code-graph-design-20260618.md). **Superseded sources merged into
this report:** [`code-graph-research-20260618.md`](./code-graph-research-20260618.md) ·
[`deep-research-report-low-token.md`](./deep-research-report-low-token.md).
