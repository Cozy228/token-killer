# Implementation goal — Tier-1 perf fixes (2.5 → 2.1 → 2.4 → 2.3)

**Scope:** implement the four ship-blind Tier-1 items from
`docs/runtime-startup-perf-plan.md`, in this order: **2.5, 2.1, 2.4, 2.3**.
**Explicitly OUT of scope:** 2.2 single-file CJS (separate PR + ADR), the daemon
(§4, dropped), SEA / Bun / `--build-snapshot` (rejected). Do not touch them.

## Governing principles
1. **Field-first.** Evaluate and justify every change for the whole install base
   (Node ≥20 across the field, varied AV/EDR, varied PATH sizes, cold first-runs) —
   NOT for the one slow test box. The box is a single, non-reproducible sample.
2. **No box validation available.** We cannot measure on the target box, and box
   timing is variance-dominated anyway. So implement only changes whose benefit is
   **mechanism-auditable** (the op is provably removed), never timing-gambled. All
   four items qualify.
3. **Monotone + safe degradation.** Each change must strictly remove work and fall
   back to today's behavior on any failure / any Node band — never error, never
   change command semantics. Preserve every fail-open guarantee (a record-keeping or
   resolution failure must NEVER re-spawn or break the wrapped command — C6).
4. **Gate:** the existing 1554-test suite stays green, plus new unit tests per item.
   Verify cited file:line against current code before editing (they drift).

---

## 2.5 — `--raw` → `stdio: "inherit"` (do first; smallest, also a correctness fix)
**Where:** `src/cli.ts` `--raw` block (currently ~lines 255-271) + `recordRawPassthrough`
(~175). Compare against `executePassthrough` (`src/executor.ts`).

**Problem:** `--raw` today captures the child's full output (pipe + `TextDecoder`),
writes a history row, and may save raw — making it the *heaviest* passthrough, and it
**destroys streaming** (nothing prints until the child exits).

**Do:** route plain `--raw` through `stdio: "inherit"` (like `executePassthrough`) — no
capture, no decode, restore live streaming. Only fall back to the capturing path when
accounting genuinely needs the bytes (`--stats` / `--save-raw`). Decide explicitly what
a non-capturing `--raw` history row records (e.g. exit code + duration only; **no
fabricated byte/token counts** — absent is honest). Keep `replaceFootgunBanner` (it
needs only program+args, not output).

**Bands:** identical everywhere. **Tests:** `--raw` streams incrementally / no capture;
`--raw --stats` still reports; history row has no fake sizes; exit code preserved.
**Risk:** behavior change limited to `--raw` invocations.

---

## 2.1 — Bake the resolved binary path at install time (largest removable op-count)
**Where:** `installWrappers` / `realBinaryPresent` (`src/shim/install.ts` ~105) already
resolve the real binary via `resolveProgram` at install and discard it;
`resolveProgram` / `buildSpawnTarget` (`src/executor.ts` ~128 / ~178) re-walk per
command — up to **PATH×PATHEXT** `existsSync` (630 on the test box; scales with the
user's PATH length, so **field value rises with bloated corporate PATHs**).

**Do:**
1. At install, capture the absolute resolved path per program (one walk, paid once).
2. Bake it into the wrapper env + manifest: `.cmd` `set "TK_REAL_BIN=C:\...\git.exe"`,
   POSIX `export TK_REAL_BIN=...`; record `resolvedPath` per program in
   `manifest.json` and bump `SHIM_MANIFEST_SCHEMA`.
3. Runtime (`buildSpawnTarget`): if `TK_REAL_BIN` set **and** its basename-minus-ext
   matches the requested program **and** one `existsSync(TK_REAL_BIN)` passes → spawn
   it directly; else fall back to today's walk. Worst case = one wasted stat.
4. Hook path (no wrapper env): persistent `~/.token-killer/path-cache.json` keyed by
   `(program, hash(PATH+PATHEXT))`, revalidated with one `existsSync` per hit;
   invalidate on miss → walk → rewrite. (Put it under `~/.token-killer` so a future
   AV folder exclusion covers it.)

**Bands:** pure JS + env var — identical on every band. **D2 invariant:** only bake a
path `realBinaryPresent` proved exists — never fabricate. **Tests:** baked path used
when valid; stale/moved path → revalidation fails → walk fallback (correct, slower
once); PATH-reorder case documented + surfaced in `tk status`; manifest schema bump
migration. **Risk:** stale baked path → covered by the revalidation stat + fallback;
consider self-healing the manifest on fallback.

---

## 2.4 — Per-command fs-op slimming (sharpened — see the audited op count)
**Audited hot path of one `recordHistory` (`src/core/history.ts` ~44):**
`projectFingerprint(cwd)` (`src/core/dataDir.ts` ~83 → `gitRepoAnchor` walks
`statSync(.git)` up the tree + `resolveProjectRoot` realpath) is invoked **3 times per
command** inside recordHistory alone — via `historyFile`, via `record.project_fingerprint`,
and via `maybeWriteProjectMeta`→`projectMetaFile`. Plus a per-command
`mkdir(recursive)` and a per-command `writeFile(meta, flag:"wx")` that fires its `open`
syscall even when the meta already exists (EEXIST). More walks at the hook-path call
sites (`governance.ts`, `dataDir.ts`).

**Do (each is an op removal):**
- (a) **Memoize `projectFingerprint(cwd)`** at module level, keyed by cwd (pure within
  a process — git layout won't change mid-run). Collapses the 3 walks → 1, and also
  de-dupes the ≥3 cross-codebase call sites. *Highest-value sub-item.*
- (b) **Ensure the project data dir once per process** (in-process "ensured" Set/flag),
  not `mkdir(recursive)` every command.
- (c) **Write project meta once** — move it to install/inspect time, or guard with an
  in-process "meta ensured for this fingerprint" flag, so the per-command `open(wx)`
  stops firing.
- (d) Single append write with one pre-serialized buffer (one open).
- (e) Optional `TK_NO_HISTORY=1` escape hatch for latency-critical agents (documented
  cost: `tk gain` loses those rows).
- **Do NOT** make writes fire-and-forget-async — the process exits immediately, so
  async buys nothing; keep them awaited.

**Bands:** all. **Invariant:** never silently drop the ledger-① history row (gain
correctness); keep `fingerprintSegment` colon-neutralization for Windows paths.
**Tests:** fingerprint computed once per command (spy/count); dir ensured once; meta
not re-opened when present; history row still complete; `TK_NO_HISTORY` suppresses the
row and `tk gain` is unaffected otherwise.

---

## 2.3 — Compile-cache ladder across the Node field (field-only; ~0 on the box)
**Where:** `module.enableCompileCache()` in `src/cli.ts` (try/catch). Field value: the
box is already ≥22.8, but the **distributed field's older-Node slice** pays uncached
compile every run.

**Do (each rung additive + inert where unsupported):**
| Band | Mechanism |
|---|---|
| ≥22.8 | `enableCompileCache()` — already present, no change |
| 22.1–22.7 | set `NODE_COMPILE_CACHE=<home>/v8-cache` **in the shim wrapper env line** — zero tk code, version-agnostic (unknown env vars are inert) |
| 20–22.0 | `v8-compile-cache` shim stub — **requires the CJS bundle (2.2); if 2.2 is not shipped, this rung is deferred, note it** |

Point the cache dir under `~/.token-killer`. **Bands:** degrades, never errors.
**Note the dependency:** the 20–22.0 rung needs 2.2's CJS bundle (out of scope here) —
ship the ≥22.8 (no-op) and 22.1–22.7 (env) rungs now; **explicitly defer the 20–22.0
rung** with a one-line note rather than silently dropping that slice.

---

## Delivery
- **One branch, ordered commits:** 2.5 → 2.1 → 2.4 → 2.3, each its own commit with
  its tests, so any can be reverted independently.
- **Verification is by op-count / unit test, not box timing.** Where useful, add a test
  that counts the fs/resolve ops (e.g. spy `projectFingerprint`, assert called once).
- 2.2 (single-file CJS) and its dependent 2.3 bottom rung are a **separate follow-up
  PR with an ADR** documenting the chunk-split reversal; do not bundle here.
- Update `docs/runtime-startup-perf-plan.md` status lines as each item lands.
