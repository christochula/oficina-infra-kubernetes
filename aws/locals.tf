locals {
  name         = "${var.project_name}-${var.environment}"
  cluster_name = "${local.name}-eks"

  account_id = data.aws_caller_identity.current.account_id

  lab_role_arn  = var.lab_role_arn != "" ? var.lab_role_arn : "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:role/LabRole"
  principal_arn = var.principal_arn != "" ? var.principal_arn : "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:role/voclabs"

  common_tags = merge({
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Repository  = "oficina-infra-kubernetes"
  }, var.tags)
}
