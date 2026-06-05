---
status: accepted
---

# Evidence-class capping, lossless digests, and a recovery contract

## Context

`tk` inherited RTK's output filters wholesale, including RTK's **evidence-capping**:
fixed per-class caps (`CAP_ERRORS=20`, `CAP_WARNINGS=10`, `CAP_LIST=20`,
`CAP_INVENTORY=50`, grep's `200`/`25`, pipe's `10`/`10`/`20`) that drop evidence
beyond a count and leave an overflow marker (`+N more`, `[+N more]`, bare `+N`).
RTK does this because its product KPI is 60–90% token savings (a release blocker);
capping is a goal, not a side effect.

`tk`'s product stance is the opposite — retention-first, "0% savings is valid,
mis-compression is the only failure" (PRINCIPLES.md). Two latent defects followed
from the mismatch:

1. The safety gate (`base.ts`) detects omission by **regex-sniffing the output prose**
   for specific phrasings. `tk`'s own handlers emit `... +N more` / `[+N more]` / bare
   `+N`, none of which match those patterns — so the gate is **blind to `tk`'s own
   capping**. It only catches foreign/legacy phrasings no `tk` handler produces.
2. Overflow markers cite no recovery channel, and raw is auto-persisted only on
   `exit≠0` or `>20000` chars. A successful, mid-sized capped result (e.g. a 250-match
   grep) hides evidence with **no way to recover it** — the "fake completeness"
   PRINCIPLES.md forbids.

## Decision

1. **Separate the two operations.** *Noise-removal* (dropping non-evidence: ANSI,
   spinners, passed-test lists, `node_modules`) is always allowed. *Evidence-capping*
   (dropping same-class evidence) is governed by the rules below. See CONTEXT.md.

2. **No `+N more` anywhere; reduction follows a two-step over-budget ladder.** RTK's
   always-on `CAP_*` constants and *every* overflow marker (`+N more`, `[+N more]`, bare
   `+N`, `[N more lines]`) are removed. A "show first N + `+N more`" is banned outright — it
   is the fake-completeness PRINCIPLES.md forbids, and recovery does not redeem it. Every
   handler lists in full below the token budget. Over budget, in order:
   1. **Lossless reduction** — de-dup repeated lines, drop decoration, or (location-class)
      drop match content while keeping *every* location. No item is hidden.
   2. **Complete-replacement summary** — if still over budget, replace the listing with an
      aggregate (count, optionally per-group counts) + snapshot pointer. Shows *no* partial
      list. Honest because it never pretends a partial listing is complete.
   In every case recovery is guaranteed (decision 4).

3. **Two-tier location-class delivery.** Below a token budget (~2000 tokens / ~8KB of
   the full `file:line:content` listing) emit it in full. Above it, emit a **lossless
   digest** that keeps *every* `file:line` (grouped per file, match content dropped)
   plus the recovery pointer. The flip unit is estimated tokens (`chars/4`), not match
   count — we gate on what we bill.

4. **Omission ⇒ guaranteed recovery.** Any digest or inventory cap force-persists the
   raw output that turn, regardless of exit code or size thresholds.

5. **Declared, not sniffed.** A handler signals omission with a **structured field on
   its return** (`omission: { kind: 'digest' | 'replacement', rawPointer }`) — `digest` is a
   lossless reduction (step 1), `replacement` is a complete-replacement summary (step 2).
   There is no "partial cap" kind, because `+N more` is banned. The gate trusts the
   declaration — it force-persists raw and asserts the pointer is present. The output-sniffing
   regex is retired for `tk`'s own handlers and kept only as a defense against foreign
   passthrough (where a `+N more` *must* trigger revert-to-raw).

6. **Recovery is always a snapshot read-back, never a re-run.** The inline pointer names
   the persisted snapshot **file path** (the exact bytes the digest came from). `tk` never
   cites `tk --raw <cmd>` as a recovery channel: a re-run re-executes the command, which
   can **drift** once the repo changes mid-turn and is **unsafe for mutating commands** —
   re-running `tk --raw curl -X POST …` re-sends the request. This retroactively corrects
   the existing `tk --raw` recovery hints in `curl` and `compactDiff`.

7. **Universal delivery rule (the cross-class synthesis).** Below the token budget, every
   handler emits its full listing (zero loss). Over budget it runs the two-step ladder
   (decision 2); the step-1 lossless reduction is what differs by class:
   - *location-class* → drop match content, keep every `file:line`;
   - *stream-class* → de-dup repeated lines, keep every unique line;
   - *flat all-evidence list* → drop decoration (often nothing left → go straight to step 2).
   If step 1 still exceeds budget, all classes fall to the same step-2 complete-replacement
   summary. No class ever emits a `+N more`.

8. **Stream-class + lossless capture.** Log streams (`docker`/`kubectl`/`compose logs`, the
   file `log` handler) are *stream-class*: de-dup repeated lines (noise-removal), never cap
   by count and never emit `+N more`; if the de-duped stream still exceeds budget it falls to
   the step-2 complete-replacement summary (counts by severity + snapshot pointer), not a
   truncated tail. The capture-time `--tail 100` injection is removed — **capture rewrites
   must be lossless**
   (they may only make output more machine-readable, never pre-truncate the snapshot the
   recovery contract depends on). A live `-f`/`--follow` cannot be captured and passes through.

9. **Handler classifications settled here.** `next` route bundles are *size-class* (bundle
   size is the evidence, so a content-dropping digest is wrong): full list below budget, else
   cap top-by-size + recovery. `curl` bodies are a content blob: head-truncation stays, now
   with forced snapshot persistence and a snapshot pointer (decisions 4 + 6).

## Considered alternatives

- **Keep RTK caps + RTK byte-parity, accept the carve-out** (make the gate recognize
  `tk`'s own markers and whitelist "capping handlers"). Rejected: it institutionalizes
  hiding location evidence with no recovery, the exact PRINCIPLES.md anti-pattern.
- **Zero evidence-capping anywhere** (full listing always). Rejected for huge outputs:
  unbounded token cost is the very problem caps existed to solve; a location-lossless
  digest preserves every location at a fraction of the tokens.

## Consequences

- **Several handlers now intentionally diverge from RTK byte-parity** and must be pulled
  from the RTK parity suite and recorded as intentional divergences (consistent with the
  existing "keep divergences, move out of parity suite" decision):
  - grep (`200`/`25`) and pipe (`10`/`10`/`20`) lose their location-class caps → two-tier;
  - `docker`/`kubectl`/`compose logs` drop the capture-time `--tail 100` → full fetch + dedup;
  - `curl` and `compactDiff` swap their `tk --raw` re-run hint for a snapshot-file pointer.
- **Raw-save policy changes**: declared omission force-saves raw even on success and
  under the 20K threshold.
- **Handler return contract** gains an optional structured `omission` field; only the
  handlers that actually omit need to set it.
- **Tuning detail**: the exact token-budget value for the full→reduced flip (placeholder
  ~2000 tokens) should be calibrated against real fixtures.
- `tsc`/`mypy`'s `.slice(0, 5)` is on a derived "Top codes" summary line, not the error
  list — it is **not** evidence-capping and is unaffected.

## Handler audit (full sweep)

Verdict for every handler against the rules above. "Remove cap" = becomes full-below-budget
+ over-budget reduction + snapshot recovery.

- **Already compliant** (no count cap): `eslint`, `git-log`, `git-show`, `mypy`, `tsc`, `wc`,
  `git-status`, `git-extended`, `format`, `tree`.
- **Remove location-class cap**: `ruff` (`MAX_RUFF_VIOLATIONS=50`), `psql`
  (`MAX_TABLE_ROWS`/`MAX_EXPANDED_RECORDS=20`), `pytest` (`MAX_PYTEST_FAILURES=10` — failing
  test names are core evidence), `find` (`FIND_MAX_RESULTS=50`), `grep` (`200`/`25`),
  `pipe` (`10`/`10`/`20`).
- **Remove count cap, keep every unique line (stream-class)**: file `log` handler
  (`MAX_LOG_ERRORS=10`/`MAX_LOG_WARNS=5`); `docker`/`kubectl`/`compose logs` (also drop the
  capture-time `--tail 100`).
- **Remove cap, list in full (identity lists)**: `git-branch` (`MAX_REMOTE_BRANCHES=10`),
  `graphite` (`MAX_LOG_ENTRIES=15`), `env` (`MAX_PATH_ENTRIES=10`/`MAX_OTHER_VARS=20`).
- **Exit lossy compaction**: `json` stops dropping keys/array elements/depth/long strings;
  lossless regrid only, with an over-budget digest + recovery.
- **Flat all-evidence lists** (full below budget; over budget → complete-replacement
  summary + recovery, never `+N more`): `pip`, package list, `docker ps`/`docker images`,
  `aws` (already carries a `truncated` flag — closest to decision 5's structured signal),
  `prettier`.
- **Every `+N more` / `[+N more]` / bare `+N` / `… +N more` marker is deleted** from:
  `grep`, `pipe`, `ruff`, `psql`, `pytest`, `find`, `aws`, `pip`, `packageList`, `next`,
  `env`, `prettier`, `branch`, `graphite`, `json`, `docker` ps/images/compose. None survive.
- **Recovery-pointer fix (re-run → snapshot)**: `pytest` (`run with tk --raw …` hint),
  `curl`, `compactDiff`.
