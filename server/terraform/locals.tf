locals {
  use_apigw = var.ingress == "apigw"
  use_alb   = var.ingress == "alb"
}
