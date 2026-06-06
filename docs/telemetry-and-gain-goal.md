# Implementation goal: `tk gain` (RTK parity) + opt-in network telemetry

You are implementing two adjacent capabilities decided in
[ADR 0004](./adr/0004-opt-in-network-telemetry-and-gain-parity.md): the user-facing savings
analytics command `tk gain` (parity with `rtk gain`), and real opt-in network **telemetry** over
an enterprise build-time endpoint. This is a **decision-complete** spec — ADR 0004 already argued
the trade-offs. Where this doc says **MUST**, a reviewer rejects the PR if it is violated.

Read first: `docs/adr/0004-*.md`, `docs/metrics-ledger-architecture-goal.md` (the ledger model
this slots into), `docs/PRINCIPLES.md` (fail-open / no-inflation), and `DESIGN.md` §8 (history,
report, telemetry field policy).

## 0. Load-bearing constraints (MUST)

1. **`gain` is ledger ① only.** It reads measured command savings from `history.jsonl`. It MUST
   NOT sum across ledgers, MUST NOT invent estimates, and `saved_tokens` MUST appear only here.
2. **One estimator.** `chars/4` MUST exist in exactly one module after this work
   (`grep -rn "length / 4" src` → one hit in `core/tokens.ts`; see §8). `gain` and telemetry both
   import it.
3. **One aggregator.** `gain` output and the telemetry payload MUST be derived from the same
   `src/core/aggregate.ts`. No second aggregation path.
4. **Hot path is sacred.** Telemetry send MUST NOT run on `tk <cmd>`. Only `tk inspect` and
   `tk gain` may trigger it. Any telemetry error MUST be swallowed and MUST NOT change a command's
   behavior or exit code.
5. **Telemetry is opt-in and inert by default.** Disabled unless the user opts in AND a build-time
   endpoint is present. No endpoint ⇒ write local file, warn, succeed (today's behavior).
6. **Allow-list, not convention.** The telemetry builder MUST physically construct only
   allow-listed fields. A test MUST assert no disallowed field (command text, paths, repo names,
   session ids, raw snippets, prompts) can appear.

## 1. Data model

### history.jsonl (exists; one additive field)
Source of truth for `gain` and for telemetry usage/quality aggregates. Fields already present in
`src/core/history.ts`: `timestamp, command, handler, raw_tokens, output_tokens, saved_tokens,
savings_pct, exit_code, duration_ms, project_fingerprint, quality_status, source_adapter,
raw_output_path`.

**Add one optional field `model?: string`** (best-effort, for per-model pricing in §4). Populate it
only where the delivery surface already exposes the model: the hook runtime — `normalize.ts` already
parses `model`/`modelName`/`model_name` (top-level / `context` / `metadata`) into `ToolEvent.model`,
so persist it on rows it writes. The `tk <cmd>` shell command-proxy path has no model (the shim/hook
invokes a bare command) and leaves it **absent** — those rows price at the default constant. Never
infer the model from anywhere else; absent is honest, a guess is not. Additive and back-compatible:
old rows without it read as `undefined`.

### config.jsonc (build it — the inspect-v1 contract is designed but NOT implemented)
`inspect-v1-design.md` specifies `~/.token-killer/config.jsonc` + `tk config init`, but **no code
implements them today** (`src/inspect/cli.ts` still says `// no config yet`). Slice 3a MUST build
the real reader first; only then does consent have a home. JSONC, created by `tk config init`,
allowed fields a closed set:
```jsonc
{
  "inputType": "vscode",      // inspect-v1
  "defaultSince": "7d",       // inspect-v1
  "telemetryExport": false,   // write the aggregate payload to a LOCAL file (inspect-v1 scope)
  "telemetry": false          // opt-in to NETWORK upload over the build-time endpoint
}
```
**`telemetryExport` and `telemetry` are two independent opt-ins; neither implies the other.** A
user who set only `telemetryExport: true` (local export, the old contract) MUST NOT be silently
upgraded to network upload when a build bakes in an endpoint. Network send requires `telemetry:
true` AND a non-empty endpoint. A parse error or an out-of-shape field MUST exit 1 (inspect-v1
rule).

### telemetry-state.json (new, internal — NOT user config)
`~/.token-killer/telemetry-state.json` — machine state, never hand-edited:
```json
{ "deviceSalt": "<64 hex, generated once>", "firstSeenAt": "<ISO>", "lastSentAt": "<ISO|null>" }
```
`device_hash = sha256(deviceSalt)`. The internal `purgeState()` helper deletes this file (no longer a user-facing `tk telemetry` subcommand — ADR 0006).

## 2. `src/core/tokens.ts` — the one estimator (Slice 0)

Extract the single `estimateTokens(text: string): number` (= `ceil(chars / 4)`, match current
behavior exactly). `src/core/savings.ts` and `src/context/metrics.ts` import it; delete their
local copies. Pure refactor — a test MUST assert identical numbers on a fixture corpus.

## 3. `src/core/aggregate.ts` — shared aggregation (Slice 1)

Pure functions over `HistoryRecord[]` (no I/O — keep it trivially unit-testable). MUST cover
everything both consumers need:

```ts
type GainSummary = {
  estimate_kind: "measured";              // metrics-ledger §5
  commands: number;
  raw_tokens: number; output_tokens: number; saved_tokens: number; savings_pct: number;
  avg_savings_per_command: number;
  total_duration_ms: number;
  by_handler: Array<{ handler: string; raw: number; saved: number; pct: number; count: number }>; // top-N
  quality_status_counts: Record<string, number>;   // = the `qualityStatusCounts` helper below; one name, not two
};
type TimeBucket = { key: string; commands: number; raw: number; saved: number; pct: number };
// day = UTC YYYY-MM-DD, week = ISO year-Www, month = YYYY-MM
```
Helpers: `summarize`, `byDay`, `byWeek`, `byMonth`, `lastNDays(30)`,
`qualityStatusCounts` (count rows by the **actual** `quality_status` values the code emits —
`passed` | `inflated` | `empty_output` | `failure`, per `src/types.ts` + `src/handlers/base.ts`
+ `recordHookFailure`), `failures` (genuinely-wrong rows: `handler === "fallback"` OR
`quality_status === "failure"`; `inflated`/`empty_output` are the gate safely keeping raw, NOT
failures), `fallbackCount` (rows whose `handler === "fallback"` — the real error-fallback name set
in `src/core/fallback.ts`; **not** `raw`/`generic`, which don't denote a fallback).

> Do NOT introduce ledger-④'s rate vocabulary (`fallback_rate`, `raw_reopen_rate`,
> `parse_failure_rate`, `findings_reverted`) here — that ledger isn't built yet. Emit plain counts
> over the existing `quality_status`; when ledger ④ lands (a separate initiative) it derives its
> rates from these same counts. This keeps one quality primitive, not two.

User-level read: a `listProjectHistories(): Promise<HistoryRecord[]>` enumerating
`~/.token-killer/projects/*/history.jsonl` (best-effort; skip unreadable). Each record already
carries `project_fingerprint` for grouping. **This is I/O, so it lives in `src/core/history.ts`
(next to `readHistory`), NOT in `aggregate.ts`** — `gain --user` and the telemetry builder both
read via `history.ts`, then feed the pure `aggregate.ts` functions.

Project label (for `--user` display): when `tk <cmd>` first writes history for a project, lazily
write `projects/<fingerprint>/meta.json` holding the directory **basename only** (never the full
path). Best-effort and idempotent (write only if absent); a failure MUST NOT break the hot-path
command. `gain --user` shows the basename per project, falling back to the short fingerprint hash
when no label exists. This file is local-display-only and never enters telemetry.

## 4. `tk gain` — RTK parity (Slice 2)

Wire a `gain` subcommand in `src/cli.ts`, with the rendering logic in a **new `src/core/gain.ts`**
(consuming `aggregate.ts`); leave `src/core/report.ts` / `tk --report` untouched. Cold path,
read-only, fail-open (missing/corrupt store ⇒ empty section, never a crash).

| Flag | Behavior | RTK analogue |
|---|---|---|
| `tk gain` | current-project summary | `rtk gain` |
| `--user` | aggregate all fingerprints, grouped per project | (closes DESIGN §8.2) |
| `-p`/`--project` | current project (default) | `rtk gain -p` |
| `--daily`/`--weekly`/`--monthly`/`--all` | time buckets | same |
| `--graph` | ASCII sparkline of saved tokens over the last 30 days, mirroring RTK's `print_ascii_graph` (block ramp `▁▂▃▄▅▆▇█` scaled to the max day; empty days render as the lowest block) | `rtk gain --graph` |
| `--history [n]` | recent N rows (handler, savings%, timestamp; command shown local-only) | `--history` |
| `--failures` | rows that genuinely went wrong — `handler === "fallback"` (filter threw → raw) OR `quality_status === "failure"` (tool failure). NOT `inflated`/`empty_output`: those are the gate safely returning raw (moat working, no info lost), shown as 0%-savings rows in the summary. Mirrors RTK's `parse_failures`. | `--failures` |
| `--quota [-t <model>]` | **Estimated USD saved**, not RTK's plan-quota %. `usd = saved_tokens / 1e6 × input_price_per_Mtok`. Price resolution: **if the model is known** (a documented `model → input $/Mtok` table — see note) use that price; **otherwise estimate** with the default constant `$3/Mtok` (Claude Sonnet input). `-t <model>` overrides the price assumption (e.g. `-t opus`/`-t haiku`); default = the estimate constant. The figure is **labeled an estimate**, carries `estimate_kind: "heuristic"`, is **never** called `saved_tokens`, and in `--json` appears under a separate `estimated_savings_usd` key — never inside the ledger-① measured object. | `rtk gain --quota` ($ reframe) |
| `--format json\|csv` (`--json`/`--csv` aliases) | machine output | same |

`--json` emits the ledger-① measured object (no cross-ledger total). The **only** non-① field
permitted is `estimated_savings_usd` (from `--quota`), and it MUST be a sibling key carrying
`estimate_kind: "heuristic"` — never folded into the measured object, never summed with
`saved_tokens`. A consumer ignoring it still sees a clean ledger-① object.

**Pricing (shared, one source).** A single `src/core/pricing.ts` holds the default constant
(`$3/Mtok`, Sonnet input) and a `model → input $/Mtok` table. **Both** `--quota` and the telemetry
`estimated_savings_usd_30d` field import it — no second price path. Pricing is **per row**: a row
whose best-effort `model` (§1) is known and in the table is priced at that model's rate; a row with
no `model` (every shell command-proxy row, and any host that didn't expose one) is priced at the
default constant. `-t <model>` overrides the assumption for *all* rows (forces one model's rate).
Any unknown/typo model name falls back to the default, never an error. The constant and the table
are documented in `docs/TELEMETRY.md`.

## 5. Telemetry rebuild + transport (Slices 3a/3b–4)

### Slice 3a — config infrastructure (prerequisite, build it)
- `src/core/config.ts`: JSONC reader, closed allow-listed shape, parse/out-of-shape ⇒ **exit 1**.
- `tk config init`: non-interactive, does not overwrite, prints existing path + exit 1 if present.
  The template writes both consent fields defaulting to `false` (`telemetryExport: false`,
  `telemetry: false`); creating the file is NOT opt-in (inspect-v1 rule — user opts in by editing
  to `true` or via `tk telemetry enable`).
- Rewire inspect's existing `--telemetry-export` / `telemetryExport` to read from this config.

### Slice 3b — payload v2 + consent commands (no network yet)
- `buildTelemetry` (schema **"2"**) rebuilt from `aggregate.ts` + quality signals.
  **Aggregation is always user-level** (`listProjectHistories`), regardless of which project a
  cold-path trigger ran in — usage/quality totals are per-install, matching the per-install
  `device_hash`.
- **Inspect aggregates are OPTIONAL.** They require a fresh scan, so they are populated only on an
  `tk inspect`-triggered build; a `tk gain`-triggered build omits them (no new persistence). The
  history-derived usage/quality/retention fields are present on both paths.
- **v1 payload fields this version ships (RTK-shaped + tk's quality moat):** `device_hash`,
  `version`, `os`, `arch`; usage (`commands_24h/total`, `tokens_saved_24h/total`, `savings_pct`,
  `top_handlers` names-only ≤5 — tk's privacy-hardened analogue of RTK's `top_commands`);
  **quality** (`quality_status_counts` — the four real `quality_status` values, tk's differentiator
  over RTK; `fallback_count` = rows with `handler === "fallback"`; `parse_failure_24h` = last-24h
  rows with `quality_status === "failure"` ONLY — the tool-failure set, kept distinct from
  `fallback_count` (handler exception), mirroring RTK's standalone `parse_failures_24h`;
  `low_savings_handlers`); retention
  (`first_seen_days`, `active_days_30d`, `source_adapter_mix` ≈ RTK `ecosystem_mix`);
  `estimated_savings_usd_30d` (= `tokens_saved_30d / 1e6 × price`, price from the shared
  `src/core/pricing.ts` — same module `--quota` uses; default `$3/Mtok`, like RTK's `telemetry.rs`);
  plus the optional inspect aggregates.
  **Dropped vs the ADR 0004 Decision 5 list** (over-specified, neither in RTK nor in tk's data
  model — `handler` already *is* the compressor family): `compressor_family_counts`,
  `avg_compression_ratio_by_family`. **Deferred** (cheap, but not v1): `hook_type`,
  `install_method`. Shipping a subset of an allow-list is permitted; the allow-list TEST still
  rejects any disallowed field. `runId` stays as a per-POST message id (endpoint-side dedup).
- Allow-list enforced **in code** (the builder physically constructs only allowed fields).
- `device_hash` from `telemetry-state.json` (lazily create salt).
- `tk telemetry enable|disable|status|preview|purge`. `preview` prints the exact payload JSON and
  MUST NOT send. None of `enable|disable|status|preview` ever sends.
- **`enable`/`disable` rewrite `config.jsonc` from the canonical closed-set template** (read current
  values → set `telemetry` true/false → write the full template back). Do NOT attempt
  comment-preserving JSONC edits; the closed shape makes regeneration the robust choice. Trade-off:
  a user's hand-written comments are replaced by the standard template header — acceptable and
  documented. (`tk config init` creates the same template; `enable`/`disable` create it too if absent.)

### Slice 4 — network transport + cold-path trigger
- `src/telemetry/endpoint.ts`: `export const TELEMETRY_ENDPOINT = __TK_TELEMETRY_ENDPOINT__;`
  `tsdown.config.ts` `define: { __TK_TELEMETRY_ENDPOINT__: JSON.stringify(process.env.TK_TELEMETRY_ENDPOINT ?? "") }`.
- `src/telemetry/send.ts`: HTTPS POST (built-in `https`, **no new dep**), `Content-Type:
  application/json`, 2s timeout, `socket.unref()`, fire-and-forget, any 2xx = success, no retry.
  Failure ⇒ warn + keep local `telemetry-export.json`, never throw.
- Trigger: at the **end** of `tk inspect` and `tk gain` (any output mode — `--json`/`--csv`/TTY
  alike; no TTY gate), if `telemetry` opted-in AND endpoint non-empty AND `now - lastSentAt ≥ 23h`
  ⇒ set `lastSentAt = now` **before dispatching** (stamp on attempt, not on success — strictly ≤1
  attempt per 23h, true no-retry, never hammers a down endpoint), then fire. A failed send warns +
  keeps the local file; it is NOT retried until the next ≥23h window. Empty endpoint ⇒ local file +
  warning (unchanged). MUST NOT be reachable from `tk <cmd>`.
- Inject `runId`, `now`, `device_hash` from callers so tests stay deterministic (follow the
  existing `buildTelemetry(..., runId)` pattern).

## 6. Docs (Slice 4, same PR)
- `docs/TELEMETRY.md`: what is / isn't collected, consent, data controller (enterprise operator),
  `purge`/deletion path. Mirror RTK's `docs/TELEMETRY.md` structure.
- Annotate `docs/inspect-v1-design.md` Telemetry section: "partially superseded by ADR 0004"
  (stable `device_hash` now allowed; cross-run correlation permitted for opt-in enterprise).
- DESIGN §8.3: add `device_hash` to the allowed list with the opt-in/anonymous qualifier.

## 7. Slices (each green before the next)
0. `core/tokens.ts` single estimator (pure refactor; identical-numbers test). **[done]**
1. `core/aggregate.ts` (pure) + `listProjectHistories` in `core/history.ts` + add optional
   `model?` to `HistoryRecord` (§1; persisted later by the hook runtime, absent on shell rows)
   (unit-tested in isolation).

   > ⛔ **STOP after Slice 1 — review checkpoint.** Do not start Slice 2. Hand back for review of
   > the `aggregate.ts` surface (types + helper definitions) and the `history.ts` reader before any
   > consumer is built on top of them. Both initiatives depend on this module, so its shape is
   > reviewed once, here, before it spreads.

2. `tk gain` full surface (parity table §4) in `core/gain.ts` + `core/pricing.ts` (shared price
   module, first consumer = `--quota`); `--user` (+ `meta.json` basename) closes §8.2.
3a. `core/config.ts` JSONC reader + `tk config init` + closed-set/exit-1 (build the inspect-v1 contract).
3b. Telemetry payload v2 + `tk telemetry` (two-flag consent; allow-list + disallow tests; no net).
4. Transport + cold-path trigger + build-time endpoint + `TELEMETRY.md` (mock-endpoint tests).

## 8. Done means
- One token estimator: `grep -rn "length / 4" src` finds it in exactly one place (`core/tokens.ts`).
  (Do NOT gate on a bare `/ 4` — `handlers/common/listLike.ts` uses `Math.floor(marker / 4)` for
  tree-indent depth, which is unrelated to token estimation and would false-positive.)
- `tk gain --user` aggregates across projects; `tk gain --json` has no cross-ledger total;
  `saved_tokens` appears only in ledger-① types/output.
- A test proves the telemetry payload cannot contain a command string / path / repo name even
  when history rows do.
- A test proves the telemetry send path is unreachable from `tk <cmd>` and that a send failure
  neither throws nor changes any exit code.
- Empty `TK_TELEMETRY_ENDPOINT` build: opted-in telemetry writes the local file + warns, sends
  nothing. Non-empty build: one POST per ≤23h window, `unref`'d, 2s timeout.
- `tk telemetry preview` prints exactly what `send` would POST; `purge` resets `device_hash`.
