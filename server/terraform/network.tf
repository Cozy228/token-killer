data "aws_region" "current" {}

# --- Security groups ---

# Lambda ENIs. Egress is open so the function can reach RDS, Secrets Manager,
# and CloudWatch Logs (whether via the interface endpoints below or existing NAT).
resource "aws_security_group" "lambda" {
  name_prefix = "${var.name_prefix}-lambda-"
  description = "tk telemetry ingest Lambda"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle { create_before_destroy = true }
}

# RDS: only the Lambda may reach Postgres.
resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-rds-"
  description = "tk telemetry Postgres"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Postgres from ingest Lambda"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  lifecycle { create_before_destroy = true }
}

# VPC endpoints (execute-api, and optionally secretsmanager/logs).
resource "aws_security_group" "vpce" {
  name_prefix = "${var.name_prefix}-vpce-"
  description = "tk telemetry interface VPC endpoints"
  vpc_id      = var.vpc_id

  # The private REST API is reached by developer machines over the corp network.
  ingress {
    description = "HTTPS from corp clients to the private API"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.client_cidr_blocks
  }

  # The Lambda reaches secretsmanager/logs endpoints from inside the VPC.
  ingress {
    description     = "HTTPS from ingest Lambda"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
  }

  lifecycle { create_before_destroy = true }
}

# --- VPC endpoints ---

# Makes the private REST API reachable in-VPC (apigw mode only). With private DNS
# on, the standard execute-api.<region>.amazonaws.com hostname resolves to private IPs.
resource "aws_vpc_endpoint" "execute_api" {
  count               = local.use_apigw ? 1 : 0
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.execute-api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true
}

# Optional: only needed if the private subnets have no other path to these AWS
# services. Toggle off with create_interface_endpoints = false if NAT/shared
# endpoints already exist.
resource "aws_vpc_endpoint" "secretsmanager" {
  count               = var.create_interface_endpoints ? 1 : 0
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true
}

resource "aws_vpc_endpoint" "logs" {
  count               = var.create_interface_endpoints ? 1 : 0
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true
}
