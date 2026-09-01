module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "21.25.0"

  name               = local.cluster_name
  kubernetes_version = var.kubernetes_version

  # EKS Auto Mode is intentionally disabled: this repository manages node groups and addons explicitly.
  compute_config = {
    enabled = false
  }

  endpoint_private_access                  = true
  endpoint_public_access                   = var.cluster_endpoint_public_access
  endpoint_public_access_cidrs             = var.cluster_endpoint_public_access_cidrs
  deletion_protection                      = var.cluster_deletion_protection
  authentication_mode                      = "API_AND_CONFIG_MAP"
  enable_cluster_creator_admin_permissions = var.enable_cluster_creator_admin_permissions

  access_entries = local.cluster_admin_access_entries

  enabled_log_types                      = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cloudwatch_log_group_retention_in_days = var.cloudwatch_log_retention_days

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  enable_irsa = true

  addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      before_compute = true
      most_recent    = true
    }
  }

  eks_managed_node_groups = local.managed_node_groups

  create_kms_key = true
  encryption_config = {
    resources = ["secrets"]
  }

  tags = local.common_tags
}
