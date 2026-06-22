# Process model: independent adapters, lease-coordinated reconciliation, generation publish

MCP and Codeguide are **independent thin adapter processes** that load the same Repository
Intelligence Core as an **in-process TypeScript library**. They share persistent repository state
through the same on-disk SQLite database in **WAL mode**, but they do **not** share a Core process, a
socket, or an in-memory graph. (CommandProxyResident, ADR 0033 / D21, remains a separate command-proxy
subsystem and must not host or depend on `RepositoryQueryService`.)

## Reconciliation is lease-coordinated, not WAL-coordinated

WAL gives concurrent readers + a single writer, but it is **not** the reconciliation coordinator.
Reconciliation is **query-triggered** and coordinated through a **database-backed lease**:

- Only the **lease owner** performs analysis and staging writes.
- Other processes continue to **serve safe results**, **wait within an explicit latency budget**, or
  return **`RECONCILING`** with `partial` / `unknown` completeness (per ADR 0035).

## Generations are published atomically; identity is a tuple

- Every query reads from **one published generation** inside a **short-lived read transaction**.
- A new generation is built as **unpublished staging state** and becomes visible only through an
  **atomic publish transaction**.
- A **generation identity** is **(repository revision, worktree digest, schema version, analysis
  policy version)** — **not** merely an integer. (This refines E2's integer `index_generation`: the
  integer becomes one published-generation pointer, but identity/equality is the tuple.)

## Connection vs transaction lifetime

Codeguide may keep its database **connection** open for its process lifetime, but it must **not** keep
read **transactions** open across requests (that would pin a generation and block WAL checkpointing /
publish).

## Scope

A cross-session Core daemon remains **Outside current product scope** (ADR 0033 / D21) and may be
reconsidered only if measured database open / hydration latency crosses the previously-defined
threshold (p95 > 250ms + frequent reopens + a prototype cutting first-query latency ≥ 50%).

(User-authored design, grilling 2026-06-22 round 4.)
