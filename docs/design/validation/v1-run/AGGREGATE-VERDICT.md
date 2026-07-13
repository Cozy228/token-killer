---
status: frozen
review_after: 2026-08-02
purpose: >
  Stage-1 aggregate verdict for the V0 WoZ truth-panel run (protocol §8/§9).
  Computed 2026-07-13, after all 60 questions were scored and all maintainer
  tie-breaks recorded (anti-gaming rule honored: no aggregate was viewed
  before the last score landed).
---

# Aggregate verdict — v1 run (V0 WoZ stage 1)

**Verdict: KILL.** Stage 1 fails on BOTH §8 axes, independently:

1. **Coverage:** 4 of 12 cases reach the ≥80% source-backed bar — far below
   the required 9 of 12.
2. **False reassurance:** 13 material false-reassurance instances — the §2
   rule kills on ANY single one.

Per §9 kill scope: the compiled-artifact shape is dead; no artifact built on
source-compiled claims (Artifacts 1/2/3/5 and the organization half of 4)
proceeds to stage 2. Only the local continuity pilot survives on its own gate.
Per §10, the merge-fallback cutoffs made this run MORE generous to the
sources than a true first-review cutoff would have been; a kill is unaffected
by that inflation.

## 12-case tally

| Case | PR | Coverage | ≥80%? | FR instances |
|---|---|---|---|---|
| 1 | token-killer#90 | 4.500/5 = 90.0% | ✅ | — |
| 2 | token-killer#89 | 2.833/5 = 56.7% | ❌ | Q5 |
| 3 | token-killer#87 | 1.667/5 = 33.3% | ❌ | Q1, Q2, Q4 |
| 4 | token-killer#57 | 2.800/5 = 56.0% | ❌ | Q2, Q4 |
| 5 | token-killer#47 | 3.667/5 = 73.3% | ❌ | Q4 |
| 6 | token-killer#53 | 2.467/5 = 49.3% | ❌ | Q1, Q2 |
| 7 | token-killer#52 | 3.250/5 = 65.0% | ❌ | Q1 |
| 8 | token-killer#51 | 4.417/5 = 88.3% | ✅ | — |
| 9 | atlas#18 | 2.833/5 = 56.7% | ❌ | Q5 |
| 10 | atlas#8 | 3.000/5 = 60.0% | ❌ | Q1, Q4 |
| 11 | atlas#2 | 4.583/5 = 91.7% | ✅ | — |
| 12 | atlas#1 | 4.667/5 = 93.3% | ✅ | — |

All 60 questions were pre-registered `material: yes`; denominator 5 per case.
Per-question scores and tie-break rationales: `packets/votes/case-NN-final.md`.

## The 13 material false-reassurance instances (§9 explicit statement)

| # | Case/Q | Confirmed-but-wrong claim |
|---|---|---|
| 1 | C2 Q5 | "No release checklist exists" — `docs/INSTALL.md` §4–§5 is one. |
| 2 | C3 Q1 | "All load-bearing floor surfaces moved; only two doc stragglers" — `check-installation.sh` still passes Node 20, plus further field claims. |
| 3 | C3 Q2 | "Reviewer CAN reconcile ≥22 policy against P10" — P10 is on an unmerged branch, inadmissible (R2). |
| 4 | C3 Q4 | "Split collapse recorded/authorized by P10, nothing contradicts" — same inadmissible basis; perf-goal/plan records contradict. |
| 5 | C4 Q2 | "Nothing dangling on this surface" — ADR 0004 §5 / ADR 0015 reconciliation skipped. |
| 6 | C4 Q4 | "No ADR records the repo:/repo- seam" — ADR 0014 records it. |
| 7 | C5 Q4 | "Leak violates no written rule that existed then" — renderDebug's "Final privacy net" contract comment is that rule (R4). |
| 8 | C6 Q1 | "Clean three-way composition" — at the pin, filtered-path cache promise unbacked and a manual conflict resolution hidden (R5). |
| 9 | C6 Q2 | "Merges are clean, nothing reconciled" — merge messages record `# Conflicts:` (both votes agreed; materiality confirmed). |
| 10 | C7 Q1 | "The two caches can never disagree" — no content check in the key; same-path/size/mtime rewrite is a real counterexample. |
| 11 | C9 Q5 | "Delivery-complete per docs" — no CONFLUENCE_* injection exists in the ECS task env; the credential pipe is missing. |
| 12 | C10 Q1 | "Every surviving 'capability' use is harmless" — live goal-prompt doc still prescribes `atlas_search_capability` (split-brain). |
| 13 | C10 Q4 | "Branch history already complied with Conventional Commits" — multiple non-conforming subjects, not a lone outlier. |

## Maintainer rulings applied across cases (R1–R5)

- **R1 — Unanswered is unanswered.** Sub-questions explicitly named by the
  question but not addressed in the operator's answer score as unanswered,
  even when the addressed parts are all correct. (Set at C9 Q1; applied to
  C8 Q1, C9 Q2, C2 Q1, C3 Q5.)
- **R2 — Unmerged branches are inadmissible.** Commits that exist only on an
  unmerged branch — same repo, pre-cutoff — are not admissible evidence.
  (Set at C3 Q2; applied to C3 Q4.)
- **R3 — Low FR threshold for completeness confirmations.** A confident
  completeness/safety confirmation ("no record exists" / "only docs remain" /
  "all migrated") that is wrong scores false-reassurance even when the
  answer's overall thrust is a warning; conservative-direction errors
  (claiming a record absent when it exists, C4 Q4) qualify. Demoted to
  partial only when the wrong sub-claim is not itself a completeness/safety
  clearance (C4 Q1, C5 Q1, C2 Q4).
- **R4 — Code-comment promises are recorded conventions.** An in-code
  contract comment (e.g. renderDebug's "Final privacy net") counts as a
  written convention. (Set at C5 Q4.)
- **R5 — Evaluate at the pin.** Composition/behavior claims are judged at the
  pinned merge commit; sibling PRs merged minutes later cannot back-fill the
  pinned state. (Set at C6 Q1.)

## Adjudication statistics (for the record)

- 60 question-votes: 28 identical between Claude and Codex (incl. one agreed
  FR at C6 Q2 and one agreed partial at C9 Q4), 29 label disagreements,
  3 same-label fraction disagreements.
- Divergence resolution: 23 adopted Codex, 6 adopted Claude, 3 maintainer
  hybrid scores (C2 Q4, C5 Q1, C7 Q3).
- Voter severity asymmetry: Codex cast 16 FR votes, Claude 1. Of Codex's 15
  contested FR votes, the maintainer upheld 12 as FR and demoted 3 to
  partial (C2 Q4, C4 Q1, C5 Q1; C4 Q1 kept Claude's fraction). Both of
  Claude's two harsher-than-Codex votes were upheld (C6 Q4, C8 Q2).
- Product defect surfaced by adjudication (C2 Q4 ruling): the JVM handlers
  pass `important.slice(0, 40)` as a lossless digest, violating ADR 0001's
  first-N ban — filed as a follow-up GitHub issue; still present on
  feat/1.0.0 (`src/handlers/java/maven.ts:42`, `gradle.ts:31`).

## No stage-2 calibration handoff

§9's calibration-inputs section applies only on a pass. Stage 1 failed; the
observed per-class pattern is recorded here solely as post-mortem input: the
verification-evidence class (Q3s) was the sources' strongest — 10 of 12
scored correct and the other two were high partials (3/4, 5/6) — while
completeness confirmations across impact/convention/delivery classes
produced all 13 FR instances.
