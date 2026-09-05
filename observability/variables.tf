variable "environment" {
  description = "Tag env unificada."
  type        = string
  default     = "homolog"
}

variable "service_name" {
  description = "Tag service unificada da API."
  type        = string
  default     = "oficina-api"
}

variable "manage_metric_tag_configuration" {
  description = "Config global de tags das metricas. So funciona DEPOIS que as metricas existem (com trafego). Ligar numa 2a passada."
  type        = bool
  default     = false
}

variable "kubernetes_cluster_name" {
  description = "Tag kube_cluster_name emitida pelo Datadog Agent."
  type        = string
  default     = "oficina-homolog-eks"
}

variable "kubernetes_namespace" {
  description = "Namespace Kubernetes da API."
  type        = string
  default     = "oficina"
}

variable "datadog_api_url" {
  description = "URL da API Datadog conforme o site."
  type        = string
  default     = "https://api.datadoghq.com/"
}

variable "api_base_url" {
  description = "URL publica da API (ELB do EKS ou API Gateway) que o Synthetic vai checar."
  type        = string
  default     = "http://api.placeholder.local"

  validation {
    condition     = can(regex("^https?://", var.api_base_url))
    error_message = "api_base_url deve comecar com http:// ou https://."
  }
}

variable "synthetics_locations" {
  description = "Locations do Synthetic. ELB agora e publico -> location publica basta."
  type        = list(string)
  default     = ["aws:us-east-1"]
}

variable "notification_message" {
  description = "Texto anexado aos alertas dos monitores; pode conter @handles do Datadog."
  type        = string
  default     = "Investigue o dashboard Oficina e siga o runbook."
}

variable "api_request_duration_metric" {
  type    = string
  default = "oficina.api.request.duration_ms"
}

variable "service_order_created_metric" {
  type    = string
  default = "oficina.service_orders.created"
}

variable "service_order_status_duration_metric" {
  type    = string
  default = "oficina.service_orders.status_duration_ms"
}

variable "service_order_processing_errors_metric" {
  type    = string
  default = "oficina.service_orders.processing_errors"
}

variable "integration_errors_metric" {
  type    = string
  default = "oficina.integrations.errors"
}

variable "api_latency_warning_ms" {
  type    = number
  default = 750
}

variable "api_latency_critical_ms" {
  type    = number
  default = 1500
}

variable "cpu_warning_cores" {
  type    = number
  default = 0.7
}

variable "cpu_critical_cores" {
  type    = number
  default = 0.9
}

variable "memory_warning_percent" {
  type    = number
  default = 80
}

variable "memory_critical_percent" {
  type    = number
  default = 90
}

variable "synthetic_response_time_ms" {
  type    = number
  default = 3000
}

variable "synthetic_tick_every_seconds" {
  type    = number
  default = 60
}

variable "renotify_interval_minutes" {
  type    = number
  default = 60
}

variable "additional_tags" {
  type    = list(string)
  default = []
}
