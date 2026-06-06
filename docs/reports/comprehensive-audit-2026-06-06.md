# Comprehensive code audit — Token Killer (`tk`) — 2026-06-06

## Summary

Token Killer's hot path is small, fast, and architecturally sound: `cli → parse → router → executor → pipeline` is a single 54 KB bundle that cold-starts in ~35 ms, fail-open toward the real tool is robust and tested, the hook runtime's command rewrite preserves shell semantics, inspect uses one scan for all analyzers, telemetry honors never-sum and dual-consent, and the shim recursion guard works for the default install. **The problems cluster almost entirely in one place: the retention contract.** The single most important product invariant — "evidence-capping (`+N more` / `truncated` / `omitted`) is *banned outright*" (CONTEXT.md:281, PRINCIPLES.md) — is contradicted by roughly **20 handlers** that ship exactly those markers, and the two mechanisms meant to enforce the invariant are both blind: the runtime Safe-Compression-Gate detector (`outputOmitsContent`, base.ts:82) and the retention-P0 test's forbidden-pattern list (`LOSSY_OMISSION_PATTERNS`, fixtureContent.test.ts:13) share an identical regex bug — they anchor `+\d+ more (matches|files|…)` against a fixed noun list, while every real marker is `... +N more failures` / `… +N more` / `+N more rows`, so **9 of 11 real marker formats slip through both**. On top of that, `STRUCTURAL_HANDLERS` (base.ts:54) explicitly *exempts* the worst droppers (`json`, `git-diff`, `git-show`, `pip`, `read`, `env`) from the gate entirely, making their evidence loss unconditional.

**The single highest-leverage fix:** repair the omission detector — replace the noun-list/anchor regex in *both* `outputOmitsContent` (base.ts:82) and `LOSSY_OMISSION_PATTERNS` (fixtureContent.test.ts:13) with a form that matches `(\.\.\.|…|\+)\s*\+?\d+\s+more\b` and `\[\d+ more lines\]`, and exercise the cap branches with above-threshold fixtures. That one change gives both the runtime gate *and* the test gate teeth, and immediately surfaces (as failing tests) every handler that needs its cap converted to the honest over-budget ladder (count + persisted-snapshot pointer). It also forces the project-level decision the codebase is currently straddling: either the "banned outright" invariant is real (≈20 handlers are bugs) or it has been abandoned for RTK parity (CONTEXT.md / PRINCIPLES.md are badly out of date). Today the code says one thing and the docs say the opposite.

### Counts by bucket × severity

| Bucket | high | medium | low | total |
|---|---|---|---|---|
| CORRECTNESS-FAILOPEN | 6 | 4 | 3 | 13 |
| TESTING | 1 | 2 | 0 | 3 |
| SECURITY | 0 | 3 | 2 | 5 |
| HYGIENE-DOCS | 0 | 2 | 2 | 4 |
| ALGO | 0 | 1 | 1 | 2 |
| PERF | 0 | 0 | 1 | 1 |
| DETOUR | 0 | 0 | 1 | 1 |
| UNREASONABLE | 0 | 0 | 0 | 0 |
| **total** | **7** | **12** | **10** | **29** |

(UNREASONABLE findings were folded into their primary buckets — e.g. the dead `--max-lines` knob is filed HYGIENE-DOCS.)

---

## Top findings (ranked)

### 1. The omission detector and the retention test share a regex blind spot — the Safe Compression Gate effectively never fires `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/base.ts:82-98` (`outputOmitsContent`) and `tests/unit/handlers/fixtureContent.test.ts:13-20` (`LOSSY_OMISSION_PATTERNS`).
- **What:** The runtime gate that should detect content-omission and bounce a handler's output back to raw matches markers with `/^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/` (and a few exact phrases). The retention test's forbidden-pattern list uses the same noun-restricted, `+`-leading shape. But every actual marker in the codebase is emitted with a `...`/`…` prefix and nouns outside that list (`failures`, `routes`, `rows`, `records`, `dirs`, bare `+N`).
- **Why it's a problem:** This is the moat. `outputInflatesRaw` still catches size inflation, but `outputTruncatesContent` is *dead in practice* — a non-structural handler can cap evidence and the gate marks it `qualityStatus: "passed"`, shipping the capped output instead of failing open to raw. The retention-P0 test (the one enforcing gate for this invariant) cannot catch a regression that drops a failing assertion behind `... +N more failures`, because its own regex can't see that marker. Both the runtime safety net and the test net have the same hole.
- **Better path:** Replace the regex in both sites with `/(?:\.\.\.|…|\+)\s*\+?\d+\s+more\b/`, `/\[\d+ more lines\]/`, and `/\b(truncated|omitted|not shown)\b/`. Confirm with the 11-marker corpus below.
- **Evidence:** `node` run against the 11 real marker formats: `[12 more lines]` and `... (more changes truncated)` CAUGHT; the other 9 (`… +5 more`, `… +3 more failures`, `... +7 more`, `... +4 more routes`, `... +2 more packages`, `... +6 more failures`, `... +9 more`, `... +3 more files`, `... +5 more`) all MISSED. And the only two it catches are emitted solely by `STRUCTURAL_HANDLERS`, which bypass the check anyway (finding #3).

### 2. Pervasive evidence-capping across ~20 handlers contradicts the "banned outright" invariant `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where (each emits a first-N-then-overflow marker):** `python/ruff.ts:119`, `python/pip.ts:98,111`, `python/pytest.ts:158,204`, `js/test.ts:174`, `js/playwright.ts:156`, `js/next.ts:145`, `js/prettier.ts:104`, `js/packageList.ts:120`, `system/json.ts:92,127`, `system/read.ts:130`, `system/env.ts:160,195`, `system/format.ts:134,206,320`, `system/testRunner.ts:60,64`, `system/deps.ts:58-142`, `system/pipe.ts:72,109,114`, `cloud/container.ts:71,98,106,151,191,311,353`, `cloud/psql.ts:81,136`, `cloud/aws.ts:134,152,190,213,239,255`, `common/grepFilter.ts:236`, `common/listLike.ts:188`, `common/diff.ts:112`, `git/branch.ts:47`, `git/log.ts:27`, `git/graphite.ts:52`, `git/hostingCli.ts:130`, `git/compactDiff.ts:14,77`.
- **What:** Each shows the first N items then a `+N more` / `[N more lines]` / `... (more changes truncated)` marker. CONTEXT.md:279-285 and PRINCIPLES.md call this "Evidence-capping… Banned outright in `tk`… recovery does not redeem it."
- **Why it's a problem:** The product's stated moat vs RTK is that it *never* fake-completes. Several of these drop **location-class** or **failure** evidence the agent cannot recover: ruff diagnostics (#5), psql rows, aws resource IDs, git diff hunks (#6), the 6th+ failing test in `js/test`/`playwright`/`testRunner`. The known RTK-parity divergence (memory `rtk-migration-format-conflicts`) explains *why* they exist but does not reconcile them with the still-published invariant.
- **Better path:** Convert each cap to the over-budget ladder (CONTEXT.md:287-296): lossless reduction first, then a complete-replacement summary (count + per-group counts + persisted snapshot pointer) — never a partial list. Prioritize location-class handlers (ruff, mypy-adjacent, grep, diff, psql, aws).
- **Evidence:** exhaustive grep above; cross-referenced against CONTEXT.md's banned-marker enumeration.

### 3. `STRUCTURAL_HANDLERS` exempts the worst droppers from the gate, making evidence loss unconditional `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/base.ts:54-80` (`STRUCTURAL_HANDLERS` includes `json`, `git-diff`, `git-show`, `diff`, `pip`, `read`, `env`, `log`, `summary`, `test`, `deps`, `pytest`, `tsc`, `mypy`, `curl`, `gh`, `glab`, `git-status`, `git-push`); applied at base.ts:116-122 where `!isStructural` short-circuits both inflation and omission checks.
- **What:** For these handlers, *neither* the inflation check *nor* the omission check runs — whatever the handler emits ships verbatim, regardless of how much it dropped.
- **Why it's a problem:** `json` (system/json.ts:67-128) silently drops array elements past 5, object keys past 20, and every nested subtree below depth 5 — an API/tool JSON payload loses rows and values with no possible fallback. `git-diff`/`git-show` cap hunks (finding #6). `pip` caps inventory. The exemption was added so RTK-style structural reformats aren't bounced for *benign size inflation on tiny inputs*, but it was implemented as a blanket gate-bypass that also disables the *content-omission* protection — two different concerns collapsed into one flag.
- **Better path:** Split the flag: keep a `structuralInflationExempt` set (suppress only `outputInflatesRaw`) but run `outputTruncatesContent` for *all* handlers once #1 is fixed, so a structural handler that genuinely omits content still fails open.
- **Evidence:** base.ts:115-122; json drop traced at system/json.ts:90-128 (also an off-by-one: the key-limit check at :126 runs after pushing key i, emitting 21 keys before the "20" cap).

### 4. `docker`/`kubectl`/`compose logs` inject `--tail 100` at capture time — the snapshot is pre-truncated and unrecoverable `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/cloud/container.ts:406` (`LOGS_TAIL="100"`), injected in `buildDockerArgs` at :461 (compose logs) and :471 (docker logs), and the kubectl equivalent at :503.
- **What:** Before spawning, the handler rewrites `docker logs <c>` → `docker logs --tail 100 <c>`. The child only ever produces the last 100 lines, so `maybeSaveRawOutput` persists an already-truncated stream.
- **Why it's a problem:** CONTEXT.md "Lossless capture" forbids exactly this: "Injecting a lossy fetch limit (`logs --tail N`) is forbidden — it pre-truncates the very snapshot the Recovery contract relies on, so no later channel can recover what was never captured." A panic/stack trace older than 100 lines is gone permanently, with no raw to fall back to. Stream-class evidence may only be losslessly de-duped (and the formatters at container.ts don't even do that — they just `raw.trim()`).
- **Better path:** Remove the `--tail` injection; capture the full stream and de-dup repeated lines losslessly in `formatDockerLogs`/`formatKubectlLogs`; over budget, go to a severity-count summary + snapshot pointer.
- **Evidence:** container.ts:436-473 read directly; `firstLogsOperand` confirms the operand-preserving rewrite is real production code in `execute()`.

### 5. `ruff` (and `psql`, `aws`) cap location-class / resource evidence past a fixed N `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `python/ruff.ts:21` (`MAX_RUFF_VIOLATIONS=50`, enforced :111-119); `cloud/psql.ts:12-13,81,136` (`MAX_TABLE_ROWS=20`); `cloud/aws.ts:12,134-255` (`MAX_ITEMS=20`).
- **What:** ruff lists ≤50 violations then `... +N more`; psql shows ≤20 rows/records then `... +N more rows`; aws caps every resource list at 20-30 with `… +N more`.
- **Why it's a problem:** ruff diagnostics are the canonical **location-class** evidence ("Never evidence-capped", CONTEXT.md:300) — each suppressed line is a `file:line:col` the agent would open. psql drops SQL rows (the oracle-named retention regression). aws drops EC2 instance IDs / S3 keys / stack names. None are structural, but their markers slip the gate (#1), and none cite a persisted snapshot. `aws`'s `FilterResult.truncated` is even computed and then never used to revert.
- **Better path:** Never cap location-class diagnostics; for resource lists, lossless digest (all IDs, drop only decoration) then count+pointer over budget. Positive note: `filterLambdaList` (aws.ts:235) correctly omits `Environment` — no secret leak.
- **Evidence:** ruff cap pinned by `tests/unit/handlers/rtkRuffBehavior.test.ts:51`; psql/aws traced by the family sweep.

### 6. `compactDiff` caps diff hunks (location-class) and cites a banned `tk --raw` re-run recovery pointer `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/git/compactDiff.ts:10` (`maxHunkLines=100`), :51-67 (lines past 100/hunk → counted, not shown), :76-80 (`... (more changes truncated)` at 500 lines), :87 (`[full diff: tk --raw git diff]`). Consumed by `git/diff.ts` and `git/show.ts`.
- **What:** Shows the first 100 changed lines per hunk and hard-stops at 500 output lines, then points recovery at a `tk --raw` re-run.
- **Why it's a problem:** Diff hunks are location-class and must never be capped (CONTEXT.md:300). The 101st changed line in a hunk is a unique change line, not dedup-able repetition. And the recovery pointer is the explicitly-banned form: CONTEXT.md "Recovery contract" (:372) requires the *persisted snapshot file path*, "not a `tk --raw <cmd>` re-run — a re-run re-executes the command and can drift." `searchLike.ts:143` has the same banned `tk --raw` pointer for grep matches.
- **Better path:** Keep every hunk line; over budget, replace with per-file `+A -R` counts + the persisted snapshot path. Replace both `tk --raw` pointers with the snapshot path.
- **Evidence:** compactDiff.ts read in full; both call sites traced.

### 7. `dotnet test --logger trx` mis-attributes failure messages by positional index-zip `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/dotnet/dotnet.ts:65-88` (`formatDotnetTrx`).
- **What:** `names` is collected only from `<UnitTestResult … outcome="Failed">` (:70-73), but `messages` is collected from **every** `<Message>` element in the whole TRX (:76-79) — including passing tests' `<Output><Message>` stdout and `<ResultSummary>` text — then zipped to names by index (`messages[index]`, :84).
- **Why it's a problem:** A failing test is shown the *wrong* error message — often a passing test's stdout. The agent reads a fabricated failure reason and chases the wrong cause. This is a retention *corruption*, worse than a drop.
- **Better path:** Parse each `<UnitTestResult outcome="Failed">…</UnitTestResult>` block as a unit and extract its own inner `<Message>`/`<ErrorInfo>`, rather than globally collecting and index-zipping.
- **Evidence:** the agent reproduced it: a TRX with a passing test's Output Message before a failing test's ErrorInfo Message renders `FailingTest -> "<passing test's stdout>"`. The single-failure fixture in `rtkDotnetTrxBehavior.test.ts` never exercises the misalignment.

### 8. Retention-P0 has an enforcing test, but it is false-green `[TESTING]` severity:high confidence:confirmed
- **Where:** `tests/unit/handlers/fixtureContent.test.ts` over `tests/helpers/fixtureCases.ts`.
- **What:** The test asserts each fixture's `critical` lines survive and no `LOSSY_OMISSION_PATTERNS` appear. But (a) it only runs over a curated fixture set whose inputs are sized *below* every handler's cap threshold, so the cap branches (the dangerous ones) are never exercised; and (b) its forbidden-pattern regex has the same blind spot as the runtime gate (#1), so even an above-threshold fixture emitting `... +N more failures` would pass.
- **Why it's a problem:** This is precisely the documented false-green pattern (memory `test-gate-honesty-fixes`): the gate is green because the inputs never trigger the loss, not because loss is prevented. Retention-P0 is the invariant the project calls 100%-mandatory, and its guard proves the easy case only.
- **Better path:** Add above-threshold fixtures per capping handler (e.g. a pytest run with 12 failures, a ruff run with 60 violations, a psql result with 30 rows) asserting the full evidence survives; fix the `LOSSY_OMISSION_PATTERNS` regex per #1.
- **Evidence:** test body read; `fixtureCases.ts` critical-line sets are all small; cross-checked against the cap thresholds.

### 9. Static-context findings persist verbatim user file content, breaking the labels-and-lengths-only privacy promise `[SECURITY]` severity:medium confidence:confirmed
- **Where:** `src/context/rules/duplicates.ts:76` and `:67` (heading into the pre-hash `idExtra`); `src/context/rules/alwaysOn.ts:71,76,110-112`; `src/context/rules/prompts.ts:71` (`tools.join(", ")`). Reaches disk via `inspect/cli.ts:236-243` → `persist.ts` (`~/.token-killer/.../inspect/latest.json`) and `cli.ts:262-276` → `advice/inspect-report.json`.
- **What:** Section headings are arbitrary user-authored body text (a heading could read `## Deploy creds for prod-db`). They are copied verbatim into the `evidence` field (and into the id-hash input), then serialized to two on-disk artifacts.
- **Why it's a problem:** Every module header asserts "lengths and sanitized LABELS only — never file/result content" (scan.ts:6, advice.ts:2, report.ts:2). A heading line is raw body content. This is the one place the promise breaks. Blast radius is bounded — the **telemetry/network** path (`telemetry.ts:11-31`) emits only numeric counts, so nothing leaves the machine — but the persisted artifact is the exact contract `tk optimize context` and the docs treat as label-safe.
- **Better path:** Replace verbatim headings with the locator already on the finding (`file` + `start_line`/`end_line`) or a heading hash, in both `evidence` and `idExtra`. `conflicts.ts:98` and `cacheability.ts:49` already do this correctly (fixed label + `file:line` + counts).
- **Evidence:** serialized `Finding` field set confirmed to carry `evidence` verbatim; no sanitization layer between rule output and disk; runtime findings (unified.ts:71) model it correctly.

### 10. Shim recursion guard is defeated by a symlinked / non-canonical PATH alias `[SECURITY]` severity:medium confidence:confirmed
- **Where:** `src/shim/path.ts:20-39` (`normalizeEntry`/`stripShimDir`) and `:97-123` (`assertNoRecursion`).
- **What:** Normalization does `normalize()` + trailing-slash strip + (win32) lowercase but never `realpathSync`. If a PATH entry is a symlink to the shim dir (or reaches it via a symlinked parent — macOS `/var`→`/private/var`, a symlinked `$HOME`), the string compare misses it: the alias is not stripped, `resolveReal` resolves `git` back into the wrapper via the alias, and `assertNoRecursion` passes because the resolved path doesn't `startsWith(canonicalShimDir + sep)`. The child then re-enters the shim → fork bomb.
- **Why it's a problem:** This is the exact failure the guard exists to prevent. The default installer prepends the canonical absolute path, so the common case is safe — hence medium, not high — but a symlinked tools dir or `$HOME` is plausible.
- **Better path:** `realpathSync` (best-effort) both the shim dir and each candidate before comparing, or canonicalize `resolved` before the `startsWith(target)` check.
- **Evidence:** reproduced live — `PATH=/tmp/rg/shimlink` (symlink→shim) leaves the alias unstripped, `resolveReal git → /tmp/rg/shimlink/git`, sentinel PASSED. `path.test.ts:33` only covers prefix-sharing dirs, not the symlink case.

### 11. `--max-lines` / `--max-chars` are advertised but dead; `limitOutput` is a no-op `[HYGIENE-DOCS]` severity:medium confidence:confirmed
- **Where:** `src/core/outputLimit.ts:1-13` (`limitLines`/`limitChars`/`limitOutput` all return their input unchanged), called at `base.ts:109-110`; flags parsed at `parse.ts:96-105`, defaults `DEFAULT_MAX_LINES=120`/`DEFAULT_MAX_CHARS=12000` (parse.ts:3-4), advertised in `cli.ts` help (:48-49).
- **What:** The global `--max-lines`/`--max-chars` flags are parsed into `TkOptions`, fed only to the no-op `limitOutput`, and have zero effect on compressed output. (Per-command `--max-lines` *inside* the `read`/`readLike` handlers is a separate, working path.)
- **Why it's a problem:** Help promises behavior that doesn't exist; an agent (the real CLI reader, per PRINCIPLES.md) that sets `--max-lines 40` to bound output gets 120-line-default-ignored full output. Dead knob + docs drift on the user-facing surface.
- **Better path:** Either implement `limitOutput` (a true over-budget ladder honoring the budget) or remove the global flags and their help text and the dead `DEFAULT_MAX_*` constants.
- **Evidence:** `limitOutput` body is `return text`; grep confirms base.ts is the only non-handler caller.

### 12. `common/diff.ts` allocates an O(n·m) LCS matrix on the hot path with no size guard `[ALGO]`/`[PERF]` severity:medium confidence:confirmed
- **Where:** `src/handlers/common/diff.ts:22-33` (`lcsChanges`), reached on every `tk diff file1 file2`.
- **What:** Allocates a dense `(oldLines+1)×(newLines+1)` number matrix before computing. Two 5,000-line files ≈ 25M cells (~200 MB) and O(n·m) time, with no cap and no fall-through to the real `diff` binary.
- **Why it's a problem:** Hot path; on large file pairs this is a memory/time cliff, and it violates "compression uncertain → return raw" — there is no threshold that falls back to `executeCommand` (already imported in the file).
- **Better path:** Above a line-count threshold, fall through to `executeCommand` (real `diff`); or use linear-space Hirschberg/Myers.
- **Evidence:** matrix size computed with `node -e`; no guard in the function.

---

## By module

- **core (cli/parse/router/executor/pipeline/savings/history/rawStore/text/tokens/patterns):** Hot path is clean and fast — single bundle, ~35 ms cold start, no double-routing (the resolved handler is passed into `shouldCompress`), pass count over output is bounded (~3-4). `executeCommand` buffers the whole output (Buffer arrays + `concat`) rather than streaming — inherent to capture-then-compress, acceptable. `history.recordHistory` appends with `flag:"a"` — atomic for sub-PIPE_BUF lines (JSON rows are small), so concurrent `tk` writes are safe in practice. **Issues:** the no-op `outputLimit` (#11) and `patterns.IMPORTANT_PATTERN` is a safe literal-alternation (no ReDoS).
- **handlers (≈58% of source):** Where the audit lives. The `+N more` family (#2), the gate bypass (#3), and several family-specific drops: js (`test`/`playwright` 5-failure cap, `next build` flattened to counts — next.ts:89-95, `prisma` migrate-deploy drops errors past 5 silently with *no* marker — prisma.ts:247), python (ruff #5, pytest 3-line intra-block silent cap — pytest.ts:194), java (maven/gradle/javac allowlist + silent `slice(0,80)`, javac hardcodes the fixture method name `submitOrder` — javac.ts:23, no behavior tests for maven/javac), cloud (#4, psql/aws/curl caps), system (json #3, pipe grep/find drops), dotnet (#7). `common/` carries the hot-path LCS (#12) and two separate hand-rolled unified-diff parsers (`common/diff.ts` vs `git/compactDiff.ts` — DETOUR). **iac (terraform): clean** — retention-first, fail-open, no caps.
- **hook:** **Largely clean.** Fail-open is robust and empirically verified across malformed/`null`/non-JSON/unknown-dialect payloads — nothing throws to the host. The chain/quote rewrite (`rewrite.ts`) preserves quoting, `&&`/pipes/redirects, and command-substitution; it does *not* `split(' ')`-corrupt. One real bug: a leading `env VAR=val <cmd>` (also `time`/`nice`/`nohup`) rewrites to `tk env …`, and `routeSpecific` matches the `env` handler, so git's output gets parsed as env vars and mangled (rewrite.ts:153 + env.ts) — low-medium SECURITY/correctness, and the one untested rewrite branch. The single canonical `category` enum is correct (no duplicate classifier). Privacy of `recordHookFailure` holds (empty command, hashed fingerprint).
- **inspect:** **Sound.** One scan feeds all analyzers (no re-read), clean aggregate-only telemetry, correct separate scope buckets. Its only exposure is the static-context heading leak it persists (#9).
- **context:** Single-read analyzer is well-factored; rules embed verbatim headings/tool-names into persisted `evidence`/`id` (#9); `resolveLivePath` (optimizeCli.ts) lacks a path-containment check (low — mitigated by `body_hash` gating on the write path).
- **shim:** Sound design, well-tested; the recursion guard's missing `realpath` (#10) is the one real bug. Hot-path probe/detect logic is cold-path-only (init/install/status), not on `tk <cmd>`.
- **telemetry:** Logic correct — never-sum holds (ledger.ts:173-187, enforced by ledger.test.ts), dual-consent is upgrade-safe (local export never reaches the network sender), fail-open on dead endpoint. Weakened only because its best unit tests (`tests/unit/telemetry/**`) are **not in the enforcing `vitest.config.ts` include list**, so the consent gate has no gated coverage (#14 below).

---

## By dimension

- **UNREASONABLE:** Folded into primary buckets; the clearest example is the dead `--max-lines` knob (#11) and the blanket `STRUCTURAL_HANDLERS` gate-bypass collapsing two concerns (#3).
- **PERF:** Hot path verdict: **clean** — 54 KB bundle, ~35 ms, no perceptible eager-import cost despite cli.ts importing every subcommand statically (esbuild bundles to one file; parse cost is single-digit ms). The one perf cliff is the unbounded LCS (#12), a hot-path concern only on large inputs.
- **ALGO:** LCS matrix (#12); `git/graphite.ts:6,48` runs a backtracking-prone email regex per line over semi-untrusted `gt` output (quadratic — 80k char line ≈ 13 s, filed SECURITY/#below); `system/log.ts:79` does O(unique²) re-normalization but is bounded by maxItems. No `new RegExp` in per-line loops found.
- **DETOUR:** Two unified-diff parsers; `truncate()` duplicated in `git/graphite.ts` and `git/hostingCli.ts`. Minor — `handlers/common/` is otherwise used well (ANSI strip via `core/ansi`, shared `level.ts`).
- **CORRECTNESS-FAILOPEN:** The dominant dimension — findings #1-#8, plus curl 500-byte truncation unrecoverable in the 500-20 KB range (curl.ts:7,57), maven/gradle silent `slice(0,80)`, prisma silent 5-error drop. Fail-open *to raw on error* is solid (cli.ts try/catch ladder, tested); the failure is fail-open *on content omission*, which the broken detector defeats.
- **TESTING:** Retention-P0 false-green (#8); telemetry unit tests excluded from the gate (#14); every cap branch across js/python/java is untested (a regression dropping a real failing assertion would stay green); maven/javac have no behavior tests. **The real gate `test:ci` is honest** — `test:product && test:install && check-test-presence && validate-docs && smoke`, all `&&`-joined fail-fast; `test:migration:report`'s `|| true` is correctly *not* in the chain.
- **SECURITY:** Heading leak (#9), shim symlink bypass (#10), graphite ReDoS, env-prefix output-mangling, `resolveLivePath` no containment (low). No command injection in rewrite/executor (rewrite preserves semantics; executor uses `shell:false` with explicit argv and proper Windows `.cmd` quoting). Inspect telemetry/network output is leak-free.
- **HYGIENE-DOCS:** Dead `--max-lines` knob (#11); **docs drift is structural** — CONTEXT.md:281 / PRINCIPLES.md declare evidence-capping "banned outright" while ~20 handlers ship it; `next.ts:13` dead `ROUTE_PATTERN`; javac fixture-name leak. `tsc --noEmit` strict gaps were not exhaustively swept (see Suspected).

---

## Suspected (lower confidence)

- **ReDoS in `dotnet.ts:115` `ISSUE_RE` and `js/eslint.ts:47`** — lazy `.+?` + trailing anchor run per line via `String.match` over attacker-influenceable compiler/lint output. Plausibly quadratic on a crafted long line with no closing token; not reproduced. Would confirm by timing a 100 KB no-match line.
- **`ruff` matcher substring bug** — `command.original.join(" ").includes("ruff check")` (ruff.ts:24) matches `truffle check`. Real false-positive surface; low impact. Confirm: route `["truffle","check"]` and observe the ruff formatter applied.
- **`tsc --noEmit` strict / `any` proliferation** — not run as part of this audit; the codebase is disciplined by inspection but a full strict-mode pass was not done. Would confirm by running `pnpm tsc --noEmit` and grepping `: any`.
- **`resolveLivePath` path traversal** — a tampered `latest.json` with `file: "../../etc/…"` could steer optimize reads/writes outside cwd; mitigated by the `body_hash` write-gate. Confirm by feeding a crafted bucket through `tk optimize context --apply-safe`.

## Out of scope (appendix)

- **Whether to keep the RTK-parity caps at all** — this is a product decision (memory `rtk-migration-format-conflicts` says align to RTK on conflict). The audit's job is to surface that the code and the published invariant disagree; choosing which to change is the team's call.
- **Migration test track (`vitest.migration.config.ts`, `test:migration:report`)** — its `|| true` is intentional and correctly excluded from `test:ci`; not re-litigated here.
- **`executeCommand` full-output buffering** — inherent to the capture-then-compress design; streaming would be a larger architectural change, noted not filed.
- **Windows `.cmd`/PATHEXT spawn path** — reviewed in executor.ts and looks correct (CVE-2024-27980 handled via ComSpec); not exercised on a Windows host in this audit.

---

## Other confirmed findings (medium/low, condensed)

13. **`env VAR=val <cmd>` rewrite corrupts output** `[SECURITY]` medium — `hook/rewrite.ts:153` + `handlers/system/env.ts`: a leading `env`/`time`/`nice`/`nohup` wrapper routes to the `env` handler, which parses the wrapped tool's stdout as env vars. Fix: treat wrapper-prefixed commands as ineligible in `isEligible`.
14. **Telemetry unit tests excluded from the enforcing gate** `[TESTING]` medium — `vitest.config.ts` omits `tests/unit/telemetry/**`; `dispatch.test.ts` (the consent-gate / fail-open assertions) never runs in `test:ci`. Fix: add the include glob.
15. **`next build` failure flattened to counts** `[CORRECTNESS-FAILOPEN]` medium — `js/next.ts:89-95,156`: a failed build's `file:line` TS/compile error is reduced to `Errors: N | Warnings: N`. Fix: on non-zero exit, pass through or route to the tsc formatter.
16. **maven/gradle/javac allowlist + silent `slice(0,80)`** `[CORRECTNESS-FAILOPEN]` medium — `java/maven.ts:7-15`, `gradle.ts:7-18`, `javac.ts:20-26`: an allowlist drops chained-exception / `Caused by:` lines, then a hard 80-line slice with no marker; maven/javac have no behavior tests. javac also hardcodes the fixture method name `submitOrder` (javac.ts:23).
17. **curl truncates non-JSON body at 500 bytes, unrecoverable in 500–20 KB range** `[CORRECTNESS-FAILOPEN]` medium — `cloud/curl.ts:7,57`: cites a banned `tk --raw` re-run pointer; `maybeSaveRawOutput` doesn't persist bodies under 20 KB on exit 0, so the cut bytes are gone.
18. **`graphite` email regex ReDoS over untrusted output** `[SECURITY]`/`[ALGO]` medium — `git/graphite.ts:6,48`: `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g` run per line; measured 80 KB line ≈ 13 s. Fix: truncate the line before the `.replace` (currently truncates after).
19. **`prisma migrate deploy` drops errors past 5 with no marker** `[CORRECTNESS-FAILOPEN]` low — `js/prisma.ts:247`: `errors.slice(0,5)` silently — strictly worse than a `+N more` (no signal at all).
20. **`resolveLivePath` lacks path containment** `[SECURITY]` low — `context/optimizeCli.ts` (~:93): no assertion that the resolved path stays under cwd/home; mitigated by the `body_hash` write-gate.
21. **`json` key-limit off-by-one** `[HYGIENE-DOCS]` low — `system/json.ts:126`: emits 21 keys before the "20" cap (check runs after pushing key i).
22. **Duplicated `truncate()` + two unified-diff parsers** `[DETOUR]` low — `git/graphite.ts:14`, `git/hostingCli.ts:83`; `common/diff.ts` vs `git/compactDiff.ts`. Extract a shared helper.
