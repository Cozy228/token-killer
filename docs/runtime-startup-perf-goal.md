# Goal — cut ctx per-command invocation latency on a slow Windows box

**For:** Fable (research + plan only; do NOT implement yet).
**Output:** a ranked, decision-complete plan (technique → expected ms → Windows/AV
caveat → effort → recommendation), plus a concrete experiment matrix to **hand off**
to whoever has box access. Info is pre-collected below — spend your budget on the
*solution*, not on re-measuring or re-reading the tree.

## ⚠️ Two hard constraints — read first, they shape everything

1. **No real verification is possible in this environment.** Neither you nor I can
   run anything on the target Windows box. We have exactly ONE real measurement
   (the §I5 table below) and published third-party benchmarks. So:
   - Your plan's confidence must come from **reasoning over those numbers**, not from
     "go measure it." Reason explicitly: "given node-start is 300 ms and AV amplifies
     fixed costs ~25×, technique X removes N file-opens → est. M ms, because …".
   - The PowerShell experiment matrix is a **handoff artifact** for a future operator
     with box access — clearly labelled as "to be run by someone on the box," NOT a
     step we execute. Each row states the hypothesis it would confirm/refute.
   - **Rank by expected value under uncertainty:** prefer changes that are (a) safe
     even if the saving turns out small, and (b) verifiable later without rework.
     Flag any technique whose payoff is *unknowable without the box* (e.g. Bun's AV
     first-scan cost) as "speculative — gate behind a box measurement."
   - **Even a LAN/dev Windows box is only a REFERENCE, not validation.** Facts:
     - The target corporate box runs corporate endpoint security including
       **CrowdStrike**, plus other real-time scanners.
     - A LAN or dev Windows machine does not have that corporate EDR; it runs at most
       stock Windows Defender.
     - We cannot run anything on the target box; we have one real measurement (§I5)
       plus published third-party benchmarks.
     Directive: treat numbers from any non-target Windows machine as **reference only**
     — usable to confirm correctness and relative ordering, not to size the real
     saving on the target box or to rule a technique in/out. State this caveat wherever
     the experiment matrix is run somewhere other than the target box.

2. **This is a DISTRIBUTED package — client Node versions are a whole unknowable
   range, not one number.** `ctx` ships to many machines; each may run Node 20, 22,
   24, anything ≥20. The Node version on any single machine we can touch is just one
   sample, NOT a design input — the plan must hold across the full field. Treat this
   as a first-class design axis:
   - **Every technique must specify its upgrade/downgrade (graceful-degradation)
     behavior across Node versions.** Anything gated on a version floor
     (`enableCompileCache` ≥22.8, SEA ≥22, `--build-snapshot`) **must degrade to a
     no-op on older Node, never error**, and you must state what each version band
     gets. `module.enableCompileCache()` is the model: present ≥22.8 (amortizes the
     bundle-compile segment), silently absent below — already wrapped in try/catch in
     `src/cli.ts`. For older Node, name the fallback (e.g. `NODE_COMPILE_CACHE` env
     ≥22.1, or the `v8-compile-cache` shim) or state plainly that there is none.
   - **Reward Node-version-INDEPENDENCE.** Approaches that remove the dependency
     entirely score higher: bundling the runtime (SEA / Bun `--compile` → the client's
     own Node version stops mattering). Add an explicit axis "behavior per Node band:
     ≥22.8 / 22.1–22.7 / 20–22.0 — (full / degraded / no-op)".
   - The plan must NOT assume any client can/will upgrade Node.

---

## The problem in one line

`ctx` is a Node CLI invoked **once per shell command** (via a PATH shim wrapper that
runs `node /abs/dist/cli.js <program> "$@"`). On a slow corporate **Windows 11**
laptop with endpoint AV, each invocation pays a full Node cold-start + bundle
load + ctx's own work. Native tool ≈ 300 ms; **acceptable target 500–600 ms total**
(lower is better). Today it's ~1300 ms.

This compounds: an agent loop runs many commands, paying the fixed cost every time.

---

## Measured on the REAL box (2026-06-11) — variance-dominated, read the FINDINGS not the point values

Source: `scripts/ctx-baseline-probe.ps1` + follow-up isolation runs on the target box.
Box: Dell Latitude 5430, i7-1265U (10C/12T), 32 GB, **Windows 11 Enterprise**,
**CrowdStrike Falcon** active (CSFalconService/Container), Windows Defender OFF, plugged in.

**⚠️ Point estimates on this box are NOT reproducible.** Across repeated median-of-9/15
runs the SAME command swung wildly: `node -e 0` measured 532 → 651 → 925 → 1080 ms;
`bare git status` 517 → 738 → 2712 ms; `git --version` ~417 ms; `ctx git status`
2020 → 2712 ms. Several runs even produced physically-impossible orderings (`--raw`
slower than full pipeline; ctx-wrapped tool faster than the bare tool) — proof the
noise floor exceeds the signal. The amplifier is intermittent **CrowdStrike** scanning
of each process spawn / file open, which hits some invocations and not others. So:
**do not optimize against any single number; optimize the STRUCTURE that the numbers
agree on.** (Numbers retained only as ranges.)

### Robust findings (hold across every run despite the variance)
1. **Every process spawn pays a large, variable AV tax (~400–1100 ms).** Even
   `git --version`, which does no FS work, costs ~400 ms; `node -e 0` 530–1080 ms.
   This is process-creation intercepted by CrowdStrike, not anything ctx does.
2. **ctx spawns TWICE per command** — its own Node (to run the bundle) **and** the
   wrapped real tool — while the bare tool spawns once. So ctx structurally pays the
   spawn tax **~2×**. No micro-opt changes the "two spawns" structure; only removing
   the per-command Node spawn does (→ daemon).
3. **Bundle load + compile is cheap: ~40–230 ms over the node floor.**
   `enableCompileCache` is active on this box's node (typeof === 'function'; cache
   files written). **§I5's "180 ms bundle" was the wrong target; chunk-split / compile
   micro-opts have almost nothing left to win.**
4. **`resolveProgram` does up to 45 × 14 = 630 `existsSync` per command** (measured
   PATH/PATHEXT on this box), each AV-intercepted — a real structural cost, fixable by
   baking the install-time resolved path (see suspects below).
5. **ctx adds on the order of ~1–2 s per command over the bare tool**, and this
   **compounds across an agent loop** (many commands back-to-back). The exact split
   is unrecoverable from this box's noise, but the order of magnitude and its causes
   (findings 1–4) are clear.

### Within-RUN observations (only commands measured in the SAME run are compared)
Run-to-run swing set aside; these are the relative orderings observed inside a run.

**A. `node -e 0` measured higher than the bare wrapped tool, in every run, same warm state:**
| run | `node -e 0` | bare tool |
|---|---|---|
| R1 (git status) | 925 | 738 |
| R3 (git status) | 651 | 517 |
| R4 (git --version) | 1080 | 417 |

**B. R1 single-run breakdown (`ctx git status` = 2660):**
| component | ms | share | within-run basis |
|---|---|---|---|
| Node start | 925 | 35% | `node -e 0` |
| bundle + compile | 57 | 2% | `cli --version` − node |
| git itself | 738 | 28% | bare `git status` |
| remainder (resolve + capture/decode + history) | ~940 | 35% | ctx total − above |

**C. R1: the filtering path measured lower than `--raw`** — `ctx git status` 2660 (full
pipeline) vs `ctx --raw git status` 3007 (skips filter). (R3 showed the opposite
ordering for git status; R4 `git --version`: `--raw` 1617 > non-raw 1309.)

**D. R4 non-additivity:** `ctx git --version` 1309 < `node -e 0` 1080 + `git --version`
417 = 1497. The embedded Node-start and the standalone `node -e 0` differ by ~200 ms in
the same run.

### What the goal's framing has to change
- **"Native ≈ 300 ms, target 500–600 ms"** was off. On THIS box even a trivial spawn
  is ~400 ms and node-start 530–1080 ms. A per-command-Node-spawn architecture cannot
  reach 500–600 ms total here — that target is **only reachable by removing a spawn
  (daemon) and/or removing the AV tax (process exclusion)**. State this honestly.
- Optimize by **structure**: fewer spawns, fewer fs ops, fewer synchronous file
  writes on the hot path — NOT by shaving the (already cheap, already cached) bundle.

### Historical (§I5, single-shot estimate — now known to be both low and noisy)
`docs/reports/vscode-dogfood-issues-20260611.md` §I5 estimated node 300 / bundle 180 /
git 300 / ctx-work ≈520 / total ~1300 ms. Real box: node-start and ctx-work are each
much higher AND swing 2–4× run-to-run; treat §I5 as a rough early sketch, not a baseline.

### What's already RULED OUT for the ctx-work overhead
- rawStore (`src/core/rawStore.ts:25` — writes only on exit≠0 or >20000 chars)
- session dedup (default-off)
- chcp.com probe (`src/executor.ts` `detectWindowsLegacyLabel` — lazily spawned
  ONLY when child output fails strict UTF-8; clean `git status` is UTF-8 → never fires)
- filter/dedup pipeline is NOT the bulk of the cost: the dominant ctx overhead is in
  **child spawn + output capture/decode + history write**, common to both paths.
  (Caveat: `--raw` is NOT a clean control for "filter cost" — it carries its own
  capture+history overhead; see the side-finding below. So treat the filter as
  "small relative to spawn/IO," not precisely quantified.)

### Prime remaining suspects for the ~940 ms (UNVERIFIED — needs profiling on box)
1. **`resolveProgram` PATH×PATHEXT walk** (`src/executor.ts`, `resolveProgram`):
   Windows-only, does `existsSync(join(dir, program+ext))` across every PATH entry ×
   every PATHEXT. **Measured on this box: 45 PATH entries × 14 PATHEXT = up to 630
   `existsSync`/`fs.stat` per command**, each intercepted by CrowdStrike. (PATHEXT
   here is the bloated `.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.PY;.PYW;.CPL`.)
   *Known fix idea:* the shim already knows the real binary at install time
   (`realBinaryPresent` in `src/shim/install.ts`) — bake the resolved absolute path
   into the wrapper/manifest and pass it through, skipping the runtime walk entirely.
   This is the single highest-confidence ctx-side win.
2. `recordHistory` append (`src/core/history.ts`) — AV-scanned file write per command.
3. `maybeWriteProjectMeta` — AV-scanned file op.

### Side-finding (confirmed by code read): `--raw` is the HEAVIEST passthrough, not the lightest
Observed on box: `ctx --raw git --version` (~1617 ms) cost **more** than plain
`ctx git --version` (~1309 ms) — backwards, since `--raw` is sold as "no compression,
just run it." Root cause in `src/cli.ts:255-271` vs `executePassthrough` (`src/executor.ts`):

| path | spawn | capture+decode | recordHistory | maybeSaveRawOutput | streaming |
|---|---|---|---|---|---|
| plain passthrough (a non-compressing `ctx <tool>`) | 1, `stdio:"inherit"` | no | no | no | yes (live) |
| **`--raw`** | 1, **piped** | **yes** (buffer + TextDecoder) | **yes** | **yes** (conditional) | **no** (buffers to completion) |

So `--raw` adds, for ZERO compression benefit: a full in-memory capture+decode of the
child's output, an AV-scanned `recordHistory` write, and a conditional raw-save — and
**loses live streaming** (large output appears only after the command exits). On an
AV-heavy box the extra synchronous file write alone explains the ~300 ms.

**Fix direction (for the plan, not now):** `--raw` should default to the same
`stdio:"inherit"` passthrough (no capture, no history) and only fall back to
capture when accounting is genuinely requested (`--stats`/`--save-raw`). This both
removes the overhead and restores streaming. File as its own defect; it's also one of
the ctx-side structural wins below.

---

## Architecture facts (so you don't have to re-read the tree)

- **Entry:** `src/cli.ts` (447 lines). Already does, at the very top:
  `module.enableCompileCache()` (try/catch, no-op on Node <22.8), then 12 static
  imports of the compression hot path (parse, router, executor, gate, pipeline,
  history, savings, rawStore, …). Management subcommands (install/inspect/optimize/
  telemetry/report/gain) are loaded with **`await import()`** (12 sites) so they stay
  off the per-command path. So **lazy-loading of subcommands is already done.**
- **Build:** `tsdown.config.ts` → **ESM**, `platform: node`, `target: node20`,
  chunk-split. `dist/` currently has **51 `.js` chunks**. The hot path (`ctx git
  status`) loads only router+executor+gate+pipeline chunks, but it's still **many
  small files**, each a separate `fs.open` → separate AV scan on Windows.
- **Shim wrapper** (`src/shim/install.ts`): POSIX `exec <ctx...> <program> "$@"`;
  Windows `.cmd` `@echo off / setlocal / set CTX_SHIM_DIR / <ctx...> %*`. `ctx` here is
  `node <abs>/dist/cli.js` (absolute — `node.exe` PATH lookup already avoided).
- **`engines.node >= 20`** (dev machine happens to be on v22.22.2 — irrelevant, see
  constraint #2). `ctx` is distributed; clients span the whole ≥20 range. So
  `enableCompileCache()` amortizes the 180 ms bundle segment only on the ≥22.8 slice
  of the field and silently no-ops below — every technique needs this kind of
  per-version-band behavior spelled out, not a single assumed version.
- **Deps:** essentially zero runtime deps (self-contained bundle).

---

## Pre-digested web research (2024–2026 techniques, ranked for this exact case)

Per-technique: what it is / expected saving / Windows-AV caveat / effort. URLs included.

### Tier 1 — cheap, high leverage
1. **Single-file CJS bundle** (collapse 51 chunks → 1). On Windows each `require`/
   chunk `fs.open` is a synchronous AV interception; collapsing to one file makes AV
   scan *one* file. Est. **50–150 ms** on an AV-heavy box. Effort: low (esbuild/tsdown
   config: `format: cjs`, single entry, no code-splitting). Note current build is ESM
   + split — this is a *reversal* of the chunk-split decision, justified by the AV
   file-count multiplier. CJS module trees also start ~70% faster than ESM on older
   Node ([nodejs/node#47247](https://github.com/nodejs/node/issues/47247)). **Verify
   the hot path still lazy-loads subcommands** — single-file ≠ eager-load-everything;
   keep `await import()` boundaries (esbuild emits them as runtime chunks, OR inline
   them and rely on tree-shaking — measure which is faster on the box).
2. **Confirm/force V8 compile cache.** `module.enableCompileCache()` is already
   called but no-ops <22.8. Fallback: `NODE_COMPILE_CACHE=<dir>` env (Node 22.1+) or
   the `v8-compile-cache` npm shim for older Node. Est. **30–60 ms** from the 2nd
   invocation on. Put the cache dir under AV exclusion.
   ([v22.8 notes](https://nodejs.org/en/blog/release/v22.8.0))
3. **`resolveProgram` path caching / bake-at-install.** Eliminate the per-command
   PATH×PATHEXT `existsSync` storm (suspect #1 above). Bake the install-time resolved
   absolute binary path into the wrapper/manifest; or cache resolution in
   `~/.contexa`. Est. **up to 100–250 ms** on AV-heavy PATH. Effort: low–medium.
4. **AV process exclusion** (`Add-MpPreference -ExclusionProcess node.exe`, plus
   shim dir + `~/.contexa` folder exclusions). Zero code, **100–250 ms**, but
   needs admin/IT and is per-machine — document it, don't depend on it.

### Tier 2 — bigger lift, evaluate
5. **Node SEA** (single-executable, Node 22/24). Removes node.exe lookup + cli.js
   dual scan; ~20–50 ms vs current. **Caveat:** injecting the blob breaks Authenticode
   signature → unsigned `.exe` may get *deeper* SmartScreen/AV scanning, possibly
   net-negative; needs re-signing. Build is platform-bound (build on Windows).
   ([SEA docs](https://nodejs.org/api/single-executable-applications.html))
6. **Bun `--compile --bytecode`.** Biggest raw-startup win in benchmarks (JSC cold
   start; ~111 ms vs node-SEA ~140 ms vs bare node ~300 ms, *macOS*
   [yyx990803/bun-vs-node-sea-startup](https://github.com/yyx990803/bun-vs-node-sea-startup)).
   Cross-compile `--target=bun-windows-x64`. **Caveats:** ~90 MB binary (AV first-scan
   cost unknown — MUST measure on box); Bun≠100% Node API parity (audit ctx's
   child_process/fs/net usage). Effort: medium.

### Tier 3 — architectural, only real cure for the node-start floor
7. **Persistent daemon / nailgun model.** Long-lived ctx server + thin client over a
   Windows named pipe (`\\.\pipe\ctx-daemon`); per-command cost → IPC round-trip
   (<50 ms). **The catch:** the thin client itself must cold-start <50 ms, so it can't
   be Node — needs a Go/Rust shim (cf. Volta/fnm/esbuild-service/tsserver). High
   effort, lifecycle/versioning/multi-project-isolation complexity. This is the only
   thing that removes the 300 ms `node -e 0` floor entirely.

**Hard floor reminder (from §I5):** while the shim re-invokes node per command, even
a perfect ctx pays node(300)+bundle(180)+git(300) ≈ **780 ms min** on this box. Tier-1
micro-opts shave ~150–250 ms (gets ~1300 → ~1000–1050, still above target). Hitting
**500–600 ms total** almost certainly requires **either** AV process-exclusion
(removes much of the amplification) **or** a Tier-3 daemon. Be honest about this in
the plan — don't promise the target from micro-opts alone.

---

## What I want from you (Fable)

1. A **ranked plan** that holds up **without being able to verify on the box** and
   **without knowing the client Node version**. For each technique give: realistic
   ms estimate for THIS box *with stated reasoning and assumptions*, a confidence
   level (grounded / speculative-needs-box), "works regardless of client Node
   version? Y/N/degrades", and effort. Separate "code-only, ships to every user" wins
   from "needs IT/admin per machine".
2. An honest verdict on whether **500–600 ms is reachable without a daemon** — argued
   from the §I5 numbers, not deferred to measurement. If not, sketch the daemon design
   (thin-client language, named-pipe protocol, lifecycle, version/upgrade handling,
   multi-project isolation, fallback when daemon absent).
3. A **recommendation that is robust to the two unknowns**: prefer the path that wins
   across the plausible range of box Node versions and AV behaviors, and that doesn't
   need a box round-trip to be worth shipping. Note explicitly which decisions DO need
   a box measurement before committing, and which are safe to ship blind.
4. A copy-pasteable **PowerShell experiment matrix** — clearly marked **"hand off to
   an operator with box access; we cannot run this here, and any single machine's
   Node version is only one sample of the distributed field."** Rows: baseline
   `node -e 0`, single-file vs chunked, compile-cache hit/miss (across Node bands if
   possible), resolveProgram-cached, AV-exclusion on/off, Bun/SEA compare. Each row
   states the hypothesis it confirms/refutes.
5. Risks/tradeoffs for each: AV signature breakage (SEA/Bun), CJS-vs-ESM regression
   surface, daemon complexity, single-file vs keeping lazy subcommand boundaries,
   and **what breaks if the box Node turns out older/newer than assumed.**

Do NOT implement. Produce the plan; I'll review and pick.

### Pointers (read only if you need them — already summarized above)
- `docs/reports/vscode-dogfood-issues-20260611.md` §I5 (full measurement narrative + fix ladder)
- `src/cli.ts` (entry, compile cache, lazy imports)
- `src/executor.ts` (`resolveProgram`, spawn, decode)
- `src/shim/install.ts` (`realBinaryPresent`, wrapper generation, manifest)
- `tsdown.config.ts` (build: ESM, chunk-split)
