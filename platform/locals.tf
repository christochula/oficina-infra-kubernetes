locals {
  name         = "${var.project_name}-${var.environment}"
  cluster_name = data.terraform_remote_state.aws.outputs.cluster_name

  namespaces = {
    load_balancer = "kube-system"
    autoscaler    = "kube-system"
    ebs_csi       = "kube-system"
    external      = "external-secrets"
    application   = "oficina"
  }

  service_accounts = {
    load_balancer = "aws-load-balancer-controller"
    autoscaler    = "cluster-autoscaler"
    ebs_csi       = "ebs-csi-controller-sa"
    external      = "external-secrets"
    application   = "oficina-api"
  }

  external_secret_arns = distinct(concat(
    [var.database_secret_arn, var.jwt_secret_arn, var.datadog_secret_arn],
    var.additional_external_secret_arns
  ))

  oidc_provider = {
    eks = {
      provider_arn = data.terraform_remote_state.aws.outputs.cluster_oidc_provider_arn
    }
  }

  common_tags = merge({
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Repository  = "oficina-infra-kubernetes"
    Stack       = "platform"
  }, var.tags)
}

check "cluster_autoscaler_minor_matches_cluster" {
  assert {
    condition     = startswith(trimprefix(var.cluster_autoscaler_image_tag, "v"), "${var.kubernetes_version}.")
    error_message = "cluster_autoscaler_image_tag minor must exactly match kubernetes_version."
  }
}
