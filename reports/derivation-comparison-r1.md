---
status: frozen
purpose: four-way comparison of the v3 zero-base derivations (Fable/Cairn, Opus-max/Keystone, GPT-5.6/Change Case Compiler) + the context-loaded CTX/Atlas direction doc — arbitration verdicts and next-step evidence chain
---

# Four-way derivation comparison — round 1

Sources compared (all paths relative to `reports/`):

| Run | File | Model | Context |
|---|---|---|---|
| Prompt | `independent-derivation-prompt.md` | — | the v3 exercise given to all three sealed runs |
| Run A — Cairn | `derivation-claude-fable.md` | Claude Fable 5 | sealed, zero repo context |
| Run B — Keystone | `derivation-claude-opus-max.md` | Claude Opus 4.8 (max effort) | sealed, zero repo context |
| Run C — Change Case Compiler | `derivation-codex.md` | GPT-5.6 | sealed, zero repo context |
| Run D — CTX/Atlas | `product-future-direction.md` | Codex round | **not sealed** — full repo context, audits prior decisions |

## Independence caveats

Read the convergence claims below with these constraints in mind:

- Runs A, B, C had **zero repo context** — only `reports/enterprise-dev.md` and the v3 prompt itself. Nothing in this repo (VISION.md, ADRs, prior branches) could bias them.
- **A and B share a model family** (both Claude). Their pairwise agreement may partly reflect shared training priors rather than two independent derivations. C (GPT-5.6) is the heterogeneous control — where C agrees with A and B, that is the strongest cross-family evidence in this set.
- **Run D is not independent.** It explicitly lists "current shipping repositories, and local usage evidence" as inputs, and states its own purpose as auditing — not ignoring — the prior roadmap discussion ("The prior discussion is not an implementation plan. It is useful only as a record of rejected assumptions..."). Where D converges with A/B/C, that is weaker evidence (it may just mean D read the same report). Where D diverges from A/B/C, the divergence may be a **resource-reality artifact** (team size, sunk code, existing branches) rather than an independent product judgment.

---

## Convergence bedrock (A, B, C — cross-family, strongest evidence tier)

All eight items below appear, independently, in all three sealed runs.

**1. Compile evidence at the decision/change moment; reject standing truth stores and new destinations.**
All three sketched a central-graph/timeline shape first and killed it for the same reason: it cannot prove per-claim freshness, and observation alone doesn't close the decision loop. Cairn's Shape A ("The Oracle") — killed because "a destination... loses to defaults" and "trust cannot be earned invisibly." Keystone's Shape A ("The Twin") — killed because it "cannot confess staleness." Change Case Compiler's Shape A ("Engineering Flight Recorder") — killed because "observation does not close the decision loop: a human must still decide."

**2. Claim-level contract: source URI + revision/hash + observed time + freshness + access class + status enum.**
Cairn's `claim{}` object carries evidence, `observed_at`, `derivation`, `confidence`, `decay_class`, `acl`. Keystone's Brief claims carry provenance (source + query + timestamp), freshness/confidence score, `UNKNOWN` where ungrounded. The Change Case Compiler's claim ledger is the most explicit: **classification `OBSERVED | DECLARED | INFERRED | CONFLICT | UNKNOWN`, source URI, source revision/artifact hash, observed time, freshness state, access class** — the finest-grained derivation typing of the three.

**3. Citation-or-silence; LLM restricted to narrating/ranking cited evidence; conflicts surfaced side-by-side, never reconciled; UNKNOWN/DARK first-class.**
All three state the identical hard rule in near-identical words: Cairn — "No claim without evidence... model output may only arrange and cite existing claims." Keystone — "An LLM may never introduce a claim that isn't backed by a Connector fact." Change Case Compiler — "It does not create an untraceable fact... change a source receipt... or turn an unknown into a fact." All three explicitly refuse silent conflict reconciliation, and the Compiler states outright: **"Silence never means 'no impact.'"**

**4. Ownership as a multi-capacity responsibility vector — never a bare name; abstain or show conflict rather than guess.**
Cairn's Steward resolver: `can-review-code, understands-runtime, can-approve-change-class, is-on-call-now, made-this-decision, active-expert`, fusing declared/behavioral/operational/live signals, **abstaining** rather than guessing. Keystone's Routing Brief resolves the same six-layer ownership question but **surfaces conflicts rather than abstaining**. The Compiler's Responsibility vector separates code review / runtime response / policy approval / business decision / current expertise, each with reason and source. (This convergence is on the *shape* of the object, not the resolution policy — see verdict on the P3 split below.)

**5. Verification as a contract/ledger: acceptance criteria → assertions → checks → artifacts; review restructured from line-reading to discharging items; no correctness verdicts.**
Cairn's Verification Ledger: "the reviewer approves the ledger, not just the diff." Keystone's Verification Brief maps acceptance-criteria coverage and flags test gaps, explicitly refusing to "make AI output correct." The Compiler's Verification contract: "acceptance criterion → risk/behavior claim → required check → produced artifact → result." All three state judgment stays human.

**6. Delivery: auto-assemble control evidence into the existing change system (ServiceNow-class); information layer only.**
Cairn's Delivery Passport is "rendered into the ServiceNow record — fields pre-filled, evidence attached." Keystone's Readiness Brief auto-assembles "a change-record bundle" for the same target. The Compiler's Workflow broker explicitly "does not become a parallel CI engine, ticket system, or approval database" — approval policy stays organizational in all three.

**7. Day one: read-only, non-blocking shadow mode on PRs; reversible opt-out; prediction-vs-outcome calibration loop; pre-registered kill criteria.**
Cairn: 2–4 week shadow mode, "publishes its own shadow-mode precision... before asking for anything." Keystone: "read-only PR companion on one workflow for one pilot team," self-measuring "from day one in record-only mode." The Compiler: GitHub Check "in read-only shadow mode," bad claims "disabled at the rule/source level before any gate is considered." All three attach a falsification/calibration loop (Cairn's scoreboard, Keystone's reconciler, the Compiler's control/calibration plane) and a named kill test (§ below).

**8. Identical riskiest assumption:** whether mechanically compiled evidence from real enterprise systems reaches precision/coverage high enough that engineers keep trusting it.
Fable: the substrate's "first impression" must not be **"confidently wrong"** — "in this culture, trust lost to fabricated-looking output is not recoverable." Opus: "If it's noisy or wrong, Keystone is **just a prettier catalog** and reviewers will re-grep anyway." Codex: without joinable, timely evidence "the chosen shape becomes **a confident formatting layer and should not be built**."

---

## Arbitration verdicts on the four open points

| # | Question | Fable/Cairn | Opus/Keystone | Codex/Change Case Compiler | Verdict |
|---|---|---|---|---|---|
| ① | One integrated system vs split products | one system | one system | one system | **3:0 for one system.** Run D's CTX/Atlas split is a resource-reality artifact (team size, sunk branches, unproven demand — see Run D's own opening: "Do not run another roadmap debate round... None of them is demand evidence"), not an independently-reached design conclusion. |
| ② | Continuously-ingested substrate vs on-demand compilation | continuous, decay-classed Claimbase, ingestors run continuously | stateless, bitemporal as-of compute; graph is a "disposable per-query cache," never a promise | on-demand evidence collection; "durable indexes remain accelerators — not asserted truth" | **2:1 for on-demand** (Opus + Codex vs Fable). |
| ③ | Precision-first vs recall-first vs absolute guardrail | paired endpoint, CONFIRMED-tier precision ≥ 90% and realized-impact recall ≥ 70% (precision named/framed first; "confidently wrong" thesis is precision-weighted) | recall ≥ 0.80 @ precision ≥ 0.50 (recall is the named primary endpoint; precision is only a floor guardrail) | zero-tolerance guardrail: no material false reassurance may ever be shown as fact — the strictest form of the same instinct | **2:1 for precision/trust-first** (Fable + Codex vs Opus), with Codex the strictest instantiation. *Correction: Fable's endpoint is a paired precision-AND-recall bar, not precision-only — grouped here on rhetorical/design emphasis, not because it dropped the recall bar.* |
| ④ | Resident endpoint daemon vs zero-local-daemon thin client | thin single binary; "no local indexing daemon, no per-keystroke spawns"; all compute server-side | Broker: "one process per developer machine (not per-call spawn)" — a long-lived resident client process | explicit: "a per-repository resident daemon [is] a poor default" — thin HTTPS client | **2:1 for thin client** (Fable + Codex vs Opus). Footnote: this matches the repo's own independent prior decision to reject a resident daemon for tk 0.3.2 (no further detail needed here). |

---

## Unique contributions worth absorbing

**Fable / Cairn**
- **Dark Map** — a continuously published inventory of what the system cannot see (unindexed repos, missing telemetry zones), framed as an "honesty budget," not an apology.
- **Confidence demotion** — a derivation rule that produces N confirmed-wrong claims automatically drops a confidence tier until fixed; trust decay is mechanical, not manual.
- **Retrospective backtest with time-sliced claims** — briefs regenerated *as of* the PR-open commit from claims sliced to that date, so the test can't cheat by using hindsight.

**Opus / Keystone**
- **Bitemporal as-of computation as the anti-CMDB commitment** — every Brief shows the exact moment it was computed and offers a recompute; this is the structural reason it can't go stale the way a twin does.
- **Terraform-plan resource-level change semantics** as a named high-signal source "most tools ignore" (e.g., flagging that a plan recreates an RDS instance).
- **Confidence calibration check** — a stated 0.9 confidence must be empirically right ~90% of the time; calibration, not just precision/recall, is tracked.

**Codex / Change Case Compiler**
- **Case keyed to an immutable commit range** — prevents a later diff from ever being evaluated against an earlier summary.
- **Corrections must repair the owning source; local overrides expire** — stops the system from quietly becoming its own stale catalog.
- **Authority-by-claim-type signed matrix** — governance owners formally declare, in advance, which source is authoritative for which claim type (test execution, runtime responsibility, policy approval, etc.), rather than the product asserting one global truth order.
- **Refusal of probabilistic AI-authorship detection** — will not guess whether code is AI-written without signed invocation provenance bound to the change.
- **Wizard-of-Oz shadow study** — zero code, a researcher hand-executes the planned connector queries against real PRs; the cheapest possible kill test, run before any adapter is built.

**product-future-direction.md (context round)**
- **Pre-registered behavioral gates and stop conditions** for both CTX and Atlas, with explicit "narrow-pivot / utility-only / stop" decision categories at day 90 — sharper operationalization of "kill criterion" than any single sealed run.
- **The discipline that no inconclusive result authorizes broad construction** ("No inconclusive result authorizes broad construction by default") — a governance rule the sealed runs don't need, since they were never asked to justify continuing an existing build.
- **Buyer/demand evidence as a separate axis** the sealed runs never had to face — Run D repeatedly flags that internal shipping metrics, sunk code, and accepted ADRs are not proof of demand, a concern structurally absent from a zero-base exercise where the tool is a given, sanctioned, internal project.

---

## Test escalation chain

The three kill tests proposed across the sealed runs compose into a single, cheap-to-expensive escalation ladder — each stage gates the next, and each is cheap enough to lose without having built the product:

| Stage | Source | Protocol | Kill / pass bar |
|---|---|---|---|
| 1. Wizard-of-Oz shadow study | Codex | Zero code. A researcher hand-operates the planned connector queries on ~12 real, non-trivial PRs across ≥2 teams; an independent truth panel adjudicates what was knowable at first-review cutoff. | Kill if fewer than 9/12 cases reach ≥80% source-backed answer coverage, **or** any case shows material false reassurance. |
| 2. Retrospective backtest | Fable + Opus (parallel designs, same shape) | Build read-only connectors only (no UI, no compiler, no PR integration); regenerate Impact/Blast-Radius briefs *as-of* PR-open time for ~150 historical merged PRs; score against realized breakages. | Fable: CONFIRMED-tier precision ≥ 90%, realized-impact recall ≥ 70% (kill below 80%/40%). Opus: recall ≥ 0.80 @ precision ≥ 0.50 (kill below 0.60/0.40). **The precision-vs-recall threshold disagreement between the two is an open calibration question, not yet resolved by either run.** |
| 3. Prospective live shadow | Fable (explicit guardrail phase); matches Opus's and Codex's day-one design | 4 weeks, non-blocking, read-only PR check on real teams; guardrail is that median time-to-first-review and review time-in-PR must not degrade versus trailing baseline. | Proceeds to graduation/opt-in only if the guardrail holds — proves the artifact isn't a new tax before it's asked to be a win. |

Each stage requires no security review of write paths and no adoption ask; the ladder gets progressively more expensive (zero code → read connectors only → a live pilot) exactly in step with how much confidence the prior stage bought.

---

## Implication for the current direction docs

`product-future-direction.md` explicitly leaves change-impact/blast-radius (P2) **unassigned**, pending "a workflow study": *"Unassigned opportunity. Do not build until a workflow study shows it beats continuity and fact-resolution use cases."* The three sealed, zero-context runs — with no visibility into Run D's decision — independently re-derived exactly this problem (P2 / blast radius) as the centerpiece of their designs, and each supplied a concrete, cheap study design (the escalation ladder above) that is precisely the missing "workflow study."

**Recommended next step:** run stage 1 (Wizard-of-Oz) or stage 2 (retrospective backtest) as the P2 evidence round. This fills Run D's stated gap without violating its own 90-day discipline (no inconclusive result authorizes broad construction) — the ladder's stage 1 costs nothing but researcher time, and stage 2 requires only read-only connectors, no new UI or adoption ask.

**Note also:** ownership/routing (P3) stays a genuine three-way, unresolved split even among the sealed runs, and needs its own evidence pass rather than being folded into the P2 study:
- **Codex** — authority-by-claim-type, sourced from a signed authoritative-sources matrix, no behavioral fusion.
- **Fable** — behavioral-fusion-with-abstention (declared + behavioral + operational + live signals, abstain rather than guess).
- **Opus** — behavioral-fusion-with-conflict-display (same signal classes, but conflicts are surfaced side-by-side rather than resolved by abstention).

This is not a resource-reality artifact like the ①–④ splits above — it is three cross-family runs genuinely disagreeing on resolution *policy*, and it should be tracked as its own open question.
