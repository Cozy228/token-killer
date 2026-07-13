---
case: 1
voter: claude
date: 2026-07-12
---

# Case 1 vote — claude (token-killer#90, cutoff 2026-07-09T13:53:05Z)

All evidence below was retrieved in this session from a detached worktree pinned at
`53a76c174fcf80149d...` (`git worktree add --detach`) and from GitHub API records whose
`created_at`/`startedAt` precede the cutoff (post-cutoff completion times are cited only
to establish what was NOT knowable at cutoff). File:line references are to the pinned tree.

## Q1 — blast radius of index + route + variable

**Score: correct**

Every material sub-claim in the operator's answer re-verified independently. (1) Self-gating:
`server/terraform/variables.tf:81-86` declares `export_token` with `default = ""`, and
`server/app/src/index.ts:72-75` returns 503 `export_not_configured` when `TK_EXPORT_TOKEN` is
falsy, so a deployment that never sets the variable sees no behavioral change on any existing
route; `deploy.sh:81` likewise defaults `TK_EXPORT_TOKEN=""`. (2) Idempotent runtime index:
`server/app/src/db.ts:40` adds `CREATE INDEX IF NOT EXISTS idx_telemetry_export` to the DDL
that `ensureSchema()` (db.ts:84-89) runs on first use, and `ensureSchema` is invoked on both
the ingest path (index.ts:33) and the new export path (index.ts:48), so live RDS instances
acquire the index without a migration step. (3) Route absorption: the terraform front door is
a greedy `{proxy+}` ANY proxy (`server/terraform/api_gateway.tf:38-60`) and deploy.sh's apigw
path builds the same shape (deploy.sh:398-415); the ALB path forwards everything to the Lambda
target group (alb.tf:63-80) — no infra change needed for a new GET route. (4) Only in-repo API
client untouched: the merge diff touches 11 files, all under `server/` (`git show --stat HEAD`);
the client sender (`src/telemetry/endpoint.ts:12-17`, `dispatch.ts:14,42`) uses a build-time
baked endpoint and POSTs only `/v1/telemetry`; a repo-wide grep for `v1/export` outside server/
returns nothing. (5) Grafana reads the DB, not the API: `server/README.md:19-27` ("Grafana
PostgreSQL data source → dashboards ... straight from Grafana over SQL") and deploy.sh:509-511.
The "confirmed" label is warranted; no wrong claim found.

## Q2 — who owns the no-auth posture decision

**Score: correct**

(1) The pre-change posture text exists exactly as characterized: `git show HEAD^:server/app/src/index.ts`
lines 3-4 read "no public surface and no WAF/auth layer here", and the pre-change README records
the same posture ("Private, internal ingestion API ... corp VPC (no public surface)", README:3-5,
architecture sketch :11-19, and a "Security / privacy notes" section: "No public endpoint, no WAF:
access control is network isolation", pre-change README:164-167). (2) Sole authorship:
`git log --format='%an <%ae>' -- server/ | sort | uniq -c` on the pinned ancestry returns exactly
one author (Cozy, 5 commits), supporting "decided by the maintainer" and the routing target.
(3) Sourced absence: `git ls-tree HEAD --name-only | grep -i decision` returns nothing — no
decision log is reachable from the merge commit's tree (main ancestry) at cutoff. The decision
log does exist pre-cutoff on another branch (last pre-cutoff commit `86e99e14`, 2026-07-08T20:42:38+08:00),
and grepping that copy for auth/server/telemetry/WAF/VPC yields only P9/P13 entries about the
telemetry backend's existence and deployment — no entry deciding the no-auth posture. The
operator's answer (code-artifact-recorded only, no ADR, maintainer is the context holder) is
accurate on every point.

## Q3 — test + CI evidence at cutoff

**Score: correct**

(1) Test coverage claims verified against `server/app/test/ingest.test.ts` in the pinned tree:
503 unconfigured (:99-103), 401 missing and wrong bearer (:105-116), 200 CSV with content-type/
disposition/body assertions (:118-130), and the gzip variant with gunzip round-trip (:139-153).
(2) The mock-coverage caveat is true and material: the DB layer is stubbed via `vi.mock` (:4-13)
with a canned CSV string, so `exportTelemetryCsv`/`csvCell` escaping (db.ts:124-148) is never
exercised against real rows — the operator's "(a) real DB/escaping path is only mock-covered"
is exactly right. (3) CI-at-cutoff: `gh api repos/czync/token-killer/pulls/90` gives head
`15898a6c`, merged_at 2026-07-09T13:53:05Z (= cutoff); the CI run for that head was created
13:52:12Z (pre-cutoff, admissible) but its check jobs completed between 13:53:43Z and 13:55:31Z
(`gh pr view 90 --json statusCheckRollup`) — every completion is after the cutoff, so "at cutoff
CI was in flight; the green verdict is post-cutoff evidence" is precisely correct. The answer
explicitly refuses to claim "CI green" at cutoff, so nothing is overclaimed; no false-reassurance
risk.

## Q4 — privacy/data-handling decision vs full-payload export

**Score: correct**

(1) Sanitize-at-ingest is real and recorded in code and README: `server/app/src/schema.ts:1-7`
("we re-validate on INGEST and `.strip()` any unknown keys so the database only ever stores
known, typed fields") and :22-23 ("Zod objects strip unknown keys by default — so anything
outside this allow-list (paths, command text, ...) is dropped before it can reach the DB");
pre-change README:56-58 states the same, and the test at ingest.test.ts:61-66 asserts a
`secret_path` key never reaches `insertEvent`. (2) The stored `payload` column is the
post-strip parse result: index.ts:24-34 passes `parsed.data` to `insertEvent`, and db.ts:119
stores `JSON.stringify(e)` of that object — so exporting the full `payload` column re-exposes
only allow-listed fields, exactly the operator's consistency argument. (3) The PR does not
widen the schema: the 11-file diff does not touch schema.ts. (4) The absence claim holds:
grepping the pre-cutoff decision-log copy (`86e99e14`) for privacy/scrub/allow-list/PII returns
no telemetry-privacy entry, so the posture is code/README-recorded, as stated. No wrong
sub-claim found.

## Q5 — schema-evolution convention + delivery completeness

**Score: correct**

(1) Mechanism: db.ts:2-5 documents it explicitly ("`ensureSchema()` runs an idempotent CREATE
TABLE IF NOT EXISTS on first use, so there is no separate migration step to operate
(migrations/001_init.sql is the canonical copy of this DDL for reference / Grafana)"), and the
new index is inside that runtime DDL (db.ts:40) with `IF NOT EXISTS`, so an existing RDS
instance needs no separate step — verified. (2) The precedent-vs-convention distinction is
supported: `server/migrations/` contains only `001_init.sql`, and `git log -- server/migrations/`
on the pinned ancestry shows exactly two commits — creation (b6d688cc, 2026-06-07) and this PR
(53a76c17) — so this PR is indeed the first in-place edit and no numbered-migration convention
exists to violate; calling in-place editing "established convention" would have been
unsupported, and the operator correctly declined to. (3) Delivery completeness: README updated
(sketch line :12, export section :61-64, env-var list :116), `deploy.env.example:54-55` adds
`TK_EXPORT_TOKEN`, both tfvars examples add `export_token` (terraform.tfvars.example:17-18,
terraform.tfvars.alb.example:38-39), and both deploy paths thread it (deploy.sh:81,334-335;
lambda.tf:27). The only remaining external act is setting the token at deploy time — as stated.
