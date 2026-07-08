---
status: accepted
---

# Cross-invocation session dedup: lossless "same as last run" suppression

When a coding agent re-runs the **same read-only command** in the **same
directory** within one session and ctx's **already-compressed** output is
**byte-identical** to what it last emitted, ctx replaces the repeated bytes with a
one-line marker that carries a recovery pointer — instead of re-billing the model
for identical output it already has in context. The suppression is **lossless and
recoverable**: the full output was delivered in full earlier this session, the
marker names when it last differed, and the `rawStore` snapshot it points at is one
fetch away.

This closes the one concrete L1 gap ctx had versus `ztk` (and versus VS Code's
native `IToolResultCompressor`, whose PR microsoft/vscode#315905 added a `cacheHit`
field for exactly this). It is the only L1 capability worth adding here; ctx does
not chase ztk's filter breadth, which the hosts are commoditizing.

## Context

ztk — the project VS Code copied for its native compressor (issue
microsoft/vscode#315881) and ctx's closest L1 sibling — already does cross-invocation
dedup safely. The heart is `ztk/src/proxy_session.zig::applySession` (~50 lines):
it runs the real command, filters it, hashes the **filtered** output, and dedups
only when `fresh_hit && cached.out_hash == out_hash` — i.e. a real exact-compare,
not a blind TTL trust. Its store (`ztk/src/session.zig`) is a single mmap'd
`/tmp/ztk-state` file: a 256-entry ring of `Entry { cmd_hash, out_hash, timestamp,
category }` with a per-category TTL table `[30s, 120s, 300s, -1, -1]`, keyed on
`XxHash64(cmd)` alone. After a mutating command it zeroes (`invalidateCategory`)
the `fast_changing` rows — cheap belt-and-braces, never the correctness mechanism.

The **shared spine ctx adopts from ztk**: always run the real command and compress
it as normal, hash the final compressed output, and dedup only when the new hash
equals the stored hash for this command AND the stored entry is still within its
freshness window. Exact-compare is the correctness spine — if anything changed
(staged a file, edited via the editor, switched branch) the fresh output differs,
the hash differs, and the full output is re-emitted automatically. The window is a
freshness / "is the original still in the model's context" bound, **not** a "has
state changed" guess.

This is also why ctx's hook/shim blind spot — it never observes an editor
`Edit`/`Write`, an `rm`, or an `mv`, because those carry no ctx handler and never
reach the executor — does **not** matter for correctness: a changed file changes
the command's output, which changes the hash, which forces a re-emit. ctx cannot,
and need not, invalidate on file writes.

### Integration points (verified against the real code)

- `src/core/pipeline.ts::runPipeline` is the single executor pipeline
  (`execute → filter → recordHistory → return`); `src/cli.ts::runCompress` is its
  only caller, and it emits `filtered.output` *after* `runPipeline` returns. The
  dedup stage slots **inside `runPipeline`, after `filterWithFallback`, before
  `recordHistory`** — so both the emitted bytes and the ledger see the decision.
- `src/core/rawStore.ts::maybeSaveRawOutput` is the existing save-raw store behind
  the `[full output: …/raw/….log]` pointer. The dedup marker **reuses this pointer
  for recovery**; no second recovery store is invented. Trap: `maybeSaveRawOutput`
  only persists on exit≠0 or >20 KB by default, so a small `git status` would have
  **no** snapshot — the very output we want to dedup. The dedup stage therefore
  **snapshots the raw lazily on the first actual HIT** (the re-run produces
  byte-identical output, so the current raw is a valid recovery source), so every
  marker has a live recovery pointer while a command that never repeats pays for no
  snapshot at all.
- `src/handlers/*` declare cacheability through `handler.traits` (the same seam
  that already carries `structural` / `masksSecrets` / `ladder` name-facts).
- `ctx gain` (`src/core/gain.ts`) reads the rollup cache (`src/core/rollup.ts`) over
  `history.jsonl`. `applyRecord` blindly sums any row's `saved_tokens` into ledger
  ①. To keep dedup savings structurally **unsummable** with filter savings, dedup
  events are recorded in a **separate** `dedup-events.jsonl`, read only by a new
  `ctx gain` section — never written into `history.jsonl`.

### Keying: project + command, NOT session (the one underspecified input)

The goal sketched a `(sessionId, cwd, normCmd)` key, but the shell / PATH-shim
compress path has **no session id today** — only the hook event normalizer
(`src/hook/normalize.ts`) ever sees a `session` field, and it never threads it into
compression. Rather than invent a fragile session id, ctx keys exactly the way ztk
and VS Code do — **on the command** — and gets isolation for free from where the
store already lives:

- The dedup store is **one file per project**:
  `~/.contexa/projects/<fingerprint>/dedup.json`. The project fingerprint
  (git-repo-anchored, `dataDir.ts`) is therefore **implicit in the key** — two
  different repos never collide, and that is the "cwd isolation" ctx gets for free.
- Inside that file the key is the **normalized command** alone:
  `key = (project_fingerprint, normCmd)`. Two sub-directories of one repo share a
  key; exact-compare degrades that to a miss (different listing → different hash →
  re-emit), so it is never *wrong*, only occasionally a re-anchor.
- **Correctness rides entirely on exact-compare + the wall-clock TTL** — never on
  the session. A session id is therefore *not* part of the key and *not* part of the
  hit decision.

The agent session id (when the host supplies one) is stored as a **best-effort
property on the entry**, used **only** to sharpen the marker's wording ("in this
session" vs "here") — never to key, gate the hit, or invalidate. (An earlier draft
also gated same-session on the long slow-class window; it was removed because it made
the session marginally load-bearing and caused two alternating sessions to thrash —
exact-compare already makes a cross-session hit correct and lossless.) This is the
ztk/VS Code answer; ctx's
per-project store is the only addition.

### Carrying the session id through to the `ctx` subprocess

The hook only **prepends `ctx`** (RTK-style, `rewrite.ts`), and the row is recorded
in the *separate* `ctx` subprocess — so the session must travel **inside the
rewritten command**. ctx injects a portable **`--session <id>` flag**, not a
`CTX_SESSION=<id> ctx …` env prefix (which is POSIX-sh-only and breaks on the Windows
pwsh ctx supports):

- `git status` → `ctx --session <id> git status`; `a && b` → `ctx --session <id> a &&
  ctx --session <id> b`.
- The id is **sanitized first** (`^[A-Za-z0-9._-]{1,128}$`); anything else omits the
  flag entirely (a raw id is never interpolated — shell-injection guard). The guard
  lives in both `parse.ts` and `rewrite.ts`.
- `parse.ts` consumes `--session <id>` (never forwarding it to the wrapped tool) into
  `options.sessionId`; precedence is **`--session` flag > `CTX_SESSION` env >
  absent**. `recordHistory` then stamps `session_id` on the success row (honest-absent,
  like `model`), so the shell path finally carries a session id — and `ctx --raw`
  inherits it via `recordRawPassthrough`.
- Non-session callers are byte-identical to before: no session ⇒ exactly `ctx <cmd>`.

## Decision

Add a dedup stage to `runPipeline`, **default-on** because the suppression is
lossless and recoverable, with explicit opt-outs: `CTX_SESSION_DEDUP=0` (env),
`sessionDedup: false` (config), `--no-dedup` (per command), and `--raw`. (The first
cut shipped default-off behind `CTX_SESSION_DEDUP=1`; once the dogfood proved the
recovery pointer + separated accounting hold, the default was flipped on.) The stage
mirrors ztk's `applySession` spine and adds ctx's four divergences.

**Hit condition** (mirrors ztk's `applySession`): run + compress → hash the
compressed output → if the command is **read-only**, its **exit code is 0/unchanged**,
the hash **equals the stored hash** for `(sessionId, cwd, normalized command)`, the
stored entry is **within the re-anchor window** for its `ttlClass`, AND a recovery
pointer exists → emit a one-line marker instead of the bytes. Otherwise emit
normally and upsert the store.

**ctx's four divergences over ztk:**

1. **A recovery pointer.** ztk's hit emits an "unchanged" summary with no path back
   to the full output. ctx's marker carries the `rawStore` pointer, so a dedup is
   always recoverable — ctx's standing lossless contract (ADR 0001). The single most
   important upgrade; the stage snapshots raw **lazily on the first hit**, so the
   pointer is always live yet a never-repeated command writes no snapshot.
2. **Per-project key (cwd isolation for free).** ztk keys on `XxHash64(cmd)` alone in
   one global `/tmp/ztk-state`; the same command in two repos collides. ctx keys on
   `(project_fingerprint, normCmd)` — `sha256(normCmd)` inside a **single per-project
   file** `~/.contexa/projects/<fingerprint>/dedup.json`, the fingerprint implicit
   in the path. The session id is an entry attribute, never part of the key.
3. **Honest separated accounting.** ztk just substitutes the output. ctx records a
   `dedup` dimension in a dedicated `dedup-events.jsonl`; `ctx gain` shows dedup
   savings on a separate line, **never summed** into ledger ①'s filter savings
   (mirrors VS Code PR #315905's `cacheHit`).
4. **Exit code is part of identity.** ztk hashes stdout only; ctx stores the exit
   code and never dedups a non-zero or changed-exit result. Errors/stderr always
   pass through.

**Key normalization.** `normCmd = basename(program) + " " + args`, joined with single
spaces at the **seams only** (token-internal whitespace preserved, so a grep pattern
`'foo  bar'` stays a distinct key from `'foo bar'`), so `ls` and `/bin/ls` share a
key. Reuses the existing `ParsedCommand`; no second parser.

**Read-only gate (mandatory, default-deny).** Eligibility requires
`handler.traits.cacheable === true` **and** `isReadOnlyForHandler(handler.name,
command)`. The gate keys on the **handler name**, not the program, and **positively
proves** the matched form is read-only — defaulting to DENY for anything it does not
recognise. This matters because handlers match across wrappers (`matchesEslint` /
`matchesTsc` fire on `npx eslint`, `pnpm eslint --fix`, where the *program* is
`npx`/`pnpm`): a program-keyed gate would mis-classify `pnpm eslint --fix` as
read-only. So `eslint --fix`, `ruff check --fix` / `ruff format`, `find … -exec`, a
bare `tsc` that emits, and `git branch -d` are each denied for the exact mutating
form, while pure-read handlers assert read-only unconditionally. A mutating command is
never deduped even if its output is byte-identical — the real command always runs, so
"unchanged" would wrongly imply "nothing happened".

**Re-anchor window by `ttlClass`** — measured from the **last full emit**
(`lastEmittedAt`), not refreshed on a hit, so a long run of hits still re-anchors
once the window lapses and the model re-sees the full output:

- **fast — 30 s**: `git status` / `git diff` / `git show` / `git branch`, `ls`,
  `tree`, `find`/list-like, `grep`/`rg`/search-like, `wc`, `cat`/read, `docker ps`,
  `kubectl get`.
- **medium — 120 s**: `tsc`, `eslint`, `mypy`, `ruff`, `env`.
- **slow — 300 s**: `git log`, package `list`/`ls`.

These bound **recoverable-context staleness, not correctness** — the only cost of a
window that is too long is a marker pointing at a snapshot the model has scrolled
past, which is still one fetch away.

**The marker** (one line, ends with newline):

```
[ctx] unchanged since 14:02:11 — same as the earlier `git status` here; full: <rawStore pointer>
```

It names the command + when it last differed, carries the `rawStore` pointer, and
is unmistakably a ctx marker.

**Tiny / structured output skips dedup.** Outputs below ~256 bytes are never cached
(a marker would not be smaller — the standing never-make-worse rule), and structured
handlers (`json`) are simply not marked `cacheable`. A defensive never-make-worse
check stays in the stage: if the marker is not strictly shorter, the full output is
emitted.

**Gates inherited for free.** `--raw` returns before `runCompress`, so it bypasses
dedup. The TTY gate already routes interactive runs to passthrough, which never
reaches `runPipeline`. `--no-save-raw` disables the recovery channel, so it disables
dedup.

**Accounting.** On a hit ctx records **only** a `dedup` event (saved = compressed
output tokens − marker tokens) and **does not** write a ledger-① history row — the
repeat is a suppression, not a fresh compression, so its bytes are counted under the
dedup dimension only and never double-counted as a filter win. On a miss the normal
① row is recorded and the store entry is upserted.

## Considered alternatives

- **Mutation-invalidation (ztk's `invalidateCategory`).** Deliberately **not**
  implemented in v1. ctx's vantage point can only observe mutations that route
  through a ctx handler — a small minority; the editor `Edit`/`Write`, `rm`, `mv`,
  `touch`, and `git checkout` that actually change a read command's output never
  reach the executor. A generation-bump would therefore be both **incomplete** (it
  misses the mutations that matter most) and **unnecessary** (exact-compare already
  re-emits the moment the output differs), and could give a false sense of
  invalidation. Correctness rides entirely on exact-compare, per the goal's own
  guardrail ("Do not build mutation-invalidation as a correctness crutch"). Recorded
  as considered; revisit only if a cheap, complete signal appears.
- **Storing dedup rows in `history.jsonl` with a discriminator.** Rejected:
  `applyRecord` and ~12 other consumers sum `saved_tokens`, so a dedup row risks
  contaminating ledger ① unless every consumer learns to exclude it — a wide blast
  radius against the never-sum invariant. A dedicated `dedup-events.jsonl` read by
  one new `ctx gain` section makes "never summed" structural, not a filter condition.
- **A second recovery store for the compressed output** (like ztk's mmap data
  region). Rejected: ctx already persists raw via `rawStore`, and the recovery
  contract (ADR 0001) points at that snapshot. Reusing it keeps one recovery channel
  and one mental model; the only addition is the lazy snapshot taken on the first hit.
- **Crediting the repeat to ledger ① and dedup separately.** Rejected as
  double-counting: the goal is explicit that a dedup hit's bytes are counted under
  the dedup dimension *only*, and that a `gain --history` row must read as a dedup,
  not a 100 % filter win.
- **A global store keyed on the command alone (ztk's exact shape).** Rejected for
  per-session/per-cwd isolation (divergence 2); a global ring thrashes across repos
  and emits cross-session "you already saw this" markers that this session never saw.

## Concurrency & failure model

Every hook/shim invocation is a fresh process, so the store is on disk and
concurrency-safe. Reads are lock-free — writes are temp-file + atomic `rename`, so a
reader always sees a complete prior-or-new JSON, never a torn file. Writes take a
best-effort advisory lock (`open … "wx"` with a short bounded retry and stale-lock
steal); if the lock can't be taken the write is **skipped** (fail-open: the full
output is emitted, the store is simply not updated). A lost update only ever causes
**under-dedup** (a missed suppression), never a wrong "unchanged" and never
corruption. Corrupt/unparseable store → treated as empty (re-established on the next
write). The store is size-bounded (drop entries past the slow window + a hard cap).

If any precondition is unclear at runtime, the stage returns "no dedup" and the full
output is emitted. Under-dedup is fine; a wrong "unchanged" is not.

## Known follow-ups (deferred from review)

- **`rawStore` raw-log GC.** The `raw/*.log` snapshots have never been garbage-collected
  (a pre-existing `rawStore` gap, not introduced here). The lazy snapshot above sharply
  reduces volume — only an *actual repeat* writes a `.log`, and subsequent hits reuse it
  — but a long session over many distinct repeated commands still grows the dir. A
  time-based sweep of `rawOutputDir` (independent of dedup entries, so it never orphans
  a marker still in the model's context) is the proper fix.
- **Windows `rename`-over-open-reader.** Reads are lock-free; if a reader holds
  `dedup.json` open at the instant a writer renames over it, `MoveFileEx` can fail
  (EPERM/EBUSY). It is already fail-open (swallowed → under-dedup, no corruption); a
  bounded rename retry would reduce the intermittent under-dedup on Windows.
