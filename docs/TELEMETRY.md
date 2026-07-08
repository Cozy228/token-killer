# Contexa Telemetry

Contexa ships **no telemetry by default**. Nothing leaves your machine unless you
explicitly opt in *and* you are running an enterprise build whose operator baked in an
endpoint. This document is the exact, field-by-field contract — what is collected, what
can never be collected, how consent works, and how to delete your data.

Decided in [ADR 0004](./adr/0004-opt-in-network-telemetry-and-gain-parity.md).

## Two independent opt-ins

Consent lives in `~/.contexa/config.jsonc` (create it with `ctx config init`). There
are **two separate flags; neither implies the other**:

| Flag | Default | Effect |
|---|---|---|
| `telemetryExport` | `false` | Write the aggregate payload to a **local file** (`~/.contexa/advice/telemetry-export.json`). Never leaves the machine. |
| `telemetry` | `false` | Opt in to **network upload** over the build-time endpoint. |

Creating the config file is **not** itself opt-in — both flags default to `false`. You opt
in by editing the file to `true`, or with `ctx telemetry enable` (which sets `telemetry:
true` while preserving `telemetryExport`).

Network upload happens only when **`telemetry: true` AND a non-empty build-time endpoint**
are both present. The generic (non-enterprise) build bakes in an empty endpoint, so it is
inert: an opted-in generic build writes the local file and warns, sending nothing.

## When it sends

A send is attempted **only at the end of `ctx inspect` and `ctx gain`** — the cold paths.
It is **never** reachable from `ctx <command>`; the hot path is sacred and a telemetry
error can never change a command's behavior or exit code.

At most **one attempt per 23 hours**. `lastSentAt` is stamped *before* dispatch, so a down
endpoint is never hammered — there is no retry until the next ≥23h window. The POST uses
the built-in `https` module: `Content-Type: application/json`, 2s timeout,
`socket.unref()` (never holds the process open), any `2xx` = success, no retry. A failure
warns and keeps the local `telemetry-export.json`.

## What is collected (allow-list, schema "1")

The payload is **history-derived and always user-level** (aggregated across all projects,
matching the per-install `device_hash`). The builder **physically constructs only these
fields** — it never copies a history row — and a test proves no disallowed value can
surface even when rows contain it.

**Identity / environment**
- `schema` (`"1"`), `version`, `os`, `arch`
- `device_hash` — `sha256(deviceSalt)`, a once-generated per-install **anonymous** id.
  Not a user, account, repository, or session identifier.
- `runId` — a per-POST random message id for endpoint-side dedup (does **not** correlate
  runs).

**Usage**
- `commands_24h`, `commands_total`
- `tokens_saved_24h`, `tokens_saved_total`, `savings_pct`
- `top_handlers` — handler **names** only, ≤5
- `top_commands` — redacted command **stems** (program + subcommand), ≤5. Example:
  `git diff src/secret.ts` → `git diff`; args, paths, flags, and URLs are stripped.

**Quality** (Contexa's differentiator)
- `quality_status_counts` — counts over the four real statuses: `passed`, `inflated`,
  `empty_output`, `failure`
- `fallback_count` — rows whose handler is the error-fallback
- `parse_failure_24h` — last-24h rows with `quality_status === "failure"`
- `low_savings_handlers` — handler names with low savings

**Retention**
- `first_seen_days`, `active_days_30d`
- `source_adapter_mix` — counts by delivery surface (`shell`, `terminal_tool`, …)

**Estimated savings**
- `estimated_savings_usd_30d` — `tokens_saved_30d / 1e6 × price`. Price from the shared
  `src/core/pricing.ts`: default **$3 / Mtok** (Claude Sonnet 4.6 input), with a `model →
  input $/Mtok` table (`opus` $5, `sonnet` $3, `haiku` $1, `claude-fable-5` $10,
  `gpt-5.5` $5, `gpt-5.5-pro` $30, plus full model ids). This is a labeled **estimate**
  (`estimate_kind: "heuristic"` in `ctx gain --quota`), never a measured token count.
- `estimated_savings_ai_credits_30d` — the same figure expressed in **GitHub AI Credits**
  (1 credit = $0.01, the 2026-06 VS Code / Copilot usage-based unit), i.e. `usd × 100`. AI
  Credits is the headline value unit; USD is retained alongside.

**Optional inspect aggregates** (present only on an `ctx inspect`-triggered build, which has
a fresh scan)
- `inspect.tool_category_counts`, `inspect.recommendation_type_counts`,
  `inspect.source_coverage`

## What is never collected

The allow-list is exhaustive; everything else is structurally impossible:

- Raw command arguments, file paths, URLs, flags, or secrets (only redacted stems in `top_commands`)
- File paths, repository names, or `project_fingerprint`
- Session identifiers, raw output snippets, prompt content
- Source code, logs, or file content

## Pricing reference

`src/core/pricing.ts` is the single source for both `ctx gain --quota` and
`estimated_savings_usd_30d`:

- Default constant: **$3 / Mtok** (Claude Sonnet 4.6 input) — used for any row with no
  best-effort `model`, including every shell command-proxy row. This is also the headline
  reference model; **GPT-5.5** ($5 / Mtok) rides alongside as a well-known cross-reference.
- Model table: `opus` → $5, `sonnet` → $3, `haiku` → $1, `claude-fable-5` → $10,
  `gpt-5.5` → $5, `gpt-5.5-pro` → $30 (and the corresponding full model ids).
  Unknown/typo names fall back to the default — never an error.
- **AI Credits**: ctx saves INPUT/context tokens, priced at the input rate, then converted
  to GitHub AI Credits (`1 credit = $0.01`). AI Credits is the headline value unit; USD is
  retained. Token estimation itself is a calibrated, segmented heuristic (`src/core/tokens.ts`,
  refit by `pnpm calibrate-tokens`), not a real tokenizer — the value figures are estimates,
  shown apart from the measured token counts.

## Consent commands

```bash
ctx config init                # create config.jsonc (both consents default false)
ctx telemetry enable           # set telemetry: true (network upload)
ctx telemetry disable          # set telemetry: false
ctx telemetry status           # show both consents, device_hash, first/last-sent
ctx telemetry preview          # print the EXACT payload that would be POSTed (never sends)
```

`enable`/`disable`/`status`/`preview` **never send**. `preview` prints exactly what a send
would POST.

## Data controller & deletion

For an enterprise build, the **data controller is the operator** who built the package with
their `CTX_TELEMETRY_ENDPOINT` and to whom the opted-in payloads are uploaded. The generic
build uploads to no one.

To stop and erase:

1. `ctx telemetry disable` (or set `telemetry: false`) — stops all uploads.
2. Delete `~/.contexa/telemetry-state.json` by hand to reset the `device_hash`
   (device-reset is no longer a user-facing `ctx telemetry` subcommand — ADR 0006).
   The next run that you opt back into will generate a fresh, unlinkable id.

Server-side deletion of already-uploaded payloads is the operator's responsibility; contact
the operator that produced your enterprise build.
