---
status: accepted
---

# Opt-in network telemetry (anonymous device hash, build-time endpoint) + `ctx gain` parity

> **Amended by [ADR 0006](0006-cli-consolidation-and-optimize-apply-engine.md) (2026-06-07):**
> the detailed report is reached via `ctx gain report` only (the `ctx report` alias
> is removed). `ctx telemetry purge` is no longer a user-facing subcommand
> (`purgeState()` remains internal). Consent model and payload are unchanged.

## Context

Two adjacent capabilities were conflated and are settled here together.

**(A) User-facing savings analytics.** RTK ships `rtk gain` — a rich, local, zero-consent view
of the user's own savings (summary, per-project, daily/weekly/monthly, ASCII graph, recent
history, failures, quota/$ estimate, JSON/CSV). Contexa has the data substrate
([`history.jsonl`](../../CONTEXT.md#evidence-and-recovery), one row per command with
`raw/output/saved_tokens`, `savings_pct`, `handler`, `quality_status`, `source_adapter`,
`duration_ms`) but only a minimal reader: `buildReport` in `src/core/report.ts`, reachable as
`ctx --report`. It computes totals + by-handler + by-quality, with no time series, no graph, no
history listing, no quota, and **no `--user` cross-project aggregation despite DESIGN §8.2
promising it**.

**(B) Telemetry.** Two prior docs already speak to telemetry, and they disagree with where this
ADR lands:

- `docs/inspect-v1-design.md` ("Telemetry Export", "Telemetry Transport") shipped as Slice 5.
  It specifies a build-time-constant endpoint, HTTPS POST, no-retry, fail-open transport — **and
  deliberately a stronger-than-RTK privacy stance**: "Telemetry does not correlate multiple runs
  from the same machine", with "stable installation identifier" listed as a **disallowed** field.
  The implemented payload (`src/inspect/telemetry.ts`) carries inspect-scanner aggregates
  (`toolCategoryCounts`, `sourceCoverage`, `recommendationTypeCounts`) and a per-run random id.
- `DESIGN.md` §8.3 defines the telemetry field policy in terms of **runtime compression
  aggregates** (compressor-family counts, average compression ratio by family, fallback counts,
  parse-failure counts, raw-reopen-rate bucket, output-family distribution) — a different field
  set than what was implemented.

So telemetry today is (1) implemented against inspect-scanner fields that do not match the
DESIGN §8.3 field policy, and (2) never actually transmitted — `ctx inspect --telemetry-export`
only writes a local file because no endpoint is configured.

The deployment target is an **enterprise intranet**: the endpoint is injected at build time, and
operators legitimately need to de-duplicate installs and observe retention — which the
inspect-v1 "no cross-run correlation" rule forbids.

This ADR also slots into the **four-ledger metrics model**
(`docs/metrics-ledger-architecture-goal.md`, decision-complete), which fixes naming: `ctx gain`
is **ledger ① (measured command savings) only**, and `ctx report` is the future four-ledger
superset. This ADR builds out `ctx gain`; it does not build `ctx report`.

## Decision

1. **`ctx gain` is the RTK-`gain`-parity command, scoped to ledger ① only.** It reads
   `history.jsonl` and renders measured command savings: summary, `--user` (cross-project,
   grouped by fingerprint — closes the DESIGN §8.2 gap), `--daily`/`--weekly`/`--monthly`/`--all`,
   `--graph` (ASCII, last 30 days), `--history [n]`, `--failures`, `--quota [-t <tier>]`, and
   `--format json|csv`. It MUST NOT sum across ledgers and MUST NOT call anything outside ledger
   ① `saved_tokens` (metrics-ledger §0/§5/§6). `ctx --report` and `ctx report` keep their current
   behavior until the four-ledger initiative supersedes them; `ctx gain` is additive.

2. **All aggregation lives in one shared module** `src/core/aggregate.ts`, consumed by both
   `ctx gain` and the telemetry builder. This prevents a second "design vs implementation"
   drift between what `gain` shows and what telemetry sends. It imports the **single** token
   estimator (see Decision 8).

3. **Telemetry gains real opt-in network upload over an enterprise build-time endpoint.** The
   endpoint is a compile-time constant injected by `tsdown` `define` from
   `process.env.CTX_TELEMETRY_ENDPOINT` (mirrors how the build bakes constants; the generic/dev
   build leaves it empty). With an empty endpoint the behavior is exactly today's: write the
   local `telemetry-export.json`, warn, never fail. The endpoint is **never** stored in user
   config — it is a property of the build artifact, so public/dev builds are inert by
   construction.

4. **Telemetry carries a stable anonymous `device_hash`. This SUPERSEDES the inspect-v1
   "no cross-run correlation / no stable installation identifier" rule.** `device_hash =
   SHA-256(deviceSalt)`, where `deviceSalt` is a one-time random value. It contains no hostname,
   username, or any reversible identity. It is stable across runs (so the enterprise can count
   unique installs and compute retention) and resettable via `ctx telemetry purge`. Rationale for
   the reversal: the target is an opt-in enterprise intranet where de-dup and retention are
   legitimate operational needs; a random, purgeable salt is the minimum identifier that enables
   them without identifying a person. The DESIGN §8.3 disallow-list otherwise stands in full.

5. **The telemetry payload is rebuilt to the DESIGN §8.3 field set (schema v1),** sourced from
   `src/core/aggregate.ts` (ledger ①) plus quality signals (ledger ④) plus the privacy-safe
   inspect aggregates already present. Allowed: `device_hash`, `version`, `os`, `arch`,
   `install_method` (best-effort), usage volume (`commands_24h/total`, `tokens_saved_24h/total`,
   `savings_pct`, `top_handlers` names-only ≤5), quality (`compressor_family_counts`,
   `avg_compression_ratio_by_family`, `fallback_count`, `parse_failure_24h`,
   `low_savings_handlers`, `quality_status_counts`), adoption/retention (`hook_type`,
   `source_adapter_mix`, `first_seen_days`, `active_days_30d`), and the existing inspect
   aggregates. The disallow-list (commands, args, paths, repo names, session ids, raw snippets,
   prompts, source) is enforced in the builder, not by convention.

6. **Telemetry send fires only on the cold path** — `ctx inspect` (existing) and `ctx gain` — and
   **never on the `ctx <cmd>` hot path.** This is a deliberate divergence from RTK (which sends
   from a background thread on every command). Contexa's load-bearing guarantee is that the
   command hot path never blocks, never crashes, and always fails open to the real tool; bolting
   a network send onto it violates that. A 23-hour throttle marker (`lastSentAt`) keeps cadence
   to at most once per day regardless of how often the cold-path commands run.

7. **Consent + state storage aligns with the existing config contract.** User preference lives
   in `~/.contexa/config.jsonc` (JSONC, per inspect-v1; `telemetryExport` field, `ctx config
   init`). Machine state (`deviceSalt`, `lastSentAt`, `firstSeenAt`) lives in a separate internal
   state file `~/.contexa/telemetry-state.json` — kept out of the user-editable config so a
   user editing prefs cannot corrupt the salt, mirroring RTK's separate `.device_salt`. New
   commands: `ctx telemetry enable|disable|status|preview|purge`. `preview` prints the exact JSON
   that would be sent (auditable); `purge` deletes the salt + markers, resetting `device_hash`.
   `ctx init` MAY offer enablement with an explicit prompt defaulting to **no**.

8. **Collapse the duplicated token estimator first (metrics-ledger Gap A).** `chars/4` exists in
   both `src/core/savings.ts` and `src/context/metrics.ts`. Aggregation (Decision 2) requires a
   single source of truth; this ADR's first slice extracts one estimator that every ledger and
   the telemetry builder import.

## Considered options

- **Honor inspect-v1's no-correlation stance (per-run random id only).** Rejected: it makes
  unique-install counts and all retention metrics impossible, which the enterprise operator
  needs. An anonymous, purgeable salt is a proportionate middle ground; the alternative is
  telemetry that cannot answer "how many installs / are they sticking", i.e. most of its purpose.
- **Hostname-derived device id.** Rejected: a hostname can be reverse-looked-up via a corporate
  CMDB, re-identifying a machine/person. A random salt gives the same dedup/retention power with
  no path back to identity (user-confirmed).
- **Fire the daily ping from the hot command path (RTK parity).** Rejected: violates the
  fail-open hot-path guarantee (`PRINCIPLES.md`, ADR 0002). Cold-path firing trades guaranteed
  daily cadence for never touching the load-bearing path — an acceptable trade for an opt-in
  enterprise signal.
- **Put `gain`'s rich views on `ctx report` instead of `ctx gain`.** Rejected: `metrics-ledger`
  reserves `ctx report` for the four-ledger superset and `ctx gain` for ledger ①. Time series /
  graph / history / quota are all ledger-① facts, so they belong on `ctx gain`.
- **Keep telemetry purely local (no transport).** Rejected by the explicit requirement to add
  opt-in network upload to an enterprise endpoint.
- **Store the endpoint in `config.jsonc`.** Rejected: the endpoint is a build property, not a
  user preference; baking it at build time keeps generic/dev builds inert and stops a user from
  pointing telemetry at an arbitrary host.

## Consequences

- New `src/core/aggregate.ts` (shared) and a new `ctx gain` command surface (`src/core/report.ts`
  or a new `src/gain/`), plus a user-level history enumerator for `--user`.
- `src/core/savings.ts` + `src/context/metrics.ts` lose their private `chars/4`; both import one
  estimator (`src/core/tokens.ts`). A test asserts identical numbers pre/post refactor.
- The telemetry payload type is schema v1; `src/inspect/telemetry.ts` is rebuilt against
  `aggregate.ts`. `buildTelemetry`'s old inspect-only fields are retained as a subset.
- New transport module performs HTTPS POST (Node built-in `https`, no new dependency), 2-second
  timeout, `unref()` so it never holds the process open, fire-and-forget, errors swallowed, no
  retry/queue. Failure warns and preserves the local payload (inspect-v1 transport contract).
- `tsdown.config.ts` gains a `define` for `__CTX_TELEMETRY_ENDPOINT__`.
- New `ctx telemetry` and `ctx config init` command surfaces; `~/.contexa/config.jsonc` and
  `~/.contexa/telemetry-state.json` are read/written; `deviceSalt` is generated lazily on
  first enabled send.
- `docs/inspect-v1-design.md` Telemetry section is annotated as **partially superseded** by this
  ADR (stable `device_hash` now allowed; cross-run correlation now permitted for the opt-in
  enterprise case). DESIGN §8.3 is the field-policy authority and gains `device_hash`.
- A new `docs/TELEMETRY.md` documents what is / is not collected, consent, the data controller
  (enterprise operator), and the deletion/`purge` path, mirroring RTK's disclosure.
- Implementation contract and slices: `docs/telemetry-and-gain-goal.md`.

## Amendment (2026-06, from the implementation grilling)

Three refinements surfaced while pinning the implementation contract. None reverse a decision
above; they sharpen ones that were under-specified.

1. **Consent is two independent flags, not one.** Decision 7 named only `telemetryExport`. The
   contract now separates `telemetryExport` (write the aggregate payload to a **local file** — the
   inspect-v1 scope, unchanged) from `telemetry` (**network upload** over the build-time endpoint).
   Neither implies the other. Rationale: a user who opted into local export under the old contract
   must not be silently upgraded to network transmission merely because a build bakes in an
   endpoint — that would change the meaning of consent they already gave. Network send requires
   `telemetry: true` AND a non-empty endpoint.

2. **The 23-hour throttle stamps `lastSentAt` on attempt, not on success.** A send sets
   `lastSentAt = now` *before* dispatching, so a failed/unreachable endpoint is retried at most
   once per 23h — honoring the "no retry/queue" contract and never hammering a down host. A failed
   send warns and preserves the local file; it is not re-attempted until the next window.

3. **The Decision 5 allow-list is shipped as a subset, by design.** The first telemetry version
   omits `hook_type` and `install_method` (their detection is fuzzy/best-effort) and the
   inspect-scanner aggregates on the `ctx gain` trigger path (they need a fresh scan; only
   `ctx inspect` populates them). Shipping fewer *allowed* fields is permitted; the allow-list
   enforcement test still rejects any *disallowed* field (commands, paths, repo names, etc.).
   Telemetry aggregation is always **user-level** (all of a device's projects), matching the
   per-install `device_hash`.

Also: the prerequisite config infrastructure (`config.jsonc` reader, `ctx config init`, closed-set
shape validation, exit-1) was specified in `inspect-v1-design.md` but never implemented — it is
built first in this initiative (goal Slice 3a), not merely "extended".

## Amendment (2026-06, opportunistic hot-path flush)

Decision 6 keeps the telemetry send **cold-path only** (`ctx inspect` / `ctx gain`) and never on the
`ctx <cmd>` hot path — that remains the default. This amendment adds one narrow, guarded exception
so installs that rarely run the cold path still report. A hot-path send is permitted ONLY when
**all** of these hold:

1. **The endpoint is non-empty.** A generic/dev build bakes `""`, so the entire branch — including
   loading the telemetry module — is skipped at ~zero cost; only an enterprise build reaches it.
2. **The 23h staleness window has elapsed.** It shares the SAME `lastSentAt` marker as the cold
   path, so the combined hot+cold cadence is still at most one send per 23h; in the steady state
   the gate is a single timestamp read.
3. **It is asynchronous, unref'd, and fired AFTER the user-visible result is already on stdout.**
   The socket is `unref()`'d (transport contract), so it can neither block process exit nor delay
   the command. It merges the already-CACHED per-project rollups (user-level) and NEVER reads raw
   history or rebuilds a rollup on the hot path; an empty cache simply sends nothing.

Rationale: the load-bearing hot-path guarantee is preserved — the added cost on an enabled
enterprise build is two small reads (consent flag + last-sent timestamp) plus a non-blocking
beacon, and on every generic build it is a single constant check. The trade is a best-effort daily
backstop for users who never open `ctx gain` / `ctx inspect`, at no risk to the command's latency,
exit code, or fail-open behavior. This hot-path send is USER-LEVEL — it merges the already-built
per-project cached rollups (a READ-ONLY load that, unlike the cold path, never reads history or
rebuilds), so a device never mixes project-scoped and user-level points under one `device_hash`,
and a project with history but no built rollup yet contributes nothing until a cold path seeds it.
