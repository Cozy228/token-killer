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

**P20 — Product name = `contexa`; CLI = `ctx`.** `[2026-07-03]` Chosen after lore (obscure) and brain (odd) were
rejected; plainest option — the product's identity IS project context. Naming system: CLI `ctx`
(install / doctor / guide / mcp / run <cmd> / recall <handle>), MCP server `ctx` (clean-verb tools
per P19: context/search/node/callers/remember), env `CONTEXA_HOME`, data dir `~/.contexa/`, human surface
`ctx guide` (codeguide subsumed), hook rewrite target `ctx run <cmd>`. Design vocabulary switches
to Contexa/`ctx` immediately; code/path/package migration = Implementation dependency (`tk` stays a compat
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

**P23 — CONTEXA-DESIGN.md forks resolved.** `[2026-07-03]` FORK-1: **guide stays strictly read-only**
(D9/D28 stance unchanged — "why should guide write?"); memory confirm/retire and push pin/veto are
CLI operations (`ctx memory confirm|retire`, `ctx push pin|veto`) + JSONC control-file edits; the
Knowledge page displays state and surfaces the commands. FORK-2: importer credentials are
**user-provided** (env vars / 0600 JSONC config; no OS-keychain integration). FORK-3: `context()`
gets its **own lean default budget** (≈ smallest tier, expansion handles; numbers
measurement-gated). FORK-4: PR-discussion extraction = **thread text as searchable nodes;
decision-node promotion only via explicit markers or On-demand LLM (Inferred)**. Design document
`CONTEXA-DESIGN.md` is now fork-free.

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
- ⑥ **Mining round completed same day** → `CONTEXA-IMPL.md` (implementation design + absorption
  register). Maintainer stance on absorbed material: **license flags ignored entirely; all
  reference code is reference, not gold standard** — adapt/rewrite freely, our design wins on
  any disagreement.

**P26 — Build route = optimal path from the product definition; current state and reference
trajectories are NOT route inputs.** `[2026-07-03]` Maintainer directive + ratifications:
- Route inputs are the product discussion (P15–P25) only. Explicitly excluded: the existing tk
  codebase/compressor, the June contract's slice DAG (#72–#84), and reference projects' build
  paths (the old S-order's "code source first" was codegraph inertia — rejected).
- **Route = M1 base speaks → M2 code joins → M3 guide → M4 importers → M5 hardening**
  (`CONTEXA-IMPL.md` §9). M1 ships the full serving surface (3 tools + push) over the three cheap
  deterministic sources (memory, git history, docs/decisions) with the FULL selection pipeline.
- Ratified A: **code structure waits until M2** — no M1 source depends on tree-sitter; cost
  accepted (file-level touches/anchors during M1). Ratified B: **guide lands at M3**, after
  code joins (biography page needs full content).
- **Compressor absorption = adjacent track**, any time after M1, never on the critical path;
  `ctx` packages are greenfield — no imports from, waiting on, or migration of the tk tree in
  M1–M5.

**P27 — Scope guard: Contexa serves context only; the review/verification moment is not a product
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
  (CONTEXA-IMPL had `init`; CONTEXA-DESIGN §8 always said `install`).
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
  CONTEXA-IMPL §5.6/§7.
- ④ Push auto-rank is NOT a blocker: P21 already ratified the factors; initial weights =
  `constants.ts`, measurement-gated (the design-brief §4 "open" flag is stale).
- ⑤ **M1 spec addenda written into CONTEXA-IMPL §9**: Store interface + SourceAdapter engine pinned
  to 1b; envelope = typed struct rendered last; facet table; `.contexa/push.jsonc` schema; docs
  classification rule; 3-of-5 stale classes in M1; acceptance vs generic MCP stdio fixture;
  remember() validation; pre-milestone verb stubs; shard-key/migration conventions.
- ⑥ Carried-but-unrestated items restored into CONTEXA-IMPL: D32 generation-identity tuple (§2),
  D13 ignore-set (§4), D22 `assertNoEgress()` (§7), plus a **legacy read-back map** (§12) for
  D4/D16/D20/D19/D23/G/J/K specs that live only in the June corpus.
- ⑦ **docs/codemap dispositions applied** — layered over a same-night unrequested rename pass
  (likely a sub-agent of the disposition audit; contract→DESIGN.md,
  action-plan→IMPLEMENTATION.md, runbook→RUNBOOK.md, research/prompts→`archive/`; kept — git
  tracks the renames — but it did NOT absorb ctx and its new README wrongly called the June
  contract "binding"): AUTHORITY NOTE prepended to README.md; AMENDED-OVERLAY banner on
  DESIGN.md pointing to CONTEXA-DESIGN §9; SUPERSEDED banners on IMPLEMENTATION.md, RUNBOOK.md,
  archive/prompts/codegraph-build-loop-goal.md, impl/schema-draft.sql, impl/A, impl/F (tool
  surface), impl/C (DDL), impl/E (catch-up bands), impl/I (wiki.json), A3 (ranking stance),
  A4 (tool surface). Mechanism chapters (B/D/E/G/J/K/L/M, 00-sources, A1/A2) remain
  REFERENCE-CARRIED.
- Standing reminder riding along: **G2 record-only baseline BEFORE any internal rollout** (P27
  review) — gates rollout, not build.

**P29 — Documentation strategy = reference-not-copy across doc layers.** `[2026-07-04]`
Maintainer: do NOT duplicate the June corpus into the Contexa docs — the original design keeps its
detail. Layering: **CONTEXA-DESIGN / CONTEXA-IMPL = decision + route layer** (what changed, contract
deltas, build route; stays lean); **`docs/codemap/` = permanent detail layer** (`DESIGN.md` =
authoritative text of every carried D-item — no "restate until absorbed" trajectory;
`IMPLEMENTATION.md` = live index into `impl/`; `impl/` = implementation dossiers). Mechanism =
CONTEXA-IMPL §12 read-back map + inline pointers; P28's three one-line restatements (D32 tuple,
D13 ignore-set, D22 assertNoEgress) are pointer-with-gist and are the ceiling, not a pattern to
continue. `RUNBOOK.md`'s per-slice workflow discipline (green-before-next; priorities
correctness > completeness > verifiability > token) is carried as the M1–M5 method template —
only the #59–#84 ordering is retired. P28 ⑦ banners re-worded to match.

**P30 — M1 execution model = single-track foundation + dual-track slices with comparative
review.** `[2026-07-04]` Foundation (1a→1b) is built once (Opus subagent, `m1/foundation`) — it
pins the shared Store/SourceAdapter contract. Every subsequent M1 slice is implemented TWICE,
independently: Opus subagent (`m1/<slice>-opus`) and Codex CLI (GPT-5.5-codex medium,
`m1/<slice>-codex`), both off latest `feat/1.0.0`, with a strict no-cross-reading independence
rule. Reviewer (Fable) compares both against `docs/build/M1-ACCEPTANCE.md` + code quality,
merges the winner, may graft runner-up pieces (attributed); runner-up branch kept until the
slice closes. Supersedes the P28-era split-assignment ledger in `docs/build/M1-GOAL-PROMPT.md`.

**P31 — memory ownership/sync = file-backed, git-as-sync, unified event model.** `[2026-07-05]`
Maintainer adopts **B1**: durable memory (and concepts, C3) leave the store as source of truth and
move into committed `.contexa/` files; `store.sqlite` becomes a rebuildable, gitignored index; **git is
the sync/collaboration layer**. The load-bearing frame is a **unified event model** — every write
(`remember`, host import, a lifecycle verb, a conflict resolution) is an immutable event landing in
exactly one of three zones (① committed Mainline log · ② personal overlay · ③ external snapshot);
status is a deterministic fold over events in total order `(timestamp, ULID)`, never a mutable
column. Conflicts follow the **three-layer model (E1)**: textual = git (bytes only, `merge=union`);
identity = dedup at reindex; semantic = contradiction filed at the post-merge reindex reconcile,
human-resolved via the committed decision log — git is never the semantic surface. Two new
invariants: **E3** committed = human-authored **or** human-confirmed (auto-generated content lands in
the overlay as `needs-review` until a human confirms); **E4** a deterministic secret-shaped guard
runs before the committed zone (success-shaped refusal, no LLM/network). Execution: **no dual-track
(supersedes P30 for this line)** — Opus implements every slice single-track, reviewed jointly by
Fable + Codex. Full E-group (E1–E8) + the A/B/C/D rulings live in
`docs/build/MEMORY-DECISIONS.md` (SoT); settled mechanics in `docs/build/MEMORY-SYNC-SETTLEMENTS.md`;
work order in `docs/build/MEMORY-SYNC-GOAL-PROMPT.md`. Reconciled across VISION invariant 3,
CONTEXA-DESIGN §2/§3/§6/§8/§9, CONTEXA-IMPL §2/§5.6/§7, REPORT-canonical Decision 11.

**P32 — Measurement design ratified after grilling (MEASUREMENT-DESIGN.md, Q1–Q17).** `[2026-07-06]`
All committed recommendations confirmed by the maintainer: **B arm = pull+push** (product default;
channel ablation in R2 separates them); **contamination freeze = full time-cut environment
including R1** (repo history truncated at fix-parent + ctx store/memory/config filtered to
source-timestamp < T); **acceptance commands hand-authored** from real fix commits, audited once;
**R1→R2 gate = four joint conditions** (pass_B≥pass_A on ≥8/10 · median paired Δ>0 · 90% bootstrap
CI excludes 0 · total-input not ballooned); **R2 keeps the 30% held-out headline set** and **adds
arm C (ctx tools present, store empty)**; **R2 budget pre-approved ≈$2–5k** at fixed N=40/repo,
single look, null reported as "not detectable at N=40"; **R3 = spec now, build post-R2**. New
**Q17 (bank-shortfall fallback): smaller N + post-authored acceptance tests** (written from the fix
commit only, never reading the ctx store), never rewritten-from-git prompts — prompt authenticity
is a narrative asset. Q1/Q3/Q4/Q6/Q7/Q8/Q10/Q16 passed as-written (no contest space). Landscape
sweep (collector, `docs/design/measurement/landscape-measurement-methods-20260706.md`): no
comparable tool publishes a correctness-gated token measurement — only academic papers (SWE-Pruner,
FastContext, Codebase-Memory) pair savings with success rates; Codebase-Memory's 10×-savings-at-9pt-
quality-cost is the live case for the M2 guardrail.

**P33 — Product converged into ONE system; `PRODUCT-DESIGN.md` ratified as final authority (LAW).** `[2026-07-10]`
Four derivation rounds (three sealed zero-base: Fable "Cairn", Opus-max "Keystone", GPT-5.6 "Change
Case Compiler"; plus one context-loaded audit — NOT independent) converged; maintainer ratified
`PRODUCT-DESIGN.md` at repo root: one decision-moment evidence compiler, one claim contract, two
evidence facets (`ctx` = local, Atlas = organization). Supersedes `reports/product-future-direction.md`'s
two-product split (a resource artifact, not a design conclusion; its experiment gates absorbed).
Architecture rulings **R1–R6**: one system/one contract (3:0); on-demand compilation, indexes = TTL
accelerators never truth (2:1); zero-material-false-reassurance guardrail + precision-first (2:1);
thin client, no resident daemon (2:1, matches 0.3.2 field decision); read-only by construction;
agents first-class under the same ACLs. Also supersedes VISION.md's DCI/CodeWiki/Projection framing
(VISION.md rewritten as pointer); `reports/change-evidence-roadmap-analysis.md` archived — its
change-as-primary-object thesis survives inside the contract (artifacts keyed to immutable change
state). Evidence trail: `reports/derivation-comparison-r1.md`.

**P34 — P3 ownership ruled: layered authority via claim classification; accuracy thresholds = calibration outputs.** `[2026-07-10]`
Authority-class questions (who can approve / owner of record / applicable policy) answered ONLY from
`DECLARED`/`OBSERVED` claims in governance-designated authoritative sources (signed
authority-by-claim-type matrix). Behavioral `INFERRED` evidence (review/fix recency) produces
suggestions only — labeled with derivation, reason, age — never promotable to authority answers. No
qualifying claim → abstain + escalation path; layer conflicts displayed side by side, never
flattened. Numeric precision/recall bars are pre-registered calibration outputs of the backtest
stage, not design inputs; changing a threshold after results are visible is forbidden.

**P35 — Validation-ladder kill scopes ruled; LAW self-contradictions fixed (found by `reports/product-direction-convergence.md` audit).** `[2026-07-10]`
Stage 1 (Codex Wizard-of-Oz, ~12 real PRs, source-backed coverage + zero material false reassurance)
failure kills the **whole compiled-artifact shape**; only the local continuity pilot survives on its
own gate (its evidence is `OBSERVED` at the command boundary, not compiled from org sources).
Stage 2 (Fable/Opus impact backtest, ~100–150 historical PRs) failure demotes **P2/Artifact 2 only**
(declared edges + everything-else-DARK). Amends **P27**: verification *evidence* is in scope as an
artifact; correctness *judgment* stays out. LAW §0 corrected: "three sealed independent derivations
plus one context-loaded audit" (Run D not independent). Dead `CTX-DESIGN/CTX-IMPL` references fixed
to `CONTEXA-*`.

**P36 — Registers reconciled to LAW; Drift Register adopted; M-plan v2 proposed; landed by maintainer instruction.** `[2026-07-10]`
Design-reconciliation round (work order `docs/build/DESIGN-RECONCILE-GOAL-PROMPT.md`): 6 sonnet
collectors → 6 opus drift analysts → Fable synthesis/arbitration → Codex gpt-5.6-sol ultra Gate A
(2 substantive rounds: 16 + 7 findings, ALL integrated; round-3 verification and Gate B delegated
to the maintainer — prompt at `docs/build/CODEX-GATE-B-REVIEW-PROMPT.md` — after a quota limit,
per the maintainer's "先落" instruction). New root `CONTEXA-DESIGN.md` / `CONTEXA-IMPL.md` replace
the 2026-07-03 registers (archived `docs/archive/CONTEXA-*-20260703.md` with banners). Drift
Register (32 findings, revision 3) = CONTEXA-IMPL Appendix A, NORMATIVE over the analyst files.
Route = M-plan v2 (gate-first): keep+retrofit M1/M2 (R-slice "claim-serving integrity" = DR-01/02/
03/04/05/06/07/10/12/27d/31/32, precondition for serving factual claims), RETIRE M3 guide +
projection kernel (proposed, LAW art. 1), re-scope M4 (receipted on-demand connectors, breadth
gated V1/V2) + M5 (measurement + wedge perf), insert V0 (freeze O-22 WoZ protocol) → V1 → V2 → V3
+ FP-L/FP-O facet pilots. Serve staging: pre-V1 containment (sole carve-out = O-14 measurement +
maintainer dogfooding, itself pending confirmation); V3 = first live-host stage; distribution
unauthorized pre-V3. Notable Gate-A catches: summarizeBuild heuristic success verdict (R3 defect,
O-23), worktree-shared shard × single-int generation (DR-06), push-block uncited gotchas (DR-32).
**Maintainer batch of 9 rulings OPEN as O-31** — landing does not pre-decide them.

**P37 — Maintainer batch ruled (9/9); M3 recast not retired; LAW art. 1 clarified (§11).** `[2026-07-10]`
Rulings on the O-31 batch, after a challenge round (Fable argued retirement; maintainer clarified
the intent was never a standing site):
- **①(M3) REJECTED retirement — RECAST**: `ctx guide` = on-demand, runtime-created, LOCAL,
  read-only render surface over the local facet's own cited claims; full function set retained
  (inspection/review queue/graph state, entity/code paths, overview, history, decisions) plus
  decision-artifact rendering — the Impact-Set (blast radius) visualization page ships only WITH
  Artifact 2 (its §8 gate). Obligations: §3 claim envelope at every render (DR-07/31), accelerator
  disclosure on unvalidated inferred content (DR-01), G-provenance upgraded to §3 (DR-17);
  G-readonly/loopback/profile-budget carry. Scheduling: after the R-slice; work-order re-scope =
  O-25. LAW amended (§11). Evidence shape recorded honestly: the three sealed derivations render
  impact as tiered TEXT into existing surfaces (no sealed run endorses a graph UI; C7 collector,
  scratchpad); the ruling rests on maintainer authority + the repo's own absorption lineage
  (ADR-0038/0039 React Flow+ELK codeguide; GitNexus one-backend-three-frontends; UA graph-UX) —
  landscape corpus contains NO adoption/decay data either way. DR-14/15/16 rows in the Drift
  Register stand as audit history, OVERRIDDEN by this entry.
- **② MCP carve-out CONFIRMED**: pre-V1 the greenfield MCP serves only O-14 measurement +
  maintainer dogfooding; no distribution/auto-install/trust framing; §8 staging governs.
- **③ R-slice timing = after the Gate-B review** ("等 review").
- **④ M4 connectors: last, or batched with locally-verifiable carriers first** (e.g. GitHub
  commit history); breadth still gated V1/V2 (DR-23 shape unchanged).
- **⑤ §9 boundary acknowledged** (utility maintained regardless; expansion FP-L-gated).
- **⑥ V1 truth panel = maintainer + Claude + Codex** (heterogeneous models + the human owner;
  V0 protocol must state the independence limits of a self-adjudicated panel).
- **⑦ Serial: R1 first, then V0 — but the measurement is to be REDESIGNED before finishing**
  (existing grid results — sonnet HOLD, codex 100% void — do not simply get committed; O-14
  updated).
- **⑧ valid_from/valid_to: EQUIVALENT-SCHEME** (as-of recompute path, not necessarily wiring the
  columns); served_count/last_served cut stands (DR-09).
- **⑨ summarizeBuild fix (O-23): scheduled EARLY.**
- **Refinements ruled same day (follow-up round):** (a) ⑥ panel independence CONFIRMED — V0
  protocol must encode: operator≠adjudicator (isolated sessions, adjudicator blind to operator
  reasoning), Codex as heterogeneous vote, pre-registered scoring rubric, and an honest
  self-adjudicated-panel limitation note; (b) ⑦ measurement redesign gets its OWN design round
  producing "measurement design v2" (explicitly lists which P32 parts it supersedes + disposition
  of the uncommitted tools/measurement protocol scripts) — HOW to design it = next conversation;
  (c) serial RELAXED: V0 protocol drafting may proceed IN PARALLEL with the measurement redesign
  (V1 execution still waits for both); (d) ④ clarified: first M4 batch = deepen git-LOCAL
  carriers, GitHub-API connectors later.

## Open

- **O1 / O2** (pack §9) — value metric & joint story: partially reshaped by P15 (measurement is
  post-feature); protocol pieces decided in P14; final form open.
- ~~Push curation policy~~ — **ratified by P21** (auto-rank, pin/veto only, no confirmation gate).
- "gist stories" / "conference" precise definitions — provisional readings: user-story-type
  documents / Confluence-or-meeting-notes-type documents.
