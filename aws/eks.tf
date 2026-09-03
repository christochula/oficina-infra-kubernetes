# EKS "cru" (sem terraform-aws-modules/eks) porque o modulo faz lookups de IAM
# (iam:GetRole em voclabs) e cria KMS/roles bloqueados no AWS Academy.
# Padrao: role do cluster e dos nodes = LabRole; admin do cluster = voclabs.

resource "aws_eks_cluster" "this" {
  name    = local.cluster_name
  version = var.kubernetes_version

  role_arn = local.lab_role_arn

  access_config {
    authentication_mode = "API"
  }

  vpc_config {
    subnet_ids              = local.eks_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  # Sem encryption_config (KMS CMK) — CreateKey/PutKeyPolicy nao confiaveis no lab.

  tags = local.common_tags
}

resource "aws_eks_access_entry" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = local.principal_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = local.principal_arn
  policy_arn    = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admin]
}

resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${local.name}-ng"
  node_role_arn   = local.lab_role_arn
  subnet_ids      = local.eks_subnet_ids

  ami_type       = "AL2023_x86_64_STANDARD"
  instance_types = [var.instance_type]
  disk_size      = var.node_disk_size

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable = 1
  }

  # Node scaling e feito ajustando desired_size (sem Cluster Autoscaler no lab).
  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }

  tags = local.common_tags

  depends_on = [aws_eks_access_policy_association.admin]
}

# Add-ons gerenciados. vpc-cni/kube-proxy/coredns usam a role do cluster (LabRole).
resource "aws_eks_addon" "vpc_cni" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "vpc-cni"
  addon_version = data.aws_eks_addon_version.vpc_cni.version

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "kube-proxy"
  addon_version = data.aws_eks_addon_version.kube_proxy.version

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.this]
}

resource "aws_eks_addon" "coredns" {
  cluster_name  = aws_eks_cluster.this.name
  addon_name    = "coredns"
  addon_version = data.aws_eks_addon_version.coredns.version

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.this]
}

data "aws_eks_addon_version" "vpc_cni" {
  addon_name         = "vpc-cni"
  kubernetes_version = aws_eks_cluster.this.version
  most_recent        = true
}

data "aws_eks_addon_version" "kube_proxy" {
  addon_name         = "kube-proxy"
  kubernetes_version = aws_eks_cluster.this.version
  most_recent        = true
}

data "aws_eks_addon_version" "coredns" {
  addon_name         = "coredns"
  kubernetes_version = aws_eks_cluster.this.version
  most_recent        = true
}
