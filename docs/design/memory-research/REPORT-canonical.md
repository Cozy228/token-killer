# ctx Memory — Canonical Decision-Anchored Report (merged)

> **Provenance.** This is the merged canonical report over a **dual-track** synthesis: two models
> (Opus 4.8 and Codex 5.5 xhigh) each read the **same** five research workstreams (A current reality ·
> B reference mechanisms · C papers · D biology · E evaluation) + the ctx code/design, and
> synthesized independently without seeing each other's output. Where both converged, the conclusion
> is stated plainly (high confidence). Where they diverged, **§0 Divergence Ledger** records both
> positions and a recommendation for maintainer judgment. Source reports: `REPORT-opus-4.8.md`,
> `REPORT-codex-5.5.md`. Brief: `docs/build/MEMORY-RESEARCH-GOAL-PROMPT.md`.
>
> **Evidence labels** on every major claim: `from-code` · `from-doc` · `from-reference` · `inferred`.
> **Bias (per brief):** small, auditable, deterministic mechanisms. A good outcome is not "ctx has a
> sophisticated memory system" — it is "ctx preserves the right project facts, exposes uncertainty,
> avoids stale/false/echoed memory, keeps push useful, and gives humans and agents enough provenance
> to trust or reject what they see."

> **Post-research reality note (2026-07-05).** This report was verified against **pre-2c** code.
> Slice 2c has since landed `flagAnchorDrift` (`packages/core/src/ingest/code/incremental.ts:249-293`),
> which **partially implements Decision 5** (reason-classed anchor drift) but diverges from maintainer
> ruling **A5** in two ways: it flips **all three** reason classes (including `body-changed`) to
> `needs-review` where A5 rules `body-changed` → down-rank only; and it records a `stale-reason`
> **claim** (`addClaim`), never a reason-classed `stale-suspect` **conflict** (`addConflict` is called
> for doc mentions only, `ingest/docs.ts:403`), so memory drift is invisible to `conflictCandidates()`.
> A `⚠ <status>:` projection for non-active memory also landed (`select/project.ts:89`). All **other**
> VERIFIED findings in this report re-confirmed 2026-07-05. Scheduled corrections are recorded as the
> **E-group** in `docs/build/MEMORY-DECISIONS.md`; this report body is otherwise unchanged.

---

## 0. Divergence Ledger (the only points that need maintainer judgment)

Both tracks agreed on everything not listed here. These four are where they differed — none is a
contradiction; each is a strength/scope difference. Recommendation is the merged default this report
carries; override at will.

| # | Question | Opus 4.8 | Codex 5.5 | Canonical default (this report) |
|---|---|---|---|---|
| **D0-a** | Where does privacy/egress sit in the failure ranking? | An invariant **prevented by construction** — not the design driver; the live costs are false/echo/stale. | Explicit **#0 invariant**, then false/stale #1, echo/unreviewed #2. | **Codex phrasing** — list egress as invariant #0, then false/stale #1, echo #2. Same substance, clearer. |
| **D0-b** | How does `superseded` behave in the **pull** path? | **Down-rank + surface via conflicts** (keep "what we believed before" answerable); only `retired` hard-excluded. | **Hidden** from default pull; recallable only by explicit handle/history. | **Down-rank + conflict-surface** for `superseded`; **hard-exclude** `retired`. Left OPEN for maintainer (both flagged it open). |
| **D0-c** | Can a `pin` override hard **safety** exclusions? | Noted veto>pin; pin may promote a `needs-review` row. | **No** — pin only orders *already-eligible* items; must not override stale/echo/needs-review exclusions (flags `push/rank.ts:79-84` as the current risk). | **Codex** — pin = ordering among eligible; veto always wins; safety exclusions are not pin-overridable. |
| **D0-d** | Push shaping mechanism | **Pointer-at-session-start vs full-inject-mid-session** (anti double-injection, `workstream-B #4`). | Hard **`isPushEligible(memory)`** gate before ranking + pin ordering. | **Both** — a hard eligibility gate (Codex) *and* the pointer/full-inject split (Opus). Complementary. |

---

## 1. Executive Verdict

1. **What ctx memory is FOR** `from-doc/inferred`. The thin authoring + import layer that captures
   durable project *experience facts* — gotchas, local conventions, postmortem learnings, human/host
   notes — that do not fit better as code, docs, decisions, requirements, history, or derived
   concepts, and that must carry provenance + anchors so both humans and agents can trust or reject
   them. Memory is **one of six content types** in the shared context base, not the product
   (`CONTEXA-DESIGN.md:39-52`).

2. **What it is NOT for** `inferred`. Not a chatbot memory, rule/skill-learning layer, transcript
   compressor, semantic wiki, or host-instruction generator. Those optimize *adaptive behavior*; ctx
   optimizes *faithful, local, reviewable project facts*. Every corpus system that auto-merges,
   self-rewrites, or LLM-reflects is declined on ctx's invariants (`workstream-B decline ledger`).

3. **Memory quality for ctx = precision + trust over recall** `inferred`. No false/stale/superseded
   fact served; every served fact provenance-carrying; no ctx-origin fact re-imported as independent;
   unreviewed imports never silently authoritative; the ≤1KB push carries only confirmed, fresh-anchor
   gotchas. **Missing memory is the least-bad failure** — a manual-first, no-LLM system deliberately
   trades recall for trustworthiness (`workstream-D D-4`, `workstream-C 4.9`).

4. **Failure ranking** (merged, D0-a): **#0 privacy/egress** as a hard invariant prevented by
   construction; **#1 false / stale memory**; **#2 host echo + unreviewed import**; **#3 irrelevant
   push / duplicate**; **#4 missing**; **#5 unbounded growth** (managed by lifecycle).

5. **Live risk #1 — status does not gate the pull path** `from-code, VERIFIED both tracks`. Selection
   filters memory only by `gen<=published_gen` (`select/visibility.ts:44-52`); `select/seeds|subgraph|
   engine` never check `status`. So `retired`/`superseded` memory stays FTS-indexed and is still
   returned by `context()`/`search()`. A false-memory vector. Push filters active-only, so it only
   leaks on pull.

6. **Live risk #2 — host import is unreachable, yet imports land `active`** `from-code, VERIFIED both
   tracks`. Memory `dirtyCheck` is hard-coded clean (`adapter.ts:17-23`); `refresh()` ingests only
   dirty adapters (`refresh.ts:122-125`); so `importClaudeCodeMemory()` never runs via `sync`/`install`
   — yet `ctx import` claims it does (`cli.ts:239-245`), and when it *is* called it writes
   `status:"active"` (`claudeImporter.ts:214-224`). The entire echo/needs-review surface is currently
   inert — so land the `needs-review` default *before* wiring import.

7. **Top design change #1 — default host-imported / agent-proposed memory to `needs-review`**, and
   wire import via an mtime-aware `dirtyCheck` (or explicit cold-path command). Precedent: gemini-cli
   inbox/Dismiss-first (`workstream-B #3`); ecosystem-wide "trust Rules over Memories" (`#12`).

8. **Top design change #2 — an anchor-freshness pass** (rides the M2 code source): join
   removed/renamed/structurally-changed anchor targets against `anchors`; flip to `needs-review`; file
   a **reason-classified** `stale-suspect` conflict
   (`target-removed·signature-changed·body-changed·referencer-changed`, `CONTEXA-IMPL.md:285-287`);
   exclude from push + default pull. **Never auto-delete** (reconsolidation, `workstream-D D-3`).
   Designed (`CONTEXA-IMPL.md:259,96-98,540-544`), unbuilt.

9. **Top design change #3 — deterministic prewrite/reconciliation + surface what dedup already
   finds.** `remember()` never dedups today, so manual duplicates enter silently; add a deterministic
   advisory (codex-memory 6-verdict: `ADD/NOOP/MERGE_REQUIRED/MARK_OUTDATED/ASK_USER/supersedes`,
   `workstream-B #13★`) that never auto-applies. And file `sameAsCandidate` as a **conflict** (today
   the importer writes the link but never calls `addConflict`, so dedup is invisible —
   `workstream-A §2.7`).

10. **Keep the popularity signal OUT** `from-code/inferred`. `served_count`/`last_served` columns
    exist but are unwritten (`CONTEXA-IMPL.md:108-109`); §4 prose wants `authority×usage×recency×
    anchor-freshness`. Adding `usage` makes popular-but-wrong facts more visible — the Decision-6
    hazard (`workstream-C 4.5`, `workstream-D D-5`). Rare case where "not yet implemented" is *safer*:
    usage = telemetry / review-scheduling only, never a primary rank term.

---

## 2. Decision Matrix

| # | Decision | Recommendation (merged) | Evidence | A/T/D | Impact | Conf. | What would change it |
|---|---|---|---|---|---|---|---|
| 1 | **Memory's job / separability** | Durable project experience facts; a **thin authoring/import layer** over the shared entity/link/claim graph — one `kind` + side table + two writers + two rank primitives. Not a subsystem. *Rejected:* standalone chatbot memory, global personal memory, wiki/skill authoring, transcript store. | `CONTEXA-DESIGN.md:39-52`; memory owns no store/index/ranker of its own (`workstream-A §0,§5`); survey "structured > vector" (C 5.1) | **Adopt** thin-layer; **Translate** bitemporal/provenance; **Decline** subsystem | Add helper APIs around existing claims/links; never a 2nd store. | High | Users repeatedly needing cross-project personal prefs that aren't project facts and can be scoped without bleed. |
| 2 | **Failure priority** | #0 egress (invariant) · #1 false/stale · #2 echo/unreviewed-import · #3 irrelevant-push/duplicate · #4 missing · #5 growth. *Rejected:* optimize automation/recall first; let popularity/recency cover correctness. | code defends egress+echo+dedup but leaves false/stale/unreviewed **undefended** (`workstream-A §2`); survey §3.2; B "echo is live" | **Adopt** | Eligibility filters + review gates run **before** rank boosts; eval labels map to these. | High | Benchmark shows false/stale rare while missing blocks core tasks. |
| 3 | **Write policy** | Manual-first (`remember`=confirmed) + explicit imports. Add **deterministic prewrite reconciliation** (advisory, never auto-writer): `ADD/NOOP/MERGE_REQUIRED/MARK_OUTDATED/ASK_USER/supersedes`; host/agent proposals → `needs-review`. *Rejected:* LLM op-selector, auto-summarization, rewrite-on-recall, embedding dedup. | `remember()` already guidance-not-write on bad input (`remember.ts:138-178`); codex-memory 6-verdict (`workstream-B #13★`); `remember()` never dedups (`workstream-A §8`) | **Adopt** manual; **Translate** 6-verdict; **Decline** auto-creation | `remember --check` / internal prewrite advisory; surface dup/supersede candidates; never auto-apply UPDATE. | High | A future offline proposal path that is user-triggered, deterministic-gated, lands in `needs-review`. |
| 4 | **Lifecycle & retention** | `active`=pull/push-eligible if fresh · `needs-review`=kept+review-visible, not push/default-pull · `superseded`=kept, down-ranked, chain-shown (D0-b) · `retired`=kept, audit/explicit-recall only. **Forgetting = accessibility/rank suppression, never deletion.** Add per-transition change-ledger. *Rejected:* destructive delete, in-place update, status-as-cosmetic. | non-destructive supersede (`remember.ts:235-253`); selection ignores status (`visibility.ts:44-52`); D-1 forgetting=reduced accessibility; bitemporal never-delete (C 1.2) | **Adopt/Translate** | Status filters in selection/search; explicit handle/history escape; optional `valid_to` + transition rows. | High | Maintainer wants `search()` to include inactive by default (then output must show status prominently; eval must allow). |
| 5 | **Anchoring & freshness** | Anchors = retrieval cues **and** freshness contracts; freshness is **structural** (target exists / hash matches / identity unambiguous), never inferred from relevance. Drift → `needs-review` + reason-classed `stale-suspect` + down-rank + push-exclude. *Rejected:* wall-clock decay as freshness, LLM drift classifier, delete-on-drift, serve stale normally. | anchors are explicit rows + claims (`remember.ts:210-228`); M2 plans invalidation (`CONTEXA-IMPL.md:540-544`); stale reads as relevant (survey §3.2); D-2 cue-dependent | **Adopt/Translate** structural; **Decline** semantic | Join changed/removed entities vs `anchors`; write reason-classed conflicts; status/freshness gate pull+push. | High | Drift proves too noisy → keep review status, tune reason classes (esp. `body-changed`), not the mechanism. |
| 6 | **Retrieval & ranking** | Shared pipeline **with hard status/freshness eligibility first**, then lexical (FTS5) + anchor-proximity (PPR/BFS) + authority (×1.3) + pin + duplicate-diversity (MMR via `dedup.ts` Jaccard) fused by RRF. Recency = weak tie-breaker; **served_count = telemetry only**. *Rejected:* embeddings, LLM importance, popularity/last-served rank. | `select/rank.ts` (PPR/RRF/authority/decay); RRF+BFS+MMR adopt, popularity decline (C 4.5-4.8); served_count unwritten (`CONTEXA-IMPL.md:108-109`) | **Adopt** FTS/RRF/authority; **Translate** proximity/MMR; **Decline** embeddings/usage | Add status/freshness gate + anchor-freshness multiplier to `select/rank.ts`; keep `served_count` out. | Med-High | Eval shows lexical+anchor misses many true positives **and** a safe non-embedding signal exists. |
| 7 | **Push digest** | Small affordance + high-precision gotchas: active, confirmed-or-pinned, fresh-anchor, non-dup, non-echo. **Hard-exclude** retired/superseded/needs-review/stale-anchor/host-import-unconfirmed/unresolved/echo-risk via an `isPushEligible()` gate **before** rank+pin. Pin orders eligible only (D0-c); veto always wins. Pointer-at-session-start vs full-inject-mid-session (D0-d). *Rejected:* recent notes, review items, unconfirmed imports, broad summaries. | push ≤1024 by construction (`block.ts:85-120`); pin can force non-active rows today (`rank.ts:79-84`); over-retrieval harms (A-MEM §4.5); G3/F4 restatement (`FABLE-DORA-REVIEW.md:156`) | **Adopt** byte-cap; **Translate** eligibility+pointer; **Decline** review/unconfirmed in push | `isPushEligible()` gate; stale/echo exclusions when mechanisms land; pointer split in `push/hosts.ts`. | High | Maintainer makes pin an absolute override → push must label unsafe status inline + eval covers it (D0-c). |
| 8 | **Host composition** | Import host-local material **only as quarantined evidence** (`needs-review`), never active truth by default; prefer human-authored instruction/rule surfaces. **Never** import ctx-managed push blocks, raw transcripts, remote/server memory, secrets, cwd-mismatched stores, or a host's own auto-memory dir. Echo defense = sentinel strip **+** import-side denylist of host auto-memory paths **+** cross-origin (paraphrase) dedup vs ctx-origin/pushed gists **+** content-hash drift on pushed blocks. *Rejected:* active host import, exact-sentinel-only, writing ctx digest into host auto-memory, cross-host auto-merge. | importer strips exact sentinel only (`sentinel.ts:1-15`), imports active inferred (`claudeImporter.ts:214-224`); cross-host ingestion live (B); physical-separation convergence (`workstream-B #16`); inbox (#3) | **Adopt** provenance/strip; **Translate** inbox + cross-origin echo; **Decline** active auto host memory | `claudeImporter.ts:224` active→needs-review; denylist + cross-origin check; wire import (mtime dirtyCheck). | High | A host proven human-authored, project-scoped, local-only, not auto-regenerated (none today) — even then keep provenance + review escape. |
| 9 | **Human vs agent** | Agents: compact recall (`context/search/remember`, handles, status/freshness labels, conflicts when relevant); may write, not confirm/lifecycle-mutate by default. Humans (`ctx guide`, **read-only**): review queue, stale list, evidence drawer, pin/veto state, literal CLI remediation commands. **Review/evidence surfaces > richer auto-recall.** *Rejected:* agent confirms over MCP, guide writes, evidence hidden behind prose. | MCP = 3 tools (`mcp.ts:37-93`); guide read-only, unbuilt (`CONTEXA-DESIGN.md:169-187`; `workstream-A §2.4`); review-queue UX near-novel (B cross-corpus) | **Adopt** 3-tool + read-only guide; **Decline** guide writes, agent lifecycle | Build read-only helpers first: `memoryProvenance`, `reviewQueue`, `staleMemoryAnchors`; CLI = mutation path. | High | Maintainer lets trusted agents submit review decisions (needs explicit policy + audit trail). |
| 10 | **Evaluation** | Deterministic **E-series** over exact ids/statuses/handles/bytes — no text similarity, no LLM judge. Cover recall precision, stale anchors, supersede, duplicate import, push usefulness, echo, provenance, no-egress, growth, guide read-only. *Rejected:* live host CI, LLM-as-judge, BLEU/F1, embedding similarity, networked corpora. | `workstream-E` (E1-E7+EG); text-overlap misleads → id-level (mem0 §3.2); LOCOMO taxonomy (C 6.1) | **Adopt** E-suite; **Translate** paper categories; **Decline** model-graded | `e-memory-quality.test.ts` + `helpers/memoryFixture.ts`; runnable now + `test.todo` as acceptance bars. | High | Current APIs can't expose stable ids/diagnostics → add diagnostic seams, not a judge. |
| **11** | **Collaboration & sync** *(added post-research; the ten decisions did not cover multi-user sync)* | **Ownership/sync is a property of the CARRIER, not the content type.** Three categories: **① derived-from-committed-source** → never synced, regenerated locally, `store.sqlite` gitignored; **② authored-local** (memory + concepts) → **committed `.contexa/` files, git-synced, conflicts resolved by a human at merge/PR as committed decision facts**; **③ external system-of-record** (PR/Jira/Confluence) → re-imported per person, snapshot, never mirrored into the repo. Cross-source anchor to a not-locally-imported entity = `unresolved-here` (≠ stale). *Rejected:* memory as a per-laptop store (structurally diverges), committing the binary index, mirroring an external SoR into git, real-time multi-writer/server sync. | `VISION.md` Mainline/Overlay + moat; `workstream-B` files=truth/DB=index (codex-memory #13, basic-memory), physical-separation #16; conflicts-surfaced invariant | **Translate** (git as the sync/conflict layer) | Memory → committed files, store → rebuildable index (leaves index-not-copy); decision-log for lifecycle; per-carrier matrix; personal-local overlay. Full spec: `docs/build/MEMORY-SYNC-GOAL-PROMPT.md`; rulings: `docs/build/MEMORY-DECISIONS.md` (B1=yes). | High | One assistant vendor wins so totally that a project-owned base is a solution to a problem the market stopped having. |

**Rule 9 (considered & rejected)** is recorded inline per row above and in full in the two source
reports (`REPORT-opus-4.8.md §2`, `REPORT-codex-5.5.md §2`).

**New invariant (with Decision 11):** *durable project memory is committed to the project's own git
repo and shared via git; the local index is a rebuildable cache, never the source of truth and never
committed.* This clarifies (does not contradict) "memory is always local" — local = never egressed /
no org-server memory; committed-to-your-own-repo is still local.

**Maintainer rulings (2026-07-05, `docs/build/MEMORY-DECISIONS.md`):** §0 divergence **D0-b →
superseded is down-ranked + surfaced (not hidden)**; **D0-c → pin cannot override safety exclusions**;
**Decision 11 → B1 = yes** (adopt the committed-file / git-sync model). Host imports (Decision 8) land
`needs-review` **including host auto-memory dirs**; agent lifecycle stays human/CLI-only (Decision 9).

---

## 3. Current ctx Assessment

**Already right (keep)** `from-code`
- Cautious manual write: gist cap pre-checked; unresolved supersede/anchors return guidance, no
  partial write (`remember.ts:138-178`).
- Graph-native: `memory` entity + row + anchors + `anchoredTo` claims/links + FTS index
  (`remember.ts:180-233`).
- Non-destructive supersede (`remember.ts:235-253`) and non-merge dedup (entropy floor +
  differing-number veto + Jaccard → candidate only, `dedup.ts:19-92`) — the invariant-5 shape the
  rest of the corpus lacks (`workstream-B cross-corpus`).
- Real push byte cap + sentinel wrapper (`block.ts:26-120`); read-only human surface correctly
  specified (`CONTEXA-DESIGN.md:169-187`).

**Implemented but risky (fix)** `from-code, VERIFIED`
- Host import writes `active` inferred → unreviewed host memory can enter default pull+push once
  imported (`claudeImporter.ts:214-224`, `push/rank.ts:73-84`).
- Host import effectively unreachable via `ctx sync` (always-clean dirtyCheck + dirty-only refresh);
  CLI text says the opposite (`adapter.ts:17-23`, `refresh.ts:122-125`, `cli.ts:239-245`).
- **Status does not gate pull** (`visibility.ts:44-52`, `seeds.ts:75-82`, `engine.ts:238-263`).
- Push **pin** can force-include a non-active/`needs-review` row (`rank.ts:79-84`) — see D0-c.
- `sameAsCandidate` never surfaced as a conflict (`claudeImporter.ts:236-263` vs
  `engine.ts:113-137`).
- `served_count`/`last_served` in schema+rows but no writer → usage ranking aspirational
  (`001-init.sql:54-64`, `store.ts:364-379`).

**Missing but important (build)**
- Anchor-freshness (M2-named, currently total absence; `decayBasis` ages from claim timestamp not
  liveness — `CONTEXA-IMPL.md:540-544`, `select/rank.ts:42-52`).
- Paraphrase/cross-origin echo defense (exact-sentinel only — `sentinel.ts:1-15`; E6 pending).
- The M3 read-only guide (data primitives exist, no assembler/UI — `CONTEXA-IMPL.md:428-435`).
- Deterministic prewrite reconciliation (`remember()` never dedups).
- Lifecycle transition history (status mutates with no audit trail — `store.ts:382-383`).

**Missing and not worth doing now**
- LLM reflection/contradiction, embeddings, vector stores, LLM-as-judge (invariant violations).
- Full Codex/Copilot importers until the Claude path is review-safe + echo-safe + tested.
- A rich bitemporal query language (record `valid_to` on supersede is enough initially).
- Served-count ranking (measurement-gated; likely telemetry-only forever).

**Overbuilt or misleading**
- Design says push rank = `authority×usage×recency×anchor-freshness`; code = `authority×recency`
  only (`CONTEXA-DESIGN.md:141-148` vs `push/rank.ts:39-45`).
- CLI "imports automatically on cold-path sync" is misleading with the always-clean adapter
  (`cli.ts:239-245`).
- `human-note` origin exists in vocabulary but no path writes it (`types.ts:125-135`).
- `listMemories()` opens a second SQLite connection (Store lacks enumeration) — boundary leak
  (`remember.ts:355-393`).

---

## 4. Recommended Memory Model (ctx terms)

- **Unit** `from-code`. `mem:<ulid>` + ≤240 gist + optional detail + origin + authority + status +
  optional session_ref + anchors + backing claims/links. Store is source of truth for memory
  gist/detail (the sole index-not-copy exception, `001-init.sql:54-75`, `store.ts:629-643`).
- **Authority.** `remember`/human-note default `confirmed`; host imports + machine proposals default
  `inferred` + `needs-review`. Authority is provenance, upgraded only by explicit human confirmation.
- **Provenance.** Every anchor / supersede / dup-candidate / stale-reason / **lifecycle transition**
  carries a claim or event (carrier / locus / method / authority / at). Anchor+supersede claims exist
  today; **transitions need an equivalent audit trail**.
- **Anchors.** Explicit retrieval cues to entity ids; write-time resolution all-or-nothing; `file:`
  auto-create when the target exists; unresolved → candidates + no write.
- **Lifecycle.** `active → needs-review → {active|retired}`, `active → superseded` (via supersede);
  all transitions retain the row. Hosts import to `needs-review`; anchor drift → `needs-review`.
  Forgetting = accessibility/rank suppression, never deletion.
- **Freshness.** Structural: target exists, content hash/fingerprint matches, identity unambiguous;
  rides the code/docs invalidation machinery (`content_hash` + `dependency_index`,
  `CONTEXA-IMPL.md:96-98,259`). Drift → `stale-suspect` (reason-classed) → down-rank + push-exclude +
  review-queue. No wall-clock auto-expiry of facts.
- **Ranking.** Eligibility (status + freshness) **first**, then FTS5 lexical + anchor-proximity +
  authority + pin + duplicate-diversity, RRF-fused, hard output caps. Recency weak; served_count
  telemetry only. Decline embeddings/LLM-importance/popularity.
- **Push eligibility.** Not a review queue: fixed header + only active, confirmed-or-pinned,
  fresh-anchor, non-dup, non-echo gotchas/conventions. Hard `isPushEligible()` gate before rank+pin;
  pin orders eligible (not a safety override, D0-c); veto excludes all. Pointer vs full-inject split.
- **Host imports.** Evidence collectors, not trust gates: project-scoped, local, provenance-marked,
  sentinel-stripped, cross-checked against ctx-origin/pushed gists, inserted `needs-review` unless
  explicitly human-authored + trusted. Never write ctx content into host auto-memory dirs.
- **Human review.** `ctx guide` read-only + evidence-first: review queue, stale-reference list,
  duplicate candidates, pin/veto state, evidence drawer. Mutations via CLI/library only.
- **Agent retrieval.** `context`/`search`/`remember`; output carries handles, freshness/status labels,
  conflicts when relevant, drill-down detail. Agents propose/write; do not confirm imports or mutate
  lifecycle without explicit policy.

---

## 5. Scope Cut

**Must do now** (correctness-critical, all deterministic)
1. **Fix the host-import contract**: default imported host memory `active → needs-review` **before**
   it can reach push/default-pull, and either wire cold-path import (mtime `dirtyCheck` / explicit
   command) or correct the CLI text (`adapter.ts:17-23`, `cli.ts:239-245`).
2. **Status-gate selection/search**: hide `needs-review`/`superseded`/`retired` from default pull
   (per D0-b), keep explicit handle/history recall.
3. **Minimal anchor-freshness**: file-target-removed now, symbol signature/body-changed when M2 code
   hashes exist; write reason-classed `stale-suspect` + `needs-review` (`CONTEXA-IMPL.md:540-544`, E2).
4. **Surface `sameAsCandidate`** as an open conflict / review item, not just a low-confidence link.
5. **Cross-origin echo detection**: compare incoming host gist/detail against ctx-origin remembered +
   previously-pushed gists via `dedup.ts`; skip or import `needs-review` + `sameAsCandidate`.
6. **Land the E-series skeleton**: runnable E1/E3/E4/E7/E0 now; `test.todo` for E2/E5 stale-echo, E6
   paraphrase, and the guide scenarios (`workstream-E:419-435`).

**Should do after measurement**
- RRF/anchor-proximity tuning + MMR duplicate diversity, *after* the status/freshness gates pass.
- Instrument served_count/last_served as **telemetry/review-scheduling only**, never primary rank.
- Optional `valid_from/valid_to` or lifecycle-event rows once the core status model proves useful.
- Expand host importers beyond Claude once trust/scoping/echo rules are stable.
- Build the full guide UI after read-only data helpers pass deterministic tests; start CLI-readable.
- Deterministic prewrite reconciliation for `remember()` (measure duplicate rate first).
- Push restatement demotion (G3/F4) + pointer-vs-inject split.

**Do not do**
- LLM / embeddings / network at write, serve, or eval time.
- Rewrite-on-recall; summarize host transcripts into active memory; auto-resolve contradictions;
  delete source after consolidation; rank by served-count/popularity.
- Global/user-wide memory in the per-project store.
- Push unresolved review items / unconfirmed imports into host instruction files.
- Import a host's own auto-memory directory as active; write ctx content into one.
- A writable guide (FORK-1/P23).

**Open questions (maintainer judgment)** — the §0 divergences plus:
- D0-b: `needs-review`/`superseded` fully absent from default `context()`/`search()`, or shown only
  in a separate review/conflicts section when directly relevant?
- D0-c: is `pin` an absolute override or ordering-among-eligible only?
- D8: import host auto-memory dirs at all (even as `needs-review`), or human-authored + explicit
  user-selected files only?
- D9: may agents ever confirm/retire over MCP, or is lifecycle human/CLI-only?
- D4/D5: is `valid_from/valid_to` worth a schema migration now, or ship status + stale-reason claims
  first?
- Anchor-drift status flip vs rank-only: `target-removed`/`signature-changed` flip; `body-changed`
  down-rank-only (noise control, ties to M2 `content_hash` granularity)?
- Close the `Store` enumeration seam (drop `listMemories`' second connection)?

---

## 6. Evaluation Plan (deterministic, network-free, no-LLM)

Full spec: `workstream-E-evaluation.md`. Harness reuse: `openStore({projectDir, home, now})` under
temp `CONTEXA_HOME` (G-7), injected fixed clock, `assertNoEgress` armed, script-generated git +
`seedClaudeMemory` fixtures. New suite `packages/core/tests/acceptance/e-memory-quality.test.ts` +
`helpers/memoryFixture.ts`. **Scoring = id/status/handle/byte set-membership, never text overlap or
LLM judge.** Pending mechanisms are `test.todo` — the failing test IS the spec.

| Task | Capability (failure label) | Pass/fail (one-line) | Today? |
|---|---|---|---|
| **E0** | egress + growth guard | no egress; row count monotonic across supersede/retire; push ≤ cap | ✅ |
| **E1** | recall precision (`missing`) | target in `search` top-3 + first in `context` memory section; noise never outranks; handle round-trips | ✅ |
| **E2** | stale-anchor (`stale`) | after target delete/drift + re-ingest: memory→`needs-review` + open `stale-suspect` (reason-classed); still recallable; absent from push | ⏳ forces **anchor-freshness pass** |
| **E3** | supersede (`stale`) | v1→`superseded`, absent from active+push, recallable, `supersedes` link v2→v1 | ✅ |
| **E4** | duplicate-import (`duplicate`) | near-dups kept separate + `sameAsCandidate`(0.5); differing-numbers → no link | ✅ |
| **E5** | push usefulness (`irrelevant-push`) | ≤1024 bytes; includes active confirmed; excludes retired/superseded (today), stale/echo (pending); deterministic pin/veto | ◑ partial |
| **E6** | echo prevention (`host-echo-loop`) | no `ctx:managed` in any imported gist + pure-echo skipped (today); paraphrase not admitted as independent active (pending) | ◑ forces **cross-origin echo** |
| **E7** | provenance (`unanchored`) | each served memory exposes origin/authority/status/anchors + backing `anchoredTo` claim | ✅ |
| **EG-\*** | guide review queue / drawer / stale-list / read-only | assert the read-only data layer backing M3; guide handlers write-free | ⏳ forces **M3 guide** + import→needs-review |

**Pass criteria** `inferred`: every expected id/status/conflict present; every forbidden id absent
from default pull/push; every rendered handle recalls; push bytes never exceed cap; no assertion
depends on wall-clock/network/LLM/host-install. Failure labels are the fixed vocabulary
(`false·stale·missing·duplicate·irrelevant-push·unanchored·unreviewed-import·host-echo-loop·
privacy-egress·unbounded-growth`).

---

## 7. Evidence Appendix

**From-code (current implementation, `packages/core/src` unless noted):**
- `memory/remember.ts` — write path; guidance-not-write `:138-178`; commit `:180-233`; confirmed
  default `:201-208`; supersede keeps+restatus `:235-253`; recall/list/lifecycle `:267-393`; second
  SQLite connection `:355-393`; no dedup call.
- `memory/dedup.ts:19-92` — entropy floor + differing-number veto + Jaccard → `sameAsCandidate` only.
- `memory/sentinel.ts:1-36` — exact `ctx:managed` strip; paraphrase out of scope.
- `memory/claudeImporter.ts:152-267` — import authority `inferred` + **status `active` `:214-224`**;
  within-host dedup `:236-263`.
- `memory/adapter.ts:17-23` — `dirtyCheck` hard-coded clean (VERIFIED both tracks).
- `ingest/refresh.ts:122-125` — ingest only dirty; `registry.ts:22-29` includes memory;
  `cli.ts:239-245` — false "imported automatically" (VERIFIED); `M1-REALITY-CHECK.md:16,73-77` —
  live store `memory 1`.
- `push/block.ts:26-120` — ≤1024 by construction; `push/rank.ts:39-112` — active-only,
  authority×recency, pin can force non-active `:79-84`, veto wins.
- `select/visibility.ts:44-52` — `gen<=published_gen` only, **no status** (VERIFIED);
  `select/seeds.ts:75-125`, `subgraph.ts:34-95`, `engine.ts:238-323` — no status check;
  `select/rank.ts:42-93` — decay from claim timestamp not liveness.
- `store/migrations/001-init.sql:54-75` — memory table + `served_count`/`last_served` +
  contentless FTS; `store.ts:334-395,629-643` — memory methods + store-locator read-through.

**From-doc (design/spec):** `CONTEXA-DESIGN.md:21-32,39-67,118-149,169-187` (purpose, six content types,
ranking/serving, push, read-only guide); `CONTEXA-IMPL.md:96-98,184-212,259,285-287,291-335,410-435,
540-548` (invalidation ride, dedup, reason classes, ranking/10% memory, push, guide, M2/M3);
`FABLE-DECISION-LOG.md:131-133` (P21); `FABLE-DORA-REVIEW.md:156,197,224` (G3/F4 restatement);
`MEMORY-RESEARCH-GOAL-PROMPT.md:40-41` (invariants).

**From-reference (corpus — mechanisms, not targets):** codex-memory ★ deterministic 6-verdict
`--prewrite` (`workstream-B #13`, 1:1 with invariant 5); gemini-cli inbox/Dismiss-first (`#3`);
graphiti/Zep bitemporal never-delete adopt / LLM detector decline (`workstream-C 1.1-1.2`); mem0
ADD/UPDATE/DELETE/NOOP translate / LLM selector decline (`C 2.1-2.2`); branch-manager
pointer-vs-inject (`#4`); physical-separation codex+claude (`#16`); cross-host ingestion live (Claude
`/init`, Zed `.rules`); survey §3.2 (stale reads relevant); A-MEM §4.5 (over-retrieval harms); mem0
§3.2 (text-overlap misleads → id-level eval).

**Biology (constraint-check only, `workstream-D`):** D-1 forgetting = reduced accessibility not
erasure (supports hide/down-rank-not-delete); D-2 cue-dependent recall (supports anchor-freshness);
D-3 reconsolidation (strongest — warns against rewrite-on-recall/LLM-consolidation, validates
no-LLM-at-serve + surface-don't-average); D-4 cue overload (supports push precision caps); D-5
spacing/salience (served_count = bounded tie-breaker at most).

**Inferred:** the failure ranking, "quality = precision+trust over recall", the prewrite-reconciliation
recommendation, the four §0 divergence resolutions, and all implementation-impact cells are synthesis
across the above, not direct claims from any single source.

**Dual-track provenance:** `REPORT-opus-4.8.md` (Opus 4.8) and `REPORT-codex-5.5.md` (Codex 5.5 xhigh)
each synthesized the same five workstreams independently; this canonical merges them, with §0 recording
the four divergences.
