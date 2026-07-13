---
case: 3
voter: claude
date: 2026-07-12
---

# Case 3 vote — claude (token-killer#87, merge f8b0f67d, cutoff 2026-07-08T09:01:09Z)

Evidence base: detached worktree pinned at `f8b0f67dfdb6614e4411a7286ffd559c5595b2e9`; history
queries on that commit's ancestry plus the pre-cutoff feat/1.0.0 commit `41ae71f8`
(committed 2026-07-07T21:35:44+08:00 = 13:35:44Z, before cutoff); GitHub API records checked
against `created_at <= 2026-07-08T09:01:09Z`.

## Q1 — floor touchpoints: updated vs stale

**Score: partial (4/5 = 0.8)**

I independently re-swept the pinned tree. The operator's positive claims all verify: engines
`>=22.18.0` (package.json:41), `target: "node22.18"` (tsdown.config.mjs:17), docs/INSTALL.md:9
("22.18.0 or later"), .nvmrc and .node-version both `22.18.0`, server/app/Dockerfile:8
(`FROM node:22.18.0-slim`), docs/WINDOWS-TESTER-GUIDE.md:21/33 ("Node 22.18.0+"),
.github/workflows/ci.yml:24 (`node-version: [22.18.0, 24, 26]`). Both flagged stragglers are
real: plans/001-add-ci-workflow.md:129 still reads `node-version: [20, 22]`, and
docs/reports/leader-report-Token-Killer.md:224 still pitches "Node.js ≥ 20 / Node 20+" to
adoption deciders. "Nothing in src/ gates on a Node version at runtime" also verifies
(`grep -rn "process.version" src/` hits only src/debug/collect.ts:274, a telemetry field;
src/cli.ts:13 is a comment). However, the enumeration is incomplete on a surface class the
question explicitly names ("doctor/install checks"): `scripts/check-installation.sh:43-45`
still runs `check "node >= 20"` (`parseInt(process.versions.node) < 20`), is wired as
`pnpm check:installation` (package.json:29), and was untouched by the PR (its last change is
6e9d0c90). A Node-20 machine passes the repo's own install check after this PR. Sub-claims:
(1) load-bearing surfaces all moved in-PR — correct; (2) plans/001 matrix line stale —
correct; (3) leader-report "Node 20+" stale — correct; (4) no runtime gate in src/ — correct;
(5) completeness of the "what still says Node 20" enumeration — incorrect
(check-installation.sh missed). Not scored false-reassurance: the answer already reports
stale surfaces requiring follow-up, so the miss narrows an already-negative finding rather
than converting a wrong answer into reassurance.

## Q2 — where the floor decisions are recorded

**Score: partial (3/4 = 0.75)**

The core claims verify. `git log -1 --format='%B' f8b0f67d` returns only the bare title;
the PR body is null (GitHub API). `FABLE-DECISION-LOG.md` does not exist at f8b0f67d
(`git show f8b0f67d:FABLE-DECISION-LOG.md` → path does not exist), and `41ae71f8` is NOT an
ancestor of the merge (`git merge-base --is-ancestor` fails; branch containment shows
feat/1.0.0 and derivatives only) — so P10 is reachable pre-cutoff, but only on the unmerged
branch, exactly the caveat stated. P10 itself (41ae71f8:FABLE-DECISION-LOG.md line 21,
dated 2026-07-02) says "engines.node bumps to ≥22 … the D33 Node-20 machine no longer
matters". No "22.18" appears anywhere in that pre-cutoff log (grep exits 1); the only
22.x-specific records on feat/1.0.0 are a DIFFERENT floor with a different rationale
(≥22.16 "first 22.x with FTS5 in node:sqlite", M1/M2 docs; and P28① "engines = Node ≥22.5")
— so the runtime-floor jump to exactly 22.18.0 indeed has no record besides the deleted
ci.yml comment stating tsdown >=22.18 (verified verbatim at f8b0f67d^:.github/workflows/ci.yml:51).
Sole-author routing verifies (commit author Cozy; PR user czync). What the answer omits is
the question's first sub-part: WHAT prior decision set the previous `>=20` floor. That answer
was reachable: engines `>=20` landed in bare infra commit 38b225fb (2026-06-02, no decision
record), and the recorded motivation is D33's Node-capability gate (41ae71f8:CTX-DESIGN.md:321
"D33 CLI hub + Node capability gate … gate retired (P10)"), reachable pre-cutoff on the same
branch. Sub-claims: (1) prior decision behind the old floor — not addressed though reachable;
(2) raise rationale = P10 with reachability caveat — correct; (3) 22.18 specificity unrecorded
except the deleted comment — correct; (4) routing target = maintainer — correct.

## Q3 — does CI exercise the new floor, green at cutoff?

**Score: correct**

Independently re-derived from admissible records. The workflow at the merge commit pins the
exact minimum as a matrix entry on both OSes (ci.yml:23-24 `os: [ubuntu-latest,
windows-latest]`, `node-version: [22.18.0, 24, 26]`) and the PR diff removes both
`if: matrix.node-version == 22` guards (on `pnpm test:install` and the smoke step), so
install/dist smoke now run on the floor version (verified in `git show f8b0f67d --
.github/workflows/ci.yml`). GitHub API: PR #87 head = f8b0f67d, merged_at =
2026-07-08T09:01:09Z (= cutoff). The two runs for that head: pull_request run created
09:01:00Z (pre-cutoff) but completed 09:03:58Z, and push run created 09:01:11Z (post-cutoff)
completed 09:03:53Z — both `success`, both verdicts materializing ~3 minutes after the
cutoff. The operator's answer states precisely this split: verification design is in-PR and
checkable, but no green verdict existed at cutoff. No confident claim is wrong.

## Q4 — the build-vs-runtime split: recorded, and knowingly collapsed?

**Score: correct**

The deleted ci.yml comment verifies verbatim in the PR diff: "The build tool (tsdown)
requires Node >=22.18, so the build — and the dist smoke that consumes ./dist/cli.js — run
on the Node 22 jobs only. Node 20 still runs the full source suite … (the shipped artifact
is built with `target: node20`)." A sweep of the pre-PR tree (`git grep` on f8b0f67d^ across
md/mjs/yml) finds no other substantive record of the split — only that comment plus the
pre-PR `target: "node20"` line and the tsdown.config comment about the Node-20 `unrun`
fallback, both of which this PR rewrites. The PR does change the dist target
(tsdown.config.mjs: `target: node20` → `target: node22.18`) in the same commit that moves
engines and the CI matrix, i.e., the split is collapsed coherently and wholesale, with no
prose acknowledgment beyond the bare commit title — matching the operator's framing that
the residual unrecorded delta is the 22.18 specificity. The P10 authorization claim
verifies (41ae71f8:FABLE-DECISION-LOG.md:21-25), including the explicit retirement:
"O4 (premise check) confirmed 2026-07-02: the D33 Node-20 machine no longer matters."
Nothing contradicts a standing decision: the strictest recorded floor policy is P28①
"engines = Node ≥22.5, no upper bound", which 22.18.0 satisfies.

## Q5 — does the install base fail loudly and correctly?

**Score: partial (4/5 = 0.8)**

Verified sub-claims: (1) passive delivery set complete — engines (package.json:41), version
files (.nvmrc/.node-version = 22.18.0), INSTALL.md:9, WINDOWS-TESTER-GUIDE.md:21,
Dockerfile:8, CI matrix, and the pnpm 11 pin (`packageManager: "pnpm@11.10.0"`,
package.json:6) all ship in-PR — correct. (2) No engine-strict pin: `.npmrc` absent, no
`engineStrict`/engine-strict setting anywhere in repo config — correct. (3) No doctor
node-version check: full grep of src/shim/doctor.ts (252 lines, the only doctor module)
finds no version check — correct. (4) No runtime version gate in src/ — correct
(process.version appears only in src/debug/collect.ts:274 as a telemetry field). (5) The
"install-script guards" item from the question's own list is answered as absent, but the
truth is worse than absence: `scripts/check-installation.sh` (wired as
`pnpm check:installation`, package.json:29) exists and still enforces `node >= 20`
(lines 43-45), so an under-floor Node 20/22.0 machine actively PASSES the repo's own
install verification after this PR — a stale guard the answer does not surface. The
headline conclusion (active fail-loudly protection is the missing material delivery item)
remains right in thrust and is a warning, not reassurance, so this scores partial rather
than false-reassurance: 4/5 correctly-backed material sub-claims.
