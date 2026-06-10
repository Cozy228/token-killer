#!/usr/bin/env bash
#
# End-to-end, idempotent deploy of the token-killer telemetry backend using only
# the AWS CLI + docker. Re-running converges to the same state — every step is
# "describe; reuse if present, else create".
#
# You provide: AWS credentials (profile/env) and a region. The script discovers
# everything else (VPC, subnets, security groups, VPC endpoints, the RDS-managed
# secret ARN, the IAM role ARN, ...). Override any discovery via the env vars below.
#
#   Required (one of the standard AWS auth methods):
#     AWS_PROFILE=...                 or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#     AWS_REGION=us-east-1            (or AWS_DEFAULT_REGION, or `aws configure get region`)
#
#   Optional overrides (otherwise auto-discovered):
#     NAME_PREFIX=tk-telemetry
#     VPC_ID=vpc-...                  (default: the account's default VPC)
#     SUBNET_IDS="subnet-a subnet-b"  (default: one subnet per AZ in the VPC, private preferred)
#     CLIENT_CIDR=10.0.0.0/8          (default: the VPC CIDR — who may reach the private API)
#     CREATE_INTERFACE_ENDPOINTS=true (secretsmanager + logs endpoints; set false if NAT/shared exist)
#     DB_INSTANCE_CLASS=db.t4g.micro  DB_NAME=telemetry  DB_USERNAME=tk_ingest
#     IMAGE_TAG=<git-sha|timestamp>
#
# Usage:  ./deploy.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../app" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# All human-facing output goes to stderr so $(capture) only ever sees a clean value.
log()  { printf '\033[0;36m[deploy]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[0;32m[  ok  ]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[0;33m[ warn ]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[ fail ]\033[0m %s\n' "$*" >&2; exit 1; }

trap 'die "aborted at line $LINENO"' ERR

# Treat AWS CLI "None"/empty as "not found".
present() { [ -n "${1:-}" ] && [ "$1" != "None" ]; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }

# ---------------------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------------------
require_cmd aws
require_cmd docker
require_cmd jq
docker info >/dev/null 2>&1 || die "docker daemon is not running"

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
present "$REGION" || die "no region — set AWS_REGION"
export AWS_DEFAULT_REGION="$REGION"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)" \
  || die "cannot authenticate — check AWS credentials"
ok "account=$ACCOUNT_ID region=$REGION"

NAME_PREFIX="${NAME_PREFIX:-tk-telemetry}"
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t4g.micro}"
DB_NAME="${DB_NAME:-telemetry}"
DB_USERNAME="${DB_USERNAME:-tk_ingest}"
CREATE_INTERFACE_ENDPOINTS="${CREATE_INTERFACE_ENDPOINTS:-true}"
TAG_SPEC="Key=Project,Value=$NAME_PREFIX"

# Front door: "apigw" (private API Gateway REST, default) or "alb" (internal ALB).
INGRESS="${INGRESS:-apigw}"
case "$INGRESS" in apigw|alb) : ;; *) die "INGRESS must be apigw or alb (got '$INGRESS')" ;; esac
if [ "$INGRESS" = "alb" ]; then
  LISTENER_PORT="${LISTENER_PORT:-443}"
  ALB_MIN_FREE_IPS="${ALB_MIN_FREE_IPS:-8}"
  # The tk client only speaks HTTPS, so an internal ALB needs an ACM cert for its
  # 443 listener (API Gateway gets AWS-managed TLS for free — that's why it's the
  # default). Fail fast before provisioning anything.
  present "${CERT_ARN:-}" || die "INGRESS=alb requires CERT_ARN (ACM cert for the HTTPS listener)"
fi

# ---------------------------------------------------------------------------
# 1. Network discovery (VPC, subnets, CIDR)
# ---------------------------------------------------------------------------
if ! present "${VPC_ID:-}"; then
  VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
            --query 'Vpcs[0].VpcId' --output text)"
  present "$VPC_ID" || die "no default VPC found — set VPC_ID"
  log "discovered default VPC: $VPC_ID"
fi

VPC_CIDR="$(aws ec2 describe-vpcs --vpc-ids "$VPC_ID" \
            --query 'Vpcs[0].CidrBlock' --output text)"
CLIENT_CIDR="${CLIENT_CIDR:-$VPC_CIDR}"

if ! present "${SUBNET_IDS:-}"; then
  # One subnet per AZ (>=2 AZs needed for the RDS subnet group). Private subnets
  # (MapPublicIpOnLaunch=false) sort first, so they win when both exist.
  SUBNET_IDS=""
  SEEN_AZS=" "
  while read -r sid az _pub; do
    present "$sid" || continue
    case "$SEEN_AZS" in *" $az "*) continue ;; esac
    SEEN_AZS="$SEEN_AZS$az "
    SUBNET_IDS="${SUBNET_IDS:+$SUBNET_IDS }$sid"
  done < <(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" \
           --query 'Subnets[].[SubnetId,AvailabilityZone,MapPublicIpOnLaunch]' \
           --output text | sort -k3)
fi
# shellcheck disable=SC2086  # intentional split: one subnet per line to count
SUBNET_COUNT=$(printf '%s\n' $SUBNET_IDS | grep -c . || true)
[ "$SUBNET_COUNT" -ge 2 ] || die "need >=2 subnets across AZs (found: '$SUBNET_IDS')"
SUBNETS_CSV="$(printf '%s' "$SUBNET_IDS" | tr ' ' ',')"
ok "vpc=$VPC_ID subnets=[$SUBNET_IDS] client_cidr=$CLIENT_CIDR"

# ALB precheck (fail fast, BEFORE provisioning anything): an ALB needs subnets in
# >=2 AZs, each with enough free IPs (AWS minimum is 8). Scan every subnet in the
# VPC, report each one's free-IP count, and pick one qualifying subnet per AZ.
if [ "$INGRESS" = "alb" ]; then
  log "ALB precheck: need >=2 AZs with >=$ALB_MIN_FREE_IPS free IPs each"
  ALB_SUBNET_IDS=""
  _alb_seen=" "
  while read -r sid az free; do
    present "$sid" || continue
    if [ "$free" -lt "$ALB_MIN_FREE_IPS" ]; then
      warn "  $sid ($az): $free free IPs — below $ALB_MIN_FREE_IPS, skip"
      continue
    fi
    case "$_alb_seen" in *" $az "*) log "  $sid ($az): $free free IPs — AZ already covered"; continue ;; esac
    _alb_seen="$_alb_seen$az "
    ALB_SUBNET_IDS="${ALB_SUBNET_IDS:+$ALB_SUBNET_IDS }$sid"
    log "  $sid ($az): $free free IPs — OK"
  done < <(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC_ID" \
           --query 'Subnets[].[SubnetId,AvailabilityZone,AvailableIpAddressCount]' \
           --output text | sort -k2)
  # shellcheck disable=SC2086  # intentional split: count one subnet per line
  ALB_SUBNET_COUNT=$(printf '%s\n' $ALB_SUBNET_IDS | grep -c . || true)
  [ "$ALB_SUBNET_COUNT" -ge 2 ] \
    || die "ALB needs >=2 subnets in different AZs with >=$ALB_MIN_FREE_IPS free IPs; only $ALB_SUBNET_COUNT qualify in $VPC_ID"
  ok "ALB subnets: [$ALB_SUBNET_IDS] ($ALB_SUBNET_COUNT AZs)"
fi

# ---------------------------------------------------------------------------
# 2. Security groups
# ---------------------------------------------------------------------------
ensure_sg() { # name desc -> id
  local name="$1" desc="$2" id
  id="$(aws ec2 describe-security-groups \
        --filters Name=group-name,Values="$name" Name=vpc-id,Values="$VPC_ID" \
        --query 'SecurityGroups[0].GroupId' --output text)"
  if ! present "$id"; then
    id="$(aws ec2 create-security-group --group-name "$name" --description "$desc" \
          --vpc-id "$VPC_ID" \
          --tag-specifications "ResourceType=security-group,Tags=[{$TAG_SPEC}]" \
          --query GroupId --output text)"
    log "created SG $name=$id"
  fi
  printf '%s\n' "$id"
}

# authorize-ingress, tolerating the already-exists error so re-runs are clean.
authorize() { # sg-id  <authorize-security-group-ingress args...>
  local sg="$1"; shift
  local err
  if ! err="$(aws ec2 authorize-security-group-ingress --group-id "$sg" "$@" 2>&1)"; then
    case "$err" in
      *InvalidPermission.Duplicate*) : ;;
      *) die "authorize ingress on $sg failed: $err" ;;
    esac
  fi
}

LAMBDA_SG="$(ensure_sg "$NAME_PREFIX-lambda" "tk telemetry ingest Lambda")"
RDS_SG="$(ensure_sg "$NAME_PREFIX-rds" "tk telemetry Postgres")"
VPCE_SG="$(ensure_sg "$NAME_PREFIX-vpce" "tk telemetry VPC endpoints")"

authorize "$RDS_SG"  --protocol tcp --port 5432 --source-group "$LAMBDA_SG"
authorize "$VPCE_SG" --protocol tcp --port 443 --cidr "$CLIENT_CIDR"
authorize "$VPCE_SG" --protocol tcp --port 443 --source-group "$LAMBDA_SG"
ok "security groups ready (lambda=$LAMBDA_SG rds=$RDS_SG vpce=$VPCE_SG)"

# ---------------------------------------------------------------------------
# 3. VPC interface endpoints
# ---------------------------------------------------------------------------
ensure_endpoint() { # short-service-name -> id
  local svc="com.amazonaws.$REGION.$1" id
  id="$(aws ec2 describe-vpc-endpoints \
        --filters Name=vpc-id,Values="$VPC_ID" Name=service-name,Values="$svc" \
        --query 'VpcEndpoints[0].VpcEndpointId' --output text)"
  if ! present "$id"; then
    # shellcheck disable=SC2086  # intentional split: pass each subnet as its own arg
    id="$(aws ec2 create-vpc-endpoint --vpc-endpoint-type Interface \
          --vpc-id "$VPC_ID" --service-name "$svc" \
          --subnet-ids $SUBNET_IDS --security-group-ids "$VPCE_SG" \
          --private-dns-enabled \
          --tag-specifications "ResourceType=vpc-endpoint,Tags=[{$TAG_SPEC}]" \
          --query 'VpcEndpoint.VpcEndpointId' --output text)"
    log "created endpoint $1=$id"
  fi
  printf '%s\n' "$id"
}

# execute-api endpoint is only needed by the private API Gateway front door.
if [ "$INGRESS" = "apigw" ]; then
  EXECUTE_API_VPCE="$(ensure_endpoint execute-api)"
  ok "execute-api endpoint=$EXECUTE_API_VPCE"
fi
# Lambda-in-VPC needs to reach Secrets Manager + CloudWatch Logs in both modes.
if [ "$CREATE_INTERFACE_ENDPOINTS" = "true" ]; then
  ensure_endpoint secretsmanager >/dev/null
  ensure_endpoint logs >/dev/null
fi

# ---------------------------------------------------------------------------
# 4. ECR repository
# ---------------------------------------------------------------------------
ECR_NAME="$NAME_PREFIX-ingest"
ECR_URI="$(aws ecr describe-repositories --repository-names "$ECR_NAME" \
           --query 'repositories[0].repositoryUri' --output text 2>/dev/null || true)"
if ! present "$ECR_URI"; then
  ECR_URI="$(aws ecr create-repository --repository-name "$ECR_NAME" \
             --image-scanning-configuration scanOnPush=true \
             --tags "$TAG_SPEC" \
             --query 'repository.repositoryUri' --output text)"
  log "created ECR repo $ECR_URI"
fi

# ---------------------------------------------------------------------------
# 5. Build + push the Lambda image (forced linux/amd64 to match the x86_64 fn)
# ---------------------------------------------------------------------------
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE="$ECR_URI:$IMAGE_TAG"
log "building image $IMAGE"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ECR_URI%%/*}" >/dev/null
docker build --platform linux/amd64 -t "$IMAGE" "$APP_DIR"
docker push "$IMAGE" >/dev/null
ok "pushed $IMAGE"

# ---------------------------------------------------------------------------
# 6. IAM role (trust + VPC-access managed policy)
# ---------------------------------------------------------------------------
ROLE_NAME="$NAME_PREFIX-lambda"
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" \
            --query 'Role.Arn' --output text 2>/dev/null || true)"
if ! present "$ROLE_ARN"; then
  TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  ROLE_ARN="$(aws iam create-role --role-name "$ROLE_NAME" \
              --assume-role-policy-document "$TRUST" --tags "$TAG_SPEC" \
              --query 'Role.Arn' --output text)"
  log "created role $ROLE_ARN"
fi
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
ok "role ready ($ROLE_ARN)"

# ---------------------------------------------------------------------------
# 7. RDS PostgreSQL (managed master secret)
# ---------------------------------------------------------------------------
DB_ID="$NAME_PREFIX-db"
SUBNET_GROUP="$NAME_PREFIX-db"
if ! present "$(aws rds describe-db-subnet-groups --db-subnet-group-name "$SUBNET_GROUP" \
                --query 'DBSubnetGroups[0].DBSubnetGroupName' --output text 2>/dev/null || true)"; then
  # shellcheck disable=SC2086  # intentional split: pass each subnet as its own arg
  aws rds create-db-subnet-group --db-subnet-group-name "$SUBNET_GROUP" \
    --db-subnet-group-description "tk telemetry" --subnet-ids $SUBNET_IDS \
    --tags "$TAG_SPEC" >/dev/null
  log "created DB subnet group $SUBNET_GROUP"
fi

if ! present "$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" \
                --query 'DBInstances[0].DBInstanceIdentifier' --output text 2>/dev/null || true)"; then
  # Resolve the latest available Postgres 16.x in this region rather than hardcoding a minor.
  DB_ENGINE_VERSION="$(aws rds describe-db-engine-versions --engine postgres \
    --engine-version 16 --query 'DBEngineVersions[-1].EngineVersion' --output text 2>/dev/null || true)"
  present "$DB_ENGINE_VERSION" || DB_ENGINE_VERSION=16
  log "creating RDS instance $DB_ID (postgres $DB_ENGINE_VERSION; this takes several minutes)..."
  aws rds create-db-instance --db-instance-identifier "$DB_ID" \
    --engine postgres --engine-version "$DB_ENGINE_VERSION" --db-instance-class "$DB_INSTANCE_CLASS" \
    --allocated-storage 20 --storage-type gp3 --storage-encrypted \
    --db-name "$DB_NAME" --master-username "$DB_USERNAME" \
    --manage-master-user-password \
    --no-multi-az --no-publicly-accessible \
    --db-subnet-group-name "$SUBNET_GROUP" --vpc-security-group-ids "$RDS_SG" \
    --backup-retention-period 7 --deletion-protection \
    --tags "$TAG_SPEC" >/dev/null
fi
log "waiting for RDS to become available..."
aws rds wait db-instance-available --db-instance-identifier "$DB_ID"

read -r DB_HOST DB_PORT DB_SECRET_ARN < <(aws rds describe-db-instances \
  --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].[Endpoint.Address,Endpoint.Port,MasterUserSecret.SecretArn]' \
  --output text)
ok "RDS ready host=$DB_HOST secret=$DB_SECRET_ARN"

# Least-privilege read of just that secret (needs the ARN, so it's set here).
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name read-db-secret \
  --policy-document "$(jq -nc --arg arn "$DB_SECRET_ARN" \
    '{Version:"2012-10-17",Statement:[{Effect:"Allow",Action:"secretsmanager:GetSecretValue",Resource:$arn}]}')"

# ---------------------------------------------------------------------------
# 8. CloudWatch log group
# ---------------------------------------------------------------------------
LOG_GROUP="/aws/lambda/$NAME_PREFIX-ingest"
aws logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null \
  || true   # ResourceAlreadyExistsException is fine
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 30

# ---------------------------------------------------------------------------
# 9. Lambda function (create or update to the freshly-pushed image)
# ---------------------------------------------------------------------------
FN_NAME="$NAME_PREFIX-ingest"
ENV_VARS="Variables={DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_SECRET_ARN=$DB_SECRET_ARN}"
VPC_CONFIG="SubnetIds=$SUBNETS_CSV,SecurityGroupIds=$LAMBDA_SG"

if present "$(aws lambda get-function --function-name "$FN_NAME" \
              --query 'Configuration.FunctionArn' --output text 2>/dev/null || true)"; then
  log "updating existing Lambda $FN_NAME"
  aws lambda update-function-code --function-name "$FN_NAME" --image-uri "$IMAGE" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FN_NAME"
  aws lambda update-function-configuration --function-name "$FN_NAME" \
    --role "$ROLE_ARN" --timeout 10 --memory-size 256 \
    --vpc-config "$VPC_CONFIG" --environment "$ENV_VARS" >/dev/null
else
  log "creating Lambda $FN_NAME"
  # New IAM roles can take a few seconds to be assumable — retry the create.
  for attempt in 1 2 3 4 5 6; do
    if aws lambda create-function --function-name "$FN_NAME" \
        --package-type Image --code "ImageUri=$IMAGE" --role "$ROLE_ARN" \
        --timeout 10 --memory-size 256 --architectures x86_64 \
        --vpc-config "$VPC_CONFIG" --environment "$ENV_VARS" \
        --tags Project="$NAME_PREFIX" >/dev/null 2>/tmp/tk_lambda_err; then
      break
    fi
    # New IAM roles aren't immediately assumable — retry only that specific error.
    if grep -q "cannot be assumed\|InvalidParameterValueException" /tmp/tk_lambda_err \
       && [ "$attempt" -lt 6 ]; then
      warn "role not assumable yet, retry $attempt/6"; sleep 10; continue
    fi
    cat /tmp/tk_lambda_err >&2; die "create-function failed"
  done
fi
aws lambda wait function-active-v2 --function-name "$FN_NAME"
LAMBDA_ARN="$(aws lambda get-function --function-name "$FN_NAME" \
              --query 'Configuration.FunctionArn' --output text)"
ok "Lambda ready ($LAMBDA_ARN)"

# ---------------------------------------------------------------------------
# 10. Front door — private API Gateway REST (default) or internal ALB
# ---------------------------------------------------------------------------

# Front door A: private REST API + {proxy+} → Lambda.
deploy_apigw() {
  API_ID="$(aws apigateway get-rest-apis \
            --query "items[?name=='$NAME_PREFIX-api'].id | [0]" --output text)"
  if ! present "$API_ID"; then
    API_ID="$(aws apigateway create-rest-api --name "$NAME_PREFIX-api" \
              --description "token-killer telemetry ingest (private)" \
              --endpoint-configuration "types=PRIVATE,vpcEndpointIds=$EXECUTE_API_VPCE" \
              --tags "Project=$NAME_PREFIX" \
              --query id --output text)"
    log "created REST API $API_ID"
  fi

  # Resource policy: only the execute-api VPC endpoint may invoke (set every run).
  local policy
  policy="$(jq -nc --arg vpce "$EXECUTE_API_VPCE" \
    '{Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:"*",Action:"execute-api:Invoke",Resource:"execute-api:/*",Condition:{StringEquals:{"aws:sourceVpce":$vpce}}}]}')"
  aws apigateway update-rest-api --rest-api-id "$API_ID" \
    --patch-operations "$(jq -nc --arg p "$policy" '[{op:"replace",path:"/policy",value:$p}]')" >/dev/null

  local root_id proxy_id
  root_id="$(aws apigateway get-resources --rest-api-id "$API_ID" \
             --query "items[?path=='/'].id | [0]" --output text)"
  proxy_id="$(aws apigateway get-resources --rest-api-id "$API_ID" \
              --query "items[?path=='/{proxy+}'].id | [0]" --output text)"
  if ! present "$proxy_id"; then
    proxy_id="$(aws apigateway create-resource --rest-api-id "$API_ID" \
                --parent-id "$root_id" --path-part '{proxy+}' \
                --query id --output text)"
  fi

  # ANY method (idempotent: only put if absent)
  if ! aws apigateway get-method --rest-api-id "$API_ID" --resource-id "$proxy_id" \
         --http-method ANY >/dev/null 2>&1; then
    aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$proxy_id" \
      --http-method ANY --authorization-type NONE >/dev/null
  fi

  # AWS_PROXY integration to the Lambda (put overwrites — safe to repeat)
  aws apigateway put-integration --rest-api-id "$API_ID" --resource-id "$proxy_id" \
    --http-method ANY --type AWS_PROXY --integration-http-method POST \
    --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" >/dev/null

  # Allow API Gateway to invoke the function (tolerate the already-exists conflict)
  aws lambda add-permission --function-name "$FN_NAME" --statement-id apigw-invoke \
    --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*" >/dev/null 2>&1 || true

  # Deploy to the `prod` stage (creates the stage on first run, redeploys after)
  aws apigateway create-deployment --rest-api-id "$API_ID" --stage-name prod >/dev/null
  ok "API deployed (id=$API_ID)"

  ENDPOINT="https://$API_ID.execute-api.$REGION.amazonaws.com/prod/v1/telemetry"
  FRONTDOOR_NOTE=" The endpoint resolves to private IPs inside $VPC_ID via the execute-api
 VPC endpoint — reachable only from the corp network / VPN, never the public net."
}

# Front door B: internal Application Load Balancer → Lambda target group.
deploy_alb() {
  local alb_sg alb_arn alb_dns tg_arn listener
  alb_sg="$(ensure_sg "$NAME_PREFIX-alb" "tk telemetry internal ALB")"
  authorize "$alb_sg" --protocol tcp --port "$LISTENER_PORT" --cidr "$CLIENT_CIDR"

  alb_arn="$(aws elbv2 describe-load-balancers --names "$NAME_PREFIX-alb" \
             --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)"
  if ! present "$alb_arn"; then
    # shellcheck disable=SC2086  # intentional split: pass each subnet as its own arg
    alb_arn="$(aws elbv2 create-load-balancer --name "$NAME_PREFIX-alb" \
               --type application --scheme internal \
               --subnets $ALB_SUBNET_IDS --security-groups "$alb_sg" \
               --tags "$TAG_SPEC" \
               --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
    log "created internal ALB $alb_arn"
  fi

  tg_arn="$(aws elbv2 describe-target-groups --names "$NAME_PREFIX-tg" \
            --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)"
  if ! present "$tg_arn"; then
    tg_arn="$(aws elbv2 create-target-group --name "$NAME_PREFIX-tg" \
              --target-type lambda \
              --query 'TargetGroups[0].TargetGroupArn' --output text)"
    log "created lambda target group $tg_arn"
  fi

  # ELB must be allowed to invoke the Lambda before it can be registered.
  aws lambda add-permission --function-name "$FN_NAME" --statement-id alb-invoke \
    --action lambda:InvokeFunction --principal elasticloadbalancing.amazonaws.com \
    --source-arn "$tg_arn" >/dev/null 2>&1 || true
  aws elbv2 register-targets --target-group-arn "$tg_arn" --targets Id="$LAMBDA_ARN" >/dev/null

  # HTTPS listener (the tk client only speaks HTTPS) — needs the ACM cert.
  listener="$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" \
              --query 'Listeners[].[Port,ListenerArn]' --output text 2>/dev/null \
              | awk -v p="$LISTENER_PORT" '$1==p{print $2; exit}')"
  if ! present "$listener"; then
    aws elbv2 create-listener --load-balancer-arn "$alb_arn" \
      --protocol HTTPS --port "$LISTENER_PORT" \
      --certificates "CertificateArn=$CERT_ARN" \
      --default-actions "Type=forward,TargetGroupArn=$tg_arn" >/dev/null
    log "created HTTPS:$LISTENER_PORT listener"
  fi

  log "waiting for ALB to become active..."
  aws elbv2 wait load-balancer-available --load-balancer-arns "$alb_arn"
  alb_dns="$(aws elbv2 describe-load-balancers --load-balancer-arns "$alb_arn" \
             --query 'LoadBalancers[0].DNSName' --output text)"
  ok "internal ALB ready (dns=$alb_dns)"

  # The client must hit a DNS name that matches the cert. Point your cert's domain
  # at the ALB via a Route53 (private hosted zone) alias/CNAME record.
  ENDPOINT="https://<cert-domain>/v1/telemetry   (Route53-alias the cert domain to the ALB)"
  FRONTDOOR_NOTE=" Internal ALB DNS: $alb_dns:$LISTENER_PORT
 Create a Route53 (private zone) alias/CNAME from your cert's domain to that DNS,
 then bake https://<cert-domain>/v1/telemetry as TK_TELEMETRY_ENDPOINT.
 The ALB is internal — reachable only from the corp network / VPN."
}

if [ "$INGRESS" = "alb" ]; then deploy_alb; else deploy_apigw; fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
cat >&2 <<EOF

============================================================================
 Deploy complete (ingress=$INGRESS).

   Telemetry endpoint (bake into the CLI as TK_TELEMETRY_ENDPOINT):
     $ENDPOINT

   Grafana PostgreSQL data source:
     host   = $DB_HOST:$DB_PORT   db = $DB_NAME
     creds  = Secrets Manager $DB_SECRET_ARN

$FRONTDOOR_NOTE
============================================================================
EOF
