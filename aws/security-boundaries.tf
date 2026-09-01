resource "aws_security_group" "vpc_link" {
  name_prefix = "${local.name}-vpc-link-"
  description = "Identity SG dedicated to API Gateway VPC Link ENIs."
  vpc_id      = module.vpc.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.name}-vpc-link"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "vpc_link_to_internal_alb" {
  security_group_id            = aws_security_group.vpc_link.id
  referenced_security_group_id = aws_security_group.internal_alb.id
  description                  = "VPC Link to the internal API listener only."
  ip_protocol                  = "tcp"
  from_port                    = local.listener_port
  to_port                      = local.listener_port
}

resource "aws_vpc_security_group_ingress_rule" "internal_alb_from_vpc_link" {
  security_group_id            = aws_security_group.internal_alb.id
  referenced_security_group_id = aws_security_group.vpc_link.id
  description                  = "Internal API listener only from API Gateway VPC Link."
  ip_protocol                  = "tcp"
  from_port                    = local.listener_port
  to_port                      = local.listener_port
}

resource "aws_security_group" "lambda_client" {
  name_prefix = "${local.name}-lambda-client-"
  description = "Identity SG for VPC-enabled serverless functions."
  vpc_id      = module.vpc.vpc_id

  tags = merge(local.common_tags, {
    Name = "${local.name}-lambda-client"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "lambda_client_ipv4" {
  security_group_id = aws_security_group.lambda_client.id
  description       = "Lambda egress; destination SGs and IAM restrict service access."
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
