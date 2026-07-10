---
status: superseded
superseded_by: ../PRODUCT-DESIGN.md
note: superseded as product authority by maintainer ruling 2026-07-10; experiment protocols and gates absorbed into PRODUCT-DESIGN.md §8. Kept as a frozen record.
---

# Product Future Direction: CTX and Atlas

Date: 2026-07-10

Status: superseded — see `PRODUCT-DESIGN.md` (was: direction selected; product validation pending)

Inputs: [enterprise research](./enterprise-dev.md), [primary-source audit](./product-future-direction-research.md), current shipping repositories, and local usage evidence

## Decision

Do not run another roadmap debate round.

The prior discussion is not an implementation plan. It is useful only as a record of
rejected assumptions, evidence gaps, and boundary questions. `VISION.md`, Atlas product
guidance, accepted ADRs, open issues, and implemented branches are inputs. None of them
is demand evidence or has authority over the product decision.

The two products will be tested independently:

1. **CTX: Agent Execution Continuity.** Help a coding agent know exactly what already
   ran, whether that evidence still applies to the current workspace, and where the
   original result can be recovered. Output filtering remains the entry wedge and a
   supporting capability; token savings is not the product outcome.
2. **Atlas: Governed Engineering Fact Resolution.** Resolve the organization facts
   needed for a specific engineering decision, with explicit source, scope, authority,
   freshness, permissions, conflicts, and gaps. Portal, REST, Markdown, and MCP are
   delivery surfaces, not separate product theses.

These are the two best current hypotheses, not claims of product-market fit. Each has a
prospective field test, a pass gate, and a stop condition. Broad construction resumes
only after a hypothesis changes real user behavior.

## Why this is the evidence-based cut

### What is established

- Developers spend meaningful time understanding existing systems and finding
  information. The original program-comprehension field study reported 57.62% across
  78 observed developers, with important company and language limits. Atlassian's 2025
  survey also reports information finding and tool switching as major sources of lost
  time. [Field study](https://xin-xia.github.io/publication/TSE17.pdf),
  [Atlassian survey](https://www.atlassian.com/blog/developer/developer-experience-report-2025)
- AI does not remove the downstream verification burden. IBM's enterprise study found
  explanation and programming Q&A more common than code generation and documented
  verification effort. DORA describes AI as an amplifier whose effects depend on the
  surrounding delivery system. [IBM CHI 2025](https://arxiv.org/pdf/2412.06603),
  [DORA 2025](https://dora.dev/research/2025/dora-report/)
- The report identifies credible problem areas. It does not validate a product
  category, a flagship UI, a buyer, a shared architecture, or a one-to-one assignment
  of all five problems to these repositories.

### What the current products establish

- The shipping CTX package is `contexa@0.3.2`, described as a token-saving command
  proxy. Its real surface is command-aware filtering, recovery, installation,
  diagnostics, inspection, deterministic optimization, and savings reporting.
  [Package metadata](../package.json), [shipping README](../README.md)
- The local savings ledger proves that filtering can reduce some command outputs. It
  comes from one maintainer environment, is concentrated in a small number of very
  large outputs, and cannot establish task success, retention, external demand, or
  willingness to pay.
- The unshipped CTX Core branch contains substantial code, history, docs, memory, graph,
  search, and projection machinery. It does not establish that users need that product.
  It also remains a separate private package and CLI, so branch completeness is not
  delivered value.
- Atlas 0.2 has a working technical foundation for live source resolution, citations,
  warnings, honest gaps, and common projections across Portal and agent surfaces. Its
  tests establish implementation reliability, not adoption or decision improvement.
- Neither repository currently provides external retention, active-use, buyer, or
  payment evidence. Public GitHub metrics are also incomplete evidence because both
  products may be distributed internally.

### What the alternative set rules out

- Command filtering is a real category, not an empty opening. RTK publicly offers
  command-aware filtering, deduplication, recovery, host integration, and analytics,
  while hosts are adding their own successful-command summarization. Compression ratio
  cannot be CTX's durable product thesis. [RTK](https://github.com/rtk-ai/rtk),
  [Copilot CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- Generic task-context retrieval is already addressed by agent-native rules, memory,
  search, MCP, and products such as Sourcegraph. A local universal CodeGraph or CodeWiki
  needs a named workflow advantage before it deserves more investment.
  [Sourcegraph context](https://sourcegraph.com/docs/cody/core-concepts/context),
  [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- Generic developer portals, catalogs, context lakes, scorecards, AI interfaces, and
  MCP access are established categories. Atlas cannot differentiate by collecting the
  same features. [Backstage catalog](https://backstage.io/docs/features/software-catalog/),
  [Port AI interfaces](https://docs.port.io/ai-interfaces/overview/)

## Opportunity allocation

The report's five problems are not a requirement that both products cover one combined
lifecycle.

| Report problem | Decision now |
|---|---|
| Fragmented, untrusted context | CTX tests exact local execution context. Atlas tests scoped organization facts. Neither claims universal context. |
| Change impact and blast radius | Unassigned opportunity. Do not build until a workflow study shows it beats continuity and fact-resolution use cases. |
| Ownership and decision routing | An Atlas fact type only where an authoritative source and scope exist. Do not infer authority from repository history. |
| Verification burden | CTX's first workflow: make prior checks exact, recoverable, and invalidatable when the workspace changes. This supports verification; it does not produce a correctness verdict. |
| Delivery constraints | Atlas may resolve applicable requirements and destinations. External systems remain responsible for approval, provisioning, and execution. |

Change Brief, Review Brief, Change Evidence Packet, and a shared Developer Context
Infrastructure remain unassigned possibilities. They are not current product decisions.

---

## Product 1: CTX

### Position

> CTX gives a coding agent the smallest exact, recoverable account of relevant local
> execution state, so it does not repeat work or reason from stale evidence.

The initial user is a developer who uses a terminal-capable coding agent on a real
repository. A buyer and enterprise control plane are intentionally unresolved until
retention and outcome evidence exist.

`CTX` is the working product name for this validation cycle. `Token Killer` accurately
describes the current filtering capability, but it should not dictate the future
position. Do not spend on a rebrand until the continuity hypothesis passes.

### Why not generic local task context now

Local, source-backed task context is a credible competing hypothesis and matches the
report's strongest problem statement. It is not the first build because repository
search, code graphs, rules, memory, and task retrieval are already supplied by mature
agents and Sourcegraph, while CTX has no comparative user evidence. Execution
continuity is narrower, but CTX already occupies the observation point needed to make
it exact: the local command boundary. It can therefore be tested with less speculative
infrastructure and a clearer behavioral outcome. If the field record shows that missing
project facts, rather than lost execution state, dominate real tasks, task-context gets
one separate concierge test before any graph work resumes.

### Job to be done

When an agent starts, resumes, or is about to repeat a check, the developer needs it to
know:

1. what command or check ran;
2. which repository, working-tree state, configuration class, and time it ran against;
3. whether it passed, failed, or could not be interpreted;
4. whether later changes invalidate the result;
5. where the original evidence can be recovered; and
6. what still has not been observed.

The user outcome is fewer avoidable reruns and less time to a correct, verified next
action. Token reduction, tool-call count, graph size, and number of captured commands
are diagnostic metrics only.

### Core experience

```text
install once
    -> use the coding agent normally
    -> CTX observes eligible local checks at the tool boundary
    -> CTX binds each observation to exact workspace identity
    -> on resume or before a repeat, the agent receives a compact continuity card
    -> the agent reuses, reopens, or reruns with staleness made explicit
```

An illustrative continuity card:

```text
PRIOR CHECKS
  test:unit   passed  10:42  workspace 8f2c...  VALID
  lint        failed  10:45  workspace 8f2c...  STALE: 3 files changed
  build       not observed

Evidence is local. Open the recorded result or rerun the exact command.
```

This is not a generated verdict. `VALID` means only that the defined workspace binding
still matches. A passed test never becomes a claim that the change is correct.

### Product contract

The first version covers a narrow allowlist of test, build, lint, and type-check flows.
Each observation carries:

- command identity and normalized arguments;
- repository and working-tree fingerprint;
- start and completion time;
- exit status and structured result where available;
- output hash and a local recovery pointer where raw evidence was captured;
- explicit validity state: exact, stale, unavailable, restricted, or unknown.

Hard rules:

- preserve stdout, stderr, and exit semantics;
- never silently turn missing output into success;
- never reuse evidence after a binding becomes stale;
- remain local by default and collect only opt-in, privacy-safe aggregates;
- expose the original evidence and allow the user to rerun;
- prefer deterministic extraction over generated summaries.

### Role of the shipping features

- **Command filtering:** keep as the zero-work adoption wedge and evidence-delivery
  mechanism. Compete on correctness, recoverability, and integration, not headline
  compression percentage.
- **`gain`:** retain as a cost ledger. Do not present aggregate saved tokens as the
  product north star.
- **`inspect` and `optimize`:** maintain only findings with measured acceptance,
  low false-positive rates, and repeat use. Static advice is not a reason to expand the
  product.
- **CTX Core / codemap:** freeze broad expansion. Reuse a component only after the
  field test identifies a fact that host-native search and current tools cannot supply.

### Explicit non-goals for this cycle

- a universal local context graph;
- CodeWiki or a new human documentation surface;
- a generic task projector;
- Review Brief, change impact, or autonomous verification;
- organization context, policy, ownership, or Atlas dependency;
- a shared server, enterprise admin plane, or pricing model;
- more compression handlers without observed field demand.

### CTX 90-day plan

#### Days 1-14: restore the trust boundary and freeze expansion

1. Freeze the 1.0/codemap roadmap and treat that branch as a parts inventory.
2. Fix and regression-test GitHub issue #86: wrapped stderr must remain stderr.
3. Remove package/CLI version ambiguity and publish one supported-host matrix.
4. Define the exact workspace-binding and redaction contract for eligible checks.
5. Build a fixed comparison corpus against RTK and host-native behavior. The purpose is
   correctness and differentiation, not a vanity compression leaderboard.
6. Recruit at least eight developers other than the maintainer who use a
   terminal-capable coding agent on real work.

No CodeGraph, Brief, Atlas integration, or new portal work enters this phase.

#### Days 15-35: establish a prospective baseline

Run the current filter for two working weeks with opt-in local measurement. Record only
the minimum events needed to answer:

- which tool results are eligible and actually delivered through CTX;
- whether users keep CTX enabled;
- raw reopen, fallback, override, and correctness-incident rates;
- added latency;
- identical or semantically identical test/build/lint reruns;
- active time from session start or resume to a correct task outcome.

Tool-call count remains a delivery diagnostic. It is not a success metric.

#### Days 36-63: test continuity, not architecture

For one host only, passively bind eligible check results to workspace state. At eligible
resume or repeat moments, randomize whether the compact continuity card is exposed.
Capture remains the same in both arms; only delivery changes.

Primary outcome:

- avoidable exact reruns per eligible task.

Secondary outcome:

- active time to the correct verified next action.

Guardrails:

- task acceptance outcome;
- critical evidence omission;
- stale evidence shown as valid;
- stdout/stderr/exit-code fidelity;
- secret exposure;
- user override and raw-reopen rates.

This experiment does not use the old R1 result or its call rate as a gate.

#### Days 64-90: decide, then integrate only the winning path

Pre-register the following proposed continuation gate before exposing the intervention:

- at least 8 external-to-maintainer participants and 30 eligible continuity moments;
- zero high-severity evidence, stream-fidelity, or secret-handling incidents;
- no degradation in task acceptance outcome;
- at least 25% fewer avoidable exact reruns in the intervention condition;
- at least 5 of 8 participants choose to keep CTX enabled after the trial.

If the gate passes, unify only the package, install path, store identity, and host adapter
needed to ship the proven continuity loop. If filtering retains users but continuity has
no effect, keep CTX as a reliable utility and stop platform expansion. If neither is
retained, sunset or internalize it rather than using sunk code to justify 1.0. If the
observations instead reveal repeated missing project facts that current agents cannot
retrieve, design one separate concierge task-context test before reactivating any graph
work.

### CTX north star

The north star is **time from agent start or resume to a correct, evidence-backed next
action**. The first causal leading metric is **avoidable exact reruns per eligible
task**.

---

## Product 2: Atlas

### Position

> Atlas resolves the organization facts required for a consequential engineering
> decision and shows why each result is applicable, authoritative, current, and safe to
> disclose.

Atlas is not positioned as a generic developer portal, search product, context lake, AI
chatbot, or MCP server. Those can be surfaces or integrations. The product is the fact
resolution contract inside a concrete workflow.

### Job to be done

When an engineer or agent must make an organization-specific decision, it needs an
answer to questions such as:

- Is this service allowed and available for this application, region, and environment?
- Which policy or exception applies to this scope?
- Which approved module or action destination should be used?
- Who has which kind of responsibility or authority?
- Which sources disagree, are stale, are restricted, or are missing?

The first candidate workflow is **internal cloud-service adoption**, because Atlas 0.2
already resolves Confluence, Terraform, availability, guidance, citations, and gaps for
that journey. This is the lowest-cost wedge to test, not proof that the workflow has
user pull.

### Core experience

```text
decision question + scope
    -> read existing systems of record
    -> preserve each source claim and permission boundary
    -> apply explicit scope, authority, and freshness rules
    -> return resolved facts, conflicts, restrictions, and unknowns
    -> deliver into the user's current workflow
    -> send corrections to a visible steward queue
```

For service adoption, the output is a compact Decision Context:

1. question and applicable scope;
2. available options;
3. applicable constraints and policies;
4. approved module, workflow, or next destination;
5. owner, support, or approver claim with role and source;
6. citations and observed time;
7. conflicts, restricted facts, and honest gaps.

### Resolution contract

Each fact claim needs, at minimum:

- subject, predicate, and value or reference;
- application scope, environment, region, and time scope where applicable;
- system of record and source anchor;
- authority class and observed time;
- permission or disclosure class;
- one of: resolved, conflicting, stale, unavailable, restricted, or unknown.

The resolver never averages conflicts, converts absence into a negative fact, or treats
historical expertise as approval authority. An LLM may explain a resolved result, but it
does not decide source authority or invent a missing fact.

### Surfaces

- **Existing workflow delivery:** use Markdown, REST, or MCP according to where the
  observed user already works.
- **Portal:** initially for connector setup, authority-policy configuration, source and
  provenance inspection, conflict correction, access review, and audit. It is not a
  required daily destination.
- **Feedback:** close the current write-only gap with a steward queue, status, and
  correction outcome before adding more content surfaces.

### Explicit non-goals for this cycle

- a new information homepage or general search destination;
- generic AI chat, scorecards, dashboards, or software-catalog parity;
- provisioning, approval execution, or a workflow engine;
- Review Brief or a universal Change Evidence Packet;
- automatic owner inference without authoritative claims;
- wholesale merge of the Atlas 1.0 branch;
- mandatory CTX installation or shared storage.

### Atlas 90-day plan

#### Days 1-21: observe the candidate workflow

Study at least 12 recent, real cloud-service adoption decisions across at least three
teams. For each decision, record:

- the actual question and consequence;
- systems opened and people asked;
- active time and source hops;
- wrong turns, rework, and missing access;
- stale or conflicting facts;
- the person accountable for the decision and the system considered authoritative.

Map source coverage and permissions before changing the product. Existing tests and
screens do not substitute for these observations.

#### Days 22-42: concierge the resolution contract

Create at least 10 Decision Context outputs manually from the real sources. Every fact
must show source, observed time, scope, authority class, and conflict or gap. Deliver
them through the user's current channel rather than requiring a new portal habit.

Compare against the current workflow on:

- time to a correct decision;
- source openings and expert interruptions;
- missed critical facts and wrong claims;
- user corrections;
- whether the result changed or confirmed the next action.

Do not add a new resolver architecture during the concierge phase.

#### Days 43-90: ship one narrow resolver only if the gate passes

Proposed continuation gate:

- at least 8 of 12 observed decisions require facts from two or more sources or expose
  a material stale, scoped, restricted, or conflicting fact;
- at least 8 of 10 concierge outputs change or confirm the correct next action;
- median active time to a correct decision improves by at least 25%;
- zero critical wrong-fact or permission-disclosure incidents;
- at least 4 of 6 participating users choose to use it on the next comparable decision;
- at least two accountable platform or engineering leaders commit source access and a
  serious design-partner pilot.

If the gate passes, use the minimum proven parts of Atlas 0.2 to implement one
service-adoption input and one Decision Context projection. Deliver through the two
surfaces actually used in the study; do not build every surface. If the workflow fails
the gate, permit one evidence-selected alternative workflow test, then stop broad Atlas
expansion if fact resolution still does not change decisions.

### Atlas north star

The north star is **active time from an organization-specific question to the correct,
source-backed next action**. Source count, indexed entities, page views, MCP calls, and
model tokens are coverage or delivery diagnostics, not product outcomes.

---

## Relationship between CTX and Atlas

The products must work independently.

| CTX | Atlas |
|---|---|
| Local execution and workspace state | Organization and runtime systems |
| User-controlled, local by default | Governed source access and disclosure |
| Exact command/check evidence and recovery | Authority, scope, freshness, conflict, and policy resolution |
| No organization truth | No inference of exact local working-tree truth |

Only after both independent gates pass should one optional composition be tested: CTX
may request selected Atlas facts for the current task, subject to explicit disclosure
rules. That experiment does not require a shared database, shared graph, shared schema,
umbrella brand, coupled release plan, or mandatory installation.

## What is retained and discarded from the prior discussion

Retain:

- facts, inferences, hypotheses, and decisions must be visibly distinct;
- missing or stale evidence must remain visible;
- local and organization facts have different trust and disclosure boundaries;
- product metrics must measure task or decision outcomes.

Discard as roadmap authority:

- R1 call rate or any old grid result;
- engineering change as the universal unit of value;
- Review Brief or Change Evidence Packet as a flagship;
- Developer Context Infrastructure as an assumed category;
- current code, issue count, accepted ADRs, `VISION.md`, or guidelines as proof of demand;
- a requirement that the two products converge architecturally.

## Final convergence rule

This document closes the strategy debate. The next disagreement must be resolved by a
pre-registered field result, not another model round or another architecture document.
At day 90, each product receives a pass, narrow-pivot, utility-only, or stop decision.
No inconclusive result authorizes broad construction by default.
