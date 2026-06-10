# ECR repo for the Lambda container image. The pipeline builds server/app/Dockerfile
# and pushes here; var.lambda_image_uri then points at the pushed tag/digest.
#
# First-run ordering: apply with -target=aws_ecr_repository.app (and the IAM/RDS
# resources), build+push the image, set lambda_image_uri, then apply the rest.
resource "aws_ecr_repository" "app" {
  name                 = "${var.name_prefix}-ingest"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
