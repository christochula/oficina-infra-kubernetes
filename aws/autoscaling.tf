# EKS managed-node-group tags do not reliably propagate to the backing ASG.
# Tag the concrete ASGs so Cluster Autoscaler's AWS auto-discovery can find them.
resource "aws_autoscaling_group_tag" "cluster_autoscaler_enabled" {
  for_each = var.managed_node_groups

  autoscaling_group_name = one(module.eks.eks_managed_node_groups[each.key].node_group_autoscaling_group_names)

  tag {
    key                 = "k8s.io/cluster-autoscaler/enabled"
    value               = "true"
    propagate_at_launch = false
  }
}

resource "aws_autoscaling_group_tag" "cluster_autoscaler_cluster" {
  for_each = var.managed_node_groups

  autoscaling_group_name = one(module.eks.eks_managed_node_groups[each.key].node_group_autoscaling_group_names)

  tag {
    key                 = "k8s.io/cluster-autoscaler/${local.cluster_name}"
    value               = "owned"
    propagate_at_launch = false
  }
}
