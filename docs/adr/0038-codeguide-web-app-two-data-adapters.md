# Codeguide is one Web App + one Core + two data adapters (Live serve / Snapshot export)

The human surface (codeguide) is a single Web App over a single Core (`RepositoryQueryService`),
delivered through two data adapters. It is **not** two separate human-surface implementations, and it
is **not** the previously-designed self-contained inline-JSON single-file HTML as the only form.

## The two adapters

- **`tk codeguide serve` (LiveDataSource)** — the daily rich mode. Foreground, on-demand, **binds
  loopback only (`127.0.0.1` / `::1`; no `0.0.0.0`, no `--lan`)**, stops when the command is closed
  (it is **not** a daemon). A thin HTTP adapter calls the same `RepositoryQueryService` for search,
  node drill-down, callers / impact / flow, and lazy local-graph loading. It owns **no** second
  ranking or graph logic.
- **`tk codeguide export` (SnapshotDataSource)** — the portable snapshot. Inlines the **same**
  Vite/React app's JS/CSS plus a limited `CodeguideSnapshot` into a single-file HTML. It reuses the
  exact same components and only swaps `LiveDataSource` for `SnapshotDataSource` — so it is **not** a
  second formatter. The snapshot must record `commit`, `generation`, generation time, included scope,
  omitted count, and completeness, and explicitly does **not** support dynamic queries it did not
  capture.

## Consequences

- **Replaces** the "wiki rendered through `src/report/html.ts`" plan. That renderer stays for the
  simple `gain` / `inspect` reports; the formal Codeguide becomes a standalone Web App.
- **No LAN / no server-side collaboration.** The server is loopback-only; human-human sharing
  continues via the single-file snapshot and git (consistent with ADR 0037 / no-egress).
- **Editing stays deferred.** Web editing is not built; the editable round-trip (human-fence + 300ms
  writeback) is out of scope for now — this **supersedes** the round-3 "editor = file-only writeback
  is the Required default" ratification. Codeguide is read-only; `.tk/` control files remain plain
  files a human may edit in their own editor.
- **On-demand local server vs no-daemon.** The loopback `serve` process is explicitly foreground and
  dies on close, so it does not reintroduce the cross-session daemon rejected in ADR 0033.
- Mirrors ADR 0031's "one Core + adapters" shape on the human side (there: agent adapters `tk mcp` /
  VS Code extension; here: human data adapters Live / Snapshot), and refines ADR 0018's codeguide
  (D9) from "single-file HTML" to "Web App with two data sources".

Positioning: **Live App = daily main view; Snapshot = offline / audit / share artifact.**

## Viewer host and launch (D29)

The **canonical viewer host is the system browser.** VS Code is the primary *launch entry*, not a
second UI host:

- `tk codeguide serve` starts the loopback server and opens the Live App in the browser; the
  single-file Snapshot also opens in the browser.
- The VS Code extension provides only thin commands — `TK: Open Codeguide`, `Open Current File in
  Codeguide`, `Show Impact` — that **deep-link** (by URL) into the same Web App.
- **Launch security + lifecycle**: the extension starts the server with a **random port + session
  token**, reads the full URL from a `--startup-format json` stdout envelope, then calls
  `vscode.env.openExternal`. The process is held by the **workspace / extension lifecycle** (not
  detached, not a daemon); a repeat open reuses the same workspace server.
- **No Webview.** A webview is not "point at a localhost URL" — it requires the extension to supply
  full HTML and handle CSP, resource URIs, scripts, a message bridge, panel restoration, and remote
  port mapping. A read-only Codeguide has no webview-exclusive need (editing, active-selection
  two-way sync), so the complexity earns nothing. **VS Code Webview Host = Outside current product
  scope**; reopen only if two-way editor sync, inline confirmation, or a high-frequency side-by-side
  workflow proves a core need.

(User-authored design, grilling 2026-06-22 round 4.)
