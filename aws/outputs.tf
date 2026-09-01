output "vpc_id" {
  description = "VPC ID shared with database and workload stacks."
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "VPC CIDR used by private service ingress rules."
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "Private subnet IDs for EKS, databases and internal endpoints."
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "Public subnet IDs used by NAT gateways."
  value       = module.vpc.public_subnets
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS Kubernetes API endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64 EKS CA data consumed by the platform stack."
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "cluster_version" {
  description = "Configured EKS Kubernetes version."
  value       = module.eks.cluster_version
}

output "cluster_oidc_provider_arn" {
  description = "OIDC provider ARN used by IRSA roles."
  value       = module.eks.oidc_provider_arn
}

output "cluster_oidc_provider" {
  description = "OIDC provider URL without scheme, used by IAM modules."
  value       = module.eks.oidc_provider
}

output "cluster_node_security_group_id" {
  description = "EKS managed node security group ID."
  value       = module.eks.node_security_group_id
}

output "workload_client_security_group_id" {
  description = "Stable client SG contract: database stacks should allow this SG on their service port."
  value       = aws_security_group.workload_client.id
}

output "managed_node_group_autoscaling_group_names" {
  description = "ASG names discovered and managed by Cluster Autoscaler."
  value       = flatten([for group in module.eks.eks_managed_node_groups : group.node_group_autoscaling_group_names])
}

output "ecr_repository_arn" {
  description = "Application ECR repository ARN."
  value       = aws_ecr_repository.application.arn
}

output "ecr_repository_url" {
  description = "Application ECR repository URL."
  value       = aws_ecr_repository.application.repository_url
}

output "internal_alb_arn" {
  description = "Internal application ALB ARN."
  value       = aws_lb.application.arn
}

output "internal_alb_dns_name" {
  description = "Internal application ALB DNS name."
  value       = aws_lb.application.dns_name
}

output "internal_alb_security_group_id" {
  description = "Internal ALB security group ID."
  value       = aws_security_group.internal_alb.id
}

output "internal_alb_listener_arn" {
  description = "Listener ARN for API routing integrations."
  value       = aws_lb_listener.application.arn
}

output "backend_listener_arn" {
  description = "Compatibility alias for auth consumers: internal ALB listener ARN used by the API Gateway private integration."
  value       = aws_lb_listener.application.arn
}

output "vpc_link_security_group_ids" {
  description = "Dedicated SG attached only to API Gateway VPC Link ENIs and allowed into the internal ALB."
  value       = [aws_security_group.vpc_link.id]
}

output "lambda_security_group_ids" {
  description = "Dedicated client SG for VPC-enabled Lambda functions; it is not accepted by the internal ALB."
  value       = [aws_security_group.lambda_client.id]
}

output "application_target_group_arn" {
  description = "IP target group ARN referenced by the app TargetGroupBinding."
  value       = aws_lb_target_group.application.arn
}

output "application_target_group_name" {
  description = "IP target group name."
  value       = aws_lb_target_group.application.name
}

output "private_integration_contract" {
  description = "Single output contract for API Gateway VPC Link and Kubernetes TargetGroupBinding consumers."
  value = {
    vpc_id                            = module.vpc.vpc_id
    private_subnet_ids                = module.vpc.private_subnets
    listener_arn                      = aws_lb_listener.application.arn
    target_group_arn                  = aws_lb_target_group.application.arn
    target_type                       = aws_lb_target_group.application.target_type
    alb_security_group_id             = aws_security_group.internal_alb.id
    workload_client_security_group_id = aws_security_group.workload_client.id
    vpc_link_security_group_id        = aws_security_group.vpc_link.id
    lambda_client_security_group_id   = aws_security_group.lambda_client.id
  }
}
