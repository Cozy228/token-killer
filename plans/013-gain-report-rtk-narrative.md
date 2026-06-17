# Plan 013: `tk gain` — rtk-parity terminal output + landing-page report narrative (hero / the problem / see the difference / real-world savings)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d33546c..HEAD -- src/core/gain.ts src/core/ledger.ts src/report/html.ts src/core/rollup.ts src/core/aggregate.ts tests/unit/core/gain.test.ts tests/unit/report/html.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (cold path, read-only, fail-open; no storage or accounting changes)
- **Depends on**: none
- **Category**: product / UX
- **Planned at**: commit `d33546c`, 2026-06-16
- **Source**: user request — study `rtk-ai/rtk-ldp` (the rtk landing page) and bring its `gain` presentation into tk
- **Issue**: https://github.com/Cozy228/token-killer/issues/35

## Why this matters

`tk gain` is tk's product showcase — the surface a user looks at to decide the
tool is worth keeping (`src/report/html.ts:1-13` says so explicitly). The rtk
landing page (`rtk-ai/rtk-ldp`) tells a tight, persuasive story around the
identical `gain` command; tk's two `gain` surfaces under-sell the same data:

1. **`tk gain --text`** prints a flat key/value dump (`Token savings — this
   project` / `Commands: 2927` / `Raw: 11600000 tokens`). rtk's terminal output
   is a scannable report: a `📊` header, a rule, compact `11.6M`-style numbers,
   and an aligned `By Command:` table (Count / Saved / Avg%). Same data, far more
   legible. The user asked for rtk's output style to be copied into `tk gain`.

2. **`tk gain` HTML** (the default) shows a measured hero + a by-handler table +
   the ②③④ ledger cards, but **no narrative and no time series**. The
   `--all/--daily/--weekly/--monthly` breakdowns exist for `--text/--csv/--json`
   only — they never reach the HTML report (`emitGainHtml` in
   `src/core/ledger.ts` reads the four-ledger `Ledgers`, which carries no
   buckets). rtk's page frames the same numbers as **the problem → see the
   difference → real-world savings (daily/weekly/monthly)**, which is what makes
   it land.

### Honesty constraint (load-bearing — do not violate)

`src/report/html.ts:1-13` and the project principle "tk wraps real tools, never
fabricates" require: **measured savings lead; every estimate is labelled.** The
rtk landing page uses fixed brag numbers (89%, `$1,750/mo`, "drowning in CLI
noise"). **Do NOT port those numbers.** Port the rtk *narrative structure* but
drive every figure from the user's own rollup. The "problem" becomes "here is the
raw noise tk actually caught for you," not a generic marketing stat. Any
dollar/credit figure stays under the existing estimate framing (amber `est.`
treatment, `estimate_kind`), never summed into measured tokens.

## Reference: what rtk-ldp does (studied, not copied verbatim)

Cloned `rtk-ai/rtk-ldp` for study. Relevant pieces:

- **Hero terminal demo** (`src/components/landing/Hero.astro:95-125`) — the
  canonical rtk `gain` text style:
  ```
  📊 RTK Token Savings
  ════════════════════════════════════════
  Total commands:    2,927
  Input tokens:      11.6M
  Output tokens:     1.4M
  Tokens saved:      10.3M (89.2%)

  By Command:
  ────────────────────────────────────────
  Command          Count   Saved   Avg%
  rtk find         324     6.8M    78.3%
  rtk git status   215     1.4M    80.8%
  ```
- **Problem section** (`src/components/landing/Problem.astro`) — eyebrow
  `01 — the problem`, 3 cards (Context pollution / Sessions too short / Costs that
  explode), each with a mono "terminal metric" line.
- **Proof section = "Real-world savings"** (`src/components/landing/Proof.astro`,
  copy in `src/data/translations.ts`: `proof.title = "Real-world savings"`,
  `proof.sub = "Actual rtk gain output from a happy developer."`,
  `proof.h2/d2 = "Detailed breakdown / Daily, weekly, and monthly stats by
  command."`) — this is the daily/weekly/monthly breakdown the user named.

## Current state (excerpts — verify against live code before editing)

- `src/core/gain.ts:72` — `const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";` (insertion point for
  number/table helpers).
- `src/core/gain.ts:312-335` — `renderSummary()`: the flat `Token savings — …`
  block to replace with the rtk-style header + `By Command:` table.
- `src/core/gain.ts:354-358` — `renderBuckets()`: flat `  KEY  N saved (P%, C
  cmd)` lines to restyle as an aligned table.
- `src/core/gain.ts:435-445` — existing `sparkline()` / helpers to reuse.
- `src/core/ledger.ts:294-314` — `emitGainHtml()`: builds the report `data` from
  `loadLedgers` only; **no buckets**. This is where rollup buckets get wired in.
- `src/core/rollup.ts:352-397` — `allDaysFromRollup` / `dailyBucketsFromRollup` /
  `weekBucketsFromRollup` / `monthBucketsFromRollup` already produce `TimeBucket[]`
  (`{key,commands,raw,saved,pct}`). Reuse; do not reimplement bucketing.
- `src/report/html.ts:251-342` — `renderGain(L)`: the HTML gain renderer to
  extend with the three new sections.
- `src/report/html.ts:34-184` — `STYLE` block (add card/bar/trend CSS here).

## Design

### A. `tk gain --text` — rtk terminal style (`src/core/gain.ts`)

1. Add formatting helpers near `SPARK_BLOCKS` (pure, no I/O):
   - `compact(n)` → K/M/B with one decimal, trailing `.0` trimmed; values < 1000
     stay plain (`11_600_000 → "11.6M"`, `786_700 → "786.7K"`, `999 → "999"`).
     Token **totals** use this.
   - `grp(n)` → `toLocaleString("en-US")` comma grouping. Discrete **counts**
     (commands, per-handler run counts) use this so totals vs counts never blur.
   - `fixedTable(header, rows)` → left-align col 0, right-align the rest, with a
     `─` rule under the header row (width = sum of col widths).
   - `RULE_DOUBLE = "═".repeat(48)`.

2. Rewrite `renderSummary(s, scope)`:
   ```
   📊 Token Killer — Token Savings · this project
   ════════════════════════════════════════════════

   Total commands:   2,927
   Input tokens:     11.6M
   Output tokens:    1.4M
   Tokens saved:     10.3M (89.2%)
   Avg saved/cmd:    3.5K

   By Command:
   Command       Count   Saved    Avg%
   ─────────────────────────────────────
   read-like       324    6.8M   78.3%
     e.g. rg foo src/, rg bar lib/
   git-status      215    1.4M   80.8%
   ```
   - Map: `Input tokens = raw_tokens`, `Output tokens = output_tokens`,
     `Tokens saved = saved_tokens (savings_pct%)`. (These rtk labels are the
     intended "output style"; keep them exactly.)
   - `By Command:` table via `fixedTable`, top-5 handlers (preserve existing
     top-5 slice). **Keep the per-handler `e.g.` samples** added in `d33546c` —
     render them as a dim indented continuation line under each row (outside the
     fixed-width columns so alignment holds).
   - Keep the `Quality:` block (relabel via `QUALITY_DISPLAY_LABELS` as today) as
     a short trailing section.

3. Restyle `renderBuckets()` to a `fixedTable`: `Period | Saved | Avg% |
   Commands`, compacted numbers. Title stays (`Daily savings` / `Weekly savings`
   / `Monthly savings` / `All time (per day)`).

4. **Leave `renderCsv` / `buildGainJson` / `--graph` sparkline untouched** — the
   CSV header is pinned by a test (`gain.test.ts:169`) and JSON is a consumer
   contract.

### B. `tk gain` HTML — landing-page narrative (`src/core/ledger.ts` + `src/report/html.ts`)

**B1. Wire rollup buckets into the report data (`src/core/ledger.ts`).**
In `emitGainHtml`, after `loadLedgers`, load the rollup for the same scope
(fail-open to `emptyRollup`) and attach a `timeseries` block:
```ts
// project scope → ensureProjectRollup(cwd); user scope → mergeRollups(listProjectRollups())
const timeseries = opts.scope === "runtime" ? undefined : {
  daily:   dailyBucketsFromRollup(rollup, 30, now),
  weekly:  weekBucketsFromRollup(rollup),
  monthly: monthBucketsFromRollup(rollup),
};
```
Add to `data`. Runtime scope has no rollup partition → omit `timeseries`
(renderer hides the section). Wrap the rollup load in the existing `safe()`
helper so a corrupt store yields no section, never a throw. Note in a comment:
the hero/① figure is history-derived (`summarize`) while buckets are
rollup-derived — both descend from the same `history.jsonl`; this is the same
split the text path already lives with.

**B2. `renderGain(L)` section order (`src/report/html.ts`)** — narrative arc,
all data-driven:
1. **Hero** (keep existing deep measured hero — it is already strong). Optionally
   add a 3-stat strip (savings% · commands · avg saved) under the headline, rtk
   `hero-stats` style.
2. **"The problem"** — eyebrow + 3 honest cards (`renderProblem(m, L)`):
   - *Context pollution* — `m.raw_tokens` of raw output would have entered the
     context window. Mono metric: `raw → context: {raw}`.
   - *Shorter sessions* — derived ratio `raw_tokens / 200_000` = "fills a 200K
     window {X}× over." Label it derived, not measured. Metric: `context fills: {X}×`.
   - *Cost that adds up* — the **existing estimate** (`estimated_savings_usd` /
     AI Credits), amber `est.` card. Metric: `est. avoided: {usd}`.
3. **"See the difference"** — `renderDiff(m)`: two horizontal bars scaled to
   `raw_tokens` — `Output without tk: ████████ {raw}` vs `Sent to the model: █
   {output}  (−{pct}%)`. Literal before/after.
4. **"Where the savings came from"** — keep existing by-handler table.
5. **"Real-world savings"** — `renderTrend(L.timeseries)`: daily/weekly/monthly
   toggle (3 buttons), a CSS bar chart of `saved` per bucket + a compact table
   (Period / Saved / Avg% / Commands). Hidden entirely when `timeseries` is
   absent or all-empty. This is the `--all/daily/weekly/monthly` data finally
   surfaced in HTML.
6. **Supporting** — keep ② "Smaller context files" and ③ "Wasteful actions you
   avoided" cards.
7. **"Was the compression safe?"** — keep ④.

**B3. CSS** — extend `STYLE` with: `.problem-grid`/`.problem-card`/`.problem-metric`
(mono pill), `.diffbar` (two-bar before/after), `.trend`/`.trendbtn`/`.trendbar`
(toggle + chart). Reuse existing tokens (`--indigo`, `--emerald`, `--amber-*`,
`--mono`). **No external fonts/CDN/network** — the file must stay openable from
`file://` (test `html.test.ts:83` asserts no remote `src`/`href`).

## Step-by-step

1. **A — helpers + `renderSummary` + `renderBuckets`** in `src/core/gain.ts`.
2. **A — update text test** `tests/unit/core/gain.test.ts:183`: the empty-store
   assertion `toContain("Commands: 0")` → new label `Total commands:` with `0`.
   Keep the `--user` per-project assertions (`By project:` / `proj-a`) — that
   section is unchanged.
3. **B1 — `emitGainHtml`** rollup/buckets wiring in `src/core/ledger.ts`.
4. **B2/B3 — `renderGain` sections + CSS** in `src/report/html.ts`.
5. **HTML test** `tests/unit/report/html.test.ts`: keep the pinned data values
   (`700`, `17.83`, `AI Credits`, `gpt-5.5`, `2972`); optionally add an assertion
   that the trend section renders when `timeseries` is present and is absent when
   it is not.
6. Run gates.

## Verification

- `pnpm test` — full unit suite green (esp. `gain.test.ts`, `html.test.ts`,
  `ledger.test.ts`).
- `pnpm typecheck` (or the repo's tsc gate) — clean.
- Manual text: seed a temp `TOKEN_KILLER_HOME`, run `tk gain --text`,
  `tk gain --text --daily`, `--weekly`, `--monthly`, `--all` — confirm the
  `📊` header, compact numbers, aligned `By Command:` and bucket tables, and that
  `e.g.` sample lines still appear.
- Manual HTML: `tk gain` (project) and `tk gain --user` — confirm the five
  sections render, the daily/weekly/monthly toggle works, numbers match
  `--json`, and nothing is fetched over the network (open offline). Confirm the
  estimate card keeps its `est.` labelling and is never summed into measured
  tokens.
- Empty store: `tk gain --text` and `tk gain` on a fresh home — zero summary,
  exit 0, trend section absent, no throw.

## STOP conditions

- Any in-scope file drifted from the "Current state" excerpts since `d33546c`
  (run the drift check first).
- A change would require summing an estimate into measured tokens, or printing an
  unlabelled dollar/credit figure — STOP; that violates the honesty model.
- Wiring buckets into HTML requires changing storage, the four-ledger split, or
  any accounting write — STOP; this plan is read-only/cold-path only.
- The CSV header or JSON shape would change — STOP; those are pinned contracts.
- Test changes beyond the single relabeled text assertion (step 2) and additive
  HTML assertions (step 5) — STOP and report (a broader test break means behavior
  drifted further than intended).

## Out of scope (note, do not build)

- A paste-to-share / "post your gain" widget (rtk's `ShareGain.astro`) — that is
  a website feature, not a local report.
- Viking illustrations / marketing imagery.
- Changing telemetry, pricing, or the rollup/aggregate storage model.
