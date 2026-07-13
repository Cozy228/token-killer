---
case: 1
voter: codex
date: 2026-07-12
---

## Q1

**Score:** correct

The answer is correct for existing consumers and deployment paths: Terraform gives `export_token` an empty default and marks it optional, the shell deploy path also defaults `TK_EXPORT_TOKEN` to empty, and the route returns 503 before schema or export work when no token is configured (`server/terraform/variables.tf:81-85`; `server/scripts/deploy.sh:77-87`; `server/app/src/index.ts:43-49,69-81`). The new index is part of the first-use idempotent DDL (`server/app/src/db.ts:38-40,84-89`), while both supported front doors already forward arbitrary paths to the Lambda—the API Gateway uses a greedy `{proxy+}`/`ANY` integration and the ALB listener has a default forward action (`server/terraform/api_gateway.tf:38-62`; `server/terraform/alb.tf:85-96`). The client telemetry implementation was untouched (`git diff --exit-code HEAD^ HEAD -- src/telemetry` exited 0), and Grafana remains a PostgreSQL reader rather than an API consumer (`server/README.md:137-151`), so the additive disabled route and index do not break an existing in-repo consumer.

## Q2

**Score:** correct

The admissible record supports the operator's ownership and routing answer: immediately before the PR, the header explicitly said the VPC endpoint/network boundary was why there was no WAF/auth layer, and the README's security section recorded network isolation as the access-control posture (`59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec:server/app/src/index.ts:1-4`; `59fc1ab217dd4c37ccc1ccdac5ff6487b9cb25ec:server/README.md:164-171`). `git log HEAD --format='%H%x09%aI%x09%an%x09%ae%x09%s' -- server/` returned only Cozy as author throughout `server/`, and `git blame HEAD^ -L 1,6 -- server/app/src/index.ts` attributes the posture comment to the initial server commit by Cozy. The commands `git ls-tree --name-only HEAD FABLE-DECISION-LOG.md` and `git log HEAD --format='%H%x09%aI%x09%s' -- FABLE-DECISION-LOG.md` both returned no record, while the pinned ADR search found enterprise-intranet context but no auth-specific decision; therefore the maintainer is the only recorded owner to reconcile the new export-only bearer gate with the earlier network-isolation posture. Calling the README record an "architecture sketch" is imprecise—it is also explicit in its security section—but does not change the answer.

## Q3

**Score:** partial (4/5)

The five material sub-claims score as follows: (1) **correct**—the route tests cover unconfigured 503, missing/wrong-token 401, and authorized 200 (`server/app/test/ingest.test.ts:93-130`); (2) **correct**—the mocked route response and gzip wrapper are exercised (`server/app/test/ingest.test.ts:4-13,133-153`); (3) **correct**—the operator disclosed that the real query and CSV escaping implementation is not exercised because the DB module is mocked, and `exportTelemetryCsv`/`csvCell` have no separate test (`server/app/src/db.ts:124-147`; `server/app/test/ingest.test.ts:4-13`); (4) **correct**—the exact cutoff-filtered query `gh api 'repos/czync/token-killer/actions/runs?head_sha=15898a6c934dfc4256b9991b44bbe28d5a4f65c2&per_page=100' --paginate --jq '.workflow_runs[] | select(.created_at <= "2026-07-09T13:53:05Z") | {id,name,event,status,conclusion,head_sha,created_at,run_started_at,updated_at}'` showed the head run started at 13:52:12Z but was not updated/completed until 13:55:32Z, and the same filtered query for merge SHA `53a76c174fcf80149ad6ab10214e9eac42e385a1` returned no run; (5) **incorrect by omission**—the root CI workflow never enters or invokes the isolated server workspace (`.github/workflows/ci.yml:35-57`; `pnpm-workspace.yaml:1-2`; `server/pnpm-workspace.yaml:1-3`), so even a later green root run would not prove these server tests executed. The missing CI-applicability fact is material to the question's request for proof, but the operator's explicit mock and cutoff caveats prevent false reassurance.

## Q4

**Score:** partial (1/2)

Of the two required material sub-claims: (1) **incorrect**—the governing recorded decision is not merely the server's sanitize-at-ingest comment/README posture; `docs/TELEMETRY.md` identifies itself as the exact field-by-field contract and says it was decided in ADR 0004, DESIGN §8.3 is the field-policy authority, and ADR 0004 records the allow-list/disallow-list decision (`docs/TELEMETRY.md:3-8,40-45,87-94`; `docs/DESIGN.md:877-909`; `docs/adr/0004-opt-in-network-telemetry-and-gain-parity.md:76-94,154-158`), so the operator's claimed decision-log absence missed an admissible ADR; (2) **correct**—the consistency conclusion holds because ingest parses to the stripping schema, stores `parsed.data`, persists that sanitized object as `payload`, and the export emits that same column (`server/app/src/schema.ts:22-52`; `server/app/src/index.ts:24-34`; `server/app/src/db.ts:95-120,124-147`). The command `git diff --exit-code HEAD^ HEAD -- server/app/src/schema.ts src/telemetry/build.ts docs/TELEMETRY.md docs/adr/0004-opt-in-network-telemetry-and-gain-parity.md` exited 0, confirming this PR did not widen the client or ingest field contract; thus the source attribution is wrong, but the no-new-payload-content conclusion is right.

## Q5

**Score:** correct

The answer correctly distinguishes mechanism from convention: the canonical SQL says the Lambda runs the same DDL idempotently and normally needs no manual application, while `ensureSchema()` executes the DDL before both ingest and export (`server/migrations/001_init.sql:1-7,33-35`; `server/app/src/db.ts:3-5,38-40,84-89`; `server/app/src/index.ts:32-49`). `git ls-tree -r --name-only HEAD server/migrations/` returned only `001_init.sql`, and `git log HEAD --follow --format='%H%x09%aI%x09%s' -- server/migrations/001_init.sql` returned only its initial creation and this PR, so in-place editing is a first precedent rather than an established migration convention. Delivery is present for both operator paths: the shell environment example documents the token and `deploy.sh` sends it in the Lambda environment, while Terraform defines the optional sensitive variable and threads it into the same environment (`server/scripts/deploy.env.example:54-55`; `server/scripts/deploy.sh:77-87,329-345`; `server/terraform/variables.tf:81-85`; `server/terraform/lambda.tf:21-28`); the README documents CSV/gzip/auth and how to enable it (`server/README.md:56-64,115-143`). Therefore an existing RDS gets the index through runtime DDL, and enabling use requires supplying the token when deploying rather than a separate migration.
