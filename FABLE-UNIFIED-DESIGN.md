# Token Killer — Unified Context-Engineering Architecture (Design Proposal)

> **Status: ON HOLD** — P12 (the direction this design assumed) was voided on 2026-07-02; the
> direction round was reopened for genuine product-direction exploration. Do not review or build
> against this document until a direction is re-chosen. Retained because §2 (backend seams),
> §3.3 (shim gates), and §5 (measurement) may survive into the next design regardless.
>
> ~~Status: reviewable proposal~~ (design step per `FABLE-DESIGN-BRIEF.md`, direction = P12).
> Inputs: `PROJECT-CONTEXT-PACK.md` §9 (P1–P14), the `feat/1.0.0` codemap Product Contract
> (D1–D33, ADR 0017–0040), `FABLE-DIRECTION-ANALYSIS.md`. The Terminology Law applies
> throughout: capabilities carry exactly one capability state; fact-authority tiers
> (Observed/Derived/Inferred/Confirmed) are separate from build order. "Implementation
> dependency" describes code build order only, never product versions.

---

## 1. Product Definition (one product — P1)

`tk` is one product whose invariant is **context engineering**: making the agent's
developer-local context more precise and more efficient. Two waste sources, one concern:

- **Command-output waste** → the compression subsystem (shipping on `feat/0.3.2`; pack §1–§4).
- **Code-location/understanding waste** → the codemap subsystem (contract on `feat/1.0.0`; pack §7-A).

Save-token is one facet of that value (P4); the spanning value story is defined in §5.

### 1.1 Capability map

| Capability | State | Grounding |
|---|---|---|
| Command compression (handlers, pipeline, dedup, ledgers) | Required | pack §2–§4 |
| inspect / optimize | Required | pack §2, ADR 0003/0006 |
| codemap 4-layer canonical backend (Code/Behavior/Domain/Evidence) | Required | contract D3 |
| Agent Surface (`tk_explore/search/node/callers`) | Required | contract D17 |
| codeguide (Live serve / Snapshot export) | Required | contract D9/D28 |
| Telemetry local export / network send | Optional at runtime (two opt-ins, default off) | pack §4 |
| SCIP index presence, host-LLM presence, global PPR prior | Optional at runtime | contract §12 |
| Shim delivery tier | Required **until §3.3 gates pass**, then removed (P3) | pack §9-P3 |
| CommandProxyResident | **Outside current product scope** — revised from D21③ by P11 (hook + spawn shape accepted; Windows perf stays deferred per P7) | pack §9-P11 |
| Internal distribution (private npm registry) | Required for the internal build profile | pack §9-P13 |

The CommandProxyResident revision is the one contract-state change this design makes; it is a
direct consequence of P11 and is recorded here so the contract's Decision Log can be amended.

---

## 2. Canonical Backend

### 2.1 Storage substrate (P10)

- **Engine:** `node:sqlite` (+FTS5) everywhere; `engines.node >=22` (P10 retires D33's
  runtime capability gate — premise confirmed, the Node-20 machine no longer matters).
- **Layout — one shard root, two database files:**

```
~/.token-killer/projects/repo:<sha256-12>/
  store/ledgers.sqlite    # tk-core: history, dedup events, optimize actions,
                          # governance, quality guardrails (migrated from jsonl)
  store/codemap.sqlite    # canonical store per contract §5 / D18:
                          # fact_claims, nodes/edges, arbitration_decisions,
                          # decision_claims, identity_bindings, dependency_index,
                          # generations, FTS5
  raw/…                   # unchanged recovery snapshots
```

- **"Single store" means**: single engine, single shard layout, shared conventions
  (0700/0600 perms, atomic publish, generation stamps) — **not** one file. Separate files
  isolate hot-path ledger writes from codemap's WAL/lease traffic (D32) and keep failure
  domains independent.
- **Hot-path constraint (retained from D33's discipline even though its version gate is
  retired):** the compression hot path never imports codemap modules and never opens
  `codemap.sqlite`. Per-verb lazy `import()` in `src/cli.ts:218 main()` already provides this;
  it stays.
- **Ledger migration** (jsonl → `ledgers.sqlite`) is an Implementation dependency, ordered
  after the shard conventions land (§8). Ledger semantics are unchanged: four ledgers, joined
  read-side, **never summed** (pack §4 — the honesty moat).

### 2.2 One honesty vocabulary

Today the product carries two parallel honesty systems. They unify into one disclosure
envelope shared by every output surface (CLI compressed output, MCP tool results, codeguide
views, reports):

| Compressor vocabulary (pack §4) | codemap vocabulary (contract §4/§9) | Unified envelope field |
|---|---|---|
| lossless reduction / complete-replacement summary + pointer | `coverage ∈ {complete, partial, truncated, …}` | `coverage` |
| "+N more" banned; recovery contract (ADR 0001) | omitted counts + expansion handles, no silent truncation | `omitted[]` + `handles[]` |
| measured vs estimated ledger rows | `measured` vs `estimate_kind:"opportunity"` | `basis: measured \| opportunity` |
| — | `resultFreshness` / `completeness` (D25/D26) | `freshness`, `completeness` |

The envelope is a shared core type (Implementation dependency: lands with the codemap schema
so slice #73's tools and the compressor's report layer consume the same shape). The
"never sum measured with estimated" invariant is enforced at this envelope layer.

---

## 3. Delivery Layers (P2, P3, P11)

### 3.1 Per host at endgame

| Host | Compression | codemap Agent surface | Human surface |
|---|---|---|---|
| VS Code Copilot / Windows (primary) | PreToolUse hook rewrite (P11) | VS Code extension, LM Tool API (D19) | codeguide in system browser, extension deep-links (D29) |
| Claude Code / macOS (secondary) | hook (`updatedInput` rewrite, pack §3) | `tk mcp` stdio (D19) | codeguide in browser |
| Copilot CLI | hook | `tk mcp` (host MCP support = **to verify**, see §9) | codeguide in browser |

The `tk` CLI remains the universal hub (D33): `tk` (compress), `tk mcp`, `tk codeguide
serve|export`, `tk extension install`.

### 3.2 The hook is the load-bearing path

P3 fixes hook + extension/MCP as the endgame and P11 confirms the hook keeps its current
shape (rewrite → re-execute through `tk`; the spawn cost is accepted, Windows startup perf
stays deferred per P7). Fail-open invariants are unchanged (always exit 0, errors to
`errors.log`; pack §3).

### 3.3 Shim removal gates — the operational definition of "must be solid"

P3's bar ("must be solid") becomes four observable gates. All are Track-2 observational
facts on the target host; thresholds are **measurement-gated** (set from the first Track-2
baseline, not invented here):

- **G1 — Routing coverage.** Share of hook-eligible terminal commands in real sessions that
  actually route through `tk` ≥ threshold, per host.
- **G2 — Fail-open correctness.** Zero fail-closed incidents (a hook error must never block
  or corrupt a command) over the observation window.
- **G3 — Version stability.** G1/G2 hold across ≥2 consecutive Copilot versions on Windows —
  this converts pack §6's divergent field reports into a standing acceptance matrix.
- **G4 — Clean removal.** `tk doctor` detects and fully removes the shim (PATH repair
  included) with records normalization intact (ADR 0014).

Until all four pass, VS Code keeps hook + shim additive exactly as today (ADR 0012).

---

## 4. Save-Token as a Facet (P4)

- The four ledgers stay as the **measured substrate** — nothing about measurement changes.
- The **report surface** reframes: one context report (HTML default, shared `src/report/`)
  whose sections are ① measured command savings, ② measured optimizer deltas, ③ governance
  opportunities (estimate), ④ quality guardrails, ⑤ codemap retrieval facts (opportunity,
  once codemap ships). Side-by-side, never summed.
- Public copy ("60–90%", "cut your token bill") is Profile-specific to the public posture
  build and is corrected in the truth sweep (§7); the internal narrative leads with context
  engineering, per P4/P9.

---

## 5. Measurement and Value (resolves O1 / O2)

### 5.1 O1 — the spanning metric

- **PRIMARY = whole-task `uncached_input_tokens` delta** (input − cache_read), per contract
  §15 / ADR 0022. Runner = Claude Code headless (the only clean uncached host — proxy host;
  its numbers are always labeled as proxy, never presented as Copilot numbers).
- **Arms:** `{baseline, +compressor, +codemap, +both}` — extends ADR 0024's K13 ablation.
  The compressor toggle = hook installed/absent inside the sandboxed harness home
  (`isolateHome` pattern, pack §4). 4 runs/arm, median + min/max (contract §15).
- **Task oracle (P14):** SWE-bench end-to-end per ADR 0023 (Python bias disclosed; F2P/P2P
  correctness gates) **plus** a curated internal-repo task set: fixed task list frozen before
  any arm runs, human-defined acceptance checks, N always disclosed.
- **Composition-split measurement (the P12 pre-step):** a new inspect analyzer pass
  classifies session input context by source — command output / file reads / search results /
  MCP tool results / other — and reports per-host shares. This is the first measured answer
  to "which waste source is bigger" (Direction Analysis T2). Read-only; rides the existing
  scanner (`src/inspect/`); per-host coverage disclosed (only hosts whose transcripts inspect
  can read).

### 5.2 O2 — the internal-facing story

Three evidence rows, presented together and **never merged**:

1. **Proxy-host measured A/B** — SWE-bench + internal-repo tasks, whole-task uncached delta
   (labeled proxy).
2. **Target-host observational facts** — Track-2 on VS Code Copilot/Windows: call_count,
   payload_bytes, avoided_raw_reads, dedup hits (`estimate_kind:"opportunity"`).
3. **Per-endpoint measured ledgers** — `raw − delivered` from real machines (measured, but
   a sub-metric per P4).

The narrative: *"a context-engineering layer for your agents — proxy-measured task-level
gains, opportunity facts from your own machines, task numbers from your own repos"* — with
the honesty moat (no summing, no host-number impersonation) as the differentiator.

---

## 6. Node ≥22 Landing (P10)

Implementation dependency order: bump `engines.node` to `>=22` → remove the compile-cache
DEFERRED tier (`src/cli.ts:13-15`) → strip D33's runtime version-gate scaffolding from the
codemap plan (action-plan slice **#72 shrinks** to bootstrap checks without the gate) →
update README/INSTALL/CI matrix. Per-verb lazy imports stay (hot-path discipline, §2.1).

---

## 7. Public vs Internal (P8, P9, P13)

Two build profiles (Profile-specific capability):

- **Internal build:** published to the private npm registry (P13); telemetry + support
  endpoints baked at build time (ADR 0013 pattern); hook enablement org-managed.
- **Public posture build:** empty endpoints (network permanently off), docs remain the OSS
  posture. Public documents continue to be read as posture, not operating truth (P8).

**Telemetry backend (recommended default, flagged for confirmation):** reuse the existing
`server/` stack (Hono Lambda + RDS + Grafana, pack §2) deployed on internal infra **when
rollout to colleagues begins**; until then, local ledgers + inspect are sufficient. When the
deployment decision lands, `server/` gains CI wiring (it has none today, pack §2).

**Ride-along doc truth sweep** (corrections already flagged in pack §6, done with this
design's landing): README session-dedup default (§6-1), CONTEXT.md "project repository is
never written" vs ADR 0006 (§6-2), the "60–90%" framing per P4 (§6-3), CONTEXT.md
shim-primary framing → hook framing per P3.

---

## 8. Implementation Dependency Order

> Build order only — not product stages.

1. **Measurement rails first (P12):** composition-split inspect pass + the harness track
   (extends slice #73's harness rail; ADR 0022–0024 protocols + P14 oracle).
2. **Contract critical path:** #72 (reduced per §6) → #73 → #75 → #77, with store/shard
   conventions from §2.1 applied from the first schema file.
3. **Ledger sqlite migration** — independent, after conventions settle; read-layer
   never-summed invariant regression-tested across the migration.
4. **Shim-removal gate instrumentation (Track-2)** — runs alongside; gates G1–G4 evaluated
   continuously, shim removed only when all pass.
5. **Internal rollout readiness:** registry publish pipeline, baked endpoints, telemetry
   server deployment decision (§7), then promotion per P9.

---

## 9. Decisions Taken Here vs Open Confirmations

**Proposed by this design (pending maintainer review):**
- Store layout: one shard root, two sqlite files (§2.1).
- Unified disclosure envelope across all surfaces (§2.2).
- Shim-removal gates G1–G4 with measurement-gated thresholds (§3.3).
- CommandProxyResident → Outside current product scope (P11 consequence; contract Decision
  Log amendment).
- Report surface reframed as one context report (§4).

**Open confirmations (small, non-blocking):**
- Telemetry server deployment timing/owner (§7).
- Internal task-set size and repo selection (P14 execution detail).
- Copilot CLI MCP support (fact check before promising `tk mcp` there; §3.1).
