# Goal: rg / tree compression — lossless-first, `--level` dial, recoverable caps

Drive agent sessions that fix the two command-proxy handlers Token Killer currently fails to
compress in real use — `rg` (0% on the common invocation) and `tree` (0.1% on large
monorepos) — and make the context optimizer's managed token-budget block point at concrete,
already-shipped read flags. This is **runtime command-proxy** work (DESIGN §1), not inspect
or context-optimizer feature work.

## Why (evidence from a live atlas dogfood run, 2026-06-05)

Run against `~/Workspace/atlas` (a real pnpm/TS monorepo):

- `tk rg export packages` → **0% saved** (56,655 → 56,655 tokens). Root cause: `rg` piped to a
  non-TTY **omits line numbers by default**, so tk's match parser (`^(.+?):(\d+):(.*)$` in
  `src/handlers/common/grepFilter.ts`) finds zero parseable matches → `groupGrepOutput`
  returns `null` → passthrough. tk **deliberately** does not rewrite `rg`
  (`src/handlers/common/searchLike.ts` `buildGrepArgs`, pinned by
  `tests/unit/handlers/rtkGrepBehavior.test.ts:32`) on the premise "rg is line-numbered by
  default" — which is **false for piped output**.
- `tk tree` → **0.1% saved** (12,069 → 12,062 tokens). Noise-dir pruning (`-I node_modules|…`)
  already fires, but a large monorepo's real file tree is still ~12k tokens; neither tk nor
  RTK caps **depth or per-directory fan-out**.

## Ground truth — what RTK actually does (do not relitigate)

- **rg:** RTK is NOT a passthrough filter. `rtk/src/cmds/system/grep_cmd.rs::run` re-invokes the
  search itself with `rg -nH0 --no-heading --no-ignore-vcs <pattern> <path>`, then groups by
  file and caps (`grep_max_per_file = 25`, `max 200`, `max_len 80`, `[+N more]`). RTK fully
  compresses `rg` in real use. tk's claim that "rtk likewise gets ~0% on plain rg" is wrong.
- **tree:** `rtk/src/cmds/system/tree.rs` does only `-I` noise-pruning + summary-line strip —
  the same as tk. RTK has **no** depth/fan-out cap. Phase 2 is therefore an intentional tk
  divergence beyond RTK.

## Prior decisions this goal must respect (and one it overturns)

- **Align to RTK on conflict** (recorded user decision). Phase 1 *aligns* tk to RTK's real rg
  behavior, so it honors this — it is **not** a new divergence.
- **Keep intentional tk divergences, but record them** in `docs/align-rtk-divergences.md`.
  Three deliberate divergences: (1) tk does **not** force `--no-ignore-vcs` on rg; (2) tk
  applies lossless identical-line dedup (RTK never dedups); (3) tk injects tree `--filelimit`
  (RTK does not). All three must be recorded there.
- **Overturned:** the "protect the migration benchmark baseline by leaving rg untouched"
  rationale in `searchLike.ts`. Real compression beats a flattering baseline number. The
  migration suite stays green because tk's grouped rg output matches RTK's grouped output;
  only the `buildGrepArgs("rg", …)` unit assertion changes.

## Guardrails (non-negotiable)

- **Retention-first / fail-open.** A handler that cannot safely compress must pass the raw
  output through unchanged, never drop or corrupt content (DESIGN §1.6 quality gate). If
  `groupGrepOutput` returns `null`, or a tree's indentation is unparseable, fall back to
  passthrough.
- **Capping is the last resort, never the first.** Reduce losslessly (dedup, prefix-factor)
  before dropping anything; preserve a count when you do drop; keep the dropped detail
  recoverable. See *Compression model* below — this is the spine of the whole goal.
- **`--level` is the lossy dial, not a new flag family.** `tk read` already parses `--level`/
  `-l` (`src/handlers/system/read.ts`); this goal generalizes the same flag to `rg`/`tree`
  with a shared `CompressionLevel` vocabulary. `tk read` also already has `--max-lines`/`-m`.
- **Marker-block constraints** (DESIGN §5.3): ≤ 15 lines, no timestamps/IDs/volatile content
  (must stay cacheable — `cacheability_churn`-clean), marker-bounded and restorable.
- **Each phase is independently mergeable.** After any single phase ships, the system is in a
  usable state. Recommended landing order by ROI: Phase 1 → 2 → 3. Do not start a phase until
  the previous one is green and tested.
- pnpm only. English in code, comments, tests, commit messages. Files < 500 lines.

## Source of truth

- `docs/DESIGN.md` §1 (command proxy), §1.6 (quality gate), §5 (managed token budget block)
- Behavior reference: `rtk/src/cmds/system/grep_cmd.rs`, `rtk/src/cmds/system/tree.rs`
- `docs/align-rtk-divergences.md` (record the two deliberate divergences here)
- Reuse, do not re-implement: `src/handlers/common/grepFilter.ts`
  (`groupGrepOutput`/`cleanLine`/`compactPath`, caps `GREP_MAX_*`), the `execute()` re-invoke
  pattern already used for grep in `src/handlers/common/searchLike.ts`.

---

## Compression model — lossless-first, `--level` dial, recovery contract

Capping (`[+N more]`, per-file 25, `--filelimit`, line truncation) is **lossy**. It is the
*last* of three layers, not the only tool. Every handler in this goal applies them in order:

1. **Lossless re-encoding (zero precision loss).** Remove redundancy only:
   - Path-prefix factoring — already done (grep groups by file; tree indents).
   - **Identical-line dedup with line-number lists** — `file:5,50,88: import {X}` instead of
     three full copies. Lossless: every line number is preserved, only the repeated *content*
     bytes are collapsed. Biggest win on repetitive searches (`import`, `console.log`,
     generated code) and it reduces how often the cap is reached at all.
2. **Semantic-lossless / representation-lossy.** Preserve the *information* the agent needs,
   drop exact bytes: tree `--filelimit`'s `[N entries … not opening dir]` (drops names, keeps
   **count + structure**); per-file match counts.
3. **Lossy truncation — but recoverable.** Only after 1–2. Always paired with the recovery
   contract below.

**Information-theory honesty:** if the agent genuinely needs *all* of a *high-entropy* output,
no scheme reduces tokens losslessly — the LLM reads tokens, not gzip. That case is rare
(most volume is redundancy or an over-broad query); layers 1–2 and the recovery contract
handle the rest, and the cap marker itself signals "narrow the query."

### `--level` — the lossy dial (shared across read / rg / tree)

Generalize `read`'s existing `--level`/`-l` into one `CompressionLevel` vocabulary
(`none | minimal | balanced | aggressive`) reused by `rg` and `tree`. Each step *adds* a
layer; lower levels never drop more than higher ones.

| `--level` | Layers applied | Precision | Default for |
|-----------|----------------|-----------|-------------|
| `none` | passthrough (= `--raw`) | full, verbatim | — |
| `minimal` | layer 1 only (dedup + prefix-factor, **no cap, no truncation**) | **lossless** — every match/file kept | — |
| `balanced` | layers 1–2 + recoverable caps (per-file/global cap, line truncation, `--filelimit`) | lossy tail, recoverable | **rg, tree** (default) |
| `aggressive` | layer 3 max (counts/sample only; tree `-d` dirs-only) | most lossy, recoverable | — |

`read` keeps its current per-language semantics under the same names (it already defaults to
`none` — retention-first); `rg`/`tree` default to `balanced` because compressing is their
whole job. Parsing reuses the existing `--level`/`-l`/`--level=` handling; lift the level
enum into a shared `CompressionLevel` type so all read-like handlers share one dial.

### Recovery contract (every lossy cap must satisfy all three)

1. **Count preserved** — `[+N more]` / `[N entries …]` always states how much was suppressed.
2. **Raw retained** — outputs over the threshold are already saved to
   `~/.token-killer/projects/<fp>/raw/<ts>-<cmd>.log` (`src/core/rawStore.ts`: auto when
   `> 20000` chars or non-zero exit). Keep that; do not regress it.
3. **Recovery surfaced** — the compressed output must tell the agent how to get the rest:
   the printed raw-log path, `tk --raw <cmd>` for full verbatim, `tk <cmd> --level minimal`
   for lossless, or a scoped re-run (`tk ls <dir>` / `tk rg <pat> <narrower-path>`). Today the
   raw path prints but the "how to expand" hint is missing — add it.

---

## Phase 1 — rg runtime compression (highest ROI, do first)

Make `rg` compress like RTK by forcing a parseable, line-numbered output shape and routing it
through the existing grouping/cap machinery.

**Deliver:**

- `src/handlers/common/searchLike.ts` → `buildGrepArgs(program, userArgs)`: when
  `program === "rg"` and `!hasFormatFlag(userArgs)`, prepend `-n -H --no-heading` (producing
  `file:line:content` per line). The existing `execute()` re-invoke branch then re-runs the
  rewritten command exactly as it already does for `grep`; `filter()` already calls
  `groupGrepOutput`. No changes needed to `grepFilter.ts`.
- **Deliberate divergence from RTK:** do NOT add `--no-ignore-vcs`. tk keeps rg's default
  `.gitignore`-respecting behavior because it yields less, more relevant output for agents
  (RTK forces it only to mimic `grep -r`). Record this in `docs/align-rtk-divergences.md`.
- Keep all current passthrough guards: format flags (`-c/-l/-L/-o/-Z`) and any line that fails
  to parse still pass through. Add `--json` to the passthrough guard if not already covered, so
  a JSON-shaped rg output is never half-parsed.
- **Context-flag passthrough (correctness fix, applies to grep too).** When the invocation
  carries a context flag — `-A`/`-B`/`-C`/`--after-context`/`--before-context`/`--context` (and
  their `=N` forms) — do **not** rewrite or group: pass through. Today `groupGrepOutput` counts
  every line in `totalMatches` (`grepFilter.ts:109`) but `continue`s on lines that don't match
  the colon parser (`:114`), so dash-separated context lines (`file-line-content`) are silently
  dropped from the output **and** inflate the `[+N more]` count. The user asked for surrounding
  lines explicitly — grouping would destroy exactly what they wanted. Add a `hasContextFlag()`
  guard alongside `hasFormatFlag()` and short-circuit to passthrough in `filter()`.
- **Layer 1 — lossless identical-line dedup (in `grepFilter.ts`).** Within each file group,
  collapse lines whose trimmed content is identical into one entry that lists all their line
  numbers: `src/a.ts:5,50,88: import {X} from './x'`. This is lossless (every line number
  kept, only repeated content bytes removed) and runs **before** the per-file/global cap, so
  repetitive searches shrink without ever reaching the lossy tier. Keep `totalMatches` counting
  raw match lines so `[+N more]` stays the true suppressed count. This is a **deliberate
  divergence** from RTK (which never dedups) — record it in `docs/align-rtk-divergences.md`.
  Verified safe for the existing parity assertion: `rg_overflow_matches.txt` has 69 *distinct*
  content lines, so dedup is a no-op there and the `[+42 more]` test is unaffected. Any future
  fixture with identical lines must pin the deduped shape.
- **`--level` dial (introduce shared `CompressionLevel`).** Add `src/handlers/common/level.ts`
  exporting `type CompressionLevel = "none" | "minimal" | "balanced" | "aggressive"` and a
  shared `parseLevel(args)` (reusing read's `--level`/`-l`/`--level=` shape). rg consumes it:
  `none` → passthrough; `minimal` → layer-1 dedup + grouping but **caps disabled** (every match
  kept, lossless); `balanced` (default) → dedup + caps (per-file 25 / global 200 / 80-char
  window); `aggressive` → per-file **counts + first match only**. `groupGrepOutput` takes the
  caps as parameters (it already accepts `GrepGroupOptions`); `minimal` passes `Infinity`.
- **Recovery hint (recovery contract item 3).** When `groupGrepOutput` suppresses matches,
  append one line telling the agent how to get the rest: `# +N suppressed — \`tk --raw rg …\`
  for all, or \`--level minimal\` for lossless`. The raw-log path already prints when saved
  (`rawStore.ts`); do not regress it.
- Update the now-stale comment block in `searchLike.ts` (lines ~12–27) to state that rg IS
  rewritten and why (parity with RTK's real behavior; piped rg omits line numbers).

**Tests** (`tests/unit/handlers/rtkGrepBehavior.test.ts`):

- Change the existing `"does not rewrite rg …"` assertion (line ~32) to:
  `buildGrepArgs("rg", ["export", "src/"])` ⇒ `["-n", "-H", "--no-heading", "export", "src/"]`,
  and update its comment.
- Add an rg grouping case reusing `tests/fixtures/common/rg_overflow_matches.txt` as the
  `rg -nH` output: assert grouped `file:line:content`, per-file cap at 25, and `[+N more]`
  (mirror the existing grep overflow test).
- **Dedup:** a file with the same content on lines 5, 50, 88 renders one
  `file:5,50,88: <content>` entry; total/overflow counts unchanged (all three counted).
- **`--level minimal`:** a 67-match file keeps **all 67** (deduped, no `[+N more]`); `balanced`
  caps at 25 with `[+42 more]`; `aggressive` shows a count + one sample line.
- **Recovery hint** present whenever matches are suppressed; absent at `minimal`.
- Add a Windows-path edge case: a match line like `C:\src\a.ts:12:export const x` parses to
  `{ file: "C:\\src\\a.ts", line: 12, content: "export const x" }` (anchored `:\d+:` split).
- Confirm format-flag rg (e.g. `rg -c`) and a non-parseable line still pass through.
- **Context flags pass through unchanged**: `rg -A 2 pattern src/` (and `-B`/`-C`/`--context`)
  is neither rewritten nor grouped — assert output equals raw and the `[+N more]` line is
  absent (no context-line drop, no inflated count).

**Definition of done:** `pnpm test:product && pnpm test:migration && pnpm typecheck` green;
live checks: `tk --stats rg export packages` ≥ 70% saving (was 0%); `tk rg --level minimal
export packages` returns **every** match (deduped, no cap); `tk --raw rg export packages`
returns verbatim.

---

## Phase 2 — tree fan-out cap via native `tree --filelimit` (preserve depth, collapse oversized dirs)

Collapse only genuinely oversized directories while keeping the full directory skeleton and
depth. **Use tree's built-in `--filelimit`, not a custom parser** (official-solution-first):
it natively renders any directory with more than N entries as a single line with a count
marker — zero ASCII re-parsing, zero corruption risk.

Verified on tree v2.3.2:

```
$ tree --filelimit 10 treetest
treetest
├── big  [30 entries exceeds filelimit, not opening dir]   ← native marker + count
├── empty
└── small
    ├── a.ts
    └── b.ts
```

Token effect on atlas (with `-I` noise already applied): raw 71,891 chars →
`--filelimit 25` 14,410 (5×, **full depth preserved**) → adding `-L 3` 3,527 (20×). We default
to `--filelimit` only and do NOT default `-L`, so depth is preserved (honors the
preservation-first intent); the agent can add `-L`/`-d` for a more aggressive view.

**Deliver (`src/handlers/system/tree.ts`):**

- `buildTreeArgs`: in addition to the existing `-I` injection, inject `--filelimit <N>` unless
  the user already passed `--filelimit` or `-a`/`--all`. `N` is a module constant (default 25 —
  tunable, provisional pending real-monorepo calibration).
- **`--level` dial (reuse the shared `CompressionLevel` from Phase 1).** `none` → only `-I`
  pruning, no `--filelimit` (full tree, lossless of structure); `minimal` → `-I`, no
  `--filelimit` either (tree's structure has no line-dedup analogue, so minimal == none for
  tree, kept for vocabulary consistency); `balanced` (default) → `-I` + `--filelimit N`,
  **no `-L`** (depth preserved — the preservation-first intent); `aggressive` → `-I` +
  `--filelimit N` + `-d` (directories only, the maximal skeleton). The agent can always add an
  explicit `-L <n>` itself.
- `filterTreeOutput` stays as-is. Verify it does **not** strip the
  `[<N> entries exceeds filelimit, not opening dir]` marker — its strip condition requires both
  `"director"` and `"file"`, and the marker contains neither `"director"` (only `"dir"`) — add
  a test that pins this so a future edit can't regress it.
- **Recovery hint (recovery contract item 3).** When any `exceeds filelimit` marker is present,
  the marker itself preserves the count; add nothing inline, but the handler must keep the raw
  retained (`rawStore.ts`) so `tk --raw tree` and a scoped `tk ls <dir>` / `tk tree <dir>`
  recover the collapsed names.
- **Cross-platform fail-open:** `--filelimit` is unsupported on busybox / very old BSD `tree`.
  If the rewritten invocation fails with an unknown-option error (non-zero exit + an
  `--filelimit`/`unknown option`-style stderr), re-run with the user's **original** args
  (passthrough). Retain-first: a missing flag must never error out the proxy.

**Tests** (`tests/unit/handlers/rtkTreeBehavior.test.ts` + a new fixture
`tests/fixtures/system/tree_filelimit.txt` containing an over-limit dir's rendered output):

- `buildTreeArgs(["."])` injects `--filelimit 25`; `buildTreeArgs(["--filelimit","5","."])` and
  `buildTreeArgs(["-a","."])` are left untouched (no double-inject).
- `filterTreeOutput` on the fixture **preserves** the `exceeds filelimit` marker line, still
  strips the trailing `N directories, M files` summary, and shows small dirs fully.
- The unknown-option failure path re-runs with original args (passthrough) — fail-open.
- **`--level`:** `tk tree --level none` injects no `--filelimit` (full tree); `balanced`
  (default) injects `--filelimit 25`; `aggressive` injects `--filelimit 25 -d` (dirs only).
- Existing `rtkTreeBehavior` cases (noise pruning, summary strip) stay green.

**Record divergence:** add a row to `docs/align-rtk-divergences.md` — tk injects
`--filelimit N`; RTK does not.

**Rejected alternative:** a custom `collapseTreeFanout` TS post-parser. Rejected because it
reproduces `--filelimit` worse — fragile indentation parsing, ASCII-art corruption risk, more
test surface, and a hand-rolled `… (+M more)` marker instead of tree's native count marker.

**Definition of done:** `pnpm test:product && pnpm typecheck` green; live check
`( cd ~/Workspace/atlas && tk --stats tree )` shows the rendered tree dropping from ~12k to the
low thousands of tokens, with the package skeleton and `exceeds filelimit` markers intact.

---

## Phase 3 — concrete read-budget guidance in the managed marker block (optional, lowest priority)

Make the context optimizer's managed token-budget block point at concrete, already-shipped
flags. This is the weakest (instruction-injection) delivery tier and a refinement of an
existing block, not a new capability — ship it last.

**Deliver (`src/context/applySafe.ts`, `MANAGED_BLOCK`):** replace the generic bullets with
concrete, flag-level guidance (keep ≤ 15 lines, no volatile content):

```
- Large files: `tk read --max-lines 200 <file>` (or `--level aggressive` for a symbol outline).
- Searches: `tk rg <pattern> <path>` scoped to a directory — tk caps results automatically;
  `--level minimal` keeps every match (deduped, lossless), `--raw` for verbatim.
- Structure: `tk tree <path>` — tk auto-caps oversized directories; `-L <n>` to go shallower.
- Prefer `tk <command>` for any high-output shell command to reduce token pressure.
```

- Update the sample block in `docs/DESIGN.md §5.2` to match.

**Tests** (`tests/unit/context/optimize.test.ts`): assert the new block text; marker insertion
stays idempotent and `restore` still removes only the managed block.

**Definition of done:** `TOKEN_KILLER_HOME="$(mktemp -d)" pnpm test:product -- context` and
`pnpm typecheck` green; `tk agentsmd patch` then `tk agentsmd restore` round-trips cleanly.

---

## Acceptance criteria

1. `tk rg <pattern> <path>` (default `balanced`) compresses; live atlas check goes from 0% to
   ≥ 70%. The migration parity suite stays green.
2. **Lossless tier works:** `tk rg --level minimal <pattern> <path>` returns **every** match
   (identical lines deduped to line-number lists), no `[+N more]`, no truncation.
3. **Recovery contract holds:** any suppressed output (a) preserves a count, (b) is retained in
   `~/.token-killer/.../raw/` when over threshold, (c) names how to expand it (`tk --raw …`,
   `--level minimal`, or a scoped re-run) in the visible output.
4. `tk tree` on a large monorepo drops to the low thousands of tokens with package structure
   intact; a small tree (all dirs ≤ the `--filelimit` N) renders unchanged; `--level none`
   gives the full tree, `--level aggressive` dirs-only.
5. `--level` parses identically across `read`/`rg`/`tree` (shared `CompressionLevel`).
6. The three deliberate divergences (rg `--no-ignore-vcs` omission; rg identical-line dedup;
   tree `--filelimit` injection) are recorded in `docs/align-rtk-divergences.md`.
7. `--level`/`-l` extends the existing read flag; the only genuinely new surface is rg/tree
   honoring it. `tk read --max-lines` (marker block) already exists.
8. `pnpm typecheck && pnpm test:product && pnpm test:migration` green after each phase.
9. Every handler change is fail-open: unparseable input passes through raw, never corrupted.

## Out of scope

- Fixing tree's savings-percentage measurement artifact (raw baseline is the already-pruned
  command's output). Absolute token volume drops; the `%` stays approximate. RTK has the same
  artifact; correcting it needs double execution and is not worth it.
- grep path changes (already correct).
- Semantic/embedding/ast search, progressive summarization, or any non-deterministic
  compression — outside tk's deterministic-CLI-filter boundary.
- inspect, context-optimizer findings/optimize, shim, hook.

## Rollback

All three phases are pure handler/text changes with no data or external-state writes.
`git revert` of any phase is sufficient; zero migration.
