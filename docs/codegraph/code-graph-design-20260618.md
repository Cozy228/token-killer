# Code Graph for token-killer — enterprise pilot design (2026-06-18)

> Companion to [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
> The landscape report is a research map; this document is the committed design direction after grilling.
>
> **This is the single canonical code-graph design.** It incorporates the former
> `codegraph-1.0-absorption-design` (now §11, layer-by-layer absorption) and
> `measurement-harness-design` (now §12, Slice −1 measurement) — both merged here on 2026-06-19.

Status: **accepted design, not implemented**. ADRs are the source of truth:
[ADR 0013](../adr/0013-code-graph-surface-scope.md),
[ADR 0014](../adr/0014-tk-becomes-mcp-server.md),
[ADR 0015](../adr/0015-node-sqlite-feature-gate.md),
[ADR 0016](../adr/0016-measurement-before-feature.md).

---

## 0. Decision summary

v1 adds an **additive retrieval plane**, not a gateway:

- **Target:** enterprise VS Code Copilot pilot, with MCP/admin enablement as an explicit prerequisite.
- **Shape:** `tk graph ...` CLI + per-session stdio MCP server + existing instruction guidance.
- **Install:** `tk install --graph` is explicit opt-in. Plain `tk install` does not enable graph MCP.
- **Tools:** exactly `tk_map`, `tk_read`, `tk_search`, `tk_verify`.
- **Engine:** static AST/import/PageRank graph for TS/JS/Python/Java. No LSP in v1.
- **Store:** `~/.token-killer/projects/<fingerprint>/graph.db`, using `node:sqlite` behind a graph-only Node >=22.13 gate.
- **Scope:** map/read/search/verify. No API proxy, no prompt-cache rewriting, no model routing, no host built-in direct-tool result projection.
- **Deferred:** VS Code extension and optional LSP enhancement are v2 candidates.

The important distinction: `tk` still cannot rewrite Copilot's built-in `read_file` / `search` results.
Instead, it offers better tools the agent may choose. That is additive, probabilistic, and honest.

---

## 1. Why this exists

The landscape report found the same hard boundary repeatedly: command-output compression is already tk's
home turf, while conversation history, prompt cache, model routing, and reasoning budget are host/model
payload surfaces. tk will not become a gateway. The largest new opportunity that fits tk's shape is
repo retrieval: help the agent orient, read targeted slices, and verify deltas without broad grep/read loops.

For enterprise VS Code Copilot, this is only viable when MCP is allowed. Locked orgs with MCP disabled cannot
be bypassed by a plain npm package. `tk graph doctor` must say that plainly rather than imply coverage.

---

## 2. Public surface

### CLI

| Command | Purpose |
|---|---|
| `tk install --graph` | Opt in to graph MCP wiring and graph guidance. |
| `tk graph doctor` | Read-only diagnostics for Node, MCP, host config, and index path. |
| `tk graph index` | Explicit prewarm / refresh for the current project. |
| `tk graph map [query]` | Ranked repo map / orientation view. |
| `tk graph read <target>` | Targeted read by symbol, file range, or explicit edit-window mode. |
| `tk graph search <query>` | Text, symbol, and callers modes. |
| `tk graph verify` | Local diff and test-failure summaries. |
| `tk graph serve --mcp` | Stdio MCP server entrypoint. |

Indexing is **lazy + explicit**: graph tools refresh changed files by hash, and `tk graph index` lets a pilot
prewarm or CI-check the store.

### MCP tools

Keep resident schema small:

| Tool | Purpose |
|---|---|
| `tk_map` | Ranked repo map and orientation answers with `file:line` anchors and signature snippets. |
| `tk_read` | Targeted exact reads; `mode=edit_window` returns exact slice + anchors + content hash. |
| `tk_search` | Text, symbol, and callers-style search modes. `callers` is a mode, not a separate tool. |
| `tk_verify` | Local diff and test-failure projection; no Copilot edit-loop integration. |

There is no separate node tool, no separate callers tool, and no extra exploration synonym in v1.

### Guidance

Graph guidance is written only after `tk install --graph` succeeds or `tk graph doctor` confirms graph MCP is
available. This avoids telling an agent to use tools that are not installed. The guidance belongs in the
existing marker-managed instruction system, not a new unmanaged project file.

---

## 3. Architecture

Flow: source files enter the extractor (`web-tree-sitter` + `tree-sitter-wasms`), the resolver builds
imports/direct references/static edges, the store persists them in `graph.db` (`node:sqlite` + FTS), the
retrieval core handles rank/map/read/search/verify, and delivery adapters expose the same core through CLI
and MCP.

Primary module: `src/retrieval`.

Suggested internal boundaries:

- `src/retrieval/nodeGate.ts` — graph-only Node >=22.13 check and no-warning re-entry.
- `src/retrieval/indexer/*` — file discovery, language detection, tree-sitter extraction, incremental refresh.
- `src/retrieval/store/*` — sqlite adapter, schema, migrations, FTS.
- `src/retrieval/query/*` — ranking, symbol lookup, callers mode, read-window construction.
- `src/retrieval/mcp/*` — hand-rolled JSON-RPC stdio transport and 4 tool handlers.
- `src/retrieval/cli.ts` — `tk graph ...` command dispatch.

The command-compression hot path must not import this module eagerly.

### Module interface contract

Keep `src/retrieval` deep: callers should not know parser, sqlite, ranking, or MCP details. CLI and MCP
handlers should call one narrow interface. The interface has four request kinds:

| Request kind | Required inputs | Optional inputs | Meaning |
|---|---|---|---|
| `map` | `cwd` | `query`, token budget | Produce ranked repo orientation. |
| `read` | `cwd`, target | `default` vs `edit_window`, token budget | Return exact symbol/range content or an edit window. |
| `search` | `cwd`, query | `text` / `symbol` / `callers`, token budget | Locate text, symbols, or callers-style static references. |
| `verify` | `cwd` | diff, test output, token budget | Summarize local diff and test-failure evidence. |

Every response carries model-facing output, resolvable anchors, confidence (`high` / `medium` / `low`),
diagnostics, and measurement facts (`returnedAnchors`, `returnedChars`, optional raw size, optional avoided
read candidates). CLI and MCP adapters may wrap transport metadata, but must not reinterpret or rewrite the
model-facing output. Tests should exercise this interface directly before testing adapters.

---

## 4. Static engine v1

v1 intentionally avoids LSP. The static engine is enough to validate token ROI and has a much smaller
enterprise support matrix.

Supported languages:

- TypeScript / JavaScript, including TSX/JSX where the grammar supports it.
- Python.
- Java.

Extraction stores:

- files: path, language, content hash, mtime/size, indexing status.
- symbols: kind, name, qualified name, file, range, signature.
- edges: contains, imports, references/calls where statically resolvable.
- FTS rows for symbol names, qualified names, and signatures.

Minimum store entities:

| Entity | Required fields |
|---|---|
| Files | path, language, content hash, mtime, size, indexed-at timestamp |
| Symbols | stable id, file path, kind, name, qualified name, start/end lines, signature |
| Edges | source symbol, target symbol, kind, confidence, metadata |

Add FTS over symbol name, qualified name, and signature. Use migrations even for v1 so future LSP fields do
not force ad-hoc DB rewrites.

`graph.db` may persist signature/map snippets. It must not persist full source slices used by `tk_read` or
`mode=edit_window`; those are read from the live workspace and validated with hash/anchors.

LSP remains a v2 candidate. If v2 adds it, responses should be able to distinguish `source=static` from
`source=lsp` and expose confidence rather than silently upgrading semantics.

### Query behavior

`tk_map`:

- Extract identifier-like terms from the query, then combine exact symbol matches, FTS matches, import
  relationships, and local PageRank-style ranking.
- Return grouped files, signatures, and the smallest source snippets needed for orientation.
- Prefer answer sufficiency over raw volume: include the next recommended `tk_read` target when confidence is
  not high.

`tk_read`:

- `mode=default` returns exact symbol/range content when the target resolves cleanly, otherwise a narrow
  hand-back with candidate anchors.
- `mode=edit_window` returns exact target slice, stable nearby anchors, and file hash. It does not add
  imports/callers automatically in v1.

`tk_search`:

- `mode=text` returns grouped text hits with anchors.
- `mode=symbol` searches symbol names/signatures.
- `mode=callers` uses static reference/call edges where available and labels low-confidence results.

`tk_verify`:

- Summarizes local diff and test-failure output into changed files, failing tests/errors, and referenced
  anchors.
- Stores or points to raw recovery for over-budget failure output. It does not claim a patch is correct.

---

## 5. Storage and lifecycle

Graph index location is `~/.token-killer/projects/<fingerprint>/graph.db`. This follows tk's existing project
data convention and does not write repository files. There is no in-repo index mode in v1.

Retention:

- `tk uninstall` removes graph MCP/guidance configuration it wrote, but preserves data.
- `tk uninstall --purge-data` removes graph indexes along with other tk project data.

Refresh:

- Tool calls refresh changed files by content hash / stat metadata before answering.
- `tk graph index` is available for explicit prewarm.
- No watcher daemon in v1.

Install behavior:

- `tk install --graph` writes graph MCP config for the existing host adapters where supported.
- It also writes graph guidance through the existing marker-managed guidance writer.
- Plain `tk install` does not install graph MCP or graph guidance.
- v1 does not add `tk status --graph` or `tk uninstall --graph`; `tk graph doctor` handles diagnostics and
  regular `tk uninstall` removes config written by tk.

---

## 6. Node and dependencies

Production deps added for graph:

| Dependency | Reason | Native build |
|---|---|---|
| `web-tree-sitter` | parser runtime | no |
| `tree-sitter-wasms` | prebuilt grammar blobs | no |
| `node:sqlite` | builtin graph store + FTS | no npm dep |

Packaging choice: use regular dependencies, not vendored subsets or lazy downloads. This keeps install
simple and deterministic. Verify with `pnpm pack --dry-run` and a package-size check.

Node policy:

- `package.json` core engine stays Node >=20.
- Any `tk graph ...` path requires Node >=22.13.
- `node:sqlite` warning suppression is handled by graph-only child re-entry; normal `tk` startup is not
  re-entered or slowed.

---

## 7. Verification and measurement

Correctness gates are hard:

- Every returned anchor resolves to the current file.
- Edit windows carry content hash and stable anchors.
- Stale or changed files are detected before answering or explicitly reported.
- Low-confidence matches hand back to narrower search/read instead of pretending certainty.
- Raw recovery exists for verification outputs.

Savings measurement is mandatory but not a fixed release threshold:

- Report input-token pressure, returned anchor counts, avoided reads, duplicate-read pressure, fallback/raw
  escalation, and verify summary size.
- Do not write `saved_tokens`; that name remains reserved for measured command-output savings.
- Do not quote third-party benchmark percentages as tk results.

Implementation slices:

1. Node gate + empty `tk graph doctor` / `tk graph index` surface.
2. Store + schema + hash-based file inventory under `~/.token-killer/projects/<fingerprint>/graph.db`.
3. TS/JS extraction and `tk graph map` for this repo.
4. Python + Java extraction.
5. `tk graph read` including `mode=edit_window`.
6. `tk graph search` with text/symbol/callers modes.
7. MCP stdio server with exactly four tools.
8. `tk install --graph` host wiring + graph guidance.
9. `tk graph verify` and measurement report fields.

Acceptance tests:

- Unit fixtures for TS/JS/Python/Java extraction.
- Store migration and stale-file refresh tests.
- Interface tests for all four `GraphRequest` kinds.
- CLI tests for Node gate, lazy refresh, and exact anchor/hash output.
- MCP schema snapshot proving only `tk_map`, `tk_read`, `tk_search`, `tk_verify` are exposed.
- Install dry-run tests proving plain `tk install` does not enable graph and `tk install --graph` does.

---

## 8. Enterprise pilot assumptions

The pilot is viable only when the organization allows the relevant channel:

- MCP must be enabled for VS Code Copilot if the agent is expected to call `tk_map` / `tk_read` /
  `tk_search` / `tk_verify`.
- Extension allow-listing is not part of v1 because there is no v1 extension.
- If MCP is disabled, `tk graph doctor` reports the policy/config gap and points to CLI fallback.

This is not a product failure to hide. It is the host ceiling documented in the landscape report.

---

## 9. Deferred work

- VS Code extension using the Language Model Tool API: v2 candidate after retrieval core stabilizes.
- Optional LSP enhancement for higher-precision def/ref/callers: v2 candidate.
- File watcher / daemon.
- Embeddings, vector search, prompt compression, model routing, history compaction, and API gateway: out of
  scope for this product direction unless a future ADR explicitly reverses it.

---

## 10. Human surface — graph explorer (design absorption, proposed extension)

> **Status:** proposed extension beyond ADR 0013's navigation-only-CLI scope. This section captures *design
> intent and what to borrow* from the 8 studied projects (cloned under `/tmp/tk-research/`, see
> §11 Layer 3 below and
> [`codegraph-wiki-landscape-20260618.md`](./codegraph-wiki-landscape-20260618.md)). It is **structural and
> LLM-free**: the human reads the *same `graph.db`* the agent queries; any chat is the host's Copilot via
> tk's MCP/Language-Model-Tool surface, never a tk-owned LLM. **Renderer tech is deliberately NOT fixed
> here** — only the UX contract and the borrowed design ideas are. Engine choice (vendored graph lib vs
> self-built SVG/Canvas) is a separate decision after this design is accepted.

### 10.1 Why a human surface at all

v1 gives humans only `tk graph map/read` CLI text. Every studied project invests heavily in a human view,
and tk already owns the rendering substrate (`src/report/html.ts` + `src/inspect` HTML reports, light theme,
restrained `#001AFF`). The cheapest honest win is to render the graph the agent already built as a
navigable, offline, self-contained HTML explorer — no LLM, no new token cost, no freshness lag beyond the
index. It also reuses ADR 0014's one-backend seam: the explorer is a third thin consumer of the same
retrieval core, alongside CLI and MCP.

### 10.2 What to borrow, by project

Each entry: **亮点 / 源码位置 / 设计方向与思考 / 如何借鉴 / tk 如何结合**.

#### A. Understand-Anything — the navigation UX bar (strongest human reference)
- **亮点:** two-level **lazy-expand** graph navigation that keeps a multi-thousand-node graph legible:
  architectural-layer cluster overview → collapsed folder/cluster containers that lay out their children
  *only* on click/zoom-past-1.0/focus. Plus **focus mode** (1-hop isolation), **dependency-ordered guided
  tours**, **persona-adaptive detail** (non-tech/junior/expert), category filters, minimap, breadcrumb.
- **源码位置:** `understand-anything-plugin/packages/dashboard/src/components/GraphView.tsx` (~1580 LOC, the
  two-level lazy ELK layout); `packages/dashboard/src/store.ts` (Zustand view state); aggregate edges with
  count labels + log-scaled stroke live in the same component.
- **设计方向与思考:** never render all leaves at once — aggregate at the cluster level and expand on demand.
  This is a pure-graph trick (no LLM) and is *the* reason their large graphs stay readable. Tours/persona
  turn a static graph into onboarding.
- **如何借鉴:** adopt the **overview → lazy-expand → focus** interaction model and aggregate-edge rendering as
  the explorer's core UX. Treat guided tours as a later additive (a tour is just an ordered walk over
  PageRank/entry-point nodes — derivable from the graph, no LLM).
- **tk 如何结合:** this UX layer is exactly the part tk should *own/self-build* (it is the product value),
  regardless of which engine draws the nodes. Drives the explorer's overview = PageRank "key files" +
  module clusters; expand = `contains`/`imports` edges; focus = 1-hop over `calls`.

#### B. GitNexus — self-contained viewer + one-backend HTTP bridge
- **亮点:** (1) an **offline self-contained `index.html`** that embeds all data + a sanitized renderer; (2) a
  WebGL graph canvas that scales; (3) the web UI is an explicit **thin client** — "all queries via
  `gitnexus serve` HTTP API", i.e. the same backend the MCP/CLI use.
- **源码位置:** `gitnexus/src/core/wiki/html-viewer.ts` (self-contained HTML emit);
  `gitnexus-web/src/components/GraphCanvas.tsx` (Sigma.js+graphology canvas); `gitnexus/src/serve.ts` +
  `mcp-http.ts` (the HTTP bridge feeding the web UI from `LocalBackend`).
- **设计方向与思考:** one query backend, three front-ends (MCP-stdio, HTTP-web, CLI). The human surface adds
  *zero* new query logic — it's a renderer over the same core. Offline self-contained output = shareable,
  no server required to *view*.
- **如何借鉴:** keep the explorer a **pure consumer of the retrieval core** (ADR 0014). Offer both a served
  mode (`tk graph serve` → live, lazy) and an exportable self-contained HTML (for sharing/CI artifact).
- **tk 如何结合:** `tk graph serve` = localhost HTTP over the retrieval core (mirrors `serve.ts`); a future
  `tk graph export --html` = self-contained snapshot via `src/report/html.ts` (mirrors `html-viewer.ts`).

#### C. CodeWiki — minimal self-contained template (no framework)
- **亮点:** a single static `index.html` = inline JSON + client-side markdown (`marked.js`) + a 320px sidebar
  tree + CDN mermaid; emitted by `--github-pages`. No build step, no framework — closest to tk's static-HTML
  report style.
- **源码位置:** `codewiki/cli/html_generator.py` + `codewiki/src/templates/github_pages/viewer_template.html`.
- **设计方向与思考:** the viewer is a template with a JSON hole; generation just fills data. Trivial to host
  on GitHub Pages or open from disk. Sidebar tree + content pane is the baseline doc layout.
- **如何借鉴:** the **inline-JSON-into-a-template** pattern is the simplest path that matches `src/report/html.ts`.
  Use it for the export/snapshot mode and as the fallback when no graph-viz engine is loaded.
- **tk 如何结合:** template lives beside existing report templates; the retrieval core's `map` output is the
  JSON hole; sidebar tree = file/module hierarchy from `files`/`contains` edges.

#### D. RepoDoc — deterministic diagrams with validation + fallback
- **亮点:** architecture diagrams generated **from the graph**, then **syntax-validated**, with a
  **deterministic fallback flowchart** if invalid; cross-doc links validated and auto-fixed.
- **源码位置:** `repodoc/src/...` `generate_architecture_diagrams`, `validate_mermaid_syntax`,
  `_generate_fallback_diagram`, `validate_and_fix_links` (see §11 Layer 3).
- **设计方向与思考:** a diagram derived from real edges is correct by construction; validate before emit and
  always have a deterministic fallback so the page never breaks. (Contrast deepwiki-open's LLM-hallucinated
  mermaid — the anti-pattern.)
- **如何借鉴:** any small embedded diagram (e.g. a per-symbol call snippet in a detail panel) must be
  **graph-derived + validated + fallback**, never LLM-authored. This is where mermaid legitimately fits —
  small static panels, not the main interactive graph.
- **tk 如何结合:** detail-panel call snippet = render the 1-hop `calls` subgraph; validate; fallback to a
  plain anchor list if rendering fails.

#### E. DeepWiki — page-control file + grounding ladder
- **亮点:** `.devin/wiki.json` repo-checked control file — `pages:[{title,purpose,parent,page_notes}]`
  authoritative ("no more, no less") + free-text `repo_notes`, hard caps for predictable scope; and the
  cheap-outline-first **`read_wiki_structure → read_wiki_contents → ask_question`** ladder where the wiki is
  the grounding context for chat.
- **源码位置:** product (no repo) — schema documented in
  [`codegraph-wiki-landscape-20260618.md`](./codegraph-wiki-landscape-20260618.md) §DeepWiki.
- **设计方向与思考:** let the repo author steer *which* pages exist via a checked-in declarative file; let the
  agent fetch a cheap outline before full content. Human and agent share one grounding source → consistent
  answers.
- **如何借鉴:** an optional **`.tk/graph.json`** (or section in existing config) can steer which clusters/pages
  the explorer foregrounds and pin human-authored notes onto nodes — still no LLM. The structure→contents
  ladder is already tk's `tk_map → tk_read` shape (§2); the explorer's overview = the human form of
  `read_wiki_structure`.
- **tk 如何结合:** explorer overview is generated from the same `map` the agent's `tk_map` returns → human and
  Copilot see the same structure. Control file is a later additive, not v1.

#### F. Davia — editable round-trip (deferred, future direction)
- **亮点:** agent-writes / human-edits the *same files*; debounced write-back from a Notion-like editor; rich
  content via sidecar node-views (mdx / database / excalidraw) keyed by `data-path` to JSON files.
- **源码位置:** `apps/web/.../editor.tsx` (debounced write-back), `apps/web/src/app/api/content/route.ts`
  (shared read/write API), `apps/web/src/tiptap/extensions/{mdx,database,excalidraw}/`.
- **设计方向与思考:** the GUI is a thin view over the files the agent owns — no DB, no import/export, one
  source of truth that both edit. The only project where the human can *edit* the output.
- **如何借鉴:** **defer.** tk's v1 explorer is read-only (the graph is derived, not authored). If human notes
  on nodes are ever wanted, store them as a sidecar (the `.tk/graph.json` notes idea) rather than making the
  derived graph editable.
- **tk 如何结合:** out of scope until after the read-only explorer ships; recorded as a v3 direction.

#### G. OpenDeepWiki & Google Code Wiki — supporting ideas
- **亮点:** OpenDeepWiki — `SourceFiles` **provenance** on every answer (cite the file), an **embeddable
  widget**, and a `/mindmap` route. Google Code Wiki — **deep-link prose ↔ exact code** and sidebar + TOC
  navigation, with chat answers linked back to code.
- **源码位置:** `opendeepwiki/src/OpenDeepWiki.Entities/Repositories/DocFile.cs` (`SourceFiles`); Google Code
  Wiki is product-only (see landscape report).
- **设计方向与思考:** every human-facing claim resolves to a `file:line`; navigation flows both big-picture↔
  implementation. tk already mandates resolvable anchors (§7) — the explorer should make every node/panel a
  clickable `file:line` that opens the source.
- **如何借鉴:** make `file:line` anchors first-class clickable targets in the explorer (open in VS Code via
  `vscode://file/...` links when served inside the IDE). Provenance is the correctness contract, not a
  nicety.
- **tk 如何结合:** detail panels carry the same anchors `tk_read` returns; clicking opens the exact slice —
  human and agent point at identical evidence.

### 10.3 tk Human-surface shape (synthesis)

- **Entry:** `tk graph serve` (localhost HTTP over the retrieval core) + `tk graph explore` (prints/opens the
  URL); inside VS Code, open it in the built-in **Simple Browser** (localhost → editor webview tab, no
  extension). A later `tk graph export --html` emits a self-contained snapshot.
- **Data:** inline graph JSON from the retrieval core's `map` output — the explorer is a third thin consumer
  of the one backend (ADR 0014), adding no query logic.
- **Structure (the UX tk owns):** overview = PageRank "key files" + module clusters → **lazy-expand** via
  `contains`/`imports` edges → **focus** = 1-hop over `calls` → **detail panel** = signature + `file:line`
  anchors (clickable to source) + an optional small graph-derived call snippet.
- **Chat:** none owned by tk — the human asks **Copilot**, which is grounded on the same graph via MCP /
  Language-Model-Tool. Human view and agent answers stay consistent because both read one graph.
- **LLM/tokens:** zero tk-owned LLM, zero API tokens, no freshness lag beyond index refresh — consistent with
  ADR 0013/0016.
- **Renderer:** **left open.** Vendored graph lib (e.g. Cytoscape/Sigma) vs self-built SVG/Canvas is a
  separate decision; this design fixes only the UX contract and the data seam so the engine can be swapped
  without touching the core.

### 10.4 Landing (落地) — incremental slices

Extends the §7 implementation slices; each is independently shippable and measurable:

1. **Serve seam.** `tk graph serve` exposes the retrieval core's `map` output as JSON over localhost
   (reuses ADR 0014 backend; no renderer yet). Test: JSON contract matches `tk_map`.
2. **Static template.** Render that JSON into an `src/report/html.ts`-style page: sidebar file/module tree +
   content pane + clickable `file:line` anchors. No graph-viz engine yet — text/tree only. Already useful.
3. **Graph view.** Add the node/edge canvas with the overview → lazy-expand → focus UX (10.2-A). Renderer
   chosen here per the deferred decision; the UX layer is tk-owned and engine-agnostic.
4. **Detail panels + snippets.** Per-symbol panel = signature + anchors + graph-derived call snippet
   (validated + fallback, 10.2-D).
5. **VS Code integration.** `tk graph explore` opens Simple Browser; anchors become `vscode://file` deep
   links when served in-IDE (10.2-G). Document the enterprise MCP/extension policy ceiling (§8).
6. **Export + optional control.** `tk graph export --html` self-contained snapshot (10.2-B/C); later
   `.tk/graph.json` notes/page steering (10.2-E). Editable round-trip (10.2-F) remains deferred.

Measurement (per ADR 0016): the explorer is a human surface, so report *navigation* facts (nodes shown vs
total, expand depth, anchors opened) — do **not** claim token savings for it; its value is comprehension,
not compression. The token story stays on the agent surface (§7).

---

## 11. Layer-by-layer absorption (base / agent / human / incremental)

> Merged from the former `codegraph-1.0-absorption-design-20260618.md` (2026-06-19). **Framing (per user
> 2026-06-18):** NOT competitor analysis, NOT "must own one base + dual surface." The question is narrower
> and constructive: across the 10 studied projects, **how is each of the three layers best designed, and how
> does tk absorb it into `feat/1.0.0`?** Grounded in tk's real choices: `node:sqlite` + FTS, `web-tree-sitter`
> static engine, 4 MCP tools (`tk_map/read/search/verify`), measurement-first, `src/retrieval` (not yet
> created), and tk's existing `src/report/html.ts` + `src/inspect` HTML infra. Raw research companion:
> [`codegraph-wiki-landscape-20260618.md`](./codegraph-wiki-landscape-20260618.md).

### 11.1 Layer 1 — 底座 (the graph base): how to design it best

tk's planned base: `files / symbols / edges` tables + FTS, signatures-only persistence, source read live-from-disk with hash. That is sound. What the field teaches:

#### Absorb
1. **One typed-edge table, not one table per edge kind** (GitNexus's hybrid schema, translated to SQL). tk already plans `edges(source, target, kind, confidence, metadata)` — keep exactly this. It is the SQL analog of GitNexus's single `CodeRelation{type}` table: cheap DDL, and any new edge kind is a row value, not a migration. **Confirms tk's current edge model; don't split it.**
2. **Stable string node IDs, references stored as IDs not pointers** (RepoAgent). tk's `relative_path::QualifiedName` (GitNexus/CodeWiki both use this exact form) makes the graph **serializable and diffable across runs** — the precondition for sound incremental. Persist edges as `(srcId, dstId)` string pairs; rehydrate on load. tk's "out-of-tree index" period needs this.
3. **Per-node fingerprint + sorted referencer-set, stored in the row** (RepoAgent's invalidation precondition). Add to the `symbols` table: `code_hash` (content fingerprint) and a derived `referencer_set_hash`. This is what makes "did my code change?" and "did my callers change?" answerable without a full reparse — see Layer-4 incremental below. Cheap to add now, expensive to retrofit.
4. **Typed *weighted* edges with a `confidence`/`source` field** (RepoDoc `{calls, implements, describes, semantic_impact}` weighted; tk already has `confidence`). Keep `confidence` AND add a `source` enum (`static` now, `lsp` later) so v2 LSP can coexist with v1 static edges without silently upgrading semantics — design §4 already wants this; make it a column, not a post-hoc flag.

#### Absorb *only if* the Human/Wiki layer is added (see Layer 3 decision)
5. **Heterogeneous node types: CodeNode + DocNode + ConceptNode** (RepoDoc, ~200 LOC NetworkX). tk's v1 base is **CodeNode-only**, which is correct for navigation-only. A `DocNode` (with `version:int` for staleness) and `describes` edge are needed **only** when tk generates human docs/wiki tied to code. Decision gate: don't add these tables in v1 unless the Wiki layer ships; design the migration so they slot in (tk already mandates migrations from v1).

#### Don't copy
- **Embeddings / vector store** as the base (deepwiki-open FAISS, OpenDeepWiki none) — out of scope per ADR 0013, and the research confirms graph-backed retrieval beats naive 350-word chunking. tk's FTS + PageRank is the right v1 retrieval primitive.
- **Graph-DB engine** (LadybugDB/Kuzu/NetworkX) — tk's `node:sqlite` choice is fine; GitNexus's value is the *schema shape*, not the engine. Their WASM-portability win is irrelevant to tk's CLI-first delivery.
- **CodeWiki's single untyped `depends_on`** — collapses inheritance/import/call into one set; tk's typed edges are strictly better.

#### tk integration
`src/retrieval/store/schema.ts`: `files`, `symbols (+ code_hash, referencer_set_hash)`, `edges(src,dst,kind,confidence,source,meta)`, FTS over name/qualified-name/signature. IDs = `relpath::qualname`. Persist signatures only; never source slices (already in design §4). Migrations from row one.

### 11.2 Layer 2 — Agent 面: how to design it best

tk's planned agent surface: 4 MCP tools `tk_map / tk_read / tk_search / tk_verify`, one deep `src/retrieval` core behind thin CLI + MCP adapters, every response carrying anchors + confidence + measurement facts. The field strongly validates this and sharpens it:

#### Absorb
1. **Cheap-outline-first tool ladder** (DeepWiki's `read_wiki_structure → read_wiki_contents → ask_question`). This is the single best agent-API idea in the whole landscape: the agent pulls a **cheap structural outline first, full content only on demand** — token-frugal by construction. tk's `tk_map → tk_read` is already this shape; make it **explicit in tool descriptions and in `tk_map`'s output** ("next recommended `tk_read` target when confidence not high" — already in design §4, elevate it to the contract). This is tk's token-saving mechanism on the agent side: **precompute + bounded outline**, not output compression.
2. **Bounded responses as the token lever** (GitNexus: depth clamps, `include_code:false` default, paginated lists, per-process caps). tk should default every tool to **anchors + signatures, not bodies**; `tk_read` is the only body-returning tool, and it returns the *smallest resolving slice*. Add explicit token-budget inputs (tk design already has "token budget" per request kind) and **log returned vs. avoided bytes** (tk's measurement facts).
3. **"One backend, thin adapters"** (GitNexus `LocalBackend` → MCP/HTTP/CLI; CodeWiki MCP calls same `run()` as CLI). tk already plans `src/retrieval` as a deep module with CLI + MCP adapters that "must not reinterpret model-facing output." Validated at 42K★ scale — **keep this seam rigid**; it is also what lets a future Human/HTTP surface reuse the same core for free (Layer 3).
4. **Provenance / `SourceFiles` on every answer** (OpenDeepWiki) — tk already mandates resolvable anchors + content hash. This is what makes "cite the file:line" answers and the verify gate possible. Keep it a hard correctness gate (design §7), not a nicety.

#### Absorb as v2 candidate tools (don't add to v1's 4)
5. **`impact` / `trace` / `detect_changes`** (GitNexus). These are the high-value *navigation* tools beyond map/read/search: blast-radius (downstream dependents of a change), shortest-path between two symbols, git-diff→affected-symbols. They fit tk's graph perfectly and are pure-static (no LLM). **`tk_verify` already overlaps `detect_changes`.** Keep v1 at 4 tools (ADR scope discipline); note `impact`/`trace` as the first v2 additions once measurement proves ROI.

#### Don't copy
- **OpenDeepWiki's `SearchDoc` = `LIKE '%query%'` + a 12k-token LLM summary per query** — burns tokens to paper over weak retrieval. tk's FTS + symbol/callers modes are better and LLM-free.
- **Slash-command "re-prompt the host LLM" as the agent API** (Understand-Anything has no real query engine; "semantic search" is dead code). tk's MCP tools with a real query core are the right call.
- **Re-reading the whole repo per call** (Davia's 1000-file/130k dump). tk's hash-incremental refresh is correct.

#### tk integration
Keep `src/retrieval/mcp/*` at exactly 4 tools (schema-snapshot test enforces this, design §7). Encode the outline-first ladder in tool descriptions + `tk_map` "next read" hint. v2 backlog: `tk_impact`, `tk_trace` reusing the same `edges` table.

### 11.3 Layer 3 — Human 面

The human-surface design is specified in full in **§10** (graph explorer): structural, LLM-free, reusing
`src/report/html.ts`, graph-viz lib or self-built SVG/Canvas over inline JSON (NOT mermaid as primary),
self-built lazy-expand/anchor-panel UX, opened in VS Code Simple Browser; chat = Copilot via MCP/LM-Tool,
never a tk-owned LLM. The layer-absorption framing reached the same resolution:

> **Correction (user, 2026-06-18): "a Wiki does NOT need an LLM."** A code Wiki is mostly deterministic from
> the graph — file tree, module overview, symbol/signature lists, call hierarchy, import graph, mermaid from
> real `edges`, PageRank "key files", cross-links — **zero LLM**. LLM only buys natural-language prose
> narration, which is precisely the hallucination-prone, token-hungry, freshness-lagging part. So tk's
> Human surface is **structural and LLM-free by default**; §10 *is* the Wiki, not a lesser substitute.
> Optional later additives (no tk-owned LLM): a `.tk/wiki.json` control file (DeepWiki `.devin/wiki.json`
> shape) to steer which structural pages render; wiki-as-grounding-context for Copilot Q&A; editable
> round-trip (Davia) deferred.

**Delivery: VS Code is the human viewer AND the LLM — tk owns neither** (the clean architecture, confirmed
against the landscape report's host-channel analysis): **one graph → human reads it in VS Code, agent chats
it via Copilot — tk supplies graph + viewer, the LLM is always the host's.**

| Side | What | tk provides | LLM source |
|---|---|---|---|
| Human | Structural HTML explorer opened **inside VS Code via built-in `Simple Browser: Show`** (localhost URL → editor webview tab, **no extension needed**), or a Webview extension | `tk graph serve` + `src/report/html.ts` render | **none** (structural) |
| Agent | Copilot navigates/chats the graph | MCP 4 tools (channel **C3**) or VS Code extension **Language Model Tool API** `vscode.lm.registerTool` (channel **C8**) | **Copilot** (user's existing subscription) |

This **dissolves the "needs a subscription-mode LLM" concern entirely**: in VS Code, Copilot already *is* the
user's subscription LLM, grounded via MCP/tools — tk never holds an API key, never spends API tokens, and
never violates ADR 0013's "no LLM in v1." If narrative prose is ever wanted, the honest path is **ask Copilot
to narrate a module on-demand through the graph tools**, not pre-generate prose with a tk-owned model.

**Honest ceiling** (landscape report channels C3/C8): in *enterprise-locked* VS Code Copilot, MCP (C3) is
**admin-disabled by default** and extensions (C8) are `extensions.allowed`-gated — so the *Copilot-chats-the-graph*
path is org-policy-gated (the already-documented host ceiling, §8). But the **human Simple-Browser explorer is
NOT gated** (it only opens a localhost page) — it always works; personal-edition VS Code opens both paths.

**tk integration** (extends §10.3/§10.4): `src/retrieval/html/*` consumes the retrieval core's `map` output →
`src/report/html.ts` renderer, emitting inline graph JSON; new `tk graph serve` (localhost) + `tk graph
explore` printing/opening the URL in VS Code Simple Browser. Lazy-expand graph nav as inline client-side JS
over embedded JSON (no framework). v2 (deferred per §9): a single VS Code extension hosting the Webview
explorer **and** registering the Language Model Tool API tools **and** watching files for incremental — one
extension serving both surfaces.

### 11.4 Layer 4 — incremental freshness (cross-cutting, the hardest correctness lever)

Both surfaces need the graph to stay fresh cheaply. tk's design has hash-based per-file refresh — correct but coarse. The field gives the **sound symbol-level algorithm** (RepoDoc + RepoAgent), directly portable to tk's `symbols`/`edges` tables:

1. **AST-level diff, not text diff** (RepoDoc `diff_analysis.py`): on changed files, parse old (`git show base:file`) + new, classify each symbol into a `ChangeType` (`NEW / REMOVED / API_SIGNATURE_CHANGED / BODY_CHANGED / COMMENT_ONLY`). **Drop comment/whitespace-only changes → no re-index, no recompute.**
2. **Two-snapshot invalidation via stored fingerprints** (RepoAgent): a symbol is stale if its `code_hash` changed OR its `referencer_set_hash` changed (a caller appeared/disappeared). `new ⊆ old` = caller-removed; else caller-added — both invalidate dependents. This is why Layer-1 step 3 (store those hashes) matters.
3. **Scoped recompute via edge traversal** (RepoDoc): BFS downstream over `calls` edges from changed symbols → the exact set whose derived artifacts (map rank, doc, anchors) need refresh; topological order. tk's `tk_verify` / `tk graph index` should use this, not full reparse.
4. **Component-precise extraction** (RepoDoc `git show` + range): re-read only the changed symbol's slice, not the file.
5. **The "fake file" HEAD-vs-dirty trick** (RepoAgent): to answer "what is the graph at commit-state" while the working tree is dirty, swap dirty file out / HEAD content in / parse / restore. Useful for tk's `tk_verify` commit-time semantics.

> **Avoid CodeWiki's incremental** (path-substring + module-tree-ancestor-only) — unsound, misses real call-graph dependents.

#### tk integration
`src/retrieval/indexer/incremental.ts`: git-diff → AST ChangeType filter → fingerprint compare → downstream BFS over `edges` → scoped re-extract. Emit measurement facts (symbols reparsed vs skipped) — this *is* the offline A/B denominator the measurement harness (§12) wants.

### 11.5 Summary: what tk absorbs, per layer

| Layer | Absorb into tk | Source | Conflicts with current ADR? |
|---|---|---|---|
| 底座 | one typed-edge table (confirm), stable string IDs, per-node `code_hash`+`referencer_set_hash`, `source` enum column | GitNexus, RepoAgent, RepoDoc | No — sharpens design §4 |
| 底座 (gated) | DocNode tables (only for editable round-trip, far future) | RepoDoc | Only if a doc-editing layer ships |
| Agent | outline-first ladder explicit in contract; bounded/signature-default responses; keep 1-backend seam; `impact`/`trace` as v2 | DeepWiki, GitNexus | No — sharpens 4-tool design |
| Human | **structural (no-LLM) HTML graph explorer** reusing `src/report/html.ts`; **graph-viz lib (Cytoscape/Sigma) or self-built SVG/Canvas over inline JSON — NOT mermaid as primary**; self-built lazy-expand/anchor-panel UX; opened in **VS Code Simple Browser**; chat = **Copilot via MCP/LM-Tool**, not a tk-owned LLM | GitNexus (Sigma), Understand-Anything (React Flow/ELK), CodeWiki, DeepWiki | **Extends v1 — no tk-owned LLM, no ADR conflict** (see §10) |
| Incremental | AST ChangeType filter + fingerprint diff + downstream BFS + fake-file trick | RepoDoc, RepoAgent | No — sharpens design §5/§7 |

**Resolved direction (user, 2026-06-18):** the Human面 is a **structural, LLM-free graph→HTML explorer**, opened inside VS Code (Simple Browser / Webview); "Wiki" needs no LLM, and any chat over it is **Copilot** (the host's LLM) grounded via tk's MCP/Language-Model-Tool surface. **tk owns no LLM and spends no API tokens on either surface.** Everything else is additive sharpening of the already-accepted design. Remaining open item is only the org-policy ceiling (enterprise Copilot MCP/extension gating), which is pre-existing and documented, not a new decision.

### 11.6 Grilling outcomes (2026-06-18/19) — supersede §11.1–11.5 where they conflict

A subsequent grilling session (combining this absorption analysis, the §0–§10 design, and
[`codegraph-codewiki-next-stage-20260618.md`](./codegraph-codewiki-next-stage-20260618.md)) reframed the axis
away from ADR-compliance to **cost / benefit / feasibility / "can it really land"**, with two standing
principles from the user: **(a) don't slice features across phases — ship each feature as complete +
optimized, never "design now, refactor later"; (b) 1.0.0 = 底座 + codegraph only (no codewiki), but the 底座
must be future-facing for codewiki.** Resolved decisions:

- **G1 — Human surface.** HTML explorer **+** graph-derived Markdown, both **`source=graph`, tk holds/calls NO LLM**. Keep a `source` provenance field as a schema affordance (future host-LLM/Copilot prose would be tagged `source=host_llm`); no `llm_draft` pipeline in tk.
- **G2 — impact split by cost/ROI, not version.** T1 (1-hop static callers + `co_changes_with` git-pairwise + CODEOWNERS `owns`) first — cheap, deterministic/language-agnostic, highest ROI. T2 (tests/routes/configs) framework-specific, on-demand, `confidence=low` + raw-diff fallback. T3 (CI gates) opt-in separate surface.
- **G3 — incremental = symbol-level change detection as a 底座 primitive, built complete + tested now** (per-node `content_hash` + `referencer_set_hash` + git-diff→changed-symbols→downstream BFS + ChangeType filter). Trigger is lazy (on query / git event, no resident daemon). Rationale: codegraph used live during editing needs a fresh graph; and codewiki's "always-current" staleness is structurally a diff/invalidation query that must read this substrate — deferring it = the refactor-debt the user rejects.
- **G4 — 底座 graph model is generic (`nodes(kind,…,metadata_json)` + `edges(kind,…)` single tables) + migration system**, so codewiki's WikiPage/`documents`/wiki_blocks are future **pure-additive** kinds/tables, zero 底座 redesign. 1.0.0 populates only code-kinds; doc-provenance kinds are documented-but-reserved, not built. **ConceptNode dropped** (low signal + needs LLM).
- **G5 — storage = `node:sqlite` + Node ≥22.13 gate** (user's choice: accept cutting the Node-20 cohort in exchange for zero-dependency + native speed; core tk stays ≥20, graph path prints a clean version message + uses the no-warning child re-entry).
- **codewiki effort (estimate).** Because the 底座 is future-faced (G3/G4), codewiki is mostly *derive + render*, not *rebuild*: doc-provenance + staleness ~small (reuses G3); **page-derivation engine (graph→Markdown) is the main cost**, scaling with the number of page types; mermaid-from-edges small-med; **HTML explorer/renderer is the wildcard** (vendor vs self-built). Rough total for one experienced dev, 底座+codegraph done: **~2.5–4 weeks if the HTML explorer is shared with codegraph's human surface, ~4–7 weeks if codewiki gets its own renderer.** Runtime generation is **seconds, no LLM, no token cost** (vs DeepWiki/CodeWiki minutes+tokens). Two effort drivers to pin down: number of page types, and vendor-vs-self-built renderer.

> **Note on precedence.** §11.6 reflects the latest grilling and **supersedes** the earlier layer-by-layer
> notes (§11.1–11.5) and the §0–§10 design where they conflict — notably: impact is split by cost/ROI tiers
> (G2) not deferred wholesale to v2; incremental is a v1 底座 primitive (G3) not a "sharpening"; the schema is
> a single generic `nodes`/`edges` model (G4) with ConceptNode dropped; Node ≥22.13 is locked (G5).

---

## 12. Measurement harness (Slice −1)

> Merged from the former `measurement-harness-design-20260618.md` (2026-06-19). Implementation companion to
> **[ADR 0016](../adr/0016-measurement-before-feature.md)** ("measurement precedes the feature") and the
> implementation slices in §7. Grounds the telemetry methodology of
> [`low-token-agent-research-compendium-20260618.md`](./low-token-agent-research-compendium-20260618.md) §11
> against how the surveyed projects *actually* measure token saving (live-source audit, Appendix A below).
> **Question answered:** how do we evaluate the search/read token saving of tk's code graph — honestly,
> in tk's measured-≠-estimate ledger model — *before* building the graph?

### 12.0 TL;DR

1. **tk's existing `saved_tokens = raw − delivered` does not transfer.** That is a *within-call diff* (the proxy sees both the raw output and the compressed output in one invocation). A code-graph query has **no raw counterpart in the same call** — its win is *replacing a multi-call grep/read loop that never happened in the treatment run*. That saving is the **difference between two whole trajectories**, observable only by running both arms. This is exactly why ADR 0016 forbids the graph writing `saved_tokens`.
2. **Two epistemically distinct tracks.** **Track 1 — offline A/B eval** (the real, measured proof, trajectory level) and **Track 2 — online opportunity accounting** (live mechanical facts, `estimate_kind=opportunity`, never `saved_tokens`).
3. **Primary metric = `uncached_input_tokens` delta**, not total-token compression ratio. The surveyed gold-standard (codegraph) counts *total tokens incl. cached* — but SWE-ContextBench measured **cache-read at >97% of total usage**, so a total-token delta mostly measures cheap cache replay, not avoidable cost. Measuring **uncached** is where tk is *more honest than codegraph*.
4. **Imitate codegraph's A/B protocol shape** (same tool class, same MCP delivery), with two improvements: `uncached`-primary, and medians+spread. Co-measure quality with the papers' methods (localization F1, AST validity, `FAIL_TO_PASS`+`PASS_TO_PASS`).
5. **Track 2 is independently validated by Serena**, which explicitly *refuses* token benchmarking and reports "call counts, payload sizes, prerequisite steps" instead — tk's exact opportunity-facts posture.

### 12.1 The crux — why `saved_tokens` does not transfer

tk's measured ledger (`src/core/savings.ts:14`, `calculateSavings`) computes `max(0, rawTokens − outputTokens)` because the command proxy holds **both sides in one call**. Two different "wins" hide in a code graph, and only one is measurable that way:

| Win | What it is | Within-call measurable? | Class |
|---|---|:--:|---|
| **W1 — output projection** | the graph's *own response* collapses container bodies → signatures | **yes** — `full bodies − collapsed` is a real raw−delivered diff | can be `measured`, like an existing handler |
| **W2 — loop avoidance** | the agent skipped 5×grep + 3×read because one `tk_explore` answered | **no** — counterfactual; the avoided loop never ran in the treatment arm | A/B only → `opportunity` online, `measured` offline |

The headline benchmark figures (codegraph's "47% fewer tokens") are **overwhelmingly W2**. So the centre of gravity of the harness must be **trajectory-level A/B**, not within-call compression ratio.

### 12.2 Primary metric and the cache-token trap

The compendium §11 names `uncached_input_tokens` "the best measure of avoidable cost", and §12 risk #10 calls a high compression ratio that does not reduce uncached input "a fake win". The live-source audit makes this concrete and urgent:

- **codegraph** counts `Tokens = total tokens processed (input incl. cached + output)` (Appendix A.1, verbatim).
- **SWE-ContextBench** measured, on SWE-Bench-style repo tasks, that **cache-read tokens are >97% of total usage** (Appendix A.6). Agentic spend is input-bound *and* history-multiplied, so most of "total" is the prompt prefix being re-sent and cache-read cheaply.

⇒ A total-token delta is ~97% measuring cache replay. **tk's Track-1 primary metric is the `uncached_input_tokens` delta** (baseline − treatment), with `cached_input_tokens` reported alongside (never summed). Prefer **provider-reported usage** (Copilot CLI / Claude Code emit it); fall back to `estimateTokens` (`src/core/tokens.ts:72`) only when provider numbers are unavailable — and only for *relative* A/B comparison, where the same estimator on both arms cancels its bias. No absolute external % claim is ever made on the estimator alone.

### 12.3 Track 1 — offline A/B eval (the measured proof)

The gate ADR 0016 requires before any external % claim. Protocol, imitating codegraph (Appendix A.1) with the two improvements above:

```
fixed task set  ──►  for each task, run N times per arm, take the median (run-to-run variance is up to 30×)
 (§11 categories)     ┌─ BASELINE arm:   agent, tk MCP graph OFF (host-native grep/read/glob stay available)
                      └─ TREATMENT arm:  agent, tk MCP graph ON  (same native tools also available)
 capture per run:     ① provider usage  (total / input / cached / UNCACHED / output)
                      ② full session transcript  ──►  trajectory analyser (§12.4)
                      ③ task oracle verdict       (pass / fail, + edit correctness)
 report:              Pareto(success_rate × median uncached_tokens)
                      + secondary deltas: tool_calls · file_reads · search_calls · duplicate_reads ·
                        distinct_files_touched · rounds · latency
```

**Arm definition (copied from codegraph's `--strict-mcp-config` shape):** WITH = tk graph MCP enabled; WITHOUT = empty MCP config; **both arms keep the host's built-in read/grep/bash** so the only variable is the graph. Same task per arm.

#### 12.3.1 Task set

The compendium's 11 categories: *locate implementation · understand module architecture · follow call chain · modify function · add test · fix failing test · debug build error · inspect git diff · update config · understand component state flow · trace API route → service → database.* v1 starts with **one task per category on a known repo with an answer key** (tk's own repo is the cheapest oracle source).

#### 12.3.2 Quality / safety co-measurement (imitate the papers, not the marketing repos)

A token win that drops task success is a regression, not a win. Co-measure:

- **Localization quality — F1** (FastContext): for *locate/trace* tasks, `F1 = 2PR/(P+R)` of returned `file:line` against a patch-derived ground-truth set, instance-averaged.
- **Edit safety — AST validity** (SWE-Pruner): any code body the graph projects must parse; tree-sitter parse-success rate of returned snippets (SWE-Pruner: 87.3% vs 0.29% for naive truncation).
- **Task success — `FAIL_TO_PASS` + `PASS_TO_PASS`** (SWE-ContextBench): for *fix/modify/add-test* tasks, the target tests flip failing→passing *and* no regression in previously-passing tests.

#### 12.3.3 Safety via fallback-replay → `omission_bug_rate` (the core safety number)

Verbatim from compendium §11, made operational:

1. Run the task in the **treatment** arm (graph projections enabled).
2. If it **fails — or succeeds with suspicious retries** — identify the projected evidence the graph introduced (collapsed signatures, low-confidence hand-backs, staleness-banner files).
3. Re-run from the same checkpoint with **only those outputs escalated to raw / full-exact** form. *Pragmatic v1:* re-run the whole task with the graph forced into "raw passthrough" mode (full bodies, no signature collapse) and compare.
4. If the task **flips failure→success** or the answer fixes a factual omission, count one **context omission bug**. `omission_bug_rate` = omission bugs / treatment runs.

This turns the §8 quality gate from a slogan into a measured rate, and is the safety counterweight to the token metric (token spend alone does not predict success — arXiv 2604.22750).

### 12.4 The trajectory analyser (the main build gap)

A/B needs per-run trajectory metrics that tk does **not** yet compute. tk's inspect session readers already extract one `FlatRecord` per tool call `{tool_name, tool_input, tool_response, timestamp, sessionId}` from Copilot/VS Code transcripts (`src/inspect/vscodeReader.ts:24`), and the `ToolCategory` classifier already labels read/search/etc. The analyser consumes those and computes, per session/run:

| Metric | Operational definition (compendium §11) | Build note |
|---|---|---|
| `tool_calls` / `search_calls` / `file_reads` | counts by `ToolCategory` | classifier exists; just aggregate per-run (habits.ts only does mean/max) |
| `duplicate_reads` | keyed `(normalized_path, selector_type, selector_value, file_hash)` — separates "same path after change" (hash differs) from "wasteful re-read" (all equal) | extract path+range from `read_file` tool_input; `selector_type` ∈ whole-file / range / symbol; hash from content when available, else `(path,mtime)` proxy |
| `repeated_file/range/symbol_reads` | same file/range/symbol read >1× | derived from the dedup key above |
| `distinct_files_touched` | unique files surfaced to the agent | union of read/search-result paths |
| `search_result_usefulness` | a search is *useful* if one of its top candidates is read/edited, appears in the final diff, or is named in the final answer **within the next k tool actions** | parse candidate paths from the search `tool_response`, then look ahead k records |

Privacy: counts + labels + hashes only, no raw bodies — same posture as the existing scanner (`src/inspect/scan.ts`).

### 12.5 Track 2 — online opportunity accounting (never `saved_tokens`)

Live, per graph query, into a new **opportunity ledger** (③-style; `estimate_kind=opportunity`; reuses the four-ledger separation in `src/core/ledger.ts:65` so it is rendered side-by-side and **never summed** with measured accounts). Records **mechanical facts of what the query did**, *not* a savings figure:

- `nodes_returned`, `files_returned`, `tokens_returned` (of the graph's own response)
- `tool_calls_collapsed` = 1 (the single call standing in for the loop it replaces)
- `reads_avoided_in_session` — cross-referenced with the §12.4 analyser: did the agent subsequently *not* read files the graph already served verbatim?

The **only** token-savings number tk may surface next to this is the **reference rate measured in Track 1**, explicitly labelled `measured-in-eval, not on your machine`. A borrowed benchmark % (codegraph's 47%, a Repomix 70%) is **never** shown as if it were this user's measured saving — that is precisely the dishonesty tk's ledger model exists to prevent.

> **Independent validation.** Serena (the LSP-precision standard) *refuses* token benchmarking — its authors state benchmarks are "too small / self-contained" and token reduction is "harder to measure precisely", so they report **call counts, payload sizes, prerequisite steps** instead (Appendix A.5). That is Track 2's posture exactly. tk goes one step further by *also* building Track 1 to obtain a real measured %.

### 12.6 Reuse vs build, and the slice ordering

| Concern | Reuse (tk has it) | Build fresh |
|---|---|---|
| Token denominator | `estimateTokens` `src/core/tokens.ts:72` (fallback only) | provider-usage capture per run (primary) |
| Trajectory source | inspect readers `src/inspect/vscodeReader.ts:24` + `ToolCategory` classifier | per-run aggregation |
| Ledger separation / `estimate_kind` | four-ledger model `src/core/ledger.ts:65` | the opportunity ledger (Track 2) + an eval-results ledger (Track 1) |
| Bench scaffold | `scripts/benchmark/run.ts` (5-phase VM) | the A/B runner hooked into it |
| — | — | **trajectory analyser** (`duplicate_reads`, `search_result_usefulness`, …) |
| — | — | **A/B runner** (drive `copilot`/`claude -p` headless, MCP on/off, collect usage) |
| — | — | **task oracle** (per-task answer key / test verdict) |
| — | — | **fallback-replay** harness (omission-bug counting) |

**Slice −1 minimal viable closure (recommended):** single host (Copilot CLI headless) · 11 tasks × 1 each · N=5 medians · `uncached` primary · trajectory analyser with `duplicate_reads` + `search_result_usefulness` · fallback-replay as step 2. Track-2 online accounting ships alongside the graph slices, not in Slice −1.

### 12.7 Honesty boundaries (the invariants this harness must hold)

1. **Provider usage > estimator** for any absolute claim; estimator only for same-arm relative A/B.
2. **`uncached_input_tokens` is the primary number**, never total-incl-cached (the 97% trap).
3. **Medians + spread**, never single-run (field-wide variance up to 30×; nobody reports CIs — medians already put tk at/above field norm).
4. **Token win is never reported without the success-rate / omission-bug counterweight** (token spend does not predict success).
5. **Opportunity ≠ measured.** Track 2 facts carry `estimate_kind=opportunity` and never occupy the `saved_tokens` name (reserved for ledger ①).

### 12.8 Open questions (to resolve before building)

1. **Host + agent runner for Track 1:** Copilot CLI headless (tk's stated target) vs Claude Code headless (cleaner `usage` reporting). Decides how provider-usage capture is wired. *Lean: Copilot CLI for fidelity to the target; add Claude Code as a second arm if its usage stream is materially cleaner.*
2. **Task oracle source:** hand-author a small tk-repo task set (cheap, controllable, fits the 11 categories) vs adopt an external SWE-bench-style set (more authoritative, much heavier). *Lean: tk-repo set for Slice −1; revisit external sets once the harness shape is proven.*

### 12.A Appendix — how the surveyed projects measure token saving (live-source audit, 2026-06-18)

Four measurement *philosophies*. Only **A (trajectory A/B delta)** measures W2 (loop avoidance); B/C answer a different question; D is unsubstantiated.

#### Bucket A — trajectory A/B delta (the imitable template)

**A.1 codegraph (colbymchenry) — gold standard for a *tool* project.** Verbatim methodology:
> "Each arm is `claude -p` (Claude Opus 4.8) run headlessly against the repo with `--strict-mcp-config`: **WITH** = CodeGraph's MCP server enabled, **WITHOUT** = an empty MCP config. Built-in Read/Grep/Bash stay available to both. Same question per repo, **4 runs per arm, median reported**. Cost = the run's `total_cost_usd`; Tokens = total tokens processed (input incl. cached + output); Time = wall-clock; Tool calls = every tool invocation, including those inside any sub-agents the model spawns."

7 repos (VS Code/Excalidraw/Django/Tokio/OkHttp/Gin/Alamofire), 1 query each, provider-reported tokens. Transparent + externally verifiable; **no runnable script**. *Caveat tk fixes:* total-incl-cached token counting (see §12.2). Confidence: high.

**A.2 claude-context (zilliztech).** Baseline = simple read/grep/edit; treatment = +MCP; GPT-4o-mini; 30 SWE-Bench-Verified instances (2-file-mod, 15–60 min); 3 runs/method; 73,373 → 44,449 tokens (~39%); tool calls −36%; retrieval P/R/F1 ~0.40 held. Eval scripts exist; token-counting method unstated. Confidence: medium.

**A.3 FastContext (Microsoft, 2606.14066) — most rigorous protocol.** Baseline = mini-SWE-agent direct read; treatment = + trained explorer subagent. **Token accounting splits main-agent vs explorer** (explorer-internal tokens excluded from the main account; overhead reported separately ≈2.1%). SWE-bench Multilingual 300 / Pro 200 / SWE-QA (GPT-5.4 judge). Localization **F1** (instance-averaged, patch-derived ground truth). 45 configs, single-run-per-config. Full code + checkpoints. Confidence: high.

**A.4 SWE-Pruner (2601.16746).** Baseline = agent reads full files; treatment = +neural skimmer. **"76.1% of tokens = reads" derived by action-category tokenization** (classify each round's tokens into read/execute/edit; cross-validated 67.5% on GLM-4.6). Reduction reported as a **23–54% range** (headline 39% token / 26.8% cost). **AST validity** via tree-sitter (87.3% vs 0.29% naive). 50-sample SWE-Bench subset + SWE-QA; 3 seeds (partial). Open-source. Confidence: medium-high.

**A.5 SWE-ContextBench (2602.08316) — the oracle-ceiling method.** 5 settings (no-experience / free / oracle × trajectory / summary); 300 SWE-Bench-Lite + 99 derived; success = `FAIL_TO_PASS` ∧ `PASS_TO_PASS`. **Key data points tk relies on:** cache-read >97% of usage; summary 217 tok vs full trajectory 25,634 tok; oracle summary 34.34% vs 26.26% baseline. Single-run/setting. Confidence: high.

#### Bucket B — budget cap (no delta claim)

**aider repo-map.** No % claim; **binary-searches ranked tags to fit `--map-tokens`** (default 1024, ±15% tolerance, `ok_err=0.15`); counts via `litellm.token_counter(model=…)` (model-aware), ~1% line sampling for large texts. Self-states "the token counts aider reports are *estimates*" and "aider never *enforces* limits". Transparent, reproducible, but answers "does it fit the budget", not "how much did it save".

**Probe (probelabs).** No % claim; `--max-tokens` cap only; tokenizer undocumented; states the structural efficiency claim ("one call vs 10+ agentic loops") but no measured delta.

#### Bucket C — structural / on-demand (saving by design, unmeasured)

**codesearch (flupkede).** Returns metadata by default (`compact=true`), full code via `get_chunk` on demand. Saving is architectural; no corpus, no measured %.

#### Bucket D — unsubstantiated headline (avoid imitating)

**GitNexus** — "74% / 88%" appears **nowhere** in the (1300-line) repo/docs; no baseline, dataset, or method. **Repomix** — "~70%" with no corpus/method; the compression mode is self-marked **experimental** and unfit for exact edit/debug reads. **cocoindex-code** — "~70%" from a single anecdote (1.8K → ~650 tokens). These are the marketing-% pattern tk's measured-≠-estimate ledger exists to refuse.

#### Rigor ranking (for imitation priority)

`FastContext ≈ SWE-ContextBench ≈ codegraph (high) > SWE-Pruner (med-high) > claude-context (med) > aider (high *as a cap*, n/a as a delta) > Probe / codesearch (no delta) > Repomix / cocoindex / GitNexus (unsubstantiated)`.

**Cross-cutting facts:** none of the surveyed work reports statistical-significance tests or confidence intervals; single-run or few-seed is the norm; run-to-run variance is universally acknowledged. tk reporting **medians + spread** already exceeds field norm.

### 12.B Appendix — measurement provenance

- Compendium §11 (telemetry set, operational defs, fallback-replay, eval principle): [`low-token-agent-research-compendium-20260618.md`](./low-token-agent-research-compendium-20260618.md).
- ADR: [0016 measurement-before-feature](../adr/0016-measurement-before-feature.md) · scope [0013](../adr/0013-code-graph-surface-scope.md).
- tk infra reused by the harness: `src/core/tokens.ts` (estimator), `src/core/savings.ts` (within-call diff), `src/core/history.ts` (`HistoryRecord`), `src/core/ledger.ts` (four-ledger `estimate_kind` separation), `src/inspect/vscodeReader.ts` + `src/inspect/scan.ts` + `src/inspect/habits.ts` (trajectory source), `scripts/benchmark/run.ts` (scaffold).
- Sources audited live 2026-06-18: codegraph (github.com/colbymchenry/codegraph), FastContext (arxiv 2606.14066 + github.com/microsoft/fastcontext), SWE-Pruner (arxiv 2601.16746), SWE-ContextBench (arxiv 2602.08316), claude-context (github.com/zilliztech/claude-context), aider (aider.chat/docs/repomap.html), Probe (github.com/probelabs/probe), codesearch (github.com/flupkede/codesearch), Serena (github.com/oraios/serena), Repomix (repomix.com/guide/code-compress), GitNexus (github.com/abhigyanpatwari/GitNexus), cocoindex-code.

---

## 13. References

- Landscape companion: [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
- Research compendium (five-family evidence base + telemetry §11): [`low-token-agent-research-compendium-20260618.md`](./low-token-agent-research-compendium-20260618.md).
- Research companion (raw survey): [`code-graph-research-20260618.md`](./code-graph-research-20260618.md).
- Code-graph + Wiki landscape (10 projects): [`codegraph-wiki-landscape-20260618.md`](./codegraph-wiki-landscape-20260618.md).
- Next-stage architecture synthesis: [`codegraph-codewiki-next-stage-20260618.md`](./codegraph-codewiki-next-stage-20260618.md).
- ADRs (source of truth): [0013](../adr/0013-code-graph-surface-scope.md) · [0014](../adr/0014-tk-becomes-mcp-server.md) · [0015](../adr/0015-node-sqlite-feature-gate.md) · [0016](../adr/0016-measurement-before-feature.md).
- Aider repo map: https://aider.chat/docs/repomap.html.
- Serena: https://github.com/oraios/serena.
- RepoMapper: https://github.com/pdavis68/RepoMapper.
