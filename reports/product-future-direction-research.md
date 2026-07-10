---
status: frozen
purpose: primary-source evidence audit — constrains fact strength, competitive boundaries, and demand unknowns; cited by PRODUCT-DESIGN.md's validation discipline
---

# Primary-source evidence for the future direction of CTX and Atlas

Date: 2026-07-10

Scope: decision evidence for two products, not a defense of `VISION.md`, Atlas product guidance, or the prior roadmap rounds.

## Executive decision

The evidence supports a durable problem: developers spend substantial effort understanding existing systems, finding information, and validating AI-assisted work. It does **not** validate "Developer Context Infrastructure" as a product category, a universal context graph, an information-centric portal, Review Brief as the flagship product, or any specific buyer.

The current evidence favors two narrower product hypotheses:

1. **CTX should remain local and become an agent execution context runtime, if the next experiment validates continuity value.** Its proven capability is deterministic command-output filtering with recoverable raw evidence. The next hypothesis is not a general code graph. It is whether exact local execution state, such as what ran, against which workspace state, with what result, can prevent agents from losing work, repeating commands, or acting on stale output. Command filtering remains the wedge, but filter-only differentiation is already weak.
2. **Atlas should be tested as a governed context federation and resolution layer, not assumed to be a portal product.** Its candidate differentiation is resolving conflicting, stale, differently scoped organizational facts with source, authority, freshness, and permission semantics, then serving the result into existing workflows. A portal can later provide administration, inspection, and correction. General catalog, search, AI chat, scorecards, and MCP access are already offered by established products.

These are hypotheses, not conclusions. The next work should be product discovery and concierge tests, followed by a small prospective experiment. Building CodeGraph, CodeWiki, a universal projection kernel, a new portal shell, or Review Brief first would again convert an unverified architecture into a product decision.

## 1. What the source report gets right, and where it overreaches

| Claim in `enterprise-dev.md` | Evidence verdict | Decision consequence |
|---|---|---|
| Developers spend about 58% of their time on program comprehension. | **Supported with a correction and limits.** The original field study observed **78**, not 79, developers, seven projects, two companies in China, and Java/C# work. It measured 3,148 hours and reported 57.62% comprehension time. The authors explicitly limit generalization beyond those companies and languages. [Original IEEE TSE manuscript](https://xin-xia.github.io/publication/TSE17.pdf) | Comprehension is a credible persistent problem. The number is not a universal enterprise baseline and does not identify a product or buyer. |
| Coding is only 16% of developer time; finding information is the largest time-waster. | **Supported as vendor-run survey evidence.** Atlassian says its 2025 survey covered 3,500 developers and managers in six countries, reports 16% coding time, 50% losing 10 or more hours weekly to organizational inefficiency, and ranks finding information, adapting to new technology, and tool switching highest. [Atlassian 2025 survey summary](https://www.atlassian.com/blog/developer/developer-experience-report-2025) | The outer loop is commercially interesting. This still does not show that respondents want a new context platform rather than better existing tools and process. |
| AI shifts work downstream and increases review and verification burden. | **Supported, but the report freezes one model's coefficients into a timeless claim.** DORA's Impact of Generative AI analysis associated a 25% AI adoption increase with 1.5% lower throughput and 7.2% lower stability, attributing part of this to larger batches. DORA's 2025 report instead found increased throughput alongside increased instability and described AI as an amplifier. A March 2026 DORA analysis says time saved in creation is frequently reallocated to auditing and verification. [DORA Impact of Generative AI](https://dora.dev/ai/gen-ai-report/report/), [DORA 2025](https://dora.dev/research/2025/dora-report/), [DORA 2026 analysis](https://dora.dev/insights/balancing-ai-tensions/) | Verification burden is durable enough to test. The exact throughput effect is time-bound and organization-dependent, so it should not select Review Brief or any other product by itself. |
| Enterprise users primarily need understanding, not generation. | **Supported in one enterprise deployment, not across the whole market.** IBM's mixed-method study surveyed 669 internal users and tested 15 users. Code explanation (71.9%) and programming Q&A (68.5%) exceeded code generation (55.6%). Only 2% to 4% commonly used generated artifacts without modification, and respondents explicitly described verification effort. The study had no behavioral telemetry and reports perceived rather than measured productivity. [IBM/CHI 2025 paper](https://arxiv.org/pdf/2412.06603) | Code and system understanding is a strong candidate workflow. It needs behavioral validation against current assistants and search products. |
| 401 repositories with rule files prove agents need pushed context. | **The observation is correct; the delivery inference is not.** The study analyzed a selected sample of 401 open-source repositories already containing Cursor rule files and classified their content into conventions, guidelines, project information, examples, and LLM directives. It did not test whether those files improve task outcomes, whether they are current, or whether automatic push beats pull or task-time retrieval. [Original study](https://arxiv.org/abs/2512.18925) | This supports configuration and context-management demand. It does not justify session-wide injection, a Brief, or any default delivery policy. |
| Portals and catalogs are static and therefore leave the live-context problem open. | **Too broad.** Backstage's basic catalog is based on source-controlled metadata and teams maintain it, while its plugin model can attach runtime systems. Commercial portals go further: OpsLevel says it discovers from Git, Kubernetes, CI/CD, and cloud; Port exposes a Context Lake, external connectors, governance controls, MCP, and actions; Cortex combines catalogs, ownership, scorecards, workflows, and MCP. [Backstage catalog](https://backstage.io/docs/features/software-catalog/), [OpsLevel docs](https://docs.opslevel.com/docs/introducing-opslevel), [Port AI interfaces](https://docs.port.io/ai-interfaces/overview/), [Cortex docs](https://docs.cortex.io/) | "Connected" or "live" information is not enough differentiation for Atlas. It must demonstrate superior resolution, authority, provenance, correction, or a specific task outcome. |
| Change impact analysis is incomplete in modern systems. | **Supported as a technical problem, not as a buyer-backed product.** A 2025 systematic review selected 29 studies from 1,669 papers and describes direct and indirect microservice ripple effects. A study of 18,400 open-source reviews found architectural impact discussed in only 31% of the 731 reviews with significant architectural changes. An ICSE 2025 industry evaluation shows that specialized static analysis can already narrow affected interfaces and tests in one setting. [Systematic review record](https://experts.arizona.edu/en/publications/change-impact-analysis-in-microservice-systems-a-systematic-liter/), [architecture review study](https://discovery.ucl.ac.uk/id/eprint/10085741/), [ICSE 2025 Microscope study](https://conf.researchr.org/details/icse-2025/icse-2025-research-track/87/Datalog-Based-Language-Agnostic-Change-Impact-Analysis-for-Microservices) | Change impact is a candidate workflow for Atlas plus local facts, not a validated horizontal product thesis. Any test needs a strong static/runtime baseline. |
| Platform or developer-productivity leaders are the buyer. | **Unresolved.** DORA reports that internal platforms are widespread and that developer independence and task feedback correlate with better experience. Vendor products explicitly target engineering leaders and platform teams. None of these sources establishes budget, willingness to replace an existing portal, or willingness to buy this proposed product. [DORA platform engineering](https://dora.dev/capabilities/platform-engineering/), [DORA 2024 platform findings](https://dora.dev/research/2024/dora-report/2024-dora-accelerate-state-of-devops-report.pdf) | Treat the buyer as a discovery hypothesis. Require observed budget ownership and a design-partner commitment before enterprise buildout. |

The report's five opportunity scores are editorial synthesis, not measured scores. The source evidence establishes recurring problems, but frequency, consequence, current workaround cost, data availability, and buyer pull were never measured together. The ranking therefore cannot select either product's roadmap.

## 2. The current alternative set changes the product boundary

### 2.1 Local command filtering is already a direct category

RTK is a direct functional competitor to CTX. Its official repository describes command-aware filtering, grouping, truncation, deduplication, raw fallback, automatic host rewrites, savings analytics, and support across Claude Code, Copilot, Codex, Cursor, Gemini, and other agents. It distributes through Homebrew, install script, Cargo, and binaries. On 2026-07-10 the GitHub API reported 69,899 stars and 4,346 forks. Stars indicate public interest, not active use, but this is enough to reject an assumption that command-output filtering is an open category. [RTK repository](https://github.com/rtk-ai/rtk), [GitHub repository API](https://api.github.com/repos/rtk-ai/rtk)

Host products are also absorbing the same job. GitHub Copilot CLI's built-in `task` agent runs tests, builds, and linters and returns a brief summary on success with full output on failure. GitHub also supports hooks, custom agents, skills, and MCP servers at user, repository, organization, and enterprise scopes. [Copilot CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [Copilot custom agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents)

**Inference:** A standalone filter can remain useful, but compression percentage is not a durable moat. The product is exposed to both a fast direct competitor and host-native summarization. CTX needs either demonstrably better correctness and recoverability, a distinct enterprise control surface, or adjacent continuity value that hosts do not provide.

### 2.2 Repository context and task retrieval are crowded too

Current agents already implement several context-management patterns:

- Claude Code automatically loads hierarchical project and user memory files. [Claude Code memory](https://docs.anthropic.com/zh-CN/docs/claude-code/memory)
- Cursor stores versioned, codebase-scoped rules and automatically retrieves codebase context, while supporting MCP for external systems. [Cursor rules](https://docs.cursor.com/context/rules-for-ai), [Cursor context guide](https://docs.cursor.com/en/guides/working-with-context)
- GitHub supports repository-wide and path-specific instructions, organization and enterprise custom agents, and MCP-backed code review. It exposes review-session logs showing which MCP tools were called. [Copilot code review](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review), [custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- MCP standardizes local and remote tools, resources, and prompts, but explicitly does not dictate how hosts select or manage context. [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture), [MCP resources](https://modelcontextprotocol.io/specification/2025-03-26/server/resources)
- Sourcegraph combines keyword search, code search, code graph, multi-repository context, scoped search contexts, and answers with a source trail. [Sourcegraph context](https://sourcegraph.com/docs/cody/core-concepts/context), [Sourcegraph Deep Search](https://sourcegraph.com/docs/deep-search)

**Inference:** "Select relevant context for a task" is a capability shared by many products, not yet a differentiated category. A local CodeGraph or generic projection layer must beat mature search, host-native retrieval, and MCP composition on a named workflow. Without that evidence, it is an expensive speculative expansion for CTX.

### 2.3 An information-centric developer portal is already a mature product category

Backstage provides catalog, ownership, documentation, search, and an extensible plugin shell. Compass, Cortex, OpsLevel, and Port add automated ingestion, scorecards, workflows, engineering intelligence, runtime integrations, AI interfaces, and MCP. Port now describes its own product as a unified engineering knowledge layer with organizational context, governance, IDE access, actions, and external MCP connectors. [Backstage catalog](https://backstage.io/docs/features/software-catalog/), [Backstage TechDocs](https://backstage.io/docs/features/techdocs/), [Compass](https://www.atlassian.com/software/compass), [Port](https://docs.port.io/ai-interfaces/overview/), [Cortex](https://docs.cortex.io/), [OpsLevel](https://docs.opslevel.com/docs/introducing-opslevel)

Backstage also documents an important limitation: its catalog graph should not become the ultimate source of truth for dynamic relations. That supports federation rather than mirroring, but it does not give Atlas a unique product. [Backstage catalog graph guidance](https://backstage.io/docs/features/software-catalog/creating-the-catalog-graph/)

**Inference:** Atlas should not enter on "one place for developer information," "live catalog," "AI portal," "context lake," or "MCP for organizational knowledge." Those positions are occupied. The unproven opening is typed conflict resolution across systems of record, with explicit authority, freshness, permissions, and correction, delivered inside one expensive decision workflow.

## 3. Current CTX evidence, separated from product claims

At repository commit `a042c36c28326a15adc6519297be97b915aa498e`, the shipping product is a local command proxy with command-specific handlers, raw-output recovery, install hooks/shims/instructions, savings history, diagnostics, static-context inspection, and deterministic context-file optimization. The CLI does not expose a project graph, CodeWiki, organization server, universal projector, or Review Brief. [README](../README.md), [CLI source](../src/cli.ts), [package metadata](../package.json)

A read-only aggregation of the local `token-killer` history on 2026-07-10 found:

| Local observation | Result |
|---|---:|
| Rows with numeric token accounting | 330 |
| Rows with positive measured reduction | 202 (61.2%) |
| Rows with zero reduction | 128 (38.8%) |
| Median tokens saved per accounted command | 124 |
| Aggregate tokens saved | 2,499,988 |
| Share of aggregate savings from the top 10 rows | 59.3% |

No raw command text was copied into this report. These data come from one maintainer, one local environment, and a short history. A few very large outputs dominate the aggregate. The record proves that deterministic filtering can mechanically reduce some outputs. It does not prove lower model cost, better task outcomes, organic adoption, external retention, willingness to pay, or that a context platform should be built.

The earlier A/B grids do not repair this gap. The usable CTX sample was too small, later protocol pilots were tiny and confounded, and tool-call count measured optional delivery behavior rather than user value. They should remain archived implementation evidence, not roadmap authority.

## 4. Direction hypotheses worth testing

### 4.1 CTX

| Direction | Evidence state | Decision now |
|---|---|---|
| Command filter only | Technical value exists; direct competition and host absorption are strong; external retention is unknown. | Maintain reliability and distribution, but do not make compression percentage the long-term product thesis. |
| Agent context-file inspector and optimizer | Fits the shipping product and the growing number of instruction scopes. No source proves that users experience enough configuration pain to adopt or pay. | Keep as an adjacent experiment. Measure accepted findings, false positives, reversions, and repeat use. |
| Local execution continuity and evidence | Structurally adjacent because CTX already observes commands, outputs, exit status, and host events. DORA and IBM support verification burden, but no evidence shows that stored command evidence changes agent outcomes. | This is the best next product hypothesis. Test it prospectively before building a graph or server. |
| Local universal CodeGraph, CodeWiki, memory, and task projection | Broadly overlaps Sourcegraph, agent-native retrieval, instruction systems, and MCP. No customer evidence selects it. | Do not build next. Reconsider only if the continuity experiment reveals a repeated missing local fact that current tools cannot supply. |

Proposed CTX job to test:

> When an agent starts, resumes, or prepares to act, give it the smallest exact and recoverable account of relevant local execution state so it does not repeat work or reason from stale output.

The product boundary should remain deterministic where possible. A result must be tied to command identity, workspace identity, time, exit status, and raw evidence. Summary quality and secret handling are hard guardrails. Token savings remain a cost metric, not the outcome.

### 4.2 Atlas

| Direction | Evidence state | Decision now |
|---|---|---|
| General developer portal or knowledge homepage | Clear market demand exists, but mature alternatives already cover this surface. | Reject as the product thesis. |
| Catalog, search, AI chat, scorecards, or MCP alone | Available in current Backstage, Port, Cortex, OpsLevel, Compass, and Sourcegraph offerings. | Treat as integration or parity capability only. |
| Governed context federation and fact resolution | Existing products ingest broad data, but the official product pages reviewed here do not establish typed authority and conflict resolution across sources as a solved workflow. Buyer value is still unknown. | Best Atlas hypothesis, provided one workflow demonstrates that conflicting or stale facts cause material errors. |
| Review Brief | One possible output for one task. The evidence does not show review is the highest-cost or highest-pull Atlas workflow. | Keep as a candidate, not the product definition. Compare it with incident diagnosis, change impact, migration, and onboarding. |

Proposed Atlas job to test:

> When an engineer or agent needs an organizational fact to make a consequential engineering decision, resolve the applicable fact from existing systems, show why it is authoritative and current for this scope, expose conflicts and gaps, and return it in the workflow already in use.

The portal, if needed, should initially serve connector setup, policy and authority configuration, provenance inspection, conflict correction, and audit. It should not be the required daily destination until user behavior proves that a destination is valuable.

### 4.3 Relationship between the products

**Fact:** CTX can create local facts that an organization server cannot safely or accurately infer, while Atlas can access organization and runtime systems unavailable to a local repo. MCP supports both local and remote servers but does not impose a product architecture. [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)

**Inference:** The products should be independently valuable and optionally composable:

- CTX owns local execution, workspace-specific state, compression, recovery, and user-controlled disclosure.
- Atlas owns organization-scoped connectors, authority and policy resolution, runtime and ownership facts, and governed delivery.
- A user or agent can request a task result that joins selected facts, but CTX must not require Atlas and Atlas must not require every developer to install CTX.
- Local facts should not egress by default. Any shared fact needs explicit classification and disclosure semantics.

This is a boundary hypothesis, not proof that both products need one brand, one store, or one projection kernel.

## 5. The next evidence round

This should replace further document debate and the old R1-style grids.

### Track A: CTX, two weeks, real users

1. Recruit at least 8 external developers who use a terminal-capable coding agent on real work. Capture the agent, repository type, billing model, and privacy constraints.
2. Run transparent command filtering for one week. Measure eligible command rate, output-size distribution, compression, raw reopen rate, fallback rate, correctness incidents, added latency, and day-7 continued use. Compare feature and correctness behavior directly with RTK on the same fixed corpus.
3. Silently record exact local execution identity for eligible checks, then randomize whether a compact prior-state digest is exposed on task resume or before an identical rerun. The intervention changes delivery, not capture.
4. Primary outcome: redundant exact reruns and active time to a correct task outcome. Guardrails: task success, critical evidence omission, stale binding, secret exposure, and user override rate.
5. Stop broad CTX expansion if users do not retain the filter, if RTK or host-native behavior is equivalent, or if the continuity digest does not change behavior. In that case, maintain or sunset the filter as a utility rather than turning it into infrastructure.

### Track B: Atlas, discovery before implementation

1. Observe 12 recent real decisions across at least three organizations or business units, sampling code understanding/onboarding, change impact or migration, and incident diagnosis. For each, capture the decision, systems opened, people asked, active time, wrong turns, stale or conflicting facts, consequence, and accountable owner.
2. Rank workflows using observed frequency, consequence, current workaround cost, accessible source coverage, and buyer pull. Do not use the five editorial opportunity scores from the prior report.
3. For the leading workflow, create 10 concierge outputs manually from existing systems. Every fact must show source, observed time, scope, authority class, and conflict or gap. Deliver through the user's current interface, not a new portal.
4. Compare time to a correct decision, missed critical facts, wrong claims, source openings, and user corrections against the existing workflow and its current portal or agent baseline.
5. Require two accountable platform, DevEx, SRE, architecture, or quality leaders to commit data access and a paid or contractually serious design-partner pilot. Interest interviews are not a buyer gate.

Only after one track passes should architecture work resume. The first implementation should reproduce the tested interaction and data boundary, not the full VISION or guideline.

## 6. Unresolved gaps that must remain explicit

- No external retention, active-use, or willingness-to-pay evidence exists for CTX.
- The local savings history is highly concentrated and cannot show downstream model or task benefit.
- No controlled evidence yet shows that execution continuity reduces repeated work or stale reasoning.
- No evidence selects one Atlas workflow, primary user, or economic buyer.
- No evidence shows Atlas can obtain the permissions and source coverage required to resolve facts better than Port, Cortex, OpsLevel, Backstage, Sourcegraph, or direct MCP connections.
- Authority, freshness, conflict-resolution, and permission semantics are candidate differentiation, not demonstrated user value.
- Privacy and egress requirements are architectural constraints only after real customer policies and data classes are observed.
- The two-product composition is plausible, but no evidence requires a shared brand, store, schema, or release plan.

## Bottom line

The prior discussion went backwards because it treated an architecture vocabulary as the answer and then searched for a flagship surface. The evidence permits a more disciplined move:

- Keep CTX local, treat filtering as a wedge under competitive pressure, and test exact execution continuity next.
- Do not build broad local context infrastructure yet.
- Do not define Atlas as another information portal, catalog, context lake, or AI chat product.
- Test Atlas as governed fact resolution inside the most costly observed workflow, with the portal demoted to an optional administration and inspection surface.
- Keep both products independently useful; test their join only after each side proves value.

This is enough to choose the next experiments. It is not yet enough to claim the final product direction.
