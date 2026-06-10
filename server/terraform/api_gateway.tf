# PRIVATE REST API (ingress = "apigw"). Reachable only through the execute-api
# VPC endpoint; the resource policy below denies anything not arriving via it.
resource "aws_api_gateway_rest_api" "this" {
  count       = local.use_apigw ? 1 : 0
  name        = "${var.name_prefix}-api"
  description = "token-killer telemetry ingest (private)"

  endpoint_configuration {
    types            = ["PRIVATE"]
    vpc_endpoint_ids = [aws_vpc_endpoint.execute_api[0].id]
  }
}

data "aws_iam_policy_document" "api_resource_policy" {
  count = local.use_apigw ? 1 : 0
  statement {
    effect    = "Allow"
    actions   = ["execute-api:Invoke"]
    resources = ["execute-api:/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:sourceVpce"
      values   = [aws_vpc_endpoint.execute_api[0].id]
    }
  }
}

resource "aws_api_gateway_rest_api_policy" "this" {
  count       = local.use_apigw ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this[0].id
  policy      = data.aws_iam_policy_document.api_resource_policy[0].json
}

# Greedy proxy: every path/method goes to Lambda; Hono does the routing
# (/health, /v1/telemetry).
resource "aws_api_gateway_resource" "proxy" {
  count       = local.use_apigw ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this[0].id
  parent_id   = aws_api_gateway_rest_api.this[0].root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy_any" {
  count         = local.use_apigw ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this[0].id
  resource_id   = aws_api_gateway_resource.proxy[0].id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "proxy_lambda" {
  count                   = local.use_apigw ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.this[0].id
  resource_id             = aws_api_gateway_resource.proxy[0].id
  http_method             = aws_api_gateway_method.proxy_any[0].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.ingest.invoke_arn
}

resource "aws_lambda_permission" "apigw" {
  count         = local.use_apigw ? 1 : 0
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this[0].execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "this" {
  count       = local.use_apigw ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.this[0].id

  triggers = {
    redeploy = sha1(jsonencode([
      aws_api_gateway_resource.proxy[0].id,
      aws_api_gateway_method.proxy_any[0].id,
      aws_api_gateway_integration.proxy_lambda[0].id,
      aws_api_gateway_rest_api_policy.this[0].policy,
    ]))
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_api_gateway_stage" "prod" {
  count         = local.use_apigw ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.this[0].id
  deployment_id = aws_api_gateway_deployment.this[0].id
  stage_name    = "prod"
}
