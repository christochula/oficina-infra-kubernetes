module "load_balancer_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "6.8.0"

  name                                   = "${local.name}-aws-lbc"
  attach_load_balancer_controller_policy = true

  oidc_providers = {
    eks = merge(local.oidc_provider.eks, {
      namespace_service_accounts = ["${local.namespaces.load_balancer}:${local.service_accounts.load_balancer}"]
    })
  }

  tags = local.common_tags
}

module "cluster_autoscaler_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "6.8.0"

  name                             = "${local.name}-cluster-autoscaler"
  attach_cluster_autoscaler_policy = true
  cluster_autoscaler_cluster_names = [local.cluster_name]

  oidc_providers = {
    eks = merge(local.oidc_provider.eks, {
      namespace_service_accounts = ["${local.namespaces.autoscaler}:${local.service_accounts.autoscaler}"]
    })
  }

  tags = local.common_tags
}

module "external_secrets_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "6.8.0"

  name                                  = "${local.name}-external-secrets"
  attach_external_secrets_policy        = true
  external_secrets_secrets_manager_arns = local.external_secret_arns
  external_secrets_kms_key_arns         = var.external_secrets_kms_key_arns

  oidc_providers = {
    eks = merge(local.oidc_provider.eks, {
      namespace_service_accounts = ["${local.namespaces.external}:${local.service_accounts.external}"]
    })
  }

  tags = local.common_tags
}

module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "6.8.0"

  name                  = "${local.name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    eks = merge(local.oidc_provider.eks, {
      namespace_service_accounts = ["${local.namespaces.ebs_csi}:${local.service_accounts.ebs_csi}"]
    })
  }

  tags = local.common_tags
}

module "application_notifications_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts"
  version = "6.8.0"

  name        = "${local.name}-oficina-api-notifications"
  description = "Allows only the oficina-api ServiceAccount to publish notification events to its SQS queue."

  permissions = {
    send_notification = {
      sid       = "SendNotificationMessages"
      actions   = ["sqs:SendMessage"]
      resources = [var.notification_queue_arn]
    }
  }

  oidc_providers = {
    eks = merge(local.oidc_provider.eks, {
      namespace_service_accounts = ["${local.namespaces.application}:${local.service_accounts.application}"]
    })
  }

  tags = local.common_tags
}
