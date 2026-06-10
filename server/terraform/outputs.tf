# The URL to bake into the CLI at build time (TK_TELEMETRY_ENDPOINT).
# apigw: resolves to private IPs via the execute-api endpoint's private DNS.
# alb:   Route53-alias your cert's domain to alb_dns_name, then use that domain.
output "telemetry_endpoint_url" {
  description = "POST target for the tk client (build-time TK_TELEMETRY_ENDPOINT)."
  value = local.use_apigw ? (
    "https://${aws_api_gateway_rest_api.this[0].id}.execute-api.${data.aws_region.current.name}.amazonaws.com/${aws_api_gateway_stage.prod[0].stage_name}/v1/telemetry"
  ) : "https://<cert-domain>/v1/telemetry  (Route53-alias the cert domain to alb_dns_name)"
}

output "alb_dns_name" {
  description = "Internal ALB DNS name (ingress = alb); point your cert's Route53 record here."
  value       = local.use_alb ? aws_lb.this[0].dns_name : null
}

output "ecr_repository_url" {
  description = "Push the Lambda image here; feed the tag/digest back as lambda_image_uri."
  value       = aws_ecr_repository.app.repository_url
}

output "rds_endpoint" {
  description = "Postgres host:port for the Grafana data source."
  value       = "${aws_db_instance.this.address}:${aws_db_instance.this.port}"
}

output "rds_secret_arn" {
  description = "Secrets Manager ARN holding the DB master username/password."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "lambda_function_name" {
  value = aws_lambda_function.ingest.function_name
}
