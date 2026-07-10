---
status: active
tier: LAW
purpose: final product design authority — one system, two evidence facets (ctx = local, Atlas = organization)
supersedes: reports/product-future-direction.md (as product authority; its experiment protocols are absorbed, not discarded)
death_condition: superseded by a successor design contract explicitly ratified by the maintainer
ratified: 2026-07-10 (maintainer instruction: "这一份将会成为最终权威")
---

# Product Design Contract

One system that compiles cited, freshness-stamped, permission-scoped evidence into the
moment an engineering decision is made — for the humans and AI coding agents making it.
`ctx` and `Atlas` are its two evidence facets, not two products.

This document is the final product design authority. On conflict it wins over all prior
direction, vision, and roadmap documents. It does not schedule construction; the
validation ladder in §8 gates what gets built when.

## 0. Evidence base

This contract synthesizes four rounds
(`reports/derivation-comparison-r1.md`): three sealed, zero-base, independent
derivations — Claude Fable 5 ("Cairn"), Claude Opus 4.8 max ("Keystone"), GPT-5.6
("Change Case Compiler") — plus one context-loaded direction audit
(`reports/product-future-direction.md`; NOT independent — it read the repo, current
products, and prior direction). Mechanisms that
all three sealed runs produced independently, across model families, are treated as
settled ("constitution", §2). Two-to-one verdicts are adopted with rationale (§6).
Genuinely unresolved items are either ruled here by design (§7) or registered as gated
empirical questions (§8). Field evidence from this repo (EDR spawn-tax measurements,
daemon rejection in 0.3.2, savings-ledger limits) calibrates the derivations to our real
distribution environment: other people's machines — Node floor, AV/EDR, PATH, cold
start — not the maintainer's box.

## 1. Thesis

The five enterprise problems (fragmented context, manual blast radius, ambiguous
ownership, verification tax, delivery constraints) are one failure observed at five
moments: **at the moment someone — or some agent — must decide, the environment cannot
produce a trustworthy, cited, current account of the relevant reality, so it gets
rebuilt by hand, or worse, guessed.** AI agents amplify both sides: they consume context
and now author a growing share of changes, so weak context compounds at generation
speed.

The system is therefore a **decision-moment evidence compiler**, not a store of truth,
not a destination, not a chatbot, and not an autonomy layer. It is authoritative only
about *what was observed, from where, at time T, at what confidence* — never about the
world itself.

## 2. Constitution — eight articles (settled; 3/3 sealed convergence)

1. **Compile at the decision moment; never build a destination.** Evidence is assembled
   when a decision trigger fires (agent resume, PR open, question asked, change filed)
   and delivered into the surface where the decision already happens (agent session,
   PR check, existing record). Central browsable stores lose to defaults and cannot
   prove per-claim freshness; any graph or index is an internal accelerator with a TTL,
   never asserted truth.
2. **Everything is a claim.** Every fact carries: source anchor (URI + revision/hash),
   observed time, derivation class (`OBSERVED` / `DECLARED` / `INFERRED`), status
   (`resolved` / `conflicting` / `stale` / `unavailable` / `restricted` / `unknown`),
   freshness state, and a disclosure/permission class propagated from its source.
3. **Citation or silence.** No uncited statement renders on any surface. An LLM may
   narrate, rank, and explain *over* cited claims; it may never introduce one, decide
   source authority, or convert an unknown into a fact.
4. **Unknowns, conflicts, and blind spots are first-class output.** Conflicting sources
   are shown side by side with timestamps, never averaged. Absence of evidence is
   reported as absence ("no known impact" ≠ "no impact"). Every impact answer names the
   dark zones it borders.
5. **Ownership is a capacity-scoped live query, never a stored field.** Answers are
   split by capacity (can-review / runs-it / can-approve / decided-it / knows-it-now),
   each with reason and freshness. A bare confident name is forbidden; see §7.1.
6. **Verification is a dischargeable ledger, never a verdict.** The system reconstructs
   facts (what ran, against what state, what changed, what is untested) so review
   becomes discharging enumerated items instead of line-reading. It never outputs "this
   change is correct"; judgment stays human. `VALID` means only "the recorded binding
   still matches".
7. **Delivery constraints get an evidence layer, not a bypass.** The system assembles
   control evidence into the existing change process; approval policy, authority, and
   execution remain with the systems and humans that own them.
8. **Trust is earned by falsifiable self-measurement.** Predictions are scored against
   outcomes; accuracy and correction latency are published; a derivation rule that
   produces confirmed-wrong claims is demoted. Entry is always read-only shadow mode,
   reversible, with pre-registered kill criteria.

## 3. The claim contract (unified schema)

```
claim {
  subject / predicate / object-or-value
  scope:        workspace | repo | app | env | region | org   (as applicable)
  evidence:     [source anchors: URI + revision/commit/artifact hash]
  observed_at:  timestamp        # bitemporal: as-of computation, recompute on demand
  derivation:   OBSERVED | DECLARED | INFERRED
  status:       resolved | conflicting | stale | unavailable | restricted | unknown
  confidence:   CONFIRMED | LIKELY | POSSIBLE      # tiered by corroboration, not vibes
  freshness:    per-source decay class + re-verification trigger
  disclosure:   permission class propagated from source; enforced at render AND at
                every machine interface
}
```

Rules that never bend:

- `CONFIRMED` requires independent corroboration; a single authoritative source yields
  `LIKELY`; heuristics (co-change, similarity) yield `POSSIBLE` and can never satisfy a
  control or an authority question.
- Corrections are claims (counter-claims win on precedence), but a durable correction
  must repair or link the owning source; local overrides expire. The compiler must not
  become another stale catalog.
- Cases/artifacts are keyed to immutable state (commit range, workspace fingerprint) so
  a later diff is never evaluated against an earlier summary.
- Restricted evidence is not summarized into a side channel; relationship inference
  must not leak what direct access would deny.
- No probabilistic AI-authorship guessing: agent provenance is recorded only when
  signed/instrumented; otherwise it is `unknown`, and verification demands follow risk
  and evidence coverage, not claimed author type.

## 4. Two evidence facets, one contract

| | **ctx — the local facet** | **Atlas — the organization facet** |
|---|---|---|
| Domain | Execution and workspace reality: what command/check ran, against which working tree, result, raw output, still valid? | Organization reality: policies, availability, approved modules, ownership/authority, runtime and delivery facts from systems of record |
| Observation point | The local command/tool boundary (hook, shim, MCP) — the one place execution truth is exact | Governed read-only connectors with least-privilege identities |
| Trust boundary | User-owned, local by default, **no egress by default**; disclosure is explicit and classified | Source permissions survive aggregation; caller identity scopes every answer |
| Primary consumers | The coding agent in-session; the developer at the terminal/IDE | Developers, reviewers, platform owners, and agents via the same claim interface |
| Today's assets | contexa 0.3.2 command filtering/recovery (the adoption wedge and evidence-delivery mechanism), savings ledger, inspect/optimize | Atlas 0.2 live resolution, citations, warnings, honest gaps, Portal-as-admin |

Both facets emit **the same claim schema** and feed **the same compiler semantics**.
Composition: a decision artifact may join both domains; local claims cross the boundary
only under explicit disclosure rules; organization claims enter a local session under
the caller's entitlements. Each facet must remain independently useful — neither
requires the other to deliver value — but they are two faces of one system, one
contract, one design authority (this document). Shared storage/branding/packaging are
implementation choices made per deployment, no longer forbidden and no longer required.

## 5. Decision artifacts — the five outputs and their honest ceilings

One artifact family per original problem. Names are working labels; surfaces adapt to
deployment scale (solo dev with an agent → hook/MCP injection; team/org → PR check +
existing records).

1. **Context Brief** (P1): task-scoped "what is true here now" — recent meaningful
   changes, applicable conventions/decisions with dates, in-flight overlap. *Ceiling:
   tacit knowledge never recorded anywhere; the system narrows it by making capture
   nearly free at decision moments (accepted corrections, waiver reasons become
   claims), but cannot manufacture it.*
2. **Impact Set / Blast Radius** (P2): from the actual diff, walk evidence-backed edges
   (static refs, deploy/runtime observations, IaC/infra bindings), tier every reached
   node, and always print the DARK line (what could not be seen and why). *Ceiling:
   semantic coupling with no static/runtime/infra edge is only heuristically reachable
   (`POSSIBLE`); the honest claim is "materially fewer surprises, with measured recall
   on realized breakages", never completeness. Whether real sources support this at all
   is the gated question in §8.1.*
3. **Routing Card** (P3): capacity-scoped candidates with reason, source, and
   freshness; abstain-with-escalation when no qualifying claim exists. Ruled in §7.1.
   *Ceiling: the tool cannot confer authority or settle disputed accountability;
   behavioral signals lag reorgs — the abstention rate is the visible residual.*
4. **Verification Ledger** (P4): behavior deltas mapped to diff regions, acceptance
   criteria → covering tests or `UNMET`, test-gap flags, risk-path cues, recorded check
   results bound to workspace state (the local facet's continuity card — what ran,
   passed/failed, `VALID`/`STALE` — is this artifact's exact-evidence core). *Ceiling:
   the mechanical half only; design judgment is irreducibly human and the system must
   never simulate it.*
5. **Delivery Route / Evidence Bundle** (P5): required checks/approvals/evidence for
   this change class, current status and blocker, pre-assembled bundle into the
   existing change record. *Ceiling: the lowest of the five — information cost only;
   policy and waiting owned by the organization. The "complete bundle ⇒ standard-change
   fast path" negotiation is an organizational outcome the tool can enable, not force.*

## 6. Architecture rulings (adopted with the arbitration record)

- **R1 — One system, one contract** (3:0 sealed). The prior two-product split was a
  resource-reality artifact, not a design conclusion. Retained from it: the two facets'
  different trust boundaries (§4) and independent usefulness.
- **R2 — On-demand compilation over an ingested substrate** (2:1). Compile from primary
  sources at trigger time, bitemporally ("answer as of 14:02, sources' own timestamps
  shown"). Durable indexes exist only as accelerators with TTLs and source receipts.
  Fable's decay-classed standing store survives *inside* this ruling as the accelerator
  design, not as the product's promise.
- **R3 — Trust-first accuracy posture** (2:1 + strictest form adopted). Absolute
  guardrail: **zero material false reassurance** — one materially wrong claim presented
  as confirmed/safe/complete is a kill-grade event, not a statistic. `CONFIRMED`
  precision is the leading metric; recall is measured, reported, and bounded by the
  DARK disclosure. Numeric bars are calibration outputs, not design inputs (§8.2).
- **R4 — Thin client, no resident daemon** (2:1, and matches this repo's own measured
  0.3.2 decision). Heavy work runs server-side (or in the host process for the local
  facet); the endpoint footprint is a thin client honoring the EDR/AV spawn tax,
  corporate proxies, and cold-start reality of managed machines. Distribution-first:
  every mechanism is evaluated for the install base, not the dev box.
- **R5 — Read-only by construction.** Write surfaces are enumerable and individually
  reviewable (its own check/comment, its own records, explicitly authorized workflow
  starts). Fail-open: an outage must never block delivery.
- **R6 — Agents are first-class consumers under the same rules.** Machine interface
  (MCP-class) serves the same claims under the caller's identity, same citations, same
  `UNKNOWN`s. An agent can neither obtain an uncited assertion nor satisfy a control
  with generated prose.

## 7. Ruled now (design-resolvable; no experiment owed)

### 7.1 P3 — ownership mechanism: layered authority via claim classification

The three sealed positions (authoritative-sources-only / behavioral-fusion-with-
abstention / behavioral-fusion-with-conflict-display) are reconciled by the derivation
taxonomy rather than chosen between:

- **Authority-class questions** (who can approve, who owns of record, what policy
  applies) may be answered only from `DECLARED`/`OBSERVED` claims in sources the
  governance owner has designated authoritative for that claim type
  (authority-by-claim-type matrix — a signed configuration, not an inference).
- **Suggestion-class questions** (who should review, who likely knows this) may use
  `INFERRED` behavioral evidence (recency-weighted authorship/review/fix history),
  always labeled with derivation, reason, and age — and can never be silently promoted
  into an authority answer.
- **No qualifying claim → abstain**, with an explicit escalation path. A confident
  wrong name is the fastest way to lose trust; abstention rate is a published metric,
  not a hidden failure.
- **Conflicts between layers are displayed**, never flattened ("CODEOWNERS says A;
  live on-call and last 6 months of fixes say B").

### 7.2 Accuracy thresholds — principle now, numbers by calibration

The guardrail (zero material false reassurance) and the posture (precision-first
`CONFIRMED`, recall reported with DARK bounds) are fixed by this contract. The numeric
bars from the derivations (Fable ≥90%/≥70% paired; Opus recall ≥0.80 @ precision ≥0.50)
disagree and are hereby treated as **hypothesis inputs to the first calibration run**,
not commitments. Protocol: pre-register thresholds before each validation stage (§8);
changing a threshold after results are visible is forbidden; the calibration question
is "at what measured accuracy do users keep reading after ten encounters" — answered by
observation, not asserted.

## 8. Gated empirical questions — the validation ladder

These are facts about the world; no document can decide them. Design above assumes they
hold; §9 pre-writes what happens if they don't.

### 8.1 P2 substrate viability (the system's make-or-break)

**Assumption under test:** mechanically compiled claims from real sources reach
precision/coverage high enough that engineers and agents keep trusting the artifacts.
All three sealed runs named this the riskiest assumption ("confidently wrong is not
recoverable" / "just a prettier catalog" / "a confident formatting layer and should not
be built").

**Escalation ladder (each stage cheap enough to lose; each gates the next):**

1. **Wizard-of-Oz shadow study** — zero code. ~12 real, non-trivial PRs; researcher
   hand-operates read-only source queries at first-review cutoff; independent truth
   panel adjudicates material questions post-hoc. Kill the compiled-artifact shape if
   <9/12 cases reach the pre-registered source-backed coverage bar, or on **any**
   material false reassurance.
2. **Retrospective backtest** — read-only connectors only. Regenerate impact/routing
   artifacts as-of PR-open for ~100–150 historical PRs; score against realized
   breakages and follow-up changes; audit a claim sample for truth-at-time. This run
   *produces* the calibrated thresholds of §7.2.
3. **Live shadow** — 4 weeks, non-blocking surfaces only; guardrails: no review-latency
   degradation, zero stream-fidelity/secret incidents, no stale-shown-as-valid.

The context-loaded doc's two field tests are absorbed into this ladder as the facet
pilots: the **ctx continuity experiment** (does the exact-execution continuity card
reduce avoidable reruns / stale reasoning?) validates the local facet of Artifact 4;
the **Atlas concierge test** (do resolved org facts change real decisions?) validates
the organization facet of Artifacts 1/3/5. Their pre-registered gates and guardrails
remain as written there; only their framing changes — they are now first landings of
one contract, not tests of two separate products.

### 8.2 Threshold calibration

Output of ladder stage 2 (see §7.2). Pre-registered per stage; hypothesis inputs from
the derivations; no post-hoc adjustment.

### 8.3 Source coverage per deployment

Which claim types are reachable (runtime edges, on-call, change records) is decided per
environment by a connector inventory, never assumed. Connector absence renders as a
named blind spot, not silence.

## 9. Fallback and void conditions (pre-written)

- **If ladder stage 1 fails** (coverage below the pre-registered bar, or any material
  false reassurance): the **whole compiled-artifact shape is dead** — the sources
  cannot answer material decision questions, and no artifact built on source-compiled
  claims (Artifacts 1/2/3/5 and the organization half of 4) may proceed to stage 2.
  Only the local continuity pilot survives on its own gate, because its evidence is
  `OBSERVED` at the command boundary, not compiled from organization sources. (Stage 1
  is the general coverage test from the Codex derivation; stage 2 is the
  impact-specific backtest from the Fable/Opus derivations — their kill scopes differ
  by design.)
- **If ladder stage 2 kills the impact substrate** (P2): Artifact 2 is demoted to
  declared-dependency edges plus an explicit everything-else-is-DARK disclosure; §5.2's
  centerpiece framing is void. The system's value then rests on the shallow-substrate
  survivors: local execution continuity (Artifact 4 core), fact resolution and routing
  (Artifacts 1/3), and evidence bundling (Artifact 5) — each of which the ladder
  validates or kills separately through the facet pilots.
- **If the local continuity pilot fails** (no behavior change): the local facet remains
  a maintained filtering/recovery utility; platform expansion of the local facet stops.
- **If the Atlas concierge pilot fails** twice (original + one evidence-selected
  alternative workflow): broad organization-facet expansion stops; the facet remains
  admin/inspection tooling for wherever resolution already proved out.
- **If both facets fail their pilots**, this contract is dead and must be superseded,
  not patched.

## 10. Relationship to prior documents

- `reports/product-future-direction.md` — **superseded as authority** (maintainer
  ruling, 2026-07-10). Absorbed: its experiment protocols and gates (§8.1), its
  retained principles (facts/inference visibly distinct; stale evidence visible;
  local vs org trust boundaries; outcome metrics over volume metrics), and its
  discipline that inconclusive results authorize nothing.
- `FABLE-DECISION-LOG.md` P27 (review/verification moment not a surface) — **amended**:
  verification *evidence* (Artifact 4) is in scope; correctness *judgment* remains out,
  per Constitution art. 6. New rulings in this contract (R1–R6, §7.1, §7.2) should be
  registered in the decision log as the next P-entries.
- `CONTEXA-DESIGN.md` / `CONTEXA-IMPL.md` and Atlas 0.2 design docs — remain
  implementation registers for their facets; on conflict with this contract, this
  contract wins and the register gets reconciled at the next /gc.
- The three sealed derivations and the comparison (`reports/derivation-*.md`) — frozen
  evidence snapshots; never edited, only cited.
