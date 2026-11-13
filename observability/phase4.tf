variable "business_services" {
  description = "Independent services sharing the EKS/Datadog platform."
  type        = set(string)
  default     = ["oficina-api", "oficina-billing-service", "oficina-production-service"]
}

variable "saga_queue_names" {
  description = "SQS queue names to monitor, including response and command queues. Requires Datadog AWS SQS integration."
  type        = set(string)
  default     = []
}

variable "saga_dlq_names" {
  description = "SQS dead letter queue names; any visible message triggers an alert."
  type        = set(string)
  default     = []
}

variable "saga_pending_age_critical_seconds" {
  description = "Age limit for automatic Saga work. Human approval/payment waits are excluded by the emitter."
  type        = number
  default     = 300
}

resource "datadog_monitor" "business_latency" {
  for_each = setsubtract(var.business_services, [var.service_name])
  name     = "[${upper(var.environment)}] ${each.value} latency p95"
  type     = "metric alert"
  message  = "Service latency exceeded its SLO. Inspect the distributed trace by correlation_id/saga_id. ${var.notification_message}"
  query    = "percentile(last_5m):p95:${var.api_request_duration_metric}{env:${var.environment},service:${each.value}} > ${var.api_latency_critical_ms}"
  monitor_thresholds {
    warning  = var.api_latency_warning_ms
    critical = var.api_latency_critical_ms
  }
  require_full_window = false
  notify_no_data      = false
  tags                = local.common_tags
}

resource "datadog_monitor" "saga_pending" {
  name    = "[${upper(var.environment)}] Saga automatic step stalled"
  type    = "metric alert"
  message = "Automatic Saga work is stalled. Check retries, outbox, compensation and the DLQ. ${var.notification_message}"
  query   = "max(last_5m):max:oficina.saga.pending_age_seconds{env:${var.environment}} by {step} > ${var.saga_pending_age_critical_seconds}"
  monitor_thresholds {
    critical = var.saga_pending_age_critical_seconds
  }
  require_full_window = false
  notify_no_data      = false
  tags                = local.common_tags
}

resource "datadog_monitor" "messaging_failed" {
  name    = "[${upper(var.environment)}] Saga message processing failures"
  type    = "metric alert"
  message = "A Saga consumer failed. Check queue retry and compensation outcome. ${var.notification_message}"
  query   = "sum(last_5m):default_zero(sum:oficina.messaging.failed{env:${var.environment}} by {service,queue}.as_count()) > 0"
  monitor_thresholds {
    critical = 0
  }
  require_full_window = false
  notify_no_data      = false
  tags                = local.common_tags
}

resource "datadog_monitor" "queue_age" {
  for_each = var.saga_queue_names
  name     = "[${upper(var.environment)}] SQS ${each.value} backlog age"
  type     = "metric alert"
  message  = "Queue has old unprocessed messages. Check consumer availability and retries. ${var.notification_message}"
  query    = "max(last_5m):max:aws.sqs.approximate_age_of_oldest_message{queuename:${each.value}} > 300"
  monitor_thresholds {
    critical = 300
  }
  require_full_window = false
  notify_no_data      = false
  tags                = local.common_tags
}

resource "datadog_monitor" "dead_letters" {
  for_each = var.saga_dlq_names
  name     = "[${upper(var.environment)}] SQS ${each.value} dead letters"
  type     = "metric alert"
  message  = "DLQ is nonempty. Resolve the cause before redrive; consumers must remain idempotent. ${var.notification_message}"
  query    = "max(last_5m):max:aws.sqs.approximate_number_of_messages_visible{queuename:${each.value}} > 0"
  monitor_thresholds {
    critical = 0
  }
  require_full_window = false
  notify_no_data      = false
  tags                = local.common_tags
}

output "phase4_monitor_ids" {
  value = {
    service_latency = { for service, monitor in datadog_monitor.business_latency : service => monitor.id }
    saga_pending    = datadog_monitor.saga_pending.id
    messaging       = datadog_monitor.messaging_failed.id
    queue_age       = { for queue, monitor in datadog_monitor.queue_age : queue => monitor.id }
    dead_letters    = { for queue, monitor in datadog_monitor.dead_letters : queue => monitor.id }
  }
}
