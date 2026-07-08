# DORA Pressure-Test of the ctx Design — Review

> **Status**: analysis artifact produced per `FABLE-DORA-REVIEW-PROMPT.md`, 2026-07-03.
> **Method note (anti-anchoring)**: Section 1 was derived by a fresh agent whose only inputs were
> the DORA synthesis + source extractions and the two fixed commitments — it never opened the ctx
> design/impl/decision documents, and load-bearing claims were re-verified against
> `dora-2025.txt` / `dora-roi-2026.txt` (verification-tax mitigations, context-layer roadmap,
> internal-data capabilities checked at source). Delegation to an uncontaminated agent was the
> honest implementation of the "do not peek" rule, since the reviewing session itself carries
> design memory. Sections 2–8 were then written against `CONTEXA-DESIGN.md`, `CONTEXA-IMPL.md`,
> `FABLE-DECISION-LOG.md` (P9–P26), and `PROJECT-CONTEXT-PACK.md` §9 (P1–P8).
> Evidence tiers are binding throughout; nothing below rests on a MISQUOTED / UNVERIFIABLE /
> do-not-cite figure.
>
> **Maintainer ruling 2026-07-03 (P27, post-review)**: Contexa serves context only — the
> review/verification moment is NOT a product surface, and other DORA pains are not mandates
> ("the product solves one problem"). G1 is **rejected**, FORK-C is resolved-out, and §5.1 is
> softened accordingly; markers below. G2–G6 and the alignment ledger are unaffected.

---

# Section 1 — First-Principles Derivation from the DORA Evidence Base

*(Derived with the Contexa design documents unopened. Self-contained.)*

## 1a. Force Map

**Ranking logic**: DORA's own screened capability model and named-source [SURVEY] first; verified [ACADEMIC] second; converging [TELEMETRY] third. DX/Faros treated as one signal throughout.

### Proven forces (ranked)

| # | Force (one line) | Driving finding | Tier |
|---|---|---|---|
| F1 | **AI is an amplifier, not a fixer** — it magnifies existing organizational quality or dysfunction; no tool bolted onto a bad environment produces value | DORA 2025 unifying model; ROI roadmap framing ("Without a robust foundation, AI generates bloat") | DORA capability model [SURVEY] — strongest |
| F2 | **Context is the highest-leverage input DORA has measured** — 2 of the 7 empirically screened amplifier capabilities are data/context (AI-accessible internal data; healthy data ecosystems), and the ROI roadmap makes "Build the context layer" investment Step 1 | DORA 2025 pp. 54–55; ROI pp. 43–44 ("In an agentic world, garbage in, garbage out refers to the context provided to the agent") | DORA capability model [SURVEY] — strongest |
| F3 | **Verification, not generation, is the binding constraint** — "the most immediate barrier to ROI is the verification tax"; DORA's own third mitigation draws a causal arrow: better context → better initial code quality → lower verification tax | ROI pp. 33/40; corroborated by Sonar 2026 (38% say AI code harder to review) [SURVEY] and LinearB/CircleCI/DX-Faros [TELEMETRY, directional] | [SURVEY] + converging [TELEMETRY] |
| F4 | **Context earns its keep through information gain, not existence** — human-written context files improved agent success ~4 pp; LLM-generated ones that duplicated the discoverable *reduced* success in 5/8 settings and raised inference cost 20–23%; conversely a genuine context file cut agent runtime −28.64% and output tokens −16.58% (CONFIRMED) | arXiv:2602.11988 (AGENTbench) + arXiv:2601.20404 | [ACADEMIC], both verified |
| F5 | **Delivery instability rises with AI adoption and is *not* an acceptable price** — two consecutive years; instability's harm to product performance and burnout is unmoderated by AI and eats the throughput gains; DORA's own calculator books instability as a net-negative line item (−$344k) | DORA 2024 + 2025 (p. 41); ROI appendix model | DORA core research [SURVEY] |
| F6 | **The trust gap is rational and widening; the need is cheap verification with an evidentiary basis, not persuasion** — 30% little/no trust (DORA), distrust up 31%→46% (Stack Overflow 2025), 66% name "almost right, but not quite" the top frustration; 96% distrust vs. only 48% always verify (Sonar) | DORA 2025; SO 2025; Sonar 2026 | [SURVEY], multiple named sources |
| F7 | **Perceived productivity ≠ real productivity** — experienced devs slowed 19% while believing they sped up 20%; any value story must be measured, not self-reported | METR (cited in DORA 2025 main text) | [EXPERIMENT], verified |
| F8 | **Generic AI helps least exactly where enterprises live** — 35–40% gains on greenfield vs. ≤10% on complex legacy brownfield code | Stanford productivity research, cited by DORA ROI p. 36 | [ACADEMIC via DORA citation] |
| F9 | **Token cost became a CFO-level pain with no authoritative framework** — 98% of orgs now actively manage AI spend, "managing token costs" = practitioners' #1 challenge; ~1 in 4 tech leaders at $200–500/dev/month; DORA's own model ($80/user/**year**) is off 30–75x vs. field reality | FinOps Foundation 2026 + Gartner Jun 2026 | [SURVEY]; structure of waste (~84% of agentic-turn tokens are tool output; 17,600-token MCP schemas) is [TELEMETRY / first-party issue] — directional only |
| F10 | **A clear, communicated AI stance is the single strongest cultural amplifier** — one of only two capabilities that flip AI's friction effect to a *decrease*; yet 35% of devs use personal accounts (shadow AI) | DORA 2025 pp. 51–53; Sonar 2026 | DORA capability model [SURVEY] |
| F11 | **Platform quality is the on/off switch for org-level AI value** — with low platform quality, AI's effect on organizational performance is negligible; the platform is redefined as "the risk mitigator and the context provider for AI agents" | DORA 2025 p. 71; ROI p. 40 | DORA capability model [SURVEY] |

### Asserted in the discourse but NOT proven (do not build on)

- **"Agents are already the mainstream workflow"** — false in the survey window: 61% *never* use agentic AI (DORA 2025 [SURVEY]); mainstream is still chat + completion. The agentic wave is early → build for a transition, not a settled endpoint.
- **Specific token-waste percentages** ("42% avoidable", "62% re-sent history") — PARTIALLY CONFIRMED / UNVERIFIABLE per §4–§5; the *existence* of structural waste is directionally supported, the *numbers* are not usable.
- **Context-file maintenance burden magnitude** — real, convergent practitioner pain, but no independent survey quantifies it; the ~200-line attention limit and memory-decay failure modes are [ANECDOTE / first-party issue] — mechanism-plausible (consistent with F4), illustrative only.
- **"Agents burn 10–100x more tokens than chat"** — converging industry estimate, no rigorous study; treat as one soft signal.
- **"84% of companies fail at agent documentation"**, **"67% fail compliance audits"**, non-determinism/observability percentages — MISQUOTED or UNVERIFIABLE; excluded entirely.

## 1b. First-Principles Requirements

Derivation frame: the North Star fixes the *what* (developer-local, effective, correct project context for humans and agents); the forces above fix the *why now* and the *shape*. Everything below is derived, with inferences labeled.

### What it must DO

- **R1. Maximize information gain per token, not coverage.** Surface only what an agent cannot cheaply discover by reading the repo itself; duplicating the discoverable measurably *hurts* success and raises cost (F4, [ACADEMIC]). *Inference*: the tool's core internal question for every piece of context is "would the consumer have found this anyway?" — and the default answer for code structure is often yes.
- **R2. Privilege the undiscoverable context classes.** DORA's qualitative finding (2025 p. 85): what AI misses is "team conventions, architectural history, or past incidents... buried in disparate systems and informal knowledge channels" (F2). *Inference*: decisions, conventions, incident history, and the *why* behind code outrank code maps in priority — code is self-describing to a capable agent; intent is not.
- **R3. Be brownfield-first.** The value gap is largest on complex legacy code (F8), which is exactly where generic models fail and exactly what internal enterprise adoption targets. *Inference*: design for the old, undocumented, convention-heavy repo as the primary case, not the greenfield demo.
- **R4. Manage freshness as a first-class property.** Documentation rot turns context into "automated folklore" (F2, DORA qualitative); stale context is worse than absent context because it is *confidently wrong* — feeding F6's "almost right" tax. *Inference (non-obvious)*: a context store without staleness detection, expiry, and contradiction handling is a liability generator, not an asset. A naive context tool accumulates; an ideal one decays and re-verifies.
- **R5. Carry provenance on every item.** Enterprises need "trust with an evidentiary basis" and cheap verification (F3, F6). Every served claim should be traceable to a source artifact (file, commit, decision record, incident) so a human or agent can verify in seconds. *Inference (non-obvious)*: context that raises the AI's confidence without raising its verifiability makes the "almost right" tax *worse* — the naive failure mode is producing more fluent, harder-to-audit wrongness.
- **R6. Measure success downstream, not at ingestion.** The causal chain DORA endorses is context → initial code quality → lower verification tax (F3). *Inference*: the tool's honest KPIs are review-side (rework, correction rounds, verified-token deltas per the CONFIRMED −28.64%/−16.58% pattern), never "amount of context indexed" or adoption counts — and, per F7, they must be *measured*, not self-reported, to be CFO-legible.
- **R7. Account for its own token cost.** Context injection is itself spend, in an environment where token cost is the #1 practitioner challenge (F9) and standing overhead (tool schemas, headers) demonstrably stacks. *Inference (non-obvious)*: the tool must budget itself — a fixed, small always-on surface plus on-demand drill-down — and must be able to show its own net cost/benefit, because no external framework exists to do it (F9: DORA is 30–75x off on cost; the tool must self-instrument to be CFO-legible).
- **R8. Serve both cognitive modes.** Humans in deep-understanding tasks actively ignore AI surfaces (<1% visual attention, UC Berkeley eye-tracking in DORA 2025 guest essay); agents want terse, machine-readable, high-fidelity input (ROI Step 1: "high fidelity and machine readable"). *Inference*: one substrate, two renderings — dense/structured for agents, navigable/explanatory for humans; and serving humans is also the hedge against the skill-formation rupture (F6's Anthropic −17% comprehension finding: context that explains *why* preserves the apprenticeship channel that pure generation destroys).
- **R9. Be host-agnostic on the consumer side, promiscuous on ingress.** Enterprises swap assistants and vendors re-price constantly (F9 pricing turbulence; the agentic-tool landscape is unsettled per the 61% figure). *Inference*: the org's context must outlive any single AI vendor; the tool binds to the project, not the assistant.
- **R10. Fit the governance posture natively.** The hard invariant (no egress, ingress-only network) is not just safety — it directly answers F10's shadow-AI and audit-failure findings and makes the tool deployable in EDR/org-controlled environments without a security-review fight. *Inference*: "your context never leaves the machine" is the adoption unlock for internal enterprise use, and it must be architecturally enforced, not policy-promised.

### What it must BE

- **B1. Deterministic and auditable.** Platform/model version drift silently changed agent output for ~6 weeks at the platform vendor itself (first-party postmortem). A local tool must give identical output for identical input and state, version-pinned, so it never becomes another silent variable in the agent's behavior.
- **B2. Near-zero ceremony.** Friction relocates rather than vanishing (DORA 2025: friction and burnout statistically immune to AI, two years running), and context-file maintenance is already a convergent complaint (asserted-tier). A tool that adds a maintenance chore will be abandoned; upkeep must ride on artifacts developers maintain anyway (code, commits, decisions captured at the moment they're made).
- **B3. Small-batch and incremental.** Small batches are in DORA's seven-capability model and one of only two friction-flippers (F5 mitigation list). Context must update incrementally with the repo, never require monolithic regeneration.
- **B4. Local-first, org-composable.** DORA's Step 1 is an org-level "context layer" (CapEx, platform); the North Star is developer-local. These reconcile (see T2): the local tool is the *edge* of the org context layer — it pulls org standards in (ingress-only) and is the point where context actually meets the agent.

### What it must REFUSE to do

- **X1. Never emit project context outward** (hard invariant; also the governance answer per R10). No telemetry that embeds content; network carriers ingress-only, verifiable.
- **X2. Refuse to auto-generate restatement context.** The single sharpest academic result in the corpus (F4): machine-generated context that duplicates the discoverable reduces success and raises cost. The tool must decline to "helpfully" summarize what an agent can read itself, and must gate any generated content on demonstrated information gain.
- **X3. Refuse unbounded accumulation.** No append-forever memory: entries must have expiry, priority, contradiction resolution, and audit — the documented failure modes of long-lived auto-memory ([ANECDOTE/first-party issue], mechanism-consistent with F4) are the default fate of a naive store.
- **X4. Refuse to intermediate or inspect the AI conversation itself.** *Inference*: acting as a proxy/gateway would both violate the egress invariant and trip EDR/org tooling; the tool provides context *to* hosts, it does not sit inside their traffic.
- **X5. Refuse unmeasured value claims.** F7 (METR) proves perception inverts reality; §5 lists fabricated stats that circulate freely. Internally, every claimed saving must be an A/B-measured delta on this org's workloads — the only CFO-legible currency in a field of misquoted numbers.

### Failure modes to avoid (summary)

1. **Folklore engine** — confidently serving stale or generated-restatement context (violates R4/X2; worsens F6).
2. **Context bloat** — standing injection that crowds attention and burns budget (violates R1/R7; feeds F9).
3. **Trust inflation without evidence** — raising output fluency without provenance (violates R5; deepens the "almost right" tax).
4. **Second maintenance job** — requiring curation labor that drifts and dies (violates B2).
5. **Vendor coupling** — binding the org's context to one assistant's format or lifecycle (violates R9).
6. **Vanity metrics** — reporting indexed volume or adoption instead of measured downstream deltas (violates R6/X5).

## 1c. Open Tensions in the Evidence

- **T1. "Give AI more internal data" (F2) vs. "added context can hurt" (F4).** DORA's capability model says AI-accessible internal data amplifies effectiveness; AGENTbench says injected context with no information gain reduces success and raises cost 20–23%. These are not contradictory — DORA measures *access*, AGENTbench measures *push* — but a naive reading of DORA produces exactly the tool AGENTbench condemns. **Resolution**: make access the default and push the exception — a small, high-gain fixed surface plus on-demand retrieval, with every candidate item gated on "not discoverable, currently true, provenance attached."
- **T2. Org-level context layer (ROI Step 1, CapEx, platform-owned) vs. developer-local North Star.** DORA's roadmap invests at the platform (F11); the North Star and egress invariant put the tool on the developer's machine. **Resolution**: the local tool is the delivery edge of the org's context layer, not its rival — org standards and platform knowledge flow *in* (ingress-only), and the local point is where context quality actually determines agent behavior. This also converts F11 from a threat ("no platform, no value") into a channel.
- **T3. Throughput celebration vs. instability penalty (F5) — where should a context tool aim?** Telemetry celebrates more PRs; DORA proves instability eats the gains. A context tool could be used to generate *more* code faster — worsening the constraint per DORA's own VSM logic (apply AI at the constraint, which is review, not generation). **Resolution**: aim the tool at *initial correctness and reviewability* (smaller semantic diffs, convention-conformant output, verifiable claims), and measure it there (R6) — not at generation volume.
- **T4. Trust must rise for ROI vs. rising distrust is partially rational (F6, F7).** Pushing trust upward without changing its basis would be miscalibration, not progress. **Resolution**: the tool sells *calibrated* trust — provenance-carrying context makes correct output verifiably correct faster, and makes wrong output fail faster; trust becomes a measured consequence, never a message.
- **T5. Optimizing for agents vs. preserving human skill formation.** Machine-readable context measurably improves agent outcomes (F4 positive arm), while generation-reliant developers comprehend 17% less and juniors lose the apprenticeship channel. A tool tuned purely for agent consumption accelerates the rupture. **Resolution**: dual rendering from one substrate (R8) — the same decision/convention/incident record that makes an agent correct is precisely the material that teaches a human *why*; the human-facing rendering is a feature, not overhead.
- **T6. Freshness requires upkeep vs. upkeep is the pain vs. automation of upkeep is the proven anti-pattern.** Context must stay current (R4), maintenance burden is the convergent complaint (B2), yet auto-generation is the one approach with academic evidence *against* it (F4/X2). **Resolution**: derive freshness from artifacts maintained anyway (the repo, its history, decisions captured at the moment of decision), automate *staleness detection and retirement* (safe to automate — it removes wrongness) while reserving *authoring* for humans at high-gain moments (the arm AGENTbench found beneficial).
- **T7. The cost framework vacuum (F9).** DORA — the field's authoritative measurement body — is 30–75x off on token cost, and the most-circulated waste percentages are unverifiable. There is no external yardstick to prove value against. **Resolution**: the tool must carry its own measurement harness — per-org, A/B, uncached-delta accounting on real workloads — because in a framework vacuum, self-instrumented internal evidence is the only CFO-legible proof available, and (per F7) the only kind that survives contact with reality.

---

# Section 2 — Alignment Ledger

*(Where the current design already satisfies a Section-1 force. Terse; purpose is to prevent re-litigating what is right.)*

| Force → design element | Evidence tier |
|---|---|
| F2/R2 → **P26 route logic** ("the agent's scarcest context is the INVISIBLE kind"; M1 = memory + git + docs/decisions, code waits for M2) — the route's central bet is independently re-derived by this review's R2 | [SURVEY] |
| F4/T1 → **push ≤1KB fixed surface + pull on-demand** (P16/P17/P25③) exactly implements "access the default, push the exception" | [ACADEMIC] |
| R4 → **freshness column semantics + P24 query-time dirty checks + reason-classified staleness + index-not-copy (P25①)** — kills the folklore-engine failure mode at the store level | [SURVEY qualitative] |
| R5/T4 → **append-only `claims` with {carrier, locus, method, authority} + conflicts-never-squeezed + evidence drawer** — calibrated-trust machinery, per-fact | [SURVEY] |
| X1/R10 → **ingress-only invariant + M4 ingress lint** — the governance/EDR adoption unlock, architecturally enforced | [SURVEY] |
| R7/F9-structure → **3-tool lean surface (P25②), ~24K response ceiling, 2-token short handles, lean default budget (FORK-3)** — directly answers tool-schema/standing-overhead waste | [TELEMETRY, directional] |
| R9 → **"context belongs to the project, not the assistant vendor" (P15 corollary) + host adapters + host-memory importers** — the vendor-turbulence hedge | [SURVEY/NEWS] |
| B1 → **deterministic-extract discipline (D5), golden transcripts, stable call-over-call response shape, `extractor_version` stamps** | [first-party postmortem] |
| B2/T6 → **sources = artifacts maintained anyway (git/docs/ADR); automated staleness-detection + human-reserved authoring (FORK-4: no silent narrative extraction)** — matches T6's resolution exactly | [ACADEMIC + qualitative] |
| B3 → **incremental ingest, generation publish, incremental-correctness trio** | [SURVEY] |
| X3 (largely) → **P21 lifecycle**: anchor-invalidation → needs-review, review queue, explicit supersede, decay-in-ranking — answers the documented auto-memory failure modes | [ANECDOTE tier, adequately answered] |
| R8/T5 → **guide as first-class surface; Entity Biography = "human twin of `context()`"** — dual rendering from one substrate | [SURVEY guest essay] |
| X5 → **honesty moat (measured never summed with estimated) + P5 internal A/B as proof currency** | [EXPERIMENT] |

---

# Section 3 — Gaps & Blind Spots → Proposed Changes

### G1 — No serving path aimed at the verification moment — **REJECTED by maintainer (P27)**

> **Ruling**: out of scope. ctx supplies context; it does not serve the review/verification
> moment as an aim. Kept below for traceability only. A change-set ref form may re-enter solely
> via D17's evidence-gated promotion if usage evidence ever demands it.

- **Force**: F3 — verification tax is the #1 barrier to ROI (DORA ROI p. 40, [SURVEY]; converging [TELEMETRY]). DORA's own mitigation list draws the causal arrow this product rides (better context → better initial quality), but the *review side* of the same tax is unserved.
- **Current assumption**: context is consumed at task-start (generation) or exploration (understanding). `context(ref|task|handle)` has no change-set mode; the moment where the org bleeds — a human or agent *reviewing* an AI-authored change — gets no first-class brief. PR ingestion waits until M4, and nothing serves the local uncommitted diff.
- **Proposed change**: add a **change-set ref mode** to `context()` — `context(ref: <commit|pr|working-diff>)` renders "what this change touches": linked decisions it may violate, conventions (memory) on the touched entities, co-change expectations ("files that historically move with these didn't move"), open conflicts. All machinery exists (touches edges, conflicts, links, co-change); this is a projection recipe, not new infrastructure. File-level lands with M1's git source; symbol-level sharpens at M2.
- **Surface**: CONTEXA-DESIGN §4 (ref modes), CONTEXA-IMPL §6 (seeds = changed entities), §7 (schema), M1g/M2. **Level**: design change (surface addition; no new tool — D17 discipline intact, though see FORK-C).
- **Capability-state**: Required (if adopted).
- **Confirm/reject**: in internal A/B, do review-moment `context()` calls happen, and do they reduce correction rounds / review latency? Reject if neither humans nor agents consult context at review time.

### G2 — The A/B proof currency has no baseline plan; measurement-last risks destroying the comparison arm

- **Force**: F7 (perception inverts reality, [EXPERIMENT]) + T7 (framework vacuum → self-instrumented A/B is the only CFO-legible proof) + the project's own P5.
- **Current assumption**: P15② "features before measurement" executed as "all instrumentation lands at M5". *Inference*: once colleagues adopt at M1, the pre-adoption baseline (review latency, correction rounds, token spend per task on target repos) is gone; post-hoc A/B then needs holdout arms, which are organizationally harder and statistically weaker.
- **Proposed change**: one cheap, record-only **baseline capture on target repos BEFORE M1 rollout** (counters only, no judgment — consistent with the record-don't-judge discipline). M5 keeps the analysis harness; this only moves the *recording start* ahead of adoption.
- **Surface**: CONTEXA-IMPL §9 (a pre-M1 action + M5 scope note); reshapes open item O1. **Level**: decision sharpening (P15② stands; its timing corollary gains one exception) + implementation.
- **Capability-state**: Required capability; the ordering itself is an Implementation dependency.
- **Confirm/reject**: confirmed if baseline data is later load-bearing in the internal value story; rejected if the org accepts holdout-arm A/B instead.

### G3 — Push gists have no information-gain gate; the always-on surface is exactly where the ACADEMIC evidence bites

- **Force**: F4 — LLM-generated context that duplicates the discoverable *reduced* success in 5/8 settings and raised cost 20–23% (AGENTbench, [ACADEMIC, verified]). The push block is a machine-curated context file injected into every session — structurally the AGENTbench object.
- **Current assumption**: P21's auto-rank (authority × usage × recency × anchor-freshness) implicitly yields high-gain gists. But host-imported gists are LLM distillations; nothing demotes a restatement gist ("this project uses React/pnpm") that any agent discovers in seconds, and such gists can occupy the ≤1KB floor.
- **Proposed change**: add a **discoverability demotion** to push ranking (heuristic: gists whose content trivially matches greppable facts — manifest entries, file names, obvious identifiers — rank down), plus a push-on/off arm in the A/B harness.
- **Surface**: CONTEXA-IMPL §7 push builder; P21 curation policy detail. **Level**: implementation (P17/P21 decisions stand; only the ranking gains a factor).
- **Capability-state**: Required (ranking factor); any LLM-assisted gain check stays On-demand.
- **Confirm/reject**: AGENTbench-style eval on internal repos — push-on must beat push-off on task success/cost. Neutral-or-negative → tighten curation before widening rollout.

### G4 — M1's decisions coverage silently assumes a local-ADR culture

- **Force**: F2 qualitative — the missed context is "buried in disparate systems" (DORA 2025 p. 85, [SURVEY qualitative]).
- **Current assumption**: M1's decisions type = local ADR/design docs + commit trailers; PR discussions and Jira arrive at M4. In orgs where decisions live in PR threads (common), the M1 acceptance test ("why was X changed" in one call) passes on fixture repos and underdelivers on real target repos.
- **Proposed change**: **audit where decisions actually live in 2–3 internal target repos** before freezing the M3/M4 boundary. Feeds FORK-B.
- **Surface**: CONTEXA-IMPL §9 route ordering. **Level**: implementation route (conditional).
- **Capability-state**: Implementation dependency.
- **Confirm/reject**: the audit itself is the test.

### G5 — Lean-tier section caps may over-weight the discoverable

- **Force**: R1/R2 ([ACADEMIC] + [SURVEY qualitative]) — within a budgeted response, bytes restating signatures an agent can Read compete with bytes only ctx has (decisions/memory/conflicts).
- **Current assumption**: lean defaults give code the largest single share (30%) vs decisions 15% / history 15% / memory 10%. Mitigants already present: render tiers, omit-with-handle, marginal-utility borrowing.
- **Proposed change**: treat the cap constants as **measurement-gated tunables** with an explicit invisible-first weighting arm in the ablation harness.
- **Surface**: CONTEXA-IMPL §6 (`select/constants.ts`). **Level**: implementation (constants only).
- **Capability-state**: Required constants; values measurement-gated (the FORK-3 pattern, applied to caps).
- **Confirm/reject**: drill-down rate + task outcomes across weighting arms.

### G6 — Brownfield cold-start has no designed playbook

- **Force**: F8 — the value gap is largest on legacy code ([ACADEMIC via DORA]); F1 — the amplifier needs substrate. Day-1 on an old, ADR-less repo, the base holds git history + co-change only; memory and decisions accrue slowly.
- **Current assumption**: value ramps with accumulation; carrier absence is disclosed, but nothing *accelerates* the ramp on the highest-value target.
- **Proposed change**: a documented **onboarding/backfill flow** — `ctx init` surfaces the options: import GitHub PR history, run On-demand Inferred decision proposals over commit/PR text (validator-loop pattern already specced), seed conventions via `remember()` in the first week. Framing: adoption asset, not new machinery.
- **Surface**: CONTEXA-IMPL §7 (init/doctor), docs. **Level**: implementation/documentation.
- **Capability-state**: On-demand.
- **Confirm/reject**: time-to-first-useful-answer measured on the oldest internal target repo.

---

# Section 4 — Assumptions / Decisions to Reopen

| Decision | Original premise | Pressure (finding + tier) | What's needed |
|---|---|---|---|
| **P15② timing corollary** (all measurement at M5) — *sharpen, not void* | measurement must never drive features | F7 [EXPERIMENT] + T7: rollout destroys the baseline; the A/B currency P5 promises becomes unrecoverable | ratify the pre-M1 record-only baseline (G2); P15②'s core stands |
| **P26 M3↔M4 boundary** — *conditional* | humans-see-it (guide) before org-ingress (importers); biography needs M2 code | F2 qualitative [SURVEY]: if target-repo decisions live in PRs, M1–M3 serve a thin decisions type on real repos | the G4 decision-locus audit; then FORK-B |
| **P21 curation policy detail** (auto-rank suffices) — *one factor to add* | authority × usage × recency × anchor-freshness yields high-gain gists | F4 [ACADEMIC]: restatement gists are the one shape with evidence *against* them | discoverability demotion (G3); P17/P21 otherwise stand |
| **O1 (already open)** — value metric | undefined | DORA gives it concrete shape: primary = downstream verification-side deltas (correction rounds, review latency, churn on touched code); secondary = uncached token deltas; never volume/adoption metrics (R6/X5) | close O1 with this metric set + G2 baselines |

**Explicitly NOT reopened** (checked against the force map, not merely inherited): P24 no-daemon (no force demands sub-query freshness); P25① index-not-copy (R4-aligned — kills the stale-copy class); P25② 3-tool surface (F9's schema-overhead evidence *supports* fewer tools); P23 read-only guide; P11 hook delivery; P20 name; **P15① product center** — F9's CFO salience does not re-center the product on token cost: F2/F4 confirm context quality as the Step-1 investment; cost belongs in the value story (Section 5) and the adjacent compressor track.

---

# Section 5 — Reframes & Inspirations

1. **The value story stays context-centric** *(softened per P27)*. The product's one problem is context supply; DORA's contribution to the pitch is justification, not aim — its own causal arrow ("provide better context to the AI to improve initial code quality", ROI p. 33) and its Step-1 roadmap placement are third-party authority for why a context base is the right investment. No verification-outcome claims are made or measured as product claims.
2. **Borrow DORA's roadmap language; recruit the platform team.** ctx is the developer-edge of "Step 1: Build the context layer" (ROI pp. 43–44) — a CapEx-legible frame the CFO story can cite. F11 makes the internal platform team the natural sponsor and distribution channel (private registry P13 + org-controlled hook P3 already fit platform-team ownership), rather than dev-by-dev adoption.
3. **Demo on the ugliest repo, not the nicest.** F8: generic AI's gains collapse on legacy brownfield code — precisely where ctx's invisible-context types differentiate. A greenfield demo undersells the product by construction; the oldest internal repo is the wedge (pairs with G6's backfill playbook).
4. **Humans are the majority consumers during the transition.** 61% never use agentic AI (survey window Jun–Jul 2025 — dated, trend is up, but direction stands): the push floor + `ctx guide` carry more early internal value than the MCP tools; P16's instinct ("push is perhaps the most critical") is now evidence-backed. Weight push robustness and guide polish accordingly in adoption planning — build order can stand.
5. **The skill-formation angle is a second pitch surface.** Anthropic's −17% comprehension finding + the apprenticeship-rupture essay (T5): Entity Biography is not just agent-parity for humans — it is the *why-preserving* channel engineering leadership worries about when hiring fewer juniors. A distinct story for a distinct internal audience.
6. **The compressor's measured numbers are the bridge currency.** Until G2's downstream deltas accumulate, the only *measured* internal numbers live in the compressor's ledgers. The honesty moat makes them the only citable figures on day one. Keep the product centered on context (P15① stands) — but don't strand the measured numbers when telling the story (F9).

---

# Section 6 — Explicitly NOT Changing

| Tempting move | Why it looks attractive | Why it is wrong here |
|---|---|---|
| **Build an AI review bot** | F3 is the #1 pain; DORA's mitigation #2 is literally "use AI to assist code review" | North star is context, not review automation; the category is crowded vendor territory; ctx's differentiated move is the reviewer's *context brief* (G1) — supplying the evidence, not the judgment |
| **Expand push into a "project brief"** (in-effect decisions, hot areas, architecture summary) | F2 headline: "give AI internal data"; more standing context feels like more value | The AGENTbench-condemned shape ([ACADEMIC]): standing injected context with low information gain reduces success and raises cost; P17's digest-only restraint is the evidence-correct call — T1 says access-by-default, push-by-exception |
| **Add LLM-authored wiki/prose generation** | The whole wiki reference cohort does it; "docs for AI" is the hype default | X2: restatement context measurably hurts; CONTEXA-IMPL already names "LLM prose with decorative citations" as the cohort failure mode; On-demand Inferred + validator loop stays the ceiling |
| **Cite headline waste numbers** ("42% avoidable", "62% re-sent", "10–100x agents-vs-chat") in the internal story | They are viral and CFO-scary | §4/§5 verification: PARTIALLY CONFIRMED / UNVERIFIABLE / converging-estimate; the honesty moat forbids exactly this; use own-measured deltas instead (G2) |
| **Add a daemon/resident process for fresher context** | "Freshness is first-class" (R4) seems to demand it | No force demands sub-query-latency freshness; P24's query-time dirty checks + cold-path catch-up satisfy R4/B3; the 0.3.2 daemon rejection (complexity/reliability/security) stands unpressured |
| **Aggressive memory auto-expiry** | The auto-memory failure-mode discourse (crowding, contradictions, no expiry) | Evidence is [ANECDOTE/first-party issue] tier; P21 already answers each documented mode (anchor-invalidation → needs-review, review queue, decay-in-ranking, explicit supersede, never-destructive); auto-delete on weak evidence would violate the design's own conservatism |
| **Re-center the product on token cost** | F9 is the loudest CFO pain of 2026, and the compressor already exists | The North Star fixes context; F2/F4 prove context quality is the Step-1 investment; token efficiency stays the supporting discipline (P15①) with its numbers used in the story (Section 5.6) |
| **Build a governance/policy module** | F10: AI stance is the strongest cultural amplifier | An org's stance document is just content type 5 (domain docs) if written down; enforcing policy is a different product; the invariant (X1) is ctx's genuine governance contribution |
| **Reorder the route code-first** | Code graph is the most technically impressive part; reference projects all start there | P26 already rejected this as codegraph inertia — and Section 1 independently re-derived the same priority (R2: code is self-describing to agents; intent is not). The DORA evidence *confirms* the route's central bet |

---

# Section 7 — Forks for the Maintainer

### FORK-A — What leads the internal value story?
| Option | Optimizes for |
|---|---|
| A1. **Verification-tax-first** (DORA-aligned narrative; needs G2 deltas to mature before it has numbers) | durable positioning on the strongest [SURVEY] evidence; CFO story matches DORA's own roadmap language |
| A2. **Cost-visibility-first** (compressor's measured ledger numbers, available today) | immediate measured proof; risks re-anchoring the product as "the token saver" the P15 pivot moved away from |
| A3. **Dual-track** (context/verification story to engineering leadership; cost story to finance) | audience fit; costs two narratives' upkeep |

**Settles it**: who actually signs internal adoption (engineering VP vs platform team vs finance), and whether compressor ledger numbers are accepted as currency by that audience.

### FORK-B — Guide at M3 vs GitHub carrier earlier
| Option | Optimizes for |
|---|---|
| B1. **Keep P26 order** (M3 guide → M4 importers) | humans-see-it early (supports Section 5.4); biography lands complete after M2 code |
| B2. **Pull GitHub PR ingestion forward** (before or alongside M3) when the G4 audit shows PR-resident decisions | decisions-type coverage on real target repos; makes the M1 flagship answer true in practice, not just on fixtures |

**Settles it**: the G4 decision-locus audit + whether early internal adopters are guide-viewers or agent-users.

### ~~FORK-C — Shape of the review-moment surface (G1)~~ — **RESOLVED-OUT by P27**

No review surface of any shape (ref-mode / fourth tool / guide page). The review moment is not a
product surface; D17's evidence-gated promotion remains the only path back if usage evidence
ever demands a change-set ref form.

---

# Section 8 — Best Read & Uncertainty

**Highest evidence-weighted expected value (re-ranked after the P27 ruling; G1 rejected as
out of scope):**

1. **G2 — record-only baseline before M1 rollout.** Small, cheap, and *time-irreversible* — the only recommendation with a hard deadline attached (adoption destroys the control arm). *Would change my mind*: an explicit maintainer call that holdout-arm A/B is acceptable later.
2. **G3 — discoverability gate on push.** The always-on surface is exactly the object AGENTbench measured; one ranking factor + one A/B arm keeps the ≤1KB floor on the right side of the only [ACADEMIC] result in the corpus. *Would change my mind*: push-on/off A/B showing clearly positive results without the gate.
3. **G4 — decision-locus audit on target repos** (feeds FORK-B) — cheapest way to make the M1 flagship answer true on real repos, not just fixtures.

**Explicitly not to decide yet**: FORK-A story lead (wait for the first measured deltas); FORK-B ordering (wait for the G4 audit); anything premised on agentic-majority workflows (the 61%-never figure is 12 months old — re-check before betting either way).

**Uncertainty, stated plainly**: the review-bottleneck telemetry (LinearB/DX-Faros/CircleCI) is vendor-self-interested and partially same-dataset; G1 survives because DORA's own [SURVEY] framing carries it, not the telemetry. The AGENTbench result is one study (138 tasks, Python) — G3 is a cheap hedge, not a proven defect. Section 1's independence was implemented by delegating to a fresh agent with the design docs unopened, because this session itself carries design memory; the derivation converging with P26's route logic is therefore meaningful, not circular. No convergence was manufactured: the largest finding (G1) is a *gap*, not a validation.
