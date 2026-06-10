# Token Killer Handler Compression Audit Prompt

Use this prompt to audit or propose compression algorithms for **Token Killer (`tk`)**: a command proxy that runs `tk <original command>`, captures stdout/stderr, compresses output for coding agents, then exits with the original exit code. Billing is per token; the goal is to shrink CLI evidence without breaking the agent's next action.

This is **evidence projection**, not generic compression (not gzip, not free-form LLM summarization by default).

---

## Product constraints (apply to every handler)

**Retention-first delivery**

- If compression cannot preserve actionable facts, output must equal raw (0% savings is valid).
- Never use placeholders that imply the agent already saw omitted content unless the same turn provides recoverable full output (e.g. explicit raw pointer and the user knows to rerun with `--raw`).

**Quality gate (automatic revert to raw when violated)**

- Raw non-empty but filtered empty/whitespace → use raw.
- Filtered longer than raw: zero tolerance if raw ≤200 chars; else allow ≤5% or ≥80 chars metadata overhead (unless handler is on the structural whitelist).
- Filtered contains omission semantics → use raw. Detect lines matching:
  - `+N more matches|files|packages|errors|commits|branches|changed lines`
  - `[N more lines]`
  - `more lines/chars (use tk …)`
  - `repetitive lines collapsed`
  - `lines truncated)`
  - `... (more changes truncated)`
  - `- ... N more`
  - `Hidden:`
  - `N matches|files|… not shown`
  - `Direct sample:`

**Structural handlers** (intentional reformat may exceed raw slightly; omission/truncation rules differ):

`git-status`, `git-diff`, `diff`, `tsc`, `mypy`, `pip`, `curl`, `pytest`, `git-push`, `read`, `json`, `env`, `log`.

**Handler pipeline stages** (evaluate each proposal on all four)

1. **Capture** — Does `execute` rewrite the spawned command for machine-readable stdout (JSON, porcelain, `-nH`, `--format`, `-I` ignores)?
2. **Parse** — Deterministic extraction (regex, JSON, state machine). Parse failure → passthrough.
3. **Project** — Drop noise, group, shorten paths. Do not drop file:line, rule/error codes, failure names, or full path sets when policy requires completeness.
4. **Gate** — Output must pass the quality gate or fall back to raw.

**Token metric** (secondary): `tokens ≈ ceil(chars/4)`; `savingsPct` only on final output after the gate.

**Evaluation order when scoring proposals**

1. Agent can still answer: what file to edit, what failed, what changed, what command to rerun.
2. Then token savings.

**Known anti-pattern** (do not treat high savings as success): empty tables, parse-failed placeholders, mislabeled errors, content drift vs input, zero-char API lists.

---

## Universal algorithm patterns (reference only)

| Output type | Suitable approaches | Avoid |
|-------------|---------------------|--------|
| Two-file text diff | LCS / Myers minimal edit script | Footer claiming "+N more" when all lines are shown |
| Unified diff | Parse by file/hunk; strip index/@@ noise; keep all +/- unless explicit cap policy | Silent hunk drop without raw recovery |
| Logs | Dedup repeated lines; keep unique errors | Collapsing distinct failures |
| Search | Group by file; cap per-file and global with uncapped overflow count | Match count only, no line numbers |
| Diagnostics | JSON → sort by severity/file; group by rule code | Cap alphabetically and drop critical issues |
| Directory tree | Capture-time ignore noise dirs; strip summary line | Truncated path lists with hidden remainder |
| Tables / query results | Column projection; one record per line | Empty result when raw had rows |

---

## Per-handler audit checklist

For **each handler below**, produce:

- **Agent sufficient statistic** — minimal fields the agent must retain.
- **Current behavior** — capture / parse / project / gate.
- **Proposed algorithm** — concrete steps (pseudocode level).
- **Gate compatibility** — will it trigger `empty_output`, `inflated`, or omission revert?
- **Regression probes** — 2–3 questions an agent must answer from compressed output alone.

---

### `diff` (program `diff`)

**Agent needs:** For two paths: every added/removed line and file identity. For identical files: explicit identity. For stdin unified: every `+/-` per file; no fake "more" when nothing was hidden.

**Checks**

- Two-file mode: LCS on full lines; output `old -> new (+A -R)` plus all `+`/`-` lines.
- Do not add `+N more` or truncation footers when all changes are already emitted.
- Stdin / unified: parse `+++` file boundaries; strip `diff --git`, `---`, `@@` lines; emit `[file] path (+A -R)` then every change line.
- Footer `... +{total-10} more` only when lines were actually capped, never when all lines are listed.
- Binary / identical / huge file: define boundary behavior (passthrough subprocess vs one-line summary) without dropping actionable +/-.
- `execute` for `-`: read stdin only; filter must not read live repo state.

---

### `git-diff`

**Agent needs:** Per-file change awareness; for large diffs at minimum file list and +/- counts; for small diffs full hunks. Stat-only invocations passthrough.

**Checks**

- Filter processes **only** provided stdout (fixture/stdin), never shells out to live `git diff --stat`.
- If input is unified (`diff --git`): use compact unified algorithm (per-file header, hunks, `+N -M` per file).
- If input is already `--stat` / `--numstat` (no `diff --git`): passthrough unchanged.
- Structural handler: truncation allowed only with honest markers and `[full diff: tk --raw git diff]` (or equivalent).
- Lossless peels: drop `index` lines; optional drop context-only lines with no adjacent +/- in hunk.
- Optional capture policy: no pathspec + huge output → consider default `--stat` / `--numstat` while path-scoped commands keep full diff.
- Do not mislabel parse failures as empty diff.

---

### `search-like` (`rg`, `grep`)

**Agent needs:** `file:line:content` for each retained match, or explicit `0 matches for <pattern>`.

**Checks**

- `grep` capture: prepend `-n` and `-H` when no format flags so output is parseable.
- `rg`: plain output below threshold may passthrough; above threshold use same grouping as grep when lines parse.
- Explicit format flags (`-c`, `-l`, `-L`, `-o`, `-Z`, `--json`): passthrough verbatim.
- `groupGrepOutput`: bucket by file; `cleanLine` max length ~80 centered on pattern; per-file cap ~25; global cap ~200.
- Overflow: `[+{totalMatches - shown} more]` with **uncapped** total (true suppressed count).
- `compactPath` for long paths (e.g. `first/.../parent/file`).
- If zero lines parse as matches → passthrough raw, do not drop content.
- No `Hidden` / `Direct sample` patterns.

---

### `read-like` (`cat`, `type`, `less`)

**Agent needs:** Full file text by default; line slices only when user asked (`--max-lines`, `--tail-lines`).

**Checks**

- Default: passthrough full text.
- `--max-lines` / `--tail-lines`: emit only real lines, no placeholder rows.
- Binary: skip or one-line binary notice, no garbage bytes.
- Multi-file: clear per-file boundary in output.

---

### `read` (`tk read`)

**Agent needs:** Same as read-like; `aggressive` only when opted in.

**Checks**

- Levels: `minimal` / `balanced` → full content for large files; `aggressive` → path, line count, symbol list when over size thresholds (~12K chars or ~200 lines).
- Structural handler: line-number prefixes and `[N more lines]` marker allowed per RTK contract.
- `cat` operands: `buildCatArgs` strips RTK-only flags from spawned `cat`.

---

### `list-like` (`ls`, `dir`, `find`)

**Agent needs:** Complete set of retained paths; deterministic noise dir exclusion (`node_modules`, `.git`, `dist`, etc.).

**Checks**

- `ls` capture: force `-la` (or equivalent) for parseable columns.
- Small output: filtered path list.
- Large output: `NF ND:` header + directory grouping; **list every path**, no truncation.
- `find`: glob pattern preserved in summary; group by directory like RTK.
- Evaluate column projection (e.g. drop permissions column) only if name/size/mtime remain actionable.

---

### `tree`

**Agent needs:** Full hierarchy of retained nodes; no summary line; noise dirs excluded at capture.

**Checks**

- Capture: inject `-I` noise pattern unless `-a`/`--all` or user `-I`/`--ignore=`.
- Filter: remove trailing `N directories, M files` line; preserve `├──/└──/│` structure OR flatten to paths consistently.
- Do not truncate tree paths in filter output.

---

### `git-status`

**Agent needs:** Branch, staged/unstaged/untracked paths, clean vs dirty, in-progress operations (merge/cherry-pick/etc.).

**Checks**

- Compact path: capture `git status --porcelain -b` when args empty or only `-b`/`-s`/`-sb` combinations per policy.
- Non-compact args (`-uno`, pathspec, etc.): passthrough with minimal filter.
- Format: `##` → `* branch`; preserve every porcelain line; clean tree → `clean — nothing to commit`.
- Long in-progress hints → one-line operational summary without losing conflict state.
- Structural: allowed to exceed raw slightly; must not expose wrong branch semantics.

---

### `git-log`

**Agent needs:** Every commit subject (and hash if not in subject); oneline small logs may passthrough.

**Checks**

- Few commits: passthrough oneline.
- Many commits: `Git Log: N commits` + **all** subject lines.
- Do not use `[+N lines omitted]` that hides commits still needed for agent decisions.
- Optional strip: author email only if subjects/hashes remain complete.

---

### `git-show`

**Agent needs:** For `--stat` / name-only: passthrough. For full show: commit meta + stat + **complete** patch.

**Checks**

- Detect mode from args/output; do not truncate patch hunks in default policy.
- Section marker `--- Changes ---` (or equivalent) if restructuring.

---

### `git-branch`

**Agent needs:** All branch names when listing; current branch clear.

**Checks**

- ≤2 branches: passthrough.
- More: list **every** branch name.
- Write operations (delete/rename): short success line; failures keep stderr.

---

### `git-extended` (add, commit, push, pull, fetch, stash, worktree, …)

**Agent needs:** Failures = full stderr semantics; success = shortstat or one actionable line.

**Checks**

- Never relabel errors (e.g. invalid stash ref ≠ "Empty stash").
- Preserve `staged N files` vs `staged nothing` distinction.
- push/pull/fetch: key ref and up-to-date vs updated semantics.

---

### `gh` / `glab`

**Agent needs:** Every PR/MR/issue row: state, id, title, branches/author as applicable.

**Checks**

- Parse JSON/text to one line per item.
- Empty output forbidden when raw contained items.
- Do not replace list with parse-error string when JSON is valid.

---

### `gt` (graphite)

**Agent needs:** Stack graph matching input; topology and commit identities.

**Checks**

- Strip emails/PII only; do not replace stack with unrelated graph.
- Output must be traceable to input fixture/live stdout.

---

### `tsc`

**Agent needs:** Every diagnostic: file, line, column, TS code, message; related notes attached.

**Checks**

- Group by file; one line per error; optional "Top codes" summary line.
- Clean run: collapse to `TypeScript: No errors found`.
- Truncate long messages with explicit `...` in message field only, not dropped diagnostics.
- Passthrough if zero issues parsed but raw had unrecognized errors.
- Structural handler.

---

### `eslint`

**Agent needs:** Every violation: file, line, rule, message; grouped by rule.

**Checks**

- No-config / zero files: `0 problems in 0 files`, not JSON parse error paths.
- List all violations, no cap without honest overflow.

---

### `ruff`

**Agent needs:** Every violation: rule code, file:line:col, message; fixable count if present.

**Checks**

- Capture: `ruff check --output-format=json` when in check mode without user format override.
- Parse JSON array from stdout; `compactPath` for deep paths.
- Group by rule; cap listed violations only with true suppressed count in overflow line.
- Overflow line must not trigger false omission revert unless violations actually hidden.
- Text fallback for fixtures: parse `file:line:col: CODE message` lines.
- `format` / `version` subcommands: passthrough.

---

### `mypy`

**Agent needs:** All errors with codes and locations; notes on following lines.

**Checks**

- Same grouping discipline as tsc; structural handler.
- No dropped error entries when parse succeeds.

---

### `pytest` / `js-test` (vitest, jest, npm test, …)

**Agent needs:** Failed test names, assertion/snippet, pass/fail counts; passing tests may be summarized.

**Checks**

- Extract failures + summary; strip passing case detail only.
- Keep shortest useful stack (1–3 frames) per failure.
- Unified parsers across vitest/jest/pytest shapes.

---

### `pip`

**Agent needs:** Installed packages and dependency problems from text output.

**Checks**

- Do not assume JSON for `pip list`; parse text.
- Never emit `JSON parse failed` when raw is valid text list.
- Surface invalid/missing/peer problems.

---

### `package-list` (npm/pnpm/yarn list)

**Agent needs:** Full package names with `[prod]`/`[dev]`; all Problems lines.

**Checks**

- Passthrough if already RTK-compact format.
- Otherwise parse tree to flat list without truncating.

---

### `maven` / `gradle` / `javac`

**Agent needs:** All error lines with file/module context; build failure reason.

**Checks**

- State machine for `[ERROR]` / compilation failures.
- Strip download progress, `BUILD SUCCESS` chatter, repetitive INFO.

---

### `docker` / `kubectl`

**Agent needs:** ID, name, status, image, ports (docker); pod readiness, restart reason (kubectl).

**Checks**

- Capture: `docker ps --format`, `kubectl get -o json`, log tail limits per RTK.
- Filter: tabular projection from JSON/format output.
- Raw passthrough when user passes custom `-o` / watch flags per dispatch rules.

---

### `curl` / `wget`

**Agent needs:** Status, headers or JSON body slice; size hint for truncated body.

**Checks**

- `curl -s` on capture.
- Large body: truncate with byte total + recovery hint (structural).
- `wget`: HEAD/summary only if policy confirms body not needed for agent task.

---

### `psql`

**Agent needs:** Query result rows and column headers.

**Checks**

- Never emit empty table when raw had TSV/header+rows.
- Tab-separated compact rows acceptable.

---

### `aws`

**Agent needs:** Command-specific; preserve ARNs, resource ids, error codes from CLI JSON/text.

**Checks**

- Prefer JSON query output when capture rewrites; project to one line per resource.

---

### `env`

**Agent needs:** Variable names and values for debugging; secrets masked.

**Checks**

- Grouped headers; mask secret-like keys.
- Structural: must not revert to raw unmasked secrets due to inflation gate.

---

### `json`

**Agent needs:** Key-value view of JSON for agent scanning.

**Checks**

- Compact indented `key: value` (quotes/braces stripped).
- Structural: may equal or exceed raw on small nested JSON.

---

### `log` (file log)

**Agent needs:** Error/warning counts; deduplicated summary; every unique error line retained.

**Checks**

- Distinguish **read log file** from **macOS `log` CLI**; align to read-and-summarize for file fixtures.
- Dedup repetitive lines without removing distinct failures.
- Structural "Log Summary" digest allowed.

---

### `wc`

**Agent needs:** Line/word/byte counts for named file.

**Checks**

- One-line compact summary if raw is verbose.

---

### `format` / `prettier`

**Agent needs:** Which files need formatting or success one-liner.

**Checks**

- If check output is already small, passthrough.
- Else `N files need formatting` style single line only when no file list required for agent.

---

### `pipe`

**Agent needs:** Same as search when pipeline ends in grep/rg.

**Checks**

- Reuse `groupGrepOutput` on final stage stdout.
- Passthrough if grouping parse fails.

---

### `generic`

**Agent needs:** Exact stdout+stderr when unknown command.

**Checks**

- Always passthrough unless explicit new handler registered.
- No summarization.

---

## Cross-handler regression questions (use on any proposal)

Answer **yes** from compressed output alone, without raw:

1. What is the exit semantics (success/failure) and the primary error message if failed?
2. Which file(s) and line(s) should the agent open next?
3. What exact command should the agent rerun to get more detail (`tk --raw …`) if information is incomplete?

If any answer is **no**, the proposal fails retention regardless of `savingsPct`.

---

## Deliverable format

For each handler section above, output:

```text
Handler: <name>
Agent sufficient statistic: …
Current algorithm: …
Proposed algorithm: …
Gate risks: …
Agent probes: Q1 … Q2 … Q3 …
Savings note: (estimate only after retention passes)
```

Do not rank handlers. Do not recommend aligning to a reference implementation when that reference drops rows, mislabels errors, or drifts from input. Prefer passthrough over lossy summary when retention probes fail.

---

## Mindset

The consumer is a **debugger and patch author**, not a human skimming logs. Compression succeeds when the **next tool call** is unchanged versus reading raw, at lower token cost. When uncertain, choose passthrough.
