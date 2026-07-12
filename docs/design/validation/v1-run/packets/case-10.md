---
packet: 10
pr: czync/atlas#8
cutoff: 2026-06-20T08:21:37Z
merge_commit: 615db18aff9927378a0821e944146522ea87140b
base: codex/MVP-source-loop
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 10 (atlas#8)

**PR:** czync/atlas#8 — "ci: verify GitHub Actions pipeline + husky (squash back into source-loop)"
**Cutoff (UTC):** 2026-06-20T08:21:37Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `615db18aff9927378a0821e944146522ea87140b` (base: codex/MVP-source-loop)

## Instructions to the panel member (read fully before scoring)

You are one vote on the truth panel of the V0 WoZ stage-1 protocol
(`docs/design/validation/V0-WOZ-PROTOCOL.md`, frozen 2026-07-11). You are
adjudicating in a FRESH session, independent of the operator session and of
the other panel member. Rules that bind you:

1. **Blindness.** Do NOT read the operator scorecards
   (`docs/design/validation/v1-run/case-*.md`), the v1-run README checklist
   notes, or any other packet's votes before casting yours. This packet is
   your only operator-derived input. Do not consult `ctx` or any compiled
   artifact.
2. **Admissibility (§3).** Only evidence existing at or before the cutoff
   above is admissible. Pin your reads:
   `git worktree add --detach <tmp> 615db18aff9927378a0821e944146522ea87140b` in the atlas
   clone; history queries only on that commit's ancestry; GitHub API
   records filtered `created_at <= cutoff`. The realized post-merge outcome
   of the PR is inadmissible for the knowability judgment.
3. **Your job per question:** against your OWN independent read of the
   admissible sources plus the operator's verbatim queries below, judge:
   (a) was the operator's final answer correct? (b) was the answer (or a
   better one) reachable from admissible sources? (c) does any confident
   claim in the answer turn out wrong — if so, on a material question,
   apply the false-reassurance test (§2).
4. **Scoring rubric (§7, fixed):** score each question exactly one of
   `correct` (1.0) · `abstained-correctly` (0, never a kill trigger) ·
   `partial` (fraction = correctly-backed material sub-claims ÷ required
   material sub-claims; enumerate the sub-claims) · `incorrect` (0) ·
   `false-reassurance` (wrong AND presented as confirmed/safe/complete on a
   material question — kill trigger).
5. **False reassurance (§2, verbatim intent):** a material question answered
   wrongly while presented as confirmed/safe/complete — a confident wrong
   answer that would have reassured the reviewer into an action the truth
   would have changed. A disclosed unknown ("sources do not establish X")
   is NOT a failure; a lazy abstention where the answer WAS reachable
   scores `incorrect`.
6. **Output your vote** as `packets/votes/case-10-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, body (purpose: validate new
CI on a real PR; local-green gate list; contents: ci.yml single verify job
pnpm 11.8 + Node 22 frozen-lockfile, husky pre-commit/commit-msg,
capability→availability/service rename, registry manifest schema/loader),
top-dir distribution (85 files: portal 42, docs 10, context-layer 9…).

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The bundled "capability → availability/service rename across portal + context-layer" is a vocabulary migration riding a CI PR. What does it touch at cutoff (types, routes, data manifests), and does any surface still carry the old "capability" term afterwards — creating a split-brain a later reader would trip on? | yes |
| 2 | Ownership / routing | The PR merges into `codex/MVP-source-loop`, not main. What do the repo's own records at cutoff (AGENTS.md, docs, branch naming) say about who owns that integration branch and its review protocol — who is supposed to review a bundle-the-working-tree PR like this? | yes |
| 3 | Verification-evidence | The PR's entire purpose is proving the new CI pipeline on a real PR. Did the new `verify` workflow actually run GREEN on this PR's head before the 08:21:37Z cutoff, and does the workflow's job list match the locally-claimed gate list (typecheck, lint, test, portal build, lambda build)? | yes |
| 4 | Convention / decision-context | The PR installs commit conventions (husky commit-msg commitlint-conventional; pre-commit oxfmt+oxlint via lint-staged). Is that convention recorded anywhere durable at cutoff besides the hook files, and did the branch's own history conform to conventional commits before enforcement landed? | yes |
| 5 | Delivery-requirements | For the pipeline to actually gate future work: what events/branches does ci.yml trigger on at cutoff (does it cover PRs into BOTH main and the source-loop branch?), and is `--frozen-lockfile` satisfiable (lockfile committed, pnpm version pinned consistently between workflow and package.json)? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — rename completeness: any capability split-brain?

**Operator's verbatim queries:**

```
grep -rn -i capabilit (ts/tsx/json/md, excl. node_modules) @615db18a
```

**Operator's final answer (verbatim):**

Answer: no split-brain — the domain term is gone from live code/schema/UI,
the purge is documented in CONTEXT.md with a pointer to the rename goal
doc, and every surviving "capabilities" is the MCP protocol field or
vendored non-product content that a later reader wouldn't confuse with
the old domain concept.

**Operator confidence label:** **confirmed**

---

### Q2 — who owns `codex/MVP-source-loop` and its review protocol

**Operator's verbatim queries:**

```
grep -rn -i "source-loop|source loop" AGENTS.md CLAUDE.md CONTEXT.md docs/*.md plans/*.md  → EMPTY
```

**Operator's final answer (verbatim):**

Answer: unrecorded — a reviewer asking "who owns this branch and who
must approve a bundle-the-working-tree PR" finds nothing at cutoff
except the branch-name convention and the PR's self-declared process.
The sources establish the absence, and the absence IS the answer:
process authority for this branch lived in the maintainer's head at
cutoff.

**Operator confidence label:** **confirmed** (sourced absence)

---

### Q3 — did the pipeline prove itself pre-cutoff, and does it match the claimed gates?

**Operator's verbatim queries:**

```
gh api repos/czync/atlas/pulls/8 -q .head.sha      → ec765244
gh api 'repos/czync/atlas/actions/runs?head_sha=ec765244'
sed -n '1,60p' .github/workflows/ci.yml (@615db18a)
```

**Operator's final answer (verbatim):**

Answer: yes on both — the PR fulfilled its stated purpose before merge
(the new pipeline ran green on the real PR head 48s pre-cutoff), and the
CI job is a 1:1 transcription of the locally-verified gate list, so
"green in CI" means the same thing as the body's "green locally".

**Operator confidence label:** **confirmed**

---

### Q4 — is the commit convention recorded beyond the hooks, and did history conform?

**Operator's verbatim queries:**

```
grep -rn -i "conventional|commitlint" AGENTS.md CONTEXT.md README.md docs/
git log --format='%s' 615db18a~1 | head -12
```

**Operator's final answer (verbatim):**

Answer: the convention predates its enforcement — constraint #47 in the
architecture constraints register already required Conventional Commits,
and the branch history already complied; this PR merely mechanizes an
existing recorded rule (commitlint + husky), the healthy direction on
the prose→hook enforcement ladder.

**Operator confidence label:** **confirmed**

---

### Q5 — will the pipeline actually gate future work?

**Operator's verbatim queries:**

```
sed -n '1,30p' .github/workflows/ci.yml    (triggers)
grep -n packageManager package.json ; ls pnpm-lock.yaml
```

**Operator's final answer (verbatim):**

Answer: yes — the trigger design gates all future PRs regardless of base
branch (which is what the source-loop workflow needs), while
direct-push laxity exists only off-main (consistent with PR-based flow).
Frozen-lockfile is satisfiable and version-pinned through one field.
The delivery is complete for the gate's stated purpose.

**Operator confidence label:** **confirmed**

---

