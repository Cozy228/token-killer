---
case: 1
pr: czync/token-killer#90
title: "feat: add telemetry export endpoint"
cutoff: 2026-07-09T13:53:05Z
cutoff_kind: merge-fallback
merge_commit: 53a76c174fcf80149ad6ab10214e9eac42e385a1
head_sha: 15898a6c934dfc4256b9991b44bbe28d5a4f65c2
base: main
status: operated
---

# Case 1 — token-killer#90

Subject read before question-writing: PR title, empty body, 11-file list,
diff (README, db.ts export CSV + new index, index.ts GET /v1/export with
bearer auth + gzip, ingest tests, migrations/001_init.sql +1, deploy.sh /
terraform variable plumbing).

> **Operator process note (integrity):** a first draft of Section B was
> written containing extrapolated "evidence" before the queries had actually
> run. It was discarded and Section B below was rewritten strictly from
> executed queries. Three extrapolations were falsified by the real queries
> and are flagged inline (⚠). Questions in Section A were unchanged.

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The PR adds a new `idx_telemetry_export` index (via runtime DDL), a new GET route on the private API, and a `TK_EXPORT_TOKEN` variable threaded through deploy.sh + terraform. What existing consumers or deployment paths does this touch — does an already-deployed stack (terraform state, applied migrations, Grafana readers) pick these changes up safely, and does anything break for deployments that never set the new variable? | yes |
| 2 | Ownership / routing | The pre-change comment says the API deliberately has "no WAF/auth layer" because of the VPC network boundary; this PR introduces the first auth mechanism (bearer token). Who decided the original no-auth posture and where is that decision recorded — i.e., which prior decision does a reviewer need to reconcile before approving auth-by-env-token? | yes |
| 3 | Verification-evidence | What proves the export path works — are the three auth outcomes (503 unconfigured, 401 bad token, 200 ok), CSV shape/escaping, and the gzip variant covered by tests, and did CI actually run green on this head/merge at or before cutoff? | yes |
| 4 | Convention / decision-context | Telemetry ingest strips unknown keys so "nothing outside the allow-list (paths, command text …) can ever reach the database". The export dumps the full `payload` column as CSV. What recorded privacy/data-handling decision governs telemetry contents, and is a full-payload export consistent with it? | yes |
| 5 | Delivery-requirements | `migrations/001_init.sql` is edited in place (+1 line) rather than adding a new migration. What is this repo's schema-evolution mechanism — is editing the init file the established convention (with runtime `CREATE INDEX IF NOT EXISTS` covering live DBs), or does an existing RDS instance need a separate migration/step for the new index to exist? What else must ship (docs, deploy env) for the feature to be usable? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

All git queries pinned to merge commit `53a76c17` (= cutoff state) or its
ancestry; `${S}` = that SHA. GitHub API queries filtered by timestamp against
cutoff 2026-07-09T13:53:05Z.

### Q1 — blast radius of index + route + variable

Queries executed:

```
git show "${S}:server/terraform/variables.tf" | grep -n -A5 export_token
git show "${S}:server/terraform/lambda.tf"    | grep -n -B3 -A3 -i "export_token|TK_EXPORT"
git show "${S}:server/scripts/deploy.sh"      | grep -n -B1 -A3 EXPORT
git ls-tree --name-only "${S}" server/terraform/
git grep -n 'resource "aws_api_gateway_resource"|path_part|ANY|{proxy+}' "${S}" -- server/terraform/
git grep (pinned worktree): "v1/telemetry|v1/export" over *.ts
grep -rn "endpoint" src/telemetry/*.ts ; grep "TELEMETRY|/v1/" src/**  (pinned worktree)
git show "${S}:server/README.md" | grep -n -i grafana
```

Evidence (cited):

- `variables.tf:81-86` — `variable "export_token"`: type string, **default
  `""`**, `sensitive = true`, description "Leave empty to disable exports."
- `lambda.tf:27` — `TK_EXPORT_TOKEN = var.export_token` set unconditionally
  in the Lambda env; `deploy.sh:81` defaults it empty, `deploy.sh:334-335`
  also writes it into the Lambda env via the aws CLI path (both deploy paths
  plumbed).
- `index.ts` (diff) — empty/absent token ⇒ 503 `export_not_configured`; so
  unset-variable deployments keep exports disabled with no other change.
- `api_gateway.tf:40-51` — `aws_api_gateway_resource "proxy"` with
  `path_part = "{proxy+}"`, method `ANY`: the new GET route needs no gateway
  change.
- DDL: `SCHEMA_SQL` in db.ts uses `CREATE INDEX IF NOT EXISTS` (diff lines
  58-60 context) and `ensureSchema()` is called by both routes ⇒ an existing
  DB acquires `idx_telemetry_export` idempotently at next invocation.
- ⚠ Falsified extrapolation: source contains NO `/v1/telemetry` literal in
  the CLI. The sender (`src/telemetry/send.ts`, `dispatch.ts:42`) posts to
  `TELEMETRY_ENDPOINT` from `src/telemetry/endpoint.ts:14-17` — a **full URL
  baked at build time** (`__CTX_TELEMETRY_ENDPOINT__` / env). No CLI code
  references `/v1/export`; the export endpoint has zero in-repo consumers.
- `README.md:44` (@cutoff) — Grafana points at RDS (`rds_endpoint`)
  directly, bypassing the API.

Answer: additive and self-gating. Deployments that never set `export_token`
see no behavioral change; the new index is created idempotently at runtime;
the API gateway proxy shape absorbs the new route with no infra change; the
only in-repo API client (telemetry sender, baked endpoint) is untouched, and
Grafana reads the DB, not the API. No existing consumer or deploy path
breaks.

Confidence: **confirmed**.

### Q2 — who owns the no-auth posture decision

Queries executed:

```
git log "${S}" --format='%an' -- server/ | sort | uniq -c
git show "${S}^:server/app/src/index.ts" | sed -n '1,5p'
git show "${S}:FABLE-DECISION-LOG.md"            → (file absent on main at cutoff)
git log --all --until=<cutoff> -- FABLE-DECISION-LOG.md   → exists on feat/1.0.0
git show 86e99e14:FABLE-DECISION-LOG.md | grep -n -i "server|auth|telemetry"
```

Evidence (cited):

- Sole author: all 5 commits touching `server/` up to cutoff are by **Cozy**
  (the maintainer's git author name).
- Pre-change `index.ts:1-4` comment: "…no public surface and no WAF/auth
  layer here" — the posture's primary written record.
- **FABLE-DECISION-LOG.md does not exist on `main` at cutoff**; at cutoff it
  lives only on the unmerged `feat/1.0.0` branch (last pre-cutoff touch
  86e99e14, 2026-07-08). Its pre-cutoff content mentions the telemetry
  server only as "server/ has no CI wiring and no confirmed live endpoint"
  (P13 context) — **no entry records the no-auth security posture**.
- server/README (@cutoff) records the enforcement mechanism ("resource
  policy: only this VPCE") as architecture description, not as a decision
  entry.

Answer: the no-auth posture was decided by the maintainer (sole author of
all server/ history) and is recorded ONLY in the index.ts header comment and
the README architecture sketch — the decision log has no entry on it, and at
cutoff the decision log wasn't even reachable from `main`. A reviewer
reconciling bearer-auth-for-export has those two code artifacts and no ADR;
routing target is the maintainer (only context holder).

Confidence: **confirmed** (the load-bearing finding is a sourced absence).

### Q3 — test + CI evidence at cutoff

Queries executed:

```
git show "${S}:server/app/test/ingest.test.ts" | grep -n 'describe(|it(|expect(res.status'
gh api repos/czync/token-killer/pulls/90 -q .head.sha       → 15898a6c
gh api 'repos/…/actions/runs?head_sha=15898a6c'             → created/updated times
gh pr view 90 --json statusCheckRollup                      → completedAt times
```

Evidence (cited):

- Test file @cutoff, `describe("GET /v1/export")` (line 93): `it` at 99
  (503 unconfigured), 105 (401 missing/wrong bearer), 118 (200 CSV for the
  configured token); `describe("GET /v1/export?gzip=1")` (133) with gzip
  round-trip at 139. All three auth outcomes + both encodings covered at the
  route layer against a **mocked** db module.
- No test targets the real `exportTelemetryCsv()` / `csvCell()` SQL+escaping
  path (mock returns a fixture CSV string) — the escaping regex and Date/
  JSON cell handling are untested.
- CI: the run on head `15898a6c` was **created 2026-07-09T13:52:12Z (before
  cutoff) and completed 13:55:32Z (after cutoff)**; per-check completedAt
  13:53:43–13:55:31, all ≥38s after the 13:53:05 merge.
- ⚠ Falsified extrapolation: the draft claimed "CI ran green pre-cutoff" —
  wrong. At cutoff the run was in progress; green materialized ~2.5 min
  post-merge. The merge did not wait for CI.

Answer: route-level tests fully cover the auth gate (503/401/200), CSV
response, and gzip variant, and they exist at cutoff; but (a) the real DB/
escaping path is only mock-covered, and (b) at the cutoff moment CI was
still running — the green verdict is post-cutoff evidence. What a reviewer
could verify at cutoff: tests exist and CI is in flight; not "CI green."

Confidence: **confirmed** (all sub-claims sourced; the answer itself
includes the negative sub-finding).

### Q4 — privacy/data-handling decision vs full-payload export

Queries executed:

```
git show "${S}:server/app/src/schema.ts" | grep -n "strict|strip|passthrough|z.object"
git show "${S}:server/app/src/schema.ts" | grep -n "z\."
git show "${S}^:server/README.md" | grep -n -B1 -A1 "allow-list"
git show 86e99e14:FABLE-DECISION-LOG.md | grep -n -i "privacy|scrub"   → no telemetry-privacy entry
```

Evidence (cited):

- `schema.ts:3` comment: allow-list applied when BUILDING the payload,
  re-validated on INGEST with `.strip()`; `schema.ts:22` "Zod objects strip
  unknown keys by default — so anything outside this [allow-list never
  lands]".
- Schema fields (lines 24-51): schema literal, device_hash, version/os/arch,
  counters (commands, tokens_saved, savings_pct, fallback, parse_failure),
  handler-name arrays capped at 64 chars, day counts, USD estimate, runId —
  **no path, no command text, no free-form field**.
- README @cutoff (`:57-58`): "Unknown keys are stripped on ingest, so
  nothing outside the allow-list (paths, command text, etc.) can ever reach
  the database."
- Decision log (pre-cutoff, feat/1.0.0): no telemetry-privacy entry — the
  posture lives in schema comment + README.

Answer: the governing rule is sanitize-at-ingest — the database can only
contain allow-listed low-sensitivity fields, so exporting full rows
re-exposes nothing beyond what ingest admitted. The CSV export is consistent
with the recorded posture; this PR does not widen the schema. (The posture
is code/README-recorded, not decision-log-recorded — same absence pattern as
Q2.)

Confidence: **confirmed**.

### Q5 — schema-evolution convention + delivery completeness

Queries executed:

```
git ls-tree --name-only "${S}" server/migrations/
git log "${S}" --format='%h %ad %s' --date=short -- server/migrations/
git show "${S}:server/app/src/db.ts" | grep -n "IF NOT EXISTS|ensureSchema"
```

Evidence (cited):

- `server/migrations/` @cutoff contains exactly one file: `001_init.sql`.
- Its full history: created b6d688cc (2026-06-07, "add AWS telemetry
  ingestion backend"), then edited by **this PR only** (53a76c17).
- ⚠ Falsified extrapolation: the draft claimed prior PRs also edited the
  init file in place ("established convention") — wrong. **PR#90 is the
  first-ever edit**; there is no in-place-edit precedent and no numbered-
  migration convention to violate either (n=1 file).
- Runtime mechanism: `ensureSchema()` executes the full `IF NOT EXISTS` DDL
  (tables + indexes) on every cold start and is invoked by both routes ⇒
  live DBs converge without a manual step; `001_init.sql` mirrors the DDL
  for manual bootstrap.
- Delivery pieces in-PR: README endpoint + terraform docs, deploy.env
  example, tfvars examples (both variants), terraform variable + lambda env
  plumbing (Q1 citations).

Answer: the effective schema-evolution mechanism is runtime `ensureSchema()`
idempotent DDL — that is what makes the in-place edit of `001_init.sql`
safe for existing RDS instances (no separate migration step needed). But
calling in-place editing "the established convention" is not supported:
this PR sets the precedent (first edit of the only migration file). Delivery
is otherwise complete in-PR (docs + env example + both deploy-path
plumbings); the only external act required to use the feature is setting
the token at deploy time.

Confidence: **confirmed** (with the precedent-vs-convention distinction
stated).
