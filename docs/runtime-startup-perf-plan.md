# Plan — cut tk per-command latency on the slow Windows box

**Status:** plan only — nothing here is implemented. Companion to
`docs/runtime-startup-perf-goal.md` (problem statement + box measurements).
**Date:** 2026-06-11. **Author:** Fable (research/plan pass).
**Rev 2:** re-based after the goal's re-measurement showed the box is
**variance-dominated** (same command swings 2–4×; physically-impossible
orderings observed). Rev 1's point-value arithmetic (925+57+940+738=2660) is
retired; this revision ranks by **structure** — spawns and EDR-priced file ops
removed per command — and validates by **op-count, not milliseconds** (§6).
**Rev 3:** re-sequenced per `docs/runtime-startup-perf-feedback-rev3.md` —
technique inventory and methodology unchanged; the **daemon is now a
conditional outcome behind two gates** (EDR-exclusion feasibility M5, and
**M-pre** daemon EDR-tolerance), §5 is a decision tree, and the optimization
ceiling now leads §0.

---

## 0. Executive summary

**The ceiling, up front:** tk can asymptotically reach ≈ **bare tool + one
small constant**; it can never beat the bare tool. On this box the bare tool
itself is 400–738 ms+ and jittery (it pays the same AV tax), so "500–600 ms
total" is reachable only in good weather AND only with the daemon (possibly +
EDR exclusion). **"Native 300 ms" does not exist on this hardware.** Every
expectation below is bounded by this.

The box's robust findings (stable across every noisy run): **every process
spawn pays a variable ~400–1100 ms CrowdStrike tax** (even `git --version` ≈
417 ms); **tk structurally spawns twice** where the bare tool spawns once
(three times via the real `.cmd` shim: cmd.exe → node → tool); bundle
load/compile is already cheap (40–230 ms over the node floor); `resolveProgram`
does **up to 630 EDR-priced `existsSync`** per command; net, tk adds ~1–2 s
per command, exact split unrecoverable from the noise.

- **Ship blind now (code-only, safe on every Node ≥20):** bake the resolved
  binary path into the shim wrapper (deletes up to 630 EDR-priced stats —
  the largest removable op-count on the hot path), plus per-command fs-op
  slimming, single-file CJS, and the compile-cache ladder. These remove
  **~640+ EDR-priced fs ops per command** but **zero spawns** — likely a few
  hundred ms here (unsizeable more precisely under this noise), and they do
  not change the architecture's floor.
- **The floor is the per-spawn tax, and only two things touch it:** EDR
  exclusions (per-machine, corporate IT — CrowdStrike console, not
  `Add-MpPreference`; Defender is OFF) or the **daemon** (code-only, every
  user), which removes the per-command **node** spawn and restores near spawn
  parity with the bare tool.
- **Spawn-tax shape (refined by the within-run orderings):** the tax is
  **image-dependent** — node's spawn consistently cost 1.3–2.6× the bare
  tool's inside the same run — which favors the daemon's small thin client.
  The open question is the floor for a *tiny signed* exe (cheapest observed
  spawn: git at ~417 ms, but git is not tiny). **Row M8 sizes the daemon's
  ceiling (after M-pre clears it)**: ~10–50 ms ⇒ the daemon alone reaches the target;
  ~300–400 ms ⇒ the daemon caps at ≈ bare + ~400 ms and the target
  additionally needs EDR exclusion. The daemon wins big in both branches —
  M8 only sizes *how* big — and Bun/SEA stay dominated either way (they keep
  a per-command large-image spawn, the expensive kind).
- **tk-work is the bad-weather tail, not a constant** (one run's within-run
  residual was ≈ negative — walk+history+capture can cost ≈0 under good AV
  weather): Tier-1 op removal compresses the tail that an agent loop keeps
  sampling; only the daemon moves the floor.
- **Recommendation (Rev 3 re-sequencing):** ship Tier-1 blind now and
  re-measure by op-count; resolve the two cheap external questions **before
  any daemon commitment** — CrowdStrike-exclusion feasibility (M5; if IT can
  grant it org-wide, Tier-1 + exclusion may already be good enough and the
  daemon is moot) and **M-pre: does the org's Falcon policy even tolerate a
  persistent daemon + named pipe + custom exe?** The daemon is a
  *conditional* branch of §5's decision tree, not a pre-commitment. Hand off
  the §6 matrix (op-count-first — timing alone cannot validate anything on
  this box). **SEA stays rejected; Bun stays gated.**

### Decision table

| # | Technique | Structural effect (per command) | Est. on this box | Confidence | Node-independent? | Effort | Who ships it |
|---|---|---|---|---|---|---|---|
| 1 | Bake resolved binary path into wrapper + manifest; runtime fallback | −up to 630 stats → +1 stat | ~60–950 ms (op-bounded; unsizeable tighter) | Grounded mechanism; size needs M1/M1b | Yes (all bands) | Low–Med | Code, every user |
| 2 | Daemon + native thin client | **−1 node spawn** (the big variable image), −walk, −writes; 3→2 spawns vs bare's 1 | overhead → thin-spawn tax + IPC (**M8 decides: ~50 or ~400+**) | **Gated: M-pre (EDR tolerance) → M8 (ceiling)** | Yes (amortized) | High | Code, every user — *conditional, see §5 tree* |
| 3 | Single-file CJS bundle | 51 chunk-opens → 1 (cold path; warm is cached) | bounded by the 40–230 ms bundle segment; bigger cold | Grounded (upper bound measured) | Yes; *helps* old Node | Low–Med | Code, every user |
| 4 | Compile-cache ladder (per Node band) | compile amortized on every band, not just ≥22.8 | ~0 here (≥22.8 already); matters for the old-Node field | Grounded | Degrades gracefully | Low | Code, every user |
| 5 | Per-command fs-op slimming (history/meta/fingerprint/config) | −5–8 EDR-priced ops | tens of ms, maybe more under bad AV weather | Speculative — M2 | Yes | Low | Code, every user |
| 6 | EDR exclusions (CrowdStrike console) | removes most of the ~400–1100 ms tax on **each** of the 2–3 spawns + fs ops | the single biggest lever | Grounded mechanism; size needs M5 | n/a | Zero code | **IT, per machine** |
| 7 | Bun `--compile --bytecode` | replaces the node spawn with a bun spawn — **spawn count unchanged** | unknowable; likely tax-dominated | **Speculative — gate on M7+M8** | Yes (removes Node) | Medium | Code, every user |
| 8 | Node SEA | spawn count unchanged + signature loss | ~0, possibly negative | Grounded reasoning → **reject** | Yes | Medium | — |

---

## 1. Structural accounting (what we attack, and why not milliseconds)

**Why no point values.** Repeated median-of-9/15 runs of the *same* command
swung 2–4× (`node -e 0`: 532→651→925→1080 ms; bare git: 517→738→2712 ms; tk:
2020→2712 ms) and some runs produced impossible orderings (`--raw` slower than
the full pipeline it subsets; tk-wrapped faster than bare). The amplifier is
intermittent CrowdStrike interception that hits some invocations and not
others. Consequences: (a) rank techniques by **ops removed**, which is exact
and code-auditable; (b) box validation must **count ops** (noise-immune), with
timing only as a paired, interleaved secondary signal — §6's methodology.

**Within-run orderings (goal §"Within-RUN observations" — stable inside a run
even though absolute values swing):**

- **A — node's spawn consistently costs more than the bare tool's** (925/738,
  651/517, 1080/417 across R1/R3/R4, same warm state). The AV tax is
  **image-dependent, not a flat per-spawn fee**: node.exe (large, many DLLs)
  pays 1.3–2.6× what git pays in the same weather. This shifts the
  spawn-floor prior toward the optimistic branch for the daemon's thin
  client (§4) — smaller image, smaller tax — though git's ~417 ms remains
  the cheapest spawn actually observed.
- **B — R1's within-run shares: node 35% / bundle 2% / tool 28% / tk-work
  35%.** Valid as the *structure of one run*, not as reproducible absolutes —
  the legitimate within-run form of Rev 1's retired decomposition.
- **C — `--raw` is not a clean control for filter cost** (slower than the
  full pipeline in 2 of 3 runs; it carries its own capture+history and
  destroys streaming). Treat the filter as "small relative to spawn/IO," not
  measured-exonerated — and fix `--raw` itself (2.5). This supersedes Rev 1's
  `--raw`-based localization; the op inventory below rests on code audit.
- **D — segments don't add.** R4: `tk git --version` 1309 < `node -e 0` 1080
  + bare 417 = 1497; the embedded node start ran ~200 ms cheaper than the
  standalone probe in the same run. Two consequences: (i) **never size a
  saving by summing standalone segment costs** — composite A/B measurements
  only (§6 methodology rule 4); (ii) R4's tk-work residual is ≈ *negative*:
  the entire walk+history+capture segment can cost ≈0 under good AV weather.
  **tk-work is the bad-weather TAIL, not a constant.** Tier-1 op removal
  therefore compresses the tail — which is what an agent loop feels, since
  running many commands back-to-back samples the tail constantly — while
  only the daemon moves the floor.

**Per-command op inventory** (code-audited 2026-06-11; this is the plan's
ground truth):

| Op class | Today (shimmed `tk git status`) | Bare tool |
|---|---|---|
| Process spawns | **3** — cmd.exe (`.cmd` wrapper) → node → git (2 in the goal's probe, which invoked `node cli` directly — row M9 sizes the third) | 1 |
| PATH×PATHEXT stats | up to **630** (`resolveProgram`, `src/executor.ts:128`; runs **exactly once**, in `buildSpawnTarget`) | 0 |
| Fingerprint tree-walk stats | ~5–15 × **≥3 call sites** (`history.ts:59`, `governance.ts:50`, `dataDir.ts:136`) — no `git` fork (statSync walk, `dataDir.ts:37`) | 0 |
| File writes | history append + project meta (+ config read) | 0 |
| Bundle opens | 51 chunks cold; compile-cache warm ≈ node floor (bundle segment 40–230 ms total) | 0 |

No other `spawn`/`execSync` exists in `src/core/` or `src/cli.ts`; the
filter/dedup pipeline stays exonerated (it's skipped by `--raw` and was never
the structural cost).

**Hook-delivered hosts pay double.** On Claude Code / Copilot the PreToolUse
hook spawns `tk hook <host>` (full node start + walk), *then* the rewritten
`tk git ...` runs — **two node spawns per command**, each paying the tax. The
path-cache layer (2.1b) trims the walks; only the daemon (§4) removes the
spawns.

**The spawn-floor question (load-bearing for Tier 2/3 ranking).** Ordering A
**refutes a flat per-spawn fee** — the tax is image-dependent. What stays open
is its lower bound for a *small signed* exe: git's ~417 ms is the cheapest
spawn observed, but git.exe plus its DLLs is not tiny and PortableGit may lack
reputation caching. If a ~2 MB signed client spawns in ~10–50 ms, the daemon
reaches ≈ bare + ε; if even tiny images pay ~300–400 ms, the daemon caps at
≈ bare + ~400 ms and the target additionally needs EDR exclusion. **M8 is the
discriminating experiment**; A shifts the prior toward the optimistic branch,
and §4 states the ceiling in both. Either branch, Bun/SEA stay dominated —
they keep a per-command *large-image* spawn, the most expensive kind A
identifies.

---

## 2. Tier 1 — ship blind (code-only, every user, safe across Node ≥20)

These remove fs ops, not spawns. They are EV-positive across the whole
uncertainty range (each strictly removes ops and degrades to today's behavior),
they help every Windows user with bloated PATHs even off this box, and they are
verifiable later by op-count without rework. They do **not** change the floor.

### 2.1 Bake the resolved binary path at install time  ⟶ largest removable op-count — ✅ DONE

**Status:** implemented. Install resolves each real binary once
(`resolveRealBinaryPath` → `resolveBinaryPath`, excluding the shim dir) and bakes
it: wrappers gain `export TK_REAL_BIN=…` / `set "TK_REAL_BIN=…"`, the manifest
records `resolvedPaths` and bumps `SHIM_MANIFEST_SCHEMA` → 2. Runtime
`buildSpawnTarget` short-circuits the PATH×PATHEXT walk via `bakedRealBin`
(basename-match + one `existsSync` revalidation, else falls back). The hook path
(no wrapper env) uses `~/.token-killer/path-cache.json` (`src/core/pathCache.ts`)
keyed by `hash(PATH+PATHEXT)`, revalidated with one `existsSync` per hit. `tk
status` surfaces stale / PATH-reorder-shadowed baked paths. Schema-1 manifests
still read back (resolvedPaths absent). Self-healing manifest-on-fallback NOT
done (the runtime revalidation + walk fallback already keeps it correct; re-run
`tk install` to re-bake).

**What.** `installWrappers` (`src/shim/install.ts:105`) already proves the real
binary exists via `realBinaryPresent` → `resolveProgram` at install time — and
then throws the resolved path away. Keep it:

1. Capture the absolute path per program at install (one walk, paid once).
2. Bake it into the wrapper: `.cmd` gains `set "TK_REAL_BIN=C:\...\git.exe"`,
   POSIX gains `export TK_REAL_BIN=...` (no-op win on POSIX but keeps wrappers
   symmetric). Record `resolvedPath` per program in `manifest.json` (bump
   `SHIM_MANIFEST_SCHEMA`).
3. Runtime (`buildSpawnTarget`, `src/executor.ts:178`): if `TK_REAL_BIN` is set
   **and** `basename(TK_REAL_BIN)` minus extension equals the requested program
   **and** one `existsSync(TK_REAL_BIN)` passes → spawn it directly. Otherwise
   fall back to today's walk. Worst case is one wasted stat, never a behavior
   change.
4. Second layer for the **hook path** (no wrapper env): a persistent cache
   `~/.token-killer/path-cache.json` keyed by `(program, hash(PATH+PATHEXT))`,
   revalidated with one `existsSync` per hit. 630 stats → 1 read + 1 stat.
   Invalidate on miss → walk → rewrite.

**Structural effect & estimate.** Deletes up to 630 EDR-priced stats per
command (full-miss worst case; the *typical* cost early-exits at the tool's
PATH position — M1b measures the real share). At plausible per-stat costs of
0.1–1.5 ms under CrowdStrike that is **~60–950 ms** — this box's noise forbids
a tighter claim, which is exactly why the change is ranked by its monotonicity:
it removes ops under every weather. Ordering D bounds the *good-weather* cost
near zero (R4's whole tk-work segment ≈ 0), so read the saving as **tail
compression**: little on a lucky invocation, hundreds of ms on a scanned one —
and an agent loop samples that tail on every command. *Confidence: mechanism
grounded; size speculative-needs-box (M1/M1b size it before any code lands).*

**Node bands:** pure JS + env var — identical on every band. **Y.**

**Risks.** (a) Stale baked path after the tool moves/uninstalls → caught by the
revalidation stat, falls back to the walk (slow-but-correct once); `tk install`
re-run refreshes; consider self-healing the manifest on fallback. (b) User
re-orders PATH intending a *different* git → baked path "wrong" until
re-install; document, surface in `tk status`. (c) Keep the D2 principle — only
bake a path `realBinaryPresent` proved exists.

### 2.2 Single-file CJS bundle (collapse 51 chunks → 1)

**What.** `tsdown.config.ts`: `format: cjs`, disable splitting, keep the 12
`await import()` management-subcommand boundaries lazy (in CJS they become
call-site `require()`s — add a bundle-grep CI check that inspect/optimize/
install code is absent from the hot startup path; two-entry fallback if the
bundler inlines them).

**Structural effect & honest sizing.** 51 cold-path file opens → 1. The warm
median win is bounded by the measured bundle segment (**40–230 ms over the
node floor, compile cache active**) — so this is *not* a headline win on this
box. Its real value: (a) cold/first-run after install/upgrade pays 1 AV
first-scan instead of 51; (b) ~70% faster CJS graph instantiation on older
Node ([nodejs/node#47247]) — helps the distributed field, not this box; (c)
**unlocks 2.3's Node-20 cache shim** (v8-compile-cache only hooks CJS).
*Confidence: grounded (upper bound measured).*

**Node bands:** works everywhere; *bigger* benefit on older Node. **Y.**

**Risks.** ESM→CJS regression surface: `import.meta.url` → `__dirname`
audit; no top-level await on the hot path (none exists); zero runtime deps so
no dual-package hazard. The 1554-test suite is the gate. This reverses the
chunk-split decision — record as an ADR with the AV file-count rationale.

### 2.3 Compile-cache ladder across the distributed Node field

Today: `module.enableCompileCache()` in `src/cli.ts` (try/catch). Per band:

| Band | Mechanism | Action | Effect |
|---|---|---|---|
| ≥22.8 | `enableCompileCache()` | none — **already working on the box** (cache files written; warm bundle segment is the cheap 40–230 ms) | full |
| 22.1–22.7 | `NODE_COMPILE_CACHE=<home>/v8-cache` | set it **in the shim wrapper env line** — zero tk code, version-agnostic (unknown env vars are inert) | full |
| 20–22.0 | `v8-compile-cache` shim | tiny CJS entry stub: `require("./v8-shim"); require("./main")` — **requires 2.2's CJS bundle** | degraded (slightly slower than native cache) |

**Estimate:** ~0 ms on this box (already on the ≥22.8 row); meaningful only
for old-Node clients elsewhere in the field (their uncached compile cost).
Point the cache dir under `~/.token-killer` so an eventual EDR folder
exclusion covers it. *Grounded.* **Degrades, never errors** — each rung is
additive and inert where unsupported.

### 2.4 Per-command fs-op slimming (history, meta, fingerprint, config) — ✅ DONE

**Status:** implemented in `src/core/history.ts` + `src/core/dataDir.ts`.
(a) `projectFingerprint(cwd)` is memoized at module level — the ≥3 walks/command
collapse to one (highest-value sub-item); `resetFingerprintCacheForTests` is the
test seam. (b) the project data dir is ensured once per process (`ensuredDirs`
Set) instead of `mkdir(recursive)` per command; a mid-run deletion self-heals on
the append's ENOENT so the ledger-① row is never dropped. (c) project meta is
written at most once per fingerprint per process (`metaEnsured` Set), so the
per-command `open(wx)` stops firing. (d) one pre-serialized append per row
(`appendJsonLine`, awaited — NOT fire-and-forget). (e) `TK_NO_HISTORY=1` opt-out
documented in `tk --help`. 1580 tests green.

`recordHistory` (`src/core/history.ts`) + `maybeWriteProjectMeta` are 2–3
EDR-intercepted opens/writes per command. Cheap fixes, in order: (a) write
project meta only when absent/changed at **install/inspect time**, not per
command; (b) single `appendFileSync` with one pre-serialized buffer (one open);
(c) **memoize `projectFingerprint(cwd)`** — the statSync tree-walk runs at ≥3
call sites per command, each ~5–15 EDR-priced stats; one module-level cache
keyed by cwd removes ⅔ of them; (d) optional `TK_NO_HISTORY=1` escape hatch
for latency-critical agents (documented cost: `tk gain` loses those rows). Do
**not** make writes fire-and-forget-async — the process exits immediately, so
async buys nothing.

**Structural effect:** −5–8 ops/command. **Estimate: tens of ms, more under
bad AV weather** — *speculative, sized by M2.* All bands. Low risk; keep the
gain-ledger invariants (never drop the ① ledger silently).

### 2.5 `--raw` should be `stdio: inherit` (defect, not just perf) — ✅ DONE

**Status:** implemented. Plain `--raw` now streams via `executePassthrough`
(`stdio: "inherit"`) — no pipe/decode/capture — and records a light history
row (exit code + duration only; size fields omitted on disk, the reader fills
them with 0). `--stats` / `--save-raw` still force the capture path when the
bytes are genuinely needed. (`src/cli.ts` `--raw` block, `recordRawLitePassthrough`
+ `coerceHistorySizes` in `src/core/history.ts`, `applyRecord` coercion in
`src/core/rollup.ts`.)

Today `--raw` still pipes + buffers the child's full output and records
history — it is the **heaviest** passthrough mode and it destroys streaming
(the user sees nothing until the child exits). Switching `--raw` to
`stdio: "inherit"` removes the capture/decode work entirely, restores
real-time output, and removes one structural reason `--raw` measured *slower*
than the full pipeline (the rest was AV noise). Decide explicitly what
`--raw` history rows should record once output is no longer observed (e.g.
exit code + duration only, no byte counts) — don't silently fabricate sizes.
All bands, low effort, behavior change limited to `--raw` invocations.

---

## 3. Tier 2/3 — the floor, and what actually removes it

### 3.5 EDR exclusions — biggest single lever, but IT-owned, per-machine

The robust finding is a ~400–1100 ms tax on **every** spawn (×2–3 for tk) plus
a toll on every file op. Exclusions for `node.exe` (image), the shim dir,
`~/.token-killer`, and the PortableGit dir attack the tax at its source — the
only lever that helps **all three spawns and the bare tool itself**.

**Correction kept from Rev 1:** `Add-MpPreference` is Windows **Defender** API
— Defender is OFF on this box. The active scanner is **CrowdStrike Falcon**,
centrally managed; exclusions (Sensor Visibility / ML exclusions) are an **IT
ticket** through the org's Falcon console, not a script. Matrix row M5 doubles
as the evidence to attach to that ticket. *Mechanism grounded; size needs M5.*
Document it (README "corporate AV" section); never depend on it.

### 3.6 Bun `--compile --bytecode` — Plan B, demoted further this revision

Bun replaces the node spawn with a bun spawn — **spawn count unchanged**.
Under the spawn-floor hypothesis (§1: even `git --version` pays ~417 ms), the
runtime-init speed Bun is famous for (~111 vs ~300 ms on a *macOS, no-EDR*
benchmark; [bun-vs-node-sea-startup]) is rounding error against the tax — and
a ~90 MB unsigned exe may scan *worse*. Parity audit still required
(`windowsVerbatimArguments` + ComSpec batch spawning in `buildSpawnTarget`,
legacy-codepage GBK decode, `fs` edges). **Node-independence: total** — the
one axis where it shines. Decision rule: consider only if **M8 refutes** the
spawn floor (tiny exe spawns cheap) **and** M7 shows the 90 MB image isn't
penalized **and** the daemon is rejected. Three gates, all box-bound.

### 3.7 PATHEXT-trim / readdir-based resolve (fallback-path micro-fix)

Even after 2.1, the walk still runs on hook-path cache misses. Two
refinements: probe a curated ext order (`.EXE .CMD .BAT .COM` first — covers
every tool tk fronts) before the exotic tail, and/or replace per-file stats
with one `readdirSync` per PATH dir (45 dir-reads vs 630 stats; whether EDR
prices directory enumeration cheaper is box-testable, row M10). Keep PATHEXT
*relative order within the probed set* to preserve Windows resolution
semantics. Low effort; do it opportunistically with 2.1.

### 3.8 Node SEA — recommend **against** (unchanged, reinforced)

A SEA binary is node.exe with a blob appended: **spawn count unchanged**, full
node runtime init retained, and the injected blob breaks the Authenticode
signature — an unknown unsigned ~80 MB binary plausibly scans *deeper* than
the signed, reputation-cached stock node.exe. Best case it saves the `cli.js`
open; the spawn-floor hypothesis makes even that irrelevant. Every axis is
dominated by Bun (startup) or the daemon (architecture). **Drop it.**

### 3.9 V8 startup snapshot (`node --build-snapshot`) — evaluated, **reject**

The goal names it, so spelled out: a snapshot blob only pre-bakes user-JS heap
init — part of the already-cheap 40–230 ms bundle segment, nothing of the
spawn tax. And the blob is **V8-version-locked**: built on one Node, it fails
on every other, so the distributed ≥20 field would need build-at-install on
each client with *their* node — medium effort, experimental flag, fragile
across upgrades, chasing ≤ tens of ms. Per-band behavior if revisited:
build-at-install via the client's own `node --build-snapshot` (≥20
experimental), skip silently on failure. **Dominated by 2.2+2.3 on every
axis.**

### 3.10 Other alternatives considered and rejected (search-space record)

- **Spawn-ahead / prewarmed node pool** (shim keeps one node pre-started for
  the *next* command): daemon-grade lifecycle complexity, and agent loops fire
  commands back-to-back so the pool misses exactly when it matters. The daemon
  strictly dominates.
- **Custom slimmed Node build** (`--without-intl`, smaller image): unsigned
  custom binary — same signature/reputation regression as SEA, plus a build
  matrix. Rejected.
- **WSH `cscript` as a zero-distribution thin client** (signed system binary):
  no trustworthy named-pipe client API, deprecation-adjacent; the Go client
  (§4) + npm per-platform distribution is strictly better. Rejected.
- **Wrapper-level bypass** (`.cmd` skips tk for "never compressed" commands):
  the compress/passthrough decision depends on args + output size + TTY, which
  the wrapper cannot know without running tk. Rejected as unsound.

---

## 4. The daemon (Tier 3) — only code-only path that changes the structure

### Prerequisite gate (M-pre) — before sizing, before building

The daemon is a **long-lived, self-spawned node background process + a named
pipe + a custom native client** — precisely the behavioral pattern EDR is
tuned to flag, kill, or block. There is real irony here: we would add a
persistent process to dodge the per-spawn AV tax, and persistent processes +
IPC are what Falcon watches hardest. So before M8 is even worth running, IT /
the box must confirm the org's Falcon policy **permits such a process to run
and stay alive** — not killed, not quarantined, not blocked by application
control (§6 row M-pre). If it is blocked, this entire section is dead on
arrival regardless of M8, and the §5 tree falls through to its honest-floor
branch. "Sign the client" mitigates but does not answer this — only the
policy check does.

### Verdict the goal asked for, stated plainly

**500–600 ms total is not reachable by any per-command-Node architecture on
this box** — the node spawn alone ranged 530–1080 ms, and bare git itself
ranged 517–2712 ms, so on bad-weather runs *no* architecture reaches it. The
honest formulation: **tk total ≈ bare tool + one thin spawn + ε**, achieved by
removing the per-command node spawn. Two branches, decided by **M8**:

- **Tiny-exe spawns cheap** (~10–50 ms): daemon overhead ≈ 30–100 ms → tk ≈
  bare + ε. Target met code-only, every machine. Ordering A (the tax is
  image-dependent; node consistently outprices even git's spawn) shifts the
  prior toward this branch.
- **Even tiny images pay ~300–400 ms**: daemon overhead ≈ ~400 ms — it still
  removes the node spawn (consistently the *most expensive* spawn observed:
  530–1080 ms standalone) *plus* the walk *plus* the writes (history batches
  in memory), i.e. still ~1–1.5 s/command better than today, but the original
  target then needs **EDR exclusion on top**. No code path escapes this
  branch — Bun/SEA spawn larger images still.

Either way the daemon dominates every code alternative *once M-pre clears it*;
M8 decides its ceiling, not its rank. **Sizing caveat from ordering D
(non-additivity):** the embedded
node start ran ~200 ms cheaper than the standalone `node -e 0` probe in the
same run — quote daemon savings only from composite A/B runs (today's tk vs
daemon-served tk), never from segment arithmetic.

### Design sketch

- **Thin client:** native, prebuilt — **Go** recommended (static single exe,
  trivial cross-compile, named pipes via `Microsoft/go-winio`; Rust equally
  viable — taste, not capability). Distributed like esbuild: per-platform npm
  packages under `optionalDependencies`; `tk install` writes shim wrappers
  that exec the native client instead of `node cli.js` — which also deletes
  the `.cmd` → cmd.exe **third spawn** (M9). **Sign the exe** (unsigned Go
  binaries are AV false-positive bait — budget for a signing cert).
- **Transport:** Windows named pipe `\\.\pipe\tk-<user>-<hash(TOKEN_KILLER_HOME)>`
  (default same-user DACL is the isolation boundary); POSIX
  `~/.token-killer/daemon.sock`.
- **Protocol:** length-prefixed JSON frames. Request: `{argv, cwd, env-subset
  (PATH, PATHEXT, TK_*, ComSpec, locale), stdin?}`. Response: streamed
  `{stream: out|err, chunk}` frames + final `{exit}`. Client mirrors streams
  to its own stdio and exits with the code.
- **Lifecycle:** client connects → on failure, acquires a lockfile, spawns
  `node <abs>/dist/cli.js __daemon` detached, retries with ~50 ms backoff up
  to ~2 s → on continued failure **falls back to direct `node cli.js` exec**
  (today's path — the daemon is an accelerator, never a dependency). Daemon:
  pidfile, idle-exit after 30 min, exits if its bundle file's hash changes
  under it.
- **Version/upgrade:** handshake carries tk version + bundle hash; mismatch →
  daemon drains in-flight requests and exits; client respawns the new one.
  The **client-Node-version axis amortizes away**: whatever Node the box has,
  its cold-start is paid once per idle window, not per command.
- **Multi-project isolation:** none needed at the process level — the daemon
  is per-user and stateless across requests; each request carries `cwd`, and
  the existing project-fingerprint logic keys history per request. History
  batches in memory, flushes every N commands / on idle / on exit (bounded
  N-row crash loss, documented) — which subsumes 2.4.
- **Spawn accounting:** bare tool = 1 spawn; today's shim = 3; daemon = 2
  (thin client + tool), and the surviving extra spawn is the smallest,
  signed, most reputation-cacheable image we can make. On hook-delivered
  hosts (Claude Code/Copilot) the win **doubles**: `tk hook` calls route
  through the same client/pipe, eliminating the second per-command node spawn
  identified in §1 — no other technique touches that.
- **Effort/risk:** high — 1–2 weeks. Risks: lifecycle bugs (stale daemon,
  lock races), EDR eyeing the client (sign it), pipe ACL surprises on
  hardened images (fallback covers it), one more binary in the distribution.

---

## 5. Recommendation — decision tree (Rev 3)

The daemon is no longer a pre-commitment: it is a 1–2 week build (Go client +
signing cert + named-pipe lifecycle + a per-platform npm distribution channel)
and must not start before the cheapest, highest-leverage lever — EDR exclusion,
which also helps the bare tool the daemon can never beat — has been checked.

1. **Ship Tier-1 blind:** 2.1 bake-path (+3.7 opportunistically), 2.4 fs-op
   slimming, 2.3 cache ladder, 2.2 single-file CJS, 2.5 `--raw` fix. None
   depends on the box, none can regress on any Node ≥20 (each degrades to
   today's behavior), each is verifiable later **by op-count** without
   rework. Expected: −640+ EDR-priced ops/command — tail compression, order
   few-hundred ms on scanned invocations; old-Node clients elsewhere gain
   more (2.2/2.3 target them). This tier does **not** change the floor.
2. **Re-measure by op-count** (M0/M1b/M2): confirm the ops are gone and
   observe the post-Tier-1 typical case. The 630-stat storm is the larger,
   more weather-variable block — removing it may shrink the daemon's
   marginal value.
3. **In parallel, resolve the cheap external levers (zero code):** file the
   CrowdStrike exclusion IT request (M5, including *org-wide grantability*)
   and the **M-pre** daemon-tolerance inquiry (§4 gate).
4. **Then branch:**
   - **Exclusion grantable org-wide AND Tier-1 + exclusion lands in an
     acceptable band → stop. The daemon is moot.**
   - **Else if M-pre says Falcon tolerates the daemon → build §4** (the
     design stands as written), ceiling sized by M8. Start with the protocol
     + node-side daemon (testable everywhere, incl. CI on POSIX sockets);
     the Go client lands behind the exec fallback so partial shipping is
     safe.
   - **Else (no exclusion AND no daemon) → document the hard floor
     honestly:** tk caps at bare tool + 2 spawns − Tier-1 ops; the box's own
     bare-tool latency is the wall.

**Decisions safe blind:** everything in (1), dropping SEA and
`--build-snapshot`. **Decisions gated on the box/IT:** the daemon (M-pre →
M8), exclusion sizing (M5), Bun (M7 **and** M8 **and** daemon-rejected),
readdir resolve variant (M10).

What breaks if the box Node is older/newer than assumed: nothing in (1) — 2.1
and 2.4 are version-blind; 2.3 is a ladder by construction; 2.2 helps older
Node. The daemon runs on whatever Node is present and amortizes its cost. The
only version-floor items in this plan (SEA ≥22, snapshot) are rejected ones.

---

## 6. Experiment matrix — ⚠️ HANDOFF ARTIFACT

> **To be run by an operator with access to the target box. We cannot run
> this here.** Non-target Windows machines (LAN/dev, stock Defender, no
> CrowdStrike) give **reference-only** results — correctness and relative
> ordering, never sizing or in/out rulings for the target. Any single
> machine's Node version is **one sample of the distributed ≥20 field**.

### Methodology — REQUIRED, the box's noise floor exceeds its signal

1. **Op-counts are the primary signal; timing is secondary.** A naive
   median-of-9 timing run cannot validate anything here (the goal's own
   re-measurement produced impossible orderings). Use **Process Monitor**
   (or `wpr`/ETW): filter on the process under test, count `CreateFile` /
   `QueryAttributes…` ops against `~/.token-killer`, the PATH dirs, and
   `dist/`. An op-count delta (e.g. 630 stats → 1 after bake-path) is
   noise-immune and confirms the mechanism regardless of AV weather.
2. **Timing, when taken: paired and interleaved.** Run variants A/B
   alternately (ABAB…, n≥15 pairs, same session, plugged in, idle), report
   median + IQR of the per-pair difference, discard the first pair (cold
   scans). Never compare two separately-taken medians.
3. A row "passes" when the **op-count delta matches prediction** and the
   paired timing difference has a **consistent sign** — not when it hits a
   specific millisecond value.
4. **Never size a technique by summing standalone segments.** The box showed
   non-additivity (composite `tk git --version` ran ~200 ms *below* the sum
   of its standalone segments in the same run). Always measure the composite
   command before/after the change.

```powershell
function Measure-PairedMed {
  param([int]$N = 15, [scriptblock]$A, [scriptblock]$B)
  $d = 1..$N | ForEach-Object {
    $ta = (Measure-Command $A).TotalMilliseconds
    $tb = (Measure-Command $B).TotalMilliseconds
    $ta - $tb
  } | Select-Object -Skip 1 | Sort-Object
  'median Δ(A−B) {0:N0} ms  [IQR {1:N0}…{2:N0}]' -f `
    $d[[int]($d.Count/2)], $d[[int]($d.Count/4)], $d[[int](3*$d.Count/4)]
}
```

| Row | Setup (sketch) | Hypothesis it confirms/refutes | Gates which decision |
|---|---|---|---|
| **M0** | Re-run `scripts/tk-baseline-probe.ps1`, but as paired/interleaved per the methodology; capture a Process Monitor trace of one `tk git status` | Re-anchor + produce the definitive per-command **op inventory** (validates §1's table) | All rows below |
| **M1** | Paired: full-miss walk probe (`node -e` looping `existsSync` over PATH×PATHEXT for `zz_nonexist`) vs `node -e "0"`; **M1b**: same but probing `git` (early-exits at git's real PATH position) | The walk costs hundreds of ms worst-case; **M1b = the real per-command share**. Runs TODAY, pre-implementation. If M1b ≈ 0, 2.1's payoff is small (ship anyway — monotone) | Sizes 2.1 |
| **M2** | Paired: `node -e` doing the 2–3 history/meta appends vs `node -e "0"`; procmon-count the opens | fs-op slimming is worth tens of ms | Sizes 2.4 |
| **M3** | Paired: single-file build vs chunked build `--version`; procmon-count file opens (51 vs 1); separately byte-flip-rebuild each for a cold-scan pass | Warm Δ is small (bounded by the 40–230 ms segment) but cold Δ is large; opens 51→1 | Confirms 2.2; no-go only if single-file is *slower* warm |
| **M4** | Paired per Node band: cache populated vs `NODE_DISABLE_COMPILE_CACHE=1` (≥22.8); `NODE_COMPILE_CACHE` env (22.1–22.7); CJS shim (20.x, after 2.2) | Each ladder rung produces a sign-consistent warm improvement on its band | Confirms 2.3 per band |
| **M-pre** | **Not a timing row — policy inquiry + live tolerance check.** Ask IT whether Falcon policy permits a user-level persistent process + named pipe + custom signed exe; then run a minimal probe on the box (tiny node script serving `\\.\pipe\tk-probe` + a client) for a working day | Falcon does/doesn't allow the daemon pattern to run and stay alive (not killed, quarantined, or app-control-blocked) | **Gates all of §4, ahead of M8** — if blocked, the daemon is dead on arrival |
| **M5** | Re-run M0 inside an IT-granted temporary CrowdStrike exclusion window (`node.exe`, `~/.token-killer`, PortableGit); ask explicitly whether the exclusion is **grantable org-wide, permanently** | The exclusion removes most of the per-spawn tax — sizes the ceiling of every non-daemon path; org-wide grantability decides §5 branch 1 (daemon moot) | Sizes 3.5; **first branch of the §5 tree**; evidence for the IT ticket |
| **M7** | Paired: Bun `--compile` hello vs node hello; first-run (cold scan of ~90 MB unsigned) noted separately | Bun's spawn is/isn't cheaper than node's under CrowdStrike | One of three gates for 3.6 |
| **M8** | **PIVOTAL.** Paired: tiny signed static exe (2 MB Go hello, or an existing one like `fnm.exe`) vs `node -e "0"` vs `git --version` | **Small-image spawn floor**: ~10–50 ms ⇒ daemon alone reaches the target; ~300–400 ms ⇒ daemon ceiling = bare + ~400, target needs EDR exclusion on top. Prior favors the cheap branch (within-run ordering A: the tax is image-dependent — node consistently 1.3–2.6× git) | Daemon ceiling (§4); finalizes Bun & SEA demotion |
| **M9** | Paired: `& "$env:USERPROFILE\.token-killer\shim\git.cmd" status --short` vs direct `node cli git status` | The `.cmd`→cmd.exe hop is a third taxed spawn the baseline never counted | Sizes the extra win of the native client replacing `.cmd` (§4) |
| **M10** | Paired: M1 variant using one `readdirSync` per PATH dir vs 630 stats; procmon-count both | 45 dir-reads beat 630 stats under EDR (or not) | Picks the 3.7 fallback-walk implementation |

(M6/SEA intentionally omitted — rejected in 3.8; add a row only if evidence is
demanded.)

---

## 7. Risk register (consolidated)

| Risk | Technique | Mitigation |
|---|---|---|
| Box timing validation is itself unreliable (noise > signal) | all | §6 methodology: op-counts primary, paired/interleaved timing secondary |
| Spawn tax is image-independent → daemon ceiling = bare + ~400 ms | §4 | M8 discriminates; daemon still dominates either branch; EDR exclusion is the documented top-up |
| Stale baked path / user re-orders PATH | 2.1 | Revalidation stat + walk fallback; `tk install` refresh; surface in `tk status` |
| ESM→CJS regressions (`import.meta`, TLA) | 2.2 | Audit + full 1554-test suite; ADR documenting the chunk-split reversal |
| Single-file accidentally eager-loads subcommands | 2.2 | Bundle-grep CI check; two-entry fallback |
| Cache-shim slows Node 20 edge cases | 2.3 | Stub is try/catch'd; rung independently removable |
| History batching loses rows on daemon crash | 2.4/§4 | Bounded N-row loss, flush-on-idle/exit, documented |
| Daemon pattern itself (persistent process + pipe + custom exe) flagged/killed by Falcon | §4 | **M-pre gate before any build** — signing mitigates, only the policy check answers; exec fallback if it dies in the field |
| Unsigned native client flagged by EDR | §4 | Code-sign; npm-distributed like esbuild; exec fallback |
| Daemon serves stale code after upgrade | §4 | Version/hash handshake → drain + respawn |
| Bun parity (`windowsVerbatimArguments`, GBK decode) | 3.6 | Full audit before prototyping; triple-gated (M7+M8+daemon-rejected) anyway |
| SEA signature breakage / SmartScreen | 3.8 | Rejected |

[nodejs/node#47247]: https://github.com/nodejs/node/issues/47247
[bun-vs-node-sea-startup]: https://github.com/yyx990803/bun-vs-node-sea-startup
