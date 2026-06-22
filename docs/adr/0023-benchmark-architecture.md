# Benchmark architecture

**Status:** accepted (grilling 2026-06-21 D11 / Q10; absorbs the former ADR 0026 and the human-study part
of the former ADR 0025). This is the substantive core of Need K.

Reuse two validated reference harnesses; do not invent a benchmark hierarchy. Each harness makes one
falsifiable claim, so neither is overloaded.

## Decision

**1. Agent end-to-end — GitNexus-style SWE-bench harness.** Three arms: `baseline` (standard
search/read), `tk-native` (+ tk query tools), `tk-projection` (query/search results carry tk projection).
Use SWE-bench official FAIL_TO_PASS / PASS_TO_PASS for resolve rate; alongside it record whole-task
uncached input tokens, cost, and tool/API calls. It proves whether the agent more easily completes real
fix tasks and whether tokens drop. **SWE-bench's Python skew is disclosed in the report and may not be
used to claim TS/JS end-to-end gains.**

**2. Backend capability — Codebase-Memory-style multi-repo question suite.** Real OSS repos per language
(TS/TSX/JS, Python, Go), fixed mechanically-verifiable questions scored PASS / PARTIAL / FAIL, extended
to tk's surface: symbol location, callers/callees, flow, impact, Domain candidates, Evidence
arbitration. It proves whether Code/Behavior/Domain/Evidence are correct on the declared languages —
**not merged** with SWE-bench into one number.

**3. tk self-repo = regression only.** CI regression, feature checks, fast ablation — never a primary
external benchmark.

**4. Human Inspector (codeguide).** No tiered branding. Two things only: automatic **regression tasks**
(guard against navigation/query rot, make no human-understanding claim); and a small-scale **blind human
study** (reviewer is not the author and does not know the arm) comparing baseline vs the Human Inspector
on `hit@1`, time-to-file, and answer correctness. Always report `N`, repos, and tasks; never output a
generalized "comprehension +X%".

## Consequences

- Each claim is narrow and falsifiable; the language-skew problem is handled by disclosure + the
  per-language suite, not by overloading SWE-bench.
- Reuses validated patterns instead of new machinery — less to build, more credible.
- Two harnesses to maintain (SWE-bench env is heavy; the question suite needs curated repos).
