# Code Graph for token-killer — design & implementation plan (2026-06-18)

> Companion / landing piece to [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
> That report concluded **repo-map / code-graph (surface #5) is the single genuinely-new, high-value
> capability tk can add** for the VS Code Copilot target. This document turns that conclusion into a
> concrete, buildable design, under one hard product constraint set by the user:
>
> **tk stays a plain npm package. No VS Code extension. Target hosts remain VS Code Copilot + Copilot CLI
> (and, for free, the other terminal agents).**
>
> Primary reference implementation studied (cloned + read in full): **colbymchenry/codegraph** (MIT).
> Competitive set surveyed below. Status: **design proposal — not yet committed.**

---

> ## ⚑ Resolution status — grilled 2026-06-18 (`/grill-with-docs`)
>
> A grilling session walked the decision tree top-down and resolved every load-bearing fork.
> **Where this document and the ADRs below disagree, the ADRs win** — the prose in later sections
> is being reconciled to them. Resolutions:
>
> 1. **Reframe (root):** this is **not** a codegraph port and **not** a competitor — it is a
>    **graph-centered *synthesis*** that folds in other projects' *search/read* token-saving
>    techniques as enhancements. The §8 "honesty is unique" differentiation is **withdrawn**
>    (codegraph already has provenance/hand-back/staleness); the real justification is
>    **unification** (zero extra install for existing tk users, co-located with the compression
>    layer, CLI auto-compressed by the shim). → [ADR 0013](../adr/0013-code-graph-surface-scope.md)
> 2. **tk becomes an MCP server** (per-session stdio child, *not* a daemon; hand-rolled JSON-RPC,
>    no SDK). Full triad (MCP + CLI + install wiring) all in v1. → [ADR 0014](../adr/0014-tk-becomes-mcp-server.md)
> 3. **Decision 1 (2 WASM deps): accepted.** **Decision 2: `node:sqlite` + Node ≥ 22.5 gate**, core
>    stays ≥ 20 — **contingent on an install-base Node-version check before commit**.
>    → [ADR 0015](../adr/0015-node-sqlite-feature-gate.md)
> 4. **Index location: out-of-tree, period** — no in-tree mode even as a future toggle (it would
>    violate the codified "repo is never written" invariant). Open question §10.3 is **closed**.
> 5. **Measurement harness is built *first*, before the graph** — value is reported only as
>    mechanical `opportunity` facts, never `saved_tokens`. → [ADR 0016](../adr/0016-measurement-before-feature.md)
> 6. **v1 is navigation-only** (locate/understand). The edit-window + `purpose=` machinery (§11.2–3)
>    moves to **v2** — editing-must-be-exact is too heavy a burden for v1.
> 7. **The explicit no-s:** embeddings out (invariant); the broad "context gateway" out (no
>    general log/diff/JSON layer — stays with existing handlers); the framework-resolver moat out;
>    enterprise-locked VS Code Copilot uncovered (accepted).

---

## 0. TL;DR

1. **Approach: structural code graph** (tree-sitter → symbol/call/import graph → SQLite+FTS5 → query),
   *not* embeddings, *not* LSP, *not* whole-repo packing. This is the only one of the four families that
   fits tk's invariants (100% local, no API key, no code egress, **no native compilation**) and tk's
   quality gate (every result resolves to a real `file:line`; heuristic edges are provenance-tagged;
   low-confidence → honest hand-back). It is also the *proven winning pattern* in 2026 (CodeGraph,
   GitNexus, CodeGraphContext all converged here).
2. **Delivery, npm-only:** tk grows **its own MCP server** (`tk serve --mcp`) exposing 4 graph tools, plus
   terminal CLIs (`tk map` / `tk explore` …) that the shim already compresses, plus the instruction-file
   marker tk already writes. This is *exactly* codegraph's delivery model — which ships **no extension**
   and still reaches Claude Code / Cursor / Codex / Copilot-CLI.
3. **Honest reach cost of dropping the extension:** the *only* casualty is **enterprise-locked VS Code
   Copilot**, where MCP is admin-default-OFF and the extension's Language Model Tool API was the lone
   alternative. Everywhere else (personal/permissive VS Code Copilot, Copilot CLI, Claude Code, Cursor,
   Codex) the MCP + CLI channels work. codegraph accepts the same limit (it doesn't list VS Code Copilot
   as a target at all).
4. **Synthesize, don't single-port** *(reframed — see ⚑ banner, [ADR 0013](../adr/0013-code-graph-surface-scope.md))*:
   the graph is the center, and the best **search/read** techniques from across the survey fold in as
   enhancements. codegraph (MIT) is the richest *single* source to draw from — its DB schema,
   extraction/resolution structure, and (most importantly) its `buildContext`/explore ranking. Re-skin onto tk's house style
   (`defineHandler`, the `(path,mtime,size)` extract cache, the per-project `~/.token-killer` store, the
   single-file HTML report, the `hostAdapter` install table). Study GitNexus/cocoindex only for *ideas*
   (GitNexus is PolyForm-Noncommercial — no code reuse).
5. **Two identity decisions — now resolved** *(⚑ banner; [ADR 0015](../adr/0015-node-sqlite-feature-gate.md))*:
   (a) **accepted** — add **2 pure-WASM/JS deps** (`web-tree-sitter`, `tree-sitter-wasms`); tk leaves "zero
   production deps" but keeps "no native build" (the load-bearing guarantee). (b) **accepted, contingent** —
   the graph store uses **`node:sqlite`** (Node **22.5+** builtin); the feature gates on Node ≥ 22.5 with
   graceful degradation, tk core stays ≥ 20 — **pending an install-base Node-version check before commit**,
   since the gate breaks tk's "works the same everywhere" property.

---

## 1. Why a code graph, and why now

From the landscape report: **60–80% of an agent's tokens go to *orientation*** (grep/glob/Read to find
the relevant code), not to the task. A pre-built, ranked structural index answers "how does X work / who
calls Y / what breaks if I change Z" in **one tool call returning verbatim source**, replacing a long
discovery loop. codegraph's own re-validated Opus-4.8 benchmark (7 repos, median of 4): **16% cheaper,
47% fewer tokens, 22% faster, 58% fewer tool calls**, often with **zero file reads**. The mechanism is
not magic — it front-loads the orientation work once, on-device, and serves it cheaply thereafter.

This is the one surface where tk can be *additive and unique*: there is **no built-in Copilot/Claude
competitor** for "give me the call graph", unlike command-output compression (where the host now ships
`compressOutput`) or history compaction (host-native `/compact`).

---

## 2. Competitive landscape — the four families (surveyed 2026-06-18)

Tools researched live this pass (beyond the landscape report): codegraph (cloned), cocoindex-code
(cloned), GitNexus, CodeGraphContext, Serena, claude-context, grepai, Repomix, code-review-graph,
Codebase-Memory (arXiv 2603.27277), Octocode, mcp-vector-search. They cluster into four approaches:

| Family | Representative projects | How it retrieves | Storage | Local / no-key / no-egress | Native build? | Fit for tk |
|---|---|---|---|:--:|:--:|:--:|
| **1. Structural graph** | **codegraph (MIT)**, GitNexus (PolyForm-NC), CodeGraphContext, Codebase-Memory, code-review-graph | tree-sitter → symbol/call/import graph → graph traversal + FTS | SQLite / Kuzu / Neo4j | ✅ all | ❌ none (WASM) | ✅✅ **best fit** |
| **2. Embeddings / semantic** | cocoindex-code (Apache-2.0), claude-context, grepai, mcp-vector-search | AST-chunk → embed → vector similarity | sqlite-vec / Milvus / LanceDB / LMDB | ⚠️ needs embed model | ❌/⚠️ | ❌ conflicts |
| **3. LSP** | Serena, Octocode, mcp-language-server | wrap real language servers | language server | ✅ but heavy | ⚠️ per-lang runtimes | ❌ heavy |
| **4. Context packing** | Repomix (26k★), aider repo-map, code2prompt | flatten/compress whole repo into one blob | memory/file | ✅ all | ❌ | 🟡 cheap MVP only |

**Why family 1 and not the others, for tk specifically:**

- **vs Embeddings (2):** local embeddings drag in `sentence-transformers` (~1 GB of torch+transformers,
  cocoindex's own `[full]` note) or a cloud API key + **code egress** + per-token cost. Both break tk's
  "100% local, no key, no network, lightweight" identity. Worse, semantic similarity is *approximate* —
  it can surface plausibly-related-but-wrong code, which is the **antithesis of tk's "never fabricate"
  gate**. grepai's "97% fewer input tokens" is real but bought with an Ollama embedding daemon.
- **vs LSP (3):** Serena is the symbol-level *precision* standard, but it needs a real language server
  per language at runtime — a heavy, per-stack install that fights tk's "single npm package, works the
  same everywhere" model. Good as a *complement* (an org running Serena loses nothing), not as tk's core.
- **vs Context packing (4):** Repomix-style tree-sitter signature compression is *close to what tk's
  `read --level aggressive` already does for one file*, scaled to a repo. It's the cheapest possible MVP
  and a legitimate fallback, **but it cannot answer callers/callees/impact** — it has no graph, just a
  flattened map. Use its compression trick inside our formatter; don't stop there.
- **Quality-gate alignment (the decisive factor):** in a structural graph every node is a concrete
  `file:line` the agent can verify, and edges that come from heuristics (callbacks, framework routing,
  RN/ObjC bridging) are explicitly tagged `provenance:'heuristic'`. That maps 1:1 onto tk's "declared
  omission + lossless recovery" contract. **A code graph is the most quality-gate-compatible capability
  in the whole landscape report.**

**License reality:** port from **codegraph (MIT)**. **GitNexus is PolyForm Noncommercial** — read for
ideas (its *clustering / community-discovery* and *process/flow tracing* phases are nice and codegraph
lacks them), but **do not copy code**. cocoindex is Apache-2.0 (portable) but it's the embeddings path we
are declining.

---

## 3. Delivery under the npm-only constraint

### 3.1 The channels that survive without an extension

The landscape report's channel taxonomy (C1–C9), filtered to "npm package can use it":

| Channel | tk uses it as | Reaches | Status without extension |
|---|---|---|---|
| **C1 PATH shim** | `tk map`/`tk explore` in terminal, output auto-compressed | terminal commands (`run_in_terminal`) | ✅ already have the shim |
| **C3 MCP server** | **NEW: `tk serve --mcp`** exposing graph tools | the agent's tool loop (direct, no terminal) | ✅ build it — the main new artifact |
| **C5 instruction marker** | tk already writes guidance into CLAUDE.md/AGENTS.md/copilot-instructions | nudges the agent to prefer the tools | ✅ already have `src/shim/guidance.ts` |
| ~~C8 extension LM-tool~~ | — | direct-tool surface in *locked* enterprise Copilot | ❌ **dropped by constraint** |

So the npm-only delivery = **MCP server (primary) + terminal CLI (shim-compressed) + instruction marker**.
This is codegraph's exact triad (`serve --mcp` + `codegraph explore` CLI + marker section in the agent's
instructions file). We are on a paved road.

### 3.2 Honest reach matrix (what the user is trading away)

| Host | MCP channel (C3) | Terminal `tk map` (C1) | Net code-graph reach |
|---|:--:|:--:|---|
| **Copilot CLI** | ✅ open | ✅ shim intercepts | **Full** |
| **Claude Code / Cursor / Codex / opencode** | ✅ open | ✅ | **Full** (free side-benefit) |
| **VS Code Copilot — personal / permissive org** | ✅ MCP GA (`chat.mcp.discovery.enabled`) | 🟡 only if agent shells out | **Full via MCP** |
| **VS Code Copilot — enterprise locked** | 🔴 admin policy "MCP servers in Copilot" **default-OFF** | 🟡 PATH also manageable | **Closed** — this is the cost |

**The single casualty of dropping the extension is enterprise-locked VS Code Copilot.** There, MCP is
admin-gated off and the extension's Language Model Tool API (C8) was the only other door. The landscape
report flagged exactly this. Everywhere else, npm-only reaches the code graph fine. **Recommendation:**
accept it. Building/maintaining/signing/allow-listing a VS Code extension to win *only* the locked-org
slice is disproportionate; revisit it as a separate "tk extension" track later if enterprise demand is
proven. Document the limit honestly in `tk install`'s output for the VS Code target.

---

## 4. Architecture

Five stages, mirroring codegraph's pipeline, re-homed on tk infrastructure:

```
                      ┌──────────────── tk code-graph module (lazy-loaded) ───────────────┐
  source files  ──▶   │  ① EXTRACT          ② RESOLVE           ③ STORE                    │
  (git-tracked) │     │  tree-sitter WASM   cross-file edges    node:sqlite + FTS5         │
                │     │  per-file workers   import/call/impl    nodes·edges·files·unresolved│
                │     └──────────────┬─────────────────────────────┬──────────────────────┘
   (path,mtime, │                    │ incremental, keyed by        │
    size) cache ◀────────────────────┘ tk's existing extractCache   │
                                                                     ▼
                      ┌──────────────────────────── ④ EXPLORE / QUERY ─────────────────────┐
                      │  NL→symbol regex · hybrid FTS+exact search · BFS traversal (depth 1)│
                      │  adaptive output budget · container→signature collapse              │
                      │  call-path surfacing · low-confidence honest hand-back              │
                      └──────────────┬───────────────────────────────┬────────────────────┘
                                     ▼                                ▼
                      ⑤a  tk serve --mcp   (C3)            ⑤b  tk map / explore / node …  (C1, shim-compressed)
                          tk_explore · tk_node                  + tk map --html (single-file report)
                          tk_search · tk_callers
```

### ① Extraction

- **Engine:** `web-tree-sitter` (WASM runtime) + `tree-sitter-wasms` (pre-built grammar `.wasm` blobs).
  Both are **pure WASM/JS — no native compilation, no node-gyp** — which is *the* reason this is
  acceptable for tk's distributed field (varied Node/AV/PATH; see the "fixes-prioritize-distributed-field"
  principle). Lazy-load grammars only for languages actually present in the repo (codegraph's
  `loadGrammarsForLanguages`).
- **Unit:** per-file `extract(path, source, language) → { nodes[], edges[], unresolvedRefs[], errors[] }`.
- **Parallelism (port from codegraph):** a `parse-worker` `worker_thread` pool; **reset the parser every
  N files** (WASM heap never shrinks) and recycle workers periodically; per-file parse timeout so one
  pathological file can't stall the index. These are non-obvious correctness details — port them verbatim.
- **Node kinds / edge kinds:** start from codegraph's set (21 node kinds: file/class/function/method/…;
  11 edge kinds: contains/calls/imports/extends/implements/references/…). Cut to a v1 subset
  (function/method/class/interface/import + calls/imports/contains/extends) and grow.
- **Language coverage v1:** TS/JS/TSX, Python, Go, Rust, Java — the six in codegraph's benchmark and
  tk's likely user base. tree-sitter-wasms covers 20+, so adding a language is "register a grammar +
  write the query," not new infra.
- **Reuse:** tk's `read --level aggressive` already has `IMPORT_PATTERN` / `FUNC_SIGNATURE` regexes and
  language-aware comment stripping — keep them as the **regex fallback** for languages with no grammar
  loaded (degraded "signatures only, no edges" mode, clearly labeled).

### ② Resolution

Post-extraction pass that turns name-level references into real cross-file edges (`call → def`,
`import → file`). Port codegraph's `import-resolver` + `name-matcher` structure (path-alias/tsconfig
resolution, workspace packages, family-aware matching). **v1 scope:** imports + direct calls. **Defer:**
the callback-synthesizer and the 24 framework resolvers (React re-render, Django routes, RN/ObjC
bridging) — these are codegraph's deep moat and a *lot* of code; add later by demand. Every synthesized
or heuristic edge **must carry `provenance:'heuristic'` + a `synthesizedBy` tag** — this is the tk
quality-gate contract, not optional.

### ③ Storage

- **`node:sqlite` (`DatabaseSync`)** — real SQLite compiled into Node (WAL + **FTS5**), **zero external
  dependency**, exactly what codegraph uses. FTS5 is required for the explore ranking (full-text symbol
  search). This is why the feature gates on **Node ≥ 22.5**.
- **Schema (port codegraph's):** `nodes` (id, kind, name, qualified_name, file_path, language,
  start/end_line, signature, is_exported…), `edges` (source, target, kind, metadata, provenance, line),
  `files` (path, content_hash, language, mtime, node_count), `unresolved_refs`, `project_metadata`; FTS5
  virtual table on `nodes(name, qualified_name, signature)` kept in sync by triggers; indices on
  name/qualified_name/file_path and edges(source,kind)/(target,kind).
- **Location — tk convention, not codegraph's:** codegraph writes `.codegraph/` *into the repo tree*. tk's
  house convention is the per-project data dir, so the graph lives at
  **`~/.token-killer/projects/repo:<fingerprint>/graph.db`** (same fingerprint scheme as `history.jsonl`).
  This keeps tk from polluting the user's repo / `.gitignore` (aligns with "tk never touches user files
  it didn't create"). *Open question — see §10 — whether to offer an opt-in in-tree mode for CI/sharing.*

### ④ Explore / query — **port codegraph's `buildContext` ranking wholesale**

This is the highest-value thing to port and the hardest to get right from scratch (~400 lines of tuning
in codegraph's `src/context/index.ts`). Pipeline:

1. **NL → candidate symbols:** regex-extract CamelCase / snake_case / SCREAMING_SNAKE / dotted /
   plain-lowercase tokens from the query, minus a ~60-word English stoplist.
2. **Hybrid search, merge by max score across channels:** (a) exact name lookup with co-location boost
   (multiple query symbols in one file → boost); (b) definition-prefix search over class/interface/enum
   kinds with stem variants and a brevity bonus; (c) FTS text search with multi-term boost.
3. **Re-rank:** multi-term co-occurrence, test-file deprioritization, dominant-file boost.
4. **BFS traversal (depth 1 default)** from top results over `contains`/`calls` edges → subgraph.
5. **Code-block extraction with adaptive budget:** containers (class/interface) collapse to a
   **signature outline**, leaf functions show **verbatim source**, per-file char caps scale by repo size
   (codegraph's 4 tiers: <150 / <500 / <5k / 5k+ files). Polymorphic siblings (≥3 implementers of one
   interface) skeletonize to signatures with one full exemplar.
6. **Call-path surfacing:** DFS over `calls` edges, keep chains ≥3 nodes anchored to ≥2 query roots,
   label synthesized hops inline (`→[callback via onX @file:line]`).
7. **Honest hand-back (the tk twist):** when the subgraph confidence is low (query matched mostly common
   words / isolated entry points), emit a marker telling the agent to fall back to exact symbols or to
   `Read` directly — **never fabricate a confident answer.** This *is* tk's quality gate applied to graphs.

### ⑤ Serve

**⑤a — MCP server (`tk serve --mcp`), the primary new artifact.**
- **Transport: hand-rolled newline-delimited JSON-RPC 2.0 over stdio** — port codegraph's
  `src/mcp/transport.ts`. This avoids adding `@modelcontextprotocol/sdk` as a dependency (cocoindex took
  the SDK dep; codegraph didn't). Keeps tk's minimal-dep ethos.
- **Tools (4, matching codegraph's measured "fewer tools steer better" finding):**

  | Tool | Purpose |
  |---|---|
  | `tk_explore` | **Primary.** NL query / symbol / file → relevant verbatim source grouped by file + relationship map + blast radius, in one call. |
  | `tk_node` | One symbol's full source + callers/callees; or read a whole file like Read (offset/limit) with dependents attached. |
  | `tk_search` | Locate a symbol by name across the repo. |
  | `tk_callers` | Every call site of a symbol (incl. callback registrations once the synthesizer lands). |

- **Server-instructions on `initialize`:** port codegraph's guidance text (answer structural questions
  directly, don't re-grep, pick tool by intent, check the staleness banner) — re-skinned for tk's voice.
- **Inactive when un-indexed:** if no `graph.db` for this project, the server registers **no tools** and
  says so — indexing stays the user's decision (codegraph's exact behavior; good citizen).

**⑤b — terminal CLI**, lazy-registered alongside tk's existing subcommands (the `cli.ts` lazy-import
pattern, zero impact on the compression hot path):

```
tk map [path]                 # build/refresh the index for a project (alias: index)
tk explore <query>            # same output as the tk_explore MCP tool, for terminal use
tk node <symbol|file>         # one symbol's source + callers, or read a file
tk search <name>              # locate symbols
tk callers <symbol>           # call sites
tk map --html                 # single-file HTML report (reuse src/report/html.ts renderer)
tk serve --mcp                # run the stdio MCP server
```

The shim already compresses any of these when an agent runs them in the terminal — so the CLI path gets
tk's output-compression for free, no new work.

---

## 5. What to reuse from tk vs port from codegraph vs build fresh

| Concern | Reuse (tk has it) | Port (codegraph, MIT) | Build fresh |
|---|---|---|---|
| Incremental indexing key | **`extractCache` `(path,mtime,size)` + schema version** (`src/inspect/extractCache.ts`) — perfect fit, drives "only re-extract changed files" | — | wire it to the graph store |
| Per-project storage root | **`~/.token-killer/projects/repo:<fp>/`** + fingerprint walk | — | `graph.db` lives here |
| HTML report | **`src/report/html.ts`** single-file embedded-JSON renderer | — | a `map` report kind |
| Install / host wiring | **`src/shim/hostAdapter.ts`** adapters table + `src/hook/install.ts` | codegraph's per-target MCP-config writers (as a pattern) | add an **MCP-config writer per host** (`~/.copilot/mcp-config.json`, `.vscode/mcp.json`, `~/.claude.json`) |
| Instruction marker | **`src/shim/guidance.ts`** marker-fenced upsert | codegraph's instructions-template | add the graph-tool guidance text |
| CLI dispatch | **`src/cli.ts`** lazy-import subcommand pattern | — | register `map`/`explore`/`serve` |
| Quality gate | **`makeFilteredResult` / OmissionDeclaration** philosophy | — | apply to graph output (provenance tags, low-confidence hand-back) |
| Extraction engine | the `read --level aggressive` regexes as a **fallback** | grammar loading, **parse-worker pool, parser-reset cadence** | grammar→query glue |
| DB schema + FTS5 | — | **`src/db/schema.sql` + sqlite-adapter** | tk-flavored migrations |
| Explore ranking | — | **`src/context/index.ts` `buildContext`** (the crown jewel) | tk output formatting |
| MCP transport + tools | tk's MCP **detection** (`src/inspect/mcp.ts`) is unrelated — tk has never *run* a server | **`src/mcp/transport.ts`** JSON-RPC stdio | the 4 tk_* tool handlers |
| Sync / freshness | — | watcher + staleness-banner + connect-time catch-up (study; **defer the daemon**) | mtime reconciliation on query for v1 |

**Net new code is concentrated in:** the grammar→query glue per language, the MCP server + 4 tool
handlers, and the per-host MCP-config writers. Everything else is either reused tk infra or a port of MIT
code.

---

## 6. Dependencies & distribution (npm-only)

### 6.1 New dependencies — the identity question

| Dep | Kind | Native build? | Why |
|---|---|:--:|---|
| `web-tree-sitter` | runtime, pure JS+WASM | **No** | the parser runtime |
| `tree-sitter-wasms` | runtime, pure WASM blobs | **No** | pre-built grammars (20+ langs) |
| `node:sqlite` | **Node builtin** (≥22.5) | **No** | graph store + FTS5; *not* an npm dep |
| MCP transport | hand-rolled, **no dep** | — | port codegraph's JSON-RPC-over-stdio |

tk currently has **zero production dependencies**. This adds **two** — but both are **pure WASM/JS with no
native compilation**, so tk keeps the property that actually matters for its distributed field: **install
never invokes node-gyp / a C toolchain / platform-specific binaries.** They are **lazy-imported only when
`tk map`/`tk serve` runs**, so the compression hot path and users who never touch the graph pay nothing at
runtime (the cost is tarball size at install).

> **Decision 1 — RESOLVED: accepted** (grilled 2026-06-18). Leave "zero production deps" for these two
> pure-WASM/JS deps; the "no native build" guarantee — the one that's load-bearing for tk's varied install
> base — holds. This is forced by "build the graph at all": no parser, no graph, and WASM is the only
> no-native-compilation path. See the ⚑ banner. ([ADR 0015](../adr/0015-node-sqlite-feature-gate.md) records
> the dep + store choices together.)

### 6.2 Node version

`node:sqlite` needs **Node ≥ 22.5**. tk's engine floor is currently `>=20`. Unlike codegraph, **tk does
not bundle its own Node runtime** — it runs on the user's Node. So:

> **Decision 2 — RESOLVED: accepted, contingent** (grilled 2026-06-18; [ADR 0015](../adr/0015-node-sqlite-feature-gate.md)).
> The **code-graph feature** requires Node ≥ 22.5; tk **core** stays `>=20`. On older Node, `tk map`/`tk serve`
> print a clear "code graph needs Node ≥22.5 (you have X); compression features are unaffected" message and
> exit cleanly. **The contingency:** the gate silently darkens the feature on Node 20/21 (still LTS, large
> install share), which collides with tk's "works the same everywhere" principle — so **before committing,
> check the install-base Node-version distribution; if the `<22.5` share is large, reconsider a WASM SQLite
> (sql.js / wa-sqlite, FTS5-built)**. Chosen over (a) bumping tk's whole floor (breaks existing users) or
> (b) a pure-JS SQLite/FTS reimplementation (large, slow, redundant), and over the WASM-SQLite option
> *unless the data says otherwise* (it adds a second WASM heap to manage — risk #6).

### 6.3 Packaging

- Single npm tarball as today (`tsdown` bundle). The WASM grammars ship inside `tree-sitter-wasms`
  (resolved as a normal dep) — **platform-independent**, so unlike codegraph tk needs **no per-platform
  packages and no curl/PowerShell installer**; one `npm i -g token-killer` works on every OS. This is
  actually *simpler* than codegraph's 6-platform bundle matrix, because tk leans on the user's Node
  instead of vendoring one.
- Tarball size grows by the grammar set (low-MB). If that proves objectionable, a follow-up can move
  grammars to `optionalDependencies` + a `tk map setup` fetch — but start simple (regular dep,
  lazy-imported), per tk's "no speculative config" rule.

---

## 7. Sync & freshness

codegraph's freshness story is a detached **daemon + native file watcher + staleness banner +
connect-time catch-up**. That's a lot of moving parts (daemon lockfiles, socket transport, PPID
watchdogs, Windows named-pipe hazards). For tk v1, **defer the daemon**; get correctness cheaply:

- **Incremental re-index** keyed by tk's existing `(path,mtime,size)` cache: on `tk map` / on MCP
  `initialize`, reconcile the `files` table against the working tree (`stat` only), re-extract just the
  changed/added files, drop removed ones. This is codegraph's "connect-time catch-up" without the daemon.
- **Staleness honesty (quality gate):** if a query would reference a file whose `mtime` is newer than its
  indexed `mtime`, **prepend a `⚠️` banner naming the file and telling the agent to `Read` it directly** —
  port codegraph's per-file banner. Cheaper than guaranteeing freshness, and on-brand (never serve a
  silently-stale answer).
- **Defer:** the FSEvents/inotify watcher + long-lived daemon (a clear v2 once the index proves its
  worth). Until then a one-off `tk map` re-sync + per-query mtime check is enough and far simpler to ship.

---

## 8. Quality-gate integration — tk's differentiator

The landscape report's framing: tk's edge is **"never fabricate, lossless recovery"** applied to a
surface. For a code graph that means concretely:

1. **Every returned node resolves to a real `file:line`** the agent can open — verifiable, not generated.
2. **Heuristic/synthesized edges are provenance-tagged** (`provenance:'heuristic'`, `synthesizedBy:`)
   and the formatter labels them inline, so the agent can tell a parsed call from an inferred one.
3. **Low-confidence → explicit hand-back**, not a confident guess (the `buildLowConfidenceNote` port).
4. **Staleness banner** rather than a silently stale answer (§7).
5. **No lossy summarization of code bodies without recovery** — collapsing a class to signatures is a
   *declared* projection (the agent knows to `tk_node` for the full body), mirroring tk's
   `OmissionDeclaration` contract.

This honesty is what separates the graph from a naive repo-map. **Correction (grilled 2026-06-18,
[ADR 0013](../adr/0013-code-graph-surface-scope.md)):** the earlier claim that "no other tool foregrounds
this" is **withdrawn** — the reference implementation (codegraph) already ships provenance tags, the
low-confidence hand-back, and the staleness banner (research compendium §4.1). So these are *table stakes
ported in*, **not** tk's differentiator. tk's actual edge is **unification** — the graph is co-located with
tk's compression layer, installs with a tool the user already has, and its CLI output is auto-compressed by
the shim — not a unique honesty story.

---

## 9. Phased roadmap (vertical slices)

Each slice is independently shippable and ends green. **Reordered (grilled 2026-06-18,
[ADR 0016](../adr/0016-measurement-before-feature.md)): the measurement harness comes first**, and the whole
v1 is **navigation-only** ([ADR 0013](../adr/0013-code-graph-surface-scope.md)) — the edit-window / `purpose=`
machinery (§11.2–3) is deferred to v2.

- **Slice −1 — measurement harness (FIRST):** build the evaluation instrument from the research
  compendium §11 *before* the graph exists — `uncached_input_tokens` delta, `search_result_usefulness`,
  `omission_bug_rate`, `duplicate_reads`, tool-call/round counts, and the **fallback-replay** method;
  capture a **baseline** (agent without the graph) on a real multi-turn task set. Every later slice reports
  *measured* value against this, never a borrowed benchmark %.
- **Slice 0 — spike:** `web-tree-sitter` + `tree-sitter-wasms` + `node:sqlite` proof on tk's own repo;
  extract TS symbols+import edges into `graph.db`; confirm no native build on macOS/Win/Linux + Node 22.5.
- **Slice 1 — extract+store (TS/JS/Python):** parse-worker pool (ported), schema+FTS5, incremental via
  `extractCache`. CLI: `tk map`. Verify node/edge counts vs a known repo.
- **Slice 2 — explore (the crown jewel):** port `buildContext` ranking + adaptive budget + container
  collapse + low-confidence hand-back. CLI: `tk explore` / `tk node` / `tk search` / `tk callers`.
- **Slice 3 — MCP server:** hand-rolled stdio JSON-RPC transport, 4 tools, server-instructions,
  inactive-when-unindexed. `tk serve --mcp`.
- **Slice 4 — install wiring:** extend `hostAdapter` with a per-host MCP-config writer (copilot-cli,
  vscode, claude-code) + instruction-marker text; honest enterprise-Copilot caveat in install output.
- **Slice 5 — more languages + HTML report:** add Go/Rust/Java grammars+queries; `tk map --html`.
- **Slice 6+ (by demand):** resolution depth (callback synthesizer, framework routes), file watcher +
  daemon, GitNexus-style clustering/flow tracing.

---

## 10. Risks & open questions

1. ~~**Identity / dependency departure** (Decision 1)~~ — **RESOLVED: accepted** (forced by building the
   graph). [ADR 0015](../adr/0015-node-sqlite-feature-gate.md)
2. ~~**Node 22.5 floor for the feature** (Decision 2)~~ — **RESOLVED: gate the feature, keep core ≥20 —
   contingent on an install-base Node-version check before commit.** [ADR 0015](../adr/0015-node-sqlite-feature-gate.md)
3. ~~**Index location — out-of-tree vs in-tree**~~ — **RESOLVED: out-of-tree, period.** In-tree is *not* a
   v1 toggle and not a deferred option — it would violate the codified "repo is never written" invariant, so
   adopting it later is an invariant amendment, not a flag.
4. **Resolution coverage** — v1 (imports + direct calls) will miss dynamic dispatch / framework routes
   that codegraph handles; the *honest hand-back* mitigates wrong answers but coverage will read lower
   than codegraph's headline %s. Set expectations; grow resolvers by demand.
5. **Enterprise-locked VS Code Copilot stays uncovered** (§3.2) — the accepted cost of npm-only. Revisit a
   separate extension track only if proven demand.
6. **Maintenance surface** — a graph engine is a meaningfully bigger codebase than the current handler
   set; the parse-worker lifecycle and WASM-heap management are the subtle parts (port codegraph's
   constants, don't re-derive).
7. **Overlap with the user already running codegraph/Serena** — if they do, tk's graph is redundant for
   them. tk's angle is the *quality-gate honesty* + *unified-with-compression* story, not "first mover."

---

## 11. Read-projection modes & agent policy (adjacent design, from the low-token research)

> **Scope correction (grilled 2026-06-18, [ADR 0013](../adr/0013-code-graph-surface-scope.md)).** The §11.1
> framing of the feature as a broad **"context gateway"** that *"also governs reads, logs, and diffs"* is
> **narrowed and partly rejected**: the surface stays in the **search/read** lane only and does **not** grow
> a general log/diff/JSON interception layer (those remain with tk's existing handler/`read` compression
> lines). The modes below are read as a *menu the graph draws from*, not a committed product surface.
> Concretely for v1: **navigation-only** — the **metadata / outline / imports / symbol / range /
> structural-compress** modes and the **low-confidence hand-back** are in scope; the **edit-window** (§11.3),
> the **`purpose=` legality machinery** (§11.2), and **diff-only / test-failure projection** move to **v2**.

The code-graph above is one capability. The merged research compendium
([`low-token-agent-research-compendium-20260618.md`](./low-token-agent-research-compendium-20260618.md))
surfaced a broader design frame that the graph slots into. Recorded here as **design principles** (concepts,
no protocol/interface code) so they outlive the report; most extend §4 (Explore) and §8 (quality gate).

### 11.1 The framing — a context gateway, not a compressor

Treat the whole feature as a layer that **intercepts or wraps tool output before it enters agent context**
and emits the *smallest truthful evidence needed for the next action*. The code graph is the structural
realization of that layer; the same gateway also governs reads, logs, and diffs (below). The guiding workflow
the literature converges on is **structure → candidates → exact code → verify-by-delta** — i.e.
`repo map → bounded candidate search → metadata-first results → symbol/range read → edit window →
diff-only or failure-only verification`, replacing the `grep → read → grep → read more → inspect → retry`
loop.

### 11.2 Read as a family of *purpose-aware* modes, not one `read_file`

The unit of evidence is the **smallest truthful slice** for the next action. Conceptually, a smart-read
surface offers modes along a compress↔exact axis, gated by **three context classes** (§2 of the compendium):
*understanding* may be projected, *editing* must be exact, *verification* can be delta-only. Modes worth
having (concept level): **metadata** (path/size/lang/hash/class flags), **outline** (top-level symbols +
signatures), **imports/exports**, **symbol** (exact one-symbol body — the default exact read), **range**
(exact lines for traces/config), **semantic-expand** (exact enclosing block around a line/hunk),
**structural-compress** (signatures, bodies dropped — understanding only), **edit-window** (see §11.3),
**diff-only** (post-edit verification), **test-failure** (failing names + error cluster + referenced ranges,
raw log on disk by hash), and projection/suppression for **JSON, markdown sections, lockfiles, and
generated/minified files**. tk's `read --level aggressive` already implements the structural-compress idea
for one file; `tk_node`/`tk_explore` cover symbol/outline; the graph adds the relational hops.

A **`purpose`** parameter (locate / understand / edit / debug / verify / architecture) decides which modes are
legal: `purpose=edit` must reject lossy structural-compress and either return an edit-window or escalate to a
full exact read. **Compression is never silent** — every non-exact response declares what was omitted, why,
and how to escalate (mirrors tk's `OmissionDeclaration`).

### 11.3 The edit-window — the safe unit for any modification

For any edit, return the **exact target symbol/range plus surrounding anchors**, the nearby types/imports the
edit depends on, and optionally one-hop callers/callees — verbatim, with a **content hash** and stable
anchors. This is the concrete shape of "editing context must be exact": small enough to save tokens, large
enough to preserve syntax and local invariants. If the window is too small to be safe, escalate (larger
window → full file) rather than guess.

### 11.4 Search routing & bounded output

Route, don't broadcast. Recorded routing policy: **don't search** when the target was already read exactly
and the next action is a local edit/verify; **repo map / graph** when the area is unknown or the question is
relational (callers/callees/impact/flow); **literal** for exact identifiers, errors, routes, config keys, SQL,
CLI flags; **symbol** for identifier-like queries with a likely module; **semantic** only for conceptual
queries with no literal anchor (and tk declines embeddings, so this is a documented gap, not a tk mode);
**LSP/SCIP** for rename/reference-impact where available. **At most one broad candidate-generation step per
intent change** — if intent is unchanged, refine the last candidate set instead of re-searching (this is the
direct counter to "repeated exploration is the cost driver"). Broad search must be projected into **grouped
candidates with hard caps** (matches/file, files/set, chars/snippet) and should hand the agent an explicit
**next-read instruction**, not a wall of raw grep lines.

### 11.5 Confidence exposure

Expose confidence in plain structured form — **high / medium / low + reasons** ("high: exact symbol-name +
declaration match"; "medium: high semantic similarity, no literal anchor") — and never overstate certainty on
non-exact matches. Low-confidence results carry an explicit recommended next action ("run literal search for
X", "read outline of Y before editing"). This is §8's honest hand-back, generalized to every projection.

### 11.6 Editability invariants & the retention-first ladder

Non-negotiables for any edit/verify path: (1) editable context returned **verbatim**, never summarized;
(2) carries a content hash + stable anchors; (3) includes enough exact surroundings to preserve syntax and
local invariants; (4) post-edit verification defaults to **diff + the specific changed tests/errors**, not
whole-file rereads; (5) on any truncation-risk ambiguity, **fail open to more exact code**. The escalation
ladder: `metadata → outline → symbol/range → edit_window → full file`, and `failure-projection → raw log` —
escalate when confidence is low, exactness is required, or the agent asks to edit from a non-exact view.

### 11.7 Agent policy still matters

Tool design alone does not stop waste — CodeGraph's maintainers note instruction-only steering is weak versus
the tool contract + answer sufficiency, yet Continue/Roo show repository-local rules do shape behavior. So
pair the tools with a concise, operational policy in the instruction file tk already writes
(`src/shim/guidance.ts`): prefer map/graph before broad search; prefer symbol/outline/range/edit-window over
raw whole-file reads; treat prior `readId` results as already-read and ask for a delta; don't repeat a broad
search unless intent changed; verify with diff + failing tests first; never edit from a response marked
non-exact. (Principles, authored in tk's voice — not a verbatim third-party policy file.)

### 11.8 Relation to the §9 roadmap

These modes are not a separate product — they refine the existing slices. The code-graph slices (§9) already
deliver outline/symbol/range/edit-adjacent reads and the honest-handback. The **log/diff/JSON/lockfile
projection** modes are a distinct compression track tk partly already has (handler families, `read` levels);
they belong with the gateway framing but do not block the graph. Sequencing stays as §9 defines it for the
graph; the read-projection modes are the lens for how each slice should *shape* its output.

---

## 12. References

- **codegraph** (MIT, cloned + read): https://github.com/colbymchenry/codegraph — the port source.
- **GitNexus** (PolyForm Noncommercial — ideas only): https://github.com/abhigyanpatwari/GitNexus —
  tree-sitter+KuzuDB WASM, clustering + Graph-RAG.
- **cocoindex-code** (Apache-2.0, cloned): https://github.com/cocoindex-io/cocoindex-code — the
  embeddings path we decline (sqlite-vec + sentence-transformers/LiteLLM).
- **Serena**: https://github.com/oraios/serena — the LSP-precision complement.
- **Repomix**: https://github.com/yamadashy/repomix — context-packing peer; its tree-sitter compression
  is the cheap-MVP fallback.
- **Codebase-Memory** (arXiv 2603.27277) — academic validation of the tree-sitter-KG-over-MCP pattern
  (66 langs, 14 typed queries, community discovery).
- Comparison synthesis: rywalker.com "Code Intelligence Tools for AI Agents" (four-tier taxonomy;
  "local-first graphs are the winning pattern").
- Landscape companion: [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
