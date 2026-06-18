# Code Graph for token-killer — enterprise pilot design (2026-06-18)

> Companion to [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
> The landscape report is a research map; this document is the committed design direction after grilling.

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

## 10. References

- Landscape companion: [`token-optimization-landscape-20260618.md`](./token-optimization-landscape-20260618.md).
- Research companion: [`code-graph-research-20260618.md`](./code-graph-research-20260618.md).
- Aider repo map: https://aider.chat/docs/repomap.html.
- Serena: https://github.com/oraios/serena.
- RepoMapper: https://github.com/pdavis68/RepoMapper.
