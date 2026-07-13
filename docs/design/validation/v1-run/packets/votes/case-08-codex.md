---
case: 8
voter: codex
date: 2026-07-12
---

## Q1 — undefined result/habits: is "already handled" true?

**Score: partial (3/4)**

The answer correctly backed three of the four required downstream-consumer sub-claims: (1) report rendering substitutes `emptyScanResult` and reports zero sessions when `result` is absent (`src/inspect/cli.ts:374-385`, `src/inspect/cli.ts:449-450`); (2) telemetry is guarded by `result` or receives `inspect: undefined` (`src/inspect/cli.ts:406-425`, `src/inspect/cli.ts:469-478`); and (3) `--fail-on` evaluates the severity of `unifiedFindings` without dereferencing the scan (`src/inspect/cli.ts:480-487`). It omitted the fourth expressly requested consumer, scope-bucket persistence: `runtimeFindings(undefined, ...)` returns an empty array and persistence safely combines that with scoped static findings (`src/inspect/unified.ts:120-126`, `src/inspect/staticContext.ts:48-76`). Thus the overall safety conclusion was true, but the answer did not account for every requested consumer.

## Q2 — where the optimize-inspect contract is recorded

**Score: correct**

Neither cited ADR explicitly states an optimize-only-static-findings contract: ADR 0003 establishes the unified persisted report and downstream optimize relationship while describing runtime analysis as orthogonal (`docs/adr/0003-inspect-default-full-static-context.md:22-28`, `docs/adr/0003-inspect-default-full-static-context.md:44-54`), and ADR 0006 governs optimize scope and apply behavior rather than this consumption boundary (`docs/adr/0006-cli-consolidation-and-optimize-apply-engine.md:46-66`). The boundary is explicit in the trigger comments and executable selection code: both trigger paths say optimize consumes only static-context findings (`src/context/optimizeCli.ts:103-123`, `src/context/applySafe.ts:200-227`), while `selectStaticFindings` filters persisted findings by `source === "static_context"` (`src/context/optimizeCli.ts:205-215`). The pinned first-parent diff command `git diff HEAD^1 HEAD -- src/context/optimizeCli.ts src/context/applySafe.ts` shows the PR changed the triggered computation to `--static-only` without changing that selector, so the answer's match-not-narrow judgment is correct.

## Q3 — CI truth and acceptance coverage

**Score: correct**

The cutoff-filtered query `gh api 'repos/czync/token-killer/actions/runs?head_sha=e9cadf517394d9bfe0a30e347884614161255012&per_page=100' --jq '[.workflow_runs[] | select(.created_at <= "2026-06-17T17:38:12Z") | {status,conclusion,created_at,updated_at,head_sha}]'` returned one completed failure run, created at `17:15:14Z` and updated at `17:17:41Z`; `gh api 'repos/czync/token-killer/actions/runs/27706722948/jobs?per_page=100' --jq '[.jobs[] | select(.started_at <= "2026-06-17T17:38:12Z") | {name,status,conclusion,started_at,completed_at,steps:[.steps[] | {name,conclusion,number}]}]'` showed `test:product` succeeded in all four matrix jobs while the Node 22 smoke steps failed. The test file meaningfully covers all four checked criteria: seeded real transcript inputs plus scan/habits spies (`tests/unit/context/optimizeStaticScope.test.ts:13-36`, `tests/unit/context/optimizeStaticScope.test.ts:51-60`), no runtime passes on apply (`tests/unit/context/optimizeStaticScope.test.ts:94-114`), full-versus-static finding parity (`tests/unit/context/optimizeStaticScope.test.ts:129-166`), zero scans across git-resolved user and project scopes (`tests/unit/context/optimizeStaticScope.test.ts:168-182`), and the stderr explanation (`tests/unit/context/optimizeStaticScope.test.ts:184-200`). The exact `1752` count was indeed an author assertion in the admissible `2026-06-17T17:15:30Z` issue comment returned by `gh api --paginate repos/czync/token-killer/issues/41/comments --jq '[.[] | select(.created_at <= "2026-06-17T17:38:12Z")]'`.

## Q4 — internal-flag convention conformance

**Score: correct**

The flag conforms to the repository's informal hidden-but-callable seam: its type comment marks it internal and outside the public flag surface (`src/inspect/cli.ts:61-66`), the inspect parser accepts it directly (`src/inspect/cli.ts:80-117`) while rejecting unrecognized tokens (`src/inspect/cli.ts:123-150`), and the public inspect help lists the supported flags without `--static-only` (`src/cli.ts:89-106`). The pinned-tree query `rg -n --glob '!docs/design/validation/v1-run/**' -- '--static-only' src docs` found only implementation references in `src/context/optimizeCli.ts`, `src/context/applySafe.ts`, and `src/inspect/cli.ts`, with no documentation hit. There is no rejection boundary once the flag reaches `parseInspectArgs`; therefore the answer correctly distinguishes hidden/undocumented from unusable.

## Q5 — what actually eliminates the doubled cost

**Score: correct**

The implementation eliminates rather than shares the heavy work: a git repository resolves to both user and project scopes (`src/context/optimizeCli.ts:75-84`), and each missing bucket still triggers its own inspect, but both preview and apply pass `--static-only --text` (`src/context/optimizeCli.ts:103-123`, `src/context/optimizeCli.ts:170-188`, `src/context/applySafe.ts:200-227`, `src/context/applySafe.ts:249-263`); `runInspect` consequently skips discovery, transcript scanning, and habit extraction while continuing static analysis (`src/inspect/cli.ts:209-218`, `src/inspect/cli.ts:293-310`). The git-repo test expressly resolves both scopes and asserts neither heavy pass ran (`tests/unit/context/optimizeStaticScope.test.ts:168-182`), while separate tests establish that static findings remain available and equivalent (`tests/unit/context/optimizeStaticScope.test.ts:94-114`, `tests/unit/context/optimizeStaticScope.test.ts:129-166`). Those changes cover both trigger sites and the inspect mechanism, so no additional code path was required to remove the described two cold runtime scans.
