---
status: frozen
purpose: zero-base derivation (v3 prompt) — model: GPT-5.6 sol ultra, sealed clean run, no repo context
---

# Change Case Compiler: a provenance-bearing decision contract for every engineering change — HYPOTHESIS

## Status vocabulary

- **EVIDENCE** means a statement is supported by the supplied enterprise report or enterprise/project background and links to the relevant section.
- **HYPOTHESIS** means a proposed product decision, mechanism, or expected effect that goes beyond the supplied evidence. Every section or table row labeled **HYPOTHESIS** is explicitly a hypothesis in full, not a reported finding.
- **UNKNOWN** means the design cannot responsibly choose from the supplied material; each unknown names the evidence that would decide it.

## Evidence-derived premise

**EVIDENCE.** Coding is not the dominant enterprise engineering cost: the report cites 16% of time spent coding, about 58% spent on program comprehension, and repeated switching among code, tickets, documents, dashboards, and people. AI makes generation cheaper while shifting work to review and verification; larger generated batches can reduce delivery throughput and stability. ([Research lens](./enterprise-dev.md#research-lens), [What daily work actually looks like](./enterprise-dev.md#what-daily-work-actually-looks-like), [How AI changes the workflow](./enterprise-dev.md#how-ai-changes-the-workflow))

**EVIDENCE.** The recurring unit of pain is a decision about a particular change: what is true now, what the change can affect, who has the relevant responsibility, what evidence would make it safe, and how it can traverse delivery controls. The report recommends task-scoped, freshness-aware support and warns against generic chat, static catalogs, documentation-only layers, and autonomous generation that treats verification as secondary. ([Priority ranking](./enterprise-dev.md#priority-ranking), [Why current tool categories still miss](./enterprise-dev.md#why-current-tool-categories-still-miss))

**HYPOTHESIS.** The product should therefore make one bounded engineering change—not a service, document, team, or chatbot conversation—its primary object. It should compile a continuously updated, inspectable **Change Case** from intent through post-deployment observation. The case is decision support, not a new source of truth and not an approval authority.

## Diverge before converging — HYPOTHESIS

### Shape A: Engineering Flight Recorder

**HYPOTHESIS.** Continuously capture repository, build, deploy, runtime, incident, ownership, and approval events into an append-only enterprise timeline. The primary object is an event; users replay the history of a component or incident to discover what changed and when. Its advantage is broad observation and strong retrospective reconstruction: one recording fabric could support incidents, audits, and later analysis without first knowing which future change will matter.

**HYPOTHESIS.** This shape loses. It requires broad event access, identity/entity reconciliation, long retention, and an enterprise-wide permission model before it can record enough history. More importantly, observation does not close the decision loop: a human must still decide which events imply impact, which kind of owner is needed, what proof is missing, and which delivery control comes next. It can reproduce the report's “many sources, manual reconstruction” problem with a better timeline, while creating a large security-review and data-volume surface. ([Why current tool categories still miss](./enterprise-dev.md#why-current-tool-categories-still-miss), [Change impact analysis is still mostly manual guesswork](./enterprise-dev.md#change-impact-analysis-is-still-mostly-manual-guesswork))

### Shape B: Change-bound evidence contract

**HYPOTHESIS.** Materialize a case only when a ticket, branch, proposed patch, pull request, production fix, or migration creates a decision. Fetch the evidence relevant to that scope from its current systems, preserve provenance and freshness, expose conflicts and blind spots, and carry the same case through review, approvals, delivery, and outcome observation. The primary object is a decision that must be justified; organization-wide relationships are cached only when they support a case and always retain source receipts.

**HYPOTHESIS.** Select Shape B. It can begin with one repository and one pipeline, creates value inside the existing pull-request workflow, limits data access to the requesting identity and change scope, and makes incomplete coverage visible. It deliberately trades universal browseability and proactive organization mapping for faster adoption, narrower permissions, and claim-level trust. If repeated cases later justify durable indexes, those indexes remain accelerators—not asserted truth.

## The selected design — HYPOTHESIS

### Product contract

**HYPOTHESIS.** The **Change Case Compiler** is a self-hosted internal service with GitHub pull-request checks, an internal HTTPS API for IDEs/CLIs/AI agents, and a platform control console. Given a change reference, it returns and maintains one versioned Change Case whose claims are traceable to internal evidence. Source code, diffs, artifacts, prompts, and derived content remain inside the enterprise boundary; the core path has no external model or SaaS dependency. This placement follows the hard data boundary in the supplied [enterprise background](./independent-derivation-prompt.md#enterprise-background).

**HYPOTHESIS.** Deterministic parsers and rules provide the minimum viable system. An internally hosted, security-approved model may later explain or rank evidence, but it may not create an untraceable fact, change a source receipt, grant approval, or turn an unknown into a fact.

### The Change Case object

**HYPOTHESIS.** One case is keyed by repository plus immutable commit range and optionally linked to a ticket/change record. It contains these concrete sections:

| Section | Stored object | What a user can decide from it |
|---|---|---|
| Scope | Intent, acceptance criteria, commit range, changed files/config/schema/IaC resources | Whether the proposed work and the actual diff still match |
| Claim ledger | Atomic claim, classification (`OBSERVED`, `DECLARED`, `INFERRED`, `CONFLICT`, `UNKNOWN`), source URI, source revision or artifact hash, observed time, freshness state, and access class | Why the system believes something and whether it is safe to rely on |
| Impact set | Candidate affected components, environments, data contracts, infrastructure resources, and consumers; path of evidence; confidence class | What requires inspection, testing, communication, or rollback planning |
| Responsibility vector | Separate candidates for code review, runtime response, policy approval, business decision, and current expertise, each with reason and source | Which kind of responsibility is needed and why this person/team is relevant |
| Verification contract | Acceptance criterion → risk/behavior claim → required check → produced artifact → result; uncovered rows remain explicit | What has been demonstrated, what has merely been asserted, and what is still untested |
| Delivery route | Required pipeline stages, environments, policy checks, evidence, approvals, change record, rollback/mitigation reference, and current blocker | What must happen after coding and which existing system owns the next action |
| Decision and outcome log | Human disputes, waivers, approvals from authoritative systems, deployment identity, post-deployment observations, and case versions | Who decided what, from which evidence, and what happened afterward |

**HYPOTHESIS.** A case never presents a single opaque “risk score.” It presents material claims, the evidence path behind each claim, source coverage, and unresolved uncertainty. A summary may rank items for attention, but the underlying ledger is always one click or one API field away.

**HYPOTHESIS.** The first pilot needs a provisional, claim-specific evidence map, subject to the **UNKNOWN** authoritative-source decision below. These are conditional examples, not preselected authorities: a GitHub commit SHA can support a code/diff observation; a confirmed Jira field can support recorded intent; a Confluence page can support declared rationale but not runtime reality; a Harness artifact can support that a particular check or deployment ran; a Terraform Enterprise plan can support intended infrastructure change but not current cloud state; a ServiceNow record can support only the approval requirements and completions recorded there; and an authorized AWS, Azure, or OCI control-plane query can support only the resource state it observed. Runtime dependencies and runtime responsibility remain **UNKNOWN** unless an approved telemetry or on-call source with adequate coverage is found.

### Major parts

1. **HYPOTHESIS — Case Gateway and role surfaces.** Receives an existing ticket, branch, commit range, pull request, or incident/change reference. It serves the GitHub Check, compact IDE/CLI responses, structured agent responses, and platform console from the same versioned case.
2. **HYPOTHESIS — Evidence adapters and ledger.** Read-only adapters query the enterprise's existing GitHub, Harness, Terraform Enterprise/cloud inventory, ticket/document, incident, and change-management systems. Each adapter emits typed claims and source receipts rather than copying a whole system into a new catalog. Connector failure becomes a visible coverage gap, never silent absence.
3. **HYPOTHESIS — Decision compiler.** Starting from changed code, configuration, schemas, and IaC, it follows declared dependency edges, observed runtime/deployment edges where available, and explicitly labeled historical correlations. Four modules produce the impact set, responsibility vector, verification contract, and delivery route. Inferences cannot satisfy a required control without human or source-system confirmation.
4. **HYPOTHESIS — Workflow broker.** Reads results from existing CI/CD and governance systems, attaches versioned, content-addressed artifact receipts, opens the already-approved workflow when authorized, and reflects its status. It does not become a parallel CI engine, ticket system, or approval database.
5. **HYPOTHESIS — Control and calibration plane.** Shows connector health, evidence age, permission failures, case coverage, human corrections, predicted-versus-observed impacts, and routing outcomes. Platform owners can disable a source or rule globally and reproduce the exact case version used for an audited decision.

### Data flow

**HYPOTHESIS.** The normal flow is:

1. **Trigger.** A developer or agent creates a case from a ticket/branch before editing, or the internal GitHub integration creates one from a pull request. The immutable commit range prevents a later diff from being evaluated against an earlier summary.
2. **Authorize.** The gateway evaluates the caller's enterprise identity at request time. Adapters use least-privilege service identities plus caller context. Unauthorized evidence is not summarized into a side channel; the case can state only that an authorized review is required if enterprise policy permits even that disclosure.
3. **Collect.** Adapters fetch only change-relevant records and stamp source revision, fetch time, and freshness policy. Raw code/diff analysis runs on internal workers. No call leaves approved enterprise networks.
4. **Compile.** Changed symbols, manifests, APIs, schemas, configurations, and IaC resources become roots. The compiler traverses evidence-backed edges, separates observed/declared facts from inferred correlations, detects conflicting sources, and emits explicit unknowns.
5. **Plan.** The impact set selects candidate reviewers and authorities by responsibility type. Acceptance criteria, affected contracts, policy rules, and known operational risks produce the verification contract and delivery route.
6. **Prove.** Existing Harness and related checks produce results. The broker binds artifact hashes and source runs to the relevant verification rows. Humans dispute claims, request missing evidence, or record a reasoned waiver through the authoritative workflow.
7. **Deliver and observe.** Existing systems execute approval, Terraform, cloud, and deployment actions. The case follows their state, records deployment identity and rollback reference, and compares predicted impacts with available post-deployment signals. Outcomes calibrate rules; they never silently rewrite historical case versions.

**UNKNOWN — emergency-change route.** The background does not define an expedited or break-glass process. A change-governance walkthrough of a real production fix decides the required evidence, authority, expiry, and retrospective review. Until then, the Compiler can mirror the approved route but cannot create or imply a bypass.

### What each role sees and touches

| Role | Entry point | First view | Actions | Deliberate boundary |
|---|---|---|---|---|
| **Developer** | “Prepare Change Case” from a ticket/branch, PR check, or thin IDE/CLI call | Missing acceptance criteria; trusted context; likely impact paths; required reviewers, checks, approvals, and delivery steps; stale/conflicting/unknown items | Narrow scope, link evidence, dispute an inference, ask a responsibility candidate, run an already-approved check/workflow, and attach results | Cannot self-approve or convert an inference into source fact |
| **Reviewer / tech lead** | Existing GitHub PR Check | Intent-versus-diff drift, material impact paths, changed contracts, acceptance-to-test coverage, evidence freshness, unresolved risks, and source-bound CI/change artifacts | Inspect source receipts, mark supported/disputed, request a specific missing proof, route an authority question, and record a decision in the existing review/change system | The product prioritizes review; it never declares the change “correct” |
| **AI coding agent** | Internal machine API using the invoking human/service identity | Bounded JSON containing allowed scope, source-backed context, local conventions if evidenced, impact candidates, constraints, required checks, and unknowns | Cite claim IDs in its plan, propose edits, request refreshed evidence, launch permitted tests, and return produced artifact IDs | Cannot see beyond its identity, hide conflicts, satisfy a control with generated prose, approve, or deploy |
| **Platform / SRE engineer** | Operational tab in a case and control console | Runtime/infrastructure impact, environments, policy route, rollback evidence, delivery blocker, connector coverage, stale rules, and calibration failures | Confirm/dispute an operational edge, fix an upstream source, maintain a policy adapter, suspend a bad rule, and execute an authorized existing workflow | The console is not a new CMDB or policy authority |

**HYPOTHESIS.** The machine API records agent identity and claim/artifact references when an integrated agent acts. It does not attempt probabilistic “AI-written code” detection: pasted or uninstrumented generation remains **UNKNOWN** unless signed invocation provenance is bound to the change. Without that deciding evidence, the product does not guess, and verification requirements follow change risk and evidence coverage rather than a claimed author type.

### Team day-one adoption under enterprise constraints

**EVIDENCE.** A regulated enterprise requires formal security review for new tooling; source/diff data cannot leave the company; and managed Windows endpoints carry EDR process-spawn cost, proxies, and restricted egress. ([Enterprise background](./independent-derivation-prompt.md#enterprise-background))

**HYPOTHESIS.** Those endpoint constraints make a per-repository resident daemon a poor default and favor server-side analysis with a thin HTTPS client.

**HYPOTHESIS.** Enterprise prerequisite: deploy one centrally operated internal service, publish its threat model/data-flow/SBOM and audit behavior, deny external egress at the network layer, use enterprise identity and secret storage, and pass the existing security/change process. The product does not claim that this prerequisite takes one day.

**HYPOTHESIS.** Once that service is approved, one team can start in a day without writing a catalog:

1. A repository administrator enables the internal GitHub Check in **read-only shadow mode** and binds one Harness pipeline. The platform team enables only already-approved, least-privilege adapters.
2. The first pull request automatically receives a non-blocking case built from GitHub plus available CI/ticket/change evidence. Missing runtime, owner, or policy sources appear as named blind spots rather than guessed answers.
3. The team chooses three recent non-trivial pull requests and compares case claims with what reviewers actually had to discover. Bad claims are disabled at the rule/source level before any gate is considered.
4. Developers may then use a signed thin extension or CLI that makes one proxied HTTPS request; adoption does not require a resident endpoint indexer or repeated local process spawning. AI agents use the same internal API.
5. Write actions and blocking checks remain off until the source-specific calibration and security owner approve them. A team can remove the Check without changing its repositories, pipelines, or delivery records.

**UNKNOWN — security approval duration and deployment substrate.** The background establishes the requirement but not the enterprise's approved runtime or review lead time. A security architecture review, threat model, data-classification decision, and internal platform inventory decide both.

### How it earns and keeps trust

1. **HYPOTHESIS — Claim-level receipts.** Every displayed fact links to source, revision/hash, observed time, adapter, and case version. No receipt means the item is labeled inference or unknown.
2. **HYPOTHESIS — Visible freshness and coverage.** Source-specific freshness budgets mark claims current, stale, unavailable, or conflicting. The case header lists sources queried, sources denied, and sources absent. Silence never means “no impact.”
3. **HYPOTHESIS — Authority by claim type.** The product does not invent one global truth order. Governance owners declare which source can prove test execution, runtime responsibility, policy approval, deployment, and other claim types. Conflicts remain visible until resolved in the authoritative system.
4. **HYPOTHESIS — Safe failure.** Connector errors, stale evidence, or low-confidence analysis reduce automation and raise an explicit review requirement. They never produce a green status by default.
5. **HYPOTHESIS — Permission preservation and audit.** Every read and workflow action is identity-scoped and logged. Restricted data is neither embedded in summaries nor exposed through relationship inference. Raw data stays internal, and historical decision records are append-only within the service and retained only under the approved records regime.
6. **HYPOTHESIS — Corrections repair sources.** A reviewer can dispute a claim immediately, but a durable correction must update or link to its owning source; local overrides expire. This avoids turning the Compiler into another stale catalog.
7. **HYPOTHESIS — Measured calibration.** The control plane reports, by rule/source, reviewer-confirmed false claims, material omissions found later, routing acceptance, stale-evidence use, and predicted-versus-observed impacts. The product earns enforcement only for a narrowly measured rule, never by aggregate marketing accuracy.
8. **HYPOTHESIS — Human accountability remains explicit.** AI explanations and rankings are assistance. Humans and existing systems retain review, approval, exception, deployment, and incident authority, consistent with the report's finding that AI output requires human oversight. ([Verification has become the hidden cost center](./enterprise-dev.md#verification-has-become-the-hidden-cost-center-of-ai-assisted-development))

**UNKNOWN — authoritative-source matrix.** The prompt names systems but not which one legally or operationally governs each claim type. The deciding evidence is a signed matrix from security, change governance, platform/SRE, and engineering owners, tested against a sample of cross-system conflicts.

**UNKNOWN — identity and entitlement propagation.** The design requires source permissions to survive aggregation, but the prompt does not establish compatible identities or record-level authorization APIs. A connector spike with allow/deny test identities and explicit cross-source leakage tests decides which sources may participate; a source that cannot preserve access boundaries is excluded.

**UNKNOWN — cross-system join keys and connector feasibility.** Repository, service, pipeline, workspace, cloud-resource, ticket, and change-record identifiers may not align, and tool versions or schemas are unspecified. A field-level API inventory plus the connector-only study below decides achievable join coverage and whether team-maintained mapping would create a new metadata tax.

**UNKNOWN — available runtime dependency evidence.** No telemetry/tracing system or retention window is specified. A connector inventory plus a time-bounded audit of observed edges against recent incidents decides whether runtime edges can be facts, weak inferences, or unavailable.

**UNKNOWN — permitted write actions.** Whether the Compiler may start a Harness run, create/update a change record, or only deep-link is a segregation-of-duties decision. API capability, security review, and control-owner approval decide it; the read-only case remains the fallback.

**UNKNOWN — audit retention and operating scale.** Neither the required evidence-retention regime nor actual case/event volume and source rate limits are supplied. Records-management and audit-control decisions determine retention and immutability requirements; measured webhook volume, connector fan-out, payload size, and a production-shaped load test determine whether the service can support several thousand engineers. No scale or audit-readiness claim precedes those results.

## The five questions, answered explicitly

### 1. What problem does this product solve?

**EVIDENCE.** It targets the repeated reconstruction, validation, and routing of context at the moment of an engineering decision: fragmented/untrusted context, uncertain blast radius, ambiguous responsibility, expensive verification, and post-coding delivery friction. These are daily, mutually reinforcing costs, and AI increases their load rather than removing human accountability. ([Trustworthy engineering context is fragmented and expires quickly](./enterprise-dev.md#trustworthy-engineering-context-is-fragmented-and-expires-quickly), [Priority ranking](./enterprise-dev.md#priority-ranking))

**HYPOTHESIS.** The Change Case Compiler turns that scattered work into one bounded, inspectable decision contract that travels with the change. Its goal is not “answer any engineering question”; it is “make the next consequential decision with traceable evidence and explicit uncertainty.”

### 2. How does it solve it—by what mechanisms?

**HYPOTHESIS.** It uses five mechanisms: on-demand evidence collection with claim-level provenance; evidence-backed impact traversal from the actual diff; multi-dimensional responsibility routing; acceptance/risk-to-evidence verification contracts; and a delivery route that binds existing checks, approvals, artifacts, and workflow state. Versioning, freshness, permissions, explicit unknowns, and post-deployment calibration make those mechanisms auditable rather than magical.

### 3. Which features solve which of the five problems?

| Report problem | Feature mapping and concrete output (**HYPOTHESIS**) | Honest ceiling (**HYPOTHESIS**) |
|---|---|---|
| 1. Fragmented, untrusted engineering context | Evidence adapters + claim ledger + source coverage panel compile a task-scoped context set; every item carries provenance, age, classification, and conflict state | Cannot recover tacit knowledge or make a stale/missing source true. It can expose and route the gap, not answer through it. |
| 2. Manual change impact and blast radius | Diff-rooted impact compiler follows declared, observed, and clearly labeled inferred edges; the impact set shows the evidence path and affected contracts/resources/consumers | Cannot guarantee all semantic duplication, dynamic behavior, external consumers, or uninstrumented runtime coupling. “No known impact” is never “no impact.” |
| 3. Ambiguous ownership and decision routing | Responsibility vector separates code review, runtime response, policy approval, business authority, and recent expertise; routing shows candidate, reason, freshness, and authoritative source | Cannot grant authority, settle disputed accountability, ensure availability, or infer an undocumented responsibility. The owning organization must decide. |
| 4. Hidden verification tax | Verification contract maps acceptance criteria and risk claims to required checks and content-addressed artifacts; the PR view highlights missing coverage and changed behavior before line-by-line review | Cannot prove general correctness, judge every test's quality, eliminate adversarial AI defects, or replace accountable human review. It reduces repeated evidence gathering. |
| 5. Non-code delivery constraints | Delivery route calculates required existing checks/approvals/environments/evidence, pre-assembles the evidence bundle, starts authorized workflows, and tracks the actual blocker through deploy/observation | Cannot remove legally mandated approvals, create scarce environments, repair organizational coupling, or bypass policy. Some wait remains real work. |

**HYPOTHESIS.** These feature choices are direct responses to the report's problem-specific evidence: [context](./enterprise-dev.md#trustworthy-engineering-context-is-fragmented-and-expires-quickly), [impact](./enterprise-dev.md#change-impact-analysis-is-still-mostly-manual-guesswork), [ownership](./enterprise-dev.md#ownership-and-decision-routing-remain-ambiguous-in-practice), [verification](./enterprise-dev.md#verification-has-become-the-hidden-cost-center-of-ai-assisted-development), and [delivery](./enterprise-dev.md#delivery-constraints-outside-the-editor-still-dominate-lead-time).

### 4. Are all five solved? Where honestly not?

**HYPOTHESIS.** All five are implemented as first-class workflows in one case; none is fully solved. The product can make available evidence easier to assemble, evaluate, route, and reuse. It cannot manufacture missing organizational knowledge, discover every hidden dependency, confer human authority, prove arbitrary software correct, or abolish regulated delivery controls. Its honest success condition is lower decision effort with no loss of safety—not omniscience or autonomy. The ceilings are stated problem by problem in the mapping above.

### 5. What happens to a team that does not have this product?

**EVIDENCE.** It keeps its existing GitHub, Harness, Terraform, cloud, ticket, documentation, incident, and change-management workflows, but continues to bridge them manually: search and context switching, grep/diagram/expert-based blast-radius work, tribal routing, line-by-line AI-output verification, evidence collection, and approval chasing. Those baseline behaviors are documented throughout [What daily work actually looks like](./enterprise-dev.md#what-daily-work-actually-looks-like) and the [five problem findings](./enterprise-dev.md#the-most-severe-unsolved-problems).

**HYPOTHESIS.** The team is not blocked or made non-compliant by opting out; the Change Case Compiler owns neither source records nor pipelines. It loses the compiled case and its reusable evidence trail, not its ability to deliver software. This reversibility is part of the adoption design.

## The single riskiest assumption and cheapest honest test — HYPOTHESIS

### Riskiest assumption

**HYPOTHESIS.** The design depends most on one assumption: **the enterprise's connector-readable systems contain enough timely, joinable evidence for a per-change case to answer most of the questions that block a safe decision, without false reassurance.** If the decisive knowledge exists only in people's heads, cannot be joined at change time, or is too stale, the chosen shape becomes a confident formatting layer and should not be built.

### Cheapest honest test

**HYPOTHESIS — Protocol.** Run a two-week enrollment for a read-only **Wizard-of-Oz shadow study** on 12 real, non-trivial pull requests across at least two teams, including shared-code/cross-repository, infrastructure, and regulated delivery work. At the first-review cutoff, a researcher manually operates thin read-only queries and templates that stand in for future adapters. The case may contain only fields mechanically readable from the proposed connectors at that cutoff; the researcher may not ask the author, use chat/tribal knowledge, repair a source, or add an unsupported answer. The case does not influence the live approval. After normal review, an independent truth panel uses the full review and delivery record plus structured interviews with the author, reviewer, and relevant runtime/change authority to establish the material context, impact, responsibility, verification, and delivery questions that were knowable or should have been raised at the cutoff. Each case remains under observation through deployment plus seven calendar days, or through closure if it is not deployed, so the panel can adjudicate later contradictions and material omissions. A case answer counts only when it was correct and source-backed at the cutoff; a correct `UNKNOWN` and next-step route is recorded as routing value but does not count as answer coverage.

**HYPOTHESIS — Primary endpoint.** **Source-backed answer coverage per pull request:** the percentage of the truth panel's material decision questions that the connector-only case answered correctly, with source support, at first-review time. Explicit unknowns do not enter the numerator.

**HYPOTHESIS — One guardrail.** **Zero observed material false reassurance during the adjudication window:** no case may present a materially wrong impact, responsibility, verification, or delivery claim as fact/safe/complete in a way that could justify omitting an affected component, reviewer/authority, check, or mandatory control.

**HYPOTHESIS — Kill criterion.** Kill the chosen product shape—not merely tune its UI—if fewer than 9 of 12 cases achieve at least 80% source-backed answer coverage, **or** if any case breaches the single false-reassurance guardrail. Passing would justify a live reviewer-time experiment, not a production-safety, time-saving, or ROI claim; the finite observation window cannot prove that no hidden omission exists.

**UNKNOWN — study sample availability and threshold value.** Twelve cases, 9-of-12, and 80% source-backed answer coverage are **HYPOTHESIS** falsification thresholds, not report-derived facts. Before running, recent eligible PR volume and an engineering leader's minimum useful coverage decide whether the study is feasible; changing a threshold after results are visible is not allowed.
