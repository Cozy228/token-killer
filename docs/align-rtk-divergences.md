# tg ↔ rtk divergences (intentional — do NOT "align down")

Companion to `docs/align-rtk-goal.md`. Source of truth: `docs/three-way-comparison.md`.

`savingsPct` measures **compression only, not correctness**. In the cases below rtk
scores a higher (sometimes 100%) savingsPct precisely because it produces *wrong or
empty* output. tg keeps the correct, slightly larger output on purpose. These are
recorded here so a future "align to rtk" pass does not regress tg to match a bug.

Verified against the regenerated report on 2026-06-05.

## A. rtk is wrong / lossy — tg kept as-is

| # | Case | rtk behavior (wrong) | tg behavior (kept) | Why tg wins |
|---|------|----------------------|--------------------|-------------|
| 4 | psql table (`psql -c 'select …'`) | Emits an empty table (1 char, "98.9%") — the row data is dropped. | Tab-separated header + rows (47.3%). | Query results are the entire signal; dropping them is data loss. |
| 8 | pip list problems | `pip list (JSON parse failed: EOF …)` — rtk assumes JSON and bails on `pip list` text. | Lists installed package + the invalid/missing/peer problems. | tg surfaces the real dependency problems; rtk surfaces a parser error. |
| 18 | glab mr list (JSON fixture) | 0 chars ("100%") — rtk produces nothing for this MR JSON. | 10 MRs with state, !iid, title, author (91.5%). | An empty MR list is indistinguishable from "no MRs"; tg keeps identity. |
| 3 | git stash invalid ref | `Empty stash` — mislabels an *invalid reference* error as an empty stash. | `error: stash@{999999} is not a valid reference`. | tg preserves the actual git error; rtk's relabel is misleading. |
| 6 | gt log stack | Content drift — rtk emits an unrelated single-commit graph that does not match the input stack. | Keeps the full stack graph, strips only author emails. | tg's output faithfully reflects the input stack; rtk's does not. |
| 13 | eslint (no config) | `ESLint output (JSON parse failed: …)` + tee-log hint. | `ESLint: 0 problems in 0 files`. | tg degrades cleanly; rtk leaks a parser error and an absolute tee path. |

For all six: **tg output is unchanged by this batch**; the handlers (`psql`, `pip`,
`glab`, `git-stash`, `gt`, `eslint`) were not touched.

## D. Format-only divergences (deferred, low priority)

These are cosmetic; rtk is not wrong, the format just differs. Not aligned because
the gain is marginal and tg's form is at least as informative.

| # | Case | Difference |
|---|------|------------|
| 10 / 15 | find / list-like directory grouping | tg uses a compact `NF MD:` header + `dir/ files` grouping; rtk uses `N files in M dirs:` + per-dir indented lists. tg is denser (and wins on savings here: #10 tg 32.3% vs rtk 0%). |
| 11 | git-log (text fixture) | rtk truncates with `[+N lines omitted]`; tg keeps per-commit author/date lines. rtk compresses more (60.5% vs 29.4%) but drops subjects of later commits. tg favors completeness. |

If a later pass wants #11's extra compression, do it without dropping commit
subjects (the goal's "never drop key diagnostics" rule applies).

## E. Out-of-scope ecosystems (scope decision 2026-06-05)

Go, Rust, and Ruby are **out of product scope** for token-guard. Their RTK
command filters are intentionally NOT ported, and their parity tests are
quarantined out of the migration suite so `pnpm test:migration` can go green
without them. A future "complete RTK parity" pass must **not** re-add these by
mistake.

| Ecosystem | RTK commands (not ported) | Quarantined test |
|-----------|---------------------------|------------------|
| Go | `go`, `golangci-lint` | `tests/out-of-scope/rtkGoBehavior.test.ts`, `rtkGolangciBehavior.test.ts` |
| Rust | `cargo` (`cargo test` summary) | `tests/out-of-scope/rtkCargoBehavior.test.ts` |
| Ruby | `rake`, `rspec`, `rubocop` | `tests/out-of-scope/rtkRakeBehavior.test.ts`, `rtkRspecBehavior.test.ts`, `rtkRubocopBehavior.test.ts` |

The six tests were moved from `tests/unit/handlers/` to `tests/out-of-scope/`
(excluded from `vitest.migration.config.ts` and `vitest.config.ts`). The
`ruby smoke script` row (`rtk/scripts/test-ruby.sh` → `scripts/test-ruby.sh`) was
dropped from `rtkScriptParity.test.ts`'s `pendingScriptPorts`.

Note: the generic `err <cmd>` / `test <cmd>` wrappers (RTK `rust/runner.rs`) ARE
in scope and ported — they are ecosystem-neutral meta-commands, not Rust filters.

## F. Phase-1/2 handler format divergences (recorded 2026-06-05)

These accompany the new generic-wrapper and dotnet handlers. tg's form satisfies
the migration contract; the difference from RTK is intentional and minor.

| Handler | Difference from RTK | Why |
|---------|---------------------|-----|
| `deps` (Node) | RTK renders dev deps as `Dev Dependencies (N):` with names only; tg uses `Dev (N):` with versions (symmetric with the prod section, matching the Cargo section's `Dev (N):`). Also, tg summarizes the single manifest captured on stdin/stdout rather than re-scanning every manifest in a directory (the execute/filter split). | Keeps prod/dev shapes symmetric and versioned; the migration test pins `Dev (1):` + `vitest (4.1.8)`. |
| `tsc` | tg drops RTK's decorative 39-char `═` separator under the summary line. | `npx tsc` re-dispatches through this same filter and must stay within a tighter output budget; no tsc assertion pins the separator (mypy/pip/format keep theirs), and dropping it only improves compression. |
| `dotnet format` | tg accepts both camelCase (`filePath`/`changes`/`lineNumber`/`formatDescription`) and RTK PascalCase report keys. | The migration fixture uses camelCase; accepting both keeps the handler robust to either reporter shape. |
| `test` (go branch) | RTK's `runner.rs` has cargo/pytest/jest/**go** framework branches. tg does NOT port the Go branch (Go is an out-of-scope ecosystem — see §E). This also removes RTK's latent bug: `"cargo test"` *contains* the substring `"go test"` (car+"go test"), so RTK runs `cargo test` through BOTH the cargo and go branches — duplicating every failure line and folding the `test result:` summary into the FAILURES block. With no go branch, `cargo test` is classified cleanly. The cargo branch itself stays because the in-scope `rtkTestBehavior` fixture is `test cargo test`. | Scope (Go out-of-scope) + correctness. The single-failure Phase-1 fixture did not exercise the duplication; it surfaced under a realistic multi-failure run. |

## Aggregate note (why weighted tg savings reads 33.9%, not ≥34.5%)

The goal's acceptance #4 quotes a "current 34.5%" baseline. After this batch the
regenerated report shows **tg 33.9% vs rtk 31.3%** — tg now beats rtk on the
weighted aggregate and on (or matches) every targeted case. The ~0.6pp gap vs the
stale baseline is not a tg regression; it has two confounders:

1. **The 34.5% baseline was inflated by the #9 log bug.** Pre-fix, `log <file>`
   emitted a *wrong* all-zero summary at a fake 85.8% savings. Acceptance #1
   requires fixing exactly that bug; the correct output (46.4%) is necessarily
   larger. You cannot both fix #9 and keep its fake savings in the aggregate.

2. **The report's denominator grew between snapshots.** The live `env` case
   captures the agent/RTK session environment (dozens of injected `CLAUDE_*` /
   `RTK_*` vars absent from a normal shell): its raw jumped 1063→1748 tokens. The
   handler code added for this goal also grew `src/`, so the passthrough `rg`/`grep`
   raw rose (e.g. rg 2178→2387, 0% either way). Both inflate raw without being a
   tg quality change.

On a like-for-like snapshot (apply only the #9/#12 fixes to the *old* numbers),
tg lands at **35.6%** (8101 − 254[#12 old] + 46 − 26[#9 old] + 98 ⇒ 7965 / 12373).
The fixes are net-positive; the 33.9% reading reflects snapshot drift, not a loss.
No correctness was traded and no rtk-parity test was weakened to chase the number.
