# token-killer telemetry server

Private, internal ingestion API for the `tk` CLI's telemetry beacon. Built for a
corp VPC (no public surface) and a small fleet (a few thousand devices, ~1 POST
per device per 23h).

## Architecture

```
developer machine (corp network / VPN)
   │  HTTPS POST /v1/telemetry   (single TelemetryPayload v2 JSON, 2s timeout)
   ▼
execute-api VPC endpoint ──► PRIVATE API Gateway REST API   (resource policy: only this VPCE)
   ▼
Lambda (Hono, in VPC)        validate schema:"1" → INSERT … ON CONFLICT DO NOTHING
   ▼
RDS PostgreSQL (db.t4g.micro, single-AZ, encrypted, private)
   ▲
Grafana                      PostgreSQL data source → dashboards
```

**Why this shape** (see the design discussion): the fleet is tiny and the
payload totals are *cumulative*, so a lost beacon self-heals on the next 23h
window. That removes any need for Firehose/streaming/exactly-once. A single small
Postgres beats S3+Athena here because the data is small, structured, and queried
straight from Grafana over SQL.

## Layout

```
server/
├── app/                 Hono + TypeScript ingestion service (Vite build)
│   ├── src/
│   │   ├── index.ts     Hono app + Lambda handler (export `handler`)
│   │   ├── schema.ts    zod mirror of the client TelemetryPayload v2
│   │   ├── db.ts        pg pool, idempotent CREATE TABLE, INSERT
│   │   └── config.ts    DB creds from env + Secrets Manager
│   ├── test/            vitest route + validation tests
│   ├── Dockerfile       multi-stage → Lambda container image
│   └── vite.config.ts
├── migrations/001_init.sql   canonical DDL (Lambda also runs it on cold start)
├── scripts/deploy.sh    one-shot, idempotent AWS-CLI deploy (self-discovering)
└── terraform/           private API GW + VPC Lambda + RDS + ECR + endpoints
```

## App: develop & build

```bash
cd server/app
pnpm install
pnpm test          # vitest (DB is mocked)
pnpm typecheck
pnpm build         # → dist/index.js (ESM, exports `handler`)
```

The handler matches whatever the client POSTs: `application/json`, body = one
`TelemetryPayload`. Unknown keys are stripped on ingest, so nothing outside the
allow-list (paths, command text, etc.) can ever reach the database.

## Lambda packaging: container vs zip

**Docker is not required** — Lambda also accepts a zip. The `Dockerfile` is here
because enterprise pipelines usually standardize on ECR. Pick one:

- **Container image (default in the Terraform).** `package_type = "Image"`,
  built from `app/Dockerfile`:
  ```bash
  cd server/app
  ECR=$(terraform -chdir=../terraform output -raw ecr_repository_url)
  aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin "$ECR"
  docker build -t "$ECR:$(git rev-parse --short HEAD)" .
  docker push "$ECR:$(git rev-parse --short HEAD)"
  # feed the pushed tag back as lambda_image_uri
  ```
- **Zip alternative (simpler).** Drop `pnpm build`'s `dist/` + the pruned
  `node_modules` into a zip and switch `lambda.tf` to
  `filename`/`handler = "index.handler"`/`runtime = "nodejs22.x"`. No ECR, no
  Docker.

## Front door: internal ALB (default) or API Gateway

Both deploy paths support two ingress types:

- **`alb` (default)** — internal Application Load Balancer → Lambda target group. Because
  the `tk` client only speaks HTTPS, the ALB's 443 listener needs an **ACM cert**
  you provide, plus a Route53 (private zone) record mapping the cert's domain to
  the ALB. Before creating the ALB, both paths **precheck the subnets**: ≥2 AZs
  and ≥8 free IPs each (`available_ip_address_count`), failing fast otherwise.
- **`apigw`** — private API Gateway REST. Gets **AWS-managed TLS for
  free** via the execute-api endpoint, so no cert to manage.

Pick with `INGRESS=alb|apigw` (script) / `ingress = "alb"` (Terraform).

## Deploy — option A: one-shot AWS CLI script

`scripts/deploy.sh` provisions the **entire** stack with the AWS CLI + docker,
end to end and idempotently (re-run to converge). You supply credentials + a
region; it discovers everything else (VPC, subnets, security groups, VPC
endpoints, the RDS-managed secret ARN, the IAM role ARN, …).

```bash
export AWS_PROFILE=my-corp-profile     # or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
export AWS_REGION=us-east-1
CERT_ARN=arn:aws:acm:...:certificate/... VPC_ID=vpc-... ./scripts/deploy.sh
# tune the IP floor with ALB_MIN_FREE_IPS (default 8); prints the ALB DNS to alias
```

Optional overrides (all auto-discovered otherwise): `VPC_ID`, `SUBNET_IDS`,
`CLIENT_CIDR`, `NAME_PREFIX`, `DB_INSTANCE_CLASS`, `IMAGE_TAG`,
`CREATE_INTERFACE_ENDPOINTS`, `INGRESS`; ALB-only: `CERT_ARN` (required),
`LISTENER_PORT` (443), `ALB_MIN_FREE_IPS` (8). If API Gateway is allowed, run
`INGRESS=apigw ./scripts/deploy.sh`. Prereqs: `aws`, `docker`
(daemon running), `jq`.
The image is built `--platform linux/amd64` to match the x86_64 Lambda, so it
works from an Apple-Silicon machine too. Every step is "describe → reuse if
present, else create", so interrupted runs resume cleanly.

## Deploy — option B: Terraform

State/backend and CI/CD are owned by **Terraform Enterprise** — no backend block
is declared here. Inputs: copy `terraform.tfvars.example` → `terraform.tfvars`
and fill the existing `vpc_id` / `private_subnet_ids` / `client_cidr_blocks`.

First-run ordering (image must exist before the Lambda references it):

1. `terraform apply -target=aws_ecr_repository.app` (and dependencies) to create
   the ECR repo + RDS + IAM.
2. Build & push the image (above).
3. Set `lambda_image_uri`, then `terraform apply` the rest.

Outputs:
- `telemetry_endpoint_url` — bake this into the CLI as `TK_TELEMETRY_ENDPOINT`
  at build time (the enterprise build). It resolves to private IPs in-VPC.
- `rds_endpoint` / `rds_secret_arn` — point Grafana's PostgreSQL data source here.

> Client prerequisite: developer machines must reach the VPC (Direct Connect /
> VPN / Transit Gateway) and resolve the execute-api private DNS name.

## Grafana

Add a **PostgreSQL** data source pointing at `rds_endpoint` (read-only role
recommended). Starter queries:

```sql
-- Fleet size & active devices (last 30d)
SELECT count(DISTINCT device_hash) AS devices
FROM telemetry_events
WHERE received_at > now() - interval '30 days';

-- Latest cumulative totals per device, summed across the fleet
SELECT sum(tokens_saved_total) AS tokens_saved, sum(commands_total) AS commands
FROM (
  SELECT DISTINCT ON (device_hash) device_hash, tokens_saved_total, commands_total
  FROM telemetry_events
  ORDER BY device_hash, received_at DESC
) t;

-- Daily 24h savings trend
SELECT date_trunc('day', received_at) AS day, sum(tokens_saved_24h) AS saved
FROM telemetry_events
GROUP BY 1 ORDER BY 1;
```

## Security / privacy notes

- No public endpoint, no WAF: access control is **network isolation** (private
  API + VPCE resource policy + corp-only ingress).
- DB password never in Terraform state — RDS-managed secret, read by the Lambda
  via `secretsmanager:GetSecretValue` (least privilege).
- Payload is already anonymized client-side (`device_hash` = sha256 of a random
  salt); the server stores no IPs and re-strips unknown keys.
- Data is loss-tolerant → single-AZ RDS is a deliberate cost choice.
