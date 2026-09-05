resource "datadog_dashboard_json" "oficina" {
  dashboard = jsonencode({
    title       = "Oficina | Operação e Observabilidade | ${var.environment}"
    description = "Dashboard Terraform para volume de OS, duração por status, integrações, latência da API e capacidade Kubernetes."
    layout_type = "ordered"
    reflow_type = "auto"
    tags        = local.common_tags
    template_variables = [
      {
        name    = "env"
        prefix  = "env"
        default = var.environment
      },
      {
        name    = "service"
        prefix  = "service"
        default = var.service_name
      }
    ]
    widgets = [
      {
        definition = {
          type             = "note"
          content          = "## Contrato de telemetria\n`${var.api_request_duration_metric}` (DISTRIBUTION em ms; `method`, `status_code`), `${var.service_order_created_metric}` (COUNT), `${var.service_order_status_duration_metric}` (DISTRIBUTION em ms; `status`), `${var.service_order_processing_errors_metric}` (COUNT; `operation`) e `${var.integration_errors_metric}` (COUNT; `integration`). APM permanece habilitado separadamente para traces."
          background_color = "gray"
          font_size        = "14"
          text_align       = "left"
          vertical_align   = "top"
          show_tick        = false
          tick_pos         = "50%"
          tick_edge        = "left"
        }
      },
      {
        definition = {
          title       = "Volume diário de ordens de serviço"
          type        = "timeseries"
          show_legend = true
          requests = [{
            q            = "sum:${var.service_order_created_metric}{env:$env,service:$service}.as_count().rollup(sum,86400)"
            display_type = "bars"
            style = {
              palette    = "dog_classic"
              line_type  = "solid"
              line_width = "normal"
            }
          }]
        }
      },
      {
        definition = {
          title     = "OS criadas nas últimas 24h"
          type      = "query_value"
          autoscale = true
          precision = 0
          requests = [{
            q          = "sum:${var.service_order_created_metric}{env:$env,service:$service}.as_count().rollup(sum,86400)"
            aggregator = "sum"
          }]
        }
      },
      {
        definition = {
          title       = "Tempo médio por status — diagnóstico, execução e finalização"
          type        = "timeseries"
          show_legend = true
          requests = [
            {
              q            = "avg:${var.service_order_status_duration_metric}{env:$env,service:$service,status:diagnostico}"
              display_type = "line"
            },
            {
              q            = "avg:${var.service_order_status_duration_metric}{env:$env,service:$service,status:execucao}"
              display_type = "line"
            },
            {
              q            = "avg:${var.service_order_status_duration_metric}{env:$env,service:$service,status:finalizacao}"
              display_type = "line"
            }
          ]
          yaxis = {
            include_zero = true
            scale        = "linear"
            label        = "ms"
          }
        }
      },
      {
        definition = {
          title       = "Distribuição p95 por status — diagnóstico, execução e finalização"
          type        = "timeseries"
          show_legend = true
          requests = [
            {
              q            = "p95:${var.service_order_status_duration_metric}{env:$env,service:$service,status:diagnostico}"
              display_type = "line"
            },
            {
              q            = "p95:${var.service_order_status_duration_metric}{env:$env,service:$service,status:execucao}"
              display_type = "line"
            },
            {
              q            = "p95:${var.service_order_status_duration_metric}{env:$env,service:$service,status:finalizacao}"
              display_type = "line"
            }
          ]
          yaxis = {
            include_zero = true
            scale        = "linear"
            label        = "ms"
          }
        }
      },
      {
        definition = {
          title       = "Erros de integrações"
          type        = "timeseries"
          show_legend = true
          requests = [{
            q            = "sum:${var.integration_errors_metric}{env:$env,service:$service} by {integration}.as_count()"
            display_type = "bars"
          }]
        }
      },
      {
        definition = {
          title       = "Latência da API — p50, p95 e p99"
          type        = "timeseries"
          show_legend = true
          requests = [
            {
              q            = "p50:${var.api_request_duration_metric}{env:$env,service:$service}"
              display_type = "line"
            },
            {
              q            = "p95:${var.api_request_duration_metric}{env:$env,service:$service}"
              display_type = "line"
            },
            {
              q            = "p99:${var.api_request_duration_metric}{env:$env,service:$service}"
              display_type = "line"
            }
          ]
          yaxis = {
            include_zero = true
            scale        = "linear"
            label        = "ms"
          }
        }
      },
      {
        definition = {
          title       = "CPU por pod"
          type        = "timeseries"
          show_legend = true
          requests = [{
            q            = "avg:kubernetes.cpu.usage.total{kube_cluster_name:${var.kubernetes_cluster_name},kube_namespace:${var.kubernetes_namespace}} by {pod_name}"
            display_type = "line"
          }]
        }
      },
      {
        definition = {
          title       = "Memória working set por pod"
          type        = "timeseries"
          show_legend = true
          requests = [{
            q            = "avg:kubernetes.memory.working_set{kube_cluster_name:${var.kubernetes_cluster_name},kube_namespace:${var.kubernetes_namespace}} by {pod_name}"
            display_type = "line"
          }]
        }
      },
      {
        definition = {
          title       = "Falhas no processamento de OS"
          type        = "timeseries"
          show_legend = true
          requests = [{
            q            = "sum:${var.service_order_processing_errors_metric}{env:$env,service:$service} by {operation}.as_count()"
            display_type = "bars"
          }]
        }
      }
    ]
  })
}
