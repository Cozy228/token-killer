---
status: draft
review_after: 2026-07-25
purpose: >
  Pre-registered Wizard-of-Oz stage-1 experiment protocol for P2 substrate
  viability (PRODUCT-DESIGN §8.1 escalation ladder, stage 1). Tests whether real
  sources can answer material decision questions at first-review cutoff, before
  any product code exists. This is the LAW §8.1 stage-1 precondition (OPEN O-22).
freeze_condition: >
  Maintainer ratification converts status to frozen; post-freeze parameter
  changes are forbidden once any result is visible. The §11 parameter list is the
  set the maintainer confirms or edits at ratification; after freeze the whole
  document is immutable for the duration of the run.
---

# V0 — Wizard-of-Oz Stage-1 Protocol (P2 substrate viability)

**Anchors:** PRODUCT-DESIGN §8.1 (escalation ladder, stage 1) · §9 (kill scopes) ·
§7.2 (thresholds = calibration outputs, pre-registration discipline) ·
`reports/derivation-comparison-r1.md` test-escalation-chain (stage-1 row, origin) ·
FABLE-DECISION-LOG P37 ruling ⑥ + same-day refinements (a) · OPEN O-22.

**What this stage decides (LAW §8.1):** whether mechanically reachable sources
(git history, code, docs, decision log, CI records) can answer the material
decision questions a reviewer/author faces, at the moment they face them, with
high enough coverage and zero false reassurance that a compiled-artifact product
built on those sources would be trusted. It tests the *substrate*, not the
product — no `ctx` compiled answers are used (art. 6, operator protocol §6).

This is a shadow study with **zero code**. It costs only operator + panel time.

---

## 1. Question taxonomy

For each PR, the operator poses a **fixed, pre-registered set of decision
questions** drawn from five classes. These are the decision-questions a reviewer
or author actually faces at first review; each maps to a compiled artifact the
product would eventually serve.

| Class | Definition — the decision the question would change | Maps to |
|---|---|---|
| **Impact / blast-radius** | What else does this change break or touch? What depends on the modified surface? | Artifact 2 |
| **Ownership / routing** | Who should review/own this? Who last decided here / holds context? | Artifacts 1/3 |
| **Verification-evidence** | What proves this works — tests, CI runs, prior incidents, exercised paths? | Artifact 5 |
| **Convention / decision-context** | What prior decision, convention, or constraint governs this area? Why is it this way? | Artifacts 1/3 |
| **Delivery-requirements** | What must ship with this (migration, doc, flag, follow-up) to be complete/safe? | Artifacts 1/5 |

**Questions per PR (pre-registered, fixed):** **5 — exactly one per class.** The
operator writes all 5 question stems for a PR *before* running any source query
for that PR, phrased as concrete questions about that specific diff (not generic
templates). Total question corpus at N=12 PRs = **60 questions**. If a class is
genuinely inapplicable to a PR (e.g. no delivery obligation is even plausible),
the operator records it as **N/A with a one-line reason before querying**; an N/A
question is excluded from that PR's denominator (§4). N/A may not exceed 1 per PR
(if 2+ classes are inapplicable, the PR fails the non-trivial floor — replace it
per §5).

---

## 2. Materiality definition

A question is **material** if a correct answer would *plausibly change the
reviewer's or author's action* at first review — approve vs. request-changes,
who to route to, what to test, what to block on, what follow-up to require. The
operator marks each question `material: yes/no` **at question-writing time,
before querying**. Only material questions count toward coverage (§4);
non-material questions are logged but scored for interest only.

**MATERIAL FALSE REASSURANCE (the kill-grade event, LAW §8.1 + art. 4):** a
material question answered *wrongly* while the answer is *presented as confirmed,
safe, or complete* — a confident wrong answer that would have reassured the
reviewer into an action the truth would have changed. This is the single
any-instance kill trigger: **one confirmed material false reassurance in the
whole run kills the compiled-artifact shape** (§8), regardless of coverage.

A **disclosed unknown is NOT a failure** (art. 4). If the operator, working the
sources, cannot answer and *says so* ("sources do not establish X" /
"abstained — no qualifying claim"), that question scores `abstained-correctly`
(§7) — it counts against coverage but is explicitly *not* false reassurance. The
guardrail the product must honor is precisely this: an honest "unknown" is
acceptable; a confident wrong "confirmed" is fatal.

Adjudication of whether a wrong-and-confident answer is *material* false
reassurance vs. immaterial error is the truth panel's call (§7), decided against
the pre-registered materiality mark and the first-review-cutoff evidence set.

---

## 3. Cutoff

The **first-review cutoff** for a PR is the timestamp of the **first human review
activity** on that PR: the earliest of (a) the first review comment, (b) the
first review submitted (approve/request-changes/comment-review), or (c) the first
line-level review comment — whichever occurs first. For repos/PRs without
platform review events, the cutoff is the **first reviewer/maintainer comment on
the PR thread**. If a PR has *no* review activity at all (self-merged, no
comments), the cutoff is the **merge commit timestamp**.

**Admissibility rule:** only evidence that existed *at or before* the cutoff is
admissible. Commits pushed after cutoff, later review rounds, post-merge
follow-ups, and the realized outcome of the PR are **inadmissible** to the
operator and to the panel's knowability judgment. The panel adjudicates *what was
knowable from the sources as of the cutoff* — not what turned out to be true
later. The operator records the exact cutoff timestamp per PR in the case
scorecard before querying.

---

## 4. Denominator / coverage bar

**Source-backed answer coverage (per case):**

- Denominator = the count of **material, non-N/A questions** for that PR (§1, §2).
- A question is **source-backed** if the operator produced an answer that is
  *supported by admissible source evidence* (§3) AND the truth panel scores it
  `correct` (§7). An `abstained-correctly` is NOT a defect and never triggers the
  kill rule, but it does **not** count as coverage — an honest "sources do not
  establish X" is precisely the sources-cannot-answer signal this stage measures
  (§2 is explicit: abstention counts against coverage). A lazy abstention where
  the answer *was* reachable scores `incorrect`.
- **Partial answers:** a question answered partially (some sub-facts backed,
  others not, or hedged) scores as a **fraction in [0,1]** = (correctly-backed
  material sub-claims) ÷ (material sub-claims the panel deems the question
  required). Sub-claims are enumerated by the panel at adjudication. A partial
  answer that contains any confidently-wrong sub-claim escalates to the false
  reassurance test (§2) regardless of its fraction.
- **Per-case bar: ≥ 80%** of the case's material-question denominator is
  source-backed (summing fractional partials).
- **Aggregate pass bar: ≥ 9 of 12** cases meet the per-case ≥80% bar.

**Kill (LAW §8.1):** `< 9/12` cases at the ≥80% bar, **OR any** confirmed
material false reassurance (§2) → stage 1 fails.

The 80% and 9/12 bars are the stage-1 *pass gate* and are frozen by this
protocol. The finer accuracy thresholds (§7.2 precision/recall numbers) are NOT
set here — they are calibration outputs of stage 2 and must not be back-fit from
stage-1 results (§7.2 discipline).

---

## 5. Case selection

**Honest adaptation to this deployment (LAW §8.1 says "~12 PRs across ≥2
teams"):** this is a solo-maintainer environment. There are no distinct teams.
Per P37 ⑥ / refinement (a), **≥2 distinct repos substitute for "≥2 teams"** —
cross-repo variety stands in for cross-team variety. This substitution is a
pre-registered limitation (§10), not a silent weakening of the bar.

**Selection rule (pre-registered, run BEFORE any query):**

- **Repo pool (default):** `token-killer` and `atlas` (≥2 distinct repos). The
  final repo list is a §11 freeze parameter.
- **Case count N (default): 12.** Split across repos to guarantee ≥2 repos are
  represented, default **8 from token-killer + 4 from atlas** (adjust at freeze
  if atlas has too few qualifying PRs; minimum 3 per included repo).
- **Diff-size floor (non-trivial, default):** merged PR with **≥ 40 changed lines
  across ≥ 3 files**, excluding lockfiles and generated files from the count.
- **Exclusions:** docs-only PRs, pure-formatting/lint PRs, dependency-bump-only
  PRs, and revert PRs are excluded.
- **Ordering:** take the **most recent N merged PRs** (by merge timestamp,
  descending) that pass the floor and exclusions, per the repo split. Ties on
  timestamp broken by higher changed-line count.
- **Freeze the exact PR list before querying.** The selected PR numbers +
  cutoffs are written into the protocol appendix (or a companion frozen case
  list) at ratification. Once any query runs, the case set is locked; a PR found
  mid-run to violate the floor (e.g. inflated by a generated file) is replaced by
  the next-most-recent qualifying PR *from the same repo*, and the replacement is
  logged with reason.

---

## 6. Operator protocol

- **One operator, one session.** A single researcher session hand-operates the
  queries. The operator writes each PR's 5 question stems + materiality marks
  (§1, §2) and records the cutoff (§3) **before** issuing any source query for
  that PR.
- **READ-ONLY source queries only.** Permitted sources: git history (log, blame,
  diff, tags), the code itself, in-repo docs, the decision log
  (`FABLE-DECISION-LOG.md` / ADRs / `OPEN.md`), and CI records (workflow runs,
  test results) available at or before cutoff. The operator emulates the queries
  a connector *would* run — this is the Wizard-of-Oz: a human plays the
  connectors by hand.
- **NO `ctx` compiled answers, NO product artifacts.** The operator may not run
  `ctx`, read any compiled claim, or consult a prior artifact. This stage tests
  whether the SOURCES can answer, not whether the product presents well
  (art. 6 / LAW §8.1). Using the product here would make the test circular.
- **Verbatim query log per case.** For each question the operator records: the
  exact queries issued (commands / files opened / searches), the admissible
  evidence found (with cutoff check), the answer given, and the operator's own
  confidence framing (confirmed / partial / abstained). The log is kept verbatim
  so the panel can adjudicate against what was actually retrievable, not a
  summary. The operator does **not** self-score coverage or materiality outcomes.

---

## 7. Truth panel & adjudication

**Panel (LAW P37 ⑥): maintainer + Claude + Codex** — the human owner plus two
heterogeneous models. The panel adjudicates each question against the operator's
verbatim log and its own independent read of the admissible (pre-cutoff) sources.

**The four P37 independence clauses, as procedure:**

1. **Operator ≠ adjudicator, isolated sessions.** The person/session that
   operated the queries does not adjudicate. Panel members run in **fresh
   sessions** with no operator-session context carried in.
2. **Adjudicator blind to operator reasoning.** Panel members receive the
   question, the PR, the admissible source set, and the operator's *final
   answer including its stated confidence label* (confirmed / partial /
   abstained — required to judge false reassurance, §2) — but **not** the
   operator's confidence rationale or private notes.
   Each member independently judges: was the answer correct? was it reachable
   from sources? was any confident claim actually wrong (false reassurance)?
3. **Codex as heterogeneous vote.** Codex (a different model family) casts an
   independent vote on every question, guarding against Claude-monoculture
   agreement. Claude and Codex vote in **separate isolated sessions**; neither
   sees the other's vote before casting.
4. **Pre-registered scoring rubric** (below) — fixed by this protocol; the panel
   applies it, it is not negotiated per case.

**Per-question scoring rubric (pre-registered):** each question is scored into
exactly one of —

| Score | Meaning | Coverage effect |
|---|---|---|
| `correct` | Answer right and source-backed | counts as covered (1.0) |
| `abstained-correctly` | Operator declined; sources genuinely don't establish it | not covered (0); never a kill trigger |
| `partial` | Some required sub-claims backed | fractional (§4) |
| `incorrect` | Wrong, or reachable-but-abstained, no false confidence | not covered (0) |
| `false-reassurance` | Wrong **and** presented as confirmed/safe/complete, on a **material** question | **kill trigger (§2/§8)** |

**Vote resolution & tie-break:** Claude and Codex each score every question;
their scores are recorded. On disagreement, **the maintainer breaks the tie —
after both model votes are recorded** (never before, to keep the model votes
uninfluenced). The maintainer is also the final arbiter of whether a
wrong-confident answer is *material* false reassurance vs. immaterial error.

**Adjudication window:** all adjudication completes **within 7 days** of the
operation run, and **before any aggregate (per-case %, 9/12 tally) is computed**.
No aggregate is calculated or viewed until every question is scored — this
prevents stopping-rule gaming. The window length is a §11 freeze parameter.

---

## 8. Kill / pass rule (verbatim from LAW §8.1 + §9)

**Pass:** ≥ 9 of 12 cases reach ≥ 80% source-backed coverage **and** zero
material false reassurance → the compiled-artifact shape survives stage 1 and may
proceed to stage 2 (retrospective backtest), which produces the calibrated
thresholds of §7.2.

**Kill (LAW §8.1, stage 1):** "Kill the compiled-artifact shape if `<9/12` cases
reach the pre-registered source-backed coverage bar, or on **any** material false
reassurance."

**Kill scope (LAW §9, verbatim intent):** if ladder stage 1 fails, **the whole
compiled-artifact shape is dead** — the sources cannot answer material decision
questions, and **no artifact built on source-compiled claims (Artifacts 1/2/3/5
and the organization half of 4) may proceed to stage 2.** **Only the local
continuity pilot survives** on its own gate, because its evidence is `OBSERVED`
at the command boundary, not compiled from organization sources. (Stage 1 is the
general coverage test; stage 2 is the impact-specific backtest — their kill
scopes differ by design, §9.)

---

## 9. Outputs

- **Per-case scorecards** (one per PR): PR id, repo, cutoff timestamp, the 5
  questions with class + materiality mark, operator answer + verbatim query log,
  the two model votes + maintainer tie-break, per-question score, and the case
  coverage % (with fractional partials shown).
- **Aggregate verdict:** the 12-case tally (cases ≥80%), the pass/kill decision
  per §8, and an explicit statement of any false-reassurance instance (with the
  offending question) or its absence.
- **Calibration inputs handed to stage 2** (only if stage 1 passes): the observed
  coverage distribution per question class (which classes the sources answered
  well vs. poorly), the abstention rate, the partial-answer patterns, and the
  connector-emulation notes (which source queries were load-bearing) — these seed
  stage 2's hypothesis inputs and its as-of connector build. Per §7.2, stage 1
  results do **not** set the §7.2 precision/recall numbers; those remain stage-2
  calibration outputs.

---

## 10. Pre-registered limitations

Stated plainly, per P37 refinement (a)'s "honest self-adjudicated-panel
limitation note":

- **Self-adjudicated panel.** Two of three panel members (Claude, Codex) are the
  same *kind* of system the eventual product is built on, and the maintainer both
  designed the product and breaks ties. This is not a fully independent truth
  panel; it is the best available in this environment. The independence clauses
  (§7) mitigate but do not eliminate correlated blind spots — a fact none of
  maintainer/Claude/Codex can retrieve is scored "unknowable" even if a
  disinterested expert could find it.
- **Solo-maintainer environment.** "≥2 teams" (LAW §8.1) is substituted by ≥2
  repos (§5). Cross-repo variety is a weaker proxy for cross-team knowledge
  boundaries; the sources are all authored by one person, so ownership/routing
  questions are easier than they would be in a real multi-team org. Results
  over-state coverage for the ownership/routing class; read that class's numbers
  with this caveat.
- **Model-assisted operation.** The operator is model-assisted, and the panel is
  model-heavy. Operator and adjudicator being the same model family risks shared
  retrieval blind spots; the operator≠adjudicator isolation (§7 clause 1) and the
  Codex heterogeneous vote (clause 3) are the guards, but they are procedural,
  not architectural.
- **Small N.** 12 cases is enough to kill on a clear miss but underpowered to
  *confirm* narrowly; a pass at exactly 9/12 is weak evidence and should be read
  as "not killed," not "validated." Stage 2's ~100–150 PRs is where confirmation
  strength lives.

---

## 11. Parameters awaiting freeze

The maintainer confirms or edits each at ratification. Each has a concrete
default so the doc is freezable as-is; **no TBDs**.

| Parameter | Default | Notes |
|---|---|---|
| Final repo list | `token-killer`, `atlas` | ≥2 distinct; §5. Maintainer may add other maintainer repos. |
| N (case count) | 12 | LAW "~12"; §4/§5 bars assume 12. Change N → 9/12 bar restates proportionally (75% of cases). |
| Repo split | 8 token-killer + 4 atlas | ≥3 per included repo; adjust if atlas lacks qualifying PRs. |
| Diff-size floor | ≥40 changed lines across ≥3 files (excl. lockfiles/generated) | The "non-trivial" definition; §5. |
| Questions-per-PR | 5 (one per class) | §1. Total corpus = N×5. |
| Adjudication window | 7 days | §7. Must close before any aggregate is computed. |

---

*Freeze note: on maintainer ratification, set `status: frozen`, append the frozen
PR list + cutoffs (§5), and record the ratification in FABLE-DECISION-LOG (next
P-entry) and close OPEN O-22. After the first query runs, no parameter above may
change (freeze_condition, §7.2 discipline).*
