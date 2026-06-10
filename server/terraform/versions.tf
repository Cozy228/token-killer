terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend is intentionally left to Terraform Enterprise (workspace-configured).
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}
