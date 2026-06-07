# Handoff: evidence-ladder revert bug across RTK-ported handlers

## The bug (mechanism)

ADR 0001 added a safety net in `makeFilteredResult` (`src/handlers/base.ts`): if a
handler's output contains an omission marker (`+N more`, `… +N more`, `[+N more]`,
`(more changes truncated)`, …) but the handler did **not** declare the omission,
the gate treats it as a silent evidence drop and **fails open to raw** — it ships
the full uncompressed output (`qualityStatus: "inflated"`, `savings ≈ 0%`).

Several RTK-ported handlers still emit RTK-style `… +N more` markers when they
exceed their internal cap, but never wired into the declaration mechanism. Result:

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
(`INFLATION_EXEMPT_HANDLERS` does NOT help — it only suppresses the *size* check,
not the undeclared-omission sniff. So `gh`/`glab`, which are inflation-exempt, are
still vulnerable to this revert.)

## Audit status (this session)

Empirically verified by feeding crafted over-cap stdout to `handler.filter` and
checking `output === raw` (revert) + `qualityStatus`.

| handler | file:line of marker | declares omission? | status |
|---|---|---|---|
| grep (search-like) | grepFilter.ts `[+N more]` | no | **CONFIRMED revert** (probed; fix was written then reset — see below) |
| aws | cloud/aws.ts:31,134 | no (base.ts:289/296/299) | **CONFIRMED revert** (probe: inflated + reverted) |
| find (list-like) | common/listLike.ts | **YES** (listLike.ts:234, overBudgetLadder) | **SAFE — not vulnerable** (subagent inference was wrong) |
| docker (container) | cloud/container.ts:71,98,106,151,191 | no (container.ts:639) | marker code present; runtime probe INCONCLUSIVE (my fake `docker ps` rows didn't match the parser → counted 0 → no marker). Re-probe with real `docker ps` output. |
| kubectl (container) | cloud/container.ts:311 etc. | no (container.ts:659) | same as docker — INCONCLUSIVE, re-probe with real `kubectl get` output |
| gh / glab (hostingCli) | git/hostingCli.ts:130 | no (hostingCli.ts:276) | marker present; INCONCLUSIVE (my probe fed TSV, handler expects JSON → passthrough). Re-probe with real `gh pr list --json`-shaped stdout |
| gt (graphite) | git/graphite.ts:58 | no (graphite.ts:185) | marker present, no declaration — NOT runtime-probed |
| prettier | js/prettier.ts:104 | no (prettier.ts:131, 4-arg call) | marker present, no declaration — NOT runtime-probed |
| pnpm (packageList) | js/packageList.ts:120 | no (packageList.ts:164, 4-arg call) | marker present, no declaration — NOT runtime-probed |
| pipe | system/pipe.ts:114 | no (pipe.ts:203) | marker present, no declaration — NOT runtime-probed |

Caveat on runtime probes: a false-negative happens when the crafted stdout doesn't
match the handler's parser (it then counts 0 rows, emits no marker, and passes
through at 0% — looks "fine" but for the wrong reason). Each remaining handler
needs a probe with a *correctly-shaped* fixture so the cap actually triggers.

## The fix (proven on grep, then reset)

Pattern that worked for search-like this session (before the tree was reset):
1. have the grouping/formatting fn report whether it suppressed anything
   (`groupGrepOutput` → `{ text, suppressed }`);
2. in the handler's `filter`, when suppressed, pass `omission: { kind: "replacement" }`
   to `makeFilteredResult` (6th arg).

Then the gate force-persists the raw snapshot, appends a real `[full output: <path>]`
recovery pointer, and skips the sniff. With `--no-save-raw` it safely fails open to
raw (no recovery-less lossy output). The RTK `… +N more` marker is KEPT (these are
RTK-parity handlers, not ladder-converted, so they're not subject to
adr0001Ladder's NO_OVERFLOW_MARKER invariant) — it's just now *declared*.

Verified result for grep: `grep -r the docs/*.md` went 153068→22190 bytes (0%→85.5%)
and shipped `1153 matches in 24 files` + `[+953 more]` + `[full output: …]`.

Apply the same recipe per handler (aws/container/hostingCli/graphite/prettier/
packageList/pipe). Each emits the marker from a different formatter, so each needs
its formatter to signal suppression up to the `makeFilteredResult` call site.

## Diagnostic surface (also reset)

A companion change made `tk gain --history` label every ≤0% row `[already-minimal]`
(healthy passthrough) vs `[under-compressed]` (this bug). That's the fastest way to
spot which handlers are silently reverting in the field. It was reset too; re-apply
if useful — see memory `gain-zero-saving-disambiguation`.

## Where the reset work lived

`src/handlers/common/searchLike.ts`, `src/handlers/common/grepFilter.ts`
(search-like fix); `src/core/gain.ts`, `src/core/rollup.ts` (0% labels). All four
were reverted when the migration suite was dissolved (commit `67e03f2`). Re-apply
against the new structure (migration tests now live under `tests/unit/handlers/`).
