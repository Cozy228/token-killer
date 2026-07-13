# implementation-notes.md — M3 K2 (`ctx guide` server + data seam + state screens)

Branch: `m3/v5` (worktree `token-killer-worktrees/m3-v5`), base `6ec19819` (K1).
Scope: `packages/cli/src/guide/` + a `case "guide"` arm, and a new `packages/guide/` workspace package.
Tree left **UNCOMMITTED** per the work order. The reviewer verifies on the real corpus and commits.

> Repurposed per slice, per the convention this file itself records. **K1's notes are preserved in
> git at commit `6ec19819`** (`git show 6ec19819:implementation-notes.md`) — nothing was lost.

---

## Decisions (choices the design left open)

### D-1 — "Exchanged ONCE" = one hop, not burn-after-read.

The token is valid for the life of the process and `/auth` may be hit more than once; what happens
exactly once *per browser* is the **exchange**, after which the `HttpOnly` cookie is the credential
and the SPA never holds the token at all. The other reading — a single-use nonce — I rejected as the
*less* conservative one: `ctx guide` both opens the browser AND prints the link, so a burn-after-read
token hands a dead link to whichever of the two loses the race, and a reload, a second tab or a
second browser would each fail. If you want strict single-use it is a one-line change in the `/auth`
handler.

### D-2 — The store is re-opened READ-ONLY on every API request.

One handle for the process leaves a question I could not answer *from the design*: does a long-lived
SQLite reader observe a sibling process's committed writes? Re-opening deletes the question instead
of betting on the answer. Cost is a few ms; the expensive part — the atlas — is cached under a key
built from the generation identity **and** each source's published generation, so a `ctx sync` (which
moves a published generation) invalidates it without anyone having to remember to.

Driven end-to-end on the real corpus: the badge flipped `stale → live` on the **same running server
process**, no restart. That is the property the work order actually asked for.

### D-3 — `/api/generation` returns `{ repo, generation }`, not a bare `GenerationView`.

The order fixed the endpoint's *contract* (current on every call), not its body shape. D28's top bar
needs `repo · revision · generation · badge`, and the repo name is not in K1's DTO. One endpoint
carrying the top bar's whole payload beat adding a second endpoint that would always be fetched on
the same tick. Typed as `GuideStatus`; it is the seam's `status()` method.

### D-4 — Not-servable is a `409`, never an empty `200`.

When `isServable()` is false the server does not call `buildAtlas` and does not emit a projection —
it returns the generation view and the reason. This makes *"quietly fall back to the mismatched
rows"* **structurally unreachable** rather than merely discouraged. `SnapshotDataSource` enforces the
identical rule, so the refusal is the same on both sides of the seam — which is the whole point of
building the seam before the export exists.

### D-5 — K1's `FreshnessState` has FOUR states, not the three the order names.

The order says `live | snapshot | stale`. K1 ships `live | snapshot | stale | empty`, and its own
comments rule that flattening `stale` into `empty` would send the user to `ctx sync` while concealing
why their data is present-but-elsewhere. I followed the kernel: the badge and the state screens carry
four. Reported rather than silently reconciled.

### D-6 — A minimal "ready" panel on the live path.

The order says ship *only* the shared interaction states. But a page that renders **nothing** when
live makes the reviewer's own gate items (b) and (c) unobservable — you cannot watch data cross the
seam. So the live path renders one deterministic line (scope / file / aggregate-relation counts,
straight off the overview projection: no prose, no ranking, no canvas, no cards) plus "the canvas
lands in the next slice". Slice S replaces it wholesale. This is the one place I went a hair past
"only the states", and I would rather you see it than find it.

### D-7 — `GuideSourceError` is what D28's "source unavailable / restricted" hangs on.

Its live trigger in K2 is a transport failure — the server was stopped with Ctrl-C, or an exported
page was asked for a projection it does not carry. The *restricted-disclosure* half has no surface in
K2 (no inspector, no evidence rail, no claim rendering), so the screen and the error class exist and
the restricted path lands with the slice that renders claims.

### D-8 — Extras not asked for, kept because they are cheap and a loopback server needs them.

A `Host`-header check (DNS rebinding: a page on another origin must not reach 127.0.0.1 by resolving
a name to it), a `default-src 'self'` CSP, `nosniff`, `cache-control: no-store`, a constant-time
token compare, and a path-traversal guard on the static server. None change the design; all are
tested. Say the word and any of them comes out.

---

## Deviations (departures from the work order)

### V-1 — `@contexa/guide` is a **devDependency** of `@contexa/cli`.

Nothing imports it. It exists so `pnpm -r build` topologically orders the SPA build **before** the
CLI build, so `scripts/copy-guide-assets.mjs` always finds `packages/guide/dist`. If that order is
ever broken the script exits 1 loudly, rather than publishing a `ctx` whose `ctx guide` serves 503.

### V-2 — `cmdGuide` and `startGuideServer` take an `appDir` test seam.

Without it, `pnpm --filter @contexa/cli test` would depend on a Vite build having run, and would fail
on a clean checkout. The production path passes nothing and resolves from `import.meta.url`. The
resolution ORDER itself is asserted (`appDirCandidates()`), so the distributed case is tested without
requiring a build.

### V-3 — My `ctx sync` (driving the E5 gate) superseded the sibling worktrees' generation.

Documented shared-shard behaviour, not damage — but it means the main checkout at
`/Users/ziyu/Workspace/token-killer` now reads **stale** until someone runs `ctx sync` there. I used
exactly that to drive and photograph the stale screen against a second real checkout. Flagging it so
it surprises nobody.

---

## Adjacent-found (untouched)

- `packages/cli/src/cli.ts`'s `default:` arm still advertises *"Available now: sync, remember, recall,
  memory, push"* — it already omitted `install` / `doctor` / `mcp` before I arrived, and now omits
  `guide` too. Not mine to fix (AGENTS §3).
- `pnpm peers check` reports a **pre-existing** unmet peer: `tsdown@0.22.4` wants `typescript ^5||^6`
  while the workspace pins `7.0.2` / `7.0.1-rc`. Predates this slice; builds and typechecks pass.
- `packages/core`'s `exports` points at `./src/index.ts` while `files` publishes `dist` — the
  published shape is internally inconsistent. Pre-existing; P13 owns it.
- The 5–6 pre-existing living-repo test failures K1's notes recorded are in `@contexa/core`, which
  this slice does not touch. `@contexa/cli` and `@contexa/guide` are fully green.

---

## Open questions (for the reviewer)

1. **Cookie scope vs. two concurrent `ctx guide` runs.** Cookies key on host+path, **not port**, so
   two servers on 127.0.0.1 overwrite each other's `ctx_guide` cookie; the older tab then gets a 401
   and the auth screen (which tells you to open the printed link). Honest and loud rather than silent
   — but a port-suffixed cookie name (`ctx_guide_52295`) would remove the annoyance. No ruling
   existed, so I left it.
2. **The export snapshot builder.** `SnapshotDataSource` + `GuideSnapshot` + `eventKey()` now DEFINE
   the blob the builder must emit; the builder lands with the export closer (slice `+`). The seam is
   the contract between them, and today it is tested from the reader's side only.
3. **`--no-open` vs `CTX_NO_OPEN`.** I honour both (the env var is the legacy report opener's, and a
   user who set it meant it for this too). If you want only the flag, drop the env check in
   `guide/open.ts`.
