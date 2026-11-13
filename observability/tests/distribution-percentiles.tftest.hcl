mock_provider "datadog" {}

run "all_configurations_disabled_by_default" {
  command = plan

  assert {
    condition = (
      length(datadog_metric_tag_configuration.api_request_duration) == 0 &&
      length(datadog_metric_tag_configuration.service_order_status_duration) == 0 &&
      length(datadog_metric_tag_configuration.service_order_created) == 0 &&
      length(datadog_metric_tag_configuration.service_order_processing_errors) == 0 &&
      length(datadog_metric_tag_configuration.integration_errors) == 0
    )
    error_message = "Default flags must not configure metrics that may not exist yet."
  }
}

run "enable_only_existing_distributions" {
  command = plan
  variables {
    enable_distribution_percentiles = true
    manage_metric_tag_configuration = false
  }

  assert {
    condition = (
      length(datadog_metric_tag_configuration.api_request_duration) == 1 &&
      length(datadog_metric_tag_configuration.service_order_status_duration) == 1 &&
      length(datadog_metric_tag_configuration.service_order_created) == 0 &&
      length(datadog_metric_tag_configuration.service_order_processing_errors) == 0 &&
      length(datadog_metric_tag_configuration.integration_errors) == 0
    )
    error_message = "The distribution flag must configure exactly two metrics, excluding all count metrics."
  }
  assert {
    condition = (
      datadog_metric_tag_configuration.api_request_duration[0].include_percentiles &&
      datadog_metric_tag_configuration.api_request_duration[0].metric_type == "distribution" &&
      datadog_metric_tag_configuration.service_order_status_duration[0].include_percentiles &&
      datadog_metric_tag_configuration.service_order_status_duration[0].metric_type == "distribution"
    )
    error_message = "Both existing distributions must enable their percentile aggregations."
  }
}

run "preserve_global_configuration_compatibility" {
  command = plan
  variables {
    enable_distribution_percentiles = false
    manage_metric_tag_configuration = true
  }

  assert {
    condition = (
      length(datadog_metric_tag_configuration.api_request_duration) == 1 &&
      length(datadog_metric_tag_configuration.service_order_status_duration) == 1 &&
      length(datadog_metric_tag_configuration.service_order_created) == 1 &&
      length(datadog_metric_tag_configuration.service_order_processing_errors) == 1 &&
      length(datadog_metric_tag_configuration.integration_errors) == 1
    )
    error_message = "The existing global flag must retain its five-resource behavior."
  }
}

run "creation_widget_shows_rate_without_claiming_absolute_count" {
  command = plan

  assert {
    condition = (
      strcontains(datadog_dashboard_json.oficina.dashboard, "Taxa de abertura de OS (OS/s)") &&
      strcontains(datadog_dashboard_json.oficina.dashboard, "sum:${var.service_order_created_metric}{env:$env,service:$service}.as_rate()") &&
      !strcontains(datadog_dashboard_json.oficina.dashboard, "OS criadas nas últimas 24h") &&
      !strcontains(datadog_dashboard_json.oficina.dashboard, "Volume diário de ordens de serviço") &&
      !strcontains(datadog_dashboard_json.oficina.dashboard, "rollup(sum,86400)")
    )
    error_message = "Normalized DogStatsD rate must be labelled OS/s, not an absolute daily order count."
  }
}
