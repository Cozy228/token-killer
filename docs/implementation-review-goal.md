# Review goal: full implementation audit of Token Killer (`tk`)

You are doing a **whole-codebase implementation review** of Token Killer. The point is not
correctness-by-tests (the suite is large and mostly green) — it is to find **where the
implementation is unreasonable, slower than it needs to be, algorithmically clumsy, or has
taken a detour** to reach a result it could reach more directly. Output is a single Markdown
report (see [§6 Deliverable](#6-deliverable)).

This is an *audit*, not a refactor. **Do not edit source.** Read, reason, verify a claim by
running it if cheap, and write findings. Every finding must point at a real file/line and
explain the better path concretely enough that someone could act on it without re-deriving
your analysis.

## 0. What the system is (so you judge against intent, not against your guess)

`tk` is a local GitHub Copilot cost-control companion. Three surfaces, one shared core. Read
`CONTEXT.md` first for canonical vocabulary, then `docs/DESIGN.md` and `docs/PRINCIPLES.md`
for intent. Key principle to hold throughout: **token reduction is the product**, but **fail-open
correctness and zero added latency on the hot path** are non-negotiable. A "clever" optimization
that risks dropping a real command's output, or that adds startup cost to every `tk <cmd>`
invocation, is a regression even if it saves tokens.

The three surfaces:

- **Command proxy** — `tk <command>` runs a real tool and compresses its stdout/stderr.
  Hot path. Entry: `src/cli.ts` → `src/router.ts` / `src/parse.ts` → `src/handlers/**` →
  `src/executor.ts`. Shared machinery in `src/core/**`.
- **Hook runtime** — `tk hook copilot`, the Layer 2 surface inside Copilot's tool-call loop.
  `src/hook/**`. Rewrites commands, governs direct tool events, emits recovery hints.
- **Inspect / context optimizer** — `tk inspect` (read-only session/static-context scanner)
  and `tk optimize` (the consumer that applies advice). `src/inspect/**`, `src/context/**`.
- **Shim delivery** — PATH-shim fallback so `tk <tool>` intercepts where Copilot hooks never
  fire. `src/shim/**`.

## 1. Module map and rough size (your review surface)

```
src/cli.ts, parse.ts, router.ts, executor.ts, types.ts   entry + dispatch
src/core/**        ~ shared: history, savings, stats, pipeline, text, outputLimit, rawStore, report
src/handlers/**    ~9.6k LOC  the bulk — per-tool compressors (git, js, python, java, cloud, system, …)
src/hook/**        ~1.1k LOC  copilot hook runtime: normalize, rewrite, govern, prompt, error, install
src/inspect/**     ~1.4k LOC  unified read-only scanner + report/persist/telemetry/advice
src/context/**     ~2.6k LOC  static-context analyzers + rules/** + optimize consumer
src/shim/**        ~1.0k LOC  PATH shim: path/gate/interactive/detect/install/init/probe
```

`src/handlers/**` is ~58% of the source — **budget your attention there**, but do not skip the
core. A single inefficiency in `src/core/**` or `src/cli.ts` is multiplied across every handler.

## 2. The five questions this review answers

For every module, ask in this order. A finding belongs to exactly one primary bucket; tag it.

1. **[UNREASONABLE]** — Is anything *obviously wrong as a design choice* (not a bug, a
   judgment): wrong data structure for the access pattern, state that shouldn't be shared,
   an abstraction that fights its single use, a config knob nobody needs, error handling that
   swallows what it should surface (or surfaces what it should swallow), a default that
   contradicts the stated intent in CONTEXT.md / ADRs?

2. **[PERF]** — Is anything slower than it needs to be on a path that matters? Specifically on
   the **command-proxy hot path** (every `tk <cmd>` pays module-load + parse + route + run +
   compress): synchronous I/O that blocks, work done eagerly that's rarely used, re-reading
   files, spawning subprocesses where a library call would do, regex compiled per-call instead
   of once, buffering an entire large output when streaming would do. Distinguish hot path
   (per-invocation) from cold path (inspect/optimize, run occasionally) — a 50ms cost is fatal
   on the former, irrelevant on the latter. **State which path each PERF finding is on.**

3. **[ALGO]** — Is there a quadratic (or worse) loop over command output, lines, or files? A
   repeated linear scan that should be a map/set lookup? Sorting when a single pass suffices?
   Building a structure just to throw most of it away? String concatenation in a loop where a
   single join would do? Handlers process untrusted, possibly huge tool output — **O(n²) over
   output lines is a real latency bug, not a theoretical one.**

4. **[DETOUR]** — Did the implementation take the long way around? Parse → stringify → re-parse.
   Shell out to a CLI to get data already available structurally. Convert through an intermediate
   format for no reason. Re-implement something `src/core/**` already provides (look hard for this
   across `src/handlers/**` — 90+ handlers invite duplication). Two code paths that should be one.
   A flag threaded through five functions that one call site could set.

5. **[CORRECTNESS-RISK]** — Only flag here if it intersects the above: an "optimization" or
   shortcut that can drop real output, break fail-open, mis-handle empty/huge/binary/non-UTF8
   input, or race on shared state (e.g. the history/stats files written from concurrent `tk`
   processes). Pure functional bugs unrelated to perf/structure are **out of scope** — note them
   in a one-line appendix, don't analyze them.

## 3. Cross-cutting things worth a dedicated pass

These tend to hide systemic issues no single-file read reveals:

- **Handler duplication vs. `src/core` + `src/handlers/common/**`.** `common/{diff,grepFilter,
  listLike,readLike,searchLike}.ts` exist to be shared. Grep for hand-rolled line-splitting,
  truncation, ANSI stripping, and "head N / tail N" logic reimplemented inside individual
  handlers instead of calling the shared helper. Each instance is a [DETOUR] + maintenance hazard.
- **The compression pipeline** (`src/core/pipeline.ts`, `outputLimit.ts`, `text.ts`). Is output
  buffered whole, split, re-joined, re-measured multiple times? Count how many times a single
  command's output is fully traversed end to end — if it's >2–3, that's [PERF]/[ALGO].
- **Startup cost on the hot path.** What does `src/cli.ts` import eagerly? If requiring the CLI
  pulls in all 90 handlers, all inspect analyzers, and all context rules just to run `tk git
  status`, that's per-invocation [PERF]. Check for lazy/dynamic import opportunities at the
  dispatch boundary.
- **Regex and pattern reuse** (`src/core/patterns.ts`, per-handler regexes). Compiled once at
  module load, or rebuilt per call inside a loop? `new RegExp(...)` inside a per-line loop is the
  classic [ALGO] smell here.
- **Repeated filesystem reads** in inspect/context (`src/inspect/sources.ts`,
  `src/context/discover.ts`). Are the same files stat'd/read more than once per run? Is work
  cached across analyzers, or does each analyzer re-scan from scratch (the "parallel scan" the
  unified-inspect decision explicitly rejected — verify the code honors it)?
- **Shared-state writes** (`src/core/history.ts`, `stats.ts`, `savings.ts`, `rawStore.ts`).
  Concurrent `tk` invocations write these. Read-modify-write without atomicity is a
  [CORRECTNESS-RISK]; re-serializing the whole file on every append is [PERF]/[ALGO].
- **Detect/probe/gate logic** (`src/shim/**`, `src/hook/normalize.ts`). These run before useful
  work. Anything expensive (spawning processes, scanning PATH repeatedly) here is hot-path [PERF].

## 4. How to work (method, not vibes)

1. Start top-down: `cli.ts` → `router.ts`/`parse.ts` → `executor.ts` → `core/pipeline.ts`. Build
   the mental model of the hot path *before* diving into handlers, so you can judge handler cost
   against the path they sit on.
2. Then sweep `src/handlers/**` by family (git, js, python, …). Within a family, read 2–3 handlers
   closely, then scan the rest for the **same patterns** — duplication and copy-paste detours
   cluster by family.
3. For each candidate finding, **decide if it's real**: would the better path actually be faster /
   simpler / more correct, or are you pattern-matching? If you can cheaply prove a perf claim
   (e.g. count passes, eyeball an O(n²) loop, time a cold `node -e require(...)` import), do it and
   put the evidence in the finding. **Unverified hunches go in a separate "Suspected" section at
   lower confidence — do not inflate them into confirmed findings.**
4. Resist scope creep into pure style. "I'd name this differently" is not a finding. "This rebuilds
   a 200-entry regex on every output line" is.
5. Calibrate to the path. Re-read the hot-path vs. cold-path distinction (§2.2) before every PERF
   finding and state which one applies. Cold-path micro-opts are usually not worth reporting.

## 5. Severity and confidence

Tag every finding:

- **Severity** — `high` (hot-path latency users feel, correctness risk, or duplication across
  many call sites) / `medium` (clear improvement, bounded blast radius) / `low` (real but minor;
  list briefly, don't belabor).
- **Confidence** — `confirmed` (you traced it / measured it) / `suspected` (plausible from
  reading, not verified). Suspected-high is allowed but must say what would confirm it.

Rank the report by severity × confidence. The reader should be able to read the top 10 findings
and capture 80% of the value.

## 6. Deliverable

Write one Markdown file: **`docs/reports/implementation-review-<YYYY-MM-DD>.md`**. Structure:

```markdown
# Implementation review — Token Killer (<date>)

## Summary
- One paragraph: overall health, where the problems cluster, the single highest-leverage fix.
- Counts table: findings by bucket (UNREASONABLE / PERF / ALGO / DETOUR / CORRECTNESS-RISK)
  × severity.

## Top findings (ranked)
For each, in descending severity × confidence:

### N. <one-line title>  `[BUCKET]` severity:<…> confidence:<…>
- **Where:** `src/path/file.ts:LINE` (+ other call sites if systemic)
- **What:** what the code does today, concretely.
- **Why it's a problem:** the cost — which path, what magnitude, what blast radius.
- **Better path:** the concrete change. Name the function/structure/helper to use.
- **Evidence:** trace, pass-count, measurement, or "suspected — would confirm by <…>".

## By module
Short subsection per top-level module (core, handlers, hook, inspect, context, shim) —
"clean" is a valid finding; say so explicitly so the reader knows it was reviewed, not skipped.

## Suspected (lower confidence)
Hunches worth a look but not traced.

## Out of scope (appendix)
One line each: pure functional bugs noticed in passing, anything deferred.
```

## 7. Done means

- Every top-level module in §1 has been read and appears in "By module" (clean or not).
- `src/handlers/**` has been swept by family for the duplication/detour patterns in §3, not just
  spot-read.
- The hot path (cli → router → executor → pipeline) has an explicit pass-count / startup-cost
  verdict.
- Every confirmed finding cites a file/line and a concrete better path.
- The report is ranked, and the top of it is genuinely the highest-leverage work.
