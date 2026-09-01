resource "aws_security_group" "workload_client" {
  name_prefix = "${local.name}-workload-client-"
  description = "Identity SG attached to EKS worker nodes; reference it from database ingress rules."
  vpc_id      = module.vpc.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.name}-workload-client"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "workload_client_ipv4" {
  security_group_id = aws_security_group.workload_client.id
  description       = "Allow workload egress; restrict at destination security groups and network controls."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "internal_alb" {
  name_prefix = "${local.name}-internal-alb-"
  description = "Ingress boundary for the internal Oficina API ALB."
  vpc_id      = module.vpc.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.name}-internal-alb"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "internal_alb" {
  for_each = toset(local.alb_ingress_cidrs)

  security_group_id = aws_security_group.internal_alb.id
  description       = "Internal API listener from an explicitly approved CIDR."
  ip_protocol       = "tcp"
  from_port         = local.listener_port
  to_port           = local.listener_port
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "internal_alb_to_workloads" {
  security_group_id            = aws_security_group.internal_alb.id
  description                  = "Forward traffic only to workload nodes/pods on the API port."
  ip_protocol                  = "tcp"
  from_port                    = var.application_port
  to_port                      = var.application_port
  referenced_security_group_id = aws_security_group.workload_client.id
}

resource "aws_vpc_security_group_ingress_rule" "workload_from_internal_alb" {
  security_group_id            = aws_security_group.workload_client.id
  description                  = "API traffic from the internal ALB."
  ip_protocol                  = "tcp"
  from_port                    = var.application_port
  to_port                      = var.application_port
  referenced_security_group_id = aws_security_group.internal_alb.id
}

resource "aws_vpc_security_group_ingress_rule" "eks_nodes_from_internal_alb" {
  security_group_id            = module.eks.node_security_group_id
  description                  = "API traffic from the internal ALB to pod IP targets using the node SG."
  ip_protocol                  = "tcp"
  from_port                    = var.application_port
  to_port                      = var.application_port
  referenced_security_group_id = aws_security_group.internal_alb.id
}
