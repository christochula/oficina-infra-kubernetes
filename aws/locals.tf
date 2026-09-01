locals {
  name         = "${var.project_name}-${var.environment}"
  cluster_name = "${local.name}-eks"

  availability_zones = length(var.availability_zones) > 0 ? var.availability_zones : slice(
    data.aws_availability_zones.available.names,
    0,
    var.az_count
  )

  private_subnets = length(var.private_subnet_cidrs) > 0 ? var.private_subnet_cidrs : [
    for index, _ in local.availability_zones : cidrsubnet(var.vpc_cidr, 4, index)
  ]
  public_subnets = length(var.public_subnet_cidrs) > 0 ? var.public_subnet_cidrs : [
    for index, _ in local.availability_zones : cidrsubnet(var.vpc_cidr, 4, index + 8)
  ]

  common_tags = merge({
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Repository  = "oficina-infra-kubernetes"
  }, var.tags)

  cluster_admin_access_entries = {
    for index, role_arn in var.cluster_admin_role_arns : "cluster-admin-${index}" => {
      principal_arn = role_arn
      policy_associations = {
        cluster_admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }

  managed_node_groups = {
    for group_name, group in var.managed_node_groups : group_name => merge({
      ami_type                       = "AL2023_x86_64_STANDARD"
      use_latest_ami_release_version = true
      vpc_security_group_ids         = [aws_security_group.workload_client.id]
      update_config = {
        max_unavailable_percentage = 33
      }
      node_repair_config = {
        enabled = true
      }
      tags = {
        "k8s.io/cluster-autoscaler/enabled"               = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
      }
      }, group, {
      vpc_security_group_ids = distinct(concat(
        try(group.vpc_security_group_ids, []),
        [aws_security_group.workload_client.id]
      ))
      tags = merge({
        "k8s.io/cluster-autoscaler/enabled"               = "true"
        "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
      }, try(group.tags, {}))
    })
  }

  alb_ingress_cidrs = var.alb_ingress_cidrs
  listener_protocol = var.alb_certificate_arn == null ? "HTTP" : "HTTPS"
  listener_port     = var.alb_certificate_arn == null ? 80 : 443
}
