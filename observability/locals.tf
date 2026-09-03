locals {
  common_tags = distinct(concat([
    "env:${var.environment}",
    "service:${var.service_name}",
    "team:oficina",
    "managed-by:terraform",
  ], var.additional_tags))

  metric_scope = "env:${var.environment},service:${var.service_name}"
  kube_scope   = "kube_cluster_name:${var.kubernetes_cluster_name},kube_namespace:${var.kubernetes_namespace}"
}
