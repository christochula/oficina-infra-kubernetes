resource "datadog_monitor" "api_p95_latency" {
  name    = "[${upper(var.environment)}] Oficina API p95 acima do SLO"
  type    = "metric alert"
  message = "A latência p95 da API ultrapassou o limite. ${var.notification_message}"
  query   = "percentile(last_5m):p95:${var.api_request_duration_metric}{${local.metric_scope}} > ${var.api_latency_critical_ms}"

  monitor_thresholds {
    warning  = var.api_latency_warning_ms
    critical = var.api_latency_critical_ms
  }

  include_tags        = true
  require_full_window = false
  notify_no_data      = false
  renotify_interval   = var.renotify_interval_minutes
  priority            = 2
  tags                = local.common_tags
}

resource "datadog_monitor" "pod_cpu" {
  name    = "[${upper(var.environment)}] Oficina API CPU elevada por pod"
  type    = "metric alert"
  message = "Um pod da API mantém consumo elevado de CPU. ${var.notification_message}"
  query   = "avg(last_10m):avg:kubernetes.cpu.usage.total{${local.kube_scope}} by {pod_name} > ${var.cpu_critical_cores}"

  monitor_thresholds {
    warning  = var.cpu_warning_cores
    critical = var.cpu_critical_cores
  }

  include_tags        = true
  require_full_window = false
  notify_no_data      = false
  renotify_interval   = var.renotify_interval_minutes
  priority            = 3
  tags                = local.common_tags
}

resource "datadog_monitor" "pod_memory" {
  name    = "[${upper(var.environment)}] Oficina API memória elevada por pod"
  type    = "metric alert"
  message = "O working set de um pod está próximo do limite de memória. ${var.notification_message}"
  query   = "avg(last_10m):(avg:kubernetes.memory.working_set{${local.kube_scope}} by {pod_name} / avg:kubernetes.memory.limits{${local.kube_scope}} by {pod_name}) * 100 > ${var.memory_critical_percent}"

  monitor_thresholds {
    warning  = var.memory_warning_percent
    critical = var.memory_critical_percent
  }

  include_tags        = true
  require_full_window = false
  notify_no_data      = false
  renotify_interval   = var.renotify_interval_minutes
  priority            = 2
  tags                = local.common_tags
}

resource "datadog_monitor" "order_processing_failures" {
  name    = "[${upper(var.environment)}] Falhas no processamento de OS"
  type    = "metric alert"
  message = "Foi detectada falha no processamento de ordem de serviço. ${var.notification_message}"
  query   = "sum(last_10m):default_zero(sum:${var.service_order_processing_errors_metric}{${local.metric_scope}} by {operation}.as_count()) > 0"

  monitor_thresholds {
    critical = 0
  }

  include_tags        = true
  require_full_window = false
  notify_no_data      = false
  renotify_interval   = var.renotify_interval_minutes
  priority            = 1
  tags                = local.common_tags
}

resource "datadog_monitor" "integration_errors" {
  name    = "[${upper(var.environment)}] Erros em integrações externas"
  type    = "metric alert"
  message = "Há erros em uma integração externa da oficina. ${var.notification_message}"
  query   = "sum(last_10m):default_zero(sum:${var.integration_errors_metric}{${local.metric_scope}} by {integration}.as_count()) > 0"

  monitor_thresholds {
    critical = 0
  }

  include_tags        = true
  require_full_window = false
  notify_no_data      = false
  renotify_interval   = var.renotify_interval_minutes
  priority            = 1
  tags                = local.common_tags
}

resource "datadog_synthetics_test" "api_health" {
  name      = "[${upper(var.environment)}] Oficina API readiness/uptime"
  type      = "api"
  subtype   = "http"
  status    = "live"
  message   = "A API não respondeu ao health check. ${var.notification_message}"
  locations = var.synthetics_locations
  tags      = local.common_tags

  request_definition {
    method = "GET"
    url    = "${trimsuffix(var.api_base_url, "/")}/api/health/ready"
  }

  request_headers = {
    Accept = "application/json"
  }

  assertion {
    type     = "statusCode"
    operator = "is"
    target   = "200"
  }

  assertion {
    type     = "responseTime"
    operator = "lessThan"
    target   = var.synthetic_response_time_ms
  }

  options_list {
    tick_every = var.synthetic_tick_every_seconds

    retry {
      count    = 2
      interval = 300
    }

    monitor_options {
      renotify_interval = var.renotify_interval_minutes
    }
  }
}
