---
status: frozen
purpose: zero-base derivation (v3 prompt) — model: Claude Opus 4.8 (max effort), sealed subagent, no repo context
---

# Keystone — a decision-moment evidence compiler for enterprise engineering

## 0. Thesis in one paragraph

The report's load-bearing finding is not "developers need more code." It is that the expensive work has moved to *reconstructing, validating, and routing trusted context at the moment someone must decide, review, approve, or fix* — 58% of time on comprehension, "finding information" the single top time-waster, and AI making this *worse* by generating larger batches whose review, verification, and coordination cost land downstream (DORA: +25% AI adoption → −1.5% throughput, −7.2% stability). Every existing category the report examines fails on the same axis: portals and catalogs are "a cache over underlying systems… not the ultimate source of truth" (Backstage's own words), CMDBs need constant stale-data cleanup, docs exist but the answer isn't "current and trusted in the moment," and RAG/agents disappoint because "the core problem is not merely retrieval, but trusted, workflow-specific decision support." So the product I would build is not a store of truth at all. **Keystone** is a *compiler*: at a concrete decision moment (a PR opens, an incident is declared, a migration is planned, a change record is filed) it assembles a scoped, provenance-stamped, confidence-scored **Brief** by querying primary systems live, refuses to assert anything it cannot cite, proves its own freshness per claim, and attaches the Brief to the workflow object where the decision actually happens. It maintains no authoritative model of the world; it is authoritative only about *what was observed, from where, at time T, at what confidence* — which is exactly the property the report says every incumbent lacks.

---

## 1. The design

### 1.1 Diverge — three product shapes

**Shape A — "The Twin": a living socio-technical graph.**
Stand up a central graph that ingests everything — code and cross-repo symbol references, CI/CD runs (Harness), infrastructure (Terraform Enterprise state, AWS/Azure/OCI inventories), traces, incidents (ServiceNow), tickets/docs (Jira/Confluence), CODEOWNERS, on-call — and normalizes it into one queryable digital twin of the engineering organization. Every workflow (impact, ownership, verification, readiness) becomes a query against the twin. This is the instinctive enterprise answer: one model, precomputed and fast, familiar to buyers, powers dashboards, "single pane of glass."

**Shape B — "The Compiler": a decision-moment evidence compiler.**
Maintain *no* central model. Instead, when a decision moment fires, a query planner fans out to the primary systems *live*, pulls the minimal facts the specific decision needs, and compiles an ephemeral **Brief** in which every claim carries provenance (source system + exact query + timestamp) and a freshness/confidence score. The Brief is attached to the PR / incident / ticket that triggered it, and it is recorded — with all its evidence — in an append-only **Ledger** that is authoritative about observations, never about the world. A graph may exist, but only as a disposable per-query cache the compiler builds and throws away, never as the product's promise.

**Shape C — "The Oracle": a conversational context assistant / RAG-over-everything chatbot.**
Embed all engineering artifacts, put a chat box in the IDE, answer "who owns this / what breaks / how do I ship this" in natural language.

### 1.2 Converge — the choice and why the losers lost

**Shape C is eliminated on the report's own evidence.** The report is explicit about what *not* to build: "a generic enterprise chatbot," "a broad 'knowledge layer' that cannot prove source freshness and confidence," and it names the exact failure mode — Stack Overflow shows 46% distrust vs 33% trust in AI accuracy, and 35% of SO visits are now *repairs* of AI-related issues. A chatbot that cannot cite, cannot prove freshness, and reconciles conflicting sources silently would be born into that trust deficit. Eliminated at the door.

**Shape A is the strong, seductive loser.** It is a fair contender — it is genuinely what a competent platform org would try, and it is fast at query time. It loses because it optimizes the wrong variable. Its entire value depends on the graph being *fresh and correct enough to trust at the decision moment*, and the report's central finding is that maintaining exactly that property, at several-thousand-engineer / many-service scale, is the losing race every incumbent already lost: Backstage documents that its catalog "should not be considered the ultimate source of truth… better treated as a cache," and ServiceNow's CMDB ships stale-data cleanup precisely because "referenced configuration items drift over time." A twin inherits that decay *and* raises the stakes: the first time it confidently says "team A owns this" and team A doesn't, in an incident, trust collapses org-wide and it joins the pile of ignored catalogs. It cannot prove, per claim, how fresh it is — a precomputed answer has no honest way to say "the trace behind this is 3 minutes old but the owner is inferred from a 14-month-old wiki page." **Shape A cannot confess staleness; Shape B is built to.** That single property is the report's whole diagnosis, so B wins.

The winning design *absorbs* A: the graph becomes an internal, disposable, per-question cache inside the Compiler — an implementation detail with a TTL, never a promise to the user. We keep A's query power exactly where it's cheap and lose A's fatal promise of standing truth.

**Nearest categories, and why Keystone is deliberately none of them** (a conclusion, not a starting point):
- Not a **portal**: it owns no central UI-of-record; it injects Briefs into the workflow objects that already exist (the PR check, the incident, the change ticket).
- Not a **catalog/CMDB**: it maintains no authoritative model; the Ledger records observations, not world-state.
- Not a **code-review bot**: it does not judge code quality or style; it compiles cross-system decision evidence (impact, ownership, readiness) and hands the judgment to a human.
- Not a **RAG layer**: it runs structured queries against systems of record, is provenance-first, and *refuses to emit an un-cited claim* — the opposite of embedding-similarity synthesis.

### 1.3 What Keystone is — the chosen shape, concretely

**The one architectural commitment (everything else follows from it):**
Keystone holds no source of truth. Every Brief is a **bitemporal, as-of computation**: "here is the answer, computed at 14:02, from these sources whose own timestamps are shown, at these confidences." Re-open a Brief and it shows its as-of stamp and offers a recompute. This is the structural reason Keystone cannot go stale the way a twin does — it never claims standing freshness; it computes and proves freshness per question. It is the anti-CMDB.

**The objects (the whole system is five nouns):**

| Object | What it is |
|---|---|
| **Connector** | A read-mostly adapter to one primary system (GitHub Enterprise, Harness, Terraform Enterprise, AWS/Azure/OCI, ServiceNow, Jira/Confluence, observability/tracing, on-call). Runs in-network, least-privilege service account. Returns raw facts with source timestamps. Never writes to the source. |
| **Compiler** | The query planner + resolver. Given a decision trigger + scope, it plans the minimal fan-out, joins the facts, scores freshness/confidence, and emits a Brief. It builds a throwaway per-query graph if a join needs one. |
| **Brief** | The unit of output: a scoped, structured answer to one decision-moment question. Every claim links to its provenance and carries a freshness + confidence score. Attached to the workflow object; five types (below). |
| **Ledger** | Append-only, bitemporal, audit-grade store of every Brief and every piece of evidence that went into it. Authoritative about *observations*, not the world. This *is* the audit artifact a regulated bank needs. |
| **Broker** | The thin, long-lived endpoint client. One process per developer machine (not per-call spawn — respects EDR spawn tax); serves the IDE extension, the CLI, and a local **MCP** endpoint for agents, proxying to the central Compiler over the corporate network. |

**The five Brief types — one per report problem:**

1. **Context Brief** — "What is this, how does it work *now*, what rules apply here, which source do I trust?" Scoped to a service/module/change. → Problem 1.
2. **Impact Brief** — "What is the blast radius if *this diff* lands?" Ranked, evidence-typed, confidence-scored consumers/services/schemas/infra. → Problem 2.
3. **Routing Brief** — "Who can review / approve / be paged / consulted on this *right now*, and why?" Resolves the six ownership layers, surfaces conflicts. → Problem 3.
4. **Verification Brief** — "What *behavior* changed, what's the risk, what's covered, what's the test gap?" → Problem 4.
5. **Readiness Brief** — "What must happen for this change to ship, what's the status, here is the assembled evidence bundle." → Problem 5.

**Where an LLM is allowed — and the hard rule.** LLMs are used *only to narrate and rank over cited evidence*: to write the prose of a changed-behavior summary from an already-computed API/schema/IaC delta, or to order an already-computed list of consumers. **An LLM may never introduce a claim that isn't backed by a Connector fact.** This is how Keystone uses models without re-importing the hallucination/trust problem the report warns about. Anything the LLM cannot ground is emitted as an explicit `UNKNOWN`, not a guess.

### 1.4 Data in, and the flow through — an end-to-end PR walkthrough

A developer (or an AI agent) opens a PR touching `shared-platform/payments-core`.

1. **Trigger.** GitHub App webhook → Compiler receives `(repo, base, head, diff, author)`. (Symmetric triggers exist for: ServiceNow incident declared, Jira migration epic opened, ServiceNow change request filed, or an explicit `keystone brief <target>` from CLI/IDE/MCP.)
2. **Plan.** The Compiler parses the diff into changed *symbols, files, configs, schemas, and IaC resources*, then plans the minimal fan-out for the four PR-relevant Brief types.
3. **Fan-out (live, primary sources):**
   - Cross-repo code graph (built lazily from the repos the service account can read) → *static* consumers of changed symbols.
   - **Terraform Enterprise state** → infra resources bound to this service and workspaces referencing its outputs; a `terraform plan` diff on the touched IaC → resource-level change semantics (e.g., "this recreates an RDS instance"). *This is a distinctive, high-signal source most tools ignore.*
   - Tracing/observability (last N days) → *runtime* callers actually in production, not just static references.
   - ServiceNow → recent incidents on these services.
   - CODEOWNERS + merge/approval history + on-call + Harness deploy actors + resource tags → candidate owners/reviewers/approvers/operators.
   - Change-policy rules → what approvals/evidence *this path* requires.
4. **Compile four Briefs:**
   - **Impact Brief** — consumers ranked by confidence, each tagged with its *evidence type*: `static-ref` / `runtime-trace(42 calls/day)` / `terraform-dependency` / `shared-schema`. Wired/traced/infra edges = high confidence; the Brief explicitly marks *"semantic-duplication coupling: not detected, unknown"* rather than implying completeness.
   - **Verification Brief** — an *evidence-anchored* changed-behavior summary (public API signature deltas, schema/DDL deltas, Terraform resource deltas, feature-flag deltas, and risk tags such as "touches money-movement path" or "file has 3 incidents in 90 days"); acceptance-criteria coverage (PR → linked Jira issue → extracted criteria → mapped to changed code/tests, flagging criteria with no covering test); test-gap flags on changed behavior with no test delta.
   - **Routing Brief** — reviewers by *present, file-scoped expertise* (recency-weighted authorship/review/incident-resolution on the exact changed symbols), required approvers by change policy, operators by on-call — **conflicts surfaced, not reconciled** (e.g., "CODEOWNERS → Team A; last 6 months of merges + current on-call → Team B").
   - **Readiness Brief** — the required approvals/environments/policy checks for this change, current status, and a pre-assembled evidence bundle ready to attach to the ServiceNow change record.
5. **Deliver.** Posted as a single GitHub **check + structured comment**; the same Briefs are available to the reviewing agent over **MCP** and to the author in the **IDE** panel. Each claim is a click to its source; each claim has a "mark wrong" affordance → feedback into calibration.
6. **Record + falsify.** Every Brief and its evidence lands in the Ledger with its as-of stamp. Post-merge, a reconciler compares the Impact Brief's *predictions* against ground truth (post-merge incidents/rollbacks/hotfixes attributable to the change; files/services that actually needed follow-up; consumers actually touched) and scores precision/recall. **That measured accuracy, trending over time, is the product's evidence currency.**

### 1.5 What each persona sees and touches

- **Developer (human).** In VS Code, a Keystone panel on the current file/change: *what is this / who owns it now / what will my change hit / is it ready to ship* — one click from the code, no tab-hopping (the report's #1 waste is the tab-hopping context reconstruction). In the terminal: `keystone brief <target>`, `keystone impact` on the working diff.
- **Reviewer.** On the PR: Impact + Verification + Routing Briefs as a check and comment. Sees *what behavior changed* (not what lines), blast radius ranked by confidence, acceptance-criteria coverage, test gaps, and who else must approve — every claim traceable to source. This is the direct counter to DORA's "author generates a large PR quickly; the reviewer still inspects every line."
- **AI agent.** MCP tools: `get_context(scope)`, `get_impact(diff)`, `get_owners(target)`, `get_readiness(change)` — each returns sourced, confidence-scored JSON with explicit `UNKNOWN`s. The agent *cannot* obtain an un-cited assertion. When the agent opens a PR, the human-facing Briefs are auto-attached, so agent-generated changes arrive pre-loaded with the reviewer's evidence.
- **Platform / SRE engineer.** Owns Connectors and the change-policy rules the Readiness Brief encodes. Sees the accuracy dashboards (prediction precision/recall over time — the evidence the culture demands before belief) and source-freshness health. On an incident: an auto-compiled **Incident Brief** (responders by live on-call + recent-resolver, recent changes to the affected services, blast radius, rollback/mitigation options from Harness/Terraform, linked runbooks) — Problems 3 + 5 fused at the highest-stakes moment.

### 1.6 Deployment under the given constraints

- **Hard data boundary.** The entire Compiler + Ledger + Connectors run *in-network* (the bank's own cloud/on-prem), talking to in-house GitHub Enterprise, Harness, TFE, ServiceNow, Jira/Confluence, and cloud control planes through the corporate proxy with least-privilege service accounts. No source code, diff, or artifact leaves the company; no external SaaS touches engineering data. If an LLM is used for narration, it is an in-network / in-VPC model endpoint only.
- **Windows 11 + EDR spawn tax.** The heavy work is central, not on endpoints. The endpoint footprint is a *single long-lived Broker process* per machine, reached over a local socket by the IDE extension, CLI, and agents — deliberately avoiding cold-start-per-invocation so the EDR/AV process-spawn tax is paid once, not per query.
- **Restricted egress / proxy.** All Connector traffic is east-west inside the network; nothing depends on public endpoints.
- **Security review (regulated).** Read-mostly by construction: Keystone writes only its own PR checks/comments, Briefs, and *proposed* change-record bundles that a human submits. It never mutates a source system. The Ledger's append-only, bitemporal evidence trail is itself an audit asset — a property that *helps* the security review rather than fighting it.

### 1.7 Day one — how it enters a team

Land as a **read-only PR companion on one workflow for one pilot team**: the Impact + Verification Briefs, posted as a non-blocking check. Zero write access anywhere except its own comment; no behavior change asked of anyone; it simply appears on PRs and starts making *falsifiable* blast-radius predictions. Because it is read-only and in-network, the security review is tractable. It **self-measures from day one in record-only mode** — prediction accuracy, whether Briefs are opened, whether reviewers mark claims wrong — producing the internal evidence the culture requires *before* any claim is believed. Expansion is workflow-by-workflow, each gate opened only after the prior one's measured value clears a bar: Impact/Verification (PR) → Routing (PR + incident) → Incident Brief (declared incidents) → Readiness + change-record bundle (ServiceNow). Never a big-bang portal rollout — the report shows those get ignored.

### 1.8 How it earns and keeps trust

1. **Provenance-first; no un-cited claim.** Every fact links to source + query + timestamp. If it can't be sourced, it's `UNKNOWN`, never a guess. (Directly answers the report's "cannot prove freshness and confidence" indictment of incumbents.)
2. **Freshness + confidence shown, per claim.** A 3-minute-old trace reads high-fresh; a 14-month-old wiki owner reads low-fresh and flagged. The Brief *confesses* its own weak spots.
3. **Conflicts surfaced, never silently reconciled.** Two disagreeing sources are shown side by side with their timestamps — the honest model of the report's "ownership is multi-layered," and the antidote to the single-field lie.
4. **Falsifiable predictions + calibration.** Impact Briefs predict; the reconciler scores precision/recall post-merge; confidence scores are checked for calibration (when it says 0.9, is it right ~90% of the time?). Trust is *earned by a visible, improving track record*, not asserted — the evidence currency the bank's culture demands.
5. **Read-only + full audit trail.** No source mutation; the Ledger is the audit artifact. Least-privilege, in-network, security-review-friendly by construction.

---

## 2. The five questions

**What problem does this product solve?**
The cost of *reconstructing, validating, and routing trusted engineering context at the decision moment* — the report's dominant, cross-cutting finding (58% comprehension time; "finding information" the top time-waster; >10 hrs/week lost to non-coding inefficiency), amplified by AI, which the report shows moves cost from cheap generation to expensive downstream review/verification/coordination. Keystone supplies that context — sourced, fresh-proven, confidence-scored — exactly where the decision is made.

**How does it solve it — by what mechanisms?**
By being a *compiler, not a store*: bitemporal as-of computation from primary systems at the trigger moment; provenance-first with a no-un-cited-claim rule; per-claim freshness/confidence; conflict-surfacing instead of silent reconciliation; a falsification loop that scores its own predictions; delivery *into* existing workflow objects (PR check, incident, change ticket) and to agents over MCP; all in-network, read-mostly, audit-logged. The graph that a "twin" would enshrine is demoted to a disposable per-query cache.

**Which features solve which of the report's five problems?**

| Report problem | Keystone mechanism |
|---|---|
| 1. Fragmented, untrusted engineering context | **Context Brief** + the whole provenance/freshness/confidence engine + conflict-surfacing + MCP feed to agents. Unifies *assembly + provenance at the moment of need*, not storage (the storage move is the doomed catalog). |
| 2. Manual change-impact / blast-radius | **Impact Brief** fusing static code graph + Terraform state + runtime traces + recent incidents + owners, evidence-typed and confidence-scored, pre-merge on the PR, with **post-merge falsification** to earn trust. |
| 3. Ambiguous ownership / decision routing | **Routing Brief** resolving all six ownership layers the report names (repo, runtime, business, incident, architectural, present expertise) from live signals, ranked by the *question being asked*, **conflicts surfaced** rather than flattened to one field. |
| 4. Hidden verification tax | **Verification Brief** (evidence-anchored changed-*behavior* summary, acceptance-criteria coverage, test-gap, risk cues) + the agent discipline (sourced input, evidence-attached output) + the track record that makes the Brief itself lean-on-able. Counters DORA's reviewer-inspects-every-line. |
| 5. Non-code delivery constraints | **Readiness Brief** + auto-assembled ServiceNow change-record evidence bundle + approval-path navigation + (later) triggers into Harness/Terraform golden-path steps. |

**Are all five solved? Where honestly not, and why.**

- **Problems 1 and 3 are the most fully addressed.** They are, at root, "assemble + prove freshness + surface conflict" problems — the exact core competency of the Compiler. Ceiling only where a fact exists in *no* system (pure tribal knowledge never written anywhere); there Keystone can route to the *person* most likely to hold it, but cannot manufacture the fact.
- **Problem 2 — high recall on *wired* coupling, honest ceiling on *semantic* coupling.** Static references, runtime traces, and Terraform dependencies give strong, confidence-scorable blast radius. But the report itself notes ripples through "indirect" paths and "semantic duplication," and that a mitigation mechanism for microservice change propagation "is still missing." Keystone cannot fully close that: where two code sites are semantically coupled with *no* static, runtime, or infra edge, it has no signal. **The ceiling is stated in the Brief itself** — it reports "semantic-duplication coupling: undetected / unknown" rather than implying completeness. Honest partial, not silent partial.
- **Problem 4 — reduced, not eliminated, and that's by design.** Keystone makes verification faster and better-targeted and makes the AI's *input* better, but it cannot make AI output correct, and it must not become the "trust us autopilot for complex enterprise codebases" the report explicitly warns against. The accountable human sign-off stays human. The tax shrinks and re-targets; it does not vanish. Also, the changed-*behavior* summary is evidence-anchored (API/schema/IaC/flag deltas + risk tags); a fully general semantic behavior diff is undecidable, so behavior beyond those anchors is summarized as narration over cited deltas, never as a guarantee.
- **Problem 5 — the lowest ceiling, and structurally so.** The report is blunt that delivery constraints are "mainly an organizational and workflow problem" and that "adding more process usually worsens performance"; DORA found external gatekeeping *hurts* delivery. Keystone can collapse the *information* cost of approvals (auto-assemble evidence, navigate the path, prove readiness) and *trigger* golden-path automation it's permitted to call — but it cannot, and should not pretend to, flatten a heavyweight approval hierarchy or grant environment access it doesn't own. **HYPOTHESIS:** removing the information/evidence-assembly friction recovers a meaningful slice of the lead-time loss even with the approval *policy* unchanged; this needs measurement (see §3's family of tests). The organizational decision to reduce gatekeeping is out of scope by construction.

So: **two solved to their natural ceiling (1, 3), one solved with a stated, in-Brief coverage limit (2), one deliberately bounded to keep a human accountable (4), and one where the tool honestly owns only the information layer of a problem that is mostly organizational (5).** Full coverage is claimed nowhere it isn't earned.

**What happens to a team that doesn't have this?**
They keep paying the taxes the report quantifies, now compounding under AI. Comprehension stays ~58% of time; "finding information" stays the top waster; blast radius stays manual grep-and-guess, producing oversized PRs and escaped defects exactly as DORA predicts (larger batches → −7.2% stability per 25% AI adoption). The reviewer stays the human impact-analysis engine, which breaks as AI inflates PR volume. Ownership hunts, incident-responder scrambles, and hand-assembled approval evidence continue as unbudgeted daily cost. Most consequentially: their AI agents keep operating on unsourced, stale context — and the report's sharpest point is that agents *amplify the cost of weak context*, so the team without Keystone doesn't just stall, it scales its context debt at the speed of its agents.

---

## 3. The riskiest assumption — and the cheapest honest test

**The single assumption the whole design rests on:**
That a Brief *compiled just-in-time from primary sources, at the decision moment*, can predict the real blast radius of a change *accurately and honestly enough that a reviewer relies on it instead of re-doing the manual analysis.* Everything else — provenance, freshness scoring, conflict-surfacing, the whole "compiler beats twin" thesis — is validated or falsified by whether the Impact Brief's predictions hold up, because the Impact Brief is the most falsifiable, highest-value, and most technically uncertain claim in the system. If it's noisy or wrong, Keystone is just a prettier catalog and reviewers will re-grep anyway.

**The cheapest study that could kill it — a retrospective shadow study (no rollout, no behavior change, read-only):**

- **Protocol.** On the pilot team's last ~150 merged PRs over 3–6 months, have the Compiler produce an Impact Brief *as of each PR's open time* — reconstructing state from source history (GitHub, versioned Terraform state, archived traces, the incident timeline). Then reconcile each Brief against ground truth: what actually broke (post-merge incidents/rollbacks/hotfixes attributable to the change), what files/services actually required follow-up changes, what consumers were actually touched. Requires only the read Connectors and data the bank already has — no deployment, no developer time.
- **Primary endpoint.** Blast-radius *precision and recall*: predicted at-risk consumers/services vs. those that actually broke or required change. Bar: **recall ≥ 0.80** on wired/runtime/infra coupling **at precision ≥ 0.50**.
- **One guardrail.** *Noise*. Precision must not fall so low that the Brief trains reviewers to ignore it — no more than one false-flagged consumer per true one at the operating point (precision ≥ 0.50); a noisy blast-radius tool is worse than none. Paired calibration check: on the subset the Brief self-labels *low confidence*, it must not be quietly wrong (stated confidence tracks observed accuracy).
- **Kill criterion.** If, after connector tuning, recall on wired/runtime/infra coupling stays **< 0.60** *or* precision at the operating point stays **< 0.40**, the "trusted compiled impact" thesis is dead: the Compiler doesn't beat manual grep, and Keystone should not be built as designed. Fallback question then becomes whether a narrower Verification-only tool, or a maintained graph after all, is the real product.

**Secondary UNKNOWN (decide during connector build, cheaply):** whether traces + Terraform state + incidents are actually *joinable per-change* within this bank's access and data-retention limits. This is an engineering/access risk, not a thesis risk, and it surfaces the moment the first three Connectors are wired — so it is discovered for the price of the pilot's read integrations, well before any behavioral bet is placed.

---

## Appendix — HYPOTHESIS / UNKNOWN register

- **HYPOTHESIS** — Feeding agents sourced, confidence-scored context with explicit `UNKNOWN`s reduces their fabrication of org/runtime facts and yields smaller, better-scoped PRs. (The report shows GitHub recommends scoping + custom instructions + fresh indexes precisely because agents lack this; 401 repos already hand-encode it.) Testable once the MCP surface ships, against agent-authored PR size and reviewer-correction rate.
- **HYPOTHESIS** — Removing the *information/evidence-assembly* friction around approvals recovers a meaningful fraction of Problem-5 lead-time loss even with approval policy unchanged. Test: change-record-assembly time and approval-cycle time, before/after the Readiness Brief, on a matched change class.
- **HYPOTHESIS** — Reviewers will lean on an Impact/Verification Brief in proportion to its *shown, measured* accuracy, not its mere presence — i.e., the falsification dashboard is load-bearing for adoption, not decoration.
- **UNKNOWN** — The join-ability of traces × Terraform state × incidents per-change under this bank's retention/access limits (decided by building the first three Connectors; see §3 secondary).
- **UNKNOWN** — Whether a purely evidence-anchored changed-behavior summary is *rich enough* for reviewers, or whether the gap to true semantic behavior diff (undecidable in general) leaves a residual verification tax large enough to matter. Decide by measuring reviewer-reported "did the Verification Brief change what you checked?" on the pilot.
- **Stated ceiling (not unknown, decided)** — Semantic-duplication coupling with no static/runtime/infra edge is out of reach; it is reported as `undetected/unknown` in the Impact Brief rather than silently omitted.
