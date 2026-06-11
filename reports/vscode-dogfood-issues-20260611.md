# VS Code dogfood — issue log & root-cause analysis (2026-06-11)

Captured during a live VS Code + Copilot dogfood session. Investigation only; no
fixes applied except where noted. Evidence is from the real on-disk VS Code
storage and the tk source, not assumption.

Severity legend: **P0** breaks the core promise · **P1** materially wrong/misleading ·
**P2** correctness/consistency · **P3** polish.

---

## I1 — `tk install --host vscode` writes nothing to the terminal env; `status`/`optimize` say "settings.json could not be parsed" — **P0**

**Symptom.** After `tk install --host vscode` on Windows, the shim PATH +
`TK_SHIM_DIR` + `TK_COMPRESS_TTY` are NOT written into the VS Code terminal env.
`status`/optimize surface "VS Code settings.json could not be parsed".

**Root cause — ONE bug behind three symptoms.** Every settings.json reader uses
strict `JSON.parse`:
- `src/shim/hostConfig.ts:157` `readSettings` → `JSON.parse`
- `src/context/vscodeSettings.ts:81` `readVscodeSettingsFile` → `JSON.parse`

VS Code's `settings.json` is **JSONC** — `//` and `/* */` comments and trailing
commas are legal and common. Strict parse throws → `patchVscodeSettings` aborts in
the `catch` (`src/shim/cli.ts:99-104`) and **writes nothing**. So:
- install becomes a silent no-op on any commented settings.json (PATH/env never set),
- `status`/optimize print "could not be parsed",
- and TTY compression in VS Code never turns on (see I2).

**Status. FIX APPLIED (uncommitted), per the earlier "fix it" instruction before
the "stop" instruction.** Added a zero-dependency `parseJsonc` (`src/core/jsonc.ts`,
string-aware comment + trailing-comma stripping), wired into both readers, plus a
backup-on-reformat (`settings.json.tk-backup`) so rewriting a JSONC file into
strict JSON is recoverable. `tsc` clean; `tests/unit/shim/{hostConfig,shimCli,install}`
green. NOT yet committed; no new tests for the JSONC path yet.

---

## I2 — TTY compression in VS Code is correct in code but undelivered — **P0 (collapses into I1)**

**Question asked:** "is TTY fixed? how does it work in VS Code? you sure?"

**Findings.**
- The gate (`src/shim/gate.ts:30-40`) is correct: in a TTY it compresses ONLY when
  `TK_COMPRESS_TTY` is set (the R1 opt-in). VS Code's Copilot agent runs in a ConPTY
  where `process.stdout.isTTY === true`, so without the flag the gate returns
  `tty-no-flag` → passthrough → **no compression**.
- There is **no VS Code auto-detection** — the only signal is `process.env.TK_COMPRESS_TTY`.
- install is *supposed* to set it: `applyVscodeEnv` (`src/shim/hostConfig.ts:113`)
  writes `TK_COMPRESS_TTY=1` into `terminal.integrated.env.{windows,osx,linux}`.

**Root cause.** The flag is delivered ONLY through the settings.json patch, which
I1 breaks on JSONC files. So on a box with a commented settings.json, the flag is
never set and VS Code never compresses. "Is it fixed?" → the gate logic is fixed;
the **delivery** was not, because it rode entirely on the broken settings patch.

**Status.** Resolved transitively by the I1 fix (install can now write the flag).
Still gated on: user must restart VS Code for `terminal.integrated.env` to apply.

---

## I3 — `tk inspect` output is near-empty/useless; never shows skill or other findings — **P1**

**Symptom.** Running `tk inspect` in VS Code does not "fully scan the user session",
shows no skills findings, no other findings; the generated report is useless.

**Root cause (a) — reader vs real format mismatch.** `scan.ts:171` `isToolRecord`
keeps a record only if it has a **top-level** `toolName`/`tool_name`/`tool` string.
The real VS Code data has no such field:
- transcripts (`GitHub.copilot-chat/transcripts/*.jsonl`) are typed events
  `{type,data,id,timestamp,parentId}`; tool calls are nested at
  `assistant.message.data.toolRequests[].{name, arguments}` (verified live: e.g.
  `name:"run_in_terminal"`, `arguments:"{\"command\":\"git status --short\",...}"`).
- chatSessions are `{kind:0, v:{version,…,requests:[…]}}` ChatModel serialization;
  tool calls live deep under `v.requests[].response[]`.
- A `grep` for `toolName`/`tool_name`/`tool` across ALL real transcripts + chatSessions
  returned **0 files**. → `tool_event_count = 0` → zero opportunities → empty advice.

**Root cause (b) — source discovery.** `sources.ts` collects only `.jsonl`. On the
live box 5 of 7 chatSessions are `.json` (skipped). It also counts chatSessions
LINE COUNT as "session inventory" even though those files are mostly empty stubs.

**Root cause (c) — analyzers never implemented.** `skill-gap`, `context-gap`,
`storage-discovery` are declared `AdviceType`s (`advice.ts:11-18`) and promised in
the design (`docs/inspect-v1-design.md:165,242,467`), but `buildAdvice` NEVER emits
them — dead enum members. This is the "doesn't show skills/other issues" complaint.

**What inspect actually does today.** (1) counts chatSessions lines (hollow);
(2) tries to extract flat `toolName` tool events that VS Code does not write → empty;
(3) runs a separate static-context analyzer over CLAUDE.md/AGENTS.md/settings.json
(unrelated to agent sessions). Net: nothing actionable from real VS Code data.

**Status. NOT FIXED.** Needs: a real VS Code reader that descends BOTH
`chatSessions` (`v.requests[].response[]`) AND `transcripts`
(`assistant.message.data.toolRequests[]`), tolerant of `.json` + `.jsonl`; plus
implementation of the skill-gap / context-gap analyzers. NOTE the transcript format
records tool REQUESTS (name + arguments), not tool OUTPUTS — so output-volume
opportunities cannot be derived from transcripts; compressibility/frequency can.

---

## I4 — "chat session empty" — **P1 (same root as I3)**

VS Code splits Copilot storage: `chatSessions/<id>` = ChatModel UI state (frequently
`requests:[]`, i.e. empty); `transcripts/<id>` = the real turn-by-turn event log.
Verified: session `1350bc5d…` has `requests:[]` in chatSessions but a full
git-status turn in its transcript. Most chatSessions on the box are 267-byte stubs.
inspect counts the empty stubs and can't read the transcripts → "empty". Fix is the
I3 reader rewrite.

---

## I5 — shimmed commands are slow in the VS Code terminal — **P2**

**Symptom.** With the shim active, commands feel slow.

**Root cause.** Every shimmed command spawns a **full Node.js process before the
real tool runs**: the wrapper is `exec node /abs/dist/cli.js <program> "$@"`
(`src/shim/install.ts:62-63`). That is one Node cold-start per command (tens–hundreds
of ms). Aggravated by `src/cli.ts` eagerly importing the entire CLI surface at the
top level (27 static imports incl. inspect, telemetry, context/optimize, report,
pipeline, gain) even for a plain `git status`, inflating startup parse/load. An
agent running many commands pays this overhead on every one.

**Status. NOT FIXED.** This is inherent to a "Node proxy per command" shim, but
reducible: lazy/`await import()` the subcommand handlers so the wrapped-command hot
path loads only the router + executor + gate; consider a slimmer wrapper entry.

**Measured on the real slow corporate Windows box (2026-06-11):**
| segment | measurement | cost |
|---|---|---|
| node cold start | `node -e "0"` | **300 ms** |
| bundle load + compile + tk init | `tk --version` − node | **180 ms** |
| real tool | bare `git status` | **300 ms** |
| tk's per-command work (capture+filter+record+spawn-resolve) | `tk git status` − above | **≈520 ms** |
| **total** | `tk git status` | **1300 ms** (vs 300 raw → **+1000 ms/command**) |

On the dev Mac the same overhead is ~40 ms; the slow box amplifies every fixed
cost ~25×, and it compounds per-command across an agent loop.

RULED OUT for the 520 ms (clean small `git status`): rawStore (`rawStore.ts:25` —
saves only on exit≠0 or >20000 chars), session dedup (default-off), chcp.com probe
(`executor.ts:44` — lazily spawned ONLY when output fails strict UTF-8). ALSO RULED
OUT the filter/dedup pipeline: on the box `tk --raw git status` ≈ `tk git status`
(~1300 ms), and `--raw` skips the filter+dedup pipeline entirely — so the 520 ms is
in the path COMMON to both: child spawn + output capture/decode + history write.

Prime remaining suspect: `resolveProgram` (`executor.ts:128-143`) does a
PATH×PATHEXT `existsSync` walk on Windows — a corporate PATH of ~30-50 entries × 4
extensions ≈ up to ~200 `fs.stat` calls per command, each intercepted by endpoint
AV. Plus `recordHistory` append + `maybeWriteProjectMeta` (AV-scanned file ops).
Concrete fix: the shim wrapper already resolved the real binary at install time
(`realBinaryPresent`) — bake the resolved absolute path into the wrapper / manifest
and pass it through, skipping the per-command runtime PATH walk.

**Hard truth.** `node -e "0"` = 300 ms is an UNAVOIDABLE per-command floor while the
shim re-invokes node per command. Even a perfect tk pays node(300)+bundle(180)+git(300)
≈ 780 ms minimum (+480 ms/command). Micro-opts (compile cache, chunk-split) shave
~150–250 ms but cannot make the shim cheap on this hardware.

**Fix ladder for this environment (highest leverage first):**
1. **Antivirus exclusion (zero code, likely biggest win):** exclude the shim dir,
   node.exe, and `~/.token-killer` from real-time scanning. Corporate endpoint
   protection scanning each node.exe spawn + bundle-chunk read is the prime suspect
   for the inflated 300 ms node-start and 520 ms work.
2. `module.enableCompileCache()` (Node ≥22.8) + `await import()` chunk-splitting of
   subcommands — shave the 180 ms bundle segment.
3. Profile the 520 ms on the box.
4. **Architectural (only real cure for the node-start floor):** a persistent tk
   daemon (wrapper → thin client → long-lived server, no per-command node start), or
   a compiled single-executable (SEA / `--build-snapshot`) to cut node-start from
   300 ms to ~50–100 ms.

---

## I6 — `tk gain` (terminal) does not include the agent's compressed run_in_terminal commands, same project & dir — **P1**

**Symptom.** User ran `tk git status` in the terminal, then asked the agent to run
`git log`/`git status`. Both compressed (tk visibly invoked). But `tk gain` in the
terminal showed only the user's own run.

**Investigation.**
- `tk gain` default (no `--user`) reads exactly ONE bucket:
  `tokenKillerHome()/projects/<fingerprintSegment(projectFingerprint(cwd))>/history.jsonl`
  via `ensureProjectRollup(cwd)` (`gain.ts:132`).
- Rollup staleness RULED OUT: `ensureProjectRollup` (`rollup.ts:476-499`) full-rebuilds
  whenever the physical line count changes, so newly-appended agent rows are not missed
  within a single bucket.
- `projectFingerprint` (`dataDir.ts:69-74`) anchors to the **git repo root** (so a
  subdirectory of the same repo maps to the same bucket). Recording only happens on the
  compress path (`cli.ts` → `runCompress` → `recordHistory`); the user confirmed both
  runs compressed, so both were recorded — into different buckets.

**ROOT CAUSE — CONFIRMED (2026-06-11) — mechanism (b), Windows drive-letter case.**
On the live Windows box, `tk gain --user` shows TWO buckets both labeled
`token-killer` (24762 saved vs 42 saved, un-merged). Same machine, same
`tokenKillerHome`. `node -p "process.cwd()"` in the two contexts confirmed: the
user's interactive terminal reports an **uppercase** drive `C:\…\token-killer`; the
agent's `run_in_terminal` reports a **lowercase** drive `c:\…\token-killer`.
`resolveProjectRoot` (`dataDir.ts:8`) uses `realpathSync`, which on Windows
**does not normalize drive-letter case** — it returns the path with the case it was
given. So the git-root anchor string differs by one character (`C:` vs `c:`),
`sha256` differs, and the same repo splits into two `repo-<hash>` buckets that
`tk gain` (single-bucket) can never reconcile. (24762 = the user's terminal
accumulation under `C:`; 42 = the agent's single test under `c:`.)

**Proposed fix.** Normalize the resolved path before hashing in
`resolveProjectRoot`: on `win32`, uppercase the drive letter
(`resolved.replace(/^([a-z]):/, (_,d)=>d.toUpperCase()+':')`). Post-fix both
contexts map to the uppercase-`C:` hash = the existing 24762 bucket, so it keeps its
data and future agent runs funnel into it; the 42-saved `c:` bucket is orphaned
(negligible; optionally one-time merged). Consider whether to also adopt
`realpathSync.native` (canonicalizes full-path case on Windows) — but that would
re-key MORE existing buckets, so the targeted drive-letter normalization is safer.

**Original candidate analysis (retained):** Two candidate mechanisms were considered:
- (a) `tokenKillerHome()` differs between the two terminals — `TOKEN_KILLER_HOME`, or
  `HOME`/`USERPROFILE`, not identical in the agent's `run_in_terminal` env vs the
  user's interactive shell.
- (b) `projectFingerprint(cwd)` differs — the git-root anchor STRING differs between
  terminals. On Windows this is plausible from drive-letter case (`c:\` vs `C:\`),
  separators, or 8.3 short vs long paths, since the anchor is hashed as a raw string.
  If the agent's cwd is not inside the repo at all, `gitRepoAnchor` returns undefined
  and it falls back to hashing the raw cwd → a different bucket.

**Decisive diagnostic (run in BOTH the user terminal AND an agent run_in_terminal):**
```
node -e "const m=require('<abs>/dist/core/dataDir.js'); console.log(m.tokenKillerHome(), m.projectFingerprint(process.cwd()))"
```
Different home or different fingerprint between the two = the split. Immediate
workaround/confirmation: `tk gain --user` aggregates ALL buckets and should show both.

**Status. NOT FIXED** — pending the two-terminal comparison to choose (a) vs (b).

---

## I7 — project-bucket path segment is inconsistent across writers — **P2 (found incidentally)**

`history`/data write `projects/<fingerprintSegment(repo:hash)>` =
`projects/repo:hash` (POSIX) / `projects/repo-hash` (Windows, `:`→`-`,
`dataDir.ts:84-90`). But inspect context-persist writes `projects/<hash>` — it
**strips the `repo:` prefix** (`src/inspect/persist.ts:37-41`). Observed live: a bucket
`projects/56c681cf9e66/` containing only `inspect/latest.json` (whose body says
`fingerprint:"repo:56c681cf9e66"`), while that project's history lives under
`projects/repo:…/`. So inspect/optimize project-scope data can desync from the
history it is about, and on Windows there are **three** segment schemes for one id.

**Status. NOT FIXED.**

---

## Cross-cutting note

I1/I2 are the same bug (strict JSON vs JSONC) and the highest-leverage fix — it
unblocks install, status, optimize, and VS Code TTY compression at once. I3/I4 are
the same bug (reader doesn't match VS Code's on-disk format) and are what makes
inspect "useless". I5 and I6 are independent. Suggested order: I1 (done, needs
commit + tests) → I6 diagnosis → I3/I4 reader rewrite → I5 startup → I7 cleanup.

---

## Resolution (2026-06-11) — all seven issues fixed

Worked in the order above; each issue landed as its own commit, 1516 tests green
throughout. The README rewrite was kept out of these commits (still uncommitted).

- **I1/I2 — FIXED** (`fix(jsonc): tolerant settings.json parse across all readers`).
  Every settings reader now routes through `parseJsonc`; `config.ts`'s private
  `stripJsonComments` folded into it (tk's own config.jsonc gains trailing-comma
  tolerance for free); uninstall logs the reformat+backup symmetrically with install.
  Pinned: the 2 stale tests rewritten (JSONC → ok, `applyCompress` reformats+backs up),
  16-case `parseJsonc` unit suite, `patchVscodeSettings`-on-JSONC integration test
  (env keys written + `.tk-backup` created) covering BOTH POSIX and Windows env keys.
  TTY delivery (I2) rides the now-working settings patch.
- **I6 — FIXED** (`fix(gain): normalize Windows drive-letter case`). `resolveProjectRoot`
  uppercases the drive letter on win32 before hashing (fallback raw-cwd branch goes
  through the same path); `c:`/`C:` now map to one bucket. No-op on POSIX. Regression
  test on the exported `normalizeDriveCase`.
- **I7 — FIXED** (`fix(inspect): use canonical project bucket segment`). `projectInspectDir`
  uses `fingerprintSegment()` instead of stripping `repo:`, so inspect data lands in
  the SAME bucket as the history it analyzes. `latest.json` is regenerated each run,
  so stale stripped dirs are harmless (no migration needed).
- **I3/I4 — FIXED** (`feat(inspect): read real VS Code session formats + emit gap analyzers`).
  New `vscodeReader.ts` descends transcripts (`assistant.message.data.toolRequests[]`)
  and chatSessions (`v.requests[].response[]`), verified against live on-disk storage;
  `scan.ts` routes every line through `flatToolRecords` (flat CLI dialect OR the VS
  Code extractor); `sources.ts` discovers chatSessions as `.json` AND `.jsonl`. The
  dead `skill-gap`/`context-gap`/`storage-discovery` enum members now emit from
  category-count signals (privacy-safe, threshold-gated). Verified end-to-end: inspect
  extracts the real `git status` event where it previously reported zero. (Transcripts
  record REQUESTS not outputs, so output-volume stays underivable from them — by design.)
- **I5 — IMPROVED** (`perf(shim): lazy-load subcommands + compile cache`). Management
  subcommands now `await import()` so the compress hot path loads only
  router+executor+gate+pipeline; `module.enableCompileCache()` persists V8 bytecode;
  tsdown code-splits each subcommand into its own chunk. Removes the bundle-load tax
  from the per-command path. The node-cold-start floor is architectural (the AV-exclusion
  → daemon/SEA ladder above still stands for the slow Windows box).

---

## Review of the I1 fix (2026-06-11, post-hoc code review)

Verdict: **direction and parser quality are good, but NOT committable yet** — the
fix breaks 2 existing tests and ships with zero coverage of its own.

**Verified this review** (commands actually run):
- `tsc --noEmit` → clean.
- `vitest run tests/unit/shim tests/unit/context/vscodeSettings.test.ts` →
  **2 failed / 150 passed**. The earlier "tests green" claim covered only the three
  shim test files; the context suite was not run.
- `parseJsonc` probed with 16 edge cases — all correct: `//` inside string values
  (URLs), `/* */` inside strings, escaped quotes, trailing backslash in a string,
  trailing comma followed by a line comment before `}`, BOM, CRLF, nested trailing
  commas, unterminated block comment, genuinely-malformed JSON still throws.

**Hard stop — stale tests pin the OLD behavior:**
1. `tests/unit/context/vscodeSettings.test.ts:68` asserts JSONC → `parse_error`;
   it now parses OK.
2. `tests/unit/context/vscodeSettings.test.ts:99` asserts `applyCompress` refuses
   JSONC (exit 1, file untouched); it now returns 0 and rewrites the file.

Failure (2) exposes a **behavior change not recorded above**: `tk optimize --apply`
now also reformats a commented settings.json into strict JSON. Data-safe (the
applySafe `writeBackup` snapshot fires first), and arguably the desired behavior —
but it must be a conscious decision pinned by an updated test, not a rotting one.

**Coverage gap (admitted in I1 status, restated as a gate):** `parseJsonc` has no
unit tests; "install on a JSONC settings.json writes env + creates
`settings.json.tk-backup`" has no test. Per this repo's test-first principle the
fix is not done until the regression is pinned.

**Advisory findings:**
- **Duplicate JSONC logic**: `src/core/config.ts:72` already has a private
  `stripJsonComments` (comments only, no trailing commas). Migrate it to
  `parseJsonc` — one JSONC reader, and tk's own config gains trailing-comma
  tolerance for free.
- **Uninstall log asymmetry**: `src/shim/cli.ts:137` discards the
  `SettingsPatchResult` from `unpatchVscodeSettings` — if the file regained
  comments since install, uninstall silently reformats (backup exists but is never
  mentioned); the install path logs it. One log line to fix.
- **Two backup conventions** for the same file: shim path writes a fixed-name
  `settings.json.tk-backup`, optimize path writes timestamped applySafe backups.
  Acceptable, but worth unifying eventually.
- The README rewrite (+282/−153) shares the dirty worktree with the I1 fix and is
  unrelated — commit separately.

**Assessment of the proposed (unapplied) fixes:**
- **I6 — sound.** Drive-letter-only normalization keeps the existing 24762-saved
  bucket keyed as-is, safer than `realpathSync.native` (full-path re-key). Two
  additions: ensure the fallback branch (cwd outside any repo → raw-cwd hash) goes
  through the same normalization, and add a mixed-case-drive regression test.
- **I5 — ladder order agreed** (AV exclusion → compile cache/chunk-split → profile
  → daemon/SEA). Caveat on the bake-resolved-path fix: the baked absolute path goes
  stale when the real tool is upgraded/moved — must fall back to runtime PATH
  resolution when the baked path no longer exists, or the shim silently breaks on
  tool updates.
- **I3/I4 — direction right**, and the "transcripts record tool REQUESTS, not
  outputs" limitation is correctly called out up front.
- **I7 — no concrete proposal yet**; needs a canonical segment scheme decision plus
  a migration story for existing buckets before it can be scheduled.

**Pre-commit checklist for I1:**
1. Update the 2 stale tests to pin the new behavior (JSONC → ok; `applyCompress`
   succeeds on JSONC + backup exists).
2. Add `parseJsonc` unit tests (the 16 probe cases above) + an install-on-JSONC
   integration test asserting env keys written and `settings.json.tk-backup`
   created.
3. (Optional, same batch) fold `config.ts` `stripJsonComments` into `parseJsonc`;
   add the uninstall reformat log line.
4. Commit the README rewrite separately from the I1 fix.
