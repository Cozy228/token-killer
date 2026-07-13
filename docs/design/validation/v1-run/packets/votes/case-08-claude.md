---
case: 8
voter: claude
date: 2026-07-12
---

# Case 8 (token-killer#51) — claude vote

Pinned reads against detached worktree at `af88664b18f1abbb71fc67e62191bac6b4f0d77e`
(base feat/0.3.1; PR head `e9cadf51`). GitHub API records filtered to
created_at <= 2026-06-17T17:38:12Z.

## Q1 — undefined result/habits: is "already handled" true?

**Score: correct (1.0)**

I independently traced every consumer of a possibly-undefined scan `result` in the
static-only branch of `runInspect`. Report rendering passes `result ?? emptyScanResult(opts.inputType)`
into `buildReport` (`src/inspect/cli.ts:369`), so it renders against an explicit empty
result. Local telemetry export is guarded `if (telemetryExport && result)`
(`src/inspect/cli.ts:406`) and cold-path telemetry passes `result ? buildInspectAggregates(...) : undefined`
(`src/inspect/cli.ts:477`), i.e. it short-circuits to undefined. Exit-code logic is
severity-driven: `--fail-on` tests `unifiedFindings.some((f) => SEVERITY_RANK[f.severity] >= threshold)`
(`src/inspect/cli.ts:485-487`), never dereferencing `result`; the exit-2 path uses
`runtimeEmpty = !result || result.tool_event_count === 0` (`src/inspect/cli.ts:317`). The
fourth named consumer, scope-bucket persistence, receives `runtimeFindings: rtFindings`
where `rtFindings = runtimeFindings(result, habits, mcp)` and `runtimeFindings` returns `[]`
when scan is undefined (`src/inspect/unified.ts:120-125`), so `persistScopeBuckets`
(`src/inspect/cli.ts:344`) is also safe. `buildAdvice` is guarded `if (result)`
(`src/inspect/cli.ts:334`). The operator's blanket claim — "No path at cutoff dereferences
a missing scan result" — is true for all four consumers.

## Q2 — where the optimize↔inspect contract is recorded

**Score: partial (2/3)**

Sub-claims (material):
1. The "optimize consumes only static_context findings" contract is recorded at code level,
   not in an ADR. **Backed** — `src/context/optimizeCli.ts:210-211` filters the bucket to
   `(f) => f.source === "static_context"`; the module header comment (`optimizeCli.ts:3`)
   states "filters to source = static_context". No ADR states an "only static" rule.
2. ADR 0003 supplies the static-analyzer precedent and ADR 0006 the apply engine, but neither
   states the static-findings-only contract explicitly. **Backed** — ADR 0003 calls
   `tk optimize context` merely "the downstream consumer that reads the persisted report"
   (`docs/adr/0003-inspect-default-full-static-context.md:27-28`); no ADR text asserts static-only.
3. "The PR matches the recorded contract and changes computation, not consumption" (does NOT
   quietly narrow). **Not backed / incorrect** — ADR 0003 Consequences explicitly records the
   trigger contract: "When a bucket is absent it triggers a **full inspect** for that scope
   (`tk inspect --project` or `--user`)" (`docs/adr/0003-inspect-default-full-static-context.md:104`).
   This PR narrows exactly that behavior to `--static-only` (`optimizeCli.ts:117-118`,
   `applySafe.ts:219-220`) without amending ADR 0003 (grep of `docs/adr/` finds no `--static-only`).
   The question's crux ("match … or quietly narrow it?") is answered wrong: the PR does quietly
   narrow the ADR-recorded full-inspect trigger. The narrowing is benign because optimize
   already consumes only static findings, so I score partial rather than false-reassurance.

## Q3 — CI truth + acceptance coverage

**Score: correct (1.0)**

Acceptance coverage: `tests/unit/context/optimizeStaticScope.test.ts` at cutoff has five tests
covering all four checked criteria — scan/habits spies against a real seeded VS Code transcript
(`:16-37,:53-60,:94-105`), static-finding parity full-vs-scoped (`:129-166`, order-independent
key comparison), no-double-scan across user+project inside a `.git` repo (`:168-182`), and the
stderr why-message ("no prior inspect" + "tk inspect", `:184-201`). So "every checked box has a
dedicated test" holds. CI: `gh api repos/czync/token-killer/pulls/51` gives head
`e9cadf51`; `gh api .../actions/runs?head_sha=e9cadf51` returns exactly one run, conclusion
**failure**, created 17:15:14Z / completed 17:17:41Z — both < cutoff 17:38:12Z (~21 min before
merge). Its jobs show `ubuntu-latest 22` and `windows-latest 22` failing while Node 20 passes,
matching the batch Node-22-red pattern. The operator correctly labels the admissible CI record a
FAILURE and the "1752 passed" claim as author-asserted.

## Q4 — internal-flag convention conformance

**Score: correct (1.0)**

`--static-only` is absent from the `tk inspect` help block, which lists every other inspect flag
(`src/cli.ts:89-107`) but not this one — hidden from `--help`. It is undocumented: a repo-wide
grep for `static-only` across `src/ docs/` returns only code sites and issue-referenced comments
(the docs hits are ADR-archive `--copilot-context (static-only)`, an unrelated flag, and an audit
report) — no user-facing documentation. It is marked internal by comment: `src/inspect/cli.ts:60-65`
("Internal: skip the runtime scan … Not part of the public flag surface"). It is parseable and NOT
rejected: `parseInspectArgs` accepts the token (`cli.ts:115-116`) and `tk inspect` passes subArgs
straight through (`src/cli.ts:236-237`), so a user who discovers it can use it — there is no formal
registry or rejection mechanism. This matches the operator's answer exactly, including the correct
nuance that the flag is usable-but-undocumented rather than rejected.

## Q5 — what actually eliminates the doubled cost

**Score: correct (1.0)**

The mechanism is elimination, not sharing or bucket reuse: the transcript scan + habit extraction
are removed from both optimize trigger sites (`optimizeCli.ts:117-118` default preview,
`applySafe.ts:219-220` `--apply`) by requesting `--static-only`, and in `runInspect` the whole
host-discovery/scan/habits block is skipped under `if (!opts.staticOnly)` (`src/inspect/cli.ts:218-300`).
A git repo resolves to two scopes — `resolveOptimizeScopes` returns `["user","project"]` when
`isGitProject(cwd)` (`optimizeCli.ts:83`) — so the previously-doubled 176s cold scan becomes zero
scans; only the cheap per-scope static analysis runs twice. It is tested at `:168` ("no double
cold-scan across user + project", asserting `scanSpy`/`habitsSpy` never called after
`runOptimize(["--apply"])` inside a `.git` repo). Nothing further needs to ship for the git-repo
user in the body: both trigger paths are patched, and optimize re-reads the now-populated static
bucket (`optimizeCli.ts:179-188`) without re-triggering. The operator's answer is accurate.
