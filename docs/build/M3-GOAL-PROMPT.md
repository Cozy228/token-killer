---
status: frozen
review_after: 2026-08-01
note: retirement PROPOSED by the 2026-07-10 design reconciliation (root CONTEXA-IMPL.md Appendix A, DR-14/DR-15 — LAW art. 1 forbids destination surfaces); maintainer ruling pending (OPEN O-31 item 1). Do NOT build from this work order while frozen.
---

# M3 Build Goal — prompt for implementing agents (single-track Opus; joint Fable+Codex review)

You are an implementing agent for **ctx** M3 ("Humans see it" — `ctx guide`). You build assigned
slices to green against a reviewer-owned acceptance bar. You implement the ratified design; you do not
change it. M1 (base: store, git/docs/memory sources, selection, MCP serve, push, install/doctor) and
M2 (code joins the graph: symbols, symbol-level touches, fingerprint/incremental trio, call graph +
facets + B6 biography, SCIP) are fully merged on `feat/1.0.0`, 3-OS CI green. **M3 is the HUMAN twin
of `context()` — a live, read-only web guide over the SAME graph, with per-fact provenance.**

## Read first (in this order)
1. `CONTEXA-IMPL.md` — **§7 Guide impl (the Hono loopback + bearer token + evidence-drawer + ONE-render-
   path + snapshot-export spec)**; §6 selection + §7 serving (the guide's projections REUSE the same
   selection/provenance, never a parallel path); §9 M3 line, especially the projection-kernel-first
   route inside M3; §10 testing; §12 read-back map.
2. `docs/build/M3-ACCEPTANCE.md` — the acceptance bar (reviewer-owned; you make it green, you never
   weaken it): **G-projection-kernel · G-provenance · G-readonly · G-loopback · G-one-render-path** +
   scenarios **C0–C9** + the ⚠ verify-at-wiring rule (record observed value + the producing command).
3. `CONTEXA-DESIGN.md` §6 Human Surface (the six-page set + "read-only = *non-mutating*") + §8 process model.
4. The merged M2 serve/select code — the Entity Biography IS the human twin of `context(ref)`; study
   `packages/core/src/serve/serve.ts` + `packages/core/src/select/` so the guide projects from the
   SAME engine + provenance, never re-implements selection.
5. §12 reference pieces (lift, adapt — reference ≠ gold; this design wins): deepwiki-open `Mermaid.tsx`
   (render lifecycle + error-fallback + pan-zoom) and `WikiTreeView.tsx` (collapsible nav) in
   `.research/deepwiki-open/`; davia `web.ts` (port-detect / open-browser / graceful-shutdown) in
   `.research/davia/`. (`.research/` is git-ignored — the reviewer symlinks it into your worktree.)

## Hard guardrails (M1/M2-earned, plus what the guide adds)
- **Greenfield**: new `packages/guide` (React + Vite) + the guide server inside `packages/cli` (Hono
  loopback). NEVER import from / modify legacy `src/`, root configs, `server/`, or shipping tk
  behavior. `core` stays the single source of query truth — the guide is a VIEW, not a second store.
- **Read-only / non-mutating (P23, binding)**: the server NEVER writes the store. Curation actions are
  DISPLAYED with their exact CLI command (`ctx memory confirm|retire`, `ctx push pin|veto`, JSONC
  edits) — never executed by a route.
- **Loopback-only + zero egress**: bind `127.0.0.1`, random free port, bearer token; no route resolves
  without the token; `assertNoEgress` stays armed on every deterministic path. The guide makes ZERO
  external calls. (On-demand LLM-Inferred generation — business-logic view, diagrams — is OUT of M3
  core; it is a gated follow-on with its own validator loop, see the M3-ACCEPTANCE footer.)
- **One render path (binding)**: live serve and snapshot export render through the SAME components,
  fed by the SAME JSON projection. The export-diff test (C9) enforces it — never two render paths.
- **Projection kernel first (binding)**: M3 starts by adding the guide projection kernel in `core`
  before browser UI work. The guide never reaches into `select()`/`serve()` ad hoc from UI routes.
  It consumes typed JSON projections from `core`:
  `EntityBiographyProjection`, `OverviewProjection`, `KnowledgeProjection`, `EvidencePacket`, and
  `SearchProjection`. These projection structs are the test/golden surface; React components and
  snapshot export are adapters. If M3 needs a missing field, update the projection contract and its
  golden transcript first, then consume it from the guide.
- **Profile-specific traversal (binding)**: guide projections declare their own edge predicates,
  weights, depth, node caps, and render budgets. Do not reuse a single all-predicate/default graph walk
  for every page; a page that needs a broader graph must disclose its budget and omitted handles.
- **Provenance or it does not render**: every fact reaches the UI as a claim-backed projection
  (`carrier/locus/method/authority/at`); the evidence drawer resolves it. No free-floating prose —
  this is ctx's differentiator vs the wiki cohort's decorative citations.
- **Living-repo fragility rule (M2-earned, binding)**: living-repo/browser tests assert STABLE
  structure (a section/fact is present + traces to provenance), NEVER a ranking, ordering, or render
  POSITION that shifts as the repo's own docs churn. Prefer a script-generated fixture store.
- **pnpm only**; **Node ≥22.16**; erasable-TS in `core`/`cli` (the React app is Vite-bundled, exempt);
  conventional commits, **lowercase subject** (commitlint); existing `.wasm`/`.scm`/`.sql` asset step
  untouched (guide assets ship via Vite).
- Tests: Playwright browser smoke (headless on CI) + deterministic component/projection unit tests +
  golden JSON-projection transcripts; temp `CONTEXA_HOME`/HOME only; `TK_SHIM_DIR` unset; EBUSY-safe
  cleanup; generous serve/browser timeouts (M2's CI lesson: shared runners are slow, hooks must be
  generous); the fixture store is self-contained (do NOT pin assertions to THIS repo's live content).
- M3 owns recording guide projection performance now, not waiting for M5: for each projection, report
  latency, entity/link counts, omitted counts, and serialized JSON size for the deterministic fixture;
  for the living-repo tier, record the same values without asserting brittle rankings.

## Build route (M3 slices; dependency: 3a → {3b, 3c} parallel → 3d closes)
| # | Slice | Lands |
|---|---|---|
| **3a** | Projection kernel + server + shell + flagship | Core-owned typed projections: `EntityBiographyProjection`, `EvidencePacket`, projection perf recorder, profile-specific traversal budgets, and golden JSON transcripts. Then Hono loopback server (random free port + bearer token + graceful shutdown, davia `web.ts`); `packages/guide` React+Vite shell + system-browser open; render components reused by BOTH live and export; the **Entity Biography flagship** (the human twin of `context(ref:"sym:…")`) + the **evidence drawer** on every fact. **Pins the projection/server/render contract everything downstream builds on.** Wires ALL M3 scenarios as skipped/todo (acceptance-first, like M2's 2a). Owns **C0–C3 + G-***. |
| **3b** | Inspector pages: Knowledge + Search | Knowledge (review queue: needs-review entries WITH their `ctx memory confirm|retire <id>` commands + the E8 ops signal; stale-references list; push pin/veto state); Search (cross-source, kind-filtered over all entity kinds). These are load-bearing inspector paths and should ship before decorative graph views. Owns **C7–C8**. |
| **3c** | Overview + Decisions + History | Overview (per-source coverage/freshness/carrier presence from real gen/cursor state); Decisions (supersession-chain timeline + source badges + code links); History (hot areas + co-change clusters + bounded React Flow/ELK graph). Owns **C4–C6**. |
| **3d** | Snapshot export (closer) | `ctx guide --export <dir>` → one self-contained HTML shell + JSON data + client render via the SAME components; the **export-diff test** (live ≡ export) closes the one-render-path contract; re-run the Playwright smoke + provenance sweep. Owns **C9 + the M3 exit checklist**. |

## Execution model (v2 — maintainer-ratified 2026-07-05; **NO dual-track**)
- **Single-track Opus** per slice (branch `m3/<slice>`, own worktree off latest `feat/1.0.0`). The
  comparative Opus-vs-Codex dual-track is RETIRED (M1/M2 verdict: Opus swept every round; the 2× cost
  no longer justified).
- **Review = Fable + Codex JOINTLY**: once a slice is green, the reviewer (Fable, main session) AND
  Codex each review it independently; findings are reconciled; **Opus applies the fix rounds** until
  both sign off. (Codex facts: deps pre-installed; cannot commit in a linked worktree; verify with
  `./node_modules/.bin/{tsc,vitest,playwright}` directly if pnpm wrappers fail.)

## Coordination (carried from M1/M2)
- Own worktree, own branch off **latest** `feat/1.0.0` — it is SHARED with the maintainer's parallel
  memory track, so **re-fetch origin before every push** (pushes have interleaved fast-forward).
- One slice → green → joint review → Opus fix rounds → **reviewer merges** (never an implementer).
  Never start an unreviewed slice's successor.
- Priorities: correctness > completeness > verifiability > token economy.
- Before requesting review: rebase onto latest `feat/1.0.0`; re-run `pnpm -r --filter './packages/*'
  typecheck && test`, the Playwright smoke, AND `pnpm test:product` (legacy stays at its 1896-passed
  baseline).

## Review protocol (reviewer = Fable + Codex jointly; Opus applies fixes)
Deliver per slice, as your final report:
1. `git log --oneline feat/1.0.0..HEAD` (or changed-file list if your env cannot commit).
2. What landed vs the slice's route row (deviations called out, each with why).
3. Scenarios flipped green (names) + full test-run tails (ctx packages + Playwright + legacy).
4. Assumptions where the spec was silent (each: assumption, where recorded).
5. ⚠ verify-at-wiring values: assertion + observed evidence + the producing command — especially
   C0's projection latency/fanout/JSON size, C2's real symbol, and C9's live-vs-export byte-equality
   on the fixture.
6. Anything you could NOT make green (env-gated skips by name — e.g. Playwright headless on CI).
Gates: joint Fable+Codex review; correctness findings fixed (Opus rounds) before merge; merges into
`feat/1.0.0` are done by the reviewer, never an implementer.
