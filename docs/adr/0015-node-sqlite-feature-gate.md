# node:sqlite for the graph store; feature gated at Node ≥ 22.13

**Status:** accepted (grilling 2026-06-18)

The [Code graph](../../CONTEXT.md) stores nodes/edges in **`node:sqlite` (`DatabaseSync`, WAL,
FTS5)** — real SQLite compiled into Node, zero external dependency. The graph feature gates at
**Node ≥ 22.13**, because that is the first Node 22 line where `node:sqlite` is no longer behind
the `--experimental-sqlite` flag. tk **core stays `>=20`**. On older Node, `tk graph ...` commands
print a clear "code graph needs Node ≥22.13 (you have X); compression features are unaffected"
message and exit cleanly.

## The tension this resolves

tk's load-bearing principle is "works the same everywhere on a varied install base"
(`fixes-prioritize-distributed-field`). The Node gate breaks that uniformity for the graph feature,
but avoids shipping a second SQLite implementation and keeps the core runtime unchanged. Node
distribution is observed through dogfood/telemetry over time; it does not block the v1 docs or design.

`node:sqlite` still emits an experimental warning in current Node 22. Runtime attempts to suppress that
warning after process start are not reliable, so graph commands use a no-warning child re-entry only on
the graph path. The normal `tk` hot path is not re-entered and does not inherit this behavior.

## Considered options

- **WASM SQLite (sql.js / wa-sqlite, FTS5-built):** keeps Node ≥20 uniform; **con:** +1 WASM
  dependency, slower, and a *second* WASM heap to manage alongside tree-sitter (exactly the subtle
  area risk #6 warns about).
- **Dual store (node:sqlite when present, else WASM fallback):** uniform and native-fast; **con:**
  two storage adapters + two WASM heaps — over-engineering for v1.
- **Earlier experimental gate:** earlier access to `node:sqlite`, but requires an experimental
  flag/warning path that is noisier and more surprising. Rejected in favor of ≥22.13.

## Consequences

- **Pro:** native speed for indexing large repos; only one WASM runtime to manage; zero new dep.
- **Pro:** core command compression remains available on Node 20.
- **Con:** a real slice of the base gets no graph feature until they upgrade.
- **Con:** graph startup needs a graph-only no-warning re-entry path.
