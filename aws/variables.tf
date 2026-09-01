variable "project_name" {
  description = "Short project identifier used in resource names."
  type        = string
  default     = "oficina"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project_name))
    error_message = "project_name must be 2-21 lowercase letters, numbers or hyphens."
  }
}

variable "environment" {
  description = "Canonical deployment environment: dev, homolog or production."
  type        = string

  validation {
    condition     = contains(["dev", "homolog", "production"], var.environment)
    error_message = "environment must be dev, homolog or production."
  }
}

variable "aws_region" {
  description = "AWS region in which the platform is created."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "IPv4 CIDR for the VPC."
  type        = string
  default     = "10.20.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR."
  }
}

variable "az_count" {
  description = "Number of Availability Zones when availability_zones is empty."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "availability_zones" {
  description = "Optional explicit Availability Zones. Leave empty for automatic selection."
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "Optional private subnet CIDRs. Must have one entry per selected AZ."
  type        = list(string)
  default     = []
}

variable "public_subnet_cidrs" {
  description = "Optional public subnet CIDRs. Must have one entry per selected AZ."
  type        = list(string)
  default     = []
}

variable "nat_gateway_mode" {
  description = "NAT topology: none, single (cost optimized) or per_az (resilient)."
  type        = string
  default     = "single"

  validation {
    condition     = contains(["none", "single", "per_az"], var.nat_gateway_mode)
    error_message = "nat_gateway_mode must be none, single or per_az."
  }
}

variable "kubernetes_version" {
  description = "EKS Kubernetes minor. Keep aligned with the Cluster Autoscaler version in the platform stack."
  type        = string
  default     = "1.35"

  validation {
    condition     = can(regex("^1\\.[0-9]+$", var.kubernetes_version))
    error_message = "kubernetes_version must be a minor such as 1.35."
  }
}

variable "cluster_endpoint_public_access" {
  description = "Expose the EKS API publicly. Prefer false with a private/self-hosted CI runner."
  type        = bool
  default     = false
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API when enabled."
  type        = list(string)
  default     = []
}

variable "enable_cluster_creator_admin_permissions" {
  description = "Grant the Terraform caller temporary cluster-admin access via an EKS access entry."
  type        = bool
  default     = true
}

variable "cluster_admin_role_arns" {
  description = "IAM role ARNs that receive the AmazonEKSClusterAdminPolicy access policy."
  type        = list(string)
  default     = []
}

variable "managed_node_groups" {
  description = "Managed node group definitions. min/max/desired sizes drive Cluster Autoscaler boundaries."
  type        = map(any)
  default = {
    general = {
      instance_types = ["m7i.large"]
      capacity_type  = "ON_DEMAND"
      min_size       = 2
      max_size       = 6
      desired_size   = 2
      disk_size      = 50
      labels = {
        workload = "general"
      }
    }
  }
}

variable "ecr_image_tag_mutability" {
  description = "ECR tag mutability. IMMUTABLE is recommended outside development."
  type        = string
  default     = "IMMUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.ecr_image_tag_mutability)
    error_message = "ecr_image_tag_mutability must be MUTABLE or IMMUTABLE."
  }
}

variable "ecr_force_delete" {
  description = "Allow deletion of a non-empty ECR repository. Keep false in production."
  type        = bool
  default     = false
}

variable "ecr_untagged_retention_days" {
  description = "Days before untagged ECR images expire."
  type        = number
  default     = 14
}

variable "application_port" {
  description = "API container and target group port."
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "Readiness path used by the internal ALB target group."
  type        = string
  default     = "/api/health/ready"
}

variable "alb_ingress_cidrs" {
  description = "Optional break-glass CIDRs for the internal ALB. Empty permits only the dedicated VPC Link SG."
  type        = list(string)
  default     = []
}

variable "alb_certificate_arn" {
  description = "Optional ACM certificate ARN. When set, the listener uses HTTPS; otherwise HTTP."
  type        = string
  default     = null
  nullable    = true
}

variable "alb_ssl_policy" {
  description = "TLS policy for the HTTPS listener."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "alb_deletion_protection" {
  description = "Protect the internal ALB from accidental deletion."
  type        = bool
  default     = false
}

variable "cluster_deletion_protection" {
  description = "Protect the EKS cluster from accidental deletion."
  type        = bool
  default     = false
}

variable "cloudwatch_log_retention_days" {
  description = "Retention for EKS control-plane and VPC flow logs."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags applied to all supported AWS resources."
  type        = map(string)
  default     = {}
}
