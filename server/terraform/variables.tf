variable "aws_region" {
  type        = string
  description = "AWS region to deploy into."
}

variable "name_prefix" {
  type        = string
  description = "Prefix for all resource names."
  default     = "tk-telemetry"
}

# --- Existing network (this stack does NOT create a VPC) ---

variable "vpc_id" {
  type        = string
  description = "ID of the existing corp VPC to deploy into."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the Lambda ENIs, RDS, and VPC endpoints (>= 2 AZs)."
}

variable "client_cidr_blocks" {
  type        = list(string)
  description = "CIDR ranges of developer machines / corp network allowed to reach the private API (port 443 on the execute-api VPC endpoint)."
}

variable "ingress" {
  type        = string
  description = "Front door: \"apigw\" (private API Gateway REST, default) or \"alb\" (internal ALB)."
  default     = "apigw"
  validation {
    condition     = contains(["apigw", "alb"], var.ingress)
    error_message = "ingress must be \"apigw\" or \"alb\"."
  }
}

variable "alb_certificate_arn" {
  type        = string
  description = "ACM cert ARN for the internal ALB's HTTPS listener (required when ingress = alb; the tk client only speaks HTTPS)."
  default     = ""
}

variable "alb_min_free_ips" {
  type        = number
  description = "Minimum free IPs required per ALB subnet (AWS minimum is 8). Enforced by a precondition when ingress = alb."
  default     = 8
}

variable "alb_listener_port" {
  type        = number
  description = "HTTPS listener port for the internal ALB."
  default     = 443
}

variable "create_interface_endpoints" {
  type        = bool
  description = "Create secretsmanager + logs interface endpoints. Set false if the VPC already provides egress (NAT) or shared endpoints to those services."
  default     = true
}

# --- Compute ---

variable "lambda_image_uri" {
  type        = string
  description = "ECR image URI (repo:tag or repo@digest) for the ingest Lambda, built+pushed by the pipeline. Leave empty on the very first apply that only creates the ECR repo."
  default     = ""
}

variable "lambda_memory_mb" {
  type    = number
  default = 256
}

variable "lambda_timeout_s" {
  type    = number
  default = 10
}

variable "export_token" {
  type        = string
  description = "Bearer token required for GET /v1/export. Leave empty to disable exports."
  default     = ""
  sensitive   = true
}

# --- Database ---

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "telemetry"
}

variable "db_username" {
  type    = string
  default = "tk_ingest"
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "tags" {
  type = map(string)
  default = {
    Project = "token-killer-telemetry"
  }
}
