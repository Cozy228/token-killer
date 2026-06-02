# Token Guard — Three-Way Comparison Report

Generated: 2026-06-02
Project: `token-guard` (`/Users/ziyu/Workspace/token-guard`)
Versions: `tg` 0.1.0 (Node.js) | `rtk` 0.42.0 (Rust)

---

## 1. Three-Way Savings Summary

| Command | Raw chars | Raw lines | tg chars | tg lines | rtk chars | rtk lines | tg reduction | rtk reduction |
|---------|-----------|-----------|----------|----------|-----------|-----------|-------------|--------------|
| `ls` | 138 | 12 | 226 | 15 | 216 | 14 | — (inflated) | — (inflated) |
| `git status` | 535 | 21 | 351 | 19 | 223 | 14 | 34.4% | **58.3%** |
| `cat package.json` | 624 | 33 | 624 | 33 | 624 | 33 | 0% | 0% |
| `find src -name "*.ts"` | 895 | 39 | 25 | 2 | 489 | 10 | **97.2%** ⚠️ | 45.4% |
| `grep -r "export" src/` | 3,980 | 56 | 59 | 2 | 3,980 | 56 | **98.5%** ⚠️ | 0% |
| `git log --oneline -5` | 75 | 2 | 94 | 4 | 75 | 2 | — (inflated) | 0% |
| `git diff` | 20,944 | 819 | 209 | 11 | 7,584 | 216 | **99.0%** | 63.8% |
| `git branch` | 36 | 2 | 96 | 5 | 36 | 2 | — (inflated) | 0% |

> ⚠️ = suspicious savings, see root cause analysis below

---

## 2. Per-Command Comparison with RTK

### 2.1 `ls`

**Raw** (138 chars, 12 lines):
```
README.md		package.json		rtk			tsconfig.json
dist			pnpm-lock.yaml		src			tsdown.config.ts
node_modules		pnpm-workspace.yaml	tests			vitest.config.ts
```

**tg** (226 chars, 15 lines):
```
.
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ rtk
├─ src
├─ tests
├─ tsconfig.json
├─ tsdown.config.ts
├─ vitest.config.ts

Skipped:
- dist/
- node_modules/
```

**rtk** (216 chars, 14 lines):
```
.ruff_cache/
.tg/
rtk/
src/
tests/
.gitignore  82B
README.md  1.6K
REPORT.md  11.8K
package.json  624B
pnpm-lock.yaml  54.2K
pnpm-workspace.yaml  82B
tsconfig.json  370B
tsdown.config.ts  216B
vitest.config.ts  133B

Summary: 9 files, 5 dirs (2 .ts, 2 .yaml, 2 .json, 2 .md, 1 .gitignore)
```

**Root cause**: Both tg and RTK inflate small `ls` output. RTK adds file sizes and a summary line; tg adds a tree view. For small directories, neither saves tokens — but RTK's approach (flat + sizes + summary) is more informative for the same cost. tg's tree view adds ASCII art characters (`├─`) that consume tokens without adding information.

**Fix**: tg's `listLikeHandler` (`src/handlers/common/listLike.ts`) should detect when the output is already small (~< 200 chars) and pass through, or use a flat compact format like RTK's.

---

### 2.2 `git status`

**Raw** (535 chars, 21 lines):
```
On branch codex/token-guard-node-cli
Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	deleted:    DESIGN.md
	modified:   README.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.gitignore
	dist/
	package.json
	pnpm-lock.yaml
	pnpm-workspace.yaml
	src/
	tests/
	tsconfig.json
	tsdown.config.ts
	vitest.config.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

**tg** (351 chars, 19 lines):
```
Branch: codex/token-guard-node-cli
Status: 2 modified, 0 staged, 11 untracked, 0 conflicts

Modified:
- DESIGN.md
- README.md

Untracked:
- .gitignore
- dist/
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- src/
- tests/
- tsconfig.json
- tsdown.config.ts
- vitest.config.ts
- no changes added to commit (use "git add" and/or "git commit -a")
```

**rtk** (223 chars, 14 lines):
```
* codex/token-guard-node-cli
 D DESIGN.md
 M README.md
?? .gitignore
?? REPORT.md
?? dist/
?? package.json
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? src/
?? tests/
?? tsconfig.json
?? tsdown.config.ts
?? vitest.config.ts
```

**Root cause**: tg's `gitStatusHandler` (`src/handlers/git/status.ts`) parses the full `git status` output and reformats it — but still lists every individual file with `- ` prefix. RTK uses git's short-status format (` D` = deleted, ` M` = modified, `??` = untracked), which is 58.3% smaller. tg's approach is essentially the same information presented with more markup.

**Fix**: Use git's `--short` or `--porcelain` format as the base output format. The handler at `src/handlers/git/status.ts:formatStatus()` should detect whether output is short enough to pass through, and use single-character status prefixes instead of `- ` list items.

---

### 2.3 `cat package.json`

**Raw, tg, rtk** — all identical (624 chars, 33 lines):

```json
{
  "name": "@company/tg",
  ...
}
```

**Root cause**: All three pass through small files unchanged. tg's `readLikeHandler` (`src/handlers/common/readLike.ts`) has a 12,000-char threshold before it activates `summarizeLargeFile()`. RTK likely has a similar policy. This is correct behavior — small structured files shouldn't be mangled.

---

### 2.4 `find src -name "*.ts"` ⚠️

**Raw** (895 chars, 39 lines):
```
src/executor.ts
src/core/history.ts
src/core/rawStore.ts
... (39 files total)
src/handlers/git/show.ts
```

**tg** (25 chars, 2 lines):
```
.
├─ src/ (39 files)
```

**rtk** (489 chars, 10 lines):
```
39F 8D:

./ cli.ts executor.ts parse.ts router.ts types.ts
core/ ansi.ts fallback.ts history.ts outputLimit.ts path.ts patterns.ts pipeline.ts rawStore.ts report.ts savings.ts stats.ts text.ts
handlers/ base.ts generic.ts index.ts
handlers/common/ listLike.ts readLike.ts searchLike.ts
handlers/git/ branch.ts diff.ts log.ts show.ts status.ts
handlers/java/ gradle.ts javac.ts maven.ts
handlers/js/ eslint.ts packageList.ts test.ts tsc.ts
handlers/python/ mypy.ts pip.ts pytest.ts ruff.ts
```

**Root cause — tg is LOSING INFORMATION**: tg's `listLikeHandler.summarizeListing()` (`src/handlers/common/listLike.ts:79-107`) uses a simple algorithm: split each path, take the first component as a directory key, and count entries. Since all `find` results start with `src/`, everything collapses into `src/ (39 files)`. The entire subdirectory structure is lost.

RTK's approach is far more useful: it groups files by their immediate parent directory while keeping filenames. `39F 8D` means 39 files across 8 directories, then each directory lists its files.

**Fix for tg**: The `summarizeListing()` function should:
1. Build a full tree structure instead of just top-level grouping
2. Preserve at least one level of subdirectory hierarchy
3. Show the first ~40 files by name before collapsing
4. Match RTK's approach: `countF countD:` header + grouped-by-parent-dir listing

The current implementation at line 79-107 of `listLike.ts` is reductive to the point of uselessness for `find` output.

---

### 2.5 `grep -r "export" src/` ⚠️ — **BUG**

**Raw** (3,980 chars, 56 lines):
```
src/executor.ts:export function executeCommand(command: ParsedCommand): Promise<RawResult> {
src/core/history.ts:export type HistoryRecord = {
src/core/history.ts:export async function recordHistory(
... (56 lines total)
src/handlers/git/show.ts:export const gitShowHandler: CommandHandler = {
```

**tg** (59 chars, 2 lines):
```
Search: export
Matches: 0 across 0 files, showing up to 80
```

**rtk** (3,980 chars, 56 lines) — identical to raw:
```
src/executor.ts:export function executeCommand(command: ParsedCommand): Promise<RawResult> {
src/core/history.ts:export type HistoryRecord = {
... (same 56 lines as raw)
```

**Root cause — PARSING BUG**: tg's `searchLikeHandler.groupSearchOutput()` (`src/handlers/common/searchLike.ts:31-33`) uses regex `(.+?):(\d+):(.*)` to parse grep output. This expects `file:LINE_NUMBER:content` format.

However, `grep -r` (without `-n`) outputs `file:content` — no line number. The regex fails to match, returning `undefined` for every line. The result is `total = 0`, `byFile.size = 0` → `"Matches: 0 across 0 files"`.

RTK passes through the grep output directly for this size (56 lines is within its threshold). When the output is larger, RTK would group by file and show match counts.

**Fix for tg**: The `parseMatch()` function at `searchLike.ts:18-34` needs two changes:
1. Add a fallback regex for `file:content` format (no line number):
   ```typescript
   const noLineMatch = line.match(/^(.+?):(.*)$/);
   if (noLineMatch) return { file: noLineMatch[1]!, line: 0, content: noLineMatch[2]! };
   ```
2. Or better: detect the output format first and use the appropriate parser

This is a **data-loss bug** — tg silently drops all grep results instead of filtering them.

---

### 2.6 `git log --oneline -5`

**Raw** (75 chars, 2 lines):
```
0a15557 (HEAD -> codex/token-guard-node-cli, main) docs: add token guard product documentation
368d1aa (origin/main) Initial commit
```

**tg** (94 chars, 4 lines):
```
Git Log
Commits: 2
0a15557 docs: add token guard product documentation
368d1aa Initial commit
```

**rtk** (75 chars, 2 lines) — identical to raw:
```
0a15557 docs: add token guard product documentation
368d1aa Initial commit
```

**Root cause**: tg's `gitLogHandler.formatLog()` (`src/handlers/git/log.ts`) always adds a `Git Log` header and commit count, regardless of output size. When the log is already compact (2 commits with `--oneline`), the overhead makes the output larger. RTK detects that the output is already small and passes through unchanged.

tg also strips ref information (`HEAD -> codex/..., origin/main`) which can sometimes be useful.

**Fix**: The `formatLog()` function should:
1. Check if the raw output is already under a threshold (< ~200 chars) and pass through
2. Only add headers when the output is large enough to benefit from structure
3. Preserve ref info when using `--oneline` format

---

### 2.7 `git diff`

**Raw** (20,944 chars, 819 lines) — full unified diff, too large to inline.

**tg** (209 chars, 11 lines):
```
Git Diff Summary
Files changed: 2, +70 -710

DESIGN.md (+0 -415)
- hunk: @@ -1,417 +0,0 @@

README.md (+70 -295)
- hunk: @@ -1,321 +1,96 @@

Large diff hidden.
Use tg --raw git diff if full patch is required.
```

**rtk** (7,584 chars, 216 lines) — first part:
```
DESIGN.md | 417 --------------------------------------------------------------
 README.md | 365 +++++++++++-------------------------------------------
 2 files changed, 70 insertions(+), 712 deletions(-)

--- Changes ---

DESIGN.md
  @@ -1,417 +0,0 @@
  -# Token Guard Design
  -
  -本文档面向实现 Token Guard 的工程师和 AI Agent...
  ... (shows actual changed lines for each hunk)
  +0 -415

README.md
  @@ -1,321 +1,96 @@
  -# Token Guard
  +# tg
  ... (shows actual changed lines)
  +70 -295
```

**Root cause**: tg's `gitDiffHandler` (`src/handlers/git/diff.ts`) produces a summary-only output — just hunk headers with no actual changed lines. RTK includes the actual changed lines, making it 36x larger but actually useful for reasoning about the diff.

tg's approach saves more tokens (99% vs 64%) but the output is so minimal it may not contain enough information for an agent to work with. The trade-off:

- **tg**: extreme compression, but agents may need to fall back to `--raw` to understand the diff
- **rtk**: moderate compression, includes enough context for most agent use cases

**Fix**: tg could add a middle ground — show the first N changed lines per hunk, with a configurable limit. Currently `formatDiff()` only stores hunk headers (line 37-40 of `diff.ts`), discarding all actual content lines.

---

### 2.8 `git branch`

**Raw** (36 chars, 2 lines):
```
* codex/token-guard-node-cli
  main
```

**tg** (96 chars, 5 lines):
```
Current: codex/token-guard-node-cli
Branches: 2, showing 2

* codex/token-guard-node-cli
- main
```

**rtk** (36 chars, 2 lines) — identical to raw:
```
* codex/token-guard-node-cli
  main
```

**Root cause**: Same pattern as `git log`. tg's `gitBranchHandler.formatBranch()` (`src/handlers/git/branch.ts`) always adds structured headers. With only 2 branches, the headers triple the output size. RTK passes through unchanged.

**Fix**: Apply the same threshold check — if fewer than ~5 branches, pass through raw output. Only add headers when there are enough branches to justify the structure.

---

## 3. Root Cause Summary Table

| Handler | File | Problem | Impact |
|---------|------|---------|--------|
| `searchLike` (grep) | `src/handlers/common/searchLike.ts:31` | Regex `(.+?):(\d+):(.*)` doesn't match `grep -r` output (no line numbers) | **Data loss bug** — all matches dropped |
| `listLike` (find) | `src/handlers/common/listLike.ts:79-107` | Collapses all paths to first directory component only | **Information loss** — subdirectory structure destroyed |
| `gitStatus` | `src/handlers/git/status.ts:11-56` | Uses verbose list format instead of git short status | 34% vs 58% rtk reduction |
| `gitDiff` | `src/handlers/git/diff.ts:37-40` | Only stores hunk headers, discards all changed line content | Extremely terse — may not be useful without `--raw` |
| `gitLog` | `src/handlers/git/log.ts:11-67` | Always adds header overhead regardless of output size | Inflates short logs |
| `gitBranch` | `src/handlers/git/branch.ts:5-24` | Always adds header overhead regardless of branch count | Inflates short branch lists |
| `readLike` (cat) | `src/handlers/common/readLike.ts:50` | 12K char threshold for summarization | OK — small files pass through |

---

## 4. Pattern: RTK's Approach vs tg's Approach

RTK consistently applies these principles that tg misses:

1. **Pass-through for small output**: RTK detects when output is already compact and passes it through unchanged. tg always reformats, adding overhead for short outputs.

2. **Progressive compression**: RTK compresses proportionally to output size — small output stays small, large output gets compressed. tg applies uniform formatting regardless of scale.

3. **Semantic grouping, not destruction**: RTK's `find` groups by parent directory while preserving filenames. tg collapses everything to `src/ (39 files)`.

4. **Format-aware parsing**: RTK detects the actual output format (e.g., `--oneline`, `--short`) and adapts. tg assumes a single format that doesn't match all cases.

5. **Include the actual content**: RTK's `diff` includes changed lines; tg's only shows hunk headers. Compression that removes the information an agent needs just forces a `--raw` fallback.

---

## 5. Priority Fixes

| Priority | Handler | Issue | Lines to fix |
|----------|---------|-------|-------------|
| 🔴 P0 | `searchLike` | grep parsing bug — data loss | `searchLike.ts:31-33` |
| 🔴 P0 | `listLike` | find collapses all structure | `listLike.ts:79-107` |
| 🟡 P1 | `gitStatus` | Use short format for better compression | `status.ts:11-56` |
| 🟡 P1 | `gitLog`/`gitBranch` | Threshold-based passthrough | `log.ts:11-67`, `branch.ts:5-24` |
| 🟢 P2 | `gitDiff` | Include changed lines (bounded) | `diff.ts:37-40` |
