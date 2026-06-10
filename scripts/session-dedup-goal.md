# GOAL: tk cross-invocation session dedup — ship a lossless "same as last run" stage

You are an agent working in the tk repo (`/Users/ziyu/Workspace/token-killer`,
branch `token-killer-node-cli`). Build **cross-invocation session dedup**: when a
coding agent re-runs the *same read-only command* in the *same directory* and the
(already-compressed) output is **byte-identical** to what it last saw, replace the
repeated bytes with a one-line marker instead of re-emitting the whole thing —
**losslessly and recoverably**.

This closes the one concrete L1 gap tk has versus `ztk` (and versus VS Code's
native `IToolResultCompressor`, see PR microsoft/vscode#315905, which added a
`cacheHit` field for exactly this). It is the *only* L1 capability worth adding —
do not chase ztk's filter breadth; that layer is being commoditized by the hosts.

**THE DELIVERABLE IS SHIPPED CODE + AN ADR + TESTS**, not a report:
1. a new dedup stage wired into the executor pipeline,
2. a persistent, cross-process, per-session output-hash store,
3. honest separated accounting in `tk gain` (dedup savings ≠ filter savings),
4. `docs/adr/0009-session-dedup.md` recording the design + why exact-compare,
5. green tests covering expiry, re-anchor, never-make-worse, recovery, concurrency.

## The core design decision (read first)

This is **not invented here** — ztk already does the safe thing, and tk adopts the
same spine. Read ztk's real implementation before coding (see "Reference: ztk"
below); do **not** build against a strawman where "ztk blindly trusts a TTL." It
does not.

**The shared spine (ztk does this too):** always run the real command and compress
it as normal, hash the **final compressed output**, and dedup only when the new
hash equals the stored hash for this command AND the stored entry is still fresh
(within its TTL). Exact-compare is the correctness spine: if anything changed —
staged a file, edited via the editor, switched branch — the fresh output differs,
the hash differs, and full output is re-emitted automatically. The TTL is a
freshness / "is the original still in the model's context" bound, **not** a "has
state changed" guess. Mutation invalidation (ztk zeroes its fast-changing rows
after a mutating command) is cheap belt-and-braces on top — never the correctness
mechanism.

tk's hit condition mirrors ztk's `applySession`:

> run + compress → hash the compressed output → if the command is **read-only**,
> its **exit code is unchanged**, the hash **equals the stored hash** for
> `(sessionId, cwd, normalized command)`, AND the stored entry is **within the
> re-anchor window** → emit a one-line marker instead of the bytes. Otherwise emit
> normally and upsert the store.

(Exact-compare is also why tk's hook/shim blind spot — it never sees editor
`Edit`/`Write` — does not matter: a changed file changes the command's output,
which changes the hash, which forces a re-emit. tk cannot, and need not, invalidate
on file writes.)

**What tk deliberately adds over ztk** (these are the divergences — do them):

1. **A recovery pointer.** ztk's hit emits a delta/"unchanged" summary with *no path
   back to the full output*. tk's marker carries the `rawStore` pointer, so a dedup
   is always recoverable — tk's standing lossless contract (ADR 0001). **This is the
   single most important upgrade.**
2. **Session + cwd in the key.** ztk keys on `XxHash64(cmd)` alone in one global
   `/tmp/ztk-state` file (256-entry ring) — the same command in two repos collides
   and there is no per-session isolation. (Exact-compare degrades a collision to a
   miss, so it's never *wrong*, but it thrashes.) tk keys on `(sessionId, cwd,
   normalized command)` under `~/.token-killer/`.
3. **Honest separated accounting.** ztk just substitutes the output. tk records a
   `dedup` ledger dimension so `tk gain` reports dedup savings separately from
   filter savings, never summed (mirrors VS Code PR #315905's `cacheHit` field).
4. **Exit code is part of identity.** ztk hashes stdout only; tk must never dedup a
   changed-exit result.

The dedup is therefore **lossless**: the information was already delivered in full
earlier in the same session; tk declines to bill for re-delivering identical bytes,
and leaves a recovery pointer + a useful "unchanged since <t>" signal.

## Reference: ztk (gitignored at `./ztk`, reference only — NOT a dependency)

ztk is the project VS Code copied for its native compressor (issue
microsoft/vscode#315881) and tk's closest L1 sibling. The cloned source is at
`./ztk` (gitignored). Read it before implementing. Two traps that cause misreads:

- **`ztk/src/proxy.zig` / `proxy_session.zig` are NOT an LLM/HTTP proxy.** "proxy"
  is ztk's internal name for its run-the-command-and-filter executor (`runProxy` =
  exec tool → `applyFilters` → `maybeApplySession`). ztk intercepts **command
  output**, never model traffic. Do **not** model an HTTP/LLM proxy for this
  feature — dedup is a stage inside tk's existing `src/executor.ts`, exactly as
  `applySession` is a stage inside ztk's `runProxy`.
- **ztk already exact-compares** (see the heart, `ztk/src/proxy_session.zig`, ~50
  lines): it hashes the filtered output and dedups only on
  `fresh_hit && cached.out_hash == out_hash`. tk's wins over ztk are the four
  divergences above — recovery pointer, session+cwd key, separated accounting, exit
  identity — **not** the core loop. Re-deriving "exact-compare" as if it were new
  would mean you misread ztk.

Files worth reading (all under `./ztk/`):

| File | What it shows |
|---|---|
| `src/proxy_session.zig` | the dedup decision — the heart (~50 lines) |
| `src/session.zig` | mmap'd store: `Entry { cmd_hash, out_hash, timestamp, category }`, `isExpired`, TTL table `[30s, 120s, 300s, -1, -1]` by category |
| `src/session_ops.zig` | `lookup` / insert-or-update-in-place / `invalidateCategory` |
| `src/session_delta.zig` | how the "unchanged" summary is rendered on a hit |
| `README.md` "Session Memory" | user-facing description + the three TTL classes |

## Architecture (verify at these files, then use — do not rediscover)

- `src/executor.ts` — the run pipeline (exec real tool → route → handler compress →
  emit + ledger). The dedup stage slots **after** compression, **before** emit.
- `src/router.ts`, `src/handlers/define.ts`, `src/handlers/base.ts` — handler
  registry + `handler.traits` (the seam to declare per-command `cacheable` /
  `ttlClass`; mirror how traits already carry name-Sets).
- `src/core/rawStore.ts` — the save-raw store behind the existing
  `[full output: …/raw/…log]` pointer. The dedup marker reuses this pointer for
  recovery; do not invent a second store.
- `src/core/ledger.ts`, `src/core/governance.ts`, `src/core/aggregate.ts` — the
  four-ledger metrics arch (never-sum, executed-rewrite physical exclusion). Add a
  `dedup`/`cacheHit` dimension here; `tk gain` must report it **separately**, never
  summed into filter savings.
- `~/.token-killer/` (honor `TOKEN_KILLER_HOME`) — state root. The dedup store lives
  here, per-session. Tests MUST set `TOKEN_KILLER_HOME` to a temp dir (the global
  setupFiles safety net already enforces this — keep it green).
- `docs/adr/` — next number is **0009**.

## Critical knowledge (known traps — honor each)

- **Fresh process per command.** Every hook/shim invocation is a new process, so the
  store MUST be on disk and concurrency-safe. Concurrent agent commands can race —
  use atomic write + a lock (mirror whatever `src/core/*` already does for the
  ledgers; if nothing exists, write-temp-then-rename + an advisory lockfile). A lost
  update must fail *open* (emit full output), never corrupt the store.
- **Read-only gate is mandatory.** Only commands declared read-only are eligible.
  A command that mutates (`git add/commit/checkout`, `npm/pnpm install`, `rm`, `mv`,
  writes) is NEVER deduped and SHOULD bump the cwd generation (cheap belt-and-braces
  on top of exact-compare). Default: unknown commands are **not** cacheable.
- **Exit code is part of the identity.** Same bytes but a different exit code → not a
  hit. Never dedup a non-zero / changed-exit result. Errors/stderr always pass
  through (consistent with the existing never-make-worse rule).
- **Normalize the key, not the output.** Key = `(sessionId, cwd, normalized
  command)`. Normalize the command the way the hook matcher already does (strip
  absolute paths like `/bin/ls`, collapse whitespace) so `ls` and `/bin/ls` share a
  key. Reuse existing parsing; do not add a second parser.
- **TTY gate still applies.** Dedup only on the agent (non-TTY) path, same as all tk
  compression. Interactive runs are untouched.
- **Structured data / tiny output already skip compression** — they also skip dedup
  (nothing to gain, and they're the highest-stakes to keep verbatim).
- **Honesty in `gain`.** The first run's filter savings are already counted; a dedup
  hit saves the *compressed* bytes of the repeat. Count those under the new `dedup`
  dimension only. Do not double-count, do not sum dimensions (the ledger's standing
  rule). A `tk gain --history` row for a dedup hit should be legible as a dedup, not
  mislabeled as a 100% filter win.

## The marker (what the model sees on a hit)

One line, carrying the unchanged signal + the recovery pointer, e.g.:

```
[unchanged since 14:02:11 — identical to the earlier `git status` in this dir; full output: <rawStore pointer>]
```

It must (a) name the command + when it last differed, (b) carry the `rawStore`
pointer so the full output is one fetch away, (c) be unmistakably a tk marker.

## Plan

### Phase 0 — ADR + decisions (write `docs/adr/0009-session-dedup.md` first)
Record: always-run + exact-compare as the shared spine with ztk (cite
`ztk/src/proxy_session.zig`), and tk's four divergences (recovery pointer,
session+cwd key, separated `dedup` accounting, exit identity); key schema; the
read-only gate; the re-anchor window default and its rationale ("still in
context", not "state fresh"); TTL classes; the `dedup` ledger dimension and the
never-sum rule; default-off behind a flag for first ship. Decide the re-anchor
window: a conservative wall-clock default per `ttlClass` —
- fast (`git status`, `ls`, `tree`, `find`): 30s
- medium (test runners, `eslint`, `tsc`): 2m
- slow (`git log`, `gh`): 5m
…but state clearly these bound *recoverable-context staleness*, not correctness.

### Phase 1 — Persistent per-session store (`src/core/dedupStore.ts`)
On-disk, under `~/.token-killer/`, keyed by `(sessionId, cwd, normCmd)` → `{ hash,
exitCode, lastEmittedAt, lastDifferedAt, rawPointer }`. Atomic + locked +
fail-open. Unit-test TTL expiry, concurrent writers, corruption recovery.

### Phase 2 — Declare cacheability on handlers (`handler.traits`)
Add `cacheable: boolean` + `ttlClass` to the trait seam. Mark the read-only
handlers (git status/log/diff/show, ls, tree, find, grep/rg, wc, cat/read, env,
test runners, linters, `gh`, `docker ps`, `kubectl get`, package `list/ls`).
Mutating commands stay `cacheable: false` and declare they bump cwd generation.
Unknown/no-handler commands are not cacheable.

### Phase 3 — The dedup stage in `src/executor.ts`
After compression, before emit: if eligible (cacheable + read-only + non-TTY +
not structured/tiny), hash the compressed output, compare to the store within the
re-anchor window for `ttlClass`. Hit → swap output for the marker (Phase "marker"),
record a `dedup` ledger event with bytes saved. Miss/expired/exit-changed → emit
normally, upsert the store entry. Keep the executor's existing fail-open behavior.

### Phase 4 — Separated `gain` accounting
Thread the `dedup` dimension through `src/core/ledger.ts` →
`src/core/aggregate.ts` → `tk gain`. `tk gain` shows filter savings and dedup
savings as separate lines; `tk gain --history` labels dedup rows. Never sum.

### Phase 5 — Config + gate
A flag (`TK_SESSION_DEDUP` env + config key), **default off** for the first ship;
`tk gain`/dogfood proves value, then flip default-on in a follow-up. Respect the
existing TTY gate and structured-data guard. `tk --raw` bypasses dedup like all
compression.

### Phase 6 — Tests (the proof)
- exact-compare hit returns the marker with a valid recovery pointer;
- any byte difference (mutation, edit, branch switch) → full re-emit, no stale hit;
- changed exit code → no hit;
- past the re-anchor window → re-emit full (re-anchor);
- concurrent invocations don't corrupt the store; lost update fails open;
- `gain` reports dedup separately and never double-counts;
- read-only gate: a mutating command is never deduped;
- recovery: fetching the marker's pointer yields the full original.
Keep the full suite green (it was ~1202 tests; do not regress).

## Success criteria
- A repeated read-only command in one session emits the marker, not the bytes,
  with a working recovery pointer — verified by a test and one real dogfood
  (`tk gain --history` shows a labeled dedup row).
- Any change to the underlying state produces a full re-emit (exact-compare proven).
- `tk gain` reports dedup savings as a distinct line, never summed with filter
  savings; no ledger dimension is double-counted.
- ADR 0009 committed; default-off flag; whole suite green; no new lint/tsc errors.

## Guardrails
- **Lossless or nothing.** Only ever dedup byte-identical, read-only, exit-unchanged
  output, and always carry the recovery pointer. If any precondition is unclear at
  runtime, emit the full output. Under-dedup is fine; a wrong "unchanged" is not.
- **Do not build mutation-invalidation as a correctness crutch.** Correctness rides
  on exact-compare; the cwd-generation bump is a cheap optimization only.
- **Honor `TOKEN_KILLER_HOME` in every store/test path** — never write real
  `~/.token-killer/` from tests (keep the setupFiles sentinel green).
- **No `git push`.** Branch work stays local; commit only when asked.
- If an integration point differs from what this goal assumes (executor shape,
  ledger schema, rawStore pointer format), follow the real code and note the
  divergence in the ADR — do not force the code to match this document.

---

## STATUS: COMPLETE (2026-06-09)

Shipped on branch `token-killer-node-cli` (uncommitted; `git push`/commit only on
request per the guardrail). All five deliverables landed and every success
criterion is met; full product suite **1307 tests green**, `tsc --noEmit` clean,
oxlint/oxfmt clean on all touched files, real dogfood confirmed.

**Deliverables**
1. Dedup stage wired into the pipeline — `src/core/sessionDedup.ts`, wired in
   `src/core/pipeline.ts` (after `filterWithFallback`, before `recordHistory`).
2. Persistent, cross-process, concurrency-safe store — `src/core/dedupStore.ts`
   (one file per project `~/.token-killer/projects/<fp>/dedup.json`; lock-free read,
   advisory-lock + temp-rename write; fail-open).
3. Separated `dedup` accounting in `tk gain` — `src/core/dedupLedger.ts` +
   `src/core/gain.ts` (dedicated `dedup-events.jsonl`, never summed into ledger ①).
4. ADR — `docs/adr/0009-session-dedup.md` (written first, per Phase 0).
5. Green tests — `tests/unit/core/{dedupStore,readonly,sessionDedup,dedupPipeline,sessionCarrier}.test.ts`
   covering expiry, re-anchor, never-make-worse, recovery, concurrency, the
   read-only gate, exit identity, separated accounting, and the `--session` carrier.

**Key design (per the in-session directives, recorded in the ADR)**
- Key = `(project_fingerprint, normCmd)`, **not** session-keyed; correctness rides on
  exact-compare + wall-clock TTL. Session id is a best-effort entry attribute (marker
  wording + optional slow-class gate), carried through the rewritten command via a
  portable `--session <id>` flag (sanitised `^[A-Za-z0-9._-]{1,128}$`), with
  `TK_SESSION` env fallback; stamped onto history rows as `session_id`.
- Read-only handlers carry `traits.cacheable` + `ttlClass` (fast 30s / medium 120s /
  slow 300s). Default-ON (lossless + recoverable); opt out via `TK_SESSION_DEDUP=0`
  (env) / `sessionDedup: false` (config) / `--no-dedup` (per command) / `--raw`.
  Mutation-invalidation deliberately NOT built (tk cannot observe most mutations;
  exact-compare is the complete spine).

(Note: this file is the goal SPECIFICATION, not a deliverable. The deliverables are
the shipped code + ADR + tests above. This status footer is appended only to record
completion in place.)
