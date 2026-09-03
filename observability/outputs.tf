output "dashboard_url" {
  description = "URL do dashboard Datadog."
  value       = datadog_dashboard_json.oficina.url
}

output "monitor_ids" {
  description = "IDs dos monitores por sinal operacional."
  value = {
    api_p95_latency          = datadog_monitor.api_p95_latency.id
    pod_cpu                  = datadog_monitor.pod_cpu.id
    pod_memory               = datadog_monitor.pod_memory.id
    order_processing_failure = datadog_monitor.order_processing_failures.id
    integration_errors       = datadog_monitor.integration_errors.id
    api_health_synthetic     = datadog_synthetics_test.api_health.monitor_id
  }
}

output "synthetic_public_id" {
  description = "Public ID do teste Synthetic."
  value       = datadog_synthetics_test.api_health.id
}
