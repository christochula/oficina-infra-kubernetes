variable "environment" {
  description = "Unified service-tag environment."
  type        = string

  validation {
    condition     = contains(["dev", "homolog", "production"], var.environment)
    error_message = "environment must be dev, homolog or production."
  }
}

variable "service_name" {
  description = "Datadog unified service tag for the API."
  type        = string
  default     = "oficina-api"
}

variable "aws_region" {
  description = "AWS region collected by the optional Datadog AWS account integration."
  type        = string
  default     = "us-east-1"
}

variable "enable_aws_integration" {
  description = "Create the account-scoped Datadog AWS integration and its least-privilege IAM role. Enable in exactly one state per AWS account."
  type        = bool
  default     = false
}

variable "aws_integration_role_name" {
  description = "Case-sensitive IAM role name registered in the Datadog AWS integration."
  type        = string
  default     = "DatadogIntegrationRole"

  validation {
    condition     = can(regex("^[A-Za-z0-9+=,.@_-]{1,64}$", var.aws_integration_role_name))
    error_message = "aws_integration_role_name must be a valid IAM role name with at most 64 characters."
  }
}

variable "datadog_aws_principal_arn" {
  description = "Datadog AWS principal allowed to assume the integration role. The default is the commercial Datadog principal; override for GovCloud."
  type        = string
  default     = "arn:aws:iam::464622532012:root"

  validation {
    condition     = can(regex("^arn:[^:]+:iam::[0-9]{12}:root$", var.datadog_aws_principal_arn))
    error_message = "datadog_aws_principal_arn must be an AWS account root ARN."
  }
}

variable "aws_integration_namespaces" {
  description = "CloudWatch namespaces collected by Datadog. Defaults to only the services used by this solution."
  type        = list(string)
  default     = ["AWS/ApiGateway", "AWS/Lambda", "AWS/RDS"]

  validation {
    condition = (
      length(var.aws_integration_namespaces) > 0 &&
      alltrue([for namespace in var.aws_integration_namespaces : startswith(namespace, "AWS/")])
    )
    error_message = "aws_integration_namespaces must contain one or more AWS/* CloudWatch namespaces."
  }
}

variable "manage_metric_tag_configuration" {
  description = "Manage the organization-global Datadog metric tag configurations. Enable in exactly one state per Datadog organization."
  type        = bool
  default     = false
}

variable "kubernetes_cluster_name" {
  description = "kube_cluster_name tag emitted by the Datadog Agent."
  type        = string
}

variable "kubernetes_namespace" {
  description = "Kubernetes namespace containing the API."
  type        = string
  default     = "oficina"
}

variable "datadog_api_url" {
  description = "Datadog API URL matching the selected site."
  type        = string
  default     = "https://api.datadoghq.com/"
}

variable "api_base_url" {
  description = "Base URL reachable from the selected Datadog Synthetic private location."
  type        = string

  validation {
    condition     = can(regex("^https?://", var.api_base_url))
    error_message = "api_base_url must start with http:// or https://."
  }
}

variable "synthetics_locations" {
  description = "Datadog Synthetic location IDs. Use a private location (pl:...) for the internal ALB."
  type        = list(string)

  validation {
    condition     = length(var.synthetics_locations) > 0
    error_message = "At least one Synthetic location ID is required."
  }
}

variable "notification_message" {
  description = "Runbook/notification text appended to monitor alerts; may contain Datadog @handles."
  type        = string
  default     = "Investigue o dashboard Oficina e siga o runbook operacional."
}

variable "api_request_duration_metric" {
  description = "DISTRIBUTION metric in milliseconds for API requests, tagged method and status_code."
  type        = string
  default     = "oficina.api.request.duration_ms"
}

variable "service_order_created_metric" {
  description = "COUNT metric incremented when a service order is created."
  type        = string
  default     = "oficina.service_orders.created"
}

variable "service_order_status_duration_metric" {
  description = "DISTRIBUTION metric in milliseconds tagged status:diagnostico|execucao|finalizacao."
  type        = string
  default     = "oficina.service_orders.status_duration_ms"
}

variable "service_order_processing_errors_metric" {
  description = "COUNT metric for service-order processing errors, tagged operation."
  type        = string
  default     = "oficina.service_orders.processing_errors"
}

variable "integration_errors_metric" {
  description = "COUNT metric for external integration errors, tagged integration."
  type        = string
  default     = "oficina.integrations.errors"
}

variable "api_latency_warning_ms" {
  description = "Warning threshold for p95 API latency in milliseconds."
  type        = number
  default     = 750
}

variable "api_latency_critical_ms" {
  description = "Critical threshold for p95 API latency in milliseconds."
  type        = number
  default     = 1000
}

variable "cpu_warning_cores" {
  description = "Per-pod CPU warning threshold in cores."
  type        = number
  default     = 0.7
}

variable "cpu_critical_cores" {
  description = "Per-pod CPU critical threshold in cores."
  type        = number
  default     = 0.9
}

variable "memory_warning_percent" {
  description = "Per-pod working-set percentage of the configured limit."
  type        = number
  default     = 80
}

variable "memory_critical_percent" {
  description = "Per-pod working-set percentage of the configured limit."
  type        = number
  default     = 90
}

variable "synthetic_response_time_ms" {
  description = "Maximum response time asserted by the health Synthetic."
  type        = number
  default     = 2000
}

variable "synthetic_tick_every_seconds" {
  description = "Synthetic execution interval supported by Datadog."
  type        = number
  default     = 60
}

variable "renotify_interval_minutes" {
  description = "Minutes between repeat notifications while a monitor remains in alert."
  type        = number
  default     = 60
}

variable "additional_tags" {
  description = "Additional tags attached to all Datadog resources."
  type        = list(string)
  default     = []
}
