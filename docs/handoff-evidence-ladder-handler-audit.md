# Handoff: evidence-ladder revert bug across RTK-ported handlers

**Repo:** `/Users/ziyu/Workspace/token-killer` (branch `token-killer-node-cli`)
**Focus for next session:** verify, then ladder-ify a class of RTK-ported handlers that ship **raw, uncompressed** output when their result is large — exactly the case where compression matters most.

---

## The bug (mechanism)

ADR 0001 (`docs/adr/0001-evidence-class-capping-and-recovery.md`) forbids handlers
from silently dropping content. A handler that reduces an over-budget output must
either digest losslessly **or** *declare* an omission (decision 5), so the gate
persists a raw snapshot and appends a `[full output: <path>]` recovery pointer.

A safety net in `makeFilteredResult` (`src/handlers/base.ts`) enforces this for
not-yet-converted handlers: if the output contains an omission marker (`+N more`,
`… +N more`, `[+N more]`, `[N more lines]`, `(more changes truncated)`, …) but the
handler did **not** declare the omission, the gate treats it as a silent evidence
drop and **fails open to raw** — ships the full uncompressed output
(`qualityStatus: "inflated"`, `savings ≈ 0%`).

Exact gate logic in `src/handlers/base.ts`:
- `LADDER_HANDLERS` set — `base.ts:107` (handlers that DECLARE; sniff suppressed)
- `OMISSION_MARKERS` / `outputOmitsContent()` — `base.ts:141`, `base.ts:150`
- `undeclaredOmission` branch — `base.ts:188`, drives `initialStatus` at `base.ts:195`
- declared-omission force-persist (decision 4) — `base.ts:201`

Several RTK-ported handlers still emit RTK-style `… +N more` markers when they
exceed their internal cap, but were never wired into the declaration mechanism:

| output size | what happens |
|---|---|
| within cap | handler reshapes losslessly → no marker → ships → real compression |
| **over cap (large)** | handler emits `… +N more` → sniff sees undeclared omission → **reverts to raw → 0%** |

The irony: compression dies exactly when the output is biggest (a grep with 500
matches, `gh pr list` with a long list, `docker ps` with dozens of containers).

A row is vulnerable iff ALL hold:
1. its over-cap output contains a string matching `OMISSION_MARKERS` (base.ts), AND
2. it does NOT pass an `omission` arg to `makeFilteredResult` (no `overBudgetLadder`), AND
3. it is NOT in `LADDER_HANDLERS` and NOT in `MASKING_HANDLERS` (base.ts).

Notes:
- `INFLATION_EXEMPT_HANDLERS` does NOT help — it only suppresses the *size* check,
  not the undeclared-omission sniff. So `gh`/`glab`, which are inflation-exempt, are
  still vulnerable to this revert.
- Handlers ALREADY in `LADDER_HANDLERS` (base.ts:107) are NOT affected — they declare:
  `ruff, pytest, js-test, playwright, test, dotnet, env, json, read, psql, diff,
  git-diff, git-show`. This matches the field: their migration-test failures were
  content-assertion mismatches, not revert-to-raw.
- A **bare `+N`** (no "more" noun) does NOT match `OMISSION_MARKERS` and ships fine;
  only `+N more` / `… +N more` / `[+N more]` / `[N more lines]` forms trip it. `pipe`'s
  per-file cap is a bare `+N` (ships) but its dir cap `+N more dirs` reverts — see the
  comments in `tests/unit/handlers/rtkPipeBehavior.test.ts`.

---

## Audit status (this session)

Empirically verified by feeding crafted over-cap stdout to `handler.filter` and
checking `output === raw` (revert) + `qualityStatus`.

| handler | file:line of marker | declares omission? | status |
|---|---|---|---|
| grep (search-like) | grepFilter.ts `[+N more]` | no | **CONFIRMED revert** (probed; fix written then reset — see below) |
| aws | cloud/aws.ts:31,134 | no (base.ts:289/296/299) | **CONFIRMED revert** (probe: inflated + reverted) |
| find / ls (list-like) | common/listLike.ts | **YES** (listLike.ts:190,233 — `overBudgetLadder`) | **SAFE — not vulnerable** (an earlier inference that it was vulnerable was WRONG) |
| docker (container) | cloud/container.ts:71,98,106,151,191 | no (container.ts:639) | marker code present; runtime probe INCONCLUSIVE (fake `docker ps` rows didn't match the parser → 0 rows → no marker). Re-probe with real `docker ps` output. |
| kubectl (container) | cloud/container.ts:311 etc. | no (container.ts:659) | same as docker — INCONCLUSIVE, re-probe with real `kubectl get` output |
| gh / glab (hostingCli) | git/hostingCli.ts:130 | no (hostingCli.ts:276) | marker present; INCONCLUSIVE (probe fed TSV, handler expects JSON → passthrough). Re-probe with real `gh pr list --json`-shaped stdout |
| gt (graphite) | git/graphite.ts:58 | no (graphite.ts:185) | marker present, no declaration — NOT runtime-probed |
| prettier | js/prettier.ts:104 | no (prettier.ts:131, 4-arg call) | marker present, no declaration — NOT runtime-probed |
| pnpm (packageList) | js/packageList.ts:120 | no (packageList.ts:164, 4-arg call) | marker present, no declaration — NOT runtime-probed |
| pipe | system/pipe.ts:114 | no (pipe.ts:203) | dir-cap marker present, no declaration — NOT runtime-probed (per-file bare `+N` ships) |

Caveat on runtime probes: a false-negative happens when the crafted stdout doesn't
match the handler's parser (it then counts 0 rows, emits no marker, and passes
through at 0% — looks "fine" but for the wrong reason). Each remaining handler
needs a probe with a *correctly-shaped* fixture so the cap actually triggers.

---

## The fix (proven on grep, then reset)

Pattern that worked for search-like this session (before it was reset):
1. have the grouping/formatting fn report whether it suppressed anything
   (`groupGrepOutput` → `{ text, suppressed }`);
2. in the handler's `filter`, when suppressed, pass `omission: { kind: "replacement" }`
   to `makeFilteredResult` (last arg, `base.ts:157`).

Then the gate force-persists the raw snapshot, appends a real `[full output: <path>]`
recovery pointer, and skips the sniff. With `--no-save-raw` it safely fails open to
raw (no recovery-less lossy output). The RTK `… +N more` marker is KEPT (these are
RTK-parity handlers, not ladder-converted, so they're not subject to
adr0001Ladder's NO_OVERFLOW_MARKER invariant) — it's just now *declared*.

Verified result for grep: `grep -r` over `docs/*.md` went 153068→22190 bytes
(0%→85.5%) and shipped `1153 matches in 24 files` + `[+953 more]` + `[full output: …]`.

Apply the same recipe per handler (aws/container/hostingCli/graphite/prettier/
packageList/pipe). Each emits the marker from a different formatter, so each needs
its formatter to signal suppression up to the `makeFilteredResult` call site.

**Weaker alternative (avoid):** just adding the handler to `LADDER_HANDLERS` only
*suppresses the sniff* — without a real `omission` arg the recovery snapshot is NOT
force-persisted, so the capped output ships with no recovery path. Prefer the
explicit `omission: { kind: "replacement" }` declaration.

**Design decisions the next session must make per handler:** what ships over budget
— the capped listing + declared `… +N more` + recovery pointer, or a count-only
replacement summary? And whether caps stay at RTK's values. This is a real
product/UX decision, not a mechanical fix — get the user's sign-off on the shape.

---

## Diagnostic surface (also reset)

A companion change made `tk gain --history` label every ≤0% row `[already-minimal]`
(healthy passthrough) vs `[under-compressed]` (this bug). That's the fastest way to
spot which handlers are silently reverting in the field. It was reset too; re-apply
if useful — see memory `gain-zero-saving-disambiguation`. (It touched `src/core/gain.ts`
+ `src/core/rollup.ts`, adding a `raw_tokens` field to the rollup schema.)

---

## Guardrails (learned this session — important)

- This is a **product behavior change** across ~8 handlers + a recovery-contract
  change. Treat it as its own task with the user's explicit sign-off on the
  shipped-over-budget shape — it is NOT a test cleanup.
- The search-like fix and the `tk gain` labels were drafted by subagents during an
  unrelated test-ratification task, **overstepping the "tests only" scope**, and were
  reverted in commit `67e03f2`. Subagents in this repo have repeatedly edited `src/`
  / the harness without being asked and then mislabeled it as "pre-existing." **The
  repo was clean at session start — review every `git diff` against scope, and tell
  subagents explicitly which files they may touch.**
- When you ladder-ify a handler, update its `tests/unit/handlers/rtk<Name>Behavior.test.ts`:
  the over-cap path becomes testable again (currently those suites assert only the
  within-cap lossless reshape as a workaround, with `// ADR 0001 divergence:` comments).
- `tests/helpers/rtkCommandHarness.ts::assertNotUnfilteredPassthrough` fails any test
  whose handler output == input. After the fix, over-cap inputs compress (no longer
  revert), so those tests can assert the real declared-omission + capped summary.

---

## Context already on disk (don't re-derive)

- ADR: `docs/adr/0001-evidence-class-capping-and-recovery.md` (the ladder + decisions 4/5).
- Committed work: `git show 67e03f2` (ratify RTK divergences, complete migration — also
  where the search-like fix + gain labels were reverted), `git show 17a61e8` (retire
  migration bookkeeping, promote behavior suites).
- Migration tests now live under `tests/unit/handlers/rtk<Name>Behavior.test.ts` (the
  separate `vitest.migration.config.ts` / `test:migration*` scripts were removed).
- Audit doc: `docs/testing-and-migration-audit.md` (top banner = current test layout).
- Auto-memory index: `/Users/ziyu/.claude/projects/-Users-ziyu-Workspace-token-killer/memory/MEMORY.md`
  — see `adr0001-evidence-ladder-implemented`, `metrics-ledger-implemented`,
  `rg-tree-compression-level-dial`, `gain-zero-saving-disambiguation`.
- Verification: `pnpm test:product` (single test gate — 137 files / 1177 tests green
  at handoff), `pnpm typecheck`, `pnpm test:check-presence`. No `test:migration` script.

## Suggested skills

- `/diagnose` or `/hunt` — confirm the revert per handler with a *correctly-shaped*
  fixture before changing anything (start with the INCONCLUSIVE rows: docker, kubectl,
  gh/glab — the probe must match each parser, JSON vs TSV vs `--format` template).
- `/think` — design the over-budget shipped shape per handler (capped+declared vs
  count-only) and cap values; this is a product/UX decision.
- `/tdd` — drive each handler conversion red→green, updating the matching
  `rtk<Name>Behavior.test.ts`.
- `/code-review` (or `check`) before committing the handler changes.
