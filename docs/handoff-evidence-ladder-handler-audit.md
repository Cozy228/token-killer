# Handoff: evidence-ladder revert bug across RTK-ported handlers

**Repo:** `/Users/ziyu/Workspace/token-killer` (branch `token-killer-node-cli`)
**Focus for next session:** verify, then ladder-ify a class of RTK-ported handlers that ship **raw, uncompressed** output when their result is large — exactly the case where compression matters most.

> **Status (2026-06-07): AUDIT + FIX COMPLETE (fix uncommitted).**
>
> - **Audit:** all 11 suspect commands were empirically CONFIRMED reverting to raw
>   at 0%; `find`/`ls` confirmed SAFE. Full table + fixtures below.
> - **Fix (shipped, awaiting commit):** user signed off on **C primary + B fallback**
>   — the ADR 0001 two-step ladder (lossless step-1 digest → step-2 count
>   replacement), with **all `… +N more` / bare `+N` cap markers REMOVED** and caps
>   replaced by the `LISTING_TOKEN_BUDGET` (2000-token) flip. Converted handlers:
>   `docker`, `kubectl`, `aws` (cloud); `gh`, `glab`, `gt` (git); `prettier`,
>   `package-list` (js); `pipe`. Each formatter now returns `LadderResult` and threads
>   the declared `omission` into `makeFilteredResult` (reusing `common/budget.ts`
>   `overBudgetLadder`). `search-like` was fixed separately (committed `e3df5e4`).
> - **Per-handler digest shapes** (user defaults): docker/kubectl drop ports/image →
>   `name status`; gh/glab/pnpm drop icons/author → `#num title` / `name version`;
>   docker/kubectl logs OUT of scope; pipe bare `+N` also removed. Handlers whose items
>   are pure evidence (prettier files, s3 ls, kubectl pod issues, cfn/ecs lists) have
>   no lossless step-1 and ladder straight full→replacement.
> - **Verification:** `pnpm test:product` green (138 files / 1196 tests), `tsc`
>   clean. Each handler gained an over-budget test (digest tier) + had its stale
>   "reverts to raw" parity-test comments corrected. NOTE: the replacement (step-2)
>   tier correctly fails open to raw under `--no-save-raw` (the test-harness default),
>   so per-handler over-budget tests target the digest tier; the replacement tier is
>   covered generically by `adr0001Ladder.test.ts`.

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

## Audit status — COMPLETE (audit session 2026-06-07)

Every row below was empirically verified by feeding a **correctly-shaped** over-cap
fixture to `routeCommand(cmd).filter(...)` (bypassing the test harness's
passthrough assertion) and checking `output.trim() === stdout.trim()` (revert),
`qualityStatus`, and whether an `OMISSION_MARKER` survives in the output. The
earlier INCONCLUSIVE rows were re-probed with parser-correct fixtures (the prior
false-negatives came from feeding the wrong shape — TSV to a JSON parser, fake
rows that parsed to 0 items). Probe options used a generous budget so the marker
came from the handler's own cap, not from `limitOutput`.

**Verdict: 11 commands across ~10 handlers CONFIRMED revert-to-raw at 0%. 2 SAFE.**

| handler | command probed | file:line of marker | declares omission? | result |
|---|---|---|---|---|
| grep (search-like) | `grep -r` (300 matches / 3 files) | grepFilter.ts:236 `[+N more]` | no (searchLike.ts:130/150) | **CONFIRMED** — revert, inflated, raw 14371b→14371b |
| aws | `aws lambda list-functions` (25 fns) | cloud/aws.ts:31,134,152 `… +N more` | no (aws.ts:299) | **CONFIRMED** — revert, inflated, 2380b→2380b |
| docker (container) | `docker ps` (25 rows) | container.ts:71 `… +N more` | no (container.ts:639) | **CONFIRMED** — revert, inflated, 1854b→1854b |
| kubectl (container) | `kubectl get services` (25 svc) | container.ts:353 `… +N more` | no (container.ts:659) | **CONFIRMED** — revert, inflated, 3026b→3026b |
| kubectl (container) | `kubectl get pods` (15 Pending) | container.ts:311 `… +N more` | no (container.ts:659) | **CONFIRMED** — revert, inflated, 1576b→1576b |
| gh (hostingCli) | `gh pr list` (25 PRs JSON) | hostingCli.ts:130 `… +N more` | no (hostingCli.ts:276) | **CONFIRMED** — revert, inflated, 2697b→2697b |
| glab (hostingCli) | `glab mr list` (25 MRs JSON) | hostingCli.ts:130 `… +N more` | no (hostingCli.ts:276) | **CONFIRMED** — revert, inflated, 1947b→1947b |
| gt (graphite) | `gt log` (20 graph nodes) | graphite.ts:58 `... +N more entries` | no (graphite.ts:185) | **CONFIRMED** — revert, inflated, 379b→379b |
| prettier | `prettier --check` (15 files) | prettier.ts:104 `... +N more files` | no (prettier.ts:131, 4-arg) | **CONFIRMED** — revert, inflated, 237b→237b |
| pnpm (package-list) | `pnpm list` (25 prod deps JSON) | packageList.ts:120 `… +N more` | no (packageList.ts:164, 4-arg) | **CONFIRMED** — revert, inflated, 767b→767b |
| pipe | `pipe find` (25 dirs) | pipe.ts:114 `+N more dirs` | no (pipe.ts:203) | **CONFIRMED** — revert, inflated, 439b→439b |
| find (list-like) | `find` (3000 files / 50 dirs, >8KB) | none — laddered, not capped | **YES** (listLike.ts:190,233 `overBudgetLadder`) | **SAFE** — declared digest, no revert, 64289b→1102b (98.3%) |
| ls (list-like) | n/a — code inspection | **none emitted** (`grep -c more src/handlers/system/ls.ts` = 0) | n/a (compacts, never caps) | **SAFE** — structurally cannot trip the sniff (emits no `+N more` marker) |

Notes:
- The `kubectl get pods` path trips via the `[warn] Issues:` warnings cap
  (`CAP_WARNINGS=10`), a different code path than the `services` list cap
  (`CAP_LIST=20`) — both confirmed reverting.
- `pipe`'s per-file bare `+N` (pipe.ts:72,109) does NOT match `OMISSION_MARKERS`
  and ships fine; only the dir-cap `+N more dirs` (pipe.ts:114) reverts — as the
  earlier handoff predicted.
- All CONFIRMED rows show `marker=gone` in the shipped output **because** the
  revert ships raw (which has no marker) — the marker only exists in the
  *compressed* rendering that the gate discards. That is the bug in one line:
  the compression that would have produced the marker is thrown away.

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
