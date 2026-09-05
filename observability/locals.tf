locals {
  # O Datadog restringe as tags de dashboards/monitores a uma allowlist de
  # chaves (por padrao apenas "team"). env/service/version continuam como tags
  # das METRICAS (emitidas pelo Agent e pela app), so nao vao nos objetos.
  common_tags = distinct(concat(["team:oficina"], var.additional_tags))

  metric_scope = "env:${var.environment},service:${var.service_name}"
  kube_scope   = "kube_cluster_name:${var.kubernetes_cluster_name},kube_namespace:${var.kubernetes_namespace}"
}
