# Componentes de cluster instalados via Helm neste mesmo apply.
# Nenhum precisa de IRSA: metrics-server nao usa AWS; o Datadog Agent usa
# apenas a API key (Secret) e roda como DaemonSet.
#
# Versoes nao fixadas de proposito (ambiente de lab efemero). Fixar depois
# se algum release quebrar valores.

resource "helm_release" "metrics_server" {
  count = var.metrics_server_enabled ? 1 : 0

  name       = "metrics-server"
  namespace  = "kube-system"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"

  atomic          = true
  cleanup_on_fail = true
  wait            = true
  timeout         = 600

  set {
    name  = "args[0]"
    value = "--kubelet-insecure-tls"
  }

  depends_on = [
    aws_eks_node_group.this,
    aws_eks_addon.coredns,
  ]
}

resource "helm_release" "datadog" {
  count = var.datadog_enabled ? 1 : 0

  name             = "datadog"
  namespace        = "datadog"
  create_namespace = true
  repository       = "https://helm.datadoghq.com"
  chart            = "datadog"

  atomic          = true
  cleanup_on_fail = true
  wait            = true
  timeout         = 900

  values = [yamlencode({
    datadog = {
      site        = var.datadog_site
      clusterName = local.cluster_name
      tags        = ["env:${var.environment}", "team:oficina"]

      kubelet = {
        tlsVerify = false
      }

      logs = {
        enabled             = true
        containerCollectAll = true
      }

      apm = {
        portEnabled   = true
        socketEnabled = true
      }

      dogstatsd = {
        port            = 8125
        useHostPort     = true
        nonLocalTraffic = true
      }

      processAgent = {
        enabled           = true
        processCollection = true
      }
    }

    clusterAgent = {
      enabled = true
      metricsProvider = {
        enabled = false
      }
    }
  })]

  set_sensitive {
    name  = "datadog.apiKey"
    value = var.datadog_api_key
  }

  set_sensitive {
    name  = "datadog.appKey"
    value = var.datadog_app_key
  }

  depends_on = [
    aws_eks_node_group.this,
    aws_eks_addon.coredns,
  ]
}
