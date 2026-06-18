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
4. **Port, don't reinvent:** codegraph is MIT — port its DB schema, extraction/resolution structure, and
   (most importantly) its `buildContext`/explore ranking algorithm. Re-skin onto tk's house style
   (`defineHandler`, the `(path,mtime,size)` extract cache, the per-project `~/.token-killer` store, the
   single-file HTML report, the `hostAdapter` install table). Study GitNexus/cocoindex only for *ideas*
   (GitNexus is PolyForm-Noncommercial — no code reuse).
5. **Two decisions need your sign-off** (they change tk's identity): (a) add **2 pure-WASM/JS deps**
   (`web-tree-sitter`, `tree-sitter-wasms`) — tk leaves "zero production deps" but keeps "no native build";
   (b) the graph store uses **`node:sqlite`**, a Node **22.5+** builtin — the map feature gates on Node
   ≥22.5 with graceful "feature unavailable" degradation on older runtimes (tk core stays ≥20).

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

> **Decision 1 (needs sign-off):** accept leaving "zero production deps" for these two pure-WASM/JS deps,
> in exchange for the highest-value new capability in the landscape report. *Recommendation: yes* — the
> "no native build" guarantee is the one that's load-bearing for tk's varied install base, and that holds.

### 6.2 Node version

`node:sqlite` needs **Node ≥ 22.5**. tk's engine floor is currently `>=20`. Unlike codegraph, **tk does
not bundle its own Node runtime** — it runs on the user's Node. So:

> **Decision 2 (needs sign-off):** the **code-graph feature** requires Node ≥ 22.5; tk **core** stays
> `>=20`. On older Node, `tk map`/`tk serve` print a clear "code graph needs Node ≥22.5 (you have X);
> compression features are unaffected" message and exit cleanly. *Recommendation: this gating* over (a)
> bumping tk's whole floor to 22.5 (breaks existing users) or (b) shipping a pure-JS SQLite/FTS
> reimplementation (large, slow, redundant with a builtin).

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

This is what makes a tk code graph *different from* a naive repo-map: it is honest about what it inferred
and what it might be stale on. No other tool in the survey foregrounds this.

---

## 9. Phased roadmap (vertical slices)

Each slice is independently shippable and ends green.

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

1. **Identity / dependency departure** (Decision 1) — needs your call. *Rec: accept the 2 pure-WASM deps.*
2. **Node 22.5 floor for the feature** (Decision 2) — needs your call. *Rec: gate the feature, keep core ≥20.*
3. **Index location — out-of-tree (`~/.token-killer/...`) vs in-tree (`.codegraph`-style)** — tk
   convention says out-of-tree; in-tree would help CI/sharing and a watcher. *Open — rec: out-of-tree v1,
   in-tree as opt-in later.*
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

## 11. References

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
