# M3 slice 5b — `ctx guide` server + data (Fable track) — SLICE-5B-NOTES

Deviation log for slice 5b (M3-GOAL-PROMPT-V4 "5b" row = V3's 4a verbatim: cookie
auth + clean URL R12; lifecycle R13; startup refresh + empty state + `--fixture`
isolation R10; acceptance wired as todos). The reviewer reads this before the diff.

Builds on the committed 5a spike (tip `e700fc6f`). NO 5a kernel logic (`atlas/*`)
or `variants/**` was modified.

---

## What was built

### Frontend (packages/guide)
- `src/data/source.ts` — the typed **GuideDataSource** seam (D1): `LiveDataSource`
  (`/api/corpus`, same-origin, `credentials:"include"`) + `SnapshotDataSource`
  (`./generated/corpus.json`) + `FallbackDataSource` (live first, snapshot
  fallback) + `defaultDataSource()`. Live-first / snapshot-fallback keeps
  `vite preview` / `pnpm dev` working with no server.
- `src/ui/SpikeApp.tsx` — MINIMAL wiring change only: the corpus `useEffect` now
  loads through `sourceRef.current` (the DataSource) instead of a bare
  `fetch("./generated/corpus.json")`; an optional `dataSource` prop enables test
  injection (defaults to `defaultDataSource()`); the compile effect early-returns
  on an empty corpus (`files.length === 0`) so the `ctx sync` empty state renders
  without compiling; the loading StateScreen copy mentions "index catch-up". No
  other UI change.

### Shared extraction (packages/guide/tools) — relocated, NOT forked
- `tools/corpus-source.ts` (NEW, node-only) — the SQL→CorpusInput projection
  moved out of `extract-corpus.ts` into `extractCorpusFromDb(db, opts)` /
  `extractCorpusReadOnly(dbPath, opts)`, reusing the PURE mapper
  (`buildCorpus` + `assertScrubbed`) from `corpus-mapper.ts` verbatim. Adds
  `emptyCorpus(repo, extra)` (files:[] signal for the empty state). Re-exports
  `CorpusInput`.
- `tools/extract-corpus.ts` — slimmed to the file-writing `pnpm gen` CLI; now
  delegates the projection to `corpus-source.ts` (re-exports its surface). `pnpm
  gen` output verified byte-consistent with the server's `/api/corpus`.
- `package.json` — added `exports` for `./corpus-source`, `./fixture-corpus`,
  `./package.json` so the CLI can import the mapper + fixture by name (no fork).

### Server + CLI (packages/cli/src/guide)
- `idle.ts` — `IdleBackstop` (R13): the ONLY automatic teardown; default 2 h,
  `--idle-ms` override, reset on each authenticated request. No beacon/unload
  teardown anywhere. Global timers → fake-timer testable; timer `unref`'d.
- `auth.ts` — R12 loopback auth: `assertLoopbackHost` (refuse non-loopback bind),
  `isLoopbackRequestHost` (Host-header rebinding guard), `formatGuideUrl` (the
  single clean URL), cookie parse, `sessionCookie` (HttpOnly; SameSite=Strict;
  Path=/), and `GuideAuth` (one-time token → session; single-use). node:crypto
  only, no dependency.
- `assets.ts` — `resolveGuideDist()` (locate the INSTALLED `@contexa/guide/dist`
  via `import.meta.resolve`, packed-install-safe; actionable
  `pnpm --filter @contexa/guide build` error when absent), static serving with a
  content-type map + path-traversal guard, SPA-shell fallback (hash routes → one
  page, D13).
- `corpus.ts` — the R10 data pipeline: startup writable catch-up (RefreshEngine,
  budgeted) isolated from the read-only serve projection; `--fixture` branch that
  never opens the store; all deps injectable (fixture-isolation spy). See the
  R10 note below.
- `server.ts` — `startGuide()` (loopback node:http server: method guard →
  Host guard → cookie/token bootstrap → 302 clean-URL redirect → static/API
  routing; corpus loaded BEFORE listen), and `runGuide()` (CLI entry; wires
  SIGINT/SIGTERM → graceful `close()`; prints the clean URL; `assertNoEgress()`
  armed).
- `cli.ts` — `case "guide"` registered (`--fixture`, `--idle-ms`); HELP updated.
- `package.json` — `@contexa/guide: workspace:*` dependency added.

### Core (packages/core) — one additive export
- `src/index.ts` — export `openStoreReadOnly` (already defined in `store.ts`; it
  is the documented "read-only, never write" opener the 5b serve phase needs).
  Additive only.

### Tests (packages/cli/tests)
- `guide-idle.test.ts` — IdleBackstop with fake timers (fire-once / reset / stop).
- `guide-auth.test.ts` — loopback guards, clean-URL format, cookie parse, token
  single-use, session-cookie recognition.
- `guide-corpus.test.ts` — **fixture isolation**: `loadGuideCorpus({fixture})`
  with throwing store-opener spies + a nonexistent CONTEXA_HOME canary; asserts
  zero store access and the fixture corpus.
- `guide-server.test.ts` — real node:http: non-loopback bind refused, clean-URL
  format, token→HttpOnly-cookie 302, every route 401s without the cookie / 200s
  with it, single-use token, 405 on a mutating method, `--fixture` served over
  the wire, dist-missing hint.
- `guide-gates.todo.test.ts` — the full V3+V4 gate checklist as `test.todo`
  (implemented gates annotated with the real suite that covers them).

---

## Decisions (choices the design left open)

- **Clean URL = server-side 302, not client `history.replaceState`.** R12 lists
  `replaceState` as one mechanism; a server 302 to `/` after minting the cookie
  strips the token from the address bar without any client JS, is testable
  headless, and is strictly more robust (works even before the SPA boots).
  Documented here; the outcome (no token in the address bar) is identical.
- **Session cookie = server-held random session id set** (not a signed token).
  Simpler than HMAC for a single-process loopback server; the id is `randomBytes(24)`
  base64url, membership-checked in an in-memory `Set`. No persistence needed
  (server lifetime == session lifetime).
- **Repo name = `basename(store.projectRoot)`** (server) vs the 5a gen tool's
  hardcoded `"token-killer"`. The server derives the display name from the actual
  checkout, so `ctx guide` in any repo names that repo.
- **Catch-up budget = 30 s** (`GUIDE_CATCHUP_BUDGET_MS`), passed as the engine's
  `catchupGateMs`. Bounded so a cold repo never hangs first serve; the empty-state
  contract already steers users to run `ctx sync` first, so the warm-repo case
  (catch-up ≈ no-op) is the norm.
- **Empty state is wired through the payload, not a new screen.** An empty/missing
  store yields `emptyCorpus()` (files:[]); the existing StateScreen `empty` fires
  on `files.length === 0` and names `ctx sync` (5a's screen, unchanged).
- **Staleness disclosed via `corpus.disclosures`** (no DTO change) when the
  startup catch-up reports `reconciling`.
- **No browser auto-open.** `ctx guide` prints the URL; it does not spawn a
  browser (avoids child-process / platform-opener surprises; V3's davia reference
  is for shutdown ergonomics, which the idle backstop + SIGINT cover). Could add
  `--open` later; out of scope here.

## R-reference walkthrough (what verifies each)

- **R12 loopback + one-time-token → HttpOnly cookie + clean URL + zero egress** —
  `auth.ts`/`server.ts`; `guide-auth.test.ts` + `guide-server.test.ts` (302 +
  HttpOnly/SameSite=Strict cookie; 401 without cookie on API AND assets; single
  use). Drive: 302+cookie, /api/corpus 200 with cookie / 401 without, 403 on a
  forged Host header. `assertNoEgress()` armed at start; all assets bundled by
  Vite (build output shows inlined woff2, no external URLs).
- **R13 lifecycle** — `idle.ts` + `server.ts` `doClose()` (server.close +
  closeAllConnections; SIGINT/SIGTERM in `runGuide`). NO beacon/unload teardown
  exists. `guide-idle.test.ts`; drive: a short `--idle-ms` auto-shut-down printed
  `ctx guide: stopped`.
- **R10 data-first** — `corpus.ts`: startup writable RefreshEngine catch-up
  (isolated phase) → read-only projection via `openStoreReadOnly` + the shared
  mapper; empty/missing store → `ctx sync` empty state; `--fixture` never touches
  the real store. `guide-corpus.test.ts`; real-store drive served 1421 files /
  4085 decls / 4593 calls from a throwaway copy.

## Non-mutating / read-only handling (constraint)

The serve path never writes. The RefreshEngine catch-up (the ONE sanctioned
ingest trigger, R10) is isolated in `runCatchup()`:
- **Fresh** (common): `await refresh(budget)` reports `fresh` → `await
  engine.background` (no-op) → `store.close()`. The store is then re-opened
  READ-ONLY (`openStoreReadOnly`) and projected with a strictly read-only
  `DatabaseSync` (`{readOnly:true}`) inside `extractCorpusReadOnly`. This is the
  literal "close writable / reopen read-only for serving" the work order asks for.
- **Reconciling** (budget exceeded, rare — steered away by the empty-state
  contract): we do NOT block first serve; the background remainder finishes over
  the process lifetime and closes the writable store when it settles. The serve
  projection still opens a SEPARATE read-only handle (never writes) and the
  payload discloses staleness. Documented as the single departure from the strict
  "close-then-reopen" ordering — see Deviations.

## Deviations (departures from the plan / brief, with rationale)

- **Read-only projection uses a read-only `DatabaseSync`, not core's `Store`
  API.** Core's `Store` exposes no bulk "all links by predicate" reader, and the
  5a mapper is the ratified corpus source for 5b. I use core's `openStoreReadOnly`
  for the existence/empty check + `dbPath` (honoring "open read-only via
  @contexa/core"), then extract via a read-only `DatabaseSync` on that same path
  (the exact, tested 5a extraction). Both handles are read-only; nothing writes.
  Adding a bulk-link reader to core `Store` would be out-of-scope core surface for
  a server slice.
- **Added `openStoreReadOnly` to `packages/core/src/index.ts`** (additive
  re-export of an existing, documented function). Needed so the CLI opens the
  store read-only "via @contexa/core".
- **Relocated the SQL projection into `tools/corpus-source.ts`** (from
  `extract-corpus.ts`). The work order sanctions "import or relocate into a shared
  spot INSIDE packages/guide — do not fork the logic". The pure mapper
  (`corpus-mapper.ts`) is untouched and still runs `assertScrubbed`; the scrub
  test stays green; `pnpm gen` output is byte-consistent with `/api/corpus`.
- **Reconciling catch-up does not strictly close-then-reopen** (see R10 note
  above) — the rare budget-exceeded path keeps the writable store for the
  background remainder and reads via a separate read-only handle. Chosen over
  blocking first serve (R10 explicitly wants a budget) or racing a store-close
  against background writes.
- **Two `.fixture-backup` files exist in the real `~/.contexa` store dir** —
  observed while copying the store for the drive; artifacts of a prior fixture
  test from another session, NOT created by this slice. Left untouched.

## Adjacent-found (untouched)

- **5 core "living-repo" acceptance tests are red on this branch tip**
  (`1e-docs` A5-adr, `1f-selection` A6-search, `1g-serve` A7-why/A7-drill,
  `2d-callgraph` B4-mention). Proven pre-existing: they still fail with my only
  core change (the `openStoreReadOnly` export line) stashed away. These assert on
  the repo's own doc/ADR content + RRF ranking — the memory-noted doc-churn
  fragility ("assert drillable/resolvable NOT ranking"). Out of scope for 5b; not
  touched.
- **`import.meta.resolve` at runtime requires `@contexa/guide` resolvable next to
  the installed CLI.** Works in the workspace (pnpm symlink) and from a packed
  install where guide is a dependency. Real publish packaging (guide `files:
  ["dist"]`, build-before-pack) is a distribution concern for the M3 publish
  slice, not 5b (whole repo is pre-publish; O-37 engines untouched).
- **`node dist/cli.js` cannot run** because tsdown externalizes the workspace
  deps (`@contexa/core`, `@contexa/guide`) which resolve to `.ts` source. This
  predates 5b (the existing `sync`/`mcp` commands share it); the CLI is exercised
  from source (tsx) until the publish slice adds a build-time bundling/dist story.

## Open questions

- Should `ctx guide` expose `--project <dir>` (like `ctx mcp`) so it can serve a
  repo other than cwd? Not required by 5b; the drive used cwd + CONTEXA_HOME.
- Publish packaging for the served `dist` (see Adjacent) — deferred to the M3
  publish slice.

## Delegated to the reviewer

- **Playwright smoke (G-auth-ux + S2→S3)** — the V4 line depends on a browser
  driver; 5b ships the server + real tests (headless fetch covers the auth flow).
  A Playwright smoke over a real Chrome is the reviewer's re-drive (I cannot
  launch a GUI browser here). The auth flow, cookie contract, and /api/corpus are
  proven by `guide-server.test.ts` + the curl drive recorded above.
- **G-egress bundle audit** — the env-key guard (`assertNoEgress`) is armed; the
  Vite build inlines all assets (no external URLs in the build output). A full
  network-trace audit in a real browser is the reviewer's confirmation.

## Verification evidence (self-verified)

- `pnpm -r typecheck` → core / guide / cli all Done (green).
- `pnpm --filter @contexa/guide test` → 10 files / **48 tests** pass (unchanged).
- `pnpm --filter @contexa/cli test` → 9 files pass + 1 todo file (43 tests pass /
  16 todo).
- `pnpm --filter @contexa/guide build` → dist built (418 KB JS, inlined woff2).
- Fixture drive: 302 + `Set-Cookie: ctx_guide=…; HttpOnly; SameSite=Strict;
  Path=/` → `Location: /`; `/api/corpus` with cookie 200 (application/json,
  `repo:"fixture-repo"`); without cookie 401 (API + asset); POST 405; forged Host
  403; short `--idle-ms` → `ctx guide: stopped` (R13 idle auto-shutdown).
- Real-store drive (throwaway copy in a temp CONTEXA_HOME, shared store untouched
  — mtime unchanged): `/api/corpus` 200, **1,421 files / 4,085 decls / 4,593
  calls / 577 imports**, event `latest 20 commits 7d4119b94104..e700fc6fa6db`,
  60 anchor files / 239 anchor syms, generations code=11 git=6 docs=7 memory=17,
  1.35 MiB. `pnpm gen` on the same store is byte-consistent (1-byte delta = the
  repo-name length difference), confirming the server and the extractor share one
  projection.

## Commands

```bash
# from repo root
pnpm install
pnpm -r typecheck
pnpm --filter @contexa/guide build          # produces dist/ that `ctx guide` serves
pnpm --filter @contexa/guide test           # 48
pnpm --filter @contexa/cli test             # guide-* suites + existing cli suites

# run from source (tsx), fixture mode (never touches the real store):
pnpm exec tsx packages/cli/src/cli.ts guide --fixture --idle-ms 600000
#   -> open the printed http://127.0.0.1:<port>/?t=<token>

# real store: run `ctx sync` first, then `ctx guide` from the repo root.
```
