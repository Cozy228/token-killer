---
case: 3
pr: czync/token-killer#87
title: "chore: raise Node minimum to 22.18"
cutoff: 2026-07-08T09:01:09Z
cutoff_kind: merge-fallback
merge_commit: f8b0f67dfdb6614e4411a7286ffd559c5595b2e9
base: main
status: operated
---

# Case 3 — token-killer#87

Subject read before question-writing: PR title, empty body, 22-file list,
hunks for ci.yml (matrix 20/22 → 22.18.0/24/26; removed the "build needs
tsdown >=22.18 but runtime target is node20" comment + the `if: node==22`
install guard), package.json (engines >=20 → >=22.18.0; packageManager pnpm
10.34.3 → 11.10.0; devDeps refresh incl. @types/node 25→22.18), executor.ts
(TextDecoder type spelling), plus .nvmrc/.node-version/docs touches.

**Floor note:** raw size 2533 lines/22 files includes 2394 lockfile lines
(pnpm-lock 960+605, server/pnpm-lock 339+490). Excluding lockfiles: ~139
lines across 20 files — still above the ≥40-line/≥3-file floor. No
replacement triggered.

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | Raising `engines` from `>=20` to `>=22.18.0` cuts off Node 20 and 22.0–22.17 machines. Which in-repo surfaces encode a Node floor (install docs, doctor/install checks, hook launch paths, dist build target, server Dockerfile, tester guides), does the PR update every one of them, and what still says "Node 20" (or another floor) after this change? | yes |
| 2 | Ownership / routing | What prior decision set the previous floor (`>=20` with dist `target: node20`), and where is the 20→22.18 raise's rationale recorded — decision log entry, ADR, commit message, or only the deleted CI comment about tsdown requiring 22.18? Who/what does a reviewer consult to confirm the floor raise is intended product policy rather than build-tool convenience? | yes |
| 3 | Verification-evidence | Does CI at cutoff actually exercise the new minimum — 22.18.0 on BOTH OSes including the previously-gated install/dist steps (the `if: node==22` guard was removed) — and was that run green at or before the cutoff? | yes |
| 4 | Convention / decision-context | The deleted ci.yml comment records a deliberate build-vs-runtime split: build needs tsdown ≥22.18, but the shipped artifact kept `target: node20` so Node-20 users stay supported. Does any other record (tsdown.config, docs, decisions) confirm that split as policy, and does this PR change the dist target too — i.e., is the collapse of the split acknowledged anywhere? | yes |
| 5 | Delivery-requirements | For the installed field, what must accompany an engines raise so existing Node-20/22.x users fail loudly and correctly (pnpm engine-strict behavior, install-script guards, doctor message, INSTALL.md, .nvmrc/.node-version, WINDOWS-TESTER-GUIDE, pnpm 11 packageManager pin) — which of these does the PR ship and which are missing? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

All git queries pinned to merge commit `f8b0f67d` (`${S}`); cutoff
2026-07-08T09:01:09Z.

### Q1 — floor touchpoints: updated vs stale

Queries executed:

```
grep -rn ">=20|Node 20|node20" (pinned tree, md/json/mjs/sh/ts, excl. node_modules)
grep -n -i node docs/INSTALL.md ; grep -n target tsdown.config.mjs
grep -n FROM server/app/Dockerfile ; cat .nvmrc .node-version
gh pr diff 87 | sed -n '/plans\/001/,/^diff/p'
```

Evidence (cited):

- Updated by the PR: `docs/INSTALL.md:9` (Node "22.18.0 or later"),
  `tsdown.config.mjs:17` (`target: "node22.18"` — the dist target moved too),
  `server/app/Dockerfile:8,22` (node:22.18.0-slim / lambda nodejs:22),
  `.nvmrc`/`.node-version` (new, both `22.18.0`), plans/001 lines 49ff
  (packageManager + engines quotes), WINDOWS-TESTER-GUIDE (2 lines),
  package.json engines + packageManager (pnpm 11.10.0).
- STALE after merge (at `${S}` tree): `plans/001-add-ci-workflow.md:129`
  still shows `node-version: [20, 22]` (the PR updated the same doc's §49
  but missed the matrix line); `docs/reports/leader-report-Token-Killer.md:224`
  still tells adopters "Node 20+"; `docs/archive/*` retain `>=20` (archive,
  arguably fine). Test fixtures mentioning node20 are simulated command
  output, not floor claims.
- Pre-existing inconsistency the PR exposes: plans/001 §49 claimed
  `pnpm@11.5.0` while package.json actually pinned `10.34.3` before this PR.

Answer: the load-bearing surfaces (engines, dist target, install doc,
version files, Dockerfile, tester guide, CI matrix) all moved to 22.18
in-PR. Two human-facing stragglers remain at cutoff — the plans/001 CI
matrix line and the leader-report's "Node 20+" adopter requirement — the
latter matters because it's the document pitched at deciders of the install
base. Nothing in `src/` gates on a Node version at runtime (see Q5).

Confidence: **confirmed**.

### Q2 — where the floor decisions are recorded

Queries executed:

```
git log -1 --format='%B' f8b0f67d                     → bare title, no body
git log --format='%h %cI' -1 86e99e14                 → 2026-07-08T12:42Z = POST-cutoff
git show 41ae71f8:FABLE-DECISION-LOG.md | grep -n "P10 —"   (pre-cutoff copy)
git log f8b0f67d --grep="node|engines" -i -- package.json
```

Evidence (cited):

- The merge commit message is the bare title — no rationale body.
- Decision record exists pre-cutoff on the unmerged `feat/1.0.0` branch:
  **P10** (dated 2026-07-02, present in decision-log commit `41ae71f8`,
  2026-07-07 = pre-cutoff): "Substrate: Node ≥22 lands … `engines.node`
  bumps to ≥22 (retiring D33's capability-gate …)". Note the admissibility
  subtlety: the LATEST log commit (86e99e14) is post-cutoff; the pre-cutoff
  copy at 41ae71f8 already contains P10.
- The specific **22.18** number's only recorded rationale is the CI comment
  this PR deletes: "The build tool (tsdown) requires Node >=22.18" —
  i.e. ≥22 is product policy (P10), =22.18 is a build-tool constraint
  promoted to the runtime floor without its own written justification.
- Prior floor (`>=20`, dist `target: node20`): set in the early infra
  commits; its intent is recorded in the same deleted ci.yml comment
  ("Node 20 still runs the full source suite … the shipped artifact is
  built with `target: node20`").

Answer: a reviewer CAN reconcile "≥22 is intended policy" against P10 in
the decision log (reachable pre-cutoff, though only on the unmerged
feat/1.0.0 branch — same reachability caveat as case 1). What has NO record
anywhere is the jump from policy "≥22" to exactly "22.18.0" for the
RUNTIME floor: the only written trace is the deleted comment stating it as
a build-tool requirement. The maintainer (sole author) is the routing
target for that gap.

Confidence: **confirmed**.

### Q3 — does CI exercise the new floor, green at cutoff?

Queries executed:

```
gh api repos/czync/token-killer/pulls/87 -q .head.sha
gh api 'repos/…/actions/runs?head_sha=<head>'   → 2 runs:
  created=2026-07-08T09:01:00Z updated=09:03:58Z success
  created=2026-07-08T09:01:11Z updated=09:03:53Z success
```

Evidence (cited):

- The in-PR workflow (subject material) runs matrix
  `[22.18.0, 24, 26] × [ubuntu, windows]` and REMOVES the
  `if: node-version == 22` guard on `test:install` — so the exact minimum,
  including the dist build+smoke, is exercised on both OSes from this PR
  onward.
- But at the cutoff instant, neither run on the head SHA had completed:
  created 09:01:00 (9s before merge) and 09:01:11 (2s after), both
  finishing ~09:03:5x — **post-cutoff**. Same pattern as case 1: the merge
  did not wait for green.

Answer: the PR itself installs exactly the right verification (minimum
pinned as a matrix entry on both OSes, install/dist smoke un-gated), but
the green verdict for THIS PR's head materialized ~3 minutes after merge.
At cutoff a reviewer could verify the workflow design, not a green run.

Confidence: **confirmed**.

### Q4 — the build-vs-runtime split: recorded, and knowingly collapsed?

Queries executed:

```
gh pr diff 87 (ci.yml hunk — the deleted comment)
grep -n target tsdown.config.mjs (@${S})
git show "${S}^:tsdown.config.mjs" | grep -n target
git show 41ae71f8:FABLE-DECISION-LOG.md | grep -n -A3 "P10 —"
```

Evidence (cited):

- The split WAS explicit policy, recorded in the deleted ci.yml comment:
  build needs tsdown ≥22.18, "Node 20 still runs the full source suite …
  the shipped artifact is built with `target: node20`".
- This PR collapses it end-to-end: `tsdown.config.mjs` target `node20` →
  `node22.18` (pre-PR value confirmed at `${S}^`), engines `>=22.18.0`,
  matrix floor 22.18.0.
- P10 (pre-cutoff decision log) authorizes the ≥22 direction — "retiring
  D33's capability-gate + dynamic-import scaffolding and the compile-cache
  DEFERRED tier" — i.e. the split's retirement is consistent with recorded
  direction, though P10 says ≥22, not 22.18.
- No doc/commit records the collapse as such; the PR body is empty.

Answer: yes, the split was deliberately recorded (in the very comment the
PR deletes), and the PR knowingly collapses it — dist target, engines, and
CI floor move together, which is the coherent way to do it. The recorded
authorization is P10's ≥22 substrate decision; the residual unrecorded
delta is again the 22.18 specificity (see Q2). Nothing contradicts a
standing decision; D33's Node-20 machine concern was explicitly retired by
P10.

Confidence: **confirmed**.

### Q5 — does the install base fail loudly and correctly?

Queries executed:

```
grep -n -i "node|version" src/shim/doctor.ts        → no node-version check
ls .npmrc → absent ; grep -n engine package.json    → engines block only
grep -rn "process.version" src/ → (no runtime floor gate found)
cat .nvmrc .node-version → 22.18.0
```

Evidence (cited):

- Shipped in-PR: engines `>=22.18.0` (installer-enforced messaging),
  `.nvmrc`/`.node-version` for version managers, INSTALL.md table, tester
  guide, packageManager pnpm 11 pin, Dockerfile bases.
- NOT present at cutoff: no `.npmrc` with `engine-strict`, so enforcement
  depends on each installer's default behavior; `ctx doctor`
  (src/shim/doctor.ts) performs NO Node-version check — a user on Node 20
  who force-installs gets no tool-side diagnostic; no runtime
  `process.version` gate exists in src/.
- The old world shipped a node20-target artifact, so under-floor Nodes
  mostly worked; after this PR a Node-20/22.0–22.17 machine may fail at
  runtime on 22.18-target output with no guided message.

Answer: the passive delivery set is complete (engines + version files +
docs + Docker + CI), but the ACTIVE guards are absent: no engine-strict
pin, no doctor check, no runtime version gate. For a distributed field
where install-time engine warnings are routinely ignored, the failure mode
for under-floor Nodes is an unguided runtime error. That gap is the
material delivery item this PR does not carry.

Confidence: **confirmed**.
