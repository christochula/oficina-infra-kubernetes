resource "datadog_metric_tag_configuration" "api_request_duration" {
  count               = var.manage_metric_tag_configuration ? 1 : 0
  metric_name         = var.api_request_duration_metric
  metric_type         = "distribution"
  tags                = ["env", "service", "version", "method", "status_code"]
  include_percentiles = true
}

resource "datadog_metric_tag_configuration" "service_order_created" {
  count             = var.manage_metric_tag_configuration ? 1 : 0
  metric_name       = var.service_order_created_metric
  metric_type       = "count"
  tags              = ["env", "service", "version"]
  exclude_tags_mode = false
}

resource "datadog_metric_tag_configuration" "service_order_status_duration" {
  count               = var.manage_metric_tag_configuration ? 1 : 0
  metric_name         = var.service_order_status_duration_metric
  metric_type         = "distribution"
  tags                = ["env", "service", "version", "status"]
  include_percentiles = true
}

resource "datadog_metric_tag_configuration" "service_order_processing_errors" {
  count             = var.manage_metric_tag_configuration ? 1 : 0
  metric_name       = var.service_order_processing_errors_metric
  metric_type       = "count"
  tags              = ["env", "service", "version", "operation"]
  exclude_tags_mode = false
}

resource "datadog_metric_tag_configuration" "integration_errors" {
  count             = var.manage_metric_tag_configuration ? 1 : 0
  metric_name       = var.integration_errors_metric
  metric_type       = "count"
  tags              = ["env", "service", "version", "integration"]
  exclude_tags_mode = false
}
