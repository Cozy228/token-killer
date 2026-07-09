# M3 Acceptance — ctx "Humans see it" (`ctx guide`, reviewer-owned)

> **Owner: the review = Fable + Codex jointly (exec model v2).** Implementers make these green; they
> do not weaken them. Changes to this bar go through the reviewer.
>
> **Two test tiers** (both required, carried from M1/M2):
> 1. **Deterministic tier** — a script-generated fixture store (temp dir) + Playwright browser smoke
>    + component/projection unit tests + golden JSON-projection transcripts. CI-safe, no network.
> 2. **Living-repo tier** — the guide over THIS repo's ingested base, env-gated.
>
> **Living-repo fragility rule (M2-earned, binding — see [[living-repo-tests-fragile-to-doc-churn]]):**
> assert STABLE structural properties (a fact is PRESENT and TRACES to provenance; an entity's page
> composes the right sections), NEVER a specific ranking, ordering, or render POSITION that shifts as
> the repo's own docs churn. Generous browser/serve timeouts (the guide serves a live store).

## Global invariants (every page, every response — binding)
- **G-projection-kernel**: every page is fed by a typed JSON projection produced by `core`, not by
  ad hoc UI route queries. The minimum projection set is `EntityBiographyProjection`,
  `OverviewProjection`, `KnowledgeProjection`, `EvidencePacket`, and `SearchProjection`. These
  structs are the golden-test surface for both live mode and export.
- **G-provenance**: every displayed fact has an evidence drawer that resolves to a REAL claim
  (`carrier · locus · method · authority · at`). A fact with no backing claim cannot be rendered —
  this is ctx's differentiator against the wiki cohort's "LLM prose with decorative citations."
- **G-readonly**: the guide NEVER mutates the store. Curation actions (`ctx memory confirm|retire`,
  `ctx push pin|veto`, JSONC control-file edits) are DISPLAYED with their exact CLI command, never
  executed by the server (P23; "read-only" = non-mutating).
- **G-loopback**: the server binds `127.0.0.1` only, on a random free port, behind a bearer token;
  no route resolves without the token; `assertNoEgress` stays armed on the deterministic paths.
- **G-one-render-path**: live mode and snapshot export render through the SAME components. There is
  never a second render path (a golden projection feeds both).
- **G-profile-budget**: every projection declares its edge predicate set, depth/node caps, omitted
  counts, and serialized JSON size. Guide pages do not share one all-predicate/default graph walk.

## Scenarios

### 3a — Projection kernel + guide server + shell + Entity Biography (flagship) + evidence drawer
- **C0-projection-kernel**: a deterministic fixture store produces golden JSON projections for Entity
  Biography, Overview, Knowledge, Evidence, and Search. Each projection includes claim-backed fact
  ids, freshness/coverage metadata, omitted counts, profile traversal constants, and a perf record
  (latency, entity count, link count, serialized bytes). ⚠ record the fixture command and observed
  values; living-repo values are recorded but not ranked/order-pinned.
- **C1-serve**: `ctx guide` starts a Hono loopback server (random free port + bearer token), opens
  the system browser at it, and shuts down gracefully (davia `web.ts` pattern); a second concurrent
  instance selects a different port; an unauthenticated request is rejected.
- **C2-biography** (flagship): the Entity Biography page for a real symbol renders its full story in
  one view — definition/signature + relations (callers/callees) + linked decisions + change history
  + memory entries + conflicts — the human twin of `context(ref:"sym:…")`. ⚠ record the symbol used;
  assert the composed SECTIONS are present (not their order/ranking).
- **C3-evidence**: every fact on the biography page exposes an evidence drawer resolving to its claim
  (`carrier/locus/method/authority/at`); a synthetic fact with no claim is structurally impossible.

### 3b — Inspector pages: Knowledge + Search
- **C7-knowledge**: memory browser + review queue (needs-review entries shown WITH their
  `ctx memory confirm|retire <id>` commands + the E8 ops signal: queue size + oldest-item age) +
  stale references list (unresolved mentions = dead doc links) + push pin/veto state.
- **C8-search**: cross-source, kind-filtered search over ALL entity kinds
  (code/commit/decision/doc_section/memory) — the cross-source differentiator (zero wiki-cohort precedent).

### 3c — Overview + Decisions + History
- **C4-overview**: per-source coverage + freshness + carrier presence, reflecting the store's real
  generation/cursor state (fresh/reconciling), not a hardcoded list.
- **C5-decisions**: a timeline with supersession chains (`supersedes`/`renamed-to`), source badges
  (adr/pr/…), and links into the code entities the decisions touch.
- **C6-history**: hot areas + change-coupling (co-change) clusters + recent activity, projected from
  the git graph. React Flow + ELK views are bounded local projections with omissions, never a whole-repo
  graph explorer.

### 3d — Snapshot export (closes M3)
- **C9-export**: `ctx guide --export <dir>` produces ONE self-contained HTML shell + JSON data files
  (no server, no network); opening it renders IDENTICALLY to live mode. ⚠ **export-diff test**: the
  live projection and the exported JSON drive byte-identical component output for a fixture store.

## M3 exit checklist
1. Playwright smoke green: every page loads + navigates on the deterministic fixture store.
2. **G-projection-kernel** green: every page has a golden JSON projection and no page computes graph
   semantics in React or ad hoc route code.
3. **G-provenance** asserted structurally: every rendered fact carries a resolvable claim id.
4. **Export-diff** green: snapshot == live render for the fixture (one render path proven).
5. **G-readonly + G-loopback** asserted: no store mutation via the server; token-gated; no egress on
   deterministic paths.
6. Projection perf records reviewed (latency/fanout/omitted/serialized bytes) for deterministic and
   living-repo tiers; hard enforcement still belongs to M5.
7. Golden projection transcripts reviewed (diffs, not silent drift).
8. Legacy `pnpm test:product` (1896) + core M1/M2 suites untouched.

> **Out of M3 core (deferred):** on-demand LLM-Inferred generation (business-logic view sections,
> Mermaid diagrams) is a gated Inferred feature (P23, egress) with its own deterministic-validator
> loop (parse the Mermaid, resolve cited entity ids, check anchors) — a bounded follow-on slice, not
> part of the deterministic M3 acceptance above.
