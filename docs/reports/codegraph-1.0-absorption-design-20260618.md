# codegraph 1.0 enhancement — base / agent / human layer absorption

_2026-06-18. Companion to [`codegraph-wiki-landscape-20260618.md`](./codegraph-wiki-landscape-20260618.md) (raw research) and [`code-graph-design-20260618.md`](./code-graph-design-20260618.md) (tk's accepted v1 design / ADR 0013-0016)._

**Framing (per user 2026-06-18):** NOT competitor analysis, NOT "must own one base + dual surface." The question is narrower and constructive: across the 10 studied projects, **how is each of the three layers best designed, and how does tk absorb it into `feat/1.0.0`?** Grounded in tk's real choices: `node:sqlite` + FTS, `web-tree-sitter` static engine, 4 MCP tools (`tk_map/read/search/verify`), measurement-first, `src/retrieval` (not yet created), and tk's existing `src/report/html.ts` + `src/inspect` HTML infra.

> tk state check (2026-06-18): codegraph is **accepted design, unimplemented** — no `src/retrieval/` exists yet. So this is design-stage absorption, cheapest possible time to adjust.

---

## Layer 1 — 底座 (the graph base): how to design it best

tk's planned base: `files / symbols / edges` tables + FTS, signatures-only persistence, source read live-from-disk with hash. That is sound. What the field teaches:

### Absorb
1. **One typed-edge table, not one table per edge kind** (GitNexus's hybrid schema, translated to SQL). tk already plans `edges(source, target, kind, confidence, metadata)` — keep exactly this. It is the SQL analog of GitNexus's single `CodeRelation{type}` table: cheap DDL, and any new edge kind is a row value, not a migration. **Confirms tk's current edge model; don't split it.**
2. **Stable string node IDs, references stored as IDs not pointers** (RepoAgent). tk's `relative_path::QualifiedName` (GitNexus/CodeWiki both use this exact form) makes the graph **serializable and diffable across runs** — the precondition for sound incremental. Persist edges as `(srcId, dstId)` string pairs; rehydrate on load. tk's "out-of-tree index" period needs this.
3. **Per-node fingerprint + sorted referencer-set, stored in the row** (RepoAgent's invalidation precondition). Add to the `symbols` table: `code_hash` (content fingerprint) and a derived `referencer_set_hash`. This is what makes "did my code change?" and "did my callers change?" answerable without a full reparse — see Layer-4 incremental below. Cheap to add now, expensive to retrofit.
4. **Typed *weighted* edges with a `confidence`/`source` field** (RepoDoc `{calls, implements, describes, semantic_impact}` weighted; tk already has `confidence`). Keep `confidence` AND add a `source` enum (`static` now, `lsp` later) so v2 LSP can coexist with v1 static edges without silently upgrading semantics — tk's design §4 already wants this; make it a column, not a post-hoc flag.

### Absorb *only if* the Human/Wiki layer is added (see Layer 3 decision)
5. **Heterogeneous node types: CodeNode + DocNode + ConceptNode** (RepoDoc, ~200 LOC NetworkX). tk's v1 base is **CodeNode-only**, which is correct for navigation-only. A `DocNode` (with `version:int` for staleness) and `describes` edge are needed **only** when tk generates human docs/wiki tied to code. Decision gate: don't add these tables in v1 unless the Wiki layer ships; design the migration so they slot in (tk already mandates migrations from v1).

### Don't copy
- **Embeddings / vector store** as the base (deepwiki-open FAISS, OpenDeepWiki none) — out of scope per ADR 0013, and the research confirms graph-backed retrieval beats naive 350-word chunking. tk's FTS + PageRank is the right v1 retrieval primitive.
- **Graph-DB engine** (LadybugDB/Kuzu/NetworkX) — tk's `node:sqlite` choice is fine; GitNexus's value is the *schema shape*, not the engine. Their WASM-portability win is irrelevant to tk's CLI-first delivery.
- **CodeWiki's single untyped `depends_on`** — collapses inheritance/import/call into one set; tk's typed edges are strictly better.

### tk integration
`src/retrieval/store/schema.ts`: `files`, `symbols (+ code_hash, referencer_set_hash)`, `edges(src,dst,kind,confidence,source,meta)`, FTS over name/qualified-name/signature. IDs = `relpath::qualname`. Persist signatures only; never source slices (already in design §4). Migrations from row one.

---

## Layer 2 — Agent 面: how to design it best

tk's planned agent surface: 4 MCP tools `tk_map / tk_read / tk_search / tk_verify`, one deep `src/retrieval` core behind thin CLI + MCP adapters, every response carrying anchors + confidence + measurement facts. The field strongly validates this and sharpens it:

### Absorb
1. **Cheap-outline-first tool ladder** (DeepWiki's `read_wiki_structure → read_wiki_contents → ask_question`). This is the single best agent-API idea in the whole landscape: the agent pulls a **cheap structural outline first, full content only on demand** — token-frugal by construction. tk's `tk_map → tk_read` is already this shape; make it **explicit in tool descriptions and in `tk_map`'s output** ("next recommended `tk_read` target when confidence not high" — already in design §4, elevate it to the contract). This is tk's token-saving mechanism on the agent side: **precompute + bounded outline**, not output compression.
2. **Bounded responses as the token lever** (GitNexus: depth clamps, `include_code:false` default, paginated lists, per-process caps). tk should default every tool to **anchors + signatures, not bodies**; `tk_read` is the only body-returning tool, and it returns the *smallest resolving slice*. Add explicit token-budget inputs (tk design already has "token budget" per request kind) and **log returned vs. avoided bytes** (tk's measurement facts).
3. **"One backend, thin adapters"** (GitNexus `LocalBackend` → MCP/HTTP/CLI; CodeWiki MCP calls same `run()` as CLI). tk already plans `src/retrieval` as a deep module with CLI + MCP adapters that "must not reinterpret model-facing output." Validated at 42K★ scale — **keep this seam rigid**; it is also what lets a future Human/HTTP surface reuse the same core for free (Layer 3).
4. **Provenance / `SourceFiles` on every answer** (OpenDeepWiki) — tk already mandates resolvable anchors + content hash. This is what makes "cite the file:line" answers and the verify gate possible. Keep it a hard correctness gate (tk design §7), not a nicety.

### Absorb as v2 candidate tools (don't add to v1's 4)
5. **`impact` / `trace` / `detect_changes`** (GitNexus). These are the high-value *navigation* tools beyond map/read/search: blast-radius (downstream dependents of a change), shortest-path between two symbols, git-diff→affected-symbols. They fit tk's graph perfectly and are pure-static (no LLM). **`tk_verify` already overlaps `detect_changes`.** Keep v1 at 4 tools (ADR scope discipline); note `impact`/`trace` as the first v2 additions once measurement proves ROI.

### Don't copy
- **OpenDeepWiki's `SearchDoc` = `LIKE '%query%'` + a 12k-token LLM summary per query** — burns tokens to paper over weak retrieval. tk's FTS + symbol/callers modes are better and LLM-free.
- **Slash-command "re-prompt the host LLM" as the agent API** (Understand-Anything has no real query engine; "semantic search" is dead code). tk's MCP tools with a real query core are the right call.
- **Re-reading the whole repo per call** (Davia's 1000-file/130k dump). tk's hash-incremental refresh is correct.

### tk integration
Keep `src/retrieval/mcp/*` at exactly 4 tools (schema-snapshot test enforces this, design §7). Encode the outline-first ladder in tool descriptions + `tk_map` "next read" hint. v2 backlog: `tk_impact`, `tk_trace` reusing the same `edges` table.

---

## Layer 3 — Human 面: how to design it best (tk's real gap)

**This is where tk's v1 is thinnest.** ADR 0013/design §2 give humans only `tk graph map/read/...` **CLI text**. Every studied project invests heavily here, and tk already owns the infra to do it cheaply: **`src/report/html.ts` + `src/inspect` HTML reports**. The design question is a fork:

### Option A — no-LLM graph→HTML explorer (fits v1 measurement-first, recommended start)
Render the **same `graph.db`** as a self-contained, offline HTML repo-map/graph explorer — **zero LLM, zero new token cost, no freshness lag.** Absorb:
- **Self-contained `index.html` with inline JSON + client-side render** (CodeWiki `viewer_template.html`, GitNexus `html-viewer.ts`) — exactly the shape `src/report/html.ts` already emits. Embed symbols/edges/PageRank as inline JSON; render with the existing light-theme + restrained `#001AFF` (per tk's HTML-reports memory).
- **Two-level lazy-expand navigation** (Understand-Anything `GraphView.tsx`): architectural-cluster overview → collapsed folder containers that expand on click/zoom; aggregate edges with count labels + log-scaled stroke. This is *the* trick that makes a multi-thousand-node graph legible — and it needs no LLM, just the graph.
- **Graph renderer ≠ mermaid.** Once the human surface is real HTML+JS (not markdown), mermaid is the wrong primary engine — it chokes past a few hundred nodes, is non-interactive (no pan/zoom/lazy-expand/click-focus), and relayouts poorly. The studied *explorers* avoid it: GitNexus uses **Sigma.js+graphology** (WebGL, scales), Understand-Anything uses **React Flow+ELK**; only the *markdown-doc* projects (CodeWiki/RepoDoc/OpenDeepWiki) use mermaid because their carrier is markdown. tk's explorer renders the **inline JSON** via either a vendored graph lib (default **Cytoscape.js** — single self-contained UMD, built-in hierarchical/fcose layouts, no framework; switch to **Sigma.js** if graphs get large) **or a self-built SVG/Canvas renderer**. Recommendation: **vendor the graph engine (layout+pan/zoom), self-build only the surrounding UX** (sidebar, two-level lazy-expand, `file:line` anchor panels, search highlight) — that navigation UX is the product value worth owning; force/WebGL layout is not. Mermaid is **demoted to small deterministic static diagrams inside detail panels** (a focused call-graph snippet for one symbol), derived **from the graph, never LLM-authored** (deepwiki-open's hallucinated mermaid is the anti-pattern).
- **Deep-link prose↔exact code** (Google Code Wiki) and **`tk graph map` → openable HTML** as the human entry point.

This is the honest, on-brand Human面: a `tk graph map --html` that opens a navigable graph explorer, reusing `src/report/html.ts`, measurable, no LLM token spend. It strictly extends v1 without violating "navigation-only / no LLM."

### Correction (user, 2026-06-18): "a Wiki does NOT need an LLM"

The earlier A/B fork ("explorer" vs "LLM-Wiki") was a false dichotomy. **A code Wiki is mostly deterministic from the graph** — file tree, module overview, symbol/signature lists, call hierarchy (who-calls-X), import graph, mermaid from real `edges`, PageRank "key files", cross-links. **Zero LLM.** LLM only buys *natural-language prose narration* ("this module authenticates by validating a JWT then…") — which is precisely the hallucination-prone, token-hungry, freshness-lagging part. So tk's Wiki/Human surface is **structural and LLM-free by default**; Option A *is* the Wiki, not a lesser substitute for one.

### Delivery: VS Code is the human viewer AND the LLM — tk owns neither

The clean architecture (user's proposal, confirmed against the landscape report's host-channel analysis): **one graph → human reads it in VS Code, agent chats it via Copilot — tk supplies graph + viewer, the LLM is always the host's.**

| Side | What | tk provides | LLM source |
|---|---|---|---|
| Human | Structural HTML explorer opened **inside VS Code via built-in `Simple Browser: Show`** (localhost URL → editor webview tab, **no extension needed**), or a Webview extension | `tk graph serve` + `src/report/html.ts` render | **none** (structural) |
| Agent | Copilot navigates/chats the graph | MCP 4 tools (channel **C3**) or VS Code extension **Language Model Tool API** `vscode.lm.registerTool` (channel **C8**) | **Copilot** (user's existing subscription) |

This **dissolves the "needs `caw` subscription-mode LLM" concern entirely**: in VS Code, Copilot already *is* the user's subscription LLM, grounded via MCP/tools — tk never holds an API key, never spends API tokens, and never violates ADR 0013's "no LLM in v1." If narrative prose is ever wanted, the honest path is **ask Copilot to narrate a module on-demand through the graph tools**, not pre-generate prose with a tk-owned model.

**Honest ceiling** (landscape report channels C3/C8): in *enterprise-locked* VS Code Copilot, MCP (C3) is **admin-disabled by default** and extensions (C8) are `extensions.allowed`-gated — so the *Copilot-chats-the-graph* path is org-policy-gated (the already-documented host ceiling). But the **human Simple-Browser explorer is NOT gated** (it only opens a localhost page) — it always works; personal-edition VS Code opens both paths.

### Optional prose / control file — only if ever needed (still no tk-owned LLM)
- **`.tk/wiki.json` control file** (DeepWiki `.devin/wiki.json` shape): repo-checked `pages:[{title,purpose,parent,page_notes}]` authoritative + `repo_notes`, hard caps — lets a human steer *which* structural pages render and (if prose is added) what the host LLM narrates.
- **Wiki-as-grounding-context** (Google Code Wiki): the structural wiki *is* the retrieval base for Copilot Q&A — keeps human and agent views consistent, no separate vector store.
- **Editable round-trip** (Davia) — defer; revisit only after the structural Wiki exists.

### tk integration
- `src/retrieval/html/*` consumes the retrieval core's `map` output → `src/report/html.ts` renderer, emitting inline graph JSON. New `tk graph serve` (localhost) + `tk graph explore` that prints the URL / opens VS Code Simple Browser. Graph rendered by a vendored lib (Cytoscape default / Sigma for large) or self-built SVG/Canvas; mermaid only for per-symbol detail-panel snippets, derived from `edges`.
- Lazy-expand graph nav (Understand-Anything) as inline client-side JS over embedded JSON — no framework, fits tk's static-HTML report style.
- v2 (deferred per design §9): a single VS Code extension that hosts the Webview explorer **and** registers the Language Model Tool API tools **and** watches files for incremental — one extension serving both surfaces.

---

## Layer 4 — incremental freshness (cross-cutting, the hardest correctness lever)

Both surfaces need the graph to stay fresh cheaply. tk's design has hash-based per-file refresh — correct but coarse. The field gives the **sound symbol-level algorithm** (RepoDoc + RepoAgent), directly portable to tk's `symbols`/`edges` tables:

1. **AST-level diff, not text diff** (RepoDoc `diff_analysis.py`): on changed files, parse old (`git show base:file`) + new, classify each symbol into a `ChangeType` (`NEW / REMOVED / API_SIGNATURE_CHANGED / BODY_CHANGED / COMMENT_ONLY`). **Drop comment/whitespace-only changes → no re-index, no recompute.**
2. **Two-snapshot invalidation via stored fingerprints** (RepoAgent): a symbol is stale if its `code_hash` changed OR its `referencer_set_hash` changed (a caller appeared/disappeared). `new ⊆ old` = caller-removed; else caller-added — both invalidate dependents. This is why Layer-1 step 3 (store those hashes) matters.
3. **Scoped recompute via edge traversal** (RepoDoc): BFS downstream over `calls` edges from changed symbols → the exact set whose derived artifacts (map rank, doc, anchors) need refresh; topological order. tk's `tk_verify` / `tk graph index` should use this, not full reparse.
4. **Component-precise extraction** (RepoDoc `git show` + range): re-read only the changed symbol's slice, not the file.
5. **The "fake file" HEAD-vs-dirty trick** (RepoAgent): to answer "what is the graph at commit-state" while the working tree is dirty, swap dirty file out / HEAD content in / parse / restore. Useful for tk's `tk_verify` commit-time semantics.

> **Avoid CodeWiki's incremental** (path-substring + module-tree-ancestor-only) — unsound, misses real call-graph dependents.

### tk integration
`src/retrieval/indexer/incremental.ts`: git-diff → AST ChangeType filter → fingerprint compare → downstream BFS over `edges` → scoped re-extract. Emit measurement facts (symbols reparsed vs skipped) — this *is* the offline A/B denominator the measurement harness wants.

---

## Summary: what tk absorbs, per layer

| Layer | Absorb into tk | Source | Conflicts with current ADR? |
|---|---|---|---|
| 底座 | one typed-edge table (confirm), stable string IDs, per-node `code_hash`+`referencer_set_hash`, `source` enum column | GitNexus, RepoAgent, RepoDoc | No — sharpens design §4 |
| 底座 (gated) | DocNode tables (only for editable round-trip, far future) | RepoDoc | Only if a doc-editing layer ships |
| Agent | outline-first ladder explicit in contract; bounded/signature-default responses; keep 1-backend seam; `impact`/`trace` as v2 | DeepWiki, GitNexus | No — sharpens 4-tool design |
| Human | **structural (no-LLM) HTML graph explorer** reusing `src/report/html.ts`; **graph-viz lib (Cytoscape/Sigma) or self-built SVG/Canvas over inline JSON — NOT mermaid as primary**; self-built lazy-expand/anchor-panel UX; opened in **VS Code Simple Browser**; chat = **Copilot via MCP/LM-Tool**, not a tk-owned LLM | GitNexus (Sigma), Understand-Anything (React Flow/ELK), CodeWiki, DeepWiki | **Extends v1 — no tk-owned LLM, no ADR conflict** |
| Incremental | AST ChangeType filter + fingerprint diff + downstream BFS + fake-file trick | RepoDoc, RepoAgent | No — sharpens design §5/§7 |

**Resolved direction (user, 2026-06-18):** the Human面 is a **structural, LLM-free graph→HTML explorer**, opened inside VS Code (Simple Browser / Webview); "Wiki" needs no LLM, and any chat over it is **Copilot** (the host's LLM) grounded via tk's MCP/Language-Model-Tool surface. **tk owns no LLM and spends no API tokens on either surface.** Everything else is additive sharpening of the already-accepted design. Remaining open item is only the org-policy ceiling (enterprise Copilot MCP/extension gating), which is pre-existing and documented, not a new decision.

---

## Grilling outcomes (2026-06-18/19) — supersede where they conflict above

A subsequent grilling session (combining this doc, `code-graph-design-20260618.md`, and `codegraph-codewiki-next-stage-20260618.md`) reframed the axis away from ADR-compliance to **cost / benefit / feasibility / "can it really land"**, with two standing principles from the user: **(a) don't slice features across phases — ship each feature as complete + optimized, never "design now, refactor later"; (b) 1.0.0 = 底座 + codegraph only (no codewiki), but the 底座 must be future-facing for codewiki.** Resolved decisions:

- **G1 — Human surface.** HTML explorer **+** graph-derived Markdown, both **`source=graph`, tk holds/calls NO LLM**. Keep a `source` provenance field as a schema affordance (future host-LLM/Copilot prose would be tagged `source=host_llm`); no `llm_draft` pipeline in tk.
- **G2 — impact split by cost/ROI, not version.** T1 (1-hop static callers + `co_changes_with` git-pairwise + CODEOWNERS `owns`) first — cheap, deterministic/language-agnostic, highest ROI. T2 (tests/routes/configs) framework-specific, on-demand, `confidence=low` + raw-diff fallback. T3 (CI gates) opt-in separate surface.
- **G3 — incremental = symbol-level change detection as a 底座 primitive, built complete + tested now** (per-node `content_hash` + `referencer_set_hash` + git-diff→changed-symbols→downstream BFS + ChangeType filter). Trigger is lazy (on query / git event, no resident daemon). Rationale: codegraph used live during editing needs fresh graph; and codewiki's "always-current" staleness is structurally a diff/invalidation query that must read this substrate — deferring it = the refactor-debt the user rejects.
- **G4 — 底座 graph model is generic (`nodes(kind,…,metadata_json)` + `edges(kind,…)` single tables) + migration system**, so codewiki's WikiPage/`documents`/wiki_blocks are future **pure-additive** kinds/tables, zero 底座 redesign. 1.0.0 populates only code-kinds; doc-provenance kinds are documented-but-reserved, not built. **ConceptNode dropped** (low signal + needs LLM).
- **G5 — storage = `node:sqlite` + Node ≥22.13 gate** (user's choice: accept cutting the Node-20 cohort in exchange for zero-dependency + native speed; core tk stays ≥20, graph path prints a clean version message + uses the no-warning child re-entry).
- **codewiki effort (estimate).** Because the 底座 is future-faced (G3/G4), codewiki is mostly *derive + render*, not *rebuild*: doc-provenance + staleness ~small (reuses G3); **page-derivation engine (graph→Markdown) is the main cost**, scaling with the number of page types; mermaid-from-edges small-med; **HTML explorer/renderer is the wildcard** (vendor vs self-built). Rough total for one experienced dev, 底座+codegraph done: **~2.5–4 weeks if the HTML explorer is shared with codegraph's human surface, ~4–7 weeks if codewiki gets its own renderer.** Runtime generation is **seconds, no LLM, no token cost** (vs DeepWiki/CodeWiki minutes+tokens). Two effort drivers to pin down: number of page types, and vendor-vs-self-built renderer.
