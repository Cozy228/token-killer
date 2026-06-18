# node:sqlite for the graph store; feature gated at Node ≥ 22.5

**Status:** proposed (grilling 2026-06-18) — **contingent on an install-base Node-version check before commit**

The [Code graph](../../CONTEXT.md) stores nodes/edges in **`node:sqlite` (`DatabaseSync`, WAL,
FTS5)** — real SQLite compiled into Node, zero external dependency. `node:sqlite` is a Node
**22.5+** builtin, so the **code-graph feature gates at Node ≥ 22.5**; tk **core stays `>=20`**.
On older Node, `tk map` / `tk serve` print a clear "code graph needs Node ≥22.5 (you have X);
compression features are unaffected" and exit cleanly.

## The tension this resolves

tk's load-bearing principle is "works the same everywhere on a varied install base"
(`fixes-prioritize-distributed-field`). The Node gate **breaks that uniformity** — the feature is
silently dark on Node 20/21 (still LTS, large install share). We accept it **only as a
data-driven decision**: before committing, check tk's actual install-base Node distribution; if
the `<22.5` share is large, reconsider a WASM SQLite.

## Considered options

- **WASM SQLite (sql.js / wa-sqlite, FTS5-built):** keeps Node ≥20 uniform; **con:** +1 WASM
  dependency, slower, and a *second* WASM heap to manage alongside tree-sitter (exactly the subtle
  area risk #6 warns about).
- **Dual store (node:sqlite when present, else WASM fallback):** uniform *and* native-fast; **con:**
  two storage adapters + two WASM heaps — over-engineering for v1.

## Consequences

- **Pro:** native speed for indexing large repos; only one WASM runtime to manage; zero new dep.
- **Pro:** Node 22 is becoming LTS; Node 20 ages out over the feature's life.
- **Con:** a real slice of the base gets nothing until they upgrade — mitigated by an honest
  degradation message, not by coverage. Re-validate the gate against real install data before commit.
