---
status: active
tier: REGISTER
purpose: design register for the `ctx` (local) evidence facet — the ctx facet's design as implemented-and-planned, reconciled to PRODUCT-DESIGN.md (LAW)
supersedes: CONTEXA-DESIGN.md (2026-07-03 "design-step output" version) and its §9 June-contract amendment register
death_condition: superseded by a successor design register explicitly ratified by the maintainer, or folded into a LAW-side revision
ratified: 2026-07-10 (maintainer-instructed landing "先落" — Codex Gate-B review delegated to the maintainer, prompt at docs/build/CODEX-GATE-B-REVIEW-PROMPT.md; O-31 closed; all nine rulings answered in P37)
---

# Contexa (ctx) — Design Register

This register describes how the **`ctx` local facet** is designed, as it exists in code
today and as it is planned under the validation ladder. It is a REGISTER, not authority:
on any conflict with `PRODUCT-DESIGN.md` (LAW), the LAW wins and this register is
reconciled at the next /gc [LAW §10]. Every normative statement below carries a
traceability tag to a LAW anchor (`[LAW art.N]` / `[LAW §N]` / `[LAW RN]`), a drift
disposition (`[DR-NN]`, normative per the Drift Register rev. 3), or a code anchor
(`[code: path:line]`). Where the implementation drifts from LAW, the refit direction is
stated inline and never papered over.

Companion registers: `CONTEXA-IMPL.md` (concrete DDL, ingest/extract/select mechanics,
the M-plan v2 route) and the permanent detail layer under `docs/codemap/` and
`docs/build/MEMORY-DECISIONS.md` — this register points to them rather than restating
them [P29 reference-not-copy].

---

## 1. What the system is

Contexa is one facet of a single system: a **decision-moment evidence compiler** that
assembles cited, freshness-stamped, permission-scoped evidence into the moment an
engineering decision is made, for the humans and AI agents making it [LAW thesis; art.1].
It is authoritative only about *what was observed, from where, at time T, at what
confidence* — never about the world itself [LAW §1]. `ctx` is the system's **local
facet**: execution and workspace reality observed at the local command/tool boundary —
what ran, against which working tree, with what result, and whether that is still valid
[LAW §4]. The organization facet (`Atlas`) is a different trust boundary and a different
repo; it is out of scope here (§3). This register covers the ctx facet's design as
implemented (the shipping compressor wedge; the greenfield store/memory/MCP tree) and as
planned under the LAW §8 ladder. The prior framing — "a developer-local context
engineering tool" — survives as the local facet's domain, but the product thesis is now
the LAW's, not this register's [supersedes old §1 claims 7–8].

## 2. The claim contract as implemented

Everything the system emits is a **claim** carrying source anchor (URI + revision/hash),
observed time, derivation class, status, confidence, freshness, and a disclosure class
[LAW art.2; LAW §3]. The ctx store is a projection onto this schema — projectable, not
yet isomorphic. The table states honestly what is implemented today versus what the
R-slice ("claim-serving integrity") must refit before ctx serves any factual claim into a
host session [DR M-plan v2 R-slice].

| LAW §3 field | Implemented today | Refit direction (normative) |
|---|---|---|
| derivation (`OBSERVED`/`DECLARED`/`INFERRED`) + confidence (`CONFIRMED`/`LIKELY`/`POSSIBLE`) | a single `authority` enum (`observed`/`derived`/`inferred`/`confirmed`) on claims, memory rows, memory_events, committed mem/dec line grammar, TS types [code: packages/core/src/store/migrations/001-init.sql:31; packages/core/src/store/types.ts:21; packages/core/src/memory/remember.ts:54,365-399] | Split every persisted `authority` field into `derivation` + `confidence`. Backfill from carrier+method+create-event actor, never from the legacy enum or authorship alone; `CONFIRMED` requires independent corroboration; `LIKELY` only where the source is authoritative for that claim type (§7.1 matrix logic); ambiguous legacy rows stay `unknown`. Note: production writes `origin=remember`, no mechanical human-authored backfill exists [DR-02]. |
| status (`resolved`/`conflicting`/`stale`/`unavailable`/`restricted`/`unknown`) | scattered across `links.stale`, `conflicts`, `memory.status` | Derive per-claim `status` as a computed view: memory `active`→resolved, `needs-review`(drift)→stale, `needs-review`(pending)→unknown, `unresolvedHere`→unavailable; `restricted` reserved until DR-05 lands [DR-03]. |
| freshness (per-source decay class + re-verification trigger) | hash-drift detection writes `links.stale` only, **after** selection; traversal and ranking ignore `links.stale`; search does no read-through; drift is never rendered [code: packages/core/src/store/store.ts:1008-1015; packages/core/src/select/subgraph.ts:64-96; packages/core/src/serve/render.ts:54-65] | **serve-blocking.** Exclude/downgrade stale links in traversal+ranking; render claim freshness as unknown-until-reverified; rename the header state honestly (index-catchup, not "fresh"); add per-source decay class + re-verification trigger for non-file connectors [DR-04; LAW R2]. |
| disclosure / `restricted` (permission class enforced at render **and** every machine interface) | not a field. Secret guard scans the mainline path only; MCP notes land in the overlay unscanned; overlay/needs-review served by default; restricted-shaped bodies stay indexed, searchable, renderable [code: packages/core/src/memory/remember.ts:365-385; packages/core/src/select/visibility.ts:56-64] | **serve-blocking.** Add real `restricted` status + `disclosure` class (default local); exclude restricted bodies and relationship-derived leaks from FTS/render/machine interfaces; emit only a cited withheld/unavailable outcome [DR-05; LAW art.2; LAW §4]. |
| immutable-state keying (cases keyed to commit range / workspace fingerprint) | `published_gen` is a per-source visibility pointer; all worktrees share one shard; a clean size+mtime dirty-check can reuse rows built under another worktree/policy and serve them "fresh" [code: packages/core/src/store/shard.ts:4-12; packages/core/src/store/migrations/001-init.sql:79-81; packages/core/src/store/store.ts:855-890; packages/core/src/ingest/code/adapter.ts:168-181] | **serve-blocking.** Bind every published generation to the D32 tuple **(repository revision, worktree digest, schema version, analysis-policy version)** [ADR 0040]; reject/rebuild on any component mismatch. `source cursor` is an extra per-source freshness input, never a substitute for the repository revision [DR-06; LAW §3]. |
| evidence anchor reaching the consumer | the rendered envelope cites locators (`[handle]`) but carries no per-claim id/status/freshness/disclosure/evidence [code: packages/core/src/serve/render.ts:84-92; packages/core/src/select/types.ts:25-40] | **serve-blocking.** Define the minimum claim envelope (evidence anchor incl. revision/hash, observed time, derivation, confidence, status, freshness, disclosure), rendered tersely. This minimum claim envelope is the binding base for every consumer. Under P37/O-25, retained or reworked M3 projection DTOs are unified with it; historical structs may be reused only where the re-scope justifies them [DR-07; DR-15; P37; LAW R6]. |
| bitemporal recompute (`valid_from`/`valid_to`) | columns written by migration 003, never read [code: packages/core/src/store/migrations/003-memory-bitemporal.sql] | Provide an equivalent as-of / bitemporal recompute path (P37 ⑧ EQUIVALENT-SCHEME — wiring the columns is not required). A bare cut would drop LAW §3's bitemporal promise → requires LAW-side escalation, not a local decision [DR-10; P37]. |

**What already conforms** [DR-08; LAW art.1/2/4, R3/R5]: contentless FTS (index-not-copy);
claims/links separation; conflicts shown side by side, never averaged [LAW art.4];
shrink-guard success-shaped refusal; RECONCILING serves the previous generation (fail-open
[LAW R5]); `assertNoEgress()` + measured zero network calls [LAW §4 no-egress]. This is the
conformance base the refits build on.

Dead columns `served_count`/`last_served` are cut (research ruled them out) [DR-09].

## 3. The two facets here

The system has two evidence facets under one contract [LAW §4].

- **ctx — the local facet** (this register). Concrete assets: the shipping **contexa 0.3.2
  command filtering/recovery** wedge (the adoption mechanism and evidence-delivery channel),
  the savings ledger, `inspect`/`optimize` [LAW §4 today's assets]; and the **greenfield
  tree** — the store, the file-backed memory subsystem, and the `ctx mcp` server with
  `context`/`search`/`remember`. The greenfield MCP is *implemented* but *gated* (§5, §8):
  pre-V1 it runs only under the O-14 measurement / maintainer-dogfooding carve-out, with no
  distribution, no auto-install, and no decision-trust framing [DR-01; LAW R2, art.8 shadow-entry].
- **Atlas — the organization facet.** Different trust boundary (governed read-only
  connectors, caller-scoped answers), different repo, not designed here [LAW §4]. Pointer
  only; on any shared-schema question the LAW's claim contract (§2) governs both facets.

Each facet must remain independently useful; shared storage/branding/packaging are
per-deployment implementation choices, no longer forbidden and no longer required [LAW §4].

## 4. Decision artifacts — status here

The five decision artifacts are LAW-level outputs [LAW §5]. ctx today holds partial or
substrate-only material for a subset; construction status per artifact, and what is
pre-gate-legal versus gated, is normative per [DR-22], except where the LAW §8 ladder
overrides the register — the Artifact 1 build-out is LAW-gated, LAW wins:

| Artifact [LAW §5] | ctx state | Disposition |
|---|---|---|
| 1 Context Brief | partial — a local proto-Brief exists (memory + selection) | Keep the existing claim-backed proto-Brief only; **no Artifact 1 build-out is authorized pre-V1**. A V1 pass unlocks only the minimum semantics pre-registered as necessary for V2; any broader Context Brief construction requires an explicit ladder gate [DR-22 override; LAW §8]. |
| 2 Impact Set / Blast Radius | substrate only (code graph edges) | **Gated — make-or-break.** No impact artifact ships before the LAW §8.1 ladder validates the substrate; declared-edge-plus-DARK is the §9 fallback. |
| 3 Routing Card | substrate only (git authorship/history edges) | **Gated (org pilot).** Ownership answers follow the §7.1 claim-classification rule [LAW §7.1; P34]. |
| 4 Verification Ledger | partial — **strongest**, two *unjoined* halves: the shipping proto-continuity card and the greenfield `VALID`/`STALE` primitives | Build-out **pre-gate-legal under FP-L**; the local continuity pilot is the §9 survivor because its evidence is `OBSERVED` at the command boundary [LAW §9; DR-24]. |
| 5 Delivery Route / Evidence Bundle | zero (expected) | Not built; org-facet + gated. |

## 5. Surfaces

ctx surfaces split into the shipping wedge (conforms as delivery mechanics) and the
greenfield machine/human interface (gated on the ladder). **Citation-or-silence** [LAW
art.3] is the posture on every surface that asserts facts.

### 5.1 Shipping wedge — filter CLI + hook/shim/injection

The 0.3.2 command filter delivers via a PATH shim / host hook / session injection, at the
local command boundary — the one place execution truth is exact [LAW §4; code: src/shim/hostAdapter.ts:88-197 — root ships hook/shim/injection only]. Fail-open gate, recovery, telemetry,
and ledger separation **conform** as wedge mechanics [DR-18; LAW R5]. Two drifts, both
plan-level refits (shipping code defects filed report-only) [DR-18]:

- **Never emit a heuristic success verdict.** `summarizeBuild` takes no exit code; an
  `errors==0 && warnings==0` output renders "[ok] Build successful" and can contradict the
  real exit code [code: src/handlers/system/summary.ts:105-133, verdict line :126; coexistence path src/handlers/system/summary.ts:214-225].
  Refit: wire the exit code through; neutral counts otherwise [LAW R3 zero false reassurance].
- **Every synthesized summary that asserts facts carries a raw receipt/anchor** (extend the
  existing snapshot pointer beyond declared-omission) or stops asserting [code:
  src/handlers/base.ts:221-230; LAW art.2].

The shipping history record is a **proto-claim, not claim-shaped**: `project_fingerprint`
is a path hash (accounting id) with no commit/worktree binding and no `VALID`/`STALE`
recompute [code: src/core/history.ts:18-45; src/core/dataDir.ts:115]. Claim-shaping it is the **first FP-L
slice**, not a general retrofit [DR-19; LAW §4 "still valid?"].

`ctx debug`/`support` remain no-egress field-plumbing utilities — maintained, no scope
growth; death condition = superseded by facet tooling [DR-21].

### 5.2 Greenfield machine interface — `ctx mcp` (gated)

The MCP server exposes three clean verbs — `context(ref | task | handle, budget?)`,
`search(query, kinds?)`, `remember(note, anchors?, supersedes?)` [code: packages/cli/src/mcp.ts:37-93] —
serving the same store agents and humans read [LAW R6]. It is implemented in the greenfield
tree (package version 0.0.0, unreleased) and auto-registered by `ctx install`, which also
places a push block [code: packages/cli/src/cli.ts:308-337; packages/core/src/install/mcpConfig.ts:41-85]. Two obligations gate any
factual serving into a real host session:

- **Containment (DR-01):** pre-V1, the persisted M1/M2 graph is served only under the
  O-14/dogfooding carve-out — no distribution, no auto-install, no decision-trust framing;
  responses carry an accelerator-not-validated disclosure. Expansion follows LAW §8 staging
  (V1 → minimal V2 semantics; V2 → the pre-registered non-blocking V3 shadow; general
  distribution is unauthorized at any pre-V3 stage) [DR-01; LAW R2, §8].
- **Envelope obligation (DR-31):** the server is a Markdown transport today; caller scope
  and per-claim evidence/observed-time/derivation/status/confidence/freshness/disclosure and
  cited UNKNOWN/restricted outcomes never reach the host [code: packages/cli/src/mcp.ts:174-187;
  packages/core/src/serve/types.ts:1-5]. Factual machine serving is gated until the minimum claim envelope
  (§2, DR-07) is serialized under the caller's identity [DR-31; LAW R6]. This server does
  **not** proxy shell execution, so it does not remove the filter's per-command spawn tax;
  a host-held command-observation pipe is separate gated scope, not a refit [DR-20; LAW R4].

The MCP server exists but is **not distributed** and does not serve validated decision
claims [DR-20 corrected: the gap is distribution + R6 semantics, not absence].

### 5.3 Push block (per DR-32 posture)

Push writes a managed, always-loaded block into host instruction files (AGENTS.md /
CLAUDE.md), and `ctx push` can write those files manually, independent of any install-side
gate [code: packages/core/src/push/block.ts:35-39 (header lines); packages/cli/src/cli.ts:273]. Because the block renders **into instruction files
that are always loaded**, it must not carry uncited factual claims [LAW art.3]. Pre-gate
posture (**use-blocking**): **omit factual gotchas entirely** and drop/reword the "with
provenance" header to non-claiming text; tool-usage instructions may stay [DR-32]. If
factual gotchas ever return, each carries the full minimum claim envelope (§2) plus an
explicit omission disclosure [DR-32; LAW §3]. The ≤1KB budget and pin/veto controls survive
as mechanics; only the factual-claim content is withheld pre-gate.

### 5.4 CLI verbs

`ctx install · doctor · mcp · run <cmd> · recall <handle> · import <carrier> · sync ·
remember · memory confirm|retire <id> · push pin|veto <id>` [carried from old §8 claim 52;
code: packages/cli/src/cli.ts]. As-built today: the hard rename to `contexa`/`ctx` has landed (`bin ctx`;
ADR 0015 bans a `tk` alias), and `--raw` → `stdio:'inherit'` has landed [DR-29a; code:
package.json:2; src/cli.ts:314-318; src/executor.ts:637-640]. `ctx import`/`ctx guide` before their milestone return a
success-shaped "lands later" notice, never an unknown-command error [carried spec addendum,
claim 114]. Note: `ctx guide` before the O-25 re-scope returns a success-shaped
"re-scope pending" notice, never a retirement notice (§8, §9) [P37].

## 6. Source model & selection

The ingest/extract/select design carries forward from the old register, retagged to the
LAW. Mechanism detail lives in `CONTEXA-IMPL.md` §2–§6 and `docs/codemap/` — pointed to, not
restated [P29].

**Content types × carriers** [carried old §2 claims 13–16; LAW §4 local-facet domain]. The
primary axis is six **content types** (product semantics, all required): code structure,
change history, decisions, requirements/stories, domain/doc knowledge, memory/experience.
The secondary axis is **carriers** (presence optional at runtime; absence degrades disclosed
coverage, never a type's existence — the SCIP pattern generalized). Carrier↔type is
many-to-many through per-type extractors that emit typed facts with `provenance{carrier,
locus}`; one carrier feeds several types (git → history + decisions). The **network boundary
invariant** holds: **no egress is the default.** Local claims may cross the boundary only under
explicit, enforced disclosure rules; network carriers remain user-credentialed and explicitly
triggered, stored as dated per-person local snapshots, never committed [LAW §4; art. 2 disclosure
class]. Under the LAW this invariant is subsumed by the
disclosure class (§2, DR-05): "no egress by default" is a disclosure default, and its
enforcement at every machine interface is the DR-05 refit, not a property the current
overlay placement already delivers.

**Store** [carried old §3; LAW art.1]. One engine (`node:sqlite` + FTS5), one per-project
gitignored shard; **index-not-copy for derived/file-backed sources and the contentless FTS** —
the store holds locators + facts + links, not payload copies of those sources; authoritative
bytes stay in git/files and are read back at serve time. The approved exception is
memory/concepts: SQLite materializes `gist`/`detail`, a payload the store owns but rebuilds
wholesale from the `.contexa` memory files [code: packages/core/src/store/migrations/001-init.sql:54-64;
docs/build/MEMORY-DECISIONS.md:11-14]. This is DR-08 conformance. The per-carrier ownership/sync
matrix (① derived-from-committed / ②
authored-local / ③ external SoR) is carried; full matrix in
`docs/build/MEMORY-SYNC-SETTLEMENTS.md` [carried claims 20, 25–27].

**Selection pipeline** [carried old §4 claim 28; `CONTEXA-IMPL.md` §5]. Lexical seeds across
all kinds (FTS5 + identifier normalization + vocabulary bridge) → expansion along structural
and link edges → query-local PPR on the cross-source subgraph → sections with per-section
caps and marginal-utility borrowing → projection with render tiers. Time decay applies to
history/memory kinds only, never code; confidence is a soft ranking factor; conflicts are
never budget-squeezable [LAW art.4]. **Freshness wiring obligation (DR-04):** selection today
ignores `links.stale` and does no read-through, so stale/superseded evidence can rank and
render as current — the serve-blocking refit is to exclude/downgrade stale links in
traversal and ranking before any factual serving [DR-04; LAW R2].

**Ranking** as built is composite, never single-metric: PPR over the query subgraph ×
post-multipliers, RRF-fused (K=60) with the raw lexical rank, then × history-heat × authority-kind
boost [code: packages/core/src/select/engine.ts:69-117; `CONTEXA-IMPL.md` §5]. The as-built
projection envelope carries `{budgetTier, totalBudgetTokens, envelopeReserveTokens, perSectionBudget,
usedTokens, omittedTotal, truncated, partial, constants, notes}` with no silent truncation
(`truncated` vs `partial` kept distinct) [code: packages/core/src/select/types.ts:67-79]. A richer
envelope with `coverage`, per-section freshness, and `basis` is a **refit/gated target**, not
as-built; per-claim freshness is honest only once DR-04 lands [DR-04].

Extractor detail per content type (code / git / decisions / stories / docs / memory) carries
unchanged and lives in `CONTEXA-IMPL.md` §3 [carried old §5 claims 33–40]; the discipline —
extract only what is provable from structure; semantic narration may be generated only over cited
claims and may not introduce a claim, otherwise the surface remains silent (merely labeling LLM
output `INFERRED` is insufficient) — is exactly LAW art.3 (an LLM narrates over cited claims, never
introduces one) [LAW art.3].

## 7. Memory design

Memory is the ctx local facet made concrete [LAW §4], and the one content class that is
authored, not derived. The design is the **unified event model** [P31; carried claims
19–20, 58–61, 98]: every write — `remember`, host import, a lifecycle verb, a conflict
resolution — is an immutable event appended to one of **two implemented event zones**: ① committed
Mainline log (`.contexa/memory/*.md`) · ② personal overlay (`.contexa/*.local.*`, gitignored)
[code: packages/core/src/memory/fileStore.ts:29-46]. A third external-snapshot zone is an
M4-gated target (§8), not yet implemented. Status is a **deterministic fold** over events in total
order `(timestamp, ULID)`, never a mutable column [LAW art.2 observed-at ordering]. The
store's `memory` rows are a rebuildable, gitignored materialized projection over the committed
files — the approved memory/concepts exception (index-not-copy holds for derived/file-backed
sources + contentless FTS) [code: packages/core/src/memory/fileStore.ts:29-47; packages/core/src/memory/remember.ts:39-97]. This local-facet
machinery **conforms** [DR-11] — scoped: the CONFORMS does not extend to disclosure
enforcement (→DR-05) or the push block's citation posture (→DR-32).

- **Conflicts — three-layer model (E1)** [LAW art.4]: textual = git (bytes only,
  `merge=union` auto-merges concurrent appends); identity = dedup at reindex
  (`sameAsCandidate`); semantic contradiction filed at the post-merge reindex reconcile,
  human-resolved via the committed decision log. Git is never the semantic surface.
- **Drift** stays sticky-until-confirm; `stale-suspect` (reason-classed drift) and
  `unresolved-here` (per-machine/per-branch annotation) are disjoint, split deterministically
  on the git graph not the local index [carried claim 104; MEMORY-SYNC-SETTLEMENTS S4/S9].
- **Secret guard (E4):** a deterministic secret-shaped regex guard runs before the committed
  zone, success-shaped refusal, no LLM/network [carried claim 61; code: packages/core/src/memory/remember.ts:365-385].
  This is a *capture-time* guard, distinct from the *serve-time* disclosure enforcement DR-05
  still owes.
- **Landing zones (E3):** CLI `remember` (human-authored) defaults to committed Mainline
  (`--local` → overlay); MCP `remember` (agent-authored) and host imports land in the overlay
  as `needs-review`, committed only on human confirm.

**Scoped expiry (DR-12):** semantic local overrides (`remember --local --supersedes`) must
gain an expiry / re-verification trigger; expiry = loss of current precedence/eligibility,
**not** deletion (no contradiction with the append-only, non-destructive event log). Expired
overrides surface as stale (flagged, retained) [DR-12; LAW §3 "local overrides expire"].
Trigger/cadence is an implementation choice. Full rulings (A/B/C/D/E-groups): SoT
`docs/build/MEMORY-DECISIONS.md` — pointed to, not restated [P29].

Open memory-doc items (report-only): CLI lacks a `supersede` verb; `needs-review` overloads
drift-stale versus confirmation-pending (LAW §3 splits `stale` vs `unknown`); the `human-note`
origin is unwired [DR-30].

## 8. Gated — not yet unlocked by the ladder

V0 is authorized now; FP-L may proceed early under LAW §9; `ctx guide` may proceed only after
Gate B and the R-slice under P37; every other item in this section remains locked behind its
named ladder gate [LAW §8 validation ladder; DR M-plan v2]. This lock does not reach the
separately-sanctioned pre-gate work recorded elsewhere: O-14/E0 measurement (P38), wedge
reliability and the R-slice retrofit, and DR-27's pre-V1 disclosure half. No aspirational
content appears outside this section.

- **V0 — freeze the O-22 Wizard-of-Oz protocol.** Immediate next step, zero code; a LAW §8.1
  stage-1 precondition [DR-24].
- **V1 — WoZ shadow study** (LAW §8.1 stage 1). ~12 real PRs, hand-operated read-only source
  queries; kill bar <9/12 source-backed coverage or **any** material false reassurance
  [LAW §8.1; DR-24]. Gated on V0.
- **V2 — retrospective backtest** (LAW §8.1 stage 2). Read-only connectors, ~100–150 PRs;
  **produces** the §7.2 calibrated thresholds. Gated on V1 [LAW §8.1/§8.2].
- **V3 — live shadow** (LAW §8.1 stage 3). 4 weeks, non-blocking surfaces only; the first
  live-host stage. Gated on V2 [LAW §8.1; DR-01 staging].
- **FP-L — ctx continuity pilot** (LAW §8/§9 survivor). May proceed **early**; first slice =
  the DR-19 claim-shaping of the history record [DR-24; LAW §9]. Validates Artifact 4's local
  core.
- **FP-O — Atlas concierge pilot.** Gated: needs V1 + org connectors [DR M-plan v2; LAW §8].
- **M4 connectors — org carriers, re-scoped (DR-23).** Sequencing (P37 ④): M4 lands last, or the
  locally-verifiable git carriers first (e.g. GitHub commit history); GitHub/API connectors later.
  Snapshots retained only as TTL- and source-receipted accelerators, revalidated before
  trigger-time bitemporal compilation; caller identity/disclosure propagated; connector absence
  renders as a named blind spot. Connector **breadth** is gated on V1/V2; live-reads-only is not
  required by R2 [DR-23; P37; LAW R2, §8.3].
- **O-16 full unresolved-mention fix (DR-27).** The honest half proceeds pre-V1 (suppress/flag
  the affected relation, render a named blind spot [LAW art.4]) and its design + fixtures are
  frozen now; the **full** fix (durable unresolved-mention persistence + cross-source
  re-resolution seam) is new substrate construction, gated behind V1 [DR-27].
- **Remaining compressor absorption (DR-29c).** Fidelity fixes have landed (§5.4); the
  still-unbuilt absorption — JSONL→SQLite ledger migration, recall handles, session-provenance
  plumbing — is product/storage expansion, gated on FP-L. Off-critical-path ≠ pre-gate-authorized
  [DR-29c].
- **`ctx guide` — recast per P37 [LAW §11].** On-demand, runtime-created, local, read-only
  render surface over this facet's own cited claims: inspection (review queue, push state,
  graph state), understanding views (entity/code paths, overview, history, decisions), and
  decision-artifact rendering. Gates: the surface itself lands AFTER the R-slice (it inherits
  DR-07/31 claim-envelope rendering, DR-01 accelerator disclosure on unvalidated inferred
  content, DR-17 §3-provenance spec); the Impact-Set (blast radius) visualization page ships
  only WITH Artifact 2 (V1→V2 gate). Work-order re-scope tracked as OPEN O-25 [P37; LAW §11].

Threshold numbers (Fable ≥90%/≥70%; Opus recall ≥0.80 @ precision ≥0.50) are **hypothesis
inputs to the first calibration run**, pre-registered per stage, never adjusted post-hoc
[LAW §7.2; P34].

## 9. Retired & superseded

- **`ctx guide` (M3) — retirement REJECTED; recast (P37, LAW §11).** The reconciliation's
  Drift Register proposed retirement under art. 1 (DR-14/15) and the maintainer overrode it:
  the guide was never a standing/central destination — it is an on-demand runtime-created
  local render surface, retained with the obligations listed in §8 [P37; LAW §11]. DR-14/15/16
  rows in the register (CONTEXA-IMPL Appendix A) stand as audit history, overridden by P37.
  What DOES retire from the old work order: its flagship framing, and G-provenance's pre-LAW
  vocabulary — any surface spec must use the full LAW §3 claim contract [DR-17].
  G-readonly / G-loopback / G-profile-budget carry as written. FORK-1's guide-read-only ruling
  is re-affirmed (read-only stays narrow = non-mutating).
- **Projection kernel (five-struct M3 kernel) — design re-enters via the O-25 re-scope, not
  verbatim.** The five structs were page-coupled; the re-scoped work order defines its render
  DTOs unified with the DR-07/31 minimum claim envelope (structs may be reused where the
  re-scope justifies them) [P37; DR-15 technical note carried].
- **Old M-route (M1→M5 milestone plan) — superseded** by the gate-first **M-plan v2** in
  `CONTEXA-IMPL.md` (M1/M2 done + retrofit; R-slice; V0–V3; FP-L/FP-O; M4 re-scoped; M5 →
  measurement + wedge perf) [DR M-plan v2; supersedes old §9 claims 112–119].
- **Old §9 June-contract amendment register (claims 56–61) — superseded** by this register and
  the LAW. The June D1–D33 lineage is frozen history in `docs/codemap/`; this register no longer
  carries the amendment table.
- **`tk` bin alias — orphan/prohibited** by ADR 0015 [DR-29b].

## 10. Relationship to other documents

- **`PRODUCT-DESIGN.md` (LAW, repo root)** wins on every conflict; this register is reconciled
  to it at the next /gc [LAW §10].
- **`CONTEXA-IMPL.md`** is the sibling implementation register (DDL, ingest/extract/select
  mechanics, M-plan v2). This register states *what and why*; IMPL states *how*.
- **`docs/codemap/`** is the permanent detail layer (June D1–D33 / ADR 0017–0040, appendices,
  read-back map). Per P29 reference-not-copy, this register **points** to it and does not
  duplicate its mechanism chapters.
- **`docs/build/MEMORY-DECISIONS.md` / `MEMORY-SYNC-SETTLEMENTS.md`** are the memory SoT
  (A/B/C/D/E rulings, S-settlements); §7 points to them.
- **`FABLE-DECISION-LOG.md`** carries the decision lineage (P15–P38; P37 = M3 recast + LAW §11,
  P38 = measurement design v2); the R-slice and V0–V3 rulings register there as future P-entries.
- The **old `CONTEXA-DESIGN.md`** is archived at `docs/archive/` with a superseded banner
  pointing here.

---

## Appendix — Old-register claim dispositions

Accounts for **Part A claims 1–65** of the old `CONTEXA-DESIGN.md` (archived at
`docs/archive/CONTEXA-DESIGN-20260703.md`). Part B (66–130) and Part C (goal prompts) are
`CONTEXA-IMPL.md`'s domain and are dispositioned there. **C** = carried, **S** =
superseded-with-pointer, **D** = dropped-with-reason.

**Header / status (1–6).** 1–2 **S** → this frontmatter + §10 (design-step-output framing and
June-contract-amended framing replaced by LAW authority). 3 **split**: Terminology Law
(one-capability-state) **C** as house discipline; the Observed/Derived/Inferred/**Confirmed**
fact-authority tiers **S** → LAW §3 derivation+confidence split [§2, DR-02]. 4 **C** (build-order
= code order, §5/§8 preserve it). 5 **C** as historical (forks resolved; see FORK dispositions
below). 6 **S** — P25 amendments (index-not-copy, 3-tool, push header) fold into §2/§5/§6 under
LAW tags.

**§1 Product definition (7–12).** 7 **C** as historical framing (§1). 8 **S** → §1 (ctx = local
facet, not the product thesis) [LAW §4]. 9 **C** (Acquire/Verify/Serve/Refresh survive as facet
mechanics, §6/§7). 10 **split**: breadth-center, non-code-first-class, project-owned-moat **C**
(§1/§6); "features before measurement" **S** → gated by the LAW §8 ladder (§8). 11 **C**
(project-not-assistant moat, §1). 12 **C** as-built (contexa/ctx, Node≥22.5, node:sqlite)
[DR-29a, §5.4].

**§2 Source model (13–16).** All **C** → §6 with LAW §4 tags; 16 (network boundary) **C** but
subsumed under the disclosure class and its serve-time enforcement obligation [DR-05].

**§3 Store & schema (17–27).** 17–18 (one engine, index-not-copy) **C** [DR-08, §6]. 19–20
(memory file-backed, per-carrier sync) **C** → §7. 21 (shard layout) **C** → §6/IMPL. 22 **split
by field**: node/edge/FTS structure **C** [DR-08]; the `authority` enum **S** → derivation+confidence
[DR-02, §2]; `memory_meta.status` **S** → computed status view [DR-03]; `valid_from/to` **C-pending**
(wire-or-escalate) [DR-10]; `served_count/last_served` **D** — dead columns cut [DR-09]. 23–24
(freshness vocabulary, refresh trigger model) **C** but the serve-time freshness guarantee is
refit-pending [DR-04]. 25–27 (per-carrier matrix, driver example) **C** → §6/IMPL/SETTLEMENTS.

**§4 Ranking & serving (28–32).** 28 (selection) **C** → §6 with the DR-04 freshness-wiring
obligation. 29 (projection envelope) **C** → §6, freshness field honest only post-DR-04. 30
(three tools) **C** but **gated** [DR-01/20/31, §5.2]. 31 (split-out tools behind ablation arm)
**C** → §8 (evidence-gated). 32 (push fixed header + digest) **C-with-refit**: mechanics carried,
factual gotchas **omitted pre-gate** and the "with provenance" header reworded [DR-32, §5.3].

**§5 Extractors (33–40).** All **C** → §6 pointer + `CONTEXA-IMPL.md` §3; the static-only/on-demand-
Inferred discipline maps to LAW art.3.

**§6 `ctx guide` (41–43).** All **RECAST/FROZEN pending O-25** → §9 (guide + projection kernel
recast under P37/LAW §11 — retirement rejected; DTOs unified with the DR-07/31 envelope)
[DR-14/15/17; P37].

**§7 Compressor integration (44–50).** 44 (role) **C** → §5.1. 45 (rename/`tk` alias) **split**:
rename **C** as-built, `tk` alias **D** (prohibited, ADR 0015) [DR-29a/b]. 46 (handlers→shapers)
**C** → §8 (low-priority, gated absorption). 47 (ledgers jsonl→sqlite) **C** → §8 gated [DR-29c].
48 (session dedup handles) **C** → §8. 49 (`--raw`→stdio:inherit) **C** as-built [DR-29a, §5.4].
50 (capture tap = session-scoped provenance) **C** → §7.

**§8 Process & delivery (51–55).** 51 (in-process library, asymmetric adapters) **C** → §5/IMPL,
the guide adapter RECAST/FROZEN pending O-25 (not retired) [P37]. 52 (CLI surface) **C** → §5.4. 53 (private registry, engines,
signing) **C** → IMPL (distribution gated by LAW §8). 54 (git-as-sync, three-layer conflict) **C**
→ §7. 55 (three-tier visibility) **C** → §6/§7.

**§9 Amendment register (56–61).** 56–57 (June D-item amendment table, new-sections list) **S** →
§9/§10 (June lineage frozen in `docs/codemap/`; this register drops the amendment table). 58 (memory
re-architecture) **C** → §7. 59 (E1 three-layer) **C** → §7. 60 (E3 committed=confirmed) **C** → §7.
61 (E4 secret guard) **C** → §7.

**§10 Forks (62–65).** 62 (FORK-1 guide read-only) **C** — re-affirmed under the recast (read-only
stays narrow = non-mutating); guide RECAST/FROZEN pending O-25 [P37; DR-14]. 63 (FORK-2
user-provided credentials) **C** → IMPL. 64 (FORK-3 lean default budget) **C** → §6/IMPL. 65 (FORK-4
PR threads as searchable text, decision-promotion only via explicit markers/Inferred) **C** → §6/IMPL,
consistent with LAW art.3.
