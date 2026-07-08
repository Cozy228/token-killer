# Memory Research — Decision-Anchored Go Prompt (subagent-driven)

> **Origin.** This prompt is the product of an adversarial review. A first draft framed the work as
> "derive a universal theory of excellent memory, then apply it to ctx." An independent review
> (Codex 5.5, high reasoning) and a self-critique **converged** on the same verdict: that framing is
> *wrong-framed* for this product — purpose must drive the theory, not the reverse; biology is a
> constraint-check, not a north star; the research must settle concrete decisions and ship a
> deterministic evaluation, or it produces a survey that changes nothing. This version is the
> reframe: **purpose-first, decision-anchored, evaluation-backed.**
>
> One graft kept from the first draft (Rule 9): *diverge before you converge on each decision* — so
> "don't be limited by the current implementation" survives, scoped to each decision's solution space.

## Role

You are a skeptical research team studying memory for `ctx`, a developer-local context engineering
tool. Your job is not to admire memory systems, not to copy reference projects, and not to produce a
general survey. Your job is to decide what `ctx` memory should and should not become.

Think from first principles, but keep the product purpose in view.

## Product Context

`ctx` is a zero-egress, deterministic, developer-local project context base. It serves both humans and
AI agents. It ingests and serves code structure, change history, decisions, requirements/stories,
domain/docs knowledge, and memory/experience.

Current memory is not a standalone chatbot memory system. It is one content type inside the broader
ctx store and graph.

Current memory shape:

- `remember(note, anchors?, supersedes?)` is the write path.
- A memory has a ≤240-char gist plus optional detail.
- Anchors resolve to entity ids and become claims/links.
- Superseded memory is kept, not deleted.
- Lifecycle status is explicit: `active`, `needs-review`, `superseded`, `retired`.
- Host memory import exists for Claude Code; Codex/Copilot are follow-on areas.
- Push digest injects a ≤1KB curated memory/header block into host instruction files.
- Hard invariants: no LLM, embeddings, or network at write/serve time; one local SQLite+FTS5 store per
  project; index-not-copy except memory/concepts; provenance per fact; conflicts surfaced, not averaged.

Do not treat the current implementation as sacred. Do treat these invariants and product purpose as
real constraints unless you explicitly argue that an invariant should be changed.

## Core Question

What memory design best serves ctx's actual purpose: giving humans and agents local, correct,
provenance-carrying project context without creating false, stale, duplicated, or attention-polluting
facts?

The answer must settle decisions, not merely describe the landscape.

## Decisions This Research Must Answer

Answer these directly.

1. **Memory's job**
   - What should count as "memory" in ctx, versus docs, decisions, history, requirements, or derived concepts?
   - Is memory a separable subsystem, or mostly a thin authoring/import layer over the shared entity/link/claim graph?

2. **Failure priority**
   - Rank the costliest memory failures for ctx: false memory, stale memory, missing memory, duplicate
     memory, irrelevant push memory, unanchored memory, unreviewed imported memory, host echo loops,
     privacy/egress breach, unbounded growth.
   - Explain which failures should dominate design tradeoffs.

3. **Write policy**
   - Should ctx stay manual-first (`remember()` + imports), or add any automatic memory creation later?
   - If automatic creation is considered, define the minimum evidence and review gates. Respect
     deterministic/no-LLM/no-egress constraints.

4. **Lifecycle and retention**
   - What should `active`, `needs-review`, `superseded`, and `retired` mean operationally?
   - When should memory be hidden, down-ranked, reviewed, superseded, or kept forever?
   - Define "forgetting" for ctx without destructive loss of provenance.

5. **Anchoring and freshness**
   - How should memory anchored to code/docs respond when targets change, disappear, or become ambiguous?
   - Should anchor freshness affect ranking, lifecycle status, push eligibility, or conflict surfacing?

6. **Retrieval and ranking**
   - How should memory compete with code, docs, decisions, and history in `context()`?
   - What deterministic ranking signals are justified: lexical relevance, anchor proximity, authority,
     status, recency, served count, freshness, explicit pin/veto?
   - Which signals are dangerous because they make stale or popular-but-wrong facts too visible?

7. **Push digest**
   - What belongs in the ≤1KB pushed host digest?
   - Should push optimize for gotchas, active project conventions, recent notes, confirmed notes, or
     unresolved review items?
   - Define exclusion rules: retired, superseded, unresolved, stale-anchor, host-import unconfirmed, echo-risk.

8. **Host composition**
   - What should ctx import from Claude Code, Codex, Copilot, etc.?
   - What should it never import?
   - How should ctx avoid ctx → host → ctx echo loops, including paraphrased echoes that exact sentinel
     stripping misses?
   - Should host-imported memory default to `needs-review` instead of `active`?

9. **Human vs agent consumers**
   - What does an agent need from memory that a human does not?
   - What does a human need in `ctx guide` that an agent does not?
   - Are review queues and evidence drawers more important than richer automatic recall?

10. **Evaluation**
    - Define a small benchmark suite for ctx memory quality.
    - Include tasks for recall precision, stale-anchor detection, supersede behavior, duplicate import
      detection, push digest usefulness, echo prevention, and provenance auditability.
    - Specify pass/fail criteria that can be implemented without network, LLMs, or embeddings.

## Evidence Sources

Use the cloned reference material under `.research/memory` as evidence, not as targets.

Required evidence classes:

- Current Contexa docs and code:
  - `CONTEXA-DESIGN.md`
  - `CONTEXA-IMPL.md`
  - `packages/core/src/memory/*.ts`
  - relevant store/select/push files if needed
- Tool practice (`.research/memory/` + `.research/memory/_hostdocs/`):
  - Claude Code, Codex, Cursor, Amp, Windsurf, Copilot, Zed, Aider, Continue, Gemini CLI, opencode,
    roo-code, goose where available
  - mem0, Letta, Zep/Graphiti, cognee where available
- Research papers (`.research/memory/_papers/`):
  - MemGPT
  - Generative Agents
  - Zep/Graphiti
  - mem0
  - A-MEM
  - memory surveys/evaluation papers
- Biology/cognitive science:
  - Use only where it resolves a ctx decision.
  - Useful topics may include forgetting vs interference, cue-dependent recall, reconsolidation risks,
    and salience.
  - Do not treat human memory as the objective function.

## Research Rules

1. Purpose first. Start from ctx's job and costliest failures.
2. Do not derive a universal theory of memory before discussing ctx.
3. Do not copy a reference project's feature unless it survives ctx's invariants and failure priorities.
4. Do not let current Contexa implementation censor the research. It is evidence, not law.
5. Do not recommend LLM/embedding/network-at-serve-time designs unless labeling them as consciously
   declined or future-out-of-scope.
6. Prefer faithful, provenance-carrying, reviewable facts over adaptive-but-lossy memory.
7. Treat forgetting as attention management and lifecycle visibility, not deletion, unless you make a
   strong explicit case.
8. Every recommendation must include the decision it answers, the evidence behind it, and the
   implementation consequence.
9. **Diverge before converging, per decision.** For each of the ten decisions, enumerate the plausible
   solution space widely (draw on biology, papers, and tool practice as divergent evidence) *before*
   selecting a recommendation. The current Contexa implementation must not narrow the option set — only the
   invariants and the failure priorities may. Record the options you considered and rejected.

## Subagent Plan

Run these workstreams in parallel.

### Workstream A — Current ctx Reality

Read current docs and implementation. Produce:

- What memory is today.
- What is design-intended but not implemented.
- What invariants are hard.
- What pending decisions are visible.
- Where memory is entangled with store, links, claims, selection, push, and guide.

Output with path:line citations.

### Workstream B — Reference Tool Mechanisms

For each relevant tool/repo, extract mechanisms only:

- Memory unit.
- Write trigger: manual, automatic, imported, inferred.
- Storage substrate.
- Scope: session, project, global, branch, user.
- Retrieval/ranking.
- Lifecycle: stale, conflict, supersede, delete, review.
- Provenance model.
- Human controls.
- Echo/duplication risks.
- What would be unsafe or irrelevant for ctx.

Do not say "ctx should copy X." Say "X demonstrates mechanism Y; ctx relevance is Z."

### Workstream C — Research and Papers

Extract decision-relevant ideas:

- Temporal validity and fact invalidation.
- Conflict and supersession.
- Reflection/consolidation and why ctx likely cannot use LLM-style versions at write/serve time.
- Memory streams and recency/importance/relevance scoring.
- Graph memory and bitemporal facts.
- Evaluation methods adaptable to ctx.

For each idea, label: adopt, translate, decline, or irrelevant.

### Workstream D — Biology as Constraint Check, Not North Star

Use biology only to test design intuitions:

- When forgetting improves retrieval quality.
- When forgetting harms factual systems.
- Cue/context-dependent recall as an analogy for anchors.
- Reconsolidation as a warning against rewriting facts.
- Interference as a warning against push/context pollution.

Output must be short. If a biological concept does not affect a ctx decision, omit it.

### Workstream E — Evaluation Design

Design a minimal deterministic benchmark:

- Fixture repo with code/docs/decisions/history/memory.
- Seeded stale anchors.
- Superseded and retired notes.
- Duplicate host memories.
- Managed sentinel echo and paraphrased echo cases.
- Agent task prompts and human guide review scenarios.
- Expected outputs and failure labels.

The benchmark must be implementable locally.

## Final Deliverables

Produce one final report with these sections.

### 1. Executive Verdict

State the recommended memory direction in 5-10 bullets.

Include:

- What ctx memory is for.
- What it is not for.
- The top 3 failure modes to optimize against.
- The top 3 design changes, if any.

### 2. Decision Matrix

A table with rows for the ten required decisions above.

Columns:

- Decision
- Recommendation
- Evidence
- Adopt / Translate / Decline
- Implementation impact
- Confidence
- What would change this recommendation

### 3. Current ctx Assessment

Compare intended design and current code.

Separate:

- Already right
- Implemented but risky
- Missing but important
- Missing and not worth doing now
- Overbuilt or misleading

### 4. Recommended Memory Model for ctx

Define the model in ctx terms, not universal terms.

Cover:

- Memory unit
- Authority
- Provenance
- Anchors
- Lifecycle
- Freshness
- Ranking
- Push eligibility
- Host imports
- Human review
- Agent retrieval

### 5. Scope Cut

Be explicit.

- Must do now
- Should do after measurement
- Do not do
- Open questions that genuinely need maintainer judgment

### 6. Evaluation Plan

Provide the deterministic benchmark design and pass/fail criteria.

### 7. Evidence Appendix

Cite sources with path:line where local, paper/tool references where external.

Mark every major claim as one of:

- from-code
- from-doc
- from-reference
- inferred

## Acceptance Criteria

The research passes only if:

- It answers the ten decisions directly.
- It defines memory quality for ctx specifically.
- It distinguishes human and agent consumers.
- It treats memory as part of ctx's broader context graph, not an isolated feature.
- It includes a deterministic evaluation plan.
- It rejects or defers attractive ideas that violate ctx's invariants.
- It uses biology only where it changes a decision.
- It produces implementation consequences, not just concepts.
- Every recommendation traces to evidence and a named failure mode.
- For each decision, the considered-and-rejected options are recorded (Rule 9).

## Expected Bias

Bias toward small, auditable, deterministic mechanisms.

A good outcome is not "ctx has a sophisticated memory system." A good outcome is: ctx preserves the
right project facts, exposes uncertainty, avoids stale/false/echoed memory, keeps push output useful,
and gives both humans and agents enough provenance to trust or reject what they see.
