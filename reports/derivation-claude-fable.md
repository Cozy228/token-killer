---
status: frozen
purpose: zero-base derivation (v3 prompt) — model: Claude Fable 5, sealed subagent, no repo context
---

# Cairn — an evidence system for the decision moment

*A zero-base product derivation from "Enterprise Developer Friction in the Age of AI Coding Agents".*

---

## 0. Reading the problem before designing

The report's five problems look like five products. They are not. Read the evidence columns instead of the headings and one failure appears five times, at five different moments:

> **At the moment someone must decide — change, review, route, approve, ship — the organization cannot produce a trustworthy, current, cited account of the relevant reality, so a human reconstructs it by hand.**

- Fragmented context = cannot reconstruct *what is true here* (report: 58% of time is comprehension; finding information is the #1 time-waster).
- Blast radius = cannot reconstruct *what this change touches* (report: reviewers act as human impact-analysis engines; architecture discussed in only 31–38% of reviews where it materially matters).
- Ownership = cannot reconstruct *who holds which authority right now* (report: ownership is multi-layered and every record of it decays).
- Verification tax = cannot reconstruct *what this AI-scale diff actually does and whether it was checked* (report: DORA — 25% more AI adoption, −1.5% throughput, −7.2% stability, driven by batch size and review burden).
- Delivery constraints = cannot reconstruct *proof that the change satisfies the controls* (report: DORA 2019 — external gatekeeping hurts delivery; the fix is navigable process and automated evidence, not fewer controls — a regulated bank cannot delete its controls).

So the design target is a single capability applied at five moments: **assemble, from live systems of record, a cited, freshness-stamped, confidence-tiered account of reality, delivered inside the workflow step where the decision is made — and let reality falsify it, visibly, so trust is earned rather than asserted.**

The report is equally clear about what must *not* be built (its closing list): a generic chatbot, a static catalog/graph disconnected from workflows, a documentation layer that cannot prove freshness, an autonomy play that treats verification and approvals as secondary. Those exclusions shape everything below.

---

## 1. Divergence: three product shapes

Three genuinely different shapes were designed far enough to fail or survive on their own logic.

### Shape A — "The Oracle": a central living graph you ask

One org-wide socio-technical graph, continuously ingested from GitHub, Harness, Terraform Enterprise, cloud inventories, ServiceNow, Jira. Surfaces: a query UI ("what calls the payments-ledger write API?", "who owns settlement-batch at runtime?"), entity pages, an API. Humans and agents come to it with questions; it answers with provenance.

**Why it was drawn:** it attacks the root (fragmented truth) directly, once, for everyone; every one of the five problems is "a query away."

**Why it loses:**

1. **It is a destination, and destinations lose to defaults.** The report shows developers already have destinations — wikis, catalogs, portals, search — and the failure mode is identical every time: the tool exists, is stale or generic at the moment of need, and people route around it back to teammates and grep. A pull model bets on several thousand engineers changing a daily habit before the tool has proven itself. That bet has been lost repeatedly inside this evidence base (Backstage's own docs call the catalog a cache, not truth; Atlassian still finds "finding information" the top time-waster in organizations that own these tools).
2. **Freshness demand is unbounded.** An ask-anything surface must keep *everything* fresh to be trusted, because you cannot predict the query. A decision-moment surface only needs the closure of one diff, one incident, one change record fresh — a bounded, schedulable job.
3. **Trust cannot be earned invisibly.** When an Oracle answer is wrong, the user silently walks away; there is no in-flow moment where the error is caught, recorded, and corrected. The corrective loop — the only mechanism that makes a context system *stay* right — has nowhere to live.
4. It is, structurally, the report's forbidden object: "a static catalog or graph disconnected from live workflows" with better ingestion.

### Shape B — "The Brief Compiler": evidence pushed into the decision moment

No destination. The system watches the workflow events that already exist — PR opened, incident declared, change record created, migration planned — and **compiles a signed evidence artifact into that workflow surface**: a brief on the PR, a routing card in the incident, a passport on the change record. Every statement in an artifact is a *claim* with source, timestamp, and confidence. Every artifact carries falsification affordances ("this consumer list is missing X") that feed corrections back into the substrate.

The compiler still needs a live graph underneath — but the graph is **substrate, not product**. Nobody is asked to visit it; it is judged only by the artifacts it emits.

### Shape C — "The Agent Fabric": context as a machine interface only

No human UI at all. The system is a toolbelt and rule-pack compiler for the AI agents that are already mainstream: agents call `impact(diff)`, `who(artifact, capacity)`, `conventions(repo)`; per-repo "ground packs" (conventions, decisions, contracts, owners — machine-compiled, always stamped) replace the hand-written rule files the report found developers authoring by the hundreds (401 repos in the rule-file study). Humans benefit indirectly, through better agent output.

**Why it was drawn:** the report's sharpest forward-looking finding — agents amplify whoever has context and amplify the cost of whoever doesn't — plus hard evidence that developers are already hand-feeding context to agents because nothing else will.

**Why it loses as the whole product:** in a regulated bank, the five decision moments are *human-accountable* — review, approval, incident command, change management. The report is explicit that responsibility stays firmly human (IBM study; GitHub's own application card). A context layer consumed only by agents has no human falsification loop, so when it is wrong it doesn't get corrected — it gets *amplified*, at generation speed, into larger batches for the same overloaded reviewers (the exact DORA failure mode). And Shape C simply cannot reach problems 3 and 5, which are human-coordination problems.

### Convergence

**Shape B wins, and absorbs Shape C as a first-class consumer surface.** The agents get the same claims through a tool interface and compiled ground packs; the humans get the artifacts; both draw from one substrate; corrections from the human surfaces repair the context the agents consume. Shape A survives only as internals: the graph exists, but its product-facing contract is "the artifacts are right," never "come query me."

The resulting system is named **Cairn** — a marker assembled from stones found on the ground, placed exactly where the path decision is made.

---

## 2. The design

### 2.1 The core object: the Claim

Everything Cairn knows is a **claim** — never a bare fact:

```
claim {
  subject:      svc:settlement-batch
  predicate:    consumes-contract
  object:       api:payments-ledger/v2/postEntry
  evidence:     [gh:corp/settlement-batch@a41f2c3 :: src/clients/ledger.ts#L88,
                 harness:deploy/settlement-batch/prod-2026-07-08]
  observed_at:  2026-07-09T22:14Z
  derivation:   static-import + deployed-artifact-corroboration
  confidence:   CONFIRMED        # CONFIRMED | LIKELY | POSSIBLE
  decay_class:  code-edge        # re-verified on push to either repo
  acl:          union(read(gh:corp/settlement-batch), read(gh:corp/payments-ledger))
}
```

Rules that never bend:

- **No claim without evidence.** Every rendered statement on every surface carries source + as-of timestamp. There are no uncited sentences anywhere in the product.
- **Confidence is tiered by corroboration**, not by model vibes: `CONFIRMED` = independent sources agree (static import + deployed artifact + observed runtime call); `LIKELY` = single authoritative source; `POSSIBLE` = heuristic (name/semantic similarity, historical co-change).
- **Claims decay.** Each decay class has a re-verification trigger (push, deploy, rotation change, quarterly sweep). A claim past its class window renders as **stale, visibly** — greyed with its age — never silently as truth, and never hidden (hiding stale data is how catalogs lie by omission).
- **Claims carry ACLs propagated from their sources.** A brief never shows a viewer a claim derived from a repo or record they cannot read. (Costly to build; non-negotiable in a bank. See §2.7.)
- **Counter-claims are claims.** A human correction ("wrong owner", "missing consumer") is recorded with the same structure, wins on precedence, and retrains the derivation that was wrong.

### 2.2 The substrate: how data gets in and flows through

All components run inside the corporate boundary (internal Kubernetes/VMs; nothing leaves; endpoint devices only ever talk to the internal service through the corporate proxy).

**Ingestors** (read-only service credentials, per-source):

| Source | Claims produced |
|---|---|
| GitHub (org app) | repos, manifests/lockfiles, contract files (OpenAPI/protobuf/Avro), DB migration files, CODEOWNERS (as *declared*-ownership claims), PR/review/merge history (as *behavioral*-ownership claims), commit recency |
| Cross-repo static analysis fleet | import/dependency edges across repos, internal-registry package consumers, API route ↔ client call-site pairs, schema ↔ reader/writer pairs |
| Harness | pipeline definitions, deploy events (which artifact runs where, since when), rollback history, pipeline failures |
| Terraform Enterprise | workspaces, module consumers, state-derived infra resources per service, cross-workspace references |
| Cloud inventories (AWS/Azure/OCI) | resource ↔ service binding, network-level runtime edges where the platform exposes them (LB targets, VPC flow aggregates, IAM trust edges) — **depth is UNKNOWN per cloud; decided by the Foundry test in §4** |
| ServiceNow | incidents (participants, impacted CIs), change records, assignment groups, on-call rotations; CMDB CIs ingested at `POSSIBLE` and promoted only when corroborated |
| Jira / Confluence | tickets and decision documents indexed as **citable sources** for briefs — retrievable and quotable with timestamps, never asserted as current truth |
| Observability/tracing (where a team has it) | observed service-call edges with call recency — the strongest runtime evidence when present |

**Pipeline:** ingestors emit claims → the **Claimbase** (append-mostly claim store + the entity/edge graph derived from it) → **resolvers** (specialized derivation engines, below) → the **compiler**, which is triggered by workflow events (webhook: PR opened/updated, incident declared, change record created, or an explicit pre-change request) and assembles artifacts from the claim closure of that event → artifacts are pushed into the host surface (GitHub check + comment, ServiceNow record, incident channel) and served to agent tools. Falsification actions on artifacts flow back as counter-claims.

**Resolvers:**

- **Impact resolver** — walks contract/package/schema/infra edges outward from a diff; tiers each reached node by corroboration; attaches historical co-change and incident adjacency as `POSSIBLE` hints; **always emits its blind spots** (see Dark Map, §2.6).
- **Steward resolver** — treats ownership as a *query*, never a field: `who(artifact, capacity, now)` where capacity ∈ {can-review-code, understands-runtime, can-approve-change-class, is-on-call-now, made-this-decision, active-expert}. Fuses declared (CODEOWNERS, catalog), behavioral (who actually reviews/merges/fixes here, recency-weighted), operational (deploys, incident participation), and live (rotation) signals. **Abstains with an escalation path rather than guessing** — a confident wrong name is the fastest way to lose the org's trust, and the report shows every static answer to this question decays.
- **Verification resolver** — decomposes a diff into checkable assertions: behavior deltas, acceptance-criteria mapping (from the linked Jira ticket), test-coverage deltas on changed branches, policy-tagged path touches (auth, money movement, PII — tag registry maintained by security/platform), AI-provenance where the agent host exposes session metadata (**HYPOTHESIS**: hosts expose enough; degrade gracefully to "unknown provenance" where not).
- **Policy resolver** — maps a change to the enterprise control catalog (encoded once, with the change-management owners, as machine-checkable controls) and computes which controls are already evidenced by existing claims.

**LLM use (bounded):** an internal, security-approved model endpoint (**HYPOTHESIS**: one exists, since Copilot-class assistants are already sanctioned) is used for exactly two jobs — natural-language rendering of behavior-delta summaries, and semantic-similarity candidates for the `POSSIBLE` tier. Model output may only *arrange and cite existing claims*; it can never introduce an uncited statement onto a surface. This is what keeps Cairn out of the report's "generic chatbot" grave.

### 2.3 The five artifacts (one per problem)

**① Change Brief** — compiled on PR open (and on demand, pre-change, from a branch or even a written intent). One page:
*What you are touching* (services, contracts, schemas, configs — cited), *what happened here recently* (last N meaningful changes, incidents in the touched area, in-flight PRs overlapping the same nodes), *what rules apply here* (conventions and decision records indexed from Confluence/ADRs and from prior accepted brief corrections, each quoted with its date), *who is around* (routing card inline). Every line: source + as-of. → **Problem 1.**

**② Blast Radius** — a section of the Change Brief, or a standalone Impact Brief for planned refactors/migrations. Downstream consumers and affected infra, tiered:

```
BLAST RADIUS for #4821 (payments-ledger: postEntry v2 — field `valueDate` semantics)
CONFIRMED  settlement-batch    static import + deployed + traced call (2026-07-09)
CONFIRMED  recon-engine        static import + deployed (2026-07-08)
LIKELY     treasury-forecast   registry consumer of ledger-client ≥3.2 (lockfile 2026-06-30)
POSSIBLE   eod-report-gen      co-changed with ledger schema 4× in 12 months
DARK       2 consumers may exist via ad-hoc HTTP: gateway logs not ingested for zone OCI-frankfurt
```

The `DARK` line is not decoration; it is the product's honesty budget (§2.6). → **Problem 2.**

**③ Routing Card** — on PRs (suggested reviewers *with reasons and evidence age*), on incidents (responder assembly: runtime owner, on-call now, last three humans who fixed something here), and as a query for agents and humans. Never a bare name: always *who / in what capacity / why / how fresh*. One-click "wrong person" is a counter-claim and a tracked metric. → **Problem 3.**

**④ Verification Ledger** — attached to every PR, restructuring review from "read every line of an AI-sized batch" to "discharge enumerated assertions":

- behavior deltas ("retry now applies to 5xx *and* 429 — new observable behavior in client timeout paths"), each mapped to diff regions;
- acceptance-criteria coverage: each criterion from the linked ticket → the tests/diff regions that address it, or **UNMET**;
- test-gap flags: changed branches with no covering test;
- risk cues: policy-tagged paths touched;
- provenance: which portions are agent-generated (where known).

Each ledger line has a check state (machine-verified / human-verified / waived-with-reason). **The reviewer approves the ledger, not just the diff**, and the ledger becomes the durable review record — which is exactly the artifact a regulated audit wants and which today gets reconstructed by hand. This attacks the DORA batch-size mechanism directly: it does not make review optional, it makes reviewer attention *targeted*. → **Problem 4.**

**⑤ Delivery Passport** — when a change record is created (or a release cut), Cairn assembles the control evidence the change process demands, mapped to the encoded control catalog: tests ran (Harness), review discharged (ledger), impact assessed (blast radius), backout path (deploy history + rollback claim), correct approver routed (steward resolver: *approver-of-record for this change class*, not just repo owner). Rendered into the ServiceNow record — fields pre-filled, evidence attached, each item machine-checkable. The negotiated goal with change-management owners: **a complete passport makes a change eligible for the pre-approved/standard path, so the approval board reviews exceptions instead of everything** — the DORA-2019-aligned move (automate evidence and peer review; remove external gatekeeping from the happy path) that a bank can actually adopt because the controls are *strengthened*, not skipped. → **Problem 5.**

### 2.4 Surfaces — what each person (and agent) actually touches

**Developer.** Before starting: `cairn brief <repo> [--intent "widen valueDate to T+2"]` from the terminal, or the same from the IDE/web — returns a pre-change brief (①+②+③). During work: nothing; Cairn is silent. On PR open: the brief and ledger appear as a GitHub check (advisory at first) + one compact comment + a link to the full artifact page. The endpoint client is a **thin single binary that renders server-compiled artifacts** — no local indexing daemon, no per-keystroke spawns, because EDR on the managed Windows fleet taxes exactly that (given constraint); all heavy compute is server-side.

**Reviewer.** Opens the PR, reads the ledger first: which assertions are machine-green, which need human judgment, which criteria are UNMET, what the blast radius says. Approves by discharging the ledger. Falsifies anything wrong in two clicks.

**AI coding agent.** Two channels. (a) **Ground pack**: a per-repo compiled context file (conventions, decision records, contract surfaces, owner map, "do not touch" policy paths), regenerated from claims, every entry stamped — machine-maintained replacement for the hand-written rule files the report documents, kept fresh by the same decay machinery. (b) **Tool interface** (MCP-class, served from the internal endpoint): `impact(diff)`, `who(artifact, capacity)`, `conventions(path)`, `verify(pr)`, `decisions(topic)`. Same claims, same ACLs (the agent acts with its principal's permissions), same citations — so an agent's statement of context is exactly as auditable as a human's.

**Platform / SRE engineer.** Ingestor health console; the **Dark Map** for their domain (what Cairn cannot see and why — the queue of ingestion gaps ordered by how often briefs hit them); the control-catalog encoding (with change management); the accuracy scoreboard (§2.6). On incident declaration: routing card + system brief (what deployed recently in the impacted area, current owners, last similar incidents) posted into the incident channel automatically.

**Change approver / risk partner.** Sees passports inside ServiceNow — their existing surface. Cairn adds no new destination for them; it makes their record arrive pre-evidenced and machine-checked.

### 2.5 Day one on a team

1. **Zero-effort entry.** The GitHub org app, Harness, TFE and ServiceNow credentials are org-level; onboarding a team = flipping their repos into scope. No YAML to write, no catalog to curate — the report is unambiguous that hand-maintained metadata is where these systems go to die.
2. **Shadow mode (2–4 weeks).** Briefs, ledgers and routing cards are compiled for every PR but posted as a *non-blocking* check with a link. Nothing gates. The team sees Cairn's account of their own changes next to their own knowledge — the one comparison they can score instantly.
3. **Falsify freely.** Every artifact carries correction affordances; corrections during shadow mode are the calibration set. Cairn publishes its own shadow-mode precision to the team before asking for anything.
4. **Graduation, opt-in, per team.** The team enables: routing suggestions as actual review requests; the ledger as a required check; passport auto-fill on their change records. Each step is reversible, and adoption of each step is itself a measured signal of earned trust.

### 2.6 How it earns and keeps trust

Trust is the product. Mechanisms, not slogans:

- **Citation or silence.** No uncited statement can render, anywhere. Where Cairn doesn't know, it says nothing or says DARK — it never pads.
- **Visible decay.** Stale claims render stale, with age. Freshness is provable per line, which is precisely what the report says docs, catalogs and CMDBs cannot do.
- **The Dark Map.** Cairn continuously publishes what it cannot see (unindexed repos, missing telemetry zones, unparseable configs) at org and team scope, and each blast radius names the dark zones it borders. A context system that admits its blind spots is the only kind an engineer who has been burned by a stale wiki will read twice.
- **The falsification loop with an SLO.** Every correction is a counter-claim; time-to-correction is tracked and published; a derivation rule that produced N confirmed-wrong claims gets demoted (its output drops a confidence tier) until fixed.
- **The public scoreboard.** Cairn measures itself with the same rigor the culture demands of everyone: CONFIRMED-tier claim precision (sampled human audits), routing acceptance rate, realized-impact recall (when a regression ships, did the brief name the victim?), ledger UNMET items that later became defects. Numbers by team, visible to all engineers. Vendor-style claims are structurally impossible because the scoreboard is the claim.
- **Fail-open, always.** Cairn outage = PRs and changes proceed exactly as today. A context tool that blocks delivery when it hiccups dies in week one.

### 2.7 Deployment under the constraints

- **Data boundary:** everything — Claimbase, resolvers, compiler, model endpoint — inside the corporate perimeter. No source, diff, or artifact leaves. External SaaS: none.
- **Endpoints:** browser + thin client; server-side compute; no local daemons or indexers on the EDR-taxed Windows fleet; all endpoint traffic proxies to the one internal service.
- **Permissions:** claim-level ACLs propagated from source systems, enforced at render *and* at the agent tool interface. This is one of the two most expensive parts of the build (with cross-repo static analysis) and is stated as such; a bank-internal tool that leaks repo contents across entitlement boundaries is dead on its first security review.
- **Security review:** read-only credentials everywhere except the three write surfaces (GitHub check/comment, ServiceNow record fields, incident channel post), each individually reviewable; the system's own audit log records every artifact compiled, from which claims, shown to whom.
- **Auditability as a feature:** ledgers and passports are retained as records; Cairn is *designed* to be pulled into audit, because that is its wedge into the change-management negotiation (§2.3 ⑤).

---

## 3. The five questions

**1. What problem does this product solve?**
The reconstruction tax: at every consequential engineering moment — making a change, reviewing one, routing a question or incident, approving a release — someone must rebuild an account of reality (what is true here, what will this touch, who holds authority, was this verified, are the controls met) by hand, from fragmented and decaying sources. The report prices this at ~58% of developer time in comprehension, the #1 time-waster being "finding information," and shows AI *worsening* the downstream half (review, verification, delivery stability) even as it accelerates generation. Cairn replaces hand reconstruction with compiled, cited, freshness-stamped evidence delivered inside the moment.

**2. How does it solve it — by what mechanisms?**
(a) A claim substrate: every fact carries evidence, timestamp, corroboration-tiered confidence, decay class, and source-propagated ACLs; ingested continuously and read-only from the systems of record (GitHub, Harness, TFE, clouds, ServiceNow, Jira/Confluence, telemetry).
(b) Resolvers that turn claims into answers to the five question-shapes: impact walking, ownership-as-a-query with abstention, diff decomposition into checkable assertions, control-catalog mapping.
(c) A compiler triggered by existing workflow events that pushes artifacts into existing surfaces — no new destination for daily work.
(d) An agent interface (ground packs + tools) serving the same claims under the same ACLs to the AI agents that now author much of the change volume.
(e) A trust economy: citation-or-silence, visible staleness, published blind spots (Dark Map), falsification loop with correction SLOs, and a self-scoreboard measured to the org's own evidence standard.

**3. Which features solve which of the five problems?**

| Report problem | Cairn feature |
|---|---|
| 1. Fragmented, untrusted context | Change Brief (pre-change + on-PR) on the claim substrate; decision/convention indexing; ground packs for agents; visible decay + citations make "untrusted" answerable |
| 2. Manual blast-radius estimation | Impact resolver + Blast Radius artifact with CONFIRMED/LIKELY/POSSIBLE tiers and DARK disclosures, on PRs and pre-change for refactors/migrations |
| 3. Ambiguous ownership/routing | Steward resolver (ownership as capacity-scoped live query, behavioral + declared + operational signals, abstain-don't-guess) + Routing Card on PRs, incidents, and the agent/human query surface |
| 4. Hidden verification tax | Verification Ledger: behavior deltas, acceptance-criteria coverage, test-gap flags, policy-path risk cues, AI provenance; review restructured to discharging assertions; ledger = durable review record |
| 5. Non-code delivery constraints | Delivery Passport: control catalog encoded once, evidence auto-assembled into ServiceNow, machine-checkable completeness, negotiated standard-change fast path so boards review exceptions |

**4. Are all five solved? Where honestly not, and why not.**
None is solved to 100%, and the ceilings differ:

- **P1 — high coverage, one hard ceiling: tacit knowledge.** What was never recorded anywhere cannot be ingested. Cairn narrows the gap by making capture nearly free at decision moments (an accepted brief correction, a ledger waiver reason, a decision cited in review becomes a claim), but knowledge that lives only in heads stays dark until it surfaces in a workflow.
- **P2 — the ceiling is recall, and it is unprovable.** Static + deploy + trace evidence catches direct and most transitive coupling; semantic coupling (two services independently encoding the same business rule) is reachable only heuristically (`POSSIBLE` tier); telemetry-poor zones stay DARK. The honest product claim is "materially fewer surprises, with measured recall on realized incidents" — never "complete impact analysis." The report's own literature says a general ripple-mitigation instrument does not exist; Cairn does not pretend to be one.
- **P3 — solved for routing, bounded by organizational churn.** Behavioral signals lag reorgs by weeks; the resolver's abstention rate *is* the residual, and in a fast-reorging division it will be nontrivial. Cairn makes abstention explicit and escalation cheap rather than guessing.
- **P4 — the mechanical half is solved; the judgment half cannot be.** Coverage mapping, behavior deltas, gap flags and provenance compress the *reconstruction* part of review. Whether the design is right, whether the abstraction is sound — irreducibly human, and Cairn deliberately does not simulate that judgment (the report's evidence on AI-verifying-AI and on over-reliance points the same way). The verification tax is cut, not abolished.
- **P5 — technically solvable, organizationally contingent.** Passport assembly works regardless; the *lead-time* win requires change-management owners to ratify "complete passport ⇒ standard-change path." Cairn is built to make that negotiation winnable (controls become stronger and audit-cheaper), but a tool cannot force a policy owner's signature. Until ratified, P5 is only ameliorated: evidence gathering goes from hours to minutes, while the waiting stays.

**5. What happens to a team that doesn't have this product?**
The report already describes that team; the trend lines just steepen. They keep paying the ~58% comprehension tax by hand, and their AI agents — now writing an increasing share of the code — work from stale, hand-written rule files and no impact model, generating ever-larger batches (DORA: throughput −1.5%, stability −7.2% per 25% adoption step) into a review process still done line-by-line by humans with no ledger. Their blast-radius estimates remain grep-plus-asking, so cross-service regressions surface in production; "who owns this" remains a Slack archaeology exercise that decays with every reorg; every regulated change re-collects the same evidence by hand. Meanwhile, teams with the compiled-context layer get compounding returns from the same agents, because — the report's final conclusion — agents amplify whoever already has context and amplify the cost of whoever doesn't. The gap between the two teams is not static; it widens at AI speed.

---

## 4. The riskiest assumption — and the cheapest honest test

**The assumption everything rests on:** *claims compiled mechanically from this enterprise's actual systems of record (GitHub + Harness + TFE + ServiceNow + available telemetry) can reach high enough precision — and non-embarrassing recall — on cross-boundary impact and ownership that engineers still read the artifacts after their first ten encounters.*

Every downstream mechanism (ledger adoption, passport negotiation, agent ground packs, the trust economy itself) dies if the substrate's first impression is "confidently wrong." And in this culture, trust lost to fabricated-looking output is not recoverable. Note what is *not* the riskiest assumption: that developers want this (the report establishes the pain), or that the workflow hooks exist (they demonstrably do). The bet is substrate quality against messy real sources.

**The cheapest honest test — a retrospective backtest, before any product is built:**

- **Protocol.** Recruit two volunteer teams whose services have known cross-team consumers. Build *only* the ingestors for GitHub + Harness + TFE (plus tracing if one team has it) over those teams' dependency closure — no UI, no compiler, no PR integration. From the last 6 months, take (a) ~150 merged PRs, (b) every realized cross-boundary breakage traceable to a change in those repos (target ≥15 incidents/regressions; if fewer exist, widen the window). For each PR, generate the Blast Radius and Routing Card *as of the PR-open commit* — retrospectively, from claims time-sliced to that date. Two engineers per team audit a random sample of 200 CONFIRMED/LIKELY claims for truth-at-that-time; for each realized breakage, check whether the victim appeared in the brief and at what tier. Cost: roughly two engineers × 6–8 weeks of ingestion plumbing plus a few days of team audit time. No endpoint software, no security review of write paths, no adoption ask.
- **Primary endpoint.** Paired: **CONFIRMED-tier precision ≥ 90%** on the audited sample, and **realized-impact recall ≥ 70%** (breakage victims named at LIKELY-or-higher). *(Thresholds are HYPOTHESIS; the audit itself calibrates where "engineers keep reading" sits — validated in the guardrail phase.)*
- **One guardrail.** A 4-week live shadow on the same two teams (briefs as non-blocking PR links only): median time-to-first-review and review time-in-PR must not degrade versus each team's trailing 8-week baseline — proving the artifact is not a new tax even before it is a win.
- **Kill criterion.** After one full correction cycle (audit findings fed back, derivations fixed, re-run): **CONFIRMED precision < 80%, or realized-impact recall < 40%.** Below that, the enterprise's sources cannot support the impact substrate — kill the blast-radius core, and re-scope to the shallow-substrate survivors only (Routing Card + Delivery Passport, which lean on rotation, review-history and pipeline claims that this test will have validated or killed separately) — or kill entirely if steward-claim precision failed too.

The test is honest because it uses the org's own history as ground truth, prices the product's central promise in its own currency (would the brief have warned you about the thing that actually broke?), and is cheap enough to lose.
