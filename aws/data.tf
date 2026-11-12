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

# EKS restringe IDs fisicos de AZ, nao letras que podem mudar entre contas.
# https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html
data "aws_subnet" "each" {
  for_each = toset(data.aws_subnets.default.ids)
  id       = each.value
}

locals {
  eks_disallowed_az_ids = ["use1-az3", "usw1-az2", "cac1-az3"]
  eks_subnet_ids = [
    for s in data.aws_subnet.each : s.id
    if !contains(local.eks_disallowed_az_ids, s.availability_zone_id)
  ]
}
