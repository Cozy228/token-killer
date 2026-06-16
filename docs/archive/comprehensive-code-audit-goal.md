# Audit goal: comprehensive, deep, read-only code audit of Token Killer (`tk`)

You are doing a **whole-codebase audit** of Token Killer. The mandate is broader than a
performance review: find **anything worth changing** across eight dimensions — design
soundness, performance, algorithmic cost, implementation detours, correctness/fail-open,
test quality, security/input-robustness, and hygiene/docs-drift. Output is a single ranked
Markdown report (see [§6 Deliverable](#6-deliverable)).

This is the **single, consolidated audit goal**. It merges the earlier perf/structure review
(which covered only PERF / ALGO / DETOUR / UNREASONABLE / CORRECTNESS-RISK) into one entry and
adds four more dimensions. There is no separate review goal — run this one.

> **This is an audit, not a refactor. Do NOT edit source, tests, docs, or config.** Read,
> reason, and verify a claim by running it only if cheap and read-only (run tests, `node -e`
> an import, `grep`, `tsc --noEmit`). Every finding must point at a real `file:line` and
> describe the better path concretely enough that someone could act on it without
> re-deriving your analysis.

## 0. What the system is (judge against intent, not your guess)

`tk` is a local GitHub Copilot cost-control companion: a **command proxy** that runs a real
tool and compresses its output, a **hook runtime** inside Copilot's tool-call loop, and a
**read-only inspect / context optimizer**, plus a **PATH-shim** delivery fallback. Read
`CONTEXT.md` for canonical vocabulary, then `docs/DESIGN.md` and `docs/PRINCIPLES.md` for
intent. Hold these product invariants throughout — they decide whether something is a bug:

- **Token reduction is the product, but retention is the gate.** `PRINCIPLES.md`: P0
  retention pass rate must be 100% before maximizing savings. Dropping a real command's
  actionable evidence (error detail, path, line number, diff hunk, failing assertion, match
  line, SQL row, stderr semantics) is a *regression even if it saves tokens*.
- **Fail-open correctness is non-negotiable.** When compression is uncertain, return raw.
  The Safe Compression Gate is the moat vs. RTK; anything that defeats it is `high` severity.
- **No fake-complete output.** `+N more` / `truncated` / `omitted` / "partial results" are
  banned — they hand the agent hallucinated context. Flag any handler that emits them.
- **Zero added latency on the hot path.** Every `tk <cmd>` invocation pays module-load +
  parse + route + run + compress. A "clever" optimization that adds startup cost to that
  path is a regression even if it saves tokens elsewhere.
- **Inspect privacy promise:** inspect records labels + lengths only, never content
  (memory: `inspect-unified`, `context-optimizer-scope-model`). Any leak of raw content is
  `high` severity security.

## 1. Module map and rough size (your audit surface)

```
src/cli.ts, parse.ts, router.ts, executor.ts, types.ts   entry + dispatch (hot path)
src/core/**        shared: history, savings, stats, pipeline, text, outputLimit, rawStore,
                   report, patterns — one inefficiency here multiplies across every handler
src/handlers/**    ~9.6k LOC, ~58% of source — git, js, python, java, cloud, system, dotnet,
                   iac, and common/{diff,grepFilter,listLike,readLike,searchLike,level}.ts
src/hook/**        ~1.1k LOC  copilot hook runtime: normalize, rewrite, govern, prompt, error, install
src/inspect/**     ~1.4k LOC  unified read-only scanner + report/persist/telemetry/advice
src/context/**     ~2.6k LOC  static-context analyzers + rules/** + optimize consumer
src/shim/**        ~1.0k LOC  PATH shim: path/gate/interactive/detect/install/init/probe
src/telemetry/**   metrics ledgers (four-ledger arch; never-sum — see memory metrics-ledger)
tests/**           product (vitest.config.ts) + migration (vitest.migration.config.ts) tracks
```

`src/handlers/**` is the bulk — **budget your attention there**, sweep by family — but do
not skip the core or the hot path.

## 2. The eight dimensions this audit answers

For each module, ask in this order. A finding gets exactly one **primary** bucket; tag it.

**Perf/structure buckets (merged in from the earlier review goal):**

1. **[UNREASONABLE]** — Obviously wrong as a *design choice* (not a bug): wrong data
   structure for the access pattern, shared state that shouldn't be, an abstraction fighting
   its single use, a config knob nobody needs, error handling that swallows what it should
   surface (or vice-versa), a default that contradicts CONTEXT.md / an ADR.
2. **[PERF]** — Slower than it needs to be on a path that matters. **State the path.** Hot
   path (per `tk <cmd>`): synchronous blocking I/O, eager work rarely used, re-reading files,
   spawning a subprocess where a library call would do, regex rebuilt per call, buffering a
   whole large output where streaming would do. Cold path (inspect/optimize, occasional):
   a 50ms cost is fatal on the former, irrelevant on the latter.
3. **[ALGO]** — Quadratic-or-worse over command output / lines / files; a repeated linear
   scan that should be a map/set lookup; sort where one pass suffices; build-then-discard;
   string concat in a loop where one `join` would do. Handlers process possibly-huge
   untrusted output — **O(n²) over output lines is a real latency bug.**
4. **[DETOUR]** — The long way around: parse → stringify → re-parse; shell out for data
   already available structurally; convert through a needless intermediate format;
   re-implement what `src/core/**` or `src/handlers/common/**` already provides (90+ handlers
   invite this — hunt hard); two code paths that should be one.

**New dimensions (the reason this goal exists):**

5. **[CORRECTNESS-FAILOPEN]** — Does the compression preserve actionable evidence, and does
   fail-open actually hold? Trace: empty / huge / binary / non-UTF-8 / ANSI-heavy / interleaved
   stdout+stderr input. Does the Safe Compression Gate trip when it should, and return raw
   when uncertain? Any path that can silently drop a failing test, a diff hunk, a match line,
   or a stderr error detail is `high`. Any `+N more` / `truncated` / `omitted` banner is a
   product-invariant violation (§0). Concurrent `tk` processes writing `history.ts` /
   `stats.ts` / `savings.ts` / `rawStore.ts` without atomicity → race (read-modify-write,
   torn writes). Verify the four-ledger **never-sum** rule holds (executed-rewrite physical
   exclusion — memory `metrics-ledger-implemented`).
6. **[TESTING]** — Are the tests honest, and where are the gaps? This repo has a documented
   **false-green history** (memory `test-gate-honesty-fixes`): a gate that passed while debt
   accumulated. Look for: assertions that can't fail (snapshot-only, `expect(x).toBeDefined`
   on always-defined, try/catch that swallows), `|| true` masking real failures (see
   `test:migration:report` in package.json — verify the real gate `test:ci` is not similarly
   defanged), retention-P0 having **no enforcing test**, handler families or branches with no
   test at all, and the product-vs-migration vitest split letting a regression slip the gate
   that should catch it. Coverage gaps are findings — name the untested handler/family/branch.
7. **[SECURITY]** — `tk` runs real tools, rewrites commands (`hook/rewrite.ts`), and edits
   `PATH` (`shim/**`). Audit: command injection / argument-smuggling in rewrite & executor,
   `PATH` poisoning or shim resolving the wrong binary (`shim/path.ts`, `detect.ts`), ReDoS in
   per-handler / `core/patterns.ts` regex run over untrusted output, path traversal in inspect
   /context file reads, and — critically — **does inspect honor the labels-and-lengths-only
   privacy promise (§0), or can raw content leak into a ledger / report / telemetry export?**
8. **[HYGIENE-DOCS]** — `any` proliferation and `tsc --noEmit` (strict) gaps; dead code
   (unused exports, unreachable branches, orphaned helpers); dependency minimalism (runtime
   dep is `strip-ansi` only — flag any hand-rolled wheel that a stdlib/existing helper covers,
   and any creeping dep); `engines: node>=20` assumptions. **Docs drift:** does CONTEXT.md /
   DESIGN.md / PRINCIPLES.md still match the code, and does any code **violate a decision in
   `docs/adr/**`**? CLI ergonomics for the agent consumer: are error messages / exit codes /
   `--help` actually usable by Copilot (the real reader), per PRINCIPLES.md?

## 3. Cross-cutting passes (systemic issues no single-file read reveals)

- **Handler duplication vs. `core` + `handlers/common/**`.** Grep for hand-rolled
  line-splitting, truncation, ANSI stripping, head-N/tail-N reimplemented inside individual
  handlers instead of `common/{diff,grepFilter,listLike,readLike,searchLike}.ts` or
  `common/level.ts`. Each instance is `[DETOUR]` + a maintenance/correctness hazard (the
  reimplementation may not honor the retention gate).
- **The compression pipeline** (`core/pipeline.ts`, `outputLimit.ts`, `text.ts`). Count how
  many times a single command's output is fully traversed end-to-end. >2–3 is `[PERF]`/`[ALGO]`.
  Simultaneously check the gate is *inside* this pipeline, not bypassable by a handler.
- **Startup cost on the hot path.** What does `cli.ts` import eagerly? If `tk git status`
  pulls in all 90 handlers + all inspect analyzers + all context rules, that's per-invocation
  `[PERF]` — check for a lazy/dynamic-import boundary at dispatch.
- **Regex reuse** (`core/patterns.ts`, per-handler regexes). Compiled once at module load, or
  rebuilt per call/per line? `new RegExp(...)` in a per-line loop is `[ALGO]`; an unbounded
  backtracking pattern over untrusted output is `[SECURITY]` (ReDoS) — flag both.
- **Repeated filesystem reads** in inspect/context (`inspect/sources.ts`,
  `context/discover.ts`). Same file stat'd/read more than once per run? The unified-inspect
  decision explicitly rejected a parallel re-scan (memory `inspect-unified`) — verify the code
  honors it (one scan feeding all analyzers, not N analyzers each re-reading).
- **Shared-state writes** (`core/history.ts`, `stats.ts`, `savings.ts`, `rawStore.ts`,
  telemetry ledgers). Concurrent `tk` invocations write these — atomicity, torn writes, and
  re-serializing the whole file on every append (`[PERF]`/`[ALGO]`) all live here.
- **Detect/probe/gate logic** (`shim/**`, `hook/normalize.ts`) runs *before* useful work —
  anything expensive (spawning processes, re-scanning `PATH`) is hot-path `[PERF]`.
- **Test-gate honesty sweep** (cross-cuts D6). Read `package.json` scripts +
  `scripts/check-test-presence.sh`, `validate-docs.sh`, `vitest.config.ts`,
  `vitest.migration.config.ts`. Trace what `test:ci` actually enforces vs. what merely
  reports. A `|| true` or a report-only step on the real gate is a `high` `[TESTING]` finding.

## 4. How to work (method, not vibes)

1. **Top-down first.** `cli.ts` → `router.ts`/`parse.ts` → `executor.ts` → `core/pipeline.ts`.
   Build the hot-path mental model before diving into handlers, so you judge handler cost and
   gate-conformance against the path they sit on.
2. **Sweep `handlers/**` by family.** Read 2–3 in a family closely, then scan the rest for the
   *same* pattern — duplication, detours, and missing-test gaps cluster by family.
3. **Decide if each candidate is real.** Would the better path actually be faster / simpler /
   safer / more correct, or are you pattern-matching? If a claim is cheaply provable (count
   passes, eyeball an O(n²), time a cold import, run the test, `tsc --noEmit`), prove it and
   put the evidence in the finding. **Unverified hunches go in "Suspected" — do not inflate.**
4. **Calibrate to the path and the invariant.** Re-read the hot/cold split (§2.2) before every
   PERF finding; re-read the retention/fail-open invariants (§0) before every CORRECTNESS one.
   A cold-path micro-opt or a style nit is usually not worth reporting.
5. **Stay out of pure style.** "I'd name this differently" is not a finding. "This rebuilds a
   200-entry regex on every output line" / "this handler can drop a failing assertion" is.

## 5. Severity and confidence

Tag every finding:

- **Severity** — `high` (hot-path latency users feel; retention/fail-open/privacy violation;
  injection/ReDoS; false-green gate; duplication across many call sites) / `medium` (clear
  improvement, bounded blast radius) / `low` (real but minor — list briefly).
- **Confidence** — `confirmed` (traced or measured) / `suspected` (plausible from reading,
  not verified — must say what would confirm it).

Rank by severity × confidence. A reader should get 80% of the value from the top 10 findings.

## 6. Deliverable

Write one Markdown file: **`docs/reports/comprehensive-audit-<YYYY-MM-DD>.md`**. Structure:

```markdown
# Comprehensive code audit — Token Killer (<date>)

## Summary
- One paragraph: overall health, where problems cluster, the single highest-leverage fix.
- Counts table: findings by bucket (UNREASONABLE / PERF / ALGO / DETOUR /
  CORRECTNESS-FAILOPEN / TESTING / SECURITY / HYGIENE-DOCS) × severity.

## Top findings (ranked)
For each, in descending severity × confidence:

### N. <one-line title>  `[BUCKET]` severity:<…> confidence:<…>
- **Where:** `src/path/file.ts:LINE` (+ other call sites if systemic)
- **What:** what the code does today, concretely.
- **Why it's a problem:** the cost — which path / which invariant, what magnitude, what blast radius.
- **Better path:** the concrete change. Name the function/structure/helper to use.
- **Evidence:** trace, pass-count, measurement, test run, or "suspected — would confirm by <…>".

## By module
Short subsection per top-level module (core, handlers, hook, inspect, context, shim,
telemetry) — "clean" is a valid finding; say so explicitly so the reader knows it was
reviewed, not skipped.

## By dimension
One line per dimension noting whether it surfaced anything — especially the four new ones
(CORRECTNESS-FAILOPEN / TESTING / SECURITY / HYGIENE-DOCS), so none is silently skipped.

## Suspected (lower confidence)
Hunches worth a look but not traced.

## Out of scope (appendix)
One line each: anything noticed but deferred, with why.
```

## 7. Done means

- Every top-level module in §1 has been read and appears in "By module" (clean or not).
- All **eight** dimensions in §2 appear in "By dimension" — none silently skipped.
- `src/handlers/**` was swept by family for duplication/detour/missing-test patterns, not spot-read.
- The hot path (cli → router → executor → pipeline) has an explicit startup-cost / pass-count verdict.
- The retention-P0 and fail-open invariants have an explicit "is there an enforcing test?" verdict.
- The test gate (`test:ci`) has an explicit "enforces vs. merely reports" verdict.
- Every confirmed finding cites a `file:line` and a concrete better path; the report is ranked,
  and the top of it is genuinely the highest-leverage work.
```
