variable "project_name" {
  description = "Project identifier, kept equal to the AWS stack value."
  type        = string
  default     = "oficina"
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "homolog", "production"], var.environment)
    error_message = "environment must be dev, homolog or production."
  }
}

variable "aws_region" {
  description = "AWS region containing the EKS cluster and Secrets Manager secrets."
  type        = string
  default     = "us-east-1"
}

variable "aws_state_bucket" {
  description = "S3 bucket containing the aws stack remote state."
  type        = string
}

variable "aws_state_key" {
  description = "S3 object key containing the aws stack remote state."
  type        = string
}

variable "aws_state_region" {
  description = "AWS region of the Terraform state bucket."
  type        = string
  default     = "us-east-1"
}

variable "database_secret_arn" {
  description = "ARN of the database Secrets Manager object consumed by the app-owned ExternalSecret."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$", var.database_secret_arn))
    error_message = "database_secret_arn must be a Secrets Manager secret ARN."
  }
}

variable "jwt_secret_arn" {
  description = "ARN of the JWT Secrets Manager object consumed by the app-owned ExternalSecret."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$", var.jwt_secret_arn))
    error_message = "jwt_secret_arn must be a Secrets Manager secret ARN."
  }
}

variable "datadog_secret_arn" {
  description = "ARN of a Secrets Manager JSON object with api_key and app_key fields."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$", var.datadog_secret_arn))
    error_message = "datadog_secret_arn must be a Secrets Manager secret ARN."
  }
}

variable "notification_queue_arn" {
  description = "ARN of the SQS queue that receives service-order notification events from the oficina-api ServiceAccount."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:sqs:[^:]+:[0-9]{12}:[A-Za-z0-9_-]+$", var.notification_queue_arn))
    error_message = "notification_queue_arn must be an SQS queue ARN."
  }
}

variable "additional_external_secret_arns" {
  description = "Additional Secrets Manager ARNs that External Secrets Operator may read."
  type        = list(string)
  default     = []
}

variable "external_secrets_kms_key_arns" {
  description = "Optional customer-managed KMS key ARNs used to encrypt the allowed secrets."
  type        = list(string)
  default     = []
}

variable "external_secret_refresh_interval" {
  description = "Reconciliation interval for the Datadog ExternalSecret owned by this stack."
  type        = string
  default     = "1h"
}

variable "kubernetes_version" {
  description = "EKS minor; Cluster Autoscaler image must use the same minor."
  type        = string
  default     = "1.35"
}

variable "cluster_autoscaler_image_tag" {
  description = "Cluster Autoscaler image tag. Its minor must equal kubernetes_version."
  type        = string
  default     = "v1.35.0"
}

variable "aws_load_balancer_controller_chart_version" {
  description = "Pinned AWS Load Balancer Controller Helm chart version."
  type        = string
  default     = "3.4.2"
}

variable "metrics_server_chart_version" {
  description = "Pinned metrics-server Helm chart version."
  type        = string
  default     = "3.13.1"
}

variable "cluster_autoscaler_chart_version" {
  description = "Pinned Cluster Autoscaler Helm chart version."
  type        = string
  default     = "9.59.0"
}

variable "external_secrets_chart_version" {
  description = "Pinned External Secrets Operator Helm chart version."
  type        = string
  default     = "2.9.0"
}

variable "datadog_operator_chart_version" {
  description = "Pinned stable Datadog Operator Helm chart version."
  type        = string
  default     = "2.24.0"
}

variable "datadog_site" {
  description = "Datadog intake site, for example datadoghq.com or datadoghq.eu."
  type        = string
  default     = "datadoghq.com"
}

variable "datadog_namespace" {
  description = "Namespace for Datadog Operator, Agent and credentials Secret."
  type        = string
  default     = "datadog"
}

variable "datadog_kubernetes_secret_name" {
  description = "Kubernetes Secret populated by ESO and referenced by DatadogAgent."
  type        = string
  default     = "datadog-secret"
}

variable "datadog_collect_all_container_logs" {
  description = "Collect stdout/stderr from all containers. Disable if opt-in-only logging is required."
  type        = bool
  default     = true
}

variable "datadog_agent_tolerate_all_nodes" {
  description = "Schedule Datadog node agents on tainted nodes as well."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional AWS tags."
  type        = map(string)
  default     = {}
}
