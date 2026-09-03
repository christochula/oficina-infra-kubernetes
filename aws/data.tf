data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

# --- Rede: usa a VPC default do AWS Academy -----------------------------------
# O Learner Lab nao permite criar VPC Flow Log role; criar NAT tem custo alto.
# A VPC default ja tem Internet Gateway e uma subnet publica por AZ.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# EKS nao suporta a AZ us-east-1e. Filtra qualquer subnet nela.
data "aws_subnet" "each" {
  for_each = toset(data.aws_subnets.default.ids)
  id       = each.value
}

locals {
  eks_subnet_ids = [
    for s in data.aws_subnet.each : s.id
    if s.availability_zone != "${var.aws_region}e"
  ]
}
