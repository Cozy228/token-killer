# Fable Direction/Design Decision Log

> Running decision log for the Fable direction-analysis + design discussion (per
> `docs/design/FABLE-DESIGN-BRIEF.md` §4: "persist decisions as they're made"). Numbering continues from
> `docs/design/PROJECT-CONTEXT-PACK.md` §9 (P1–P8, O1/O2), which stays a **frozen factual snapshot** — this
> file is where post-snapshot decisions live. Attribution: `[from-discussion <date>]`.
> Entries marked VOIDED/WITHDRAWN are kept for traceability.

---

## Decisions

**P9 — Real audience = internal company adoption.** `[2026-07-02]` Target = promotion/adoption
inside the company (not personal-only per contract D24's premise, not OSS). Raises the weight of
distribution, telemetry `server/`, and the internal-facing value story (O2).
- Ripple: contract D24 ("personal, never published → license irrelevant, verbatim copying of
  PolyForm-NC/unlicensed sources allowed") was premised on never distributing. **O3 (license
  re-audit) raised → dismissed by maintainer same day ("ignore O3"); D24's copyability stance
  stands as-is. Recorded as a maintainer decision, not a legal assessment.**

**P10 — Substrate: Node ≥22 lands; node:sqlite is the single-local-store direction.** `[2026-07-02]`
`engines.node` bumps to ≥22 (retiring D33's capability-gate + dynamic-import scaffolding and the
compile-cache DEFERRED tier); `node:sqlite` ratified as the direction for one local store —
schema/dir conventions designed "future same-store"; ledger migration itself not scheduled.
**O4 (premise check) confirmed 2026-07-02: the D33 Node-20 machine no longer matters.**

**P11 — Compressor endgame delivery = keep the hook (accept the spawn shape).** `[2026-07-02]`
Maintainer: the shim is the worse path (3 spawns vs 1 bare, pack §5); the hook stays the
compressor's delivery at endgame. No resident/thin-client redesign, no MCP-steering for the
compressor; consistent with P7 (Windows perf deferred). Consequence: contract D21③
CommandProxyResident loses its rationale as a compressor fix (state revision to be reflected
whenever the contract is amended).

**~~P12 — Chosen direction = measurement-first + contract-first execution.~~ VOIDED
`[2026-07-02, same day]`** — chosen against a mis-framed question (the offered "paths" were
execution orderings, not product futures); the analysis round was meant to genuinely reopen the
option space. The measurement ideas inside it remain available as inputs, undecided.
`docs/design/archive/FABLE-UNIFIED-DESIGN.md` (which assumed P12) is on hold; `docs/design/archive/FABLE-CONTEXT-PORT-DESIGN.md`
(Fable's counter-design) was **withdrawn 2026-07-03** after P15 showed it misread the product
center. Both kept as archives only.

**P13 — Internal distribution = private npm registry.** `[2026-07-02]` Colleagues install via the
company registry; aligns with INSTALL.md's build-time endpoint/publish path. Consequences: the
telemetry backend needs a real internal deployment decision (server/ has no CI wiring and no
confirmed live endpoint, pack §2); P3's org-enableable hook is designed against
registry-installed endpoints.

**P14 — Task oracle = SWE-bench + curated internal-repo task set.** `[2026-07-02]` Keeps contract
ADR 0023's SWE-bench end-to-end (Python bias disclosed) and adds a small curated task set from
company-internal repos (human-defined acceptance checks, disclosed N, task list frozen before arms
run). Closes the memory open item "task-oracle source". (Per P15, measurement is post-feature —
this stays decided but is not a build driver.)

**P15 — Product definition in the maintainer's own words(最高优先级;supersedes narrower readings
of P1).** `[2026-07-03]` "产品的目的是给人和 AI agent 提供本地的、有效的、正确的上下文。这个上下文
包括 memory、stories、会议/文档类内容、GitHub commit history、decision history、代码的 code map /
AST / 代码图——所有本地的、项目相关的上下文。" Consequences:
- ① **Context breadth is the product center** — many first-class context TYPES (later additions
  from discussion: jira history; business logic is a **derived view**, not an ingestible source),
  served to BOTH audiences; token efficiency (the compressor) is a supporting discipline.
- ② **Features/implementation before data collection** — measurement is post-feature, never the
  driver (this is what voided P12-style framings).
- ③ Non-code context (decisions, history, memory, stories) is **first-class**, not
  promotion-gated candidates — the contract's code-centric "layers on code" restructures toward
  "N sources over one store" (gap list = link layer, memory producer, question-shaped tool surface).
- ④ Both audiences stand; codeguide Required re-affirmed. 鉴真 (provenance/authority/conflict
  surfacing) confirmed required — conflicts between sources are the norm, surfacing them is core
  product value.
- Memory source = agent-session distillation (primary) + human notes; ingress of external
  project context (Jira/Confluence-type) is legitimate — the invariant is "never send project
  context OUT", not "no network IN" (user-credentialed, explicitly triggered, local snapshots).

**P16 — Serving channels: push AND pull; push form host-adaptive; the `tk` CLI (and the
token-killer name) is not necessarily the future core.** `[2026-07-03]`
- ① Integrated memory/context is served through BOTH channels: **push** (a curated slice
  projected into whatever surface each host auto-loads — NOT tied to `tk install`'s mechanism;
  per-host adapter decides the form) and **pull** (tools; the more comprehensive channel).
  Maintainer: push is perhaps the most critical (agent-independent floor), pull is more complete.
- ② Memory strategy: hosts (Claude Code / Codex / Copilot) already do their own end/mid-session
  distillation — tk does not compete on distillation; **tk integrates host memories** (importers
  over host memory stores, provenance per host) + `remember()` explicit writes (primary quality
  path) + human notes. Integration duties: echo exclusion (skip tk's own managed blocks),
  project-scope filtering, cross-host dedup/conflict surfacing (鉴真 reuse).
- ③ The maintainer signaled the `tk` CLI may not remain the product core and the product may be
  renamed — softens contract D33's "hub must be CLI" toward "CLI = installer/bootstrap +
  fallback surface"; the core is the context base (store + producers + serving library),
  consistent with D32's adapters-load-core-in-process model. Rename: no decision yet; real
  migration costs (TOKEN_KILLER_HOME, paths, package name, P13 registry).

**P17 — Push content = memory digest only.** `[2026-07-03]` The push block carries curated memory
essentials only — NOT a broader "project brief" (in-effect decisions / recent hot areas stay
pull-side). Design constraints carried from discussion: tiny hard budget, each entry carries a
handle back into the base (deep-dive goes through pull), block is human-reviewable and can be
disabled.

**P18 — Agent tool surface: keep tools few; add one composite entry tool.** `[2026-07-03]`
D17's few-tools discipline stands (its eval evidence is respected). Additions: **`context(ref|task)`**
— the one-stop cross-source read entry (code + linked decisions + history + memory in one budgeted,
enveloped response; every item carries a handle) — and **`remember(note)`** — the only write path.
Non-code sources surface to agents primarily through `context()`'s composite output (discovery) and
params on existing tools (depth); dedicated single-source tools (why/history/knowledge) stay behind
the `TK_MCP_TOOLS` arm and are promoted into the default set only on usage evidence (D17's own
promotion rule, applied to the new sources). Mid-level design discussion started with this decision.

**P19 — Tool surface final shape: `context` absorbs `explore`; no product-prefixed tool names.**
`[2026-07-03]` Option B ratified: explore's QueryPlan becomes `context()`'s code section; the agent
tool surface = **`context / search / node / callers / remember`** (5 tools). Mental model: "start
with context, navigate with search/node/callers, learn with remember." Harness re-check of the
changed tool contracts happens post-feature (P15②). Tool names carry NO `tk_` prefix — MCP servers
and VS Code LM tools are namespaced by the host already, so tools are clean verbs; the product
rename (P16③) is now actively wanted by the maintainer ("以后不要再用 TK 之类的了").

**P20 — Product name = `ctx`.** `[2026-07-03]` Chosen after lore (obscure) and brain (odd) were
rejected; plainest option — the product's identity IS project context. Naming system: CLI `ctx`
(install / doctor / guide / mcp / run <cmd> / recall <handle>), MCP server `ctx` (clean-verb tools
per P19: context/search/node/callers/remember), env `CTX_HOME`, data dir `~/.ctx/`, human surface
`ctx guide` (codeguide subsumed), hook rewrite target `ctx run <cmd>`. Design vocabulary switches
to `ctx` immediately; code/path/package migration = Implementation dependency (`tk` stays a compat
alias in the shipping compressor line until the context-base implementation lands;
`TOKEN_KILLER_HOME` read-only fallback).

**P21 — MemoryEntry format + lifecycle + push curation ratified.** `[2026-07-03]` Entry =
{id, gist(hard-capped; the only part that enters push/context()), detail?, anchors[](entity refs;
empty = project-level), provenance{origin: remember|host-import:<host>|human-note, sessionRef?,
createdAt}, authority(Inferred|Confirmed), status(active|needs-review|superseded|retired),
links[], usage{servedCount,lastServedAt}}. Lifecycle: anchored entries age via the code source's
invalidation (anchor changed → needs-review, never auto-delete; review queue in `ctx guide`);
unanchored entries never expire, time-decay in ranking only; write-time collisions are never
destructively merged (new entry + sameAsCandidate link; true contradictions surface as conflict
edges); supersede is explicit, old entries kept. Host-imported entries always Inferred +
host-import provenance; echo exclusion + scope filter at import. **Push curation: fully automatic
rank (authority × usage × recency × anchor-freshness), top-N within the ≤1KB hard budget; human
controls = pin + veto only (JSONC control file per D30); no mandatory human confirmation gate.**

**P22 — Source model = content types × carriers; six content types ratified.** `[2026-07-03]`
Primary axis = **content types** (what the base knows; all Required product semantics):
① code structure ② change history ③ decisions ④ requirements/stories ⑤ domain/doc knowledge
⑥ memory/experience. Secondary axis = **carriers** (where it comes from; presence = Optional at
runtime, same pattern as SCIP): tree-sitter/SCIP → ①; local git / GitHub PR·issue → ②③;
ADR·design docs / commit messages / PR discussions / Jira / meeting recaps → ③;
requirement docs / **Jira stories** (= the maintainer's "gist stories") → ④; local docs /
**Confluence + meeting recaps** (= "conference") → ⑤; remember() / host-memory imports / human
notes → ⑥. Carrier↔type is many-to-many via extractors (carrier adapter → typed facts with
provenance{carrier, locus}). Carrier absence degrades coverage (disclosed), never the content
type's existence. The ingress boundary (user-credentialed, explicit, local snapshots) is a
property of network carriers, not a source class. Business logic stays a derived view (P15).
Cross-carrier arbitration within a content type = the 鉴真 machinery's natural jurisdiction.
(Resolves the former A/B question on history-source scope: all carriers wanted.)
LinkEdge model + three-tier linking rules (explicit-key Observed / path·symbol-match Derived with
rename tracking / semantic-proposal Inferred on-demand) + unresolved-mention-as-stale-doc-detection
presented and not objected to — carried as design input.

**P23 — CTX-DESIGN.md forks resolved.** `[2026-07-03]` FORK-1: **guide stays strictly read-only**
(D9/D28 stance unchanged — "why should guide write?"); memory confirm/retire and push pin/veto are
CLI operations (`ctx memory confirm|retire`, `ctx push pin|veto`) + JSONC control-file edits; the
Knowledge page displays state and surfaces the commands. FORK-2: importer credentials are
**user-provided** (env vars / 0600 JSONC config; no OS-keychain integration). FORK-3: `context()`
gets its **own lean default budget** (≈ smallest tier, expansion handles; numbers
measurement-gated). FORK-4: PR-discussion extraction = **thread text as searchable nodes;
decision-node promotion only via explicit markers or On-demand LLM (Inferred)**. Design document
`CTX-DESIGN.md` is now fork-free.

**P24 — Refresh trigger model for non-code sources = D25 generalized (query-triggered).**
`[2026-07-03]` All local sources share the code source's pattern: query time runs a cheap
per-source dirty check (git: compare stored tip vs HEAD for new commits; docs/ADR: mtime scan;
memory: fresh at write) inside the refresh budget — over budget → serve previous generation with
RECONCILING marking, per D25 semantics. Cold paths (`ctx install/doctor`, guide launch) do a full
catch-up refresh. Network-carrier snapshots refresh **only** on explicit `ctx import`. No resident
process of any kind (consistent with the D21 gate and the 0.3.2 daemon rejection); coordination
rides the existing D32 DB-backed lease + per-source generation counters (§3 `generations`).

**P25 — First-principles re-derivation round: three amendments ratified, two stances recorded.**
`[2026-07-03]` A from-scratch re-derivation (facts + goals only, design unseen) was run as a
pressure test. Convergent points (six content types as question categories, one SQLite store,
append-only claims + conflict surfacing, query-time lazy freshness / no daemon, push+pull duality,
read-only guide, ingress-only network boundary, deterministic-extract + semantics-at-serve) are
hereby considered **independently confirmed**. Divergences resolved by the maintainer:
- ① **Index-not-copy ratified** (amends §3 store model): for LOCAL carriers the store holds
  entities (with `locator`), extracted claims, and links — never payload copies; FTS5 runs in
  contentless/external-content mode with read-through to the authoritative source at serve time.
  Network carriers keep dated snapshots (unavoidable — the snapshot IS the local source).
- ② **Tool surface = 3 tools ratified** (amends P19's five): `context(ref|task|handle, budget?)`
  / `search(query, kinds?)` / `remember(note, anchors?)`. `node`/`callers` are absorbed into
  `context(handle)` drill-down semantics (a handle passed back = expansion: callers, full diff,
  full text). The 5-tool split stays available to the ablation arm; promotion back out is
  evidence-gated (D17's rule still governs).
- ③ **Push block gains a fixed header ratified** (amends P17's "memory digest only"): two
  hard-budgeted header lines advertising the context base + `context()` entry (the affordance
  advertisement is part of the floor's value), then the auto-ranked memory gists. ≤1KB total
  unchanged.
- ④ **Technique adoption is NOT slow-iterated** (stance): advanced machinery (PPR/D13, D14
  vocabulary bridge, link layer, arbitration) is adopted directly — sequencing is by
  Implementation dependency only, never by "earn complexity through failure evidence" gating.
- ⑤ **Guide ships the full page set** (stance): no scope cut to the §6 pages; build order may
  still lead with Entity Biography.
- Follow-up: implementation-level design is the next artifact; `.research/` reference projects
  (12 repos) are being mined for implementation techniques to absorb (round launched same day).
- ⑥ **Mining round completed same day** → `CTX-IMPL.md` (implementation design + absorption
  register). Maintainer stance on absorbed material: **license flags ignored entirely; all
  reference code is reference, not gold standard** — adapt/rewrite freely, our design wins on
  any disagreement.

**P26 — Build route = optimal path from the product definition; current state and reference
trajectories are NOT route inputs.** `[2026-07-03]` Maintainer directive + ratifications:
- Route inputs are the product discussion (P15–P25) only. Explicitly excluded: the existing tk
  codebase/compressor, the June contract's slice DAG (#72–#84), and reference projects' build
  paths (the old S-order's "code source first" was codegraph inertia — rejected).
- **Route = M1 base speaks → M2 code joins → M3 guide → M4 importers → M5 hardening**
  (`CTX-IMPL.md` §9). M1 ships the full serving surface (3 tools + push) over the three cheap
  deterministic sources (memory, git history, docs/decisions) with the FULL selection pipeline.
- Ratified A: **code structure waits until M2** — no M1 source depends on tree-sitter; cost
  accepted (file-level touches/anchors during M1). Ratified B: **guide lands at M3**, after
  code joins (biography page needs full content).
- **Compressor absorption = adjacent track**, any time after M1, never on the critical path;
  `ctx` packages are greenfield — no imports from, waiting on, or migration of the tk tree in
  M1–M5.

**P27 — Scope guard: ctx serves context only; the review/verification moment is not a product
surface.** `[2026-07-03]` Maintainer ruling on the DORA pressure-test review
(`docs/design/FABLE-DORA-REVIEW.md`): the product solves ONE problem — supplying developer-local, effective,
correct context. It never judges, verifies, or reviews changes; other DORA pains are not mandates.
DORA's verification-tax finding stays background rationale only (DORA's own causal arrow:
better context → better initial code quality), never an aim for surfaces. Consequences: review
recommendation G1 (change-set ref mode aimed at the review moment) **rejected**; review FORK-C
resolved-out (no review surface of any shape); the internal value story stays context-centric.
If a change-set ref form ever proves needed, it re-enters only through D17's evidence-gated
promotion — no new decision required. Unaffected review outcomes: G2 (pre-M1 record-only
baseline), G3 (push discoverability demotion), G4 (decision-locus audit), G5 (section-cap
tunables), G6 (cold-start playbook), and the Section-2 alignment ledger.

**P28 — Build pre-flight ratified: M1 is GO after the spec-addenda pass (applied same day).**
`[2026-07-04]` Two-agent audit (M1 buildability review + June-corpus disposition audit) synthesized;
maintainer decisions:
- ① **engines = Node ≥22.5, no upper bound** (`node:sqlite` stability floor; the old D33 `<25`
  WASM ceiling is re-verified at M2 start, not carried blindly).
- ② **`ctx install` owns host integration**: MCP-server registration (managed per-host config
  writes) + push placement; `ctx doctor` verifies. CLI verb unified to `install`
  (CTX-IMPL had `init`; CTX-DESIGN §8 always said `install`).
- ③ **1c importer scope = verification-first**: official-docs pass on host memory stores (VS Code
  Copilot + Copilot CLI first, then Codex) decides which importers land in M1; Claude Code path
  is confirmed; M1 ships framework + Claude Code, others follow as independently mergeable
  slices once verified. Instruction/policy surfaces need NO new research (June corpus +
  shipping `src/hook/copilot.ts`/`src/shim/hostAdapter.ts` already cover them).
  **Verification outcome (same day, official docs/repos)**: Copilot CLI has NO local memory
  store → importer not applicable; VS Code Copilot memory tool = PREVIEW disk paths
  (globalStorage/workspaceStorage; cloud-routed repo scope must be skipped) → follow-on with
  guard; Codex `~/.codex/memories/` markdown workspace (off by default) → follow-on. Push
  placement verified: root `AGENTS.md` (Codex + both Copilots) + `CLAUDE.md` (Claude Code, also
  read by both Copilots) = two managed files cover all four hosts. Facts recorded in
  CTX-IMPL §5.6/§7.
- ④ Push auto-rank is NOT a blocker: P21 already ratified the factors; initial weights =
  `constants.ts`, measurement-gated (the design-brief §4 "open" flag is stale).
- ⑤ **M1 spec addenda written into CTX-IMPL §9**: Store interface + SourceAdapter engine pinned
  to 1b; envelope = typed struct rendered last; facet table; `.ctx/push.jsonc` schema; docs
  classification rule; 3-of-5 stale classes in M1; acceptance vs generic MCP stdio fixture;
  remember() validation; pre-milestone verb stubs; shard-key/migration conventions.
- ⑥ Carried-but-unrestated items restored into CTX-IMPL: D32 generation-identity tuple (§2),
  D13 ignore-set (§4), D22 `assertNoEgress()` (§7), plus a **legacy read-back map** (§12) for
  D4/D16/D20/D19/D23/G/J/K specs that live only in the June corpus.
- ⑦ **docs/codemap dispositions applied** — layered over a same-night unrequested rename pass
  (likely a sub-agent of the disposition audit; contract→DESIGN.md,
  action-plan→IMPLEMENTATION.md, runbook→RUNBOOK.md, research/prompts→`archive/`; kept — git
  tracks the renames — but it did NOT absorb ctx and its new README wrongly called the June
  contract "binding"): AUTHORITY NOTE prepended to README.md; AMENDED-OVERLAY banner on
  DESIGN.md pointing to CTX-DESIGN §9; SUPERSEDED banners on IMPLEMENTATION.md, RUNBOOK.md,
  archive/prompts/codegraph-build-loop-goal.md, impl/schema-draft.sql, impl/A, impl/F (tool
  surface), impl/C (DDL), impl/E (catch-up bands), impl/I (wiki.json), A3 (ranking stance),
  A4 (tool surface). Mechanism chapters (B/D/E/G/J/K/L/M, 00-sources, A1/A2) remain
  REFERENCE-CARRIED.
- Standing reminder riding along: **G2 record-only baseline BEFORE any internal rollout** (P27
  review) — gates rollout, not build.

**P29 — Documentation strategy = reference-not-copy across doc layers.** `[2026-07-04]`
Maintainer: do NOT duplicate the June corpus into the ctx docs — the original design keeps its
detail. Layering: **CTX-DESIGN / CTX-IMPL = decision + route layer** (what changed, contract
deltas, build route; stays lean); **`docs/codemap/` = permanent detail layer** (`DESIGN.md` =
authoritative text of every carried D-item — no "restate until absorbed" trajectory;
`IMPLEMENTATION.md` = live index into `impl/`; `impl/` = implementation dossiers). Mechanism =
CTX-IMPL §12 read-back map + inline pointers; P28's three one-line restatements (D32 tuple,
D13 ignore-set, D22 assertNoEgress) are pointer-with-gist and are the ceiling, not a pattern to
continue. `RUNBOOK.md`'s per-slice workflow discipline (green-before-next; priorities
correctness > completeness > verifiability > token) is carried as the M1–M5 method template —
only the #59–#84 ordering is retired. P28 ⑦ banners re-worded to match.

## Open

- **O1 / O2** (pack §9) — value metric & joint story: partially reshaped by P15 (measurement is
  post-feature); protocol pieces decided in P14; final form open.
- ~~Push curation policy~~ — **ratified by P21** (auto-rank, pin/veto only, no confirmation gate).
- "gist stories" / "conference" precise definitions — provisional readings: user-story-type
  documents / Confluence-or-meeting-notes-type documents.
