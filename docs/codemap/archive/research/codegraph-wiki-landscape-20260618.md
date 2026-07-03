# Code-Graph + Wiki Landscape — "one graph, MCP/CLI for agents + Wiki/GUI/HTML for humans"

_Research date: 2026-06-18. 10 projects cloned/studied under `/tmp/tk-research/` (clones not committed). Recording facts only — no ranking/recommendation per the project's research convention._

## The thesis being evaluated

> **One code knowledge graph.** Expose it to AI agents via **MCP/CLI**, and to humans via **Wiki/GUI/HTML** — from a single shared base, not two parallel pipelines.

The single most discriminating question asked of every project: **is the SAME index/graph reused for both surfaces, or are agent and human two separate builds?**

## Verdict matrix

| Project | Real parser graph? | Agent surface (MCP/CLI) | Human surface | One shared base? | Incremental | License |
|---|---|---|---|---|---|---|
| **GitNexus** | ✅ tree-sitter, ~40 node / ~28 edge types | ✅ MCP (~17 tools) + CLI | ✅ Sigma.js graph explorer + AI chat + LLM Code-Wiki HTML | ✅ **one backend, 3 front-ends** | ✅ subgraph writeback + git staleness | ❌ **PolyForm Noncommercial** |
| **DeepWiki** (Cognition) | ⬜ undisclosed | ✅ **public auth-free MCP** (3 tools) | ✅ web wiki + "Ask Devin" chat | ✅ | ⚠️ scheduled regen (hours–days lag) | closed/SaaS |
| **Google Code Wiki** | ⬜ undisclosed (Gemini agent) | ⚠️ Gemini CLI extension (waitlist), no public MCP | ✅ web wiki, deep-link prose→code, Gemini chat | ✅ | ✅ **per-commit regen** | closed/preview |
| **OpenDeepWiki** | ❌ (shells out to external `graphify`) | ✅ MCP (3 tools), per-repo endpoints | ✅ Next.js wiki + chat + embed widget | ✅ DB-backed markdown + `SourceFiles` provenance | ✅ commit-diff driven | MIT |
| **RepoDoc** | ✅ **heterogeneous** code/doc/concept graph | ⚠️ CLI + internal `graph_store` tool (not MCP) | ⚠️ markdown + `.mmd` only, no viewer | ✅ | ✅ **soundest algorithm** (AST-diff + edge traversal) | ❌ **no license file** |
| **RepoAgent** | ✅ AST + Jedi reference graph (Python only) | ⚠️ CLI + git pre-commit hook, no MCP | ✅ markdown + GitBook + Gradio RAG chat | ✅ meta-info tree | ✅ **best invalidation** (two-snapshot ref-set diff) | Apache-2.0 |
| **CodeWiki** (FSoft) | ✅ tree-sitter/AST, single untyped `depends_on` | ✅ MCP (3 tools) | ✅ self-contained `index.html` + FastAPI viewer | ✅ | ⚠️ coarse (path-substring + tree-ancestor) | MIT, ACL 2026 |
| **Understand-Anything** | ✅ tree-sitter + LLM, 21 node / 35 edge types | ❌ no MCP (slash-commands re-prompt) | ✅ **best UX** — React Flow, lazy-expand, tours | ✅ one JSON, two renderers (read-only) | ✅ fingerprint + hooks | MIT |
| **Davia** | ❌ no graph (1000-file/130k raw dump) | ⚠️ 5 file tools, no MCP | ✅ **Notion-like editor**, agent-writes/human-edits | ✅ same on-disk files | ❌ re-reads everything | MIT |
| **deepwiki-open** | ❌ **pure chunk-RAG, hallucinated mermaid** | ❌ none | ✅ Next.js wiki + Ask/Deep-Research | ✅ one FAISS index | ❌ none (manual cache delete) | MIT |

## What each project got right (steal these)

### Architecture spine — GitNexus (validated at 42K★)
One `KnowledgeGraph` schema → one `LocalBackend` query layer → three thin front-ends: **MCP-stdio (agents), HTTP bridge (web UI), CLI-direct**. The web UI is explicitly "a thin client — all queries via `gitnexus serve` HTTP API." This is *exactly* the target thesis, already shipped. Graph-DB choice: **embedded Cypher DB (LadybugDB, KuzuDB-fork)** with a **hybrid schema** — one node table per element type + a single `CodeRelation` edge table with a `type` property — so LLMs write natural Cypher and the same schema runs **native AND WASM-in-browser**. Directly answers tk's ADR-0015 (node:sqlite vs graph-DB) with a working WASM-portable alternative.

### Graph schema — RepoDoc's `HeterogeneousGraph` (~200 LOC NetworkX)
The closest existing model to "one graph for code + docs + concepts":
- **3 node types**: `CodeNode` (file/class/function + source + lines), `DocNode` (markdown/mermaid fragment, has `version:int` for staleness), `ConceptNode` (business concept, `confidence:float`).
- **4 typed weighted edges**: `calls`, `implements`, `describes` (doc↔code), `semantic_impact` (concept↔code).
- Serializes to one `{project}_knowledge_graph.json`.

### Incremental algorithm — RepoDoc (soundest) + RepoAgent (most precise invalidation)
**RepoDoc** does AST-level diff, not text diff: classify each changed component into a `ChangeType` (`NEW`/`REMOVED`/`API_SIGNATURE_CHANGED`/`DOCSTRING_CHANGED`/`CODE_BODY_CHANGED`/`COMMENT_ONLY`), **drop docstring/comment-only changes → zero LLM calls**, then BFS downstream along `calls`+`semantic_impact` edges, topological regen order, and `git show`/`ast.get_source_segment` to extract **only the changed component's source** (not the file).

**RepoAgent** adds the precise invalidation trick: rebuild a fresh graph, structurally align nodes to the previous graph by path, then set each node's status from (a) `code_content` equality AND (b) **set-difference of the `who_reference_me` referencer-ID list** — cleanly separating "my code changed" from "my callers changed." The `new ⊆ old` (caller removed) vs not (caller added) distinction is a cheap precise signal. Plus the **"fake file" trick**: swap dirty working-tree file out, write HEAD content in, parse at commit-state, restore — for "what should the doc say at commit time."

> **Avoid CodeWiki's incremental**: substring-path matching + module-tree-ancestor-only propagation ignores actual call-graph dependents — coarse and unsound.

### Agent API contract — DeepWiki's 3-tool ladder
`read_wiki_structure` → `read_wiki_contents` → `ask_question`. Agent fetches a **cheap outline first, pulls full content only when needed** — token-frugal by construction. **Public, auth-free** MCP (`claude mcp add -s user -t http deepwiki https://mcp.deepwiki.com/mcp`) was the distribution lever that made it the default repo-context MCP. GitNexus's richer set (`query`, `context`, `impact`, `cypher`, `detect_changes`, `trace`) shows the navigation-tool ceiling.

### Control file — DeepWiki's `.devin/wiki.json`
Repo-checked declarative page control. `pages: [{title, purpose, parent, page_notes}]` is **authoritative ("no more, no less")**; free-text `repo_notes`/`page_notes` steer the generator; hard caps (30/80 pages, 100 notes, 10k chars/note) make cost predictable. Google Code Wiki has **no equivalent** — a gap.

### Token-cost levers (relevant to tk's identity)
- **Subscription-mode LLM** — CodeWiki's `caw` backend runs generation via the local `claude`/`codex` CLI (OAuth, no API key) → users spend their Pro/Max sub, not API tokens. Directly on-brand for a token-killer product.
- **Precompute over compress** — GitNexus's pitch: the graph pre-structures answers so an agent gets callers/cluster/confidence in **one tool call instead of a 10-query grep chain**. A *different lever* than tk's current surface-10 output compression.
- **Built-in token measurement** — RepoDoc logs per-operation `token_usage` to `metadata.json`, giving a ready full-gen-vs-incremental A/B denominator — aligns with tk's measurement-harness-first plan.
- **Prompt-cache discipline** — Davia's rolling `cache_control {ttl:5m}` on the last message; OpenDeepWiki's cache-creation-vs-hit accounting + stable cache keys.

### Human UX bar — Understand-Anything (read-only) + Davia (editable)
- **Understand-Anything**: two-level **lazy-expand** navigation (architectural-layer cluster overview → collapsed folder containers that ELK-layout children only on zoom/focus), aggregate edges with count labels + log-scaled stroke, **dependency-ordered guided tours**, persona-adaptive detail (non-tech/junior/expert). This is what makes a 3000-node graph legible.
- **Davia**: agent-writes / human-edits **bidirectional file-backed editing** — constrained-HTML prose + sidecar JSON/MDX assets, Tiptap Notion editor as a thin view over the same files the agent owns, debounced write-back, no DB. The only project where humans can *edit* the output.

## The open lane (tk's differentiation space)

**No single project ships all of these together:**
1. A **real parser-derived code graph** (not chunk-RAG/hallucinated diagrams) — rules out DeepWiki-open, Davia; OpenDeepWiki outsources it.
2. A **public, auth-free agent MCP** — only DeepWiki + OpenDeepWiki + CodeWiki + GitNexus have MCP at all; Understand-Anything/RepoDoc/RepoAgent/Davia don't.
3. **Per-commit incremental freshness** — only Google Code Wiki + RepoDoc + RepoAgent are commit-precise; DeepWiki lags hours–days.
4. **Measured token savings** — nobody publishes numbers; RepoDoc only logs them internally.
5. **Human-editable** output round-tripping to the graph — only Davia, which has no graph.
6. **Permissive license** the strongest impl (GitNexus) lacks (PolyForm Noncommercial; RepoDoc has no license at all).

That intersection — **real graph + auth-free MCP + per-commit incremental + measured token savings + permissive** — is unclaimed, and the token-measurement + permissive-licence axes are exactly where tk already lives.

## Assembly map (which project to mine for which part)

| Concern | Mine from | Avoid |
|---|---|---|
| Architecture spine (1 backend, N front-ends) | **GitNexus** `local-backend.ts` | parallel agent/human pipelines |
| Graph-DB choice (native + WASM, LLM-friendly Cypher) | **GitNexus** hybrid `CodeRelation` schema | — |
| Graph schema (code+doc+concept, typed edges, DocNode.version) | **RepoDoc** `graph/{graph,models}.py` | CodeWiki's single untyped `depends_on` |
| Incremental: change classification + scoped regen | **RepoDoc** `diff_analysis.py` + `incremental_updater.py` | CodeWiki path-substring invalidation |
| Incremental: precise invalidation + dirty-tree handling | **RepoAgent** `load_doc_from_older_meta` + fake-file trick | RepoAgent's `change_detector.py` (dead code) |
| MCP tool contract (cheap-outline-first ladder) | **DeepWiki** 3-tool + **GitNexus** navigation tools | OpenDeepWiki's 12k-token-per-query LLM summary |
| Page-control file | **DeepWiki** `.devin/wiki.json` | — |
| Token levers (sub-mode LLM, measurement) | **CodeWiki** `caw` + **RepoDoc** `log_operation` | — |
| Human graph nav UX | **Understand-Anything** lazy-expand + tours | heavy read-only-only framing |
| Human editing round-trip | **Davia** file-backed Tiptap | Davia's 130k raw dump (no graph) |
| HTML viewer (self-contained) | **CodeWiki** `viewer_template.html` / **GitNexus** `html-viewer.ts` | — |

## Notable anti-patterns observed
- **deepwiki-open**: diagrams are LLM-hallucinated mermaid, not derived from structure; ~2280-line React component holds generation + inlined prompts. The clearest "what not to copy" for a KG product.
- **OpenDeepWiki**: `SearchDoc` is `LIKE '%query%'` substring + a 12k-token LLM summary per query; plaintext repo creds, seeded default admin.
- **CodeWiki / RepoDoc / RepoAgent** all rely on fragile tag/JSON parsing of LLM output (`eval()` on cluster output in CodeWiki).
- **License traps**: GitNexus = PolyForm Noncommercial (can't lift code), RepoDoc = no license (reimplement, don't copy).

## Source clones
`/tmp/tk-research/{gitnexus, understand-anything, davia, opendeepwiki, deepwiki-open, codewiki, repodoc, repoagent}` (DeepWiki + Google Code Wiki = web research, sources cited inline above).
