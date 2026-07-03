# Design Brief for Fable — the Developer-Local Context Engineering Tool (v2)

> **What this is.** The handoff/governing document for the **design step**. Rewritten 2026-07-03:
> the original (2026-07-02) brief assumed a direction would be picked from the Direction
> Analysis's candidate paths; what actually happened is the maintainer defined the product center
> directly (P15, below), several framings were tried and withdrawn, and the design conversation
> converged through discussion. **The design document itself has NOT been requested yet** — the
> maintainer said "先不要落成文档,继续讨论". This brief governs the moment the maintainer asks
> for the document; until then, work in discussion mode (one sharp question/topic per turn).

---

## 0. Required reading (in order)

1. **`FABLE-DECISION-LOG.md`** — the running decision log (P9–P17 + Open). **Most recent, most
   binding.** All new decisions go HERE, never into the pack.
2. **`PROJECT-CONTEXT-PACK.md`** — the factual snapshot of the project as of 2026-07-02
   (P1–P8, O1/O2). **Frozen — do not append or edit.**
3. **`feat/1.0.0` codemap contract** (`git show feat/1.0.0:docs/codemap/codemap-contract.md`,
   D1–D33 / ADR 0017–0040) + impl slices A–M. This is the existing design for the **code
   source**; per P15 it is being **restructured, not discarded** (layers-on-code → sources-over-
   one-store; see §3). Its store/provenance/ranking/freshness machinery largely survives.
4. **Archives — do not build on these** (kept for traceability only):
   `FABLE-DIRECTION-ANALYSIS.md` (partially superseded), `FABLE-UNIFIED-DESIGN.md` (on hold;
   assumed the voided P12), `FABLE-CONTEXT-PORT-DESIGN.md` (withdrawn; misread the product
   center — though its envelope/store seams survive as reference material).

## 1. The governing product definition (P15 — firm, in the maintainer's own words)

> "产品的目的是给人和 AI agent 提供本地的、有效的、正确的上下文。这个上下文包括 memory、
> stories、会议/文档类内容、GitHub commit history、decision history、代码的 code map / AST /
> 代码图——所有本地的、项目相关的上下文。"

**This is a developer-local context engineering tool.** From first principles its four functions:

| 职能 | 内容 |
|---|---|
| **采集 Acquire** | Every project-local context source: code (AST/graph), git commit history, decision history (ADR/docs), stories/requirements, Jira-type imports, memory. The compressor's hook position doubles as a live capture tap. |
| **鉴真 Verify** | One store where every fact carries source / authority (Observed·Derived·Inferred·Confirmed) / freshness; **conflicts between sources are surfaced, not averaged** — this is core product value, not plumbing. |
| **供应 Serve** | The right slice at the right size, to BOTH audiences: agents via tools (pull) + auto-loaded curated memory digest (push); humans via codeguide (Required). |
| **保鲜 Refresh** | Incremental per-source freshness + continuous capture of newly created context (sessions → memory). |

Fixed corollaries: context **breadth** is the center; token efficiency (the compressor) is a
supporting discipline; **features before measurement** (data collection is post-feature, never
the driver); non-code context is **first-class**; business logic is a **derived view**, not an
ingestible source; the moat: context belongs to the **project**, not the assistant vendor —
all agents share one base.

## 2. Fixed positions (do not relitigate; full text in the decision log)

- **P1/P3** (pack §9): one product; endgame delivery = hook + extension/MCP, shim removed.
- **P9** internal company adoption is the audience; **P13** private npm registry distribution.
- **P10** Node ≥22; `node:sqlite` single-local-store direction (D33's version gate retired).
- **P11** compressor keeps the hook (spawn shape accepted); CommandProxyResident loses rationale.
- **P14** task oracle = SWE-bench + curated internal-repo set (post-feature, not a driver).
- **P16** serving = push AND pull; push form is host-adaptive (not tied to `tk install`);
  hosts do their own memory distillation — tk **integrates** host memories rather than competing;
  the CLI = installer/bootstrap + fallback, the core = the context base library (D32 model);
  product rename possible, deferred.
- **P17** push content = **memory digest only** (tiny hard budget, entries carry handles,
  human-reviewable, can be disabled). No "project brief" block.

## 3. Design threads already converged in discussion (inputs the design doc must absorb)

- **N sources over one store**, each with the full chain: producer → provenance → query →
  agent projection → human view (the contract's per-layer discipline, transplanted onto sources).
- **Cross-source link layer is the skeleton**: `refers_to` edge family with provenance +
  confidence, three link classes ranked by reliability — explicit keys (commit↔issue, Observed) >
  path/symbol mentions (docs↔code, Derived, rename-tracked) > semantic proposals (Inferred,
  on-demand LLM). Without links the product is five silos in one file.
- **鉴真 mechanics**: provenance/authority/freshness as columns everywhere (Required); the full
  claims/arbitration ledger earns its place where sources overlap on the same predicate.
- **Memory source** (the novel producer): `remember()` explicit writes (primary quality path) +
  host-memory importers (Claude Code / Codex / Copilot distill on their own; tk ingests and
  integrates — echo exclusion of tk's own managed blocks, project-scope filtering, cross-host
  dedup/conflict surfacing) + human notes (highest authority). Entries anchor to code entities
  so the freshness machinery can age/flag them; contradictions surface, never silently overwrite.
- **Serving surfaces**: pull tools shaped by question type — code (find/understand, the contract's
  D17 four tools), decisions (`why(ref)`), history (`history(ref)`), knowledge (`knowledge(topic)`),
  one write path (`remember(note)`), and a composite top-level `context(ref|task)` (cross-source
  QueryPlan). Human side: codeguide pages per source + the **"symbol biography"** page (code +
  decisions + history + memory for one entity). Push: per-host adapter (file block universal;
  dynamic injection where the host supports it).
- **Per-source freshness policies, one vocabulary**: git history is immutable (cheapest, most
  trustworthy — build early); docs = mtime + supersession chains; imports = snapshot-dated;
  memory = anchored aging; code = revision/invalidation (contract E slice).
- **Schema direction**: one node table (kind: symbol/commit/issue/adr/story/memory-entry) + one
  edge table (predicate) + provenance columns + FTS5 across all text; D13's staged cascade
  generalizes (lexical seeds across sources → link-layer expansion → PPR on the cross-source
  graph); time-decay ranking applies to history/memory sources only, never code.
- **Network boundary**: the invariant is "never send project context OUT"; ingress of external
  project context (Jira/Confluence-type) is legitimate — user-credentialed, explicitly
  triggered, stored as dated local snapshots.

## 4. Open questions (work these in discussion BEFORE the document)

1. **Contract restructure list** — which of D1–D33 get amended and how (at minimum: D3
   layers→sources, D17 tool surface extension, D21③ state, D33 hub softening, D9/D28 codeguide
   page set, Behavior-layer priority relative to non-code sources).
2. **Push curation policy** — Fable proposes auto-rank (confidence × reference-frequency ×
   longevity) + human veto/pin; not ratified.
3. **Term definitions** — "gist stories", "conference" (provisional: user-story-type docs /
   Confluence-or-meeting-notes-type docs); memory distillation gate details.
4. **Naming/rename timing** — deferred until the new core is demonstrable (migration costs:
   TOKEN_KILLER_HOME, paths, package, registry).
5. **O1/O2 final form** — post-feature; protocol pieces (P14) decided.

## 5. Terminology Law (mandatory in all output — unchanged)

Do **not** slice the product by version/phase. Banned: `v1 / v2 / MVP / first release / later
release / future phase / thin slice / vertical slice / 留槽 / 以后填 / roadmap phase`. Every
capability carries exactly one capability state: *Required / Optional at runtime / On-demand /
Profile-specific / Capability-bounded / Unsupported / Outside current product scope /
Implementation dependency*. Fact-authority tiers (*Observed / Derived / Inferred / Confirmed*)
stay separate from build order. Build the complete bounded product, not a sequence of
incomplete releases.

## 6. Working agreement / anti-goals (unchanged, plus one)

- **Reply to the maintainer in Chinese**; docs and code in English.
- **No fabrication**; verify before asserting any code/reuse/dependency claim (cite pack §
  or `path:line`).
- **One question per turn** when a decision is needed; sharp options; leave room for a stronger
  maintainer-authored alternative (they routinely produce one).
- **Persist decisions into `FABLE-DECISION-LOG.md`** as they are made. Never edit the pack.
- Prefer cohesion over fragmentation; do not reopen §2 fixed positions.
