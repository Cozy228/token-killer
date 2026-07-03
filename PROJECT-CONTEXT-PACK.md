# Project Context Pack

> **Scope & method.** A factual, non-expanded record of `token-killer` as it exists on
> disk, built from recon + 6 parallel read-only exploration passes (code structure, docs &
> ADRs, git/memory history, key flows, the `feat/1.0.0` future branch, server/tests).
> No design decisions, no rankings, no recommendations. Every assertion carries a citation
> tagged `[from-code | from-doc | from-memory | inferred]`. Source conflicts are flagged in
> §6, not resolved. Generated 2026-07-02 on branch `feat/0.3.2`.

---

## 0. Orientation: two live branches, one repo

The single most important framing fact: the repo carries **two divergent product lines** on
separate branches, and `main` is nearly empty.

- `main` has 2 commits only (`ecb6618` init, `4f7b0e9` docs); active work never merged there. `[from-memory]` (git-history pass)
- **`feat/0.3.2`** (current checkout, `package.json` version `0.3.2`, tip `41fb460`): the **shipping product** — the command-output compressor + inspect/optimize + telemetry + doctor. `[from-code]` `package.json:3`
- **`feat/1.0.0`** (tip `eca661a`): a **docs-only pivot** to "codemap / codeguide", a project-local code-intelligence / code-graph product. No `src/codemap/` exists yet on that branch; the whole effort is research notes, a Product Contract, ADRs 0017–0041, and a schema draft (§7). `[from-code]` `git show feat/1.0.0:src/codemap` → "does not exist"
- Seven `worktree-agent-*` branches are parallel-agent scratch branches. `[from-memory]` `parallel-agents-share-branch.md`

Everything in §1–§6 below describes the shipping `feat/0.3.2` line unless stated otherwise.
§7 covers the `feat/1.0.0` future direction.

---

## 1. Product Context

**Problem solved.** Coding agents (Claude Code, GitHub Copilot CLI + VS Code) pay input tokens
for *every byte* of terminal-command output they read, and get re-billed when they re-run the
same command. `tk` runs the real tool, compresses its output before it reaches the model, and
suppresses byte-identical re-runs. `[from-doc]` `README.md:22-31`, `PRINCIPLES.md:8`

**What it is (canonical framing).** "A local Copilot cost-control companion … a command proxy,
a hook runtime, and a read-only session scanner" `[from-doc]` `CONTEXT.md:3-6`; positioned as a
"command-aware context optimizer," explicitly *not* a "CLI output summarizer" nor the most
aggressive compressor `[from-doc]` `PRINCIPLES.md:12`.

**Target users / value proposition, by document (two altitudes):**
- Developer/OSS README: "Cut your AI agent's token bill by 60–90% … Zero runtime dependencies,
  zero fabrication, zero lock-in." `[from-doc]` `README.md:3-10`
- Enterprise `PROPOSAL.md`: an "endpoint-level cost control layer for GitHub Copilot," addressed
  to managers/DevOps/IT; three jobs = runtime compression, inspect & optimize, gain & telemetry.
  `[from-doc]` `PROPOSAL.md:1-19`

**Stated non-negotiable ("the moat").** Honesty of measurement: savings are always measured
(`raw − delivered`), never estimated, and the four value ledgers are shown side-by-side and
**never summed** (a measured number is never added to an estimate). `[from-doc]`
`CONTEXT.md:149-156`, `README.md:262-264`. Retention over savings: "0% savings is not failure;
wrong compression is the only failure." `[from-doc]` `PRINCIPLES.md:20`

**Hard product boundaries (from the enterprise doc).** Does not control inline completions,
model output, provider-side caching, or GitHub billing; cannot guarantee every Copilot tool call
routes through its hook/shim; cannot attribute a share of GitHub's bill to terminal output.
`[from-doc]` `PROPOSAL.md:23,41`

---

## 2. Current System Shape

A zero-runtime-dependency Node CLI (`bin: tk → dist/cli.js`, `engines.node >=20`, ESM, built by
tsdown). `[from-code]` `package.json:6-11,40-41`. Ten `src/` subsystems; all read as **intended,
stable** design — no `TODO`/`FIXME`/mock markers were found anywhere in `src/`, and functions
carry dense ADR/issue-number rationale comments. `[from-code]` (structure pass, grep of `src/**`)

| Subsystem | Responsibility | Entry / key export | Status |
|---|---|---|---|
| `src/` top | argv parse, route, spawn real tool, shared types | `cli.ts:218 main()`, `router.ts:30 routeSpecific()`, `executor.ts:484 executeCommand()`, `parse.ts:87 parseArgv()` | Intended `[from-code]` |
| `src/handlers/` | per-command evidence-preserving compressors | `define.ts:31 defineHandler()`; registry `handlers/index.ts:54`; `generic.ts:4` fallback | Intended `[from-code]` |
| `src/core/` (33 files) | compression pipeline + local data store (history, dedup, rollup, ledgers, raw store) | `pipeline.ts:26 runPipeline()`, `emit.ts:17 emitThenCommit()`, `gain.ts runGain()` | Intended `[from-code]` |
| `src/shim/` (16 files) | host detection + delivery-tier install (hook/shim/injection) + doctor | `init.ts:389 runInstall()`, `detect.ts:39 detectHost()`, `gate.ts:30 gateDecision()` | Intended `[from-code]` |
| `src/hook/` (12 files) | per-command hook runtime for Copilot/Claude/VS Code | `cli.ts:47 runHook()`, `claude.ts:135 runHookClaude()`, `rewrite.ts` | Intended `[from-code]` |
| `src/inspect/` (21 files) | read-only scanner of agent transcripts + static context → findings | `cli.ts:168 runInspect()`, `scan.ts`, `passes.ts:200`, `report.ts:36` | Intended `[from-code]` |
| `src/context/` | consumes inspect findings → `tk optimize` (safe patches to context files) | `optimizeCli.ts runOptimize()`, `patchPlan.ts`, `applySafe.ts`, `rules/*` | Intended `[from-code]` |
| `src/telemetry/` (9 files) | opt-in, anonymous, network-off-by-default telemetry | `cli.ts runTelemetry()`, `endpoint.ts` (build-time const), `dispatch.ts`, `state.ts` | Intended `[from-code]` |
| `src/report/` | single-file offline HTML report (shared by gain + inspect) | `html.ts embed()`, `open.ts emitHtmlReport()` | Intended `[from-code]` |
| `src/support/` | `tk support` diagnostic bundle; opens a draft, never auto-sends | `support/cli.ts`, `send.ts buildMailto/…` | Intended `[from-code]` |
| `src/debug/` | `tk debug` self-contained diagnostic dump | `debug/cli.ts collectDebugBundle()` | Intended `[from-code]` |

**Interim / scaffold / deferred markers (the only ones found):**
- **Node compile-cache tier** for Node 20–22.0 is explicitly `DEFERRED` (labelled, "Not silently
  dropped") — an acknowledged scope cut, not unfinished code. `[from-code]` `src/cli.ts:13-15`
- **Renamed-command compatibility hints** (not aliases): `tk init`→`tk install`, `tk status`→`tk
  doctor` print a one-line hint and exit. `[from-code]` `src/cli.ts:390-393`, `src/shim/init.ts:41-44`
- **`server/`** (telemetry backend) is opt-in enterprise infra, not part of the CLI product; app
  tests run against a **mocked DB**, there is **no CI wiring** for it, and no evidence of a live
  deployment. `[from-code]` `server/README.md:51`, `server/app/test/ingest.test.ts:4-6`, `.github/workflows/ci.yml` (no `server/` ref)

---

## 3. Key Flows

### User flow (delivery)
`tk install` → `detectHost()` (env `CLAUDECODE`, `~/.claude`, `~/.copilot`, PATH, `TERM_PROGRAM`)
→ `selectTier()` picks the highest supported of **Hook > Shim > Injection**; VS Code installs
**hook + shim additively** (shim authoritative). A `TK.md` usage guide + a guard-wrapped block in
the agent's instruction file are written regardless of tier. `[from-code]`
`src/shim/init.ts:389,399-400,423-437,463`, `detect.ts:39,86`; `[from-doc]` `CONTEXT.md:33-56`, ADR 0012

### Control flow (compression hot path) — `tk git status`
1. `main()` → `parseArgv()` (`mode:"command"`). `[from-code]` `cli.ts:220`, `parse.ts:87`
2. `routeSpecific()` returns first handler whose `matches()` fires (else `null`). `[from-code]` `router.ts:30`
3. Passthrough-hardening + `gateDecision(command,isTTY,handler)` → `compress | passthrough | interactive | no-handler`. `[from-code]` `cli.ts:388-424`, `shim/gate.ts:30`
4. `runCompress()` → `handler.execute()` spawns the **real tool once** (`executeCommand()`, binary via `bakedRealBin`/`resolveProgram`) → `runPipeline()` → `handler.filter()` → `applySessionDedup()`. `[from-code]` `cli.ts:460-501`, `pipeline.ts:26,41`, `executor.ts:484,507`
5. `emitThenCommit()` writes stdout **before** any accounting, then defers ledger/history/dedup writes to `commit()`. Returns the **original exit code**. `[from-code]` `emit.ts:17-51`
6. **Fail-open:** a throw *before* execution → `failOpenPassthrough()`; a throw *after* execution ships raw bytes and never re-spawns (invariant "C6"). `[from-code]` `cli.ts:426-429,446-457,502-511`

### Control flow (hook loop, Claude Code)
Installed hook `tk hook claude` reads the `PreToolUse` payload on stdin → `decide()` →
`rewriteCommand()`; on `rewrite` emits `hookSpecificOutput.updatedInput.command = "tk <cmd>"` so
the host re-executes through `tk` (re-enters the compression flow). Always exits 0 (fail-open);
errors logged to `errors.log`. `[from-code]` `src/hook/claude.ts:59,87-101,120,146`

### Data flow (persistence)
Root `~/.token-killer/` (`TOKEN_KILLER_HOME` override, `mode 0700`), sharded per-project as
`projects/repo:<sha256-12>/`. `[from-code]` `core/dataDir.ts:76,114,148`
- `history.jsonl` (append-only, 0600) — ledger ① source of truth. `[from-code]` `core/history.ts:61,71`
- `raw/<ts>-<pid>-<n>-<cmd>.log` — recovery snapshots (atomic write, 0600). `[from-code]` `core/rawStore.ts:20`
- `dedup.json` + `dedup-events.jsonl` — session-dedup store & ledger. `[from-code]` `core/dedupStore.ts:88,108`, `dedupLedger.ts:31`
- `rollup.json` — cold-path cache over history (never written on the hot path). `[from-code]` `core/rollup.ts:458,526`
- Home-level: `telemetry-state.json` (device salt), `delivery-state.json` (capability matrix). `[from-code]` `telemetry/state.ts:19`, `shim/capability.ts:88`

### Data flow (inspect)
`tk inspect` → discover hosts → single-pass scan (or filtered `scan()`) over agent transcripts +
`runStaticContext()` over context files → analyzers (`mcp`, `footprint`, `runtimeFindings`,
`buildAdvice`) → `persistScopeBuckets()` (for `tk optimize`) → `buildReport()` → HTML (default) /
`--text` / `--json`. Exit codes 0/1/2/3/4. `[from-code]` `src/inspect/cli.ts:168,299-319,348,384-432,548-561`

---

## 4. Important Implementation Details

- **Handler model.** `defineHandler({name,traits?,programs?,match,format})` is the factory;
  handlers needing custom execute (git-status, ruff, npx) build the `CommandHandler` literal
  directly. Quality gate `makeFilteredResult()` enforces inflation/omission checks + masking
  fallback. `[from-code]` `handlers/define.ts:31`, `handlers/base.ts:104`, `types.ts:131-145`
- **Handler traits** drive behavior: `structural`, `masksSecrets`, `ladder`, `cacheable`,
  `ttlClass`. `[from-code]` `types.ts:113-125`
- **Session dedup eligibility** (all must hold): enabled; `!raw`; `saveRaw!==false`; exit 0;
  `traits.cacheable`; `!traits.masksSecrets`; read-only-proven; `filtered.output ≥ 256 bytes`.
  Compares a hash of the **raw** (not compressed) output; HIT requires freshness within
  `ttlClass` TTL (30/120/300 s). `[from-code]` `core/sessionDedup.ts:45,154-187`, `dedupStore.ts:16-20,78`
- **Four ledgers** joined read-side in `core/ledger.ts:130 loadLedgers()`, never summed: ①
  measured command savings (history/rollup), ② optimizer deltas (`optimize-actions.jsonl`), ③
  governance opportunities (`governance.jsonl`), ④ quality guardrails (fallback/failure/reverted).
  `[from-code]` `core/ledger.ts:9,130-175`, `inspect/optimizeActions.ts:69,102,135`
- **Vocabulary of evidence classes** (drives what may be compressed): location-class (matches,
  diagnostics, diff hunks — never capped), flat all-evidence list, stream-class; "evidence-capping"
  / `+N more` is **banned outright**. Over-budget "ladder": lossless reduction → complete-
  replacement summary + pointer. `[from-doc]` `CONTEXT.md:279-348`, `PRINCIPLES.md:19,21`
- **Telemetry:** two independent opt-ins (`telemetryExport` local, `telemetry` network), both
  default false; network needs *both* `telemetry:true` **and** a non-empty build-time endpoint.
  Sends only on cold path (`inspect`/`gain`), ≤1/23h, 2 s timeout, `socket.unref()`. `[from-doc]`
  `TELEMETRY.md:3-38`; `[from-code]` `telemetry/endpoint.ts:1-17`
- **External deps:** CLI has **zero runtime deps** (ships `dist/` + `README.md` only). The
  separate `server/` package uses Hono + zod + AWS Lambda/API-GW/RDS/Terraform. `[from-code]`
  `package.json:10-12,43-55`, `server/app/package.json:24`, `server/terraform/*`
- **Tests:** 186 `*.test.ts` files; `tests/{unit,integration,smoke,setup,helpers,fixtures}`. The
  bulk is `tests/unit/handlers/rtk*Behavior.test.ts` (~90, fixture-driven). One vitest config,
  **product-tests-only** (an earlier product-vs-migration split was collapsed once "RTK migration
  complete"); `testTimeout 30000` for CLI-spawn cold-start; `isolateHome.ts` redirects
  `TOKEN_KILLER_HOME` per test. `[from-code]` `vitest.config.ts:3-16,35-36`, `tests/setup/isolateHome.ts:1-34`

---

## 5. Historical Context (archaeology, not judgment)

**Lineage.** Began as "tg / token guard" (six-capability architecture, command-proxy core, 20
handlers), with **RTK as the parity reference tool from day one**; renamed `tg → tk` (`d8a047c`)
and package `@company/tk → token-killer` (`b0de48f`). Later commits ratified deliberate divergences
from RTK ("tg 33.9% > rtk 31.3% — don't chase the number"). `[from-memory]` (git-history pass),
`rtk-track-a-parity-complete.md`

**Decision archaeology (ADRs 0001–0014, all `accepted` unless noted; amendments chained):**
- **0001** — removed RTK's fixed evidence caps (`CAP_ERRORS=20`) and `+N more` markers; replaced
  with lossless-digest + a recovery contract. `[from-doc]`
- **0002** (amended by 0006, 0012) — PATH-shim as primary delivery, because Copilot hooks were
  *believed* a dead-end in enterprise VS Code. **0005** later proved (empirically) hooks *do*
  fire — the "dead end" was an instrumentation bug — and **0012** made hook+shim additive for VS
  Code. `[from-doc]`
- **0003** (amended by 0006) — inspect is scope-aware (user default, `--project` opt-in). Its
  original "project files never modified" stance was **overturned** by **0006**, which introduced
  `tk optimize --apply` as a git-aware engine that *can* write to project-tracked files (backed up,
  disclosed, reversible). `[from-doc]`
- **0004** (amended by 0006) — opt-in network telemetry + `tk gain` RTK parity.
- **0006** — CLI surface consolidation (removed `tk shim`/`tk report` alias/`tk agentsmd`/`telemetry purge`).
- **0007** — pipe-tail compression **investigated and declined**: measured 85 real Claude Code
  sessions, safe payback < 1% of tokens. `[from-doc]` / `[from-memory]` `pipe-tail-compression-declined.md`
- **0008** — VS Code guidance delivered as a user-level `*.instructions.md` file (the old ~340-char
  injection went to a path VS Code doesn't auto-load).
- **0009** — cross-invocation session dedup, **default-on**, separate ledger. `[from-doc]`
- **0010** — per-session denominator switched to "unique content" (~27%) from an earlier
  churn-inflated "footprint" basis (8.56%), judged misleading. `[from-doc]`
- **0011** (superseded by **0013**) — `tk support` routing was env-var configured at runtime; 0013
  bakes the destination at build time (user picks channel, never address).
- **0014** — `tk doctor` unifies diagnose+repair + records normalization; removed `tk status`.

**Explicit non-goals ("明确不做", indefinitely deferred — ROI judged insufficient absent real usage
data).** `[from-doc]` `DESIGN.md:70-78,458,628,1273`
- posttool `modifiedResult` result compression; direct-tool result projection (`read_file`/`grep_search`);
  Layer-3 model-input-cacheability diagnostics ("zero leverage — tk can't measure Copilot's prompt
  assembly"); `compact` / `lossless-pointer` compression levels (rejected as a recoverable `+N more`,
  which violates the fake-completeness ban).
- Default non-goals: won't replace the user's Copilot entry points, won't override existing
  agents/skills, no Claude Code subagent routing / real AI-gateway routing "for now".

**Audit-driven hardening.** A 2026-06-10 adversarial audit + a 2026-06-06 comprehensive audit
drove numbered plans 001–013 (CI, emit-before-accounting, 0700/0600 perms, docs truth-sweep,
`%`-expansion, truncation-safe decode, telemetry-stem allowlist, hook-install guard, `tk support`,
estimator index loop) — all DONE except 010 (TODO) and 013 (in-progress). `[from-memory]`
`plans/README.md`; `[from-doc]` `plans/001–013`

**Windows runtime-perf constraint origin.** On a corporate Windows 11 box (Dell Latitude 5430,
CrowdStrike Falcon EDR), per-command latency measured ~1300 ms vs a ~300 ms bare tool; box is
"variance-dominated" (2–4× swings). Robust findings: every spawn pays a ~400–1100 ms AV tax; a
shimmed `tk` = 3 spawns vs 1 bare; bundle load is cheap; `resolveProgram` did up to ~630
`existsSync` calls/command. `[from-doc]` `docs/runtime-startup-perf-goal.md:57-103`; `[from-memory]`
`runtime-perf-baseline-and-raw-defect.md`

---

## 6. Known Gaps And Open Questions

**Code ↔ doc contradictions (recorded, not resolved):**
1. **Session-dedup default state.** `README.md:259` says "Disabled by default; enable with
   `TK_SESSION_DEDUP=1`." Code says the opposite: `sessionDedupEnabled()` defaults **ON**, disabled
   only when `TK_SESSION_DEDUP` is `0/false/off/no`; ADR 0009 also states "default-on." `[from-code]`
   `src/core/sessionDedup.ts:45-52` vs `[from-doc]` `README.md:259`, ADR 0009.
2. **"Project repository is never written."** `CONTEXT.md:211-213` ("User-level: … The project
   repository is never written") coexists with ADR 0006 + `README.md:293-296`, which say `tk optimize
   --apply --project` *can* write to project files (backed up/reversible). The glossary reflects the
   pre-0006 invariant. `[from-doc]`
3. **Savings magnitude framing.** `README.md:3` claims "60–90%" and "~27% off a whole session";
   `PROPOSAL.md:80` warns org-level impact "must be established through a controlled pilot, not
   extrapolated," and its single-endpoint sample shows 50% char reduction. Memory records a standing
   caution against a universal "60–90%" claim. `[from-doc]` `README.md:3`, `PROPOSAL.md:80,113-130`;
   `[from-memory]` `manager-doc-framing-proposal.md`. **→ reframed in §9**: save-token is one facet of a
   broader context-management value; internal A/B data is the intended proof currency.

**Outdated / superseded specs still present:**
- `docs/reports/comprehensive-audit-2026-06-06.md` flags ADR 0001's evidence-capping as "designed but
  not implemented" — a snapshot that later work appears to have closed (no `+N more` found in `src/`);
  status of that finding is unverified here. `[from-doc]` / `inferred`
- `DESIGN.md` is large (§13.2 at line 1273); some sections predate ADR 0006's surface consolidation.
  `PRINCIPLES.md:4` names `DESIGN.md` as the single source of truth to avoid drift. `[from-doc]`

**Divergent field reports (same topic, different runs/versions):**
- Windows live routing: `windows-live-test-issues-20260610.md` records a **failed** gate (Copilot's
  agent did not route terminal commands through `tk` on Windows; root cause deemed "fundamental");
  `windows-copilot-1.0.62-live-verification-20260615.md` records **6/6 goals verified**. Different
  Copilot versions/dates. `[from-doc]` **→ reframed in §9** as an acceptance bar ("must be solid"),
  not a now-problem; the intended endgame is hook + extension/MCP, with the shim planned for removal.

**Deferred rabbit holes (logged, not explored here):**
- The `feat/1.0.0` codemap Product Contract (D1–D33, ADRs 0017–0041, impl slices A–M) is summarized
  in §7 but not deeply traced. `[from-memory]` / `[from-doc]`
- `server/` deployment reality (Terraform state, whether any endpoint is live) not confirmed. `[from-code]`
- `.research/` holds cloned reference projects (davia, repomaster, codewiki, deepwiki-open,
  understand-anything); `context-compress/01–04` holds external clippings on agentic context
  management. Both feed §7 thinking; content not audited here. `[from-code]` / `[from-memory]`

**Unconverged questions carried in memory (explicitly "for grill, not decided"):** Track-1 measurement
host choice; task-oracle source for the measurement harness. `[from-memory]` `measurement-harness-design.md`

---

## 7. Discussed Future Directions

*(Recorded as proposed/discussed — no ranking, no recommendation.)*

**A. codemap / codeguide — the `feat/1.0.0` pivot (docs-only, not implemented).**
A binding "Product Contract" defines codemap as "one complete, bounded product (not sliced by
version)": tk's project-local code intelligence on one canonical backend, serving two co-equal
**Required** audiences — an **Agent Surface** (help an agent locate/understand code, save tokens; 4
tools: `find_code/understand_symbol/trace_flow/analyze_impact/domain_context/explain_evidence`) and
**codeguide** (a bounded, read-only human understanding surface). Fixed anchors: primary VS Code
Copilot on Windows, secondary Claude Code on macOS. Strong defaults: **storage = `node:sqlite`+FTS5**
(zero native bindings); **LLM = host-borrowed / subscription-CLI only** (never bundles a key, no
model egress, no API spend). `[from-doc]` `feat/1.0.0:docs/codemap/codemap-contract.md §1,2,10,11`
- A **Terminology Law** bans version/phase vocabulary (`v1/v2/MVP/phase/slice/留槽`) and mandates a
  fixed capability-state vocabulary (Required / Optional at runtime / On-demand / Profile-specific /
  Capability-bounded / Unsupported / Outside current product scope / Implementation dependency); plus
  fact-authority tiers `Observed/Derived/Inferred/Confirmed`. `[from-doc]` `codemap-contract.md §2.1`; `[from-memory]` `codegraph-grilling-reframe-20260621.md`
- Work decomposition: impl slices **A–M** (`docs/codemap/impl/`), mapped to horizontal epics **#59–#71**
  and vertical tracer-bullet slices **#72–#84** (critical path P0 #72 → #73 → #75 → #77). `[from-doc]`
  `codemap-action-plan-20260620.md`
- Relationship to 0.3.x (decision **D33**): **not** a new repo or separate package — one product, the
  **`tk` CLI as hub** (`tk` compress/shim, `tk mcp`, `tk codeguide serve|export`, `tk extension
  install`); `engines.node` stays `>=20`, codemap runtime-capability-gated to Node ≥22.5<25 via dynamic
  `import()`. `[from-doc]` `codemap-contract.md` Decision Log; `[from-memory]` D33 note
- Status: ADR 0041 (serving schema) is `Proposed (2026-06-24)`; all `feat/1.0.0` codemap commits are
  `docs(...)` only; no source-adding commits. `[from-code]` `git log feat/1.0.0`

**B. Runtime startup performance on EDR-heavy Windows (planned, mostly deferred).** Ranked techniques
recorded: Tier-1 (bake resolved binary path `TK_REAL_BIN`, single-file CJS bundle, compile-cache
ladder, `--raw`→`stdio:inherit`, per-command fs-op slimming); Tier-2 (Node SEA — **rejected**, spawn
count unchanged + signature loss; Bun — triple-gated speculative); Tier-3 (persistent daemon —
demoted to a **conditional** branch gated on whether an EDR exclusion suffices and whether Falcon even
tolerates a persistent process+named pipe). 0.3.2 shipped only telemetry F1+F2; the daemon and AV-
exclusion paths are deferred/rejected pending confirming EDR is the ~925 ms cause. `[from-doc]`
`docs/runtime-startup-perf-plan.md:21-84`, `runtime-perf-impl-goal.md:3-6`; `[from-memory]`
`tk-0.3.2-telemetry-scope-daemon-deferred.md`, `windows-startup-perf-plan.md`

**C. Measurement harness for graph/token savings (designed, open).** `saved_tokens = raw−delivered`
does not transfer to graph queries; needs whole-trajectory A/B. Two tracks: Track-1 offline measured
A/B (primary metric = `uncached_input_tokens` delta, since cache-read is >97% of usage), Track-2 online
opportunity accounting. Empirically, **Claude Code headless is the only host exposing clean token
counts**; Copilot CLI/VS Code expose none, so Claude Code is the measurement proxy and VS Code Copilot
the target (measured via tk's own MCP). `[from-memory]` `measurement-harness-design.md`,
`host-token-visibility-measurement.md`

**D. Adjacent distribution / host options (raised, not built).** Codex as a 4th host (HostAdapter seam
ready, delivery tier unverified); GitHub Agent Plugin as a channel (plan 010 spike; ceiling = VS Code
PostToolUse can't compress output); npm publication (decision, post-CI); Slack as a 3rd support
channel; calibrating the token estimator via `scripts/calibrate-tokens.ts` NNLS fit. `[from-memory]`
`plans/README.md` "Direction findings"

**E. Long-term arc stated in the enterprise proposal.** "Beyond cost control, Token Killer's arc is a
broader developer-context infrastructure — one curated context base projected per task for engineers
and agents — but that is a later step." `[from-doc]` `PROPOSAL.md:240` (this is the same thesis §7-A
operationalizes on `feat/1.0.0`).

---

## 8. Source Map

**Root docs**
- `README.md` — developer-facing pitch, measured examples, handler coverage, flags.
- `CONTEXT.md` — canonical vocabulary/glossary (surfaces, delivery tiers, ledgers, evidence classes).
- `PROPOSAL.md` — enterprise endpoint-cost-control deployment/measurement proposal.
- `AGENTS.md` / `CLAUDE.md` — behavioral coding guidelines (think-before-coding, simplicity, surgical).

**docs/**
- `PRINCIPLES.md` — product rationale, the retention-over-savings north star, fake-completeness ban.
- `DESIGN.md` — implementation contracts + the "明确不做" non-goals (single source of truth per PRINCIPLES).
- `TELEMETRY.md` — the two opt-ins, payload allow/never lists, pricing model.
- `INSTALL.md` — install/publish (private registry, build-time telemetry/support endpoint args).
- `runtime-startup-perf-*.md`, `runtime-perf-impl-goal.md` — Windows/EDR latency archaeology.
- `adr/0001–0014` — decision record (amendment chains); `adr/0041` (Proposed) on `feat/1.0.0`.
- `archive/` — superseded goal docs (RTK parity, handler design, shim/host, hook/inspect, metrics).
- `reports/` — code audits, Windows/VS Code dogfood runs, research briefs, session-tool-use stats.
- `codemap/` (`feat/1.0.0` only) — contract, action plan, impl slices A–M, research transcripts.

**Code entry points**
- `src/cli.ts:218` `main()` — the one dispatcher (lazy `import()` per verb to keep the hot path light).
- `src/router.ts:30`, `src/executor.ts:484`, `src/handlers/index.ts:54` — route → spawn → compress.
- `src/shim/init.ts:389`, `src/inspect/cli.ts:168`, `src/core/gain.ts` — install / inspect / gain.
- `src/hook/cli.ts:47` — the per-command hook runtime.

**Working notes & memory**
- `plans/001–013` + `plans/README.md` — audit-driven execution plans (mostly DONE).
- `reports/win-accept-*.md`, `reports/debug-*.md` — real-machine acceptance + raw debug dumps.
- `context-compress/01–04`, `.research/*` — external research feeding the codemap direction.
- Project memory (`~/.claude/.../memory/`) — grilling decisions, telemetry scope, perf plans,
  measurement-harness design, host-token-visibility findings; the primary source for §7 futures.
- `git log` — milestone chronology (tg genesis → rename → RTK parity → delivery/hook → dedup/ledgers
  → audits → 0.3.x telemetry/doctor; `feat/1.0.0` codemap in parallel).

---

## 9. Positions Taken (2026-07-02 design discussion)

*Positions the maintainer stated in discussion, recorded as decisions to carry into design. These
resolve several §6 tensions; where a position settles a tension it is cross-referenced. Attribution:
`[from-discussion 2026-07-02]`. Items still open are listed at the end and are NOT decided.*

**P1 — One product; the invariant is Context engineering.** `tk` is a single, composite product whose
target is making the agent's **developer-local context more precise and more efficient**. "Command
output wastes context" and "can't find / can't understand code wastes context" are two different
problems but the **same concern — context**. → settles §0/§1 (identity: one) and re-grounds §7-A's D33
(the CLI-hub unification is justified by shared problem domain, not just distribution convenience).

**P2 — Delivery form is a distribution layer, not the product.** CLI / MCP / VS Code extension / hook
are interchangeable shells over the same context capability; **CLI is not the product's only or final
form.** → context for §7-A/D33.

**P3 — Endgame delivery = hook + extension/MCP; the shim is planned for full removal.** The hook is the
final, org-enableable path; the product bar is that it "**must be solid**." → settles the shim-vs-hook
framing conflict (`CONTEXT.md:38-41` "shim primary/authoritative" vs `PROPOSAL.md:234-236` "shim a
temporary workaround, hook the stable path") in favor of the hook framing; the §6 Windows-routing
divergence becomes an acceptance bar, not a now-problem.

**P4 — Save-token is one facet of a broader context-management value.** Once codemap / codewiki ship
and spread broadly, the primary value is context management / engineering; token savings become
secondary. → reframes §6-#3 and the §5 measurement-transfer tension: `raw − delivered` is one
sub-metric, not the whole value story.

**P5 — Internal A/B data is the intended proof currency.** The ideal is concrete data + A/B across
save-token *and* codemap; "inside a company, A/B data is fundamental." → the value-metric that replaces
single-call `saved_tokens` (see Open items below).

**P6 — Runtime version likely bumps to Node ≥ 22.** Inclination to raise `engines.node` to ≥22, which
would retire the current Node-20/22.5 capability-gate split for codemap. → settles the §6 Node-version
tension (direction set; not yet landed in `package.json`).

**P7 — Deferred / accept-as-is (not now-problems).** Windows startup performance: unsolvable under
current constraints, revisit later (§5/§7-B). Host token-visibility blind spot: genuinely unsolvable
for now, wait (§7-C). Neither blocks current design.

**P8 — Public posture ≠ internal reality (read all docs with this caveat).** The entire public/OSS
state captured in this pack — including `PROPOSAL.md`, `TELEMETRY.md`, and the `server/` backend — is
the *public* stance. Enabled inside a company the constraints differ (centrally-managed EDR, private
registry, org-controlled hook enablement) and the **real deployed state differs from what these public
artifacts describe.** Treat public documents as posture, not as the internal operating truth.

**Still open (recorded as undecided, not resolved here):**
- **O1 — The context-management value metric + A/B design.** What metric spans the whole
  context-management value (beyond `raw − delivered`), and what the A/B protocol + task-oracle are.
  Ties to the memory items still marked "for grill, not decided" (`measurement-harness-design.md`).
- **O2 — How save-token and codemap value are jointly quantified** into one internal-facing story.
