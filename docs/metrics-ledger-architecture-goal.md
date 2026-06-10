# Implementation goal: the four-ledger metrics architecture

You are implementing Token Killer's **value accounting**. Today `tk` measures exactly one thing
honestly (command-output compression) and three other forms of value (context optimization,
governance, quality) are either un-recorded or scattered with no place to live together. This
goal makes the accounting explicit, auditable, and unified **at the presentation layer only**.

This is a **decision-complete** spec — the design was already argued out. Do not re-litigate the
ledger model; implement it. Where this doc says "MUST", a reviewer will reject the PR if it's
violated. Read `CONTEXT.md` and `docs/PRINCIPLES.md` first for vocabulary and the fail-open /
no-inflation stance.

## 0. The one load-bearing principle

> **Four ledgers. Displayed side by side. Never summed.**

For a cost-control tool, **honesty is the moat**. A single impressive "tk saved you 1.2M tokens!"
number that mixes measured savings with estimates is exactly what destroys audit credibility. The
whole architecture exists to make every number traceable to its source and impossible to silently
inflate. If you ever find yourself adding a measured value to an estimated one, stop — that's the
one thing this design forbids.

## 0.1 Resolved design branches (grilling 2026-06-05)

The branches the spec left open are now closed. These override any looser wording below.

1. **Estimator (Gap A) is already done.** `src/core/tokens.ts` exists and both `savings.ts` and
   `context/metrics.ts` import it. Slice 0 is a no-op except for the identical-numbers test.
2. **`tk gain report` reuses ADR 0004's `src/core/aggregate.ts` for ledger ①** — it never writes a
   second aggregation. The telemetry-and-gain initiative (which owns `aggregate.ts`) ships its
   Slices 0–2 first; metrics-ledger starts at ledger ④ and joins `aggregate.ts` in Slice 5.
3. **Ledger ③ gets a real store — `governance.jsonl` (Gap C, new).** The hook runtime appends one
   record per `deny`/`suggest` decision (labels + lengths only, **never command text**). A
   `rewrite` is **never written** — that is how the executed-rewrite exclusion is enforced
   physically, not by a later filter.
4. **Ledger ④ ships `fallback_rate` + `failure_rate` + `optimizer_findings_reverted` now;**
   `raw_reopen_rate` is **deferred** (renders `n/a`, "not instrumented yet"). Reason: a raw reopen
   is only observable under Hook delivery (the agent reads the snapshot file directly; `tk` does
   not mediate it), so the rate would be coverage-skewed — better absent than fake.
5. **Gap B store = append-only `inspect/<bucket>/optimize-actions.jsonl`.** One record per optimize
   action: `{surface, before_hash, before_tokens, after_hash, after_tokens, exposure_class, ts}`.
   It serves both ledger ② (`delta = before − after`) and ledger ④ (`findings_reverted`: at the
   next inspect, the current file hash equal to `before_hash` means the user reverted it).
6. **`tk gain report --scope`: user/project is the main axis; `runtime` renders only ②③.** Under
   `--scope runtime`, ledger ① shows "scope n/a, all-project" rather than a fabricated runtime
   figure. Each ledger only responds on scopes it actually has.
7. **`estimate_kind` lives at the aggregation/output layer only**, never on a `HistoryRecord` row.
8. **`exposure_class` mapping:** `always-on` ← instructions / `AGENTS.md` / `CLAUDE.md` / stable
   prompt prefix; `path-scoped` ← `*.instructions.md` (`applyTo`); `on-invocation` ← prompts /
   agents / skills.
9. **Ledger ③ field names track the real `Decision` enum** (`allow | deny | rewrite | suggest` —
   there is no `warn`): `denied_large_reads` (deny), `suggested_broad_searches` (suggest),
   `denied_large_prompts` / `suggested_large_prompts` (prompt governance). "warned_*" below is loose
   wording for `suggest`.
10. **No bare `blocked_prompt_tokens` field.** `prompt.ts` measures the *estimated tokens of the
    prompt itself* (a heuristic estimate, not a measured `raw − delivered` saving). A `_tokens`
    figure named like a total, sitting beside ①, is exactly the never-sum trap. So ③'s primary
    prompt figures are **counts** (`denied_large_prompts` / `suggested_large_prompts`); the prompt's
    token magnitude folds only into `avoided_tokens_estimate` (heuristic, `estimate_kind` carried),
    never a standalone token total.
11. **`advice/` stays the inspect-finding side of ③, not a counts store.** Live deny/suggest events
    are counted from `governance.jsonl` (§0.1.3). `inspect/advice.ts` + `context/advice.ts` keep
    writing human-readable recommendation artifacts; `tk gain report` does **not** read `advice/` for
    counts. ③'s counts = `governance.jsonl` events; ③'s recommendations = `advice/` artifacts.

## 1. The four ledgers

| # | Ledger | Unit | `estimate_kind` | The only honest claim it makes |
|---|--------|------|-----------------|--------------------------------|
| ① | **Measured command savings** | tokens | `measured` | "This command's output was `raw − delivered` tokens smaller." |
| ② | **Optimizer deltas** | tokens *per load* | `measured` (delta) | "This surface is now N tokens lighter than its pre-optimization snapshot." |
| ③ | **Governance opportunities** | counts + estimate | `opportunity` / `heuristic` | "N large reads denied, M broad searches warned; estimated avoided pressure ≈ X." |
| ④ | **Quality guardrails** | rates | n/a | "The savings above did not come at the cost of dropped information." |

### ① Measured command savings — already correct, do not change semantics

- Source of truth: `src/core/savings.ts` (`calculateSavings`, `savedTokens = max(0, raw − delivered)`),
  persisted per-command to `history.jsonl` via `src/core/history.ts`, aggregated by ADR 0004's
  `src/core/aggregate.ts` and rendered by `src/core/gain.ts` (`tk gain`). (`src/core/report.ts` is
  the older minimal reader behind `tk --report`; left untouched per ADR 0004 — it is NOT the ① aggregator.)
- This is **the only ledger whose number may be called `saved_tokens`.**
- Only change: add `estimate_kind: "measured"` for symmetry with the other ledgers. No math changes.

### ② Optimizer deltas — split the measured fact from the soft qualifier

The mistake to avoid: `delta × load_count × confidence`. That multiplies one real number by two
guesses and produces a fake-precise token figure. Instead:

- **`delta_tokens` is MEASURED**, not estimated — it's a diff of two surface snapshots
  (`before_tokens − after_tokens`), both computed by the shared estimator. Report it as the headline.
- **Exposure is a CATEGORY, never a multiplier.** Record `exposure_class ∈ {always-on, path-scoped,
  on-invocation}` (mapping in §0.1.8). Do **not** manufacture a `load_count`. Do **not** bake
  exposure into the token total.
- **Report it as a state, not a flow.** "Current surface is N tokens lighter than the pre-opt
  snapshot" — NOT "saving N tokens/week". The trim happened once; the baseline moved once. Never
  accumulate it into a running weekly total.
- **No third `confidence` knob here.** Measurement of the delta is ~certain (it's a diff); the only
  uncertainty is exposure, which `exposure_class` already carries.

### ③ Governance opportunities — counts first, estimate clearly labeled, no double-count

- Source: the hook runtime (`src/hook/govern.ts`, `src/hook/prompt.ts`) and inspect findings.
  **Storage = `governance.jsonl` (Gap C, §0.1.3)** — `govern`/`prompt` append one record per
  `deny`/`suggest`; `tk gain report` counts them. `govern.ts` today only *returns* a `Decision`; this
  is the missing persistence the spec did not call out.
- Report **counts** as the primary figures, named after the real `Decision` enum:
  `denied_large_reads` (deny), `suggested_broad_searches` (suggest), `denied_large_prompts` /
  `suggested_large_prompts` (prompt governance — counts, NOT a `blocked_prompt_tokens` total; see
  §0.1.10). There is no `warn` decision — "warned_*" anywhere below means `suggest`.
- An `avoided_tokens_estimate` may accompany them, but **MUST carry `estimate_kind` and MUST NEVER
  be presented as a token total alongside ①.** Suggested action weights (all heuristic, label them
  as such): `deny: 1.0`, `warn/suggest: 0.25–0.5`, `inspect-only: 0.1–0.3`.
- **CRITICAL — exclude executed rewrites.** A `rewrite` that later runs as `tk <cmd>` has its saving
  **already counted in ①**. Ledger ③ MUST only contain actions with no realized output (deny / warn
  / suggest). Counting an executed rewrite here double-counts the same saving. This boundary is the
  single most important correctness property of ③.

### ④ Quality guardrails — first-class, not an appendix

These make ①–③ trustworthy; render them with equal weight, not as a footnote.

- `fallback_rate` — share of commands whose filter threw and fell back to raw. **Derive** from
  `history.jsonl` (`handler === "fallback"` — the real name set in `src/core/fallback.ts`; reuse
  `aggregate.ts` `fallbackCount`). NOT `{raw, generic}`: `raw` is not a handler, and `generic` is
  the normal catch-all for unhandled commands, not a fallback.
- `failure_rate` — `history.jsonl` rows with `quality_status === "failure"` (the hook-runtime tool
  failure set by `recordHookFailure`). **`inflated` and `empty_output` are NOT failures** — both
  mean the safe-compression gate rejected a bad compression and returned raw (`base.ts:121`), i.e.
  the moat working with no information lost (PRINCIPLES: "0% savings 不是失败, 错压才是失败"). They
  surface as safe 0%-savings rows in the normal summary, never in `failure_rate` or `--failures`.
- `optimizer_findings_reverted` — derived **cold-path** from `optimize-actions.jsonl` (§0.1.5): at
  the next inspect, a surface whose current hash equals its recorded `before_hash` was reverted.
- `raw_reopen_rate` — **DEFERRED** (§0.1.4). No signal exists: `rawStore.ts` only *saves* raw, it
  does not record reopens, and `tk` cannot observe the agent reading a snapshot file directly.
  Render `n/a` ("not instrumented yet"); never fabricate it. A future Hook-only capture may add it.

## 2. Storage stays scattered — that's a feature, not the bug to fix

Do **NOT** merge the underlying stores. They differ in lifecycle, scope, and privacy, and those
differences are what enforce the "never sum" rule physically. The grilling added **two new event
stores** (`governance.jsonl`, `optimize-actions.jsonl`) — this is still "scattered, not merged":
each new store backs exactly one ledger and shares no file with another.

```text
~/.token-killer/
├── projects/<fingerprint>/history.jsonl         ① append-only event stream, hot path, per-project,
│                                                   may contain command text + raw paths
├── projects/<fingerprint>/raw/                  raw-output store (snapshot bytes for recovery)
├── projects/<fingerprint>/governance.jsonl      ③ NEW (Gap C, §0.1.3): append-only hook-runtime
│                                                   deny/suggest events; labels+lengths only,
│                                                   never command text; rewrite NEVER written
├── inspect/<bucket>/latest.json                 ② inspect snapshots, overwrite, scope-bucketed
│                                                   (user/project/runtime), labels+lengths only
├── inspect/<bucket>/optimize-actions.jsonl      ②④ NEW (Gap B, §0.1.5): append-only before/after
│                                                   hashes+tokens+exposure_class per optimize action
└── advice/                                      ③ generated advice artifacts (the inspect-finding
                                                    side of ③; live events come from governance.jsonl)
```

- ① is an append-only hot-path log; ② `latest.json` is an overwrite-on-run cold-path snapshot. They
  physically cannot share a file. Keep them apart.
- Scope bucketing (ADR 0003) and the privacy contract (① may hold command text, ② only lengths)
  are real boundaries. Do not cross them.

**The actual gap to close is a read-side layer, not a storage merge.** See §4.

## 3. Pre-requisite gaps to fix first

**Gap A — duplicated estimator. ✅ DONE.** `src/core/tokens.ts` already holds the one
`estimateTokens = chars/4`; `src/core/savings.ts` and `src/context/metrics.ts` import it. Slice 0
is now only the identical-numbers regression test.

**Gap B — ② has nowhere to store its "before". RESOLVED → append-only action log (§0.1.5).**
`inspect/<bucket>/latest.json` is overwrite-only, so `before_tokens` is gone by delta time. Home =
`inspect/<bucket>/optimize-actions.jsonl`, one append-only record per optimize action carrying
`{surface, before_hash, before_tokens, after_hash, after_tokens, exposure_class, ts}`. The
append-only form (not a single overwritten baseline) is chosen so it also backs ledger ④'s
`findings_reverted` — without the recorded `after_hash` you cannot tell a user revert from a
re-edit. `body_hash` (from `BodyMetrics`) feeds `before_hash`/`after_hash` and detects drift.

**Gap C — ③ has nowhere to store live deny/suggest events (NEW, §0.1.3).** `govern.ts` only
*returns* a `Decision`. Add an append-only `projects/<fingerprint>/governance.jsonl`, written by the
hook runtime on `deny`/`suggest` (labels+lengths only; `rewrite` never written). This is the
physical home for ③'s counts; do it as part of Slice 3.

## 4. The deliverable — a read-side unified report (`tk gain report`)

One read-only command that joins all four ledgers and renders them in **four separate sections,
with no grand total and no cross-ledger arithmetic.** It reads the existing stores (ledger ① via
ADR 0004's `aggregate.ts`, §0.1.2); it owns no new storage beyond Gap B/Gap C.

`--scope` is **user/project on the main axis; `runtime` renders only ②③** (§0.1.6). Under
`--scope runtime`, ledger ① prints "scope n/a, all-project" — it has no runtime partition, so do not
fabricate one. Each ledger responds only on the scopes it actually has.

```text
$ tk gain report [--scope user|project|runtime] [--since <date>] [--json]

Measured command savings            (estimate_kind: measured)
  raw_tokens · delivered_tokens · saved_tokens · savings_pct

Optimizer deltas                    (delta = measured, per load)
  per surface: before · after · delta_tokens · exposure_class
  — shown as current state vs pre-opt snapshot, NOT a weekly flow

Governance opportunities            (estimate_kind: opportunity|heuristic)
  denied_large_reads · suggested_broad_searches · denied_large_prompts · suggested_large_prompts
  avoided_tokens_estimate           (heuristic; folds prompt magnitude; executed rewrites excluded — counted in ①)

Quality guardrails
  fallback_rate · failure_rate · findings_reverted · raw_reopen_rate=n/a (deferred)
```

`--json` emits the same four objects as four top-level keys — never a flattened total. Existing
`tk gain` keeps working (it's ledger ① only); `tk gain report` is the superset view.

## 5. Schema / naming contracts (MUST)

- The field name `saved_tokens` is **reserved for ledger ①.** Nowhere else.
- Estimated ledgers carry `estimate_kind: "opportunity" | "heuristic"`; measured ones
  `estimate_kind: "measured"`. **`estimate_kind` lives on the aggregation/output object only,
  never on a persisted `HistoryRecord` row** (§0.1.7).
- ②: `before_tokens`, `after_tokens`, `delta_tokens`, `exposure_class`. No `load_count`,
  no `weekly_*`, no `confidence` multiplier.
- ③: `avoided_tokens_estimate` + `estimate_kind`. Never a bare token total.
- Every ledger object is independently serializable; a consumer can render any one without the
  others. No ledger references another's totals.

## 6. Anti-goals (a reviewer will reject these)

- ❌ Any screen or JSON field that sums across ledgers, even labeled "total value".
- ❌ `delta × load_count × confidence` or any manufactured exposure multiplier in ②.
- ❌ ② framed as a recurring flow ("N tokens/week") or accumulated into a running total.
- ❌ Executed rewrites counted in ③ (double-counts ①).
- ❌ Merging `history.jsonl` and `inspect/latest.json` into one store.
- ❌ A second/third copy of `estimateTokens`.
- ❌ Calling anything outside ① `saved_tokens`.

## 7. Suggested slices (ship independently, each green before the next)

0. **Unify the estimator** (Gap A). ✅ Already shipped (`src/core/tokens.ts`); only the
   identical-numbers regression test remains. Depends on ADR 0004's `aggregate.ts` landing for ①.
1. **`estimate_kind: "measured"` on ①** — at the aggregation/output layer (§0.1.7), not on rows.
   `tk gain` unchanged.
2. **Guardrails ledger ④.** Derive `fallback_rate` + `failure_rate` from `history.jsonl`;
   `findings_reverted` from `optimize-actions.jsonl` (lands with Slice 4's store). `raw_reopen_rate`
   renders `n/a` (deferred, §0.1.4). Read-only.
3. **Governance ledger ③.** Add `governance.jsonl` (Gap C) + write `deny`/`suggest` from
   `hook/govern` + prompt; `rewrite` never written (executed-rewrite exclusion is physical, not a
   filter). Counts: `denied_large_reads` / `suggested_broad_searches` / `denied_large_prompts` /
   `suggested_large_prompts` + heuristic `avoided_tokens_estimate` (§0.1.10 — no bare
   `blocked_prompt_tokens`). Test the double-count boundary explicitly.
4. **Optimizer delta ledger ②** (needs Gap B). Append-only `optimize-actions.jsonl` +
   `delta_tokens` + `exposure_class`. Test drift detection via `body_hash`, and that ② is a state
   diff (not accumulated). This store also backs ④'s `findings_reverted`.
5. **`tk gain report`** — the read-side join. Four sections, `--scope` per §0.1.6, `--json`, no total.
   Ledger ① via `aggregate.ts` (§0.1.2). This is the payoff slice.

## 8. Done means

- One estimator, imported everywhere. `grep -rn "length / 4" src` finds it in exactly one place
  (`core/tokens.ts`). (Do NOT gate on bare `/ 4` — `handlers/common/listLike.ts` uses `marker / 4`
  for tree-indent depth, unrelated to tokens.)
- `tk gain report` shows four sections; no code path sums across them; `--json` has four top-level keys.
- A test asserts an executed rewrite does **not** appear in ③ (anti-double-count).
- A test asserts ② is a state diff, not accumulated over runs.
- `saved_tokens` appears only in ledger ① types/output.
- Storage layout in §2 is unchanged except the two new append-only event stores: `governance.jsonl`
  (Gap C) and `optimize-actions.jsonl` (Gap B). No existing store is merged.
- A test asserts `findings_reverted` fires only when a surface's current hash returns to its
  recorded `before_hash`; `raw_reopen_rate` is rendered `n/a`, never a fabricated number.
- The whole thing fails open: a missing/corrupt store yields an empty section, never a crash on the
  hot path (`tk gain report` is cold-path, but it must not block or error `tk <cmd>`).
