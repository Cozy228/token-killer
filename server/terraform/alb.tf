# Internal ALB front door (ingress = "alb"). The tk client only speaks HTTPS, so
# the 443 listener needs an ACM cert (var.alb_certificate_arn). API Gateway gets
# AWS-managed TLS for free — that's why apigw is the default.

# Per-subnet detail so we can enforce AZ coverage + free-IP minimums before the
# ALB is created (the Terraform equivalent of the deploy script's ALB precheck).
data "aws_subnet" "alb" {
  for_each = local.use_alb ? toset(var.private_subnet_ids) : []
  id       = each.value
}

resource "aws_security_group" "alb" {
  count       = local.use_alb ? 1 : 0
  name_prefix = "${var.name_prefix}-alb-"
  description = "tk telemetry internal ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from corp clients"
    from_port   = var.alb_listener_port
    to_port     = var.alb_listener_port
    protocol    = "tcp"
    cidr_blocks = var.client_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_lb" "this" {
  count              = local.use_alb ? 1 : 0
  name               = "${var.name_prefix}-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = var.private_subnet_ids

  lifecycle {
    precondition {
      condition     = var.alb_certificate_arn != ""
      error_message = "ingress = alb requires alb_certificate_arn (ACM cert for the HTTPS listener)."
    }
    precondition {
      condition     = length(distinct([for s in data.aws_subnet.alb : s.availability_zone])) >= 2
      error_message = "ALB needs subnets in >= 2 availability zones."
    }
    precondition {
      condition = alltrue([
        for s in data.aws_subnet.alb : s.available_ip_address_count >= var.alb_min_free_ips
      ])
      error_message = "Every ALB subnet needs >= ${var.alb_min_free_ips} free IPs (see available_ip_address_count per subnet)."
    }
  }
}

# Lambda target group: no port/protocol/vpc for target_type = lambda.
resource "aws_lb_target_group" "lambda" {
  count       = local.use_alb ? 1 : 0
  name        = "${var.name_prefix}-tg"
  target_type = "lambda"
}

resource "aws_lambda_permission" "alb" {
  count         = local.use_alb ? 1 : 0
  statement_id  = "AllowALBInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.lambda[0].arn
}

resource "aws_lb_target_group_attachment" "lambda" {
  count            = local.use_alb ? 1 : 0
  target_group_arn = aws_lb_target_group.lambda[0].arn
  target_id        = aws_lambda_function.ingest.arn
  depends_on       = [aws_lambda_permission.alb]
}

resource "aws_lb_listener" "https" {
  count             = local.use_alb ? 1 : 0
  load_balancer_arn = aws_lb.this[0].arn
  port              = var.alb_listener_port
  protocol          = "HTTPS"
  certificate_arn   = var.alb_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.lambda[0].arn
  }
}
