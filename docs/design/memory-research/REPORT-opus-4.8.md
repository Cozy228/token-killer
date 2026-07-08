# ctx Memory — Decision-Anchored Research Report (Opus 4.8 synthesis)

> **Track.** This is the Opus-led synthesis of five parallel research workstreams (A current reality ·
> B reference mechanisms · C papers · D biology · E evaluation), fused with an independent
> orchestrator verification pass against the code. A separate Codex 5.5 (xhigh) report
> (`REPORT-codex-5.5.md`) synthesizes the **same** five-workstream evidence base independently, for
> side-by-side comparison. Brief: `docs/build/MEMORY-RESEARCH-GOAL-PROMPT.md`.
>
> **Evidence labels** on every major claim: `from-code` (read in a source file) · `from-doc`
> (design/spec) · `from-reference` (a corpus tool/paper) · `inferred` (synthesis). Workstream
> deliverables carry the deep citations; this report cites the load-bearing ones inline.
>
> **Bias (per brief).** Small, auditable, deterministic mechanisms. A good outcome is not "ctx has a
> sophisticated memory system"; it is "ctx preserves the right project facts, exposes uncertainty,
> avoids stale/false/echoed memory, keeps push useful, and gives humans and agents enough provenance
> to trust or reject what they see."

---

## 1. Executive Verdict

1. **What ctx memory is FOR.** The thin authoring + import layer that captures project *facts and
   experience not derivable from code/git/docs* — the "why we chose this / what bit us / what a human
   asserted" layer — as `memory` entities inside the **shared** entity/link/claim/FTS graph, where
   every fact is **trust-or-rejectable** by both humans and agents. `from-code CONTEXA-DESIGN.md:52`;
   memory is one of six content types, not a subsystem (`workstream-A §0,§5`).

2. **What it is NOT for.** Not a chatbot's conversational memory; not an autonomous self-updating
   knowledge base; not a home for LLM-synthesized abstractions; not agent skill/policy learning; not a
   duplicate of what code/git/docs already carry. Every corpus system that auto-merges, self-rewrites,
   or reflects is declined on ctx's invariants (`workstream-B decline ledger`; `workstream-C themes 2-3`).

3. **Memory quality for ctx (the objective function).** Precision and trust over recall:
   *no false/stale/superseded fact served · every served fact carries provenance · no ctx-origin fact
   re-imported as independent · unreviewed imports never silently become authoritative · the ≤1KB push
   carries only confirmed, fresh-anchored gotchas.* **Missing memory is the least-bad failure** — a
   manual-first, no-LLM system deliberately trades recall for trustworthiness (`inferred`; corroborated
   by `workstream-D D-4`, `workstream-C 4.9`).

4. **Top failure mode #1 — false memory.** A confidently-served wrong fact poisons the whole value
   proposition. Live today: **lifecycle status does not gate the pull path** — `retired`/`superseded`
   memories stay FTS-indexed and are still returned by `context()`/`search()` (`from-code, VERIFIED`:
   `select/*` has no status filter, only `gen<=published_gen` via `visibility.ts:44-52`;
   `workstream-A §2.8`). And dedup candidates are **never surfaced as conflicts**
   (`workstream-A §2.7`).

5. **Top failure mode #2 — host echo loop (including paraphrase).** Self-amplifying; manufactures
   false authority; a growth vector. It is **not hypothetical**: cross-host ingestion is already live
   (Claude `/init` reads `.cursorrules`/`.windsurfrules`/`.devin/rules/`, `from-reference memory.md:148`;
   Zed `.rules` reads five hosts' files), so one ctx push into `AGENTS.md` is auto-amplified across
   every host. ctx's exact-sentinel guard (`sentinel.ts`) is necessary but insufficient — it says so
   itself (`sentinel.ts:8` paraphrase out of scope).

6. **Top failure mode #3 — stale-served-as-fresh.** *Outdated knowledge fails without overt indication
   and still reads as semantically relevant* (`from-reference` survey §3.2) — so a relevance/recency
   ranker surfaces stale facts by construction. ctx has **zero** anchor-freshness behavior in M1
   (`workstream-A §2.3`); "recency" today is anchor *write*-time, not target liveness
   (`from-code select/rank.ts decayBasis`).

7. **Top design change #1 — host imports default `needs-review`, and wire import at all.** Today
   imports land `status:"active"` (`from-code claudeImporter.ts:224`) *and the import path is
   unreachable from any user command* (`from-code, VERIFIED`: `refresh()` ingests only
   `dirty===true` — `refresh.ts:123-124` — but memory `dirtyCheck` is hard-coded clean —
   `adapter.ts:17-19`; `ctx import` even prints a false "imported automatically on cold-path sync",
   `cli.ts:242-245`). Wire it via an **mtime-aware `dirtyCheck`**, and land the `needs-review` default
   + a review queue *before* wiring, since the echo surface is currently inert. Precedent: gemini-cli's
   inbox/Dismiss-first (`workstream-B #3`); the whole host ecosystem's "trust Rules over Memories"
   convergence (`workstream-B #12`).

8. **Top design change #2 — an anchor-freshness pass (rides M2 code source).** On git/code re-ingest,
   join removed/renamed/structurally-changed anchor targets against `anchors`; flip the memory to
   `needs-review`; file a **reason-classified** `stale-suspect` conflict
   (`target-removed·signature-changed·body-changed·referencer-changed`, `from-doc CONTEXA-IMPL.md:285-287`);
   exclude from push. **Never auto-delete** (reconsolidation warning, `workstream-D D-3`). This is
   *designed* (`CONTEXA-IMPL.md:259, 96-98, 162-165`) but unbuilt.

9. **Top design change #3 — status-gate the pull path + surface conflicts on serve.** `retired`
   excluded from `context()`/`search()`; `superseded` down-ranked and shown *with* its supersessor via
   the always-shown conflicts section; file dedup `sameAsCandidate` as a conflict so it is visible at
   all. Completes "forgetting" in the one path where it currently leaks (`workstream-A §2.8`).

10. **Cross-cutting: keep the popularity signal OUT.** `served_count`/`last_served` columns exist but
    are unwritten (`from-code CONTEXA-IMPL.md:108-109`); the §4 design prose wants
    `authority×usage×recency×anchor-freshness` (`from-doc CONTEXA-DESIGN.md:143`). Adding `usage` would
    make *popular-but-wrong* facts more visible — the exact Decision-6 hazard (`workstream-C 4.5`,
    `workstream-D D-5`). This is the rare case where "not yet implemented" is the *safer* state:
    decline usage as a ranking input; allow it only as a bounded tie-breaker / review nudge.

---

## 2. Decision Matrix

| # | Decision | Recommendation | Key evidence | A/T/D | Implementation impact | Conf. | What would change it |
|---|---|---|---|---|---|---|---|
| 1 | **Memory's job / separability** | Memory = a **thin authoring+import layer** over the shared graph (one `kind` + one lifecycle table + two writers + two rank primitives). Keep it thin; do not build a memory subsystem. | `CONTEXA-DESIGN.md:52`; `workstream-A §0,§5`; survey "structured > vector" (C 5.1) | **Adopt** (already true) | Resist feature-creep; new memory behavior should reuse store/FTS/select/push, not fork them. | High | If memory needed retrieval semantics the shared engine cannot express (it doesn't today). |
| 2 | **Failure priority** | Rank: **false ≥ host-echo-loop ≥ stale** dominate design; then unreviewed-import, duplicate, irrelevant-push, unanchored; **missing = least-bad**; privacy/egress catastrophic-but-construction-prevented; unbounded-growth slow/managed by lifecycle. | Code defends egress+echo+import-dedup but leaves false/stale/unreviewed **undefended** (`workstream-A §2 "defense investment"`); survey §3.2; B "echo is live" | **Adopt** | Redirect investment to false (status-gate pull, file dedup-as-conflict) + stale (anchor-freshness). | High | Evidence that agents tolerate false facts better than missing ones (unlikely for a trust tool). |
| 3 | **Write policy** | **Manual-first** (`remember`=confirmed) + host import (inferred). **No automatic/LLM creation.** Add a **deterministic pre-write reconciliation** to `remember()` (verdict = add / supersede-candidate / dup-candidate / needs-review), so manual writes stop silently duplicating. | Capture tap is provenance-only, not an author (`CONTEXA-DESIGN.md:204-206`); codex-memory 6-verdict twin (`workstream-B #13★`); `remember()` never dedups today (`workstream-A §8`) | **Translate** (codex-memory verdicts) / **Decline** (LLM op-selector, mem0 §2.1) | New pre-write step over `dedup.ts`+FTS in `remember.ts`; returns candidate+verdict, **never auto-applies**. | High | A deterministic auto-capture with a stacked gate (memsearch `stop.sh`, `workstream-B #7`) *could* be reconsidered post-measurement, still no-LLM. |
| 4 | **Lifecycle & retention** | `active`=served+push · `needs-review`=retained/retrievable/**push-excluded**/in-queue · `superseded`=kept+down-ranked+chain-shown · `retired`=kept+excluded-from-default-serve. **Forgetting = status down-rank/hide, never delete**; add a per-transition change-ledger row. | bitemporal never-delete (C 1.2, graphiti); D-1 (forgetting=reduced accessibility not erasure); provenance decline of silent deletion (`workstream-B decline`) | **Adopt/Translate** | Add `valid_to`/transition ledger; make selection status-aware (see D6). | High | — |
| 5 | **Anchoring & freshness** | Anchors are links; freshness is **structural** (target-exists / content-hash), never inferred from relevance. Drift → reason-classified `stale-suspect` + `needs-review` + push-exclude; affects ranking, push eligibility, conflict surfacing; **not** auto-retire. | survey §3.2 (stale reads as relevant); designed ride on code invalidation (`CONTEXA-IMPL.md:259,285-287`); D-2 cue-dependent recall; graphiti bitemporal math (adopt) vs LLM detector (decline) | **Adopt/Translate** | The M2 anchor-freshness pass (E2). Biggest missing-but-important mechanism. | High | If M2 symbol `content_hash` proves too noisy (body-changed churn) → down-rank only, defer status flip. |
| 6 | **Retrieval & ranking** | Compete in the shared PPR+RRF pipeline at a 10% cap. Justified deterministic signals: **lexical (FTS5), graph/anchor proximity (PPR/BFS), authority (confirmed×1.3), anchor-freshness, pin/veto**. **Dangerous → refuse: served_count/usage (popularity), unbounded recency, embedding relevance.** Recency → guarded tie-breaker. Status must gate/down-rank. | `select/rank.ts` (authority×decay, RRF K=60); C 4.5/4.6/4.8 (RRF+BFS adopt, popularity decline); D-5; `served_count` unwritten (`CONTEXA-IMPL.md:108-109`) | **Adopt** (FTS/PPR/RRF/authority) / **Translate** (freshness) / **Decline** (usage, embeddings) | Add anchor-freshness multiplier + status filter to `select/rank.ts`; keep `served_count` out. | High | Measurement showing recall too low *and* a safe precision-preserving signal exists. |
| 7 | **Push digest** | Keep ≤1KB fixed-header + top-N **confirmed active fresh-anchored** gotchas, each a `[handle]`. Exclusions: retired, superseded, needs-review, **stale-anchor, echo-risk, restatement** (add). Push a **pointer**, not full content, where the host already loads the file. Optimize for gotchas/conventions — **not** recency-only, **not** unresolved-review-items. | `push/block.ts` ≤1KB by construction; A-MEM §4.5 over-retrieval (C 4.9); branch-manager pointer-vs-inject (`workstream-B #4`); G3/F4 restatement demotion (`FABLE-DORA-REVIEW.md:156,197,224`) | **Adopt/Translate** | `rankGotchas` gains stale/echo/restatement veto (E5); pointer split in `push/hosts.ts`. | Med-High | If a host cannot render a pointer and needs full inline content (then accept the echo cost, guard with content-hash drift). |
| 8 | **Host composition** | Import **human-authored layers only** (Claude `CLAUDE.md`-adjacent memory dir now; Codex/Copilot follow-ons) — **never** a host's own auto-memory dir, session-replay JSONL, cloud-routed, or other projects. Imports default **`needs-review`**. Echo defense = exact-sentinel **+** import-side denylist of host auto-memory paths **+** cross-origin (paraphrase) dedup vs ctx-origin gists **+** content-hash drift on pushed blocks. | cross-host ingestion live (B); physical-separation convergence (codex+claude, `workstream-B #16`); gemini inbox Dismiss-first (#3); `sentinel.ts:8` exact-only; paraphrase forced by E6 | **Translate** (needs-review, inbox) / **Decline** (import host auto-memory, mem0 additive-never-resolve) | `claudeImporter.ts:224` active→needs-review; add denylist + cross-origin echo check; **wire import via mtime dirtyCheck** (currently dead, `workstream-A §2.1`). | High | A host guaranteeing its auto-memory is human-curated (none does today). |
| 9 | **Human vs agent** | Agents: fast recall (10% section), `[handle]` drill-down, push gotchas at session start, provenance to reject; agents may write (`remember`). Humans (guide, **read-only**): review queue, evidence drawer, supersession timeline, stale-list, pin/veto — curation via CLI, guide never writes. **Review queues + evidence drawers > richer auto-recall.** | `CONTEXA-DESIGN.md:181,184-187,240-241`; review-queue UX near-novel — must build fresh (`workstream-B cross-corpus`); guide unbuilt/M3 (`workstream-A §2.4`) | **Adopt** | Build the M3 guide read-only data layer (E's `EG-*`); `needs-review` currently has no producer **or** consumer. | High | — |
| 10 | **Evaluation** | Deterministic **E-series** benchmark: fixture repo with seeded stale/superseded/retired/dup/echo; assert **id-level set membership** (not text overlap); `test.todo` encodes each missing mechanism; no LLM/embeddings/network. | `workstream-E` (E1-E7+EG); mem0 §3.2 (text-overlap misleads → id-level); LOCOMO/LongMemEval taxonomy (C 6.1) | **Adopt** | Land `packages/core/tests/acceptance/e-memory-quality.test.ts` + `helpers/memoryFixture.ts`. | High | — |

### Rule 9 — options considered and rejected (per decision, compact)

- **D1.** Considered: memory as a standalone subsystem with its own store/ranker (mem0/letta shape). **Rejected** — duplicates the shared graph, breaks index-not-copy economy, and every such system in the corpus auto-merges (invariant-5 violation).
- **D2.** Considered: rank privacy/egress #1 (it is catastrophic). **Rejected as the *design driver*** — it is prevented by construction (no network at write/serve, `serve/egress.ts`), so it is a standing gate, not a tradeoff axis; false/echo/stale are the live, undefended costs.
- **D3.** Considered: (a) automatic capture from the compressor tap; (b) mem0's LLM ADD/UPDATE/DELETE selector; (c) a-mem neighbor auto-rewrite. **Rejected** — (a) tap is session-scoped, not project knowledge (`CONTEXA-DESIGN.md:204-206`); (b)/(c) LLM-at-write + auto-resolve (invariants 1+5; reconsolidation, `workstream-D D-3`).
- **D4.** Considered: TTL/age-based auto-expiry; destructive merge on dedup; delete-from-index (mem0 DELETE). **Rejected** — a 2-year-old true invariant is still true (time-decay of facts is dangerous, C 1.6); merge/delete lose provenance (invariant 8, D-1).
- **D5.** Considered: relevance/recency as the freshness proxy; boolean stale flag; auto-retire on drift. **Rejected** — stale reads as relevant (survey §3.2); boolean loses the review-queue's reason handling (`CONTEXA-IMPL.md:285-287`); auto-retire is reconsolidation-style rewriting (D-3).
- **D6.** Considered: `served_count`/usage boost (in §4 prose); embedding relevance; recency-dominant decay. **Rejected** — popularity ≠ correctness and self-reinforces (C 4.5, D-5); embeddings violate invariant 2; recency-dominant makes a recent-wrong note outrank an old-correct one (C 4.4).
- **D7.** Considered: recency-ordered notes; surfacing unresolved review items in push; full-content inject. **Rejected** — over-retrieval harms (A-MEM §4.5); review items belong in the guide, not the always-loaded floor; full inject double-injects (echo, `workstream-B #4`).
- **D8.** Considered: import host auto-memory dirs (Claude/Windsurf/Codex `memories/`); default imports `active`; rely on exact-sentinel alone. **Rejected** — those are the host's *own* write surface (echo, `workstream-B decline`); `active` skips review (unreviewed-import); exact-sentinel misses paraphrase (`sentinel.ts:8`, E6).
- **D9.** Considered: a writable guide (confirm/retire from the UI); richer automatic recall over review tooling. **Rejected** — FORK-1/P23 fixed guide read-only (`CONTEXA-DESIGN.md:240`); faithful+reviewable beats adaptive+lossy (brief bias; the evidence drawer is a zero-precedent differentiator, `workstream-B cross-corpus`).
- **D10.** Considered: LLM-as-judge scoring; lexical F1/BLEU. **Rejected** — non-reproducible/networked (invariants 1+3); text-overlap scores "March" vs "July" as near-correct (mem0 §3.2) — must assert id-level.

---

## 3. Current ctx Assessment (intended design vs current code)

### Already right (keep)
- **Memory as a thin content-type over the shared graph** — one `kind`, one lifecycle table, two
  writers, generic selection. `from-code workstream-A §0,§5`.
- **Non-destructive supersede** — old row kept + re-statused `superseded` + `supersedes` link
  (`remember.ts:235-253`). Independently validated by graphiti/mem0 (C 1.2) and D-1/D-3.
- **Non-destructive dedup** — `fuzzyDuplicate` → `sameAsCandidate` only, entropy floor +
  differing-numbers veto + Jaccard 0.6 (`dedup.ts`). This is the *shape* the whole corpus lacks
  (`workstream-B cross-corpus`: invariant-5 review queue is near-novel).
- **Success-shaped recoverables, gist ≤240, push ≤1KB by construction, zero-egress enforced,
  claims append-only, project-relative paths, import never writes `~/.claude`** — all enforced in
  code (`workstream-A §3`).
- **Ranking reuse** — push reuses the selection primitives (one scale for pull and push,
  `push/rank.ts`); FTS5-first is empirically validated by the corpus (`workstream-B` basic-memory,
  cognee, memsearch, jayzeng).

### Implemented but risky (fix)
- **Status does not gate pull** `from-code, VERIFIED` — `retired`/`superseded` served by
  `context()`/`search()` (`select/*` filters only `gen`, `visibility.ts:44-52`). *False-memory
  vector.* → status-aware selection (D6/D9).
- **`sameAsCandidate` never filed as a conflict** — importer emits the link but never calls
  `addConflict`; the only caller is docs stale-suspect (`docs.ts:371`). Dedup runs but is invisible
  (`workstream-A §2.7`). → file it as a `sameAsCandidate` conflict.
- **`remember()` never dedups** — manual writes can silently duplicate (`workstream-A §8`). → the
  D3 pre-write reconciliation.
- **Push rank is authority×recency**, missing the ratified `usage` + `anchor-freshness`
  (`workstream-A §2.2`). `usage` should stay out (D6); `anchor-freshness` should land (D5).

### Missing but important (build)
- **Anchor-freshness pass** (D5/E2) — designed, M2-gated, currently *total* absence.
- **Host-import wiring + `needs-review` default** (D8) — import is *unreachable today*
  (`workstream-A §2.1, VERIFIED`); wire via mtime `dirtyCheck`, default `needs-review`.
- **Paraphrase / cross-origin echo defense** (D8/E6) — exact-sentinel only today.
- **The M3 read-only guide** (D9) — review queue + evidence drawer + stale-list; `needs-review`
  has no producer or consumer without it.

### Missing and not worth doing now
- Cross-host dedup beyond Claude (no second importer yet — `workstream-A §2.5`); `human-note`
  origin + `session_ref` auto-capture (adjacent compressor track); community summaries / graph
  clustering (LLM or low-value, C 5.3).

### Overbuilt or misleading
- **`ctx import`'s "imported automatically on cold-path sync" message is false as built**
  (`cli.ts:242-245`, `VERIFIED`). Fix the wiring or the message.
- **`served_count`/`last_served` columns** are a latent half-feature inviting a dangerous signal
  (`CONTEXA-IMPL.md:108-109`) — keep unwired or repurpose as telemetry-only, explicitly.
- **`listMemories` opens a second SQLite connection** because the `Store` interface lacks
  enumeration (`remember.ts:360-393`) — an API seam worth closing.

---

## 4. Recommended Memory Model (in ctx terms)

- **Unit.** A `memory` entity (`mem:<ulid>`) + a `memory` lifecycle row: `gist ≤240` + optional
  `detail` (the sole index-not-copy exception, `locator:{t:'store'}`), anchors, `origin`,
  `authority`, `status`. Unchanged from today (`from-code`).
- **Authority.** Two tiers: `confirmed` (human/agent assertion via `remember`) and `inferred`
  (host-import / derived). Authority boosts ranking (×1.3) but is never a hard filter — evidence
  policy is. `from-code select/rank.ts`; `from-doc CONTEXA-DESIGN.md:124`.
- **Provenance.** Every anchor is an `anchoredTo` claim (carrier/method/authority/at) in the
  append-only ledger; every supersede/dedup is a claim+link. Add a **change-ledger row per lifecycle
  transition** (currently none, `workstream-A §1.4`) so "why/when did this become needs-review" is
  auditable. `Translate` cognee's rich stamp / mem0 history (`workstream-B #8`).
- **Anchors.** Resolve all-or-nothing at write (no half-anchored memory); `file:` auto-create when
  the target exists; **freshness is structural** — a drifted/removed target is detected on code/docs
  re-ingest and reason-classified, not inferred from relevance.
- **Lifecycle.** `active → needs-review → {active | retired}`, `active → superseded` (via
  supersede). All transitions retain the row. Hosts import to `needs-review`. Anchor drift →
  `needs-review`.
- **Freshness.** Rides the code/docs invalidation machinery (`dependency_index` + `content_hash`,
  `CONTEXA-IMPL.md:96-98,259`): drift → `stale-suspect` conflict
  (`target-removed·signature-changed·body-changed·referencer-changed`) → down-rank + push-exclude +
  review-queue. Never wall-clock auto-expiry of facts (C 1.6).
- **Ranking.** RRF fusion of FTS5 lexical + anchor-proximity (PPR/BFS) + anchor-freshness +
  authority, MMR-style lexical de-dup (reuse `dedup.ts` Jaccard) to keep near-duplicates out of a
  response, hard output caps. **Status-gated**: retired excluded, superseded down-ranked + conflict
  -surfaced. **Refuse** served_count/usage and embeddings. `Adopt/Translate` (C theme 4).
- **Push eligibility.** Confirmed + active + fresh-anchor gotchas only; exclude retired, superseded,
  needs-review, stale-anchor, echo-risk, and low-value restatement (G3/F4). Pointer-at-session-start
  vs full-inject-mid-session to avoid double-injection. ≤1KB by construction. `Translate`
  (`workstream-B #4,#5`).
- **Host imports.** Human-authored layers only; default `needs-review`; import-side denylist of host
  auto-memory dirs; cross-origin echo check (incoming host gist vs ctx-origin/pushed gists) +
  content-hash drift on pushed blocks; wire via mtime `dirtyCheck`. `Translate/Decline`
  (`workstream-B #3,#12,#14,#16`).
- **Human review.** The read-only M3 guide: review queue (drains `needs-review`), evidence drawer
  (per-fact carrier/locus/method/authority/at), supersession timeline, stale-reference list, pin/veto
  state. Mutations via CLI only. `from-doc CONTEXA-DESIGN.md:181,240`.
- **Agent retrieval.** `context()`/`search()` return status-filtered, provenance-carrying memory at a
  10% section cap with `[handle]` drill-down to `detail`; push delivers the gotcha floor at session
  start. Agents write via `remember()` (now with pre-write reconciliation).

---

## 5. Scope Cut

**Must do now (M1/early-M2, correctness-critical, all deterministic):**
1. **Status-gate the pull path** — exclude `retired`, down-rank `superseded` + surface via conflicts
   in `select` (`workstream-A §2.8`). *Closes the live false-memory vector.*
2. **File `sameAsCandidate` as a conflict** so dedup is visible (`workstream-A §2.7`).
3. **Host-import default `needs-review`** (`claudeImporter.ts:224`) — one-line default flip, but land
   it *with* (4).
4. **Wire host import** via an mtime-aware memory `dirtyCheck` (or an explicit cold-path call) and fix
   the false `ctx import` message (`workstream-A §2.1`).
5. **Land the runnable half of the E-series** as regression guards (E1/E3/E4/E7/E0 + sentinel-half of
   E6 + budget-half of E5).

**Should do after measurement / M2-M3:**
- **Anchor-freshness pass** (E2) on the M2 code source — the top missing mechanism.
- **`remember()` pre-write reconciliation** (codex-memory 6-verdict, deterministic) — measure
  duplicate rate first to size the win.
- **Paraphrase/cross-origin echo defense** (E6) + import-side denylist.
- **The M3 read-only guide** (EG-*) — review queue, evidence drawer, stale-list.
- **Push restatement demotion** (G3/F4) + pointer-vs-inject split.
- **Change-ledger row per transition**; **optional `valid_from/valid_to`** on the memory row.

**Do not do:**
- Any LLM/embedding/network at write or serve (reflection, semantic dedup, LLM op-selector, remote
  instructions) — invariants 1/2/3 (`workstream-C decline ledger`).
- `served_count`/usage as a ranking signal — popularity hazard (C 4.5, D-5).
- Destructive merge/delete/auto-expiry; auto-retire on drift — provenance/reconsolidation
  (D-3, invariant 8).
- Import a host's own auto-memory directory; write ctx content into one (`workstream-B decline`).
- A writable guide (FORK-1/P23).

**Open questions (maintainer judgment):**
- Should `superseded` be **down-ranked** or **hard-excluded** from pull? (I recommend down-rank +
  conflict-surface so "what did we believe before" stays answerable; retired = hard-exclude.)
- Anchor-drift **status flip** vs **rank-only**: flip to `needs-review` may be noisy under
  `body-changed` churn — start with `target-removed`/`signature-changed` flipping, `body-changed`
  down-rank-only. (Ties to M2 `content_hash` granularity.)
- Should `remember()` **block** on a `MERGE_REQUIRED`/`ASK_USER` verdict (success-shaped guidance) or
  write-then-flag `needs-review`? (Twin blocks; ctx's success-shaped style favors guidance.)
- Close the `Store` enumeration seam (drop `listMemories`' second connection)? — small, but an API
  register (`workstream-A §4`).

---

## 6. Evaluation Plan (deterministic, network-free, no-LLM)

Full spec: `workstream-E-evaluation.md`. Summary of the contract:

- **Harness reuse.** `openStore({projectDir, home, now})` under temp `CONTEXA_HOME` (G-7), injected fixed
  clock, `assertNoEgress` armed, script-generated git + `seedClaudeMemory` fixtures. New suite:
  `packages/core/tests/acceptance/e-memory-quality.test.ts` + `helpers/memoryFixture.ts`. Pending
  mechanisms are `test.todo` — **the failing test IS the spec** for the missing feature.
- **Fixture.** ~9-file synthetic service (code + docs + 2 ADRs + git history + `.contexa/push.jsonc`) +
  a fake `claudeHome` memory dir, deliberately planting: a removed anchor (`src/auth.ts` deleted in
  C2), a symbol-drift anchor (`redeliver()` signature change in C3), a superseded pair, a retired
  note, near-dup host memories (Jaccard≥0.6) + a differing-numbers negative (ADR 0011 vs 0013), a
  managed-sentinel echo + pure-echo file, and a paraphrase echo.
- **Scoring rule.** **id-level / anchor-id set membership**, never text overlap (mem0 §3.2 caution);
  ranking asserts *position* (`findIndex < 3`) against the fixed FTS+select engine; every test carries
  a failure label from the fixed vocabulary.

| Task | Capability | Pass/fail (one-line) | Today? |
|---|---|---|---|
| **E1** | recall precision (`missing`) | target memory in `search` top-3; noise never outranks; handle round-trips `recall` | ✅ |
| **E2** | stale-anchor (`stale`) | after target delete+re-ingest: memory→`needs-review` + open `stale-suspect` w/ reason `target-removed`; still `recall`-able; absent from push | ⏳ forces **anchor-freshness pass** |
| **E3** | supersede (`stale`) | v1→`superseded`, absent from active+push, `recall`-able, `supersedes` link v2→v1 | ✅ |
| **E4** | duplicate-import (`duplicate`) | near-dups kept separate + `sameAsCandidate`(0.5); differing-numbers → no link | ✅ |
| **E5** | push usefulness (`irrelevant-push`) | ≤`PUSH_MAX_BYTES`; includes 2 active; excludes retired/superseded (today), stale/echo (pending) | ◑ partial |
| **E6** | echo prevention (`host-echo-loop`) | no `ctx:managed` in any imported gist + pure-echo skipped (today); paraphrase not admitted as independent active (pending) | ◑ forces **cross-origin echo detection** |
| **E7** | provenance (`unanchored`) | each served memory exposes origin/authority/status/anchors + backing `anchoredTo` claim (carrier/method/authority) | ✅ |
| **EG-\*** | guide review queue / evidence drawer / stale-list / read-only | assert on the read-only data layer that backs M3 | ⏳ forces **M3 guide** + import→needs-review |

**Pending tests double as the build spec** for: anchor-freshness (E2), push stale/echo veto (E5),
cross-origin paraphrase echo (E6), the M3 read-only guide (EG-*), and the host-import `needs-review`
default (EG-review). Runnable-today tests guard against regression immediately.

---

## 7. Evidence Appendix

**From-code (current implementation, `packages/core/src`):**
- `memory/remember.ts` — write path; confirmed default `:207`; supersede keeps+restatus `:235-253`;
  gist cap `:138`; `listMemories` second connection `:360-393`; no dedup call (`workstream-A §8`).
- `memory/dedup.ts` — entropy floor (2.5 bits/24 chars) + differing-numbers veto + Jaccard 0.6 →
  `sameAsCandidate` only.
- `memory/sentinel.ts` — exact `ctx:managed` block strip; paraphrase out of scope `:8`.
- `memory/claudeImporter.ts` — import authority `inferred` + **status `active` `:224`**; within-host
  dedup `:236-263`.
- `memory/adapter.ts` — `dirtyCheck` hard-coded clean `:17-19` (VERIFIED: detaches import from
  refresh).
- `ingest/refresh.ts:123-124` — ingest only `dirty===true` (VERIFIED). `cli.ts:242-245` — false
  "imported automatically on cold-path sync" (VERIFIED). `M1-REALITY-CHECK.md:16,73-77` — live store
  `memory 1`.
- `push/block.ts` — ≤1KB `:27`, fixed header `:36-39`, greedy `:94-102`; `push/rank.ts` — active-only
  `:76`, authority×recency, veto-wins.
- `select/visibility.ts:44-52` — `gen<=published_gen` only, **no status** (VERIFIED). `select/rank.ts`
  — `exp(-age/90d)` memory/history only, authority ×1.3; `select/*` has no status handling (VERIFIED).

**From-doc (design/spec):**
- `CONTEXA-DESIGN.md:52` (memory=content type), `:123-124` (soft-confidence/evidence-policy),
  `:143-144` (push rank 4 factors — usage aspirational), `:181` (guide Knowledge page), `:204-206`
  (tap=provenance), `:240-241` (guide read-only).
- `CONTEXA-IMPL.md:95` (`stale-suspect` kind), `:96-98,162-165,259` (anchor invalidation ride),
  `:108-109` (`served_count` columns), `:285-287` (reason classes), `:330-341` (ranking, 10% memory),
  `:540-546` (M2/M3). `FABLE-DECISION-LOG.md:131-133` (P21). `FABLE-DORA-REVIEW.md:156,197,224`
  (G3/F4 restatement). `M2-GOAL-PROMPT.md:57` (anchor-drift M2).

**From-reference (corpus — mechanisms, not targets):**
- **codex-memory** ★ deterministic 6-verdict `--prewrite` (`scripts/codex_memory_closeout.py:56-63,
  278-349`) — maps 1:1 to ctx invariant 5 (`workstream-B #13`).
- **gemini-cli** Path B inbox/Dismiss-first (`skill-extraction-agent.ts:82-87`,
  `InboxDialog.tsx:106-138`) — needs-review precedent (`workstream-B #3`).
- **graphiti/Zep** bitemporal never-delete (`edges.py:271-277`); LLM detector declined
  (`edge_operations.py:493`) — `workstream-C 1.1-1.2`.
- **mem0** ADD/UPDATE/DELETE/NOOP → translate; LLM op-selector declined (`workstream-C 2.1-2.2`).
- **branch-memory-manager** pointer-vs-full-inject (`workstream-B #4`); **physical separation**
  codex+claude (`workstream-B #16`); **cross-host ingestion live** (Claude `/init` `memory.md:148`;
  Zed `.rules`).
- **Papers**: survey §3.2 (stale reads as relevant); A-MEM §4.5 (over-retrieval harms); gen-agents
  §4.2 reflection (decline); mem0 §3.2 (text-overlap misleads → id-level eval).

**Biology (constraint-check only, `workstream-D`):** D-1 adaptive forgetting = reduced accessibility
not erasure (supports hide/down-rank-not-delete); D-2 cue-dependent recall (supports anchor-freshness);
D-3 reconsolidation (warns against rewrite-on-recall / LLM-consolidation — the strongest check,
independently validating no-LLM-at-serve + surface-don't-average); D-4 cue overload (supports push
precision caps); D-5 spacing/salience (served_count = bounded tie-breaker at most, never primary).

**Inferred:** the failure-priority ranking, the "memory quality = precision+trust over recall"
objective, the pre-write-reconciliation recommendation for `remember()`, and all "implementation
impact" cells are synthesis across the above, not direct claims from any single source.
