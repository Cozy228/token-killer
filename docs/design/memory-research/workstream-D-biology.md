# Workstream D — Biology as Constraint Check (NOT North Star)

> Human/cognitive memory is used here **only to test Contexa design intuitions**. A factual, auditable
> dev-context store has a different objective function than a brain (faithful+provenanced recall, not
> behavioral fluency). Every point below either moves a ctx decision or is omitted. Format per point:
> **[claim] → [supports / warns] → [ctx decision #] → [1-line implementation consequence]**.
> Claims labeled `from-reference` (named cognitive-science phenomenon) or `inferred` (the ctx mapping).

## Decision-moving points

**D-1. Adaptive forgetting = reduced *accessibility*, not lost *availability*.**
`from-reference`: human forgetting is largely retrieval failure, not erasure — a trace stays *available*
but becomes *inaccessible*, and this loss of accessibility is often *adaptive* (retrieval-induced
forgetting / interference reduction; Bjork). The benefit of forgetting comes from lowering
accessibility, which does **not** require destroying the trace. `inferred`: a dev-context store's goal
is auditability, so destructive forgetting there loses evidence the brain never actually loses.
→ **SUPPORTS** ctx's "hide/down-rank, never delete" stance.
→ **Decisions 4, 6.**
→ Consequence: implement "forgetting" as lifecycle status (`superseded`/`retired`) + rank suppression,
never row deletion; the row and its provenance are kept forever, only its accessibility drops.

**D-2. Recall is cue-dependent; an anchor IS a retrieval cue.**
`from-reference`: encoding specificity / context-dependent memory — a trace is retrievable to the degree
its cues match; when the context a memory was bound to changes, the memory becomes hard to find or
retrieves the *wrong* thing. `inferred`: ctx anchors are exactly these cues (memory → code/docs locus).
Predicts (a) anchor **quality** (specific, distinctive, stable ids) governs retrievability more than gist
wording; (b) a memory whose anchor target moved/disappeared is a *decontextualized* trace — still stored,
but its cue is stale, so serving it at full strength risks retrieving the wrong thing.
→ **SUPPORTS** making anchor freshness a first-class ranking + lifecycle signal.
→ **Decisions 5, 6.**
→ Consequence: dead-/moved-locus memory is down-ranked and flagged `needs-review`, not served at normal
weight; anchor resolvability is a real input to the existing `recency × anchor-freshness` score.

**D-3. Reconsolidation makes recalled memories labile and rewritable.**
`from-reference`: retrieving a memory returns it to a labile state where it can be altered before
re-storage; each recall is an opportunity to corrupt the original (misinformation effect — the trace
becomes a blend of original + retrieval context). `inferred`: any design where **reading/serving** a fact
triggers **rewriting** it (LLM-consolidation, summarize-on-recall, auto-merge-duplicates, write-back-on-
serve) reproduces exactly this failure — ctx facts would become labile blends, losing provenance and
mixing sources.
→ **WARNS AGAINST** rewrite-on-recall / LLM-consolidation of stored facts. ctx's no-LLM-at-serve invariant
and "conflicts surfaced, not averaged" are the biologically-*correct* opposite of reconsolidation.
→ **Decisions 3, 4.**
→ Consequence: the recall/serve path stays strictly read-only; new information arrives only via a fresh
`remember()`/import + explicit `supersedes`, never by mutating the retrieved row; near-duplicates are
surfaced as `sameAsCandidate`, never merged in place.

**D-4. Cue overload / fan effect — too many items on one cue degrades retrieval of the right one.**
`from-reference`: cue-overload principle and the fan effect — the more facts associated with a cue, the
slower and less reliable retrieval of any single one. `inferred`: a large or loosely-filtered push digest,
or a long `context()` result list, does not merely *waste tokens* — it **actively degrades** the reader's
(human or agent) ability to retrieve the one correct fact. "Irrelevant push memory" is therefore
interference, not just noise.
→ **WARNS AGAINST** push/context pollution; argues for precision over recall.
→ **Decisions 6, 7.**
→ Consequence: push stays hard-capped (≤1KB) and high-precision — confirmed, high-authority, fresh-anchor
gotchas/conventions only, excluding `needs-review`/`superseded`/`retired`/stale-anchor/echo-risk; ranking
returns a small top-N, not a long list.

**D-5. Spacing / testing / salience are *time-and-use* signals — deterministically computable, but weak.**
`from-reference`: spaced retrieval and the testing effect show repeated *successful* retrieval over spaced
intervals predicts durable value; salience/distinctiveness predicts what earns attention. These are
time+use signals, not content-understanding signals, so they are computable with no LLM. `inferred`: a
memory repeatedly served-and-not-vetoed over spaced intervals is *weakly* more likely still-valuable, and a
`confirm`ed/`pin`ned memory is the deterministic stand-in for "salient." **But** the same evidence warns
that raw popularity entrenches "popular-but-wrong": the testing effect only validates a memory when
retrieval was *successful* (uncorrected), which Contexa cannot observe.
→ **SUPPORTS** a bounded tie-breaker + review-scheduling signal; **WARNS AGAINST** letting served-count
drive primary ranking.
→ **Decision 6.**
→ Consequence: served-count/recency may only break ties and feed the `needs-review` queue (surface
long-unreviewed-but-often-served items for human confirmation); never let served-count override
authority/status/freshness. Human `confirm`/`pin` is the only "successful-retrieval" signal ctx can trust.

## Biology that does NOT change a ctx decision (omitted, and why)

Omitted because each either has no deterministic/no-LLM analog or adds no decision beyond what ctx already
fixes: **systems/synaptic consolidation and sleep replay** (a stabilization *mechanism*; ctx stabilizes via
commit + provenance — no decision to make); **working-memory capacity limits (7±2, chunking)** (a bottleneck
in the *consumer*, already governed by the ≤1KB budget and token accounting, not the store); **emotional /
amygdala-driven salience** (no deterministic proxy; "salience" in ctx is just explicit `pin`, already
covered by D-5); **episodic vs semantic / schema abstraction** (tempting to map onto memory-vs-concepts, but
`index-not-copy except memory/concepts` already settles it); **false-memory / DRM gist intrusion** (reinforces
"don't paraphrase or average," but that warning is delivered in full by D-3 reconsolidation + "conflicts
surfaced not averaged" — listing it separately moves no additional decision); **long-term potentiation**
(neural substrate, no product decision).
