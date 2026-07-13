---
case: 07
voter: codex
date: 2026-07-12
---

## Q1

**Score: false-reassurance**

The answer gets the main scan split partly right: unfiltered CLI runs call `inspectSinglePass`, while filtered runs call `scan` and then run habits separately (`src/inspect/cli.ts:284-320`), and `scan` selects `scanWindowed` when an `eventCache` object is present (`src/inspect/scan.ts:524-535`). However, the CLI always supplies that object, and `TK_NO_SCAN_CACHE` turns it into a no-op cache rather than removing it (`src/inspect/cli.ts:274-299`; `src/inspect/extractCache.ts:49-56,75-81`), so the claimed CLI no-cache route to `scanLive` is inaccurate: it remains `scanWindowed` and live-parses after per-file misses. More materially, cache hits validate only schema, mtime, and size, with the path used only to select an independently namespaced entry (`src/inspect/extractCache.ts:59-70,98-104`); there is no content identity check. A same-path, same-size rewrite whose mtime is preserved or collides can therefore leave one namespace holding an older extract while another is populated from newer content, and filtered reports also combine the event-stream scan with separately cached, unfiltered habits. The confirmed claim that the caches can *never* disagree is thus wrong on the material consistency question and would falsely reassure a reviewer.

## Q2

**Score: correct**

The pinned-ancestry query `git log 8de065d1e5972d357f21fe3bb470e166628e5365 --follow --format='%H %cI %an <%ae> %s' -- src/inspect/extractCache.ts` identifies `68153e814c71777b2fcfa8e3feda1bcc58580f97` as the introducing commit, and `git show -s --format='%H%n%P%n%an <%ae>%n%cI%n%B' 68153e81` records the path+mtime+size key, best-effort fallback, `TK_NO_SCAN_CACHE`, and 30-day pruning design. The introducing source explicitly says to bump `CACHE_SCHEMA_VERSION` when an existing cached payload shape changes and says namespaces separate different payload shapes (`git show 68153e81:src/inspect/extractCache.ts`, lines 31-33 and 73-80). Since `scan-events` is a new namespace rather than a changed `scan` or `habits` envelope, the operator's namespace-over-version-bump conclusion follows from the admissible original record.

## Q3

**Score: partial (2/4)**

Material sub-claims: (1) **correct** — `gh api 'repos/czync/token-killer/actions/runs?head_sha=99a1979d6d98c1519af6f4a8ef434358b07173c2&per_page=100' --jq '.workflow_runs[] | select(.created_at <= "2026-06-17T17:38:12Z") | {id,name,event,status,conclusion,created_at,updated_at,run_started_at,head_sha,html_url}'` shows the sole cutoff-admissible run completed with `failure` at `17:19:09Z;` (2) **incorrect** — only the first four acceptance criteria have direct unit counterparts in `extractCache.test.ts`; the fifth is the Windows dogfood cold/warm check in `scripts/windows-dogfood.ps1`, not an `extractCache.test.ts` identity check (`tests/unit/inspect/extractCache.test.ts:137-281`; `git show 99a1979d6d98c1519af6f4a8ef434358b07173c2 -- scripts/windows-dogfood.ps1`); (3) **correct** — the wall-clock test explicitly asserts `warmMs < coldMs * 0.5` (`tests/unit/inspect/extractCache.test.ts:203-225`); (4) **incorrect** — the exact “117 tests passing” count is author-asserted in the PR body, not contradicted by CI: `XDG_CACHE_HOME=/private/tmp/gh-cache-v0-vote-07-codex gh run view 27706801010 --repo czync/token-killer --log | rg 'test \((ubuntu|windows)-latest, (20|22)\).*(Test Files|Tests |117|extractCache\.test|test:product|Process completed with exit code)'` shows `extractCache.test.ts` passing 14 tests and the full source suite passing in all four cells, while the two Node 22 jobs failed later; CI therefore corroborates the relevant unit tests but not the exact scoped count. Fraction: **2/4**.

## Q4

**Score: partial (1/2)**

Material sub-claims: (1) **incorrect** — the answer understates the recorded convention: `vitest.config.ts:26-36` explicitly documents load-sensitive timeout flakiness and deliberately uses 30-second test/hook budgets, while `.github/workflows/ci.yml:12-17,42-62` layers job and process ceilings to turn hangs into diagnosable failures; `git blame -L 26,36 --date=iso-strict 8de065d1e5972d357f21fe3bb470e166628e5365 -- vitest.config.ts` and the corresponding blame on `.github/workflows/ci.yml` attribute both records to `cd536bf7`, whose `git log -S'testTimeout: 30000' ...` message is explicitly “stop test:product hanging + flaky boundary-spawn timeouts”; (2) **correct** — no admissible rule categorically bans relative wall-clock assertions, and the operator correctly identifies the new ratio assertion as load-sensitive and redundant to deterministic cache-hit/result assertions (`tests/unit/inspect/extractCache.test.ts:179-225`). The better conclusion is that it is not forbidden but does introduce the same recorded class of timing-flakiness risk. Fraction: **1/2**.

## Q5

**Score: correct**

The new namespace is explicitly included in the root-level prune loop, which removes cache files older than 30 days by the cache entry's own mtime and does not require the source path still to exist (`src/inspect/extractCache.ts:35-37,137-163`), and the CLI invokes pruning once before constructing all three namespaces (`src/inspect/cli.ts:268-280`). Each namespace maps a source path to one hashed filename, so rewrites replace that path's entry rather than append versions (`src/inspect/extractCache.ts:66-70,109-119`); together with age-based reclamation, that is the recorded growth control (though not a fixed byte quota). Finally, `TK_NO_SCAN_CACHE` is checked by the shared constructor before any directory or writer is created and by pruning itself (`src/inspect/extractCache.ts:49-56,75-81,141-147`), so it covers `scan-events` reads, writes, and pruning as claimed.
