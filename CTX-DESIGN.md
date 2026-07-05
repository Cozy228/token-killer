# ctx — Design Document

> **Status: design-step output** per `docs/design/FABLE-DESIGN-BRIEF.md` (v2). Decisions P9–P22 live in
> `FABLE-DECISION-LOG.md`; the June codemap contract (`feat/1.0.0`, D1–D33 / ADR 0017–0040) is
> amended per §9 and otherwise carried. Terminology Law applies throughout: every capability has
> exactly one capability state; fact-authority tiers (Observed/Derived/Inferred/Confirmed) are
> orthogonal to build order; "Implementation dependency" = code build order only.
> All forks raised during design were resolved by the maintainer (P23; see §10).
> **P25 amendments applied 2026-07-03**: index-not-copy store (§3), 3-tool surface (§4),
> push fixed header (§4); techniques adopted directly, sequenced by Implementation dependency
> only; guide page set unshrunk.

---

## 1. Product Definition (P15)

> "产品的目的是给人和 AI agent 提供本地的、有效的、正确的上下文。这个上下文包括 memory、
> stories、会议/文档类内容、GitHub commit history、decision history、代码的 code map / AST /
> 代码图——所有本地的、项目相关的上下文。"

**ctx is a developer-local context engineering tool**: the project's local context base. Four
functions:

| Function | What it means |
|---|---|
| **Acquire 采集** | Ingest every project-local context source (§2). The compressor's hook position doubles as a live capture tap. |
| **Verify 鉴真** | One store where every fact carries source / authority / freshness; conflicts between sources/carriers are **surfaced, never averaged** (§3, §4). |
| **Serve 供应** | The right slice at the right size, to both audiences: agents (pull tools + push digest), humans (`ctx guide`) (§4, §6). |
| **Refresh 保鲜** | Per-source incremental freshness + continuous capture of newly created context (§5 freshness column, §2 memory). |

Corollaries (fixed): context **breadth** is the center; token efficiency is a supporting
discipline; features before measurement (P15②); non-code context is first-class; business logic
is a **derived view**, never an ingested source; the moat: **context belongs to the project, not
the assistant vendor** — all agents share one base.

**Project context, not assistant memory (the moat, sharpened).** Every AI coding tool builds a
memory; almost all build the *assistant's* memory — private, adaptive, vendor-owned, left behind when
you switch tools. ctx builds the *project's* context, owned by the project: a project fact (why we
chose this, what bit us, a decision, the code map) is a property of the project, not of whichever
assistant happened to observe it, so it belongs with the code — committed, reviewable, surviving tool
and staff changes, read by every agent and human from one base. This single choice forks the design
downstream: because the base is authoritative and shared (not a disposable per-agent scratchpad) it
must be **trustworthy, not merely adaptive** — deterministic over probabilistic, provenance over
recall, conflicts surfaced over silently merged, local over egressed. Assistant-memory products can be
lossy, model-rewritten, and vendor-locked precisely because their memory is low-stakes and private;
ctx cannot, because it is the project's system of record for context. (Consequence for memory storage
+ multi-user sync: `docs/build/MEMORY-DECISIONS.md`, §3/§8 below.)

**Identity**: product/CLI/MCP name = `ctx` (P20). Core = a TypeScript library + on-disk store;
CLI is installer/bootstrap/fallback, not the product (P16). Node ≥22.5, `node:sqlite` (P10/P28).

## 2. Source Model (P22): Content Types × Carriers

Primary axis = **content types** (product semantics, all Required). Secondary axis = **carriers**
(presence = Optional at runtime; absence degrades disclosed coverage, never the type's existence —
the SCIP pattern generalized).

| # | Content type | Carriers |
|---|---|---|
| 1 | **Code structure** | tree-sitter tier-1 (always; D23 language set) · SCIP (`index.scip` when present; D16) |
| 2 | **Change history** | local git (commits/diff/blame/rename chains — always) · GitHub PR/issue (credentialed carrier) |
| 3 | **Decisions** | ADR/design docs (local files) · commit messages (git) · PR discussions (GitHub) · Jira (credentialed) · meeting recaps (import) |
| 4 | **Requirements / stories** | local requirement docs · Jira stories |
| 5 | **Domain / doc knowledge** | local docs & glossaries · Confluence imports · meeting recaps |
| 6 | **Memory / experience** | `remember()` writes · host-memory imports (Claude Code / Codex / Copilot) · human notes |

Carrier↔type is **many-to-many** through extractors: a carrier adapter fetches raw records; per-type
extractors emit typed facts with `provenance{carrier, locus}`. One carrier feeds several types
(git → history + decisions; Jira → decisions + stories).

**Network boundary (invariant)**: ctx never sends project context out. Network carriers are
**ingress-only**: user-credentialed, explicitly triggered (`ctx import <carrier>`), stored as
dated local snapshots; snapshot age = that carrier's freshness.

## 3. Store & Schema

One engine (`node:sqlite` + FTS5), one per-project shard. **Index-not-copy (P25①)**: for local
carriers the store holds locators + extracted facts + links, never payload copies — the
authoritative bytes stay in git/files and are read back at serve time (kills the "store copy went
stale" failure class; shrinks the store an order of magnitude). Network carriers keep dated
snapshots — the snapshot IS their local source.

```
~/.ctx/projects/<repo-shard>/
  store.sqlite     # the context base (all six content types + links + claims + memory)
  ledgers.sqlite   # compressor ledgers (hot-path isolation; §7)
  raw/             # recovery snapshots (unchanged)
  snapshots/       # dated carrier imports (jira/confluence/github)
```

`store.sqlite` tables — contract D18's tiers aligned to the two-axis model:

- **`nodes`** `(id, kind, name, locator, content_hash, source_revision, attrs, …)`
  — kinds: `symbol · file · module · commit · pr · issue · adr · doc_section · story ·
  meeting · memory_entry · concept(derived)`. All six content types materialize as node kinds in
  **one table** — cross-source joins and FTS come free. **No `text` payload column (P25①)**:
  `locator` (path+span / git oid / snapshot ref) is how serve-time read-through fetches the
  authoritative bytes; `content_hash` is the staleness check. (Exception: `memory_entry` gist
  and derived `concept` text live in the store — the store IS their source of truth.)
- **`edges`** `(from, to, predicate, method?, confidence, provenance, freshness, decision_id?)`
  — structural predicates (Observed, from data itself: `calls · imports · contains · touches ·
  authored · supersedes-by-frontmatter`) and **link predicates** (the link layer: `references ·
  fixes · amends · sameAsCandidate · conflictsWith`), distinguished by `method`
  (`explicit-key | path-match | symbol-match | rename-tracked | semantic-proposal`).
- **`fact_claims`** (append-only) + **`arbitration_decisions`/`decision_claims`** — retained per
  D18. Jurisdiction (redistributed per §9-D6): same-predicate overlaps — multiple carriers
  asserting the same fact within a content type, and tree-sitter×SCIP identity when SCIP is
  present. Single-carrier facts skip arbitration (claim → edge directly, provenance intact).
- **`identity_bindings`**, **`dependency_index`** — the reverse index now spans **cross-source
  links**: when either endpoint of a link changes, the link is flagged for re-verification (this
  is how memory anchoring and stale-doc detection ride the code source's invalidation machinery).
- **`memory_meta`** `(node_id, gist, detail?, authority, status, origin, session_ref?, usage…)` —
  memory entries are nodes (`kind=memory_entry`) plus this lifecycle table (P21 fields).
- **`generations`** — per-source generation counters + one published-generation pointer; atomic
  publish, short read transactions (D32 unchanged).
- **FTS5** — one **contentless (external-content) virtual table** over node names + text across
  ALL kinds: cross-source lexical search is a single index; match → `locator` read-through for
  the actual text (P25①). Index rebuild rides each source's incremental ingest.

**Freshness column semantics per source** (one vocabulary, per-source policy):
git history = immutable (never stale); docs/ADR = mtime + supersession chains; imports =
snapshot date; memory = anchored aging (P21); code = revision/invalidation + RECONCILING (D25).

**Refresh trigger model (P24): D25 generalized to all local sources.** Query time runs a cheap
per-source dirty check (git: stored tip vs HEAD; docs/ADR: mtime scan; memory: fresh at write)
within the refresh budget; over budget → serve the previous generation marked RECONCILING. Cold
paths (`ctx install/doctor`, guide launch) do full catch-up. Network-carrier snapshots refresh
only on explicit `ctx import`. No resident process; coordination = the D32 lease + per-source
generation counters.

## 4. Ranking & Serving

**Selection** (D13 generalized): lexical seeds across all kinds (FTS5 + identifier normalization +
D14's vocabulary bridge, which now has real donors — docs/stories/jira feed L3) → expansion along
structural edges AND link edges → query-local PPR on the cross-source subgraph. **Time decay
applies to history/memory kinds only, never code.** Confidence stays a soft factor (D26) —
including link edges and memory entries; the only hard filter remains explicit user evidence-policy.

**Projection**: hard budget ceilings, per-section caps with marginal-utility borrowing, envelope
`{coverage, omitted counts + handles, freshness per section, basis}` on every response; no silent
truncation (contract §9 machinery, unchanged).

**Agent tools** (P18/P19 as amended by P25② — three, clean verbs, host-namespaced):

| Tool | Contract |
|---|---|
| `context(ref \| task \| handle, budget?)` | The one-stop entry (absorbs `explore`, `node`, `callers`). ref mode: entity → composite brief. task mode: NL → seeds → 3–8 anchors → same path. **handle mode: a handle from any previous response → drill-down** (callers/callees, full diff, full doc text, memory detail — the handle encodes entity + expansion facet). Sections: subject / code / decisions / history / memory / **conflicts** (always shown when answer-relevant, not budget-squeezable) / envelope. Empty sections are omitted, never templated. Every item carries a handle. |
| `search(query, kinds?)` | Cross-source lexical+cascade search; kind-filterable. |
| `remember(note, anchors?, supersedes?)` | The only write path → memory entry (P21 lifecycle). |

Split-out navigation tools (`node/callers`) and single-source tools (`why/history/knowledge`) stay
behind the ablation arm; promotion into the default set is evidence-gated (D17's own rule).

**Push** (P16/P17/P21 as amended by P25③): a **fixed two-line header + curated memory digest** —
the header advertises the context base and the `context()` entry (the affordance advertisement is
the floor's highest-value bytes); gists are auto-ranked (authority × usage ×
recency × anchor-freshness), top-N within a ≤1KB hard budget (header included), each entry with a handle; human
controls = pin/veto in the project JSONC control file. Per-host adapters decide the mechanism:
managed block in the host's auto-loaded instruction file (universal fallback; guard-wrapped,
excluded from ingestion — echo prevention) or dynamic session-start injection where the host
supports it. Refresh on cold paths (`ctx install/doctor/import`, guide launch) + opt-in git hook.

## 5. Extractors per Content Type

Shared discipline: **extract only what is provable from structure** (front-matter, headings, code
fences, explicit keys, diffs); anything semantic is On-demand host-LLM output marked Inferred
(D5/D22 unchanged). Every fact: `provenance{carrier, locus}`, authority tier, freshness.

| Type | Extractor essentials |
|---|---|
| **Code** | Carried from the contract unchanged: tree-sitter tier-1 captures (D23), SCIP streaming consumer when present (D16), Structural Execution (entry points, call chains). CFG / def-use / dispatch-effect keep their bounded IR spec (D4) but sit **after** non-code sources in Implementation dependency order (P15③). |
| **Change history** | `git log`/diff/blame → commit nodes, `touches` edges (symbol-level where diff hunks resolve, file-level otherwise), rename chains, authorship; change-coupling from co-change statistics over a configurable window (default: recent window, not whole history — cost control, window disclosed). Incremental = new commits only; immutable facts. |
| **Decisions** | ADR/design docs: front-matter + heading parse → decision nodes (title, status, date); amendment references → `amends/supersedes` edges (explicit-key class). Commit messages: trailers and issue keys → `references/fixes`. PR discussions (GitHub carrier): thread text stored as `doc_section` nodes (Observed text); **decision-node promotion only via explicit markers or On-demand LLM proposal (Inferred)** — no silent narrative extraction. Meeting recaps enter via file import. |
| **Stories** | Jira importer: story/epic issues → story nodes (key, title, status, description text); explicit keys link to commits/PRs. Local requirement docs parsed like decisions docs. |
| **Domain/doc knowledge** | Local docs: glossary/definition extraction (deterministic patterns only), doc sections as searchable nodes; Confluence import → same shape, snapshot-dated. |
| **Memory** | P21: `remember()` + host-memory importers (echo exclusion, project-scope filter, cross-host dedup via `sameAsCandidate`) + human notes (Confirmed). |

**Importer framework** (network carriers): `ctx import jira|confluence|github` — explicit,
user-credentialed, incremental snapshot to `snapshots/`, extraction runs on local snapshot;
provenance records carrier + fetch time.

## 6. Human Surface: `ctx guide`

Stack and delivery carried from D28/D29/D31 (one web app, Live serve on loopback + Snapshot
export, React Flow + ELK, system browser, VS Code deep-links). **Page set amended** (supersedes
the four-inspector composition, which served the retired layer model):

| Page | Content |
|---|---|
| **Overview** | Repo map, per-source coverage/freshness status, carrier presence. |
| **Entity Biography** (the flagship) | One entity's full story: code (signature, relations) + linked decisions + change history + memory entries + conflicts — the human twin of `context()`. |
| **Decisions** | Timeline with supersession chains, source badges (adr/pr/jira/meeting), links into code. |
| **History** | Hot areas, change-coupling clusters, recent activity. |
| **Knowledge** | Memory browser + **review queue** (needs-review entries, displayed with their `ctx memory confirm|retire <id>` commands) + push pin/veto state + **stale references list** (unresolved mentions = dead doc links, the free 鉴真 win). |
| **Search** | Cross-source, kind-filtered. |

Evidence drawer retained (per-fact provenance/authority/freshness on demand). **Guide is strictly
read-only** (D9/D28 stance unchanged; P23): memory lifecycle actions and push curation are CLI
operations (`ctx memory confirm|retire <id>`, `ctx push pin|veto <id>`) plus JSONC control-file
edits — the guide displays state and surfaces the commands, it never writes.

## 7. Compressor Integration

Role per P15: efficiency discipline + capture tap — a subsystem, not the center.

- **Delivery unchanged** (P11): hook rewrite keeps the spawn shape; rewrite target becomes
  `ctx run <cmd>` when the rename lands (Implementation dependency; `tk` stays a compat alias,
  `TOKEN_KILLER_HOME` read-only fallback).
- **Handlers → shapers**: handlers keep command knowledge (what is evidence, what is droppable);
  budget/envelope decisions move into the shared projection engine so compressor output and
  `context()` responses carry the same envelope. Independent refactor, low priority.
- **Ledgers** migrate jsonl → `ledgers.sqlite` (P10); read-side never-summed invariant
  regression-tested across migration. Separate file from `store.sqlite` isolates hot-path writes.
- **Session dedup**: HIT responses gain handles (recall-backed); TTL relaxation is
  measurement-gated.
- **Known fix rides along**: `--raw` → `stdio:"inherit"`.
- **Capture tap**: command outputs stay session-scoped (raw store, recovery) — they are NOT
  project knowledge; the tap's contribution to the base is provenance (`sessionRef`) for
  memory entries created during a session.

## 8. Process & Delivery Model

Carried: core = in-process library over shared SQLite WAL, DB-backed lease for reconcile,
atomic generation publish (D32); asymmetric adapters — `ctx mcp` (host-neutral stdio) + VS Code
extension (Copilot-managed, LM Tool API) (D19); guide = loopback web app in the system browser
(D28/D29); one repo, one product, installed once (D33 minus the version gate). CLI surface:
`ctx install · doctor · guide · mcp · run <cmd> · recall <handle> · import <carrier> ·
sync (explicit warm-up, D25) · memory confirm|retire <id> · push pin|veto <id>` (the last two
per FORK-1/P23 — guide surfaces them, CLI executes).
Distribution: private npm registry (P13); engines ≥22.5 (P10/P28); signing stays artifact-gated (D20).
Solo-first collaboration stance unchanged (D27): sharing via git (`.ctx/` project files, snapshot
exports); no team/permission layer.

## 9. Contract Amendments Register (June contract → this design)

| Contract item | Disposition |
|---|---|
| **D3** four-layers-all-Required | **Restructured** → content types × carriers (§2). Code Graph = content type 1. Domain layer dissolved into types 3/4/5 (its deterministic-core discipline survives verbatim). Evidence layer promoted to cross-source 鉴真 machinery (§3). Behavior split: Structural Execution stays with code; CFG/def-use/dispatch = bounded spec (D4), Implementation dependency after non-code sources. |
| **D17** 4 tools + QueryPlan | **Amended** by P18/P19: `context` absorbs `explore`; surface = context/search/node/callers/remember; single-source tools evidence-gated. QueryPlan internals unchanged. |
| **D21③** CommandProxyResident Required | **Outside current product scope** (P11). D21①② unchanged. |
| **D33** CLI hub + Node capability gate | **Amended**: gate retired (P10); "hub must be CLI" → CLI = installer/bootstrap/fallback; core = library (P16). Single repo/product unchanged. |
| **D5 / D6** | **Jurisdiction redistributed**: D5's static-only-provable + On-demand promotion discipline now governs all extractors (§5); D6's predicate-specific authority extends to carrier-specific authority within content types. |
| **D28/D9** codeguide composition | **Page set amended** (§6); read-only stance **unchanged** (P23/FORK-1). Stack (D31), delivery (D28/D29) carried. |
| **D1** | Clarified: agent memory capture (`remember()`) ≠ wiki authoring; the latter stays Outside current product scope. |
| **D24** | Premise changed by P9 (internal distribution); maintainer dismissed re-audit (O3) — recorded as maintainer decision. |
| **Everything else** (D2, D4, D7, D8, D10–D16, D18–D20, D22, D23, D25–D27, D30–D32) | **Carried**, with the generalizations noted in §3–§5 (cascade across sources, time decay for history/memory, arbitration jurisdiction). |

**New sections with no June counterpart**: link layer (§3 edges + three-tier rules), memory
source (P21, §5), push channel (P16/P17, §4), ingress-only importer boundary (§2, §5).

## 10. Forks — RESOLVED (P23, 2026-07-03)

1. **FORK-1 → guide strictly read-only.** Memory confirm/retire and push pin/veto are CLI
   operations + JSONC control-file edits; the guide displays state and surfaces commands (§6).
2. **FORK-2 → importer credentials are user-provided**: env vars / 0600 JSONC config; no
   OS-keychain integration.
3. **FORK-3 → `context()` has its own lean default budget** (≈ smallest tier, expansion
   handles); exact numbers measurement-gated.
4. **FORK-4 → PR threads stored as searchable text nodes**; decision-node promotion only via
   explicit markers or On-demand LLM proposals (Inferred).
