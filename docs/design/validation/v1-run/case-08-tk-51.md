---
case: 8
pr: czync/token-killer#51
title: "fix(optimize): scope triggered inspect to static-context only"
cutoff: 2026-06-17T17:38:12Z
cutoff_kind: merge-fallback
merge_commit: af88664b18f1abbb71fc67e62191bac6b4f0d77e
base: feat/0.3.1
status: operated
---

# Case 8 — token-killer#51

Subject read before question-writing: PR title, full body (176s discarded
full-inspect motivation, internal `--static-only` flag, 4 checked acceptance
criteria, side-fix of `--apply` opening HTML), 4-file list. Operator carries
batch-topology context from cases 5-7 (#51's merge = af88664b, merged before
#53/#52; batch CI red pattern).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | `--static-only` leaves `result`/`habits` undefined, and the body claims report and exit-code logic "already treat [that] as no runtime data". Which downstream consumers of `runInspect` outputs exist at cutoff (report rendering, `--fail-on` exit codes, telemetry aggregates, scope-bucket persistence), and is the "already handled" claim true for each — or does any path assume a defined scan result? | yes |
| 2 | Ownership / routing | Where was the optimize↔inspect contract recorded — which ADR/decision says `tk optimize` consumes only `static_context` findings (ADR 0003 inspect-default-full-static-context? ADR 0006 optimize-apply engine?) — and does this PR's scoping match that recorded contract or quietly narrow it? | yes |
| 3 | Verification-evidence | What was CI on this PR's head at the 17:38:12Z cutoff (batch siblings ran red on Node 22), and does `tests/unit/context/optimizeStaticScope.test.ts` at cutoff actually cover the four checked acceptance criteria (scan/habits spies with a real seeded transcript, static-finding parity full-vs-scoped, no-double-scan, stderr why-message)? | yes |
| 4 | Convention / decision-context | The body says `--static-only` is "not part of the public flag surface". What convention distinguishes internal from public flags in this repo at cutoff (help text, parse layer, docs), and does `--static-only` conform — is it hidden from `--help` and rejected/undocumented for direct users? | yes |
| 5 | Delivery-requirements | The claim "no double cold-scan across `user` + `project`" — what mechanism in this PR actually delivers it (shared analyzer run? bucket reuse between scopes?), is it tested, and does anything else need to ship for a git-repo user to stop paying the doubled cost described in the body? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `af88664b`; cutoff 2026-06-17T17:38:12Z.

### Q1 — undefined result/habits: is "already handled" true?

Queries executed:

```
grep -n -B2 -A5 "staticOnly|static-only" src/inspect/cli.ts
grep -n "result ??|result ? |habits" src/inspect/cli.ts src/report/html.ts src/inspect/telemetry.ts
grep -n -B2 -A4 "failOn|exitCode" src/inspect/cli.ts
```

Evidence (cited):

- The skip block (`cli.ts:211-218`): under `--static-only`, host
  discovery, transcript scan, and habit extraction are bypassed;
  `result`/`habits` stay undefined.
- Consumers at cutoff: report path substitutes an empty result
  (`cli.ts:375` `result ?? emptyScanResult(opts.inputType)`); telemetry
  aggregates are skipped cleanly (`cli.ts:477` `result ?
  buildInspectAggregates(...) : undefined`); exit-code logic
  (`cli.ts:481-484`) keys on `--fail-on` severity over findings, with the
  recorded principle "Findings never change the exit code on their own —
  inspect is diagnostic, not enforcement".
- `persistScopeBuckets` runs in the static path by design (it IS what
  optimize consumes).

Answer: the "already treat as no runtime data" claim checks out at every
consumer found: report renders against an explicit empty result,
telemetry aggregation short-circuits to undefined, and exit-code logic
is severity-driven rather than scan-dependent. No path at cutoff
dereferences a missing scan result.

Confidence: **confirmed**.

### Q2 — where the optimize↔inspect contract is recorded

Queries executed:

```
grep -n -i static docs/adr/0003-inspect-default-full-static-context.md
grep -n -i "static_context|static context" docs/adr/0006-cli-consolidation-and-optimize-apply-engine.md
grep -n -B3 -A8 staticOnly src/context/optimizeCli.ts src/context/applySafe.ts
```

Evidence (cited):

- ADR 0003 records the inspect side: static context is scope-aware,
  default user-level; `--copilot-context` already "narrows the run to
  static-context analyzers only" (:45) — precedent for a static-only
  mode.
- ADR 0006 (optimize --apply engine) does NOT state "optimize consumes
  only static_context findings" in greppable terms; the contract is
  recorded in code comments: `optimizeCli.ts:109-110` and
  `applySafe.ts:210` both state "`tk optimize` consumes ONLY
  static-context findings" as the justification.
- This PR's scoping implements exactly that stated consumption; it does
  not narrow what optimize reads (it already read only static findings —
  the PR narrows what the TRIGGER computes).

Answer: the consumption contract lives in code comments (both trigger
sites), not in an ADR; ADR 0003 supplies the static-analyzer precedent
and ADR 0006 the apply engine, but neither states the
"static-findings-only" contract explicitly. The PR matches the recorded
(comment-level) contract and changes computation, not consumption. Same
repo pattern as cases 1/4: load-bearing contracts recorded at code level.

Confidence: **confirmed**.

### Q3 — CI truth + acceptance coverage

Queries executed:

```
gh api repos/czync/token-killer/pulls/51 -q .head.sha
gh api 'repos/…/actions/runs?head_sha=<head>'  → completed/failure 17:17:41Z
grep -n 'test(' tests/unit/context/optimizeStaticScope.test.ts
```

Evidence (cited):

- CI on this PR's head: **completed/FAILURE** at 17:17:41Z — pre-cutoff,
  red, merged anyway (third confirmed instance of the batch pattern;
  cases 6/7 identical).
- The 5 tests at cutoff map 1:1 onto the acceptance criteria (+1):
  :94 "--apply with no prior bucket does NOT run a transcript scan /
  habit pass"; :116 "default preview path is also static-only"; :129
  "static findings from the scoped path match those from a full inspect";
  :168 "no double cold-scan across user + project"; :184 "user is told
  why before the scoped scan runs". Spies on scan/analyzeHabits with a
  seeded real transcript (file header, per body).

Answer: acceptance coverage is complete and named — every checked box
has a dedicated test at cutoff. The PR-level verification claim ("1752
passed") is author-asserted; the admissible CI record on this head is a
FAILURE run 21 minutes before the batch push.

Confidence: **confirmed**.

### Q4 — internal-flag convention conformance

Queries executed:

```
grep -n "inspect" src/cli.ts (help block) ; grep -n '"--json|--fail-on' src/cli.ts
grep -rn "static-only" src/cli.ts src/parse.ts docs/  → no public surface hit
```

Evidence (cited):

- The public flag surface for inspect is the help usage block
  `cli.ts:89-91,96,106`: `--text --json --since --session --input-type
  --project --user --surface --fail-on` — `--static-only` is absent.
- No docs mention it (docs/ grep hits only unrelated archive files).
- The only "internal flag" convention found is by-omission + comment:
  the parser accepts it (`inspect/cli.ts:115-116`) and the type carries
  the intent comment (:61-65, "Not part of the public flag surface; no
  HTML/JSON report is meaningful for it").
- Nothing REJECTS a user typing `tk inspect --static-only` directly —
  internal means undocumented, not unreachable.

Answer: conforms to the repo's (informal) convention: internal flags are
undocumented-but-parseable, marked by code comment, absent from help and
docs. There is no formal internal-flag registry or rejection mechanism;
a user who discovers the flag can use it, which matches how the repo
treats other internal seams.

Confidence: **confirmed**.

### Q5 — what actually eliminates the doubled cost

Queries executed:

```
grep -n -B3 -A8 "static-only|staticOnly" src/context/optimizeCli.ts src/context/applySafe.ts
grep -n 'test(' tests/unit/context/optimizeStaticScope.test.ts  (:168)
```

Evidence (cited):

- Both trigger sites still fire PER SCOPE (`optimizeCli.ts:115-118`,
  `applySafe.ts:218-220`: `--user` or `--project` argv per call) — there
  is NO cross-scope dedup added.
- The doubled cost is eliminated by REMOVAL, not dedup: the expensive
  component (multi-minute transcript scan + habits) no longer runs in
  either scoped call; what remains per scope is the static-context
  analyzer, which is scope-specific by nature (different surface sets).
- Test :168 "no double cold-scan across user + project for the
  static-only need" asserts the scan/habits spies stay uncalled across
  both scopes.
- Side-delivery confirmed in the same hunks: `--text` added to both
  triggers so `--apply` can no longer pop an HTML report
  (applySafe.ts:213-214).

Answer: the mechanism is elimination — the transcript scan is simply no
longer part of either scope's trigger, so "doubled" becomes "zero";
per-scope static analysis still runs twice but that is the cheap,
scope-legitimate part. It is tested (:168), and nothing further needs to
ship for the git-repo user described in the body to stop paying the
176s×2.

Confidence: **confirmed**.
