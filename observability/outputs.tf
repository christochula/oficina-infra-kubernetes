output "dashboard_id" {
  description = "Datadog dashboard ID."
  value       = datadog_dashboard_json.oficina.id
}

output "dashboard_url" {
  description = "Datadog dashboard URL."
  value       = datadog_dashboard_json.oficina.url
}

output "monitor_ids" {
  description = "Datadog monitor IDs keyed by operational signal."
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
  description = "Datadog Synthetic test public ID."
  value       = datadog_synthetics_test.api_health.id
}

output "aws_integration_contract" {
  description = "Account-scoped Datadog AWS metrics integration and read-only IAM role."
  value = {
    enabled               = var.enable_aws_integration
    aws_account_id        = try(data.aws_caller_identity.current[0].account_id, null)
    aws_region            = var.aws_region
    cloudwatch_namespaces = var.aws_integration_namespaces
    datadog_account_id    = try(datadog_integration_aws_account.oficina[0].id, null)
    iam_role_arn          = try(aws_iam_role.datadog_integration[0].arn, null)
  }
}
