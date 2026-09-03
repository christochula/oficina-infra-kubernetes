output "aws_region" {
  description = "Regiao AWS."
  value       = var.aws_region
}

output "account_id" {
  description = "ID da conta AWS."
  value       = local.account_id
}

output "vpc_id" {
  description = "VPC (default) compartilhada com o stack de banco."
  value       = data.aws_vpc.default.id
}

output "vpc_cidr_block" {
  description = "CIDR da VPC — usado pelo stack de banco para liberar ingress do RDS."
  value       = data.aws_vpc.default.cidr_block
}

output "subnet_ids" {
  description = "Subnets usadas pelo EKS (default VPC, sem a AZ us-east-1e)."
  value       = local.eks_subnet_ids
}

output "cluster_name" {
  description = "Nome do cluster EKS."
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "Endpoint da API do EKS."
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_version" {
  description = "Versao do Kubernetes."
  value       = aws_eks_cluster.this.version
}

output "cluster_security_group_id" {
  description = "SG gerenciado pelo EKS (control plane <-> nodes). O stack de banco pode liberar ingress do RDS a partir dele."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "ecr_repository_url" {
  description = "URL do repositorio ECR da aplicacao."
  value       = aws_ecr_repository.application.repository_url
}

output "ecr_repository_arn" {
  description = "ARN do repositorio ECR da aplicacao."
  value       = aws_ecr_repository.application.arn
}
