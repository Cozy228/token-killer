resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name_prefix}-ingest"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "ingest" {
  function_name = "${var.name_prefix}-ingest"
  role          = aws_iam_role.lambda.arn

  package_type = "Image"
  image_uri    = var.lambda_image_uri

  memory_size = var.lambda_memory_mb
  timeout     = var.lambda_timeout_s

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DB_HOST       = aws_db_instance.this.address
      DB_PORT       = tostring(aws_db_instance.this.port)
      DB_NAME       = var.db_name
      DB_SECRET_ARN = aws_db_instance.this.master_user_secret[0].secret_arn
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_vpc,
    aws_cloudwatch_log_group.lambda,
  ]
}
