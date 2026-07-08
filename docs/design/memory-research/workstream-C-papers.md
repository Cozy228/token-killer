# Workstream C — Research & Papers (decision-anchored extraction)

**Scope.** Six papers under `.research/memory/_papers/`, read against ctx's hard invariants. For each idea:
**adopt** (works deterministically within ctx invariants) / **translate** (keep the idea, drop the
LLM/embedding/network part — exact deterministic form given) / **decline** (attractive but violates an
invariant — invariant named) / **irrelevant**. Grounded on clone code where cheap.

**ctx invariants referenced** (shorthand):
`I1` no LLM at write/serve · `I2` no embeddings · `I3` no network at write/serve · `I4` one local
SQLite+FTS5 store/project · `I5` index-not-copy (except memory/concepts) · `I6` provenance per fact ·
`I7` conflicts surfaced, not averaged · `I8` superseded kept, not deleted.

**ctx mechanisms this extraction builds on** (from-code):
- `remember(note, anchors?, supersedes?)` — explicit, non-destructive supersede: old entry re-statused
  `superseded`, KEPT, `supersedes` claim+link added (`packages/core/src/memory/remember.ts:235-253`).
- Lifecycle `active | needs-review | superseded | retired` (`remember.ts:319-325`).
- Deterministic dedup: word-set **Jaccard ≥0.6** + **entropy floor** (≥2.5 bits, ≥24 chars) +
  **differing-embedded-number veto** → yields only a `sameAsCandidate` link, **never a merge**
  (`packages/core/src/memory/dedup.ts:19-92`).
- FTS5 candidate generation for anchor/supersede resolution (`remember.ts:78-97`, `store.ftsSearch`).
- Anchors → `anchoredTo` claims+links; auto-create `file:` entity when the file exists
  (`remember.ts:111-132, 210-228`).
- Append-only, generation-stamped `claims` table = the provenance ledger (`remember.ts:212-252`).
- Push digest ≤1KB, ranked by recency × anchor-freshness, each item a handle (CONTEXA-DESIGN §push).

---

## Theme 1 — Temporal validity & fact invalidation (bitemporal)

**Divergence — the full option space the literature offers for "when does a fact stop being true, and
how is that recorded?"**

1. **No temporal model** — a fact is present or absent; overwrite on change (naive KV, MemGPT
   `working_context.replace`).
2. **Single valid-time stamp** — `valid_at` only; a later fact implicitly supersedes (generative-agents
   creation timestamp; A-MEM note `t_i`).
3. **Uni-temporal transaction log** — append-only history of writes with `created_at`/`is_deleted`
   (mem0 `add_history`).
4. **Bitemporal edges** — two independent axes: *valid time* `T` (when the fact was true in the world)
   and *transaction time* `T'` (when the system learned/retracted it), four stamps per edge
   (Zep/Graphiti).
5. **Explicit supersede link, no timestamps on validity** — status flip + `supersedes` edge; time is
   implicit in the write order (ctx today).

| # | Idea | Source | Label | Deterministic ctx form | Decision | Reason |
|---|------|--------|-------|------------------------|----------|--------|
|1.1|**Bitemporal data model**: edge carries `valid_at`/`invalid_at` (world time) + `created_at`/`expired_at` (system time)|Zep §2.1–2.2.3 p2-3; clone `graphiti/graphiti_core/edges.py:54,271-277`|**adopt** (data model) / **decline** (its LLM populator)|Add optional `valid_from`/`valid_to` to `memory_meta`, and treat the existing `gen`/ULID create-time as transaction time. `valid_*` set ONLY from explicit `remember()` args or supersede time — never inferred|5, 4|Bitemporal storage is pure schema (I4-safe). The **detector** that fills it (Graphiti uses `llm_client` to spot contradictions, `edge_operations.py:325,493`) violates I1 — decline that half|
|1.2|**Invalidation is non-destructive**: contradicted edges get `invalid_at`/`expired_at` set, row is kept "to enable temporal reasoning"|Zep §2.2.3 p3; mem0 §2.2 p6 ("marking them as invalid rather than physically removing")|**adopt** (already ctx)|This is exactly `remember(supersedes)`: old entry → `superseded`, KEPT (`remember.ts:236`). Add `valid_to = supersede_time` so the retired fact still answers "what was true then"|4, 5|Confirms I8 from two independent systems. ctx should additionally record WHEN, not just THAT, a fact was retired|
|1.3|**"Outdated knowledge fails WITHOUT overt indication; though factually incorrect it still shows high semantic relevance"**|Survey §3.2 p4 (Temporal Validity of Knowledge)|**adopt** (as design evidence)|Freshness must be a **structural, independently-tracked** signal (anchor content-hash / target-exists), NOT something retrieval infers from relevance. Stale facts are lexically relevant by construction|5, 6, 2|The single strongest argument for anchor-freshness as a first-class ranking axis. A relevance-only ranker will surface stale facts precisely because they read as on-topic. Names the "stale memory" failure|
|1.4|**Facts served WITH their valid date range** in the context block ("FACT (Date range: from - to)")|Zep §3 p4 (context template)|**adopt**|`context()`/push render each memory with its freshness/validity tag (fresh · stale-anchor · superseded-at). Handle-level detail carries `valid_from/to`|6, 7|Cheap, deterministic, and turns temporal status into surfaced provenance (I6/I7) instead of a hidden ranking tweak|
|1.5|**Temporal-extraction prompt** parses "two weeks ago" → ISO `valid_at`, present-tense → now, don't infer from related events, year-only → Jan 1|Zep §6.1.5 p10|**decline** (mechanism) / **adopt** (rules as human-authoring guidance)|No NL date parsing at write (I1). But the *rules* ("only set a date explicitly stated; never infer") become the doc for how a human/agent fills `valid_from` via `remember()`|3, 5|Parsing is LLM. The conservatism rule ("don't infer") is exactly ctx's evidence discipline and transfers as authoring policy|
|1.6|**"Conditional not eternally valid"** framing — dynamic-environment facts decay; needs "policies for decay"|Survey §3.2 p4|**translate**|Decay = lifecycle visibility + anchor-freshness down-rank, NOT deletion and NOT time-based auto-expiry of factual notes. A note decays only when its *anchor* moves (content-hash change), which is observable|4, 5|A blind time-decay on facts is dangerous (a 2-year-old true invariant is still true). Tie decay to anchor change, which is a real, deterministic event|

**Convergence.** Adopt the bitemporal *schema* (valid vs transaction time) as an optional extension of
`memory_meta`; keep the *populator* human/explicit. ctx already has the non-destructive half (1.2); the
gap is recording *when* validity ended and surfacing it (1.4). The load-bearing insight is 1.3: **stale
facts do not announce themselves through relevance**, so freshness must be tracked structurally.

---

## Theme 2 — Conflict & supersession

**Divergence — the full option space for "a new fact contradicts an old one":**

1. **Overwrite in place** (destructive) — MemGPT `working_context.replace("Boyfriend","Ex-boyfriend")`
   (§2.2 Fig 4); A-MEM memory evolution `m_j* replaces m_j` (§3.3 Eq 7).
2. **Delete-from-index + audit log** — mem0 `DELETE`: vector removed, `add_history(...,is_deleted=1)`
   (clone `mem0/mem0/memory/main.py:2034-2044`).
3. **Invalidate + keep** — Graphiti sets `expired_at`/`invalid_at`, row stays (Zep §2.2.3).
4. **Merge/augment** — mem0 `UPDATE` folds new info into the existing memory (§2.1 p4).
5. **Explicit supersede link + status flip, both kept** — ctx `remember(supersedes)`.
6. **Flag as duplicate/conflict, resolve nothing automatically** — ctx `sameAsCandidate` (dedup.ts).

| # | Idea | Source | Label | Deterministic ctx form | Decision | Reason |
|---|------|--------|-------|------------------------|----------|--------|
|2.1|**ADD / UPDATE / DELETE / NOOP** operation vocabulary for reconciling a new fact against similar existing ones|mem0 §2.1 p4, Fig 2; clone `main.py:2007(UPDATE),2039(DELETE)`|**translate**|Keep the *vocabulary*, remap to non-destructive ops: **ADD**→`remember()`; **UPDATE**→`remember(supersedes)` (never mutate in place); **DELETE**→status `retired`/`superseded` (kept); **NOOP**→dedup match → `sameAsCandidate`. Drop the LLM tool-call selector|4, 3|The 4-way taxonomy is the right shape. But mem0's UPDATE mutates and DELETE removes from the served index (I8 violation), and the *selector* is an LLM (I1). ctx's supersede/retire/sameAs already cover all four non-destructively|
|2.2|**Selector is the LLM's own reasoning, not a classifier** ("we leverage the LLM's reasoning to directly select the operation")|mem0 §2.1 p4|**decline**|Op is chosen by the human/agent author via the explicit `supersedes` arg, or deferred to the review queue|3|I1. A per-write LLM decision is exactly what ctx forbids at write time|
|2.3|**Candidate set scoped to same subject-predicate pair** before comparing (edge dedup "constrained to edges existing between the same entity pairs")|Zep §2.2.2 p3|**adopt**|Scope supersede/duplicate candidate search to memories **sharing an anchor set** (or overlapping anchors), not the whole store. Cheap SQL join on `anchoredTo`|3, 4|Deterministic, shrinks the comparison to structurally-related facts, and raises precision of duplicate/conflict detection. Directly reusable against ctx's anchor graph|
|2.4|**Duplicate detection stays a *candidacy* signal, never an automatic merge**|ctx dedup.ts:11-14; contrasts A-MEM §3.3, mem0 UPDATE|**adopt** (already ctx) — reinforced by decline of the alternatives|Keep `fuzzyDuplicate → sameAsCandidate`. Surface the pair in the review queue; a human confirms merge-by-supersede|2, 4, 7|I7 (surface, don't average) + I8. A-MEM and mem0 both auto-resolve and lose the loser; ctx must not|
|2.5|**Entity/fact resolution via embedding cosine + BM25 candidates, then LLM adjudication**|Zep §2.2.1 p3; mem0 §2.2 p6; A-MEM §3.2 Eq 4-6|**translate** (candidate gen) / **decline** (adjudication)|Candidate gen = FTS5/BM25 lexical + shared-anchor overlap (ctx already: `ftsSearch`, `candidatesFor`). Drop the embedding leg (I2) and the LLM `is_duplicate` prompt (I1). Adjudication = deterministic Jaccard+entropy verdict, else human|3, 6|The *hybrid-candidate → judge* pipeline is sound; ctx keeps only the deterministic legs it already has|
|2.6|**mem0 keeps an append-only history even on DELETE/UPDATE** (`add_history` with prev/new value)|clone `main.py:1034,2039,2660`|**adopt** (partial) — ctx does it better|ctx's `claims` table already is this append-only, generation-stamped ledger (`remember.ts:212`). Note the gap vs mem0: ctx keeps the retired fact in the **active graph** (queryable by status), not only in a side audit log|4, 6|Even the destructive systems preserve an audit trail — validates I6. ctx's advantage: the superseded fact is still a first-class, retrievable node, so "what did we believe before?" is answerable without replaying a log|

**Convergence.** ctx's `supersedes` + `retired` + `sameAsCandidate` triad already *is* the
non-destructive superset of ADD/UPDATE/DELETE/NOOP. The two transferable upgrades: **2.3** scope
candidate search to shared-anchor facts, and **2.1** document the op-mapping so importers/agents reach
for supersede instead of wanting a mutate. The decisive decline is **2.2**: no per-write LLM selector.

---

## Theme 3 — Reflection / consolidation (and its deterministic analogue)

**Why Contexa cannot use LLM-style reflection at write/serve.** Every reflection design in the literature is
an LLM that reads N raw records and writes back a NEW, higher-level record that then becomes
independently retrievable and itself re-reflectable. That collides with ctx on three invariants at once:
**I1** (LLM at write), **I6** (the synthesized item's provenance is a summary, not a source — the survey
says reflection makes `m'_i` "an **independent** memory entry, **decoupling** the valuable logic from
the original trajectory," §2.2 p3), and it is a **reconsolidation hazard**: a machine-authored abstraction
re-entering the store can be re-summarized, amplifying drift and manufacturing the ctx→host→ctx
**echo loop** in miniature.

**Divergence — the full option space for "reduce many memories into fewer/better ones":**

1. **Recursive summarization on eviction** (LLM) — MemGPT queue flush (§2.2).
2. **Periodic importance-triggered reflection tree** (LLM), evidence-cited — generative-agents §4.2 Fig 7.
3. **Note evolution**: each new note rewrites its neighbors' content/tags (LLM, destructive) — A-MEM §3.3.
4. **Introspective self-critique** (LLM, no external ground truth) — Survey §4.2 (highest hallucination risk).
5. **Environment-anchored correction** (LLM, corrected against real outcomes) — Survey §4.2.
6. **Cross-trajectory MDL abstraction into rules** (LLM/fine-tune) — Survey §4.3, §5.
7. **Deterministic consolidation** = cluster near-duplicates + human-authored merge — (no paper; ctx analogue).

| # | Idea | Source | Label | Deterministic ctx form | Decision | Reason |
|---|------|--------|-------|------------------------|----------|--------|
|3.1|**Reflection = periodic LLM synthesis of higher-level insights, triggered when cumulative importance > threshold**|gen-agents §4.2 p6-7|**decline** (write-back) / **future** (offline proposal)|No machine-authored facts enter the store. If ever offered, only as an **offline, on-demand-LLM *proposal*** landing in `needs-review`, never auto-active — mirrors ctx's existing "on-demand LLM decision-node proposal (Inferred)" pattern|3, 4|I1 + reconsolidation/echo hazard. The *trigger* concept (act when backlog crosses a threshold) is reusable deterministically → 3.5|
|3.2|**Evidence-cited synthesis**: every reflection stores pointers to the records that justified it|gen-agents §4.2 p7 ("cite the particular records")|**adopt** (as a hard rule)|Any derived/consolidated item MUST carry `derivedFrom` claims to its sources. ctx already does this via claims/links; make it a gate on *any* future consolidation feature|3, 6|Even the LLM systems recognize provenance is mandatory — ratifies I6. This is the guardrail that would make a future consolidation feature acceptable|
|3.3|**A-MEM memory evolution**: `m_j* ← LLM(...)` then `m_j* replaces m_j`|A-MEM §3.3 Eq 7 p5|**decline** (hard)|Never. If two memories should become one, that is `remember(supersedes)` authored by a human/agent, both kept|4, 2|Double violation: I1 (LLM at write) **and** I8 (original overwritten). The canonical anti-pattern for ctx; the clearest reconsolidation-risk exemplar|
|3.4|**Introspective vs environment-anchored reflection** — self-critique hallucinates; correction anchored to external outcomes is safer|Survey §4.2 p5-6|**translate** (the anchoring principle)|ctx's "external ground truth" is the **actual code/docs state**. Corrections are never self-generated; a note is only ever flagged wrong when its *anchor* changes (content-hash) or a human supersedes it|4, 5|Turns the biology/agent lesson ("correction must be anchored to reality, not to the model's own belief") into ctx's anchor-freshness machinery, deterministically|
|3.5|**Threshold-triggered consolidation** (act when backlog of raw items crosses a bound)|gen-agents §4.2 (importance>150); MemGPT memory-pressure flush §2.2|**translate**|Deterministic trigger: when *M* unreviewed or *K* `sameAsCandidate`-linked memories accumulate, raise a **review-queue nudge** — surface the cluster to a human; don't auto-consolidate|4, 9|The trigger is a counter, not an LLM. Fits ctx's review-queue-over-auto-recall stance (decision 9)|
|3.6|**MDL: goal of consolidation is compressing redundancy** (`\|K\| ≪ Σ\|τ\|`)|Survey §2.2 Eq 6, §4.3|**translate**|ctx compresses by **de-duplication + supersession**, not abstraction: fewer *active* facts because duplicates are linked and stale ones are `superseded`, while all bytes are retained. Compression of the *served set*, not of the *stored set*|4, 7|Captures the legitimate aim (less redundant context served) without the lossy LLM abstraction. Aligns with ctx-as-token-killer: shrink what's served, keep what's stored|
|3.7|**Cross-trajectory abstraction into reusable skills/rules** ("universal rules K **detached** from any specific scenario")|Survey §4.3, §5, Table 1|**irrelevant / decline**|Out of ctx scope: ctx stores project *facts* with provenance, not behavior policies. "Detached from any scenario" is the opposite of ctx's provenance-attached facts|—|Different product (agent skill-learning). "Detached" directly negates I6. Matches ctx D1 (agent memory ≠ wiki/skill authoring)|

**Convergence.** ctx's deterministic analogue of reflection is: **(a)** duplicate/cluster detection
(existing Jaccard→`sameAsCandidate`), **(b)** a threshold-triggered review-queue nudge (3.5), **(c)**
human-authored merge-by-supersede — with **evidence-citation mandatory** (3.2) if any machine
proposal is ever added, and it lands in `needs-review`, never active. No fact is ever machine-rewritten
(3.3 declined). "Consolidation" for ctx means compressing the **served** set, not the **stored** set (3.6).

---

## Theme 4 — Memory streams & scoring (recency × importance × relevance)

**Divergence — the full option space of ranking signals the literature uses**, tagged by whether each is
computable deterministically without embeddings/LLM:

| Signal | Source | Deterministic without I1/I2? |
|--------|--------|------------------------------|
| **Lexical relevance** (BM25 / full-text) | Zep §3.1 (`φ_bm25`) | **Yes** — SQLite FTS5 |
| **Semantic relevance** (cosine on embeddings) | gen-agents §4.1; A-MEM §3.4; Zep `φ_cos` | **No** — embeddings (I2) |
| **Recency** (exp. decay over time since last access) | gen-agents §4.1 (decay 0.995) | **Yes** — but hazardous (below) |
| **Importance/poignancy** (LLM rates 1–10) | gen-agents §4.1 | **No** as-is — LLM (I1); translatable proxy |
| **Graph/anchor proximity** (BFS, node-distance from a centroid) | Zep §3.1 (`φ_bfs`), §3.2 (node-distance reranker) | **Yes** — graph traversal |
| **Mention frequency / popularity** ("frequently referenced becomes more accessible") | Zep §3.2 (episode-mentions reranker) | **Yes** — but **dangerous** (below) |
| **Rank fusion** (RRF) combining multiple rankers | Zep §3.2 | **Yes** — arithmetic |
| **Diversity** (MMR: penalize redundancy) | Zep §3.2 | **Partial** — needs a similarity metric; use lexical/anchor-overlap |
| **Authority / explicit pin / status** | Contexa design; implicit in gen-agents importance | **Yes** — ctx fields |

| # | Idea | Source | Label | Deterministic ctx form | Decision | Reason |
|---|------|--------|-------|------------------------|----------|--------|
|4.1|**Weighted linear score `α_rec·recency + α_imp·importance + α_rel·relevance`, min-max normalized, α=1**|gen-agents §4.1 Fig 6|**translate**|Keep the *composition* (normalize each signal to [0,1], weighted sum → deterministic, tunable). Swap the *components*: relevance→FTS5, importance→authority/pin/anchor-count proxy, recency→bounded (below)|6|The additive-normalized scorer is deterministic and auditable. Only the component definitions need I1/I2 removal|
|4.2|**Relevance = embedding cosine similarity to the query**|gen-agents §4.1; A-MEM §3.4 Eq 9; Zep `φ_cos`|**decline** / **translate**|Replace with **FTS5/BM25 lexical relevance + anchor proximity** (memory whose anchors match the query's seed entities). ctx already lexical-matches in `candidatesFor`|6|I2. The BM25 leg of Zep's own hybrid (§3.1) is the embedding-free substitute — and Zep reports BM25+BFS carry real signal|
|4.3|**Importance/poignancy** distinguishes core from mundane|gen-agents §4.1|**translate**|Deterministic proxy = **authority tier** (`confirmed` > `inferred`) × **explicit pin** × **anchor count** × **is-gotcha/decision flag**. No LLM 1–10 rating|6, 7|The *concept* (not all memories are equal) is right; the LLM scorer (I1) becomes structural fields ctx already tracks|
|4.4|**Recency via exponential decay over time-since-last-access**|gen-agents §4.1|**translate — with a guardrail**|Use recency only as a **tie-breaker / soft factor**, never a dominant term, and prefer **anchor-freshness** (is the target still there/unchanged) over wall-clock age. NEVER decay-by-last-*served* (feedback loop)|6, 5, 2|A recency-dominant ranker makes a *recently written wrong note* outrank an *old correct invariant* — the "stale/false memory too visible" failure. Anchor-freshness is the safe, event-driven substitute|
|4.5|**Mention-frequency / popularity reranker** ("frequently referenced info becomes more readily accessible")|Zep §3.2 p5|**decline** (as a ranking signal)|Do not rank by served-count/mention-count. Track served-count only as **telemetry**, never as a ranking input|6, 2|**Dangerous signal** (decision 6, explicit). Popularity ≠ correctness; a popular-but-wrong fact gets *more* visible, and it forms a self-reinforcing loop with recency-by-access. Names the "popular-but-wrong too visible" failure|
|4.6|**Reciprocal Rank Fusion (RRF)** to combine multiple rankers|Zep §3.2 p5|**adopt**|Fuse FTS5-rank + anchor-proximity-rank + freshness-rank + authority via RRF (`Σ 1/(k+rank_i)`). Pure arithmetic, order-only, no score calibration needed|6|Deterministic, robust to incomparable score scales, and the standard way to merge lexical + graph signals. Ideal for ctx's multi-signal `context()` ranking|
|4.7|**Maximal Marginal Relevance (MMR)** — penalize results redundant with already-selected ones|Zep §3.2 p5|**translate**|Diversity via **lexical/anchor-overlap** redundancy penalty (reuse Jaccard from dedup.ts), not embedding similarity. Keeps push/`context()` from spending its ≤1KB on near-duplicate notes|6, 7|Standard MMR needs a similarity metric; ctx already has a deterministic one (word-set Jaccard). Directly improves push-digest usefulness|
|4.8|**Node-distance / BFS reranker** — boost items graph-close to the query's seed entities; recent episodes as BFS seeds|Zep §3.1 (`φ_bfs`), §3.2|**adopt**|**Anchor proximity**: rank a memory up when its anchors are on/near the query's resolved seed entities (1–2 hops on the `anchoredTo`/link graph). Deterministic BFS over ctx's edges|6|Graph proximity is I1/I2-free and is ctx's structural analogue of "relevance." Turns the anchor graph into a ranking asset|
|4.9|**More retrieved is NOT better** — accuracy plateaus then *drops* as k grows ("richer context introduces noise")|A-MEM §4.5 Fig 3; MemGPT uneven-attention motivation §3.2|**adopt** (as evidence)|Justifies hard caps: push ≤1KB, bounded `context()` sections, omitted-counts envelope + handles instead of dumping|6, 7, 2|Empirical support for ctx's bounded-output design and the "irrelevant push memory" / interference failure. Over-retrieval actively harms|
|4.10|**Dual timestamps per item** (creation + last-access)|gen-agents §4.1|**adopt** (creation) / **caution** (last-access)|Keep creation (ULID already encodes it). Track last-served for telemetry only — do **not** feed it into recency (4.5 loop)|6|Creation time is safe and free; last-access as a *ranking* input recreates the popularity hazard|

**Convergence.** ctx's ranker = **RRF fusion (4.6)** over **FTS5 lexical relevance (4.2)** +
**anchor-proximity BFS (4.8)** + **anchor-freshness (4.4)** + **authority/pin/status (4.3)**, with
**MMR-style lexical de-duplication (4.7)** and a **hard output cap (4.9)**. The two signals to
**refuse**: embedding relevance (I2) and popularity/served-count (decision-6 dangerous). Recency is
demoted to a guarded tie-breaker; **anchor-freshness replaces wall-clock decay** as the temporal signal.

---

## Theme 5 — Graph memory & bitemporal facts (structural storage)

| # | Idea | Source | Label | Deterministic ctx form | Decision | Reason |
|---|------|--------|-------|------------------------|----------|--------|
|5.1|**Structured (nodes+edges) storage beats vector storage** — "transcends capacity limits of linear and the **ambiguity** of vector retrieval"; model history as a topological network of entities+relations|Survey §4.1 p5|**adopt** (validates ctx)|ctx *is* the structured tier: entity/link/claim graph in SQLite. No change; cited as external validation of the no-embedding choice|1, 6|An independent survey names vector retrieval's ambiguity as the reason to prefer structured graphs — direct support for I2/I4|
|5.2|**Episodic (raw, non-lossy) vs semantic (derived) subgraph split, with bidirectional edges so semantic artifacts trace back to sources for citation**|Zep §2 p2, §2.1 p3|**translate**|ctx's split = **index (raw code/docs, non-lossy, index-not-copy)** vs **derived (memory/concepts)**; provenance links close the loop. Keep the bidirectional traceability requirement; drop LLM semantic extraction|1, 6|The raw↔derived + back-pointer design is exactly I5 + I6. The derivation step (LLM entity/fact extraction) is declined; the *architecture* is adopted|
|5.3|**Communities via label propagation + map-reduce LLM summaries**|Zep §2.3 p4|**decline** (summaries) / **future** (clustering)|Label propagation is a deterministic graph algorithm and could cluster related memories/entities, but the *summaries* are LLM. Defer entirely; ctx has no community-summary need now|—|Clustering is I1-safe but low-value now; summarization is I1. Not worth building pre-measurement|
|5.4|**Hyper-edges: the same fact between the same entities can recur, modeled as multiple edges keyed by predicate**|Zep §2.2.2 p3|**adopt** (schema discipline)|ctx claims are already `(subject, predicate, object)` triples; multiple claims per pair with distinct predicates/provenance are first-class. Keep them separate (I7), don't collapse|4, 7|Reinforces "surface, don't average": distinct claims about the same pair coexist as evidence rather than being merged into one|
|5.5|**Tiered memory / OS virtual context** — bounded working set in-window, unbounded store paged in on demand|MemGPT §2 Fig 3|**translate** (validates ctx)|ctx's push digest ≤1KB = the always-resident "working context"; the full store = "archival," paged via `context()`/handles. Already ctx's shape|7, 9|The OS metaphor ratifies ctx's push+drill-down architecture as the right way to give bounded, on-demand context|
|5.6|**Self-editing working context** (LLM rewrites its own resident memory via functions)|MemGPT §2.2 Fig 4|**decline**|Push digest is curated deterministically (rank + caps) + human pin/veto, never self-rewritten by a model|7, 3|I1. MemGPT's `replace()` is also destructive; the Boyfriend→Ex-boyfriend example is a supersession that ctx does non-destructively|
|5.7|**Pagination**: search returns bounded page + a "next page" the agent can chain|MemGPT §2.2 Fig 6, §3.2.1|**adopt** (already ctx)|Handles + omitted-counts envelope = ctx's pagination. Return top-N with drill-down handles, not the full set|6, 7|Deterministic bounded output with explicit continuation — matches ctx's handle model exactly|
|5.8|**Link-following expansion**: retrieving a note auto-pulls notes linked in the same "box"|A-MEM Fig 2 p3|**translate**|Once links exist, 1-hop expansion is deterministic: retrieving a memory can surface its anchored entities and `sameAs`/`supersedes` neighbors as drill-down handles. But links formed by explicit anchors + dedup, not LLM|6|Graph expansion is I1/I2-free and useful for `context()` drill-down; only the LLM *link-creation* is declined|

**Convergence.** The survey (5.1) and MemGPT (5.5) independently validate ctx's two structural bets:
**structured graph over vectors** and **bounded working set + paged store**. The transferable schema
disciplines are the **raw↔derived back-pointer** (5.2) and **coexisting per-predicate claims** (5.4, =
I7). Declines are all the LLM populators (5.3 summaries, 5.6 self-edit, 5.8 link-creation).

---

## Theme 6 — Evaluation methods (feeds Workstream E)

**Divergence — how the literature evaluates memory, and what survives a network/LLM/embedding-free harness:**

| # | Idea | Source | Label | Deterministic ctx form | Decision | Reason |
|---|------|--------|-------|------------------------|----------|--------|
|6.1|**Question-type taxonomy**: single-hop, multi-hop, **temporal-reasoning**, **knowledge-update**, open-domain, **adversarial/unanswerable**|LOCOMO (mem0 §3.1, A-MEM §4.1); LongMemEval (Zep §4.3)|**adopt** (categories)|Seed a fixture repo with tasks per category: **knowledge-update**→does retrieval return the *current* fact and NOT the superseded one after `remember(supersedes)`; **temporal**→respects `valid_from/to`; **multi-hop**→anchor-graph traversal; **adversarial**→returns "no memory / cannot answer"|10, 4, 5|The categories map 1:1 onto ctx's failure modes. Adopt the *taxonomy*, implement each as a deterministic fixture assertion|
|6.2|**LLM-as-a-Judge (J)** scoring of answer quality|mem0 §3.2; Zep §4.2; MemGPT §3.1|**decline**|Replace with **exact set-membership / label match**: the correct fact-id ∈ served set, superseded fact-id ∉ served set. Pass/fail is a set assertion, not a judgment|10|I1 (also I3). ctx eval must be reproducible offline; a judge is non-deterministic and networked|
|6.3|**Lexical F1 / BLEU-1 is misleading for factual accuracy** ("Alice born in March" vs "July" scores high despite being wrong)|mem0 §3.2 p7|**adopt** (as a caution)|Do NOT score memory correctness by text overlap. Score by **fact-id/anchor-id membership** — the retrieved *entity/claim* is right or wrong, independent of wording|10|Names why token-overlap metrics fail on the exact case ctx cares about (supersession, correction). Forces id-level, not string-level, assertions|
|6.4|**Adversarial / unanswerable category** — system must recognize "no answer exists" rather than fabricate|mem0 §3.1 p6 (excluded but named); A-MEM §4.1|**adopt**|Fixture: query with no supporting memory → ctx returns empty memory section + envelope, never a fabricated fact. Assert absence-is-surfaced|10, 2|Directly tests the "false memory" failure (top failure). ctx's success-shaped guidance / empty-section-omitted design is the behavior under test|
|6.5|**Deployment metrics: token-consumption (tiktoken) + latency**|mem0 §3.2 p7; A-MEM §4.3 (~1.2k vs 16.9k tokens, 85-93% cut)|**adopt**|Measure **tokens served per query** and **wall-clock** deterministically. ctx-as-token-killer: fewer served tokens at equal correctness is a first-class pass criterion|10|Aligns eval with ctx's core purpose; fully deterministic (byte/token counting, local timing). Gives a "served-set size" axis alongside correctness|
|6.6|**Nested key-value retrieval** — synthetic chains where a value is itself a key, requiring multi-hop lookup; scored by **exact UUID match** (no judge)|MemGPT §3.2.2 Fig 7-8|**adopt** (pattern)|Multi-hop anchor fixture: memory A anchored to entity X; X links to Y; a query resolving through A must surface Y. Expected output = exact entity-id. Deterministic, no LLM|10|A ready-made deterministic multi-hop protocol with exact-match scoring — the template for ctx's anchor-traversal test|
|6.7|**k-sweep / over-retrieval ablation** — vary retrieved-count, show accuracy plateaus then drops|A-MEM §4.5 Fig 3|**adopt** (method)|Eval harness sweeps the output budget and asserts precision doesn't degrade past the ctx cap; validates the ≤1KB push bound empirically per fixture|10, 6|Turns the "more-is-worse" finding into a repeatable regression test for ctx's caps|
|6.8|**Scaling/latency-vs-size table** (retrieval time across 1k→1M entries)|A-MEM §4.6 Table 4|**translate**|ctx analogue: FTS5 query latency + store size across a growing fixture; assert sub-linear-enough retrieval. Deterministic local benchmark|10|Confirms bounded growth doesn't blow up serve latency — an I4 (single SQLite) health check|
|6.9|**DMR critique: single-turn needle-in-haystack under-tests real memory**; needs multi-session, temporal, knowledge-update|Zep §4.2 p6|**adopt** (as design caution for E)|Weight the fixture toward **supersession, stale-anchor, duplicate-import, echo** cases (the hard, ctx-specific ones), not just single-fact recall|10, 2|Steers Workstream E away from a trivially-passable recall benchmark toward ctx's actual failure surface|

**Convergence for Workstream E.** Build a fixture repo scored by **id-level set membership**, not text
overlap (6.2/6.3), organized by the **LOCOMO/LongMemEval category taxonomy** (6.1) with heavy weight
on **supersession, temporal-validity, adversarial-absence, and multi-hop-anchor** cases (6.4/6.6/6.9),
plus a **token-served efficiency** axis (6.5) and an **over-retrieval regression** guard (6.7). Every
assertion is a deterministic local computation — no LLM, no embeddings, no network.

---

## Cross-cutting decline ledger (the attractive ideas ctx must refuse, invariant named)

| Idea | Source | Invariant violated | Why it's tempting |
|------|--------|--------------------|-------------------|
| LLM chooses ADD/UPDATE/DELETE/NOOP per write | mem0 §2.1 | I1 | "Just let the model reconcile it" — but non-deterministic at write |
| Embedding cosine relevance / entity resolution | gen-agents, A-MEM, Zep, mem0 | I2 (+I3 if hosted) | Best recall in the papers; ctx trades it for FTS5+graph |
| LLM reflection writing new facts back into the store | gen-agents §4.2 | I1, I6, echo/reconsolidation | Generalization/insight — but manufactures unprovenanced, re-amplifiable facts |
| A-MEM memory evolution (rewrite neighbors in place) | A-MEM §3.3 | I1 **and** I8 | Organic knowledge growth — but destroys the original |
| MemGPT self-editing working context (`replace`) | MemGPT §2.2 | I1, I8 | Autonomous upkeep — but destructive + model-driven |
| mem0 DELETE (drop from served index) | mem0 clone `main.py:2034` | I8 (softened by audit log) | Clean store — but ctx keeps the node queryable, not just logged |
| Cross-trajectory abstraction into detached rules | Survey §4.3/§5 | I6 (facts detached from provenance); scope | Reusable skills — but a different product |
| LLM-as-a-Judge evaluation | mem0/Zep/MemGPT | I1, I3 | Nuanced scoring — but non-reproducible, networked |
| Recency-by-last-access + popularity reranking | gen-agents §4.1; Zep §3.2 | none technically, but **decision-6 dangerous** | Cheap "relevance" — but makes stale/popular-wrong facts self-reinforcingly visible |

## Evidence tags
All rows are **from-reference** (papers) or **from-code** (clone/ctx `path:line`) as cited. Deterministic
ctx forms and the convergence paragraphs are **inferred** design consequences, not claims from the papers.
