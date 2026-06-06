resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db"
  subnet_ids = var.private_subnet_ids
}

# Single small Postgres instance. Single-AZ is acceptable: the data is loss-
# tolerant (the client resends cumulative totals every 23h, so a brief outage or
# a lost beacon self-heals on the next window).
resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  # Password is generated and rotated by RDS into Secrets Manager; the Lambda
  # reads it via DB_SECRET_ARN. No plaintext password in Terraform state.
  manage_master_user_password = true

  multi_az               = false
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period   = var.db_backup_retention_days
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name_prefix}-db-final"

  apply_immediately = true
}
