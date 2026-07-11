---
status: active
review_after: 2026-08-08
note: M3 UI rework work order (P40). Supersedes M3-GOAL-PROMPT-V2.md after the maintainer
  rejected the first build's UI/UX and data story on a live drive (2026-07-11). This EXACT text
  is handed to two independent implementers (Claude builder AND Codex) — dual-track, not
  orchestrated. On conflict, docs/build/M3-RESCOPE-BRIEF.md still wins EXCEPT where the P40
  amendments below explicitly override it (R10–R16 override R3/R8 execution and the ephemeral
  lifecycle).
---

# M3 Build Goal v3 — `ctx guide` UI rework (data stays, UI goes)

You are an implementing agent for **ctx** M3. Two implementers receive this same order and build
independently; the reviewer judges both, merges the winner (or grafts), and owns the acceptance
bar — you make it green, you never weaken it.

## Why v2's output was rejected (read this as the spec's negative space)

The v2 build passed its acceptance and still failed the maintainer's live drive, because every
gate ran on a 14-entity fixture. On the real store the UI collapsed:

- **Canvas was vacuous**: the "graph" was 7 kind-count boxes in a vertical column — with 9,588
  real entities behind them. No edges, no drill-down, no information architecture at real scale.
- **Search was dead**: typing a real symbol name returned nothing.
- **Subject was unreachable**: the nav tab did nothing without a prior selection and offered no
  affordance.
- **"Variants" were color palettes**: `?skin=` switched CSS tokens over one identical layout —
  not competing designs.
- **Lifecycle fought the user**: closing the tab killed the server; every restart minted a new
  port + token URL.
- **The data story was missing**: nothing ever ingested the real repo (`ctx sync` existed but
  was never wired into the guide story), and a `--fixture` run had permanently polluted the real
  project store.

The data layer is now proven good and is RATIFIED: `ctx sync` ingests this repo in ~10 s and the
guide serves it. Your job is the UI, the server lifecycle/auth UX, and the data-hygiene fixes —
nothing else.

## P40 amendments (binding; override the brief where they collide)

- **R10 — data-first.** The guide serves the REAL store of the repo it runs in. On startup the
  server runs a budgeted `RefreshEngine` catch-up (same engine as `ctx sync` / the MCP serve
  path) so an indexed repo is never stale. A genuinely empty or non-git store renders an
  actionable empty state naming the exact command to run (`ctx sync`). `--fixture` must NEVER
  touch the real store — it builds its demo store in an isolated temp home (this fix is in
  scope; the v2 behavior wrote fixture rows into the developer's real store).
- **R11 — fixture-verification ban.** Deterministic CI tests keep the scripted fixture tier, but
  acceptance now includes a **cold real-repo drive** (G-real-drive below). A green suite on
  fixture data proves nothing about the product; the drive is the proof.
- **R12 — auth UX.** The printed URL carries the bootstrap token exactly once: the first
  authorized hit sets a session cookie (HttpOnly, SameSite=Strict) and the app strips the token
  from the address bar (`history.replaceState`). Every route still 401s without token-or-cookie;
  loopback bind, host-header check, and zero egress are unchanged. F5, deep links, and new tabs
  in the same browser must keep working without the token in the URL.
- **R13 — lifecycle.** The disconnect/pagehide beacon teardown is REMOVED. The server lives
  until Ctrl-C (graceful close) with a long idle backstop (default 2 h, `--idle-ms` override;
  any authorized request resets it). Closing the tab must never kill the session. "Not a
  standing destination" is enforced by manual start, not by aggressive teardown.
- **R14 — UI from scratch.** The v2 `packages/guide` frontend and its three-surface execution
  are DISCARDED. You design the information architecture and are judged on it. Hard bans:
  kind-count group boxes as the primary view; any global layout over the full entity set (9.6k
  nodes is a floor, not a ceiling — design for 10×); a skin system of any kind (`?skin=`,
  token-only variants). Graph views must be bounded and local (ego-graph / cluster drill) with
  declared budgets. Ship ONE fully-realized design.
- **R15 — jobs replace pages.** The surface must let a human do five jobs, each acceptance-
  scenario'd below: **J1 orient** (what is this repo, what changed lately, what needs my
  attention), **J2 find** (search-first entry, e.g. cmd-K, over ALL entity kinds — symbol, file,
  doc_section, commit, decision, memory, concept — backed by the store's FTS), **J3 understand**
  (a subject biography for EVERY entity kind: claims with evidence anchors, history, bounded
  neighborhood), **J4 review** (needs-review queue, conflicts, push preview — exact copyable CLI
  commands, never executed; the v2 review queue was the one screen that worked on real data,
  keep that idea), **J5 trust** (claim-status semantics, disclosed gaps and omissions, the DR-01
  `accelerator — not validated` banner). The old seven-page content obligations fold into these
  jobs.
- **R16 — dual-track IS the variant competition** (replaces R8's skin mechanics). Each
  implementer ships one coherent design. Input = product design only; no shared aesthetic
  direction; do not imitate the discarded UI or each other.

## Real-scale design input (this repo, post-`ctx sync`, 2026-07-11)

9,588 entities — 3,943 symbol / 2,925 doc_section / 1,281 file / 968 concept / 419 commit /
102 memory / 51 decision — with 21,668 claims and 19,657 links. Cold `ctx sync` ≈ 10 s. Every
layout, list, and budget decision must be defensible at these numbers and at 10× them.

## Read first (in this order)

1. `docs/build/M3-RESCOPE-BRIEF.md` — still the ratified design EXCEPT where P40 overrides it.
2. `PRODUCT-DESIGN.md` §3 (claim contract — the ONLY status/derivation/confidence vocabulary you
   may render) + §11 (what M3 is allowed to be).
3. `packages/core/src/serve/` (`envelope.ts`: `ClaimEnvelope`, `claimEnvelopeFor`,
   `renderEnvelopeTerse` — extend its glyph grammar, never fork it; `serve.ts`) and
   `packages/core/src/select/` (the guide projects from the selection engine, never
   re-implements it). `packages/core/src/ingest/` (`RefreshEngine`, `createDefaultRegistry`) for
   the R10 startup catch-up.
4. The DISCARDED branch `m3/rescope-claude` — reference ONLY for the projection-kernel pattern
   (core-owned DTOs + golden transcripts) and the export/one-render-path plumbing. Its frontend,
   auth flow, and lifecycle are rejected; do not copy them.

## Hard guardrails (carried from v2, still binding)

- **Non-mutating (R1)**: no route writes the store. Curation renders exact CLI commands
  (`ctx memory confirm|retire <id>`, `ctx push pin|veto`) as copyable text.
- **Loopback + auth + zero egress**: bind `127.0.0.1`, random free port; every route (assets
  included) 401s without token-or-cookie; `assertNoEgress` armed; no CDN/fonts/telemetry — all
  assets Vite-bundled.
- **In-process core**: the server calls core as functions; never a per-request child process
  (Windows AV + cold-start tax — distributed-field rule).
- **Projection kernel**: core-owned typed DTOs embedding `ClaimEnvelope` per fact, golden JSON
  transcripts as the primary test surface, React components as adapters. You may reshape the v2
  DTOs to fit your IA — keep the discipline, and every projection declares budgets and discloses
  omissions in the payload.
- **Envelope rendering**: glyphs extend `renderEnvelopeTerse`'s grammar; hover/drill expands to
  the full envelope + evidence anchor; color budget is spent ONLY on claim semantics; provenance-
  or-it-does-not-render; null/compat-shadow fields render as disclosed gaps; NO LLM narrative.
- **Repo rules**: pnpm ONLY. Do not touch any `engines` field (O-37 is not yours). Erasable-TS
  in `core`/`cli` (Vite app exempt). Conventional commits, lowercase subject. Living-repo tests
  assert presence/drillability/resolvability — never ranking or render position. `TK_SHIM_DIR`
  unset in tests; EBUSY-safe temp cleanup; generous CI timeouts.
- **Export (R9)**: `ctx guide --export <dir>` renders the SAME components to a self-contained
  snapshot (zero external URLs); the export-diff test (live ≡ export) is binding.

## Build route (slices in dependency order)

| # | Slice | Lands |
|---|---|---|
| **4a** | Server rework | Cookie auth + URL cleanup (R12); lifecycle without beacon (R13); startup refresh catch-up + empty state (R10); `--fixture` isolation fix (R10); all acceptance scenarios wired as todo (acceptance-first). |
| **4b** | IA skeleton + find | Your information architecture end-to-end with real data: entry surface (J1 orient) + search-first find (J2) over all seven entity kinds, drillable to subjects. Projections reshaped to your design. |
| **4c** | Subject | Biography for EVERY entity kind (J3): claims + evidence drawer, subject-scoped history/decision chain, bounded local neighborhood with declared budget. Deep-linkable URLs. |
| **4d** | Review + trust | Needs-review queue, conflicts (reason-classed), push preview (verbatim digest + budget + pin/veto commands), health/freshness (J4, J5). |
| **4e** | Closer | Export parity on real data (R9); perf recorder numbers on the real store; the cold real-repo drive, self-verified scenario by scenario in the deviation log. |

## Acceptance (reviewer-owned; make green, never weaken)

Gates (CI, deterministic fixture tier where scripted):
- **G-readonly** — route sweep proves no mutating endpoint.
- **G-loopback** — 127.0.0.1 only; token-or-cookie required on EVERY route (401 otherwise).
- **G-auth-ux** — after first load the address bar holds no token; F5 and deep links survive;
  a tokenless, cookieless request 401s. (Scriptable via Playwright.)
- **G-lifecycle** — no beacon/pagehide teardown exists; Ctrl-C closes gracefully; the idle
  backstop fires when idle and is reset by any authorized request.
- **G-empty-state** — a fresh temp-home store renders the `ctx sync` instruction, not a blank.
- **G-fixture-isolation** — running `--fixture` leaves the real store byte-identical.
- **G-egress** — zero external requests (assertNoEgress + bundle audit).
- **G-provenance** — every rendered fact resolves to an evidence anchor through the drawer.
- **G-honest-gap** — null/compat-shadow fields render as disclosed gaps; nothing fabricated.
- **G-budget** — every projection declares budgets and discloses omissions (golden transcripts).
- **G-one-render-path** — export-diff green.
- **G-perf-recorded** — per-projection latency / node count / JSON bytes recorded on fixture AND
  the real store (recorded, never asserted as a threshold).

Scenarios — demonstrated on THIS repo's REAL store after `ctx sync`, recorded in the deviation
log (the drive is evidence, not a CI assertion; CI keeps the fixture tier):
- **S1** the entry surface orients: repo identity, per-source freshness/coverage, real
  needs-review and conflict counts.
- **S2** searching `envelope` returns symbol + file + doc_section hits; each opens its subject.
- **S3** subject(symbol `claimEnvelopeFor`): claims with anchors that drill to evidence; a
  bounded neighborhood renders within its declared budget.
- **S4** subject(file `packages/core/src/serve/envelope.ts`) resolves with history.
- **S5** subject(memory note): zone, lifecycle chain, exact `ctx memory confirm <id>` command.
- **S6** subject(commit) and subject(decision) resolve — no dead ends on any entity kind.
- **S7** review queue lists the real needs-review entries with exact CLI commands.
- **S8** conflicts, push preview (verbatim would-be digest + size budget), and health render
  real state.
- **S9** export from the real store opens offline; export-diff clean; zero external URLs.
- **S10** a subject deep link pasted into a second tab of the same browser works (cookie auth).

Suites: full `core` + `cli` suites stay green; component tests; one Playwright smoke covering
G-auth-ux + S2→S3 headless.

## Branch / worktree rules (dual-track)

- Fresh worktree from **latest** `origin/feat/1.0.0` (re-fetch first — parallel sessions are
  active). Branch: `m3/ui-rework-claude` or `m3/ui-rework-codex` per your identity.
- NEVER push `feat/1.0.0`; the reviewer merges. Codex track: do not attempt commits in a linked
  worktree — leave the tree clean and report; the reviewer commits and attributes.

## Deliverables

Working tree on your branch + **deviation log** (`docs/build/` in your worktree or inline):
every spec deviation recorded; the acceptance checklist self-verified item by item; the real-
repo drive written up scenario by scenario (what you saw, with real values); perf recorder
numbers from the real store.

## Explicitly OUT of scope

Any change to `ctx sync` / store schema / ingest adapters beyond the R10 startup call (the data
layer is ratified) · LLM generation of any kind · Impact-Set page · Revision Compare · Serve
Audit (blocked on O-36) · measurement/savings pages · engines bumps (O-37) · MCP tool changes ·
any write to the store.
