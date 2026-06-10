# Comprehensive code audit — Token Killer (`tk`) — 2026-06-06

> Read-only audit across eight dimensions. Mandate: `docs/comprehensive-code-audit-goal.md`.
> Merged from two independent audit passes (this file supersedes `docs/reports/audit-2026-06-06.md`).

## Summary

Token Killer's hot path is small, fast, and architecturally sound: `cli → parse → router → executor → pipeline` is a single 54 KB bundle that cold-starts in ~35 ms, fail-open *to raw on error* is robust and tested, the hook runtime's command rewrite preserves shell semantics, inspect uses one scan for all analyzers, telemetry honors never-sum and dual-consent, and the shim recursion guard works for the default install. **The problems cluster almost entirely in one place: the retention contract — and that contract is already designed.** `docs/adr/0001-evidence-class-capping-and-recovery.md` (status: **accepted**) explicitly mandates removing every `CAP_*` constant and `+N more` marker, replacing them with a two-step over-budget ladder plus a guaranteed recovery contract — and it names the exact defect that the safety gate is "blind to `tk`'s own capping." **None of that ADR has been implemented.** ~20 handlers still ship `+N more` / `… +N more` / `[N more lines]` markers, and the gate (`outputOmitsContent`, base.ts:82) plus the retention-P0 test (`LOSSY_OMISSION_PATTERNS`, fixtureContent.test.ts:13) share an identical regex bug — they anchor `+\d+ more (matches|files|…)` against a fixed noun list, while every real marker is `... +N more failures` / `… +N more` / `+N more rows`, so **9 of 11 real marker formats slip through both**. `STRUCTURAL_HANDLERS` (base.ts:54) then exempts the worst droppers (`json`, `git-diff`, `git-show`, `pip`, `read`, `env`) from the gate entirely, making their evidence loss unconditional. A close second, on a different surface: the shipped hook's wire output (`toProtocol()`, copilot.ts:26) emits a shape **no real host reads** (ADR 0005 §6), so the hook *governance* tier is inert on VS Code and Copilot CLI (terminal compression still works via the shim).

**The single highest-leverage fix:** execute ADR 0001 — repair the omission detector in *both* `outputOmitsContent` (base.ts:82) and `LOSSY_OMISSION_PATTERNS` (fixtureContent.test.ts:13) to match `(\.\.\.|…|\+)\s*\+?\d+\s+more\b` and `\[\d+ more lines\]`, add above-threshold fixtures, then convert each capping handler to the ladder (count + persisted-snapshot pointer). That one change gives both the runtime gate *and* the test gate teeth and surfaces every offending handler as a failing test. Note this *resolves* the apparent tension with the RTK-parity memory (`rtk-migration-format-conflicts`): ADR 0001 is the explicit carve-out where `tk` must **not** inherit RTK's behavior — so the caps are not an open product question, they are unfinished accepted work.

### Counts by bucket × severity

| Bucket | high | medium | low | total |
|---|---|---|---|---|
| CORRECTNESS-FAILOPEN | 7 | 4 | 2 | 13 |
| TESTING | 1 | 1 | 0 | 2 |
| SECURITY | 0 | 4 | 1 | 5 |
| HYGIENE-DOCS | 0 | 3 | 1 | 4 |
| ALGO | 0 | 1 | 2 | 3 |
| DETOUR | 0 | 2 | 1 | 3 |
| PERF | 0 | 1 | 0 | 1 |
| UNREASONABLE | 0 | 0 | 0 | 0 |
| **total** | **8** | **16** | **7** | **31** |

---

## Top findings (ranked)

### 1. ADR 0001 is unimplemented — ~20 handlers cap evidence and the gate is blind to their markers `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** Markers (each first-N-then-overflow): `python/ruff.ts:119`, `python/pip.ts:98,111`, `python/pytest.ts:158,204`, `js/test.ts:174`, `js/playwright.ts:156`, `js/next.ts:145`, `js/prettier.ts:104`, `js/packageList.ts:120`, `system/json.ts:92,127`, `system/read.ts:130`, `system/env.ts:160,195`, `system/format.ts:134,206,320`, `system/testRunner.ts:60,64`, `system/deps.ts:58-142`, `system/pipe.ts:72,109,114`, `system/summary.ts:159,182`, `cloud/container.ts:71,98,106,151,191,311,353`, `cloud/psql.ts:81,136`, `cloud/aws.ts:134-255`, `common/grepFilter.ts:236`, `common/listLike.ts:188`, `common/diff.ts:112`, `git/branch.ts:47`, `git/log.ts:27`, `git/graphite.ts:52`, `git/hostingCli.ts:130`, `git/compactDiff.ts:14,77`. Blind detectors: `src/handlers/base.ts:82-98` and `tests/unit/handlers/fixtureContent.test.ts:13-20`.
- **What:** ADR 0001 (accepted) mandates: no `+N more` anywhere; an over-budget ladder (lossless reduction → complete-replacement summary + snapshot pointer); and retiring the prose-sniffing gate in favor of a structured `omission` field. None of it is done. The gate's regex matches `/^\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)$/` (plus a few exact phrases); the retention test's forbidden list has the same shape. Every real marker is `...`/`…`-prefixed with nouns outside that list (`failures`, `routes`, `rows`, `records`, `dirs`, bare `+N`).
- **Why it's a problem:** This is the moat vs RTK. `outputInflatesRaw` still catches size inflation, but `outputTruncatesContent` is **dead in practice** — a non-structural handler caps evidence and the gate marks it `qualityStatus:"passed"`, shipping the capped output instead of failing open to raw. The retention-P0 test cannot catch a regression that drops a failing assertion behind `... +N more failures`. ADR 0001 §Context already diagnosed exactly this ("the gate is blind to `tk`'s own capping").
- **Better path:** Per ADR 0001: fix both regexes to `/(?:\.\.\.|…|\+)\s*\+?\d+\s+more\b/`, `/\[\d+ more lines\]/`, `/\b(truncated|omitted|not shown)\b/`; convert handlers to the ladder family-by-family (start location-class: ruff, grep, diff, psql, aws); set a structured `omission:{kind,snapshotPath}` and retire prose-sniffing.
- **Evidence:** `node` run vs the 11 real markers: only `[12 more lines]` and `... (more changes truncated)` CAUGHT, the other 9 MISSED — and those two are emitted solely by `STRUCTURAL_HANDLERS` that bypass the gate anyway (#2). ADR 0001 §"Decision" item 2 + §"Context" item 1 confirm the mandate and the diagnosis.

### 2. `STRUCTURAL_HANDLERS` exempts the worst droppers from the gate, making evidence loss unconditional `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/base.ts:54-80` (set includes `json`, `git-diff`, `git-show`, `diff`, `pip`, `read`, `env`, `log`, `summary`, `test`, `deps`, `pytest`, `tsc`, `mypy`, `curl`, `gh`, `glab`, `git-status`, `git-push`); applied at base.ts:116-122 where `!isStructural` short-circuits *both* the inflation and the omission check.
- **What:** For these handlers neither check runs — whatever they emit ships verbatim, however much was dropped.
- **Why it's a problem:** `json` (system/json.ts:67-128) silently drops array elements past 5, object keys past 20, and every nested subtree below depth 5 — an API/tool payload loses rows and values with no fallback. `git-diff`/`git-show` cap hunks (#6). `pip` caps inventory. The exemption was meant only to stop benign *size* inflation on tiny structural reformats, but it was coded as a blanket gate-bypass that also disables *content-omission* protection — two concerns collapsed into one flag.
- **Better path:** Split it: keep a `structuralInflationExempt` set (suppresses only `outputInflatesRaw`) but run `outputTruncatesContent` for *all* handlers once #1 is fixed.
- **Evidence:** base.ts:115-122; json drop traced at system/json.ts:90-128 (also an off-by-one at :126 — emits 21 keys before the "20" cap).

### 3. Hook wire output conforms to no host protocol — the governance tier is inert on real hosts `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/hook/copilot.ts:26-32` (`toProtocol()`).
- **What:** `toProtocol()` emits `{ decision, rewritten_command, reason, additional_context }`. ADR 0005 (read directly from `microsoft/vscode-copilot-chat`, `hookCommandTypes.ts`) shows VS Code PreToolUse expects `hookSpecificOutput.{ permissionDecision: 'allow'|'deny'|'ask', updatedInput, additionalContext }`; RTK's VS Code handler returns `"updatedInput":{"command":rewritten}`. Copilot CLI uses its own `permissionDecision`/`modifiedArgs` shape. `tk`'s shape matches neither.
- **Why it's a problem:** The hook is a delivery tier. A host that can't parse the output ignores the rewrite/deny, so the hook's **governance** (deny/ask on expensive direct reads, command rewrite-via-hook) does nothing on VS Code or Copilot CLI. ADR 0005 §6 states it plainly: "Until a host-protocol adapter is added, the shipped hook does nothing on a real host." Severity is high for the governance tier, *but bounded*: per ADR 0005 decision 2 the PATH shim is the primary terminal-compression delivery and already ships — so terminal compression is unaffected; only hook-mediated governance is inert.
- **Better path:** Add a per-dialect adapter keyed on the already-normalized `ev.dialect`: emit VS Code shape (`hookSpecificOutput` + `permissionDecision` + `updatedInput`) vs Copilot CLI shape (`permissionDecision` + `modifiedArgs`), per ADR 0005 §Consequences item 1.
- **Evidence:** copilot.ts:26-32 read; ADR 0005 decision 6 + the quoted extension interface. (This was missed by the perf/structure pass and surfaced by the second audit; confirmed here.)

### 4. `docker`/`kubectl`/`compose logs` inject `--tail 100` at capture time — the snapshot is pre-truncated and unrecoverable `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/cloud/container.ts:406` (`LOGS_TAIL="100"`), injected in `buildDockerArgs` at :461 (compose logs) and :471 (docker logs), kubectl at :503.
- **What:** Before spawning, `docker logs <c>` → `docker logs --tail 100 <c>`. The child only ever produces the last 100 lines, so `maybeSaveRawOutput` persists an already-truncated stream.
- **Why it's a problem:** CONTEXT.md "Lossless capture" forbids exactly this — a lossy fetch limit "pre-truncates the very snapshot the Recovery contract relies on, so no later channel can recover what was never captured." A stack trace older than 100 lines is gone permanently, with no raw to fall back to. Stream-class evidence may only be losslessly de-duped (and the formatters don't even do that — they `raw.trim()`).
- **Better path:** Remove the `--tail` injection; capture the full stream and de-dup repeated lines losslessly; over budget → severity-count summary + snapshot pointer.
- **Evidence:** container.ts:436-473; `firstLogsOperand` confirms it is real production code in `execute()`.

### 5. `ruff` (and `psql`, `aws`) cap location-class / resource evidence past a fixed N `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `python/ruff.ts:21` (`MAX_RUFF_VIOLATIONS=50`, :111-119); `cloud/psql.ts:12-13,81,136` (`MAX_TABLE_ROWS=20`); `cloud/aws.ts:12,134-255` (`MAX_ITEMS=20`).
- **What:** ruff lists ≤50 violations then `... +N more`; psql ≤20 rows then `... +N more rows`; aws caps each resource list at 20-30 with `… +N more`.
- **Why it's a problem:** ruff diagnostics are canonical **location-class** evidence ("Never evidence-capped", CONTEXT.md:300) — each suppressed line is a `file:line:col` the agent opens. psql drops SQL rows; aws drops EC2 IDs / S3 keys / stack names. None are structural, so their markers slip the gate (#1) with no snapshot cited. `aws`'s `FilterResult.truncated` is computed and never used to revert.
- **Better path:** Never cap location-class diagnostics; for resource lists, lossless digest then count+pointer over budget. (Positive: `filterLambdaList` aws.ts:235 correctly omits `Environment` — no secret leak.)
- **Evidence:** ruff cap pinned by `rtkRuffBehavior.test.ts:51`; psql/aws traced.

### 6. `compactDiff` caps diff hunks (location-class) and cites a banned `tk --raw` re-run pointer `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/git/compactDiff.ts:10` (`maxHunkLines=100`), :51-67 (lines past 100/hunk counted, not shown), :76-80 (`... (more changes truncated)` at 500 lines), :87 (`[full diff: tk --raw git diff]`). Used by `git/diff.ts` and `git/show.ts`. Same banned `tk --raw` pointer at `common/searchLike.ts:143` for grep.
- **What:** Shows the first 100 changed lines per hunk, hard-stops at 500 lines, then points recovery at a re-run.
- **Why it's a problem:** Diff hunks are location-class and must never be capped (CONTEXT.md:300); the 101st changed line is a unique change, not dedup-able repetition. The recovery pointer is the banned form — CONTEXT.md "Recovery contract" (:372) and ADR 0001 decision 4 require the *persisted snapshot path*, "not a `tk --raw` re-run … [which] can drift."
- **Better path:** Keep every hunk line; over budget → per-file `+A -R` counts + snapshot path. Replace both `tk --raw` pointers with the snapshot path.
- **Evidence:** compactDiff.ts read in full; both call sites traced.

### 7. `dotnet test --logger trx` mis-attributes failure messages by positional index-zip `[CORRECTNESS-FAILOPEN]` severity:high confidence:confirmed
- **Where:** `src/handlers/dotnet/dotnet.ts:65-88` (`formatDotnetTrx`).
- **What:** `names` is collected only from `<UnitTestResult … outcome="Failed">` (:70-73), but `messages` from **every** `<Message>` in the TRX (:76-79) — including passing tests' `<Output><Message>` stdout and `<ResultSummary>` — then zipped by index (`messages[index]`, :84).
- **Why it's a problem:** A failing test is shown the *wrong* error message, often a passing test's stdout. The agent reads a fabricated failure reason — a retention *corruption*, worse than a drop.
- **Better path:** Parse each `<UnitTestResult outcome="Failed">…</UnitTestResult>` block as a unit, extract its own inner `<Message>`/`<ErrorInfo>`.
- **Evidence:** reproduced — a passing test's Output Message before a failing test's ErrorInfo renders `FailingTest -> "<passing test's stdout>"`. The single-failure fixture never exercises the misalignment.

### 8. Retention-P0 has an enforcing test, but it is false-green `[TESTING]` severity:high confidence:confirmed
- **Where:** `tests/unit/handlers/fixtureContent.test.ts` over `tests/helpers/fixtureCases.ts`.
- **What:** Asserts each fixture's `critical` lines survive and no `LOSSY_OMISSION_PATTERNS` appear. But (a) it only runs over curated fixtures sized *below* every cap threshold, so the dangerous cap branches are never exercised; and (b) its forbidden regex has the same blind spot as the runtime gate (#1), so an above-threshold fixture emitting `... +N more failures` would still pass.
- **Why it's a problem:** The documented false-green pattern (memory `test-gate-honesty-fixes`): green because inputs never trigger the loss, not because loss is prevented. Retention-P0 is the 100%-mandatory invariant and its guard proves only the easy case.
- **Better path:** Add above-threshold fixtures per capping handler (pytest 12 failures, ruff 60 violations, psql 30 rows) asserting full evidence survives; fix the regex per #1.
- **Evidence:** test body read; `fixtureCases.ts` critical sets are all small; cross-checked vs cap thresholds.

### 9. Static-context findings persist verbatim user file content, breaking the labels-and-lengths-only privacy promise `[SECURITY]` severity:medium confidence:confirmed
- **Where:** `src/context/rules/duplicates.ts:76` and `:67` (heading into the pre-hash `idExtra`); `src/context/rules/alwaysOn.ts:71,76,110-112`; `src/context/rules/prompts.ts:71` (`tools.join(", ")`). To disk via `inspect/cli.ts:236-243` → `persist.ts` (`…/inspect/latest.json`) and `cli.ts:262-276` → `advice/inspect-report.json`.
- **What:** Section headings are arbitrary user body text (could read `## Deploy creds for prod-db`). Copied verbatim into `evidence` (and the id-hash input), then serialized to two on-disk artifacts.
- **Why it's a problem:** Module headers assert "lengths and sanitized LABELS only — never file/result content" (scan.ts:6, advice.ts:2, report.ts:2). A heading is raw body content. **The earlier pass that gave inspect a clean privacy bill under-audited `context/rules/**`; this is the one real leak.** Bounded blast radius — the telemetry/network path (`telemetry.ts:11-31`) emits only numeric counts, so nothing leaves the machine — but the persisted artifact is the label-safe contract `tk optimize` consumes.
- **Better path:** Replace verbatim headings with the finding's own `file`+`start_line`/`end_line` or a heading hash, in both `evidence` and `idExtra`. `conflicts.ts:98` / `cacheability.ts:49` already do this correctly.
- **Evidence:** serialized `Finding` field set carries `evidence` verbatim; no sanitization layer; runtime findings (unified.ts:71) model it correctly.

### 10. Shim recursion guard is defeated by a symlinked / non-canonical PATH alias `[SECURITY]` severity:medium confidence:confirmed
- **Where:** `src/shim/path.ts:20-39` (`normalizeEntry`/`stripShimDir`), `:97-123` (`assertNoRecursion`).
- **What:** Normalization does `normalize()` + trailing-slash strip + (win32) lowercase but never `realpathSync`. A PATH entry that is a symlink to the shim dir (or reaches it via a symlinked parent — macOS `/var`→`/private/var`, a symlinked `$HOME`) isn't stripped; `resolveReal` resolves `git` back into the wrapper via the alias; `assertNoRecursion` passes because the resolved path doesn't `startsWith(canonicalShimDir + sep)`. The child re-enters the shim → fork bomb.
- **Why it's a problem:** Exactly the failure the guard exists to prevent. The default installer prepends the canonical absolute path (common case safe → medium), but a symlinked tools dir or `$HOME` is plausible.
- **Better path:** `realpathSync` (best-effort) both the shim dir and each candidate before comparing.
- **Evidence:** reproduced live — `PATH=/tmp/rg/shimlink`(→shim) leaves the alias unstripped, `resolveReal git → /tmp/rg/shimlink/git`, sentinel PASSED. `path.test.ts:33` covers only prefix-sharing dirs.

### 11. `--max-lines` / `--max-chars` are advertised but dead; `limitOutput` is a no-op `[HYGIENE-DOCS]` severity:medium confidence:confirmed
- **Where:** `src/core/outputLimit.ts:1-13` (all three functions `return text`), called at `base.ts:109-110`; flags parsed at `parse.ts:96-105`; defaults `DEFAULT_MAX_LINES=120`/`DEFAULT_MAX_CHARS=12000`; advertised in help (cli.ts:48-49).
- **What:** Global `--max-lines`/`--max-chars` are parsed into `TkOptions`, fed only to the no-op `limitOutput`, and have zero effect. (Per-command `--max-lines` *inside* `read`/`readLike` is a separate working path.)
- **Why it's a problem:** Help promises behavior that doesn't exist; an agent setting `--max-lines 40` gets full output. Dead knob + user-facing docs drift.
- **Better path:** Implement `limitOutput` as a true ladder, or remove the global flags + help text + dead constants.
- **Evidence:** `limitOutput` body is `return text`; base.ts is the only non-handler caller.

### 12. `common/diff.ts` allocates an O(n·m) LCS matrix on the hot path with no size guard `[ALGO]` severity:medium confidence:confirmed
- **Where:** `src/handlers/common/diff.ts:22-33` (`lcsChanges`), on every `tk diff file1 file2`.
- **What:** Allocates a dense `(oldLines+1)×(newLines+1)` matrix before computing. Two 5,000-line files ≈ 25M cells (~200 MB), O(n·m), no cap and no fall-through to real `diff`.
- **Why it's a problem:** Hot path; memory/time cliff on large pairs; violates "compression uncertain → return raw" (no threshold falls back to `executeCommand`, already imported).
- **Better path:** Above a line-count threshold, fall through to real `diff`; or linear-space Hirschberg/Myers.
- **Evidence:** matrix size computed with `node -e`; no guard.

### 13. Hook install writes a bare `tk hook copilot` command — inert on Windows PowerShell `[CORRECTNESS-FAILOPEN]` severity:medium confidence:confirmed
- **Where:** `src/hook/install.ts:38` — `command: "tk hook copilot"`.
- **What:** The installed hook config hardcodes a bare, PATH-dependent executable.
- **Why it's a problem:** ADR 0005 §5: on Windows PowerShell a bare `tk` fails with `CommandNotFoundException` (the spike only worked with an absolute node path). A hook installed on Windows is inert — compounding #3.
- **Better path:** Resolve the absolute `node` + `cli.js` path at install time, per ADR 0005 §5.
- **Evidence:** install.ts:38 read; ADR 0005 §5.

---

## Other confirmed findings (medium / low, condensed)

14. **`env VAR=val <cmd>` rewrite corrupts output** `[SECURITY]` medium — `hook/rewrite.ts:153` + `system/env.ts`: a leading `env`/`time`/`nice`/`nohup` wrapper routes to the `env` handler, which parses the wrapped tool's stdout as env vars. Fix: treat wrapper-prefixed commands as ineligible in `isEligible`. (Untested branch.)
15. **Telemetry unit tests excluded from the enforcing gate** `[TESTING]` medium — `vitest.config.ts` omits `tests/unit/telemetry/**`; `dispatch.test.ts` (consent-gate + fail-open) never runs in `test:ci`. Fix: add the include glob. (NB: the second audit framed the 63 `rtk*Behavior` migration tests' `|| true` as a high TESTING gap; that exclusion is intentional debt per `vitest.migration.config.ts`, but it does mean handler-behavior regressions don't block PRs — worth moving completed suites into the product track as migration finishes.)
16. **`next build` failure flattened to counts** `[CORRECTNESS-FAILOPEN]` medium — `js/next.ts:89-95,156`: a failed build's `file:line` error is reduced to `Errors: N | Warnings: N`. Fix: on non-zero exit, pass through or route to the tsc formatter.
17. **maven/gradle/javac allowlist + silent `slice(0,80)`** `[CORRECTNESS-FAILOPEN]` medium — `java/maven.ts:7-15`, `gradle.ts:7-18`, `javac.ts:20-26`: an allowlist drops `Caused by:`/stack frames, then a hard 80-line slice with no marker; maven/javac have no behavior tests; javac hardcodes the fixture method name `submitOrder` (javac.ts:23).
18. **curl truncates non-JSON body at 500 bytes, unrecoverable in 500–20 KB range** `[CORRECTNESS-FAILOPEN]` medium — `cloud/curl.ts:7,57`: banned `tk --raw` pointer; `maybeSaveRawOutput` doesn't persist sub-20 KB bodies on exit 0.
19. **`graphite` email regex ReDoS over untrusted output** `[SECURITY]` medium — `git/graphite.ts:6,48`: per-line `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g`; measured 80 KB line ≈ 13 s. Fix: truncate the line before `.replace` (currently after). **Corrects the second audit's "No ReDoS found."**
20. **`truncate()` duplicated 8×** `[DETOUR]` medium — identical `truncate(text,maxLen)` in `dotnet.ts:12`, `graphite.ts:14`, `hostingCli.ts:83`, `js/next.ts:29`, `js/tsc.ts:25`, `python/mypy.ts:20`, `python/pytest.ts:21`, `system/summary.ts:14`. Extract one into `core/text.ts` / `handlers/common/`.
21. **`readLike.ts` ships its own level parser** `[DETOUR]` medium — `common/readLike.ts:9,59-121` defines `ReadLevel`/`parseReadLevel` (with a one-off `"balance"→"balanced"` alias) instead of `common/level.ts` (used correctly by searchLike/format). Two divergent level vocabularies.
22. **`readLike.readInternally` reads whole files into memory** `[PERF]` medium — `common/readLike.ts:132-185`: full `readFile` → concat → `split(/\r?\n/)`; ~3× file size allocated for a 10 MB file. The aggressive level exists precisely to avoid this; stream with `readline`.
23. **Stale hardcoded handler lists in CI scripts** `[HYGIENE-DOCS]` medium — `scripts/validate-docs.sh:13` (`PROGRAMS`), `scripts/check-test-presence.sh:81` (`KNOWN_HANDLERS`) drift from the 55+ registry. Derive from `handlers.map(h => h.name)`.
24. **`any` proliferation in JSON-parse handlers** `[HYGIENE-DOCS]` medium — `js/packageList.ts:30,36`, `python/pip.ts:27`, `cloud/aws.ts`, `dotnet/dotnet.ts` use `any` for `JSON.parse` results where others define interfaces. Use `unknown` + type guards. (`tsc --noEmit` is otherwise clean under `strict`.)
25. **`prisma migrate deploy` drops errors past 5 with no marker** `[CORRECTNESS-FAILOPEN]` low — `js/prisma.ts:247`: `errors.slice(0,5)` silently (worse than a `+N more`).
26. **`resolveLivePath` lacks path containment** `[SECURITY]` low — `context/optimizeCli.ts` (~:93): no assertion the resolved path stays under cwd/home; mitigated by the `body_hash` write-gate.
27. **`json` key-limit off-by-one** `[HYGIENE-DOCS]` low — `system/json.ts:126`: emits 21 keys before the "20" cap.
28. **`log.ts` O(unique²) re-normalization** `[ALGO]` low — `system/log.ts:78-79`: `.find()` re-runs regex normalization per comparison; build a normalized→original map. Bounded by maxItems.
29. **Two hand-rolled unified-diff parsers** `[DETOUR]` low — `common/diff.ts` (`condenseUnifiedDiff`) vs `git/compactDiff.ts` (`compactUnifiedDiff`), different markers; the `condenseUnifiedDiff` branch is also untested.
30. **Double line-splitting per compression** `[ALGO]` low — handlers split by `/\r?\n/`, then `base.ts:83` splits again for the gate. Pass pre-split `lines[]` into `outputOmitsContent`.
31. **pytest per-failure detail capped at 3 lines, silently** `[CORRECTNESS-FAILOPEN]` low — `python/pytest.ts:194`: only 3 relevant lines kept per failure block, no marker; a chained `Caused by:` crash reason on the 4th+ line is lost.

---

## By module

- **core (cli/parse/router/executor/pipeline/savings/history/rawStore/text/tokens/patterns):** Hot path clean and fast — single bundle, ~35 ms cold start, no double-routing (resolved handler passed into `shouldCompress`), bounded pass count (~3-4). `executeCommand` buffers whole output rather than streaming — inherent to capture-then-compress, acceptable. `history.recordHistory` appends with `flag:"a"` (atomic for sub-PIPE_BUF JSON rows). `rawStore` writes a unique timestamped file per call, so its single multi-line `writeFile` is **not** a concurrent torn-write risk (the second audit's #12 over-states this). Real issues: the no-op `outputLimit` (#11). `patterns.IMPORTANT_PATTERN` is a safe literal alternation.
- **handlers (≈58% of source):** Where the audit lives. ADR-0001 capping (#1), the gate bypass (#2), and family drops: js (`test`/`playwright` 5-failure cap, `next build` flattened #16, `prisma` silent 5-error drop #25), python (ruff #5, pytest #31), java (allowlist + `slice(0,80)` #17, javac fixture-name leak), cloud (#4, psql/aws/curl), system (json #2, pipe). Duplication: `truncate()` ×8 (#20), `readLike` own level parser (#21), two diff parsers (#29). **iac (terraform): clean.**
- **hook:** Fail-open is robust and empirically verified across malformed/`null`/non-JSON/unknown-dialect payloads — nothing throws to the host. The chain/quote rewrite preserves quoting, `&&`/pipes/redirects, command-substitution (no `split(' ')` corruption). Single canonical `category` enum (no duplicate classifier). `recordHookFailure` privacy holds. **But** the wire output conforms to no host protocol (#3, ADR 0005) and the install command is bare (#13), and `env`-prefixed commands corrupt output (#14). The runtime is correct; the host *contract* is not wired.
- **inspect:** Sound — one scan feeds all analyzers (no re-read), aggregate-only telemetry, correct separate scope buckets. Its only exposure is the static-context heading leak it persists (#9).
- **context:** Single-read analyzer is well-factored, but `rules/**` embed verbatim headings/tool-names into persisted `evidence`/`id` (#9) and `resolveLivePath` lacks containment (#26). **This module was under-audited by the first pass and is where the privacy leak lives.**
- **shim:** Sound design, well-tested; the recursion guard's missing `realpath` (#10) is the one real bug. Probe/detect logic is cold-path-only.
- **telemetry:** Logic correct — never-sum holds (ledger.ts:173-187, gated by ledger.test.ts), dual-consent upgrade-safe, fail-open on dead endpoint. Weakened only by its best unit tests being excluded from the gate (#15).

---

## By dimension

- **UNREASONABLE:** Folded into primary buckets; clearest is the dead `--max-lines` knob (#11) and the blanket `STRUCTURAL_HANDLERS` bypass collapsing two concerns (#2).
- **PERF:** Hot-path verdict **clean** — 54 KB bundle, ~35 ms; cli.ts eagerly imports every subcommand but esbuild bundles to one file and parse cost is single-digit ms (the second audit's "eager imports = PERF high" was a static-only estimate; **measured, it's negligible** — not worth dynamic-import complexity). Real perf items: unbounded LCS (#12), whole-file read (#22).
- **ALGO:** LCS (#12); graphite ReDoS (#19, filed SECURITY); `log.ts` O(unique²) (#28); double line-split (#30). No `new RegExp` in per-line loops.
- **DETOUR:** `truncate()` ×8 (#20), `readLike` level parser (#21), two diff parsers (#29). `handlers/common/` is otherwise used well (ANSI via `core/ansi`, shared `level.ts`).
- **CORRECTNESS-FAILOPEN:** The dominant dimension — #1-#8, #13, #16-#18, #25, #31. Fail-open *to raw on error* is solid (cli.ts ladder, tested); the failures are fail-open *on content omission* (broken detector) and *on host-contract conformance* (hook).
- **TESTING:** Retention-P0 false-green (#8); telemetry tests excluded (#15); every cap branch untested; maven/javac have no behavior tests. **The real gate `test:ci` is honest** — `test:product && test:install && check-test-presence && validate-docs && smoke`, all `&&` fail-fast; `test:migration:report`'s `|| true` is correctly out of the chain (though it leaves 63 behavior tests non-blocking — see #15).
- **SECURITY:** Heading leak (#9), shim symlink bypass (#10), env-prefix corruption (#14), graphite ReDoS (#19), `resolveLivePath` (#26). No command injection in rewrite/executor (`shell:false`, explicit argv, correct Windows `.cmd` quoting). Telemetry/network output is leak-free.
- **HYGIENE-DOCS:** Dead `--max-lines` (#11); stale CI lists (#23); `any` proliferation (#24); json off-by-one (#27); structural docs alignment — **CONTEXT.md/PRINCIPLES.md/ADR 0001 are now *consistent* on banning caps; it's the code that lags**, so this is implementation debt, not docs drift. `next.ts:13` dead `ROUTE_PATTERN`. Single runtime dep (`strip-ansi`), `node>=20` OK, `tsc --noEmit` clean under `strict`.

---

## Suspected (lower confidence)

- **ReDoS in `dotnet.ts:115` `ISSUE_RE` and `js/eslint.ts:47`** — lazy `.+?` + trailing anchor per line over compiler/lint output; plausibly quadratic on a crafted long line, not reproduced. Confirm by timing a 100 KB no-match line.
- **`ruff` matcher substring bug** — `command.original.join(" ").includes("ruff check")` (ruff.ts:24) matches `truffle check`. Confirm by routing `["truffle","check"]`.
- **`container.ts` ~650-line monolith** — the per-resource formatters could be split; suspected maintainability cost only.
- **`history.ts` `listProjectHistories`/`listProjectHistoriesSync` near-duplicate** — async vs sync twins; suspected DETOUR.
- **`resolveLivePath` traversal** — a tampered `latest.json` with `file:"../../etc/…"` could steer optimize reads/writes; mitigated by the `body_hash` write-gate. Confirm via a crafted bucket through `tk optimize --apply`.

## Out of scope (appendix)

- **Whether to keep the RTK-parity caps** — **not an open question:** ADR 0001 (accepted) already decided to remove them and is the explicit carve-out from the RTK-parity memory. Listed here only to retract the earlier "product decision" framing.
- **Migration test track (`vitest.migration.config.ts`, `test:migration:report`)** — its `|| true` is intentional and correctly excluded from `test:ci`; the coverage consequence is captured in #15.
- **`executeCommand` full-output buffering** — inherent to capture-then-compress; streaming would be a larger architectural change.
- **Windows `.cmd`/PATHEXT spawn path** — reviewed in executor.ts and looks correct (CVE-2024-27980 handled via ComSpec); not exercised on a Windows host here.
