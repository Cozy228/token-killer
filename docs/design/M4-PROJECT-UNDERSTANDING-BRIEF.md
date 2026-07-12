---
status: draft
review_after: 2026-08-01
date: 2026-07-12
branch: feat/1.0.0
baseline: f4c88b08
purpose: decision-complete design brief for M4 project understanding and Use-case Atlas
authority_note: >-
  Records maintainer-selected design decisions from the M4 grilling round. It does not yet
  amend FABLE-DECISION-LOG.md, CONTEXA-DESIGN.md, or CONTEXA-IMPL.md; those authority edits are
  the first implementation gate.
---

# M4 Project Understanding and Use-case Atlas

## 1. Intent

M4 extends the currently documented "org connectors" milestone into one complete project-
understanding milestone:

1. capture local repositories and explicitly selected GitHub/Jira/Confluence carriers;
2. compile a deterministic, evidence-backed implementation behavior graph;
3. use one user-selected Codex or Claude model to propose business domains and use-case flows;
4. review every material proposal item before writing project facts;
5. serve the resulting declared intent and observed implementation through a separate Use-case
   Atlas, the existing `context()` tool, and the existing Guide export path.

The primary user job is **use-case flow understanding**, not a generic promise to "understand the
business". A use case must expose its trigger, actors, material steps, business decisions, effects,
success/failure/cancel/retry/compensation branches, evidence, conflicts, and known gaps.

### 1.1 Completion bar

Factual reliability is the release gate. Comprehension and review cost are secondary measures.

- No material false reassurance: a wrong success path, hidden failure branch, invented effect, or
  unsupported rule fails the release.
- Every material step/edge/rule is cited, declared by the reviewer, or rendered as a Gap.
- Unknown, conflicting, stale, unavailable, partial, restricted, and capability-exceeded states are
  first-class output states.
- Internal dependency slices may land separately, but connectors, behavior compilation, generation,
  review, Use-case Atlas, `context()`, and export must all pass before the project calls M4 complete.

### 1.2 Audience

Engineers/maintainers and PM/domain owners are co-equal users. They consume the same facts and graph;
only the default expansion, terminology, and evidence density change.

## 2. Authority and prerequisite

This brief is subordinate to the current authority chain until explicitly ratified:

1. `PRODUCT-DESIGN.md` §3 and §11;
2. `FABLE-DECISION-LOG.md`;
3. `CONTEXA-DESIGN.md`;
4. `CONTEXA-IMPL.md`;
5. the binding M3 build prompt and rescope brief.

The current root authority describes M4 as receipted org connectors. Implementation must amend it,
not silently reinterpret it. The amendment must record:

- M4's complete integrated scope;
- business logic as a derived view, never an ingestible source;
- the explicit host-LLM egress exception;
- the proposal/review/Mainline lifecycle;
- independent corroboration and permission-intersection rules;
- the new entity, evidence, behavior, and projection contracts.

M4 also depends on the M3 Guide implementation being synchronized and landed on the authoritative
branch. The current M3 implementation must not be consumed from an untracked or behind worktree.

## 3. Locked product decisions

### 3.1 Fact semantics

The existing two-axis contract remains binding:

```text
derivation: OBSERVED | DECLARED | INFERRED
confidence: CONFIRMED | LIKELY | POSSIBLE
```

- `derivation` answers **how the fact arose**.
- `confidence` answers **how independently supported it is**.
- A model proposal is `INFERRED + POSSIBLE`.
- Human accept/edit creates a new `DECLARED + LIKELY` fact. It does not mutate or erase the original
  inferred proposal.
- A single project declaration remains `LIKELY`.
- Human acceptance is not a second item of evidence.
- Two model outputs are not independent corroboration.
- `CONFIRMED` requires at least two active supports with distinct `originRoot`, distinct
  `methodFamily`, and no copied/mirrored/derived lineage.
- Confidence is computed and reversible. Invalidating a support can move `CONFIRMED` back to
  `LIKELY`.

This distinction is why `DECLARED` and `CONFIRMED` are not synonyms. A person can authoritatively
declare the project's intended behavior without independently proving that the implementation or an
external source agrees.

### 3.2 Bounded inference

Inference may:

- name or group already proven anchors;
- propose one owning domain and multiple participating domains;
- connect proven anchors with a visibly inferred semantic bridge;
- write short explanations that cite existing claim handles.

Inference may not:

- reorder, delete, or invent deterministic execution edges;
- create a material non-code business step without a document, decision, requirement, or new human
  declaration;
- hide a partial closure, unsupported framework, conflict, or unknown state;
- introduce an uncited factual sentence.

### 3.3 Lifecycle and zones

- A generation run describes one evidence snapshot and lands as a human-reviewable Overlay proposal.
- A reviewer handles individual domains, use cases, steps, edges, rules, and anchors.
- The complete review is applied as one logical atomic Mainline write.
- Mainline facts are one YAML file per domain/use case and remain reviewable through Git/PR.
- Existing Mainline artifacts can later be edited or retired through the same review workflow.
- `dismiss` is personal Overlay state.
- `reject` is a project-level Mainline decision with a reason. It suppresses the same evidence
  fingerprint until cited evidence materially changes; changing only the model does not unblock it.

### 3.4 Surface and geometry

- Business understanding is a separate **Use-case Atlas**, not a Code Atlas lens or side rail.
- Its overview geometry is domain regions.
- Inferred domains may create visibly provisional, needs-review regions.
- Accepted domains become stable declared regions.
- Rejected or unmapped items remain in `Unclassified` rather than receiving a guessed home.
- Every use case has one `owningDomain` for stable placement and zero or more
  `participatingDomains`.
- The detail-page hero is an evidence-backed step graph, not a prose summary.
- First open shows the complete business skeleton. Technical calls can collapse; business branches,
  conflicts, and gaps cannot.

### 3.5 Dual-layer truth

Declared intent and observed implementation remain separate:

- Mainline use-case YAML is the declared-intent layer.
- Deterministic behavior extraction is the implementation layer.
- A mapping projection computes `match | missing | extra | conflict`.
- The user may view intent, implementation, or their overlay.
- Neither layer silently overwrites the other.

## 4. Deep module boundary

M4 exposes four explicit capabilities:

```ts
export interface CaptureCapability {
  capture(request: CaptureRequest): Promise<CaptureReport>;
}

export interface GenerationCapability {
  generate(request: GenerateRequest): Promise<ProposalSet>;
}

export interface ReviewCapability {
  applyReview(request: ApplyReviewRequest): Promise<ReviewResult>;
}

export interface ProjectionCapability {
  project(query: ProjectQuery): Promise<ProjectProjection>;
}

export type ProjectUnderstanding =
  & CaptureCapability
  & GenerationCapability
  & ReviewCapability
  & ProjectionCapability;
```

### 4.1 Capability rules

| Capability | Reads | Writes | Network | LLM |
|---|---|---|---|---|
| `capture` | project config, local repos, named connections | snapshots, receipts, store generation | named remote connectors only | never |
| `generate` | one published evidence generation | needs-review Overlay and run artifacts | selected host only | exactly one selected host/model |
| `applyReview` | complete review document and proposal/Mainline base | Overlay decisions or Mainline YAML + store generation | never | never |
| `project` | published store generation | nothing | never | never |

Guide, search, `context()`, and export receive only `ProjectionCapability`. Export is a delivery
adapter over `ProjectProjection`, not a fifth Core method.

### 4.2 Primary request contracts

`CaptureRequest` names local refresh and zero or more configured connection IDs. No-argument remote
capture is forbidden.

`GenerateRequest` includes:

- selected candidate IDs;
- host (`codex | claude`);
- non-empty model ID;
- accepted egress-manifest hash;
- optional unchanged run ID for resume.

`ApplyReviewRequest` includes the full review document, proposal/Mainline base hash, and expected
evidence generation. Stale-base review is rejected before any write.

`ProjectQuery` names projection kind, principal scope, mode, generation, selection, and budget. It
must not contain callable infrastructure dependencies.

## 5. Project and storage model

### 5.1 Committed project files

```text
.contexa/project.yaml
.contexa/domains/dom_<ulid>.yaml
.contexa/use-cases/uc_<ulid>.yaml
.contexa/rejections/<evidence-fingerprint>.yaml
```

`project.yaml` schema v1 contains:

- `projectId` and project `audience`;
- at most five repositories;
- stable `repoId`, canonical remote, and roles for each repository;
- role enum `control | application | service | library | docs | infrastructure`;
- GitHub/Jira/Confluence connection ID, edition/host, scope, disclosure, and permitted LLM hosts.

It never contains a local path or credential value.

### 5.2 Personal Overlay

```text
.contexa/project.local.yaml
.contexa/proposals.local/
.contexa/reviews.local/
```

The local project file maps `repoId` to local path, connector ID to credential reference, and stores
the first-use Guide mode preference. Credential references are limited to:

- `env:<NAME>`;
- `keychain:<service>/<account>`.

Plaintext secret values are rejected. Overlay paths are gitignored.

### 5.3 Local artifacts and database

Remote snapshots, generation fragments, manifests, and egress receipts live under:

```text
$CONTEXA_HOME/projects/<projectId>/understanding/
```

Directories use mode `0700`; files use `0600`. Snapshots and run fragments are immutable and
content-addressed.

Mainline YAML is the source of declared intent. SQLite is a rebuildable projection and adds three
normalized groups:

1. source instances, receipts, entity-source membership, tombstones, and claim supports;
2. runtime entrances, behavior nodes/edges, effects, and coverage/gap records;
3. domains, use cases, intent steps/edges, implementation mappings, proposals, and review
   generations.

Business graph state must not be hidden primarily inside entity `attrs` blobs.

### 5.4 Claim support and envelope repair

Each support records at least:

- canonical claim ID;
- stable evidence handle and revision/hash;
- `originRoot`;
- `methodFamily` and producer/version;
- lineage root;
- source receipt;
- observed time;
- disclosure and allowed audience;
- active/stale/unavailable state.

`claimEnvelopeFor()` must aggregate all supports. The current non-memory behavior of selecting the
first claim and hard-coding `local/content-hash` is not sufficient for M4.

An artifact inherits the strictest disclosure and the intersection of evidence audiences. If the
control repository's readers are not permitted to see all promoted evidence, Mainline promotion is
blocked. Unauthorized projections expose only non-leaking withheld metadata.

## 6. Capture and connector design

### 6.1 Supported editions

- GitHub.com and configurable GitHub Enterprise Server host.
- Jira Cloud.
- Confluence Cloud.

Data Center and export-only import are out of scope.

The first adapters capture accessible issue/PR/page bodies, comments, links, revision metadata, and
permission metadata. They do not mutate remote systems and do not ingest attachments or GitHub
Actions logs.

### 6.2 Connector boundary

Network access is separate from store ingestion:

```text
RemoteConnector.capture
  -> ReadOnlyHttpTransport
  -> immutable SnapshotRepository
  -> SnapshotReceipt
  -> SnapshotIngestAdapter
  -> RefreshEngine/store generation
```

`SourceKey`/connection ID distinguishes multiple repositories, Jira projects, or Confluence spaces;
the carrier enum alone is insufficient.

### 6.3 Freshness and failure

- GitHub TTL: 15 minutes.
- Jira/Confluence TTL: 1 hour.
- Guide and `project()` never refresh a source implicitly.
- A successful source publishes independently from other sources.
- An incomplete pagination run does not publish a new snapshot.
- A failed source retains its previous receipt but is marked unavailable/expired; it never renders
  as fresh.
- Remote-source failure permits a partial generation with named gaps.
- A missing declared repository blocks new joint generation. The last complete generation remains
  readable with `repo-unavailable`; M4 never auto-clones it.
- Tombstones are produced only by a successful complete snapshot, never by a failed or incomplete
  capture.

## 7. Deterministic behavior substrate

### 7.1 Supported languages and runtime families

Deep M4 behavior support is limited to TS/JS/TSX/JSX, Python, Java, and C#.

Runtime families:

- Web/API;
- CLI;
- event/message consumers;
- scheduled/background jobs.

Effect families:

- database;
- network;
- filesystem;
- message.

Go and Rust remain eligible for M3 code structure, but M4 must label their behavior coverage as
unsupported rather than sampling or guessing.

### 7.2 Initial closed recognizer catalog

- TS/JS: Express, Hono, NestJS, React Router/Remix/Next route handlers, Commander/Yargs, Lambda
  handlers, KafkaJS/EventEmitter, BullMQ/node-cron.
- Python: FastAPI/Flask, argparse/Click/Typer, Celery, APScheduler.
- Java: Spring MVC/WebFlux, Picocli, Spring Kafka/JMS, `@Scheduled`.
- C#: ASP.NET Core controllers/minimal APIs, System.CommandLine,
  BackgroundService/IHostedService, Hangfire.

Reflection, runtime-generated routes, unresolved DI, dynamic dispatch, and indirect effects become
explicit Gap records. The model is not allowed to repair those edges.

### 7.3 Behavior IR

The deterministic IR includes:

- `RuntimeEntrance`: repository, family, explicit runtime identity, declaration span, framework,
  coverage;
- `BehaviorNode`: operation/decision/effect/return/error with stable source span;
- `BehaviorEdge`: typed control/call/data transition, optional guard, and evidence;
- `Effect`: family, target when statically known, and failure behavior;
- `Coverage`: `complete | partial | unsupported | capability-exceeded`, with reason.

Branches, returns, throws, retries, catches, and known framework error paths come from parsers,
compiler indexes, SCIP, or explicit configuration, never from narrative generation.

### 7.4 Cross-repository edges

Observed cross-repository edges require an explicit shared contract key such as OpenAPI/AsyncAPI
operation ID, topic ID, canonical endpoint, or project manifest mapping. Without one, the generator
may propose a dashed inferred bridge between proven endpoints but cannot promote it to observed.

## 8. Candidate and generation workflow

### 8.1 Candidate inventory

Generation is not query-first. The wizard presents a flat, stable list of all business-use-case
candidates and the user selects candidates.

Candidates are not raw public symbols. They are deterministic runtime-entrance closures labeled by
explicit route, command, topic/consumer, job, or linked requirement identity. Multiple entrances
merge only when they share an explicit contract identity; directory locality or import-community
membership is not enough.

Unselected entrances remain visible in project coverage as unmodeled candidates.

### 8.2 Host boundary and egress

M4 supports explicit Codex and Claude host adapters. Each run uses exactly one user-selected host and
model. There is no automatic fallback, dual-model vote, or hidden default.

Before generation, the CLI displays an egress manifest containing:

- host/model and destination;
- carrier/source inventory;
- disclosure classes;
- included/excluded evidence counts;
- bytes and estimated tokens;
- prompt/schema versions.

Interactive use requires explicit confirmation. Automation requires
`--accept-egress <manifest-hash>`; a generic `-y` flag is insufficient. Only evidence allowed by
project policy for that host enters the typed slice. The local receipt stores hashes and metadata,
not another copy of restricted bodies.

Host processes run in isolated temporary roots, with no project working directory, user rules, MCP,
or tool access. The evidence slice is their only project input.

### 8.3 Bounded pipeline

```text
preflight
  -> capture/availability check
  -> behavior compile
  -> candidate inventory
  -> runtime-entrance closure shards
  -> egress preview/approval
  -> host generation
  -> deterministic merge
  -> schema/evidence/permission validation
  -> needs-review Overlay publish
```

Limits:

- project: 5 repositories, 200 use cases, 10,000 steps;
- input batch: at most 10 closures and about 32k estimated tokens;
- output part: at most 10 use cases, 60 steps, 120 edges;
- default host concurrency: 2; hard maximum: 5.

A closure exceeding the token limit is split deterministically at call boundaries. If it cannot be
split without hiding material structure, the run returns `CAPABILITY_EXCEEDED`. M4 never silently
samples or truncates and then claims completeness.

The cache key contains evidence hashes, shard map, host/model, schema version, prompt version, and
permission slice. Any relevant body change invalidates the key even if a function signature is
unchanged.

SIGINT stops new dispatch, asks the adapter to cancel in-flight work, and preserves already validated
fragments for an evidence-identical resume. A cancelled or partial run never replaces the active
proposal or last-known-good projection.

### 8.4 Allowed model output

The model may produce:

- proposed domain names and grouping;
- proposed use cases and intent labels;
- supported steps/rules that cite claim handles;
- bounded semantic bridges between proven anchors;
- short cited explanations.

It does not answer free-form project questions. Each material item must cite support handles, be a
new explicit human declaration during review, or remain a Gap. The validator rejects unsupported
sentences before publishing a proposal.

## 9. Mainline schemas

### 9.1 Domain

Each domain file contains:

- schema version and stable `dom_<ulid>` ID;
- name and description;
- lifecycle `active | retired`;
- evidence/declaration handles;
- proposal/revision provenance.

`provisional` is proposal state, not a Mainline lifecycle value.

### 9.2 Use case

Each use-case file contains:

- schema version and stable `uc_<ulid>` ID;
- title, goal, actors, triggers, preconditions;
- one owning domain and participating domains;
- ordered intent steps with stable local IDs;
- typed intent edges;
- success/failure/cancel outcomes;
- rules and evidence/declaration handles;
- mapping hints to implementation anchors;
- supersession/revision provenance;
- lifecycle `active | retired`.

Step kinds:

```text
trigger | action | decision | state-change | effect | manual | external | outcome | gap
```

Edge kinds:

```text
next | branch | parallel | join | retry | compensate | failure | cancel |
return | emit | await | external
```

Trust values are computed from provenance and support; authors do not manually type
`CONFIRMED` into YAML.

## 10. Review workflow

```text
ctx use-case review <proposal-set-id|domain-id|use-case-id>
```

The CLI:

1. writes a complete review document to the personal Overlay;
2. opens it in `$EDITOR`;
3. validates it after save;
4. displays the complete file and confidence/disclosure diff;
5. asks for confirmation;
6. applies the decision as one logical atomic write.

Proposal actions:

- `accept`: declare the proposed item;
- `edit`: declare the reviewed replacement while retaining original proposal provenance;
- `dismiss`: hide locally, with no project-level decision;
- `reject`: record a project-level negative decision and required reason.

Existing Mainline actions:

- `retain`;
- `edit`;
- `retire`.

All material items must be resolved. Explicitly retaining a Gap is a valid resolution. Unresolved
items, stale base hashes, missing support handles, invalid permissions, or broken graph references
block the entire apply.

File application uses a journal, temporary files, and atomic rename, followed by a single SQLite
generation transaction. Failure restores the old files and keeps the last published generation.
The CLI does not create a Git commit; the maintainer uses the normal Git/PR workflow.

## 11. CLI surface

```text
ctx project init
ctx project status
ctx sync
ctx import <connection-id>...
ctx use-case status
ctx use-case generate --host <codex|claude> --model <model-id>
ctx use-case generate --host ... --model ... --candidate <id>... \
  --accept-egress <manifest-hash>
ctx use-case generate --resume <run-id>
ctx use-case review <proposal-set-id|domain-id|use-case-id>
ctx guide
```

- `ctx sync` captures all locally mapped project repositories.
- `ctx import` captures only the listed remote connections.
- Interactive `generate` lists candidates, asks for selections, and previews egress.
- Non-interactive `generate` requires explicit candidate IDs and manifest hash.
- `status` exposes repository/source availability, coverage, last complete generation, proposals,
  and review backlog.

## 12. Use-case Atlas UX

### 12.1 Routes and shared shell

```text
#/use-cases
#/use-cases/<id>
```

The surface lives inside the M3 Guide shell but is independent from the Code Atlas. It keeps React
Flow + ELK, the Core-authoritative projection, M3 trust semantics, and the M3 visual token system.

### 12.2 Atlas overview

Desktop layout:

- top Repo HUD and mode switch;
- left flat use-case index and coverage filters;
- central domain-region Atlas;
- right claim/evidence inspector;
- compact trust/status legend.

The coverage header reports modeled/total entrances and counts for stale, unavailable, restricted,
conflicting, and gap states.

State grammar:

- stable declared regions: solid boundary;
- provisional inferred regions: dashed boundary + needs-review label;
- Gap: dedicated glyph/pattern + reason;
- conflict: visible fork, never a silently selected winner;
- stale/unavailable/restricted: text and glyph in addition to color;
- `Unclassified`: permanent honest region, not an error state.

Cross-domain use cases live in the owning region and expose links to participating regions.

### 12.3 Use-case detail

The hero is a complete left-to-right business skeleton on wide screens and a top-to-bottom flow on
narrow screens. It includes success, failure, cancel, retry, compensation, and parallel branches.

- Technical call chains collapse by default.
- Business decisions, outcomes, conflicts, and gaps never collapse out of the skeleton.
- `no-code-anchor` marks document-backed or manually declared business steps.
- Intent/Implementation overlay is the default; either layer can be viewed alone.
- Every step and edge drills into claim envelope, evidence, source revision, and code/doc anchor.
- Use-case Atlas and Code Atlas provide bidirectional navigation.

### 12.4 Business and Engineering modes

The first visit asks once for `Business` or `Engineering`; no role detection and no silent default.
The choice is stored in the personal Overlay, and a route query may override it.

- Business mode expands actors, goals, rules, and outcomes.
- Engineering mode expands runtime entrances, effects, anchors, and coverage.
- IDs, topology, claims, status, and evidence are identical in both modes.

### 12.5 Responsive and accessibility behavior

- `>= 1280px`: index, canvas, inspector three-pane layout.
- `768-1279px`: inspector becomes a drawer.
- `< 768px`: list-first navigation and vertical step flow; essential use does not require precise
  pan/zoom.
- The hierarchical navigator provides keyboard access; the UI does not put thousands of graph nodes
  into the tab order.
- Body text and controls meet WCAG AA contrast.
- Status is never color-only.
- Motion is limited to focus and hierarchy transitions and honors `prefers-reduced-motion`.

Guide review queues remain read-only and show exact copyable CLI commands.

## 13. Agent and export delivery

M4 does not add a new MCP flow tool. Existing `context()` gains a bounded structured flow section
when task/ref matching selects a use case:

- `lean`: at most 1 use case, 8 steps, 12 edges;
- `wide`: at most 3 use cases, 24 steps, 36 edges.

When the budget is tight, technical nodes collapse first. Failure branches, conflicts, and gaps must
remain, with handles for further drill-down.

Live Guide, snapshots, and exports consume the same projection and components. Portable exports
exclude restricted bodies and the personal Overlay. Archive exports contain Mainline facts,
permitted receipts, generation identity, coverage, omissions, and proof/performance manifests.

## 14. Understand Anything audit

Audit target: `.research/understand-anything`, version 2.9.2, commit
`783819de7514`.

### 14.1 Adopt

- deterministic inventory/import/parser preprocessing;
- bounded fragments and concurrency;
- neighbor context;
- immutable intermediate files;
- strict fragment naming and deterministic merge;
- missing-part/coverage warnings;
- phase and batch progress;
- independent domain/flow visualization;
- 60-node/120-edge output-part discipline.

### 14.2 Reject or replace

- import Louvain as a business-domain or shard boundary;
- standalone scan capped at 40 files × first 80 lines and 512 KB;
- model-authored `domain/flow/step/businessRules` without evidence/trust fields;
- fuzzy merge, synthetic default domains, dropped broken edges, or silent auto-repair;
- signature-only "cosmetic" invalidation;
- unconditional partial-result publication;
- a single overwritten `domain-graph.json` with no proposal/review/Mainline lifecycle;
- implicit host-default model dispatch with no provider, egress, budget, cancellation, or receipt
  contract.

M4 keeps the engineering skeleton but replaces its truth boundary.

## 15. Acceptance design

### 15.1 Real-repository corpus

The golden corpus is pinned to current repository revisions and must be materialized as checked-in
case manifests before implementation begins.

#### token-killer (`f4c88b08`)

1. **Development command compression and raw recovery**
   - entrance: `ctx git diff`, `ctx rg ...`, or shim equivalent;
   - anchors: `README.md:36-69`, `src/cli.ts:403-456`, `src/cli.ts:470-507`.
2. **Install delivery into an Agent Host**
   - entrance: `ctx install`;
   - anchors: `src/shim/init.ts:389-470`, `src/shim/init.ts:473-529`,
     `tests/unit/shim/detect.test.ts:76-90`.
3. **Host hook rewrite and governance**
   - entrance: `ctx hook copilot|claude` over stdin events;
   - anchors: `src/hook/copilot.ts:136-204`, `src/hook/copilot.ts:288-330`,
     `tests/integration/hook.test.ts:27-153`.
4. **Local AI-usage inspection and report**
   - entrance: `ctx inspect`;
   - anchors: `src/inspect/cli.ts:168-221`, `src/inspect/cli.ts:480-564`,
     `tests/integration/inspect.test.ts:93-140`.
5. **Safe optimization and restore**
   - entrance: `ctx optimize`;
   - anchors: `src/context/optimizeCli.ts:136-202`, `src/context/optimizeCli.ts:218-275`,
     `tests/unit/context/applySafe.test.ts:70-109`.
6. **Multi-source context sync and in-process catch-up**
   - entrance: `ctx sync`, plus MCP pre-serve refresh;
   - anchors: `packages/cli/src/cli.ts:70-90`, `packages/core/src/ingest/refresh.ts:88-171`,
     `packages/core/tests/unit/refresh.test.ts:95-171`.
7. **Agent MCP context/search/remember**
   - entrance: `ctx mcp` JSON-RPC;
   - anchors: `packages/cli/src/mcp.ts:41-99`, `packages/cli/src/mcp.ts:209-235`,
     `packages/cli/tests/mcp.test.ts:165-235`.
8. **Opt-in telemetry upload and private ingest API**
   - entrances: `ctx telemetry enable` and `POST /v1/telemetry`;
   - anchors: `src/telemetry/cli.ts:18-78`, `src/telemetry/dispatch.ts:32-89`,
     `server/app/src/index.ts:15-40`.

#### Atlas (`80cb6911`)

9. **Browse from catalog to a cited Textract service page**
   - entrance: `GET /catalog` then `GET /service/aws/textract`;
   - anchors: `docs/product/mvp-product-design.md:26-50`,
     `portal/src/routes/service.$provider.$id.tsx:80-128`,
     `portal/src/components/evidence/evidence-panel.tsx:27-112`.
10. **Agent searches a service and reads cited context**
    - entrance: MCP `tools/call`, `atlas_search_service` then
      `atlas_get_resource_context`;
    - anchors: `portal/src/api/server/mcp/handler.ts:57-128`,
      `portal/src/api/server/mcp/tools.ts:79-155`,
      `portal/src/api/server/mcp/mcp.test.ts:60-170`.
11. **Submit evidence feedback through API Gateway/Lambda**
    - entrance: API Gateway event to `POST /feedback`;
    - anchors: `context-layer/src/lambda/handler.ts:25-38`,
      `context-layer/src/api/feedbackRoute.ts:13-58`,
      `context-layer/src/repositories/dynamoFeedbackRepository.ts:33-94`.
12. **Validate onboarding Guidance through CLI/CI**
    - entrance: `pnpm validate:guidance` / CI;
    - anchors: `docs/product/guidance-authoring.md:134-141`,
      `context-layer/src/sourceContent/confluenceOnboardingProvider.ts:82-147`,
      `packages/atlas-schema/src/guidanceManifest.ts:25-118`.

The corpus explicitly records that neither repository currently has a real cron job, queue consumer,
or resident daemon. It must not invent one to improve category coverage. Synthetic fixtures cover
scheduled/background behavior, Python, Java, C#, and a two-repository contract flow.

### 15.2 Release gates

- At least 9 of 12 real cases reach 80% material step/edge source-backed coverage.
- All 12 cases contain zero material false reassurance.
- A disclosed Gap may pass; an unsupported confident assertion may not.
- Every material projected statement resolves to evidence or a review declaration.
- Max-scale warm p95: Atlas projection <=100 ms, detail/search <=150 ms, review validation <=250 ms.
- Generation emits phase progress within one second.
- Cancellation and failed generation leave the active projection unchanged.
- Verification order: unit/integration/acceptance tests, API, snapshot/export parity, then maintainer
  browser dogfood.

### 15.3 Required test families

- migrations, schema, rebuild, invalid YAML, revision, retirement, rejection fingerprints;
- corroboration independence and reversible confidence;
- disclosure propagation, audience gate, FTS/render/export leak prevention;
- connector pagination, TTL, rate limits, receipts, tombstones, GHES, and Cloud fixtures;
- language/framework entrance, branch, error, effect, and unsupported-dynamic golden fixtures;
- fake-host bad schema, fabricated support, permission violation, cache, cancel, and resume;
- review atomicity, rollback, stale base, and unresolved-item blocking;
- compile-time/runtime capability trap proving Guide cannot network, generate, or write;
- Business/Engineering fact equality, gaps/forks, keyboard, reduced motion, and responsive Playwright;
- live/snapshot/export projection equality.

## 16. Implementation sequence

### Gate 0: authority and M3

- land/synchronize the M3 Guide;
- amend the three root authority documents;
- replace any superseded M3 work-order language required for the new routes/projections;
- keep existing M3 tests, HTTP projections, and exports green.

### Slice 1: project/provenance substrate

- project and personal-local schema;
- multi-repo identity/path mapping;
- source instances, receipts, membership, tombstones, claim supports;
- aggregate claim envelope, disclosure, and audience enforcement;
- reversible-confidence acceptance tests.

### Slice 2: capture and behavior

- GitHub/Jira/Confluence adapters;
- behavior IR and the four-language recognizer catalog;
- entrance closures, cross-repo explicit contracts, coverage/gaps;
- connector and behavior fixture suites.

### Slice 3: generation and review

- isolated Codex/Claude adapters;
- egress manifest/receipt;
- deterministic shards, cache, progress, cancellation, resume, merge, validation;
- Overlay proposals, `$EDITOR` review, rejection and Mainline atomic apply.

### Slice 4: delivery

- Use-case Atlas and detail routes;
- Business/Engineering modes;
- intent/implementation diff;
- bounded `context()` flow section;
- live/snapshot/export parity.

### Slice 5: acceptance and release

- run the 12-case corpus and synthetic language/cross-repo fixtures;
- pass factual, security, performance, and cancellation gates;
- remove the experimental gate only when every M4 component is complete.

## 17. Explicit non-goals

- Go/Rust business behavior analysis;
- runtime agents, tracing, or replay ingestion;
- Jira/Confluence Data Center;
- export-only carrier import;
- remote write-back;
- automatic repository cloning;
- a new flow MCP tool;
- free-form project Q&A;
- automatic LLM fallback or model voting;
- Guide-side curation writes;
- replacing React Flow/ELK or reopening the M3 renderer decision;
- silent sampling, truncation, fuzzy truth merge, or partial active publication.

## 18. Remaining work is execution, not product choice

No high-impact product or interface decision is intentionally left to the implementer. Normal local
engineering choices such as helper names, SQL index names, parser internals, and component file
boundaries remain implementation details as long as they preserve this brief's contracts and gates.

## 19. Reconciliation amendments — 2026-07-12 (ratified; absorbed from M3-M4-RECONCILIATION-BRIEF)

Ratified by the maintainer 2026-07-12 after evidence probes (an 8-memory blinded anchoring test
against the real store: 5/5 proposals correct under full-context audit, 0 guesses, all 3
refusals caused by candidate retrieval, not isolation). On conflict with §1-§18, this section
wins. Gate 0 (§16) is unchanged.

### 19.1 New proposal kind: `anchor` (amends §8.4 and §9)

The generation pipeline gains a second proposal kind alongside domains/use-cases: proposals
that attach existing stock knowledge (memory, doc_section, concept, decision) to entities.
Rules:

- The model chooses ONLY from slice candidates or declares UNANCHORABLE; it never invents a
  target (the §3.2 boundary applies unchanged).
- A proposal is `INFERRED + POSSIBLE`; human accept creates the anchor as a `DECLARED` fact
  with full provenance (proposed-by host/model/run + confirmed-by + timestamps); one command
  reverts.
- `anchor_level` vocabulary: symbol | file | directory | doc_section | decision | commit —
  the target's kind/granularity, distinct from the deterministic ladder in the M3 brief's D8
  amendment.
- Accepted anchors write to the store anchors machinery (M3 brief D6/D20), NOT use-case YAML
  Mainline — disclosed: the anchor tracer exercises generate→review, not the 3b Mainline
  write path.

Slice-builder contract for anchor runs (from the probe's failure analysis):

- a deterministic cited-reference resolution pre-pass extracts explicit paths/symbols from
  the knowledge text and resolves them to exact AND relocated candidates, each marked
  `resolved | not-found` (raw FTS retrieval alone produced 3/8 false UNANCHORABLE);
- FTS candidates supplement, never replace, resolved citations;
- slice bodies are never truncated mid-evidence.

### 19.2 Slice 3 splits into 3a/3b (amends §16)

- **Slice 3a — anchor-proposal tracer.** Depends only on slice 1 substrate; may run parallel
  to slice 2. Drives generate→review→apply end-to-end on this repo's real unanchored stock
  (~4k: 2,963 doc_section + 977 concept + 104 memory) with the cheapest payload, and feeds
  the M3 knowledge layer real anchor density. Ships under a pre-registered lightweight gate:
  acceptance-rate floor, post-confirmation wrong-anchor cap, per-item review-time threshold —
  all breach ⇒ demote/stop; numeric values pre-registered when the 3a work order is drafted,
  seeded from the probe baseline; gate corpus spans ≥2 repos (token-killer + atlas). Running
  guards: published acceptance rate, full provenance chain, one-command revert. Named risk:
  automation bias — a rubber-stamped wrong anchor becomes DECLARED under the maintainer's
  signature.
- **Slice 3b — use-case generation.** As specified in §8; starts after 3a has exercised the
  review workflow. §15 release gates govern the milestone unchanged.
- Deferred (registered): a narrow in-session `propose_anchor` MCP verb; trigger = 3a shows
  batch proposals lose decision-moment context (low acceptance attributed to missing
  context).

### 19.3 Disclosure vs user-initiated egress (amends §8.2's slice policy)

Maintainer ruling (verbatim intent): it is the user's own model doing the generating and
sending; the tool has no business restricting that. `disclosure: local` therefore NEVER
blocks a user-initiated generate run — user-owned local content enters the egress manifest
freely, and the standard per-run manifest confirmation is the entire consent mechanism (no
reclassification prerequisite). Sole exception: org-sourced `restricted` content carrying
THIRD-PARTY permissions stays excluded — those permissions are not the user's to waive
(PRODUCT-DESIGN.md §4 "source permissions survive aggregation").

### 19.4 Document budget (maintainer directive, 2026-07-12)

M3 + M4 converge on AT MOST two design documents (this brief + the M3 UI layout brief) and
two implementation documents (one work order per milestone). Interim briefs are absorbed and
archived on ratification; new standalone design files require explicit maintainer consent.

## 20. Event/Route vocabulary absorption — 2026-07-12 (P44)

From the Event Projection + Evidence Navigation convergence (M3 brief D22–D25):

- **Event Compiler** (compile the moment — trigger, anchors, time — into a question) and
  **Route Planner** (ordered, prioritized, narrated traversal of the map) are M4-layer
  capabilities. M3 ships neither; its Evidence Rail uses mechanical traversal order only
  (M3 brief D23).
- The **concept route** ("how does order-cancellation work?" → entry → core mechanism →
  boundaries → failure handling → proving tests) is this milestone's primary use-case
  shape — explicitly **post-V0**: it inherits the same compiled-claim-trust bet AND
  requires concept→code links that are zero today (M3 brief U13).
- Narrative step ordering ("why each step matters") is LLM territory and belongs here,
  not in M3.
- Anchor-first boundary restated: hard-anchor search/projection is M3; anything requiring
  semantic translation of an open concept into code anchors is M4.

