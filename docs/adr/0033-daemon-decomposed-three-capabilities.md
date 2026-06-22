# "Daemon" decomposes into three capabilities; codemap needs no cross-session daemon

Status: accepted

The single "daemon + native watcher" capability (old E11) conflated three unrelated concerns
— freshness, codemap warming, and command-proxy performance. They are split:

1. **CrossSessionRepositoryDaemon — Outside current product scope.** Codemap does **not** need
   a codegraph-style cross-session daemon. tk's expensive index *build* is already incremental
   and persisted to node:sqlite, and the MCP is **per-session resident** (each agent session
   opens the DB once, then reuses the connection, prepared statements, and bounded cache across
   every tool call in the session — that is the formal warm path). codegraph's daemon solves a
   different shape (many independent invocations sharing an *in-memory* backend) and drags in
   daemon election, sockets, version switching, orphan proxies, idle shutdown, and crash
   recovery — with live failures (a new session killing the old daemon; a detached worker stuck
   at 100% CPU). For tk it would save only one session-level SQLite open, which is not worth it.
   **Re-open gate:** only if measurement shows SQLite/session hydration p95 > 250 ms, sessions
   reopen frequently per hour, *and* a prototype cuts first-query latency by ≥50%.

2. **IndexWatcher — Optional at runtime, default-off.** The native file watcher (`TK_WATCH=1`,
   2000ms debounce, hard-disabled on WSL2 `/mnt`) for freshness. This is what old E11's code
   actually was.

3. **CommandProxyResident — its own Required capability, Optional at runtime.** D20's
   CrowdStrike spawn tax exists because **each shim command spawns Node an extra time**. It can
   only be truly eliminated when the command-proxy shim **stops spawning Node and instead
   connects to a resident proxy runtime**. Caching the executable path and async I/O reduce
   *other* overhead but cannot remove the spawn. This belongs to the command-proxy subsystem,
   not the codemap.

## Consequences

- E11 is rewritten as **IndexWatcher** only; it no longer carries daemon/warming/proxy
  semantics. The cross-session daemon is removed from scope; the resident proxy is tracked as a
  command-proxy capability.
- Corrects the doc's mischaracterization of codegraph as "no-daemon": codegraph *has* a detached
  daemon + proxy (issues #277/#411); tk deliberately diverges because its on-disk node:sqlite +
  per-session MCP already provide warmth without that lifecycle cost.
- The AV-tax fix (D20 / ADR 0032) is **CommandProxyResident**, not signing and not a codemap
  daemon.
