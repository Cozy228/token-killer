# Goal: Align tk with rtk on correctness AND compression

Source of truth: `docs/three-way-comparison.md` (tk/rtk/raw three-way report).
`savingsPct` measures compression only, NOT correctness. Many high rtk scores are
rtk *failing* (empty output / parse error / wrong content). Always read the per-case
body before aligning. Rules:
- rtk correct AND compresses more -> align tk to rtk (raise tk compression).
- rtk wrong while tk correct -> keep tk, do NOT align down; record as divergence.
- Both correct, only format differs -> align to rtk format.
Regenerate the report afterward and verify numbers + correctness.

## B. tk correctness bugs (fix FIRST)
1. #12 git-diff: `tk filter git diff` emits 254 tokens (> raw 64) because it pulls the
   real working-tree diff/stat into fixture processing. In `src/handlers/git/`, ensure
   filter mode only processes the given stdin/fixture, never reads live repo state.
2. #9 log: `tk log <file>` shows 0 errors/0 warnings; rtk reports real counts
   (4 errors/3 warnings). Resolve the macOS `log` command vs "read log file" confusion;
   align to rtk's read-and-summarize behavior (see correct fixture case #47).

## C. Missing compression to recover (rtk correct + stronger), by payoff
3. tree: tk 0% vs rtk 86.8% (37k tokens uncompressed). Implement/enable tree output
   compression in tk (keep hierarchy, strip summary line). Highest payoff.
4. ruff: tk 27.3% vs rtk 95.5%. Strengthen the ruff handler to rtk's level, but KEEP
   rule code + file:line (correctness must not drop).
5. grep -r / search-like: tk 0% vs rtk 13%. Handle large `grep -r` in search-like.
6. ls -la: tk 69.1% vs rtk 77.1% (rtk drops the perms column). Evaluate aligning.
7. prettier (generic): tk 0% vs rtk 41.2% (rtk replaces with one summary line). Evaluate.

## A. Keep tk, mark as divergence (do NOT change tk output)
rtk is wrong here, tk is correct. Record reason in the audit doc:
- #4 psql (rtk empty table), #8 pip (JSON parse failed), #18 glab mr list (0 chars),
  #3 git-stash (invalid ref mislabeled "Empty stash"), #6 gt log (content drift),
  #13 eslint (JSON parse failed; tk is better).

## D. Format divergences (lowest priority)
#10/#15 find directory grouping, #11 git-log omission style. Align to rtk format only
where it does not reduce correctness; may be deferred.

## Constraints
- Package manager: pnpm. Code and comments in English.
- For each handler changed, add/update tests under `tests/unit/handlers` and verify
  correctness against fixtures.
- Never drop key diagnostics for compression: error codes, file:line, failing test
  names, counts.

## Acceptance
1. B fixed: #12 git-diff tokens < raw and reflect only the input; #9 log counts correct.
2. C: tk savingsPct for tree/ruff/grep rises near rtk without losing correctness.
3. A: tk output unchanged, each divergence recorded in the audit doc.
4. Regenerate `docs/three-way-comparison.md`; weighted tk savings >= current 34.5%;
   all related unit tests pass (both product and migration vitest configs).
5. Short report: per case — what changed, aligned vs kept, before/after numbers.
